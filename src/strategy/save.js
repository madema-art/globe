import { SCHEMA } from './game.js';
import { CELL_COUNT } from './grid.js';

// Strategy saves, entirely separate from the mystery library's progress keys. One current save and one
// "previous" slot: starting a new game deliberately moves the current save to the previous slot.

export const SAVE_KEY = 'histography.strategy.prototype';
export const PREVIOUS_KEY = 'histography.strategy.prototype.previous';
const FORMAT = 'histography-strategy-save/1';

export class SaveError extends Error { constructor(code) { super(code); this.code = code; } }

export function serialize(state) {
  return JSON.stringify({ format: FORMAT, savedAt: new Date().toISOString(), state });
}

const finite = (...values) => values.every(Number.isFinite);

export function deserialize(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new SaveError('CORRUPT_SAVE'); }
  if (data?.format !== FORMAT) throw new SaveError('UNSUPPORTED_SAVE');
  const s = data.state;
  if (s?.schema !== SCHEMA) throw new SaveError('UNSUPPORTED_SAVE');
  const valid = Number.isInteger(s.turn) && s.turn >= 1 && Number.isInteger(s.year) && s.year !== 0
    && Array.isArray(s.players) && Array.isArray(s.settlements) && Array.isArray(s.units)
    && s.settlements.every((x) => finite(x.lat, x.lon))
    && s.units.every((u) => finite(u.lat, u.lon, u.movesLeftKm, u.moveKm, u.sightKm))
    && s.territory && Object.values(s.territory).every((cells) => Array.isArray(cells) && cells.every((c) => Number.isInteger(c) && c >= 0 && c < CELL_COUNT))
    && Array.isArray(s.world?.places) && s.world.places.every((p) => finite(p.lat, p.lon))
    && s.knowledge && Object.values(s.knowledge).every((k) => k && typeof k.places === 'object' && Array.isArray(k.routes)
      && Object.values(k.places).every((e) => finite(e.info?.lat, e.info?.lon, e.infoYear, e.firstTurn)));
  if (!valid) throw new SaveError('CORRUPT_SAVE');
  return s;
}

/** Browser storage for the prototype save. Never touches other keys. */
export function createSaveStore(storage = globalThis.localStorage) {
  const read = (key) => { try { return storage.getItem(key); } catch { throw new SaveError('STORAGE_UNAVAILABLE'); } };
  const write = (key, value) => { try { storage.setItem(key, value); } catch { throw new SaveError('STORAGE_FAILURE'); } };
  return {
    hasSave: () => read(SAVE_KEY) !== null,
    hasPrevious: () => read(PREVIOUS_KEY) !== null,
    load() { const text = read(SAVE_KEY); return text === null ? null : deserialize(text); },
    save(state) { write(SAVE_KEY, serialize(state)); },
    /** Keep the current save (even an unreadable one) as the previous save before a new game replaces it. */
    archiveCurrent() { const text = read(SAVE_KEY); if (text !== null) write(PREVIOUS_KEY, text); },
  };
}
