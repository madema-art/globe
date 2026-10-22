import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { stateDir, root, json, run } from '../scripts/common.mjs';

await run(process.execPath, ['scripts/launcher.mjs', '--no-browser']);
const state = await json(path.join(stateDir, 'server.json'));
const url = `http://127.0.0.1:${state.port}/`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url); await page.waitForFunction(() => Boolean(window.render_game_to_text));
  assert.equal(JSON.parse(await page.evaluate(() => window.render_game_to_text())).mode, 'title');
  await mkdir(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results', 'title.png') });
  await page.getByRole('button', { name: 'About Histography' }).click();
  assert.equal(JSON.parse(await page.evaluate(() => window.render_game_to_text())).mode, 'vision');
  await page.screenshot({ path: path.join(root, 'test-results', 'vision.png') });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#title').isVisible(), true);
  await page.keyboard.press('f');
  await page.waitForFunction(() => Boolean(document.fullscreenElement));
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.fullscreenElement);
  // Hold an initial title check until after navigation. A late response may not refresh the vision/session.
  let held;
  let capture;
  const intercepted = new Promise(resolve => { capture = resolve; });
  await page.route('**/version.json', route => { held = route; capture(); });
  await page.reload(); await intercepted;
  await page.getByRole('button', { name: 'About Histography' }).click();
  await held.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'future-build' }) });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).pendingUpdate);
  assert.equal(JSON.parse(await page.evaluate(() => window.render_game_to_text())).mode, 'vision');
  await page.unroute('**/version.json');
  const navigation = page.waitForEvent('domcontentloaded');
  await page.getByRole('button', { name: 'Return to the title' }).click();
  await navigation;
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'title');
  // Use real production polling interval: new version causes title refresh after about 20 seconds.
  let checks = 0;
  await page.route('**/version.json', async route => {
    checks++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'poll-test' }) });
    await page.unroute('**/version.json');
  });
  await page.waitForEvent('domcontentloaded', { timeout: 30_000 });
  assert.equal(checks, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => Boolean(window.render_game_to_text));
  await page.screenshot({ path: path.join(root, 'test-results', 'mobile.png') });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('Browser passed: title/vision, Escape, fullscreen, late-response deferral, return-to-title refresh, 20-second production polling, mobile layout, no console errors.');
} finally { await browser.close(); }
