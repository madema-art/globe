# Preview installation validation

Installation validation on 2026-10-22 covers permanent Windows desktop shortcuts, the owner-authorized Earth V1 preview channel, and isolation from the existing stable installation. Final observed results are recorded here from a separate publishing checkout after exercising both channels. No real-world education mystery content is included in this preview.

Configuration is committed on `preview`: branch `preview`, ports 8775–8784. Stable remains `main`, ports 8765–8774. The preview contains Claude's Earth V1 commit `d7179c9`. Existing Codex Education Mode work remains on its feature branch and PR #3; no pending feature PR is merged into stable.

The pre-existing stable service is deliberately preserved. Preview shutdown is exercised against the live stable process. Reciprocal shutdown and offline launch of the stable launcher are exercised in an independent temporary stable checkout using the identical stable launcher code, so the owner's existing stable process need not be stopped.

Reboot persistence follows from actual `.lnk` files saved in Windows' resolved Desktop directory. The computer is not rebooted during validation. Native window flashing and actual network-adapter disconnection are not tested; offline checks use an unavailable remote override in temporary process environments, without changing either installation's committed configuration.
