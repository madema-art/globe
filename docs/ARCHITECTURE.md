# Architecture

## Initial runtime

Vite bundles JavaScript and Three.js. `src/main.js` controls the title/vision UI. `src/engine/title-scene.js` renders abstract orbital linework with a capped device pixel ratio. The accessible DOM title remains usable if WebGL is unavailable. Claude develops Earth independently. The headless Education Mode engine in `src/game/education/` is not yet wired into the title or Earth.

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

Use WGS84 latitude/longitude in degrees at data boundaries; record longitude convention explicitly (proposed `[-180,180)`, east positive) and latitude `[-90,90]`, north positive. Never interchange degrees/radians or lat/lon order implicitly. Heights need a named datum and units. The actual Three.js axis mapping, texture seam, prime-meridian alignment, north orientation, physical scale, and any ellipsoid/sphere approximation must be agreed with Claude and tested at poles, equator, antimeridian, and known landmarks before assets integrate. GeoJSON order is longitude then latitude; adapters must declare conversions.

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
