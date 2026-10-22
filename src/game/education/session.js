import { validateLibrary, validateCoordinates } from './validation.js';
import { localizeMystery } from './content.js';

export const EDUCATION_STATES = Object.freeze({ IDLE: 'IDLE', CLUES_ACTIVE: 'CLUES_ACTIVE', ANSWER_REVEAL: 'ANSWER_REVEAL', COMPLETE: 'COMPLETE' });
function immutable(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(immutable); Object.freeze(value); }
  return value;
}

export class MysterySession {
  #records; #locale; #state = 'IDLE'; #current = null; #remaining = []; #count = 0;
  #selection = null; #revealMethod = null; #lastId = null; #revision = 0; #listeners = new Set();
  #notifying = false;

  constructor({ records, locale = 'en' }) {
    this.#records = validateLibrary(records);
    this.#locale = locale;
    // Fail before a session starts if its chosen locale is incomplete.
    this.#records.forEach(record => localizeMystery(record, locale));
  }
  getView() {
    const localized = this.#current ? localizeMystery(this.#current, this.#locale) : null;
    const active = this.#state === 'CLUES_ACTIVE';
    const reveal = this.#state === 'ANSWER_REVEAL';
    const view = {
      state: this.#state, mode: 'education', locale: this.#locale, revision: this.#revision,
      mysteryId: this.#current?.id || null,
      revealedClueCount: this.#count,
      clues: localized ? localized.clues.slice(0, this.#count).map((text, index) => ({ number: index + 1, text })) : [],
      canRequestClue: active && this.#count < 5, canSubmit: active,
      canRevealAnswer: active && this.#count === 5, canContinue: reveal,
    };
    if (reveal) {
      view.answer = {
        identity: localized.identity,
        target: { ...this.#current.answer.target, label: localized.targetLabel, modernContext: localized.modernContext },
        explanation: localized.explanation,
        history: { date: { ...this.#current.history.date, label: localized.dateLabel }, cultures: localized.cultures },
        sources: this.#current.sources, uncertainty: localized.uncertainty,
        selectedCoordinates: this.#selection, revealedBy: this.#revealMethod,
      };
    }
    return immutable(structuredClone(view));
  }
  getNavigationTarget() {
    if (this.#state !== 'ANSWER_REVEAL') return null;
    const { latitude, longitude } = this.#current.answer.target;
    return immutable({ latitude, longitude });
  }
  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function.');
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #result(accepted, reason = null) { return immutable({ accepted, reason, view: this.getView() }); }
  #changed() {
    this.#revision++;
    // Observers receive the same safe projection as consumers; observer failures do not change game state.
    const view = this.getView();
    this.#notifying = true;
    try {
      for (const listener of [...this.#listeners]) { try { listener(view); } catch { /* Observer isolation. */ } }
    } finally { this.#notifying = false; }
    return this.#result(true);
  }
  #begin() {
    this.#remaining = [...this.#records];
    if (this.#remaining.length > 1 && this.#remaining[0].id === this.#lastId) this.#remaining.push(this.#remaining.shift());
    return this.#activateNext();
  }
  #activateNext() {
    this.#selection = null; this.#revealMethod = null;
    this.#current = this.#remaining.shift() || null;
    this.#count = this.#current ? 1 : 0;
    this.#state = this.#current ? 'CLUES_ACTIVE' : 'COMPLETE';
    if (this.#current) this.#lastId = this.#current.id;
    return this.#changed();
  }
  start() {
    if (this.#notifying) return this.#result(false, 'OBSERVER_DISPATCH');
    if (this.#state !== 'IDLE') return this.#result(false, 'NOT_IDLE');
    return this.#begin();
  }
  requestNextClue() {
    if (this.#notifying) return this.#result(false, 'OBSERVER_DISPATCH');
    if (this.#state !== 'CLUES_ACTIVE') return this.#result(false, 'NOT_ACTIVE');
    if (this.#count === 5) return this.#result(false, 'ALL_CLUES_VISIBLE');
    this.#count++;
    return this.#changed();
  }
  submitSelection(coordinates, { expectedRevision = this.#revision } = {}) {
    if (this.#notifying) return this.#result(false, 'OBSERVER_DISPATCH');
    if (expectedRevision !== this.#revision) return this.#result(false, 'STALE_SELECTION');
    if (this.#state !== 'CLUES_ACTIVE') return this.#result(false, 'NOT_ACTIVE');
    let selected;
    try { selected = validateCoordinates(coordinates); }
    catch { return this.#result(false, 'INVALID_COORDINATES'); }
    this.#selection = selected;
    return this.#reveal('selection');
  }
  revealAnswer() {
    if (this.#notifying) return this.#result(false, 'OBSERVER_DISPATCH');
    if (this.#state !== 'CLUES_ACTIVE') return this.#result(false, 'NOT_ACTIVE');
    if (this.#count !== 5) return this.#result(false, 'CLUES_REMAIN');
    return this.#reveal('requested');
  }
  #reveal(method) {
    this.#state = 'ANSWER_REVEAL'; this.#revealMethod = method;
    return this.#changed();
  }
  nextMystery() {
    if (this.#notifying) return this.#result(false, 'OBSERVER_DISPATCH');
    if (this.#state !== 'ANSWER_REVEAL') return this.#result(false, 'REVEAL_REQUIRED');
    return this.#activateNext();
  }
  restart() {
    if (this.#notifying) return this.#result(false, 'OBSERVER_DISPATCH');
    return this.#begin();
  }
  exit() {
    if (this.#notifying) return this.#result(false, 'OBSERVER_DISPATCH');
    this.#state = 'IDLE'; this.#current = null; this.#remaining = []; this.#count = 0;
    this.#selection = null; this.#revealMethod = null;
    return this.#changed();
  }
}
