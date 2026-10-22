import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { stateDir, root, json, run } from '../scripts/common.mjs';

// Earth V1 browser check against the production service (same entry as tests/browser.mjs).
// GLOBE_TEST_URL targets an already running server instead; GLOBE_CHROMIUM selects a browser binary.
let url = process.env.GLOBE_TEST_URL;
if (!url) {
  await run(process.execPath, ['scripts/launcher.mjs', '--no-browser']);
  const state = await json(path.join(stateDir, 'server.json'));
  url = `http://127.0.0.1:${state.port}/`;
}
const browser = await chromium.launch({ headless: true, executablePath: process.env.GLOBE_CHROMIUM || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = path.join(root, 'test-results');
await mkdir(results, { recursive: true });
const state = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()));
// Software WebGL in CI renders a few frames per second; step time explicitly for deterministic animation.
const advance = (page, seconds) => page.evaluate((s) => window.advanceTime(s * 1000), seconds);
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !/favicon/.test(message.text())) errors.push(message.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).earth?.loaded, null, { timeout: 120_000 });
  await page.waitForFunction(() => !document.body.classList.contains('earth-loading'), null, { timeout: 120_000 });
  let s = await state(page);
  assert.equal(s.mode, 'title');
  assert.ok(['high', 'medium', 'low'].includes(s.earth.tier));
  assert.ok(s.earth.drawCalls >= 2 && s.earth.drawCalls <= 8, `draw calls ${s.earth.drawCalls}`);
  await page.screenshot({ path: path.join(results, 'earth-title.png') });

  await page.getByRole('button', { name: 'Explore the Earth' }).click();
  await advance(page, 3);
  s = await state(page);
  assert.equal(s.mode, 'explore');
  assert.equal(s.earth.mode, 'explore');

  // Geographic targeting: fly to Antananarivo using its GeoNames coordinates.
  await page.selectOption('#target-select', { label: 'Antananarivo (MG)' });
  await advance(page, 4);
  s = await state(page);
  assert.equal(s.earth.target.name, 'Antananarivo');
  assert.ok(Math.abs(s.earth.camera.lat - -18.9137) < 0.05 && Math.abs(s.earth.camera.lon - 47.5361) < 0.05, `camera centred on ${JSON.stringify(s.earth.camera)}`);
  // The pixel at the centre of the view must pick back to the same coordinate (ray / WGS84 ellipsoid).
  const picked = await page.evaluate(() => window.globeEarth.pickGeodetic(innerWidth / 2, innerHeight / 2));
  assert.ok(picked && Math.abs(picked.lat - -18.9137) < 0.05 && Math.abs(picked.lon - 47.5361) < 0.05, `centre pixel picks ${JSON.stringify(picked)}`);
  await page.screenshot({ path: path.join(results, 'earth-antananarivo.png') });

  // Antimeridian and poles: flights succeed and keep coordinates normalised.
  for (const [lat, lon] of [[-17.5, 179.9], [-17.5, -179.9], [85, 0], [-85, 120]]) {
    await page.evaluate(([la, lo]) => window.globeEarth.flyTo(la, lo, { name: 'check', altitude: 1.5 }), [lat, lon]);
    await advance(page, 4);
    s = await state(page);
    const dLon = Math.abs(((s.earth.camera.lon - lon + 540) % 360) - 180);
    assert.ok(Math.abs(s.earth.camera.lat - lat) < 0.1 && dLon < 0.1, `flyTo ${lat},${lon} -> ${JSON.stringify(s.earth.camera)}`);
  }

  // Drag rotates the globe; wheel zooms toward the surface.
  const before = await state(page);
  await page.mouse.move(800, 450); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(800 - i * 25, 450);
  await page.mouse.up();
  await advance(page, 1);
  const afterDrag = await state(page);
  assert.notDeepEqual([afterDrag.earth.camera.lat, afterDrag.earth.camera.lon], [before.earth.camera.lat, before.earth.camera.lon]);
  await page.mouse.move(800, 450);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -240);
  await advance(page, 2);
  assert.ok((await state(page)).earth.camera.altitude < afterDrag.earth.camera.altitude, 'wheel zooms in');

  // Layer toggles.
  await page.locator('#layer-clouds').uncheck();
  assert.equal((await state(page)).earth.layers.clouds, false);
  await page.locator('#layer-clouds').check();

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'title');

  // Lifecycle: a version response that arrives while exploring must not reload; it applies on return to the title.
  let held;
  let capture;
  const intercepted = new Promise((resolve) => { capture = resolve; });
  await page.route('**/version.json', (route) => { held = route; capture(); });
  await page.reload(); await intercepted;
  await page.waitForFunction(() => !document.querySelector('#earth-button').hidden, null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Explore the Earth' }).click();
  await held.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'earth-test-build' }) });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).pendingUpdate);
  assert.equal((await state(page)).mode, 'explore');
  await page.unroute('**/version.json');
  const navigation = page.waitForEvent('domcontentloaded');
  await page.keyboard.press('Escape');
  await navigation;
  assert.deepEqual(errors, []);
  console.log('Earth browser passed: assets loaded, explore mode, Antananarivo targeting, antimeridian/pole flights, drag, wheel zoom, layer toggle, deferred update while exploring, refresh on return to title, no console errors.');
} finally { await browser.close(); }
