import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { run, json, stateDir, root, config } from '../scripts/common.mjs';

const launch = (...args) => run('cmd.exe', ['/d', '/c', 'Start-Globe.bat', ...args], root, { timeout: 600_000 });
const settings = await config();
const unrelatedUrl = `http://127.0.0.1:${settings.firstPort}`;
await launch('-Stop');
await new Promise(resolve => setTimeout(resolve, 1000));
const unrelated = http.createServer((req, res) => res.end('unrelated-project'));
await new Promise((resolve, reject) => { unrelated.once('error', reject); unrelated.listen(settings.firstPort, '127.0.0.1', resolve); });
try {
  console.log(await launch('--no-browser'));
  const first = await json(path.join(stateDir, 'server.json'));
  assert.equal(first.port, settings.firstPort + 1);
  console.log(await launch('--no-browser'));
  const reused = await json(path.join(stateDir, 'server.json'));
  assert.equal(reused.pid, first.pid);
  const base = `http://127.0.0.1:${first.port}`;
  assert.equal((await fetch(`${base}/__globe/stop`, { method: 'POST' })).status, 403);
  assert.equal((await fetch(`${base}/__globe/health`)).status, 200);
  assert.equal(await (await fetch(unrelatedUrl)).text(), 'unrelated-project');
  const version = await (await fetch(`${base}/version.json`)).json();
  assert.ok(version.id);
  const html = await (await fetch(base)).text();
  assert.ok(html.includes(`/builds/${version.id}/assets/`));
  assert.equal(html.includes('/@vite/client'), false);
  const unchanged = await run(process.execPath, ['scripts/build.mjs']);
  assert.ok(unchanged.includes(version.id));
  console.log(await launch('-Stop'));
  for (let i = 0; i < 30; i++) {
    try { await fetch(`${base}/__globe/health`, { signal: AbortSignal.timeout(500) }); }
    catch { break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await assert.rejects(fetch(`${base}/__globe/health`, { signal: AbortSignal.timeout(1000) }));
  assert.equal(await (await fetch(unrelatedUrl)).text(), 'unrelated-project');
  console.log(`Windows batch/service passed: fallback to ${first.port}, detached lifetime, reuse, authenticated ownership, versioned assets, no HMR, unchanged build ID, stop preserves unrelated server.`);
} finally { await new Promise(resolve => unrelated.close(resolve)); }
