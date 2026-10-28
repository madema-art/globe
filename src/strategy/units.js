import { distanceKm, interpolate } from './grid.js';

// Units and movement on real geographic coordinates (great-circle travel, km allowances).
// PROTOTYPE rules: straight-line travel only (no pathfinding); travel stops before water because a party on
// foot cannot cross seas or lakes; a turn restores the movement allowance.

const SAMPLE_KM = 1; // terrain is checked every kilometre along the route

export class MoveError extends Error { constructor(code) { super(code); this.code = code; } }

/**
 * Plan a move toward `destination` without changing state.
 * @returns {{ unitId, path: Array<{lat,lon}>, distanceKm, blocked: null|'water', reachesDestination: boolean }}
 */
export function planMove(state, unitId, destination, terrain) {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) throw new MoveError('UNKNOWN_UNIT');
  if (!Number.isFinite(destination?.lat) || !Number.isFinite(destination?.lon)) throw new MoveError('INVALID_DESTINATION');
  const from = { lat: unit.lat, lon: unit.lon };
  const total = distanceKm(from, destination);
  const travel = Math.min(total, unit.movesLeftKm);
  const steps = Math.max(1, Math.ceil(travel / SAMPLE_KM));
  const path = [from];
  let blocked = null;
  if (travel > 0) {
    for (let i = 1; i <= steps; i++) {
      const p = interpolate(from, destination, (travel * i) / steps / total);
      if (!terrain.isLand(p.lat, p.lon)) { blocked = 'water'; break; }
      path.push(p);
    }
  }
  const distance = travel > 0 ? ((path.length - 1) * travel) / steps : 0;
  return { unitId, path, distanceKm: distance, blocked, reachesDestination: !blocked && travel === total };
}

/** Move the unit along a plan and spend its allowance. Returns the unit. */
export function applyMove(state, plan) {
  const unit = state.units.find((u) => u.id === plan.unitId);
  if (!unit) throw new MoveError('UNKNOWN_UNIT');
  if (plan.distanceKm <= 0 || plan.path.length < 2) throw new MoveError(unit.movesLeftKm <= 0 ? 'NO_MOVEMENT_LEFT' : plan.blocked === 'water' ? 'WATER_BLOCKS' : 'NO_MOVE');
  if (plan.distanceKm > unit.movesLeftKm + 1e-6) throw new MoveError('NOT_ENOUGH_MOVEMENT');
  const end = plan.path.at(-1);
  unit.lat = end.lat; unit.lon = end.lon;
  unit.movesLeftKm = Math.max(0, +(unit.movesLeftKm - plan.distanceKm).toFixed(3));
  return unit;
}

export { distanceKm };
