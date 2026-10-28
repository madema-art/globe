import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DETAIL_LEVELS, fadeAt, detailLevelAt } from '../src/earth/overlays/levels.js';
import { shapeStick, shapeAxis, createGamepadNavigation, DEFAULT_GAMEPAD_BINDINGS } from '../src/earth/gamepad-navigation.js';
import { decodePolylines } from '../src/earth/overlays/polyline-layer.js';

test('detail levels: planetary view shows nothing, fades are smooth and ordered', () => {
  assert.equal(detailLevelAt(2.9), 1);
  assert.equal(detailLevelAt(1.2), 2);
  assert.equal(detailLevelAt(0.7), 3);
  assert.equal(detailLevelAt(0.25), 4);
  const bands = Object.values(DETAIL_LEVELS).filter((l) => l.fadeIn).map((l) => l.fadeIn);
  for (let i = 1; i < bands.length; i++) assert.ok(bands[i][0] <= bands[i - 1][1], 'levels reveal in order without overlap');
  for (const band of bands) {
    assert.equal(fadeAt(band[0] + 0.01, band), 0);
    assert.equal(fadeAt(band[1] - 0.01, band), 1);
    let previous = 0;
    for (let a = band[0]; a >= band[1]; a -= (band[0] - band[1]) / 50) {
      const o = fadeAt(a, band);
      assert.ok(o >= previous && o - previous < 0.05, 'monotonic, no popping');
      previous = o;
    }
  }
});

test('stick shaping: radial dead zone, smooth start, full deflection reaches 1', () => {
  assert.deepEqual(shapeStick(0.1, 0.1, 0.16, 1.7), [0, 0]);
  const [x] = shapeStick(0.17, 0, 0.16, 1.7);
  assert.ok(x > 0 && x < 0.01, 'motion starts smoothly at the edge of the dead zone');
  assert.ok(Math.abs(shapeStick(1, 0, 0.16, 1.7)[0] - 1) < 1e-9);
  const [dx, dy] = shapeStick(0.7071, 0.7071, 0.16, 1.7);
  assert.ok(Math.abs(dx - dy) < 1e-9 && Math.hypot(dx, dy) <= 1.000001, 'diagonals keep direction and magnitude');
  assert.equal(shapeAxis(0.05, 0.06, 1.4), 0);
  assert.ok(shapeAxis(0.5, 0.06, 1.4) > 0 && shapeAxis(0.5, 0.06, 1.4) < shapeAxis(1, 0.06, 1.4));
  assert.equal(shapeAxis(NaN, 0.06, 1.4), 0);
});

function fakeControls() {
  const calls = { yaw: 0, pitch: 0, roll: 0, zoom: 0, north: 0, rollNotes: 0 };
  return {
    calls, altitude: 2.9,
    rotateInView(y, p, r) { calls.yaw += y; calls.pitch += p; calls.roll += r; },
    zoomBy(d) { calls.zoom += d; },
    noteInput({ roll } = {}) { if (roll) calls.rollNotes++; },
    requestNorthUp() { calls.north++; },
  };
}
const padWith = (axes = [0, 0, 0, 0], buttons = {}) => ({
  index: 0, id: 'synthetic', mapping: 'standard', connected: true, axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ value: buttons[i] ?? 0, pressed: (buttons[i] ?? 0) > 0.5 })),
});

test('gamepad navigation: mapping, no drift, clean stop, triggers, disconnect, held-button safety', () => {
  const controls = fakeControls();
  const nav = createGamepadNavigation(controls);
  const run = (pads, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) nav.update(1 / 60, pads); };

  run([padWith([0.1, 0.1, -0.1, 0.12], { 6: 0.04, 7: 0.05 })], 2);
  assert.deepEqual([controls.calls.yaw, controls.calls.pitch, controls.calls.roll, controls.calls.zoom], [0, 0, 0, 0], 'no drift in dead zones');

  run([padWith([1, 0, 0, 0])], 1);
  assert.ok(controls.calls.yaw < -1 && controls.calls.yaw > -1.4, `left stick X drives yaw, view follows the stick (${controls.calls.yaw})`);
  run([padWith()], 0.5);
  const stopped = controls.calls.yaw;
  run([padWith()], 2);
  assert.equal(controls.calls.yaw, stopped, 'complete stop after release');
  assert.deepEqual(nav.state().velocity, { yaw: 0, pitch: 0, roll: 0 });

  // Right stick: deliberately unassigned (no rotation, roll or pitch from either axis).
  const beforeRightStick = { ...controls.calls };
  run([padWith([0, 0, 1, 1])], 0.5);
  run([padWith([0, 0, -1, -1])], 0.5);
  assert.deepEqual([controls.calls.yaw, controls.calls.pitch, controls.calls.roll], [beforeRightStick.yaw, beforeRightStick.pitch, beforeRightStick.roll], 'right stick moves nothing');
  // Shoulder buttons: LB rolls the camera counterclockwise (globe turns clockwise on screen: roll > 0), RB the other way.
  run([padWith([0, 0, 0, 0], { 4: 1 })], 0.5);
  assert.ok(controls.calls.roll > 0.3 && controls.calls.rollNotes > 0, 'LB rolls smoothly and marks a deliberate roll');
  run([padWith()], 0.5);
  const rolled = controls.calls.roll;
  run([padWith([0, 0, 0, 0], { 5: 1 })], 0.5);
  assert.ok(controls.calls.roll < rolled - 0.3, 'RB rolls the other way');
  run([padWith()], 0.5);
  const settled = controls.calls.roll;
  run([padWith()], 1);
  assert.equal(controls.calls.roll, settled, 'releasing the shoulder button stops the roll');

  const zoomBefore = controls.calls.zoom;
  run([padWith([0, 0, 0, 0], { 7: 1 })], 1);
  assert.ok(controls.calls.zoom < zoomBefore - 1, 'RT zooms in (negative log altitude)');
  run([padWith([0, 0, 0, 0], { 6: 1, 7: 0 })], 1);
  assert.ok(controls.calls.zoom > zoomBefore - 0.2, 'LT zooms out');

  // Disconnect mid-input: commanded input drops to zero, glide ends, no drift afterwards.
  run([padWith([1, 0, 0, 0])], 0.3);
  run([], 0.5);
  const afterDisconnect = controls.calls.yaw;
  run([], 1);
  assert.equal(controls.calls.yaw, afterDisconnect);
  assert.equal(nav.state().connected.length, 0);

  // A button held while (re)connecting must be released before it acts; then a fresh press acts once.
  run([padWith([0, 0, 0, 0], { 11: 1 })], 0.2);
  assert.equal(controls.calls.north, 0);
  run([padWith()], 0.1);
  run([padWith([0, 0, 0, 0], { 11: 1 })], 0.5);
  assert.equal(controls.calls.north, 1);

  // Face buttons (X/A/B) are never consumed by Earth navigation.
  const before = JSON.stringify(controls.calls);
  run([padWith([0, 0, 0, 0], { 0: 1, 1: 1, 2: 1 })], 0.5);
  assert.equal(JSON.stringify(controls.calls), before);

  // Configurable mappings: flip yaw back to "the surface follows the stick".
  nav.configure({ ...DEFAULT_GAMEPAD_BINDINGS, yaw: { axis: 0, invert: false } });
  const yaw0 = controls.calls.yaw;
  run([padWith([1, 0, 0, 0])], 0.3);
  assert.ok(controls.calls.yaw > yaw0, 'flipping the binding reverses direction');
  assert.throws(() => nav.configure({ ...DEFAULT_GAMEPAD_BINDINGS, rollClockwise: {} }), TypeError);

  // Disabled (e.g. title screen): sticks do nothing.
  const quiet = createGamepadNavigation(fakeControls(), { isEnabled: () => false });
  for (let i = 0; i < 30; i++) assert.equal(quiet.update(1 / 60, [padWith([1, 1, 1, 1], { 7: 1 })]), false);
});

test('overlay polylines decode to valid WGS84 coordinates', async () => {
  const index = JSON.parse(await readFile(new URL('../public/earth/v1/overlays.json', import.meta.url), 'utf8'));
  for (const [name, layer] of Object.entries(index.layers)) {
    const bytes = await readFile(new URL(`../public/earth/v1/${layer.url}`, import.meta.url));
    const { count, counts, classes, coords } = decodePolylines(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.equal(count, layer.polylines, `${name} polylines`);
    assert.equal(counts.reduce((a, b) => a + b, 0), layer.points, `${name} points`);
    assert.equal(coords.length, layer.points * 2);
    for (let i = 0; i < coords.length; i += 2) {
      assert.ok(Math.abs(coords[i] / 180) <= 90 && Math.abs(coords[i + 1] / 180) <= 180, `${name} coordinate ${i / 2}`);
    }
    assert.ok([...classes].every((c) => String(c) in layer.classes), `${name} classes documented`);
  }
});
