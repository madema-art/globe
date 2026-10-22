# Shared HISTOGRAPHY development instructions

Codex and Claude are collaborating on one shared geography game. Neither has exclusive ownership. The user owns final decisions; ChatGPT coordinates design and architecture. GitHub `madema-art/globe` is the shared collaboration hub. The local Windows master is `D:\globe`.

- Read README, architecture, decisions, assets, and collaboration docs before changing their subject areas.
- Claude owns all visual design and implementation: Earth/rendering, menus, typography, clue presentation, transitions, shaders, visual components and styling. Codex owns educational nonvisual systems: content library, research and citations, validation, selection/diversity, durable player history and headless gameplay logic; existing infrastructure remains maintained separately. Do not change Claude's visual work or the launcher/update system in content tasks.
- Use `codex/<feature>` and `claude/<feature>`, push commits, and integrate through reviewed pull requests into `main`.
- Fetch first; inspect current branch, working tree, and remote changes. Preserve others' local edits. Never force-push, destructively reset/clean, replace source folders, or silently overwrite work.
- Do not build the final geographical globe before agreeing the asset contract with Claude. Do not commit to a custom cube-sphere or giant tile system prematurely.
- Keep source data, physical rendering, political borders, labels, and educational overlays modular.
- Record decisions and every third-party asset's source, license, attribution, transformations, and coordinate system. Do not add enormous raw downloads to Git.
- Maintain title/gameplay lifecycle boundaries. Production builds must never reload active gameplay. Do not introduce Vite HMR into production serving.
- Test safety-sensitive infrastructure with temporary repositories, not destructive experiments on the master checkout. Run `npm test`, `npm run build`, and relevant browser/launcher checks. State precisely which Windows behaviors were exercised.
- Update documentation and progress.md as architecture, ownership, contracts, or behavior evolves. Review other contributors' work before overlapping changes.

- The working title is HISTOGRAPHY, with no tagline/subtitle. Keep `globe` repository names, package IDs, paths and infrastructure for compatibility; visual title changes belong to Claude.
- Preserve the existing 27 mystery records and localizations. Expand through new neutral IDs; source-checked authoring must never acquire automatic independent-review attestations. Use explicitly enabled development content/progress separately from production. See docs/LIBRARY_INTEGRATION.md.
