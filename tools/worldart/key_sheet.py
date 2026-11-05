#!/usr/bin/env python3
"""生成した絵の単色の背景を抜いて、透明度つきの絵にする。縁の背景色のにじみも取る。

房のシート: python key_sheet.py sheet <入力> <出力> [--key 255,0,255] [--size 1024]
葉のシート: python key_sheet.py leaves <入力> <出力>  （4 列 2 行の葉を、1536x1024 の枠いっぱいに並べ直す）
"""
import argparse

import numpy as np
from PIL import Image, ImageFilter

args = argparse.ArgumentParser()
args.add_argument("mode", choices=("sheet", "leaves"))
args.add_argument("source")
args.add_argument("out")
args.add_argument("--key", default="255,0,255")
args.add_argument("--size", type=int, default=1024)
args.add_argument("--near", type=float, default=70.0, help="これより背景に近い色は透明")
args.add_argument("--far", type=float, default=120.0, help="これより遠い色は不透明")
args.add_argument("--tint", default="1,1,1", help="色の倍率 R,G,B。地図の foliage.tint を打ち消すのに使う")
args.add_argument("--contrast", type=float, default=1.0, help="葉の中の明暗の強さ")
args = args.parse_args()

KEY = np.array([float(c) for c in args.key.split(",")], dtype=np.float32)


def key_out(path):
    pixels = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    distance = np.linalg.norm(pixels - KEY, axis=2)
    alpha = np.clip((distance - args.near) / (args.far - args.near), 0, 1)
    # 半透明の縁から背景色を引く
    partial = (alpha > 0) & (alpha < 1)
    pixels[partial] = np.clip((pixels[partial] - KEY * (1 - alpha[partial, None]))
                              / np.maximum(alpha[partial, None], 0.25), 0, 255)
    # 透明の所に背景色が残ると、縮小のときに縁へにじむ。近くの葉の色で埋める
    solid = alpha > 0.9
    weight = Image.fromarray((solid * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(14))
    weight = np.maximum(np.asarray(weight, dtype=np.float32), 1e-3)[..., None]
    spread = np.dstack([np.asarray(Image.fromarray((pixels[..., c] * solid).astype(np.uint8))
                                   .filter(ImageFilter.GaussianBlur(14)), dtype=np.float32) for c in range(3)])
    filled = np.clip(spread / weight * 255, 0, 255)
    pixels = np.where(solid[..., None], pixels, filled)
    mean = pixels[solid].mean(axis=0)
    pixels = mean + (pixels - mean) * args.contrast
    pixels = np.clip(pixels * np.array([float(c) for c in args.tint.split(",")], dtype=np.float32), 0, 255)
    return np.dstack((pixels, alpha * 255)).astype(np.uint8)


image = key_out(args.source)
if args.mode == "sheet":
    Image.fromarray(image, "RGBA").resize((args.size, args.size), Image.LANCZOS).save(args.out)
else:
    tile_w, tile_h = 384, 512
    height, width = image.shape[:2]
    sheet = Image.new("RGBA", (tile_w * 4, tile_h * 2), (0, 0, 0, 0))
    for index in range(8):
        x0, y0 = (index % 4) * width // 4, (index // 4) * height // 2
        cell = image[y0:y0 + height // 2, x0:x0 + width // 4]
        ys, xs = np.nonzero(cell[..., 3] > 128)
        cropped = Image.fromarray(cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1], "RGBA")
        sheet.paste(cropped.resize((tile_w - 8, tile_h - 8), Image.LANCZOS), ((index % 4) * tile_w + 4, (index // 4) * tile_h + 4))
    sheet.save(args.out)
