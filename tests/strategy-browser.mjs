import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { stateDir, root, json, run } from '../scripts/common.mjs';

// Strategy prototype on the launcher-served production build, with the real Earth renderer: entry and exit,
// the start in Canaan in 6000 BCE, the fully visible physical Earth, knowledge-limited human information,
// exploration, news without exploration, territory, turns, keyboard-and-mouse controls, the I and U screens,
// save and resume, separation from mystery progress, and that the gamepad does nothing in this mode.
let url = process.env.GLOBE_TEST_URL;
if (!url) {
  await run(process.execPath, ['scripts/launcher.mjs', '--no-browser']);
  const state = await json(path.join(stateDir, 'server.json'));
  url = `http://127.0.0.1:${state.port}/`;
}
const target = new URL(url);
target.searchParams.set('earth', 'low');
const browser = await chromium.launch({ headless: true, executablePath: process.env.GLOBE_CHROMIUM || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = path.join(root, 'test-results');
await mkdir(results, { recursive: true });
const started = Date.now();
const step = (label) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${label}`);
const lonDelta = (a, b) => ((a - b + 540) % 360) - 180;

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => {
    const pad = { index: 0, id: 'Synthetic standard gamepad', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad;
    navigator.getGamepads = () => [pad];
    window.requestAnimationFrame = () => 0; // deterministic: frames only through advanceTime()
  });
  const advance = (seconds) => page.evaluate((s) => window.advanceTime(s * 1000), seconds);
  const frames = async (seconds, dt = 0.05) => { for (let t = 0; t < seconds; t += dt) await advance(dt); };
  const snap = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const strat = async () => (await snap()).strategy;
  const earth = async () => (await snap()).earth;
  const until = async (fn, arg, label, timeout = 60_000) => {
    const end = Date.now() + timeout;
    while (!(await page.evaluate(fn, arg))) { if (Date.now() > end) throw new Error(`Timed out: ${label}`); await advance(0.05); await page.waitForTimeout(50); }
  };
  const markerPoint = (selector) => page.locator(selector).evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const screenOf = (lat, lon) => page.evaluate(([a, b]) => window.globeEarth.projectGeo(a, b), [lat, lon]);
  const settleClick = async () => { await page.waitForTimeout(450); await advance(0.05); }; // past the double-click window
  // Mean brightness of the rendered globe in the central screen region (read right after a frame is drawn).
  const brightness = () => page.evaluate(() => {
    window.globeEarth.invalidate(); window.advanceTime(16);
    const canvas = document.querySelector('#scene');
    const gl = canvas.getContext('webgl2');
    const w = 200, h = 200, x = Math.floor(canvas.width / 2 - w / 2), y = Math.floor(canvas.height / 2 - h / 2);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
    return sum / (w * h * 3);
  });

  await page.goto(target.href);
  await page.waitForFunction(() => window.render_game_to_text && !document.querySelector('#strategy-button')?.disabled, null, { timeout: 180_000, polling: 250 });
  await advance(0.5);

  step('title entry and existing modes');
  assert.equal(await page.locator('#strategy-button .index-label').textContent(), 'Strategy Prototype');
  for (const id of ['#mystery-button', '#earth-button', '#about-button']) assert.ok(await page.locator(id).isVisible(), `${id} kept`);
  // Reference brightness of the physical Earth in Explore at a fixed view, for the "nothing concealed" check.
  await page.click('#earth-button');
  await page.evaluate(() => { void window.globeEarth.navigateTo(-25, 133, { altitude: 1.6 }); });
  await frames(4, 0.25);
  const exploreBrightness = await brightness();
  await page.keyboard.press('Escape');
  await advance(0.5);
  assert.equal((await snap()).mode, 'title');

  step('enter strategy: 6000 BCE, Canaan, Neolithic');
  await page.click('#strategy-button');
  await until(() => JSON.parse(window.render_game_to_text()).strategy?.phase === 'playing', null, 'strategy playing');
  let s = await strat();
  assert.equal((await snap()).mode, 'strategy');
  assert.equal(s.year, '6000 BCE');
  assert.equal(s.period, 'Neolithic');
  assert.equal(s.turn, 1);
  assert.ok(s.settlement.lat > 31 && s.settlement.lat < 33.5 && s.settlement.lon > 34.2 && s.settlement.lon < 36, 'settlement in the southern Levant');
  await frames(3, 0.25);
  let e = await earth();
  assert.equal(e.mode, 'strategy');
  assert.ok(Math.abs(e.camera.lat - s.settlement.lat) < 1 && Math.abs(lonDelta(e.camera.lon, s.settlement.lon)) < 1, 'camera centred on the community');
  assert.ok(e.layers.atmosphere && e.layers.relief && e.layers.ocean && e.layers.rivers, 'physical Earth layers on');
  assert.ok(!e.layers.borders && !e.layers.labels && !e.layers.landmarks && !e.layers.nightLights, 'modern human information off');
  await page.screenshot({ path: path.join(results, 'strategy-start.png'), timeout: 120_000 });

  step('clean default screen');
  const visibleText = await page.locator('#strategy').innerText();
  for (const word of ['WASD', 'Drag', 'Double-click', 'Wheel', 'Controls']) assert.ok(!visibleText.includes(word), `no "${word}" on the default screen`);
  assert.ok(await page.locator('[data-sheet-panel="info"]').isHidden() && await page.locator('[data-sheet-panel="settlement"]').isHidden(), 'screens hidden by default');
  assert.ok(await page.locator('[data-action="end-turn"]').isVisible());

  step('knowledge: own settlement known, the rest of the human world hidden; camera cannot reveal it');
  assert.deepEqual(s.known, ['place-valley']);
  assert.deepEqual(s.markers, ['explorer-1', 'place-valley', 'settlement-1']);
  const hiddenNames = ['Hillside hamlet', 'Obsidian-working community', 'Coastal fishing camp', 'Flint-working site'];
  const anyHidden = () => page.evaluate((names) => names.some((n) => document.body.innerText.includes(n) || [...document.querySelectorAll('[aria-label]')].some((el) => el.getAttribute('aria-label') === n)), hiddenNames);
  assert.equal(await anyHidden(), false);
  await page.evaluate(() => { void window.globeEarth.navigateTo(37.6, 32.8, { altitude: 0.12 }); });
  await frames(3, 0.25);
  await page.evaluate(() => window.globeEarth.controls.zoomTo(0.06));
  await frames(2, 0.25);
  s = await strat();
  assert.deepEqual(s.known, ['place-valley'], 'flying over a distant place teaches nothing');
  assert.deepEqual(s.markers, ['explorer-1', 'place-valley', 'settlement-1']);
  assert.equal(await anyHidden(), false);

  step('the entire physical Earth stays visible (no terrain-concealing fog)');
  await page.evaluate(() => { void window.globeEarth.navigateTo(-25, 133, { altitude: 1.6 }); });
  await frames(4, 0.25);
  const strategyBrightness = await brightness();
  assert.ok(exploreBrightness > 20, `reference view is lit (${exploreBrightness.toFixed(1)})`);
  assert.ok(Math.abs(strategyBrightness / exploreBrightness - 1) < 0.12, `Australia renders as in Explore (strategy ${strategyBrightness.toFixed(1)} vs explore ${exploreBrightness.toFixed(1)})`);
  await page.evaluate(([a, b]) => { void window.globeEarth.navigateTo(a, b, { altitude: 0.32 }); }, [s.settlement.lat, s.settlement.lon]);
  await frames(4, 0.25);

  step('single click selects; a plain click on the globe never moves the party');
  let p = await markerPoint('.marker-unit');
  await page.mouse.click(p.x, p.y);
  await settleClick();
  s = await strat();
  assert.deepEqual(s.selected, { type: 'unit', id: 'explorer-1' });
  assert.equal(await page.locator('.selection-name').textContent(), 'Exploring party');
  const west = await screenOf(31.76, 34.9);
  await page.mouse.click(west.x, west.y);
  await settleClick();
  s = await strat();
  assert.equal(s.explorer.movesLeftKm, 40, 'no move without the move command');
  assert.equal(s.selected, null, 'clicking empty ground clears the selection');
  p = await markerPoint('.marker-settlement');
  await page.mouse.click(p.x, p.y);
  await settleClick();
  assert.deepEqual((await strat()).selected, { type: 'settlement', id: 'settlement-1' });

  step('explicit move command: M, then click a destination; exploration reveals nearby places');
  p = await markerPoint('.marker-unit');
  await page.mouse.click(p.x, p.y);
  await settleClick();
  await page.keyboard.press('KeyM');
  assert.equal((await strat()).commanding, true);
  const dest = await screenOf(31.76, 34.9);
  await page.mouse.move(dest.x, dest.y);
  await page.mouse.click(dest.x, dest.y);
  await settleClick();
  await until(() => !JSON.parse(window.render_game_to_text()).strategy.animating, null, 'travel animation', 30_000);
  s = await strat();
  assert.equal(s.explorer.movesLeftKm, 0, 'the whole allowance was used');
  assert.ok(s.known.includes('place-hamlet'), 'the hillside hamlet was discovered nearby');
  assert.equal(s.routes, 1, 'the route is remembered');
  assert.equal(s.commanding, false, 'the command ends after the order');
  const afterMove = s.explorer;

  step('double-click centres the point and neither selects nor moves');
  const before = await earth();
  const there = await screenOf(30.6, 36.6);
  await page.mouse.dblclick(there.x, there.y);
  await settleClick();
  await frames(2, 0.1);
  e = await earth();
  s = await strat();
  assert.ok(Math.abs(e.camera.lat - 30.6) < 0.4 && Math.abs(lonDelta(e.camera.lon, 36.6)) < 0.4, `centred the clicked point (${e.camera.lat}, ${e.camera.lon})`);
  assert.ok(Math.abs(e.camera.altitude - before.camera.altitude) < 0.01, 'zoom preserved');
  assert.deepEqual(s.selected, { type: 'unit', id: 'explorer-1' }, 'selection unchanged');
  assert.deepEqual(s.explorer, afterMove, 'party not moved');

  step('keyboard: W/A/S/D move, Q/E roll; release stops');
  const hold = async (code, seconds = 0.8) => { await page.keyboard.down(code); await frames(seconds, 0.1); await page.keyboard.up(code); await frames(0.5, 0.1); };
  let a = await earth();
  await hold('KeyD');
  let b = await earth();
  assert.ok(lonDelta(b.camera.lon, a.camera.lon) > 0.2, `D moves east (Δlon ${lonDelta(b.camera.lon, a.camera.lon)})`);
  await hold('KeyA');
  a = b; b = await earth();
  assert.ok(lonDelta(b.camera.lon, a.camera.lon) < -0.2, 'A moves west');
  await hold('KeyW');
  a = b; b = await earth();
  assert.ok(b.camera.lat - a.camera.lat > 0.2, 'W moves north');
  await hold('KeyS');
  a = b; b = await earth();
  assert.ok(b.camera.lat - a.camera.lat < -0.2, 'S moves south');
  const north = () => page.evaluate(() => window.globeEarth.projection().north);
  let n0 = await north();
  await hold('KeyQ', 0.6);
  let n1 = await north();
  assert.ok(n1 - n0 > 0.2, `Q rolls the globe clockwise (north ${n0.toFixed(2)} -> ${n1.toFixed(2)})`);
  await hold('KeyE', 1.2);
  const n2 = await north();
  assert.ok(n2 - n1 < -0.2, 'E rolls the globe counterclockwise');
  a = await earth(); await frames(1); b = await earth();
  assert.deepEqual([b.camera.lat, b.camera.lon], [a.camera.lat, a.camera.lon], 'released keys stop the movement');

  step('mouse drag rotates; wheel zooms');
  a = await earth();
  await page.mouse.move(640, 360); await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(640 + i * 25, 360); await advance(0.03); }
  await page.mouse.up(); await frames(1);
  b = await earth();
  assert.ok(Math.abs(lonDelta(b.camera.lon, a.camera.lon)) > 0.2, 'dragging turns the globe');
  assert.deepEqual(await strat().then((x) => x.explorer), afterMove, 'a drag is not a move order');
  a = b;
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, -600);
  await frames(1.5);
  b = await earth();
  assert.ok(b.camera.altitude < a.camera.altitude * 0.9, `wheel zooms in (${a.camera.altitude} -> ${b.camera.altitude})`);

  step('gamepad does nothing in strategy mode');
  a = await earth();
  const turnBefore = (await strat()).turn;
  await page.evaluate(() => { window.__pad.axes = [1, 0, 0, 0]; window.__pad.buttons[0].pressed = true; window.__pad.buttons[0].value = 1; window.__pad.buttons[4].pressed = true; window.__pad.buttons[4].value = 1; });
  await frames(0.8);
  await page.evaluate(() => { window.__pad.axes = [0, 0, 0, 0]; for (const b of window.__pad.buttons) { b.pressed = false; b.value = 0; } });
  await frames(0.5);
  b = await earth();
  assert.deepEqual([b.camera.lat, b.camera.lon, b.roll], [a.camera.lat, a.camera.lon, a.roll], 'sticks and shoulder buttons ignored');
  assert.equal((await strat()).turn, turnBefore, 'A does not end the turn');

  step('turns: Enter ends the turn; calendar, movement, territory, distant news');
  const cells = (await strat()).territoryCells;
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Enter'); await advance(0.1); }
  s = await strat();
  assert.equal(s.turn, 4);
  assert.equal(s.year, '5850 BCE');
  assert.equal(s.explorer.movesLeftKm, 40, 'movement restored');
  assert.equal(s.territoryCells, cells + 3, 'territory grows a little each turn');
  assert.ok(s.known.includes('place-anatolia'), 'news of a distant community arrived without exploration');
  assert.equal(s.placeStates['place-anatolia'], 'new');
  assert.ok(s.markers.includes('place-anatolia'));
  assert.ok(s.known.includes('place-hamlet'), 'earlier discoveries are remembered');
  assert.equal(await page.locator('.strategy-marker[aria-label="Obsidian-working community"]').getAttribute('data-state'), 'new');

  step('I and U screens; Escape closes screens before leaving');
  await page.keyboard.press('KeyI');
  assert.ok(await page.locator('[data-sheet-panel="info"]').isVisible(), 'I opens information');
  const info = await page.locator('[data-sheet-panel="info"]').innerText();
  for (const word of ['W', 'Q', 'Double-click', 'Wheel', '5850 BCE', 'Neolithic', 'Your society', 'What your people know']) assert.ok(info.includes(word), `information includes ${word}`);
  await page.screenshot({ path: path.join(results, 'strategy-information.png'), timeout: 120_000 });
  await page.keyboard.press('KeyI');
  assert.ok(await page.locator('[data-sheet-panel="info"]').isHidden(), 'I again closes it');
  await page.keyboard.press('KeyU');
  assert.ok(await page.locator('[data-sheet-panel="settlement"]').isVisible(), 'U opens the settlement screen');
  assert.ok((await page.locator('[data-sheet-panel="settlement"]').innerText()).includes('Jordan Valley village'), 'no settlement selected: overview lists it');
  await page.locator('[data-choose-settlement]').click();
  const settlementText = await page.locator('[data-sheet-panel="settlement"]').innerText();
  for (const word of ['Village', 'Population', 'Territory', 'Status', 'Not simulated yet']) assert.ok(settlementText.includes(word), `settlement screen shows ${word}`);
  await page.keyboard.press('KeyI');
  assert.ok(await page.locator('[data-sheet-panel="info"]').isVisible() && await page.locator('[data-sheet-panel="settlement"]').isHidden(), 'opening one screen closes the other');
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('[data-sheet-panel="info"]').isHidden(), 'Escape closes the screen');
  assert.equal((await snap()).mode, 'strategy', 'and stays in strategy');

  step('save and resume after reload; mystery progress untouched');
  const saved = await strat();
  const mysteryBefore = await page.evaluate(() => [localStorage.getItem('globe.education.progress'), localStorage.getItem('globe.education.development.progress')]);
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text && !document.querySelector('#strategy-button')?.disabled, null, { timeout: 180_000, polling: 250 });
  await page.click('#strategy-button');
  await until(() => JSON.parse(window.render_game_to_text()).strategy?.phase === 'lobby', null, 'resume offer');
  await page.getByRole('button', { name: /Continue the game/ }).click();
  await until(() => JSON.parse(window.render_game_to_text()).strategy?.phase === 'playing', null, 'resumed');
  s = await strat();
  for (const key of ['turn', 'year', 'known', 'explorer', 'territoryCells', 'routes']) assert.deepEqual(s[key], saved[key], `${key} resumed`);
  assert.deepEqual(await page.evaluate(() => [localStorage.getItem('globe.education.progress'), localStorage.getItem('globe.education.development.progress')]), mysteryBefore);

  step('a deliberate new game keeps the previous save');
  await page.keyboard.press('Escape');
  await advance(0.3);
  assert.equal((await snap()).mode, 'title', 'Escape with nothing open leaves strategy');
  assert.equal((await earth()).layers.borders, true, 'Explore/mystery layers restored on leaving');
  await page.click('#strategy-button');
  await until(() => JSON.parse(window.render_game_to_text()).strategy?.phase === 'lobby', null, 'lobby');
  await page.getByRole('button', { name: /Start a new game/ }).click();
  await until(() => JSON.parse(window.render_game_to_text()).strategy?.phase === 'playing', null, 'new game');
  assert.equal((await strat()).turn, 1);
  const previous = await page.evaluate(() => JSON.parse(localStorage.getItem('histography.strategy.prototype.previous')).state.turn);
  assert.equal(previous, 4, 'previous game kept');

  assert.deepEqual(errors, []);
  console.log('Strategy browser passed: title entry and preserved modes, 6000 BCE start in Canaan, physical Earth fully visible, hidden human information the camera cannot reveal, selection, explicit move command, discovery and memory, double-click centring, WASD and Q/E, drag and wheel, gamepad ignored, turns with territory growth and distant news, I and U screens with Escape, save and resume, new game keeps the previous save, mystery progress untouched.');
} finally { await browser.close(); }
