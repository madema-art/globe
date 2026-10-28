// Gameplay spatial grid: equal-angle cells of 1/8 degree on the WGS84 latitude/longitude graticule
// (about 14 km north-south). Row 0 is the southernmost row, column 0 starts at 180°W. The grid is for
// calculations only; the renderer smooths it into natural shapes, so its squares are never shown.
// Distances use a spherical Earth of mean radius (adequate for gameplay ranges).

export const CELL_DEG = 0.125;
export const COLS = 360 / CELL_DEG;   // 2880
export const ROWS = 180 / CELL_DEG;   // 1440
export const CELL_COUNT = COLS * ROWS;
export const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;

export const normalizeLon = (lon) => { let v = ((lon + 180) % 360 + 360) % 360 - 180; if (Object.is(v, -0)) v = 0; return v; };

export function cellOf(lat, lon) {
  const row = Math.min(ROWS - 1, Math.max(0, Math.floor((lat + 90) / CELL_DEG)));
  const col = Math.floor((normalizeLon(lon) + 180) / CELL_DEG) % COLS;
  return row * COLS + col;
}

export function cellCenter(cell) {
  const row = Math.floor(cell / COLS), col = cell % COLS;
  return { lat: -90 + (row + 0.5) * CELL_DEG, lon: -180 + (col + 0.5) * CELL_DEG };
}

/** Area of a cell in km² (spherical). */
export function cellAreaKm2(cell) {
  const row = Math.floor(cell / COLS);
  const south = (-90 + row * CELL_DEG) * RAD, north = south + CELL_DEG * RAD;
  return EARTH_RADIUS_KM ** 2 * (CELL_DEG * RAD) * (Math.sin(north) - Math.sin(south));
}

/** Great-circle distance in km between two { lat, lon } points. */
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point a fraction t of the way along the great circle from a to b. */
export function interpolate(a, b, t) {
  const toVec = (p) => [Math.cos(p.lat * RAD) * Math.cos(p.lon * RAD), Math.cos(p.lat * RAD) * Math.sin(p.lon * RAD), Math.sin(p.lat * RAD)];
  const va = toVec(a), vb = toVec(b);
  const omega = Math.acos(Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2])));
  if (omega < 1e-12) return { lat: a.lat, lon: a.lon };
  const s = Math.sin(omega), ka = Math.sin((1 - t) * omega) / s, kb = Math.sin(t * omega) / s;
  const v = [ka * va[0] + kb * vb[0], ka * va[1] + kb * vb[1], ka * va[2] + kb * vb[2]];
  return { lat: Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD, lon: normalizeLon(Math.atan2(v[1], v[0]) / RAD) };
}

/** Cells whose centres lie within `km` of a point (handles the antimeridian and the poles). */
export function cellsWithin(center, km) {
  const out = [];
  const dLat = (km / EARTH_RADIUS_KM) / RAD;
  const r0 = Math.max(0, Math.floor((center.lat - dLat + 90) / CELL_DEG));
  const r1 = Math.min(ROWS - 1, Math.floor((center.lat + dLat + 90) / CELL_DEG));
  for (let row = r0; row <= r1; row++) {
    const lat = -90 + (row + 0.5) * CELL_DEG;
    const cos = Math.cos(lat * RAD);
    const span = cos < 1e-6 ? 180 : Math.min(180, (km / (EARTH_RADIUS_KM * cos)) / RAD + CELL_DEG);
    const c0 = Math.floor((normalizeLon(center.lon) - span + 180) / CELL_DEG);
    const count = span >= 180 ? COLS : Math.min(COLS, Math.ceil((2 * span) / CELL_DEG) + 1);
    for (let k = 0; k < count; k++) {
      const col = ((c0 + k) % COLS + COLS) % COLS;
      const cell = row * COLS + col;
      if (distanceKm(center, cellCenter(cell)) <= km) out.push(cell);
    }
  }
  return out;
}

/** The 8 neighbouring cells (wrapping east-west; no rows beyond the poles). */
export function neighbours(cell) {
  const row = Math.floor(cell / COLS), col = cell % COLS, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const r = row + dr;
    if (r < 0 || r >= ROWS) continue;
    out.push(r * COLS + ((col + dc + COLS) % COLS));
  }
  return out;
}
