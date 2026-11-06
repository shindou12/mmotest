#!/usr/bin/env python3
"""切り抜いた 2x2 の葉の小枝の絵を、葉が密で明暗差の小さい小枝に組み直す。

各枠の絵を回して奥へ重ねる。奥ほど暗く、手前は暗い葉も明るい葉の色へ寄せて差を縮める。

使い方: python star_dense.py <切り抜いた絵.png> <出力.png> [手前の明暗の強さ 既定 0.45]
"""
import sys

import numpy as np
from PIL import Image

TILE = 512
LAYERS = ((-48, 0.92, 0.62), (42, 0.96, 0.74), (-16, 1.0, 0.86), (0, 1.0, 1.0))  # 回転, 大きさ, 明るさ


def soften(tile, amount):
    pixels = np.asarray(tile, dtype=np.float32).copy()
    solid = pixels[..., 3] > 128
    mean = pixels[solid][:, :3].mean(axis=0)
    pixels[..., :3] = np.clip(mean + (pixels[..., :3] - mean) * amount, 0, 255)
    return Image.fromarray(pixels.astype(np.uint8), "RGBA")


def main(source, out, amount="0.45"):
    sheet = Image.open(source).convert("RGBA").resize((TILE * 2, TILE * 2), Image.LANCZOS)
    result = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
    for row in range(2):
        for column in range(2):
            box = (column * TILE, row * TILE, (column + 1) * TILE, (row + 1) * TILE)
            tile = soften(sheet.crop(box), float(amount))
            canvas = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
            for angle, scale, shade in LAYERS:
                size = int(TILE * scale)
                layer = tile.resize((size, size), Image.LANCZOS).rotate(angle, Image.BICUBIC, center=(size / 2, size * 0.85))
                pixels = np.asarray(layer, dtype=np.float32).copy()
                pixels[..., :3] *= shade
                layer = Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8), "RGBA")
                offset = ((TILE - size) // 2, TILE - size)
                canvas.alpha_composite(layer, offset)
            result.paste(canvas, box[:2])
    # 透明の所を近くの色で埋めて、縮小のにじみを防ぐ
    pixels = np.asarray(result, dtype=np.float32).copy()
    solid = pixels[..., 3] > 200
    pixels[~solid, :3] = pixels[solid][:, :3].mean(axis=0) * 0.7
    Image.fromarray(pixels.astype(np.uint8), "RGBA").save(out)


if __name__ == "__main__":
    main(*sys.argv[1:])
