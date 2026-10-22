import test from 'node:test';
import assert from 'node:assert/strict';
import { MysterySession } from '../src/game/education/index.js';
import { syntheticLibrary, syntheticRecord } from './fixtures/education.mjs';

const make = () => new MysterySession({ records: syntheticLibrary() });
const selected = { latitude: -45, longitude: 90 };
test('idle starts with only clue one and cannot advance or submit before start', () => {
  const session = make();
  assert.equal(session.getView().state, 'IDLE');
  assert.equal(session.requestNextClue().accepted, false);
  assert.equal(session.submitSelection(selected).accepted, false);
  assert.equal(session.nextMystery().accepted, false);
  assert.equal(session.start().accepted, true);
  assert.deepEqual(session.getView().clues, [{ number: 1, text: 'Synthetic clue 1' }]);
  assert.equal(session.start().accepted, false);
});
test('clues unlock one at a time and previous clues remain; fifth clue waits indefinitely for action', () => {
  const session = make(); session.start();
  for (let i = 2; i <= 5; i++) {
    assert.equal(session.revealAnswer().reason, 'CLUES_REMAIN');
    assert.equal(session.requestNextClue().accepted, true);
    assert.equal(session.getView().revealedClueCount, i);
    assert.deepEqual(session.getView().clues.map(clue => clue.number), Array.from({ length: i }, (_, n) => n + 1));
  }
  assert.equal(session.getView().state, 'CLUES_ACTIVE');
  assert.equal(session.getView().canRevealAnswer, true);
  assert.equal(session.getView().canSubmit, true);
  assert.equal(session.requestNextClue().reason, 'ALL_CLUES_VISIBLE');
  assert.equal(session.getView().state, 'CLUES_ACTIVE');
});
for (let count = 1; count <= 5; count++) test(`selection accepted at clue level ${count}; duplicates cannot advance`, () => {
  const session = make(); session.start();
  for (let i = 1; i < count; i++) session.requestNextClue();
  const result = session.submitSelection(selected);
  assert.equal(result.accepted, true);
  assert.equal(result.view.state, 'ANSWER_REVEAL');
  assert.deepEqual(result.view.answer.selectedCoordinates, selected);
  assert.equal(result.view.answer.revealedBy, 'selection');
  assert.equal(result.view.answer.explanation, 'Synthetic educational explanation');
  const revision = result.view.revision;
  assert.equal(session.submitSelection(selected).accepted, false);
  assert.equal(session.revealAnswer().accepted, false);
  assert.equal(session.requestNextClue().accepted, false);
  assert.equal(session.getView().revision, revision);
});
test('explicit reveal after five clues has no guessed location and stays for explanation', () => {
  const session = make(); session.start();
  for (let i = 0; i < 4; i++) session.requestNextClue();
  session.revealAnswer();
  assert.equal(session.getView().state, 'ANSWER_REVEAL');
  assert.equal(session.getView().answer.selectedCoordinates, null);
  assert.equal(session.getView().answer.revealedBy, 'requested');
  assert.equal(session.getView().clues.length, 5);
  assert.deepEqual(session.getNavigationTarget(), { latitude: 12.25, longitude: -34.5 });
});
test('all pre-reveal command results and observer views contain no answer metadata or unrevealed clues', () => {
  const session = make(); const seen = [];
  session.subscribe(view => seen.push(view));
  const results = [session.start()];
  for (let i = 0; i < 4; i++) results.push(session.requestNextClue());
  for (const view of [...results.map(result => result.view), ...seen]) {
    assert.equal(Object.hasOwn(view, 'answer'), false);
    assert.equal(Object.hasOwn(view, 'history'), false);
    assert.equal(Object.hasOwn(view, 'sources'), false);
    assert.equal(Object.hasOwn(view, 'category'), false);
    assert.equal(view.clues.length, view.revealedClueCount);
    const serialized = JSON.stringify(view);
    for (const secret of ['Synthetic answer', 'Synthetic target', 'Synthetic educational explanation', 'example.invalid', '12.25', 'Synthetic culture', '仮の回答']) assert.equal(serialized.includes(secret), false);
  }
  assert.equal(JSON.stringify(session), '{}');
  assert.equal(session.getNavigationTarget(), null);
});
test('explicit advancement uses another mystery; exhaustion completes without leaking a target', () => {
  const session = make(); session.start();
  const firstId = session.getView().mysteryId;
  session.submitSelection(selected);
  assert.equal(session.nextMystery().accepted, true);
  assert.notEqual(session.getView().mysteryId, firstId);
  assert.equal(session.getView().revealedClueCount, 1);
  assert.equal(session.getNavigationTarget(), null);
  assert.equal(Object.hasOwn(session.getView(), 'answer'), false);
  session.submitSelection(selected); session.nextMystery();
  assert.equal(session.getView().state, 'COMPLETE');
  assert.equal(session.getNavigationTarget(), null);
  assert.equal(session.getView().clues.length, 0);
  assert.equal(session.nextMystery().accepted, false);
});
test('restart and exit clean state; restart avoids immediate repetition when alternatives exist', () => {
  const session = make(); session.start();
  const firstId = session.getView().mysteryId;
  session.submitSelection(selected); session.restart();
  assert.notEqual(session.getView().mysteryId, firstId);
  assert.equal(session.getView().state, 'CLUES_ACTIVE');
  assert.equal(session.getView().revealedClueCount, 1);
  const beforeExit = session.getView().mysteryId;
  session.exit();
  assert.equal(session.getView().state, 'IDLE');
  assert.equal(session.getView().mysteryId, null);
  assert.equal(session.getView().revealedClueCount, 0);
  assert.equal(session.getNavigationTarget(), null);
  session.start(); assert.notEqual(session.getView().mysteryId, beforeExit);
});
test('single-record library completes rather than automatically repeating', () => {
  const session = new MysterySession({ records: [syntheticRecord()] });
  session.start(); session.submitSelection(selected); session.nextMystery();
  assert.equal(session.getView().state, 'COMPLETE');
});
test('consumer mutation cannot rewrite private content, selections, or reveal snapshots', () => {
  const records = syntheticLibrary(); const session = new MysterySession({ records });
  records[0].answer.identity = 'mutated';
  session.start();
  assert.throws(() => { session.getView().clues.push({ text: 'mutated' }); });
  const coordinates = { ...selected };
  session.submitSelection(coordinates); coordinates.latitude = 80;
  assert.equal(session.getView().answer.identity, 'Synthetic answer');
  assert.deepEqual(session.getView().answer.selectedCoordinates, selected);
  assert.throws(() => { session.getView().answer.target.latitude = 0; });
});
test('invalid selections never leave active clues and stale responses cannot submit into restarted sessions', () => {
  const session = make(); session.start();
  for (const coordinates of [null, { latitude: NaN, longitude: 0 }, { latitude: 0, longitude: 180 }, { latitude: '0', longitude: 0 }, { latitude: 91, longitude: 0 }]) assert.equal(session.submitSelection(coordinates).reason, 'INVALID_COORDINATES');
  const previous = session.getView().revision;
  session.restart();
  assert.equal(session.submitSelection(selected, { expectedRevision: previous }).reason, 'STALE_SELECTION');
  assert.equal(session.getView().state, 'CLUES_ACTIVE');
});
test('authored locale works; incomplete requested locale fails before play', () => {
  const session = new MysterySession({ records: syntheticLibrary(), locale: 'ja' });
  session.start(); assert.equal(session.getView().clues[0].text, '仮の手がかり1');
  assert.throws(() => new MysterySession({ records: syntheticLibrary(), locale: 'fr' }), /LOCALE_UNAVAILABLE/);
});
test('safe observers can unsubscribe; failed observers cannot break state changes', () => {
  const session = make(); let observations = 0;
  const remove = session.subscribe(() => { observations++; });
  session.subscribe(() => { throw new Error('Synthetic observer failure'); });
  assert.equal(session.start().accepted, true);
  assert.equal(observations, 1); remove(); session.requestNextClue(); assert.equal(observations, 1);
});
test('observers cannot recursively advance, exit, or submit and skip player-visible states', () => {
  const session = make(); const rejected = [];
  session.subscribe(() => {
    for (const action of ['start', 'requestNextClue', 'revealAnswer', 'nextMystery', 'restart', 'exit']) rejected.push(session[action]().reason);
    rejected.push(session.submitSelection(selected).reason);
  });
  session.start(); assert.equal(session.getView().state, 'CLUES_ACTIVE');
  session.submitSelection(selected); assert.equal(session.getView().state, 'ANSWER_REVEAL');
  assert.equal(rejected.length, 14);
  assert.equal(rejected.every(reason => reason === 'OBSERVER_DISPATCH'), true);
});
