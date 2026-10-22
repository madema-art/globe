import { formatLatLon } from '../../geography/coordinates.js';

// Presentation of a five-clue mystery on top of Codex's persistent library (docs/LIBRARY_INTEGRATION.md).
// It renders only the committed safe views relayed by the async bridge and forwards deliberate player
// actions to it. It contains no game rules: which actions are allowed comes from the view's flags, and
// every mutation is awaited before the interface changes.
//
// Spoiler safety: answer fields are read only when view.state === 'ANSWER_REVEAL' and view.answer exists.
// The ledger shows only unlocked clues. The Earth receives no target before the bridge's reveal navigation.
//
// Phases: 'loading' (opening the library), 'lobby' (a message with choices: resume, next, errors),
//         'clues' (CLUES_ACTIVE) and 'reveal' (ANSWER_REVEAL).

const NUMERALS = ['I', 'II', 'III', 'IV', 'V'];
// Refusals that only mean "an earlier deliberate action is still running or was superseded".
const IGNORED = new Set(['BUSY', 'SELECTION_PENDING', 'STALE_SELECTION', 'SUPERSEDED', 'DISPOSED']);
const STORAGE_BROKEN = new Set(['CORRUPT_PROGRESS', 'UNSUPPORTED_VERSION']);

const MESSAGES = {
  CONTENT_UNAVAILABLE: ['The library could not be opened', 'The mystery files for this edition could not be read. Your saved progress has not been changed. Restarting Histography from its desktop shortcut usually restores them.'],
  CONTENT_CHANNEL_MISMATCH: ['The library could not be opened', 'This edition was built with a different content library than it expected, so nothing was loaded and your progress is untouched.'],
  DEVELOPMENT_CONTENT_DISABLED: ['The library could not be opened', 'This edition is not configured for provisional content, so nothing was loaded and your progress is untouched.'],
  CONTENT_PROGRESS_CHANNEL_MISMATCH: ['Saved progress belongs to another edition', 'The saved record in this browser belongs to a different edition of Histography. It has been left exactly as it is.'],
  STORAGE_FAILURE: ['Progress could not be saved', 'The browser refused to store your progress, so nothing changed. Check that site data is allowed for this page, then try again.'],
  LOCK_UNAVAILABLE: ['Progress could not be saved', 'Another Histography window is holding your progress, or this browser cannot share it safely. Close other Histography windows, then try again.'],
  NO_APPROVED_CONTENT: ['No mysteries yet', 'No mysteries have been published in this edition yet. They will appear here once the first ones have passed editorial review.'],
  CONTENT_EXHAUSTED: ['You have met every mystery', 'Every mystery in this library has now been presented to you. New mysteries will appear here as the library grows; none will repeat before then.'],
  PLAYER_ACTION_FAILED: ['Something went wrong', 'The last action could not be completed. Your saved progress is unchanged.'],
};

function glyph(gamepad, key, title = '') {
  return `<span class="glyph" aria-hidden="true"${title ? ` title="${escape(title)}"` : ''}><span data-for="gamepad">${escape(gamepad)}</span><span data-for="keyboard">${escape(key)}</span></span>`;
}

export function createMysteryScreen({ root, earth, host, onLeave, confirmGlyph = { gamepad: 'X', keyboard: 'X', title: '' } }) {
  root.innerHTML = `
    <section class="lobby" hidden aria-live="polite">
      <h2 class="lobby-title page-title"></h2>
      <p class="lobby-text"></p>
      <nav class="index lobby-choices" aria-label="Choices"></nav>
    </section>
    <aside class="ledger" hidden aria-labelledby="ledger-heading">
      <h2 id="ledger-heading" class="ledger-heading">Where on Earth?</h2>
      <ol class="clues" aria-live="polite"></ol>
      <p class="ledger-note"></p>
      <p class="mystery-status" role="status"></p>
    </aside>
    <article class="answer scrollable" hidden tabindex="-1" aria-live="polite"></article>
    <p class="aim" aria-hidden="true"></p>
    <p class="provenance" hidden>Provisional content: source-checked, not yet independently reviewed</p>
    <nav class="actions" aria-label="Mystery actions" hidden>
      <button class="action" data-action="confirm">${glyph(confirmGlyph.gamepad, confirmGlyph.keyboard, confirmGlyph.title)}<span>Confirm this location</span></button>
      <button class="action" data-action="next">${glyph('A', 'Space')}<span class="next-label">Ask for the next clue</span></button>
      <button class="action" data-action="continue">${glyph('A', 'Space')}<span>Continue</span></button>
      <button class="action" data-action="leave">${glyph('B', 'Esc')}<span>Leave</span></button>
    </nav>`;
  const q = (sel) => root.querySelector(sel);
  const lobby = q('.lobby');
  const ledger = q('.ledger');
  const clueList = q('.clues');
  const note = q('.ledger-note');
  const status = q('.mystery-status');
  const answer = q('.answer');
  const aim = q('.aim');
  const actions = q('.actions');
  const provenance = q('.provenance');
  const buttons = Object.fromEntries([...root.querySelectorAll('[data-action]')].map((b) => [b.dataset.action, b]));

  let opened = false;
  let epoch = 0;        // bumps on open/close; late async results from an older epoch are dropped
  let phase = 'closed';
  let view = null;
  let busy = false;
  let shownClues = 0;
  let lastMystery = null;
  let lastState = null;
  let unsubscribe = [];
  let lobbyChoices = [];
  let renderedKey = '';

  const body = () => document.body;
  const bridge = () => host.bridge;

  function setPhase(next) {
    phase = next;
    const gameplay = next === 'clues' || next === 'reveal';
    lobby.hidden = gameplay;
    ledger.hidden = next !== 'clues';
    answer.hidden = next !== 'reveal';
    actions.hidden = !gameplay;
    body().classList.toggle('revealing', next === 'reveal');
    body().classList.toggle('mystery-lobby', !gameplay);
    if (next !== 'reveal') answer.innerHTML = '';
    if (next !== 'clues') aim.textContent = '';
  }

  // ------------------------------------------------------------------ lobby (messages and choices)
  function showLobby(title, text, choices) {
    if (!opened) return;
    renderedKey = '';
    if (phase === 'reveal' || phase === 'clues') resetEarthForLobby();
    setPhase('lobby');
    lobby.querySelector('.lobby-title').textContent = title;
    lobby.querySelector('.lobby-text').textContent = text;
    const nav = lobby.querySelector('.lobby-choices');
    nav.innerHTML = '';
    lobbyChoices = choices;
    for (const choice of choices) {
      const button = document.createElement('button');
      button.className = 'index-entry';
      button.dataset.nav = '';
      button.disabled = Boolean(choice.disabled);
      button.innerHTML = `<span class="index-label"></span>${choice.note ? '<span class="index-note"></span>' : ''}`;
      button.querySelector('.index-label').textContent = choice.label;
      if (choice.note) button.querySelector('.index-note').textContent = choice.note;
      button.addEventListener('click', () => { if (!busy) void choice.run(); });
      choice.button = button;
      nav.append(button);
    }
    (choices.find((c) => !c.disabled)?.button)?.focus({ focusVisible: false });
  }
  const leaveChoice = { label: 'Return to the title', run: () => onLeave() };
  function showMessage(code, extra = []) {
    const [title, text] = MESSAGES[code] || MESSAGES.PLAYER_ACTION_FAILED;
    showLobby(title, text, [...extra, leaveChoice]);
  }
  function showLoading() {
    setPhase('loading');
    lobby.hidden = false;
    lobby.querySelector('.lobby-title').textContent = 'Opening the library';
    lobby.querySelector('.lobby-text').textContent = '';
    lobby.querySelector('.lobby-choices').innerHTML = '';
    lobbyChoices = [];
  }
  function clearEarth() {
    earth.setSelectionMarker(null);
    earth.clearTarget();
    earth.setLabelPolicy?.('none');
  }
  // Between mysteries the planet rests beside the text, as on the title, with no markers or names.
  function resetEarthForLobby() {
    clearEarth();
    void earth.resetToPlanetView({ margin: 0.8 });
    earth.setFraming('side');
  }

  // ------------------------------------------------------------------ deliberate actions (all awaited)
  async function run(operation) {
    if (busy || !opened) return null;
    busy = true;
    root.toggleAttribute('aria-busy', true);
    const token = epoch;
    try {
      const result = await operation();
      return token === epoch && opened ? result : null; // late results after leaving are dropped
    } catch {
      return token === epoch && opened ? { accepted: false, reason: 'PLAYER_ACTION_FAILED' } : null;
    } finally {
      if (token === epoch) { busy = false; root.toggleAttribute('aria-busy', false); }
    }
  }

  async function begin() {
    const result = await run(() => bridge().openNext());
    if (!result) return;
    if (result.accepted) return render(result.view);
    if (result.reason === 'RESUME_AVAILABLE') return offerResume();
    handleRefusal(result.reason);
  }
  function offerResume() {
    showLobby('An unfinished mystery is waiting', 'You left a mystery partway through. Its clues are just as you left them.', [
      { label: 'Resume the mystery', note: 'Carry on where you stopped', run: () => resume() },
      { label: 'Start a different mystery', note: 'The unfinished one is set aside and will not return', run: () => setAside() },
      leaveChoice,
    ]);
  }
  async function resume(acceptRevision = false) {
    const result = await run(() => bridge().resume(acceptRevision ? { acceptRevision: true } : undefined));
    if (!result) return;
    if (result.accepted) return render(result.view);
    if (result.reason === 'CONTENT_REVISION_CHANGED') {
      return showLobby('This mystery has been revised', 'Its text was updated since you began. Your history is kept either way.', [
        { label: 'Resume the revised mystery', note: 'Its clues start again from the first', run: () => resume(true) },
        { label: 'Start a different mystery', note: 'The unfinished one is set aside and will not return', run: () => setAside() },
        leaveChoice,
      ]);
    }
    if (result.reason === 'CONTENT_UNAVAILABLE') {
      return showLobby('This mystery is no longer available', 'The unfinished mystery is missing from this edition of the library. Your history is kept.', [
        { label: 'Set it aside and start another', run: () => setAside() },
        leaveChoice,
      ]);
    }
    if (result.reason === 'NO_PENDING_MYSTERY') return begin();
    handleRefusal(result.reason);
  }
  async function setAside() {
    const result = await run(() => bridge().archivePending());
    if (!result) return;
    if (result.accepted) return begin();
    handleRefusal(result.reason);
  }

  function handleRefusal(reason) {
    if (!reason || IGNORED.has(reason)) return;
    if (STORAGE_BROKEN.has(reason)) return offerRecovery(reason);
    if (reason === 'STALE_SESSION') {
      return showLobby('This mystery moved on elsewhere', 'Another Histography window changed your saved progress. Pick up from the saved state.', [
        { label: 'Resume from the saved state', run: () => resume() }, leaveChoice,
      ]);
    }
    if (phase === 'clues' || phase === 'reveal') {
      // Keep the last committed view; explain beside it.
      const [title, text] = MESSAGES[reason] || MESSAGES.PLAYER_ACTION_FAILED;
      setStatus(reason === 'CENTER_UNAVAILABLE' ? 'Point the centre mark at the Earth, then confirm.' : `${title}. ${text}`);
      return;
    }
    if (reason === 'STORAGE_FAILURE' || reason === 'LOCK_UNAVAILABLE') return showMessage(reason, [{ label: 'Try again', run: () => begin() }]);
    showMessage(reason);
  }

  function offerRecovery(reason) {
    let copied = false;
    const choices = [
      { label: 'Save a copy of the saved record', note: 'Keeps the unreadable data safe before anything else', run: () => {
        const raw = host.rawProgress();
        if (raw !== null) {
          const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
          const link = Object.assign(document.createElement('a'), { href: url, download: `histography-progress-${host.channel}-${new Date().toISOString().slice(0, 10)}.json` });
          link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        copied = true;
        choices[1].button.disabled = false;
        choices[1].button.focus({ focusVisible: false });
      } },
      { label: 'Restore the previous save', note: 'The most recent step may be lost', disabled: true, run: async () => {
        if (!copied) return;
        const result = await run(() => host.recoverBackup().then(() => ({ accepted: true }), (error) => ({ accepted: false, reason: error.code })));
        if (!result) return;
        if (result.accepted) return begin();
        showMessage(result.reason === 'NO_BACKUP' ? 'PLAYER_ACTION_FAILED' : result.reason);
      } },
      leaveChoice,
    ];
    showLobby('Saved progress needs attention', reason === 'UNSUPPORTED_VERSION'
      ? 'Your saved record was written by a newer version of Histography. Nothing has been changed or deleted.'
      : 'Histography could not read the saved record of your mysteries. Nothing has been changed or deleted.', choices);
  }

  async function act(name) {
    if (!view || busy) return false;
    const b = bridge();
    let operation = null;
    if (name === 'confirm' && view.canSubmit) operation = () => b.confirmSelection();
    else if (name === 'next' && view.canRequestClue) operation = () => b.requestNextClue();
    else if (name === 'next' && view.canRevealAnswer) operation = () => b.revealAnswer();
    else if ((name === 'next' || name === 'continue') && view.canContinue) operation = () => b.continue();
    if (name === 'leave') { onLeave(); return true; }
    if (!operation) return false;
    setStatus('');
    const result = await run(operation);
    if (!result) return true;
    if (result.accepted && result.view?.state === 'IDLE') { afterContinue(); return true; }
    if (result.accepted) render(result.view);
    else handleRefusal(result.reason);
    return true;
  }
  function afterContinue() {
    view = null; lastState = 'IDLE';
    showLobby('Ready for another?', 'This mystery is complete and kept in your history. The next one will be different.', [
      { label: 'Begin the next mystery', note: 'Five new clues', run: () => begin() }, leaveChoice,
    ]);
  }
  for (const [name, button] of Object.entries(buttons)) button.addEventListener('click', () => { void act(name); });

  function setStatus(text) { if (status.textContent !== text) status.textContent = text; }

  // ------------------------------------------------------------------ rendering committed views
  function renderClues(v) {
    const items = [];
    for (let i = 0; i < 5; i++) {
      const clue = v.clues[i];
      const state = !clue ? 'locked' : i >= shownClues ? 'new' : 'revealed';
      items.push(`<li class="clue" data-state="${state}"><span class="clue-numeral" aria-hidden="true">${NUMERALS[i]}</span>
        <p class="clue-text">${clue ? escape(clue.text) : `<span class="visually-hidden">Clue ${i + 1} not yet revealed</span>`}</p></li>`);
    }
    clueList.innerHTML = items.join('');
    shownClues = v.clues.length;
    note.textContent = v.canRequestClue
      ? 'Turn the Earth until the place sits under the centre mark, then confirm. Each new clue is easier.'
      : v.canRevealAnswer ? 'All five clues are showing. Confirm a location, or reveal the answer.' : '';
  }

  function renderAnswer(v) {
    const a = v.answer;
    const facts = [];
    if (a.history?.date?.label) facts.push(['When', escape(a.history.date.label)]);
    if (a.history?.cultures?.length) facts.push(['Cultures', a.history.cultures.map(escape).join(', ')]);
    if (a.target?.modernContext) facts.push(['Today', escape(a.target.modernContext)]);
    if (Number.isFinite(a.target?.latitude)) facts.push(['The place', `<span class="mark-key mark-key-target" aria-hidden="true"></span>${formatLatLon(a.target.latitude, a.target.longitude, 2)}`]);
    if (a.selectedCoordinates) facts.push(['Your choice', `<span class="mark-key mark-key-choice" aria-hidden="true"></span>${formatLatLon(a.selectedCoordinates.latitude, a.selectedCoordinates.longitude, 2)}`]);
    const kicker = a.selectedCoordinates ? 'You confirmed a place. Both points are marked on the globe.'
      : a.revealedBy === 'requested' ? 'You asked for the answer after the fifth clue.'
        : 'You revealed this answer earlier.';
    const sources = (a.sources || []).map((s) => {
      let host = '';
      try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch { /* malformed URL: show title only */ }
      const title = `<cite>${escape(s.title)}</cite>`;
      return `<li>${host ? `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${title}</a>` : title}${s.publisher ? `, ${escape(s.publisher)}` : ''}${host ? ` <span class="source-host">${escape(host)}</span>` : ''}</li>`;
    }).join('');
    answer.innerHTML = `
      <p class="answer-kicker">${kicker}</p>
      <h2 class="answer-identity">${escape(a.identity)}</h2>
      ${a.target?.label ? `<p class="answer-place">${escape(a.target.label)}</p>` : ''}
      ${facts.length ? `<dl class="answer-facts">${facts.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('')}</dl>` : ''}
      ${a.explanation ? `<p class="answer-explanation">${escape(a.explanation)}</p>` : ''}
      ${a.uncertainty ? `<p class="answer-uncertainty">${escape(a.uncertainty)}</p>` : ''}
      ${sources ? `<h3 class="answer-sources-heading">Sources</h3><ul class="answer-sources">${sources}</ul>` : ''}`;
    answer.scrollTop = 0;
  }

  function render(v) {
    if (!opened || !v) return;
    if (v.state !== 'CLUES_ACTIVE' && v.state !== 'ANSWER_REVEAL') return; // IDLE is handled by the flow above
    const key = `${v.mysteryId}|${v.state}|${v.revealedClueCount}`;
    view = v;
    if (key === renderedKey && (phase === 'clues' || phase === 'reveal')) return; // the bridge relays each committed view once; results repeat it
    renderedKey = key;
    const reveal = v.state === 'ANSWER_REVEAL' && Boolean(v.answer);
    provenance.hidden = !v.provisional;
    if (v.mysteryId !== lastMystery) {
      // Every mystery (new or resumed) starts from the whole planet with no markers or place names.
      lastMystery = v.mysteryId;
      shownClues = v.state === 'CLUES_ACTIVE' ? v.clues.length : 0; // resumed clues do not ink in again
      lastState = null;
      clearEarth();
      earth.setFraming('center');
      if (!reveal) void earth.resetToPlanetView({ margin: innerHeight < 860 ? 0.6 : 0.7 });
    }
    setPhase(reveal ? 'reveal' : 'clues');
    if (!reveal) renderClues(v);
    if (reveal && lastState !== 'ANSWER_REVEAL') {
      renderAnswer(v);
      const s = v.answer.selectedCoordinates;
      earth.setSelectionMarker(s ? { lat: s.latitude, lon: s.longitude } : null);
      earth.setLabelPolicy?.('all');
      earth.setFraming('side'); // the bridge's reveal navigation follows this view
    }
    buttons.confirm.disabled = !v.canSubmit;
    buttons.next.disabled = !(v.canRequestClue || v.canRevealAnswer);
    q('.next-label').textContent = v.canRequestClue ? 'Ask for the next clue' : 'Reveal the answer';
    buttons.continue.disabled = !v.canContinue;
    lastState = v.state;
    if (document.activeElement?.disabled || !root.contains(document.activeElement) || document.activeElement.closest('.lobby')) {
      (reveal ? buttons.continue : buttons.next.disabled ? buttons.confirm : buttons.next).focus({ focusVisible: false });
    }
  }

  return {
    /** Enter the mystery screen: open the library (lazily) and begin or offer to resume. */
    async open() {
      opened = true; epoch++;
      view = null; lastMystery = null; lastState = null; shownClues = 0;
      setStatus('');
      provenance.hidden = host.channel !== 'development';
      resetEarthForLobby();
      showLoading();
      const token = epoch;
      try {
        await host.ready();
      } catch (error) {
        if (token === epoch && opened) handleRefusal(error.code || 'CONTENT_UNAVAILABLE');
        return;
      }
      if (token !== epoch || !opened) return;
      unsubscribe = [host.onView(render), host.onError((code) => { if (code === 'NAVIGATION_FAILED') setStatus('The globe could not travel to the place, but the explanation is complete.'); })];
      await begin();
    },
    /** Leave: hide at once; the bridge cancels picks and navigation and keeps the checkpoint. */
    close() {
      if (!opened) return;
      opened = false; epoch++; busy = false;
      for (const off of unsubscribe) off();
      unsubscribe = [];
      void host.exit();
      view = null;
      setPhase('closed');
      body().classList.remove('mystery-lobby');
      earth.setSelectionMarker(null);
      earth.clearTarget();
      earth.setFraming('center');
      earth.setLabelPolicy?.('all');
    },
    get phase() { return phase; },
    /** Lifecycle facts for tests and diagnostics; never clue text, answers or coordinates. */
    state() {
      return { phase, busy, mysteryId: view?.mysteryId ?? null, viewState: view?.state ?? null, revealedClueCount: view?.revealedClueCount ?? 0, provisional: Boolean(view?.provisional), catalogSize: host.catalogSize, lobby: phase === 'lobby' ? lobby.querySelector('.lobby-title').textContent : null };
    },
    get busy() { return busy; },
    /** Whether a confirmation would be accepted right now (gates the confirmation input). */
    canConfirm() { return opened && phase === 'clues' && !busy && Boolean(view?.canSubmit); },
    /** Confirmation input callback (Codex's createConfirmationInput awaits this promise). */
    confirm() { return act('confirm'); },
    /** Semantic action from the UI input: 'activate' | 'next' | 'back' | 'up' | 'down' | 'left' | 'right'. */
    handle(action, meta = {}) {
      if (action === 'back') { onLeave(); return true; }
      if (phase === 'lobby') {
        const enabled = lobbyChoices.filter((c) => !c.disabled && !c.button.disabled);
        const index = enabled.findIndex((c) => c.button === document.activeElement);
        if (action === 'up' || action === 'down') {
          const next = enabled[(Math.max(index, 0) + (action === 'down' ? 1 : enabled.length - 1)) % enabled.length];
          next?.button.focus({ focusVisible: true });
          next?.button.classList.add('is-focused');
          for (const c of lobbyChoices) if (c !== next) c.button.classList.remove('is-focused');
          return true;
        }
        if (action === 'activate' || action === 'next') {
          const target = enabled[index] ?? enabled[0];
          if (target && !busy) void target.run();
          return true;
        }
        return false;
      }
      if (phase !== 'clues' && phase !== 'reveal') return action === 'activate' || action === 'next';
      if (action === 'next') { void act('next'); return true; }
      if (action === 'activate') {
        // Controller A is always the primary action. Keyboard Enter activates the focused control.
        const focused = document.activeElement;
        if (meta.source !== 'gamepad' && focused?.dataset?.action && root.contains(focused)) { void act(focused.dataset.action); return true; }
        void act(phase === 'reveal' ? 'continue' : 'next');
        return true;
      }
      if ((action === 'up' || action === 'down') && phase === 'reveal') { answer.scrollBy({ top: action === 'down' ? 140 : -140, behavior: 'smooth' }); return true; }
      return false;
    },
    /** Per-frame: the player's own aiming coordinate under the reticle (never the answer). */
    update() {
      if (phase !== 'clues') return;
      const p = earth.pickCenter();
      const text = p ? formatLatLon(p.lat, p.lon, 1) : '';
      if (aim.textContent !== text) aim.textContent = text;
    },
  };
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
