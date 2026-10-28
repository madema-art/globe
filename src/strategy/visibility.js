import { distanceKm } from './grid.js';

// Current observation is DERIVED, never stored: which places a player's settlements and units can see now.
// Recompute it when gameplay state changes (moves, turns, loads), not per frame.

export function observers(state, playerId) {
  return [
    ...state.settlements.filter((s) => s.owner === playerId).map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, km: s.sightKm })),
    ...state.units.filter((u) => u.owner === playerId).map((u) => ({ id: u.id, lat: u.lat, lon: u.lon, km: u.sightKm })),
  ];
}

/** Ids of world places currently within observation range of a player. */
export function observedPlaceIds(state, playerId, places = state.world.places) {
  const watch = observers(state, playerId);
  return new Set(places.filter((p) => watch.some((o) => distanceKm(o, p) <= o.km)).map((p) => p.id));
}
