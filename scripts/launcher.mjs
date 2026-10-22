import { spawn } from 'node:child_process';
import { access, mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { root, stateDir, instance, json } from './common.mjs';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function existing() {
  try {
    const state = await json(path.join(stateDir, 'server.json'));
    const result = await fetch(`http://127.0.0.1:${state.port}/__globe/health`, { signal: AbortSignal.timeout(1500) });
    const health = await result.json();
    if (health.app === 'Globe' && health.instance === instance && health.root === root && health.pid === state.pid) return state;
  } catch { /* no verified service */ }
}
async function control(state, command) {
  const response = await fetch(`http://127.0.0.1:${state.port}/__globe/${command}`, {
    method: 'POST', headers: { Authorization: `Bearer ${state.token}` }, signal: AbortSignal.timeout(600_000),
  });
  if (!response.ok) throw new Error(`Service ${command} failed: ${await response.text()}`);
  return response.json();
}
async function chrome(url) {
  const candidates = [
    process.env.GLOBE_CHROME,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate); }
    catch { continue; }
    await new Promise((resolve, reject) => {
      const child = spawn(candidate, ['--new-window', url], { detached: true, stdio: 'ignore', windowsHide: true });
      child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
    });
    return;
  }
  throw new Error(`Chrome was not found. Set GLOBE_CHROME to chrome.exe. Game server is ready at ${url}`);
}
async function main() {
  const args = process.argv.slice(2).map(arg => arg.toLowerCase());
  if (args.some(arg => !['-stop', '--stop', '--no-browser'].includes(arg))) throw new Error('Usage: Start-Globe.bat [-Stop | --no-browser]');
  let state = await existing();
  if (args.includes('-stop') || args.includes('--stop')) {
    if (state) { await control(state, 'stop'); console.log('Globe server is stopping.'); }
    else console.log('No verified Globe server is running for this checkout.');
    return;
  }
  if (!state) {
    await mkdir(stateDir, { recursive: true });
    const log = await open(path.join(stateDir, 'bootstrap.log'), 'a');
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'service.mjs')], {
      cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd],
    });
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('spawn', resolve); });
    child.unref(); await log.close();
    for (let i = 0; i < 80; i++) { state = await existing(); if (state) break; await sleep(250); }
    if (!state) throw new Error(`Globe server could not start. See ${stateDir}\\bootstrap.log`);
  }
  console.log('Checking GitHub and preparing Globe…');
  const result = await control(state, 'check');
  console.log(`Update: ${result.update}; build: ${result.build}`);
  const url = `http://127.0.0.1:${state.port}/`;
  if (!args.includes('--no-browser')) await chrome(url);
  console.log(`Globe is running at ${url}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
