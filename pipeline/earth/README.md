# Earth asset pipeline

Turns official source datasets into the browser textures in `public/earth/v1/`, the landmark sample in `assets/data/processed/earth-landmarks.json`, and the provenance manifest `assets/earth/MANIFEST.json`.

```powershell
py -m pip install numpy pillow h5py pyshp tifffile imagecodecs
py pipeline\earth\earth_pipeline.py fetch      # ~550 MB into assets\data\raw\earth (ignored by Git)
py pipeline\earth\earth_pipeline.py build      # ~3 minutes, ~4 GB RAM peak
py pipeline\earth\earth_pipeline.py validate
```

(On Linux/macOS use `python3`.)

- `fetch` downloads each source from its official host (NASA Earth Observatory, NOAA NCEI, Natural Earth CDN, GeoNames). It records SHA-256 checksums in `sources.lock.json`; later runs warn, or with `--strict` fail, when upstream files change. GeoNames is regenerated daily upstream, so its checksum documents our acquisition rather than pinning a release.
- `build` writes all tiers (`TIERS` in the script), `earth.json` and `MANIFEST.json`.
- `validate` checks landmarks fall on land, open-ocean points are water, and the antimeridian edges are continuous.

The raw downloads (the ETOPO netCDF alone is 478 MB) never enter Git. Only the processed textures (~14 MB) are committed. Git LFS is not configured in this repository; if textures grow past ~25 MB, agree an LFS policy with Codex first (see docs/ASSETS.md).

## Upgrading

- **Sharper day imagery:** raise `TIERS['high']['day']` (the source is 21600×10800). Mind GPU memory: 16384×8192 RGBA8 is ≈ 680 MB with mips. Prefer regional patches or KTX2 compression.
- **Different month:** change the `bmng-200407` URL to another `world.2004MM.3x21600x10800.jpg` record and update the manifest entry.
- **Terrain detail:** ETOPO 2022 is also published at 15 arc-seconds. Copernicus GLO-30 suits regional tiles. Keep heights in metres and the raster convention in docs/EARTH_ASSET_CONTRACT.md.
- **GEBCO:** the annual GEBCO grid (e.g. GEBCO_2025/2026) can replace ETOPO for bathymetry if ocean-floor shading is ever wanted. ETOPO 2022 already incorporates GEBCO in the oceans. Verify the current release and terms at https://www.gebco.net/ before switching.

No Blender asset was needed for Earth V1: the atmosphere, clouds and ocean are real-time shaders. `assets/blender/` stays the home for future Blender prototypes.
