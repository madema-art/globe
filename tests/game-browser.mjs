import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { stateDir, root, json, run } from '../scripts/common.mjs';
import { encodeProgress, emptyProgress } from '../src/game/library/progress.js';

// Integrated first-playable journey on the launcher-served production build (not the Vite dev server):
// the real persistent library on the preview's development channel, Earth picking/navigation, controller
// (synthetic standard gamepad), keyboard and mouse, persistence, resume, selection without repeats,
// exhaustion, content and storage failures, and channel isolation.
//
// Spoiler policy: this test reads clue/answer text only to make assertions and never prints it.
// Failure messages name fixed facts (counts, phases, codes), not content.
let url = process.env.GLOBE_TEST_URL;
if (!url) {
  await run(process.execPath, ['scripts/launcher.mjs', '--no-browser']);
  const state = await json(path.join(stateDir, 'server.json'));
  url = `http://127.0.0.1:${state.port}/`;
}
const target = new URL(url);
target.searchParams.set('earth', 'low');
const DEV_KEY = 'globe.education.development.progress';
const PROD_KEY = 'globe.education.progress';
const browser = await chromium.launch({ headless: true, executablePath: process.env.GLOBE_CHROMIUM || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = path.join(root, 'test-results');
await mkdir(results, { recursive: true });

// English localizations of the 51 authored records, read only to check that no answer text is bundled.
const localeDir = path.join(root, 'content/library/research/locales/en');
const identities = await Promise.all((await readdir(localeDir)).filter((f) => f.endsWith('.json')).map(async (f) => JSON.parse(await readFile(path.join(localeDir, f), 'utf8')).identity));

async function openPage({ storage = null, viewport = { width: 1600, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !/favicon|Failed to load resource/.test(message.text())) errors.push(message.text()); });
  const libraryRequests = [];
  page.on('request', (request) => { const u = request.url(); if (u.includes('/library/')) libraryRequests.push(u.replace(/^.*\/library\//, '')); });
  await page.addInitScript(([seed, key]) => {
    if (seed !== null && !sessionStorage.getItem('seeded')) { localStorage.setItem(key, seed); sessionStorage.setItem('seeded', '1'); }
    const pad = { index: 0, id: 'Synthetic Xbox-style standard gamepad', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pads = [pad];
    window.__press = (index, down) => { pad.buttons[index].value = down ? 1 : 0; pad.buttons[index].pressed = down; };
    navigator.getGamepads = () => window.__pads;
    window.requestAnimationFrame = () => 0; // deterministic: frames only through advanceTime()
  }, [storage, DEV_KEY]);
  const g = {
    page, context, errors, libraryRequests,
    advance: (seconds) => page.evaluate((s) => window.advanceTime(s * 1000), seconds),
    async tap(index) { await page.evaluate((i) => window.__press(i, true), index); await g.advance(0.05); await page.evaluate((i) => window.__press(i, false), index); await g.advance(0.05); },
    snapshot: () => page.evaluate(() => JSON.parse(window.render_game_to_text())),
    mystery: () => page.evaluate(() => JSON.parse(window.render_game_to_text()).mystery),
    // Async library steps run on real tasks; frames are stepped while waiting.
    async until(predicate, arg, label, timeout = 60_000) {
      const end = Date.now() + timeout;
      for (;;) {
        if (await page.evaluate(predicate, arg)) return;
        if (Date.now() > end) throw new Error(`Timed out waiting for ${label}; mystery state ${JSON.stringify(await g.mystery())}`);
        await page.waitForTimeout(100); // async library steps need tasks, not frames
      }
    },
    phase: (name) => g.until((n) => JSON.parse(window.render_game_to_text()).mystery?.phase === n && !JSON.parse(window.render_game_to_text()).mystery.busy, name, `phase ${name}`),
    clueCount: (n) => g.until((c) => { const m = JSON.parse(window.render_game_to_text()).mystery; return m.revealedClueCount === c && !m.busy; }, n, `${n} clues`),
    progress: () => page.evaluate((key) => { const raw = localStorage.getItem(key); return raw && JSON.parse(JSON.parse(raw).payload); }, DEV_KEY),
    clueStates: () => page.evaluate(() => [...document.querySelectorAll('.clue')].map((c) => c.dataset.state)),
  };
  await page.goto(target.href);
  await page.waitForFunction(() => window.render_game_to_text && !document.querySelector('#mystery-button').disabled, null, { timeout: 180_000, polling: 250 });
  await g.advance(0.5);
  return g;
}
const started = Date.now();
const step = (label) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${label}`);
const englishOnly = (texts) => texts.every((t) => t.length > 10 && !/[　-ヿ㐀-鿿＀-￯]/.test(t));

try {
  // ---------------------------------------------------------------- branding, first launch, isolation
  step('branding, first launch, isolation');
  let g = await openPage();
  let { page } = g;
  assert.equal(await page.title(), 'Histography Preview');
  assert.equal((await page.locator('#title-heading').textContent()).trim(), 'Histography');
  assert.equal(await page.locator('#title-heading').evaluate((el) => getComputedStyle(el).textTransform), 'uppercase', 'wordmark set in capitals');
  assert.equal(await page.locator('#title > :not(h1):not(nav)').count(), 0, 'no tagline or subtitle on the title');
  assert.equal(await page.locator('.title-lede').count(), 0);
  assert.ok(await page.getByRole('button', { name: /About Histography/ }).isVisible());
  assert.equal(await page.locator('body').getAttribute('data-edition'), 'preview');
  assert.ok(await page.locator('.edition-mark').isVisible(), 'unobtrusive preview mark');
  assert.equal(await page.evaluate(() => document.body.innerText.includes('Globe')), false, 'no player-facing Globe branding');
  assert.equal((await g.snapshot()).contentChannel, 'development');
  assert.equal(g.libraryRequests.length, 0, 'the library is not loaded until a mystery is requested');
  // No answer text in the JavaScript bundle (content is fetched lazily from the pinned release).
  const scripts = await page.evaluate(() => [...document.scripts].map((s) => s.src).filter(Boolean));
  for (const src of scripts) {
    const code = await (await page.request.get(src)).text();
    assert.equal(identities.filter((name) => code.includes(name)).length, 0, 'bundle contains no mystery identities');
  }
  await page.screenshot({ path: path.join(results, 'game-title.png'), timeout: 120_000 });

  // ---------------------------------------------------------------- begin with controller A
  step('begin with controller A');
  await g.tap(0); // focus starts on "Begin a mystery"
  await g.phase('clues');
  let m = await g.mystery();
  assert.equal(m.catalogSize, 51, 'all 51 provisional mysteries available');
  assert.equal(m.provisional, true);
  assert.equal(m.revealedClueCount, 1);
  assert.match(m.mysteryId, /^m\d{6}$/);
  const first = m.mysteryId;
  assert.deepEqual((await g.clueStates()).map((x) => x === 'locked'), [false, true, true, true, true], 'clue I only');
  assert.ok(englishOnly(await page.locator('.clue-text').allTextContents().then((t) => t.slice(0, 1))), 'natural English clue');
  assert.deepEqual(g.libraryRequests.map((u) => u.replace(/m\d{6}/, 'ID').replace(/releases\/[0-9a-f]+/, 'R')).sort(),
    ['development/R/catalog.json', 'development/R/digests/ID.json', 'development/R/locales/en/ID.json', 'development/R/records/ID.json', 'development/current.json'].sort(),
    'only the chosen record is fetched');
  let s = await page.evaluate(() => ({ earth: window.globeEarth.state(), policy: window.globeEarth.labelPolicy, answer: document.querySelector('.answer').innerHTML }));
  assert.equal(s.answer, '', 'no answer DOM before reveal');
  assert.equal(s.earth.target, null, 'no marker before reveal');
  assert.equal(s.policy, 'none', 'no place names during the investigation');
  assert.equal(s.earth.overlays.level, 1, 'mystery starts from the planetary view');
  assert.ok(s.earth.reticle, 'centre reticle shown');
  for (const layer of ['borders', 'rivers-major', 'rivers-regional', 'labels-continental', 'labels-regional', 'landmarks']) assert.ok(layer in s.earth.overlays.layers, `${layer} layer present`);
  assert.equal(await page.locator('.provenance').isVisible(), true, 'provisional content identified');
  let p = await g.progress();
  assert.equal(p.channel, 'development');
  assert.equal(p.active.id, first, 'presentation persisted before clue I was shown');

  // ---------------------------------------------------------------- clue progression, no duplicates
  step('clue progression, no duplicates');
  const revision = (await g.progress()).revision;
  await page.evaluate(() => window.__press(0, true)); // hold A across many frames: one clue only
  for (let i = 0; i < 6; i++) await g.advance(0.05);
  await g.clueCount(2);
  for (let i = 0; i < 6; i++) await g.advance(0.05);
  await page.evaluate(() => window.__press(0, false)); await g.advance(0.05);
  await page.waitForTimeout(300);
  assert.equal((await g.mystery()).revealedClueCount, 2, 'a held A requests exactly one clue');
  assert.equal((await g.progress()).revision, revision + 1, 'one persistent write');
  await page.keyboard.press('Space');
  await g.clueCount(3);
  assert.deepEqual((await g.clueStates()).map((x) => x === 'locked'), [false, false, false, true, true], 'earlier clues remain');

  // ---------------------------------------------------------------- resume after reload (persistence)
  step('resume after reload (persistence)');
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text && !document.querySelector('#mystery-button').disabled, null, { timeout: 180_000, polling: 250 });
  await g.advance(0.3);
  await page.click('#mystery-button');
  await g.phase('lobby');
  assert.equal((await g.mystery()).lobby, 'An unfinished mystery is waiting');
  assert.equal((await g.progress()).active.clueCount, 3, 'checkpoint untouched by the offer');
  await g.tap(0); // "Resume the mystery" is focused
  await g.phase('clues');
  m = await g.mystery();
  assert.equal(m.mysteryId, first, 'same mystery resumed');
  assert.equal(m.revealedClueCount, 3, 'revealed clues preserved');

  // ---------------------------------------------------------------- X confirms the WGS84 point under the reticle
  step('X confirms the WGS84 point under the reticle');
  await page.evaluate(() => { void window.globeEarth.navigateTo(35.5, 139.2, { altitude: 2.2 }); }); // frames are stepped below
  await g.advance(4);
  const aimed = await page.evaluate(() => window.globeEarth.pickCenter());
  assert.ok(Math.abs(aimed.lat - 35.5) < 0.3 && Math.abs(aimed.lon - 139.2) < 0.3, 'reticle picks the centred WGS84 point');
  const before = (await g.progress()).revision;
  await page.evaluate(() => window.__press(2, true)); // X held for several frames
  for (let i = 0; i < 5; i++) await g.advance(0.05);
  await page.evaluate(() => window.__press(2, false));
  await page.keyboard.press('KeyX'); // a second confirmation route during the pending one must coalesce
  await g.phase('reveal');
  await page.waitForTimeout(300);
  assert.equal((await g.progress()).revision, before + 1, 'exactly one committed confirmation');
  s = await page.evaluate(() => ({ text: document.querySelector('.answer').innerText, facts: [...document.querySelectorAll('.answer-facts dt')].map((d) => d.textContent), sources: document.querySelectorAll('.answer-sources li').length, policy: window.globeEarth.labelPolicy, reticle: window.globeEarth.state().reticle }));
  assert.ok(s.facts.includes('The place') && s.facts.includes('Your choice'), 'intended and selected locations shown');
  assert.ok(s.text.includes(`${Math.abs(aimed.lat).toFixed(2)}° N`) && s.text.includes(`${Math.abs(aimed.lon).toFixed(2)}° E`), 'selection equals the reticle point');
  assert.ok(s.sources > 0, 'sources listed');
  assert.equal(s.policy, 'all', 'names return after the reveal');
  assert.equal(s.reticle, false);
  assert.equal((await g.progress()).entries[first].revealed, true);
  // Reveal navigation flies to the true target (read from the revealed page, never printed).
  const place = await page.evaluate(() => {
    const dd = [...document.querySelectorAll('.answer-facts dt')].find((d) => d.textContent === 'The place').nextElementSibling.textContent;
    const [, la, ns, lo, ew] = dd.match(/([\d.]+)° ([NS]), ([\d.]+)° ([EW])/);
    return { lat: (ns === 'S' ? -1 : 1) * Number(la), lon: (ew === 'W' ? -1 : 1) * Number(lo) };
  });
  await g.advance(6);
  const view = (await g.snapshot()).earth;
  assert.ok(view.target, 'answer marker shown after the reveal');
  const dLon = Math.abs(((view.camera.lon - place.lon + 540) % 360) - 180);
  assert.ok(Math.abs(view.camera.lat - place.lat) < 1.5 && dLon < 1.5, 'globe travelled to the revealed place');

  // ---------------------------------------------------------------- continue -> idle -> deliberate next
  step('continue -> idle -> deliberate next');
  await g.tap(0);
  await g.phase('lobby');
  assert.equal((await g.mystery()).lobby, 'Ready for another?', 'continue returns to idle; no automatic next mystery');
  p = await g.progress();
  assert.equal(p.entries[first].completed, true);
  assert.equal(p.active, null);
  await g.advance(2);
  assert.equal((await g.mystery()).phase, 'lobby', 'still waiting for the player');
  await g.tap(0); // "Begin the next mystery"
  await g.phase('clues');
  const second = (await g.mystery()).mysteryId;
  assert.notEqual(second, first, 'a different mystery');
  assert.equal((await g.snapshot()).earth.overlays.level, 1, 'new mystery from the whole planet');

  // ---------------------------------------------------------------- fifth clue, explicit reveal (no confirmation)
  step('fifth clue, explicit reveal (no confirmation)');
  for (let i = 2; i <= 5; i++) { await g.tap(0); await g.clueCount(i); }
  assert.equal((await g.mystery()).viewState, 'CLUES_ACTIVE', 'clue V never reveals automatically');
  assert.equal(await page.locator('.next-label').textContent(), 'Reveal the answer');
  await g.tap(0);
  await g.phase('reveal');
  assert.ok(!(await page.locator('.answer-facts dt', { hasText: 'Your choice' }).count()), 'no selection when revealed without a guess');

  // ---------------------------------------------------------------- leaving during navigation cancels it
  step('leaving during navigation cancels it');
  await g.tap(1); // B immediately, while the reveal flight is under way
  assert.equal((await g.snapshot()).mode, 'title');
  await g.advance(6);
  s = (await g.snapshot()).earth;
  assert.equal(s.target, null, 'no marker after leaving');
  assert.ok(s.camera.altitude > 2.5, 'camera returned to the title instead of finishing the reveal flight');
  // Mouse: begin again, resume the revealed checkpoint, continue with a click.
  await page.click('#mystery-button');
  await g.phase('lobby');
  await page.getByRole('button', { name: /Resume the mystery/ }).click();
  await g.phase('reveal');
  assert.equal((await g.mystery()).mysteryId, second);
  await page.locator('.action[data-action="continue"]').click();
  await g.phase('lobby');

  // ---------------------------------------------------------------- set an unfinished mystery aside
  step('set an unfinished mystery aside');
  await page.getByRole('button', { name: /Begin the next mystery/ }).click();
  await g.phase('clues');
  const third = (await g.mystery()).mysteryId;
  await g.tap(1);
  await page.click('#mystery-button');
  await g.phase('lobby');
  await page.getByRole('button', { name: /Start a different mystery/ }).click();
  await g.phase('clues');
  const fourth = (await g.mystery()).mysteryId;
  p = await g.progress();
  assert.equal(new Set([first, second, third, fourth]).size, 4, 'no repeats while unseen mysteries remain');
  assert.equal(p.entries[third].presented, 1, 'set-aside mystery stays in history');
  // Diversity: the recent selections vary across metadata where the pool allows.
  assert.ok(new Set(p.recent.map((r) => `${r.region}|${r.kind}|${r.category}`)).size >= 2, 'diverse selection');
  // Isolation: development play never touches production progress.
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), PROD_KEY), null, 'production progress untouched');
  assert.deepEqual(g.errors, []);
  await g.context.close();

  // ---------------------------------------------------------------- final unseen mystery, then exhaustion
  step('final unseen mystery, then exhaustion');
  const build = (await (await fetch(`${url}version.json`)).json()).id;
  const libraryBase = `${url}builds/${build}/library/development/`;
  const pointer = await (await fetch(`${libraryBase}current.json`)).json();
  const catalog = await (await fetch(`${libraryBase}releases/${pointer.version}/catalog.json`)).json();
  const seen = emptyProgress('test-seed', 'development');
  const [last, ...rest] = catalog.entries;
  rest.forEach((entry, i) => { seen.entries[entry.id] = { presented: 1, revealed: true, completed: true, lastPresented: i + 1, contentVersion: entry.contentVersion }; });
  seen.sequence = rest.length;
  g = await openPage({ storage: encodeProgress(seen), viewport: { width: 1280, height: 720 } });
  page = g.page;
  await page.click('#mystery-button');
  await g.phase('clues');
  assert.equal((await g.mystery()).mysteryId, last.id, 'the final unseen mystery is offered');
  for (let i = 2; i <= 5; i++) { await page.keyboard.press('Space'); await g.clueCount(i); }
  await page.keyboard.press('Space');
  await g.phase('reveal');
  await page.keyboard.press('Space');
  await g.phase('lobby');
  await page.keyboard.press('Enter');
  await g.until(() => JSON.parse(window.render_game_to_text()).mystery?.lobby === 'You have met every mystery', null, 'exhaustion message');
  assert.equal((await g.progress()).active, null, 'exhaustion does not reset or repeat');
  assert.equal(Object.keys((await g.progress()).entries).length, 51, 'history kept');
  await page.screenshot({ path: path.join(results, 'game-exhausted-720.png'), timeout: 120_000 });
  assert.deepEqual(g.errors, []);
  await g.context.close();

  // ---------------------------------------------------------------- corrupted progress: no automatic reset
  step('corrupted progress: no automatic reset');
  g = await openPage({ storage: '{"format":"globe-progress/1","payload":"{}","checksum":"0"}' });
  page = g.page;
  await page.click('#mystery-button');
  await g.phase('lobby');
  assert.equal((await g.mystery()).lobby, 'Saved progress needs attention');
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), DEV_KEY), '{"format":"globe-progress/1","payload":"{}","checksum":"0"}', 'damaged record preserved');
  assert.ok(await page.getByRole('button', { name: /Restore the previous save/ }).isDisabled(), 'restore requires a saved copy first');
  await g.context.close();

  // ---------------------------------------------------------------- missing content: explicit error, no HTML fallback
  step('missing content: explicit error, no HTML fallback');
  g = await openPage();
  page = g.page;
  await page.route('**/library/development/releases/*/records/*.json', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>not json</title>' }));
  await page.click('#mystery-button');
  await g.phase('lobby');
  assert.equal((await g.mystery()).lobby, 'The library could not be opened', 'missing content is not reported as exhaustion');
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), DEV_KEY) === null || (await g.progress()).active === null, true, 'nothing presented without content');
  await page.unroute('**/library/development/releases/*/records/*.json');
  for (const missing of [`builds/${build}/library/development/releases/${pointer.version}/records/m999999.json`, 'library/development/current.json', `builds/${build}/library/production/current.json`]) {
    const response = await page.request.get(url + missing);
    assert.ok(!response.ok() || !/text\/html/.test(response.headers()['content-type'] || ''), 'missing library files never fall back to a page');
    assert.notEqual(response.status(), 200, 'missing library file is an error');
  }
  await g.context.close();

  console.log('Game browser passed: Histography branding without tagline, preview mark, lazy pinned development library (51 mysteries, provisional), English clues, clue I start, held-button and duplicate-confirmation suppression, persistence and resume after reload, WGS84 reticle confirmation, reveal with both locations and sources, reveal navigation, cancellation on leave, continue to idle and deliberate next mystery, fifth-clue explicit reveal, set-aside, no repeats, diverse selection, final unseen mystery and exhaustion, corrupted-progress and missing-content handling, production progress isolation, controller/keyboard/mouse.');
} finally { await browser.close(); }
