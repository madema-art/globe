import * as THREE from 'three';
import commonGlsl from '../shaders/earth/common.glsl?raw';
import surfaceVert from '../shaders/earth/surface.vert?raw';
import surfaceFrag from '../shaders/earth/surface.frag?raw';
import cloudsFrag from '../shaders/earth/clouds.frag?raw';
import atmosphereVert from '../shaders/earth/atmosphere.vert?raw';
import atmosphereFrag from '../shaders/earth/atmosphere.frag?raw';
import { POLAR_RATIO, geodeticToNormal, geodeticToPosition, positionToGeodetic, subsolarPoint } from '../geography/coordinates.js';
import { createGlobeControls } from './globe-controls.js';
import { createGamepadNavigation } from './gamepad-navigation.js';
import { chooseTier, disposeEarthTier, earthAssetBase, loadEarthManifest, loadEarthTier } from './assets.js';
import { createOverlayManager } from './overlays/overlay-manager.js';
import { createPolylineLayer } from './overlays/polyline-layer.js';

THREE.ShaderChunk.common_earth = commonGlsl;

const CLOUD_HEIGHT = 0.0045;      // shell height (~29 km; exaggerated so parallax and shadows read at globe scale)
const ATMOSPHERE_TOP = 0.028;     // shell thickness in equatorial radii
const STUDIO_SUN = new THREE.Vector3(-0.62, 0.38, 0.69).normalize(); // camera space: upper left, in front

export const EARTH_LAYERS = ['clouds', 'atmosphere', 'nightLights', 'relief', 'ocean', 'realSun', 'borders', 'rivers'];

/**
 * The Earth visual system: renderer, layered globe, sun, interaction and geographic targeting.
 * @param {HTMLCanvasElement} canvas
 */
export function createEarthView(canvas, { onStatus = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 10);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const layers = { clouds: true, atmosphere: true, nightLights: true, relief: true, ocean: true, realSun: false, borders: true, rivers: true };
  const sunDir = new THREE.Vector3(1, 0, 0);
  const sunColor = new THREE.Color(1.0, 0.97, 0.92).multiplyScalar(1.9);
  const blank = new THREE.DataTexture(new Uint8Array([0, 128, 128, 255]), 1, 1);
  blank.needsUpdate = true;

  const shared = {
    uPolarRatio: { value: POLAR_RATIO },
    uSunDir: { value: sunDir },
    uSunColor: { value: sunColor },
    uExposure: { value: 1.0 },
    uCloudOffset: { value: 0 },
    uCloudRange: { value: new THREE.Vector2(0.22, 0.88) },
    uClouds: { value: 1 },
    uAtmos: { value: blank },
  };

  // The ellipsoid: unit equatorial radius, WGS84 polar ratio. Geometry stays a plain UV sphere so future terrain
  // or tiled meshes can replace it; texturing is computed per fragment from the Earth-fixed position.
  const surfaceGeometry = new THREE.SphereGeometry(1, 256, 128);
  surfaceGeometry.scale(1, POLAR_RATIO, 1);
  const surfaceMaterial = new THREE.ShaderMaterial({
    vertexShader: surfaceVert,
    fragmentShader: surfaceFrag,
    uniforms: {
      ...shared,
      uDay: { value: blank }, uSurface: { value: blank },
      uSlopeMax: { value: 0.12 }, uRelief: { value: 9 }, uOcean: { value: 1 }, uNightLights: { value: 1 },
      uCloudShadow: { value: 0.55 }, uCloudHeight: { value: CLOUD_HEIGHT },
    },
  });
  const earth = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
  earth.name = 'earth-surface';

  const cloudGeometry = new THREE.SphereGeometry(1 + CLOUD_HEIGHT, 192, 96);
  cloudGeometry.scale(1, POLAR_RATIO, 1);
  const cloudMaterial = new THREE.ShaderMaterial({
    vertexShader: surfaceVert, fragmentShader: cloudsFrag, uniforms: shared, transparent: true, depthWrite: false,
  });
  const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
  clouds.renderOrder = 1;

  const atmosphereMaterial = new THREE.ShaderMaterial({
    vertexShader: atmosphereVert,
    fragmentShader: atmosphereFrag,
    uniforms: {
      uSunDir: shared.uSunDir, uSunColor: shared.uSunColor, uExposure: shared.uExposure,
      uPlanetRadius: { value: 1.0 }, uAtmosphereRadius: { value: 1 + ATMOSPHERE_TOP }, uIntensity: { value: 1.25 },
    },
    side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false,
    // Add light to colour, never change destination alpha (keeps the transparent canvas compositing correct).
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1 + ATMOSPHERE_TOP, 96, 48), atmosphereMaterial);
  atmosphere.renderOrder = 2;

  // Target marker: a ring lying on the surface, scaled to stay a constant on-screen size.
  const marker = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: 0xfff6d6, depthWrite: false, side: THREE.DoubleSide }));
  ring.material.toneMapped = dot.material.toneMapped = false;
  marker.add(ring, dot);
  marker.visible = false;
  marker.renderOrder = 3;

  const globe = new THREE.Group();
  globe.add(earth, clouds, atmosphere, marker);
  globe.visible = false;
  scene.add(globe);
  const overlays = createOverlayManager({ parent: globe, onChange: () => { needsRender = true; } });
  const OVERLAY_GROUPS = { borders: ['borders'], rivers: ['rivers-major', 'rivers-regional'] };

  const controls = createGlobeControls(camera, canvas, {
    altitude: 3.3, lat: 8, lon: 25, reduceMotion: () => reduceMotion.matches,
    onHover: (event) => { hover = { x: event.clientX, y: event.clientY }; },
  });

  // Presentations: 'title' (backdrop), 'explore' (development/inspection, dev markers allowed),
  // 'mystery' (gameplay: interactive, reticle, never a marker unless the host reveals an answer).
  let mode = 'title';
  const gamepad = createGamepadNavigation(controls, { isEnabled: () => controls.enabled });
  let gamepadSnapshot = null;
  const reticle = document.createElement('div');
  reticle.className = 'globe-reticle';
  reticle.setAttribute('aria-hidden', 'true');
  reticle.hidden = true;
  canvas.after(reticle);
  let frame = 1;            // 1 = title framing (globe to the right), 0 = centred explore framing
  let width = 1, height = 1;
  let needsRender = true;
  let sinceRender = 0;
  let hover = null;
  let hoverGeo = null;
  let target = null;
  let assets = null;
  let manifest = null;
  let elapsed = 0;
  let fps = { frames: 0, time: 0, value: 0 };
  const tmp = new THREE.Vector3();

  function resize() {
    width = innerWidth;
    height = innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    applyFrame();
    needsRender = true;
  }

  function applyFrame() {
    // Title framing: landscape puts the globe right of the text (like the original title art);
    // portrait lowers it so it rises behind the footer like a horizon instead of covering the headline.
    const portrait = width < height;
    const shiftX = portrait ? 0 : (width > 800 ? 0.2 : 0.12) * width * frame;
    const shiftY = portrait ? 0.5 * height * frame : 0;
    camera.setViewOffset(width, height, -shiftX, -shiftY, width, height);
    camera.updateProjectionMatrix();
  }

  /** Altitude giving the same apparent globe size on narrow (portrait) screens as on landscape ones. */
  function fitAltitude(landscapeAltitude) {
    const aspect = width / height;
    return aspect >= 1 ? landscapeAltitude : Math.min(6, (1 + landscapeAltitude) / Math.max(aspect, 0.4) - 1);
  }

  function updateSun() {
    if (layers.realSun) {
      const s = subsolarPoint(new Date());
      const n = geodeticToNormal(s.lat, s.lon);
      sunDir.set(n.x, n.y, n.z);
    } else {
      sunDir.copy(STUDIO_SUN).applyQuaternion(camera.quaternion).normalize();
    }
  }

  function setLayer(name, on) {
    if (!(name in layers)) return;
    layers[name] = Boolean(on);
    clouds.visible = layers.clouds;
    atmosphere.visible = layers.atmosphere;
    shared.uClouds.value = layers.clouds ? 1 : 0;
    surfaceMaterial.uniforms.uNightLights.value = layers.nightLights ? 1 : 0;
    surfaceMaterial.uniforms.uRelief.value = layers.relief ? 9 : 0;
    surfaceMaterial.uniforms.uOcean.value = layers.ocean ? 1 : 0;
    for (const [layer, ids] of Object.entries(OVERLAY_GROUPS)) for (const id of ids) overlays.setEnabled(id, layers[layer]);
    needsRender = true;
  }

  function applyTier(set) {
    const previous = assets;
    assets = set;
    surfaceMaterial.uniforms.uDay.value = set.textures.day;
    surfaceMaterial.uniforms.uSurface.value = set.textures.surface;
    shared.uAtmos.value = set.textures.atmos;
    surfaceMaterial.uniforms.uSlopeMax.value = manifest.channels.surface.slopeMax;
    globe.visible = true;
    needsRender = true;
    disposeEarthTier(previous);
  }

  async function load() {
    manifest = await loadEarthManifest();
    const tier = chooseTier(manifest, renderer);
    // Progressive: a small tier appears quickly, then the chosen tier replaces it.
    if (tier !== 'low') applyTier(await loadEarthTier(manifest, 'low', renderer));
    onStatus({ loading: true, tier: 'low' });
    applyTier(await loadEarthTier(manifest, tier, renderer));
    onStatus({ loading: false, tier });
    loadOverlays().catch((error) => console.warn('Earth overlays unavailable', error));
    return tier;
  }

  async function loadOverlays(base = earthAssetBase()) {
    const response = await fetch(`${base}overlays.json`);
    if (!response.ok) throw new Error(`overlays.json ${response.status}`);
    const index = await response.json();
    const fetchBuffer = async (layer) => (await fetch(base + layer.url)).arrayBuffer();
    const [borders, rivers] = await Promise.all([fetchBuffer(index.layers.borders), fetchBuffer(index.layers.rivers)]);
    // Level 2: borders (disputed/indefinite lines fainter) and famous rivers; level 3: regional rivers.
    overlays.add(createPolylineLayer({ id: 'borders', level: 'continental', buffer: borders, heightM: 2500, sunDir,
      classes: [{ color: 0xf4e7c5, alpha: 0.55 }, { color: 0xf4e7c5, alpha: 0.28 }] }));
    overlays.add(createPolylineLayer({ id: 'rivers-major', level: 'continental', buffer: rivers, heightM: 1500, sunDir,
      classes: [{ color: 0x9fd2ff, alpha: 0.7 }, { include: false }] }));
    overlays.add(createPolylineLayer({ id: 'rivers-regional', level: 'regional', buffer: rivers, heightM: 1500, sunDir,
      classes: [{ include: false }, { color: 0x9fd2ff, alpha: 0.5 }] }));
    for (const [layer, ids] of Object.entries(OVERLAY_GROUPS)) for (const id of ids) overlays.setEnabled(id, layers[layer]);
  }
  const ready = load();

  function setMode(next) {
    if (!['title', 'explore', 'mystery'].includes(next)) throw new RangeError(`Unknown Earth presentation ${next}`);
    const interactive = next !== 'title';
    mode = next;
    controls.enabled = interactive;
    canvas.classList.toggle('interactive', interactive);
    reticle.hidden = !interactive;
    gamepad.reset();
    if (next === 'explore') controls.zoomTo(controls.planetFitAltitude());
    else if (next === 'title') { clearTarget(); controls.zoomTo(fitAltitude(3.3)); }
    else clearTarget(); // mystery: the host calls resetToPlanetView() at the start of each mystery
    needsRender = true;
  }

  /** Geodetic point under the fixed centre reticle (where the player confirms), or null if it misses the globe. */
  function pickCenter() {
    const rect = canvas.getBoundingClientRect();
    const g = pickGeodetic(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return g && { lat: g.lat, lon: g.lon };
  }

  /**
   * Gameplay navigation (e.g. after an answer is revealed). Resolves when the flight ends or is cancelled.
   * Never marks the point unless `mark` is true.
   */
  function navigateTo(lat, lon, { signal, altitude = 0.9, mark = false, name = null } = {}) {
    if (mark) placeMarker(lat, lon, name); else clearTarget();
    needsRender = true;
    return controls.flyTo(lat, lon, { altitude, signal });
  }

  /** Start-of-mystery view: whole planet in frame, north up, no markers; keeps the current (neutral) centre. */
  function resetToPlanetView({ signal } = {}) {
    clearTarget();
    gamepad.reset();
    const c = viewCentre();
    needsRender = true;
    return controls.flyTo(Math.max(-60, Math.min(60, c.lat)), c.lon, { altitude: controls.planetFitAltitude(), signal, duration: reduceMotion.matches ? 0.01 : 1.2 });
  }

  /** Feed the host's per-frame navigator.getGamepads() snapshot (shared with other input consumers). */
  function pollGamepads(snapshot) { gamepadSnapshot = snapshot; }

  /** Smoothly orient the camera to a WGS84 coordinate and mark it. */
  function flyTo(lat, lon, { name = null, altitude = 0.9 } = {}) {
    // Development helper (explore panel): marks the destination. Gameplay uses navigateTo().
    if (mode === 'mystery') return navigateTo(lat, lon, { altitude });
    placeMarker(lat, lon, name);
    return controls.flyTo(lat, lon, { altitude });
  }

  function placeMarker(lat, lon, name) {
    target = { lat, lon, name };
    const p = geodeticToPosition(lat, lon, 0);
    const n = geodeticToNormal(lat, lon);
    marker.position.set(p.x, p.y, p.z).addScaledVector(tmp.set(n.x, n.y, n.z), 0.0008);
    marker.lookAt(tmp.set(p.x + n.x, p.y + n.y, p.z + n.z));
    marker.visible = true;
    needsRender = true;
  }

  /** Exact ray / WGS84-ellipsoid intersection under a client pixel (Earth-fixed render units), or null. */
  const pickRay = new THREE.Ray();
  const pickSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const pickNdc = new THREE.Vector2();
  function pickSurface(clientX, clientY, out = new THREE.Vector3()) {
    const rect = canvas.getBoundingClientRect();
    pickNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    pickRay.origin.setFromMatrixPosition(camera.matrixWorld);
    pickRay.direction.set(pickNdc.x, pickNdc.y, 0.5).unproject(camera).sub(pickRay.origin);
    // Scale y so the ellipsoid becomes the unit sphere, intersect, then scale back.
    pickRay.origin.y /= POLAR_RATIO;
    pickRay.direction.y /= POLAR_RATIO;
    pickRay.direction.normalize();
    if (!pickRay.intersectSphere(pickSphere, out)) return null;
    out.y *= POLAR_RATIO;
    return out;
  }

  /** Geodetic coordinate under a client pixel, or null when the pointer is off the globe. */
  function pickGeodetic(clientX, clientY) {
    const p = pickSurface(clientX, clientY);
    return p && positionToGeodetic(p.x, p.y, p.z);
  }

  function clearTarget() { target = null; marker.visible = false; needsRender = true; }

  function render(dt) {
    elapsed += dt;
    const targetFrame = mode === 'title' ? 1 : 0;
    if (Math.abs(frame - targetFrame) > 1e-3) {
      frame += (targetFrame - frame) * (1 - Math.exp(-dt * (reduceMotion.matches ? 60 : 4)));
      applyFrame();
      needsRender = true;
    } else if (frame !== targetFrame) { frame = targetFrame; applyFrame(); needsRender = true; }

    if (mode === 'title' && !reduceMotion.matches) controls.spin(-Math.min(dt, 0.1) * 0.035);
    // Integrate long frames (background tabs, test time-stepping) in small steps but draw once.
    const steps = Math.min(600, Math.max(1, Math.ceil(dt / 0.05)));
    for (let i = 0; i < steps; i++) {
      if (gamepadSnapshot && gamepad.update(dt / steps, gamepadSnapshot)) needsRender = true;
      if (controls.update(dt / steps)) needsRender = true;
    }

    if (overlays.update(controls.altitude, camera)) needsRender = true;
    if (layers.clouds && !reduceMotion.matches) shared.uCloudOffset.value = (elapsed * 0.00035) % 1; // slow eastward drift
    // Thin the clouds when close to the surface so the geography stays readable (and blur stays hidden).
    if (layers.clouds) shared.uClouds.value = THREE.MathUtils.lerp(0.35, 1, THREE.MathUtils.smoothstep(controls.altitude, 0.25, 1.2));
    if (marker.visible) {
      const scale = Math.max(0.004, camera.position.distanceTo(marker.position) * 0.018);
      const pulse = 1 + 0.12 * Math.sin(elapsed * 3.2);
      marker.scale.setScalar(scale * pulse);
      needsRender = true;
    }
    if (hover) {
      const point = pickSurface(hover.x, hover.y, tmp);
      hoverGeo = point ? positionToGeodetic(point.x, point.y, point.z) : null;
      hover = null;
    }

    // Demand rendering: draw on change; while idle only refresh at a low rate for drifting clouds.
    sinceRender += dt;
    const idleInterval = layers.clouds && !reduceMotion.matches ? 1 / 15 : Infinity;
    if (!needsRender && sinceRender < idleInterval) return false;
    updateSun();
    renderer.render(scene, camera);
    needsRender = false;
    sinceRender = 0;
    fps.frames++;
    fps.time += dt;
    if (fps.time > 1) { fps.value = fps.frames / fps.time; fps.frames = 0; fps.time = 0; }
    return true;
  }

  function viewCentre() {
    // Where the camera's axis (camera -> Earth centre) meets the WGS84 ellipsoid.
    const d = tmp.copy(camera.position).normalize();
    const t = 1 / Math.sqrt(d.x * d.x + d.z * d.z + (d.y * d.y) / (POLAR_RATIO * POLAR_RATIO));
    return positionToGeodetic(d.x * t, d.y * t, d.z * t);
  }

  function state() {
    const center = viewCentre();
    return {
      mode, tier: assets?.tier ?? null, loaded: Boolean(assets), layers: { ...layers },
      camera: { lat: +center.lat.toFixed(3), lon: +center.lon.toFixed(3), altitude: +controls.altitude.toFixed(3) },
      target, hover: hoverGeo && { lat: +hoverGeo.lat.toFixed(3), lon: +hoverGeo.lon.toFixed(3) },
      roll: +controls.rollFromNorth().toFixed(4), rollHeld: controls.rollHeld, leveling: controls.leveling.mode,
      reticle: !reticle.hidden, gamepad: gamepad.state(), overlays: overlays.state(),
      renderedFps: +fps.value.toFixed(1), drawCalls: renderer.info.render.calls,
      gpuTextureMB: assets ? Math.round(assets.bytesGpu / 1048576) : 0,
    };
  }

  window.addEventListener('resize', resize);
  resize();
  controls.altitude = fitAltitude(3.3);
  setLayer('clouds', true);

  return {
    ready, render, setMode, setLayer, flyTo, clearTarget, state, controls, pickSurface, pickGeodetic,
    pickCenter, navigateTo, resetToPlanetView, pollGamepads, gamepad, overlays,
    get mode() { return mode; },
    get layers() { return { ...layers }; },
    get hoverGeo() { return hoverGeo; },
    invalidate() { needsRender = true; },
    dispose() {
      window.removeEventListener('resize', resize);
      controls.dispose();
      reticle.remove();
      disposeEarthTier(assets);
      overlays.dispose();
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      renderer.dispose();
    },
  };
}
