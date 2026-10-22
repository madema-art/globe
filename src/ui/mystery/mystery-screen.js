import { formatLatLon } from '../../geography/coordinates.js';

// Presentation of a five-clue mystery. It renders ONLY the view object produced by the education
// engine (Codex's MysterySession.getView() shape) and forwards player actions; it contains no game rules.
//
//   source = {
//     getView(), subscribe(listener) -> unsubscribe,
//     requestNextClue(), revealAnswer(), nextMystery(), exit(),
//     confirmSelection() -> Promise   // the education bridge reads earth.pickCenter() and submits
//     preview?: true                  // synthetic presentation data (shows a notice)
//   }
//
// Spoiler safety: answer fields are read only when view.state === 'ANSWER_REVEAL' and view.answer exists.
// Nothing here receives or displays a target before then; the clue ledger shows only revealed clues.

const NUMERALS = ['I', 'II', 'III', 'IV', 'V'];

function glyph(gamepad, key) {
  return `<span class="glyph" aria-hidden="true"><span data-for="gamepad">${gamepad}</span><span data-for="keyboard">${key}</span></span>`;
}

export function createMysteryScreen({ root, earth, onLeave }) {
  root.innerHTML = `
    <p class="preview-notice" hidden>Layout preview with sample text. Real mysteries appear once the education engine is connected.</p>
    <aside class="ledger" aria-labelledby="ledger-heading">
      <h2 id="ledger-heading" class="ledger-heading">Where on Earth?</h2>
      <ol class="clues" aria-live="polite"></ol>
      <p class="ledger-note"></p>
    </aside>
    <article class="answer scrollable" hidden tabindex="-1" aria-live="polite"></article>
    <p class="aim" aria-hidden="true"></p>
    <nav class="actions" aria-label="Mystery actions">
      <button class="action" data-nav data-action="confirm">${glyph('X', 'X')}<span>Confirm this location</span></button>
      <button class="action" data-nav data-action="next">${glyph('A', 'Space')}<span class="next-label">Ask for the next clue</span></button>
      <button class="action" data-nav data-action="continue">${glyph('A', 'Space')}<span>Next mystery</span></button>
      <button class="action" data-nav data-action="leave">${glyph('B', 'Esc')}<span>Leave</span></button>
    </nav>`;
  const q = (sel) => root.querySelector(sel);
  const ledger = q('.ledger');
  const clueList = q('.clues');
  const note = q('.ledger-note');
  const answer = q('.answer');
  const aim = q('.aim');
  const buttons = Object.fromEntries([...root.querySelectorAll('[data-action]')].map((b) => [b.dataset.action, b]));

  let source = null;
  let unsubscribe = null;
  let shownClues = 0;
  let lastMystery = null;
  let lastState = null;
  let view = null;
  let busy = false;

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
    const chosen = a.selectedCoordinates
      ? `You chose ${formatLatLon(a.selectedCoordinates.latitude, a.selectedCoordinates.longitude, 1)}.`
      : 'You revealed the answer without choosing a place.';
    const sources = (a.sources || []).map((s) => `<li><cite>${escape(s.title)}</cite>${s.publisher ? `, ${escape(s.publisher)}` : ''}</li>`).join('');
    answer.innerHTML = `
      <p class="answer-kicker">${chosen}</p>
      <h2 class="answer-identity">${escape(a.identity)}</h2>
      ${a.target?.label ? `<p class="answer-place">${escape(a.target.label)}</p>` : ''}
      ${facts.length ? `<dl class="answer-facts">${facts.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('')}</dl>` : ''}
      ${a.explanation ? `<p class="answer-explanation">${escape(a.explanation)}</p>` : ''}
      ${a.uncertainty ? `<p class="answer-uncertainty">${escape(a.uncertainty)}</p>` : ''}
      ${sources ? `<ul class="answer-sources" aria-label="Sources">${sources}</ul>` : ''}`;
    answer.scrollTop = 0;
  }

  function render(v) {
    view = v;
    const reveal = v.state === 'ANSWER_REVEAL' && v.answer;
    const active = v.state === 'CLUES_ACTIVE';
    if (active && v.mysteryId !== lastMystery) {
      // A new mystery always starts from the whole planet, with no markers.
      lastMystery = v.mysteryId;
      shownClues = 0;
      earth.setSelectionMarker(null);
      earth.clearTarget();
      earth.setLabelPolicy?.('none');
      void earth.resetToPlanetView({ margin: innerHeight < 860 ? 0.6 : 0.7 }); // smaller planet on short screens keeps the ledger clear
    }
    ledger.hidden = Boolean(reveal);
    answer.hidden = !reveal;
    if (active) renderClues(v);
    if (reveal && lastState !== 'ANSWER_REVEAL') {
      renderAnswer(v);
      const s = v.answer.selectedCoordinates;
      earth.setSelectionMarker(s ? { lat: s.latitude, lon: s.longitude } : null);
      earth.setLabelPolicy?.('all');
      earth.setFraming('side');
    }
    if (!reveal) answer.innerHTML = '';
    root.closest('body').classList.toggle('revealing', Boolean(reveal));
    buttons.confirm.disabled = !v.canSubmit;
    buttons.next.disabled = !(v.canRequestClue || v.canRevealAnswer);
    q('.next-label').textContent = v.canRequestClue ? 'Ask for the next clue' : 'Reveal the answer';
    buttons.continue.disabled = !v.canContinue;
    lastState = v.state;
    if (document.activeElement?.disabled || !root.contains(document.activeElement)) (reveal ? buttons.continue : buttons.next.disabled ? buttons.confirm : buttons.next).focus({ focusVisible: false });
  }

  async function act(action) {
    if (!source || !view || busy) return false;
    if (action === 'confirm' && view.canSubmit) {
      busy = true;
      try { await source.confirmSelection(); } finally { busy = false; }
      return true;
    }
    if (action === 'next') {
      if (view.canRequestClue) { source.requestNextClue(); return true; }
      if (view.canRevealAnswer) { source.revealAnswer(); return true; }
      if (view.canContinue) { source.nextMystery(); return true; }
      return false;
    }
    if (action === 'continue' && view.canContinue) { source.nextMystery(); return true; }
    if (action === 'leave') { onLeave(); return true; }
    return false;
  }
  for (const [name, button] of Object.entries(buttons)) button.addEventListener('click', () => { void act(name); });

  return {
    /** Attach an engine source (real session + bridge adapter, or the synthetic preview). */
    open(nextSource) {
      source = nextSource;
      q('.preview-notice').hidden = !nextSource.preview;
      lastMystery = null; lastState = null; shownClues = 0;
      unsubscribe = nextSource.subscribe(render);
      render(nextSource.getView());
    },
    close() {
      unsubscribe?.(); unsubscribe = null; source = null; view = null;
      earth.setSelectionMarker(null);
      earth.setLabelPolicy?.('all');
      document.body.classList.remove('revealing');
    },
    /** Semantic action from keyboard / controller: 'confirm' | 'next' | 'activate' | 'back'. */
    handle(action) {
      if (action === 'back') return act('leave'), true;
      if (action === 'confirm' || action === 'next') { void act(action); return true; }
      if (action === 'activate') {
        const focused = document.activeElement;
        if (focused?.dataset?.action) { void act(focused.dataset.action); return true; }
        void act('next');
        return true;
      }
      if ((action === 'up' || action === 'down') && !answer.hidden) { answer.scrollBy({ top: action === 'down' ? 120 : -120, behavior: 'smooth' }); return true; }
      return false;
    },
    /** Per-frame: the player's own aiming coordinate under the reticle (never the answer). */
    update() {
      if (!source) return;
      const p = earth.pickCenter();
      const text = p ? formatLatLon(p.lat, p.lon, 1) : '';
      if (aim.textContent !== text) aim.textContent = text;
    },
  };
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
