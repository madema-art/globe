import './style.css';
import { createTitleScene } from './engine/title-scene.js';
import { createVersionWatcher } from './runtime/version.js';

let mode = 'title';
const watcher = createVersionWatcher({
  currentId: __BUILD_ID__,
  isTitle: () => mode === 'title',
  fetchVersion: async () => {
    const response = await fetch('/version.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Version unavailable');
    return response.json();
  },
  reload: () => window.location.reload(),
});
function navigate(next) {
  mode = next;
  document.querySelector('#title').hidden = next !== 'title';
  document.querySelector('#vision').hidden = next !== 'vision';
  document.querySelector(next === 'title' ? '#about-button' : '#back-button').focus();
  if (next === 'title') watcher.titleEntered();
}
document.querySelector('#about-button').onclick = () => navigate('vision');
document.querySelector('#back-button').onclick = () => navigate('title');
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && mode === 'vision') navigate('title');
  if (event.key.toLowerCase() === 'f' && !event.repeat) {
    const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    action.catch(() => {});
  }
});
try {
  const scene = createTitleScene(document.querySelector('#scene'));
  let last = performance.now();
  const frame = (now) => { scene.render((now - last) / 1000); last = now; requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  window.advanceTime = (ms) => scene.render(ms / 1000);
} catch {
  // The accessible title remains usable even without WebGL.
  document.querySelector('#status').textContent = 'GRAPHICS UNAVAILABLE · TITLE ONLY';
  window.advanceTime = () => {};
}
window.render_game_to_text = () => JSON.stringify({ mode, build: __BUILD_ID__, pendingUpdate: watcher.pending, gameplayAvailable: false });
if (!import.meta.env.DEV) {
  setInterval(() => { if (mode === 'title') void watcher.check(); }, 20_000);
  void watcher.check();
}
