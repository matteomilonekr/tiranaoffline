import fs from 'node:fs/promises';
import { API_BASE } from './config.js';

export class LinkedInApiError extends Error {
  constructor(message, { status, code = null, details = null } = {}) {
    super(message);
    this.name = 'LinkedInApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function hintFor(status, message) {
  if (status === 401) {
    return 'The access token is invalid or expired. Run `npm run auth` in the linkedin-mcp folder and restart the MCP server.';
  }
  if (status === 403) {
    return (
      'Permission denied. Posting as yourself needs the "Share on LinkedIn" product (scope w_member_social). ' +
      'Posting as a company page needs w_organization_social (Community Management API) plus an admin role on the page. ' +
      'Comments may additionally require the Community Management API.'
    );
  }
  if (status === 426 || /version/i.test(message || '')) {
    return 'The LinkedIn API version may be sunset: set LINKEDIN_API_VERSION to a recent YYYYMM value.';
  }
  if (status === 429) {
    return 'LinkedIn rate limit reached. Wait a few minutes before retrying.';
  }
  return null;
}

export function toApiError(status, data, method, url) {
  const message =
    (data && typeof data === 'object' && (data.message || data.error_description || data.error)) ||
    (typeof data === 'string' && data.slice(0, 300)) ||
    'no error message';
  const hint = hintFor(status, message);
  const where = `${method} ${new URL(url).pathname}`;
  return new LinkedInApiError(`LinkedIn API error ${status} on ${where}: ${message}${hint ? `\nHint: ${hint}` : ''}`, {
    status,
    code: data?.code || data?.serviceErrorCode || null,
    details: data,
  });
}

export const encodeUrn = (urn) => encodeURIComponent(urn);

export function postUrl(urn) {
  return `https://www.linkedin.com/feed/update/${urn}/`;
}

const ASSET_KINDS = { image: 'images', document: 'documents', video: 'videos' };

export class LinkedInClient {
  constructor({ tokenProvider, apiVersion, defaultAuthor = null, fetchImpl = fetch, sleep }) {
    this.tokens = tokenProvider;
    this.apiVersion = apiVersion;
    this.defaultAuthor = defaultAuthor;
    this.fetch = fetchImpl;
    this.sleep = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.profile = null;
  }

  async request(method, path, { body, restliMethod, versioned = true } = {}) {
    const { accessToken } = await this.tokens.getToken();
    const url = `${API_BASE}${path}`;
    const headers = { Authorization: `Bearer ${accessToken}` };
    if (versioned) {
      headers['LinkedIn-Version'] = this.apiVersion;
      headers['X-Restli-Protocol-Version'] = '2.0.0';
    }
    if (restliMethod) headers['X-RestLi-Method'] = restliMethod;
    let payload;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await this.fetch(url, { method, headers, body: payload });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) throw toApiError(res.status, data, method, url);
    return { status: res.status, headers: res.headers, data };
  }

  /** OpenID Connect profile of the authenticated member (needs openid + profile scopes). */
  async getUserInfo() {
    if (!this.profile) {
      const { data } = await this.request('GET', '/v2/userinfo', { versioned: false });
      this.profile = data;
    }
    return this.profile;
  }

  async resolveAuthor(author) {
    if (author) return author;
    if (this.defaultAuthor) return this.defaultAuthor;
    const token = await this.tokens.getToken();
    if (token.personUrn) return token.personUrn;
    const profile = await this.getUserInfo();
    if (!profile?.sub) {
      throw new LinkedInApiError('Could not determine your LinkedIn member id. Set LINKEDIN_AUTHOR_URN=urn:li:person:<id>.', {
        status: 0,
      });
    }
    return `urn:li:person:${profile.sub}`;
  }

  async initializeUpload(kind, initializeUploadRequest) {
    const { data } = await this.request('POST', `/rest/${ASSET_KINDS[kind]}?action=initializeUpload`, {
      body: { initializeUploadRequest },
    });
    return data.value;
  }

  async putBytes(uploadUrl, bytes) {
    const { accessToken } = await this.tokens.getToken();
    const res = await this.fetch(uploadUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' },
      body: bytes,
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) throw toApiError(res.status, text, 'PUT', uploadUrl);
    return res;
  }

  /** Uploads a JPG/PNG/GIF and returns its urn:li:image URN. */
  async uploadImage(filePath, owner) {
    const { uploadUrl, image } = await this.initializeUpload('image', { owner });
    await this.putBytes(uploadUrl, await fs.readFile(filePath));
    return image;
  }

  /** Uploads a PDF/PPT/PPTX/DOC/DOCX and returns its urn:li:document URN. */
  async uploadDocument(filePath, owner) {
    const { uploadUrl, document } = await this.initializeUpload('document', { owner });
    await this.putBytes(uploadUrl, await fs.readFile(filePath));
    return document;
  }

  /** Multi-part MP4 upload: initialize, PUT each byte range, finalize with the ETags. */
  async uploadVideo(filePath, owner) {
    const { size } = await fs.stat(filePath);
    const init = await this.initializeUpload('video', {
      owner,
      fileSizeBytes: size,
      uploadCaptions: false,
      uploadThumbnail: false,
    });
    const handle = await fs.open(filePath, 'r');
    const partIds = [];
    try {
      for (const part of init.uploadInstructions) {
        const length = part.lastByte - part.firstByte + 1;
        const chunk = Buffer.alloc(length);
        const { bytesRead } = await handle.read(chunk, 0, length, part.firstByte);
        const res = await this.putBytes(part.uploadUrl, chunk.subarray(0, bytesRead));
        const etag = res.headers.get('etag');
        if (!etag) throw new LinkedInApiError('LinkedIn did not return an ETag for an uploaded video part.', { status: res.status });
        partIds.push(etag);
      }
    } finally {
      await handle.close();
    }
    await this.request('POST', '/rest/videos?action=finalizeUpload', {
      body: {
        finalizeUploadRequest: { video: init.video, uploadToken: init.uploadToken || '', uploadedPartIds: partIds },
      },
    });
    return init.video;
  }

  /**
   * Polls an uploaded asset until LinkedIn reports it AVAILABLE.
   * Tokens with only w_member_social cannot read assets (403): in that case we
   * stop polling and let post creation proceed.
   */
  async waitForAsset(kind, urn, { timeoutMs = 30_000, intervalMs = 3_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      let status;
      try {
        const { data } = await this.request('GET', `/rest/${ASSET_KINDS[kind]}/${encodeUrn(urn)}`);
        status = data?.status;
      } catch (err) {
        if (err instanceof LinkedInApiError && [403, 404].includes(err.status)) return 'UNKNOWN';
        throw err;
      }
      if (status === 'AVAILABLE') return status;
      if (status === 'PROCESSING_FAILED') {
        throw new LinkedInApiError(`LinkedIn could not process the uploaded ${kind} (${urn}).`, { status: 400 });
      }
      if (Date.now() + intervalMs > deadline) return status || 'UNKNOWN';
      await this.sleep(intervalMs);
    }
  }

  async createPost(body) {
    const { headers, data } = await this.request('POST', '/rest/posts', { body });
    const urn = headers.get('x-restli-id') || data?.id;
    if (!urn) throw new LinkedInApiError('LinkedIn accepted the post but returned no post id.', { status: 201 });
    return { urn, url: postUrl(urn) };
  }

  async updatePostCommentary(urn, commentary) {
    await this.request('POST', `/rest/posts/${encodeUrn(urn)}`, {
      restliMethod: 'PARTIAL_UPDATE',
      body: { patch: { $set: { commentary } } },
    });
  }

  async deletePost(urn) {
    await this.request('DELETE', `/rest/posts/${encodeUrn(urn)}`, { restliMethod: 'DELETE' });
  }

  /** Comments on a post, or replies to a comment when parentCommentUrn is given. */
  async createComment({ postUrn, actor, text, parentCommentUrn }) {
    const target = parentCommentUrn || postUrn;
    const body = { actor, object: postUrn, message: { text } };
    if (parentCommentUrn) body.parentComment = parentCommentUrn;
    const { headers, data } = await this.request('POST', `/rest/socialActions/${encodeUrn(target)}/comments`, { body });
    return {
      id: data?.id || headers.get('x-restli-id'),
      commentUrn: data?.commentUrn || null,
    };
  }
}
