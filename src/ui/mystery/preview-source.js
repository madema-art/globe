// PRESENTATION PREVIEW ONLY: synthetic view objects in the education engine's getView() shape, so the
// mystery screen can be designed and inspected before Codex's engine (PR #3) is integrated.
// It is not a mystery engine: the text is placeholder copy, there is one sample entry, and the "answer"
// is the 0°/0° reference point. Replace with { session, bridge } from src/game/education when integrated.

const SAMPLE_CLUES = [
  'Sample clue: the first clue is the most demanding, written for someone who knows the subject well.',
  'Sample clue: a second hint narrows the period or the region without naming either.',
  'Sample clue: the third clue offers a concrete detail that a curious reader could look up.',
  'Sample clue: the fourth points firmly toward one part of the world.',
  'Sample clue: the fifth is the easiest and nearly names the place.',
];

export function createPreviewSource(earth) {
  const listeners = new Set();
  let revision = 0;
  let count = 1;
  let state = 'CLUES_ACTIVE';
  let selection = null;
  let revealedBy = null;
  let round = 0; // distinguishes repeated previews (the screen resets the planet view per mystery)

  function getView() {
    const view = {
      state, mode: 'education', locale: 'en', revision, mysteryId: `preview-${round}`,
      revealedClueCount: state === 'CLUES_ACTIVE' ? count : count,
      clues: state === 'CLUES_ACTIVE' ? SAMPLE_CLUES.slice(0, count).map((text, i) => ({ number: i + 1, text })) : [],
      canRequestClue: state === 'CLUES_ACTIVE' && count < 5, canSubmit: state === 'CLUES_ACTIVE',
      canRevealAnswer: state === 'CLUES_ACTIVE' && count === 5, canContinue: state === 'ANSWER_REVEAL',
    };
    if (state === 'ANSWER_REVEAL') {
      view.answer = {
        identity: 'Sample answer',
        target: { kind: 'point', referenceFrame: 'WGS84', latitude: 0, longitude: 0, label: 'The meeting of the equator and the prime meridian', modernContext: 'Open water in the Gulf of Guinea' },
        explanation: 'This is placeholder text showing where the explanation of a real answer appears: what happened here, why it matters, and how it connects to the wider story of the world.',
        history: { date: { kind: 'period', label: 'Sample period' }, cultures: ['Sample culture'] },
        sources: [{ id: 's1', title: 'Sample source title', publisher: 'Sample publisher' }],
        uncertainty: 'Real mysteries note how certain the location and dates are, and where historians disagree.',
        selectedCoordinates: selection, revealedBy,
      };
    }
    return structuredClone(view);
  }
  function changed() { revision++; const v = getView(); for (const l of listeners) l(v); }
  function reveal(method) {
    state = 'ANSWER_REVEAL'; revealedBy = method; changed();
    void earth.navigateTo(0, 0, { mark: true, altitude: 1.9 }); // stands in for the education bridge's reveal navigation
  }
  return {
    preview: true,
    getView,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    requestNextClue() { if (state === 'CLUES_ACTIVE' && count < 5) { count++; changed(); } },
    revealAnswer() { if (state === 'CLUES_ACTIVE' && count === 5) reveal('requested'); },
    async confirmSelection() {
      if (state !== 'CLUES_ACTIVE') return;
      const p = earth.pickCenter();
      if (!p) return;
      selection = { latitude: p.lat, longitude: p.lon };
      reveal('selection');
    },
    nextMystery() { if (state === 'ANSWER_REVEAL') { round++; count = 1; selection = null; revealedBy = null; state = 'CLUES_ACTIVE'; changed(); } },
    exit() {},
  };
}
