import './style.css';
import { createTitleScene } from './engine/title-scene.js';
import { createVersionWatcher } from './runtime/version.js';
import { createEarthView } from './earth/earth-view.js';
import { createExplorePanel } from './earth/explore-panel.js';

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
let earth = null;
let panel = null;
function navigate(next) {
  mode = next;
  document.querySelector('#title').hidden = next !== 'title';
  document.querySelector('#vision').hidden = next !== 'vision';
  document.querySelector('#explore').hidden = next !== 'explore';
  document.body.classList.toggle('exploring', next === 'explore');
  earth?.setMode(next === 'explore' ? 'explore' : 'title');
  const focus = { title: '#about-button', vision: '#back-button', explore: '#explore-back' }[next];
  document.querySelector(focus).focus();
  if (next === 'title') watcher.titleEntered();
}
document.querySelector('#about-button').onclick = () => navigate('vision');
document.querySelector('#back-button').onclick = () => navigate('title');
document.querySelector('#earth-button').onclick = () => navigate('explore');
document.querySelector('#explore-back').onclick = () => navigate('title');
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && (mode === 'vision' || mode === 'explore')) navigate('title');
  if (event.key.toLowerCase() === 'f' && !event.repeat && !event.target.closest?.('input, select, textarea')) {
    const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    action.catch(() => {});
  }
});
try {
  const canvas = document.querySelector('#scene');
  let scene;
  try {
    earth = createEarthView(canvas, {
      onStatus: ({ loading, tier }) => { document.body.dataset.earthTier = tier; document.body.classList.toggle('earth-loading', loading); },
    });
    panel = createExplorePanel(document.querySelector('#explore'), earth);
    scene = { render: (seconds) => { earth.render(seconds); if (mode === 'explore') panel.update(); } };
    earth.ready.then(() => { document.querySelector('#earth-button').hidden = false; })
      .catch((error) => { console.warn('Earth assets unavailable', error); document.querySelector('#status').textContent = 'EARTH ASSETS UNAVAILABLE'; });
  } catch (error) {
    // Keep the original abstract title art if the Earth renderer cannot start.
    console.warn('Earth renderer unavailable', error);
    earth?.dispose();
    earth = null;
    scene = createTitleScene(canvas);
  }
  let last = performance.now();
  const frame = (now) => { scene.render((now - last) / 1000); last = now; requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  window.advanceTime = (ms) => scene.render(ms / 1000);
} catch {
  // The accessible title remains usable even without WebGL.
  document.querySelector('#status').textContent = 'GRAPHICS UNAVAILABLE · TITLE ONLY';
  window.advanceTime = () => {};
}
window.render_game_to_text = () => JSON.stringify({ mode, build: __BUILD_ID__, pendingUpdate: watcher.pending, gameplayAvailable: false, earth: earth?.state() ?? null });
window.globeEarth = earth; // development/test hook: flyTo, setLayer, state
if (!import.meta.env.DEV) {
  setInterval(() => { if (mode === 'title') void watcher.check(); }, 20_000);
  void watcher.check();
}
