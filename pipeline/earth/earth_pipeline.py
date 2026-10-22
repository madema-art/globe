#!/usr/bin/env python3
"""Globe Earth asset pipeline (Earth V1).

Converts official, documented source datasets into the runtime textures in
public/earth/v1/, the landmark sample in assets/data/processed/, and the
provenance manifest assets/earth/MANIFEST.json.

    python pipeline/earth/earth_pipeline.py fetch      # download sources into assets/data/raw/earth (ignored by Git)
    python pipeline/earth/earth_pipeline.py build      # produce runtime textures, landmarks, manifests
    python pipeline/earth/earth_pipeline.py validate   # check landmarks/oceans against the generated rasters
    python pipeline/earth/earth_pipeline.py all

Requirements: Python 3.10+, numpy, Pillow (WebP), h5py, pyshp, tifffile, imagecodecs.
See pipeline/earth/README.md and docs/EARTH_ASSET_CONTRACT.md.

Raster convention for every output: equirectangular (plate carree) on WGS84
geodetic latitude/longitude, row 0 at the north edge (+90), column 0 at the
west edge (-180), pixel-is-area. The centre of pixel (i, j) in a W x H raster
is lon = -180 + (i + 0.5) * 360 / W, lat = 90 - (j + 0.5) * 180 / H.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
import math
import sys
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'assets' / 'data' / 'raw' / 'earth'
OUT = ROOT / 'public' / 'earth' / 'v1'
PROCESSED = ROOT / 'assets' / 'data' / 'processed'
MANIFEST = ROOT / 'assets' / 'earth' / 'MANIFEST.json'
LOCK = Path(__file__).with_name('sources.lock.json')

EO = 'https://eoimages.gsfc.nasa.gov/images/imagerecords'
SOURCES = {
    'bmng-200407': {
        'title': 'NASA Blue Marble: Next Generation, July 2004 (no topography/bathymetry shading)',
        'provider': 'NASA Earth Observatory / NASA Goddard Space Flight Center (Reto Stöckli)',
        'url': f'{EO}/74000/74092/world.200407.3x21600x10800.jpg',
        'page': 'https://visibleearth.nasa.gov/images/74092',
        'file': 'world.200407.3x21600x10800.jpg',
        'resolution': '21600x10800 (500 m/px at the equator), equirectangular, WGS84',
        'license': 'NASA imagery: not copyrighted in the United States; free to use and redistribute with credit. Must not imply NASA endorsement.',
        'license_url': 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
        'attribution': 'NASA Earth Observatory, Blue Marble: Next Generation (Reto Stöckli, NASA GSFC)',
    },
    'bmng-clouds': {
        'title': 'NASA Blue Marble clouds (combined MODIS cloud composite)',
        'provider': 'NASA Goddard Space Flight Center (Reto Stöckli); MODIS data',
        'url': f'{EO}/57000/57747/cloud_combined_8192.tif',
        'page': 'https://visibleearth.nasa.gov/images/57747',
        'file': 'cloud_combined_8192.tif',
        'resolution': '8192x4096, equirectangular',
        'license': 'NASA imagery: not copyrighted in the United States; free to use and redistribute with credit.',
        'license_url': 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
        'attribution': 'NASA Goddard Space Flight Center, Blue Marble clouds (Reto Stöckli), MODIS data',
    },
    'black-marble-2016': {
        'title': 'NASA Black Marble 2016, grayscale 3 km',
        'provider': 'NASA Earth Observatory (Joshua Stevens), Suomi NPP VIIRS data (Miguel Román, NASA GSFC)',
        'url': f'{EO}/144000/144897/BlackMarble_2016_3km_gray.jpg',
        'page': 'https://earthobservatory.nasa.gov/features/NightLights',
        'file': 'BlackMarble_2016_3km_gray.jpg',
        'resolution': '13500x6750 (~3 km/px), equirectangular',
        'license': 'NASA imagery: not copyrighted in the United States; free to use and redistribute with credit.',
        'license_url': 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
        'attribution': 'NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from Miguel Román, NASA GSFC',
    },
    'etopo-2022-60s': {
        'title': 'ETOPO 2022 Global Relief Model, 60 arc-second, ice surface elevation (v1)',
        'provider': 'NOAA National Centers for Environmental Information (NCEI)',
        'url': 'https://www.ngdc.noaa.gov/thredds/fileServer/global/ETOPO2022/60s/60s_surface_elev_netcdf/ETOPO_2022_v1_60s_N90W180_surface.nc',
        'page': 'https://www.ncei.noaa.gov/products/etopo-global-relief-model',
        'file': 'ETOPO_2022_v1_60s_N90W180_surface.nc',
        'resolution': '21600x10800 cells (1 arc-minute), metres, EGM2008 geoid heights',
        'license': 'U.S. Government work (NOAA); public domain.',
        'license_url': 'https://www.ncei.noaa.gov/products/etopo-global-relief-model',
        'attribution': 'NOAA National Centers for Environmental Information. 2022: ETOPO 2022 Global Relief Model. https://doi.org/10.25921/fd45-gt74',
    },
    'ne-10m-land': {
        'title': 'Natural Earth 1:10m Physical: Land (v5.x)',
        'provider': 'Natural Earth (naturalearthdata.com)',
        'url': 'https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip',
        'page': 'https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/',
        'file': 'ne_10m_land.zip',
        'resolution': '1:10,000,000 vector polygons, WGS84',
        'license': 'Public domain.',
        'license_url': 'https://www.naturalearthdata.com/about/terms-of-use/',
        'attribution': 'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com',
    },
    'ne-10m-lakes': {
        'title': 'Natural Earth 1:10m Physical: Lakes + Reservoirs',
        'provider': 'Natural Earth (naturalearthdata.com)',
        'url': 'https://naciscdn.org/naturalearth/10m/physical/ne_10m_lakes.zip',
        'page': 'https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-lakes/',
        'file': 'ne_10m_lakes.zip',
        'resolution': '1:10,000,000 vector polygons, WGS84',
        'license': 'Public domain.',
        'license_url': 'https://www.naturalearthdata.com/about/terms-of-use/',
        'attribution': 'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com',
    },
    'ne-10m-admin0': {
        'title': 'Natural Earth 1:10m Cultural: Admin 0 Countries',
        'provider': 'Natural Earth (naturalearthdata.com)',
        'url': 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip',
        'page': 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/',
        'file': 'ne_10m_admin_0_countries.zip',
        'resolution': '1:10,000,000 vector polygons, WGS84',
        'license': 'Public domain.',
        'license_url': 'https://www.naturalearthdata.com/about/terms-of-use/',
        'attribution': 'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com',
    },
    'geonames-cities15000': {
        'title': 'GeoNames gazetteer extract: cities with population > 15000',
        'provider': 'GeoNames (geonames.org)',
        'url': 'https://download.geonames.org/export/dump/cities15000.zip',
        'page': 'https://www.geonames.org/export/',
        'file': 'cities15000.zip',
        'resolution': 'Point records, WGS84 decimal degrees',
        'license': 'Creative Commons Attribution 4.0 (CC BY 4.0).',
        'license_url': 'https://creativecommons.org/licenses/by/4.0/',
        'attribution': 'Contains data from GeoNames (https://www.geonames.org/), licensed under CC BY 4.0',
    },
}

# Texture tiers. Every tier shares the same layout and channel semantics.
TIERS = {
    'high': {'day': 8192, 'surface': 4096, 'atmos': 4096},
    'medium': {'day': 4096, 'surface': 4096, 'atmos': 4096},
    'low': {'day': 2048, 'surface': 2048, 'atmos': 2048},
}
SLOPE_MAX = 0.12  # |rise/run| represented by a full-scale normal channel (sqrt-encoded)

LANDMARK_CITIES = [
    ('Antananarivo', 'MG'), ('London', 'GB'), ('Quito', 'EC'), ('Singapore', 'SG'),
    ('Reykjavik', 'IS'), ('Sydney', 'AU'), ('Honolulu', 'US'), ('Suva', 'FJ'),
    ('Anchorage', 'US'), ('Cape Town', 'ZA'), ('Ushuaia', 'AR'), ('Nuuk', 'GL'),
    ('Tokyo', 'JP'), ('Cairo', 'EG'), ('Rio de Janeiro', 'BR'), ('New York City', 'US'),
    ('Kathmandu', 'NP'), ('Lima', 'PE'),
]
OCEAN_CHECKS = [('Mid-Atlantic', 0.0, -30.0), ('Central Pacific', 0.0, -150.0), ('Indian Ocean', -30.0, 80.0),
                ('Pacific at antimeridian', 0.0, 179.99), ('Southern Ocean', -60.0, 0.0), ('Arctic Ocean', 88.0, 0.0),
                ('Mozambique Channel', -18.0, 41.0)]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def load_lock() -> dict:
    return json.loads(LOCK.read_text(encoding='utf-8')) if LOCK.exists() else {}


def fetch(args) -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    lock = load_lock()
    for key, spec in SOURCES.items():
        path = RAW / spec['file']
        if not path.exists():
            print(f'{key}: downloading {spec["url"]}')
            tmp = path.with_suffix(path.suffix + '.part')
            with urllib.request.urlopen(spec['url'], timeout=600) as response, open(tmp, 'wb') as f:
                while block := response.read(1 << 20):
                    f.write(block)
            tmp.replace(path)
        digest = sha256_file(path)
        pinned = lock.get(key, {}).get('sha256')
        if pinned and pinned != digest:
            message = f'{key}: checksum {digest} differs from pinned {pinned} (upstream may have been revised)'
            if args.strict:
                sys.exit(message)
            print('WARNING ' + message)
        if not pinned:
            lock[key] = {'sha256': digest, 'bytes': path.stat().st_size, 'acquired': dt.date.today().isoformat()}
        print(f'{key}: {path.name} sha256 {digest}')
    LOCK.write_text(json.dumps(lock, indent=2) + '\n', encoding='utf-8')


# ---------------------------------------------------------------- raster helpers

def resize(a: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    """Area-average resample of a float raster to (width, height)."""
    if (a.shape[1], a.shape[0]) == size:
        return a.astype(np.float32)
    return np.asarray(Image.fromarray(a.astype(np.float32), 'F').resize(size, Image.Resampling.BOX), dtype=np.float32)


def feather_seam(a: np.ndarray, columns: int = 64) -> np.ndarray:
    """Make the west and east edges meet: spread half of the per-row edge mismatch linearly over `columns` on each side.
    Mosaicked sources (e.g. the NASA cloud composite) are not always continuous across the antimeridian."""
    a = a.astype(np.float32)
    mismatch = a[:, :1] - a[:, -1:]
    ramp = (1 - np.arange(columns, dtype=np.float32) / columns)[None, :]
    if a.ndim == 3:
        ramp = ramp[..., None]
    a[:, :columns] -= mismatch * 0.5 * ramp
    a[:, -columns:] += mismatch * 0.5 * ramp[:, ::-1]
    return a


def to_u8(a: np.ndarray) -> np.ndarray:
    return np.clip(np.round(a), 0, 255).astype(np.uint8)


def shapefile_polygons(zip_name: str, select=None):
    import shapefile  # pyshp
    archive = zipfile.ZipFile(RAW / zip_name)
    base = next(n[:-4] for n in archive.namelist() if n.endswith('.shp'))
    reader = shapefile.Reader(shp=io.BytesIO(archive.read(base + '.shp')), shx=io.BytesIO(archive.read(base + '.shx')),
                              dbf=io.BytesIO(archive.read(base + '.dbf')), encoding='utf-8')
    for record in reader.iterShapeRecords():
        if select and not select(record.record.as_dict()):
            continue
        shape = record.shape
        bounds = list(shape.parts) + [len(shape.points)]
        rings = [np.asarray(shape.points[bounds[k]:bounds[k + 1]], dtype=np.float64) for k in range(len(bounds) - 1)]
        yield rings


def signed_area(ring: np.ndarray) -> float:
    x, y = ring[:, 0], ring[:, 1]
    return float((x[:-1] * y[1:] - x[1:] * y[:-1]).sum() / 2)


def rasterize(zip_name: str, width: int, height: int, select=None) -> np.ndarray:
    """Polygon coverage in [0, 1] at width x height (2x supersampled). Shapefile outer rings are clockwise."""
    w, h = width * 2, height * 2
    image = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(image)
    for rings in shapefile_polygons(zip_name, select):
        for ring in sorted(rings, key=lambda r: signed_area(r) >= 0):  # outer (clockwise, negative area) first
            px = [((x + 180) / 360 * w, (90 - y) / 180 * h) for x, y in ring]
            if len(px) >= 3:
                draw.polygon(px, fill=255 if signed_area(ring) < 0 else 0)
    return np.asarray(image.resize((width, height), Image.Resampling.BOX), dtype=np.float32) / 255.0


def load_etopo() -> np.ndarray:
    import h5py
    with h5py.File(RAW / SOURCES['etopo-2022-60s']['file'], 'r') as f:
        z = f['z'][:].astype(np.float32)
        lat = f['lat'][:]
        lon = f['lon'][:]
    if lat[0] < lat[-1]:
        z = z[::-1]  # rows north -> south
    assert z.shape == (10800, 21600) and lon[0] < -179.9, (z.shape, lon[0])
    return z


def slope_normals(z: np.ndarray, land: np.ndarray, size: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    """East/north surface slope (rise/run, dimensionless) of the land surface, area-averaged to size."""
    h, w = z.shape
    radius = 6371008.8
    z = np.where(land > 0.02, np.maximum(z, 0), 0).astype(np.float32)  # sea surface is flat; ice/land keep relief
    lat = np.radians(90 - (np.arange(h) + 0.5) * 180 / h).astype(np.float32)
    dx = (2 * math.pi * radius / w) * np.maximum(np.cos(lat), 0.01)
    dy = math.pi * radius / h
    east = (np.roll(z, -1, axis=1) - np.roll(z, 1, axis=1)) / (2 * dx[:, None])
    north = np.empty_like(z)
    north[1:-1] = (z[:-2] - z[2:]) / (2 * dy)
    north[0], north[-1] = north[1], north[-2]
    return resize(east, size), resize(north, size)


def encode_slope(s: np.ndarray) -> np.ndarray:
    e = np.sign(s) * np.sqrt(np.clip(np.abs(s) / SLOPE_MAX, 0, 1))
    return to_u8(127.5 + 127.5 * e)


def save(array: np.ndarray, path: Path, kind: str) -> dict:
    image = Image.fromarray(array)
    path.parent.mkdir(parents=True, exist_ok=True)
    if kind == 'webp-lossy':
        image.save(path, 'WEBP', quality=90, method=6)
    elif kind == 'webp-lossless':
        image.save(path, 'WEBP', lossless=True, method=6, exact=True)
    elif kind == 'jpeg444':  # full-resolution chroma keeps packed channels independent
        image.save(path, 'JPEG', quality=92, subsampling=0, optimize=True)
    digest = sha256_file(path)
    print(f'  wrote {path.relative_to(ROOT)} {image.size[0]}x{image.size[1]} {path.stat().st_size:,} bytes')
    return {'file': path.name, 'width': image.size[0], 'height': image.size[1], 'bytes': path.stat().st_size, 'sha256': digest}


# ---------------------------------------------------------------- build

def build(args) -> None:
    for spec in SOURCES.values():
        if not (RAW / spec['file']).exists():
            sys.exit(f'missing {RAW / spec["file"]}; run the fetch step first')
    OUT.mkdir(parents=True, exist_ok=True)
    outputs: dict[str, dict] = {}

    print('Day imagery: Blue Marble NG (sRGB)')
    day = Image.fromarray(to_u8(feather_seam(np.asarray(Image.open(RAW / SOURCES['bmng-200407']['file']).convert('RGB')))))
    for size in sorted({t['day'] for t in TIERS.values()}, reverse=True):
        resized = day.resize((size, size // 2), Image.Resampling.LANCZOS)
        outputs[f'day-{size}'] = save(np.asarray(resized), OUT / f'day-{size}x{size // 2}.webp', 'webp-lossy')
    del day

    print('Surface data: R = water fraction, G/B = sqrt-encoded east/north terrain slope')
    surface_max = max(t['surface'] for t in TIERS.values())
    land = rasterize('ne_10m_land.zip', 21600, 10800)
    lakes = rasterize('ne_10m_lakes.zip', 21600, 10800)
    land = np.clip(land - lakes, 0, 1)
    del lakes
    z = load_etopo()
    for size in sorted({t['surface'] for t in TIERS.values()}, reverse=True):
        dims = (size, size // 2)
        east, north = slope_normals(z, land, dims)
        water = 255 * (1 - resize(land, dims))
        rgb = np.dstack([to_u8(water), encode_slope(east), encode_slope(north)])
        outputs[f'surface-{size}'] = save(rgb, OUT / f'surface-{size}x{size // 2}.webp', 'webp-lossless')
        if size == surface_max:
            land_preview = resize(land, (2048, 1024))
    del z

    print('Atmosphere data: R = cloud cover (NASA Blue Marble clouds), G = night lights (Black Marble 2016)')
    import tifffile
    clouds = tifffile.imread(RAW / SOURCES['bmng-clouds']['file']).astype(np.float32)
    if clouds.ndim == 3:
        clouds = clouds[..., 0]
    clouds = feather_seam(clouds)
    lights = feather_seam(np.asarray(Image.open(RAW / SOURCES['black-marble-2016']['file']).convert('L'), dtype=np.float32))
    for size in sorted({t['atmos'] for t in TIERS.values()}, reverse=True):
        dims = (size, size // 2)
        rgb = np.dstack([to_u8(resize(clouds, dims)), to_u8(resize(lights, dims)), np.zeros((dims[1], dims[0]), np.uint8)])
        outputs[f'atmos-{size}'] = save(rgb, OUT / f'atmos-{size}x{size // 2}.jpg', 'jpeg444')

    landmarks = write_landmarks()
    write_runtime_manifest(outputs)
    write_provenance_manifest(outputs, landmarks)
    Image.fromarray(to_u8(land_preview * 255)).save(RAW / 'land-preview.png')


def polygon_centroid(ring: np.ndarray) -> tuple[float, float, float]:
    x, y = ring[:, 0], ring[:, 1]
    cross = x[:-1] * y[1:] - x[1:] * y[:-1]
    area = cross.sum() / 2
    return abs(area), ((x[:-1] + x[1:]) * cross).sum() / (6 * area), ((y[:-1] + y[1:]) * cross).sum() / (6 * area)


def write_landmarks() -> Path:
    best: dict[tuple[str, str], list[str]] = {}
    with zipfile.ZipFile(RAW / 'cities15000.zip') as archive:
        for line in archive.read('cities15000.txt').decode('utf-8').splitlines():
            f = line.split('\t')
            key = (f[2], f[8])  # asciiname, country code
            if key in dict.fromkeys(LANDMARK_CITIES) and (key not in best or int(f[14] or 0) > int(best[key][14] or 0)):
                best[key] = f
    landmarks = []
    rings = [r for rs in shapefile_polygons('ne_10m_admin_0_countries.zip', lambda r: r.get('ADMIN') == 'Madagascar') for r in rs]
    _, cx, cy = max(polygon_centroid(r) for r in rings)
    landmarks.append({'id': 'island:madagascar', 'name': 'Madagascar', 'kind': 'island', 'country': 'MG',
                      'lat': round(cy, 4), 'lon': round(cx, 4), 'source': 'natural-earth'})
    for name, country in LANDMARK_CITIES:
        f = best.get((name, country))
        if not f:
            sys.exit(f'GeoNames record not found: {name}, {country}')
        landmarks.append({'id': f'geonames:{f[0]}', 'name': f[1], 'kind': 'city', 'country': country,
                          'lat': float(f[4]), 'lon': float(f[5]), 'source': 'geonames'})
    out = {
        'schema': 'globe.landmarks/1',
        'crs': 'WGS84 geodetic; decimal degrees; lon [-180,180) east positive; lat [-90,90] north positive',
        'sources': {
            'geonames': SOURCES['geonames-cities15000']['attribution'] + f' — cities15000.zip acquired {load_lock().get("geonames-cities15000", {}).get("acquired", "unknown")}',
            'natural-earth': 'Natural Earth 1:10m Admin 0 Countries (public domain) — area centroid of the largest polygon',
        },
        'oceanChecks': [{'name': n, 'lat': la, 'lon': lo} for n, la, lo in OCEAN_CHECKS],
        'landmarks': landmarks,
    }
    path = PROCESSED / 'earth-landmarks.json'
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'  wrote {path.relative_to(ROOT)} ({len(landmarks)} landmarks)')
    return path


def write_runtime_manifest(outputs: dict) -> None:
    def ref(kind, size):
        o = outputs[f'{kind}-{size}']
        return {'url': o['file'], 'width': o['width'], 'height': o['height'], 'bytes': o['bytes']}
    manifest = {
        'schema': 'globe.earth-assets/1',
        'id': 'earth-v1',
        'crs': 'EPSG:4326 (WGS84 geodetic lat/lon, degrees)',
        'projection': 'equirectangular; row 0 = 90N, column 0 = 180W; pixel-is-area',
        'ellipsoid': {'name': 'WGS84', 'a_m': 6378137.0, 'inverse_flattening': 298.257223563},
        'channels': {
            'day': 'sRGB albedo-like true colour (Blue Marble NG)',
            'surface': {'r': 'water fraction 0..1 (linear)', 'g': 'east slope, sqrt-encoded', 'b': 'north slope, sqrt-encoded',
                        'slopeMax': SLOPE_MAX, 'decode': 's = sign(e) * e^2 * slopeMax, e = value * 2 - 1'},
            'atmos': {'r': 'cloud cover 0..1 (linear)', 'g': 'night lights radiance proxy 0..1 (linear)'},
        },
        'tiers': {name: {kind: ref(kind, size) for kind, size in tier.items()} for name, tier in TIERS.items()},
        'credits': [SOURCES[k]['attribution'] for k in ('bmng-200407', 'bmng-clouds', 'black-marble-2016', 'etopo-2022-60s', 'ne-10m-land')],
    }
    path = OUT / 'earth.json'
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'  wrote {path.relative_to(ROOT)}')


def write_provenance_manifest(outputs: dict, landmarks: Path) -> None:
    lock = load_lock()
    sources = []
    for key, spec in SOURCES.items():
        entry = {'id': key, **{k: v for k, v in spec.items() if k != 'file'}, 'raw_file': spec['file'], **lock.get(key, {})}
        sources.append(entry)
    generated = []
    steps = {
        'day': ['Decode Blue Marble NG JPEG (sRGB)', 'Feather antimeridian edge mismatch over 64 columns', 'Lanczos resample to tier width (2:1)', 'WebP lossy q90'],
        'surface': ['Rasterize Natural Earth 10m land minus 10m lakes at 43200x21600, box-average to 21600x10800',
                    'ETOPO 2022 60s surface elevation; sea forced to 0 m; centred differences on WGS84 authalic radius 6371008.8 m with cos(lat) metric',
                    f'Box-average slopes to tier size; sqrt encoding with slopeMax {SLOPE_MAX}', 'Pack R=water, G=east slope, B=north slope; WebP lossless'],
        'atmos': ['Clouds: NASA cloud_combined_8192.tif, antimeridian edge feathered over 64 columns, box-averaged', 'Night lights: Black Marble 2016 3 km gray box-averaged',
                  'Pack R=clouds, G=lights; JPEG q92 4:4:4'],
    }
    for name, o in sorted(outputs.items()):
        kind = name.split('-')[0]
        derived = {'day': ['bmng-200407'], 'surface': ['ne-10m-land', 'ne-10m-lakes', 'etopo-2022-60s'],
                   'atmos': ['bmng-clouds', 'black-marble-2016']}[kind]
        generated.append({'name': f'public/earth/v1/{o["file"]}', 'derived_from': derived, 'resolution': f'{o["width"]}x{o["height"]}',
                          'format': o['file'].rsplit('.', 1)[1], 'bytes': o['bytes'], 'sha256': o['sha256'], 'processing': steps[kind],
                          'license': 'Inherits source terms; see sources', 'attribution': [SOURCES[d]['attribution'] for d in derived]})
    generated.append({'name': str(landmarks.relative_to(ROOT)).replace('\\', '/'), 'derived_from': ['geonames-cities15000', 'ne-10m-admin0'],
                      'format': 'json', 'sha256': sha256_file(landmarks),
                      'processing': ['Select listed cities by ASCII name + country (largest population on ties)', 'Madagascar = area centroid of largest Natural Earth polygon'],
                      'license': 'CC BY 4.0 (GeoNames) + public domain (Natural Earth)', 'attribution': [SOURCES['geonames-cities15000']['attribution']]})
    manifest = {
        'schema': 'globe.asset-provenance/1',
        'generated': dt.date.today().isoformat(),
        'pipeline': 'pipeline/earth/earth_pipeline.py',
        'status': 'approved by the owner 2026-10-22 (Earth V1, PR #2)',
        'sources': sources,
        'generated_assets': generated,
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'  wrote {MANIFEST.relative_to(ROOT)}')


def sample(image: np.ndarray, lat: float, lon: float):
    h, w = image.shape[:2]
    i = int(math.floor((lon + 180) / 360 * w)) % w
    j = min(h - 1, max(0, int(math.floor((90 - lat) / 180 * h))))
    return image[j, i]


def validate(_args=None) -> None:
    data = json.loads((PROCESSED / 'earth-landmarks.json').read_text(encoding='utf-8'))
    manifest = json.loads((OUT / 'earth.json').read_text(encoding='utf-8'))
    s = np.asarray(Image.open(OUT / manifest['tiers']['high']['surface']['url']).convert('RGB'))
    a = np.asarray(Image.open(OUT / manifest['tiers']['high']['atmos']['url']).convert('RGB'))
    d = np.asarray(Image.open(OUT / manifest['tiers']['high']['day']['url']).convert('RGB')).astype(int)
    failures = 0
    step = 360 / s.shape[1]
    for lm in data['landmarks']:
        # Coastal cities may sit within a texel of the coast; accept land anywhere in the 3x3 neighbourhood.
        water = min(int(sample(s, lm['lat'] + dy * step, lm['lon'] + dx * step)[0]) for dx in (-1, 0, 1) for dy in (-1, 0, 1))
        ok = water < 128
        r, g, b = sample(d, lm['lat'], lm['lon'])
        print(f'{"ok  " if ok else "FAIL"} land   {lm["name"]:<16} {lm["lat"]:9.4f} {lm["lon"]:10.4f} water={water:3d} day=({r},{g},{b}) lights={sample(a, lm["lat"], lm["lon"])[1]}')
        failures += not ok
    for oc in data['oceanChecks']:
        water = int(sample(s, oc['lat'], oc['lon'])[0])
        ok = water > 200
        print(f'{"ok  " if ok else "FAIL"} ocean  {oc["name"]:<24} water={water}')
        failures += not ok
    for name, img in (('day', d), ('surface', s.astype(int)), ('atmos', a.astype(int))):
        seam = np.abs(img[:, 0] - img[:, -1]).mean()
        interior = np.abs(img[:, img.shape[1] // 3] - img[:, img.shape[1] // 3 + 1]).mean()
        ok = seam < interior * 3 + 2
        print(f'{"ok  " if ok else "FAIL"} seam   {name:<8} antimeridian column difference {seam:.2f} (interior {interior:.2f})')
        failures += not ok
    if failures:
        sys.exit(f'{failures} validation failures')
    print('validation passed')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('step', choices=['fetch', 'build', 'validate', 'all'])
    parser.add_argument('--strict', action='store_true', help='fail when a source checksum differs from sources.lock.json')
    args = parser.parse_args()
    if args.step in ('fetch', 'all'):
        fetch(args)
    if args.step in ('build', 'all'):
        build(args)
    if args.step in ('validate', 'all'):
        validate(args)


if __name__ == '__main__':
    main()
