import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadMysteryLibrary, MysterySession, ContentValidationError } from '../src/game/education/index.js';
import { syntheticRecord } from './fixtures/education.mjs';

const syntheticFiles = () => {
  const record = syntheticRecord(); const localized = record.localizations.en; delete record.localizations;
  return new Map([
    ['manifest.json', { schemaVersion: 1, authoredLocale: 'ja', ids: [record.id], locales: ['ja', 'en'] }],
    [`records/${record.id}.json`, record], [`locales/en/${record.id}.json`, localized],
  ]);
};
test('loader resolves only neutral relative content paths and validates localized records', async () => {
  const files = syntheticFiles(); const paths = [];
  const records = await loadMysteryLibrary({ readJson: path => { paths.push(path); return files.get(path); } });
  assert.deepEqual(paths, ['manifest.json', 'records/m900001.json', 'locales/en/m900001.json']);
  const session = new MysterySession({ records }); session.start(); assert.equal(session.getView().clues[0].text, 'Synthetic clue 1');
});
test('loader rejects malformed manifests, unsafe paths, missing fields and ID mismatches', async () => {
  for (const mutate of [
    files => { files.get('manifest.json').ids = ['../private']; },
    files => { files.get('manifest.json').ids = ['m900001', 'm900001']; },
    files => { files.get('manifest.json').schemaVersion = 2; },
    files => { files.get('manifest.json').locales = ['ja']; },
    files => { files.get('records/m900001.json').id = 'm900002'; },
    files => { files.delete('locales/en/m900001.json'); },
    files => { files.get('locales/en/m900001.json').identity = ''; },
  ]) {
    const files = syntheticFiles(); mutate(files);
    await assert.rejects(loadMysteryLibrary({ readJson: path => files.get(path) }), ContentValidationError);
  }
  await assert.rejects(loadMysteryLibrary({ readJson: () => { throw new Error('Synthetic private content'); } }), error => error.code === 'READ_FAILED' && !error.message.includes('Synthetic private content'));
});
test('small authored sample validates in both supported locales without printing sample contents', async () => {
  const readJson = async path => JSON.parse(await readFile(new URL(`../content/education/${path}`, import.meta.url), 'utf8'));
  try {
    for (const locale of ['ja', 'en']) {
      const records = await loadMysteryLibrary({ readJson, locale });
      if (records.length !== 2) throw new Error('Unexpected sample count');
      const session = new MysterySession({ records, locale }); session.start();
      if (Object.hasOwn(session.getView(), 'answer') || session.getNavigationTarget() !== null) throw new Error('Projection failure');
      for (let i = 0; i < 4; i++) session.requestNextClue();
      if (!session.revealAnswer().accepted || typeof session.getView().answer.explanation !== 'string') throw new Error('Reveal failure');
    }
  } catch { assert.fail('Sample library validation failed; inspect content privately without logging records.'); }
});
