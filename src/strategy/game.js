import { addYears, formatYear, periodOf } from './calendar.js';
import { distanceKm } from './grid.js';
import { createKnowledge, learn, recordRoute } from './knowledge.js';
import { initialTerritory, growTerritory } from './territory.js';
import { observers } from './visibility.js';
import { applyMove } from './units.js';
import { PROTOTYPE_PLACES, PROTOTYPE_REPORTS, placesExistingIn } from './world.js';

// Strategy prototype: game state and turn progression. All values below are PROTOTYPE values for testing
// the map, discovery and turns; they are not historical claims. The permanent simulation (population, economy,
// technology, diplomacy, communication networks, independent civilizations) will replace these rules.
//
// Principle: the physical Earth is always visible. What changes is what the player's people KNOW about the
// human world: state.world holds what exists; state.knowledge[player] holds what the player knows.

export const PROTOTYPE = Object.freeze({
  startYear: -6000,
  yearsPerTurn: 50,
  player: Object.freeze({ id: 'player' }),
  settlement: Object.freeze({
    id: 'settlement-1',
    name: 'Jordan Valley village',
    // A plausible setting for a Pottery Neolithic farming village in the lower Jordan Valley (spring-fed
    // oasis north of the Dead Sea). Not a specific historical identification.
    lat: 31.87, lon: 35.44,
    population: 150,
    status: 'Farming village',
    sightKm: 30,
  }),
  explorer: Object.freeze({ id: 'explorer-1', name: 'Exploring party', moveKm: 40, sightKm: 25 }),
  territory: Object.freeze({ startRadiusKm: 9, cellsPerTurn: 1, maxRadiusKm: 40 }),
});

export const SCHEMA = 'histography.strategy/2';

export function createGame({ terrain, now = new Date() } = {}) {
  const p = PROTOTYPE;
  const settlement = { ...p.settlement, owner: p.player.id, foundedYear: p.startYear };
  const state = {
    schema: SCHEMA,
    createdAt: now.toISOString(),
    turn: 1,
    year: p.startYear,
    players: [{ id: p.player.id }],
    settlements: [settlement],
    units: [{ id: p.explorer.id, kind: 'explorers', name: p.explorer.name, owner: p.player.id, homeId: settlement.id, lat: settlement.lat, lon: settlement.lon, moveKm: p.explorer.moveKm, movesLeftKm: p.explorer.moveKm, sightKm: p.explorer.sightKm }],
    territory: { [p.player.id]: initialTerritory(settlement, terrain, p.territory.startRadiusKm) },
    world: { places: PROTOTYPE_PLACES.map((place) => ({ ...place })), reports: PROTOTYPE_REPORTS.map((r) => ({ ...r, delivered: false })) },
    knowledge: { [p.player.id]: createKnowledge() },
  };
  observe(state, p.player.id);
  return state;
}

/** Places within a player's observation become known (or refreshed). Returns newly learned place ids. */
export function observe(state, playerId, at = observers(state, playerId)) {
  const fresh = [];
  for (const place of placesExistingIn(state.world.places, state.year)) {
    if (!at.some((o) => distanceKm(o, place) <= o.km)) continue;
    if (learn(state.knowledge[playerId], place, { source: 'observation', turn: state.turn, year: state.year }) === 'new') fresh.push(place.id);
  }
  return fresh;
}

/**
 * Move an exploring party along a plan. Discovery happens progressively along the route.
 * @returns {{ discoveries: Array<{ placeId, step: number }>, steps: number }} step = index into plan.path
 */
export function moveUnit(state, plan) {
  const unit = state.units.find((u) => u.id === plan.unitId);
  const playerId = unit?.owner;
  applyMove(state, plan);
  const discoveries = [];
  const every = 4; // check for discoveries every ~4 km of travel
  for (let i = every; i < plan.path.length + every - 1; i += every) {
    const step = Math.min(i, plan.path.length - 1);
    const p = plan.path[step];
    for (const placeId of observe(state, playerId, [{ lat: p.lat, lon: p.lon, km: unit.sightKm }])) discoveries.push({ placeId, step });
  }
  observe(state, playerId);
  recordRoute(state.knowledge[playerId], plan.path);
  return { discoveries, steps: plan.path.length - 1 };
}

/** Deliver reports whose (prototype) channel brings news this turn. Returns delivered report records. */
function deliverReports(state) {
  const delivered = [];
  for (const report of state.world.reports) {
    if (report.delivered || state.turn < report.arrivesOnTurn) continue;
    const place = state.world.places.find((p) => p.id === report.placeId);
    if (!place || place.from > state.year || !state.knowledge[report.toPlayer]) continue;
    report.delivered = true;
    const outcome = learn(state.knowledge[report.toPlayer], place, { source: 'report', turn: state.turn, year: state.year, channel: report.channel, via: report.via, uncertaintyKm: report.uncertaintyKm });
    delivered.push({ reportId: report.id, placeId: place.id, outcome });
  }
  return delivered;
}

/** End the turn: advance the calendar, restore movement, grow territory, observe, deliver news. */
export function endTurn(state, terrain) {
  state.turn += 1;
  state.year = addYears(state.year, PROTOTYPE.yearsPerTurn);
  for (const unit of state.units) unit.movesLeftKm = unit.moveKm;
  const gained = {};
  for (const settlement of state.settlements) {
    gained[settlement.owner] = growTerritory(state.territory[settlement.owner], settlement, terrain, PROTOTYPE.territory);
  }
  const observed = {};
  for (const player of state.players) observed[player.id] = observe(state, player.id);
  const reports = deliverReports(state);
  return { turn: state.turn, year: state.year, gained, observed, reports };
}

export const describeDate = (state) => ({ year: formatYear(state.year), period: periodOf(state.year), turn: state.turn });
