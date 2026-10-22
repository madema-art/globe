import * as THREE from 'three';

// Runtime adapter for the Earth asset manifest (public/earth/v1/earth.json, schema globe.earth-assets/1).
// Rendering code depends only on the returned textures + channel metadata, never on file names.

const KINDS = ['day', 'surface', 'atmos'];

export function earthAssetBase() {
  return `${import.meta.env.BASE_URL}earth/v1/`;
}

export async function loadEarthManifest(base = earthAssetBase()) {
  const response = await fetch(`${base}earth.json`);
  if (!response.ok) throw new Error(`Earth manifest unavailable (${response.status})`);
  const manifest = await response.json();
  if (manifest.schema !== 'globe.earth-assets/1') throw new Error(`Unsupported Earth manifest ${manifest.schema}`);
  return manifest;
}

/** Choose a tier from device limits. `?earth=low|medium|high` overrides for testing. */
export function chooseTier(manifest, renderer) {
  const requested = new URLSearchParams(location.search).get('earth');
  if (requested && manifest.tiers[requested]) return requested;
  const max = renderer.capabilities.maxTextureSize;
  const coarse = window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
  const fits = (name) => KINDS.every((kind) => manifest.tiers[name][kind].width <= max);
  if (!coarse && fits('high')) return 'high';
  return fits('medium') ? 'medium' : 'low';
}

async function loadTexture(url, kind, anisotropy) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Earth texture unavailable: ${url}`);
  // Decode off the main thread; flip so row 0 (north) lands at v = 1.
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const texture = new THREE.Texture(bitmap);
  texture.flipY = false;
  texture.colorSpace = kind === 'day' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping; // continuous filtering across the antimeridian
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.bytes = bitmap.width * bitmap.height * 4 * 4 / 3; // RGBA8 + mip chain estimate
  return texture;
}

/** Loads one tier. Resolves to {tier, textures:{day,surface,atmos}, bytesGpu}. */
export async function loadEarthTier(manifest, tier, renderer, base = earthAssetBase()) {
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const entries = await Promise.all(KINDS.map(async (kind) => [kind, await loadTexture(base + manifest.tiers[tier][kind].url, kind, anisotropy)]));
  const textures = Object.fromEntries(entries);
  for (const texture of Object.values(textures)) renderer.initTexture(texture); // upload before first use
  const bytesGpu = Object.values(textures).reduce((sum, t) => sum + t.userData.bytes, 0);
  return { tier, textures, bytesGpu };
}

export function disposeEarthTier(set) {
  if (!set) return;
  for (const texture of Object.values(set.textures)) {
    texture.image?.close?.();
    texture.dispose();
  }
}
