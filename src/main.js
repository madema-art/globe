import './ui/fonts/fonts.css';
import './style.css';
import { createTitleScene } from './engine/title-scene.js';
import { createVersionWatcher } from './runtime/version.js';
import { createEarthView } from './earth/earth-view.js';
import { createExplorePanel } from './earth/explore-panel.js';
import { createBezel } from './ui/bezel.js';
import { createFocusNavigator } from './ui/focus.js';
import { createUiInput } from './ui/ui-input.js';
import { createMysteryScreen } from './ui/mystery/mystery-screen.js';
import { createPreviewSource } from './ui/mystery/preview-source.js';

// Screens: 'title' | 'vision' (about) | 'explore' (developer exploration) | 'mystery'.
// Only 'title' may apply a pending build refresh; every transition into it calls titleEntered().
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
const $ = (selector) => document.querySelector(selector);
const screens = { title: $('#title'), vision: $('#vision'), explore: $('#explore'), mystery: $('#mystery') };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const focus = createFocusNavigator();
let earth = null;
let panel = null;
let mystery = null;
let bezel = null;
let lastTitleFocus = null;

function navigate(next) {
  const previous = mode;
  if (previous === 'mystery' && next !== 'mystery') mystery?.close();
  mode = next;
  for (const [name, section] of Object.entries(screens)) section.hidden = name !== next;
  document.body.dataset.screen = next;
  earth?.setMode(next === 'explore' ? 'explore' : next === 'mystery' ? 'mystery' : 'title');
  if (next === 'mystery') mystery.open(createPreviewSource(earth));
  const preferred = { title: previous === 'vision' ? $('#about-button') : lastTitleFocus, vision: $('#back-button'), explore: $('#explore-back') }[next];
  if (next !== 'mystery') focus.enter(screens[next], preferred);
  if (next === 'title') watcher.titleEntered();
}

$('#mystery-button').onclick = () => { lastTitleFocus = $('#mystery-button'); navigate('mystery'); };
$('#earth-button').onclick = () => { lastTitleFocus = $('#earth-button'); navigate('explore'); };
$('#about-button').onclick = () => navigate('vision');
$('#back-button').onclick = () => navigate('title');
$('#explore-back').onclick = () => navigate('title');

// Semantic UI actions from keyboard and controller (see src/ui/ui-input.js).
function onAction(action) {
  if (mode === 'mystery') return mystery.handle(action);
  if (action === 'back') { if (mode !== 'title') { navigate('title'); return true; } return false; }
  if (mode === 'explore') return action === 'activate' ? focus.activate() : false; // arrows turn the globe here
  if (action === 'up' || action === 'left') return focus.move(screens[mode], 'previous');
  if (action === 'down' || action === 'right') return focus.move(screens[mode], 'next');
  if (action === 'activate') return focus.activate() || Boolean(focus.enter(screens[mode]));
  return false;
}
const uiInput = createUiInput({ onAction });

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'f' && !event.repeat && !event.target.closest?.('input, select, textarea')) {
    const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    action.catch(() => {});
  }
});

/** Keep each menu entry's leader line ending exactly on the bezel ring. */
let leaderKey = '';
function updateLeaders(p) {
  if (!p || mode !== 'title') return;
  const key = `${p.cx | 0},${p.cy | 0},${p.r | 0},${innerWidth}`;
  if (key === leaderKey) return;
  leaderKey = key;
  const R = p.r * 1.075;
  for (const label of screens.title.querySelectorAll('.index-label')) {
    const box = label.getBoundingClientRect();
    const y = box.top + box.height * 0.55;
    const dy = y - p.cy;
    const ringX = Math.abs(dy) < R ? p.cx - Math.sqrt(R * R - dy * dy) : p.cx - R;
    const leader = Math.max(24, ringX - box.right - box.height * 0.5 - 8);
    label.parentElement.style.setProperty('--leader', `${leader.toFixed(0)}px`);
  }
}

try {
  const canvas = $('#scene');
  let scene;
  try {
    earth = createEarthView(canvas, {
      onStatus: ({ loading, tier }) => { document.body.dataset.earthTier = tier; document.body.classList.toggle('earth-loading', loading); },
    });
    panel = createExplorePanel(screens.explore, earth);
    mystery = createMysteryScreen({ root: screens.mystery, earth, onLeave: () => navigate('title') });
    bezel = createBezel($('#bezel'), { reduceMotion: () => reduceMotion.matches });
    // Map labels keep clear of interface text on the current screen.
    earth.setLabelExclusions(() => [...document.querySelectorAll('.masthead .wordmark, .explore-top, .explore-panel, .ledger, .answer, .actions, .aim')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => { const r = el.getBoundingClientRect(); return [r.left - 8, r.top - 6, r.right + 8, r.bottom + 6]; }));
    scene = {
      render: (seconds) => {
        // One gamepad snapshot per frame, shared by every consumer (Earth analog control, UI navigation;
        // the education engine's confirmation input joins this same snapshot when integrated).
        const pads = navigator.getGamepads?.() ?? [];
        earth.pollGamepads(pads);
        uiInput.pollGamepads(pads);
        earth.render(seconds);
        const p = earth.projection();
        bezel.update(p, seconds);
        updateLeaders(p);
        if (mode === 'explore') panel.update();
        if (mode === 'mystery') mystery.update();
      },
    };
    earth.ready.then(() => {
      $('#mystery-button').disabled = false;
      $('#earth-button').disabled = false;
      bezel.setVisible(true);
      // Start on the first entry unless the player already moved focus while the Earth was loading.
      if (mode === 'title' && !lastTitleFocus && document.activeElement === $('#about-button')) focus.enter(screens.title, $('#mystery-button'));
    }).catch((error) => { console.warn('Earth assets unavailable', error); $('#status').textContent = 'The Earth could not be loaded. The title remains available.'; });
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
  $('#status').textContent = 'Graphics are unavailable on this device. The title remains available.';
  window.advanceTime = () => {};
}
focus.enter(screens.title);
window.render_game_to_text = () => JSON.stringify({ mode, build: __BUILD_ID__, pendingUpdate: watcher.pending, gameplayAvailable: false, earth: earth?.state() ?? null });
window.globeEarth = earth; // development/test hook: flyTo, setLayer, state
if (!import.meta.env.DEV) {
  setInterval(() => { if (mode === 'title') void watcher.check(); }, 20_000);
  void watcher.check();
}
