# Mystery library and editorial workflow

For the current **51-record** collection, see [the geography expansion report](GEOGRAPHY_EXPANSION.md). The 27-record statistics below document the preserved first pilot. The official working title is HISTOGRAPHY; repository identifiers remain unchanged.

This is the headless library layer above the five-clue Education Mode foundation. It adds durable discovery history, diversity selection, lazy content access, research files and an approval-gated publisher. Claude owns all visuals and player interface integration. The production entry point does not import this library yet.

## Modules and host contract

`src/game/library/index.js` exports the catalog validator/selector, `LazyMysteryLibrary`, `ProgressRepository`, browser storage adapter and `LibraryPlayer`. Rendering, inputs, networking and UI remain host capabilities.

The host reads `.library/current.json`, pins that release's `catalog.json`, and supplies a JSON reader rooted at `.library/releases/<version>/`. The reader must reject failed HTTP responses rather than returning fallback HTML. Keep a release pinned for a pending session; never switch its record files underneath a loaded catalog. The loader checks SHA-256 hashes of the canonical record and requested locale against the catalog before returning either. It fetches only the chosen record, selected locale and digest file, not all answers. Catalog metadata is loaded once; a map indexes full-record lookups. Selection scans metadata in O(N × recent-window), with a default window of six. History is O(presented IDs); recent metadata is capped at 100. Tests exercise 10,000 synthetic catalog entries.

Create `LibraryPlayer` with the library and a locked progress repository. Call `openNext()` explicitly. It persists presentation and checkpoint before exposing clue one. Use `requestNextClue()`, `submitSelection({ latitude, longitude })`, and `revealAnswer()` for deliberate player actions. Confirmation is valid at each clue level; answer-without-confirmation requires five clues. `continue()` records completion and returns to idle; a separate `openNext()` selects another mystery. There are no timers, scores, accuracy measurements, forced reveals or automatic repetitions.

Only `getView()` may cross the clue UI boundary. Its immutable base-session projection contains unlocked clues and action flags; answer identity, explanation, chronology, sources and target appear only during `ANSWER_REVEAL`. `getNavigationTarget()` returns null outside reveal. Selection metadata, full records and persistence snapshots must never be rendered or logged as clue views. Japanese canonical data and English text remain separate files outside `public/`. This protects ordinary gameplay, not against a person deliberately opening authoring files or browser requests.

`LibraryPlayer` has an async API. The foundation's synchronous `createEducationEarthBridge` is **not** a drop-in adapter for it. The new `createLibraryEarthBridge` supplies those async lifecycle/cancellation guarantees without visuals. Claude's host must route all actions through it and honour navigation abort signals. See [the precise integration contract](LIBRARY_INTEGRATION.md). Singleton sessions omit catalog relationships so linked answers are not loaded. Nothing here wires input, menus or Earth.

## Selection and progress

Each unseen ID receives a stable seeded hash rank. Diversity filters prefer alternatives to the last shared destination, subject or related record; configurable streak caps and weighted recent penalties cover region, era, category, history/geography, country group, cultures and themes. Seeded rank resolves equal costs, independent of catalog order. This is a reproducible shuffled priority pool rather than independent random draws. Weights select variety, not player difficulty. Constraints relax if the remaining pool cannot satisfy them; a small or unbalanced source collection cannot guarantee global parity.

Any presented ID is excluded from future selection, including abandoned mysteries. `exit()` keeps a pending checkpoint. `resume()` restores the unlocked clue count or already-consented reveal. `archivePending()` explicitly abandons the checkpoint while retaining its presentation history. Pending content that has changed returns `CONTENT_REVISION_CHANGED`; explicit `resume({ acceptRevision: true })` accepts the revision and restarts unrevealed clues at one. Missing pending content returns `CONTENT_UNAVAILABLE` until its pinned release is restored or the player explicitly archives it.

New IDs enter the unseen pool automatically. Completed, revealed and presented entries survive additions, revisions and removals. Removed IDs remain tombstones. Renames require an `aliases` mapping; reconciliation copies history once and retains the original tombstone. Keep aliases in later catalogs; never reuse a retired ID for a different subject. Use a new content version for editorial changes, not a new ID to manufacture unseen content. Exhaustion returns `CONTENT_EXHAUSTED`; an empty approved pool returns `NO_APPROVED_CONTENT`. A future revisit policy would require an explicit opt-in and a separate pass identifier while retaining lifetime history. It is not implemented or enabled.

Progress schema 2 stores a seed, sequence/revision counters, per-ID presentation/reveal/completion flags, recent selection metadata, applied aliases and one checkpoint. A schema-1 migration is explicit and lossless. The serialized `globe-progress/1` envelope has an accidental-corruption checksum, not encryption or authentication. Unsupported future versions, malformed data, quota failures and missing locks fail closed; none silently erase history. The previous snapshot is backed up on write. Export damaged bytes before deliberately invoking `recoverBackup()`, because recovery replaces the primary and the backup then retains that damaged primary. Backup recovery can lose the most recent transaction; never perform it automatically.

The browser adapter uses `localStorage` and Web Locks to serialize tabs on the same origin. A host must keep the same origin/port for the same local profile: different localhost ports, browser profiles or cleared site data have different storage. Existing launcher fallback ports are unchanged. A future host can offer user-driven transfer using `inspect()`, `encodeProgress()`, `decodeProgress()` and validated locked transactions; no cloud or automatic import/reset exists. Do not persist guessed coordinates or accuracy. Disk/storage failure leaves the last view unchanged, so a clue cannot be presented without saving its history first.

## Authoring format

`content/library/drafts/` contains unfinished work and never feeds publication. `content/library/research/manifest.json` lists neutral IDs and required locales. `records/<neutral-id>.json` contains Japanese canonical records; `locales/en/<neutral-id>.json` contains complete authored English. The original two foundation samples remain unchanged in `content/education/`; copies are included in the research collection with library metadata. Counts below include those two, rather than claiming 27 entirely new records.

The existing schema remains version 1 with an optional `library` extension. Required extension fields are `contentVersion`, `kind`, `region`, `era`, `countryGroup`, `cultures`, `themes`, `subjectKeys`, `destinationKey`, `learningObjective`, `aliases`, `relatedPlaces` and `publication`. Grouping keys are stable opaque tokens; destinations and subjects should share keys when editorially related. `relatedIds` is for direct cross-record relationships. `relatedPlaces` carries sourced labels/relationships while retaining one WGS84 answer point. Never encode multiple competing target points as a precise single answer.

Historical years use explicit BCE/CE and approximate flags; there is no year zero. Natural features can use `era: not-applicable`; if the required date is a recognition year, its label/explanation must explicitly say so, never present it as geological formation time. Source notes record what the citation supports and how a published reference point was converted. Representative site coordinates are not surveyed entrances, complete boundaries or proof of disputed historical placement. Record uncertainty and narrow the claim when sources cannot support precision.

## Reproducible workflow

Run from the repository root. Use a neutral ID in place of the synthetic example below. These commands report only counts and fixed diagnostic codes. Do not print raw files, diffs or source downloads in owner-facing logs.

```powershell
npm.cmd run content:add -- m900001
# Finish drafts/m900001.json and drafts/locales/en/m900001.json.
# Research every clue and explanation, chronology, location and English wording.
npm.cmd run content:stage -- m900001
npm.cmd run content:validate
npm.cmd run content:report
# After a real independent editorial review, attest with the reviewer's identifier:
npm.cmd run content:review -- m900001 reviewer-id --attest
npm.cmd run content:approve -- m900001 reviewer-id --attest
npm.cmd run content:publish
```

`add` refuses existing IDs and creates an incomplete five-clue scaffold. `stage` validates the finished bilingual draft and imports it into the manifest without editing application files; failed staging rolls back new files. Authoring/staging/publication are single-writer repository operations: serialize them through branches and review, not concurrent CLI processes. An interrupted stage can leave a manifest/file mismatch; validation blocks publication until the author restores a coherent Git state.

Editorial states are `draft`, `source-checked` (author checked cited evidence), and `reviewed` (completed independent editorial review). The earlier `source-checked-sample` value remains compatible. Source checking is not independent historical verification. The review command records a human attestation; it cannot perform or establish that review. Review must assess each claim against its cited source, English fluency, five distinct educational clues in progressively easier order, clue ambiguity, justified geographical target, chronology, uncertainty and spoiler leakage. Add corroborating scholarly/official sources for specialized, contested or consequential claims. Do not use the commands to promote AI authorship automatically.

Publication requires reviewed status, an explicit approver identifier and a digest binding canonical plus every required translation. Editing approved material invalidates approval. Clear `publication` back to unapproved/null fields before revising, increase `contentVersion`, then repeat review/approval. The publisher includes only approved records, generates compact metadata and per-record hashes under an immutable release ID, and atomically switches the current pointer after validation. Failed checks preserve the last good pointer. Version history retains retired IDs so removing and reintroducing a record cannot bypass the version-increase rule. Keep `.library/` as an ignored generated artifact; deployment of these assets and origin-stable storage remains a future host integration task.

Validation covers schemas, exactly five nonempty distinct clues per locale, literal identity leakage, valid source links/references, dates, WGS84 coordinates, neutral/duplicate IDs, complete localization, alias collisions, relationships and approval freshness. Heuristics flag shared destination keys/rounded reference points, overlapping subject keys, repeated English clue wording, near wording and English identity-word overlap. Near-wording comparisons use bounded inverted indexes (128 postings per word, 500 candidates per clue) and can miss matches in very large repetitive datasets. Semantic equivalence, paraphrased spoilers, factual accuracy and subjective clue difficulty require review; zero warnings is not proof of any of them. Reports contain counts only; raw audit objects are authoring-private.

## Pilot coverage and limits

The pilot has **27 mysteries, 135 clues, 27 source references and 27 distinct source URLs**. It includes 25 newly authored records plus the two existing samples. All are source-checked, **zero are independently reviewed, and zero are approved**. Consequently publication currently creates an empty playable catalog. This is deliberate enforcement of the editorial gate. References are official institutional pages; the expansion uses UNESCO records and published reference coordinates. This first batch has limited source diversity and needs independent corroboration where warranted. English was individually authored and checked in the authoring pass; fluency and clue progression still need an independent reader.

Research examined 40 official source pages. Only the smaller collection with adequate evidence and defensible targets was retained; the conditional 40–60 target was not filled with unsupported material. Text and source notes carry limitations without claiming independent historical verification. No source pages or copied articles are bundled.

| Era grouping | Count |
| --- | ---: |
| Bronze Age | 1 |
| Classical | 6 |
| Medieval | 5 |
| Early modern | 3 |
| Nineteenth century | 1 |
| Twentieth century | 2 |
| Multiple eras | 3 |
| Living traditions | 2 |
| Not applicable | 4 |

| Broad region | Count |
| --- | ---: |
| Africa | 5 |
| Americas | 9 |
| Asia | 8 |
| Europe | 1 |
| Oceania | 4 |

The report also distinguishes 12 subregions, without exposing destinations.

| Category | Count |
| --- | ---: |
| Built site | 2 |
| Settlement | 5 |
| Civilization | 3 |
| Culture | 6 |
| Science | 2 |
| Event | 1 |
| Historical process | 4 |
| Natural feature | 4 |

History/geography classification is 22/5. This is an architectural and editorial pilot, not balanced coverage of the full intended curriculum. Next research batches should prioritize natural geography (rivers, ranges, lakes and ecosystems), biographies and ordinary lives, contemporary history, broader East Asian and African coverage, trade/migration and underrepresented social transformations. A larger geography pool is needed before selection can maintain history/geography balance over long play. Broaden institutions and scholarly evidence before scaling volume.

## Verification

`npm test` includes synthetic schema/date/leak tests from the foundation plus library/persistence/pipeline tests. New tests exercise a 10,000-entry catalog, seeded order, no repeated presentations, diversity and scarcity, related/destination spacing, content updates/aliases, lazy digest checks, concurrent repositories and stale tabs, corruption/quota/backup behavior, per-clue resume and confirmation, five-clue explicit reveal, publication approval invalidation/versioning, draft staging, duplicate/source/locale checks and aggregate-only pilot validation. `npm run content:validate`, `npm run content:publish` and `npm run build` provide the remaining pipeline/build checks. No renderer, browser interaction, launcher or menu behavior is implemented by this change.

Local verification on Windows: 72 automated tests (46 existing, 26 new), content validation, approval-gated publication and the production build passed. The immutable build-publication check also passed. Browser/service checks were left to existing CI because this change has no visual or launcher integration and the installed preview was left running.

## Explicit development channel

`npm run content:develop -- --enable-development-content` exports source-checked/reviewed provisional records only under `.library/development/`. Its catalog/loader require explicit development opt-in, retain true unapproved flags and use an isolated progress namespace. Ordinary publication and loading remain production-only by default. `LibraryPlayer.getView()` and action-result views include safe `contentChannel`/`provisional` fields. No stable server route, launcher or entry point enables the channel automatically. Full commands, compatibility and host obligations are in [LIBRARY_INTEGRATION.md](LIBRARY_INTEGRATION.md).
