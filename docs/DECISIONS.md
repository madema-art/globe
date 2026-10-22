# Decision log

## 2026-10-22 — Initial foundation

- Use the existing `madema-art/globe` repository and `D:\globe` master. `main` is stable; future work uses reviewed `codex/*` and `claude/*` branches.
- Use modern JavaScript, Three.js, and Vite. Production serving is a small Node loopback service independent of Vite HMR.
- Ship only a title and vision panel. Abstract orbital lines make no geographical claims. No helicopter and no final Earth asset in this setup.
- Recreate the requested Dogger launch behavior for Globe; no Dogger gameplay or branding. No local Dogger launcher source was found during initial setup, so this is an independent implementation of the supplied requirements.
- Favor conservative Git safety: fetch, verify configured current branch, require a clean tree including non-ignored untracked files, then fast-forward only with ignored-file overwrite protection. Preserve local/ahead/divergent histories.
- Publish immutable versioned builds. Retain older assets for live sessions. Reload only on the title after detecting a changed published ID; defer otherwise.
- Automatic checks run about every two minutes while the service is alive. Browser checks run about every 20 seconds on the title. Browser timers may be throttled in background tabs.
- Store checkout-specific service ownership and logs below `%LOCALAPPDATA%\Globe`. Authenticated loopback shutdown affects only the verified Globe instance; never kill arbitrary PIDs.

## 2026-10-22 — Responsibilities and visual identity (owner; implemented by Claude)

- **Responsibilities:** Claude = all visual design and implementation (everything the player sees). Codex = educational data, game logic, persistence, input infrastructure and general project infrastructure. Claude presents the engine's state; it does not duplicate engine logic.
- **New visual identity, "the instrument"** (replaces the original title/menu boxes): the brass bezel signature, night-chart ink, ivory text, brass for interaction, and Bodoni Moda + Newsreader + Instrument Sans (OFL). Menus are index entries with leader-line focus; the mystery screen has a clue ledger I–V, an action strip and an answer reading with the globe framed aside. See ART_DIRECTION.md.
- **Label policy during mysteries:** no place names at all while investigating (uniform, answer-independent); names return in Explore and after the reveal. Lines and unlabeled miniatures remain.
- **Landmark miniatures:** oblique pop-up dioramas at constant apparent size, lit by the Earth's sun. Three procedural prototypes (Giza, Eiffel Tower, Mount Fuji), with coordinates from Wikidata (CC0). Production models will be Blender glTF, after an LFS/storage policy.
- **Mystery preview:** until PR #3 is integrated, the mystery screen runs on clearly labelled synthetic view data (no engine, no real content).
- **Interim UI input:** keyboard Space = next clue, X = confirm, Esc = back; controller D-pad/A/B/X for navigation and actions. To be unified with Codex's input-action layer.

## 2026-10-22 — Art direction, progressive detail, spoilers, controller (owner; implemented by Claude in a follow-up PR)

- **Purpose:** an educational game about world geography and world history (Bronze Age to the present). Gameplay is five progressively easier clues leading to a location, with no timers, scores or rounds. Codex owns the five-clue engine; Claude owns the Earth experience and its geographic interaction.
- **Art direction:** a serious, sophisticated illustrated amusement-park/atlas map wrapped around the accurate 3D Earth, with curated miniature landmarks and skylines. No roads, street grids or street-level imagery. See ART_DIRECTION.md.
- **Progressive detail:** four continuous levels (planetary → continental → regional → landmark) with smooth fades. Implemented as an altitude-keyed overlay registry; borders and rivers are the first layers. See EARTH_OVERLAYS.md. The border/naming policy is still open (provisional: Natural Earth de facto).
- **Spoiler protection:** no answer-aware Earth APIs, uniform overlay rules, no markers in the `mystery` presentation, every mystery starts from the whole planet, the dev panel only in `explore`, reveal navigation only after confirmation.
- **Controller:** dual-stick three-axis quaternion control. Left stick rotates east/west and north/south; right stick X rolls; right stick Y is fine pitch; RT/LT give analog zoom. A fixed centre reticle. X/A/B are gameplay actions owned by the education engine; the Earth exposes rotation/zoom and shares the host's single per-frame gamepad snapshot. Levelling never fights a deliberate roll and can be disabled. See EARTH_CONTROLS.md.
- **Default stick convention** (proposal, to tune after hands-on testing): the surface follows the stick, like dragging. Per-axis `invert` exists.

## 2026-10-22 — Earth V1 approved by the owner

The owner played Earth V1 and approved it, and its general technical architecture, for integration into `main` (PR #2). Answers to the open questions in issue #1:

- **Camera architecture:** approved. The Earth stays stationary in its Earth-fixed frame; the camera moves around it. The player must experience natural, unrestricted rotation.
- **Graphics memory:** ≈ 256 MB on the high tier is accepted provisionally. Visual quality has priority; medium and low tiers stay available. Texture compression (KTX2) will be decided after real measurements on the owner's Windows gaming PC.
- **Git LFS:** compact processed assets stay in ordinary Git and raw downloads stay out of the repository. Agree an LFS/external-storage policy before adding substantially larger textures, Blender files or 3D landmark libraries.
- **Performance target:** smooth 60 fps at 1920×1080 on the owner's Windows gaming PC. Codex helps identify the hardware and set up benchmarks. Mobile is not a priority.
- **Linux infrastructure quirks** (`npmCi` npm path, `build-check` `EISDIR`): left to Codex; Claude does not rewrite unrelated infrastructure.

## 2026-10-22 — Earth V1 prototype (Claude; approved above)

- Proposed contract: WGS84 degrees `(lat, lon)` at data boundaries, lon `[-180,180)`. Earth-fixed render frame `+X` = 0°/0°, `+Y` = north, `+Z` = 0°/90°W. Unit = equatorial radius; WGS84 ellipsoid geometry. Per-fragment equirectangular texturing with seam-safe gradients. See EARTH_ASSET_CONTRACT.md.
- The camera orbits a fixed Earth (grab-trackball, no Euler angles), so overlays and the sun share one Earth-fixed frame.
- Sources: NASA Blue Marble NG (July 2004), NASA Blue Marble clouds, NASA Black Marble 2016, NOAA ETOPO 2022 60″, Natural Earth 10m, GeoNames cities15000. All downloaded from official hosts by a reproducible pipeline; raw data stays out of Git.
- Texture tiers high/medium/low (day 8K/4K/2K; surface and atmosphere data 4K/4K/2K), WebP/JPEG. Low tier loads first. No KTX2 yet.
- Default lighting is a camera-relative "studio" sun so the visible side is lit and a terminator shows at the limb. A "Real sun" toggle uses the current UTC subsolar point.
- Explore mode added beside title/vision. The title now shows the real Earth instead of the abstract orbit lines; those remain as the no-Earth fallback.
- Everything above can be reverted by removing `src/earth`, `src/shaders/earth`, `public/earth` and the explore UI hooks.

## 2026-10-22 — First playable on preview (owner authorization; integrated by Claude)

- Integrate PRs #4/#6 (Claude) and #3/#5/#7 (Codex) into a branch from `origin/preview` by merge commits; publish to `preview` after CI. Feature PRs stay open; nothing goes to `main`.
- Player-facing name: HISTOGRAPHY, no tagline. Repository, package, paths and launcher keep `globe`.
- The mystery screen runs on Codex's async `LibraryPlayer` via `createLibraryEarthBridge` only; the synthetic preview source is removed. Continue returns to idle; the next mystery is a separate, deliberate choice.
- Preview sets `contentChannel: "development"` in its committed launcher configuration. Each Vite build publishes that channel and copies only the pinned release into the immutable build. Stable has no setting and stays production-only. Approval flags and records are never changed.
- One binding path per action: X via `createConfirmationInput`; A/B/navigation via `ui-input`; analog via the Earth; one gamepad snapshot per frame.
- Ambient title/idle redraws are paced on devices where a frame is very expensive (software rendering), so the page stays responsive. This was the root cause of the PR #6 CI poll timeout.
- Browser storage is per origin; the preview normally keeps port 8775. A fallback port shows a recovery notice. A service-side store is a possible Codex follow-up.

## Pending owner/Claude decisions

Initial content review and approval; border/name policy; rendering budgets and reference hardware; project source license; future feedback design; Git LFS policy. No custom cube-sphere or enormous tile architecture selected.

## 2026-10-22 — Owner's five-clue Education Mode decision

- The new gameplay brief supersedes earlier speculative scoring/timed-round plans. Education Mode teaches world history and geography; no scores, timers, formal rounds, competition, achievements, difficulty settings, or predetermined progression are part of this foundation.
- Exactly five authored clues unlock on request, one at a time. Previous clues remain accessible. The fifth clue never forces a reveal. Selection is allowed at any clue level; answer-without-guess is available only after all five clues.
- A selection records center-of-screen WGS84 coordinates without grading. Answer identity, point target, explanation, context, uncertainty, and sources become visible only during explicit answer reveal. Continue is a separate action.
- Implement in the `codex/education-mode` feature worktree; leave `D:\globe` on stable `main`. Do not modify Claude's branches, Earth implementation, launcher, `src/main.js`, or title/version lifecycle. Integration requires owner review of both developers' work.
- Use a versioned, strictly validated content format: neutral IDs, Japanese authoring records, English localization outside source code/public assets, historical era/year values rather than JavaScript dates, sourced clues, explicit uncertainty, and editorial review of clue order.
- Include two small source-checked samples. This is not a large content library, independent scholarly review, or proof that subjective clue ease is correct. Tests use synthetic fixtures and suppress sample data in diagnostics.
- Keep input separate from sessions and rendering. Default keyboard confirmation is physical `KeyX`; controller binding indexes/mappings/display labels are configurable. An Xbox-style X preset denotes the standard west face button and is not assumed to describe every controller's printed X.
- The proposed Earth adapter supplies centered coordinates and accepts reveal navigation requests. Revision checks reject delayed selections after state changes; abort signals let the host cancel outdated navigation. No assumptions about Claude's actual API names or geometry.
- One session visits each loaded record at most once. Explicit continuation after the final explanation enters `COMPLETE`; explicit restart may start another session, avoiding the last item when alternatives exist. This is content traversal, not a progression/unlock system. Related IDs are metadata only.

## 2026-10-22 — Durable mystery library and editorial gate

- Claude now owns all visuals; Codex owns the educational nonvisual systems. Keep renderer, UI, styling and launch/update files unchanged in this task. Develop in `codex/mystery-library`, stacked on the unmerged Education Mode branch; preserve stable master and preview checkouts.
- Load compact approved metadata and only the selected bilingual record. Selection uses seeded deterministic ranks plus configurable recent diversity filters/weights. Exclude every previously presented ID; retain tombstones and one-time aliases across updates. No automatic revisit policy.
- Persist versioned local history and pending checkpoints before exposing a new view. Require cross-tab locking, preserve a previous snapshot, fail closed on corruption/future formats/storage failure, and require explicit recovery or changed-content acceptance. Never persist player accuracy. Browser origin/profile remains the local identity boundary.
- Separate unfinished drafts, source-checked research, independent review, explicit digest-bound approval and generated runtime releases. Heuristic duplicate/leak checks assist editors; they do not establish historical accuracy or clue progression. Changes invalidate approval and require a content-version increase before republication.
- Produce a smaller defensible pilot rather than fill a conditional numeric target: 27 mysteries/135 clues including the two original samples. All 27 are source-checked, none independently reviewed or approved. The current generated playable catalog is therefore empty. Broaden geography, time periods and source institutions in future researched batches. Full spoiler-free statistics and limitations are in MYSTERY_LIBRARY.md.

## 2026-10-22 — HISTOGRAPHY additive geography expansion

- Owner selected HISTOGRAPHY as the working title with no tagline/subtitle. Keep repository/package/path infrastructure compatible; Claude owns all visual branding and UI.
- Preserve all 27 earlier records and localizations; add 24 source-checked geography records with 120 new bilingual clue pairs. Total 51 mysteries/255 clues, history/geography 22/29. Source references total 53. No historical records were removed or reclassified.
- Provide explicit development-only publication/runtime enablement and isolated progress. Retain actual unapproved flags; never invent independent-review attestations or fall back from empty production to development. All 51 remain source-checked, not independently reviewed/approved.
- Provide a nonvisual async bridge and precise integration contract for Claude. Route every lifecycle action through the facade; honour cancellation and committed-save semantics. Original session-local revisions are not sufficient global tokens for the persistent wrapper.
- Work in a separate branch stacked on PR #5; do not merge, modify visual files, or change stable/preview launcher infrastructure. No owner hands-on testing prerequisite.
