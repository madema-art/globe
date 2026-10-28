// The simulated world: what EXISTS, independent of what any player knows (see knowledge.js).
//
// PROTOTYPE DEMONSTRATION DATA. These places are geographically plausible kinds of Neolithic human activity
// placed on real terrain to exercise discovery. They are not identifications of historical sites, and their
// descriptive names are deliberately generic: no settlement here is presented as a documented place.
// Codex's permanent simulation will replace this list with researched historical settlements.

export const PROTOTYPE_PLACES = Object.freeze([
  { id: 'place-valley', kind: 'hamlet', name: 'Valley-floor hamlet', lat: 32.05, lon: 35.5, from: -6500, description: 'A small cluster of houses beside fields watered by the river.' },
  { id: 'place-hamlet', kind: 'hamlet', name: 'Hillside hamlet', lat: 31.76, lon: 35.1, from: -6500, description: 'A few households farming the slopes of the central hills.' },
  { id: 'place-spring', kind: 'camp', name: 'Spring-side camp', lat: 32.28, lon: 35.52, from: -6500, description: 'Herders return here each season for the reliable spring.' },
  { id: 'place-plateau', kind: 'camp', name: 'Plateau herders’ camp', lat: 31.72, lon: 35.82, from: -6500, description: 'Seasonal shelters on the plateau east of the valley.' },
  { id: 'place-flint', kind: 'site', name: 'Flint-working site', lat: 31.45, lon: 35.02, from: -6500, description: 'Flint is quarried and shaped into blades here.' },
  { id: 'place-coast', kind: 'camp', name: 'Coastal fishing camp', lat: 32.45, lon: 34.93, from: -6500, description: 'Fishing and shellfish gathering along the shore.' },
  { id: 'place-anatolia', kind: 'village', name: 'Obsidian-working community', lat: 37.67, lon: 32.83, from: -7000, description: 'A large farming community on a plain far to the north, near sources of volcanic glass.' },
].map((p) => Object.freeze({ ...p, prototype: true })));

// PROTOTYPE knowledge channel: one demonstration of news reaching the player WITHOUT exploration. Obsidian from
// central Anatolia did travel south through Neolithic exchange networks, so traders are a plausible carrier;
// the timing and wording here are demonstration values, not a historical event.
export const PROTOTYPE_REPORTS = Object.freeze([
  Object.freeze({ id: 'report-obsidian', placeId: 'place-anatolia', toPlayer: 'player', arrivesOnTurn: 4, channel: 'exchange', via: 'Traders carrying obsidian', uncertaintyKm: 120 }),
]);

/** Places that exist in a given year (a place never appears before it emerges). */
export const placesExistingIn = (places, year) => places.filter((p) => p.from <= year && (p.until === undefined || year < p.until));
