import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryAdapter } from './fixtures/library.mjs';
import { ProgressRepository, emptyProgress, encodeProgress, decodeProgress, validateProgress, createBrowserProgressAdapter } from '../src/game/library/progress.js';

test('locked transactions persist across repository instances and concurrent writers', async () => {
  const adapter = memoryAdapter(), a = new ProgressRepository({ adapter, seed: 'fixed' }), b = new ProgressRepository({ adapter, seed: 'ignored' });
  await Promise.all(Array.from({ length: 50 }, (_, i) => (i % 2 ? b : a).transaction(saved => { saved.sequence++; })));
  const saved = await b.inspect(); assert.equal(saved.sequence, 50); assert.equal(saved.revision, 50); assert.equal(saved.seed, 'fixed');
});
test('corruption, unsupported versions and storage failures never reset saved history', async () => {
  const adapter = memoryAdapter(), repository = new ProgressRepository({ adapter, seed: 'fixed' });
  await repository.transaction(saved => { saved.sequence = 7; }); const good = adapter.read();
  adapter.corrupt('{broken'); await assert.rejects(() => repository.transaction(() => {}), { code: 'CORRUPT_PROGRESS' }); assert.equal(adapter.read(), '{broken');
  adapter.corrupt(good); adapter.fail = true;
  await assert.rejects(() => repository.transaction(saved => { saved.sequence++; }), { code: 'STORAGE_FAILURE' }); assert.equal(adapter.read(), good);
  assert.throws(() => decodeProgress(good.replace('fixed', 'other')), { code: 'CORRUPT_PROGRESS' });
  assert.throws(() => validateProgress({ schemaVersion: 999 }), { code: 'UNSUPPORTED_VERSION' });
  const old = { ...emptyProgress(), schemaVersion: 1 }; delete old.aliasesApplied;
  assert.equal(validateProgress(old).schemaVersion, 2);
});
test('backup recovery is explicit and refuses invalid backup bytes', async () => {
  const adapter = memoryAdapter(), repository = new ProgressRepository({ adapter, seed: 'fixed' });
  await repository.transaction(saved => { saved.sequence = 1; }); await repository.transaction(saved => { saved.sequence = 2; });
  adapter.corrupt('damaged'); await assert.rejects(() => repository.inspect());
  await repository.recoverBackup(); assert.equal((await repository.inspect()).sequence, 1);
  await assert.rejects(() => repository.recoverBackup(), { code: 'CORRUPT_PROGRESS' });
});
test('browser adapter requires cross-tab locking and preserves a prior snapshot', async () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const unsupported = createBrowserProgressAdapter({ storage, locks: null });
  assert.throws(() => unsupported.withLock(() => {}), { code: 'LOCK_UNAVAILABLE' });
  const adapter = createBrowserProgressAdapter({ storage, locks: { request: async (_key, callback) => callback() } });
  await adapter.withLock(() => adapter.write(encodeProgress(emptyProgress('one'))));
  adapter.write(encodeProgress(emptyProgress('two')));
  assert.equal(decodeProgress(adapter.backup()).seed, 'one');
});
