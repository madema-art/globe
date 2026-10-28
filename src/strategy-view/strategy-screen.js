import * as THREE from 'three';
import { geodeticToPosition } from '../geography/coordinates.js';
import {
  PROTOTYPE, COLS, ROWS, createGame, endTurn, moveUnit, planMove, describeDate, formatYear, observers,
  observedPlaceIds, knowledgeState, territoryAreaKm2, decodeLandMask, createTerrain, createSaveStore, distanceKm,
} from '../strategy/index.js';
import { buildNeolithicVillage, buildExploringParty } from './miniatures.js';

// Strategy prototype presentation (keyboard and mouse only). Rules live in src/strategy (pure, replaceable);
// this module draws what the player's people KNOW on top of the always-visible physical Earth, and turns
// keyboard and mouse input into deliberate game actions.
//
// Default screen: only the year, period and turn, End turn, and quiet links to the two screens below.
//   I  Information overlay (controls, calendar, society, discoveries, map legend). Toggle.
//   U  Settlement screen (the selected settlement, or an overview to choose one). Toggle.
//   Opening one closes the other; Escape closes an open screen first, then a move command, then leaves.
//
// Mouse: drag rotates (Earth), wheel zooms (Earth), click selects, double-click centres the point clicked.
// A single click acts only after the double-click interval, so a double-click never selects or moves.
// Moving the party is an explicit command: select it, press M or choose Move, then click a destination.
//
// Visual language for human information:
//   unknown   nothing is drawn          observed  solid point (seen right now)
//   new       brass, ink-in ring        known     hollow ring (remembered; may have changed)
//   reported  dashed circle where it is said to be (second-hand, uncertain)
//   outdated  faint dashed ring, italic name (information older than a century)
// Camera movement never changes what is drawn: markers come only from the knowledge record.

const LABEL_ALTITUDE = 0.9;       // place names appear below this altitude (zoom-dependent detail)
const MINIATURE_ALTITUDE = 0.14;  // miniatures replace map symbols below this altitude
const START_ALTITUDE = 0.32;
const CLICK_DELAY_MS = 320;       // a single click waits this long in case it becomes a double-click
const DRAG_THRESHOLD_PX = 5;
const DISPATCH_MS = 7000;

const html = (strings, ...values) => strings.reduce((out, s, i) => out + s + (i < values.length ? escape(values[i]) : ''), '');
function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const km = (n) => `${Math.round(n)} km`;
const editable = (target) => Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
const STATE_NAMES = { new: 'Newly learned', observed: 'Observed now', known: 'Known', reported: 'Reported', outdated: 'Old news' };

export function createStrategyScreen({ root, earth, canvas, onLeave, storage = globalThis.localStorage }) {
  root.innerHTML = `
    <header class="almanac" aria-live="polite">
      <p class="almanac-year"></p>
      <p class="almanac-detail"><span class="almanac-period"></span> <span class="almanac-turn"></span></p>
    </header>
    <section class="strategy-lobby lobby" hidden>
      <h2 class="page-title lobby-title"></h2>
      <p class="lobby-text"></p>
      <nav class="index lobby-choices" aria-label="Choices"></nav>
    </section>
    <div class="selection" hidden aria-live="polite">
      <p class="selection-name"></p>
      <p class="selection-detail"></p>
      <button type="button" class="quiet-button selection-move" hidden>Move</button>
    </div>
    <p class="dispatch" role="status"></p>
    <nav class="strategy-bar" aria-label="Game">
      <button type="button" class="quiet-button" data-sheet="info" title="Information (I)">Information</button>
      <button type="button" class="quiet-button" data-sheet="settlement" title="Settlement (U)">Settlement</button>
      <button type="button" class="end-turn" data-action="end-turn" title="End turn (Enter)">End turn</button>
    </nav>
    <section class="strategy-sheet" data-sheet-panel="info" hidden aria-label="Information" tabindex="-1"></section>
    <section class="strategy-sheet" data-sheet-panel="settlement" hidden aria-label="Settlement" tabindex="-1"></section>`;
  const q = (s) => root.querySelector(s);
  const markerLayer = document.createElement('div');
  markerLayer.className = 'strategy-markers';
  canvas.after(markerLayer);
  markerLayer.hidden = true;

  const store = createSaveStore(storage);
  let terrain = null;
  let state = null;
  let opened = false;
  let phase = 'closed';           // 'loading' | 'lobby' | 'playing'
  let sheet = null;               // null | 'info' | 'settlement'
  let selected = null;            // { type: 'settlement'|'unit'|'place', id }
  let commanding = false;         // explicit movement-command state for the selected party
  let observedNow = new Set();
  let animation = null;           // { unitId, path, start, duration }
  let pendingReveal = new Map();  // placeId -> path step at which it appears during the current animation
  const markers = new Map();      // key -> { el, lat, lon, kind, uncertaintyKm }
  const chronicle = [];
  let preview = null;
  let routeLines = null;
  let territoryMask = null;
  let miniatures = null;
  let dispatchTimer = 0;
  let clickTimer = 0;

  // ------------------------------------------------------------------ loading and saves
  async function loadTerrain() {
    if (terrain) return terrain;
    const response = await fetch(`${import.meta.env.BASE_URL}strategy/v1/landmask-4096x2048.rle`);
    if (!response.ok) throw new Error('LAND_MASK_UNAVAILABLE');
    terrain = createTerrain(decodeLandMask(await response.arrayBuffer()));
    return terrain;
  }

  function persist() {
    try { store.save(state); return true; }
    catch { say('The game could not be saved in this browser. Your progress in this session continues.'); return false; }
  }

  function showLobby(title, text, choices) {
    phase = 'lobby';
    root.dataset.phase = 'lobby';
    const lobby = q('.strategy-lobby');
    lobby.hidden = false;
    lobby.querySelector('.lobby-title').textContent = title;
    lobby.querySelector('.lobby-text').textContent = text;
    const nav = lobby.querySelector('.lobby-choices');
    nav.innerHTML = '';
    for (const choice of choices) {
      const b = document.createElement('button');
      b.className = 'index-entry';
      b.dataset.nav = '';
      b.innerHTML = '<span class="index-label"></span>' + (choice.note ? '<span class="index-note"></span>' : '');
      b.querySelector('.index-label').textContent = choice.label;
      if (choice.note) b.querySelector('.index-note').textContent = choice.note;
      b.addEventListener('click', () => choice.run());
      nav.append(b);
    }
    nav.querySelector('button')?.focus({ focusVisible: false });
  }

  function begin(next) {
    state = next;
    phase = 'playing';
    root.dataset.phase = 'playing';
    q('.strategy-lobby').hidden = true;
    markerLayer.hidden = false;
    chronicle.length = 0;
    attachScene();
    refresh({ territory: true });
    select({ type: 'settlement', id: state.settlements[0].id });
    const home = state.settlements[0];
    void earth.navigateTo(home.lat, home.lon, { altitude: START_ALTITUDE });
    document.activeElement?.blur?.();
  }

  function newGame() {
    try { store.archiveCurrent(); } catch { /* unreadable storage: the new game still starts */ }
    begin(createGame({ terrain }));
    persist();
    say('6000 BCE. Your people farm a small piece of the Jordan Valley.');
  }

  // ------------------------------------------------------------------ scene objects (miniatures, routes, preview)
  function attachScene() {
    detachScene();
    const home = state.settlements[0];
    const unit = state.units[0];
    miniatures = {
      village: earth.anchor(buildNeolithicVillage(), { lat: home.lat, lon: home.lon, pixelSize: 64, popUp: true }),
      party: earth.anchor(buildExploringParty(), { lat: unit.lat, lon: unit.lon, pixelSize: 56, popUp: true }),
    };
    const material = new THREE.LineBasicMaterial({ color: 0xe2c17f, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
    preview = new THREE.Line(new THREE.BufferGeometry(), material);
    preview.renderOrder = 5;
    preview.visible = false;
    preview.frustumCulled = false;
    preview.userData.remove = earth.attach(preview);
  }
  function detachScene() {
    miniatures?.village.remove(); miniatures?.party.remove(); miniatures = null;
    preview?.userData.remove?.(); preview = null;
    routeLines?.userData.remove?.(); routeLines = null;
  }

  const surfacePoints = (points, heightM = 400) => points.map((p) => { const v = geodeticToPosition(p.lat, p.lon, heightM); return new THREE.Vector3(v.x, v.y, v.z); });

  // Paths the player's people have travelled: the first human routes on their map.
  function drawRoutes() {
    routeLines?.userData.remove?.();
    const routes = state.knowledge.player.routes;
    if (!routes.length) { routeLines = null; return; }
    const segments = [];
    for (const route of routes) for (let i = 1; i < route.length; i++) segments.push(...surfacePoints([route[i - 1], route[i]]));
    routeLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segments), new THREE.LineBasicMaterial({ color: 0xece4cf, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }));
    routeLines.renderOrder = 4;
    routeLines.frustumCulled = false;
    routeLines.userData.remove = earth.attach(routeLines);
  }

  function showPreview(plan) {
    if (!preview) return;
    if (!plan || plan.path.length < 2) { if (preview.visible) { preview.visible = false; earth.invalidate(); } return; }
    preview.geometry.dispose();
    preview.geometry = new THREE.BufferGeometry().setFromPoints(surfacePoints(plan.path, 600));
    preview.material.color.set(plan.blocked ? 0xd98c6a : 0xe2c17f);
    preview.visible = true;
    earth.invalidate();
  }

  // ------------------------------------------------------------------ state -> presentation
  function refresh({ territory = false } = {}) {
    if (!state) return;
    const date = describeDate(state);
    q('.almanac-year').textContent = date.year;
    q('.almanac-period').textContent = date.period;
    q('.almanac-turn').textContent = `Turn ${date.turn}`;
    observedNow = observedPlaceIds(state, 'player');
    earth.setObservers(observers(state, 'player'));
    if (territory) {
      territoryMask ??= new Uint8Array(COLS * ROWS);
      territoryMask.fill(0);
      for (const cell of state.territory.player) territoryMask[cell] = 255;
      earth.setTerritory(territoryMask, COLS, ROWS);
    }
    drawRoutes();
    buildMarkers();
    renderSelection();
    if (sheet) renderSheet();
  }

  function placeState(placeId) {
    const entry = state.knowledge.player.places[placeId];
    return knowledgeState(entry, { observedNow: observedNow.has(placeId), turn: state.turn, yearsSinceInfo: state.year - entry.infoYear });
  }

  function markerButton(className, label, target) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `strategy-marker ${className}`;
    el.innerHTML = '<span class="marker-symbol" aria-hidden="true"></span><span class="marker-label"></span>';
    el.querySelector('.marker-label').textContent = label;
    el.setAttribute('aria-label', label);
    el.addEventListener('click', (event) => { event.stopPropagation(); onMarkerClick(event, target); });
    el.addEventListener('dblclick', (event) => { event.stopPropagation(); onDoubleClick(target.lat(), target.lon()); });
    markerLayer.append(el);
    return el;
  }

  function buildMarkers() {
    for (const m of markers.values()) m.el.remove();
    markers.clear();
    // Only what the player knows. The world's other places are never turned into DOM or scene objects.
    for (const entry of Object.values(state.knowledge.player.places)) {
      const s = placeState(entry.placeId);
      const el = markerButton(`marker-place marker-${s}`, entry.info.name, { type: 'place', id: entry.placeId, lat: () => entry.info.lat, lon: () => entry.info.lon });
      el.dataset.state = s;
      if (!entry.info.uncertaintyKm) el.style.setProperty('--uncertainty', '12px');
      markers.set(entry.placeId, { el, lat: entry.info.lat, lon: entry.info.lon, kind: 'place', uncertaintyKm: entry.info.uncertaintyKm || 0 });
    }
    // Your own settlement and party are added last so they stack above other symbols.
    const home = state.settlements[0];
    markers.set(home.id, { el: markerButton('marker-settlement', home.name, { type: 'settlement', id: home.id, lat: () => home.lat, lon: () => home.lon }), lat: home.lat, lon: home.lon, kind: 'settlement' });
    const unit = state.units[0];
    markers.set(unit.id, { el: markerButton('marker-unit', unit.name, { type: 'unit', id: unit.id, lat: () => unit.lat, lon: () => unit.lon }), lat: unit.lat, lon: unit.lon, kind: 'unit' });
    for (const [key, m] of markers) m.el.classList.toggle('is-selected', selected?.id === key);
  }

  function select(next) {
    selected = next;
    if (selected?.type !== 'unit') setCommanding(false);
    for (const [key, m] of markers) m.el.classList.toggle('is-selected', selected?.id === key);
    renderSelection();
    if (sheet === 'settlement') renderSheet();
  }

  function setCommanding(on) {
    commanding = Boolean(on) && selected?.type === 'unit';
    canvas.classList.toggle('commanding', commanding);
    root.classList.toggle('commanding', commanding);
    if (!commanding) showPreview(null);
    renderSelection();
  }

  // The one line of context for the selection (name and essential status), plus Move for the party.
  function renderSelection() {
    const box = q('.selection');
    const move = q('.selection-move');
    if (!state || !selected) { box.hidden = true; return; }
    box.hidden = false;
    move.hidden = true;
    let name = '', detail = '';
    if (selected.type === 'settlement') {
      const s = state.settlements.find((x) => x.id === selected.id);
      name = s.name;
      detail = `${s.status}, ${s.population} people, ${Math.round(territoryAreaKm2(state.territory[s.owner]))} km²`;
    } else if (selected.type === 'unit') {
      const u = state.units.find((x) => x.id === selected.id);
      name = u.name;
      detail = commanding ? 'Choose a destination' : u.movesLeftKm > 0 ? `${km(u.movesLeftKm)} of travel left this turn` : 'No travel left this turn';
      move.hidden = u.movesLeftKm <= 0 || commanding;
    } else {
      const entry = state.knowledge.player.places[selected.id];
      name = entry.info.name;
      detail = STATE_NAMES[placeState(selected.id)];
    }
    q('.selection-name').textContent = name;
    q('.selection-detail').textContent = detail;
  }

  // ------------------------------------------------------------------ the two screens (I and U)
  function toggleSheet(name) { setSheet(sheet === name ? null : name); }
  function setSheet(name) {
    sheet = name;
    for (const panel of root.querySelectorAll('[data-sheet-panel]')) panel.hidden = panel.dataset.sheetPanel !== name;
    for (const b of root.querySelectorAll('[data-sheet]')) b.classList.toggle('is-open', b.dataset.sheet === name);
    root.dataset.sheet = name ?? '';
    document.body.classList.toggle('strategy-sheet-open', Boolean(name));
    if (name) renderSheet();
  }

  function renderSheet() {
    if (!state || !sheet) return;
    const panel = q(`[data-sheet-panel="${sheet}"]`);
    panel.innerHTML = sheet === 'info' ? infoSheet() : settlementSheet();
    for (const b of panel.querySelectorAll('[data-choose-settlement]')) {
      b.addEventListener('click', () => { select({ type: 'settlement', id: b.dataset.chooseSettlement }); renderSheet(); });
    }
    panel.querySelector('[data-close]')?.addEventListener('click', () => setSheet(null));
  }

  function infoSheet() {
    const date = describeDate(state);
    const home = state.settlements[0];
    const unit = state.units[0];
    const entries = Object.values(state.knowledge.player.places);
    const counts = {};
    for (const e of entries) { const s = placeState(e.placeId); counts[s] = (counts[s] ?? 0) + 1; }
    const knowledge = Object.entries(STATE_NAMES).filter(([s]) => counts[s]).map(([s, label]) => html`<dt>${label}</dt><dd>${counts[s]}</dd>`).join('');
    const recent = chronicle.slice(-6).reverse().map((c) => html`<li><span class="chronicle-year">${c.year}</span> ${c.text}</li>`).join('');
    const reports = entries.filter((e) => e.source === 'report').map((e) => html`<li>${e.info.name}: reported by ${e.via.toLowerCase()} in ${formatYear(e.infoYear)}; location uncertain within about ${km(e.info.uncertaintyKm)}.</li>`).join('');
    return `
      <header class="sheet-head"><h2 class="sheet-title">Information</h2><button type="button" class="quiet-button" data-close>Close</button></header>
      <div class="sheet-columns">
        <section class="sheet-section">
          <h3 class="sheet-heading">The present</h3>
          <dl class="sheet-facts">${html`<dt>Year</dt><dd>${date.year}</dd><dt>Period</dt><dd>${date.period}</dd><dt>Turn</dt><dd>${date.turn}</dd><dt>Each turn</dt><dd>${PROTOTYPE.yearsPerTurn} years</dd>`}</dl>
          <h3 class="sheet-heading">Your society</h3>
          <dl class="sheet-facts">${html`<dt>Settlements</dt><dd>${state.settlements.length}</dd><dt>People</dt><dd>${home.population}</dd><dt>Territory</dt><dd>${Math.round(territoryAreaKm2(state.territory.player))} km²</dd><dt>Exploring party</dt><dd>${km(unit.movesLeftKm)} of ${km(unit.moveKm)} travel left; sees ${km(unit.sightKm)}</dd><dt>Away from home</dt><dd>${km(distanceKm(home, unit))}</dd>`}</dl>
        </section>
        <section class="sheet-section">
          <h3 class="sheet-heading">What your people know</h3>
          <p class="sheet-text">The whole Earth is in view. What grows is knowledge of the human world: places your people have seen, heard of, or remember.</p>
          <dl class="sheet-facts">${knowledge || '<dt>Places</dt><dd>None yet</dd>'}${html`<dt>Paths travelled</dt><dd>${state.knowledge.player.routes.length}</dd>`}</dl>
          ${reports ? `<ul class="sheet-list">${reports}</ul>` : ''}
          ${recent ? `<h3 class="sheet-heading">Recent discoveries</h3><ol class="chronicle">${recent}</ol>` : ''}
          <h3 class="sheet-heading">Map symbols</h3>
          <ul class="legend">
            <li><span class="legend-symbol marker-observed"></span>Seen by your people now</li>
            <li><span class="legend-symbol marker-new"></span>Learned this turn</li>
            <li><span class="legend-symbol marker-known"></span>Remembered; may have changed</li>
            <li><span class="legend-symbol marker-reported"></span>Reported by others; location uncertain</li>
            <li><span class="legend-symbol marker-outdated"></span>Old news</li>
            <li><span class="legend-line legend-territory"></span>Your territory</li>
            <li><span class="legend-line legend-sight"></span>What your people can see</li>
          </ul>
        </section>
        <section class="sheet-section">
          <h3 class="sheet-heading">Controls</h3>
          <dl class="sheet-keys">
            <dt><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></dt><dd>Move north, west, south, east</dd>
            <dt><kbd>Q</kbd> <kbd>E</kbd></dt><dd>Roll the globe clockwise, counterclockwise</dd>
            <dt>Drag</dt><dd>Turn the globe</dd>
            <dt>Wheel</dt><dd>Zoom</dd>
            <dt>Double-click</dt><dd>Centre that place</dd>
            <dt>Click</dt><dd>Select a settlement, the party or a place</dd>
            <dt><kbd>M</kbd> or Move</dt><dd>Send the selected party, then click a destination</dd>
            <dt><kbd>Enter</kbd></dt><dd>End the turn</dd>
            <dt><kbd>I</kbd></dt><dd>This information</dd>
            <dt><kbd>U</kbd></dt><dd>Settlement screen</dd>
            <dt><kbd>Esc</kbd></dt><dd>Close a screen or a move; then leave</dd>
          </dl>
          <p class="sheet-note">Strategy prototype. The settlement, places, news and all values are demonstration data for testing the map, not historical claims. A party on foot cannot cross the sea or a lake.</p>
        </section>
      </div>`;
  }

  function settlementSheet() {
    const chosen = selected?.type === 'settlement' ? state.settlements.find((s) => s.id === selected.id) : null;
    if (!chosen) {
      const rows = state.settlements.map((s) => html`<li><button type="button" class="index-entry" data-choose-settlement="${s.id}"><span class="index-label">${s.name}</span><span class="index-note">${s.status}, ${s.population} people</span></button></li>`).join('');
      return `<header class="sheet-head"><h2 class="sheet-title">Settlements</h2><button type="button" class="quiet-button" data-close>Close</button></header>
        <ul class="settlement-list">${rows}</ul>`;
    }
    const area = territoryAreaKm2(state.territory[chosen.owner]);
    const lat = `${Math.abs(chosen.lat).toFixed(2)}° ${chosen.lat >= 0 ? 'N' : 'S'}`, lon = `${Math.abs(chosen.lon).toFixed(2)}° ${chosen.lon >= 0 ? 'E' : 'W'}`;
    // Sections for the permanent simulation are laid out now so they can be filled without a redesign.
    const future = [
      ['Population and labour', 'Households, age groups and the work they do.'],
      ['Economy', 'Farming, herding, crafts, stores and exchange.'],
      ['Infrastructure', 'Houses, storage, water and paths.'],
      ['Development', 'Growth, priorities and the decisions your people put to you.'],
    ].map(([title, text]) => html`<section class="sheet-section is-placeholder"><h3 class="sheet-heading">${title}</h3><p class="sheet-text">${text}</p><p class="sheet-note">Not simulated yet. This arrives with the civilization simulation.</p></section>`).join('');
    return `
      <header class="sheet-head"><div><p class="sheet-kind">Village</p><h2 class="sheet-title">${escape(chosen.name)}</h2></div><button type="button" class="quiet-button" data-close>Close</button></header>
      <div class="sheet-columns">
        <section class="sheet-section">
          <h3 class="sheet-heading">Overview</h3>
          <dl class="sheet-facts">${html`<dt>Type</dt><dd>Village</dd><dt>Population</dt><dd>${chosen.population}</dd><dt>Territory</dt><dd>${Math.round(area)} km² (${state.territory[chosen.owner].length} parcels)</dd><dt>Status</dt><dd>${chosen.status}</dd><dt>Founded</dt><dd>${formatYear(chosen.foundedYear)}</dd><dt>Location</dt><dd>${lat}, ${lon}</dd><dt>Sees</dt><dd>${km(chosen.sightKm)} around</dd>`}</dl>
          <p class="sheet-note">Prototype values. The location is a plausible setting for a Neolithic farming village in the lower Jordan Valley, not a specific historical site. Territory grows by one parcel each turn for now.</p>
        </section>
        ${future}
      </div>`;
  }

  function say(text) {
    const el = q('.dispatch');
    el.textContent = text;
    el.classList.add('is-shown');
    clearTimeout(dispatchTimer);
    dispatchTimer = setTimeout(() => el.classList.remove('is-shown'), DISPATCH_MS);
  }
  function record(text) { chronicle.push({ year: formatYear(state.year), text }); }

  // ------------------------------------------------------------------ actions
  function orderMove(destination) {
    const unit = state.units.find((u) => u.id === selected.id);
    if (unit.movesLeftKm <= 0) { setCommanding(false); return say('The party has travelled as far as it can this turn.'); }
    const plan = planMove(state, unit.id, destination, terrain);
    if (plan.distanceKm <= 0) return say(plan.blocked === 'water' ? 'Water blocks the way. A party on foot cannot cross it.' : 'The party is already there.');
    const result = moveUnit(state, plan);
    persist();
    pendingReveal = new Map(result.discoveries.map((d) => [d.placeId, d.step]));
    animation = { unitId: unit.id, path: plan.path, start: performance.now(), duration: 700 + plan.distanceKm * 30 };
    setCommanding(false);
    refresh();
    say(plan.blocked === 'water' ? `The party walks ${km(plan.distanceKm)} and stops at the water’s edge.`
      : plan.reachesDestination ? `The party walks ${km(plan.distanceKm)}.` : `The party walks ${km(plan.distanceKm)}, as far as it can this turn.`);
    for (const d of result.discoveries) record(`The party found a ${state.knowledge.player.places[d.placeId].info.name.toLowerCase()}.`);
    if (result.discoveries.length) setTimeout(() => say(`The party found a ${state.knowledge.player.places[result.discoveries[0].placeId].info.name.toLowerCase()}.`), Math.min(animation?.duration ?? 0, 2500));
  }

  function doEndTurn() {
    if (phase !== 'playing' || animation) return;
    const result = endTurn(state, terrain);
    persist();
    setCommanding(false);
    refresh({ territory: true });
    const date = describeDate(state);
    const news = [];
    for (const id of result.observed.player ?? []) { const t = `Your people learned of a ${state.knowledge.player.places[id].info.name.toLowerCase()}.`; record(t); news.push(t); }
    for (const r of result.reports) {
      const e = state.knowledge.player.places[r.placeId];
      if (r.outcome === 'new') { const t = `${e.via} bring word of a distant ${e.info.name.toLowerCase()}.`; record(t); news.push(t); }
    }
    say(news.length ? news.join(' ') : `${date.year}.${result.gained.player?.length ? ' Your territory has grown.' : ''}`);
  }

  // Mouse: a single click waits briefly so that a double-click (centre) never selects or moves.
  function later(fn) { clearTimeout(clickTimer); clickTimer = setTimeout(() => { clickTimer = 0; fn(); }, CLICK_DELAY_MS); }
  function cancelClick() { clearTimeout(clickTimer); clickTimer = 0; }
  function onMarkerClick(event, target) {
    if (phase !== 'playing' || animation) return;
    if (event.detail > 1) return cancelClick();
    later(() => {
      if (commanding) orderMove({ lat: target.lat(), lon: target.lon() });
      else select({ type: target.type, id: target.id });
    });
  }
  function onDoubleClick(lat, lon) {
    cancelClick();
    if (phase === 'playing') void earth.centerOn(lat, lon);
  }
  let down = null;
  function onPointerDown(e) { if (phase === 'playing' && e.button === 0) down = { x: e.clientX, y: e.clientY }; }
  // 'click' (not pointerup) carries the click count in event.detail, which identifies double-clicks.
  function onCanvasClick(e) {
    if (!down || phase !== 'playing') return;
    const click = Math.hypot(e.clientX - down.x, e.clientY - down.y) < DRAG_THRESHOLD_PX;
    down = null;
    if (!click || animation) return;
    if (e.detail > 1) return cancelClick();
    const geo = earth.pickGeodetic(e.clientX, e.clientY);
    later(() => {
      if (commanding) { if (geo) orderMove(geo); }
      else select(null);
    });
  }
  function onCanvasDoubleClick(e) {
    const geo = earth.pickGeodetic(e.clientX, e.clientY);
    if (geo) onDoubleClick(geo.lat, geo.lon); else cancelClick();
  }
  function onContextMenu(e) { if (commanding) { e.preventDefault(); setCommanding(false); } }
  let hoverQueued = false;
  function onPointerMove(e) {
    if (phase !== 'playing' || !commanding || animation || down || hoverQueued) return;
    hoverQueued = true;
    const x = e.clientX, y = e.clientY;
    queueMicrotask(() => {
      hoverQueued = false;
      const geo = earth.pickGeodetic(x, y);
      const unit = state?.units.find((u) => u.id === selected?.id);
      showPreview(geo && unit && unit.movesLeftKm > 0 ? planMove(state, unit.id, geo, terrain) : null);
    });
  }

  // Keyboard (WASD/QE are the Earth's; these are the game's). Ignored while typing.
  function onKeyDown(e) {
    if (phase !== 'playing' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || editable(e.target)) return;
    if (e.code === 'KeyI') { toggleSheet('info'); e.preventDefault(); }
    else if (e.code === 'KeyU') { toggleSheet('settlement'); e.preventDefault(); }
    else if (e.code === 'KeyM' && selected?.type === 'unit') { setCommanding(!commanding); e.preventDefault(); }
  }

  q('[data-action="end-turn"]').addEventListener('click', () => doEndTurn());
  q('.selection-move').addEventListener('click', () => setCommanding(true));
  for (const b of root.querySelectorAll('[data-sheet]')) b.addEventListener('click', () => toggleSheet(b.dataset.sheet));

  // ------------------------------------------------------------------ per frame: markers and animation only
  // Zoom-dependent detail without clutter: your own markers first, then places; a place symbol that would sit
  // on top of one already drawn is left out until the player zooms in (or selects it).
  const CLEARANCE_PX = 22;
  const priority = (id, m) => (m.kind === 'settlement' ? 0 : m.kind === 'unit' ? 1 : selected?.id === id ? 2 : 3);
  function layoutMarkers() {
    const altitude = earth.controls.altitude;
    const labels = altitude < LABEL_ALTITUDE;
    const close = altitude < MINIATURE_ALTITUDE;
    const placed = [];
    const ordered = [...markers].sort(([a, ma], [b, mb]) => priority(a, ma) - priority(b, mb));
    for (const [id, m] of ordered) {
      let { lat, lon } = m;
      if (m.kind === 'unit') ({ lat, lon } = animation ? m.animated ?? state.units[0] : state.units[0]);
      const p = earth.projectGeo(lat, lon);
      // The party standing in its village: step its marker aside so both stay clickable.
      if (m.kind === 'unit') {
        const home = placed.find((o) => o.kind === 'settlement');
        if (home && Math.hypot(home.x - p.x, home.y - p.y) < CLEARANCE_PX) { p.x = home.x - 20; p.y = home.y - 16; }
      }
      const crowded = m.kind === 'place' && selected?.id !== id && !m.uncertaintyKm && placed.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < CLEARANCE_PX);
      const show = p.front && !pendingReveal.has(id) && !crowded;
      if (m.el.hidden !== !show) m.el.hidden = !show;
      if (!show) continue;
      placed.push({ ...p, kind: m.kind });
      const transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      if (m.transform !== transform) { m.el.style.transform = transform; m.transform = transform; }
      m.el.classList.toggle('show-label', labels || m.kind !== 'place' || selected?.id === id);
      m.el.classList.toggle('as-miniature', close && m.kind !== 'place');
      if (m.uncertaintyKm) {
        const edge = earth.projectGeo(lat + m.uncertaintyKm / 111.2, lon);
        m.el.style.setProperty('--uncertainty', `${Math.max(14, Math.hypot(edge.x - p.x, edge.y - p.y) * 2).toFixed(0)}px`);
      }
    }
    if (miniatures) {
      miniatures.village.setVisible(close);
      miniatures.party.setVisible(close);
    }
  }

  function step(now) {
    if (!animation) return;
    const t = Math.min(1, (now - animation.start) / animation.duration);
    const path = animation.path;
    const index = t * (path.length - 1);
    const p = path[Math.min(path.length - 1, Math.floor(index))];
    miniatures?.party.setPosition(p.lat, p.lon);
    const m = markers.get(animation.unitId);
    if (m) m.animated = p;
    for (const [placeId, at] of pendingReveal) if (index >= at) { pendingReveal.delete(placeId); markers.get(placeId)?.el.classList.add('just-found'); }
    if (t >= 1) {
      animation = null;
      pendingReveal.clear();
      const u = state.units[0];
      miniatures?.party.setPosition(u.lat, u.lon);
      renderSelection();
    }
    earth.invalidate();
  }

  return {
    async open() {
      opened = true;
      phase = 'loading';
      root.dataset.phase = 'loading';
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('click', onCanvasClick);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('dblclick', onCanvasDoubleClick);
      canvas.addEventListener('contextmenu', onContextMenu);
      window.addEventListener('keydown', onKeyDown);
      try { await loadTerrain(); }
      catch { if (opened) showLobby('The map could not be opened', 'The land and water data for the strategy map could not be read. Restarting Histography from its desktop shortcut usually restores it.', [{ label: 'Return to the title', run: () => onLeave() }]); return; }
      if (!opened) return;
      let saved = null, unreadable = false;
      try { saved = store.load(); } catch { unreadable = true; }
      if (saved) {
        const date = describeDate(saved);
        showLobby('Your strategy game', `A game is saved at turn ${date.turn}, ${date.year}.`, [
          { label: 'Continue the game', note: `${date.year}, ${date.period}`, run: () => { begin(saved); say(`Welcome back. It is ${date.year}.`); } },
          { label: 'Start a new game', note: 'Your current game is kept as the previous save', run: () => newGame() },
          { label: 'Return to the title', run: () => onLeave() },
        ]);
      } else if (unreadable) {
        showLobby('The saved game could not be read', 'Nothing has been deleted. A new game keeps the unreadable save as the previous save.', [
          { label: 'Start a new game', run: () => newGame() },
          { label: 'Return to the title', run: () => onLeave() },
        ]);
      } else newGame();
    },
    close() {
      opened = false;
      phase = 'closed';
      animation = null;
      pendingReveal.clear();
      cancelClick();
      clearTimeout(dispatchTimer);
      setSheet(null);
      commanding = false;
      canvas.classList.remove('commanding');
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('dblclick', onCanvasDoubleClick);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      for (const m of markers.values()) m.el.remove();
      markers.clear();
      markerLayer.hidden = true;
      detachScene();
      earth.setTerritory(null);
      earth.setObservers([]);
      state = null;
      selected = null;
    },
    /** Semantic actions from the UI input (keyboard only in this mode). */
    handle(action) {
      if (action === 'back') {
        if (sheet) { setSheet(null); return true; }
        if (commanding) { setCommanding(false); return true; }
        onLeave();
        return true;
      }
      if (phase === 'lobby') {
        const buttons = [...root.querySelectorAll('.strategy-lobby button')];
        const i = buttons.indexOf(document.activeElement);
        if (action === 'up' || action === 'down') { buttons[(Math.max(i, 0) + (action === 'down' ? 1 : buttons.length - 1)) % buttons.length]?.focus({ focusVisible: true }); return true; }
        if (action === 'activate') { (buttons[i] ?? buttons[0])?.click(); return true; }
        return false;
      }
      if (phase !== 'playing') return action === 'activate';
      if (action === 'activate') {
        const focused = document.activeElement;
        if (focused && root.contains(focused) && focused.matches('button')) { focused.click(); return true; }
        doEndTurn();
        return true;
      }
      return false;
    },
    update(now = performance.now()) {
      if (phase !== 'playing') return;
      step(now);
      layoutMarkers();
    },
    /** Test/diagnostic snapshot: what is shown and known (the world's unknown places are not listed). */
    state() {
      if (!state) return { phase, selected: null, sheet };
      const date = describeDate(state);
      return {
        phase, sheet, commanding, selected, turn: state.turn, year: date.year, period: date.period,
        known: Object.keys(state.knowledge.player.places).sort(),
        markers: [...markers.keys()].sort(),
        observed: [...observedNow].sort(),
        placeStates: Object.fromEntries(Object.keys(state.knowledge.player.places).map((id) => [id, placeState(id)])),
        explorer: { lat: +state.units[0].lat.toFixed(4), lon: +state.units[0].lon.toFixed(4), movesLeftKm: state.units[0].movesLeftKm },
        settlement: { lat: state.settlements[0].lat, lon: state.settlements[0].lon, name: state.settlements[0].name },
        territoryCells: state.territory.player.length,
        routes: state.knowledge.player.routes.length,
        animating: Boolean(animation),
      };
    },
    get phase() { return phase; },
  };
}
