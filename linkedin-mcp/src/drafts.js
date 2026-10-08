import crypto from 'node:crypto';
import { inspectPost } from './publisher.js';

const CLAIM_TTL_MS = 30 * 60_000;

/** Drafts live in drafts.json in the data dir; media sources are uploaded only at publish time. */
export class DraftStore {
  constructor(store, now = () => new Date()) {
    this.store = store;
    this.now = now;
  }

  async list() {
    const drafts = await this.store.read('drafts', []);
    return drafts.sort((a, b) => (a.scheduledFor || '9999').localeCompare(b.scheduledFor || '9999'));
  }

  async get(id) {
    const draft = (await this.store.read('drafts', [])).find((item) => item.id === id);
    if (!draft) throw new Error(`Draft "${id}" not found.`);
    return draft;
  }

  /** Creates a draft, or updates the given fields of an existing one. */
  async save({ id, post, title, notes, scheduledFor }) {
    if (post) inspectPost(post); // rejects mixed content types early
    if (scheduledFor && Number.isNaN(Date.parse(scheduledFor))) {
      throw new Error(`scheduledFor "${scheduledFor}" is not a valid ISO 8601 date-time.`);
    }
    let saved;
    await this.store.update('drafts', [], (drafts) => {
      const timestamp = this.now().toISOString();
      const index = id ? drafts.findIndex((item) => item.id === id) : -1;
      if (id && index === -1) throw new Error(`Draft "${id}" not found.`);
      if (index === -1) {
        if (!post) throw new Error('post is required to create a draft.');
        saved = {
          id: `d_${crypto.randomBytes(4).toString('hex')}`,
          title: title || null,
          notes: notes || null,
          scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
          post,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        return [...drafts, saved];
      }
      const current = drafts[index];
      saved = {
        ...current,
        ...(post ? { post } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(scheduledFor !== undefined ? { scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null } : {}),
        updatedAt: timestamp,
      };
      return drafts.map((item, i) => (i === index ? saved : item));
    });
    return saved;
  }

  async remove(id) {
    let found = false;
    await this.store.update('drafts', [], (drafts) => {
      found = drafts.some((item) => item.id === id);
      return drafts.filter((item) => item.id !== id);
    });
    if (!found) throw new Error(`Draft "${id}" not found.`);
  }

  /** Drafts whose scheduledFor time has passed and that are not being published right now. */
  async due(now = this.now()) {
    return (await this.list()).filter(
      (draft) => draft.scheduledFor && Date.parse(draft.scheduledFor) <= now.getTime() && !this.isClaimed(draft, now),
    );
  }

  isClaimed(draft, now = this.now()) {
    return Boolean(draft.publishingStartedAt) && now.getTime() - Date.parse(draft.publishingStartedAt) < CLAIM_TTL_MS;
  }

  /** Marks a draft as being published so an overlapping run (e.g. two cron jobs) cannot post it twice. */
  async claim(id) {
    let claimed;
    await this.store.update('drafts', [], (drafts) => {
      const draft = drafts.find((item) => item.id === id);
      if (!draft) throw new Error(`Draft "${id}" not found.`);
      if (this.isClaimed(draft)) throw new Error(`Draft "${id}" is already being published.`);
      claimed = { ...draft, publishingStartedAt: this.now().toISOString() };
      return drafts.map((item) => (item.id === id ? claimed : item));
    });
    return claimed;
  }

  async release(id) {
    await this.store.update('drafts', [], (drafts) =>
      drafts.map((item) => {
        if (item.id !== id) return item;
        const { publishingStartedAt, ...rest } = item;
        return rest;
      }),
    );
  }
}
