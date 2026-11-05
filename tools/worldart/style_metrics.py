#!/usr/bin/env python3
"""画面の見え方を、明るさごとの色・細部の量・明暗の幅で測り、RO3 の画面と比べる（M-0178）。

数値は補助。見た目の判断が先。
- 明るさごとの彩度: 明るさを 5 段に分け、色の付いた画素（緑〜黄）の彩度の平均
- 明るさごとの色相: 同じく色相の平均（度）
- 細部: 明るさのラプラシアンの絶対値の平均（大きいほど細かい模様が多い）
- 明暗: 明るさの 5%・50%・95%

使い方: python style_metrics.py --ref 見本1.png[:x0,y0,x1,y1] ... -- 撮影1.png 撮影2.png ...
"""
import argparse
import sys

import numpy as np
from PIL import Image

BINS = [(0.0, 0.25), (0.25, 0.4), (0.4, 0.55), (0.55, 0.7), (0.7, 1.01)]


def load(spec):
    path, _, crop = spec.partition(":")
    if len(path) == 1 and crop:  # Windows のドライブ文字
        rest, _, crop = crop.partition(":")
        path = path + ":" + rest
    image = Image.open(path).convert("RGB")
    if crop:
        image = image.crop(tuple(int(v) for v in crop.split(",")))
    array = np.asarray(image.resize((960, int(960 * image.height / image.width))), float) / 255
    mask = np.ones(array.shape[:2], bool)
    if crop:  # RO3 の画面: UI のある隅を除く
        h, w = mask.shape
        mask[: int(h * 0.29), : int(w * 0.16)] = False
        mask[: int(h * 0.39), int(w * 0.8):] = False
        mask[int(h * 0.81):, : int(w * 0.21)] = False
    return array, mask


def measure(array, mask):
    top, low = array.max(-1), array.min(-1)
    value = top
    sat = (top - low) / (top + 1e-6)
    r, g, b = array[..., 0], array[..., 1], array[..., 2]
    d = top - low + 1e-6
    hue = np.where(top == r, ((g - b) / d) % 6, np.where(top == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    green = mask & (hue > 40) & (hue < 170) & (sat > 0.08)
    by_bin = []
    for lo, hi in BINS:
        sel = green & (value >= lo) & (value < hi)
        by_bin.append((float(sat[sel].mean()) if sel.sum() > 200 else np.nan,
                       float(hue[sel].mean()) if sel.sum() > 200 else np.nan,
                       float(sel.sum() / max(green.sum(), 1))))
    lap = np.abs(4 * value[1:-1, 1:-1] - value[:-2, 1:-1] - value[2:, 1:-1] - value[1:-1, :-2] - value[1:-1, 2:])
    detail = float(lap[mask[1:-1, 1:-1]].mean())
    pct = np.percentile(value[mask], [5, 50, 95])
    return by_bin, detail, pct


def row(name, result):
    by_bin, detail, pct = result
    sats = " ".join(f"{s:4.2f}" if s == s else " -- " for s, _, _ in by_bin)
    hues = " ".join(f"{h:4.0f}" if h == h else " -- " for _, h, _ in by_bin)
    share = " ".join(f"{f:4.2f}" for _, _, f in by_bin)
    return f"{name:28s} 彩度 {sats} | 色相 {hues} | 割合 {share} | 細部 {detail:.4f} | 明暗 {pct[0]:.2f} {pct[1]:.2f} {pct[2]:.2f}"


def main():
    argv = sys.argv[1:]
    split = argv.index("--") if "--" in argv else len(argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--ref", nargs="+", default=[])
    args = parser.parse_args(argv[:split])
    shots = argv[split + 1:]
    print("明るさの段: " + " ".join(f"{lo:.2f}-{hi:.2f}" for lo, hi in BINS))
    refs = [measure(*load(spec)) for spec in args.ref]
    if refs:
        mean = ([tuple(np.nanmean([r[0][i][k] for r in refs]) for k in range(3)) for i in range(len(BINS))],
                float(np.mean([r[1] for r in refs])), np.mean([r[2] for r in refs], 0))
        print(row("RO3（平均）", mean))
    for shot in shots:
        print(row(shot.replace("\\", "/").split("/")[-1], measure(*load(shot))))


if __name__ == "__main__":
    main()
