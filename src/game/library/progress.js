import { idPattern } from './catalog.js';

export class ProgressError extends Error {
  constructor(code) { super(`Local educational progress unavailable (${code}).`); this.name = 'ProgressError'; this.code = code; }
}
function checksum(text) {
  let result = 2166136261;
  for (const c of text) { result ^= c.charCodeAt(0); result = Math.imul(result, 16777619); }
  return (result >>> 0).toString(16);
}
export function emptyProgress(seed = 'globe-default', channel = 'production') {
  return { schemaVersion: 2, revision: 0, seed, sequence: 0, entries: {}, recent: [], active: null, aliasesApplied: [], channel };
}
export function validateProgress(value) {
  if (!value || value.schemaVersion > 2) throw new ProgressError('UNSUPPORTED_VERSION');
  if (value.schemaVersion === 1) value = { ...value, schemaVersion: 2, aliasesApplied: value.aliasesApplied || [] };
  value = { ...value, channel: value.channel === undefined ? 'production' : value.channel };
  if (!['production', 'development'].includes(value.channel)) throw new ProgressError('CORRUPT_PROGRESS');
  if (value.schemaVersion !== 2 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || typeof value.seed !== 'string' || !value.seed || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries) || !Array.isArray(value.recent) || value.recent.length > 100 || !Array.isArray(value.aliasesApplied) || value.aliasesApplied.some(id => !idPattern.test(id))) throw new ProgressError('CORRUPT_PROGRESS');
  for (const [id, entry] of Object.entries(value.entries)) {
    if (!idPattern.test(id) || !entry || !Number.isSafeInteger(entry.presented) || entry.presented < 1 || typeof entry.revealed !== 'boolean' || typeof entry.completed !== 'boolean' || !Number.isSafeInteger(entry.lastPresented) || entry.lastPresented < 1 || !Number.isSafeInteger(entry.contentVersion) || entry.contentVersion < 1) throw new ProgressError('CORRUPT_PROGRESS');
  }
  for (const entry of value.recent) {
    if (!entry || !idPattern.test(entry.id)) throw new ProgressError('CORRUPT_PROGRESS');
    for (const field of ['category', 'region', 'era', 'kind', 'countryGroup', 'destinationKey']) if (typeof entry[field] !== 'string') throw new ProgressError('CORRUPT_PROGRESS');
    for (const field of ['relatedIds', 'subjectKeys', 'cultures', 'themes']) if (!Array.isArray(entry[field]) || entry[field].some(item => typeof item !== 'string')) throw new ProgressError('CORRUPT_PROGRESS');
  }
  if (value.active !== null) {
    const a = value.active;
    if (!a || !idPattern.test(a.id) || !Number.isSafeInteger(a.contentVersion) || a.contentVersion < 1 || !Number.isInteger(a.clueCount) || a.clueCount < 1 || a.clueCount > 5 || typeof a.revealed !== 'boolean' || !value.entries[a.id]) throw new ProgressError('CORRUPT_PROGRESS');
  }
  return structuredClone(value);
}
export function encodeProgress(progress) { const payload = JSON.stringify(validateProgress(progress)); return JSON.stringify({ format: 'globe-progress/1', payload, checksum: checksum(payload) }); }
export function decodeProgress(text) {
  try {
    const value = JSON.parse(text);
    if (value.format !== 'globe-progress/1' || typeof value.payload !== 'string' || checksum(value.payload) !== value.checksum) throw new ProgressError('CORRUPT_PROGRESS');
    return validateProgress(JSON.parse(value.payload));
  } catch (error) { throw error instanceof ProgressError ? error : new ProgressError('CORRUPT_PROGRESS'); }
}
export function createBrowserProgressAdapter({ storage = globalThis.localStorage, locks = globalThis.navigator?.locks, channel = 'production', key = channel === 'development' ? 'globe.education.development.progress' : 'globe.education.progress' } = {}) {
  if (!['production', 'development'].includes(channel)) throw new TypeError('Invalid progress channel.');
  return {
    channel,
    read: () => storage.getItem(key), backup: () => storage.getItem(`${key}.backup`),
    write: text => { const old = storage.getItem(key); if (old) storage.setItem(`${key}.backup`, old); storage.setItem(key, text); },
    withLock: operation => { if (!locks?.request) throw new ProgressError('LOCK_UNAVAILABLE'); return locks.request(key, operation); },
  };
}
export class ProgressRepository {
  #adapter; #seed; #channel;
  constructor({ adapter, seed = globalThis.crypto.randomUUID(), channel = 'production' }) {
    if (!adapter || !['read', 'write', 'withLock'].every(key => typeof adapter[key] === 'function')) throw new TypeError('A locked persistence adapter is required.');
    if (!['production', 'development'].includes(channel) || (adapter.channel && adapter.channel !== channel)) throw new TypeError('Progress channel mismatch.');
    this.#adapter = adapter; this.#seed = seed; this.#channel = channel;
  }
  get channel() { return this.#channel; }
  #read(text) {
    const saved = text === null ? emptyProgress(this.#seed, this.#channel) : decodeProgress(text);
    if (saved.channel !== this.#channel) throw new ProgressError('CONTENT_PROGRESS_CHANNEL_MISMATCH');
    return saved;
  }
  async transaction(operation) {
    try {
      return await this.#adapter.withLock(async () => {
        const text = await this.#adapter.read();
        const progress = this.#read(text);
        const result = await operation(progress);
        if (progress.channel !== this.#channel) throw new ProgressError('CONTENT_PROGRESS_CHANNEL_MISMATCH');
        validateProgress(progress); progress.revision++;
        await this.#adapter.write(encodeProgress(progress));
        return result;
      });
    } catch (error) { throw error instanceof ProgressError ? error : new ProgressError(error?.code === 'CONTENT_UNAVAILABLE' ? 'CONTENT_UNAVAILABLE' : 'STORAGE_FAILURE'); }
  }
  async inspect() {
    try { return this.#read(await this.#adapter.read()); }
    catch (error) { throw error instanceof ProgressError ? error : new ProgressError(error?.code === 'CONTENT_UNAVAILABLE' ? 'CONTENT_UNAVAILABLE' : 'STORAGE_FAILURE'); }
  }
  // Explicit recovery only; never silently replace a corrupt primary history.
  async recoverBackup() {
    return this.#adapter.withLock(async () => {
      const saved = await this.#adapter.backup?.();
      if (!saved) throw new ProgressError('NO_BACKUP');
      const progress = this.#read(saved);
      // Host should export the damaged primary first. write() preserves it as the backup.
      await this.#adapter.write(encodeProgress(progress)); return progress;
    });
  }
}
