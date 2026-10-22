import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const runtime = path.join(root, '.globe');
export const instance = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 12);
export const logRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'Globe');
export const stateDir = path.join(logRoot, instance);
const exec = promisify(execFile);
export async function run(file, args, cwd = root, extra = {}) {
  const result = await exec(file, args, {
    cwd, windowsHide: true, timeout: 90_000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' }, ...extra,
  });
  return result.stdout.trim();
}
export const git = (args, cwd = root) => run('git', args, cwd);
export const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, file);
}
export async function config() {
  const value = await json(path.join(root, 'launcher.config.json'));
  if (!/^[\w./-]+$/.test(value.branch) || !/^[\w-]+$/.test(value.remote) || value.branch.startsWith('-')) throw new Error('Invalid tracked branch/remote');
  if (!Number.isInteger(value.firstPort) || !Number.isInteger(value.lastPort) || value.firstPort < 1024 || value.lastPort > 65535 || value.lastPort < value.firstPort || value.lastPort - value.firstPort > 20) throw new Error('Invalid port range');
  value.updateIntervalMs = Math.max(120_000, Number(value.updateIntervalMs) || 120_000);
  return value;
}
