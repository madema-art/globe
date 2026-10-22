# Shared Globe development instructions

Codex and Claude are collaborating on one shared geography game. Neither has exclusive ownership. The user owns final decisions; ChatGPT coordinates design and architecture. GitHub `madema-art/globe` is the shared collaboration hub. The local Windows master is `D:\globe`.

- Read README, architecture, decisions, assets, and collaboration docs before changing their subject areas.
- Claude owns all visual design and implementation: everything the player sees, including Earth rendering, globe controls and movement presentation, the title screen, menus, typography, buttons and panels, the five-clue interface, historical information displays, controller-focused navigation, HUD, reticles, transitions, borders, rivers, labels, skylines, landmark miniatures and art direction. Codex owns the non-visual systems: the educational mystery engine, historical and geographical content research, the mystery library, clue progression, content selection and repetition prevention, persistent player history, data validation and accuracy, input-action infrastructure, GitHub collaboration, the launcher and general application and test infrastructure. Claude presents the engine's state; Codex owns its logic. These are working responsibilities (owner decision 2026-10-22), not exclusive source ownership.
- Use `codex/<feature>` and `claude/<feature>`, push commits, and integrate through reviewed pull requests into `main`.
- Fetch first; inspect current branch, working tree, and remote changes. Preserve others' local edits. Never force-push, destructively reset/clean, replace source folders, or silently overwrite work.
- Do not build the final geographical globe before agreeing the asset contract with Claude. Do not commit to a custom cube-sphere or giant tile system prematurely.
- Keep source data, physical rendering, political borders, labels, and educational overlays modular.
- Record decisions and every third-party asset's source, license, attribution, transformations, and coordinate system. Do not add enormous raw downloads to Git.
- Maintain title/gameplay lifecycle boundaries. Production builds must never reload active gameplay. Do not introduce Vite HMR into production serving.
- Test safety-sensitive infrastructure with temporary repositories, not destructive experiments on the master checkout. Run `npm test`, `npm run build`, and relevant browser/launcher checks. State precisely which Windows behaviors were exercised.
- Update documentation and progress.md as architecture, ownership, contracts, or behavior evolves. Review other contributors' work before overlapping changes.
