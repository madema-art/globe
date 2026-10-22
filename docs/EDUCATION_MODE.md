# Five-clue Education Mode

Globe teaches world geography and world history through exactly five authored clues per mystery. Coverage should eventually span the Bronze Age to the present and the whole world. The current implementation is a headless foundation for joint review with Claude's Earth, not a new screen or a playable integrated build. The owner has superseded earlier scoring/timed-round ideas: no scores, timers, grading, competition, achievements, difficulty settings, or predetermined progression.

## Lifecycle and actions

| State | Information and allowed actions |
| --- | --- |
| `IDLE` | No mystery or target. `start()` begins with clue one. |
| `CLUES_ACTIVE` | Only unlocked clues; `requestNextClue()` reveals one more, up to five. `submitSelection()` is allowed at any clue level. `revealAnswer()` is available only after all five clues. |
| `ANSWER_REVEAL` | Selected coordinates, if any; intended answer and target; explanation; history, cultures, sources, uncertainty. `nextMystery()` explicitly continues. |
| `COMPLETE` | No active mystery or target. The loaded library was exhausted; `restart()` begins a new session or `exit()` returns to idle. |

`restart()` and `exit()` work from any state and clear the active selection/reveal. `start()` is accepted only from idle. Each action returns `{ accepted, reason, view }`; rejected actions do not change the revision or reveal anything. Submitting twice, requesting a sixth clue, and advancing before reveal are rejected. No scheduling automatically reveals clues, removes clue five, hides the explanation, or advances content.

Each loaded record appears once per session in catalog order. Explicit restart avoids immediately repeating the last mystery when alternatives exist; with a single record, that is impossible, so the session completes rather than automatically looping. Catalog order is deterministic traversal for V1, not an educational progression system. Related IDs are descriptive metadata and do not create chains.

`getView()` returns a frozen, copied, allowlisted snapshot. In clue states its fields are `state`, `mode`, `locale`, `revision`, neutral `mysteryId`, `revealedClueCount`, numbered visible `clues`, and action flags. Unrevealed clues are withheld. Only `ANSWER_REVEAL` adds `answer`. `getNavigationTarget()` returns `{ latitude, longitude }` only in that state and `null` otherwise. Observers registered with `subscribe(listener)` receive safe snapshots; the returned function unsubscribes. Observer errors are isolated. Commands attempted synchronously inside an observer are rejected with `OBSERVER_DISPATCH` so rendering/navigation observers cannot recursively skip a player-visible state; explicit UI actions run outside that notification.

## Headless use with synthetic content

```js
import { MysterySession, loadMysteryLibrary } from '../src/game/education/index.js';

// Trusted host supplies JSON IO; do not send raw records to clue UI components.
const records = await loadMysteryLibrary({ readJson: readPrivateContentJson, locale: 'en' });
const session = new MysterySession({ records, locale: 'en' });
session.start();                         // Only clue one is visible.
const clueView = session.getView();      // Pass this projection to a future UI.
session.requestNextClue();               // An explicit player action.
session.submitSelection({ latitude: 0, longitude: 0 }); // Synthetic example, not a sample answer.
const revealView = session.getView();    // Answer/explanation remain until explicit continuation.
session.nextMystery();
```

No sample answer, identity list, clue translation, or real target coordinate is included in engineering examples, summaries, PR descriptions, commit messages, or test output.

## Rendering-independent Earth boundary

The proposed adapter names below belong to this module, not Claude's API. Map Claude's actual capabilities during joint review:

```js
import { createEducationEarthBridge, createConfirmationInput } from '../src/game/education/index.js';

const bridge = createEducationEarthBridge({
  session,
  readCenter: readCenteredWgs84Point,    // ({ signal }) -> coordinates | null, or a Promise.
  navigateTo: navigateEarthToPoint,    // (coordinates, { signal }) -> void or a Promise.
  onError: ({ code }) => showNeutralDiagnostic(code),
});
const input = createConfirmationInput({
  confirm: () => bridge.confirmSelection(),
  isEnabled: () => session.getView().canSubmit,
});
// Future host may call input.attachKeyboard(window) and pollGamepads(navigator.getGamepads()).
// It also wires hint/reveal/continue controls to explicit session actions.
// On teardown: input.dispose(); bridge.dispose(); session.exit().
```

`readCenter` reads the point directly under the player's center aiming point, not the camera's geographic position. A missing Earth intersection returns `null` and leaves clues active. Angles are finite WGS84 degrees: north-positive latitude `[-90,90]`, east-positive longitude `[-180,180)`. Claude's adapter must normalize positive 180 to -180 if needed and explicitly convert its own axes/radians. No geometry, picking, rotation, zoom, or camera code is duplicated here.

Confirmation captures a session revision before any async pick. A changed session, including a restart, hint, or exit, cancels that request and makes its result stale. Pending picks are coalesced. A stalled pick cannot block a restarted session; the bridge resolves cancellation even if the host ignores the signal. `readCenter` receives an optional abort signal to release host resources. During reveal the bridge requests navigation once for that revision. Leaving reveal or disposing aborts its signal; the Earth host must respect this signal to cancel its animation. Navigation failure leaves the answer and explanation intact and reports only a neutral error code. The bridge never grades a guess. Future answer-evaluation/feedback logic must be separate and approved by the owner.

## Keyboard and controllers

`createConfirmationInput` is independent of session rules and rendering. It defaults to physical keyboard `KeyX`. Repeated keydown events and held keys cannot reconfirm. Key release re-arms the binding. Inputs from editable controls and modified shortcuts are ignored. `isEnabled` lets the host suppress input outside the proper interaction context. Attach/detach helpers remove listeners cleanly; gamepad snapshots are supplied by the host, with no internal polling timer.

Controller confirmation is opt-in. `XBOX_X_BINDING` explicitly means Xbox-style X, the west face button at index 2 in the browser's standard mapping. A differently labeled controller can use that physical button with its own correct display label or bind another index. `configure({ keyboardCode, gamepad })` requires a controller `buttonIndex`, `mapping`, and display `label`; it does not infer Xbox labels from every controller. Display `getBindings()` in a future settings/help UI. New/reconnected or already-held controller buttons must be released before they can confirm. Held buttons, concurrent devices, and pending async input cannot create duplicate submissions. Physical controller hardware and final UI help text are not yet tested.

## Content format V1

The runtime validator in `validation.js` is authoritative, rejects unknown fields, and reports schema paths/codes without dumping values. `content/education/manifest.json` declares schema version 1, authored locale `ja`, unique neutral IDs matching `m` plus six digits, and available locales. Each canonical record is `records/<neutral-id>.json`; English translations are in `locales/en/<neutral-id>.json`. Loader paths are validated before IO and cannot be supplied as arbitrary filenames. Missing/malformed content or unavailable localization fails closed rather than mixing languages silently.

| Canonical field | Contract |
| --- | --- |
| `schemaVersion`, `id` | Version 1; unique neutral ID. |
| `category`, `subjectType` | Category enum and an authored subject description; these are withheld from clues. |
| `authoredLocale` | `ja` for this library. Canonical authored text is Japanese. |
| `clues` | Exactly five ordered `{ text, sourceIds }` records. Text must be nonblank and distinct. Every source ID must exist. |
| `answer.identity` | Intended identity, withheld until reveal. |
| `answer.target` | One `kind: 'point'`, `referenceFrame: 'WGS84'`, latitude/longitude, an authored target `label`, and `modernContext`. No assumption of birthplace. |
| `answer.explanation`, `answer.sourceIds` | Concise educational context and supporting source IDs. |
| `history.date` | Historical date structure described below. |
| `history.cultures` | One or more associated cultures/civilizations, authored in Japanese. |
| `sources` | Unique IDs, HTTPS URL, authored title, publisher, modern `accessedOn`, and provenance/interpretation notes. Kept out of clue views because URLs and titles can spoil answers. |
| `uncertainty` | Explicit uncertainty/dispute/precision statement, even when no particular dispute is claimed. |
| `editorial` | `clueOrderReviewed: true`, `reviewStatus: 'source-checked-sample'` or `'reviewed'`, and notes explaining review limitations. |
| `relatedIds` | Optional unique existing neutral IDs; no self-reference. No chaining behavior. |

Categories: `settlement`, `country-region`, `natural-feature`, `built-site`, `person`, `civilization`, `event`, `science`, `culture`, `historical-process`. They cover the requested subject families without forcing a separate engine per category. Subject type remains flexible. Every V1 record still identifies one intended point, including for people or events with many historically meaningful sites.

Localization files contain exactly five `clues` strings and translated `identity`, `targetLabel`, `modernContext`, `explanation`, `dateLabel`, `cultures`, and `uncertainty`. The loader attaches them privately as `localizations[locale]`; this field is runtime-assembled and is not allowed inside canonical files loaded from disk. Dates and coordinates are shared structural data, not inferred from translation. Source bibliographic records stay Japanese in V1. Missing requested translations are errors; additional locales can use the same complete translation contract later.

### Historical dates

`history.date` is one of:

```js
{ kind: 'year', label: 'Synthetic approximate year',
  at: { year: 1200, era: 'BCE', approximate: true } }
{ kind: 'range', label: 'Synthetic range across eras',
  start: { year: 200, era: 'BCE', approximate: true },
  end: { year: 200, era: 'CE', approximate: false } }
{ kind: 'period', label: 'Synthetic multi-century period',
  start: { year: 100, era: 'CE', approximate: true },
  end: { year: 500, era: 'CE', approximate: true } }
```

Years are positive safe integers with an explicit `BCE`/`CE` era; historical year zero, negative years, reversed ranges, and unspecified approximation flags are rejected. A period includes explicit broad bounds and an authored label; these are not claims of exact boundaries. The ordering helper uses astronomical numbering internally for comparisons only; no JavaScript `Date` represents historical time. The modern source-access date is a separate ISO calendar date. The history model is not a timeline renderer or date-conversion system.

Modern WGS84 target points and present-day context remain separate from historical labels, cultures, and dates. They do not encode ancient borders, historical political ownership, or historically constant place names. Those advanced systems remain future work.

## Editorial quality and spoiler avoidance

Each clue is authored and checked against the listed source, with increasing explicitness reviewed by a human/editorial process. The validator enforces five distinct entries and review metadata; it cannot prove historical truth or subjective ease. A conservative identity lint rejects the exact normalized answer string in clue text. It cannot prevent all synonyms, transliterations, inference, or editorial mistakes. Review clues in the intended player language as well as the authored language.

Two small source-checked samples are included, with source URLs, access dates, uncertainty notes, and published representative coordinate conversions. The text is newly authored summary rather than copied passages; no images or large dataset is redistributed. Fact/source checks do not constitute independent scholarly review or a playtest of increasing ease. Source limitations and broad date interpretations are recorded with the content. Source licensing/attribution decisions for any later imported text, media, or datasets still require review under ASSETS.md. The sample is not intended to represent the eventual world's cultural coverage.

The project owner is also the player. Keep actual authoring records in Japanese and use neutral filenames/IDs. English belongs in separate localization files for eventual gameplay, not engineering summaries. Raw content is outside `public/` and is not imported into the title or production build. Only safe session projections may reach clue UI components; don't spread raw records, log them, expose answer-bearing source links, or place them in debug overlays before reveal. This is spoiler avoidance, not encryption: repository files and a trusted host's memory remain inspectable. A future network delivery model needs its own review if stronger isolation is desired; no server/auth architecture is added here.

## Validation and integration status

Tests are deterministic, headless, and primarily synthetic. They cover five-clue validation, sequential unlocking/history, every selection level, duplicate actions, reveal gating, safe views, geography/date validation, malformed data/localization, restart/exit/completion, async stale selections, controller/keyboard edges and disposal, navigation cancellation/failure, and both sample locales without printing sample records. Existing Git/version tests remain included in `npm test`.

Local validation on 2026-10-22: `npm test` passes 46 deterministic tests (37 education tests plus nine existing infrastructure/lifecycle tests); `npm run build` publishes the existing title successfully. The generated build is also checked for absence of the sample IDs/content directory, since this feature must stay headless. No graphical playtest or actual controller hardware verification is claimed for this headless feature. Existing title/launcher/browser behavior has not been modified. The engine's Earth contract is proposed, not a claim that Claude has implemented or agreed to these function names. Keep the feature PR unmerged until owner approval and joint integration review.

Read-only coordination review: `origin/claude/earth-v1` at `d7179c9` exposes `pickGeodetic(clientX, clientY)` and `flyTo(lat, lon, options)`. A future adapter can pick the actual canvas center and map its `{ lat, lon }` output into `{ latitude, longitude }`; do not use rounded camera state as a selection. That inspected `flyTo` API does not yet expose abort-signal cancellation, so cancelling obsolete animation remains a joint integration task. None of Claude's source or branches has been changed or imported here. Both feature branches edit shared documentation; reconcile those edits deliberately and preserve the owner's newer Education Mode requirements rather than restoring obsolete scoring plans.
