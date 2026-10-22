import { ContentValidationError, validateLibrary, validateLocalization } from './validation.js';

// IO is supplied by the host. Never import the sample library into the title bundle.
// readJson receives neutral relative paths, never answer-derived filenames.
export async function loadMysteryLibrary({ readJson, locale = 'en' }) {
  if (typeof readJson !== 'function') throw new TypeError('readJson must be a function.');
  if (typeof locale !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) throw new ContentValidationError('locale');
  async function read(relativePath) {
    try { return structuredClone(await readJson(relativePath)); }
    catch { throw new ContentValidationError('library', 'READ_FAILED'); }
  }
  const manifest = await read('manifest.json');
  if (!manifest || Object.keys(manifest).sort().join(',') !== 'authoredLocale,ids,locales,schemaVersion' || manifest.schemaVersion !== 1 || manifest.authoredLocale !== 'ja' || !Array.isArray(manifest.ids) || !manifest.ids.length || manifest.ids.some(id => typeof id !== 'string' || !/^m[0-9]{6}$/.test(id)) || new Set(manifest.ids).size !== manifest.ids.length || !Array.isArray(manifest.locales) || !manifest.locales.includes(locale) || manifest.locales.some(value => typeof value !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)) || new Set(manifest.locales).size !== manifest.locales.length) {
    throw new ContentValidationError('manifest', 'INVALID_MANIFEST');
  }
  const records = [];
  for (const id of manifest.ids) {
    const record = await read(`records/${id}.json`);
    if (record?.id !== id || record.authoredLocale !== manifest.authoredLocale || Object.hasOwn(record, 'localizations')) throw new ContentValidationError('record', 'MANIFEST_MISMATCH');
    if (locale !== record.authoredLocale) {
      const localized = await read(`locales/${locale}/${id}.json`);
      record.localizations = { [locale]: validateLocalization(localized) };
    }
    records.push(record);
  }
  return validateLibrary(records);
}

export function localizeMystery(record, locale) {
  if (locale !== record.authoredLocale) {
    if (!Object.hasOwn(record.localizations || {}, locale)) throw new ContentValidationError('locale', 'LOCALE_UNAVAILABLE');
    return record.localizations[locale];
  }
  return {
    clues: record.clues.map(clue => clue.text), identity: record.answer.identity,
    targetLabel: record.answer.target.label, modernContext: record.answer.target.modernContext,
    explanation: record.answer.explanation, dateLabel: record.history.date.label,
    cultures: record.history.cultures, uncertainty: record.uncertainty,
  };
}
