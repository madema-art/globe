// What ONE player's society knows about human geography. The physical Earth is always visible; knowledge is
// about places, people and political facts, and it can be partial, uncertain or out of date.
//
// knowledge = { places: { [placeId]: Entry }, routes: Array<Array<{lat, lon}>> }
// Entry = {
//   placeId, source: 'observation' | 'report', channel?, via?,
//   firstTurn, firstYear,           // when it was first learned
//   infoTurn, infoYear,             // when the information shown was last updated
//   info: { name, kind, description, lat, lon, uncertaintyKm }   // a snapshot: may no longer match reality
// }
// Every civilization will hold its own knowledge object; only the player's is used in this prototype.

export function createKnowledge() { return { places: {}, routes: [] }; }

/**
 * Record what a player learned about a place. Observation always refreshes the snapshot; a report never
 * overwrites a fresher or more precise observation.
 * @returns {'new' | 'updated' | 'unchanged'}
 */
export function learn(knowledge, place, { source, turn, year, channel, via, uncertaintyKm = 0 }) {
  const existing = knowledge.places[place.id];
  if (existing && source === 'report' && (existing.source === 'observation' || existing.infoYear >= year)) return 'unchanged';
  const info = { name: place.name, kind: place.kind, description: place.description, lat: place.lat, lon: place.lon, uncertaintyKm };
  knowledge.places[place.id] = {
    placeId: place.id, source, ...(channel ? { channel } : {}), ...(via ? { via } : {}),
    firstTurn: existing?.firstTurn ?? turn, firstYear: existing?.firstYear ?? year,
    infoTurn: turn, infoYear: year, info,
  };
  return existing ? 'updated' : 'new';
}

export const knows = (knowledge, placeId) => Boolean(knowledge.places[placeId]);

/** Remember a route the player's people travelled (simplified to keep saves small). */
export function recordRoute(knowledge, points, { maxPoints = 24 } = {}) {
  if (points.length < 2) return;
  const step = Math.max(1, Math.ceil((points.length - 1) / (maxPoints - 1)));
  const kept = points.filter((_, i) => i % step === 0);
  if (kept.at(-1) !== points.at(-1)) kept.push(points.at(-1));
  knowledge.routes.push(kept.map((p) => ({ lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4) })));
}

export const OUTDATED_AFTER_YEARS = 100; // PROTOTYPE: news older than this is shown as out of date

/**
 * Presentation state of a known place for the player right now.
 * 'observed' (currently seen), 'new' (learned this turn), 'reported' (second-hand, uncertain),
 * 'known' (seen before, not now), 'outdated' (information older than OUTDATED_AFTER_YEARS).
 */
export function knowledgeState(entry, { observedNow, turn, yearsSinceInfo }) {
  if (observedNow) return entry.firstTurn === turn ? 'new' : 'observed';
  if (yearsSinceInfo >= OUTDATED_AFTER_YEARS) return 'outdated';
  if (entry.source === 'report') return entry.firstTurn === turn ? 'new' : 'reported';
  return entry.firstTurn === turn ? 'new' : 'known';
}
