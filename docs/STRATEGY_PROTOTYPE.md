# Strategy prototype (Milestone 1)

A small, playable first step toward HISTOGRAPHY's turn-based historical strategy game on the real Earth. It is a separate **Strategy Prototype** mode on the title screen; the mystery game and Explore are unchanged. Claude owns the presentation and the Earth; the rules here are minimal, clearly labelled prototype logic meant to be replaced by Codex's permanent simulation.

## Design principle: the Earth is always there, knowledge grows

The whole physical Earth is visible from the start: continents, oceans, coasts, relief, deserts and rivers render exactly as in Explore. There is **no terrain-concealing fog of war**. What the player gradually learns is the **human** world: settlements, people's activity, routes and (later) political entities, borders, cultures and landmarks.

- **Existence and knowledge are separate.** `state.world` holds what exists; `state.knowledge[player]` holds what that player's people know. A place can exist unknown, and known information can be second-hand, uncertain or out of date.
- **Several ways to learn.** In this milestone: direct **observation** (your settlement and party see what is near them), and one demonstration **report**: traders carrying obsidian bring word of a distant community without any exploration. The design leaves room for trade, migration, diplomacy, cultural exchange and political influence as further channels.
- **The camera cannot reveal anything.** Markers and names are built only from the knowledge record; rotating or zooming never adds information. Modern human overlays (borders, place names, monuments, night lights) are off in this mode because they are not part of a 6000 BCE world. Rivers are physical, so they stay.

## What you can do

- Start in **6000 BCE (Neolithic)** with a small farming village in the lower Jordan Valley (a plausible Pottery Neolithic setting, not a specific historical site) and a tiny territory drawn on the ground.
- Select the village, the exploring party or a known place. Send the party with the **Move** command; it walks on real coordinates, cannot cross seas or lakes, and discovers human activity within sight as it travels. Its routes are remembered and drawn.
- **End turn**: 50 years pass (prototype value), the party's movement is restored, the territory grows by one parcel, observations update, and news may arrive.
- Leave and come back later: the game is saved after every action and resumes after closing the browser. Starting a new game keeps the current one as the previous save.

## Screens and controls (keyboard and mouse only)

The default screen shows only the year, period and turn, the current selection, **End turn**, and quiet links to two screens:
- **I: Information.** Controls, the calendar, your society, what your people know (by knowledge state), reports, recent discoveries and the map legend.
- **U: Settlement.** The selected settlement's overview (type, population, territory, status, founding, location, sight) with laid-out, clearly labelled placeholder sections for population and labour, economy, infrastructure and development. With no settlement selected, it lists the settlements to choose from.

Opening one closes the other; Esc closes an open screen, then a move command, then leaves. Full key and mouse mapping: [EARTH_CONTROLS.md](EARTH_CONTROLS.md#strategy-map-keyboard-and-mouse-only). The gamepad is ignored in this mode.

## Visual language

| Knowledge state | On the map |
| --- | --- |
| Unknown | Nothing is drawn |
| New (learned this turn) | Brass point with a single ink-in ring |
| Observed (seen now) | Solid ivory point with a brass ring |
| Known (remembered) | Hollow ring, dimmed |
| Reported (second-hand) | Dashed circle showing the area where it is said to be |
| Outdated (older than a century) | Faint dashed ring, italic name |

Your territory is a warm wash with a thin brass boundary engraved on the ground; its edge is smoothed and slightly irregular so the gameplay grid never shows. A faint ivory circle marks what your people can see right now. Place names appear below about 0.9 Earth radii; at close range the village and party become oblique pop-up miniatures. Symbols that would overlap give way to your own until you zoom in.

## Architecture

| Concern | Module | Notes |
| --- | --- | --- |
| Calendar | `src/strategy/calendar.js` | Historical years, BCE/CE without a year 0; prototype southern-Levant periods |
| Geography | `src/strategy/grid.js`, `terrain.js` | 1/8° equal-angle grid (≈ 14 km) for calculations; great-circle distances; land/water from `public/strategy/v1/landmask-4096x2048.rle` |
| World (what exists) | `src/strategy/world.js` | Prototype places and the one demonstration report channel |
| Knowledge | `src/strategy/knowledge.js` | Per player: places known, source, when, snapshot, routes; presentation state |
| Observation | `src/strategy/visibility.js` | Derived from observers on demand, never stored |
| Territory | `src/strategy/territory.js` | Ownership cells, separate from knowledge; prototype growth rule |
| Units and movement | `src/strategy/units.js` | Plan/apply moves on real coordinates; water blocks foot travel |
| Turns and state | `src/strategy/game.js` | `createGame`, `moveUnit`, `endTurn`; all prototype values in `PROTOTYPE` |
| Persistence | `src/strategy/save.js` | `histography.strategy.prototype` (+ `.previous`); never touches mystery progress keys |
| Rendering hooks | `src/earth/earth-view.js` | Strategy presentation, territory texture and observation circles in the surface shader, anchored miniatures, `projectGeo`, `centerOn` |
| Presentation | `src/strategy-view/` | Screen, markers, miniatures, I/U screens, input; no game rules |

The rules are plain data and pure functions with no Three.js or DOM dependency, so Codex can replace any of them (population, labour, economy, communication networks, independent civilizations, AI) without the visual experience being rebuilt. Only one player's knowledge is used now, but every structure is keyed by player.

The land mask is derived from the Earth V1 water mask (Natural Earth 10m land and lakes, public domain) by `pipeline/strategy/landmask.py`, so the walking rule matches the coasts on screen. It is 114 KB and is loaded only when the strategy map opens.

## Performance

- The territory texture (one byte per 1/8° cell) is uploaded only when territory changes (on turn end and load); observation circles are four shader uniforms. No per-frame gameplay computation.
- Markers are a handful of DOM elements positioned per frame without layout reads; miniatures are a few dozen small meshes.
- Nothing changes in the mystery or Explore presentations; strategy-only layers and uniforms are switched off when leaving.

## Prototype data (not historical claims)

The village's name, population and status, the five nearby places, the distant community, the obsidian report, 50 years per turn, movement and sight distances and the territory rule are demonstration values. Places use generic descriptive names and are labelled as prototype data in the interface. No ancient Israelite kingdom or other anachronistic civilization is modelled.

## Automated evidence

- `npm test` includes `tests/strategy.test.mjs`: calendar (including the BCE/CE boundary), grid, terrain, start state, exploration and memory, the distant report and outdated news, water blocking, territory growth, save/resume and key separation.
- `npm run test:strategy` (`tests/strategy-browser.mjs`) plays the mode on the launcher-served build with the real Earth renderer, covering the items listed in its header, including a brightness comparison showing the physical Earth renders the same as in Explore.
- `tests/earth-controls.test.mjs` and `npm run test:earth` cover the controller changes (LB/RB roll, right stick unassigned) for Explore and mysteries.

Physical controller feel and real GPU performance were not tested.
