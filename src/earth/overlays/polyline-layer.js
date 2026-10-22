import * as THREE from 'three';
import { geodeticToPosition } from '../../geography/coordinates.js';

// Geographic polylines (globe.polylines/1, produced by pipeline/earth) drawn just above the ellipsoid.
// One draw call per layer; per-class colour/opacity; lines fade toward the limb to avoid shimmering.

export function decodePolylines(buffer) {
  const view = new DataView(buffer);
  const count = view.getUint32(0, true);
  const counts = new Uint32Array(buffer.slice(4, 4 + count * 4));
  const classes = new Uint8Array(buffer, 4 + count * 4, count);
  let offset = 4 + count * 4 + count;
  offset += (4 - (offset % 4)) % 4;
  const coords = new Int16Array(buffer, offset);
  return { count, counts, classes, coords };
}

const vertexShader = /* glsl */ `
  attribute float lineClass;
  uniform vec3 uSunDir;
  varying float vClass;
  varying float vFacing;
  varying float vDaylight;
  void main() {
    vClass = lineClass;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vFacing = dot(normalize(world.xyz), normalize(cameraPosition - world.xyz));
    vDaylight = smoothstep(-0.15, 0.2, dot(normalize(world.xyz), uSunDir));
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColors[2];
  uniform float uAlphas[2];
  uniform float uOpacity;
  varying float vClass;
  varying float vFacing;
  varying float vDaylight;
  void main() {
    int c = vClass > 0.5 ? 1 : 0;
    float limb = smoothstep(0.02, 0.25, vFacing);
    // Shares the Earth's sun: lines stay legible at night but recede, like ink on a darkened globe.
    gl_FragColor = vec4(uColors[c] * mix(0.55, 1.0, vDaylight), uAlphas[c] * uOpacity * limb * mix(0.5, 1.0, vDaylight));
    #include <colorspace_fragment>
  }`;

/**
 * @param {ArrayBuffer} buffer globe.polylines/1 data
 * @param {{ classes: Array<{color:number, alpha:number, include?:boolean}>, heightM?: number }} style
 */
export function createPolylineGeometry(buffer, { classes, heightM = 1500 }) {
  const { count, counts, classes: lineClasses, coords } = decodePolylines(buffer);
  let segments = 0;
  for (let i = 0; i < count; i++) if (classes[lineClasses[i]]?.include !== false) segments += counts[i] - 1;
  const positions = new Float32Array(segments * 6);
  const kinds = new Float32Array(segments * 2);
  const p = { x: 0, y: 0, z: 0 };
  let read = 0, write = 0;
  for (let i = 0; i < count; i++) {
    const n = counts[i];
    const include = classes[lineClasses[i]]?.include !== false;
    for (let j = 0; j < n; j++) {
      if (include) {
        geodeticToPosition(coords[(read + j) * 2] / 180, coords[(read + j) * 2 + 1] / 180, heightM, p);
        if (j > 0) { positions.set([p.x, p.y, p.z], write * 3 + 3); kinds[write + 1] = lineClasses[i]; write += 2; }
        if (j < n - 1) { positions.set([p.x, p.y, p.z], write * 3); kinds[write] = lineClasses[i]; }
      }
    }
    read += n;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('lineClass', new THREE.BufferAttribute(kinds, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createPolylineLayer({ id, level, buffer, classes, heightM, fadeIn, sunDir, renderOrder = 1.5 }) {
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false,
    uniforms: {
      uColors: { value: [0, 1].map((c) => new THREE.Color(classes[c]?.color ?? 0xffffff)) },
      uAlphas: { value: [0, 1].map((c) => classes[c]?.alpha ?? 0) },
      uOpacity: { value: 0 },
      uSunDir: { value: sunDir ?? new THREE.Vector3(1, 0, 0) },
    },
  });
  const lines = new THREE.LineSegments(createPolylineGeometry(buffer, { classes, heightM }), material);
  lines.name = `overlay-${id}`;
  lines.renderOrder = renderOrder;
  lines.frustumCulled = false;
  return {
    id, level, fadeIn, group: lines,
    setOpacity(o) { material.uniforms.uOpacity.value = o; },
    dispose() { lines.geometry.dispose(); material.dispose(); },
  };
}
