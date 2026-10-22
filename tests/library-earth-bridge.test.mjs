import test from 'node:test';
import assert from 'node:assert/strict';
import { lazyFixture, memoryAdapter } from './fixtures/library.mjs';
import { LibraryPlayer, ProgressRepository, createLibraryEarthBridge } from '../src/game/library/index.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture(options = {}) {
  const adapter = memoryAdapter(), repository = new ProgressRepository({ adapter, seed: 'bridge-fixture' });
  const player = new LibraryPlayer({ library: lazyFixture().library, repository });
  const targets = [], views = [], errors = [], signals = [];
  const bridge = createLibraryEarthBridge({ player, readCenter: options.readCenter || (() => ({ latitude: 1, longitude: 2 })), navigateTo: (target, { signal }) => { targets.push(target); signals.push(signal); if (options.navigationFails) throw new Error('Private host details'); }, onView: view => views.push(view), onError: error => errors.push(error) });
  return { player, bridge, targets, views, errors, signals, adapter, repository };
}
test('async bridge awaits persistence, exposes only safe views and navigates on committed reveal', async () => {
  const { bridge, views, targets, repository, signals } = fixture();
  await bridge.openNext(); assert.equal(views.length, 1); assert.equal('answer' in views[0], false); assert.equal(targets.length, 0);
  assert.equal((await bridge.confirmSelection()).accepted, true); assert.equal(targets.length, 1);
  assert.equal((await repository.inspect()).entries.m900001.revealed, true);
  await bridge.continue(); assert.equal(signals[0].aborted, true); assert.equal(bridge.getView().state, 'IDLE');
  assert.equal((await bridge.openNext()).reason, 'CONTENT_EXHAUSTED');
});
test('five clues require explicit reveal and navigation failures do not skip explanation', async () => {
  const { bridge, targets, errors } = fixture({ navigationFails: true }); await bridge.openNext();
  for (let i = 0; i < 4; i++) await bridge.requestNextClue();
  assert.equal(targets.length, 0); assert.equal(bridge.getView().state, 'CLUES_ACTIVE');
  await bridge.revealAnswer(); assert.equal(bridge.getView().state, 'ANSWER_REVEAL'); assert.equal(targets.length, 1);
  assert.deepEqual(errors, [{ code: 'NAVIGATION_FAILED' }]);
});
test('exit and resume cancel never-resolving centre picks; late results cannot reveal', async () => {
  const read = deferred(); let signal;
  const { bridge, targets } = fixture({ readCenter: options => { signal = options.signal; return read.promise; } });
  await bridge.openNext(); const confirmation = bridge.confirmSelection();
  assert.equal((await bridge.confirmSelection()).reason, 'SELECTION_PENDING');
  await bridge.exit(); assert.equal(signal.aborted, true); assert.equal((await confirmation).reason, 'STALE_SELECTION');
  await bridge.resume(); read.resolve({ latitude: 3, longitude: 4 }); await Promise.resolve();
  assert.equal(targets.length, 0); assert.equal(bridge.getView().state, 'CLUES_ACTIVE');
});
test('a clue request invalidates a pending read and disposed bridges cannot submit', async () => {
  const { bridge, targets } = fixture({ readCenter: () => new Promise(() => {}) });
  await bridge.openNext(); const pending = bridge.confirmSelection(); await bridge.requestNextClue();
  assert.equal((await pending).reason, 'STALE_SELECTION'); assert.equal(bridge.getView().revealedClueCount, 2);
  const again = bridge.confirmSelection(); await bridge.dispose(); assert.equal((await again).reason, 'DISPOSED');
  assert.equal((await bridge.confirmSelection()).reason, 'DISPOSED'); assert.equal(targets.length, 0);
});
test('exit during a save waits for commit and suppresses stale reveal views and navigation', async () => {
  const { bridge, adapter, views, targets } = fixture(); await bridge.openNext();
  const gate = deferred(), originalWrite = adapter.write;
  adapter.write = async value => { await gate.promise; originalWrite(value); };
  const confirmation = bridge.confirmSelection();
  // Let the centre read and transaction reach the asynchronous save.
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const closing = bridge.exit(); gate.resolve(); await closing; await confirmation;
  assert.equal(views.some(view => view.state === 'ANSWER_REVEAL'), false); assert.equal(targets.length, 0); assert.equal(bridge.getView().state, 'IDLE');
});
test('unavailable centre and failed storage leave the current clue hidden from reveal', async () => {
  const missing = fixture({ readCenter: () => null }); await missing.bridge.openNext();
  assert.equal((await missing.bridge.confirmSelection()).reason, 'CENTER_UNAVAILABLE'); assert.equal(missing.targets.length, 0);
  const { bridge, adapter, targets } = fixture(); await bridge.openNext(); adapter.fail = true;
  assert.equal((await bridge.confirmSelection()).reason, 'STORAGE_FAILURE'); assert.equal(targets.length, 0); assert.equal(bridge.getView().state, 'CLUES_ACTIVE');
});
test('an exit requested by a view observer cannot start stale navigation', async () => {
  const player = new LibraryPlayer({ library: lazyFixture().library, repository: new ProgressRepository({ adapter: memoryAdapter() }) });
  let closing, bridge, navigations = 0;
  bridge = createLibraryEarthBridge({ player, readCenter: () => ({ latitude: 1, longitude: 2 }), navigateTo: () => { navigations++; }, onView: view => { if (view.state === 'ANSWER_REVEAL') closing = bridge.exit(); } });
  await bridge.openNext(); await bridge.confirmSelection(); await closing;
  assert.equal(navigations, 0); assert.equal(bridge.getView().state, 'IDLE');
});
