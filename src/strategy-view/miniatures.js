import * as THREE from 'three';

// Miniatures for the strategy map, in local units (+Y up, -Z north); the Earth anchors them to the ground and
// scales them to a constant on-screen size. Restrained materials, lit by the Earth's sun.
//
// The village follows what Pottery Neolithic farming villages of the southern Levant were like in general:
// small mud-brick houses, round and rectilinear, around open yards, with fields nearby. No towers, no walls.

const mat = (color, roughness = 0.92) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });

export function buildNeolithicVillage() {
  const group = new THREE.Group();
  group.name = 'neolithic-village';
  const ground = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), mat(0xa08a64));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.002;
  group.add(ground);
  const fieldMaterial = mat(0x6d7a40);
  for (const [x, z, w, d, r] of [[0.78, -0.18, 0.34, 0.22, 0.2], [0.66, 0.36, 0.28, 0.2, -0.3], [-0.78, 0.22, 0.3, 0.2, 0.1]]) {
    const field = new THREE.Mesh(new THREE.PlaneGeometry(w, d), fieldMaterial);
    field.rotation.set(-Math.PI / 2, 0, r);
    field.position.set(x, 0.003, z);
    group.add(field);
  }
  const wall = mat(0xb39069), roof = mat(0x8d7052);
  const round = (x, z, radius, height) => {
    const house = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.04, height, 18), wall);
    house.position.set(x, height / 2, z);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.018, 18), roof);
    top.position.set(x, height + 0.009, z);
    group.add(house, top);
  };
  const rect = (x, z, w, d, height, angle) => {
    const house = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), wall);
    house.position.set(x, height / 2, z);
    house.rotation.y = angle;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.018, d * 1.04), roof);
    top.position.set(x, height + 0.009, z);
    top.rotation.y = angle;
    group.add(house, top);
  };
  round(-0.22, -0.18, 0.11, 0.1); round(0.05, -0.32, 0.09, 0.09); round(0.28, -0.08, 0.1, 0.1);
  round(-0.3, 0.2, 0.09, 0.085); round(0.2, 0.3, 0.1, 0.095);
  rect(-0.02, 0.06, 0.26, 0.16, 0.11, 0.35);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 4; } });
  return group;
}

export function buildExploringParty() {
  const group = new THREE.Group();
  group.name = 'exploring-party';
  const skin = mat(0x6e4b32), cloth = [mat(0xd6c39b), mat(0xa8673a), mat(0x8c7b5a)], wood = mat(0x5b4430);
  [[0, -0.12], [-0.13, 0.1], [0.13, 0.1]].forEach(([x, z], i) => {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.2, 10), cloth[i]);
    body.position.set(x, 0.1, z);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), skin);
    head.position.set(x, 0.235, z);
    group.add(body, head);
    if (i === 0) {
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.34, 6), wood);
      staff.position.set(x + 0.07, 0.17, z);
      group.add(staff);
    }
  });
  return group;
}
