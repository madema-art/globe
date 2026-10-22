# Windows launch and updates

## Use

Double-click `D:\globe\Start-Globe.bat`. Requirements: Git, Node.js >=22.12, Chrome, and internet for initial npm installation. `Start-Globe.bat -Stop` requests shutdown of this checkout's verified Globe service. Closing the batch window or Chrome leaves the service running. `Start-Globe.bat --no-browser` is useful for diagnostics. For nonstandard Chrome installations set `GLOBE_CHROME` to the full `chrome.exe` path.

The launcher spawns a detached Node process with hidden windows, starts or reuses the verified service, waits for its update/build check, then opens Chrome. Port 8765 is preferred; 8766–8774 are tried if occupied. Binding is loopback only. Busy ports are never cleared by killing their processes. If all ports are occupied, launch reports an error.

## Configuration

`launcher.config.json` selects `origin`, tracked branch `main`, 120000 ms check interval, and 8765–8774 port range. The minimum update interval is two minutes. Changing the branch configuration does not switch the checkout branch: switch it yourself with normal Git workflows on a clean tree. Stop and restart the service after changing service code or configuration.

## Git safety

At launch and approximately every two minutes while running, fetch only the configured branch from the existing remote. If GitHub cannot be reached or fetch is refused, continue with local source/builds. Fetch runs without interactive credential prompts and has a bounded timeout.

Integration requires the current branch to equal the configured branch, a clean index/worktree including non-ignored untracked files, and local HEAD to be an ancestor of the incoming commit. Only `git merge --ff-only --no-overwrite-ignore` may update files. A feature branch, local commits ahead of upstream, divergence, dirty files, ignored-file collisions, Git locks, or merge conflicts block integration. No stashing, resets, cleans, forced fetches/pushes, or silent branch changes. A blocked update is logged; the existing local game remains launchable.

Do not edit the same checkout concurrently with its background updater. Use a feature worktree/clone for development and keep the master clean. Git protects its own index, but separate editor changes are not a cross-process transaction.

## Build publication and browser behavior

The source fingerprint includes tracked and non-ignored untracked files; docs-only changes can conservatively trigger a rebuild. A lock prevents simultaneous builds. Changed dependency locks trigger `npm ci`. Vite builds into `.globe/builds/<UUID>` with matching versioned asset paths and an embedded build ID. A source consistency check runs before publication. Only a successful build replaces `.globe/current.json`, served as `/version.json` with no-cache behavior. A failed install/build keeps the previous published build. The checkout can already have fast-forwarded in that case: fix it through a new reviewed commit, then retry; no rollback/reset is performed.

Old builds are retained to preserve lazy-loaded assets for open sessions. Disk use will grow until a retention policy is added. Stop the service and close game tabs before manually deleting obsolete build folders. Do not delete the current build or `.globe/current.json` unless intentionally rebuilding from scratch.

The browser polls about every 20 seconds on the title and refreshes when a different build ID is ready. The version watcher rechecks lifecycle state at response time and defers reload until returning to title. Future gameplay must use this same lifecycle contract. The vision panel also defers refresh until title. Active gameplay is not implemented yet; its refresh protection is tested through state simulations. Production never includes the Vite development server/HMR. `npm run dev` is explicitly a separate development session.

## Ownership, logs, recovery

`%LOCALAPPDATA%\Globe\<checkout-id>\` contains `service.log`, `bootstrap.log`, `server.json`, and a service lock. Each checkout hashes its absolute path for an independent instance. Health checks verify app, checkout, instance, and PID. Control requests require a random token stored in that instance's state file. `-Stop` sends an authenticated HTTP request and never kills a process by PID. The token protects against accidental cross-project control; it is not a boundary against other software running as the same Windows user.

If no service is alive, a stale lock is recovered only when its recorded PID is definitely absent. A reused PID or an incomplete lock blocks startup safely: inspect the process and logs before manually removing that specific stale lock. A crashed build may leave `.globe/build.lock`; inspect its recorded PID and ensure no Globe build is active before removing it. There is no automatic destructive cleanup. Logs currently append without rotation.

Stopping during a build waits for that check to finish before releasing ownership. Subsequent launch can retry. Losing GitHub access is supported with existing local dependencies/builds; launching an entirely new clone offline cannot install missing dependencies. Missing Chrome produces an actionable error and leaves the local server available at the printed URL.
