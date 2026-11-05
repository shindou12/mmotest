#!/usr/bin/env python3
"""細い葉が立ち上がる草の房の絵を機械で描く（確かめ用。完成の絵ではない）。

2x2 の枠に房を 1 つずつ。奥の葉は暗く、手前は明るい。根元は暗く、先は明るい。

使い方: python blade_proc.py <出力.png> [--blades 18] [--seed 3] [--width 0.052] [--pale]
"""
import argparse
import math
import random

import numpy as np
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument("out")
parser.add_argument("--blades", type=int, default=18)
parser.add_argument("--seed", type=int, default=3)
parser.add_argument("--width", type=float, default=0.052, help="葉の幅（枠に対して）")
parser.add_argument("--pale", action="store_true", help="地面との差を小さくする")
args = parser.parse_args()

SCALE = 2
TILE = 512 * SCALE
SEGMENTS = 7
ROOT_BACK, ROOT_FRONT = (62, 104, 48), (98, 146, 52)
TIP_BACK, TIP_FRONT = (112, 164, 62), (196, 226, 96)
if args.pale:
    # 地面との差を小さくする色
    ROOT_BACK, ROOT_FRONT = (138, 178, 84), (156, 194, 90)
    TIP_BACK, TIP_FRONT = (168, 204, 100), (216, 236, 128)
rng = random.Random(args.seed)


def mix(a, b, t):
    return tuple(int(x + (y - x) * t) for x, y in zip(a, b))


def blade(draw, x0, y0, base_x, lean, length, width, root, tip):
    """先へ細くなる弧の葉を、節ごとに色を変えて描く。"""
    previous = None
    for segment in range(SEGMENTS + 1):
        t = segment / SEGMENTS
        x = x0 + base_x + lean * t * t * TILE
        y = y0 + TILE - 8 - length * t * TILE
        half = width * TILE * (1 - t) ** 0.8 / 2
        left, right = (x - half, y), (x + half, y)
        if previous:
            draw.polygon([previous[0], previous[1], right, left], fill=mix(root, tip, t))
        previous = (left, right)


def tuft(draw, x0, y0):
    order = sorted(range(args.blades), key=lambda _: rng.random())
    for layer, _ in enumerate(order):
        depth = layer / max(args.blades - 1, 1)  # 0=奥 1=手前
        spread = rng.uniform(-1, 1)
        base_x = TILE / 2 + spread * TILE * 0.17
        lean = spread * rng.uniform(0.12, 0.3)
        length = rng.uniform(0.5, 0.92) * (0.82 + 0.18 * depth)
        width = rng.uniform(args.width * 0.75, args.width * 1.25)
        root = mix(ROOT_BACK, ROOT_FRONT, depth)
        tip = mix(TIP_BACK, TIP_FRONT, depth)
        blade(draw, x0, y0, base_x, lean, length, width, root, tip)


sheet = Image.new("RGBA", (TILE * 2, TILE * 2), (98, 146, 60, 0))
draw = ImageDraw.Draw(sheet)
for row in range(2):
    for column in range(2):
        tuft(draw, column * TILE, row * TILE)
small = sheet.resize((1024, 1024), Image.LANCZOS)
# 縮小で透明の所の色が黒くなる。そのままだと遠くで葉が黒ずむので、葉の平均の色で埋める
pixels = np.asarray(small, dtype=np.float32).copy()
solid = pixels[..., 3] > 200
pixels[~solid, :3] = pixels[solid][:, :3].mean(axis=0)
Image.fromarray(pixels.astype(np.uint8), "RGBA").save(args.out)
