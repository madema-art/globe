// All transitions into the title must pass through titleEntered().
// A response arriving after the player starts a game must never reload it.
export function createVersionWatcher({ currentId, isTitle, fetchVersion, reload }) {
  let pending = false;
  const apply = () => { if (pending && isTitle()) reload(); };
  return {
    async check() {
      try {
        const version = await fetchVersion();
        if (version.id && version.id !== currentId) pending = true;
        apply();
      } catch { /* Offline or a build in progress: retain the current session. */ }
    },
    titleEntered: apply,
    get pending() { return pending; },
  };
}
