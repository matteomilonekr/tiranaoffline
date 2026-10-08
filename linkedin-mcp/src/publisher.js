import path from 'node:path';
import { LIMITS } from './config.js';
import { LinkedInApiError, postUrl } from './linkedin.js';
import { fetchLinkMetadata, resolveMedia } from './media.js';
import { analyzeText, countChars, prepareCommentary } from './text.js';

export class ValidationError extends Error {
  constructor(errors) {
    super(`The post is not valid:\n- ${errors.join('\n- ')}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export const POLL_DURATIONS = ['ONE_DAY', 'THREE_DAYS', 'SEVEN_DAYS', 'FOURTEEN_DAYS'];
export const VISIBILITIES = ['PUBLIC', 'CONNECTIONS', 'LOGGED_IN'];

/** The post type follows from which content field is set. */
export function inferPostType(post) {
  const kinds = [];
  if (post.images?.length) kinds.push(post.images.length > 1 ? 'multiImage' : 'image');
  if (post.document) kinds.push('document');
  if (post.video) kinds.push('video');
  if (post.article) kinds.push('article');
  if (post.poll) kinds.push('poll');
  if (post.reshareOf) kinds.push('reshare');
  if (kinds.length > 1) {
    throw new ValidationError([`A post can carry only one kind of content, got: ${kinds.join(' + ')}.`]);
  }
  return kinds[0] || 'text';
}

/** Offline validation + formatting. Never touches the network. */
export function inspectPost(post) {
  const type = inferPostType(post);
  const { visible, commentary } = prepareCommentary(post.text || '', { markdown: post.markdown !== false });
  const analysis = analyzeText(visible);
  const errors = [];

  if (!visible.trim() && type === 'text') {
    errors.push('text is required for a text-only post.');
  }
  if (analysis.characters > LIMITS.commentary) {
    errors.push(`text is ${analysis.characters} characters long, the LinkedIn limit is ${LIMITS.commentary}.`);
  }
  if (post.images?.length > LIMITS.maxImages) errors.push(`At most ${LIMITS.maxImages} images per post.`);
  for (const image of post.images || []) {
    if (image.altText && countChars(image.altText) > LIMITS.altText) errors.push('An image altText is too long.');
  }
  if (post.poll) {
    const { question = '', options = [], duration } = post.poll;
    if (!question.trim()) errors.push('poll.question is required.');
    if (countChars(question) > LIMITS.pollQuestion) errors.push(`poll.question exceeds ${LIMITS.pollQuestion} characters.`);
    if (options.length < LIMITS.minPollOptions || options.length > LIMITS.maxPollOptions) {
      errors.push(`A poll needs ${LIMITS.minPollOptions}-${LIMITS.maxPollOptions} options.`);
    }
    for (const option of options) {
      if (countChars(option) > LIMITS.pollOption) errors.push(`Poll option "${option}" exceeds ${LIMITS.pollOption} characters.`);
    }
    if (duration && !POLL_DURATIONS.includes(duration)) errors.push(`poll.duration must be one of ${POLL_DURATIONS.join(', ')}.`);
  }
  if (post.article?.url && !/^https?:\/\//i.test(post.article.url)) errors.push('article.url must be an http(s) URL.');
  if (post.firstComment && countChars(post.firstComment) > LIMITS.comment) {
    errors.push(`firstComment exceeds ${LIMITS.comment} characters.`);
  }
  if (post.visibility && !VISIBILITIES.includes(post.visibility)) {
    errors.push(`visibility must be one of ${VISIBILITIES.join(', ')}.`);
  }
  if (post.author && !/^urn:li:(person|organization):[\w-]+$/.test(post.author)) {
    errors.push('author must look like urn:li:person:<id> or urn:li:organization:<id>.');
  }
  return { type, visible, commentary, analysis, errors };
}

export function assertValidPost(post) {
  const inspected = inspectPost(post);
  if (inspected.errors.length) throw new ValidationError(inspected.errors);
  return inspected;
}

const RETRYABLE_MEDIA_ERROR = /PROCESSING|WAITING_UPLOAD|not (yet )?(ready|available)/i;

const DEFAULT_OPTIONS = {
  waits: { image: 20_000, document: 60_000, video: 180_000 },
  createRetries: 6,
  retryDelayMs: 10_000,
};

/** Uploads all media, creates the post, adds the optional first comment and logs it. */
export async function publishPost(post, { client, history, fetchImpl = fetch, options = {} }) {
  const opts = { ...DEFAULT_OPTIONS, ...options, waits: { ...DEFAULT_OPTIONS.waits, ...options.waits } };
  const { type, visible, commentary, analysis } = assertValidPost(post);
  const author = await client.resolveAuthor(post.author);
  const warnings = [...analysis.warnings];
  const cleanups = [];

  const upload = async (kind, source) => {
    const media = await resolveMedia(kind, source, { fetchImpl });
    cleanups.push(media.cleanup);
    const uploaders = { image: 'uploadImage', document: 'uploadDocument', video: 'uploadVideo' };
    const urn = await client[uploaders[kind]](media.path, author);
    await client.waitForAsset(kind, urn, { timeoutMs: opts.waits[kind] });
    return { urn, media };
  };

  const body = {
    author,
    commentary,
    visibility: post.visibility || 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: Boolean(post.disableReshare),
  };

  try {
    if (type === 'image') {
      const [image] = post.images;
      const { urn } = await upload('image', image.source);
      body.content = { media: { id: urn, ...(image.altText ? { altText: image.altText } : {}) } };
    } else if (type === 'multiImage') {
      const images = [];
      for (const image of post.images) {
        const { urn } = await upload('image', image.source);
        images.push({ id: urn, ...(image.altText ? { altText: image.altText } : {}) });
      }
      body.content = { multiImage: { images } };
    } else if (type === 'document') {
      const { urn, media } = await upload('document', post.document.source);
      const title = post.document.title || path.parse(media.name).name;
      body.content = { media: { id: urn, title } };
    } else if (type === 'video') {
      const { urn } = await upload('video', post.video.source);
      body.content = { media: { id: urn, ...(post.video.title ? { title: post.video.title } : {}) } };
    } else if (type === 'article') {
      body.content = { article: await buildArticle(post.article, { upload, fetchImpl, warnings }) };
    } else if (type === 'poll') {
      const { question, options, duration = 'THREE_DAYS' } = post.poll;
      body.content = { poll: { question, options: options.map((text) => ({ text })), settings: { duration } } };
    } else if (type === 'reshare') {
      body.reshareContext = { parent: post.reshareOf };
    }

    const created = await createWithRetry(client, body, type, opts);
    const result = {
      urn: created.urn,
      url: postUrl(created.urn),
      type,
      author,
      visibility: body.visibility,
      warnings,
    };

    if (post.firstComment) {
      try {
        const comment = await client.createComment({ postUrn: created.urn, actor: author, text: post.firstComment });
        result.firstComment = { ok: true, ...comment };
      } catch (err) {
        result.firstComment = { ok: false, error: err.message };
      }
    }

    try {
      await history?.add({
        urn: result.urn,
        url: result.url,
        type,
        author,
        text: visible.slice(0, 500),
        publishedAt: new Date().toISOString(),
      });
    } catch (err) {
      // The post is live: a local logging failure must not look like a failed publish.
      warnings.push(`Published, but the local history could not be updated: ${err.message}`);
    }
    return result;
  } finally {
    await Promise.allSettled(cleanups.map((cleanup) => cleanup()));
  }
}

async function createWithRetry(client, body, type, opts) {
  const mediaPost = ['image', 'multiImage', 'document', 'video', 'article'].includes(type);
  for (let attempt = 1; ; attempt++) {
    try {
      return await client.createPost(body);
    } catch (err) {
      const retryable =
        mediaPost &&
        err instanceof LinkedInApiError &&
        [400, 409, 422].includes(err.status) &&
        RETRYABLE_MEDIA_ERROR.test(err.message);
      if (!retryable || attempt >= opts.createRetries) throw err;
      await client.sleep(opts.retryDelayMs);
    }
  }
}

// The Posts API does not scrape links: title, description and thumbnail must be
// sent explicitly. Missing fields are filled from the page's Open Graph tags.
async function buildArticle(article, { upload, fetchImpl, warnings }) {
  let { title, description, thumbnail } = article;
  if (!title || !description || !thumbnail) {
    const meta = await fetchLinkMetadata(article.url, { fetchImpl });
    title ||= meta.title;
    description ||= meta.description;
    thumbnail ||= meta.image;
  }
  const content = { source: article.url, title: title || new URL(article.url).hostname };
  if (description) content.description = description;
  if (thumbnail) {
    try {
      content.thumbnail = (await upload('image', thumbnail)).urn;
    } catch (err) {
      warnings.push(`Article published without thumbnail: ${err.message}`);
    }
  } else {
    warnings.push('Article published without thumbnail: the page has no og:image. Pass article.thumbnail to add one.');
  }
  return content;
}

/** Local log of published posts: the API cannot list a member's posts without r_member_social. */
export class PublishHistory {
  constructor(store, max = 500) {
    this.store = store;
    this.max = max;
  }

  add(entry) {
    return this.store.update('history', [], (items) => [entry, ...items].slice(0, this.max));
  }

  async list(limit = 20) {
    return (await this.store.read('history', [])).slice(0, limit);
  }

  markDeleted(urn) {
    return this.store.update('history', [], (items) =>
      items.map((item) => (item.urn === urn ? { ...item, deletedAt: new Date().toISOString() } : item)),
    );
  }
}
