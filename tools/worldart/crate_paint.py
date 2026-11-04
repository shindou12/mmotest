#!/usr/bin/env python3
"""木箱の展開図に、形の情報を入れた下絵を塗る。image_gen の入力にする。

使い方: python crate_paint.py <layout.json> <ao.png> <edge.png> <guide.png>
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw

AO_FLOOR, EDGE_LIGHT, EDGE_THRESHOLD = 0.45, 0.30, 0.55
COLORS = {"panel": (122, 78, 50), "beam": (178, 122, 78), "brace": (170, 116, 74),
          "plate": (128, 120, 116), "dark": (26, 18, 14)}
BOARDS = 4
HIDDEN = (62, 42, 30)
PLATE_HIDE, BRACE_HIDE, PANEL_HIDE = 66, 48, 16   # 金具の下・枠の下に隠れる幅（画素）


def main():
    layout_path, ao_path, edge_path, out_path = sys.argv[1:5]
    parts = json.load(open(layout_path, encoding="utf8"))["parts"]
    image = Image.new("RGB", (1024, 1024), (40, 40, 44))
    draw = ImageDraw.Draw(image)
    for part in parts:
        x, y, w, h = part["rect"]
        draw.rectangle((x, y, x + w - 1, y + h - 1), fill=COLORS[part["kind"]])
        if part["kind"] == "panel":
            for board in range(1, BOARDS):
                line = x + w * board // BOARDS
                draw.line((line, y, line, y + h - 1), fill=(58, 34, 22), width=5)
    array = np.asarray(image, dtype=np.float32) / 255.0
    ao = np.asarray(Image.open(ao_path).convert("L"), dtype=np.float32) / 255.0
    edge = np.asarray(Image.open(edge_path).convert("L"), dtype=np.float32) / 255.0
    edge = np.clip((edge - EDGE_THRESHOLD) / (1.0 - EDGE_THRESHOLD), 0.0, 1.0)
    shaded = array * (AO_FLOOR + (1.0 - AO_FLOOR) * ao)[..., None] + EDGE_LIGHT * edge[..., None]
    mask = np.zeros((1024, 1024), dtype=bool)
    for part in parts:
        x, y, w, h = part["rect"]
        if part["kind"] in ("panel", "beam", "brace"):
            mask[y:y + h, x:x + w] = True
    result = np.where(mask[..., None], shaded, array)
    out = Image.fromarray((np.clip(result, 0, 1) * 255).astype(np.uint8))
    # 組み立てると隠れる所は線が絵を乱すので、平らに塗りつぶす。
    hide = ImageDraw.Draw(out)
    for part in parts:
        x, y, w, h = part["rect"]
        if part["kind"] == "beam":
            for x0, x1 in ((x, x + PLATE_HIDE), (x + w - PLATE_HIDE, x + w)):
                hide.rectangle((x0, y, x1 - 1, y + h - 1), fill=HIDDEN)
        elif part["kind"] == "brace":
            for x0, x1 in ((x, x + BRACE_HIDE), (x + w - BRACE_HIDE, x + w)):
                hide.rectangle((x0, y, x1 - 1, y + h - 1), fill=HIDDEN)
        elif part["kind"] == "panel":
            for box in ((x, y, x + w, y + PANEL_HIDE), (x, y + h - PANEL_HIDE, x + w, y + h),
                        (x, y, x + PANEL_HIDE, y + h), (x + w - PANEL_HIDE, y, x + w, y + h)):
                hide.rectangle((box[0], box[1], box[2] - 1, box[3] - 1), fill=HIDDEN)
    # 金具は全部の面が同じ絵を使うので焼かない。四隅の鋲の印だけ描く。
    draw = ImageDraw.Draw(out)
    for part in parts:
        if part["kind"] != "plate":
            continue
        x, y, w, h = part["rect"]
        draw.rectangle((x, y, x + w - 1, y + h - 1), outline=(70, 64, 62), width=5)
        for u in (0.26, 0.74):
            for v in (0.26, 0.74):
                cx, cy = x + w * u, y + h * v
                draw.ellipse((cx - 13, cy - 13, cx + 13, cy + 13), fill=(82, 74, 70))
                draw.ellipse((cx - 6, cy - 8, cx + 4, cy + 2), fill=(170, 160, 150))
    out.save(out_path)


if __name__ == "__main__":
    main()
