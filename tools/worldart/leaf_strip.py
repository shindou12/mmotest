#!/usr/bin/env python3
"""帯状の葉の絵（8 列を葉が共有する）を、普通の比率で塗れるように下絵と組み立てに分ける。

下絵: python leaf_strip.py guide <元の帯.png> <guide.png>
組立: python leaf_strip.py build <塗った絵.png> <帯.png> [葉の中の明暗の強さ 既定 1.0]

塗る絵は 1536x1024 で 4 列 2 行、1 枚 384x512（UV 上の葉の縦横比に合わせた）。
帯は 2048x1024、1 列 256 幅。上が葉の先、下が根元。透明度は下の輪郭で決める。
"""
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

TILE_W, TILE_H = 384, 512
STRIP_W, STRIP_H, COLUMN = 2048, 1024, 256
BACKGROUND = (22, 50, 32)
TIP_V, BASE_V = 0.05, 0.82      # 葉の先と根元（絵の上からの割合）。元の UV の輪郭の内側
WIDEST_V, HALF_WIDTH = 0.47, 0.47
GUIDE_GROW = 1.06               # 下絵は切り抜きより少し大きく塗らせて、縁に背景を残さない


def outline(width, height, grow=1.0):
    """丸みのある先のとがった葉の輪郭。"""
    points_left, points_right = [], []
    for i in range(49):
        t = i / 48
        v = TIP_V + (BASE_V - TIP_V) * t
        # t=0 が先、t=1 が根元。幅が一番広い位置まで丸く広がる
        widest = (WIDEST_V - TIP_V) / (BASE_V - TIP_V)
        s = t / widest if t < widest else (1 - t) / (1 - widest)
        half = HALF_WIDTH * grow * np.sin(s * np.pi / 2) ** 0.72
        center_v = (TIP_V + BASE_V) / 2
        y = (center_v + (v - center_v) * grow) * height
        points_left.append(((0.5 - half) * width, y))
        points_right.append(((0.5 + half) * width, y))
    return points_left + points_right[::-1]


def tile_origin(index):
    return (index % 4) * TILE_W, (index // 4) * TILE_H


def make_guide(strip_path, out_path):
    strip = np.asarray(Image.open(strip_path).convert("RGB"), dtype=np.float32)
    column = strip.shape[1] // 8
    image = Image.new("RGB", (TILE_W * 4, TILE_H * 2), BACKGROUND)
    for index in range(8):
        tone = strip[:, index * column:(index + 1) * column].mean(axis=(0, 1))
        ramp = np.linspace(1.14, 0.70, TILE_H, dtype=np.float32)[:, None, None]
        leaf = np.clip(tone[None, None, :] * ramp * np.ones((TILE_H, TILE_W, 1)), 0, 255)
        mask = Image.new("L", (TILE_W, TILE_H), 0)
        ImageDraw.Draw(mask).polygon(outline(TILE_W, TILE_H, GUIDE_GROW), fill=255)
        image.paste(Image.fromarray(leaf.astype(np.uint8)), tile_origin(index), mask)
    image.save(out_path)


def soften_tile(tile, amount):
    """葉 1 枚の中の明暗を平均へ寄せる。ゲームの距離では 1 枚の中の差が騒がしく見えるため。"""
    pixels = np.asarray(tile, dtype=np.float32)
    mean = pixels.mean(axis=(0, 1), keepdims=True)
    return Image.fromarray(np.clip(mean + (pixels - mean) * amount, 0, 255).astype(np.uint8))


def build_strip(painted_path, out_path, contrast="1.0"):
    painted = Image.open(painted_path).convert("RGB").resize((TILE_W * 4, TILE_H * 2), Image.LANCZOS)
    strip = Image.new("RGBA", (STRIP_W, STRIP_H), BACKGROUND + (0,))
    # 帯の 1 列は縦長なので、4 倍で描いてから縮めて縁をなめらかにする
    mask = Image.new("L", (COLUMN * 4, STRIP_H * 4), 0)
    ImageDraw.Draw(mask).polygon(outline(COLUMN * 4, STRIP_H * 4), fill=255)
    mask = mask.resize((COLUMN, STRIP_H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8))
    for index in range(8):
        x, y = tile_origin(index)
        tile = painted.crop((x, y, x + TILE_W, y + TILE_H)).resize((COLUMN, STRIP_H), Image.LANCZOS)
        tile = soften_tile(tile, float(contrast))
        tile.putalpha(mask)
        strip.paste(tile, (index * COLUMN, 0))
    strip.save(out_path)


if __name__ == "__main__":
    {"guide": make_guide, "build": build_strip}[sys.argv[1]](*sys.argv[2:])
