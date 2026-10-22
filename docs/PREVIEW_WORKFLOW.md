# Permanent stable and preview installations

**Current preview: HISTOGRAPHY first playable** (see [FIRST_PLAYABLE.md](FIRST_PLAYABLE.md)). Double-click **Globe Preview** on the Desktop and choose **Begin a mystery**. Preview builds include the provisional development content library automatically (`contentChannel: "development"` in this branch's `launcher.config.json`); stable does not.

The owner has authorized Claude's completed Earth V1 for the preview channel only. `preview` initially includes `claude/earth-v1`; neither PR #2 nor Education Mode PR #3 is merged into `main` by this setup. Preview displays the real interactive Earth and its exploration screen. The education engine remains a separate feature for later review/integration.

| Channel | Checkout | Tracked branch | Launcher | Desktop shortcut | Ports |
| --- | --- | --- | --- | --- | --- |
| Stable | `D:\globe` | `origin/main` | `Start-Globe.bat` | `Globe.lnk` | 8765–8774 |
| Preview | `D:\globe-preview` | `origin/preview` | `Start-Globe-Preview.bat` | `Globe Preview.lnk` | 8775–8784 |

Double-click either desktop shortcut. The launcher checks its configured branch, safely fast-forwards a clean matching checkout, prepares a production build if needed, starts or reuses its own hidden background service, and opens Chrome. On preview choose **Explore the Earth** to interact with the planet. Preview is labeled in the browser title, title screen, and exploration return button. No manual Git/build/server commands are needed for normal use.

The installer `scripts/Install-Desktop-Shortcuts.ps1` resolves the Windows Desktop known folder, including redirection/OneDrive. It creates persistent `.lnk` files with absolute targets and working directories. It backs up a same-named shortcut pointing elsewhere under `%LOCALAPPDATA%\Globe\shortcut-backups` before replacement. It does not install a startup task or require login-time services: each shortcut starts its own service after reboot. To recreate the shortcuts, run this installer once with PowerShell; daily launch uses only the shortcuts.

## Independent instances

Each checkout has its own `.git`, `node_modules`, `.globe/builds`, and committed `launcher.config.json`. The existing launcher hashes the absolute checkout path to select `%LOCALAPPDATA%\Globe\<instance-id>\` for service ownership, state, and logs. Stable and preview have separate tokens, locks, PIDs, port ranges, build pointers, and immutable assets. Tokens are never printed in diagnostics. Neither version clears occupied ports or kills arbitrary processes.

`D:\globe-preview\Start-Globe-Preview.bat -Stop` stops only preview. Stable's existing `Start-Globe.bat -Stop` targets only the stable checkout. Closing the launcher or Chrome does not stop its background service. A reboot stops background processes, but the desktop shortcuts persist and restart their respective service on the next launch.

## Safe automatic updates

Stable follows only `origin/main`; preview follows only `origin/preview`. The preview branch and 8775–8784 ports are committed configuration, not local edits. The preview checkout must remain clean for unattended updates. Feature branches are never automatically merged into either channel.

Checks run at launch and roughly every two minutes while that service runs. The existing fetch/fast-forward-only updater protects tracked edits, non-ignored untracked files, ignored-file collisions, current branches, and divergent histories. It does not stash, force-reset, force-push, or switch branches. A blocked update is reported in launcher output and the checkout's service log. An unavailable GitHub remote leaves the existing local version usable; first installation still needs dependencies/assets already available before offline use.

Successful builds publish new version IDs while retaining old versioned assets for open sessions. Chrome checks versions roughly every 20 seconds only on the title. An in-flight response also rechecks lifecycle state. Earth exploration and other active gameplay are never reloaded; an available refresh applies only after returning to title. Serving is independent of Vite HMR. Service implementation/configuration changes require a controlled service restart; normal gameplay/asset updates do not. Do not change a live service's port/branch configuration as a way of moving channels.

## Publishing reviewed work to preview

Developers, not the player, do the Git operations:

1. Fetch the repository and inspect the reviewed feature/PR. Agree what is ready for preview. Keep unfinished Codex and Claude branches separate.
2. Use a separate publishing worktree/clone based on current `origin/preview`; do not edit the running installation. Work on a focused publishing branch such as `codex/preview-<feature>` or `claude/preview-<feature>`.
3. Integrate only the explicitly approved change. A merge commit or focused cherry-picks may be appropriate; resolve conflicts deliberately. Preserve preview's branch/port configuration, preview entry point and badge, and title-only refresh lifecycle. Do not replace another contributor's directories.
4. Run the relevant tests and production build, inspect the resulting UI, and open a PR targeting `preview` for review. Spoiler-bearing educational content must stay out of summaries and test logs.
5. Integrate the reviewed PR into `preview` without force pushes. GitHub has the update only after the commit is pushed. The running preview installation will safely receive that branch, rebuild, and refresh at title. The player's actions remain double-clicking the shortcut and returning to title when ready.
6. Stable promotion is a separate owner-approved PR against `main`. Do not blindly merge preview channel configuration/badging into main: stable must keep its own launcher, main tracking, and 8765–8774 ports.

For a first preview checkout on another machine, clone `--branch preview` into its permanent installation directory, then create the shortcuts. For future channel/config/service infrastructure changes, plan a reviewed migration. Never rewrite preview history to move it to a different feature branch.

Known inherited limits: old builds/logs are retained without automated pruning/rotation; service-code changes take effect after restart. The Earth prototype is preview software. The headless education engine is not part of this preview yet. No changes to stable launcher infrastructure are needed for this setup.
