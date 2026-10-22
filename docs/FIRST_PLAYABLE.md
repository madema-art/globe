# HISTOGRAPHY first playable (preview integration)

The owner authorized integrating all completed work into the **preview** channel as the first playable build, for the owner's first proper playtest. It is not promoted to `main`; stable promotion is a separate owner decision.

## What was integrated

| Stack | Branches (PRs) | Integrated as |
| --- | --- | --- |
| Earth and visuals (Claude) | `claude/earth-controls` (#4), `claude/visual-identity` (#6) | merge commit, unchanged history |
| Education (Codex) | `codex/education-mode` (#3), `codex/mystery-library` (#5), `codex/geography-expansion` (#7) | merge commit, unchanged history |
| Base | `origin/preview` (Earth V1 + preview launcher configuration) | integration branch base |

The original feature PRs stay open and unmodified. Preview's branch, ports 8775–8784, separate runtime instance, title-only refresh and fast-forward update behaviour are unchanged.

## How the pieces connect

```
title ──"Begin a mystery"──▶ mystery screen (src/ui/mystery/mystery-screen.js, presentation only)
                                  │ awaits every action, renders committed safe views
                                  ▼
                            library host (src/app/library-host.js, capabilities only)
                                  │ pinned JSON reader · browser progress (development key) · Earth capabilities
                                  ▼
          createLibraryEarthBridge ─▶ LibraryPlayer ─▶ LazyMysteryLibrary + ProgressRepository   (Codex, unchanged)
                                  │ readCenter → earth.pickCenter() → { latitude, longitude } (lon normalized to [-180,180))
                                  │ navigateTo → earth.navigateTo(lat, lon, { signal, mark: true })   (after reveal only)
```

- **One engine.** The synthetic preview source was removed. The screen uses Codex's asynchronous `LibraryPlayer` through `createLibraryEarthBridge` only (never the synchronous foundation bridge), as docs/LIBRARY_INTEGRATION.md requires.
- **Flow.** Begin → `openNext()`. A saved unfinished mystery returns `RESUME_AVAILABLE`, and the player chooses to resume (`resume()`) or set it aside (`archivePending()` then `openNext()`). Continue → `continue()` (idle) → a "Ready for another?" choice → `openNext()` only when the player asks. Nothing advances automatically.
- **Spoilers.** Only `getView()`/action views reach the screen; answer fields render only in `ANSWER_REVEAL`. No place names, markers or answer-aware highlighting during the investigation; names and both markers (brass place, ivory choice) appear after the reveal. Navigation is started by the bridge after a committed reveal and aborted when the player leaves or acts again.
- **Errors.** Every documented reason code has a player-facing state: resume offer, revised content, unavailable content, exhaustion, no approved content, storage failure/lock, stale session, corrupted or newer progress (no automatic reset; "Save a copy" is required before "Restore the previous save"), channel mismatch.

## Input: one binding path per action

- **X (confirm):** only Codex's `createConfirmationInput` (keyboard `KeyX`, gamepad `XBOX_X_BINDING`), enabled only while a confirmation is permitted. It suppresses held/repeated input and awaits the confirmation; the bridge also coalesces duplicates.
- **A / B / D-pad, Enter / Space / Esc / arrows:** only `src/ui/ui-input.js`. In gameplay, controller A is always the primary action (next clue, reveal after clue V, continue). B leaves.
- **Analog:** the Earth owns sticks, triggers and right-stick click. One `navigator.getGamepads()` snapshot per frame feeds the Earth, the UI input and the confirmation input.

## Content on the preview channel

`launcher.config.json` on `preview` sets `"contentChannel": "development"`; stable `main` has no such setting and stays on production (which publishes only digest-approved records, currently none).

During every `vite build`, `scripts/content/release-plugin.mjs` runs Codex's publisher for the configured channel and copies **only the selected release** into the immutable build as `library/<channel>/current.json` and `library/<channel>/releases/<version>/`. This is the equivalent of `npm run content:develop -- --enable-development-content`. Because this runs inside the Vite build (not the long-lived service), a fresh preview checkout and an already-running preview service both get it without a restart and without the player running commands.

- The launcher's existing server serves the files with `application/json`; a missing file is an error (never an HTML page). The client reader also rejects non-JSON media types, unexpected paths and channel mismatches.
- Nothing from the library enters the JavaScript bundle. The catalog is fetched when a mystery is first requested; the chosen record, locale and digest are fetched lazily and checked against the catalog's SHA-256 digests.
- A page keeps one release pinned for its lifetime, and old builds remain available to open sessions. Approval flags and source records are never changed. Development progress uses `globe.education.development.progress`; production progress (`globe.education.progress`) is never touched.
- The publisher's version ledger lives in the ignored `.library/`. An edited record without a content-version increase fails the build, and the previous build stays live.

## Persistence and the launcher's ports

Progress lives in the browser's storage for the page's origin (`127.0.0.1:<port>`). The preview service always prefers port 8775 and reuses its running service, so normal launches keep the same origin and history across updates. If another program occupies 8775 when the service starts, the service falls back to 8776–8784, where the saved history is not visible (it is not lost). In that case, the title shows a plain notice explaining how to recover. A service-side progress store that would remove this edge case is a possible infrastructure follow-up for Codex.

## Performance note

On a software renderer (CI, headless) one Earth frame can take a second or more. The title's slow spin and the idle cloud refresh are now paced when frames are that expensive, which keeps the page responsive (menus, update checks, storage). Player-driven rendering is never paced, and on a normal GPU (~16 ms frames) the pacing never engages. Real Windows GPU performance has not been measured in this work.

## Automated evidence

- `npm test`: Codex's 100 engine/library tests plus host/release tests (channel selection, approval gate, strict reader, WGS84 normalization, a real development release played through the bridge with navigation abort and progress isolation).
- `npm run test:game` (`tests/game-browser.mjs`): the full journey on the launcher-served production build with a synthetic standard gamepad, keyboard and mouse. See the test header for the list of covered behaviours.
- `npm run test:ui`, `npm run test:browser`, `npm run test:earth`, `npm run test:build`, `npm run test:service` and Windows CI.

Physical controller feel and real GPU performance on the owner's PC have not been tested.

## Known limitations

- All 51 mysteries are source-checked and provisional (no independent editorial review). The title shows "Preview" and the clue screen says so quietly.
- About half the source citations carry Japanese titles from the canonical records; the English locale has no translated source titles yet (content follow-up for Codex).
- Some answer fields use generic wording in the content (for example date or culture labels on natural features); this is content, shown as authored.
- Landmark miniatures are three prototypes; no larger landmark library in this milestone.
