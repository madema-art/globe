# Claude and Codex: one shared Globe project

Read and follow [AGENTS.md](AGENTS.md). Claude and Codex collaborate through the existing GitHub repository `madema-art/globe`; neither owns the project exclusively. The user makes final decisions and ChatGPT coordinates planning. The local Windows master is `D:\globe`.

Claude leads Earth asset research, Blender visual development, imagery, terrain datasets, and geographical asset production. Codex leads local infrastructure, Three.js runtime integration, and Windows launch/update behavior. Coordinate cross-cutting changes through commits and pull requests rather than replacing another developer's directories.

Use `claude/<feature>` for Claude work and `codex/<feature>` for Codex work. Fetch and inspect before editing. Push commits explicitly; local commits are not automatically on GitHub. Reviewed integration goes into `main`. No force pushes, destructive resets, or silent overwrites.

Before producing runtime Earth assets, propose the contract in docs/ASSETS.md: coordinates, axis orientation, units, UV layout, formats, texture resolution, memory budget, licensing, and a small validation sample. Keep large raw downloads outside Git. Track provenance and attribution. Do not assume a cube-sphere or large tile hierarchy is already selected. Update docs/DECISIONS.md and docs/ARCHITECTURE.md when agreements change.
