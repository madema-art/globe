import { syntheticRecord } from './education.mjs';
import { hash, metadata, approvalDigest } from '../../scripts/content/pipeline.mjs';
import { LazyMysteryLibrary } from '../../src/game/library/library.js';

export function authored(id = 'm900001') {
  const canonical = syntheticRecord(id), en = canonical.localizations.en;
  delete canonical.localizations;
  canonical.editorial.reviewStatus = 'source-checked';
  canonical.library = {
    contentVersion: 1, kind: 'history', region: 'synthetic-region', era: 'classical', countryGroup: 'synthetic-group',
    destinationKey: `d-${id}`, cultures: ['synthetic-culture'], themes: ['synthetic-theme'], subjectKeys: [`s-${id}`],
    learningObjective: '仮の学習目標', aliases: [], relatedPlaces: [], publication: { approved: false, reviewer: null, approvedDigest: null },
  };
  return { canonical, translations: { en } };
}
export function entry(number) {
  return { id: `m${String(number).padStart(6, '0')}`, contentVersion: 1, category: `category-${number % 4}`, kind: number % 2 ? 'history' : 'geography', region: `region-${number % 5}`, era: `era-${number % 3}`, countryGroup: `group-${number % 9}`, destinationKey: `d-${number}`, cultures: [`culture-${number % 7}`], themes: [`theme-${number % 6}`], subjectKeys: [`subject-${number}`], relatedIds: [], aliases: [], approved: true, digest: 'a'.repeat(64) };
}
export const catalog = entries => ({ schemaVersion: 1, version: 'synthetic-v1', entries });
export function memoryAdapter() {
  let text = null, backup = null, queue = Promise.resolve();
  const adapter = {
    fail: false, reads: 0, writes: 0,
    read: () => { adapter.reads++; return text; }, backup: () => backup,
    write: next => { if (adapter.fail) throw new Error('Synthetic quota failure'); backup = text; text = next; adapter.writes++; },
    withLock: operation => { const result = queue.then(operation); queue = result.catch(() => {}); return result; },
    corrupt: value => { text = value; },
  };
  return adapter;
}
export function lazyFixture(items = [authored()]) {
  const files = new Map(), entries = [], reads = [];
  for (const { canonical, translations } of items) {
    canonical.editorial.reviewStatus = 'reviewed';
    canonical.library.publication = { approved: true, reviewer: 'Synthetic fixture only', approvedDigest: approvalDigest(canonical, translations) };
    const canonicalDigest = hash(canonical), locales = Object.fromEntries(Object.entries(translations).map(([key, value]) => [key, hash(value)]));
    const digest = hash({ canonicalDigest, locales });
    entries.push(metadata(canonical, digest));
    files.set(`records/${canonical.id}.json`, canonical);
    files.set(`digests/${canonical.id}.json`, { version: canonical.library.contentVersion, digest, canonicalDigest, locales });
    for (const [locale, value] of Object.entries(translations)) files.set(`locales/${locale}/${canonical.id}.json`, value);
  }
  const library = new LazyMysteryLibrary({ catalog: catalog(entries), readJson: async key => { reads.push(key); if (!files.has(key)) throw new Error(); return structuredClone(files.get(key)); } });
  return { library, files, reads };
}
