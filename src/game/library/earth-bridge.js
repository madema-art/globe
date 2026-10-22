// Async capability boundary for LibraryPlayer. No renderer, input binding or UI.
// The host routes every lifecycle action through this facade and honours signals.
export function createLibraryEarthBridge({ player, readCenter, navigateTo, onView = () => {}, onError = () => {} }) {
  if (!player || typeof readCenter !== 'function' || typeof navigateTo !== 'function') throw new TypeError('Async player and Earth capabilities are required.');
  let epoch = 0, pending = null, navigation = null, busy = null, closing = null, closingNow = false, disposed = false;
  const report = code => { try { onError({ code }); } catch { /* observer isolation */ } };
  const emit = () => { if (!disposed) { try { onView(player.getView()); } catch { /* observer isolation */ } } };
  const invalidate = () => { epoch++; pending?.controller.abort(); pending = null; navigation?.abort(); navigation = null; };
  function navigate() {
    if (disposed || player.getView().state !== 'ANSWER_REVEAL') return;
    const target = player.getNavigationTarget(); if (!target) return;
    const controller = new AbortController(); navigation = controller;
    try {
      Promise.resolve(navigateTo(target, { signal: controller.signal })).catch(() => { if (!controller.signal.aborted && !disposed) report('NAVIGATION_FAILED'); });
    } catch { if (!controller.signal.aborted && !disposed) report('NAVIGATION_FAILED'); }
  }
  async function act(name, ...args) {
    if (disposed) return { accepted: false, reason: 'DISPOSED' };
    if (busy || closingNow) return { accepted: false, reason: 'BUSY' };
    invalidate(); const token = epoch;
    const job = (async () => {
      let result;
      try { result = await player[name](...args); }
      catch { report('PLAYER_ACTION_FAILED'); return { accepted: false, reason: 'PLAYER_ACTION_FAILED' }; }
      // A committed write cannot be undone by cancellation. Suppress its stale
      // result/view while exit waits for that write and closes the player.
      if (disposed || token !== epoch) return { accepted: false, reason: disposed ? 'DISPOSED' : 'SUPERSEDED' };
      emit(); if (result.accepted && token === epoch && !closingNow) navigate();
      return result;
    })();
    busy = job;
    try { return await job; } finally { if (busy === job) busy = null; }
  }
  async function close(dispose = false) {
    if (dispose) disposed = true;
    if (closingNow) return closing || { accepted: false, reason: 'BUSY' };
    closingNow = true;
    invalidate();
    const job = (async () => {
      if (busy) await busy;
      const result = player.exit(); emit(); return result;
    })();
    closing = job;
    try { return await job; } finally { if (closing === job) { closing = null; closingNow = false; } }
  }
  return {
    getView: () => player.getView(),
    openNext: () => act('openNext'), resume: options => act('resume', options),
    requestNextClue: () => act('requestNextClue'), revealAnswer: () => act('revealAnswer'),
    continue: () => act('continue'), archivePending: () => act('archivePending'),
    async confirmSelection() {
      if (disposed) return { accepted: false, reason: 'DISPOSED' };
      if (closingNow || busy) return { accepted: false, reason: 'BUSY' };
      if (pending) return { accepted: false, reason: 'SELECTION_PENDING' };
      if (!player.getView().canSubmit) return { accepted: false, reason: 'NOT_ACTIVE' };
      const request = { epoch, controller: new AbortController() }; pending = request;
      const signal = request.controller.signal;
      let abort;
      try {
        const cancelled = new Promise(resolve => { abort = () => resolve({ cancelled: true }); signal.addEventListener('abort', abort, { once: true }); });
        const read = Promise.resolve(readCenter({ signal })).then(coordinates => ({ coordinates }));
        const result = await Promise.race([read, cancelled]);
        if (disposed) return { accepted: false, reason: 'DISPOSED' };
        if (result.cancelled || signal.aborted || request.epoch !== epoch) return { accepted: false, reason: 'STALE_SELECTION' };
        if (pending === request) pending = null;
        if (result.coordinates === null || result.coordinates === undefined) return { accepted: false, reason: 'CENTER_UNAVAILABLE' };
        return await act('submitSelection', result.coordinates);
      } catch {
        const reason = disposed ? 'DISPOSED' : signal.aborted ? 'STALE_SELECTION' : 'CENTER_UNAVAILABLE';
        if (reason === 'CENTER_UNAVAILABLE') report(reason);
        return { accepted: false, reason };
      } finally { signal.removeEventListener('abort', abort); if (pending === request) pending = null; }
    },
    exit: () => close(), dispose: () => close(true),
  };
}
