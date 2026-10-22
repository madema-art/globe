# Asset contracts and provenance

Claude has proposed the Earth asset contract in [EARTH_ASSET_CONTRACT.md](EARTH_ASSET_CONTRACT.md) (review in [issue #1](https://github.com/madema-art/globe/issues/1)). The owner approved the contract and the Earth V1 assets on 2026-10-22 (see DECISIONS.md). Claude leads research and production; Codex integrates approved assets into the runtime.

## Folder policy

- `assets/blender/`: editable Blender sources; agree file sizes and Git LFS policy before adding large binaries.
- `assets/textures/`: reviewed source textures and provenance records.
- `assets/data/raw/`: ignored, potentially enormous downloads. Keep reproducible download instructions and checksums in documentation rather than adding raw data to Git.
- `assets/data/processed/`: reviewed compact data suitable for version control, subject to a size budget.
- `public/`: approved files shipped as runtime static resources. Every added asset needs a provenance record.
- `src/shaders/`: readable shader sources, authored or properly licensed.

## Earth V1 layout

- `pipeline/earth/`: reproducible pipeline (`earth_pipeline.py`), pinned source checksums (`sources.lock.json`) and README.
- `assets/data/raw/earth/`: ignored downloads (~550 MB, including the 478 MB ETOPO netCDF).
- `public/earth/v1/`: runtime textures (~14 MB across all tiers) plus `earth.json`, the runtime manifest.
- `assets/earth/MANIFEST.json` and `ATTRIBUTION.md`: provenance and credits for every source and generated file.

Git LFS is still not configured. Earth V1 commits ~14 MB of WebP/JPEG; agree an LFS policy before adding larger textures.

## Proposed handoff checklist

Agree units, axes, latitude/longitude orientation, UV projection/seam, pole treatment, texture color space, format, compression, normal-map convention, and maximum resolution. Prefer a tiny representative asset sample first. glTF/GLB and modern GPU texture formats are candidates, not mandatory decisions. Include expected file sizes, estimated decoded memory, loading strategy, and any level-of-detail relationships. Validate known landmarks against coordinates.

## Provenance record required per asset/dataset

Record a stable ID, author/provider, original URL, download date, dataset version, checksum, exact license and license URL, required attribution, redistribution permissions, permitted derivatives, coordinate reference system, spatial resolution, coverage, known uncertainty, transformations/tools, and output files. Keep original attribution text with the asset manifest. Do not infer that publicly downloadable imagery is freely redistributable.

## Initial inventory

| Item | Origin | Status |
| --- | --- | --- |
| Title orbital lines | Procedural project code, `src/engine/title-scene.js` | Abstract decoration; no geography |
| Three.js, Vite, Playwright | Locked npm dependencies | Their package licenses apply |
| Earth day imagery | NASA Blue Marble NG (July 2004) → `public/earth/v1/day-*.webp` | Approved (Earth V1); see `assets/earth/MANIFEST.json` |
| Water mask + terrain slopes | Natural Earth 10m land/lakes + NOAA ETOPO 2022 60″ → `public/earth/v1/surface-*.webp` | Approved (Earth V1) |
| Clouds + night lights | NASA Blue Marble clouds + Black Marble 2016 → `public/earth/v1/atmos-*.jpg` | Approved (Earth V1) |
| Landmark sample | GeoNames cities15000 (CC BY 4.0) + Natural Earth → `assets/data/processed/earth-landmarks.json` | Approved; validation and dev targeting only |
| Borders, rivers | Natural Earth 10m → `public/earth/v1/overlays/*.bin` | Rendered (levels 2–3) |
| Place-name labels | Natural Earth admin-0, populated places, geography regions, marine areas → `public/earth/v1/labels.json` | Rendered (levels 2–3; hidden during mysteries) |
| Landmark registry | Wikidata P625 coordinates (CC0) → `assets/data/processed/landmarks.json` | Prototype set of three; procedural miniatures |
| Interface typefaces | Bodoni Moda, Newsreader, Instrument Sans (Fontsource 5.3.0 builds) → `src/ui/fonts/` | SIL Open Font License 1.1; licence texts bundled |

The owner must select the project source license. Do not add an assumed license or fabricated geographical assets.
