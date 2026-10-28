import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PROTOTYPE, createGame, endTurn, moveUnit, describeDate, addYears, formatYear, periodOf,
  cellOf, cellCenter, cellsWithin, distanceKm, decodeLandMask, createTerrain,
  observedPlaceIds, planMove, MoveError, territoryAreaKm2, knowledgeState, OUTDATED_AFTER_YEARS,
  serialize, deserialize, createSaveStore, SAVE_KEY, PREVIOUS_KEY, SaveError,
} from '../src/strategy/index.js';

const terrain = createTerrain(decodeLandMask(await readFile(new URL('../public/strategy/v1/landmask-4096x2048.rle', import.meta.url))));
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), keys: () => [...m.keys()] }; };
const known = (s) => Object.keys(s.knowledge.player.places).sort();

test('calendar: BCE chronology, no year zero, prototype periods', () => {
  assert.equal(formatYear(-6000), '6000 BCE');
  assert.equal(addYears(-6000, 50), -5950);
  assert.equal(addYears(-50, 50), 1, '50 BCE + 50 years = 1 CE (no year 0)');
  assert.equal(addYears(-1, 1), 1);
  assert.equal(addYears(1, -1), -1);
  assert.equal(formatYear(addYears(-25, 100)), '76 CE');
  assert.throws(() => formatYear(0), RangeError);
  assert.equal(periodOf(-6000), 'Neolithic');
  assert.equal(periodOf(-4500), 'Chalcolithic');
  assert.equal(periodOf(-1000), 'Iron Age');
});

test('grid: real coordinates, antimeridian, cells within a radius', () => {
  const c = cellCenter(cellOf(31.87, 35.44));
  assert.ok(Math.abs(c.lat - 31.87) <= 0.0625 && Math.abs(c.lon - 35.44) <= 0.0625);
  assert.equal(cellOf(10, 180), cellOf(10, -180));
  const near = cellsWithin({ lat: 10, lon: 179.95 }, 20);
  assert.ok(near.some((cell) => cellCenter(cell).lon < 0) && near.some((cell) => cellCenter(cell).lon > 0), 'radius wraps the antimeridian');
  assert.ok(near.every((cell) => distanceKm({ lat: 10, lon: 179.95 }, cellCenter(cell)) <= 20));
  assert.ok(Math.abs(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111.19) < 0.1);
});

test('terrain: land and water match the visible coasts', () => {
  assert.equal(terrain.isLand(31.87, 35.44), true, 'Jordan Valley');
  assert.equal(terrain.isLand(32.5, 34.0), false, 'Mediterranean');
  assert.equal(terrain.isLand(31.5, 35.5), false, 'Dead Sea');
});

test('new game: 6000 BCE in Canaan; own settlement known; other human places exist but are mostly unknown', () => {
  const s = createGame({ terrain });
  assert.deepEqual(describeDate(s), { year: '6000 BCE', period: 'Neolithic', turn: 1 });
  const home = s.settlements[0];
  assert.ok(home.lat > 31 && home.lat < 33.5 && home.lon > 34.2 && home.lon < 36 && terrain.isLand(home.lat, home.lon), 'in the southern Levant, on land');
  const area = territoryAreaKm2(s.territory.player);
  assert.ok(area > 50 && area < 1000, `tiny territory (${area.toFixed(0)} km²)`);
  assert.ok(s.world.places.length >= 5, 'the world holds places independent of knowledge');
  assert.deepEqual(known(s), ['place-valley'], 'only the nearby surroundings are known');
  for (const place of s.world.places) assert.ok(terrain.isLand(place.lat, place.lon), `${place.id} on land`);
  assert.ok(s.world.places.every((p) => p.prototype === true), 'demonstration data is labelled');
});

test('exploration reveals nearby places; memory persists after the party leaves', () => {
  const s = createGame({ terrain });
  const plan = planMove(s, 'explorer-1', { lat: 31.76, lon: 34.9 }, terrain); // west into the hills
  assert.equal(plan.blocked, null);
  assert.ok(plan.distanceKm > 39 && plan.distanceKm <= 40.001 && !plan.reachesDestination, 'limited by the allowance');
  const { discoveries } = moveUnit(s, plan);
  assert.ok(discoveries.some((d) => d.placeId === 'place-hamlet'), 'the hillside hamlet is discovered on the way');
  assert.ok(discoveries.every((d) => d.step > 0 && d.step <= plan.path.length - 1));
  assert.equal(s.units[0].movesLeftKm, 0);
  assert.throws(() => moveUnit(s, planMove(s, 'explorer-1', { lat: 31.76, lon: 34.5 }, terrain)), (e) => e instanceof MoveError && e.code === 'NO_MOVEMENT_LEFT');
  assert.equal(s.knowledge.player.routes.length, 1, 'the route travelled is remembered');
  endTurn(s, terrain);
  assert.equal(s.units[0].movesLeftKm, PROTOTYPE.explorer.moveKm, 'end of turn restores movement');
  moveUnit(s, planMove(s, 'explorer-1', { lat: 31.6, lon: 34.6 }, terrain));
  endTurn(s, terrain); endTurn(s, terrain);
  assert.ok(!observedPlaceIds(s, 'player').has('place-hamlet'), 'no longer observed');
  assert.ok(known(s).includes('place-hamlet'), 'but still known');
  const entry = s.knowledge.player.places['place-hamlet'];
  const years = s.year - entry.infoYear;
  assert.equal(knowledgeState(entry, { observedNow: false, turn: s.turn, yearsSinceInfo: years }), years >= OUTDATED_AFTER_YEARS ? 'outdated' : 'known');
});

test('news of a distant place arrives without exploration, with uncertainty, and only through its channel', () => {
  const s = createGame({ terrain });
  const distant = s.world.places.find((p) => p.id === 'place-anatolia');
  assert.ok(distanceKm(s.settlements[0], distant) > 500, 'far beyond any observation range');
  assert.ok(!known(s).includes('place-anatolia'));
  for (let t = 1; t < 3; t++) endTurn(s, terrain);
  assert.ok(!known(s).includes('place-anatolia'), 'importance alone does not reveal it');
  const result = endTurn(s, terrain); // turn 4: traders arrive
  assert.deepEqual(result.reports.map((r) => r.placeId), ['place-anatolia']);
  const entry = s.knowledge.player.places['place-anatolia'];
  assert.equal(entry.source, 'report');
  assert.ok(entry.via && entry.info.uncertaintyKm > 0);
  assert.equal(knowledgeState(entry, { observedNow: false, turn: s.turn, yearsSinceInfo: 0 }), 'new');
  endTurn(s, terrain);
  assert.equal(knowledgeState(entry, { observedNow: false, turn: s.turn, yearsSinceInfo: s.year - entry.infoYear }), 'reported');
  for (let t = 0; t < 3; t++) endTurn(s, terrain);
  assert.equal(knowledgeState(entry, { observedNow: false, turn: s.turn, yearsSinceInfo: s.year - entry.infoYear }), 'outdated', 'old news becomes outdated');
  assert.equal(result.reports.length, 1);
  assert.equal(endTurn(s, terrain).reports.length, 0, 'delivered once');
});

test('movement: a party on foot cannot cross the sea', () => {
  const s = createGame({ terrain });
  s.units[0].lat = 32.08; s.units[0].lon = 34.80;
  const plan = planMove(s, 'explorer-1', { lat: 32.08, lon: 33.9 }, terrain);
  assert.equal(plan.blocked, 'water');
  assert.ok(plan.distanceKm < 15 && terrain.isLand(plan.path.at(-1).lat, plan.path.at(-1).lon), 'stops at the shore');
  s.units[0].lat = 32.5; s.units[0].lon = 34.0;
  assert.throws(() => moveUnit(s, planMove(s, 'explorer-1', { lat: 32.5, lon: 33.5 }, terrain)), (e) => e.code === 'WATER_BLOCKS');
});

test('territory grows slowly on land near home, independent of exploration and knowledge', () => {
  const s = createGame({ terrain });
  const start = s.territory.player.length;
  moveUnit(s, planMove(s, 'explorer-1', { lat: 32.3, lon: 35.5 }, terrain));
  assert.equal(s.territory.player.length, start, 'exploring does not claim land');
  for (let i = 0; i < 5; i++) endTurn(s, terrain);
  assert.equal(s.territory.player.length, start + 5, 'one cell per turn (prototype)');
  for (let i = 0; i < 200; i++) endTurn(s, terrain);
  const home = s.settlements[0];
  assert.ok(s.territory.player.every((c) => distanceKm(home, cellCenter(c)) <= PROTOTYPE.territory.maxRadiusKm + 10), 'bounded radius');
  assert.ok(s.territory.player.slice(start).every((c) => { const p = cellCenter(c); return terrain.isLand(p.lat, p.lon); }), 'growth only on land');
  assert.ok(territoryAreaKm2(s.territory.player) < 6000, 'never an enormous region');
  assert.equal(describeDate(s).year, formatYear(addYears(-6000, 205 * 50)));
});

test('save and resume: state and knowledge round-trip; separate keys; new game keeps the previous save', () => {
  const s = createGame({ terrain });
  moveUnit(s, planMove(s, 'explorer-1', { lat: 31.76, lon: 34.9 }, terrain));
  for (let i = 0; i < 4; i++) endTurn(s, terrain);
  const restored = deserialize(serialize(s));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(s)));
  assert.deepEqual([...observedPlaceIds(restored, 'player')].sort(), [...observedPlaceIds(s, 'player')].sort(), 'observation reconstructs');
  assert.ok(serialize(s).length < 20_000, 'compact save');
  const storage = memory();
  storage.setItem('globe.education.development.progress', 'mystery-progress');
  const store = createSaveStore(storage);
  assert.equal(store.load(), null);
  store.save(s);
  assert.equal(store.load().turn, s.turn);
  store.archiveCurrent();
  store.save(createGame({ terrain }));
  assert.equal(deserialize(storage.getItem(PREVIOUS_KEY)).turn, s.turn, 'previous game kept');
  assert.equal(store.load().turn, 1);
  assert.equal(storage.getItem('globe.education.development.progress'), 'mystery-progress', 'mystery progress untouched');
  assert.deepEqual(storage.keys().sort(), ['globe.education.development.progress', PREVIOUS_KEY, SAVE_KEY].sort());
  storage.setItem(SAVE_KEY, '{broken');
  assert.throws(() => store.load(), (e) => e instanceof SaveError && e.code === 'CORRUPT_SAVE');
});
