import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, entry, authored, lazyFixture } from './fixtures/library.mjs';
import { validateCatalog, selectNext, reconcileProgress } from '../src/game/library/catalog.js';
import { emptyProgress } from '../src/game/library/progress.js';

function present(progress, item) {
  progress.sequence++;
  progress.entries[item.id] = { presented: 1, revealed: true, completed: true, lastPresented: progress.sequence, contentVersion: item.contentVersion };
  progress.recent.push(item); progress.recent = progress.recent.slice(-100);
}
test('10,000 metadata records load without fetching answer records; selection is seeded and order independent', async () => {
  const entries = Array.from({ length: 10000 }, (_, i) => entry(i + 1));
  const large = validateCatalog(catalog(entries)), progress = emptyProgress('fixed-seed');
  const first = selectNext(large, progress);
  assert.equal(first.entry.id, selectNext(catalog([...entries].reverse()), progress).entry.id);
  const seen = new Set();
  for (let i = 0; i < 120; i++) { const selected = selectNext(large, progress).entry; assert.equal(seen.has(selected.id), false); seen.add(selected.id); present(progress, selected); }
  assert.equal(seen.size, 120);
  const fixture = lazyFixture(); assert.equal(fixture.reads.length, 0);
  await fixture.library.load('m900001'); assert.equal(fixture.reads.length, 3);
  fixture.files.get('locales/en/m900001.json').explanation += ' changed';
  await assert.rejects(() => fixture.library.load('m900001'), error => error.code === 'CONTENT_UNAVAILABLE');
});
test('diversity prevents region, era, category and kind streaks when alternatives exist', () => {
  const pool = catalog(Array.from({ length: 120 }, (_, i) => entry(i + 1))), progress = emptyProgress('balance');
  for (let i = 0; i < 40; i++) {
    const next = selectNext(pool, progress).entry, recent = progress.recent;
    for (const [field, limit] of [['region', 2], ['era', 3], ['category', 2], ['kind', 2]]) {
      if (recent.length >= limit && recent.slice(-limit).every(item => item[field] === next[field])) assert.fail(`Unexpected ${field} streak`);
    }
    present(progress, next);
  }
});
test('related subjects and shared destinations are spaced; scarcity falls back without repeating', () => {
  const prior = entry(1), same = entry(2), related = entry(3), topic = entry(4), fresh = entry(5);
  same.destinationKey = prior.destinationKey; related.relatedIds = [prior.id]; topic.subjectKeys = prior.subjectKeys;
  const progress = emptyProgress(); present(progress, prior);
  assert.equal(selectNext(catalog([prior, same, related, topic, fresh]), progress).entry.id, fresh.id);
  assert.equal(selectNext(catalog([prior, same]), progress).entry.id, same.id);
  present(progress, same); assert.equal(selectNext(catalog([prior, same]), progress).state, 'CONTENT_EXHAUSTED');
  assert.equal(selectNext(catalog([]), progress).state, 'NO_APPROVED_CONTENT');
  assert.throws(() => selectNext(catalog([fresh]), progress, { maxRegionRun: 1.5 }));
});
test('additions, removals, revisions and aliases preserve presented tombstones without double migration', () => {
  const old = entry(1), revised = { ...old, contentVersion: 2 }, fresh = entry(2), progress = emptyProgress(); present(progress, old);
  assert.equal(selectNext(catalog([revised, fresh]), progress).entry.id, fresh.id);
  assert.equal(selectNext(catalog([]), progress).state, 'NO_APPROVED_CONTENT');
  assert.equal(selectNext(catalog([old]), progress).state, 'CONTENT_EXHAUSTED');
  const renamed = { ...entry(3), aliases: [old.id] };
  const migrated = reconcileProgress(progress, catalog([renamed, fresh]));
  assert.equal(migrated.entries[renamed.id].presented, 1);
  assert.deepEqual(reconcileProgress(migrated, catalog([renamed, fresh])), migrated);
  assert.equal(selectNext(catalog([renamed, fresh]), migrated).entry.id, fresh.id);
  assert.throws(() => validateCatalog(catalog([old, { ...fresh, aliases: [old.id] }])));
});
