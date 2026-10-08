import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Tiny JSON-file store living in the data dir (~/.linkedin-mcp by default).
 * Writes are atomic (tmp file + rename) and updates are serialized per file,
 * so concurrent tool calls cannot lose each other's changes.
 */
export class JsonStore {
  constructor(dir) {
    this.dir = dir;
    this.queues = new Map();
  }

  file(name) {
    return path.join(this.dir, `${name}.json`);
  }

  async read(name, fallback) {
    try {
      return JSON.parse(await fs.readFile(this.file(name), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return fallback;
      throw err;
    }
  }

  async write(name, value) {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const target = this.file(name);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(tmp, target);
  }

  async remove(name) {
    await fs.rm(this.file(name), { force: true });
  }

  /** Read-modify-write under a per-file lock. `fn` returns the new value. */
  update(name, fallback, fn) {
    const previous = this.queues.get(name) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        const updated = await fn(await this.read(name, fallback));
        await this.write(name, updated);
        return updated;
      });
    this.queues.set(name, next);
    return next;
  }
}
