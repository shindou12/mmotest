#!/usr/bin/env python3
"""扇形に広がる葉の房を 2x2 に並べた下絵と、塗った絵の切り抜きを作る。

下絵: python plate_fan.py guide <guide.png> <mask.png>
線画: python plate_fan.py line <line.png>
外枠: python plate_fan.py frame <mask.png> <frame.png>
切抜: python plate_fan.py build <塗った絵.png> <mask.png> <出力.png> [明暗の強さ 既定 0.7]

放射状の房は中心が見えて花に読めるので、根元を下にして上へ広げる（絵の上が木の外側）。
4 枚で葉の数と広がりを変える。透明度は下絵の輪郭で決める。
"""
import math
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
TILE = SIZE // 2
BACKGROUND = (22, 50, 32)
BASE = (0.5, 0.97)   # 房の根元（1 枚の中の割合）
# 段ごとの (葉の長さ, 葉の幅, 根元の色, 先の色)。先に描く外の段が暗い
ROWS = (((0.88, 0.27), (70, 108, 44), (126, 160, 60)),
        ((0.66, 0.25), (104, 142, 52), (168, 192, 74)),
        ((0.44, 0.22), (138, 168, 60), (208, 218, 98)))
# 4 枚それぞれの (段ごとの葉の数, 広がりの度, 乱数)
TILES = (((7, 5, 3), 150, 1), ((6, 4, 2), 124, 2), ((8, 6, 3), 172, 3), ((5, 4, 3), 110, 4))


def leaf_points(origin, angle, length, width):
    left, right = [], []
    for i in range(33):
        t = i / 32
        half = width * math.sin(min(t / 0.58, (1 - t) / 0.42, 1.0) * math.pi / 2) ** 0.75 / 2
        left.append((length * t, -half))
        right.append((length * t, half))
    c, s = math.cos(angle), math.sin(angle)
    return [(origin[0] + f * c - w * s, origin[1] + f * s + w * c) for f, w in left + right[::-1]]


def paint_tile(tile_index):
    counts, spread, seed = TILES[tile_index]
    rng = random.Random(seed)
    image = Image.new("RGB", (TILE, TILE), BACKGROUND)
    mask = Image.new("L", (TILE, TILE), 0)
    origin = (BASE[0] * TILE, BASE[1] * TILE)
    yy, xx = np.mgrid[0:TILE, 0:TILE]
    for row, ((length, width), base, tip) in enumerate(ROWS):
        count = counts[row]
        row_spread = spread * (1 - row * 0.16)
        for index in range(count):
            share = (index + 0.5) / count - 0.5
            angle = math.radians(-90 + share * row_spread + rng.uniform(-7, 7))
            # 上へ向く葉ほど長い。下の角に収める
            reach = length * (0.72 + 0.28 * math.cos(math.radians(share * row_spread))) * rng.uniform(0.92, 1.05)
            # 枠で葉が切れないよう、横へ向く葉は枠の内側で止める
            reach = min(reach, 0.40 / max(abs(math.cos(angle)), 1e-3))
            points = leaf_points(origin, angle, reach * TILE, width * TILE * rng.uniform(0.92, 1.08))
            layer = Image.new("L", (TILE, TILE), 0)
            ImageDraw.Draw(layer).polygon(points, fill=255)
            ramp = np.clip(np.hypot(xx - origin[0], yy - origin[1]) / (reach * TILE), 0, 1)[..., None]
            color = np.array(base, dtype=np.float32) + (np.array(tip, dtype=np.float32) - np.array(base)) * ramp
            inside = np.asarray(layer.filter(ImageFilter.GaussianBlur(6)), dtype=np.float32) / 255.0
            color = color * (0.62 + 0.38 * np.clip((inside - 0.5) * 2.4, 0, 1))[..., None]
            image.paste(Image.fromarray(color.astype(np.uint8)), (0, 0), layer)
            mask.paste(255, (0, 0), layer)
    return image, mask


def make_guide(guide_path, mask_path):
    guide = Image.new("RGB", (SIZE, SIZE), BACKGROUND)
    full_mask = Image.new("L", (SIZE, SIZE), 0)
    for index in range(4):
        image, mask = paint_tile(index)
        position = ((index % 2) * TILE, (index // 2) * TILE)
        guide.paste(image, position)
        full_mask.paste(mask, position)
    guide.save(guide_path)
    full_mask.save(mask_path)


def line_tile(tile_index):
    """葉の輪郭の線だけの枠。手前の葉が奥の線を隠す。"""
    counts, spread, seed = TILES[tile_index]
    rng = random.Random(seed)
    image = Image.new("RGB", (TILE, TILE), (240, 240, 236))
    origin = (BASE[0] * TILE, BASE[1] * TILE)
    draw = ImageDraw.Draw(image)
    for row, ((length, width), _, _) in enumerate(ROWS):
        count = counts[row]
        row_spread = spread * (1 - row * 0.16)
        for index in range(count):
            share = (index + 0.5) / count - 0.5
            angle = math.radians(-90 + share * row_spread + rng.uniform(-7, 7))
            reach = length * (0.72 + 0.28 * math.cos(math.radians(share * row_spread))) * rng.uniform(0.92, 1.05)
            reach = min(reach, 0.40 / max(abs(math.cos(angle)), 1e-3))
            points = leaf_points(origin, angle, reach * TILE, width * TILE * rng.uniform(0.92, 1.08))
            draw.polygon(points, fill=(240, 240, 236))
            draw.line(points + points[:1], fill=(40, 40, 40), width=3)
    return image


def make_line_guide(out_path):
    """線画だけの土台。"""
    guide = Image.new("RGB", (SIZE, SIZE), (240, 240, 236))
    for index in range(4):
        guide.paste(line_tile(index), ((index % 2) * TILE, (index // 2) * TILE))
    guide.save(out_path)


def make_frame_guide(mask_path, out_path):
    """房の外側の輪郭だけの土台。中は何も決めない。"""
    mask = Image.open(mask_path).convert("L")
    edge = np.asarray(mask.filter(ImageFilter.MaxFilter(7)), dtype=np.int16) - np.asarray(mask, dtype=np.int16)
    pixels = np.full((SIZE, SIZE, 3), 240, dtype=np.uint8)
    pixels[edge > 128] = (40, 40, 40)
    Image.fromarray(pixels).save(out_path)


def build(painted_path, mask_path, out_path, contrast="0.7"):
    pixels = np.asarray(Image.open(painted_path).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS), dtype=np.float32)
    mask = Image.open(mask_path).convert("L")
    inside = np.asarray(mask, dtype=np.float32) > 128
    mean = pixels[inside].mean(axis=0)
    result = Image.fromarray(np.clip(mean + (pixels - mean) * float(contrast), 0, 255).astype(np.uint8))
    result.putalpha(mask.filter(ImageFilter.GaussianBlur(1.0)))
    result.save(out_path)


if __name__ == "__main__":
    {"guide": make_guide, "line": make_line_guide, "frame": make_frame_guide,
     "build": build}[sys.argv[1]](*sys.argv[2:])
