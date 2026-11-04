#!/usr/bin/env python3
"""葉の塊の下絵を塗る。段ごとの葉の形を、付け根が暗く先が明るい色で描く。

使い方: python leaf_paint.py <layout.json> <guide.png>
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw

# 段ごとの (付け根の色, 先の色)。上の段ほど明るい。
TIER_COLORS = (((150, 172, 58), (226, 228, 122)),
               ((104, 150, 54), (204, 216, 98)),
               ((56, 118, 52), (156, 194, 78)),
               ((26, 86, 50), (84, 158, 70)))
BACKGROUND = (30, 56, 36)
OUTLINE = (24, 60, 34)


def leaf_outline(rect, rows):
    x, y, w, h = rect
    left = [(x + (0.5 - width / 2) * w, y + (1.0 - t) * h) for t, width in rows]
    right = [(x + (0.5 + width / 2) * w, y + (1.0 - t) * h) for t, width in rows]
    return left + right[-2::-1]


def main():
    layout = json.load(open(sys.argv[1], encoding="utf8"))
    rows = layout["rows"]
    image = Image.new("RGB", (1024, 1024), BACKGROUND)
    for tier, tiles in enumerate(layout["tiles"]):
        for rect in tiles:
            x, y, w, h = rect
            base, tip = np.array(TIER_COLORS[tier][0]), np.array(TIER_COLORS[tier][1])
            ramp = np.linspace(1.0, 0.0, h)[:, None, None] ** 0.8
            color = (base + (tip - base) * ramp) * np.ones((h, w, 1))
            mask = Image.new("L", (1024, 1024), 0)
            ImageDraw.Draw(mask).polygon(leaf_outline(rect, rows), fill=255)
            layer = Image.new("RGB", (1024, 1024))
            layer.paste(Image.fromarray(color.astype(np.uint8)), (x, y))
            image.paste(layer, (0, 0), mask)
            draw = ImageDraw.Draw(image)
            draw.line(leaf_outline(rect, rows) + [leaf_outline(rect, rows)[0]], fill=OUTLINE, width=4)
    dx, dy, dw, dh = layout["dark"]
    ImageDraw.Draw(image).rectangle((dx, dy, dx + dw, dy + dh), fill=(38, 84, 46))
    image.save(sys.argv[2])


if __name__ == "__main__":
    main()
