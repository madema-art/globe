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

`src/runtime/version.js` isolates version refresh from UI rendering. Every future transition to title must invoke `titleEntered()`. A version response must recheck the current state before reload, even if a request started at the title and completed after gameplay began. Gameplay modules must not call `location.reload`.

## Intended module boundaries

- Engine: render loop, camera, input, scene lifecycle, resource disposal, performance instrumentation.
- Geography: authoritative coordinates and independent data adapters. Keep lat/lon records independent of mesh representation.
- Asset adapters: load Claude's approved manifests, meshes, textures, and optional levels of detail behind stable interfaces.
- Game: challenge state, answer evaluation, score, timer, and persistence independent of rendering.
- Overlays: political boundaries, labels, and educational layers independent of physical Earth shading.
- UI/runtime: title, gameplay transitions, settings, accessibility, and safe update deferral.

These are boundaries for future work, not invented APIs with no consumers. Agree a small asset interface and validate it before expanding.

## Geographical contract

Use WGS84 latitude/longitude in degrees at data boundaries; record longitude convention explicitly (proposed `[-180,180)`, east positive) and latitude `[-90,90]`, north positive. Never interchange degrees/radians or lat/lon order implicitly. Heights need a named datum and units. Claude's proposal for the Three.js axis mapping, texture seam, prime-meridian alignment, north orientation, physical scale and ellipsoid is in EARTH_ASSET_CONTRACT.md, with tests at the poles, equator, antimeridian and known landmarks. It is pending Codex/owner review. GeoJSON order is longitude then latitude; adapters must declare conversions.

Do not silently treat rendered terrain as precise survey data. Distance scoring should operate on geographic coordinates using an agreed geodesic method, not arbitrary screen-space or mesh distances.

## Performance expectations

Initial target: smooth 60 fps on an agreed mainstream desktop at 1080p, measured rather than promised. Record hardware, browser, frame time percentiles, draw calls, GPU memory estimates, loading time, and network footprint. Cap rendering resolution, dispose replaced assets, avoid blocking main-thread data work, and load detail progressively when measurements justify it. Specific texture and memory budgets await asset evaluation. No commitment to custom cube-spheres or enormous tile systems.

## Production updates

Node serves immutable Vite builds on loopback. Each successful build has a UUID embedded in JavaScript and published through `/version.json`. Asset URLs contain their build ID. Older build folders remain available so open sessions keep loading matching resources. The current pointer changes only after a successful build and source consistency check. Vite HMR is used only by `npm run dev`.

See LAUNCH_AND_UPDATES.md for process ownership and update safety. Launcher/service source updates take full effect on service restart; the running service retains its loaded code until stopped.
