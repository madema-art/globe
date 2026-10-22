// Interface navigation input: turns keyboard and gamepad buttons into semantic UI actions and tracks the
// last-used device (so control glyphs show a controller roundel or a keycap).
//
// Scope: menus and the mystery screen's navigation/primary/back keys. Analog globe control belongs to the
// Earth (src/earth/gamepad-navigation.js). Gameplay confirmation (X) is NOT handled here: it has a single
// binding path through Codex's createConfirmationInput (src/game/education/confirmation-input.js), fed
// from the same per-frame gamepad snapshot, so a press can never confirm twice.
//
// Actions: 'up' | 'down' | 'left' | 'right' | 'activate' | 'back' | 'next'
//   Gamepad (standard mapping): D-pad = directions, A (0) = activate / primary action, B (1) = back.
//   Keyboard: arrows, Enter = activate, Escape = back, Space = next clue / primary action.

const PAD_BUTTONS = { 12: 'up', 13: 'down', 14: 'left', 15: 'right', 0: 'a', 1: 'b' };

export function createUiInput({ onAction, isEditable = defaultEditable }) {
  const held = new Map(); // `${index}:${id}` -> Set of held button indices
  let device = 'pointer';
  const body = document.body;

  function setDevice(next) {
    if (next === device) return;
    device = next;
    body.dataset.input = next;
  }

  function onKeyDown(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'activate', Escape: 'back', Space: 'next' };
    setDevice('keyboard');
    const action = keys[event.code];
    if (!action) return;
    if (event.repeat && !['up', 'down', 'left', 'right'].includes(action)) return;
    if (isEditable(event.target) && action !== 'back') return;
    if (onAction(action, { source: 'keyboard', event })) event.preventDefault();
  }

  function onPointer() { setDevice('pointer'); }

  /** Feed the host's per-frame navigator.getGamepads() snapshot (same snapshot as the Earth). */
  function pollGamepads(pads) {
    const seen = new Set();
    for (const pad of pads || []) {
      if (!pad || pad.connected === false || pad.mapping !== 'standard') continue;
      const key = `${pad.index}:${pad.id}`;
      seen.add(key);
      const known = held.get(key);
      const now = new Set();
      pad.buttons?.forEach((b, i) => { if (b?.pressed || b?.value > 0.5) now.add(i); });
      if (pad.axes?.some((v) => Math.abs(v) > 0.5) || now.size) setDevice('gamepad');
      if (known) {
        for (const index of now) {
          // A button already held when the pad (re)connected stays inert until released.
          if (known.has(index) || !(index in PAD_BUTTONS)) continue;
          const name = PAD_BUTTONS[index];
          onAction(name === 'a' ? 'activate' : name === 'b' ? 'back' : name, { source: 'gamepad', button: name });
        }
      }
      held.set(key, now);
    }
    for (const key of [...held.keys()]) if (!seen.has(key)) held.delete(key);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointerdown', onPointer);
  window.addEventListener('pointermove', onPointer, { passive: true });
  return {
    pollGamepads,
    get device() { return device; },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('pointermove', onPointer);
    },
  };
}

function defaultEditable(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
}
