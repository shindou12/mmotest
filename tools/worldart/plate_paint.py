#!/usr/bin/env python3
"""葉の房の板（1 枚の絵を板全体に貼る）の下絵と、塗った絵の切り抜きを作る。

下絵: python plate_paint.py guide <guide.png> <mask.png>
切抜: python plate_paint.py build <塗った絵.png> <mask.png> <出力.png> [明暗の強さ 既定 0.7]

下絵は丸い葉を放射状に 2 段重ねる。透明度は塗った絵からでなく下絵の輪郭で決める。
"""
import math
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
BACKGROUND = (22, 50, 32)
# (葉の数, 中心からの距離, 葉の長さ, 葉の幅, 根元の色, 先の色, 向きのずれ)
RINGS = ((10, 0.0, 0.47, 0.215, (86, 124, 48), (148, 176, 66), 0.0),
         (7, 0.0, 0.31, 0.19, (126, 156, 58), (196, 210, 92), 0.45))


def leaf_points(angle, offset, length, width):
    points_left, points_right = [], []
    for i in range(33):
        t = i / 32
        half = width * math.sin(min(t / 0.55, (1 - t) / 0.45 * 1.0, 1.0) * math.pi / 2) ** 0.75 / 2
        forward = offset + length * t
        points_left.append((forward, -half))
        points_right.append((forward, half))
    outline = points_left + points_right[::-1]
    c, s = math.cos(angle), math.sin(angle)
    return [((0.5 + f * c - w * s) * SIZE, (0.5 + f * s + w * c) * SIZE) for f, w in outline]


def make_guide(guide_path, mask_path):
    image = Image.new("RGB", (SIZE, SIZE), BACKGROUND)
    mask = Image.new("L", (SIZE, SIZE), 0)
    for count, offset, length, width, base, tip, turn in RINGS:
        for index in range(count):
            angle = turn + index * 2 * math.pi / count
            points = leaf_points(angle, offset, length, width)
            layer = Image.new("L", (SIZE, SIZE), 0)
            ImageDraw.Draw(layer).polygon(points, fill=255)
            # 中心が暗く、先が明るい。葉の境が読めるよう縁を暗くする
            yy, xx = np.mgrid[0:SIZE, 0:SIZE]
            radius = np.hypot(xx / SIZE - 0.5, yy / SIZE - 0.5) / max(offset + length, 1e-3)
            ramp = np.clip(radius, 0, 1)[..., None]
            color = np.array(base, dtype=np.float32) + (np.array(tip, dtype=np.float32) - np.array(base)) * ramp
            inside = np.asarray(layer.filter(ImageFilter.GaussianBlur(9)), dtype=np.float32) / 255.0
            color = color * (0.62 + 0.38 * np.clip((inside - 0.5) * 2.4, 0, 1))[..., None]
            image.paste(Image.fromarray(color.astype(np.uint8)), (0, 0), layer)
            mask.paste(255, (0, 0), layer)
    image.save(guide_path)
    mask.save(mask_path)


def build(painted_path, mask_path, out_path, contrast="0.7"):
    painted = Image.open(painted_path).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
    pixels = np.asarray(painted, dtype=np.float32)
    mask = np.asarray(Image.open(mask_path).convert("L"), dtype=np.float32) / 255.0
    mean = pixels[mask > 0.5].mean(axis=0)
    pixels = np.clip(mean + (pixels - mean) * float(contrast), 0, 255)
    result = Image.fromarray(pixels.astype(np.uint8))
    result.putalpha(Image.open(mask_path).convert("L").filter(ImageFilter.GaussianBlur(1.0)))
    result.save(out_path)


if __name__ == "__main__":
    {"guide": make_guide, "build": build}[sys.argv[1]](*sys.argv[2:])
