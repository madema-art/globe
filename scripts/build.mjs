import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, access, stat, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, runtime, git, run, json, atomicJson } from './common.mjs';

export async function fingerprint(cwd = root) {
  const files = (await git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd)).split('\0').filter(Boolean).sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    try { hash.update(await readFile(path.join(cwd, file))); }
    catch (error) { if (error.code === 'ENOENT') hash.update('<deleted>'); else throw error; }
  }
  return hash.digest('hex');
}
async function npmCi() {
  // Use npm's JS entry directly: no shell command interpolation on Windows.
  const npmRoot = path.dirname(process.execPath);
  let cli = path.join(npmRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  try { await access(cli); } catch {
    const { createRequire } = await import('node:module');
    cli = createRequire(import.meta.url).resolve('npm/bin/npm-cli.js');
  }
  await run(process.execPath, [cli, 'ci', '--no-audit', '--no-fund'], root, { timeout: 240_000 });
}
export async function ensureBuild(log = () => {}) {
  await mkdir(runtime, { recursive: true });
  const lockPath = path.join(runtime, 'build.lock');
  // A crashed build lock is intentionally a visible error rather than a reason to delete another process's lock.
  const lock = await open(lockPath, 'wx').catch(() => { throw new Error('Another build is active, or .globe/build.lock needs inspection after a crash.'); });
  await lock.writeFile(String(process.pid));
  try {
    const source = await fingerprint();
    let current;
    try { current = await json(path.join(runtime, 'current.json')); await access(path.join(runtime, 'builds', current.id, 'index.html')); }
    catch { current = null; }
    if (current?.source === source) return current;
    const lockHash = createHash('sha256').update(await readFile(path.join(root, 'package-lock.json'))).digest('hex');
    let dependencies;
    try { dependencies = await readFile(path.join(runtime, 'dependencies.txt'), 'utf8'); } catch { /* first install */ }
    if (dependencies !== lockHash) {
      log('Installing locked dependencies');
      await npmCi();
      await import('node:fs/promises').then(fs => fs.writeFile(path.join(runtime, 'dependencies.txt'), lockHash));
    }
    const id = randomUUID();
    const destination = path.join(runtime, 'builds', id);
    log(`Building ${id}`);
    await run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', destination, '--base', `/builds/${id}/`], root, {
      timeout: 180_000, env: { ...process.env, GLOBE_BUILD_ID: id },
    });
    await stat(path.join(destination, 'index.html'));
    if (source !== await fingerprint()) throw new Error('Source changed while building; keeping the previous published build. Retry after edits finish.');
    let commit = 'uncommitted';
    try { commit = await git(['rev-parse', 'HEAD']); } catch { /* initial bootstrap */ }
    const version = { id, source, commit, builtAt: new Date().toISOString() };
    await atomicJson(path.join(destination, 'version.json'), version);
    await atomicJson(path.join(runtime, 'current.json'), version);
    log(`Published ${id}`);
    return version;
  } finally { await lock.close(); await unlink(lockPath); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensureBuild(console.log).then(version => console.log(JSON.stringify(version))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
