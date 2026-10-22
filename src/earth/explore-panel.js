import landmarkData from '../../assets/data/processed/earth-landmarks.json';
import { formatLatLon, normalizeLongitude } from '../geography/coordinates.js';

// Development explore HUD: layer toggles, geographic targeting demo and a live coordinate readout.
// Not the quiz system; it exercises the coordinate API that the quiz will use.

const LAYER_LABELS = { clouds: 'Clouds', atmosphere: 'Atmosphere', nightLights: 'Night lights', relief: 'Relief', ocean: 'Ocean glint', realSun: 'Real sun', borders: 'Borders', rivers: 'Rivers', labels: 'Place names', landmarks: 'Landmarks' };

export const landmarks = landmarkData.landmarks;

export function createExplorePanel(root, earth) {
  const select = root.querySelector('#target-select');
  const readout = root.querySelector('#coordinate-readout');
  const layerBox = root.querySelector('#layer-toggles');
  const form = root.querySelector('#target-form');

  for (const landmark of landmarks) {
    const option = document.createElement('option');
    option.value = landmark.id;
    option.textContent = `${landmark.name}${landmark.kind === 'city' ? ` (${landmark.country})` : ''}`;
    select.append(option);
  }

  for (const [name, label] of Object.entries(LAYER_LABELS)) {
    const id = `layer-${name}`;
    const wrapper = document.createElement('label');
    wrapper.className = 'toggle';
    wrapper.innerHTML = `<input type="checkbox" id="${id}" /><span>${label}</span>`;
    const input = wrapper.querySelector('input');
    input.checked = earth.layers[name];
    input.addEventListener('change', () => earth.setLayer(name, input.checked));
    layerBox.append(wrapper);
  }

  const flyToLandmark = () => {
    const landmark = landmarks.find((l) => l.id === select.value);
    if (landmark) earth.flyTo(landmark.lat, landmark.lon, { name: landmark.name, altitude: landmark.kind === 'island' ? 1.1 : 0.7 });
  };
  select.addEventListener('change', flyToLandmark);
  root.querySelector('#target-go').addEventListener('click', flyToLandmark);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const match = form.querySelector('#target-coords').value.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match || Math.abs(+match[1]) > 90) { readout.textContent = 'Enter "lat, lon" in decimal degrees, e.g. -18.91, 47.54'; return; }
    earth.flyTo(+match[1], normalizeLongitude(+match[2]), { name: 'Coordinate' });
  });

  let last = '';
  return {
    update() {
      const s = earth.state();
      const parts = [];
      if (s.target) parts.push(`${s.target.name ?? 'Target'} ${formatLatLon(s.target.lat, s.target.lon)}`);
      parts.push(s.hover ? `Cursor ${formatLatLon(s.hover.lat, s.hover.lon)}` : `View ${formatLatLon(s.camera.lat, s.camera.lon)}`);
      parts.push(`Altitude ${Math.round(s.camera.altitude * 6378).toLocaleString('en')} km`, `Detail level ${s.overlays.level}`);
      if (s.gamepad.active) parts.push('Controller');
      const text = parts.join('     ');
      if (text !== last) { readout.textContent = text; last = text; }
    },
  };
}
