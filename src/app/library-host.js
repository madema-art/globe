// Host adapter between Codex's persistent library (LibraryPlayer + createLibraryEarthBridge) and the
// Earth/interface. It owns no game rules: it supplies capabilities (pinned JSON reader, browser progress
// storage, WGS84 centre reading, abortable navigation) as docs/LIBRARY_INTEGRATION.md describes, and relays
// the bridge's committed safe views. Nothing here logs or renders records, catalogs or selections.
import {
  LazyMysteryLibrary, ProgressRepository, createBrowserProgressAdapter, LibraryPlayer, createLibraryEarthBridge,
} from '../game/library/index.js';

const VERSION = /^[0-9a-f]{8,64}$/;
// Library-relative files the loader may request inside a pinned release; anything else is refused.
const RELATIVE = /^(?:catalog\.json|(?:records|digests)\/m\d{6}\.json|locales\/[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*\/m\d{6}\.json)$/;

export class HostError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/** Fetch JSON strictly: network failure, non-2xx, non-JSON media type or bad JSON are all failures. */
async function fetchJson(url, fetchImpl) {
  let response;
  try { response = await fetchImpl(url); } catch { throw new HostError('CONTENT_UNAVAILABLE'); }
  if (!response.ok || !/^application\/json\b/i.test(response.headers.get('content-type') || '')) throw new HostError('CONTENT_UNAVAILABLE');
  try { return await response.json(); } catch { throw new HostError('CONTENT_UNAVAILABLE'); }
}

/** WGS84 point under the fixed centre reticle, in the bridge's { latitude, longitude } form. */
export function centreToWgs84(point) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
  const latitude = Math.max(-90, Math.min(90, point.lat));
  let longitude = ((point.lon + 180) % 360 + 360) % 360 - 180; // [-180, 180)
  if (Object.is(longitude, -0)) longitude = 0;
  return { latitude, longitude };
}

export function createLibraryHost({
  earth, channel, base, fetchImpl = (url) => fetch(url, { credentials: 'same-origin' }),
  storage = globalThis.localStorage, locks = globalThis.navigator?.locks, revealAltitude = 2.05,
}) {
  if (!['production', 'development'].includes(channel)) throw new TypeError('Invalid content channel.');
  const root = `${base.replace(/\/?$/, '/')}library/${channel}/`;
  const listeners = new Set();
  const errorListeners = new Set();
  let loading = null;
  let bridge = null;
  let repository = null;
  let catalogSize = 0;
  let exiting = null;

  async function load() {
    const pointer = await fetchJson(`${root}current.json`, fetchImpl);
    if (!pointer || (pointer.channel ?? 'production') !== channel) throw new HostError('CONTENT_CHANNEL_MISMATCH');
    if (!VERSION.test(pointer.version || '')) throw new HostError('CONTENT_UNAVAILABLE');
    // Every later read is pinned to this immutable release for the lifetime of the page.
    const release = `${root}releases/${pointer.version}/`;
    const readJson = (relative) => {
      if (typeof relative !== 'string' || !RELATIVE.test(relative)) return Promise.reject(new HostError('CONTENT_UNAVAILABLE'));
      return fetchJson(release + relative, fetchImpl);
    };
    const catalog = await readJson('catalog.json');
    if ((catalog?.channel || 'production') !== channel) throw new HostError('CONTENT_CHANNEL_MISMATCH');
    let library;
    try {
      library = new LazyMysteryLibrary({ catalog, locale: 'en', allowDevelopment: channel === 'development', readJson });
    } catch (error) { throw new HostError(error.code || 'CONTENT_UNAVAILABLE'); }
    catalogSize = library.getCatalog().entries.length;
    let adapter;
    try { adapter = createBrowserProgressAdapter({ channel, storage, locks }); }
    catch { throw new HostError('STORAGE_FAILURE'); }
    repository = new ProgressRepository({ channel, adapter });
    const player = new LibraryPlayer({ library, repository, locale: 'en' });
    bridge = createLibraryEarthBridge({
      player,
      readCenter: () => centreToWgs84(earth.pickCenter()),
      // Reached only after a committed reveal; the signal stops the camera flight when it is superseded.
      navigateTo: ({ latitude, longitude }, { signal }) => earth.navigateTo(latitude, longitude, { signal, mark: true, altitude: revealAltitude }),
      onView: (view) => { for (const listener of [...listeners]) { try { listener(view); } catch { /* observer isolation */ } } },
      onError: ({ code }) => { for (const listener of [...errorListeners]) { try { listener(code); } catch { /* observer isolation */ } } },
    });
    return bridge;
  }

  return {
    channel,
    /** Load the catalog once (lazy, on the first mystery). Rejects with a HostError code. */
    async ready() {
      if (exiting) await exiting;
      loading ??= load().catch((error) => { loading = null; throw error instanceof HostError ? error : new HostError(error?.code || 'CONTENT_UNAVAILABLE'); });
      return loading;
    },
    get bridge() { return bridge; },
    get catalogSize() { return catalogSize; },
    onView(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    onError(listener) { errorListeners.add(listener); return () => errorListeners.delete(listener); },
    /** Leave gameplay: cancels picks/navigation at once; later bridge use waits for the in-flight write. */
    exit() {
      if (!bridge) return Promise.resolve();
      exiting = bridge.exit().catch(() => {}).finally(() => { exiting = null; });
      return exiting;
    },
    /** Raw stored progress text (for a player-initiated copy before any recovery). */
    rawProgress() {
      const key = channel === 'development' ? 'globe.education.development.progress' : 'globe.education.progress';
      try { return storage.getItem(key); } catch { return null; }
    },
    async recoverBackup() {
      if (!repository) throw new HostError('STORAGE_FAILURE');
      try { await repository.recoverBackup(); } catch (error) { throw new HostError(error.code || 'STORAGE_FAILURE'); }
    },
  };
}
