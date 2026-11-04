#!/usr/bin/env python3
"""広葉樹の下絵を塗る。葉は付け根が暗く先が明るく、縁に厚みの影を入れる。幹は縦に流れる筋。

使い方: python tree_paint.py <layout.json> <guide.png>
"""
import json
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# 段ごとの (付け根の色, 先の色)。上の段ほど明るい。
TIER_COLORS = (((148, 172, 56), (226, 228, 112)),
               ((106, 152, 52), (206, 218, 94)),
               ((60, 124, 50), (162, 200, 78)),
               ((28, 92, 50), (96, 168, 72)))
BACKGROUND = (22, 50, 32)
BARK_BASE = (158, 98, 56)
RIM_BLUR, RIM_DARK = 14, 0.62   # 縁の厚みの影の幅と濃さ


def leaf_outline(rect, rows):
    x, y, w, h = rect
    left = [(x + (0.5 - width / 2) * w, y + (1.0 - t) * h) for t, width in rows]
    right = [(x + (0.5 + width / 2) * w, y + (1.0 - t) * h) for t, width in rows]
    return left + right[-2::-1]


def paint_leaf(image, rect, rows, colors):
    x, y, w, h = rect
    base, tip = np.array(colors[0], dtype=np.float32), np.array(colors[1], dtype=np.float32)
    ramp = np.linspace(1.0, 0.0, h, dtype=np.float32)[:, None, None] ** 0.75
    color = (base + (tip - base) * ramp) * np.ones((h, w, 1), dtype=np.float32)
    mask = Image.new("L", (w, h), 0)
    outline = [(px - x, py - y) for px, py in leaf_outline(rect, rows)]
    ImageDraw.Draw(mask).polygon(outline, fill=255)
    inside = np.asarray(mask.filter(ImageFilter.GaussianBlur(RIM_BLUR)), dtype=np.float32) / 255.0
    shade = RIM_DARK + (1.0 - RIM_DARK) * np.clip((inside - 0.5) * 2.2, 0.0, 1.0)
    color = color * shade[..., None]
    image.paste(Image.fromarray(color.astype(np.uint8)), (x, y), mask)


def paint_bark(image, rect):
    x, y, w, h = rect
    rng = random.Random(3)
    bark = Image.new("RGB", (w, h), BARK_BASE)
    draw = ImageDraw.Draw(bark)
    for _ in range(90):
        sx = rng.uniform(0, w)
        sy = rng.uniform(-80, h)
        length = rng.uniform(90, 300)
        tone = rng.uniform(0.62, 1.28)
        fill = tuple(int(min(255, c * tone)) for c in BARK_BASE)
        points = [(sx + rng.uniform(-6, 6), sy + length * i / 4) for i in range(5)]
        draw.line(points, fill=fill, width=int(rng.uniform(6, 20)))
    image.paste(bark.filter(ImageFilter.GaussianBlur(1.5)), (x, y))


def main():
    layout = json.load(open(sys.argv[1], encoding="utf8"))
    rows = layout["rows"]
    image = Image.new("RGB", (1024, 1024), BACKGROUND)
    for tier, tiles in enumerate(layout["tiles"]):
        for rect in tiles:
            paint_leaf(image, rect, rows, TIER_COLORS[tier])
    dx, dy, dw, dh = layout["dark"]
    ImageDraw.Draw(image).rectangle((dx, dy, dx + dw, dy + dh), fill=(38, 84, 46))
    paint_bark(image, layout["bark"])
    image.save(sys.argv[2])


if __name__ == "__main__":
    main()
