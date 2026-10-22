import * as THREE from 'three';
import { DETAIL_LEVELS, detailLevelAt, fadeAt } from './levels.js';

// Zoom-dependent overlay registry. Every overlay (borders, rivers, labels, landmark miniatures...) is an
// independent layer: { id, level, group: THREE.Object3D, setOpacity(o), fadeIn?, dispose? }.
//
// Spoiler policy (see docs/EARTH_OVERLAYS.md): visibility depends ONLY on altitude, the layer's own
// curated content and the player's layer toggles. This API deliberately has no notion of a mystery,
// an answer or a target, so an overlay can never single out the correct destination. Comparable places
// follow the same rules (same category + importance => same level and styling).

export function createOverlayManager({ parent, onChange = () => {} }) {
  const root = new THREE.Group();
  root.name = 'earth-overlays';
  parent.add(root);
  const layers = new Map();
  let lastAltitude = NaN;
  let level = 1;

  function apply(layer, altitude) {
    const fade = layer.fadeIn ?? DETAIL_LEVELS[layer.level]?.fadeIn;
    const opacity = layer.enabled && fade ? fadeAt(altitude, fade) : 0;
    if (opacity === layer.opacity) return false;
    layer.opacity = opacity;
    layer.group.visible = opacity > 0.001;
    layer.setOpacity(opacity);
    return true;
  }

  return {
    root,
    /** Register a layer. `level` is a DETAIL_LEVELS key ('continental' | 'regional' | 'landmark'). */
    add(layer) {
      if (!DETAIL_LEVELS[layer.level]) throw new RangeError(`Unknown detail level ${layer.level}`);
      if (layers.has(layer.id)) throw new Error(`Overlay ${layer.id} already registered`);
      const entry = { enabled: true, opacity: -1, ...layer };
      layers.set(layer.id, entry);
      root.add(entry.group);
      if (Number.isFinite(lastAltitude)) apply(entry, lastAltitude);
      onChange();
      return entry;
    },
    setEnabled(id, enabled) {
      const layer = layers.get(id);
      if (!layer) return;
      layer.enabled = Boolean(enabled);
      if (Number.isFinite(lastAltitude)) apply(layer, lastAltitude);
      onChange();
    },
    /** Update fades for a camera altitude; returns true if anything visible changed. */
    update(altitude, camera) {
      let changed = false;
      if (altitude !== lastAltitude) {
        lastAltitude = altitude;
        level = detailLevelAt(altitude);
        for (const layer of layers.values()) changed = apply(layer, altitude) || changed;
      }
      for (const layer of layers.values()) if (layer.group.visible && layer.onCamera) changed = layer.onCamera(camera, altitude) || changed;
      return changed;
    },
    get level() { return level; },
    state() {
      return { level, layers: Object.fromEntries([...layers.values()].map((l) => [l.id, { level: l.level, enabled: l.enabled, opacity: +Math.max(0, l.opacity).toFixed(3) }])) };
    },
    dispose() {
      for (const layer of layers.values()) layer.dispose?.();
      layers.clear();
      root.removeFromParent();
    },
  };
}
