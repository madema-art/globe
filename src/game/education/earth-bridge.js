// These names belong to Globe's adapter, not to an assumed Claude API.
// Hosts supply readCenter({ signal }) -> coordinates|null (sync or async) and
// navigateTo(coordinates, { signal }) (sync or async, cancellation encouraged).
export function createEducationEarthBridge({ session, readCenter, navigateTo, onError = () => {} }) {
  if (typeof readCenter !== 'function' || typeof navigateTo !== 'function') throw new TypeError('Earth capabilities must be functions.');
  let disposed = false;
  let pending = null;
  let navigation = null;
  let navigationRevision = null;
  const report = (code) => { try { onError({ code }); } catch { /* host isolation */ } };
  function observe(view) {
    if (pending && pending.revision !== view.revision) { pending.controller.abort(); pending = null; }
    if (navigation && (view.state !== 'ANSWER_REVEAL' || view.revision !== navigationRevision)) { navigation.abort(); navigation = null; }
    if (disposed || view.state !== 'ANSWER_REVEAL' || navigationRevision === view.revision) return;
    const coordinates = session.getNavigationTarget();
    if (!coordinates) return;
    navigationRevision = view.revision;
    navigation = new AbortController();
    const controller = navigation;
    try {
      Promise.resolve(navigateTo(coordinates, { signal: controller.signal })).catch(() => {
        if (!controller.signal.aborted && !disposed) report('NAVIGATION_FAILED');
      });
    } catch { if (!controller.signal.aborted && !disposed) report('NAVIGATION_FAILED'); }
  }
  const unsubscribe = session.subscribe(observe);
  observe(session.getView());
  return {
    async confirmSelection() {
      if (disposed) return { accepted: false, reason: 'DISPOSED' };
      if (pending) return { accepted: false, reason: 'SELECTION_PENDING' };
      const view = session.getView();
      if (!view.canSubmit) return { accepted: false, reason: 'NOT_ACTIVE' };
      const request = { revision: view.revision, controller: new AbortController() };
      pending = request;
      try {
        const signal = request.controller.signal;
        const read = Promise.resolve(readCenter({ signal })).then(coordinates => ({ coordinates }));
        const cancelled = new Promise(resolve => {
          if (signal.aborted) resolve({ cancelled: true });
          else signal.addEventListener('abort', () => resolve({ cancelled: true }), { once: true });
        });
        const result = await Promise.race([read, cancelled]);
        if (disposed) return { accepted: false, reason: 'DISPOSED' };
        if (result.cancelled) return { accepted: false, reason: 'STALE_SELECTION' };
        return session.submitSelection(result.coordinates, { expectedRevision: view.revision });
      } catch {
        if (disposed) return { accepted: false, reason: 'DISPOSED' };
        if (request.controller.signal.aborted) return { accepted: false, reason: 'STALE_SELECTION' };
        report('CENTER_UNAVAILABLE'); return { accepted: false, reason: 'CENTER_UNAVAILABLE' };
      }
      finally { if (pending === request) pending = null; }
    },
    dispose() { disposed = true; unsubscribe(); pending?.controller.abort(); pending = null; navigation?.abort(); navigation = null; },
  };
}
