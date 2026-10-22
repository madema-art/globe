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

## Pending owner/Claude decisions

Earth representation and asset interface; axis mapping and UV seam; source dataset licenses and attribution; expanded content library; border/name policy; rendering budgets and reference hardware; project source license; future feedback design; Git LFS policy. No custom cube-sphere or enormous tile architecture selected.

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
