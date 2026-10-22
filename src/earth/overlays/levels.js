// Progressive geographic detail: four levels of one continuous globe, keyed by camera altitude
// (Earth radii above the surface). Layers fade across a band instead of popping.
//
//   Level 1 planetary  : natural planet only (no borders, labels, markers)
//   Level 2 continental: country borders, famous rivers, major ranges / deserts / lakes
//   Level 3 regional   : cities, capitals, more rivers and regional names
//   Level 4 landmark   : curated miniatures (monuments, ruins, skylines, natural wonders)
//
// `fadeIn` = [altitude where the layer starts appearing, altitude where it is fully visible].
export const DETAIL_LEVELS = Object.freeze({
  planetary: Object.freeze({ level: 1, fadeIn: null }),
  continental: Object.freeze({ level: 2, fadeIn: [2.15, 1.55] }),
  regional: Object.freeze({ level: 3, fadeIn: [0.95, 0.65] }),
  landmark: Object.freeze({ level: 4, fadeIn: [0.5, 0.32] }),
});

const smooth = (t) => t * t * (3 - 2 * t);

/** Opacity in [0, 1] for a fade band at a given altitude (higher altitude = further away). */
export function fadeAt(altitude, [start, full]) {
  if (altitude >= start) return 0;
  if (altitude <= full) return 1;
  return smooth((start - altitude) / (start - full));
}

/** The deepest level whose layers are at least partly visible at this altitude (1-4). */
export function detailLevelAt(altitude) {
  let level = 1;
  for (const { level: l, fadeIn } of Object.values(DETAIL_LEVELS)) if (fadeIn && altitude < fadeIn[0]) level = Math.max(level, l);
  return level;
}
