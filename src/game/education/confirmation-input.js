// Mapping index 2 is the WEST face button in the standard browser mapping.
// Its printed symbol varies. This preset is explicitly Xbox-style, never a universal "X".
export const XBOX_X_BINDING = Object.freeze({ buttonIndex: 2, mapping: 'standard', label: 'Xbox-style X (west face button)' });
const editable = event => (event.composedPath?.() || [event.target]).some(target => target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || ''));

export function createConfirmationInput({ confirm, keyboardCode = 'KeyX', gamepad = null, isEnabled = () => true, onError = () => {} }) {
  if (typeof confirm !== 'function' || typeof isEnabled !== 'function' || typeof onError !== 'function') throw new TypeError('Input callbacks must be functions.');
  let binding;
  const keyboardHeld = new Set();
  const pads = new Map();
  const detach = new Set();
  let pending = false;
  let disposed = false;
  function configure(next) {
    if (typeof next.keyboardCode !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(next.keyboardCode)) throw new TypeError('Invalid keyboard binding.');
    if (next.gamepad !== null && (!next.gamepad || !Number.isInteger(next.gamepad.buttonIndex) || next.gamepad.buttonIndex < 0 || next.gamepad.buttonIndex > 63 || typeof next.gamepad.mapping !== 'string' || typeof next.gamepad.label !== 'string' || !next.gamepad.label.trim())) throw new TypeError('Controller bindings require an index, mapping, and explicit display label.');
    binding = structuredClone(next);
    keyboardHeld.clear(); pads.clear();
  }
  configure({ keyboardCode, gamepad });
  function trigger() {
    if (disposed || pending || !isEnabled()) return false;
    pending = true;
    try { Promise.resolve(confirm()).catch(() => { try { onError({ code: 'CONFIRMATION_FAILED' }); } catch {} }).finally(() => { pending = false; }); }
    catch { pending = false; try { onError({ code: 'CONFIRMATION_FAILED' }); } catch {} }
    return true;
  }
  const input = {
    getBindings: () => structuredClone(binding),
    configure,
    keyDown(event) {
      if (disposed || event.code !== binding.keyboardCode) return false;
      const wasHeld = keyboardHeld.has(event.code);
      keyboardHeld.add(event.code);
      if (event.repeat || wasHeld || event.ctrlKey || event.altKey || event.metaKey || editable(event)) return false;
      const handled = trigger(); if (handled) event.preventDefault?.(); return handled;
    },
    keyUp(event) { keyboardHeld.delete(event.code); },
    pollGamepads(gamepads) {
      if (disposed || !binding.gamepad) return;
      const connected = new Set();
      for (const pad of gamepads || []) {
        if (!pad || pad.connected === false || pad.mapping !== binding.gamepad.mapping) continue;
        const key = `${pad.index}:${pad.id}`;
        connected.add(key);
        const button = pad.buttons?.[binding.gamepad.buttonIndex];
        const pressed = Boolean(button?.pressed || button?.value > 0.5);
        const previous = pads.get(key);
        pads.set(key, pressed);
        // A newly connected/already-held button must be released before it can confirm.
        if (previous === false && pressed) trigger();
      }
      for (const key of pads.keys()) if (!connected.has(key)) pads.delete(key);
    },
    reset() { keyboardHeld.clear(); pads.clear(); },
    attachKeyboard(target) {
      if (disposed) throw new Error('Input is disposed.');
      const down = event => input.keyDown(event);
      const up = event => input.keyUp(event);
      const blur = () => input.reset();
      target.addEventListener('keydown', down); target.addEventListener('keyup', up); target.addEventListener('blur', blur);
      const remove = () => { target.removeEventListener('keydown', down); target.removeEventListener('keyup', up); target.removeEventListener('blur', blur); detach.delete(remove); };
      detach.add(remove); return remove;
    },
    dispose() { disposed = true; for (const remove of [...detach]) remove(); input.reset(); },
  };
  return input;
}
