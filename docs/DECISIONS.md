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

Earth representation and asset interface; axis mapping and UV seam; source dataset licenses and attribution; initial content set; border/name policy; rendering budgets and reference hardware; project source license; scoring and challenge rules; Git LFS policy. No custom cube-sphere or enormous tile architecture selected.
