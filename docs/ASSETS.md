# Asset contracts and provenance

No Earth assets or geographical datasets have been selected or included. Claude leads research and production; Codex integrates approved assets into the runtime. Coordinate before building the final globe.

## Folder policy

- `assets/blender/`: editable Blender sources; agree file sizes and Git LFS policy before adding large binaries.
- `assets/textures/`: reviewed source textures and provenance records.
- `assets/data/raw/`: ignored, potentially enormous downloads. Keep reproducible download instructions and checksums in documentation rather than adding raw data to Git.
- `assets/data/processed/`: reviewed compact data suitable for version control, subject to a size budget.
- `public/`: approved files shipped as runtime static resources. Every added asset needs a provenance record.
- `src/shaders/`: readable shader sources, authored or properly licensed.

## Proposed handoff checklist

Agree units, axes, latitude/longitude orientation, UV projection/seam, pole treatment, texture color space, format, compression, normal-map convention, and maximum resolution. Prefer a tiny representative asset sample first. glTF/GLB and modern GPU texture formats are candidates, not mandatory decisions. Include expected file sizes, estimated decoded memory, loading strategy, and any level-of-detail relationships. Validate known landmarks against coordinates.

## Provenance record required per asset/dataset

Record a stable ID, author/provider, original URL, download date, dataset version, checksum, exact license and license URL, required attribution, redistribution permissions, permitted derivatives, coordinate reference system, spatial resolution, coverage, known uncertainty, transformations/tools, and output files. Keep original attribution text with the asset manifest. Do not infer that publicly downloadable imagery is freely redistributable.

## Initial inventory

| Item | Origin | Status |
| --- | --- | --- |
| Title orbital lines | Procedural project code, `src/engine/title-scene.js` | Abstract decoration; no geography |
| UI typography | Installed system fonts | No font files distributed |
| Three.js, Vite, Playwright | Locked npm dependencies | Their package licenses apply |
| Earth/terrain/imagery/borders | None | Research and agreement pending |

The owner must select the project source license. Do not add an assumed license or fabricated geographical assets.
