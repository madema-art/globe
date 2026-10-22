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
