import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { stateDir, root, json, run } from '../scripts/common.mjs';

// Dual-stick gamepad navigation, reticle picking, overlays and the gameplay Earth API, exercised with a
// SYNTHETIC standard-mapping gamepad (navigator.getGamepads is replaced). No physical controller is involved.
let url = process.env.GLOBE_TEST_URL;
if (!url) {
  await run(process.execPath, ['scripts/launcher.mjs', '--no-browser']);
  const state = await json(path.join(stateDir, 'server.json'));
  url = `http://127.0.0.1:${state.port}/`;
}
const target = new URL(url);
target.searchParams.set('earth', 'low'); // controls/picking do not depend on texture tier; keeps software WebGL fast
const browser = await chromium.launch({ headless: true, executablePath: process.env.GLOBE_CHROMIUM || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = path.join(root, 'test-results');
await mkdir(results, { recursive: true });

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
const lonDelta = (a, b) => ((a - b + 540) % 360) - 180;

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !/favicon/.test(message.text() + message.location().url)) errors.push(message.text()); });
  await page.addInitScript(() => {
    const blank = () => ({ index: 0, id: 'Synthetic standard gamepad', mapping: 'standard', connected: true, timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
    window.__pad = blank();
    window.__pads = [window.__pad];
    window.__setPad = (axes = [0, 0, 0, 0], buttons = {}) => {
      window.__pad.axes = axes;
      window.__pad.buttons.forEach((b, i) => { const v = buttons[i] ?? 0; b.value = v; b.pressed = v > 0.5; });
    };
    navigator.getGamepads = () => window.__pads;
    // Deterministic time: only window.advanceTime() drives frames (software WebGL is slow and real frames would add time).
    window.requestAnimationFrame = () => 0;
  });
  await page.goto(target.href);
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).earth?.loaded, null, { timeout: 120_000, polling: 250 });
  await page.waitForFunction(() => !document.body.classList.contains('earth-loading'), null, { timeout: 120_000, polling: 250 });
  const earth = () => page.evaluate(() => window.globeEarth.state());
  const advance = (seconds) => page.evaluate((s) => window.advanceTime(s * 1000), seconds);
  const pad = (axes, buttons) => page.evaluate(([a, b]) => window.__setPad(a, b), [axes, buttons]);

  // Title: sticks do nothing (not interactive), reticle hidden.
  await pad([1, 0, 0, 0]);
  let before = await earth();
  await advance(0.5);
  assert.equal((await earth()).reticle, false);
  await pad([0, 0, 0, 0]);

  await page.getByRole('button', { name: 'Explore the Earth' }).click();
  await advance(3);
  let s = await earth();
  assert.equal(s.reticle, true, 'reticle visible in explore');
  assert.equal(s.gamepad.connected.length, 1, 'synthetic pad seen');
  assert.equal(s.overlays.level, 1, 'planetary view starts at level 1');
  for (const layer of Object.values(s.overlays.layers)) assert.equal(layer.opacity, 0, 'no overlays at planetary level');

  // Full planet fits: projected limb radius must be inside the viewport with margin.
  const fit = await page.evaluate(() => {
    const st = window.globeEarth.state();
    const d = 1 + st.camera.altitude;
    const angular = Math.asin(1 / d);
    return Math.tan(angular) / Math.tan((35 / 2) * Math.PI / 180); // fraction of half-height
  });
  assert.ok(fit < 0.95 && fit > 0.6, `whole planet comfortably visible (limb at ${fit.toFixed(2)} of half-height)`);

  // Dead zone: stick noise below threshold must not move the globe.
  await page.evaluate(() => { window.globeEarth.navigateTo(10, 20, { altitude: 2.9 }); });
  await advance(4);
  await pad([0.1, -0.12, 0.09, 0.11], { 6: 0.03, 7: 0.04 });
  before = await earth();
  await advance(2);
  s = await earth();
  assert.deepEqual([s.camera.lat, s.camera.lon, s.camera.altitude], [before.camera.lat, before.camera.lon, before.camera.altitude], 'no drift inside dead zones');

  // Left stick X: the view follows the stick (right => view moves east), latitude stays put.
  await pad([1, 0, 0, 0]);
  await advance(1);
  s = await earth();
  assert.ok(lonDelta(s.camera.lon, before.camera.lon) > 30, `left stick right moves the view east (Δlon ${lonDelta(s.camera.lon, before.camera.lon)})`);
  // Screen-relative rotation follows a great circle (like a mouse drag), so latitude changes only slightly.
  assert.ok(Math.abs(s.camera.lat - before.camera.lat) < 0.15 * Math.abs(lonDelta(s.camera.lon, before.camera.lon)), 'east/west input moves mostly in longitude');
  // Release: short glide, then a complete stop (no drift).
  await pad([0, 0, 0, 0]);
  await advance(0.6);
  const settled = await earth();
  await advance(2);
  s = await earth();
  assert.deepEqual([s.camera.lat, s.camera.lon], [settled.camera.lat, settled.camera.lon], 'stops completely after release');
  assert.deepEqual(s.gamepad.velocity, { yaw: 0, pitch: 0, roll: 0 });

  // Left stick Y (down) => view moves south (the view follows the stick).
  before = s;
  await pad([0, 1, 0, 0]);
  await advance(0.6);
  await pad([0, 0, 0, 0]);
  await advance(1);
  s = await earth();
  const coarse = before.camera.lat - s.camera.lat;
  assert.ok(coarse > 15, `left stick down moves the view south (Δlat ${-coarse})`);

  // Right stick Y: fine adjustment, much slower than the left stick.
  before = s;
  await pad([0, 0, 0, 1]);
  await advance(0.6);
  await pad([0, 0, 0, 0]);
  await advance(1);
  s = await earth();
  const fine = before.camera.lat - s.camera.lat; // same sense as the left stick
  assert.ok(fine > 1 && fine < 0.4 * coarse, `right stick vertical is a fine adjustment (Δlat ${fine} vs ${coarse})`);

  // Right stick X: roll. Deliberate roll is kept: auto-levelling must not undo it.
  await page.evaluate(() => { window.globeEarth.navigateTo(20, 30, { altitude: 2 }); });
  await advance(4);
  before = await earth();
  close(before.roll, 0, 0.01, 'north-up after navigation');
  await pad([0, 0, 1, 0]);
  await advance(0.5);
  await pad([0, 0, 0, 0]);
  await advance(0.5);
  s = await earth();
  assert.ok(Math.abs(s.roll) > 0.4, `right stick rolls the globe (roll ${s.roll})`);
  assert.equal(s.rollHeld, true);
  close(s.camera.lat, before.camera.lat, 0.5, 'roll keeps the centre point (lat)');
  close(lonDelta(s.camera.lon, before.camera.lon), 0, 0.5, 'roll keeps the centre point (lon)');
  const rolled = s.roll;
  await page.waitForTimeout(700); // past the real-time idle delay that gates levelling
  await advance(4);
  s = await earth();
  close(s.roll, rolled, 1e-3, 'auto-levelling does not fight a deliberate roll');
  // Right-stick click requests north-up (fresh press only).
  await pad([0, 0, 0, 0], { 11: 1 });
  await advance(0.05);
  await pad([0, 0, 0, 0]);
  await advance(2);
  s = await earth();
  close(s.roll, 0, 0.01, 'right-stick click restores north-up');
  assert.equal(s.rollHeld, false);

  // Both sticks at once: rotation and roll combine.
  before = s;
  await pad([0.8, 0, 0.8, 0]);
  await advance(0.5);
  await pad([0, 0, 0, 0]);
  await advance(1);
  s = await earth();
  assert.ok(Math.abs(lonDelta(s.camera.lon, before.camera.lon)) > 5 && Math.abs(s.roll) > 0.2, 'simultaneous left + right stick input');
  await page.keyboard.press('KeyN');
  await advance(2);

  // Triggers: analog zoom with limits.
  before = await earth();
  await pad([0, 0, 0, 0], { 7: 0.5 });
  await advance(0.5);
  const half = await earth();
  await pad([0, 0, 0, 0], { 7: 1 });
  await advance(0.5);
  const full = await earth();
  const rateHalf = Math.log(before.camera.altitude / half.camera.altitude);
  const rateFull = Math.log(half.camera.altitude / full.camera.altitude);
  assert.ok(rateHalf > 0 && rateFull > rateHalf * 1.5, `RT pressure controls zoom speed (${rateHalf.toFixed(3)} vs ${rateFull.toFixed(3)})`);
  await advance(6);
  s = await earth();
  close(s.camera.altitude, 0.2, 0.002, 'RT stops at the minimum altitude');
  assert.ok(s.overlays.level >= 3, `close zoom reaches detail level ${s.overlays.level}`);
  assert.ok(s.overlays.layers.borders.opacity === 1 && s.overlays.layers['rivers-regional'].opacity === 1, 'level 2/3 overlays fully faded in');
  await page.screenshot({ path: path.join(results, 'earth-overlays-close.png'), timeout: 120_000 });

  // Precision: the same stick input turns the globe far less when close to the surface.
  before = s;
  await pad([1, 0, 0, 0]);
  await advance(0.5);
  await pad([0, 0, 0, 0]);
  await advance(1);
  s = await earth();
  const closeTurn = Math.abs(lonDelta(s.camera.lon, before.camera.lon));
  assert.ok(closeTurn > 0.2 && closeTurn < 4, `precision near the surface (Δlon ${closeTurn})`);

  await pad([0, 0, 0, 0], { 6: 1 });
  await advance(8);
  s = await earth();
  close(s.camera.altitude, 6, 0.01, 'LT stops at the maximum altitude');
  await pad([0, 0, 0, 0]);
  await page.evaluate(() => { window.globeEarth.navigateTo(30, 0, { altitude: 1.2 }); });
  await advance(4);
  await page.waitForTimeout(50);
  s = await earth();
  assert.ok(s.overlays.layers.borders.opacity > 0.99 && s.overlays.layers['rivers-regional'].opacity === 0, 'level 2 visible, level 3 not yet');
  await page.screenshot({ path: path.join(results, 'earth-overlays-continental.png'), timeout: 120_000 });

  // Poles: drive straight over the north pole; orientation stays valid, picking keeps working.
  await page.evaluate(() => { window.globeEarth.navigateTo(80, 10, { altitude: 1.5 }); });
  await advance(4);
  await pad([0, -1, 0, 0]); // stick up: the view heads north
  let maxLat = -90;
  for (let i = 0; i < 12; i++) { await advance(0.1); maxLat = Math.max(maxLat, (await earth()).camera.lat); }
  await pad([0, 0, 0, 0]);
  await advance(1);
  s = await earth();
  assert.ok(maxLat > 88, `reached the pole (max lat ${maxLat})`);
  assert.ok(Number.isFinite(s.camera.lat) && Number.isFinite(s.camera.lon) && Number.isFinite(s.roll));
  assert.ok(Math.abs(lonDelta(s.camera.lon, 10)) > 90, `crossed over the pole to the far side (lon ${s.camera.lon})`);
  const pole = await page.evaluate(() => window.globeEarth.pickCenter());
  close(pole.lat, s.camera.lat, 0.02, 'centre pick at high latitude (lat)');

  // Reticle picking: the centre point equals the camera centre, also when rolled.
  await page.evaluate(() => { window.globeEarth.navigateTo(-33.9, 18.4, { altitude: 1 }); });
  await advance(4);
  await pad([0, 0, 0.6, 0]);
  await advance(0.6);
  await pad([0, 0, 0, 0]);
  await advance(1);
  const picked = await page.evaluate(() => window.globeEarth.pickCenter());
  close(picked.lat, -33.9, 0.01, 'rolled view: centre pick latitude');
  close(lonDelta(picked.lon, 18.4), 0, 0.01, 'rolled view: centre pick longitude');
  const reticle = await page.evaluate(() => { const r = document.querySelector('.globe-reticle').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  assert.deepEqual(reticle, [640, 360], 'reticle sits at the exact viewport centre');

  // Disconnect while a stick is held: motion stops, no drift. Reconnect with a held button: no action until released.
  await pad([1, 0, 0, 0]);
  await advance(0.3);
  await page.evaluate(() => { window.__pads = []; });
  await advance(1);
  const gone = await earth();
  await advance(2);
  s = await earth();
  assert.equal(s.gamepad.connected.length, 0);
  assert.deepEqual([s.camera.lat, s.camera.lon], [gone.camera.lat, gone.camera.lon], 'disconnect stops all motion');
  await page.keyboard.press('KeyQ'); // keyboard roll still works
  await advance(0.2);
  assert.ok(Math.abs((await earth()).roll) > 0.05, 'keyboard Q rolls');
  await page.evaluate(() => { window.__setPad([0, 0, 0, 0], { 11: 1 }); window.__pads = [window.__pad]; });
  await advance(1);
  s = await earth();
  assert.equal(s.gamepad.connected.length, 1, 'reconnected');
  assert.ok(Math.abs(s.roll) > 0.05, 'a button held during reconnect does not fire');
  await pad([0, 0, 0, 0]);

  // Gameplay presentation: no markers, abortable navigation, start-of-mystery planet view.
  await page.evaluate(() => window.globeEarth.setMode('mystery'));
  await advance(0.5);
  const aborted = await page.evaluate(async () => {
    const controller = new AbortController();
    const flight = window.globeEarth.navigateTo(0, 100, { signal: controller.signal });
    window.advanceTime(200);
    controller.abort();
    return flight;
  });
  assert.deepEqual(aborted, { completed: false, reason: 'aborted' });
  s = await earth();
  assert.equal(s.target, null, 'no target marker in the mystery presentation');
  const reset = page.evaluate(() => window.globeEarth.resetToPlanetView());
  await advance(3);
  assert.deepEqual(await reset, { completed: true });
  s = await earth();
  close(s.roll, 0, 0.01, 'mystery starts north-up');
  assert.ok(s.camera.altitude > 2.5 && s.overlays.level === 1, 'mystery starts from the whole planet, no overlays');
  const interrupted = page.evaluate(() => window.globeEarth.navigateTo(10, 10));
  await pad([1, 0, 0, 0]);
  await advance(0.3);
  await pad([0, 0, 0, 0]);
  assert.deepEqual(await interrupted, { completed: false, reason: 'interrupted' }, 'player input interrupts navigation');
  await page.screenshot({ path: path.join(results, 'earth-mystery-reticle.png'), timeout: 120_000 });

  assert.deepEqual(errors, []);
  console.log('Earth gamepad browser passed: dead zones, no drift, left-stick rotation, fine right-stick pitch, roll kept by levelling, north-up click, simultaneous sticks, analog RT/LT zoom with limits, precision scaling, pole crossing, rolled centre picking, reticle centring, disconnect/reconnect, overlays by level, mystery presentation API.');
} finally { await browser.close(); }
