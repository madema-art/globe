# Architecture

## Initial runtime

Vite bundles JavaScript and Three.js. `src/main.js` controls the title/vision/explore UI. The Earth renderer (`src/earth/earth-view.js`) draws the title backdrop and the explore screen. If it cannot start, `src/engine/title-scene.js` (abstract orbital linework) is used instead. The accessible DOM title remains usable if WebGL is unavailable. There is no gameplay implementation yet.

## Earth V1 (approved 2026-10-22)

- `src/geography/coordinates.js`: WGS84 conventions, geodetic ↔ Earth-fixed conversion, great-circle distance, subsolar point. No Three.js dependency.
- `src/earth/assets.js`: adapter for `public/earth/v1/earth.json` (tier choice, off-thread decoding, disposal).
- `src/earth/earth-view.js`: renderer, ellipsoid surface, cloud shell, atmosphere shell, sun model, target marker, picking, demand rendering, `state()`.
- `src/earth/globe-controls.js`: quaternion grab-trackball, inertia, zoom to cursor, north-up levelling, `flyTo`.
- `src/earth/explore-panel.js`: development HUD (layer toggles, landmark/coordinate targeting, readout).
- `src/shaders/earth/*`: GLSL for the surface, clouds and atmosphere.
- Modes: `title` (globe right of the text, slow spin, not interactive) and `explore` (centred, interactive). Explore is not the title, so the version watcher never reloads during exploration, and leaving explore calls `titleEntered()` like the vision screen.
- Rendering is demand-driven: draw on interaction or animation, otherwise refresh at ≤ 15 fps for drifting clouds. 3 draw calls for the planet.

Conventions and formats: [EARTH_ASSET_CONTRACT.md](EARTH_ASSET_CONTRACT.md).

## Strategy prototype (preview, 2026-10-28)

- `src/strategy/`: pure, replaceable rules (calendar, grid, terrain, world, knowledge, observation, territory, units, turns, saves). No Three.js or DOM.
- `src/strategy-view/`: presentation (screen, markers, miniatures, I/U screens, keyboard and mouse input).
- Earth hooks: the `strategy` presentation, territory texture and observation circles in the surface shader, surface-anchored objects, `projectGeo`, `centerOn`, `src/earth/keyboard-navigation.js`.
- Details: [STRATEGY_PROTOTYPE.md](STRATEGY_PROTOTYPE.md).

## First playable (preview, 2026-10-22)

- `src/app/library-host.js`: capabilities for Codex's library (pinned strict JSON reader, browser progress per channel, WGS84 centre reading, abortable reveal navigation). No game rules.
- `scripts/content/release-plugin.mjs` (Vite plugin): publishes the configured content channel during each build and copies the pinned release into `library/<channel>/` inside the immutable build; defines `__CONTENT_CHANNEL__` and `__FIRST_PORT__`.
- `src/main.js` wires the host, the mystery screen, Codex's confirmation input (X) and the UI input (A/B/navigation) to one per-frame gamepad snapshot.
- Details: [FIRST_PLAYABLE.md](FIRST_PLAYABLE.md).

## Interface (Claude, 2026-10-22)

- Screens in `src/main.js`: `title`, `vision` (About), `explore` (developer exploration) and `mystery`. Only `title` applies a pending build refresh; every transition into it calls `titleEntered()` (unchanged contract).
- `src/style.css`: design tokens and all interface styling ("the instrument"; see ART_DIRECTION.md). Fonts are in `src/ui/fonts/` (OFL).
- `src/ui/bezel.js`: SVG instrument ring tracking `earthView.projection()`.
- `src/ui/focus.js` and `src/ui/ui-input.js`: controller and keyboard focus navigation plus semantic actions (interim, to be fed by Codex's input infrastructure).
- `src/ui/mystery/mystery-screen.js`: the mystery presentation (clue ledger, answer reading, lobby states), fed by the library host.
- Earth additions: `setFraming('center' | 'side')`, `setSelectionMarker`, `setLabelPolicy`, `setLabelExclusions`, `projection()`, label layers and landmark miniatures.

Follow-up modules: `src/earth/gamepad-navigation.js` (dual-stick + trigger control fed by the host's per-frame gamepad snapshot), `src/earth/overlays/*` (zoom-level overlay registry, polyline layers), and the `mystery` presentation with `pickCenter`/`navigateTo`/`resetToPlanetView`. See [EARTH_CONTROLS.md](EARTH_CONTROLS.md), [EARTH_OVERLAYS.md](EARTH_OVERLAYS.md) and [EARTH_GAMEPLAY_API.md](EARTH_GAMEPLAY_API.md).

`src/runtime/version.js` isolates version refresh from UI rendering. Every future transition to title must invoke `titleEntered()`. A version response must recheck the current state before reload, even if a request started at the title and completed after gameplay began. Gameplay modules must not call `location.reload`.

## Intended module boundaries

- Engine: render loop, camera, input, scene lifecycle, resource disposal, performance instrumentation.
- Geography: authoritative coordinates and independent data adapters. Keep lat/lon records independent of mesh representation.
- Asset adapters: load Claude's approved manifests, meshes, textures, and optional levels of detail behind stable interfaces.
- Game: five-clue educational session states, safe clue views, explicit reveal/explanation, and continuation independent of rendering. No grading, score, or timer.
- Overlays: political boundaries, labels, and educational layers independent of physical Earth shading.
- UI/runtime: title, gameplay transitions, settings, accessibility, and safe update deferral.

These are boundaries for future work, not invented APIs with no consumers. Agree a small asset interface and validate it before expanding.

## Geographical contract

Use WGS84 latitude/longitude in degrees at data boundaries; record longitude convention explicitly (proposed `[-180,180)`, east positive) and latitude `[-90,90]`, north positive. Never interchange degrees/radians or lat/lon order implicitly. Heights need a named datum and units. Claude's proposal for the Three.js axis mapping, texture seam, prime-meridian alignment, north orientation, physical scale and ellipsoid is in EARTH_ASSET_CONTRACT.md, with tests at the poles, equator, antimeridian and known landmarks. It is pending Codex/owner review. GeoJSON order is longitude then latitude; adapters must declare conversions.

Do not silently treat rendered terrain as precise survey data. Education Mode records the player's selected coordinates without evaluating distance or accuracy. Any future feedback/evaluation system must remain separate and requires owner design approval.

## Headless educational boundary

`MysterySession` owns validated content privately and exposes immutable, allowlisted snapshots. Clue snapshots contain only neutral IDs, lifecycle/action flags, and already unlocked localized clues. Source references, historical context, identity, target, and explanation appear only in `ANSWER_REVEAL`. Targets are unavailable in idle, clues, and complete states. Each action is explicit; no automatic hint/reveal/advance scheduling exists.

`createConfirmationInput` handles configurable keyboard/gamepad rising edges independently of session rules. Keyboard X defaults to `KeyX`; controller mappings require an explicitly labeled binding. `createEducationEarthBridge` accepts host-supplied center-coordinate and navigation capabilities rather than assuming Claude function names. Async picks use session revisions to reject stale results. Navigation begins only during reveal and receives an abort signal when leaving that reveal.

`content/education/` contains Japanese canonical records and separate English localization files. It is outside `public/` and imported by neither the title nor the production entry point. The host injects IO into the loader. Treat raw records as trusted authoring data, never player-facing payloads. See [EDUCATION_MODE.md](EDUCATION_MODE.md) for schemas, lifecycle examples, and integration obligations. Final UI and Claude adapters require review before integration.

## Performance expectations

Initial target: smooth 60 fps on an agreed mainstream desktop at 1080p, measured rather than promised. Record hardware, browser, frame time percentiles, draw calls, GPU memory estimates, loading time, and network footprint. Cap rendering resolution, dispose replaced assets, avoid blocking main-thread data work, and load detail progressively when measurements justify it. Specific texture and memory budgets await asset evaluation. No commitment to custom cube-spheres or enormous tile systems.

## Production updates

Node serves immutable Vite builds on loopback. Each successful build has a UUID embedded in JavaScript and published through `/version.json`. Asset URLs contain their build ID. Older build folders remain available so open sessions keep loading matching resources. The current pointer changes only after a successful build and source consistency check. Vite HMR is used only by `npm run dev`.

See LAUNCH_AND_UPDATES.md for process ownership and update safety. Launcher/service source updates take full effect on service restart; the running service retains its loaded code until stopped.

## Scalable mystery library

`src/game/library/` composes the existing five-clue session with an async persistent player, a compact metadata catalog, seeded diversity selection and lazy digest-checked records. Presentation is saved before clue exposure. All previously presented IDs remain excluded across launches and content updates; tombstones and aliases preserve history. Explicit exhaustion never starts a repeat pass. Web Locks serialize localStorage writers across same-origin tabs. Failures do not reset history.

Research authoring and approval-gated publication live outside application modules in `content/library/` and `scripts/content/`. Only digest-approved, reviewed records enter a generated release. Current source-checked research is deliberately unapproved. No runtime/UI integration is made. Claude owns all visual integration; the async player requires a future host adapter rather than direct reuse of the synchronous session bridge. See [MYSTERY_LIBRARY.md](MYSTERY_LIBRARY.md) for contracts, failure states, storage-origin limits, pipeline commands and spoiler-free coverage.

## Provisional channel and asynchronous Earth integration

HISTOGRAPHY keeps the existing `globe` infrastructure identities. Provisional source-checked content can be exported only through explicit development enablement, under a separate release tree/current pointer/history ledger. Catalog and loader opt-in plus channel-matched progress prevent silent promotion or internal-play contamination of stable history. Old progress without a channel remains production history.

`createLibraryEarthBridge` is a nonvisual async capability facade over LibraryPlayer. It awaits persistence, emits safe views, handles input epochs independently of session-local revisions, cancels stale centre reads and reveal navigation, and waits for in-flight writes on exit. No visual implementation or synchronous bridge replacement is made. See [LIBRARY_INTEGRATION.md](LIBRARY_INTEGRATION.md).
