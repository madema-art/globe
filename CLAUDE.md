# Claude and Codex: one shared Globe project

Read and follow [AGENTS.md](AGENTS.md). Claude and Codex collaborate through the existing GitHub repository `madema-art/globe`; neither owns the project exclusively. The user makes final decisions and ChatGPT coordinates planning. The local Windows master is `D:\globe`.

Claude owns all visual work, including Earth/rendering, menus, typography, clue presentation, transitions, shaders and styling. Codex owns educational content, research/citations, validation, selection/diversity, durable history and nonvisual gameplay logic. Content tasks must leave visual files and launch/update behavior alone. Coordinate cross-cutting changes through commits and pull requests rather than replacing another developer's directories.

Use `claude/<feature>` for Claude work and `codex/<feature>` for Codex work. Fetch and inspect before editing. Push commits explicitly; local commits are not automatically on GitHub. Reviewed integration goes into `main`. No force pushes, destructive resets, or silent overwrites.

Before producing runtime Earth assets, propose the contract in docs/ASSETS.md: coordinates, axis orientation, units, UV layout, formats, texture resolution, memory budget, licensing, and a small validation sample. Keep large raw downloads outside Git. Track provenance and attribution. Do not assume a cube-sphere or large tile hierarchy is already selected. Update docs/DECISIONS.md and docs/ARCHITECTURE.md when agreements change.

The official working title is HISTOGRAPHY, with no tagline/subtitle; preserve `globe` names and paths for compatibility. Claude owns the visual title update. The persistent async content integration contract is [docs/LIBRARY_INTEGRATION.md](docs/LIBRARY_INTEGRATION.md), including the tested nonvisual `createLibraryEarthBridge`, explicit development-content opt-in, separate progress keys and cancellation rules. Do not use the original synchronous bridge with LibraryPlayer. The expansion adds records without editing the original 27.
