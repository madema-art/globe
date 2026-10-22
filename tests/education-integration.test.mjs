import test from 'node:test';
import assert from 'node:assert/strict';
import { MysterySession, createEducationEarthBridge, createConfirmationInput, XBOX_X_BINDING } from '../src/game/education/index.js';
import { syntheticLibrary } from './fixtures/education.mjs';

const coordinates = { latitude: -20, longitude: 45 };
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const session = () => { const result = new MysterySession({ records: syntheticLibrary() }); result.start(); return result; };
const key = (extra = {}) => ({ code: 'KeyX', repeat: false, ...extra });
const pad = (pressed, extra = {}) => ({ index: 0, id: 'synthetic-controller', connected: true, mapping: 'standard', buttons: [{}, {}, { pressed }], ...extra });

test('keyboard X finalizes center coordinates once, then requests navigation only during reveal', async () => {
  const game = session(); let reads = 0; const navigation = [];
  const bridge = createEducationEarthBridge({ session: game, readCenter: () => { reads++; return coordinates; }, navigateTo: (target, options) => navigation.push({ target, signal: options.signal }) });
  const input = createConfirmationInput({ confirm: () => bridge.confirmSelection() });
  assert.equal(navigation.length, 0);
  assert.equal(input.keyDown(key()), true);
  assert.equal(input.keyDown(key({ repeat: true })), false);
  assert.equal(input.keyDown(key()), false);
  await tick();
  assert.equal(reads, 1);
  assert.equal(game.getView().state, 'ANSWER_REVEAL');
  assert.deepEqual(game.getView().answer.selectedCoordinates, coordinates);
  assert.equal(navigation.length, 1);
  assert.deepEqual(navigation[0].target, game.getNavigationTarget());
  assert.equal(navigation[0].signal.aborted, false);
  assert.equal(game.submitSelection(coordinates).accepted, false);
  game.nextMystery(); assert.equal(navigation[0].signal.aborted, true);
  bridge.dispose(); input.dispose();
});
test('next, restart, or exit invalidates pending center picks; duplicate async confirmations coalesce', async () => {
  for (const action of ['restart', 'exit', 'nextMystery']) {
    const game = session(); let resolve; let navigations = 0;
    const bridge = createEducationEarthBridge({ session: game, readCenter: () => new Promise(done => { resolve = done; }), navigateTo: () => { navigations++; } });
    const pending = bridge.confirmSelection();
    assert.equal((await bridge.confirmSelection()).reason, 'SELECTION_PENDING');
    if (action === 'nextMystery') game.submitSelection(coordinates);
    game[action](); resolve(coordinates);
    assert.equal((await pending).reason, 'STALE_SELECTION');
    assert.equal(navigations, action === 'nextMystery' ? 1 : 0);
    bridge.dispose();
  }
});
test('explicit answer request drives navigation once; exit/dispose aborts optional animation', () => {
  const game = session(); const calls = [];
  const bridge = createEducationEarthBridge({ session: game, readCenter: () => coordinates, navigateTo: (target, options) => calls.push({ target, ...options }) });
  for (let i = 0; i < 4; i++) game.requestNextClue();
  assert.equal(calls.length, 0); game.revealAnswer(); assert.equal(calls.length, 1);
  game.revealAnswer(); assert.equal(calls.length, 1);
  game.exit(); assert.equal(calls[0].signal.aborted, true);
  bridge.dispose();
});
test('bad or unavailable center does not reveal; navigation failure does not skip explanation', async () => {
  const game = session(); let center = null; const errors = [];
  const bridge = createEducationEarthBridge({ session: game, readCenter: () => { if (center === 'reject') throw new Error('Synthetic private diagnostic'); return center; }, navigateTo: () => { throw new Error('Synthetic navigation detail'); }, onError: error => errors.push(error) });
  assert.equal((await bridge.confirmSelection()).reason, 'INVALID_COORDINATES');
  center = 'reject'; assert.equal((await bridge.confirmSelection()).reason, 'CENTER_UNAVAILABLE');
  center = coordinates; await bridge.confirmSelection();
  assert.equal(game.getView().state, 'ANSWER_REVEAL');
  assert.deepEqual(errors, [{ code: 'CENTER_UNAVAILABLE' }, { code: 'NAVIGATION_FAILED' }]);
  bridge.dispose();
});
test('disposed bridge cannot submit a delayed pick or start future navigation', async () => {
  const game = session(); let resolve; let navigations = 0;
  const bridge = createEducationEarthBridge({ session: game, readCenter: () => new Promise(done => { resolve = done; }), navigateTo: () => navigations++ });
  const pending = bridge.confirmSelection(); bridge.dispose(); resolve(coordinates);
  assert.equal((await pending).reason, 'DISPOSED');
  game.submitSelection(coordinates); assert.equal(navigations, 0);
});
test('restart cancels an unresolved pick and permits a new confirmation immediately', async () => {
  const game = session(); let reads = 0; let oldSignal;
  const bridge = createEducationEarthBridge({ session: game, readCenter: ({ signal }) => {
    reads++;
    if (reads === 1) { oldSignal = signal; return new Promise(() => {}); }
    return coordinates;
  }, navigateTo: () => {} });
  const pending = bridge.confirmSelection(); game.restart();
  assert.equal((await pending).reason, 'STALE_SELECTION');
  assert.equal(oldSignal.aborted, true);
  assert.equal((await bridge.confirmSelection()).accepted, true);
  assert.equal(game.getView().state, 'ANSWER_REVEAL');
  bridge.dispose();
});
test('keyboard adapter respects release edges, text editing, modifiers, enabling, and configurable codes', async () => {
  let calls = 0; let enabled = true;
  const input = createConfirmationInput({ confirm: () => { calls++; }, isEnabled: () => enabled });
  assert.equal(input.keyDown(key({ target: { tagName: 'INPUT' } })), false);
  input.keyUp(key());
  assert.equal(input.keyDown(key({ ctrlKey: true })), false); input.keyUp(key());
  enabled = false; assert.equal(input.keyDown(key()), false); input.keyUp(key());
  enabled = true; assert.equal(input.keyDown(key()), true); await tick();
  assert.equal(input.keyDown(key()), false); input.keyUp(key());
  assert.equal(input.keyDown(key()), true); await tick();
  input.configure({ keyboardCode: 'Enter', gamepad: null });
  assert.equal(input.keyDown(key()), false);
  assert.equal(input.keyDown(key({ code: 'Enter' })), true); await tick();
  assert.equal(calls, 3);
  input.dispose(); assert.equal(input.keyDown(key({ code: 'Enter' })), false);
});
test('controllers require explicit labels/mappings; held, newly connected, or unmapped buttons cannot repeat', async () => {
  let calls = 0;
  const input = createConfirmationInput({ confirm: () => { calls++; }, gamepad: XBOX_X_BINDING });
  assert.match(input.getBindings().gamepad.label, /Xbox/);
  input.pollGamepads([pad(true)]); await tick(); assert.equal(calls, 0);
  input.pollGamepads([pad(false)]);
  input.pollGamepads([pad(true)]); await tick(); assert.equal(calls, 1);
  input.pollGamepads([pad(true)]); await tick(); assert.equal(calls, 1);
  input.pollGamepads([]); input.pollGamepads([pad(true)]); await tick(); assert.equal(calls, 1);
  input.pollGamepads([pad(false, { mapping: '' })]); input.pollGamepads([pad(true, { mapping: '' })]); assert.equal(calls, 1);
  input.configure({ keyboardCode: 'KeyX', gamepad: { buttonIndex: 0, mapping: 'standard', label: 'Custom controller bottom button' } });
  input.pollGamepads([pad(false, { buttons: [{ pressed: false }] })]);
  input.pollGamepads([pad(false, { buttons: [{ pressed: true }] })]); await tick(); assert.equal(calls, 2);
  assert.throws(() => input.configure({ keyboardCode: 'KeyX', gamepad: { buttonIndex: 0 } }), TypeError);
  input.dispose();
});
test('async input errors are sanitized and a pending confirmation suppresses other devices', async () => {
  let resolve; let calls = 0; const errors = [];
  const input = createConfirmationInput({ confirm: () => { calls++; return new Promise(done => { resolve = done; }); }, gamepad: XBOX_X_BINDING, onError: error => errors.push(error) });
  input.pollGamepads([pad(false)]); input.keyDown(key()); input.pollGamepads([pad(true)]);
  assert.equal(calls, 1); resolve(); await tick();
  input.dispose();
  const rejected = createConfirmationInput({ confirm: async () => { throw new Error('Synthetic secret'); }, onError: error => errors.push(error) });
  rejected.keyDown(key()); await tick();
  assert.deepEqual(errors, [{ code: 'CONFIRMATION_FAILED' }]); rejected.dispose();
});
test('keyboard listeners are detached on disposal', async () => {
  const target = new EventTarget(); let calls = 0;
  const input = createConfirmationInput({ confirm: () => { calls++; } });
  input.attachKeyboard(target);
  const event = () => Object.assign(new Event('keydown'), { code: 'KeyX', repeat: false });
  target.dispatchEvent(event()); await tick(); assert.equal(calls, 1);
  target.dispatchEvent(new Event('blur')); target.dispatchEvent(event()); await tick(); assert.equal(calls, 2);
  input.dispose(); target.dispatchEvent(event()); await tick(); assert.equal(calls, 2);
});
