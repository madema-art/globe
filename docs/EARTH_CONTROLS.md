# Earth controls: mouse, keyboard, gamepad

The Earth stays fixed and the camera moves around it (owner-approved). All rotation is quaternion-based: no Euler angles, no gimbal lock, and full control over the poles. Code: `src/earth/globe-controls.js` (camera), `src/earth/gamepad-navigation.js` (controller) and `src/earth/keyboard-navigation.js` (held-key navigation for the strategy map).

The gamepad applies to the title, Explore and mystery screens. **The strategy map is keyboard and mouse only** (owner decision): see "Strategy map" below.

## Gamepad (browser Gamepad API, "standard" mapping, Xbox-style labels)

| Input | Action |
| --- | --- |
| Left stick ↔ | Move the view east/west. The view follows the stick (push right to look further east) |
| Left stick ↕ | Move the view north/south. The view follows the stick (push up to look further north) |
| LB (L1) | Roll the camera counterclockwise (the globe turns clockwise on screen), smoothly while held |
| RB (R1) | Roll the camera clockwise (the globe turns counterclockwise on screen), smoothly while held |
| Right stick (both axes) | **Unassigned** (owner decision; reserved for a future strategy function) |
| RT | Analog zoom in (speed follows trigger pressure) |
| LT | Analog zoom out |
| Right-stick click | North up (Earth camera action; animates the roll back to north) |
| X / A / B | **Not handled by the Earth.** Confirm, next clue and back belong to Codex's education engine (see "Shared controller" below) |

Behaviour:
- **Dead zones:** radial dead zone on each stick (0.16) with rescaling, so motion starts smoothly. Trigger dead zone 0.06. Inside them nothing moves: no drift.
- **Response curve:** exponent 1.7, for fine control near centre and full speed at the rim.
- **Smoothing:** about 90 ms to reach the commanded speed and about 140 ms glide after release, then a hard stop. Motion is frame-rate independent (time-based, sub-stepped for long frames).
- **Precision:** rotation speed scales with altitude, so the surface crosses the screen at a similar rate whether you see the whole planet or a region.
- **Screen-relative axes:** the left stick turns the globe about the screen's vertical and horizontal axes, like rolling a ball in your hands or dragging with the mouse. With north up this is east/west and north/south. A long horizontal sweep follows a great circle rather than a parallel of latitude. If hands-on testing prefers strict east/west spin about the polar axis, that's a contained change in `gamepad-navigation.js`.
- **Stick and shoulder buttons work simultaneously:** rotation and roll combine into one rotation each frame. Roll eases in and out (the buttons are digital; the smoothing makes the roll gradual).
- **Connect/disconnect:** pads are re-read every frame. A disconnected pad stops all motion immediately. A button already held when a pad (re)connects must be released before it acts. With several pads, the last one moved drives the globe.
- **Configurable:** `earthView.gamepad.configure({ mapping, yaw:{axis,invert}, pitch:{…}, rollCounterClockwise:{button}, rollClockwise:{button}, zoomIn:{button}, zoomOut:{button}, northUp:{button} })`. Tunables live in `earthView.gamepad.settings` (dead zones, curve, speeds, sensitivity, smoothing). The default is "the view follows the stick" (owner playtest, 2026-10-22); set `invert: false` on `yaw` and `pitch` for "the surface follows the stick". To swap the roll direction of the shoulder buttons, exchange the two roll bindings.

## North-up levelling vs. deliberate roll

Levelling (gently removing roll relative to geographic north) exists so casual mouse dragging doesn't leave the globe tilted. It must never fight the player:
- Any deliberate roll (shoulder buttons, keyboard Q/E) **suspends levelling** until the player asks for north-up (right-stick click, keyboard N) or a navigation/new mystery resets the view.
- Levelling only trims **small** offsets (≤ 45°), fades out near the poles, and waits for 400 ms of inactivity. Rotating over a pole therefore never triggers an unwanted 180° flip.
- It can be switched off entirely: `earthView.controls.leveling.mode = 'off'` (also `rate`, `maxOffset`).

## Mouse and keyboard (unchanged, plus roll)

Drag rotates (the grabbed point stays under the cursor), with inertia. The wheel or a pinch zooms toward the cursor. Keys:
- Arrows rotate; `+`/`−` zoom.
- **Q/E roll; N north up** (new).
- Esc returns to the title; F toggles fullscreen.
- The X key is Codex's confirm binding and is not used by the Earth.

## Aiming reticle

A subtle fixed reticle (thin ring and dot) sits at the exact viewport centre in the `explore` and `mystery` presentations and stays put when the camera rolls. `earthView.pickCenter()` returns the WGS84 point under it (exact ray/ellipsoid intersection), or `null` if it misses the globe.

## Shared controller (coordination with the education engine)

The host polls `navigator.getGamepads()` **once per frame** and passes that same snapshot to `earthView.pollGamepads(snapshot)` and to the education engine's `confirmationInput.pollGamepads(snapshot)`. There are no competing listeners and no duplicated polling. The Earth reads only the sticks, triggers and right-stick click; the education engine reads face buttons (X confirm = standard index 2; A = 0; B = 1). Both use the "standard" mapping and treat a newly connected held button as not pressed.

Physical controller hardware has **not** been tested yet; behaviour is verified with synthetic gamepad input (`tests/earth-gamepad-browser.mjs`). Tune speeds and mapping after hands-on testing.

## Strategy map (keyboard and mouse only)

The strategy prototype disables the gamepad and the Explore/mystery key scheme while it is open, and uses:

| Input | Action |
| --- | --- |
| W / S | Move the view north / south (toward the top / bottom of the screen; north when north-up), smoothly while held |
| A / D | Move the view west / east |
| Q / E | Roll the globe clockwise / counterclockwise on screen |
| Left drag | Rotate the globe with the mouse |
| Wheel | Zoom (the strategy map allows closer views, down to 0.05 Earth radii) |
| Double-click | Smoothly centre the point clicked, keeping the zoom |
| Click | Select a settlement, the party or a known place (acts after the double-click interval, so a double-click never selects) |
| M or Move | Movement command for the selected party; the next click sets the destination. Esc or right-click cancels |
| Enter | End the turn |
| I / U | Information overlay / settlement screen (toggles; one at a time) |
| Esc | Close an open screen, then a move command, then leave |

Keys are ignored while typing in a text field. A movement threshold of 5 px separates clicks from drags. Details: [STRATEGY_PROTOTYPE.md](STRATEGY_PROTOTYPE.md).
