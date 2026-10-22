import path from 'node:path';
import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { validateMystery, validateLocalization } from '../../src/game/education/validation.js';
import { validateCatalog } from '../../src/game/library/catalog.js';

export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const normalize = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = text => new Set(normalize(text).split(/\s+/));
function similarity(a, b) {
  const aa = words(a), bb = words(b);
  return [...aa].filter(item => bb.has(item)).length / new Set([...aa, ...bb]).size;
}
export function approvalDigest(canonical, translations) {
  const copy = structuredClone(canonical); copy.library.publication = { approved: false, reviewer: null, approvedDigest: null };
  return hash({ canonical: copy, translations });
}
export function metadata(record, digest) {
  const m = record.library;
  return { id: record.id, contentVersion: m.contentVersion, category: record.category, kind: m.kind, region: m.region, era: m.era, countryGroup: m.countryGroup, destinationKey: m.destinationKey, cultures: m.cultures, themes: m.themes, subjectKeys: m.subjectKeys, relatedIds: record.relatedIds || [], aliases: m.aliases, approved: true, digest };
}
export async function auditLibrary(directory) {
  const records = [], failures = [], warnings = [];
  const manifest = await readJson(path.join(directory, 'manifest.json'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.ids) || !Array.isArray(manifest.locales) || !manifest.locales.includes('en')) throw new Error('INVALID_AUTHORING_MANIFEST');
  if (new Set(manifest.ids).size !== manifest.ids.length || manifest.ids.some(id => !/^m\d{6}$/.test(id))) throw new Error('DUPLICATE_OR_INVALID_ID');
  const filenames = (await readdir(path.join(directory, 'records'))).filter(name => name.endsWith('.json')).sort();
  const expected = manifest.ids.map(id => `${id}.json`).sort();
  if (JSON.stringify(filenames) !== JSON.stringify(expected)) throw new Error('MANIFEST_FILE_MISMATCH');
  for (const id of manifest.ids) {
    try {
      const canonical = await readJson(path.join(directory, 'records', `${id}.json`));
      if (canonical.id !== id || canonical.authoredLocale !== 'ja' || !canonical.library) throw new Error('INVALID_CANONICAL');
      validateMystery(canonical, 'record', { allowDraft: true });
      const translations = {};
      for (const locale of manifest.locales.filter(locale => locale !== 'ja')) {
        if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) throw new Error('INVALID_LOCALE');
        translations[locale] = validateLocalization(await readJson(path.join(directory, 'locales', locale, `${id}.json`)));
      }
      const approved = canonical.library.publication;
      if (approved.approved && (canonical.editorial.reviewStatus !== 'reviewed' || !approved.reviewer?.trim() || approved.approvedDigest !== approvalDigest(canonical, translations))) throw new Error('STALE_OR_INVALID_APPROVAL');
      records.push({ canonical, translations });
    } catch (error) { failures.push({ id, code: error.code || 'INVALID_CONTENT' }); }
  }
  const ids = new Set(records.map(item => item.canonical.id));
  const aliases = new Set();
  for (const { canonical } of records) {
    for (const id of canonical.library.aliases) { if (ids.has(id) || aliases.has(id)) failures.push({ id: canonical.id, code: 'ALIAS_COLLISION' }); aliases.add(id); }
    if (canonical.relatedIds?.some(id => !ids.has(id))) failures.push({ id: canonical.id, code: 'UNKNOWN_RELATION' });
  }
  // Inverted token indexes avoid comparing every pair in a large library.
  const destinations = new Map(), subjects = new Map(), clueIndex = new Map(), exactClues = new Map(), warningKeys = new Set();
  const warning = (id, code) => { const key = `${id}:${code}`; if (!warningKeys.has(key)) { warningKeys.add(key); warnings.push({ id, code }); } };
  for (const item of records) {
    const { canonical: c, translations } = item;
    const coordinateKey = `${c.answer.target.latitude.toFixed(3)}:${c.answer.target.longitude.toFixed(3)}`;
    for (const key of [c.library.destinationKey, coordinateKey]) {
      if (destinations.has(key)) warning(c.id, 'SHARED_DESTINATION'); destinations.set(key, c.id);
    }
    for (const key of c.library.subjectKeys) { if (subjects.has(key)) warning(c.id, 'OVERLAPPING_SUBJECT'); subjects.set(key, c.id); }
    for (const text of translations.en?.clues || []) {
      const exact = normalize(text);
      if (exactClues.has(exact) && exactClues.get(exact) !== c.id) warning(c.id, 'SIMILAR_CLUE_WORDING');
      exactClues.set(exact, c.id);
      const candidates = new Set();
      for (const word of words(text)) if (word.length > 4) for (const prior of clueIndex.get(word) || []) { if (candidates.size < 500) candidates.add(prior); }
      for (const prior of candidates) if (prior.id !== c.id && similarity(prior.text, text) >= 0.7) warning(c.id, 'SIMILAR_CLUE_WORDING');
      const entry = { id: c.id, text };
      for (const word of words(text)) if (word.length > 4) { if (!clueIndex.has(word)) clueIndex.set(word, []); if (clueIndex.get(word).length < 128) clueIndex.get(word).push(entry); }
      const identityWords = [...words(translations.en.identity)].filter(word => word.length > 1 && !['the','of','and'].includes(word));
      if (identityWords.length && identityWords.every(word => words(text).has(word))) warning(c.id, 'POTENTIAL_ANSWER_LEAK');
    }
  }
  return { manifest, records, failures, warnings };
}
export function safeReport(audit) {
  const tally = values => values.reduce((counts, key) => { counts[key] = (counts[key] || 0) + 1; return counts; }, {});
  return {
    mysteries: audit.records.length, clues: audit.records.length * 5,
    sourceReferences: audit.records.reduce((sum, item) => sum + item.canonical.sources.length, 0),
    uniqueSourceUrls: new Set(audit.records.flatMap(item => item.canonical.sources.map(source => source.url))).size,
    eras: tally(audit.records.map(item => item.canonical.library.era)), regions: tally(audit.records.map(item => item.canonical.library.region)),
    categories: tally(audit.records.map(item => item.canonical.category)), kinds: tally(audit.records.map(item => item.canonical.library.kind)),
    editorial: tally(audit.records.map(item => item.canonical.editorial.reviewStatus)),
    approved: audit.records.filter(item => item.canonical.library.publication.approved).length,
    failures: tally(audit.failures.map(item => item.code)), warnings: tally(audit.warnings.map(item => item.code)),
  };
}
export async function publishLibrary(directory, output) {
  const audit = await auditLibrary(directory);
  if (audit.failures.length) throw new Error('PUBLICATION_VALIDATION_FAILED');
  const approved = audit.records.filter(item => item.canonical.library.publication.approved);
  if (audit.warnings.some(item => item.code === 'POTENTIAL_ANSWER_LEAK' && approved.some(record => record.canonical.id === item.id))) throw new Error('ANSWER_LEAK_REVIEW_REQUIRED');
  const entries = [];
  const version = hash(approved).slice(0, 20);
  const release = path.join(output, 'releases', version);
  await mkdir(release, { recursive: true });
  for (const { canonical, translations } of approved) {
    const canonicalDigest = hash(canonical), locales = Object.fromEntries(Object.entries(translations).map(([locale, content]) => [locale, hash(content)]));
    const digest = hash({ canonicalDigest, locales });
    entries.push(metadata(canonical, digest));
    for (const [relative, data] of [[`records/${canonical.id}.json`, canonical], [`digests/${canonical.id}.json`, { version: canonical.library.contentVersion, digest, canonicalDigest, locales }], ...Object.entries(translations).map(([locale, content]) => [`locales/${locale}/${canonical.id}.json`, content])]) {
      const file = path.join(release, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(data));
    }
  }
  const catalog = validateCatalog({ schemaVersion: 1, version, entries });
  await writeFile(path.join(release, 'catalog.json'), JSON.stringify(catalog));
  // Never silently change content bytes under an unchanged ID/version across releases.
  let history = {}, previous = null;
  try {
    previous = await readJson(path.join(output, 'current.json'));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous) {
    const old = await readJson(path.join(output, 'releases', previous.version, 'catalog.json'));
    history = previous.history || Object.fromEntries(old.entries.map(entry => [entry.id, { contentVersion: entry.contentVersion, digest: entry.digest }]));
    for (const entry of catalog.entries) {
      const prior = history[entry.id];
      if (prior && entry.contentVersion <= prior.contentVersion && entry.digest !== prior.digest) throw new Error('CONTENT_VERSION_MUST_INCREASE');
    }
  }
  for (const entry of catalog.entries) history[entry.id] = { contentVersion: entry.contentVersion, digest: entry.digest };
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'current.tmp'), JSON.stringify({ version, history }));
  await rename(path.join(output, 'current.tmp'), path.join(output, 'current.json'));
  return { ...safeReport(audit), published: entries.length, version };
}

// Import finished authoring files without editing application modules. Roll back a failed stage.
export async function stageDraft(directory, drafts, id) {
  if (!/^m\d{6}$/.test(id || '')) throw new Error('NEUTRAL_ID_REQUIRED');
  const manifest = await readJson(path.join(directory, 'manifest.json'));
  if (manifest.ids.includes(id)) throw new Error('DUPLICATE_ID');
  const canonical = await readJson(path.join(drafts, `${id}.json`));
  if (canonical.id !== id || canonical.authoredLocale !== 'ja' || !canonical.library || canonical.library.publication.approved) throw new Error('INVALID_DRAFT');
  validateMystery(canonical, 'record', { allowDraft: true });
  const files = [[`records/${id}.json`, canonical]];
  for (const locale of manifest.locales.filter(locale => locale !== 'ja')) {
    files.push([`locales/${locale}/${id}.json`, validateLocalization(await readJson(path.join(drafts, 'locales', locale, `${id}.json`)))]);
  }
  const created = [];
  try {
    for (const [relative, data] of files) {
      const target = path.join(directory, relative); await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' }); created.push(target);
    }
    const updated = { ...manifest, ids: [...manifest.ids, id] };
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(updated, null, 2) + '\n');
    const audit = await auditLibrary(directory);
    if (audit.failures.length) throw new Error('VALIDATION_FAILED');
    return { staged: 1, approved: false };
  } catch (error) {
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    for (const file of created) await rm(file);
    throw error;
  }
}
