# HISTOGRAPHY asynchronous library integration contract

HISTOGRAPHY is the working title, with no tagline or subtitle. Repository names, paths, package identifiers and infrastructure remain `globe`. Claude owns every visual element and Earth implementation. This contract and its optional nonvisual adapter give Claude the persistent educational capabilities without prescribing a menu, panel, font, HUD or camera design.

## Choose a content channel explicitly

Production is the default. `npm run content:publish` writes `.library/current.json` and `.library/releases/<version>/`. Only independently reviewed, digest-approved content enters it. The present production pool is empty; do not substitute research records automatically.

Internal integration can explicitly run:

```powershell
npm.cmd run content:develop -- --enable-development-content
```

This writes **only** `.library/development/current.json` and `.library/development/releases/<version>/`. Its catalog declares `channel: development`; entries retain their actual `approved: false` and source-check status. Incomplete drafts are excluded. The source records and reviewer fields are never altered. An ordinary loader rejects this catalog with `DEVELOPMENT_CONTENT_DISABLED` before fetching any answers. Development must be enabled independently by trusted host configuration and `allowDevelopment: true` at loader construction. Renaming the catalog channel to production cannot make unapproved entries valid.

There is no production entry-point import, launcher change, automatic publishing or automatic HTTP route. For an internal browser build, the host must deliberately expose the selected generated release through its own JSON reader. Keep this mapping outside stable production serving. Do not add all authoring files to `public/` or eagerly import them. Node integration tests already use the same artifacts through a filesystem reader.

## Construct the capabilities

The following is host pseudocode; URLs and configuration are injected capabilities, not new repository endpoints. `readPointer`, `readCatalog` and `makePinnedReader` must check failed fetches and JSON parsing. `makePinnedReader` resolves library-relative paths under the chosen immutable release root. A missing file must fail rather than fall back to an index page or another channel.

```js
import {
  LazyMysteryLibrary, ProgressRepository, createBrowserProgressAdapter,
  LibraryPlayer, createLibraryEarthBridge,
} from '../game/library/index.js';
import { createConfirmationInput } from '../game/education/index.js';

const development = hostConfig.enableDevelopmentContent === true;
const channel = development ? 'development' : 'production';
const pointer = await readPointer(channel);
if ((pointer.channel ?? 'production') !== channel) throw new Error('CONTENT_CHANNEL_MISMATCH');
const catalog = await readCatalog(channel, pointer.version);
if ((catalog.channel || 'production') !== channel) throw new Error('CONTENT_CHANNEL_MISMATCH');
const library = new LazyMysteryLibrary({
  catalog, locale: 'en', allowDevelopment: development,
  readJson: makePinnedReader(channel, pointer.version),
});
const repository = new ProgressRepository({
  channel, adapter: createBrowserProgressAdapter({ channel }),
});
const player = new LibraryPlayer({ library, repository, locale: 'en' });
const bridge = createLibraryEarthBridge({
  player,
  readCenter: ({ signal }) => earth.readCentreWgs84({ signal }),
  navigateTo: (coordinates, { signal }) => earth.navigateToWgs84(coordinates, { signal }),
  onView: view => presentSafeView(view),
  onError: ({ code }) => handleCapabilityFailure(code),
});
const input = createConfirmationInput({
  confirm: () => bridge.confirmSelection(),
  isEnabled: () => hostIsInGameplay() && bridge.getView().canSubmit === true,
});
// Attach keyboard/poll configured gamepads through the existing input adapter.
// Invoke bridge.openNext() or bridge.resume() only from deliberate host actions.
```

`earth.readCentreWgs84` and `earth.navigateToWgs84` above are illustrative host names, not assumed Claude APIs. Read the centre of the current camera view as finite decimal WGS84 `{ latitude, longitude }`, north/east positive, latitude [-90,90], longitude [-180,180). Return null when no valid surface point is available. Do not swap GeoJSON order, degrees/radians or mesh axes. Navigation receives a target only after a committed authorized reveal. Honour `AbortSignal` by stopping any outstanding pick and camera interpolation. Even if a read ignores cancellation, the bridge suppresses its late result. An uncooperative navigation implementation can still move the camera after cancellation; the host must implement the signal.

Default keyboard confirmation remains physical `KeyX`. The input adapter awaits confirmation, suppresses held/repeated input, ignores text editing, and supports configured gamepad mappings with explicit labels. A controller’s printed X is not a universal button index. Claude owns controller presentation. Keep bindings inactive outside gameplay and dispose/reset them on host lifecycle changes.

Production progress keeps the compatible `globe.education.progress` storage key. Development uses `globe.education.development.progress`, a separate backup and lock. The repository records its channel and rejects imports from the other channel. A development library cannot be paired with a production repository. Earlier progress without a channel migrates to production while preserving counters/history. Never copy internal completion history into the player’s production profile automatically. Stable origin, port and browser profile are still required for the same local history.

## Synchronous foundation versus persistent player

| Foundation | Persistent library contract |
| --- | --- |
| `MysterySession` mutates synchronously | `LibraryPlayer` actions must be awaited; IO and saved state commit first |
| `createEducationEarthBridge` observes `session.subscribe` | `createLibraryEarthBridge` owns async orchestration and calls `onView` after committed actions |
| Session-local revision guards | The async bridge maintains an independent lifecycle epoch and abort controllers; session view revisions are not global async input tokens |
| All supplied records already loaded | Catalog metadata is indexed; the chosen record, selected locale and digest are fetched lazily |
| Session-local traversal | Locked lifetime history excludes every presented ID across launches and library updates |
| Session continuation can traverse a supplied list | Persistent `continue()` completes and returns to idle; `openNext()` is a separate deliberate action |

Do not pass `LibraryPlayer` to the old synchronous bridge or call the underlying player directly while the async bridge owns it. Route **all** hint/reveal/continue/open/resume/archive/exit actions through the async facade. This is what lets it invalidate stale picks and suppress obsolete navigation. There is no `subscribe()` on `LibraryPlayer`; use bridge `onView`, or implement an equivalent serialized host adapter with the same guarantees.

## Action protocol

All facade actions return promises. Successful results have `accepted: true` and a safe view; refusals have `accepted: false` plus a fixed `reason`, and may omit `view`. Render from `onView`/`getView()`, retain the last committed view on errors, and handle refusal reasons without dumping raw records or exceptions. Views include `contentChannel` and `provisional` so the host can identify internal content without suggesting independent approval.

| Deliberate action | Call and resulting behaviour |
| --- | --- |
| Start another mystery | `await bridge.openNext()` saves presentation before exposing clue one |
| Resume a pending mystery | `await bridge.resume()` restores the clue count or previously consented reveal |
| Request one clue | `await bridge.requestNextClue()` unlocks exactly one; the fifth never auto-reveals |
| Confirm camera centre | `await bridge.confirmSelection()` reads centre and awaits committed reveal; valid at every clue level |
| Answer without a guess | `await bridge.revealAnswer()` is accepted only after clue five |
| Finish the explanation | `await bridge.continue()` marks completion and returns idle; it does not start another mystery |
| Leave gameplay | `await bridge.exit()` immediately cancels picks/navigation, waits for an in-flight write, then closes the ephemeral player view while retaining the checkpoint |
| Abandon unavailable pending content | `await bridge.archivePending()` clears the checkpoint but retains its presented-history tombstone |
| Destroy the host adapter | `await bridge.dispose()` cancels capabilities and closes; later inputs return `DISPOSED` |

Answers, true coordinates, explanations and source links appear only in `ANSWER_REVEAL`; earlier snapshots expose unlocked clues only. Use only the safe projection at UI boundaries. Do not log catalogs, records, reveal snapshots or player selections to development output. No accuracy, distance, score, time limit or competition is calculated or saved.

Duplicate confirmations coalesce while a centre read is pending. A hint, exit, resume or other accepted lifecycle action invalidates that read, even if it never resolves. Player mutations do not overlap. Exit/dispose supersedes an in-flight action’s view and navigation, but cannot roll back a write already committed to storage. If confirmation had already reached that commit, the pending checkpoint can legitimately be in revealed state on later resume. Merely receiving a late centre result after exit cannot authorize a reveal.

The host may hide its visual gameplay surface immediately when leaving, but must await `exit()` before reusing the bridge. Honour `BUSY` and avoid automatic retry loops. Navigation failures leave the explanation available; they do not complete or skip the mystery. Returning from reveal aborts navigation; resuming an already-consented reveal may start a fresh navigation request. No action schedules an automatic next mystery.

## Recovery and update states

| Reason/state | Host obligation |
| --- | --- |
| `RESUME_AVAILABLE` | Offer explicit resume; do not overwrite the checkpoint |
| `CONTENT_EXHAUSTED` | State that unseen content is exhausted; no automatic repeats or reset |
| `NO_APPROVED_CONTENT` | Production has no eligible records; do not silently enable development |
| `CONTENT_REVISION_CHANGED` | Preserve progress; restore the pinned release or request explicit `resume({ acceptRevision: true })` (unrevealed clue count restarts at one) |
| `CONTENT_UNAVAILABLE` | Keep progress; restore assets/release or explicitly archive the pending mystery |
| `CORRUPT_PROGRESS`, `UNSUPPORTED_VERSION` | Stop mutations; preserve/export raw stored bytes, then use deliberate recovery; never clear storage automatically |
| `STORAGE_FAILURE`, `LOCK_UNAVAILABLE` | Keep the last committed view and checkpoint; fix storage/locking before retry |
| `STALE_SESSION` | Another tab advanced the saved checkpoint; explicitly re-synchronize with resume |
| `CONTENT_PROGRESS_CHANNEL_MISMATCH` | Correct configuration/import; never erase history to resolve the mismatch |
| `BUSY`, `SELECTION_PENDING`, `STALE_SELECTION`, `SUPERSEDED`, `DISPOSED` | Ignore obsolete results or wait for the deliberate action already running |

Keep the same catalog/release pinned for a pending session. Use versioned release roots rather than fetching each full record through a moving current pointer. Removed IDs and aliases retain history; additions become unseen candidates. The default diversity rules balance kinds, regions, eras, categories, destinations, related IDs and themes when the remaining pool permits; a depleted category is not manufactured by repeating content.

## Automated evidence

Synthetic tests cover never-resolving/late centre reads, duplicate input, hint/exit cancellation, exit during a save, reentrant exit from view observation, navigation abort/failure, storage refusal, explicit fifth-clue reveal and deliberate continuation. Another automated test publishes the real provisional collection into a temporary development channel, lazily plays all records through five clues and explicit reveal, and verifies durable exhaustion after reopening. Original committed canonical/locale text is checked with stored hashes, accounting for Git checkout line endings. No owner hands-on gameplay testing is required to complete this milestone.
