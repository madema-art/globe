export const CATEGORIES = Object.freeze([
  'settlement', 'country-region', 'natural-feature', 'built-site', 'person',
  'civilization', 'event', 'science', 'culture', 'historical-process',
]);

// Errors identify schema paths, never content values, translations, or answers.
export class ContentValidationError extends Error {
  constructor(path, code = 'INVALID_FIELD') {
    super(`Educational content validation failed at ${path} (${code}).`);
    this.name = 'ContentValidationError';
    this.path = path;
    this.code = code;
  }
}
const fail = (path, code) => { throw new ContentValidationError(path, code); };
const text = (value, path) => { if (typeof value !== 'string' || !value.trim()) fail(path); };
const array = (value, path, minimum = 0) => { if (!Array.isArray(value) || value.length < minimum) fail(path); };
const unique = (value, path) => { if (new Set(value).size !== value.length) fail(path, 'DUPLICATE'); };
function object(value, path, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'MISSING');
  if (Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail(path, 'UNKNOWN_FIELD');
}
const neutralId = (value, path) => { if (typeof value !== 'string' || !/^m[0-9]{6}$/.test(value)) fail(path, 'NEUTRAL_ID_REQUIRED'); };
const localeId = (value, path) => { if (typeof value !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)) fail(path); };
function checkExplicitIdentity(clues, identity, path) {
  const normalized = identity.normalize('NFKC').toLowerCase();
  if (clues.some(clue => clue.normalize('NFKC').toLowerCase().includes(normalized))) fail(path, 'EXPLICIT_ANSWER_IN_CLUE');
}

export function validateCoordinates(value, path = 'coordinates') {
  object(value, path, ['latitude', 'longitude']);
  if (!Number.isFinite(value.latitude) || value.latitude < -90 || value.latitude > 90) fail(`${path}.latitude`);
  if (!Number.isFinite(value.longitude) || value.longitude < -180 || value.longitude >= 180) fail(`${path}.longitude`);
  return { latitude: value.latitude, longitude: value.longitude };
}

export function historicalYearOrder(point) {
  return point.era === 'BCE' ? 1 - point.year : point.year;
}
function year(value, path) {
  object(value, path, ['year', 'era', 'approximate']);
  if (!Number.isSafeInteger(value.year) || value.year < 1) fail(`${path}.year`);
  if (!['BCE', 'CE'].includes(value.era)) fail(`${path}.era`);
  if (typeof value.approximate !== 'boolean') fail(`${path}.approximate`);
}
export function validateHistoricalDate(value, path = 'history.date') {
  if (!value || typeof value !== 'object') fail(path);
  if (value.kind === 'year') {
    object(value, path, ['kind', 'label', 'at']);
    year(value.at, `${path}.at`);
  } else if (value.kind === 'range' || value.kind === 'period') {
    object(value, path, ['kind', 'label', 'start', 'end']);
    year(value.start, `${path}.start`); year(value.end, `${path}.end`);
    if (historicalYearOrder(value.start) > historicalYearOrder(value.end)) fail(path, 'REVERSED_RANGE');
  } else fail(`${path}.kind`);
  text(value.label, `${path}.label`);
  return structuredClone(value);
}
function stringList(value, path, minimum = 0) {
  array(value, path, minimum); value.forEach((item, i) => text(item, `${path}[${i}]`)); unique(value, path);
}

export function validateLocalization(value, path = 'localization') {
  object(value, path, ['clues', 'identity', 'targetLabel', 'modernContext', 'explanation', 'dateLabel', 'cultures', 'uncertainty']);
  array(value.clues, `${path}.clues`);
  if (value.clues.length !== 5) fail(`${path}.clues`, 'EXACTLY_FIVE_REQUIRED');
  value.clues.forEach((clue, i) => text(clue, `${path}.clues[${i}]`));
  unique(value.clues, `${path}.clues`);
  for (const key of ['identity', 'targetLabel', 'modernContext', 'explanation', 'dateLabel', 'uncertainty']) text(value[key], `${path}.${key}`);
  stringList(value.cultures, `${path}.cultures`, 1);
  checkExplicitIdentity(value.clues, value.identity, `${path}.clues`);
  return structuredClone(value);
}

export function validateMystery(record, path = 'record', { allowDraft = false } = {}) {
  object(record, path, ['schemaVersion', 'id', 'category', 'subjectType', 'authoredLocale', 'clues', 'answer', 'history', 'sources', 'uncertainty', 'editorial'], ['relatedIds', 'localizations', 'library']);
  if (record.schemaVersion !== 1) fail(`${path}.schemaVersion`);
  neutralId(record.id, `${path}.id`);
  if (!CATEGORIES.includes(record.category)) fail(`${path}.category`);
  text(record.subjectType, `${path}.subjectType`); localeId(record.authoredLocale, `${path}.authoredLocale`);
  array(record.sources, `${path}.sources`, 1);
  const sourceIds = [];
  record.sources.forEach((source, i) => {
    const p = `${path}.sources[${i}]`;
    object(source, p, ['id', 'url', 'title', 'publisher', 'accessedOn', 'notes']);
    if (!/^r[1-9][0-9]*$/.test(source.id)) fail(`${p}.id`);
    for (const key of ['title', 'publisher', 'notes']) text(source[key], `${p}.${key}`);
    let url;
    try { url = new URL(source.url); } catch { fail(`${p}.url`); }
    if (url.protocol !== 'https:' || url.username || url.password) fail(`${p}.url`);
    if (typeof source.accessedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(source.accessedOn)) fail(`${p}.accessedOn`);
    const [y, m, d] = source.accessedOn.split('-').map(Number);
    // This is a modern source-access date, never the historical date model.
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) fail(`${p}.accessedOn`);
    sourceIds.push(source.id);
  });
  unique(sourceIds, `${path}.sources`);
  const references = (ids, p) => {
    stringList(ids, p, 1);
    if (ids.some(id => !sourceIds.includes(id))) fail(p, 'UNKNOWN_SOURCE');
  };
  array(record.clues, `${path}.clues`);
  if (record.clues.length !== 5) fail(`${path}.clues`, 'EXACTLY_FIVE_REQUIRED');
  record.clues.forEach((clue, i) => {
    const p = `${path}.clues[${i}]`;
    object(clue, p, ['text', 'sourceIds']); text(clue.text, `${p}.text`); references(clue.sourceIds, `${p}.sourceIds`);
  });
  unique(record.clues.map(clue => clue.text), `${path}.clues`);
  object(record.answer, `${path}.answer`, ['identity', 'target', 'explanation', 'sourceIds']);
  text(record.answer.identity, `${path}.answer.identity`); text(record.answer.explanation, `${path}.answer.explanation`);
  checkExplicitIdentity(record.clues.map(clue => clue.text), record.answer.identity, `${path}.clues`);
  references(record.answer.sourceIds, `${path}.answer.sourceIds`);
  const target = record.answer.target;
  object(target, `${path}.answer.target`, ['kind', 'referenceFrame', 'latitude', 'longitude', 'label', 'modernContext']);
  if (target.kind !== 'point' || target.referenceFrame !== 'WGS84') fail(`${path}.answer.target`);
  validateCoordinates({ latitude: target.latitude, longitude: target.longitude }, `${path}.answer.target.coordinates`);
  text(target.label, `${path}.answer.target.label`); text(target.modernContext, `${path}.answer.target.modernContext`);
  object(record.history, `${path}.history`, ['date', 'cultures']);
  validateHistoricalDate(record.history.date, `${path}.history.date`); stringList(record.history.cultures, `${path}.history.cultures`, 1);
  text(record.uncertainty, `${path}.uncertainty`);
  object(record.editorial, `${path}.editorial`, ['clueOrderReviewed', 'reviewStatus', 'notes']);
  if (record.editorial.clueOrderReviewed !== true && !(allowDraft && record.editorial.reviewStatus === 'draft')) fail(`${path}.editorial.clueOrderReviewed`, 'EDITORIAL_REVIEW_REQUIRED');
  if (![...(allowDraft ? ['draft'] : []), 'source-checked', 'source-checked-sample', 'reviewed'].includes(record.editorial.reviewStatus)) fail(`${path}.editorial.reviewStatus`);
  text(record.editorial.notes, `${path}.editorial.notes`);
  if (record.library !== undefined) {
    const m = record.library;
    object(m, `${path}.library`, ['contentVersion', 'kind', 'region', 'era', 'countryGroup', 'cultures', 'themes', 'subjectKeys', 'destinationKey', 'learningObjective', 'aliases', 'relatedPlaces', 'publication']);
    if (!Number.isSafeInteger(m.contentVersion) || m.contentVersion < 1 || !['history', 'geography'].includes(m.kind)) fail(`${path}.library`);
    const token = /^[a-z0-9][a-z0-9-]{0,63}$/;
    for (const key of ['region', 'era', 'countryGroup', 'destinationKey']) if (typeof m[key] !== 'string' || !token.test(m[key])) fail(`${path}.library.${key}`);
    for (const key of ['cultures', 'themes', 'subjectKeys']) { stringList(m[key], `${path}.library.${key}`, 1); if (m[key].some(item => !token.test(item))) fail(`${path}.library.${key}`); }
    text(m.learningObjective, `${path}.library.learningObjective`);
    array(m.aliases, `${path}.library.aliases`); unique(m.aliases, `${path}.library.aliases`); m.aliases.forEach(id => neutralId(id, `${path}.library.aliases`));
    array(m.relatedPlaces, `${path}.library.relatedPlaces`);
    m.relatedPlaces.forEach((place, i) => { object(place, `${path}.library.relatedPlaces[${i}]`, ['label', 'relationship', 'sourceIds']); text(place.label, `${path}.library.relatedPlaces[${i}].label`); text(place.relationship, `${path}.library.relatedPlaces[${i}].relationship`); references(place.sourceIds, `${path}.library.relatedPlaces[${i}].sourceIds`); });
    object(m.publication, `${path}.library.publication`, ['approved', 'reviewer', 'approvedDigest']);
    if (typeof m.publication.approved !== 'boolean' || (m.publication.reviewer !== null && typeof m.publication.reviewer !== 'string') || (m.publication.approvedDigest !== null && !/^[a-f0-9]{64}$/.test(m.publication.approvedDigest))) fail(`${path}.library.publication`);
  }
  if (record.relatedIds !== undefined) {
    array(record.relatedIds, `${path}.relatedIds`); unique(record.relatedIds, `${path}.relatedIds`);
    record.relatedIds.forEach((id, i) => neutralId(id, `${path}.relatedIds[${i}]`));
    if (record.relatedIds.includes(record.id)) fail(`${path}.relatedIds`, 'SELF_REFERENCE');
  }
  if (record.localizations !== undefined) {
    if (!record.localizations || typeof record.localizations !== 'object' || Array.isArray(record.localizations)) fail(`${path}.localizations`);
    for (const [locale, content] of Object.entries(record.localizations)) {
      localeId(locale, `${path}.localizations`);
      if (locale === record.authoredLocale) fail(`${path}.localizations`, 'DUPLICATE_LOCALE');
      validateLocalization(content, `${path}.localizations.${locale}`);
    }
  }
  return structuredClone(record);
}

export function validateLibrary(records) {
  array(records, 'records', 1);
  const validated = records.map((record, i) => validateMystery(record, `records[${i}]`));
  const ids = validated.map(record => record.id); unique(ids, 'records');
  validated.forEach((record, i) => {
    if (record.relatedIds?.some(id => !ids.includes(id))) fail(`records[${i}].relatedIds`, 'UNKNOWN_MYSTERY');
  });
  return validated;
}
