// Gamepad globe navigation (Earth-owned: rotation and zoom only).
//
// The host polls navigator.getGamepads() ONCE per frame and passes the same snapshot here and to the
// education engine's confirmation input, so both share one controller without competing listeners.
// This module never reads face buttons for gameplay (X / A / B belong to Codex's education engine);
// its only button use is an optional Earth camera action (north-up on right-stick click).
//
// Default mapping (browser "standard" layout, Xbox-style labels):
//   Left stick  X: rotate east/west     Y: rotate north/south     (the surface follows the stick, like dragging)
//   Right stick X: roll / twist about the view axis               Y: fine north/south adjustment
//   RT: analog zoom in    LT: analog zoom out    Right-stick click: north up
// All of it is data (`bindings`, `settings`) so it can be retuned after hands-on testing.

export const DEFAULT_GAMEPAD_BINDINGS = Object.freeze({
  mapping: 'standard',
  yaw: { axis: 0, invert: false },
  pitch: { axis: 1, invert: false },
  roll: { axis: 2, invert: false },
  finePitch: { axis: 3, invert: false },
  zoomIn: { button: 7 },
  zoomOut: { button: 6 },
  northUp: { button: 11 },
});

export const DEFAULT_GAMEPAD_SETTINGS = Object.freeze({
  stickDeadZone: 0.16,      // radial, rescaled so motion starts smoothly at the edge of the dead zone
  triggerDeadZone: 0.06,
  responseExponent: 1.7,    // >1 gives fine control near the centre, full speed at the rim
  rotationSpeed: 1.25,      // rad/s at full deflection when the whole planet is in view
  fineScale: 0.3,           // right-stick vertical relative to the left stick
  rollSpeed: 1.6,           // rad/s at full deflection
  zoomSpeed: 1.5,           // natural-log altitude change per second at full trigger
  sensitivity: 1,           // overall multiplier for rotation
  accelerationTime: 0.09,   // seconds to approach the commanded speed
  releaseTime: 0.14,        // seconds of glide after release (stops completely, no drift)
  precisionAltitude: 2.9,   // rotation speed scales with altitude below this for precision near the surface
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Radial dead zone + response curve for a stick. Returns [x, y] in [-1, 1]. */
export function shapeStick(x, y, deadZone, exponent) {
  const magnitude = Math.hypot(x, y);
  if (!(magnitude > deadZone)) return [0, 0];
  const scaled = Math.min(1, (magnitude - deadZone) / (1 - deadZone));
  const shaped = scaled ** exponent / magnitude;
  return [x * shaped, y * shaped];
}

/** Dead zone + response curve for a single axis or trigger value in [0, 1] or [-1, 1]. */
export function shapeAxis(value, deadZone, exponent) {
  const magnitude = Math.abs(value);
  if (!(magnitude > deadZone)) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - deadZone) / (1 - deadZone)) ** exponent;
}

export function createGamepadNavigation(controls, { bindings = DEFAULT_GAMEPAD_BINDINGS, settings = DEFAULT_GAMEPAD_SETTINGS, isEnabled = () => true } = {}) {
  let map = structuredClone(bindings);
  const tune = { ...settings };
  const velocity = { yaw: 0, pitch: 0, roll: 0 }; // smoothed rates (rad/s)
  const input = { yaw: 0, pitch: 0, roll: 0, zoom: 0 };
  let active = null;        // `${index}:${id}` of the pad currently driving the globe
  const buttonsHeld = new Map();
  let connected = [];

  const axis = (pad, binding) => {
    const v = pad.axes?.[binding.axis] ?? 0;
    return Number.isFinite(v) ? (binding.invert ? -v : v) : 0;
  };
  const button = (pad, binding) => {
    const b = pad.buttons?.[binding.button];
    const v = typeof b === 'object' ? b?.value ?? (b?.pressed ? 1 : 0) : 0;
    return Number.isFinite(v) ? v : 0;
  };

  function read(pad) {
    const [yaw, pitch] = shapeStick(axis(pad, map.yaw), axis(pad, map.pitch), tune.stickDeadZone, tune.responseExponent);
    const [roll, fine] = shapeStick(axis(pad, map.roll), axis(pad, map.finePitch), tune.stickDeadZone, tune.responseExponent);
    const zoom = shapeAxis(button(pad, map.zoomIn), tune.triggerDeadZone, 1.4) - shapeAxis(button(pad, map.zoomOut), tune.triggerDeadZone, 1.4);
    return { yaw, pitch: pitch + fine * tune.fineScale, roll, zoom };
  }

  /**
   * @param {number} dt seconds since the previous frame
   * @param {ArrayLike<Gamepad|null>} gamepads the host's snapshot from navigator.getGamepads()
   * @returns {boolean} true while the gamepad is moving the camera
   */
  function update(dt, gamepads) {
    dt = clamp(dt, 0, 0.1);
    const pads = [];
    for (const pad of gamepads || []) if (pad && pad.connected !== false && pad.mapping === map.mapping) pads.push(pad);
    connected = pads.map((pad) => ({ index: pad.index, id: pad.id }));
    const keys = new Set(pads.map((pad) => `${pad.index}:${pad.id}`));
    for (const key of buttonsHeld.keys()) if (!keys.has(key)) buttonsHeld.delete(key);
    if (active && !keys.has(active)) active = null; // disconnected: commanded input drops to zero below

    input.yaw = input.pitch = input.roll = input.zoom = 0;
    for (const pad of pads) {
      const key = `${pad.index}:${pad.id}`;
      const r = read(pad);
      const moving = r.yaw || r.pitch || r.roll || r.zoom;
      if (moving && (!active || active === key)) active = key;
      if (key === active) Object.assign(input, r);
      // North-up on a fresh press only; a button already held when the pad (re)connects must be released first.
      const north = button(pad, map.northUp) > 0.5;
      const previous = buttonsHeld.get(key);
      buttonsHeld.set(key, north);
      if (previous === false && north && isEnabled()) controls.requestNorthUp();
    }
    if (!isEnabled()) input.yaw = input.pitch = input.roll = input.zoom = 0;

    // Precision: angular speed shrinks with altitude so the surface crosses the screen at a similar rate.
    const precision = clamp(controls.altitude / tune.precisionAltitude, 0.05, 1.3);
    const speed = tune.rotationSpeed * tune.sensitivity * precision;
    const target = { yaw: input.yaw * speed, pitch: input.pitch * speed, roll: input.roll * tune.rollSpeed * tune.sensitivity };
    let moving = false;
    const maxRate = { yaw: speed, pitch: speed, roll: tune.rollSpeed * tune.sensitivity };
    for (const k of ['yaw', 'pitch', 'roll']) {
      const tau = target[k] !== 0 ? tune.accelerationTime : tune.releaseTime;
      velocity[k] += (target[k] - velocity[k]) * (1 - Math.exp(-dt / Math.max(tau, 1e-3)));
      // Hard stop once the glide falls below 3% of full speed: a short, clean stop with no residual drift.
      if (target[k] === 0 && Math.abs(velocity[k]) < 0.03 * maxRate[k]) velocity[k] = 0;
      if (velocity[k] !== 0) moving = true;
    }
    if (moving) {
      if (input.yaw || input.pitch || input.roll) controls.noteInput({ roll: input.roll !== 0 });
      controls.rotateInView(velocity.yaw * dt, velocity.pitch * dt, velocity.roll * dt);
    }
    if (input.zoom) {
      controls.noteInput();
      controls.zoomBy(-input.zoom * tune.zoomSpeed * dt);
      moving = true;
    }
    return moving;
  }

  return {
    update,
    get bindings() { return structuredClone(map); },
    /** Replace bindings (e.g. swap sticks, invert an axis, use another trigger); validated minimally. */
    configure(next) {
      for (const key of ['yaw', 'pitch', 'roll', 'finePitch']) if (!Number.isInteger(next[key]?.axis)) throw new TypeError(`Binding ${key} needs an axis index.`);
      for (const key of ['zoomIn', 'zoomOut']) if (!Number.isInteger(next[key]?.button)) throw new TypeError(`Binding ${key} needs a button index.`);
      map = structuredClone(next);
      buttonsHeld.clear();
    },
    settings: tune,
    state() {
      return { connected, active, input: { ...input }, velocity: { ...velocity } };
    },
    reset() { velocity.yaw = velocity.pitch = velocity.roll = 0; active = null; buttonsHeld.clear(); },
  };
}
