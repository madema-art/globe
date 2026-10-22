import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, cp, symlink, readFile, writeFile, access } from 'node:fs/promises';
import { root, git, run, json } from '../scripts/common.mjs';

// All intentionally broken sources live in an ignored disposable fixture.
await mkdir(path.join(root, 'work'), { recursive: true });
const fixture = await mkdtemp(path.join(root, 'work', 'build-test-'));
for (const entry of ['.gitignore', 'package.json', 'package-lock.json', 'index.html', 'vite.config.js', 'src', 'scripts', 'public', 'assets/data/processed']) {
  await cp(path.join(root, entry), path.join(fixture, entry), { recursive: true });
}
await git(['init'], fixture);
await symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'junction');
await mkdir(path.join(fixture, '.globe'), { recursive: true });
await writeFile(path.join(fixture, '.globe', 'dependencies.txt'), createHash('sha256').update(await readFile(path.join(fixture, 'package-lock.json'))).digest('hex'));
const build = () => run(process.execPath, ['scripts/build.mjs'], fixture);
const current = () => json(path.join(fixture, '.globe', 'current.json'));
await build(); const first = await current();
await build(); assert.equal((await current()).id, first.id);
const main = path.join(fixture, 'src', 'main.js');
const original = await readFile(main, 'utf8');
await writeFile(main, 'this is deliberately invalid JavaScript !!!');
await assert.rejects(build());
assert.equal((await current()).id, first.id);
await access(path.join(fixture, '.globe', 'builds', first.id, 'index.html'));
await writeFile(main, `${original}\nconsole.info('Build publication validation');\n`);
await build(); const second = await current();
assert.notEqual(second.id, first.id);
await access(path.join(fixture, '.globe', 'builds', first.id, 'index.html'));
console.log('Build publication passed: unchanged sources retain ID, syntax failure preserves published build, corrected source publishes a new ID, older assets remain available.');
