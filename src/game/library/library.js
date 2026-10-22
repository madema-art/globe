import { validateCatalog } from './catalog.js';
import { validateMystery, validateLocalization, ContentValidationError } from '../education/validation.js';

export class LazyMysteryLibrary {
  #catalog; #byId; #readJson; #locale; #digest;
  constructor({ catalog, readJson, locale = 'en', digest = async text => {
    const bytes = new TextEncoder().encode(text);
    return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  } }) {
    this.#catalog = validateCatalog(catalog); this.#byId = new Map(this.#catalog.entries.map(entry => [entry.id, entry]));
    this.#readJson = readJson; this.#locale = locale; this.#digest = digest;
    if (typeof readJson !== 'function' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) throw new TypeError('Invalid library capabilities.');
  }
  getCatalog() { return structuredClone(this.#catalog); }
  async load(id, version) {
    const entry = this.#byId.get(id);
    if (!entry || (version !== undefined && version !== entry.contentVersion)) throw new ContentValidationError('library', 'CONTENT_UNAVAILABLE');
    try {
      const canonical = await this.#readJson(`records/${id}.json`);
      const localization = this.#locale === canonical.authoredLocale ? null : await this.#readJson(`locales/${this.#locale}/${id}.json`);
      const expected = await this.#readJson(`digests/${id}.json`);
      if (canonical.id !== id || expected.version !== entry.contentVersion || expected.digest !== entry.digest || await this.#digest(JSON.stringify({ canonicalDigest: expected.canonicalDigest, locales: expected.locales })) !== entry.digest || await this.#digest(JSON.stringify(canonical)) !== expected.canonicalDigest) throw new Error('Digest mismatch');
      if (localization && await this.#digest(JSON.stringify(localization)) !== expected.locales[this.#locale]) throw new Error('Locale mismatch');
      const result = validateMystery(canonical);
      if (localization) result.localizations = { [this.#locale]: validateLocalization(localization) };
      return result;
    } catch { throw new ContentValidationError('library', 'CONTENT_UNAVAILABLE'); }
  }
}
