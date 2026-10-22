import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { authored, memoryAdapter } from './fixtures/library.mjs';
import { auditLibrary, safeReport, publishLibrary, readJson } from '../scripts/content/pipeline.mjs';
import { validateCatalog, LazyMysteryLibrary, LibraryPlayer, ProgressRepository, createBrowserProgressAdapter, encodeProgress, emptyProgress } from '../src/game/library/index.js';

async function fixture(t) {
  await mkdir('work', { recursive: true }); const root = await mkdtemp(path.resolve('work/channel-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'source'), output = path.join(root, 'output'), item = authored();
  for (const [relative, data] of [['manifest.json', { schemaVersion: 1, ids: [item.canonical.id], locales: ['ja', 'en'] }], ['records/m900001.json', item.canonical], ['locales/en/m900001.json', item.translations.en]]) {
    const file = path.join(directory, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(data));
  }
  return { directory, output, item };
}
test('development export needs explicit enablement and cannot change the production pointer or attestations', async t => {
  const { directory, output } = await fixture(t);
  const production = await publishLibrary(directory, output), before = await readFile(path.join(output, 'current.json'), 'utf8');
  await assert.rejects(() => publishLibrary(directory, output, { channel: 'development' }), { message: 'DEVELOPMENT_CONTENT_DISABLED' });
  const development = await publishLibrary(directory, output, { channel: 'development', enableDevelopment: true });
  assert.equal(production.published, 0); assert.equal(development.published, 1); assert.equal(development.provisional, true);
  assert.equal(await readFile(path.join(output, 'current.json'), 'utf8'), before);
  const stored = await readJson(path.join(directory, 'records/m900001.json'));
  assert.equal(stored.library.publication.approved, false); assert.equal(stored.library.publication.reviewer, null);
});
test('default runtime rejects development catalogs; explicit opt-in loads provisional content lazily', async t => {
  const { directory, output } = await fixture(t);
  const release = await publishLibrary(directory, output, { channel: 'development', enableDevelopment: true });
  const root = path.join(output, 'development/releases', release.version), catalog = await readJson(path.join(root, 'catalog.json'));
  assert.equal(catalog.entries[0].approved, false);
  assert.throws(() => validateCatalog(catalog), { code: 'DEVELOPMENT_CONTENT_DISABLED' });
  const readJsonFile = file => readJson(path.join(root, file));
  assert.throws(() => new LazyMysteryLibrary({ catalog, readJson: readJsonFile }), { code: 'DEVELOPMENT_CONTENT_DISABLED' });
  let count = 0; const library = new LazyMysteryLibrary({ catalog, allowDevelopment: true, readJson: file => { count++; return readJsonFile(file); } });
  assert.equal(count, 0);
  assert.throws(() => new LibraryPlayer({ library, repository: new ProgressRepository({ adapter: memoryAdapter() }) }), { code: 'CONTENT_PROGRESS_CHANNEL_MISMATCH' });
  const player = new LibraryPlayer({ library, repository: new ProgressRepository({ adapter: memoryAdapter(), seed: 'synthetic', channel: 'development' }) });
  assert.equal((await player.openNext()).accepted, true); assert.equal(count, 3); assert.equal('answer' in player.getView(), false);
  assert.equal(player.getView().contentChannel, 'development'); assert.equal(player.getView().provisional, true);
  const disguised = { ...catalog, channel: 'production' };
  assert.throws(() => validateCatalog(disguised, { allowDevelopment: true }), { code: 'INVALID_CATALOG' });
});
test('development progress uses a separate browser key and rejects cross-channel imports', async () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const locks = { request: async (_key, operation) => operation() };
  const production = new ProgressRepository({ adapter: createBrowserProgressAdapter({ storage, locks }), seed: 'stable' });
  const development = new ProgressRepository({ adapter: createBrowserProgressAdapter({ storage, locks, channel: 'development' }), channel: 'development', seed: 'internal' });
  await production.transaction(saved => { saved.sequence = 12; }); await development.transaction(saved => { saved.sequence = 4; });
  assert.equal((await production.inspect()).sequence, 12); assert.equal((await development.inspect()).sequence, 4);
  await assert.rejects(() => production.transaction(saved => { Object.assign(saved, emptyProgress('wrong-import', 'development')); }), { code: 'CONTENT_PROGRESS_CHANNEL_MISMATCH' });
  assert.equal((await production.inspect()).sequence, 12);
  const adapter = memoryAdapter(); adapter.corrupt(encodeProgress(emptyProgress('internal', 'development')));
  const wrong = new ProgressRepository({ adapter }); await assert.rejects(() => wrong.inspect(), { code: 'CONTENT_PROGRESS_CHANNEL_MISMATCH' });
  assert.equal(values.size, 2);
});
test('unfinished drafts never enter development exports', async t => {
  const { directory, output, item } = await fixture(t);
  item.canonical.editorial.reviewStatus = 'draft'; item.canonical.editorial.clueOrderReviewed = false;
  await writeFile(path.join(directory, 'records/m900001.json'), JSON.stringify(item.canonical));
  assert.equal((await publishLibrary(directory, output, { channel: 'development', enableDevelopment: true })).published, 0);
});
test('all 27 original canonical and localization files retain their committed bytes', async () => {
  const expected = await readJson('tests/fixtures/original-library-digests.json'); assert.equal(Object.keys(expected).length, 54);
  for (const [relative, digest] of Object.entries(expected)) {
    // Git can expand LF to CRLF on checkout; compare the committed text form.
    const bytes = (await readFile(path.join('content/library/research', relative), 'utf8')).replace(/\r\n/g, '\n');
    const actual = createHash('sha256').update(bytes).digest('hex');
    assert.equal(actual === digest, true, 'Original content bytes changed');
  }
});
test('the entire provisional collection supports lazy five-clue gameplay and durable exhaustion', async t => {
  const { output } = await fixture(t);
  const release = await publishLibrary('content/library/research', output, { channel: 'development', enableDevelopment: true });
  const root = path.join(output, 'development/releases', release.version), catalog = await readJson(path.join(root, 'catalog.json'));
  const library = new LazyMysteryLibrary({ catalog, allowDevelopment: true, readJson: relative => readJson(path.join(root, relative)) });
  const repository = new ProgressRepository({ adapter: memoryAdapter(), channel: 'development', seed: 'full-collection' });
  const player = new LibraryPlayer({ library, repository }), seen = new Set();
  for (let i = 0; i < release.published; i++) {
    const opened = await player.openNext(); assert.equal(opened.accepted, true);
    const view = player.getView(); assert.equal(seen.has(view.mysteryId), false); seen.add(view.mysteryId);
    assert.equal('answer' in view, false); assert.equal(player.getNavigationTarget(), null);
    for (let n = 0; n < 4; n++) assert.equal((await player.requestNextClue()).accepted, true);
    assert.equal(player.getView().state, 'CLUES_ACTIVE');
    assert.equal((await player.revealAnswer()).accepted, true); assert.equal(player.getView().state, 'ANSWER_REVEAL');
    assert.equal((await player.continue()).accepted, true);
  }
  assert.equal(seen.size, release.published); assert.equal((await player.openNext()).reason, 'CONTENT_EXHAUSTED');
  const reopened = new LibraryPlayer({ library, repository }); assert.equal((await reopened.openNext()).reason, 'CONTENT_EXHAUSTED');
});
test('the expansion adds at least 20 sourced geography records without changing history totals', async () => {
  const audit = await auditLibrary('content/library/research'), report = safeReport(audit);
  assert.equal(audit.failures.length, 0); assert.equal(report.mysteries >= 47, true); assert.equal(report.kinds.history, 22); assert.equal(report.kinds.geography >= 25, true);
  assert.equal(report.clues, report.mysteries * 5); assert.equal(report.approved, 0);
  assert.equal(report.warnings.POTENTIAL_ANSWER_LEAK || 0, 0);
});
