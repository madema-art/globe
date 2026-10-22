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

## 2026-10-22 — Art direction, progressive detail, spoilers, controller (owner; implemented by Claude in a follow-up PR)

- **Purpose:** an educational game about world geography and world history (Bronze Age to the present). Gameplay is five progressively easier clues leading to a location, with no timers, scores or rounds. Codex owns the five-clue engine; Claude owns the Earth experience and its geographic interaction.
- **Art direction:** a serious, sophisticated illustrated amusement-park/atlas map wrapped around the accurate 3D Earth, with curated miniature landmarks and skylines. No roads, street grids or street-level imagery. See ART_DIRECTION.md.
- **Progressive detail:** four continuous levels (planetary → continental → regional → landmark) with smooth fades. Implemented as an altitude-keyed overlay registry; borders and rivers are the first layers. See EARTH_OVERLAYS.md. The border/naming policy is still open (provisional: Natural Earth de facto).
- **Spoiler protection:** no answer-aware Earth APIs, uniform overlay rules, no markers in the `mystery` presentation, every mystery starts from the whole planet, the dev panel only in `explore`, reveal navigation only after confirmation.
- **Controller:** dual-stick three-axis quaternion control. Left stick rotates east/west and north/south; right stick X rolls; right stick Y is fine pitch; RT/LT give analog zoom. A fixed centre reticle. X/A/B are gameplay actions owned by the education engine; the Earth exposes rotation/zoom and shares the host's single per-frame gamepad snapshot. Levelling never fights a deliberate roll and can be disabled. See EARTH_CONTROLS.md.
- **Default stick convention** (proposal, to tune after hands-on testing): the surface follows the stick, like dragging. Per-axis `invert` exists.

## 2026-10-22 — Earth V1 approved by the owner

The owner played Earth V1 and approved it, and its general technical architecture, for integration into `main` (PR #2). Answers to the open questions in issue #1:

- **Camera architecture:** approved. The Earth stays stationary in its Earth-fixed frame; the camera moves around it. The player must experience natural, unrestricted rotation.
- **Graphics memory:** ≈ 256 MB on the high tier is accepted provisionally. Visual quality has priority; medium and low tiers stay available. Texture compression (KTX2) will be decided after real measurements on the owner's Windows gaming PC.
- **Git LFS:** compact processed assets stay in ordinary Git and raw downloads stay out of the repository. Agree an LFS/external-storage policy before adding substantially larger textures, Blender files or 3D landmark libraries.
- **Performance target:** smooth 60 fps at 1920×1080 on the owner's Windows gaming PC. Codex helps identify the hardware and set up benchmarks. Mobile is not a priority.
- **Linux infrastructure quirks** (`npmCi` npm path, `build-check` `EISDIR`): left to Codex; Claude does not rewrite unrelated infrastructure.

## 2026-10-22 — Earth V1 prototype (Claude; approved above)

- Proposed contract: WGS84 degrees `(lat, lon)` at data boundaries, lon `[-180,180)`. Earth-fixed render frame `+X` = 0°/0°, `+Y` = north, `+Z` = 0°/90°W. Unit = equatorial radius; WGS84 ellipsoid geometry. Per-fragment equirectangular texturing with seam-safe gradients. See EARTH_ASSET_CONTRACT.md.
- The camera orbits a fixed Earth (grab-trackball, no Euler angles), so overlays and the sun share one Earth-fixed frame.
- Sources: NASA Blue Marble NG (July 2004), NASA Blue Marble clouds, NASA Black Marble 2016, NOAA ETOPO 2022 60″, Natural Earth 10m, GeoNames cities15000. All downloaded from official hosts by a reproducible pipeline; raw data stays out of Git.
- Texture tiers high/medium/low (day 8K/4K/2K; surface and atmosphere data 4K/4K/2K), WebP/JPEG. Low tier loads first. No KTX2 yet.
- Default lighting is a camera-relative "studio" sun so the visible side is lit and a terminator shows at the limb. A "Real sun" toggle uses the current UTC subsolar point.
- Explore mode added beside title/vision. The title now shows the real Earth instead of the abstract orbit lines; those remain as the no-Earth fallback.
- Everything above can be reverted by removing `src/earth`, `src/shaders/earth`, `public/earth` and the explore UI hooks.

## Pending owner/Claude decisions

Review/approval of Claude's Earth asset contract (axes, UV seam, formats, budgets) and Earth V1 dataset licences; initial content set; border/name policy; rendering budgets and reference hardware; project source license; scoring and challenge rules; Git LFS policy. No custom cube-sphere or enormous tile architecture selected.
