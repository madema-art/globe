# Decision log

## 2026-10-22 — Initial foundation

- Use the existing `madema-art/globe` repository and `D:\globe` master. `main` is stable; future work uses reviewed `codex/*` and `claude/*` branches.
- Use modern JavaScript, Three.js, and Vite. Production serving is a small Node loopback service independent of Vite HMR.
- Ship only a title and vision panel. Abstract orbital lines make no geographical claims. No helicopter and no final Earth asset in this setup.
- Recreate the requested Dogger launch behavior for Globe; no Dogger gameplay or branding. No local Dogger launcher source was found during initial setup, so this is an independent implementation of the supplied requirements.
- Favor conservative Git safety: fetch, verify configured current branch, require a clean tree including non-ignored untracked files, then fast-forward only with ignored-file overwrite protection. Preserve local/ahead/divergent histories.
- Publish immutable versioned builds. Retain older assets for live sessions. Reload only on the title after detecting a changed published ID; defer otherwise.
- Automatic checks run about every two minutes while the service is alive. Browser checks run about every 20 seconds on the title. Browser timers may be throttled in background tabs.
- Store checkout-specific service ownership and logs below `%LOCALAPPDATA%\Globe`. Authenticated loopback shutdown affects only the verified Globe instance; never kill arbitrary PIDs.

## 2026-10-22 — Earth V1 prototype (Claude; PROVISIONAL, pending review in issue #1)

- Proposed contract: WGS84 degrees `(lat, lon)` at data boundaries, lon `[-180,180)`. Earth-fixed render frame `+X` = 0°/0°, `+Y` = north, `+Z` = 0°/90°W. Unit = equatorial radius; WGS84 ellipsoid geometry. Per-fragment equirectangular texturing with seam-safe gradients. See EARTH_ASSET_CONTRACT.md.
- The camera orbits a fixed Earth (grab-trackball, no Euler angles), so overlays and the sun share one Earth-fixed frame.
- Sources: NASA Blue Marble NG (July 2004), NASA Blue Marble clouds, NASA Black Marble 2016, NOAA ETOPO 2022 60″, Natural Earth 10m, GeoNames cities15000. All downloaded from official hosts by a reproducible pipeline; raw data stays out of Git.
- Texture tiers high/medium/low (day 8K/4K/2K; surface and atmosphere data 4K/4K/2K), WebP/JPEG. Low tier loads first. No KTX2 yet.
- Default lighting is a camera-relative "studio" sun so the visible side is lit and a terminator shows at the limb. A "Real sun" toggle uses the current UTC subsolar point.
- Explore mode added beside title/vision. The title now shows the real Earth instead of the abstract orbit lines; those remain as the no-Earth fallback.
- Everything above can be reverted by removing `src/earth`, `src/shaders/earth`, `public/earth` and the explore UI hooks.

## Pending owner/Claude decisions

Review/approval of Claude's Earth asset contract (axes, UV seam, formats, budgets) and Earth V1 dataset licences; initial content set; border/name policy; rendering budgets and reference hardware; project source license; scoring and challenge rules; Git LFS policy. No custom cube-sphere or enormous tile architecture selected.
