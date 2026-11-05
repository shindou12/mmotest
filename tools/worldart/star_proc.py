#!/usr/bin/env python3
"""RO3 の葉の作りを確かめるための、機械で描いた星形の葉の小枝（完成の絵ではない）。

確かめること: 指の細い小さな星を、暗・中・明の 3 層に重ねるだけで、あの雰囲気になるか。

使い方: python star_proc.py <出力.png> [--finger 0.26] [--size 0.2] [--seed 1]
"""
import argparse
import math
import random

from PIL import Image, ImageDraw

args = argparse.ArgumentParser()
args.add_argument("out")
args.add_argument("--finger", type=float, default=0.26, help="指の根元の幅（長さに対して）")
args.add_argument("--size", type=float, default=0.2, help="葉の直径（枠の幅に対して）")
args.add_argument("--seed", type=int, default=1)
args.add_argument("--soft", type=float, default=0.0, help="奥の層を手前の色へ寄せる量 0〜1")
args = args.parse_args()

SCALE = 2
TILE = 512 * SCALE
# 層: 葉の数, 色, 根元の色, 大きさの倍率
LAYERS = (
    (22, (58, 108, 58), (46, 90, 54), 1.0),
    (18, (102, 160, 66), (82, 136, 62), 1.0),
    (13, (172, 218, 84), (132, 186, 72), 1.05),
)
if args.soft:
    # 奥の 2 層を手前の色へ寄せて、葉どうしの差を縮める
    front = LAYERS[2][1]
    LAYERS = tuple(
        (count, tuple(int(c + (f - c) * args.soft * (2 - i) / 2) for c, f in zip(color, front)),
         tuple(int(c + (f - c) * args.soft * (2 - i) / 2) for c, f in zip(base, front)), scale)
        for i, (count, color, base, scale) in enumerate(LAYERS))
BACKGROUND = (50, 96, 54)
rng = random.Random(args.seed)


def star_points(cx, cy, radius, angle, scale_inner=1.0):
    points = []
    lengths = (1.0, 0.82, 0.62, 0.62, 0.82)  # 真ん中の指が長く、付け根の指が短い
    for finger in range(5):
        direction = angle + finger * math.tau / 5
        length = radius * lengths[finger] * rng.uniform(0.92, 1.05) * scale_inner
        half = args.finger * length * 0.5
        # 付け根の谷、指の腹、指の先
        valley = direction - math.tau / 10
        points.append((cx + math.cos(valley) * radius * 0.16, cy + math.sin(valley) * radius * 0.16))
        side = (-math.sin(direction), math.cos(direction))
        belly = 0.42
        points.append((cx + math.cos(direction) * length * belly - side[0] * half,
                       cy + math.sin(direction) * length * belly - side[1] * half))
        points.append((cx + math.cos(direction) * length, cy + math.sin(direction) * length))
        points.append((cx + math.cos(direction) * length * belly + side[0] * half,
                       cy + math.sin(direction) * length * belly + side[1] * half))
    return points


def draw_tile(draw, x0, y0):
    radius = TILE * args.size / 2
    for count, color, base, scale in LAYERS:
        for _ in range(count):
            # 枠の下を根元に、上半分の扇に散らす
            theta = rng.uniform(-math.pi * 0.95, -math.pi * 0.05)
            spread = math.sqrt(rng.random()) * (TILE / 2 - radius * 1.05)
            cx = x0 + TILE / 2 + math.cos(theta) * spread
            cy = y0 + TILE * 0.82 + math.sin(theta) * spread * 1.35
            cy = max(y0 + radius * 1.05, min(y0 + TILE - radius * 1.05, cy))
            this_radius = radius * scale * rng.uniform(0.82, 1.12)
            angle = rng.uniform(0, math.tau)
            jitter = rng.uniform(0.94, 1.06)
            draw.polygon(star_points(cx, cy, this_radius, angle), fill=tuple(int(min(255, c * jitter)) for c in color))
            draw.polygon(star_points(cx, cy, this_radius, angle, 0.42), fill=tuple(int(min(255, c * jitter)) for c in base))


sheet = Image.new("RGBA", (TILE * 2, TILE * 2), (*BACKGROUND, 0))
draw = ImageDraw.Draw(sheet)
for row in range(2):
    for column in range(2):
        draw_tile(draw, column * TILE, row * TILE)
sheet.resize((1024, 1024), Image.LANCZOS).save(args.out)
