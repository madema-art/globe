// Authoritative geographic coordinate conventions for Globe.
// Data boundary: WGS84 geodetic latitude/longitude in DEGREES,
// latitude [-90, 90] north positive, longitude [-180, 180) east positive.
//
// Earth-fixed render frame (Three.js axes), unit = WGS84 equatorial radius a:
//   +X -> (lat 0, lon 0)    prime meridian on the equator
//   +Y -> north pole
//   +Z -> (lat 0, lon -90)  so that +X x +Y = +Z (right-handed) and lon 90E is -Z
// This equals ECEF (X, Y, Z) mapped to Three (x = X, y = Z, z = -Y): a proper rotation, not a mirror.
// See docs/EARTH_ASSET_CONTRACT.md.

export const WGS84 = Object.freeze({
  a: 6378137.0,
  inverseFlattening: 298.257223563,
  get f() { return 1 / this.inverseFlattening; },
  get b() { return this.a * (1 - this.f); },
  get e2() { return this.f * (2 - this.f); },
});
/** Polar radius / equatorial radius. */
export const POLAR_RATIO = 1 - 1 / WGS84.inverseFlattening;
/** Mean radius used for great-circle distances (IUGG R1). */
export const MEAN_RADIUS_M = 6371008.8;

const DEG = Math.PI / 180;

export function normalizeLongitude(lon) {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function clampLatitude(lat) {
  return Math.max(-90, Math.min(90, lat));
}

/**
 * Unit vector of the ellipsoid surface normal ("up") at a geodetic coordinate, in the Earth-fixed render frame.
 * @returns {{x:number,y:number,z:number}}
 */
export function geodeticToNormal(lat, lon, out = { x: 0, y: 0, z: 0 }) {
  const phi = clampLatitude(lat) * DEG;
  const lambda = lon * DEG;
  const c = Math.cos(phi);
  out.x = c * Math.cos(lambda);
  out.y = Math.sin(phi);
  out.z = -c * Math.sin(lambda);
  return out;
}

/**
 * Position on (or above) the WGS84 ellipsoid in Earth-fixed render units (1 = equatorial radius).
 * @param {number} heightM ellipsoidal height in metres
 */
export function geodeticToPosition(lat, lon, heightM = 0, out = { x: 0, y: 0, z: 0 }) {
  const phi = clampLatitude(lat) * DEG;
  const lambda = lon * DEG;
  const { a, e2 } = WGS84;
  const sinPhi = Math.sin(phi);
  const n = a / Math.sqrt(1 - e2 * sinPhi * sinPhi); // prime vertical radius of curvature
  const r = (n + heightM) * Math.cos(phi);
  out.x = (r * Math.cos(lambda)) / a;
  out.y = ((n * (1 - e2) + heightM) * sinPhi) / a;
  out.z = (-r * Math.sin(lambda)) / a;
  return out;
}

/**
 * Geodetic coordinate of a point given in Earth-fixed render units (Bowring's method, sub-millimetre at the surface).
 * @returns {{lat:number, lon:number, heightM:number}}
 */
export function positionToGeodetic(x, y, z) {
  const { a, b, e2 } = WGS84;
  const X = x * a, Y = -z * a, Z = y * a; // back to ECEF metres
  const p = Math.hypot(X, Y);
  const lon = Math.atan2(Y, X) / DEG;
  if (p < 1e-9) return { lat: Z >= 0 ? 90 : -90, lon: 0, heightM: Math.abs(Z) - b };
  const ep2 = (a * a - b * b) / (b * b);
  const theta = Math.atan2(Z * a, p * b);
  const phi = Math.atan2(Z + ep2 * b * Math.sin(theta) ** 3, p - e2 * a * Math.cos(theta) ** 3);
  const sinPhi = Math.sin(phi);
  const n = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const heightM = p / Math.cos(phi) - n;
  return { lat: phi / DEG, lon: normalizeLongitude(lon), heightM };
}

/** Equirectangular texture coordinate (u east from 180W, v north from 90S) for a geodetic coordinate. */
export function geodeticToUv(lat, lon) {
  return { u: (normalizeLongitude(lon) + 180) / 360, v: (clampLatitude(lat) + 90) / 180 };
}

/** Great-circle distance in metres on the mean sphere (haversine). Adequate for scoring; not survey-grade. */
export function greatCircleDistance(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * DEG, p2 = lat2 * DEG;
  const dp = p2 - p1, dl = (lon2 - lon1) * DEG;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * MEAN_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Approximate subsolar point (NOAA low-precision solar position, ~0.1 degree).
 * @param {Date} date
 * @returns {{lat:number, lon:number}}
 */
export function subsolarPoint(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const epsilon = (23.439 - 0.0000004 * n) * DEG;
  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const rightAscension = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (280.46061837 + 360.98564736629 * n) % 360; // Greenwich mean sidereal time, degrees
  return { lat: declination / DEG, lon: normalizeLongitude(rightAscension / DEG - gmst) };
}

/** Human-readable coordinate, e.g. "18.91° S, 47.54° E". */
export function formatLatLon(lat, lon, digits = 2) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(digits)}° ${ns}, ${Math.abs(lon).toFixed(digits)}° ${ew}`;
}
