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
import { createKeyboardNavigation } from './keyboard-navigation.js';
import { chooseTier, disposeEarthTier, earthAssetBase, loadEarthManifest, loadEarthTier } from './assets.js';
import { createOverlayManager } from './overlays/overlay-manager.js';
import { createPolylineLayer } from './overlays/polyline-layer.js';
import { createLabelContext, createLabelLayer } from './overlays/label-layer.js';
import { createLandmarkLayer } from './landmarks/landmark-layer.js';
import landmarkRegistry from '../../assets/data/processed/landmarks.json';

THREE.ShaderChunk.common_earth = commonGlsl;

const CLOUD_HEIGHT = 0.0045;      // shell height (~29 km; exaggerated so parallax and shadows read at globe scale)
const ATMOSPHERE_TOP = 0.028;     // shell thickness in equatorial radii
const STUDIO_SUN = new THREE.Vector3(-0.62, 0.38, 0.69).normalize(); // camera space: upper left, in front

export const EARTH_LAYERS = ['clouds', 'atmosphere', 'nightLights', 'relief', 'ocean', 'realSun', 'borders', 'rivers', 'labels', 'landmarks'];

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

  // Clouds are off by default for now (owner request, 2026-10-28); Explore's developer panel can still turn them on.
  const layers = { clouds: false, atmosphere: true, nightLights: true, relief: true, ocean: true, realSun: false, borders: true, rivers: true, labels: true, landmarks: true };
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
      uStrategy: { value: 0 }, uTerritory: { value: blank }, uObserverCount: { value: 0 },
      uObservers: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
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
  // Answer/target marker in instrument brass; the player's own selection is a plain ivory ring.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 64), new THREE.MeshBasicMaterial({ color: 0xe2c17f, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshBasicMaterial({ color: 0xece4cf, depthWrite: false, side: THREE.DoubleSide }));
  ring.material.toneMapped = dot.material.toneMapped = false;
  marker.add(ring, dot);
  marker.visible = false;
  marker.renderOrder = 3;
  const selectionMarker = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0xece4cf, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  selectionMarker.visible = false;
  selectionMarker.renderOrder = 3;

  const globe = new THREE.Group();
  globe.add(earth, clouds, atmosphere, marker, selectionMarker);
  globe.visible = false;
  scene.add(globe);
  const overlays = createOverlayManager({ parent: globe, onChange: () => { needsRender = true; } });
  // Lights for physically lit overlays (landmark miniatures); they share the Earth's sun direction.
  const sunLight = new THREE.DirectionalLight(0xfff4e6, 2.6);
  const skyLight = new THREE.HemisphereLight(0x9fb8d6, 0x2a2420, 0.35);
  scene.add(sunLight, sunLight.target, skyLight);
  const OVERLAY_GROUPS = { borders: ['borders'], rivers: ['rivers-major', 'rivers-regional'], labels: ['labels-continental', 'labels-regional'], landmarks: ['landmarks'] };
  let labelPolicy = 'all';
  const labelRoot = document.createElement('div');
  labelRoot.className = 'atlas-labels';
  labelRoot.setAttribute('aria-hidden', 'true');
  canvas.after(labelRoot);
  let labelExclusions = () => [];
  const labelContext = createLabelContext({ exclusions: () => [...labelExclusions(), ...(landmarks?.screenBoxes() ?? [])] });
  const overlayEnabled = (layer) => layers[layer] && (layer !== 'labels' || labelPolicy === 'all');

  const controls = createGlobeControls(camera, canvas, {
    altitude: 3.3, lat: 8, lon: 25, reduceMotion: () => reduceMotion.matches,
    onHover: (event) => { hover = { x: event.clientX, y: event.clientY }; },
  });

  // Presentations: 'title' (backdrop), 'explore' (development/inspection, dev markers allowed),
  // 'mystery' (gameplay: interactive, reticle, never a marker unless the host reveals an answer),
  // 'strategy' (the strategy map: interactive, closer zoom, no modern human overlays; the physical Earth stays
  // fully visible and the host draws only what the player's people know).
  let mode = 'title';
  let sideFraming = false; // reveal screens frame the globe right of the text, like the title
  // The strategy map is keyboard-and-mouse only: the gamepad drives the camera in the other presentations.
  const gamepad = createGamepadNavigation(controls, { isEnabled: () => controls.enabled && mode !== 'strategy' });
  const keyboard = createKeyboardNavigation(controls);
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
  const landmarks = overlays.add(createLandmarkLayer({ registry: landmarkRegistry.landmarks }));

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
    sunLight.position.copy(sunDir).multiplyScalar(10);
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
    for (const [layer, ids] of Object.entries(OVERLAY_GROUPS)) for (const id of ids) overlays.setEnabled(id, overlayEnabled(layer));
    needsRender = true;
  }

  /**
   * Place-name policy. 'none' while a mystery is being investigated (any name could be an answer, so the
   * rule is uniform and answer-independent); 'all' in exploration and after an answer is revealed.
   */
  function setLabelPolicy(policy) {
    labelPolicy = policy === 'none' ? 'none' : 'all';
    for (const id of OVERLAY_GROUPS.labels) overlays.setEnabled(id, overlayEnabled('labels'));
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
    const [borders, rivers, labelData] = await Promise.all([fetchBuffer(index.layers.borders), fetchBuffer(index.layers.rivers),
      fetch(`${base}labels.json`).then((r) => (r.ok ? r.json() : { labels: [] }))]);
    overlays.add(createLabelLayer({ id: 'labels-continental', level: 'continental', fadeIn: [1.9, 1.4], root: labelRoot, context: labelContext, labels: labelData.labels.filter((l) => l.l === 2) }));
    overlays.add(createLabelLayer({ id: 'labels-regional', level: 'regional', root: labelRoot, context: labelContext, labels: labelData.labels.filter((l) => l.l === 3) }));
    // Level 2: borders (disputed/indefinite lines fainter) and famous rivers; level 3: regional rivers.
    overlays.add(createPolylineLayer({ id: 'borders', level: 'continental', buffer: borders, heightM: 2500, sunDir,
      classes: [{ color: 0xf4e7c5, alpha: 0.55 }, { color: 0xf4e7c5, alpha: 0.28 }] }));
    overlays.add(createPolylineLayer({ id: 'rivers-major', level: 'continental', buffer: rivers, heightM: 1500, sunDir,
      classes: [{ color: 0x9fd2ff, alpha: 0.7 }, { include: false }] }));
    overlays.add(createPolylineLayer({ id: 'rivers-regional', level: 'regional', buffer: rivers, heightM: 1500, sunDir,
      classes: [{ include: false }, { color: 0x9fd2ff, alpha: 0.5 }] }));
    for (const [layer, ids] of Object.entries(OVERLAY_GROUPS)) for (const id of ids) overlays.setEnabled(id, overlayEnabled(layer));
  }
  const ready = load();

  // Modern human information (borders, place names, monuments, city lights) is not part of a 6000 BCE world;
  // the strategy map hides it and restores the player's layer choices afterwards. Rivers are physical, so stay.
  const STRATEGY_LAYERS = { borders: false, labels: false, landmarks: false, nightLights: false };
  let layersBeforeStrategy = null;
  function setMode(next) {
    if (!['title', 'explore', 'mystery', 'strategy'].includes(next)) throw new RangeError(`Unknown Earth presentation ${next}`);
    const interactive = next !== 'title';
    if (next === 'strategy' && mode !== 'strategy') {
      layersBeforeStrategy = Object.fromEntries(Object.keys(STRATEGY_LAYERS).map((k) => [k, layers[k]]));
      for (const [k, v] of Object.entries(STRATEGY_LAYERS)) setLayer(k, v);
      controls.setAltitudeRange(0.05);
      controls.keyboardEnabled = false;
      keyboard.enabled = true;
      surfaceMaterial.uniforms.uStrategy.value = 1;
    } else if (next !== 'strategy' && mode === 'strategy') {
      for (const [k, v] of Object.entries(layersBeforeStrategy ?? {})) setLayer(k, v);
      layersBeforeStrategy = null;
      controls.setAltitudeRange(0.2);
      controls.keyboardEnabled = true;
      keyboard.enabled = false;
      surfaceMaterial.uniforms.uStrategy.value = 0;
      setObservers([]);
    }
    mode = next;
    controls.enabled = interactive;
    canvas.classList.toggle('interactive', interactive);
    sideFraming = false;
    reticle.hidden = !interactive || next === 'strategy';
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
  function resetToPlanetView({ signal, margin = 0.82 } = {}) {
    clearTarget();
    gamepad.reset();
    setFraming('center');
    const c = viewCentre();
    needsRender = true;
    return controls.flyTo(Math.max(-60, Math.min(60, c.lat)), c.lon, { altitude: controls.planetFitAltitude(margin), signal, duration: reduceMotion.matches ? 0.01 : 1.2 });
  }

  /** 'center' (aiming: reticle at the screen centre) or 'side' (reading: globe right of the text, no reticle). */
  function setFraming(name) {
    sideFraming = name === 'side';
    reticle.hidden = mode === 'title' || mode === 'strategy' || sideFraming;
    needsRender = true;
  }

  // ---------------------------------------------------------------- strategy map hooks (no game rules here)
  let territoryTexture = null;
  /** Owned-territory mask on the equal-angle grid (one byte per cell, row 0 = south), or null to clear. */
  function setTerritory(mask, cols, rows) {
    if (!mask) { surfaceMaterial.uniforms.uTerritory.value = blank; needsRender = true; return; }
    if (!territoryTexture || territoryTexture.image.width !== cols || territoryTexture.image.height !== rows) {
      territoryTexture?.dispose();
      territoryTexture = new THREE.DataTexture(mask, cols, rows, THREE.RedFormat, THREE.UnsignedByteType);
      territoryTexture.magFilter = territoryTexture.minFilter = THREE.LinearFilter;
      territoryTexture.wrapS = THREE.RepeatWrapping;
      territoryTexture.generateMipmaps = false;
    } else territoryTexture.image.data = mask;
    territoryTexture.needsUpdate = true;
    surfaceMaterial.uniforms.uTerritory.value = territoryTexture;
    needsRender = true;
  }

  /** Observation circles: up to four { lat, lon, km } drawn faintly on the ground. */
  function setObservers(list) {
    const slots = surfaceMaterial.uniforms.uObservers.value;
    const shown = list.slice(0, slots.length);
    shown.forEach((o, i) => { const n = geodeticToNormal(o.lat, o.lon); slots[i].set(n.x, n.y, n.z, o.km / 6371.0088); });
    surfaceMaterial.uniforms.uObserverCount.value = shown.length;
    needsRender = true;
  }

  // Objects anchored to the surface at a WGS84 point, upright (+Y = local up, -Z = north), kept at a constant
  // on-screen size so miniatures stay readable at every zoom. Hidden by the Earth itself when on the far side.
  const anchors = new Set();
  const basis = new THREE.Matrix4();
  const up = new THREE.Vector3(), east = new THREE.Vector3(), south = new THREE.Vector3();
  function placeAnchor(a) {
    const p = geodeticToPosition(a.lat, a.lon, 0);
    const n = geodeticToNormal(a.lat, a.lon);
    up.set(n.x, n.y, n.z);
    east.set(0, 1, 0).cross(up);
    if (east.lengthSq() < 1e-12) east.set(0, 0, -1);
    east.normalize();
    south.crossVectors(east, up).normalize();
    basis.makeBasis(east, up, south);
    a.object.quaternion.setFromRotationMatrix(basis);
    a.object.position.set(p.x, p.y, p.z).addScaledVector(up, a.lift);
    a.ground.copy(a.object.position);
    needsRender = true;
  }
  // popUp: like the landmark miniatures, seen from about 30° above its horizon whatever the camera angle.
  function anchor(object, { lat, lon, pixelSize = 40, lift = 0.00002, popUp = false }) {
    const a = {
      object, lat, lon, pixelSize, lift, popUp, ground: new THREE.Vector3(),
      setPosition(nextLat, nextLon) { a.lat = nextLat; a.lon = nextLon; placeAnchor(a); },
      setVisible(on) { object.visible = on; needsRender = true; },
      remove() { globe.remove(object); anchors.delete(a); needsRender = true; },
    };
    globe.add(object);
    anchors.add(a);
    placeAnchor(a);
    return a;
  }
  const popBasis = new THREE.Matrix4();
  const camUp = new THREE.Vector3(), camBack = new THREE.Vector3(), popUpAxis = new THREE.Vector3(), popFwd = new THREE.Vector3(), popSide = new THREE.Vector3();
  const POP_ELEVATION = THREE.MathUtils.degToRad(30);
  function scaleAnchors() {
    const perPixel = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / height;
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    camBack.set(0, 0, 1).applyQuaternion(camera.quaternion);
    popUpAxis.copy(camUp).multiplyScalar(Math.cos(POP_ELEVATION)).addScaledVector(camBack, Math.sin(POP_ELEVATION)).normalize();
    popFwd.copy(camBack).addScaledVector(popUpAxis, -camBack.dot(popUpAxis)).normalize();
    popSide.crossVectors(popUpAxis, popFwd);
    popBasis.makeBasis(popSide, popUpAxis, popFwd);
    for (const a of anchors) {
      const size = camera.position.distanceTo(a.ground) * perPixel * a.pixelSize;
      a.object.scale.setScalar(size);
      if (!a.popUp) continue;
      a.object.quaternion.setFromRotationMatrix(popBasis);
      // Slide toward the viewer along the line of sight: same place on screen, clear of the ground behind it.
      a.object.position.copy(a.ground).addScaledVector(tmp.copy(camera.position).sub(a.ground).normalize(), size * 0.8);
    }
  }

  /** Smoothly centre a WGS84 point, keeping the current zoom (strategy double-click). */
  function centerOn(lat, lon) { return controls.flyTo(lat, lon, { altitude: controls.altitude, duration: reduceMotion.matches ? 0.01 : 0.7 }); }

  /** Add an Earth-fixed object (e.g. route lines) to the globe; returns a function that removes it. */
  function attach(object) { globe.add(object); needsRender = true; return () => { globe.remove(object); needsRender = true; }; }

  /** Screen position (CSS px) of a WGS84 point and whether it faces the camera. */
  const projectTmp = new THREE.Vector3();
  function projectGeo(lat, lon) {
    const p = geodeticToPosition(lat, lon, 0);
    const n = geodeticToNormal(lat, lon);
    projectTmp.set(p.x, p.y, p.z);
    const facing = (camera.position.x - p.x) * n.x + (camera.position.y - p.y) * n.y + (camera.position.z - p.z) * n.z;
    projectTmp.project(camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (projectTmp.x + 1) / 2 * rect.width, y: rect.top + (1 - projectTmp.y) / 2 * rect.height, front: facing > 0 && projectTmp.z < 1 };
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

  function clearTarget() { target = null; marker.visible = false; selectionMarker.visible = false; needsRender = true; }

  function orientOnSurface(object, lat, lon) {
    const p = geodeticToPosition(lat, lon, 0);
    const n = geodeticToNormal(lat, lon);
    object.position.set(p.x, p.y, p.z).addScaledVector(tmp.set(n.x, n.y, n.z), 0.0008);
    object.lookAt(tmp.set(p.x + n.x, p.y + n.y, p.z + n.z));
  }

  /** The player's confirmed selection (shown only after confirmation, during the reveal). */
  function setSelectionMarker(coords) {
    selectionMarker.visible = Boolean(coords);
    if (coords) orientOnSurface(selectionMarker, coords.lat, coords.lon);
    needsRender = true;
  }

  /** Globe silhouette and north direction on screen, in CSS pixels, for UI instruments. */
  const projected = new THREE.Vector3();
  const northCam = new THREE.Vector3();
  const invQ = new THREE.Quaternion();
  function projection() {
    if (!globe.visible) return null;
    projected.set(0, 0, 0).project(camera);
    const d = camera.position.length();
    const r = (Math.tan(Math.asin(Math.min(1, 1 / d))) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * (height / 2);
    invQ.copy(camera.quaternion).invert();
    northCam.set(0, 1, 0).applyQuaternion(invQ);
    return { cx: (projected.x + 1) / 2 * width, cy: (1 - projected.y) / 2 * height, r, north: Math.atan2(northCam.x, northCam.y), aiming: !reticle.hidden };
  }

  // Ambient pacing: the title's slow spin is decoration, so on a device where one frame is expensive
  // (software WebGL, a very weak GPU) it is redrawn with idle time in between instead of back to back.
  // That keeps the page responsive (menus, version checks, storage). Player-driven views are never paced.
  // On a normal GPU frames cost ~16 ms, so the pace never engages.
  let frameCost = 0;        // smoothed wall time of a rendered frame, in ms
  let lastCallAt = 0;
  let renderedLastCall = false;
  function render(dt, { paced = false } = {}) {
    const now = performance.now();
    if (renderedLastCall && lastCallAt) frameCost = frameCost ? frameCost * 0.7 + (now - lastCallAt) * 0.3 : now - lastCallAt;
    lastCallAt = now;
    renderedLastCall = false;
    elapsed += dt;
    const targetFrame = mode === 'title' || sideFraming ? 1 : 0;
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
      if (keyboard.enabled && keyboard.update(dt / steps)) needsRender = true;
      if (controls.update(dt / steps)) needsRender = true;
    }

    if (overlays.update(controls.altitude, camera)) needsRender = true;
    if (layers.clouds && !reduceMotion.matches) shared.uCloudOffset.value = (elapsed * 0.00035) % 1; // slow eastward drift
    // Thin the clouds when close to the surface so the geography stays readable (and blur stays hidden).
    if (layers.clouds) shared.uClouds.value = THREE.MathUtils.lerp(0.35, 1, THREE.MathUtils.smoothstep(controls.altitude, 0.25, 1.2));
    if (marker.visible) {
      const scale = Math.max(0.004, camera.position.distanceTo(marker.position) * 0.016);
      const pulse = reduceMotion.matches ? 1 : 1 + 0.06 * Math.sin(elapsed * 2.2);
      marker.scale.setScalar(scale * pulse);
      needsRender = true;
    }
    if (selectionMarker.visible) selectionMarker.scale.setScalar(Math.max(0.004, camera.position.distanceTo(selectionMarker.position) * 0.012));
    if (hover) {
      const point = pickSurface(hover.x, hover.y, tmp);
      hoverGeo = point ? positionToGeodetic(point.x, point.y, point.z) : null;
      hover = null;
    }

    // Demand rendering: draw on change; while idle only refresh at a low rate for drifting clouds.
    sinceRender += dt;
    const idleInterval = layers.clouds && !reduceMotion.matches ? 1 / 15 : Infinity;
    if (!needsRender && sinceRender < idleInterval) return false;
    const ambient = mode === 'title' || !needsRender; // title spin, or the idle cloud-drift refresh
    if (paced && ambient && frameCost > 50 && sinceRender < Math.min(4, (frameCost / 1000) * 3)) return false;
    renderedLastCall = true;
    if (anchors.size) scaleAnchors();
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
  setLayer('clouds', layers.clouds);

  return {
    ready, render, setMode, setLayer, flyTo, clearTarget, state, controls, pickSurface, pickGeodetic,
    pickCenter, navigateTo, resetToPlanetView, pollGamepads, gamepad, overlays, setSelectionMarker, projection, setFraming, setLabelPolicy,
    setTerritory, setObservers, anchor, attach, projectGeo, centerOn, keyboard,
    get labelPolicy() { return labelPolicy; },
    /** Interface areas labels must avoid: () => Array<[left, top, right, bottom]> in CSS px. */
    setLabelExclusions(fn) { labelExclusions = fn; labelContext.dirty = true; },
    get mode() { return mode; },
    get layers() { return { ...layers }; },
    get hoverGeo() { return hoverGeo; },
    invalidate() { needsRender = true; },
    dispose() {
      window.removeEventListener('resize', resize);
      controls.dispose();
      reticle.remove();
      labelRoot.remove();
      disposeEarthTier(assets);
      overlays.dispose();
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      renderer.dispose();
    },
  };
}
