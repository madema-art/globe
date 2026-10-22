import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, cp, writeFile, readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readHostSettings, prepareRelease } from '../scripts/content/release-plugin.mjs';
import { createLibraryHost, centreToWgs84 } from '../src/app/library-host.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function fixture(config) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'globe-release-'));
  await cp(path.join(root, 'content/library/research'), path.join(dir, 'content/library/research'), { recursive: true });
  if (config) await writeFile(path.join(dir, 'launcher.config.json'), JSON.stringify(config));
  return dir;
}

test('host settings: stable defaults to production; only a committed setting selects development', async () => {
  const stable = await fixture({ branch: 'main', firstPort: 8765 });
  assert.deepEqual(await readHostSettings(stable), { channel: 'production', firstPort: 8765 });
  const preview = await fixture({ branch: 'preview', firstPort: 8775, contentChannel: 'development' });
  assert.deepEqual(await readHostSettings(preview), { channel: 'development', firstPort: 8775 });
  const bad = await fixture({ contentChannel: 'everything' });
  await assert.rejects(readHostSettings(bad), /INVALID_CONTENT_CHANNEL/);
  assert.equal((await readHostSettings(await mkdtemp(path.join(os.tmpdir(), 'globe-empty-')))).channel, 'production');
});

test('release preparation keeps the approval gate: production is empty, development is all 51 provisional records', async () => {
  const dir = await fixture();
  const production = await prepareRelease(dir, 'production');
  assert.equal(production.published, 0, 'no unapproved record reaches production');
  const development = await prepareRelease(dir, 'development');
  assert.equal(development.published, 51);
  const catalog = JSON.parse(await readFile(path.join(development.release, 'catalog.json'), 'utf8'));
  assert.equal(catalog.channel, 'development');
  assert.ok(catalog.entries.every((entry) => entry.approved === false), 'approval flags are never changed');
  assert.equal(JSON.stringify(catalog).includes('"clues"'), false, 'the catalog holds metadata, not clues');
  await access(path.join(dir, '.library/development/current.json'));
  // Source records are untouched by publication.
  for (const id of ['m000001', 'm000051']) {
    assert.equal(await readFile(path.join(dir, `content/library/research/records/${id}.json`), 'utf8'), await readFile(path.join(root, `content/library/research/records/${id}.json`), 'utf8'));
  }
  assert.equal(await prepareRelease(await mkdtemp(path.join(os.tmpdir(), 'globe-none-')), 'development'), null, 'no content directory, no release');
});

test('centre reading converts the reticle point to normalized WGS84 { latitude, longitude }', () => {
  assert.deepEqual(centreToWgs84({ lat: -18.9, lon: 47.5 }), { latitude: -18.9, longitude: 47.5 });
  assert.deepEqual(centreToWgs84({ lat: 10, lon: 180 }), { latitude: 10, longitude: -180 });
  assert.deepEqual(centreToWgs84({ lat: 10, lon: -180 }), { latitude: 10, longitude: -180 });
  assert.deepEqual(centreToWgs84({ lat: 0, lon: 359.5 }), { latitude: 0, longitude: -0.5 });
  assert.equal(centreToWgs84(null), null);
  assert.equal(centreToWgs84({ lat: NaN, lon: 0 }), null);
});

function memoryStorage() { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) }; }
const locks = { request: (key, operation) => operation() };
const earth = { pickCenter: () => null, navigateTo: async () => ({ completed: true }) };

test('the host reader is strict: failed responses, HTML and channel mismatches are errors, never fallbacks', async () => {
  const jsonResponse = (value, type = 'application/json') => ({ ok: true, headers: { get: () => type }, json: async () => value });
  const html = createLibraryHost({ earth, channel: 'development', base: '/b/', storage: memoryStorage(), locks, fetchImpl: async () => jsonResponse({}, 'text/html') });
  await assert.rejects(html.ready(), (error) => error.code === 'CONTENT_UNAVAILABLE');
  const missing = createLibraryHost({ earth, channel: 'development', base: '/b/', storage: memoryStorage(), locks, fetchImpl: async () => ({ ok: false, headers: { get: () => 'application/json' } }) });
  await assert.rejects(missing.ready(), (error) => error.code === 'CONTENT_UNAVAILABLE');
  const mismatch = createLibraryHost({ earth, channel: 'production', base: '/b/', storage: memoryStorage(), locks, fetchImpl: async () => jsonResponse({ version: 'abcdef0123', channel: 'development' }) });
  await assert.rejects(mismatch.ready(), (error) => error.code === 'CONTENT_CHANNEL_MISMATCH');
  const requested = [];
  const traversal = createLibraryHost({ earth, channel: 'development', base: '/b/', storage: memoryStorage(), locks, fetchImpl: async (u) => { requested.push(u); return jsonResponse(u.endsWith('current.json') ? { version: '../../x', channel: 'development' } : {}); } });
  await assert.rejects(traversal.ready(), (error) => error.code === 'CONTENT_UNAVAILABLE');
  assert.deepEqual(requested, ['/b/library/development/current.json'], 'an invalid pinned version is never followed');
});

test('the host plays the real development release through the async bridge with isolated progress', async () => {
  const dir = await fixture();
  const release = await prepareRelease(dir, 'development');
  const fetchImpl = async (url) => {
    const relative = url.replace('/b/library/development/', '');
    if (relative === 'current.json') return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ version: release.version, channel: 'development' }) };
    const file = path.join(release.release, relative.replace(`releases/${release.version}/`, ''));
    try { const text = await readFile(file, 'utf8'); return { ok: true, headers: { get: () => 'application/json' }, json: async () => JSON.parse(text) }; }
    catch { return { ok: false, headers: { get: () => 'text/plain' } }; }
  };
  const storage = memoryStorage();
  const navigations = [];
  const host = createLibraryHost({
    channel: 'development', base: '/b/', storage, locks, fetchImpl,
    earth: { pickCenter: () => ({ lat: 12.5, lon: 190 }), navigateTo: (lat, lon, { signal, mark }) => { navigations.push({ mark, aborted: () => signal.aborted }); return new Promise(() => {}); } },
  });
  const views = [];
  host.onView((view) => views.push(view));
  const bridge = await host.ready();
  assert.equal(host.catalogSize, 51);
  const opened = await bridge.openNext();
  assert.equal(opened.accepted, true);
  assert.equal(opened.view.provisional, true);
  assert.equal(opened.view.answer, undefined, 'no answer before reveal');
  assert.equal(navigations.length, 0, 'no navigation before reveal');
  const confirmed = await bridge.confirmSelection();
  assert.equal(confirmed.accepted, true);
  assert.deepEqual(confirmed.view.answer.selectedCoordinates, { latitude: 12.5, longitude: -170 }, 'normalized reticle point submitted');
  assert.equal(navigations.length, 1);
  assert.equal(navigations[0].mark, true);
  await host.exit();
  assert.equal(navigations[0].aborted(), true, 'leaving aborts the reveal flight');
  assert.equal(storage.getItem('globe.education.progress'), null, 'production progress untouched');
  assert.ok(storage.getItem('globe.education.development.progress'), 'development progress saved separately');
  assert.ok(views.length >= 2);
});
