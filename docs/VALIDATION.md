# Initial validation — 2026-10-22

Local environment: Windows, Node.js 24.15.0, npm 11.12.1. Dependencies installed with a committed npm lockfile. Three.js 0.180.0 and Vite 7.3.7 were used for the initial build.

## Executed locally

- `npm test`: nine passing tests. Clean fast-forward/current; tracked edits; untracked files; ignored-file collision; feature branch preservation; ahead/divergent histories; unavailable remote preservation; unchanged/new version handling; late-response gameplay deferral; network-error handling. Some tests cover multiple cases.
- `npm run test:build`: disposable fixture verifies unchanged source retains its ID, intentional syntax failure leaves the previous published version intact, corrected source publishes a different ID, and old build assets remain available.
- `npm run test:service`: invoked the actual Windows batch file. A deliberately unrelated server occupied 8765; Globe selected 8766, survived launcher exit, reused the same PID, rejected an unauthenticated shutdown, served versioned production assets without Vite HMR, and stopped without affecting the unrelated server.
- `npm run test:browser`: headless Chromium verified title/vision navigation, Escape, fullscreen, a delayed version response while away from title, deferred refresh on return, an actual approximately 20-second title poll, mobile overflow, and no browser console/page errors.
- The develop-web-game Playwright client captured title and vision text state/screenshots. Screenshots were visually inspected at desktop and mobile sizes. Short desktop spacing was adjusted and rechecked at 1280×720.
- `Start-Globe.bat` completed using the standard installed Chrome path and reported the ready local URL. Chrome invocation was exercised; no native-window visibility inspection was performed.
- Service logs show the periodic update check two minutes after startup. The empty remote branch was unavailable before the initial push, and the service continued serving the local build.
- `npm run build` successfully published production builds. Git status, remote, branch/tracking, and remote pushed SHA are checked during delivery.

## Limits

No geographical gameplay exists yet. Active-game refresh protection is tested with lifecycle state simulations; future actual gameplay must be tested again. Safe incoming integration is tested against disposable local Git remotes, not by injecting conflicting work into the public repository. A missing remote is used to exercise offline behavior; network-adapter disconnection was not performed. Crash recovery, PID reuse, dependency-download failures, all-ten-ports-busy behavior, and long-duration resource use have not all been exercised end to end. Hidden/detached flags are implemented and process lifetime is tested; native window flashing was not visually inspected. GitHub Actions is configured; its outcome is separate from local validation.

Known operational limits: old build directories and logs are retained without automatic pruning/rotation. Service/config changes require stop/start. GitHub branch protection is not configured by this setup. Claude has not yet reviewed an Earth asset contract, and no geography assets were fabricated.

# Earth V1 validation — 2026-10-22 (Claude, Linux cloud container)

Environment: Linux, Node.js 22.22, headless Chromium with SwiftShader (software WebGL, no GPU). Windows behaviour and real-GPU performance were **not** exercised.

- `npm test`: 18 passing (Codex's 9 plus 9 new geography/manifest tests: axis convention, shader-UV equivalence, ellipsoid round trip, longitude wrap, distances, subsolar point, landmarks, manifest).
- `python pipeline/earth/earth_pipeline.py validate`: 19 landmarks on land, 7 ocean points in water, antimeridian edges continuous for all rasters.
- `npm run build`: published successfully.
- `npm run test:build`: passes with the Earth changes when the fixture excludes the `node_modules` symlink from Git (Linux only). Unmodified, it fails on Linux with `EISDIR` on `main` too, because it relies on Windows junction semantics.
- `npm run test:earth` (new; production service via launcher): Earth loads (high tier), explore mode, fly to Antananarivo (camera and centre-pixel pick within 0.05°), flights to ±179.9° and ±85°, drag, wheel zoom, layer toggle, a version response deferred while exploring and applied on return to title, no console errors.
- `npm run test:browser` (Codex's): passes with the Earth integrated.
- Screenshots were inspected: title, explore (Africa/Europe), Madagascar close-up, Himalaya relief, north and south poles, Fiji at the antimeridian, real-sun night side over Asia. Fixed during inspection: framing, contrast, the cloud-mosaic seam at ±180°, an over-broad sun glint, and an 8 km centring error from aiming along the ellipsoid normal.
- Performance: no GPU was available, so 60 fps at 1080p is **unmeasured**. Static facts: 3 draw calls (5 with marker), ~33k surface vertices, ≈ 256 MB estimated texture memory on the high tier (128 MB medium), 11 MB download on high. Demand rendering drops idle redraws to ≤ 15 fps. Use `JSON.parse(render_game_to_text()).earth.renderedFps` on real hardware.

# Earth controls + overlays validation — 2026-10-22 (Claude, Linux cloud container)

Environment: Linux, Node.js 22.22, headless Chromium + SwiftShader (software WebGL). **No physical controller and no GPU.** Gamepad behaviour is verified with a synthetic standard-mapping gamepad that replaces `navigator.getGamepads()`.

- `npm test`: 22 passing (18 earlier + 4 new: detail-level fades, stick/trigger shaping, gamepad navigation against a fake camera, overlay polyline decoding).
- `npm run test:earth` (production service through the launcher): both `earth-browser.mjs` and the new `earth-gamepad-browser.mjs` pass. The gamepad test covers: dead zones/no drift, left-stick rotation direction, fine right-stick pitch (< 40 % of coarse), right-stick roll kept by levelling, right-stick-click north-up, simultaneous sticks, analog RT pressure, RT/LT altitude limits (0.2 / 6), precision scaling near the surface, crossing the north pole, centre picking in a rolled view (±0.01°), reticle at the exact viewport centre, disconnect/reconnect with a held button, overlay levels (none at planet view; L2 then L3 fade-in), mystery presentation (no marker, abortable and interruptible navigation, start-of-mystery planet view), and no console errors. Time is stepped deterministically.
- `npm run test:browser` (Codex's): passes.
- `npm run build`: published.
- Screenshots inspected: continental borders/rivers over Europe/North Africa (day), borders receding on the night side over Asia, close regional view, mystery reticle on the whole planet.
- Not exercised: physical controllers (Xbox or others), Windows, real-GPU frame rate.

# Visual identity milestone validation — 2026-10-22 (Claude, Linux cloud container)

Environment: Linux, Node.js 22.22, headless Chromium + SwiftShader (software WebGL). No GPU, no Windows, no physical controller; controller behaviour is verified with synthetic standard-mapping gamepads. The owner asked for no hands-on testing at this stage.

- `npm test`: 22 passing.
- `npm run build`: published. `test:build` passes with the Linux-only node_modules exclusion described earlier; the fixture now includes `assets/data/processed` (landmark registry).
- `npm run test:browser` (Codex's lifecycle test, selectors updated for the new menu names; assertions unchanged): passes.
- `npm run test:earth` (Earth + gamepad suites): pass.
- `npm run test:ui` (new; production service): checks that fonts load; title focus by keyboard arrows and controller D-pad; About via Enter, back via B; Begin a mystery via A; one clue at the start; spoiler rules while investigating (no place names even at close zoom, no answer markup in the DOM, no marker, no developer tools, reticle shown); next clue with A and Space; previous clues kept; "Reveal the answer" after five; X confirm captures the aimed coordinate; the reveal shows the selection, names return and aiming instruments hide; the next mystery starts from the planet view with one clue; B leaves; a version response during a mystery defers the refresh until the title. Passes.
- Screenshots inspected at 1920×1080 and 1280×720: title (bezel, leader-line focus), About, Explore, mystery ledger (1, 3 and 5 clues), reveal, continental and regional labels over Europe, and the Giza, Eiffel Tower and Mount Fuji miniatures. Fixed during inspection: label placement on first frame, overlaps between label layers, interface/label collisions, the bezel dash artefact, initial menu focus, ledger/globe overlap (smaller start view and narrower ledger), reveal layout (side framing, actions under the text), the compact layout for ≤ 860 px heights, miniatures sinking into the surface (pop-up view, lifted along the line of sight), and Fuji's inward-facing lathe faces.
- Not verified: frame rate on real GPUs, physical controllers, Windows rendering of the new fonts, and integration with the real education engine (the mystery screen runs on the labelled synthetic preview).
