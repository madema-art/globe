import * as THREE from 'three';

// Abstract orbital linework only. This is not an Earth mesh or geographical data.
export function createTitleScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.z = 9;
  const group = new THREE.Group();
  scene.add(group);
  const material = new THREE.LineBasicMaterial({ color: 0x9bdbcf, transparent: true, opacity: 0.23 });
  for (let i = 0; i < 12; i++) {
    const points = Array.from({ length: 181 }, (_, j) => {
      const angle = j / 180 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * 2.5, Math.sin(angle) * 2.5, 0);
    });
    const orbit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
    orbit.rotation.y = i / 12 * Math.PI;
    group.add(orbit);
  }
  group.rotation.z = -0.35;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    group.position.x = innerWidth > 800 ? 2.7 : 1.8;
    renderer.render(scene, camera);
  };
  window.addEventListener('resize', resize);
  resize();
  const render = (seconds = 0) => {
    if (!reduceMotion.matches) group.rotation.y += Math.min(seconds, 0.1) * 0.035;
    renderer.render(scene, camera);
  };
  return { render };
}
