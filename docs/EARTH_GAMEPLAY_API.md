# Earth ↔ gameplay integration (handoff to Codex)

The Earth owns rendering, rotation, zoom, picking and navigation. The education engine (`src/game/education`, PR #3) owns clue progression, confirmation state and the X/A/B actions. This is the API Codex's adapter maps onto `createEducationEarthBridge`.

## EarthView API (`src/earth/earth-view.js`)

| Member | Purpose |
| --- | --- |
| `setMode('title' \| 'explore' \| 'mystery')` | Presentation. `mystery` is interactive with the reticle and never shows a marker unless `navigateTo(..., { mark: true })` is used. `explore` is the dev/inspection screen (dev panel, markers) |
| `resetToPlanetView({ signal })` → `Promise<{completed, reason?}>` | Start of every mystery: the whole planet in frame, north up, no markers, level 1 (no overlays). Keeps the current, neutral centre |
| `pickCenter()` → `{ lat, lon } \| null` | WGS84 point under the fixed centre reticle. `lon` is in `[-180,180)`. `null` if the reticle misses the Earth |
| `navigateTo(lat, lon, { signal, altitude = 0.9, mark = false })` → `Promise<{ completed: true } \| { completed: false, reason: 'aborted' \| 'interrupted' \| 'superseded' }>` | Eased flight. Honours `AbortSignal`; player input interrupts it |
| `pollGamepads(snapshot)` | Per-frame `navigator.getGamepads()` snapshot (share it with `confirmationInput.pollGamepads`) |
| `state()` | Camera, overlays level, gamepad, roll; for tests/diagnostics. Contains no mystery data |
| `controls.leveling`, `gamepad.configure()`, `gamepad.settings` | Input tuning (see EARTH_CONTROLS.md) |

## Suggested adapter (Codex's code; names on the left are the education bridge's)

```js
const bridge = createEducationEarthBridge({
  session,
  readCenter: () => {
    const p = earth.pickCenter();                 // reticle point, never the camera position
    return p && { latitude: p.lat, longitude: p.lon };
  },
  navigateTo: ({ latitude, longitude }, { signal }) =>
    earth.navigateTo(latitude, longitude, { signal, mark: true }), // only reached in ANSWER_REVEAL
});
// On each new mystery (CLUES_ACTIVE with clue 1): earth.setMode('mystery'); earth.resetToPlanetView();
// Per frame: const pads = navigator.getGamepads?.() ?? []; earth.pollGamepads(pads); input.pollGamepads(pads);
```

## Mystery screen (integrated on preview, first playable)

`src/ui/mystery/mystery-screen.js` presents Codex's persistent library through `src/app/library-host.js`, which builds `LazyMysteryLibrary`, `ProgressRepository`, `LibraryPlayer` and `createLibraryEarthBridge` exactly as docs/LIBRARY_INTEGRATION.md describes. Its capabilities are `readCenter: () => centreToWgs84(earth.pickCenter())` (WGS84 `{ latitude, longitude }`, longitude normalized to [-180, 180)) and `navigateTo: ({ latitude, longitude }, { signal }) => earth.navigateTo(latitude, longitude, { signal, mark: true })`. The synthetic preview source has been removed. See [FIRST_PLAYABLE.md](FIRST_PLAYABLE.md) for the flow, the input paths and the content channel.

The screen calls `earth.resetToPlanetView()` and `setLabelPolicy('none')` for every new or resumed mystery. On `ANSWER_REVEAL` it sets the selection marker, `setLabelPolicy('all')` and `setFraming('side')`; the bridge then navigates with `mark: true` and aborts that flight when the player leaves or acts again.

**Input:** gameplay confirmation (X) is bound only through Codex's `createConfirmationInput` (`KeyX`, `XBOX_X_BINDING`). `src/ui/ui-input.js` handles navigation, A (primary action) and B (back). Both read the host's single per-frame gamepad snapshot, which also feeds the Earth.

## Responsibilities still open for Codex

- Done in the first-playable integration: real library source, confirmation input on the shared snapshot, planet reset per mystery, `mark: true` only after reveal, title-only refresh.
- Optional infrastructure follow-up: a service-side progress store so history survives a fallback port (see FIRST_PLAYABLE.md).
- Performance benchmarking on the owner's PC (`state().renderedFps`, `drawCalls`, `gpuTextureMB`).

## Spoiler rules the Earth guarantees

See EARTH_OVERLAYS.md § Spoiler protection. In brief: there are no answer-aware APIs, overlays follow uniform rules, no markers appear in `mystery`, every mystery starts from the planet view, and the Earth never sees answer coordinates before the bridge's reveal navigation.
