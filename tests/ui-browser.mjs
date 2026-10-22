import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { stateDir, root, json, run } from '../scripts/common.mjs';

// Interface checks: title menu focus with keyboard and a SYNTHETIC controller, the mystery screen driven by the
// presentation preview (no real mystery content), spoiler rules, and title-only update refresh while in a mystery.
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

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !/favicon/.test(message.text() + message.location().url)) errors.push(message.text()); });
  await page.addInitScript(() => {
    const pad = { index: 0, id: 'Synthetic standard gamepad', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pads = [pad];
    window.__press = (index, down) => { pad.buttons[index].value = down ? 1 : 0; pad.buttons[index].pressed = down; };
    navigator.getGamepads = () => window.__pads;
    window.requestAnimationFrame = () => 0; // deterministic: frames only through advanceTime()
  });
  const advance = (seconds) => page.evaluate((s) => window.advanceTime(s * 1000), seconds);
  const tap = async (index) => { await page.evaluate((i) => window.__press(i, true), index); await advance(0.05); await page.evaluate((i) => window.__press(i, false), index); await advance(0.05); };
  const mode = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).mode);
  const focused = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.dataset?.action || document.activeElement?.tagName);

  await page.goto(target.href);
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).earth?.loaded, null, { timeout: 120_000, polling: 250 });
  await page.waitForFunction(() => !document.querySelector('#mystery-button').disabled, null, { timeout: 120_000, polling: 250 });
  await advance(0.5);

  // Typography: the Globe typefaces are loaded (OFL, self-hosted).
  for (const family of ['Bodoni Moda', 'Newsreader', 'Instrument Sans']) {
    assert.ok(await page.evaluate(async (f) => (await document.fonts.load(`16px "${f}"`)).length > 0, family), `${family} loaded`);
  }

  // Title focus: starts on "Begin a mystery"; arrows and the D-pad move it; the bezel is drawn.
  assert.equal(await focused(), 'mystery-button');
  await page.keyboard.press('ArrowDown');
  assert.equal(await focused(), 'earth-button');
  await tap(13); // D-pad down
  assert.equal(await focused(), 'about-button');
  await tap(12); // D-pad up
  await tap(12);
  assert.equal(await focused(), 'mystery-button');
  assert.ok(await page.evaluate(() => document.querySelectorAll('#bezel g[opacity]')[0].getAttribute('opacity') > 0), 'bezel visible on the title');
  await page.screenshot({ path: path.join(results, 'ui-title.png'), timeout: 120_000 });

  // About via keyboard Enter, back with controller B.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await mode(), 'vision');
  await tap(1);
  assert.equal(await mode(), 'title');
  assert.equal(await focused(), 'about-button', 'focus returns to the entry that opened the page');

  // Begin a mystery with controller A.
  await tap(12); await tap(12);
  assert.equal(await focused(), 'mystery-button');
  await tap(0);
  assert.equal(await mode(), 'mystery');
  await advance(2);
  const clues = () => page.evaluate(() => [...document.querySelectorAll('.clue')].map((c) => c.dataset.state));
  let state = await clues();
  assert.equal(state.length, 5);
  assert.deepEqual(state.map((s) => s === 'locked'), [false, true, true, true, true], 'one clue at the start');
  // Spoiler rules while investigating.
  let s = await page.evaluate(() => ({ earth: window.globeEarth.state(), policy: window.globeEarth.labelPolicy, answer: document.querySelector('.answer').innerHTML, hidden: document.querySelector('.answer').hidden, labels: document.querySelectorAll('.atlas-label:not([hidden])').length }));
  assert.equal(s.policy, 'none', 'no place names during a mystery');
  assert.equal(s.answer, '', 'no answer content in the DOM before reveal');
  assert.equal(s.hidden, true);
  assert.equal(s.earth.target, null, 'no marker while investigating');
  assert.equal(s.earth.reticle, true, 'centre reticle visible');
  assert.equal(await page.locator('#explore').isVisible(), false, 'developer tools are not part of the mystery screen');
  // Zooming in during a mystery still shows no names (uniform policy), while lines and miniatures may appear.
  await page.evaluate(() => { window.globeEarth.controls.zoomTo(0.3); });
  await advance(3);
  assert.equal(await page.evaluate(() => document.querySelectorAll('.atlas-label:not([hidden])').length), 0, 'no labels even at close zoom during a mystery');
  await page.evaluate(() => { window.globeEarth.controls.zoomTo(2.6); });
  await advance(3);

  // Next clue: controller A and keyboard Space; previous clues stay visible.
  await tap(0);
  await page.keyboard.press('Space');
  await advance(0.3);
  state = await clues();
  assert.deepEqual(state.map((x) => x !== 'locked'), [true, true, true, false, false]);
  await tap(0); await tap(0);
  state = await clues();
  assert.ok(state.every((x) => x !== 'locked'), 'all five clues');
  assert.equal(await page.locator('.next-label').textContent(), 'Reveal the answer', 'A becomes "Reveal the answer" after five clues');
  await page.screenshot({ path: path.join(results, 'ui-mystery.png'), timeout: 120_000 });

  // Confirm with X: the aimed coordinate is captured, then the reveal shows the answer.
  const aimed = await page.evaluate(() => window.globeEarth.pickCenter());
  await tap(2);
  await advance(4);
  s = await page.evaluate(() => ({ text: document.querySelector('.answer').textContent, hidden: document.querySelector('.answer').hidden, policy: window.globeEarth.labelPolicy, target: window.globeEarth.state().target, reticle: window.globeEarth.state().reticle }));
  assert.equal(s.hidden, false);
  assert.match(s.text, /Sample answer/);
  assert.match(s.text, new RegExp(`You chose ${Math.abs(aimed.lat).toFixed(1)}`), 'the confirmed selection is shown');
  assert.equal(s.policy, 'all', 'place names return after the reveal');
  assert.ok(s.target, 'answer marker only after confirmation');
  assert.equal(s.reticle, false, 'aiming instruments hidden while reading');
  await page.screenshot({ path: path.join(results, 'ui-reveal.png'), timeout: 120_000 });

  // Next mystery starts from the whole planet with one clue; B leaves to the title.
  await tap(0);
  await advance(3);
  state = await clues();
  assert.deepEqual(state.map((x) => x !== 'locked'), [true, false, false, false, false]);
  assert.equal(await page.evaluate(() => window.globeEarth.state().overlays.level), 1, 'new mystery begins at the planetary view');
  await tap(1);
  assert.equal(await mode(), 'title');

  // Update lifecycle (production only): a version response during a mystery must not reload; it applies at the title.
  if (!process.env.GLOBE_TEST_URL) {
    let held;
    let capture;
    const intercepted = new Promise((resolve) => { capture = resolve; });
    await page.route('**/version.json', (route) => { held = route; capture(); });
    await page.reload(); await intercepted;
    await page.waitForFunction(() => !document.querySelector('#mystery-button').disabled, null, { timeout: 120_000, polling: 250 });
    await page.click('#mystery-button');
    await held.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'ui-test-build' }) });
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).pendingUpdate, null, { polling: 250 });
    assert.equal(await mode(), 'mystery', 'no reload during a mystery');
    await page.unroute('**/version.json');
    const navigation = page.waitForEvent('domcontentloaded');
    await page.keyboard.press('Escape');
    await navigation;
  }
  assert.deepEqual(errors, []);
  console.log('UI browser passed: fonts, title focus by keyboard and controller, about page, mystery preview flow (A/Space next clue, X confirm, B leave), spoiler rules (no names, no answer DOM, no marker, no dev tools), reveal, next mystery from the planet view, title-only refresh.');
} finally { await browser.close(); }
