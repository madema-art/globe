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

## Style notes for future assets (proposal)

- Linework: thin, warm ivory borders; muted blue rivers. Line weight and opacity encode importance, not saturated colour.
- Labels: classic atlas typography (serif or small-caps for countries and regions, italic for water and physical features), letter-spaced, with a soft halo instead of boxes. Fade with zoom.
- Miniatures: physically lit like the globe (same sun), restrained palettes (stone, bronze, patina, ivory), slightly exaggerated vertical scale so they read from orbit-like distances, and a soft contact shadow. No outlines or cartoon shading.
- Everything shares the Earth's lighting, so the night side, terminator and clouds affect overlays naturally.
