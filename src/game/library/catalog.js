import { ContentValidationError } from '../education/validation.js';

export const idPattern = /^m\d{6}$/;
const token = /^[a-z0-9][a-z0-9-]{0,63}$/;
export function validateCatalog(value, { allowDevelopment = false } = {}) {
  const bad = () => { throw new ContentValidationError('catalog', 'INVALID_CATALOG'); };
  if (!value || value.schemaVersion !== 1 || typeof value.version !== 'string' || !Array.isArray(value.entries)) bad();
  const channel = value.channel === undefined ? 'production' : value.channel;
  if (!['production', 'development'].includes(channel)) bad();
  if (channel === 'development' && !allowDevelopment) throw new ContentValidationError('catalog', 'DEVELOPMENT_CONTENT_DISABLED');
  const ids = new Set(); const aliases = new Set();
  for (const entry of value.entries) {
    if (!entry || !idPattern.test(entry.id) || ids.has(entry.id) || !Number.isSafeInteger(entry.contentVersion) || entry.contentVersion < 1 || typeof entry.approved !== 'boolean' || (channel === 'production' && !entry.approved)) bad();
    if (channel === 'development' && !['source-checked', 'source-checked-sample', 'reviewed'].includes(entry.reviewStatus)) bad();
    ids.add(entry.id);
    for (const field of ['category', 'region', 'era', 'countryGroup', 'destinationKey']) if (!token.test(entry[field])) bad();
    if (!['history', 'geography'].includes(entry.kind)) bad();
    for (const field of ['cultures', 'themes', 'subjectKeys']) if (!Array.isArray(entry[field]) || entry[field].some(item => !token.test(item))) bad();
    if (!Array.isArray(entry.relatedIds) || entry.relatedIds.some(id => !idPattern.test(id))) bad();
    if (!Array.isArray(entry.aliases) || entry.aliases.some(id => !idPattern.test(id) || aliases.has(id))) bad();
    entry.aliases.forEach(id => aliases.add(id));
    if (typeof entry.digest !== 'string' || !/^[a-f0-9]{64}$/.test(entry.digest)) bad();
  }
  if ([...aliases].some(id => ids.has(id))) bad();
  return structuredClone(value);
}
export function catalogMap(catalog) { return new Map(catalog.entries.map(entry => [entry.id, entry])); }
export function aliasesFor(catalog) {
  const aliases = new Map();
  for (const entry of catalog.entries) for (const oldId of entry.aliases) aliases.set(oldId, entry.id);
  return aliases;
}
export function reconcileProgress(progress, catalog) {
  const next = structuredClone(progress);
  for (const [oldId, newId] of aliasesFor(catalog)) {
    if (!next.entries[oldId] || next.aliasesApplied.includes(oldId)) continue;
    const old = next.entries[oldId], current = next.entries[newId];
    next.entries[newId] = {
      presented: (current?.presented || 0) + old.presented,
      revealed: Boolean(current?.revealed || old.revealed), completed: Boolean(current?.completed || old.completed),
      lastPresented: Math.max(current?.lastPresented || 0, old.lastPresented),
      contentVersion: Math.max(current?.contentVersion || 0, old.contentVersion),
    };
    // Old IDs remain tombstones so removing/reintroducing records never erases history.
    if (!next.aliasesApplied.includes(oldId)) next.aliasesApplied.push(oldId);
    if (next.active?.id === oldId) next.active.id = newId;
  }
  return next;
}

export function stableRank(seed, id) {
  let value = 2166136261;
  for (const c of `${seed}:${id}`) { value ^= c.charCodeAt(0); value = Math.imul(value, 16777619); }
  return value >>> 0;
}
export const DEFAULT_DIVERSITY = Object.freeze({ window: 6, region: 5, era: 4, category: 3, kind: 4, destination: 24, related: 24, subject: 16, country: 2, culture: 2, theme: 1, maxRegionRun: 2, maxEraRun: 3, maxCategoryRun: 2, maxKindRun: 2 });
export function selectNext(catalog, progress, configuration = {}) {
  const rules = { ...DEFAULT_DIVERSITY, ...configuration };
  for (const [key, value] of Object.entries(rules)) if (!(key in DEFAULT_DIVERSITY) || !Number.isFinite(value) || value < 0 || ((key === 'window' || key.startsWith('max')) && (!Number.isInteger(value) || (key === 'window' && value < 1)))) throw new TypeError('Invalid diversity configuration.');
  const recent = progress.recent.slice(-rules.window).reverse();
  let unseen = catalog.entries.filter(entry => !progress.entries[entry.id]?.presented);
  if (!unseen.length) return { state: progress.active ? 'RESUME_AVAILABLE' : catalog.entries.length ? 'CONTENT_EXHAUSTED' : 'NO_APPROVED_CONTENT', entry: null };
  const prefer = predicate => { const alternatives = unseen.filter(predicate); if (alternatives.length) unseen = alternatives; };
  const last = recent[0];
  if (last) prefer(entry => entry.destinationKey !== last.destinationKey && !entry.subjectKeys.some(key => last.subjectKeys.includes(key)) && !entry.relatedIds.includes(last.id) && !last.relatedIds.includes(entry.id));
  for (const [field, maximum] of [['region', rules.maxRegionRun], ['era', rules.maxEraRun], ['category', rules.maxCategoryRun], ['kind', rules.maxKindRun]]) {
    if (last && maximum > 0 && recent.length >= maximum && recent.slice(0, maximum).every(item => item[field] === last[field]) && last[field] !== 'not-applicable') prefer(entry => entry[field] !== last[field]);
  }
  const cost = entry => recent.reduce((sum, item, index) => {
    let penalty = 0;
    if (entry.region === item.region) penalty += rules.region;
    if (entry.era === item.era && entry.era !== 'not-applicable') penalty += rules.era;
    if (entry.category === item.category) penalty += rules.category;
    if (entry.kind === item.kind) penalty += rules.kind;
    if (entry.destinationKey === item.destinationKey) penalty += rules.destination;
    if (entry.relatedIds.includes(item.id) || item.relatedIds.includes(entry.id)) penalty += rules.related;
    if (entry.subjectKeys.some(key => item.subjectKeys.includes(key))) penalty += rules.subject;
    if (entry.countryGroup === item.countryGroup) penalty += rules.country;
    if (entry.cultures.some(key => item.cultures.includes(key))) penalty += rules.culture;
    if (entry.themes.some(key => item.themes.includes(key))) penalty += rules.theme;
    return sum + penalty / (index + 1);
  }, 0);
  let best = null, bestCost = Infinity, rank = Infinity;
  for (const entry of unseen) {
    const score = cost(entry), candidateRank = stableRank(progress.seed, entry.id);
    if (score < bestCost || (score === bestCost && (candidateRank < rank || (candidateRank === rank && entry.id < best.id)))) { best = entry; bestCost = score; rank = candidateRank; }
  }
  return { state: 'AVAILABLE', entry: structuredClone(best) };
}
