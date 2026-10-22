import { MysterySession } from '../education/session.js';
import { ProgressError } from './progress.js';
import { reconcileProgress, selectNext } from './catalog.js';

// Relations belong to the catalog. A singleton session must not demand that its
// related records (and their hidden answers) also be loaded into memory.
function sessionRecord(record) { return { ...record, relatedIds: [] }; }

// Headless async orchestration. IO/persistence completes before any new view is published.
export class LibraryPlayer {
  #library; #repository; #rules; #locale; #session = null; #state = 'IDLE'; #busy = false;
  constructor({ library, repository, locale = 'en', diversity = {} }) {
    if ((library.getCatalog().channel || 'production') !== repository.channel) throw new ProgressError('CONTENT_PROGRESS_CHANNEL_MISMATCH');
    this.#library = library; this.#repository = repository; this.#locale = locale; this.#rules = diversity;
  }
  getView() {
    const view = this.#session ? this.#session.getView() : { state: this.#state, mode: 'education' };
    return Object.freeze({ ...view, contentChannel: this.#repository.channel, provisional: this.#repository.channel === 'development' });
  }
  getNavigationTarget() { return this.#session?.getNavigationTarget() || null; }
  async #operate(operation) {
    if (this.#busy) return { accepted: false, reason: 'BUSY' };
    this.#busy = true;
    try { return await operation(); }
    catch (error) { return { accepted: false, reason: error.code || 'CONTENT_UNAVAILABLE' }; }
    finally { this.#busy = false; }
  }
  async openNext() {
    return this.#operate(async () => {
      if (this.#session) return { accepted: false, reason: 'EXIT_OR_CONTINUE_REQUIRED' };
      let session = null, state;
      await this.#repository.transaction(async saved => {
        const reconciled = reconcileProgress(saved, this.#library.getCatalog()); Object.assign(saved, reconciled);
        if (saved.active) { state = 'RESUME_AVAILABLE'; return; }
        const choice = selectNext(this.#library.getCatalog(), saved, this.#rules); state = choice.state;
        if (!choice.entry) return;
        const record = await this.#library.load(choice.entry.id, choice.entry.contentVersion);
        session = new MysterySession({ records: [sessionRecord(record)], locale: this.#locale }); session.start();
        saved.sequence++;
        saved.entries[record.id] = { presented: 1, revealed: false, completed: false, lastPresented: saved.sequence, contentVersion: choice.entry.contentVersion };
        saved.recent.push(choice.entry); saved.recent = saved.recent.slice(-100);
        saved.active = { id: record.id, contentVersion: choice.entry.contentVersion, clueCount: 1, revealed: false };
      });
      this.#session = session; this.#state = state;
      return { accepted: Boolean(session), reason: session ? null : state, view: this.getView() };
    });
  }
  async resume({ acceptRevision = false } = {}) {
    return this.#operate(async () => {
      let session;
      await this.#repository.transaction(async saved => {
        Object.assign(saved, reconcileProgress(saved, this.#library.getCatalog()));
        if (!saved.active) return;
        const entry = this.#library.getCatalog().entries.find(entry => entry.id === saved.active.id);
        if (!entry) throw new ProgressError('CONTENT_UNAVAILABLE');
        if (entry.contentVersion !== saved.active.contentVersion) {
          if (!acceptRevision) throw new ProgressError('CONTENT_REVISION_CHANGED');
          saved.active.contentVersion = entry.contentVersion;
          saved.active.clueCount = saved.active.revealed ? saved.active.clueCount : 1;
        }
        const record = await this.#library.load(saved.active.id, saved.active.contentVersion);
        session = new MysterySession({ records: [sessionRecord(record)], locale: this.#locale, resume: saved.active });
      });
      if (session) this.#session = session;
      return { accepted: Boolean(session), reason: session ? null : 'NO_PENDING_MYSTERY', view: this.getView() };
    });
  }
  async #action(name, ...args) {
    return this.#operate(async () => {
      if (!this.#session) return { accepted: false, reason: 'NOT_ACTIVE' };
      const before = this.#session.getView(); let candidate, result;
      await this.#repository.transaction(async saved => {
        if (!saved.active || saved.active.id !== before.mysteryId || saved.active.clueCount !== before.revealedClueCount || saved.active.revealed !== (before.state === 'ANSWER_REVEAL')) throw new ProgressError('STALE_SESSION');
        const record = await this.#library.load(saved.active.id, saved.active.contentVersion);
        candidate = new MysterySession({ records: [sessionRecord(record)], locale: this.#locale, resume: saved.active });
        result = candidate[name](...args);
        if (!result.accepted) return;
        saved.active.clueCount = result.view.revealedClueCount;
        saved.active.revealed = result.view.state === 'ANSWER_REVEAL';
        if (saved.active.revealed) saved.entries[before.mysteryId].revealed = true;
      });
      if (result.accepted) this.#session = candidate;
      return { ...result, view: this.getView() };
    });
  }
  requestNextClue() { return this.#action('requestNextClue'); }
  submitSelection(coordinates) { return this.#action('submitSelection', coordinates); }
  revealAnswer() { return this.#action('revealAnswer'); }
  async continue() {
    return this.#operate(async () => {
      const view = this.#session?.getView();
      if (view?.state !== 'ANSWER_REVEAL') return { accepted: false, reason: 'REVEAL_REQUIRED' };
      await this.#repository.transaction(saved => {
        if (saved.active?.id !== view.mysteryId || !saved.active.revealed) throw new ProgressError('STALE_SESSION');
        saved.entries[view.mysteryId].completed = true; saved.active = null;
      });
      this.#session = null; this.#state = 'IDLE';
      return { accepted: true, view: this.getView() };
    });
  }
  exit() { if (this.#busy) return { accepted: false, reason: 'BUSY' }; this.#session = null; this.#state = 'IDLE'; return { accepted: true, view: this.getView() }; }
  async archivePending() {
    return this.#operate(async () => {
      await this.#repository.transaction(saved => { saved.active = null; });
      this.#session = null; this.#state = 'IDLE'; return { accepted: true, view: this.getView() };
    });
  }
}
