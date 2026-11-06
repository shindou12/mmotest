#!/usr/bin/env python3
"""画面を「見え方の要素」に分けて並べる。ゲーム画面どうしの作りの違いを見るための道具。

行: 画像ごと。列: 元 / 目を細めた色 / 明暗 5 段 / 色相だけ / 細部の場所 / 大きな色の流れを抜いた残り

使い方: python screen_decomp.py <出力.jpg> <画像[:左,上,右,下]> ...
数値は標準出力へ。比は画面の中の比なので、撮り方の影響を受けにくい。
"""
import colorsys
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

WIDTH = 640
LABELS = ("元", "目を細めた色", "明暗5段", "色相", "細部の場所", "細部だけ")


def load(spec):
    path, box = spec, None
    if ":" in spec[3:]:
        path, raw = spec.rsplit(":", 1)
        box = tuple(int(v) for v in raw.split(","))
    image = Image.open(path).convert("RGB")
    if box:
        image = image.crop(box)
    return image.resize((WIDTH, int(image.height * WIDTH / image.width)), Image.LANCZOS)


def luma(array):
    return array[..., 0] * 0.299 + array[..., 1] * 0.587 + array[..., 2] * 0.114


def blur(image, radius):
    return image.filter(ImageFilter.GaussianBlur(radius))


def decompose(image):
    array = np.asarray(image, dtype=np.float32)
    value = luma(array)
    squint = blur(image, WIDTH / 40)
    levels = np.clip(np.digitize(value, np.percentile(value, (20, 40, 60, 80))), 0, 4)
    five = Image.fromarray((levels * 60 + 15).astype(np.uint8)).convert("RGB")
    low = np.asarray(blur(image, 3), dtype=np.float32) / 255
    hsv = np.asarray(Image.fromarray((low * 255).astype(np.uint8)).convert("HSV"), dtype=np.float32)
    hsv[..., 1] = 255
    hsv[..., 2] = 220
    hue = Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB")
    fine = value - np.asarray(blur(Image.fromarray(value.astype(np.uint8)), 2), dtype=np.float32)
    energy = np.asarray(blur(Image.fromarray(np.clip(np.abs(fine) * 12, 0, 255).astype(np.uint8)), 10), dtype=np.float32)
    detail_map = Image.fromarray(np.clip(energy * 2.2, 0, 255).astype(np.uint8)).convert("RGB")
    residual = np.clip(array - np.asarray(squint, dtype=np.float32) + 128, 0, 255)
    return (image, squint, five, hue, detail_map, Image.fromarray(residual.astype(np.uint8))), measure(array, value, np.asarray(squint, dtype=np.float32), energy)


def measure(array, value, squint, energy):
    def hsv(rgb):
        return colorsys.rgb_to_hsv(*(rgb / 255))

    squint_value = luma(squint)
    low_q = squint_value <= np.percentile(squint_value, 20)
    high_q = squint_value >= np.percentile(squint_value, 80)
    dark, light = squint[low_q].mean(axis=0), squint[high_q].mean(axis=0)
    dh, ds, dv = hsv(dark)
    lh, ls, lv = hsv(light)
    h, w = value.shape
    centre = energy[h // 3:h * 2 // 3, w // 4:w * 3 // 4].mean()
    band = max(1, h // 8)
    edges = (energy[:band].mean() + energy[-band:].mean()) / 2
    lo = blur(Image.fromarray(value.astype(np.uint8)), 2)
    mid = blur(lo, 8)
    big = blur(mid, 32)
    lo, mid, big = (np.asarray(x, dtype=np.float32) for x in (lo, mid, big))
    return {
        "light_hsv": (round(lh * 360), round(ls, 2), round(lv, 2)),
        "dark_hsv": (round(dh * 360), round(ds, 2), round(dv, 2)),
        "hue_shift": round((dh - lh) * 360),
        "large_contrast": round(float(big.std()), 1),
        "mid_contrast": round(float((mid - big).std()), 1),
        "fine_contrast": round(float((value - lo).std()), 1),
        "center_vs_edges_detail": round(float(centre / max(edges, 1e-3)), 2),
        "rgb_spread_large": round(float(squint.reshape(-1, 3).std(axis=0).mean()), 1),
    }


def main(out, *specs):
    rows = []
    for spec in specs:
        panels, stats = decompose(load(spec))
        rows.append(panels)
        print(spec.rsplit("/", 1)[-1], stats)
    heights = [row[0].height for row in rows]
    sheet = Image.new("RGB", (WIDTH * len(LABELS), sum(heights)), (20, 20, 20))
    y = 0
    for row, height in zip(rows, heights):
        for column, panel in enumerate(row):
            sheet.paste(panel, (column * WIDTH, y))
        y += height
    sheet.convert("RGB").save(out, quality=85)


if __name__ == "__main__":
    main(*sys.argv[1:])
