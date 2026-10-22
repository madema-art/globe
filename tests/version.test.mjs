import test from 'node:test';
import assert from 'node:assert/strict';
import { createVersionWatcher } from '../src/runtime/version.js';

test('new build reloads the title, but identical or unavailable versions do not', async () => {
  let reloads = 0;
  let version = { id: 'old' };
  const watcher = createVersionWatcher({ currentId: 'old', isTitle: () => true, fetchVersion: async () => version, reload: () => reloads++ });
  await watcher.check(); assert.equal(reloads, 0);
  version = {}; await watcher.check(); assert.equal(reloads, 0);
  version = { id: 'new' }; await watcher.check(); assert.equal(reloads, 1);
});

test('update response arriving during gameplay defers until return to title', async () => {
  let title = true;
  let complete;
  let reloads = 0;
  const watcher = createVersionWatcher({ currentId: 'old', isTitle: () => title, fetchVersion: () => new Promise(resolve => { complete = resolve; }), reload: () => reloads++ });
  const check = watcher.check();
  title = false; complete({ id: 'new' }); await check;
  assert.equal(watcher.pending, true); assert.equal(reloads, 0);
  watcher.titleEntered(); assert.equal(reloads, 0);
  title = true; watcher.titleEntered(); assert.equal(reloads, 1);
});

test('network failure never reloads a session', async () => {
  let reloads = 0;
  const watcher = createVersionWatcher({ currentId: 'old', isTitle: () => true, fetchVersion: async () => { throw new Error('offline'); }, reload: () => reloads++ });
  await watcher.check(); assert.equal(reloads, 0);
});
