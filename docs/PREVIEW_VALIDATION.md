# Preview installation validation

Installation validation on 2026-10-22 covers permanent Windows desktop shortcuts, the owner-authorized Earth V1 preview channel, and isolation from the existing stable installation. Final observed results are recorded here from a separate publishing checkout after exercising both channels. No real-world education mystery content is included in this preview.

Configuration is committed on `preview`: branch `preview`, ports 8775–8784. Stable remains `main`, ports 8765–8774. The preview contains Claude's Earth V1 commit `d7179c9`. Existing Codex Education Mode work remains on its feature branch and PR #3; no pending feature PR is merged into stable.

The pre-existing stable service is deliberately preserved. Preview shutdown is exercised against the live stable process. Reciprocal shutdown and offline launch of the stable launcher are exercised in an independent temporary stable checkout using the identical stable launcher code, so the owner's existing stable process need not be stopped.

Reboot persistence follows from actual `.lnk` files saved in Windows' resolved Desktop directory. The computer is not rebooted during validation. Native window flashing and actual network-adapter disconnection are not tested; offline checks use an unavailable remote override in temporary process environments, without changing either installation's committed configuration.

## Executed checks

- Windows resolved the actual Desktop to `D:\Desktop`. Both `.lnk` files were created, their targets/working directories were read back, and both saved shortcuts were invoked through the Windows shell. The resulting pages were observed in the user's installed Google Chrome: stable at `http://127.0.0.1:8765/`, preview at `http://127.0.0.1:8775/`. Preview's **Explore the Earth** action was exercised there.
- `npm test`: all 18 geography, Git-update safety, and version-lifecycle tests passed. `npm run build` published the production Earth preview. The channel-aware `npm run test:service` passed using preview fallback port 8776 while an unrelated server occupied 8775; that unrelated server and the existing stable service were unaffected.
- `npm run test:earth`: real Earth assets, exploration, known-coordinate targeting/center picking, antimeridian/pole navigation, drag, wheel zoom, layer controls, delayed-version protection during exploration, title refresh, and no console errors passed. Title and exploration screenshots were visually inspected. The develop-web-game client also exercised the production exploration screen and captured its state/screenshot.
- Live preview stop/offline-start/stop/normal-start was exercised. The original stable service retained its PID and published build throughout. An independent temporary stable clone exercised the identical stable launcher's reciprocal stop isolation and offline reuse without interrupting the owner's stable process. Offline tests rewrote only the test process's Git URL resolution to a nonexistent local remote; dependency/build caches were already available.
- Preview uses a separate checkout, runtime/build ID, service PID, state/lock directory, token, log directory, and committed configuration. Both stable and preview trees were clean and followed the intended upstreams. Neither feature branch or stable main was changed.

This validation record is published from a separate checkout as a normal fast-forward preview update. A live exploration session is held open during publication to check that the periodic service fetch/rebuild does not reload it, then it returns to title to receive the new build. The observation result is reported at delivery; the source document does not claim a future observation before it occurs.
