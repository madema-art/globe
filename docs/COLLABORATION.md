# Collaboration through GitHub

Codex, Claude, ChatGPT, and the owner are building one game. GitHub at `https://github.com/madema-art/globe` is the shared source hub and backup. The local master is `D:\globe`; separate development clones/worktrees are welcome. Do not assume an agent can see another agent's unpushed changes or chat.

## Working responsibilities

Codex: educational content, research/citations, validation, selection/diversity, durable local player history and headless gameplay logic; maintain infrastructure only within a separately scoped task. Claude: all visual work, including Earth, renderer, menus, typography, clue UI, transitions, shaders, assets and styling. Content-library work must not change visuals or the launcher/update system. ChatGPT: game design, architecture coordination, implementation planning. Owner: final decisions. Responsibilities guide coordination; they do not establish exclusive ownership.

## Exchange work

1. Inspect `git status`, branch, remotes, and applicable instructions. Fetch `origin`; inspect incoming work and existing PRs.
2. Start a focused `codex/<feature>` or `claude/<feature>` branch from current `main`. Avoid editing overlapping contracts without coordination.
3. Commit a coherent change with updated documentation, tests, decision records, and asset provenance where applicable.
4. Push explicitly: `git push -u origin <feature-branch>`. A local commit is not a GitHub backup.
5. Open a PR against `main`, explaining the concrete change, validation, and open decisions. Ask the other collaborator or owner to review. No assumption of automatic agent-to-agent messaging.
6. Integrate approved changes; fetch and fast-forward clean local `main`. Resolve conflicts deliberately on a feature branch; never overwrite another developer's files wholesale.

No force pushes, destructive resets/cleans, branch switching by the launcher, or silent replacement of source folders. Preserve local edits and untracked files. The bootstrap commit is a one-time direct initial push requested by the owner into an empty repository. Branch protection/review rules are a future repository-admin choice; documentation alone does not enforce GitHub settings.

Launcher updates are deliberately blocked on feature branches and dirty trees. Keep the production master clean for automatic `main` updates; use a development worktree/clone for ongoing work. If the master has local commits, use the normal review workflow before expecting automatic updates.

Use docs/DECISIONS.md as the lasting coordination record; PR descriptions provide context and evidence. Update AGENTS.md and CLAUDE.md when responsibilities or working rules change. Never imply that Claude has reviewed an asset contract until an actual review is recorded.

The mystery-library work is stacked on `codex/education-mode` while PR #3 remains unmerged. Its PR targets that branch, not `main`; after the foundation merges, retarget/rebase deliberately before integration. Review source and locale files privately: the owner is also a player and must not receive answer/clue/coordinate dumps. See [MYSTERY_LIBRARY.md](MYSTERY_LIBRARY.md) for aggregate coverage and the editorial gate.
