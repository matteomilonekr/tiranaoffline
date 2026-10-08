import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MB = 1024 * 1024;

export const MEDIA_RULES = {
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif'],
    maxBytes: 100 * MB,
    label: 'JPG, PNG or GIF image',
  },
  document: {
    extensions: ['.pdf', '.ppt', '.pptx', '.doc', '.docx'],
    maxBytes: 100 * MB,
    label: 'PDF, PPT, PPTX, DOC or DOCX document (max 100 MB, 300 pages)',
  },
  video: {
    extensions: ['.mp4'],
    maxBytes: 500 * MB,
    minBytes: 75 * 1024,
    label: 'MP4 video (75 KB - 500 MB, 3 seconds - 30 minutes)',
  },
};

const EXTENSION_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'video/mp4': '.mp4',
};

export const isUrl = (source) => /^https?:\/\//i.test(source);

function expandHome(file) {
  return file === '~' || file.startsWith('~/') ? path.join(os.homedir(), file.slice(1)) : file;
}

function checkFile(kind, { name, size }, { sizeKnown = true } = {}) {
  const rules = MEDIA_RULES[kind];
  const ext = path.extname(name).toLowerCase();
  if (!rules.extensions.includes(ext)) {
    throw new Error(`"${name}" is not a supported ${rules.label}. Supported extensions: ${rules.extensions.join(', ')}.`);
  }
  if (size > rules.maxBytes) throw new Error(`"${name}" is too large (${(size / MB).toFixed(1)} MB) for a ${rules.label}.`);
  if (sizeKnown && rules.minBytes && size < rules.minBytes) throw new Error(`"${name}" is too small for a ${rules.label}.`);
}

function nameFromUrl(url, contentType) {
  const base = decodeURIComponent(path.basename(new URL(url).pathname)) || 'download';
  const safe = base.replace(/[^\w.\- ]+/g, '_').slice(-100) || 'download';
  if (path.extname(safe)) return safe;
  const ext = EXTENSION_BY_TYPE[(contentType || '').split(';')[0].trim().toLowerCase()];
  return ext ? `${safe}${ext}` : safe;
}

/**
 * Resolves a local path or an http(s) URL into a local file ready for upload.
 * Downloads go to a temp dir that `cleanup()` removes.
 */
export async function resolveMedia(kind, source, { fetchImpl = fetch } = {}) {
  const rules = MEDIA_RULES[kind];
  if (!isUrl(source)) {
    const file = path.resolve(expandHome(source));
    let stat;
    try {
      stat = await fs.stat(file);
    } catch (err) {
      if (err.code === 'ENOENT') throw new Error(`File not found: ${file}`);
      throw err;
    }
    if (!stat.isFile()) throw new Error(`Not a file: ${file}`);
    const media = { path: file, name: path.basename(file), size: stat.size, cleanup: async () => {} };
    checkFile(kind, media);
    return media;
  }

  const res = await fetchImpl(source, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${source}`);
  const name = nameFromUrl(res.url || source, res.headers.get('content-type'));
  const declaredSize = Number(res.headers.get('content-length') || 0);
  checkFile(kind, { name, size: declaredSize }, { sizeKnown: declaredSize > 0 });

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'linkedin-mcp-'));
  const cleanup = () => fs.rm(dir, { recursive: true, force: true });
  const file = path.join(dir, name);
  let size = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      callback(size > rules.maxBytes ? new Error(`Download exceeds the size limit for a ${rules.label}.`) : null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body), limiter, createWriteStream(file));
    const media = { path: file, name, size, cleanup };
    checkFile(kind, media);
    return media;
  } catch (err) {
    await cleanup();
    throw err;
  }
}

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Extracts Open Graph / Twitter card metadata from an HTML page. */
export function parseLinkMetadata(html, pageUrl) {
  const meta = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {};
    for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
    }
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content && !(key in meta)) meta[key] = decodeEntities(attrs.content.trim());
  }
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const image = meta['og:image'] || meta['og:image:url'] || meta['twitter:image'];
  let absoluteImage = null;
  if (image) {
    try {
      absoluteImage = new URL(image, pageUrl).toString();
    } catch {
      absoluteImage = null;
    }
  }
  return {
    title: meta['og:title'] || meta['twitter:title'] || (titleTag ? decodeEntities(titleTag.trim()) : null),
    description: meta['og:description'] || meta['twitter:description'] || meta.description || null,
    image: absoluteImage,
  };
}

/** Best effort: returns {} when the page cannot be fetched. */
export async function fetchLinkMetadata(url, { fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; linkedin-mcp/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return {};
    const html = (await res.text()).slice(0, 1_000_000);
    return parseLinkMetadata(html, res.url || url);
  } catch {
    return {};
  }
}
