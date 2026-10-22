import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { root, git } from '../scripts/common.mjs';
import { safeUpdate } from '../scripts/update.mjs';

async function fixture() {
  await mkdir(path.join(root, 'work'), { recursive: true });
  const folder = await mkdtemp(path.join(root, 'work', 'git-test-'));
  const remote = path.join(folder, 'remote.git');
  const author = path.join(folder, 'author');
  const local = path.join(folder, 'local');
  await git(['init', '--bare', remote]);
  await git(['clone', remote, author]);
  const identity = async cwd => {
    await git(['config', 'user.name', 'Globe test'], cwd);
    await git(['config', 'user.email', 'globe-test@example.invalid'], cwd);
  };
  await identity(author);
  await git(['switch', '-c', 'main'], author);
  await writeFile(path.join(author, 'content.txt'), 'initial');
  await writeFile(path.join(author, '.gitignore'), 'ignored.txt\n');
  await git(['add', '.'], author); await git(['commit', '-m', 'Initial'], author);
  await git(['push', '-u', 'origin', 'main'], author);
  await git(['clone', '-b', 'main', remote, local]); await identity(local);
  const publish = async (name = 'content.txt', content = 'incoming') => {
    await writeFile(path.join(author, name), content);
    await git(['add', '-f', name], author); await git(['commit', '-m', 'Incoming'], author);
    await git(['push', 'origin', 'main'], author);
  };
  return { author, local, remote, publish, update: () => safeUpdate({ cwd: local }) };
}

test('clean main fast-forwards and subsequently reports current', async () => {
  const f = await fixture(); await f.publish();
  assert.equal((await f.update()).status, 'updated');
  assert.equal(await readFile(path.join(f.local, 'content.txt'), 'utf8'), 'incoming');
  assert.equal((await f.update()).status, 'current');
});
test('tracked edits and untracked files are preserved and block integration', async () => {
  const f = await fixture(); await f.publish();
  const before = await git(['rev-parse', 'HEAD'], f.local);
  await writeFile(path.join(f.local, 'content.txt'), 'my edits');
  assert.equal((await f.update()).status, 'blocked-dirty');
  assert.equal(await readFile(path.join(f.local, 'content.txt'), 'utf8'), 'my edits');
  await git(['restore', 'content.txt'], f.local); // Only a disposable test fixture.
  await writeFile(path.join(f.local, 'notes.txt'), 'keep untracked');
  assert.equal((await f.update()).status, 'blocked-dirty');
  assert.equal(await git(['rev-parse', 'HEAD'], f.local), before);
  assert.equal(await readFile(path.join(f.local, 'notes.txt'), 'utf8'), 'keep untracked');
});
test('ignored files colliding with incoming files cannot be overwritten', async () => {
  const f = await fixture(); await f.publish('ignored.txt');
  await writeFile(path.join(f.local, 'ignored.txt'), 'precious ignored file');
  assert.equal((await f.update()).status, 'blocked-merge');
  assert.equal(await readFile(path.join(f.local, 'ignored.txt'), 'utf8'), 'precious ignored file');
});
test('feature branch stays on its own branch', async () => {
  const f = await fixture(); await f.publish();
  await git(['switch', '-c', 'codex/test'], f.local);
  assert.equal((await f.update()).status, 'blocked-branch');
  assert.equal(await git(['branch', '--show-current'], f.local), 'codex/test');
});
test('ahead and divergent commits remain untouched', async () => {
  const f = await fixture();
  await writeFile(path.join(f.local, 'mine.txt'), 'local commit');
  await git(['add', '.'], f.local); await git(['commit', '-m', 'Local work'], f.local);
  const before = await git(['rev-parse', 'HEAD'], f.local);
  assert.equal((await f.update()).status, 'blocked-divergent-or-ahead');
  await f.publish();
  assert.equal((await f.update()).status, 'blocked-divergent-or-ahead');
  assert.equal(await git(['rev-parse', 'HEAD'], f.local), before);
});
test('unavailable remote leaves local files and HEAD intact', async () => {
  const f = await fixture(); const before = await git(['rev-parse', 'HEAD'], f.local);
  await git(['remote', 'set-url', 'origin', path.join(f.remote, 'absent')], f.local);
  assert.equal((await f.update()).status, 'offline');
  assert.equal(await git(['rev-parse', 'HEAD'], f.local), before);
  assert.equal(await readFile(path.join(f.local, 'content.txt'), 'utf8'), 'initial');
});
