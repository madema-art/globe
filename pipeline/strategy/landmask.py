"""Gameplay land mask for the strategy prototype.

Derived from the Earth V1 surface texture's water-fraction channel (Natural Earth 10m land and lakes,
see assets/earth/MANIFEST.json), so the walking rule matches the coastlines the player sees.

Output: public/strategy/v1/landmask-4096x2048.rle  (format "GLM1", little-endian)
  magic "GLM1", u32 width, u32 height, then per row from 90N southwards:
  u32 run count, then that many u16 run lengths alternating water, land, water, ... (first run may be 0).
A pixel is land when its water fraction is below 0.5. Lakes count as water.

Usage: python pipeline/strategy/landmask.py
"""
import struct
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'public/earth/v1/surface-4096x2048.webp'
OUTPUT = ROOT / 'public/strategy/v1/landmask-4096x2048.rle'


def main():
    image = Image.open(SOURCE).getchannel('R')
    width, height = image.size
    pixels = image.load()
    out = bytearray(b'GLM1') + struct.pack('<II', width, height)
    land_pixels = 0
    for y in range(height):
        runs, current, length = [], False, 0  # rows start with a (possibly empty) water run
        for x in range(width):
            land = pixels[x, y] < 128
            land_pixels += land
            if land == current:
                length += 1
            else:
                runs.append(length)
                current, length = land, 1
        runs.append(length)
        out += struct.pack('<I', len(runs)) + struct.pack(f'<{len(runs)}H', *runs)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(out)
    print(f'{OUTPUT.relative_to(ROOT)}: {len(out)} bytes, land fraction {land_pixels / (width * height):.3f}')


if __name__ == '__main__':
    main()
