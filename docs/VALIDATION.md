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
