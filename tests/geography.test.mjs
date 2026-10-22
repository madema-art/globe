import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  POLAR_RATIO, geodeticToNormal, geodeticToPosition, positionToGeodetic, geodeticToUv,
  normalizeLongitude, greatCircleDistance, subsolarPoint, formatLatLon,
} from '../src/geography/coordinates.js';

const close = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const landmarks = JSON.parse(await readFile(new URL('../assets/data/processed/earth-landmarks.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('../public/earth/v1/earth.json', import.meta.url), 'utf8'));

// Mirrors normalToUv() in src/shaders/earth/common.glsl.
const shaderUv = ({ x, y, z }) => ({ u: Math.atan2(-z, x) / (2 * Math.PI) + 0.5, v: Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI + 0.5 });

test('render-frame axes follow the documented convention', () => {
  const at = (lat, lon) => Object.values(geodeticToNormal(lat, lon)).map((v) => Math.round(v * 1e9) / 1e9 + 0);
  assert.deepEqual(at(0, 0), [1, 0, 0]);      // prime meridian / equator -> +X
  assert.deepEqual(at(90, 0), [0, 1, 0]);     // north pole -> +Y
  assert.deepEqual(at(0, -90), [0, 0, 1]);    // 90W -> +Z
  assert.deepEqual(at(0, 90), [0, 0, -1]);    // 90E -> -Z
  assert.deepEqual(at(0, 180), [-1, 0, 0]);   // antimeridian -> -X
  // Right-handed: X x Y = Z, so east is counter-clockwise seen from above the north pole (not mirrored).
  const e = geodeticToNormal(0, 0), n = geodeticToNormal(90, 0), w = geodeticToNormal(0, -90);
  close(e.y * n.z - e.z * n.y, w.x, 1e-12, 'cross x');
  close(e.z * n.x - e.x * n.z, w.y, 1e-12, 'cross y');
  close(e.x * n.y - e.y * n.x, w.z, 1e-12, 'cross z');
});

test('shader UV equals the equirectangular raster convention, including the antimeridian', () => {
  for (const [lat, lon] of [[0, 0], [45, 90], [-33.9, 18.4], [10, -179.999], [10, 179.999], [89.9, 45], [-89.9, -120]]) {
    const uv = shaderUv(geodeticToNormal(lat, lon));
    const expected = geodeticToUv(lat, lon);
    close(uv.v, expected.v, 1e-9, `v at ${lat},${lon}`);
    close(uv.u, expected.u, 1e-6, `u at ${lat},${lon}`);
  }
  assert.ok(shaderUv(geodeticToNormal(0, 179.999)).u > 0.9999 && shaderUv(geodeticToNormal(0, -179.999)).u < 0.0001);
});

test('WGS84 ellipsoid positions round-trip through geodetic conversion', () => {
  for (const lm of landmarks.landmarks) {
    for (const height of [0, 8848, -400]) {
      const p = geodeticToPosition(lm.lat, lm.lon, height);
      const g = positionToGeodetic(p.x, p.y, p.z);
      close(g.lat, lm.lat, 1e-9, `${lm.name} lat`);
      close(g.lon, lm.lon, 1e-9, `${lm.name} lon`);
      close(g.heightM, height, 1e-3, `${lm.name} height`);
    }
  }
  const pole = geodeticToPosition(90, 0, 0);
  close(pole.y, POLAR_RATIO, 1e-12, 'polar radius');
  close(positionToGeodetic(0, POLAR_RATIO, 0).lat, 90, 1e-9, 'pole latitude');
});

test('ellipsoid normal matches the shader geodeticNormal()', () => {
  for (const [lat, lon] of [[0, 10], [45, -100], [-60, 150], [80, 0]]) {
    const p = geodeticToPosition(lat, lon, 0);
    const k = 1 / (POLAR_RATIO * POLAR_RATIO);
    const len = Math.hypot(p.x, p.y * k, p.z);
    const n = geodeticToNormal(lat, lon);
    close(p.x / len, n.x, 1e-12, 'nx'); close((p.y * k) / len, n.y, 1e-12, 'ny'); close(p.z / len, n.z, 1e-12, 'nz');
  }
});

test('longitude normalisation wraps into [-180, 180)', () => {
  assert.equal(normalizeLongitude(180), -180);
  assert.equal(normalizeLongitude(-180), -180);
  assert.equal(normalizeLongitude(190), -170);
  assert.equal(normalizeLongitude(-190), 170);
  assert.equal(normalizeLongitude(720 + 47.5), 47.5);
  assert.equal(normalizeLongitude(-0), 0);
});

test('great-circle distances match known values', () => {
  const find = (name) => landmarks.landmarks.find((l) => l.name === name);
  const london = find('London'), nyc = find('New York City');
  close(greatCircleDistance(london.lat, london.lon, nyc.lat, nyc.lon) / 1000, 5570, 15, 'London-New York km');
  close(greatCircleDistance(0, 179.5, 0, -179.5) / 1000, 111.2, 0.2, 'across the antimeridian');
  close(greatCircleDistance(90, 0, -90, 0) / 1000, Math.PI * 6371.0088, 0.01, 'pole to pole');
});

test('landmark sample keeps real coordinates for the targeting demo', () => {
  const byName = Object.fromEntries(landmarks.landmarks.map((l) => [l.name, l]));
  close(byName.Antananarivo.lat, -18.91, 0.02, 'Antananarivo lat');
  close(byName.Antananarivo.lon, 47.54, 0.02, 'Antananarivo lon');
  close(byName.Madagascar.lat, -19.4, 0.3, 'Madagascar centroid lat');
  close(byName.Madagascar.lon, 46.7, 0.3, 'Madagascar centroid lon');
  close(byName.Quito.lat, -0.22, 0.05, 'Quito near the equator');
  assert.ok(byName.Suva.lon > 178 && byName.Suva.lon < 180, 'Suva sits just west of the antimeridian');
  for (const l of landmarks.landmarks) assert.ok(Math.abs(l.lat) <= 90 && l.lon >= -180 && l.lon < 180, l.name);
});

test('subsolar point follows the seasons and the clock', () => {
  close(subsolarPoint(new Date('2026-06-21T12:00:00Z')).lat, 23.43, 0.1, 'June solstice declination');
  close(subsolarPoint(new Date('2026-12-21T12:00:00Z')).lat, -23.43, 0.1, 'December solstice declination');
  close(subsolarPoint(new Date('2026-03-20T12:00:00Z')).lat, 0, 0.5, 'equinox declination');
  // Near 12:00 UTC the sun is close to the prime meridian (equation of time < 17 minutes = 4.3 degrees).
  close(subsolarPoint(new Date('2026-04-15T12:00:00Z')).lon, 0, 4.5, 'noon longitude');
  close(subsolarPoint(new Date('2026-04-15T18:00:00Z')).lon, -90, 4.5, '18:00 UTC longitude');
});

test('runtime asset manifest describes consistent 2:1 equirectangular tiers', () => {
  assert.equal(manifest.schema, 'globe.earth-assets/1');
  for (const [name, tier] of Object.entries(manifest.tiers)) {
    for (const kind of ['day', 'surface', 'atmos']) {
      assert.equal(tier[kind].width, tier[kind].height * 2, `${name}.${kind} aspect`);
      assert.ok(tier[kind].bytes > 0);
    }
  }
  assert.ok(manifest.channels.surface.slopeMax > 0);
  assert.equal(formatLatLon(-18.9137, 47.5361), '18.91° S, 47.54° E');
});
