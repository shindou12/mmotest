#!/usr/bin/env python3
"""2 枚の画面を周波数の帯に分けて入れ替え、見え方を決めている帯を探す。

a の大きな色 + b の細部、b の大きな色 + a の細部、b に a の色の分布だけを移した版を作る。
構図が違っても、どちらの「らしさ」に見えるかで効いている帯がわかる。

使い方: python band_swap.py <出力.jpg> <a[:左,上,右,下]> <b[:左,上,右,下]> [--radius 16]
"""
import argparse

import numpy as np
from PIL import Image, ImageFilter


def load(spec, width=960, height=540):
    path, box = spec, None
    if ":" in spec[3:]:
        path, raw = spec.rsplit(":", 1)
        box = tuple(int(v) for v in raw.split(","))
    image = Image.open(path).convert("RGB")
    if box:
        image = image.crop(box)
    scale = max(width / image.width, height / image.height)
    image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    left, top = (image.width - width) // 2, (image.height - height) // 2
    return image.crop((left, top, left + width, top + height))


def low(image, radius):
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32)


def match_distribution(source, target):
    """チャンネルごとの分位点を合わせる（色の分布だけを移す）。"""
    result = np.empty_like(source)
    for c in range(3):
        order = np.argsort(source[..., c].ravel())
        ranks = np.empty(order.size)
        ranks[order] = np.linspace(0, 1, order.size)
        reference = np.sort(target[..., c].ravel())
        result[..., c] = np.interp(ranks, np.linspace(0, 1, reference.size), reference).reshape(source.shape[:2])
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("out")
    parser.add_argument("a")
    parser.add_argument("b")
    parser.add_argument("--radius", type=float, default=16)
    args = parser.parse_args()
    image_a, image_b = load(args.a), load(args.b)
    array_a, array_b = (np.asarray(i, dtype=np.float32) for i in (image_a, image_b))
    low_a, low_b = low(image_a, args.radius), low(image_b, args.radius)
    panels = [array_a, array_b, low_b + (array_a - low_a), low_a + (array_b - low_b),
              match_distribution(array_b, array_a), match_distribution(low_b, low_a) + (array_b - low_b)]
    height, width = array_a.shape[:2]
    sheet = np.zeros((height * 3, width * 2, 3), dtype=np.float32)
    for index, panel in enumerate(panels):
        row, column = index // 2, index % 2
        sheet[row * height:(row + 1) * height, column * width:(column + 1) * width] = panel
    Image.fromarray(np.clip(sheet, 0, 255).astype(np.uint8)).save(args.out, quality=88)


if __name__ == "__main__":
    main()
