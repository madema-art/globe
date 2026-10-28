// Land/water lookup for gameplay rules, decoded from public/strategy/v1/landmask-4096x2048.rle
// (pipeline/strategy/landmask.py; derived from the Earth V1 water mask, so rules match the visible coasts).

export class TerrainError extends Error { constructor(code) { super(code); this.code = code; } }

/** Decode the GLM1 run-length land mask into a packed bit array (1 = land). */
export function decodeLandMask(buffer) {
  const view = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  if (view.byteLength < 12 || String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) !== 'GLM1') throw new TerrainError('INVALID_LAND_MASK');
  const width = view.getUint32(4, true), height = view.getUint32(8, true);
  const bits = new Uint8Array(Math.ceil((width * height) / 8));
  let offset = 12;
  for (let y = 0; y < height; y++) {
    const runs = view.getUint32(offset, true); offset += 4;
    let x = 0, land = false;
    for (let r = 0; r < runs; r++) {
      const length = view.getUint16(offset, true); offset += 2;
      if (land) for (let i = 0; i < length; i++) { const p = y * width + x + i; bits[p >> 3] |= 1 << (p & 7); }
      x += length; land = !land;
    }
    if (x !== width) throw new TerrainError('INVALID_LAND_MASK');
  }
  return { width, height, bits };
}

/** Terrain queries in WGS84 degrees. */
export function createTerrain({ width, height, bits }) {
  return {
    isLand(lat, lon) {
      const x = Math.min(width - 1, Math.floor((((lon + 180) % 360 + 360) % 360) / 360 * width));
      const y = Math.min(height - 1, Math.max(0, Math.floor((90 - lat) / 180 * height)));
      const p = y * width + x;
      return (bits[p >> 3] & (1 << (p & 7))) !== 0;
    },
  };
}
