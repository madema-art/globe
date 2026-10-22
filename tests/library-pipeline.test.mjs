import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { authored } from './fixtures/library.mjs';
import { auditLibrary, safeReport, publishLibrary, approvalDigest, readJson, stageDraft } from '../scripts/content/pipeline.mjs';
import { validateMystery } from '../src/game/education/validation.js';

async function workspace(t, items = [authored()]) {
  const parent = path.resolve('work'); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'pipeline-')); t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'research'), output = path.join(root, 'release');
  const save = async (relative, value) => { const file = path.join(directory, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value)); };
  await save('manifest.json', { schemaVersion: 1, ids: items.map(item => item.canonical.id), locales: ['ja', 'en'] });
  for (const item of items) { await save(`records/${item.canonical.id}.json`, item.canonical); await save(`locales/en/${item.canonical.id}.json`, item.translations.en); }
  return { root, directory, output, save };
}
function approve(item) {
  item.canonical.editorial.reviewStatus = 'reviewed';
  item.canonical.library.publication = { approved: true, reviewer: 'Synthetic reviewer', approvedDigest: approvalDigest(item.canonical, item.translations) };
}
test('publication excludes source-checked work; explicit approval binds canonical and locale bytes', async t => {
  const item = authored(), { directory, output, save } = await workspace(t, [item]);
  assert.equal((await publishLibrary(directory, output)).published, 0);
  approve(item); await save('records/m900001.json', item.canonical);
  const published = await publishLibrary(directory, output); assert.equal(published.published, 1);
  const catalog = await readJson(path.join(output, 'releases', published.version, 'catalog.json'));
  const text = JSON.stringify(catalog); assert.equal(text.includes('identity'), false); assert.equal(text.includes('latitude'), false); assert.equal(text.includes('clues'), false);
  item.translations.en.explanation += ' Synthetic change'; await save('locales/en/m900001.json', item.translations.en);
  assert.equal((await auditLibrary(directory)).failures.length, 1);
  await assert.rejects(() => publishLibrary(directory, output));
  assert.equal((await readJson(path.join(output, 'current.json'))).version, published.version);
});
test('changed content requires a version bump and failed publication preserves the current release', async t => {
  const item = authored(); approve(item); const { directory, output, save } = await workspace(t, [item]);
  const first = await publishLibrary(directory, output);
  item.translations.en.explanation += ' Revised synthetic explanation'; approve(item);
  await save('records/m900001.json', item.canonical); await save('locales/en/m900001.json', item.translations.en);
  await assert.rejects(() => publishLibrary(directory, output), { message: 'CONTENT_VERSION_MUST_INCREASE' });
  assert.equal((await readJson(path.join(output, 'current.json'))).version, first.version);
  item.canonical.library.contentVersion++; approve(item); await save('records/m900001.json', item.canonical);
  assert.equal((await publishLibrary(directory, output)).published, 1);
});
test('audit rejects duplicate IDs, missing locales, incorrect source links and invalid clue counts', async t => {
  const item = authored(), { directory, save } = await workspace(t, [item]);
  await save('manifest.json', { schemaVersion: 1, ids: ['m900001', 'm900001'], locales: ['ja', 'en'] });
  await assert.rejects(() => auditLibrary(directory), { message: 'DUPLICATE_OR_INVALID_ID' });
  await save('manifest.json', { schemaVersion: 1, ids: ['m900001'], locales: ['ja', 'en'] });
  item.canonical.clues[0].sourceIds = ['missing']; await save('records/m900001.json', item.canonical);
  assert.equal((await auditLibrary(directory)).failures.length, 1);
  const fresh = authored(); fresh.canonical.clues.pop(); assert.throws(() => validateMystery(fresh.canonical));
  await save('records/m900001.json', authored().canonical); await rm(path.join(directory, 'locales/en/m900001.json'));
  assert.equal((await auditLibrary(directory)).failures.length, 1);
});
test('heuristics flag shared destinations, overlapping subjects and repeated clue wording', async t => {
  const first = authored(), second = authored('m900002');
  second.canonical.library.destinationKey = first.canonical.library.destinationKey;
  second.canonical.library.subjectKeys = first.canonical.library.subjectKeys;
  const { directory } = await workspace(t, [first, second]);
  const audit = await auditLibrary(directory), codes = new Set(audit.warnings.map(item => item.code));
  for (const code of ['SHARED_DESTINATION', 'OVERLAPPING_SUBJECT', 'SIMILAR_CLUE_WORDING']) assert.equal(codes.has(code), true);
  const report = JSON.stringify(safeReport(audit)); assert.equal(report.includes('Synthetic clue'), false); assert.equal(report.includes('m900001'), false);
});
test('potential answer leakage blocks approval publication without logging clue text', async t => {
  const item = authored(); item.translations.en.identity = 'Hidden Synthetic Subject';
  item.translations.en.clues[0] = 'Hidden and Synthetic Subject are deliberately placed in this fixture.'; approve(item);
  const { directory, output } = await workspace(t, [item]);
  assert.equal((await auditLibrary(directory)).warnings.some(item => item.code === 'POTENTIAL_ANSWER_LEAK'), true);
  await assert.rejects(() => publishLibrary(directory, output), { message: 'ANSWER_LEAK_REVIEW_REQUIRED' });
});
test('finished drafts stage incrementally, cannot overwrite IDs and remain unapproved', async t => {
  const { directory, root } = await workspace(t), item = authored('m900002'), drafts = path.join(root, 'drafts');
  await mkdir(path.join(drafts, 'locales/en'), { recursive: true });
  await writeFile(path.join(drafts, 'm900002.json'), JSON.stringify(item.canonical));
  await writeFile(path.join(drafts, 'locales/en/m900002.json'), JSON.stringify(item.translations.en));
  assert.equal((await stageDraft(directory, drafts, 'm900002')).staged, 1);
  const audit = await auditLibrary(directory); assert.equal(audit.records.length, 2); assert.equal(safeReport(audit).approved, 0);
  await assert.rejects(() => stageDraft(directory, drafts, 'm900002'), { message: 'DUPLICATE_ID' });
});
test('withdrawal and reintroduction retain publication version history', async t => {
  const item = authored(); approve(item); const { directory, output, save } = await workspace(t, [item]);
  await publishLibrary(directory, output);
  item.canonical.library.publication = { approved: false, reviewer: null, approvedDigest: null };
  await save('records/m900001.json', item.canonical); assert.equal((await publishLibrary(directory, output)).published, 0);
  item.translations.en.explanation += ' Changed after withdrawal'; approve(item);
  await save('records/m900001.json', item.canonical); await save('locales/en/m900001.json', item.translations.en);
  await assert.rejects(() => publishLibrary(directory, output), { message: 'CONTENT_VERSION_MUST_INCREASE' });
});
test('research pilot validates with five clues per record and reports only aggregates', async () => {
  // Never assert against full authored objects: assertion failure output must remain spoiler-free.
  const audit = await auditLibrary(path.resolve('content/library/research')), report = safeReport(audit);
  assert.equal(audit.failures.length, 0); assert.equal(report.mysteries >= 25, true);
  assert.equal(report.clues, report.mysteries * 5); assert.equal(report.approved, 0);
  assert.equal(Object.keys(report.regions).length >= 10, true); assert.equal(Object.keys(report.eras).length >= 6, true);
});
