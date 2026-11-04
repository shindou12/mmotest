#!/usr/bin/env python3
"""樽の色の絵を 1 枚に塗る。生成した木と金属の絵を、板・たが・縁・ふた・鋲の場所へ置く。

光・落ち影・AO は焼かない。入れる明暗は塗りの色面だけ。
使い方: python barrel_paint.py <layout.json> <出力.png>
"""
import json
import math
import random
import sys

import numpy as np
from PIL import Image

SIZE = 1024
ART = "art/painted-gen/barrel_m0164/"

# 色と強さはここにまとめる。sRGB。
WOOD_COLOR = (205, 145, 100)
WOOD_DARK_LINE = (98, 58, 44)
WOOD_LINE_WIDTH = 10         # 画素。1024 で 1m ≈ 427 画素。ゲームの画面で約 2 画素
STAVE_VALUE_RANGE = 0.07     # 板ごとの明るさの違い
LOWER_ZONE_VALUE = 0.92      # 胴の下側の暗い色面
LOWER_ZONE_HEIGHT = 0.46     # 胴の高さに対する色面の境
RIM_VALUE = 1.10
WALL_VALUE = 0.70
LID_VALUE = 0.94
METAL_COLOR = (130, 108, 116)
METAL_EDGE_LIGHT = 1.25
METAL_EDGE_DARK = 0.72
RIVET_COLORS = ((92, 72, 80), (168, 138, 136), (232, 208, 196))


def load_tile(path, size, color):
    """絵を読み、平均が color になるように色を合わせる。"""
    tile = Image.open(path).convert("RGB").resize((size, size), Image.LANCZOS)
    a = np.asarray(tile).astype(np.float32)
    return a * (np.array(color, np.float32) / a.reshape(-1, 3).mean(axis=0))


def sample(tile, x, y, w, h):
    """繰り返しの絵から矩形を切り出す。"""
    ys = (np.arange(h) + y) % tile.shape[0]
    xs = (np.arange(w) + x) % tile.shape[1]
    return tile[np.ix_(ys, xs)]


def wobble(rng, length, amount, freq):
    """手で引いた線のゆれ。"""
    phases = [rng.uniform(0, 6.28) for _ in range(3)]
    t = np.arange(length) / length * 2 * math.pi
    return amount * (np.sin(freq * t + phases[0]) * 0.6 + np.sin(freq * 2.3 * t + phases[1]) * 0.3
                     + np.sin(freq * 4.7 * t + phases[2]) * 0.1)


def v_to_y(v):
    return int(round((1.0 - v) * SIZE))


def paint_body(atlas, wood, edges, rng):
    """胴（上半分）: 板ごとに絵の場所と明るさを変え、境に濃い線を引く。"""
    y0, y1 = v_to_y(1.0), v_to_y(0.5)
    height = y1 - y0
    bounds = list(edges) + [1.0]
    xs = [int(round(u * SIZE)) for u in bounds]
    for index in range(len(edges)):
        x0, x1 = xs[index], xs[index + 1]
        patch = sample(wood, rng.randrange(1024), rng.randrange(1024), x1 - x0, height).copy()
        patch *= 1.0 + rng.uniform(-STAVE_VALUE_RANGE, STAVE_VALUE_RANGE)
        # 下側の色面。板ごとに高さを変え、境をゆらす。
        border = (1.0 - LOWER_ZONE_HEIGHT + rng.uniform(-0.06, 0.06)) * height
        line = border + wobble(rng, x1 - x0, height * 0.025, 2.0)
        for column in range(x1 - x0):
            patch[int(line[column]):, column] *= LOWER_ZONE_VALUE
        atlas[y0:y1, x0:x1] = patch
    # 板の境の線。両側に細い明るい縁を添える。
    for x in xs[:-1]:
        shift = wobble(rng, height, 2.5, 1.5)
        for row in range(height):
            center = x + int(shift[row])
            half = WOOD_LINE_WIDTH // 2
            for offset, factor in ((-half - 6, 1.08), (half + 1, 1.10)):
                a, b = (center + offset) % SIZE, (center + offset + 5) % SIZE
                if a < b:
                    atlas[y0 + row, a:b] *= factor
            for column in range(center - half, center + half):
                atlas[y0 + row, column % SIZE] = WOOD_DARK_LINE


def paint_band(atlas, metal, v_low, v_high, rng):
    """たが: 上の縁を明るく、下の縁を暗く塗る。"""
    y0, y1 = v_to_y(v_high), v_to_y(v_low)
    band = sample(metal, rng.randrange(1024), rng.randrange(1024), SIZE, y1 - y0 + 8).copy()
    atlas[y0 - 4:y1 + 4] = band
    atlas[y0 - 4:y0 + 8] *= METAL_EDGE_LIGHT
    atlas[y1 - 8:y1 + 4] *= METAL_EDGE_DARK


def paint_rim(atlas, wood, edges, rng):
    """縁の上面と内壁: 板の頭として、胴と同じ位置に線を引く。"""
    xs = [int(round(u * SIZE)) for u in list(edges) + [1.0]]
    for v_low, v_high, value in ((0.24, 0.28, RIM_VALUE), (0.20, 0.24, WALL_VALUE)):
        y0, y1 = v_to_y(v_high), v_to_y(v_low)
        atlas[y0:y1] = sample(wood, rng.randrange(1024), rng.randrange(1024), SIZE, y1 - y0) * value
        for x in xs[:-1]:
            atlas[y0:y1, x - 5:x + 5] = WOOD_DARK_LINE


def paint_lid(atlas, wood, rng):
    """ふた: 見本のように斜めの板を 4 枚。"""
    size = int(0.2 * SIZE)
    x0, y0 = 0, v_to_y(0.2)
    patch = Image.fromarray(np.clip(sample(wood, rng.randrange(1024), 0, size * 2, size * 2), 0, 255).astype(np.uint8))
    patch = patch.rotate(45, resample=Image.BICUBIC).crop((size // 2, size // 2, size // 2 + size, size // 2 + size))
    area = np.asarray(patch).astype(np.float32) * LID_VALUE
    yy, xx = np.mgrid[0:size, 0:size]
    distance = (xx + yy) / math.sqrt(2.0)
    for line in (0.35, 0.72, 1.08):
        area[np.abs(distance - line * size) < 4] = WOOD_DARK_LINE
    atlas[y0:y0 + size, x0:x0 + size] = area


def paint_rivet(atlas):
    """鋲: 根元が暗く、頂が明るい縦の階調。UV は u = 0.42、v = 0.02〜0.08。"""
    x0, x1 = int(0.40 * SIZE), int(0.44 * SIZE)
    stops = [(0.02, RIVET_COLORS[0]), (0.05, RIVET_COLORS[1]), (0.08, RIVET_COLORS[2])]
    for y in range(v_to_y(0.10), v_to_y(0.0)):
        v = 1.0 - y / SIZE
        if v <= stops[0][0]:
            color = stops[0][1]
        elif v >= stops[-1][0]:
            color = stops[-1][1]
        else:
            low, high = (stops[0], stops[1]) if v < stops[1][0] else (stops[1], stops[2])
            t = (v - low[0]) / (high[0] - low[0])
            color = [low[1][i] * (1 - t) + high[1][i] * t for i in range(3)]
        atlas[y, x0:x1] = color


def main():
    layout_path, out = sys.argv[1], sys.argv[2]
    edges = json.load(open(layout_path, encoding="utf8"))["stave_edges"]
    rng = random.Random(11)
    # 絵 1 枚が約 1.2m になる大きさ（1m ≈ 427 画素）。
    wood = load_tile(ART + "wood.png", 512, WOOD_COLOR)
    metal = load_tile(ART + "metal.png", 512, METAL_COLOR)
    atlas = np.zeros((SIZE, SIZE, 3), np.float32)
    atlas[:] = WOOD_DARK_LINE
    paint_body(atlas, wood, edges, rng)
    paint_band(atlas, metal, 0.40, 0.48, rng)
    paint_band(atlas, metal, 0.30, 0.38, rng)
    paint_rim(atlas, wood, edges, rng)
    paint_lid(atlas, wood, rng)
    paint_rivet(atlas)
    Image.fromarray(np.clip(atlas, 0, 255).astype(np.uint8)).save(out)


if __name__ == "__main__":
    main()
