import * as THREE from 'three';

// Procedural miniature prototypes in the "elegant diorama" style: restrained materials (stone, wrought iron,
// basalt and snow), physically lit by the Earth's sun, slightly exaggerated vertically so they read from
// orbit-like distances. Every model is built in a local frame with +Y up and unit height, centred on its
// geographic anchor. Future curated landmarks will be authored in Blender as glTF and registered the same way.

const sandstone = () => new THREE.MeshStandardMaterial({ color: 0xe0c48e, roughness: 0.9, metalness: 0, flatShading: true });

function pyramid(base, height) {
  const geometry = new THREE.ConeGeometry(base / Math.SQRT2, height, 4, 1);
  geometry.rotateY(Math.PI / 4);
  geometry.translate(0, height / 2, 0);
  return new THREE.Mesh(geometry, sandstone());
}

/** Giza: the three main pyramids on their diagonal, with the queens' pyramids beside the smallest. */
export function buildGiza() {
  const group = new THREE.Group();
  const layout = [
    [0.0, 0.0, 0.62, 0.62],      // Khufu
    [-0.27, -0.24, 0.57, 0.6],    // Khafre (on higher ground, appears nearly as tall)
    [-0.46, -0.5, 0.28, 0.3],     // Menkaure
    [-0.3, -0.62, 0.1, 0.1], [-0.36, -0.66, 0.1, 0.1], [-0.42, -0.7, 0.1, 0.1],
  ];
  for (const [x, z, base, height] of layout) {
    const p = pyramid(base, height);
    p.position.set(x * 0.85 + 0.14, 0, -z * 0.85 - 0.18);
    group.add(p);
  }
  return group;
}

/** Eiffel Tower: four curved legs, two platforms, a tapering shaft and a fine lattice suggestion. */
export function buildEiffel() {
  const group = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x6f5a42, roughness: 0.6, metalness: 0.35 });
  const legCurve = (sx, sz) => new THREE.CatmullRomCurve3([
    new THREE.Vector3(sx * 0.3, 0.03, sz * 0.3), new THREE.Vector3(sx * 0.17, 0.2, sz * 0.17),
    new THREE.Vector3(sx * 0.09, 0.38, sz * 0.09), new THREE.Vector3(sx * 0.035, 0.68, sz * 0.035), new THREE.Vector3(0, 1, 0),
  ]);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const leg = new THREE.Mesh(new THREE.TubeGeometry(legCurve(sx, sz), 40, 0.016, 6, false), iron);
    group.add(leg);
  }
  // Arch between the legs at the base and the two platforms.
  const deck = (y, half, thickness) => {
    const geometry = new THREE.BoxGeometry(half * 2, thickness, half * 2);
    geometry.translate(0, y, 0);
    return new THREE.Mesh(geometry, iron);
  };
  group.add(deck(0.2, 0.19, 0.022), deck(0.38, 0.1, 0.016), deck(0.88, 0.035, 0.012));
  for (const angle of [0, Math.PI / 2]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 6, 24, Math.PI), iron);
    arch.rotation.y = angle;
    arch.position.y = 0;
    arch.scale.set(1, 0.85, 1);
    group.add(arch);
  }
  // Lattice: thin diagonal braces between the legs.
  const brace = new THREE.CylinderGeometry(0.004, 0.004, 1, 4);
  const braces = new THREE.InstancedMesh(brace, iron, 64);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3();
  let i = 0;
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (let level = 0; level < 8; level++) {
    const t0 = level / 8, t1 = (level + 1) / 8;
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
      legCurve(ax, az).getPoint(t0 * 0.9, a);
      legCurve(bx, bz).getPoint(t1 * 0.9, b);
      mid.addVectors(a, b).multiplyScalar(0.5);
      sc.set(1, a.distanceTo(b), 1);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      braces.setMatrixAt(i++, m.compose(mid, q, sc));
      legCurve(ax, az).getPoint(t1 * 0.9, a);
      legCurve(bx, bz).getPoint(t0 * 0.9, b);
      mid.addVectors(a, b).multiplyScalar(0.5);
      sc.set(1, a.distanceTo(b), 1);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      braces.setMatrixAt(i++, m.compose(mid, q, sc));
    }
  }
  braces.count = i;
  group.add(braces);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.12, 6), iron);
  spire.position.y = 1.04;
  group.add(spire);
  return group;
}

/** Mount Fuji: a concave stratovolcano profile with a snow cap and a dark basalt flank. */
export function buildFuji() {
  const group = new THREE.Group();
  const profile = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 = summit, 1 = base
    const r = 0.045 + 0.5 * Math.pow(t, 1.9);
    const y = 0.78 * (1 - t);
    profile.push(new THREE.Vector2(r, y));
  }
  profile.unshift(new THREE.Vector2(0.0, 0.78));
  profile.reverse(); // LatheGeometry expects base -> summit for outward-facing triangles
  const geometry = new THREE.LatheGeometry(profile, 72);
  const colors = [];
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const h = v.y / 0.78;
    const ridge = 0.04 * Math.sin(Math.atan2(v.z, v.x) * 9) * h; // gullies: snow reaches lower along ridges
    const snow = THREE.MathUtils.smoothstep(h + ridge, 0.6, 0.7);
    const basalt = new THREE.Color(0x857f88).lerp(new THREE.Color(0x7d8a5c), THREE.MathUtils.smoothstep(1 - h, 0.65, 1));
    const c = basalt.lerp(new THREE.Color(0xf4f2ec), snow);
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
  return group;
}

export const MINIATURE_BUILDERS = { giza: buildGiza, eiffel: buildEiffel, fuji: buildFuji };
