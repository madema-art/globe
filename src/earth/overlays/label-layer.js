import * as THREE from 'three';
import { geodeticToPosition } from '../../geography/coordinates.js';

// Atlas place-name labels drawn as DOM text (crisp, real atlas typefaces) anchored to WGS84 points.
// Each frame the camera moved: back-facing labels are dropped, the rest are placed greedily by
// priority (kind, then Natural Earth rank) so labels never overlap. Elements are created lazily and only
// touched when their position or visibility changes.
//
// Spoiler policy: which labels exist depends only on their kind and rank (see docs/EARTH_OVERLAYS.md);
// the mystery presentation disables label layers entirely via EarthView.setLabelPolicy('none').

const KIND_PRIORITY = { continent: 0, ocean: 1, country: 2, capital: 3, sea: 4, range: 5, desert: 5, city: 6, region: 7 };
const KIND_SIZE = { continent: 20, ocean: 18, country: 13, capital: 13, city: 13, sea: 14, range: 14, desert: 14, region: 13 };
const POINT_KINDS = new Set(['capital', 'city']);

/**
 * Shared placement context so several label layers (and interface areas) never overlap.
 * `exclusions()` returns screen rectangles [left, top, right, bottom] occupied by interface text.
 */
export function createLabelContext({ exclusions = () => [] } = {}) {
  return { boxes: [], frame: -1, exclusions };
}

export function createLabelLayer({ id, level, labels, root, fadeIn, context = createLabelContext() }) {
  const container = document.createElement('div');
  container.className = 'atlas-label-layer';
  container.dataset.layer = id;
  root.append(container);
  const group = new THREE.Object3D(); // placeholder so the overlay manager can toggle visibility
  const items = labels
    .map((label) => {
      const p = geodeticToPosition(label.la, label.lo, 0);
      const position = new THREE.Vector3(p.x, p.y, p.z);
      const size = KIND_SIZE[label.k] ?? 13;
      const spacing = label.k === 'country' || label.k === 'continent' || label.k === 'ocean' ? 0.22 : 0.06;
      return {
        label, position, normal: position.clone().normalize(), element: null, shown: false, x: NaN, y: NaN,
        priority: (KIND_PRIORITY[label.k] ?? 9) * 100 + label.r,
        width: label.n.length * size * (0.58 + spacing) + (POINT_KINDS.has(label.k) ? 12 : 0), height: size * 1.5,
      };
    })
    .sort((a, b) => a.priority - b.priority);

  const view = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const lastMatrix = new THREE.Matrix4();
  let lastSize = '';
  let opacity = 0;

  function element(item) {
    if (!item.element) {
      const el = document.createElement('span');
      el.className = `atlas-label atlas-${item.label.k}`;
      el.textContent = item.label.n;
      container.append(el);
      item.element = el;
    }
    return item.element;
  }

  function hideAll() {
    for (const item of items) if (item.shown) { item.element.hidden = true; item.shown = false; }
  }

  return {
    id, level, fadeIn, group,
    setOpacity(o) {
      opacity = o;
      container.style.opacity = o.toFixed(3);
      if (o <= 0.001) hideAll();
      else lastSize = ''; // force a placement pass when becoming visible
    },
    onCamera(camera, altitude, frame) {
      if (opacity <= 0.001) return false;
      const size = `${innerWidth}x${innerHeight}`;
      // Layers share one collision set per frame: the first layer to run in a frame resets it.
      if (context.frame !== frame) { context.frame = frame; context.boxes.length = 0; context.boxes.push(...context.exclusions()); context.dirty = false; }
      if (size === lastSize && lastMatrix.equals(camera.matrixWorld) && !context.dirty) {
        for (const item of items) if (item.shown) context.boxes.push(item.box);
        return false;
      }
      context.dirty = true; // later layers in this frame must re-place against the new boxes
      lastSize = size;
      lastMatrix.copy(camera.matrixWorld);
      const w = innerWidth, h = innerHeight;
      const placed = context.boxes;
      for (const item of items) {
        view.copy(camera.position).sub(item.position).normalize();
        let visible = item.normal.dot(view) > 0.14;
        let x = 0, y = 0;
        if (visible) {
          ndc.copy(item.position).project(camera);
          x = (ndc.x + 1) / 2 * w;
          y = (1 - ndc.y) / 2 * h;
          const point = POINT_KINDS.has(item.label.k);
          const left = point ? x - 4 : x - item.width / 2;
          const top = y - item.height / 2;
          const box = [left, top, left + item.width, top + item.height];
          visible = box[2] > 0 && box[0] < w && box[3] > 0 && box[1] < h
            && !placed.some((o) => box[0] < o[2] + 6 && box[2] > o[0] - 6 && box[1] < o[3] + 2 && box[3] > o[1] - 2);
          if (visible) { placed.push(box); item.box = box; }
        }
        if (visible) {
          const el = element(item);
          if (!item.shown) { el.hidden = false; item.shown = true; }
          if (!(Math.abs(x - item.x) <= 0.25 && Math.abs(y - item.y) <= 0.25)) { // also true on first placement (NaN)
            el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
            item.x = x; item.y = y;
          }
        } else if (item.shown) {
          item.element.hidden = true;
          item.shown = false;
        }
      }
      return false; // DOM only: no WebGL redraw needed
    },
    dispose() { container.remove(); },
  };
}
