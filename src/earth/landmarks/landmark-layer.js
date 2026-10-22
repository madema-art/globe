import * as THREE from 'three';
import { geodeticToNormal, geodeticToPosition } from '../../geography/coordinates.js';
import { MINIATURE_BUILDERS } from './miniatures.js';

// Level-4 landmark miniatures. Registry entries (assets/data/processed/landmarks.json):
//   { id, name, kind, model, lat, lon, headingDeg, importance }
// Like the landmarks on an illustrated atlas, each miniature "pops up" toward the viewer at a fixed oblique
// angle (seen from ~30° above its horizon) while its soft contact shadow stays on the ground at the true
// WGS84 position. Miniatures keep a constant apparent size (diorama scale, not physical scale) and fade in
// with the landmark detail level. Every landmark of equal importance follows the same rule and carries no
// name in the mystery presentation, so a miniature never singles out an answer.

const IMPORTANCE_SCALE = { 1: 1, 2: 0.8, 3: 0.65 };
const ELEVATION = THREE.MathUtils.degToRad(30); // viewing angle above the miniature's horizon
const SCREEN_FRACTION = 0.085;                  // miniature (unit) height relative to the view height

export function createLandmarkLayer({ registry, level = 'landmark', fadeIn }) {
  const group = new THREE.Group();
  group.name = 'landmarks';
  const shadowTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d');
    const gradient = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(10,8,6,0.55)');
    gradient.addColorStop(0.6, 'rgba(10,8,6,0.22)');
    gradient.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  })();
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false });
  const items = [];
  for (const entry of registry) {
    const build = MINIATURE_BUILDERS[entry.model];
    if (!build) continue;
    const p = geodeticToPosition(entry.lat, entry.lon, 0);
    const n = geodeticToNormal(entry.lat, entry.lon);
    const position = new THREE.Vector3(p.x, p.y, p.z);
    const normal = new THREE.Vector3(n.x, n.y, n.z);
    // Ground shadow: lies on the surface (local +Z = up after lookAt).
    const ground = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), shadowMaterial);
    ground.position.copy(position).addScaledVector(normal, 0.00015);
    ground.lookAt(ground.position.clone().add(normal));
    ground.scale.set(1, 0.7, 1);
    // Pop-up miniature: oriented every frame toward the viewer.
    const popup = new THREE.Group();
    popup.position.copy(position);
    const model = build();
    model.rotation.y = THREE.MathUtils.degToRad(entry.headingDeg || 0);
    popup.add(model);
    popup.renderOrder = 1.2;
    group.add(ground, popup);
    items.push({ entry, position, normal, ground, popup, scale: IMPORTANCE_SCALE[entry.importance] ?? 0.65, box: null });
  }
  const materials = new Set();
  group.traverse((o) => { if (o.material) materials.add(o.material); });
  for (const material of materials) material.userData.baseOpacity = material.opacity;

  const camUp = new THREE.Vector3(), camBack = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3(), side = new THREE.Vector3();
  const toCamera = new THREE.Vector3(), basis = new THREE.Matrix4(), ndc = new THREE.Vector3();
  const lastCamera = new THREE.Matrix4();
  let lastAltitude = NaN;
  let opacity = 0;
  return {
    id: 'landmarks', level, fadeIn, group,
    setOpacity(o) {
      opacity = o;
      for (const material of materials) {
        material.transparent = o < 0.999 || material === shadowMaterial;
        material.opacity = material.userData.baseOpacity * o;
        material.depthWrite = material !== shadowMaterial && o > 0.5;
      }
    },
    /** Screen rectangles currently covered by miniatures (for label collision). */
    screenBoxes() { return opacity > 0.05 ? items.filter((i) => i.box).map((i) => i.box) : []; },
    onCamera(camera, altitude) {
      if (altitude === lastAltitude && lastCamera.equals(camera.matrixWorld)) return false;
      lastAltitude = altitude;
      lastCamera.copy(camera.matrixWorld);
      camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      camBack.set(0, 0, 1).applyQuaternion(camera.quaternion);
      // Model up axis: screen-up tilted toward the viewer so the miniature is seen from ELEVATION above.
      up.copy(camUp).multiplyScalar(Math.cos(ELEVATION)).addScaledVector(camBack, Math.sin(ELEVATION)).normalize();
      fwd.copy(camBack).addScaledVector(up, -camBack.dot(up)).normalize();
      side.crossVectors(up, fwd);
      basis.makeBasis(side, up, fwd);
      const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const h = innerHeight, w = innerWidth;
      for (const item of items) {
        toCamera.copy(camera.position).sub(item.position);
        const distance = toCamera.length();
        const facing = toCamera.divideScalar(distance).dot(item.normal);
        const visible = facing > 0.08;
        item.popup.visible = item.ground.visible = visible;
        if (!visible) { item.box = null; continue; }
        const size = Math.max(1e-4, distance * viewHeight * SCREEN_FRACTION * item.scale);
        item.popup.quaternion.setFromRotationMatrix(basis);
        item.popup.scale.setScalar(size);
        // Slide along the line of sight toward the viewer: same place on screen, but the tilted model no
        // longer intersects the planet's surface behind it.
        item.popup.position.copy(item.position).addScaledVector(toCamera, size * 0.8);
        item.ground.scale.set(size, size * 0.7, size);
        ndc.copy(item.position).project(camera);
        const x = (ndc.x + 1) / 2 * w, y = (1 - ndc.y) / 2 * h;
        const px = SCREEN_FRACTION * item.scale * h;
        item.box = [x - px * 0.6, y - px * 0.95, x + px * 0.6, y + px * 0.3];
      }
      return true;
    },
    dispose() {
      group.traverse((o) => { o.geometry?.dispose(); });
      for (const material of materials) material.dispose();
      shadowTexture.dispose();
    },
  };
}
