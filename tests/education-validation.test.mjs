import test from 'node:test';
import assert from 'node:assert/strict';
import { ContentValidationError, validateMystery, validateLibrary, validateCoordinates, validateHistoricalDate, historicalYearOrder, CATEGORIES } from '../src/game/education/index.js';
import { syntheticRecord } from './fixtures/education.mjs';

const invalid = mutate => {
  const value = syntheticRecord(); mutate(value);
  assert.throws(() => validateMystery(value), ContentValidationError);
};
test('a record must have exactly five independently sourced ordered clues in every locale', () => {
  for (const length of [0, 1, 4, 6]) {
    invalid(record => { record.clues = Array.from({ length }, (_, i) => ({ text: `Synthetic ${i}`, sourceIds: ['r1'] })); });
    invalid(record => { record.localizations.en.clues = Array.from({ length }, (_, i) => `Synthetic ${i}`); });
  }
  invalid(record => { record.clues[0].text = ''; });
  invalid(record => { record.clues[0].sourceIds = ['r2']; });
  invalid(record => { record.clues[1] = record.clues[0]; });
  invalid(record => { record.editorial.clueOrderReviewed = false; });
});
test('missing fields and unexpected fields fail without dumping content values', () => {
  for (const field of Object.keys(syntheticRecord()).filter(key => !['relatedIds', 'localizations'].includes(key))) invalid(record => { delete record[field]; });
  invalid(record => { record.accidentalAnswer = 'Synthetic private field'; });
  invalid(record => { record.answer.target.extra = true; });
  const record = syntheticRecord(); record.answer.identity = 'DO_NOT_LOG_SYNTHETIC_VALUE'; record.answer.target.latitude = 100;
  try { validateMystery(record); assert.fail('Expected validation failure'); }
  catch (error) { assert.ok(error instanceof ContentValidationError); assert.equal(String(error).includes('DO_NOT_LOG_SYNTHETIC_VALUE'), false); }
});
test('coordinates enforce finite numeric WGS84 degrees, poles, and a single antimeridian convention', () => {
  for (const latitude of [-90, 0, 90]) for (const longitude of [-180, 0, 179.999]) assert.deepEqual(validateCoordinates({ latitude, longitude }), { latitude, longitude });
  for (const value of [undefined, {}, { latitude: Infinity, longitude: 0 }, { latitude: 0, longitude: NaN }, { latitude: -91, longitude: 0 }, { latitude: 0, longitude: -181 }, { latitude: 0, longitude: 180 }, { latitude: '0', longitude: 0 }]) assert.throws(() => validateCoordinates(value), ContentValidationError);
  invalid(record => { record.answer.target.referenceFrame = 'unspecified'; });
  invalid(record => { record.answer.target.kind = 'region'; });
});
test('BCE, CE, approximate years and multi-century periods use explicit era/year records', () => {
  const record = syntheticRecord(); validateHistoricalDate(record.history.date);
  assert.ok(historicalYearOrder({ year: 2000, era: 'BCE' }) < historicalYearOrder({ year: 100, era: 'BCE' }));
  assert.equal(historicalYearOrder({ year: 1, era: 'BCE' }), 0);
  assert.equal(historicalYearOrder({ year: 1, era: 'CE' }), 1);
  assert.doesNotThrow(() => validateHistoricalDate({ kind: 'year', label: 'Synthetic approximate year', at: { year: 1500, era: 'BCE', approximate: true } }));
  assert.doesNotThrow(() => validateHistoricalDate({ ...record.history.date, kind: 'period' }));
  for (const bad of [{ ...record.history.date, start: { year: 0, era: 'BCE', approximate: true } }, { ...record.history.date, start: { year: -5, era: 'CE', approximate: true } }, { ...record.history.date, end: { year: 2000, era: 'BCE', approximate: true } }, { kind: 'year', label: 'Synthetic', at: { year: 100, era: 'AD', approximate: false } }, new Date(0)]) assert.throws(() => validateHistoricalDate(bad), ContentValidationError);
});
test('every category is supported without assuming a birthplace or a specific target type beyond point', () => {
  for (const category of CATEGORIES) {
    const record = syntheticRecord(); record.category = category;
    assert.equal(validateMystery(record).category, category);
  }
  invalid(record => { record.category = 'unsupported'; });
});
test('neutral identifiers, unique records, valid relationships, sources and localization are required', () => {
  invalid(record => { record.id = 'descriptive-answer-name'; });
  invalid(record => { record.relatedIds = [record.id]; });
  invalid(record => { record.sources.push(record.sources[0]); });
  invalid(record => { record.sources[0].url = 'javascript:void(0)'; });
  invalid(record => { record.sources[0].accessedOn = '2026-02-30'; });
  invalid(record => { record.localizations.en.clues = null; });
  invalid(record => { record.localizations.en.identity = ''; });
  assert.throws(() => validateLibrary([]), ContentValidationError);
  assert.throws(() => validateLibrary([syntheticRecord(), syntheticRecord()]), ContentValidationError);
  const record = syntheticRecord(); record.relatedIds = ['m900099'];
  assert.throws(() => validateLibrary([record]), ContentValidationError);
});
test('literal answer identity in either authored or localized clues fails a conservative editorial lint', () => {
  invalid(record => { record.clues[4].text += record.answer.identity; });
  invalid(record => { record.localizations.en.clues[4] += record.localizations.en.identity.toUpperCase(); });
});
