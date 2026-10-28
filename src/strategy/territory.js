import { cellOf, cellCenter, cellsWithin, distanceKm, neighbours, cellAreaKm2 } from './grid.js';

// Territorial ownership (kept separate from exploration and visibility). PROTOTYPE rule only: a settlement
// claims the land cells within a small radius, then grows by a fixed number of cells per turn toward the
// nearest unclaimed land, up to a maximum radius. Terrain, population, influence and neighbours will drive
// the permanent system (Codex's simulation); this module is designed to be replaced.

export function initialTerritory(settlement, terrain, radiusKm) {
  const cells = cellsWithin(settlement, radiusKm).filter((c) => { const p = cellCenter(c); return terrain.isLand(p.lat, p.lon); });
  const home = cellOf(settlement.lat, settlement.lon);
  if (!cells.includes(home)) cells.push(home);
  return cells.sort((a, b) => a - b);
}

/** Claim up to `cellsPerTurn` new cells; returns the cells added. Mutates `owned`. */
export function growTerritory(owned, settlement, terrain, { cellsPerTurn, maxRadiusKm }, claimedByOthers = new Set()) {
  const mine = new Set(owned);
  const added = [];
  for (let n = 0; n < cellsPerTurn; n++) {
    let best = null, bestDistance = Infinity;
    for (const cell of mine) for (const next of neighbours(cell)) {
      if (mine.has(next) || claimedByOthers.has(next)) continue;
      const p = cellCenter(next);
      if (!terrain.isLand(p.lat, p.lon)) continue;
      const d = distanceKm(settlement, p);
      if (d > maxRadiusKm) continue;
      if (d < bestDistance || (d === bestDistance && next < best)) { best = next; bestDistance = d; }
    }
    if (best === null) break;
    mine.add(best); owned.push(best); added.push(best);
  }
  return added;
}

export const territoryAreaKm2 = (cells) => cells.reduce((sum, c) => sum + cellAreaKm2(c), 0);
