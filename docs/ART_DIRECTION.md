# Art direction (owner decision, 2026-10-22)

Globe is an educational game about **world geography and world history**, from Bronze Age civilisations to the present. Its look evolves from the approved Earth V1: **a beautiful, serious, sophisticated version of an old illustrated amusement-park map, wrapped around an accurate 3D Earth.** Think of a premium illustrated world atlas with curated 3D miniature landmarks, distinctive city skylines and beautiful natural features. It should feel immersive, tactile, carefully crafted and educational.

**It is not:** cartoonish, childish, cluttered, a road map, or a street-level Google-Earth simulation.

## Priorities

1. Beautiful natural geography: the Earth V1 rendering (imagery, relief, oceans, atmosphere, clouds, lighting) is the foundation. Preserve its quality.
2. Accurate continental and national geography.
3. Major rivers and geographical features.
4. Carefully selected historical and cultural landmarks, as tasteful miniatures with recognisable silhouettes.
5. Recognisable city skylines, curated rather than generic.
6. Elegant geographical labelling.
7. Smooth, gradual appearance of detail with zoom: no popping, and never a switch to a flat map.

## Explicitly out of scope

Roads, highways, street networks, generic city building grids, street-level photography, dense minor points of interest, and terabytes of urban imagery. Skipping these frees rendering budget and effort for what matters.

## Progressive detail (one continuous globe)

| Level | View | Content |
| --- | --- | --- |
| 1 Planetary | Whole Earth on screen, full north-south extent | The natural planet only. No borders, labels, cities or markers |
| 2 Continental | Countries and continents | Political borders, famous large rivers, major mountain ranges, deserts, large lakes, major natural features |
| 3 Regional | Regions | Important cities, capitals, more rivers, more natural geography, regional place names |
| 4 Landmark | Close | Curated miniatures: architecture, monuments, archaeological sites, ruins, skylines, natural wonders (art-direction examples: Eiffel Tower, Petra, the Kremlin, ancient temples, pyramids) |

Miniatures sit at authentic WGS84 coordinates. Avoid icon spam and visually overwhelming clusters. Implementation: [EARTH_OVERLAYS.md](EARTH_OVERLAYS.md).

## Interface identity: "the instrument" (implemented 2026-10-22)

Claude is Globe's lead visual designer (owner decision). The interface no longer uses generic boxed menus. It is drawn as if engraved onto the instrument that holds the Earth: a historical atlas, a museum label and a navigator's instrument, without antique decoration. It must suit every era from the Bronze Age to today.

**Signature element: the bezel.** A thin brass ring with 5° ticks frames the globe's silhouette on every screen (`src/ui/bezel.js`). Its north index always points to geographic north, so when the player rolls the planet the bezel turns with it as a working roll indicator. Close to the surface it hands over to a small compass around the centre reticle. It engraves itself once when the Earth first appears; this is the single orchestrated motion on load.

**Tokens** (`src/style.css :root`):

| Token | Value | Role |
| --- | --- | --- |
| `--ink` | `#0c1720` | Night-chart blue: the field the Earth floats in (never flat black) |
| `--paper` | `#ece4cf` | Primary text, chart-paper ivory |
| `--paper-dim` / `--paper-faint` | `#a8a796` / `#6d7473` | Secondary text / locked and tertiary states |
| `--brass` / `--brass-bright` | `#c9a35b` / `#e2c17f` | Interaction and instruments only: focus, actions, bezel, answer marker |
| `--verdigris` | `#6fa595` | Secondary marks (preview notice) |

**Typography** (SIL OFL 1.1, self-hosted in `src/ui/fonts/` with licence texts):
- *Bodoni Moda*: wordmark, page titles, menu entries, clue numerals I–V, answer titles, country labels. Its high contrast suits a timeless atlas.
- *Newsreader*: reading text (clues, explanations, essays) and water/relief labels in italics, sized for a sofa (clues ≈ 22 px at 1080p).
- *Instrument Sans*: controls, notes, coordinates (tabular numerals), city labels.
- Type scale: perfect fourth (1.333). Sentence case throughout the interface. Spaced capitals appear only on the map, where they are the cartographic convention for countries.

**Components and behaviour:**
- *Index entries* (menus): large serif entries with a one-line note. Focus draws a brass **leader line** from the entry to the bezel, ending in a station circle. The same treatment applies to keyboard, controller and hover. No boxes, no rounded rectangles.
- *Clue ledger*: five numbered lines I–V. Revealed clues are ink on the sky; locked clues are faint hairlines, so the player always sees how many remain. A new clue "inks in" once; earlier clues stay.
- *Action strip*: plain labelled actions with engraved control glyphs (a roundel for controller buttons, a keycap for keyboard keys). The glyph set follows the last-used device. In order: X confirm, A next clue (or reveal after five), B leave.
- *Answer reading*: the globe moves aside (side framing) and the aiming instruments hide. A serif title, the place in brass italics, a short facts list between hairlines, the explanation, an uncertainty note and sources.
- *Legibility without panels*: a soft gradient shades the sky behind the text column. There are no translucent boxes.
- *Reticle*: a thin brass ring and ivory dot at the exact screen centre; the player's own aim coordinate sits beneath it.
- Motion answers actions (screen cross-fades, leader lines, clue ink-in, globe re-framing); `prefers-reduced-motion` removes it.

**Avoided on purpose:** rounded panels, translucent HUD boxes, neon or sci-fi styling, futuristic fonts, cartoon treatments, faux parchment, tracked all-caps interface labels, arrows on buttons, monospace readouts.

## Atlas layers (implemented)

- Linework: thin warm-ivory borders (disputed segments fainter) and muted blue rivers. Lines share the Earth's sun and recede on the night side.
- Labels (`src/earth/overlays/label-layer.js`) follow cartographic conventions: countries in spaced Bodoni capitals, oceans and seas in blue Newsreader italics, ranges/deserts/regions in ivory italics, settlements upright with a point (capitals as a ringed point). A soft halo replaces boxes; priority-based collision avoids clutter and keeps labels clear of interface text and miniatures.
- Landmark miniatures (`src/earth/landmarks/`): oblique "pop-up" dioramas seen from about 30° above their horizon, lit by the Earth's sun, with a soft contact shadow on the ground at the true coordinate and a constant apparent size. Restrained materials (sandstone, wrought iron, basalt and snow). Prototypes: the Giza pyramids (Bronze Age monument), the Eiffel Tower (modern architecture) and Mount Fuji (natural wonder). Production landmarks will be Blender-authored glTF following the same rules.
