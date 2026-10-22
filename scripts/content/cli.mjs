import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { auditLibrary, safeReport, publishLibrary, readJson, approvalDigest, stageDraft } from './pipeline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.join(root, 'content/library/research');
const [command = 'report', id, ...options] = process.argv.slice(2);
const save = async (relative, value) => writeFile(path.join(directory, relative), JSON.stringify(value, null, 2) + '\n', { flag: 'w' });
try {
  if (['validate', 'report'].includes(command)) {
    const audit = await auditLibrary(directory); console.log(JSON.stringify(safeReport(audit), null, 2));
    if (audit.failures.length) process.exitCode = 1;
  } else if (command === 'publish') console.log(JSON.stringify(await publishLibrary(directory, path.join(root, '.library'))));
  else if (command === 'develop') {
    if (id !== '--enable-development-content' || options.length) throw new Error('DEVELOPMENT_CONTENT_DISABLED');
    console.log(JSON.stringify(await publishLibrary(directory, path.join(root, '.library'), { channel: 'development', enableDevelopment: true })));
  }
  else if (command === 'stage') console.log(JSON.stringify(await stageDraft(directory, path.join(root, 'content/library/drafts'), id)));
  else if (command === 'add') {
    if (!/^m\d{6}$/.test(id || '')) throw new Error('NEUTRAL_ID_REQUIRED');
    const manifest = await readJson(path.join(directory, 'manifest.json'));
    if (manifest.ids.includes(id)) throw new Error('DUPLICATE_ID');
    // Drafts are deliberately incomplete and cannot enter validated/published records.
    const draft = { schemaVersion: 1, id, authoredLocale: 'ja', editorial: { reviewStatus: 'draft', clueOrderReviewed: false, notes: '要調査・要執筆。' }, clues: Array.from({ length: 5 }, () => ({ text: '', sourceIds: [] })) };
    const draftDir = path.join(root, 'content/library/drafts'); await mkdir(draftDir, { recursive: true });
    await writeFile(path.join(draftDir, `${id}.json`), JSON.stringify(draft, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ created: 1, status: 'draft', published: false }));
  } else if (['review', 'approve'].includes(command)) {
    if (!/^m\d{6}$/.test(id || '') || options.length !== 2 || options[1] !== '--attest' || !options[0].trim()) throw new Error('REVIEWER_AND_EXPLICIT_ATTESTATION_REQUIRED');
    const audit = await auditLibrary(directory);
    if (audit.failures.length) throw new Error('VALIDATION_FAILED');
    const item = audit.records.find(item => item.canonical.id === id);
    if (!item) throw new Error('CONTENT_NOT_FOUND');
    if (command === 'review') { item.canonical.editorial.reviewStatus = 'reviewed'; item.canonical.editorial.notes += `\n査読者: ${options[0]}`; }
    else {
      if (item.canonical.editorial.reviewStatus !== 'reviewed') throw new Error('INDEPENDENT_REVIEW_REQUIRED');
      item.canonical.library.publication = { approved: true, reviewer: options[0], approvedDigest: approvalDigest(item.canonical, item.translations) };
    }
    await save(`records/${id}.json`, item.canonical);
    console.log(JSON.stringify({ changed: 1, action: command }));
  } else throw new Error('UNKNOWN_COMMAND');
} catch (error) { console.error(JSON.stringify({ status: 'failed', code: /^[A-Z_]+$/.test(error.message) ? error.message : error.code || 'CONTENT_OPERATION_FAILED' })); process.exitCode = 1; }
