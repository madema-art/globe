# Globe

A geography game inspired by Topocopter. Players will rotate a 3D Earth beneath the camera, zoom toward destinations, and locate countries, cities, and geographical features. There is no helicopter.

This release provides a Three.js title screen, Vite build, safe Windows launcher/update service, and shared development foundation. It also includes the **Earth V1 prototype**: a real, interactive 3D Earth built from NASA, NOAA, Natural Earth and GeoNames data. Choose **Explore the Earth** on the title. Drag to turn the planet, use the wheel to zoom, pick a landmark to fly to, and press Esc to return. Earth V1 and its asset contract were approved by the owner (see docs/DECISIONS.md). A gamepad also works: the left stick rotates, the right stick rolls and fine-tunes, RT/LT zoom, and a right-stick click restores north-up. Country borders and rivers fade in as you zoom ([controls](docs/EARTH_CONTROLS.md), [overlays](docs/EARTH_OVERLAYS.md), [art direction](docs/ART_DIRECTION.md)). Gameplay has not started yet.

## Launch on Windows

Install Git, Node.js 22.12 or newer, and Google Chrome. Clone this existing repository to `D:\globe` if needed. Double-click `Start-Globe.bat`. The launcher installs locked dependencies on the first build, checks GitHub, builds when needed, and opens Chrome. Internet is needed for the first dependency installation; later launches can use an existing build offline.

```powershell
cd D:\globe
.\Start-Globe.bat
.\Start-Globe.bat -Stop
```

Logs: `%LOCALAPPDATA%\Globe\<checkout-id>\`. Ports: localhost 8765, then 8766–8774. See [launch and updates](docs/LAUNCH_AND_UPDATES.md), including crash recovery and branch configuration.

## Development

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd run build
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:browser
npm.cmd run test:service
npm.cmd run test:build
npm.cmd run test:earth
```

`npm run dev` is a separate Vite development session with HMR. Play using the launcher to avoid development reloads. Builds are published under ignored `.globe/builds/<id>/`; `npm run build` reports the published version. `npm start -- --no-browser` starts the production service without opening a browser.

The service check temporarily occupies port 8765 and verifies fallback to 8766; stop any existing Globe service first. Run service/browser checks sequentially. GitHub Actions also runs the foundation checks on Windows; its remote result must be inspected separately from local results.

## Structure

```text
Start-Globe.bat             Windows entry point
launcher.config.json       Tracked branch, ports, update interval
src/engine/                Three.js runtime and rendering
src/runtime/               App lifecycle and safe version refresh
src/game/                  Future challenges and scoring
src/earth/                 Earth renderer, globe controls, explore HUD (Earth V1)
src/geography/             WGS84 coordinate conventions and conversions
src/shaders/earth/         Earth surface, cloud and atmosphere GLSL
pipeline/earth/            Reproducible Earth asset pipeline (Python)
public/earth/v1/           Runtime Earth textures + earth.json manifest
assets/earth/              Earth asset provenance (MANIFEST.json, ATTRIBUTION.md)
assets/blender/            Claude's editable visual sources
assets/textures/           Approved textures and provenance
assets/data/raw/           Ignored large raw downloads
assets/data/processed/     Reviewed compact geographical data
public/                    Runtime static assets
scripts/                   Build, launcher, service, safe updater
tests/                     Git safety, browser, lifecycle tests
docs/                      Shared design and collaboration records
```

## Shared development

Codex and Claude are collaborators on one game. GitHub is the common hub and remote backup: [madema-art/globe](https://github.com/madema-art/globe). Work on `codex/<feature>` or `claude/<feature>`, push commits, and use reviewed pull requests into `main`. The initial bootstrap is committed directly to the empty repository at the owner's request; subsequent work uses feature branches. Never force-push, reset away work, or overwrite another developer's source tree. See [collaboration](docs/COLLABORATION.md), [architecture](docs/ARCHITECTURE.md), [asset policy](docs/ASSETS.md), and [roadmap](docs/ROADMAP.md).

Source licensing has not yet been selected by the owner. Public visibility does not grant a project license. Dependency licenses remain applicable; see their package metadata.
