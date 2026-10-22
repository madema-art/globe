import * as THREE from 'three';
import { geodeticToPosition } from '../geography/coordinates.js';

// Direct-manipulation globe camera. The Earth stays fixed in its Earth-fixed frame; the camera orbits it.
// - Drag: the geographic point under the pointer stays under the pointer (quaternion trackball, no gimbal lock).
// - Release: rotational inertia with exponential decay.
// - Wheel / pinch: smooth logarithmic altitude change that keeps the point under the cursor fixed.
// - Idle: gentle north-up levelling, weighted away near the poles so polar views remain possible. It never
//   fights the player: it is suspended after any deliberate roll (until "north up" is requested), ignores
//   large roll offsets (e.g. after rotating over a pole) and can be switched off (`leveling.mode = 'off'`).
// - rotateInView(yaw, pitch, roll): camera-space three-axis rotation used by the gamepad and keyboard.
// - flyTo(lat, lon): eased great-circle flight with a zoom-out arc; returns a Promise and honours AbortSignal.

const Y = new THREE.Vector3(0, 1, 0);

export function createGlobeControls(camera, element, options = {}) {
  const minAltitude = options.minAltitude ?? 0.2;   // Earth radii above the surface
  const maxAltitude = options.maxAltitude ?? 6;
  const reduceMotion = options.reduceMotion ?? (() => false);

  const orientation = new THREE.Quaternion();
  let altitude = options.altitude ?? 2.2;
  let targetAltitude = altitude;
  const angularVelocity = new THREE.Vector3(); // axis * rad/s, world frame
  let enabled = false;
  let dragging = null; // { id, x, y, time }
  const pointers = new Map();
  let pinchDistance = 0;
  let zoomAnchor = null; // { ndc: Vector2, world: Vector3 }
  let flight = null;
  let changed = true;
  let lastInteraction = -Infinity;
  let rollHeld = false;          // a deliberate roll suspends levelling until north-up is requested
  let northRequest = false;      // animate back to north-up (key N / right-stick click / API)
  const leveling = { mode: options.leveling ?? 'auto', rate: 2.2, maxOffset: Math.PI / 4 };

  // Scratch objects (no allocation in the frame loop).
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
  const q = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const m = new THREE.Matrix4();

  function applyCamera() {
    camera.position.set(0, 0, 1 + altitude).applyQuaternion(orientation);
    camera.quaternion.copy(orientation);
    camera.near = Math.max(0.002, altitude * 0.25);
    camera.far = 1 + altitude + 2;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  function toNdc(clientX, clientY, out) {
    const rect = element.getBoundingClientRect();
    return out.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  }

  /** Point on the unit sphere under an NDC position. Off-globe positions map onto the nearest limb point. */
  function hit(ndcPoint, out) {
    raycaster.setFromCamera(ndcPoint, camera);
    if (raycaster.ray.intersectSphere(sphere, out)) return out.normalize();
    raycaster.ray.closestPointToPoint(sphere.center, out);
    return out.normalize();
  }

  /** Rotate the camera so that Earth point `from` appears where `to` currently is. */
  function rotateBetween(from, to) {
    q.setFromUnitVectors(to, from);
    orientation.premultiply(q).normalize();
    applyCamera();
  }

  function levelNorth(dt) {
    // Remove camera roll relative to geographic north, fading out near the poles.
    a.set(0, 0, 1).applyQuaternion(orientation); // view axis (from Earth centre toward camera)
    const weight = 1 - Math.abs(a.y) ** 4;
    b.copy(Y).addScaledVector(a, -a.y); // north projected onto the view plane
    if (b.lengthSq() < 1e-6 || weight <= 0) return;
    b.normalize();
    c.set(0, 1, 0).applyQuaternion(orientation); // camera up
    const angle = Math.atan2(d.crossVectors(c, b).dot(a), c.dot(b));
    if (Math.abs(angle) < 1e-4) { northRequest = false; return; }
    // Automatic levelling only trims small drift; an explicit north-up request may turn any amount.
    if (!northRequest && Math.abs(angle) > leveling.maxOffset) return;
    const rate = northRequest ? 5 : leveling.rate * weight;
    q.setFromAxisAngle(a, angle * Math.min(1, dt * rate));
    orientation.premultiply(q).normalize();
    changed = true;
  }

  function cancelFlight(reason = 'interrupted') {
    if (!flight) return;
    const done = flight.resolve;
    flight.signal?.removeEventListener('abort', flight.onAbort);
    flight = null;
    done({ completed: false, reason });
  }

  /**
   * Camera-space rotation with "the planet follows the input" semantics (same as dragging):
   * yaw > 0 moves the surface right, pitch > 0 moves it down, roll > 0 twists the globe clockwise on screen.
   */
  function rotateInView(yaw, pitch, roll) {
    // Rotation vector in camera axes: -pitch about right (x), -yaw about up (y), +roll about the view axis (z).
    a.set(-pitch, -yaw, roll).applyQuaternion(orientation);
    const angle = a.length();
    if (angle < 1e-9) return;
    q.setFromAxisAngle(a.divideScalar(angle), angle);
    orientation.premultiply(q).normalize();
    changed = true;
  }

  function noteInput({ roll = false } = {}) {
    cancelFlight();
    zoomAnchor = null;
    angularVelocity.set(0, 0, 0);
    lastInteraction = performance.now();
    if (roll) { rollHeld = true; northRequest = false; }
  }

  function onPointerDown(event) {
    if (!enabled || (event.button !== undefined && event.button > 0)) return;
    element.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    cancelFlight();
    zoomAnchor = null;
    angularVelocity.set(0, 0, 0);
    if (pointers.size === 1) dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
    else { dragging = null; pinchDistance = pinchSpan(); }
    element.classList.add('grabbing');
    lastInteraction = performance.now();
    event.preventDefault();
  }

  function pinchSpan() {
    const [p1, p2] = [...pointers.values()];
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }

  function onPointerMove(event) {
    if (options.onHover && !dragging && pointers.size === 0) options.onHover(event);
    if (!enabled || !pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const span = pinchSpan();
      if (pinchDistance > 0) zoomBy(Math.log(pinchDistance / span) * 1.6);
      pinchDistance = span;
      return;
    }
    if (!dragging || dragging.id !== event.pointerId) return;
    const now = performance.now();
    hit(toNdc(dragging.x, dragging.y, ndc), a);
    hit(toNdc(event.clientX, event.clientY, ndc), b);
    const angle = a.angleTo(b);
    if (angle > 1e-6) {
      rotateBetween(a, b);
      // Track angular velocity for inertia (smoothed). Axis of the applied rotation in world frame.
      const dt = Math.max(1, now - dragging.time) / 1000;
      c.crossVectors(b, a).normalize().multiplyScalar(angle / dt);
      angularVelocity.lerp(c, 0.5);
      changed = true;
    }
    dragging.x = event.clientX;
    dragging.y = event.clientY;
    dragging.time = now;
    lastInteraction = now;
  }

  function onPointerUp(event) {
    pointers.delete(event.pointerId);
    if (dragging?.id === event.pointerId) {
      if (performance.now() - dragging.time > 60 || reduceMotion()) angularVelocity.set(0, 0, 0);
      dragging = null;
    }
    if (pointers.size < 2) pinchDistance = 0;
    if (pointers.size === 0) element.classList.remove('grabbing');
  }

  function zoomBy(logDelta) {
    targetAltitude = THREE.MathUtils.clamp(targetAltitude * Math.exp(logDelta), minAltitude, maxAltitude);
    changed = true;
  }

  function onWheel(event) {
    if (!enabled) return;
    event.preventDefault();
    cancelFlight();
    const scale = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
    zoomBy(THREE.MathUtils.clamp(event.deltaY * scale, -400, 400) * 0.0016);
    const anchorNdc = toNdc(event.clientX, event.clientY, new THREE.Vector2());
    raycaster.setFromCamera(anchorNdc, camera);
    const world = new THREE.Vector3();
    zoomAnchor = raycaster.ray.intersectSphere(sphere, world) ? { ndc: anchorNdc, world: world.normalize() } : null;
    lastInteraction = performance.now();
  }

  function onKeyDown(event) {
    if (!enabled || event.target.closest?.('input, select, textarea')) return;
    const step = 0.06 * Math.min(1, altitude);
    const keys = { ArrowLeft: [0, -step], ArrowRight: [0, step], ArrowUp: [-step, 0], ArrowDown: [step, 0] };
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.code === 'KeyQ' || event.code === 'KeyE') {
      noteInput({ roll: true });
      rotateInView(0, 0, event.code === 'KeyE' ? 0.08 : -0.08);
      event.preventDefault();
    } else if (event.code === 'KeyN') {
      requestNorthUp();
    } else if (keys[event.key]) {
      cancelFlight();
      const [pitch, yaw] = keys[event.key];
      q.setFromAxisAngle(a.set(0, 1, 0).applyQuaternion(orientation), yaw);
      q2.setFromAxisAngle(b.set(1, 0, 0).applyQuaternion(orientation), pitch);
      orientation.premultiply(q).premultiply(q2).normalize();
      changed = true;
      event.preventDefault();
    } else if (event.key === '+' || event.key === '=') { zoomBy(-0.25); zoomAnchor = null; }
    else if (event.key === '-' || event.key === '_') { zoomBy(0.25); zoomAnchor = null; }
  }

  element.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  element.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);

  /** Orientation whose view axis passes through the WGS84 surface point at (lat, lon), north up. */
  function orientationFor(lat, lon, out) {
    const p = geodeticToPosition(lat, lon, 0);
    c.set(p.x, p.y, p.z).normalize();  // camera +Z (Earth centre -> camera), geocentric so the point is exactly centred
    a.crossVectors(Y, c);               // east
    if (a.lengthSq() < 1e-8) a.set(0, 0, lat > 0 ? -1 : 1); // looking at a pole
    a.normalize();
    b.crossVectors(c, a);               // north / up
    m.makeBasis(a, b, c);
    return out.setFromRotationMatrix(m);
  }

  function requestNorthUp() { rollHeld = false; northRequest = true; lastInteraction = -Infinity; changed = true; }

  /** Altitude at which the whole planet (with a margin) fits the narrower field of view. */
  function planetFitAltitude(margin = 0.82) {
    const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
    return THREE.MathUtils.clamp(1 / Math.sin(Math.min(halfV, halfH) * margin) - 1, minAltitude, maxAltitude);
  }

  /**
   * Eased flight that centres (lat, lon). Resolves { completed: true } on arrival, or
   * { completed: false, reason: 'interrupted' | 'aborted' | 'superseded' } if player input, the signal or another flight stops it.
   */
  function flyTo(lat, lon, { altitude: endAltitude = Math.min(altitude, 1.2), duration, signal } = {}) {
    cancelFlight('superseded');
    if (signal?.aborted) return Promise.resolve({ completed: false, reason: 'aborted' });
    const start = orientation.clone();
    const end = orientationFor(lat, lon, new THREE.Quaternion());
    const angle = start.angleTo(end);
    const seconds = reduceMotion() ? 0.01 : duration ?? THREE.MathUtils.clamp(0.9 + angle * 0.75, 1.1, 3.2);
    angularVelocity.set(0, 0, 0);
    zoomAnchor = null;
    rollHeld = false;
    northRequest = false;
    changed = true;
    return new Promise((resolve) => {
      flight = { start, end, startAltitude: altitude, endAltitude: THREE.MathUtils.clamp(endAltitude, minAltitude, maxAltitude), arc: Math.min(1.2, angle * 0.45), t: 0, seconds, resolve, signal };
      if (signal) {
        flight.onAbort = () => cancelFlight('aborted');
        signal.addEventListener('abort', flight.onAbort, { once: true });
      }
    });
  }

  function update(dt) {
    dt = Math.min(dt, 0.1);
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.seconds);
      const e = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2; // easeInOutCubic
      orientation.slerpQuaternions(flight.start, flight.end, e);
      const base = Math.exp(THREE.MathUtils.lerp(Math.log(flight.startAltitude), Math.log(flight.endAltitude), e));
      altitude = targetAltitude = base + Math.sin(Math.PI * e) * flight.arc;
      if (flight.t >= 1) {
        const done = flight.resolve;
        flight.signal?.removeEventListener('abort', flight.onAbort);
        flight = null;
        done({ completed: true });
      }
      changed = true;
    } else {
      if (!dragging && angularVelocity.lengthSq() > 1e-8) {
        const speed = angularVelocity.length();
        q.setFromAxisAngle(a.copy(angularVelocity).divideScalar(speed), speed * dt);
        orientation.premultiply(q).normalize();
        angularVelocity.multiplyScalar(Math.exp(-dt / 0.45));
        if (speed < 0.002) angularVelocity.set(0, 0, 0);
        changed = true;
      }
      if (Math.abs(Math.log(targetAltitude / altitude)) > 1e-4) {
        altitude = Math.exp(THREE.MathUtils.lerp(Math.log(altitude), Math.log(targetAltitude), 1 - Math.exp(-dt * 9)));
        changed = true;
        if (zoomAnchor) {
          applyCamera();
          hit(zoomAnchor.ndc, b);
          if (b.angleTo(zoomAnchor.world) > 1e-7) rotateBetween(zoomAnchor.world, b);
        }
      } else {
        altitude = targetAltitude;
        zoomAnchor = null;
      }
      const idle = !dragging && pointers.size === 0 && performance.now() - lastInteraction > 400;
      if (northRequest || (idle && leveling.mode === 'auto' && !rollHeld)) levelNorth(dt);
    }
    if (changed) applyCamera();
    const result = changed;
    changed = false;
    return result;
  }

  orientationFor(options.lat ?? 10, options.lon ?? 20, orientation);
  applyCamera();

  return {
    update,
    flyTo,
    orientationFor,
    rotateInView,
    noteInput,
    zoomBy(logDelta) { zoomAnchor = null; zoomBy(logDelta); },
    requestNorthUp,
    planetFitAltitude,
    /** Levelling policy: { mode: 'auto' | 'off', rate (1/s), maxOffset (radians of roll still auto-corrected) }. */
    leveling,
    get rollHeld() { return rollHeld; },
    get minAltitude() { return minAltitude; },
    get maxAltitude() { return maxAltitude; },
    get altitude() { return altitude; },
    set altitude(value) { altitude = targetAltitude = THREE.MathUtils.clamp(value, minAltitude, maxAltitude); changed = true; },
    get orientation() { return orientation; },
    get dragging() { return Boolean(dragging) || pointers.size > 0; },
    get flying() { return Boolean(flight); },
    get enabled() { return enabled; },
    set enabled(value) { enabled = value; if (!value) { dragging = null; pointers.clear(); angularVelocity.set(0, 0, 0); element.classList.remove('grabbing'); } },
    /** Mouse-drag-induced roll is still trimmed automatically; this reports the current roll from north in radians. */
    rollFromNorth() {
      a.set(0, 0, 1).applyQuaternion(orientation);
      b.copy(Y).addScaledVector(a, -a.y);
      if (b.lengthSq() < 1e-8) return 0;
      b.normalize();
      c.set(0, 1, 0).applyQuaternion(orientation);
      return Math.atan2(d.crossVectors(c, b).dot(a), c.dot(b));
    },
    /** Smoothly change altitude (Earth radii above the surface). */
    zoomTo(value) { targetAltitude = THREE.MathUtils.clamp(value, minAltitude, maxAltitude); zoomAnchor = null; changed = true; },
    /** Spin about the north axis (title backdrop). */
    spin(radians) { q.setFromAxisAngle(Y, radians); orientation.premultiply(q).normalize(); changed = true; },
    hit(clientX, clientY, out = new THREE.Vector3()) {
      raycaster.setFromCamera(toNdc(clientX, clientY, ndc), camera);
      return raycaster.ray.intersectSphere(sphere, out) ? out : null;
    },
    dispose() {
      element.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      element.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
