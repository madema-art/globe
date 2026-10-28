// Held-key globe navigation (Earth-owned: camera movement only). Used by the strategy map, which is designed
// for keyboard and mouse:
//   W / S: move the view north / south (toward the top / bottom of the screen; north when north-up)
//   A / D: move the view west / east
//   Q: roll the globe clockwise on screen       E: roll the globe counterclockwise on screen
// Holding a key gives smooth, continuous movement that eases in; releasing it stops the movement.
// Keys typed into text fields and keys with modifiers are ignored.

const KEYS = { KeyW: 'north', KeyS: 'south', KeyA: 'west', KeyD: 'east', KeyQ: 'rollClockwise', KeyE: 'rollCounterClockwise' };

export const DEFAULT_KEYBOARD_SETTINGS = Object.freeze({
  rotationSpeed: 1.0,     // rad/s when the whole planet is in view (scaled down with altitude for precision)
  rollSpeed: 1.0,         // rad/s
  accelerationTime: 0.12, // seconds to approach full speed
  releaseTime: 0.08,      // seconds of glide after release (then a complete stop)
  precisionAltitude: 2.9,
});

const editable = (target) => Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));

export function createKeyboardNavigation(controls, { target = window, settings = DEFAULT_KEYBOARD_SETTINGS } = {}) {
  const tune = { ...settings };
  const held = new Set();
  const velocity = { yaw: 0, pitch: 0, roll: 0 };
  let enabled = false;

  function onKeyDown(event) {
    const key = KEYS[event.code];
    if (!enabled || !key || event.ctrlKey || event.altKey || event.metaKey || editable(event.target)) return;
    held.add(key);
    event.preventDefault();
  }
  function onKeyUp(event) { const key = KEYS[event.code]; if (key) held.delete(key); }
  function clear() { held.clear(); }
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', clear);

  /** @returns {boolean} true while the keyboard is moving the camera */
  function update(dt) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    const precision = Math.min(1.3, Math.max(0.03, controls.altitude / tune.precisionAltitude));
    const speed = tune.rotationSpeed * precision;
    // rotateInView: yaw > 0 moves the surface right (the view goes west); pitch > 0 moves it down (the view
    // goes north); roll > 0 twists the globe clockwise on screen.
    const target = {
      yaw: ((held.has('west') ? 1 : 0) - (held.has('east') ? 1 : 0)) * speed,
      pitch: ((held.has('north') ? 1 : 0) - (held.has('south') ? 1 : 0)) * speed,
      roll: ((held.has('rollClockwise') ? 1 : 0) - (held.has('rollCounterClockwise') ? 1 : 0)) * tune.rollSpeed,
    };
    let moving = false;
    for (const k of ['yaw', 'pitch', 'roll']) {
      const tau = target[k] !== 0 ? tune.accelerationTime : tune.releaseTime;
      velocity[k] += (target[k] - velocity[k]) * (1 - Math.exp(-dt / Math.max(tau, 1e-3)));
      const full = k === 'roll' ? tune.rollSpeed : speed;
      if (target[k] === 0 && Math.abs(velocity[k]) < 0.03 * full) velocity[k] = 0;
      if (velocity[k] !== 0) moving = true;
    }
    if (moving) {
      if (held.size) controls.noteInput({ roll: held.has('rollClockwise') || held.has('rollCounterClockwise') });
      controls.rotateInView(velocity.yaw * dt, velocity.pitch * dt, velocity.roll * dt);
    }
    return moving;
  }

  return {
    update,
    settings: tune,
    get enabled() { return enabled; },
    set enabled(on) { enabled = on; if (!on) { clear(); velocity.yaw = velocity.pitch = velocity.roll = 0; } },
    state: () => ({ held: [...held].sort(), velocity: { ...velocity } }),
    dispose() { target.removeEventListener('keydown', onKeyDown); target.removeEventListener('keyup', onKeyUp); target.removeEventListener('blur', clear); },
  };
}
