import http from 'node:http';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { open, mkdir, readFile, appendFile, unlink, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { root, runtime, stateDir, instance, json, atomicJson, config } from './common.mjs';
import { safeUpdate } from './update.mjs';
import { ensureBuild } from './build.mjs';

await mkdir(stateDir, { recursive: true });
const lockPath = path.join(stateDir, 'service.lock');
let lock;
try { lock = await open(lockPath, 'wx'); }
catch {
  // Recover only if the recorded owner is definitely absent; never kill a PID.
  try {
    const pid = Number(await readFile(lockPath, 'utf8'));
    if (!Number.isInteger(pid) || pid < 1) throw new Error('Incomplete service lock; inspect the Globe logs.');
    try { process.kill(pid, 0); process.exit(0); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    await unlink(lockPath);
    lock = await open(lockPath, 'wx');
  } catch { process.exit(1); }
}
await lock.writeFile(String(process.pid));
const log = (message) => {
  const text = `${new Date().toISOString()} ${message}\n`;
  void appendFile(path.join(stateDir, 'service.log'), text).catch(() => {});
};
const settings = await config();
const token = randomBytes(32).toString('hex');
let current;
try { current = await json(path.join(runtime, 'current.json')); } catch { /* first launch */ }
let checking;
function check() {
  if (checking) return checking;
  checking = (async () => {
    try {
      const result = await safeUpdate({ cwd: root, ...settings, log });
      log(`Update: ${result.status}`);
      current = await ensureBuild(log);
      return { update: result.status, build: current.id };
    } catch (error) {
      log(`Keeping existing build: ${error.stack}`);
      if (!current) throw error;
      return { update: 'build-failed', build: current.id };
    }
  })().finally(() => { checking = null; });
  return checking;
}
let interval;
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(interval);
  server.close();
  server.closeIdleConnections();
  if (checking) await checking.catch(() => {});
  await unlink(path.join(stateDir, 'server.json')).catch(() => {});
  await lock.close();
  await unlink(lockPath).catch(() => {});
  log('Stopped');
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (!['127.0.0.1', 'localhost'].includes((req.headers.host || '').split(':')[0])) { res.writeHead(403).end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1');
    const respond = (value) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
    if (url.pathname === '/__globe/health') { respond({ app: 'Globe', instance, root, ready: Boolean(current), pid: process.pid }); return; }
    if (url.pathname.startsWith('/__globe/')) {
      if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403).end(); return; }
      if (url.pathname === '/__globe/check') { respond(await check()); return; }
      if (url.pathname === '/__globe/stop') { respond({ stopping: true }); void shutdown(); return; }
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    if (url.pathname === '/version.json') { respond(current || {}); return; }
    let relative = decodeURIComponent(url.pathname);
    let base;
    if (relative === '/' || relative === '/index.html') {
      if (!current) { res.writeHead(503).end('Globe is building. Please try again shortly.'); return; }
      base = path.join(runtime, 'builds', current.id); relative = '/index.html';
    } else if (relative.startsWith('/builds/')) {
      base = path.join(runtime, 'builds'); relative = relative.slice('/builds'.length);
    } else if (relative === '/favicon.ico') { res.writeHead(204).end(); return; }
    else { res.writeHead(404).end(); return; }
    const target = path.resolve(base, `.${relative}`);
    if (!target.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
    const info = await stat(target);
    if (!info.isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
    if (relative !== '/index.html' && !relative.endsWith('/version.json')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (req.method === 'HEAD') res.end();
    else createReadStream(target).on('error', () => res.destroy()).pipe(res);
  } catch (error) { log(error.message); if (!res.headersSent) res.writeHead(500); res.end('Globe request failed.'); }
});
let port;
for (let candidate = settings.firstPort; candidate <= settings.lastPort; candidate++) {
  try {
    await new Promise((resolve, reject) => {
      const error = (err) => { server.off('listening', listening); reject(err); };
      const listening = () => { server.off('error', error); resolve(); };
      server.once('error', error); server.once('listening', listening); server.listen(candidate, '127.0.0.1');
    });
    port = candidate; break;
  } catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
}
if (!port) { await lock.close(); await unlink(lockPath); throw new Error('All Globe ports 8765–8774 are busy.'); }
await atomicJson(path.join(stateDir, 'server.json'), { port, token, instance, root, pid: process.pid });
log(`Listening on 127.0.0.1:${port}`);
interval = setInterval(() => { void check().catch(error => log(error.message)); }, settings.updateIntervalMs);
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
