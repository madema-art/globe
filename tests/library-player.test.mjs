import test from 'node:test';
import assert from 'node:assert/strict';
import { authored, lazyFixture, memoryAdapter } from './fixtures/library.mjs';
import { ProgressRepository } from '../src/game/library/progress.js';
import { LibraryPlayer } from '../src/game/library/player.js';

function setup(items = [authored()]) {
  const fixture = lazyFixture(items), adapter = memoryAdapter(), repository = new ProgressRepository({ adapter, seed: 'fixed' });
  const make = library => new LibraryPlayer({ library: library || fixture.library, repository });
  return { ...fixture, adapter, repository, make, player: make() };
}
test('persistent clue progression resumes after exit; five clues wait for explicit reveal', async () => {
  const { player, make, repository } = setup();
  assert.equal((await player.openNext()).accepted, true);
  assert.equal(player.getNavigationTarget(), null); assert.equal('answer' in player.getView(), false);
  await player.requestNextClue(); player.exit();
  const next = make(); assert.equal((await next.openNext()).reason, 'RESUME_AVAILABLE'); await next.resume();
  assert.equal(next.getView().revealedClueCount, 2); assert.equal((await next.revealAnswer()).accepted, false);
  for (let i = 0; i < 3; i++) await next.requestNextClue();
  assert.equal(next.getView().state, 'CLUES_ACTIVE'); assert.equal(next.getNavigationTarget(), null);
  await next.revealAnswer(); assert.equal(next.getView().state, 'ANSWER_REVEAL');
  assert.equal((await repository.inspect()).entries.m900001.revealed, true);
  await next.continue(); assert.equal((await repository.inspect()).entries.m900001.completed, true);
  assert.equal((await next.openNext()).reason, 'CONTENT_EXHAUSTED');
});
for (let level = 1; level <= 5; level++) test(`persistent player permits confirmation at clue level ${level} without saving accuracy`, async () => {
  const { player, repository } = setup(); await player.openNext();
  for (let i = 1; i < level; i++) await player.requestNextClue();
  assert.equal((await player.submitSelection({ latitude: 1, longitude: 2 })).accepted, true);
  assert.equal(player.getView().state, 'ANSWER_REVEAL');
  const saved = JSON.stringify(await repository.inspect()); assert.equal(saved.includes('latitude'), false); assert.equal(saved.includes('accuracy'), false);
  assert.equal((await player.submitSelection({ latitude: 1, longitude: 2 })).accepted, false);
});
test('save failure exposes no new clue and concurrent opens cannot present duplicates', async () => {
  const { player, make, adapter, repository } = setup([authored(), authored('m900002')]);
  adapter.fail = true; assert.equal((await player.openNext()).reason, 'STORAGE_FAILURE'); assert.equal(player.getView().state, 'IDLE');
  adapter.fail = false; const other = make(); const results = await Promise.all([player.openNext(), other.openNext()]);
  assert.equal(results.filter(value => value.accepted).length, 1); assert.equal(Object.keys((await repository.inspect()).entries).length, 1);
  adapter.fail = true; const count = player.getView().revealedClueCount; await player.requestNextClue(); assert.equal(player.getView().revealedClueCount, count);
});
test('changed or removed pending content requires explicit recovery; presented history survives', async () => {
  const { player, make, repository } = setup(); await player.openNext(); await player.requestNextClue(); player.exit();
  const revised = authored(); revised.canonical.library.contentVersion = 2;
  const updated = make(lazyFixture([revised]).library);
  assert.equal((await updated.resume()).reason, 'CONTENT_REVISION_CHANGED');
  assert.equal((await updated.resume({ acceptRevision: true })).accepted, true); assert.equal(updated.getView().revealedClueCount, 1); updated.exit();
  const removed = make(lazyFixture([]).library); assert.equal((await removed.resume()).reason, 'CONTENT_UNAVAILABLE');
  await removed.archivePending(); assert.equal((await repository.inspect()).entries.m900001.presented, 1);
});
test('stale tabs and overlapping actions cannot unlock two clues from one checkpoint', async () => {
  const { player, make } = setup(); await player.openNext(); const other = make(); await other.resume();
  const results = await Promise.all([player.requestNextClue(), player.requestNextClue()]);
  assert.equal(results.filter(value => value.accepted).length, 1);
  assert.equal((await other.requestNextClue()).reason, 'STALE_SESSION');
});
test('a related record starts without loading its related answer payload', async () => {
  const item = authored(); item.canonical.relatedIds = ['m900002'];
  const { player, reads } = setup([item]);
  assert.equal((await player.openNext()).accepted, true);
  assert.equal(reads.length, 3); assert.equal(reads.some(key => key.includes('m900002')), false);
});
