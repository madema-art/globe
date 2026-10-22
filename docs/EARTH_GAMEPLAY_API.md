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

## Mystery screen (Claude's presentation of Codex's engine)

`src/ui/mystery/mystery-screen.js` renders exactly the `MysterySession.getView()` projection and forwards actions. It has no game rules. It needs a *source* object:

```js
const source = {
  getView: () => session.getView(),
  subscribe: (listener) => session.subscribe(listener),
  requestNextClue: () => session.requestNextClue(),
  revealAnswer: () => session.revealAnswer(),
  nextMystery: () => session.nextMystery(),
  exit: () => session.exit(),
  confirmSelection: () => bridge.confirmSelection(), // bridge.readCenter -> earth.pickCenter()
};
mysteryScreen.open(source);
```

Until PR #3 is integrated, `src/main.js` opens the screen with `createPreviewSource(earth)` (`src/ui/mystery/preview-source.js`). This is clearly labelled synthetic presentation data in the same view shape (sample text only, with the "answer" at 0°/0°). It is not an engine. Swap it for the real source in `navigate('mystery')`.

The screen itself calls `earth.resetToPlanetView({ margin: 0.7 })` and `setLabelPolicy('none')` when a new `mysteryId` appears. On `ANSWER_REVEAL` it calls `setSelectionMarker`, `setLabelPolicy('all')` and `setFraming('side')`. The answer navigation stays the bridge's job (`navigateTo(..., { mark: true })`).

**Input:** `src/ui/ui-input.js` turns keyboard and gamepad buttons into semantic actions (`up/down/left/right/activate/back/confirm/next`). Gamepad: D-pad, A (activate / next clue), B (back), X (confirm). Keyboard: arrows, Enter, Esc, X, Space. It shares the same per-frame gamepad snapshot as the Earth. This is an interim mapping layer: when Codex's input-action infrastructure (including `createConfirmationInput`) is wired in, it should emit these action names and replace the X/A/B edge detection here, so there is one source of truth for bindings.

## Responsibilities still open for Codex

- Replace the preview source with the real `{ session, bridge }` source above (the mystery screen, presentation and spoiler handling already exist).
- Wiring X/A/B through `createConfirmationInput` and the session (Earth ignores face buttons).
- The single per-frame gamepad poll in the host loop. `src/main.js` currently feeds the Earth only; add the education input to the same snapshot.
- Calling `resetToPlanetView()` at the start of every mystery; using `mark: true` only after reveal.
- Title-only update lifecycle: `mystery` counts as gameplay (not `title`), so it is never reloaded.
- Performance benchmarking on the owner's PC (`state().renderedFps`, `drawCalls`, `gpuTextureMB`).

## Spoiler rules the Earth guarantees

See EARTH_OVERLAYS.md § Spoiler protection. In brief: there are no answer-aware APIs, overlays follow uniform rules, no markers appear in `mystery`, every mystery starts from the planet view, and the Earth never sees answer coordinates before the bridge's reveal navigation.
