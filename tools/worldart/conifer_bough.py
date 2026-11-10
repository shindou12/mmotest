#!/usr/bin/env python3
"""針葉樹の枝の房（切れ込みのある葉が軸の左右に並ぶ）を 2x2 に並べた下絵を作る。

下絵: python conifer_bough.py guide <guide.png> <mask.png>

1 枠の下の中央が枝の付け根、上が枝先（木の外側）。葉は付け根ほど大きく暗く、先ほど小さく明るい。
画像生成にはこの下絵を配置の土台として渡し、塗った絵は key_sheet.py で背景を抜く。
見本（RO3 のもみ）の枝は、針葉でなく切れ込みのある大きめの葉の形に単純化されている（style-secrets.md 4.3）。
"""
import math
import random
import sys

from PIL import Image, ImageDraw

SIZE = 1024
TILE = SIZE // 2
BACKGROUND = (22, 50, 32)
# 4 枚それぞれの (左右の葉の対の数, 広がりの度, 軸の曲がり, 乱数)
TILES = ((5, 68, 0.04, 1), (6, 62, -0.05, 2), (4, 76, 0.03, 3), (6, 72, -0.04, 4))
# 葉 1 枚の切れ込み: (向きの度, 長さ)。0 が葉先
LOBES = ((0, 1.0), (38, 0.78), (-38, 0.78), (80, 0.52), (-80, 0.52))


def leaf_polygon(origin, angle, size, rng):
    """切れ込みのある葉。葉柄の位置が origin、葉先が angle の向き。"""
    tips = sorted(((a + rng.uniform(-6, 6), l * rng.uniform(0.9, 1.08)) for a, l in LOBES), key=lambda t: t[0])
    points = [(-180, 0.10)]
    for i, (a, l) in enumerate(tips):
        if i:
            prev = tips[i - 1][0]
            points.append(((prev + a) / 2, 0.36))          # 切れ込みの谷
        points += [(a - 9, l * 0.62), (a, l), (a + 9, l * 0.62)]
    points.append((180, 0.10))
    out = []
    for a, r in points:
        t = angle + math.radians(a)
        out.append((origin[0] + math.cos(t) * r * size, origin[1] + math.sin(t) * r * size))
    return out


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def paint_tile(index):
    pairs, spread, bend, seed = TILES[index]
    rng = random.Random(seed)
    image = Image.new("RGB", (TILE, TILE), BACKGROUND)
    mask = Image.new("L", (TILE, TILE), 0)
    draw, mdraw = ImageDraw.Draw(image), ImageDraw.Draw(mask)
    root, tip = (0.5 * TILE, 0.965 * TILE), (0.5 * TILE, 0.20 * TILE)

    def axis(t):
        x = root[0] + (tip[0] - root[0]) * t + math.sin(t * math.pi) * bend * TILE
        return (x, root[1] + (tip[1] - root[1]) * t)

    leaves = []
    for i in range(pairs):
        t = 0.10 + 0.78 * i / (pairs - 1)
        size = TILE * (0.40 - 0.17 * t) * rng.uniform(0.92, 1.08)
        for side in (-1, 1):
            a = -math.pi / 2 + side * math.radians(spread * (1.0 - 0.25 * t) + rng.uniform(-7, 7))
            p = axis(t + rng.uniform(-0.02, 0.02))
            leaves.append((t, p, a, size))
    leaves.append((1.0, axis(0.93), -math.pi / 2 + rng.uniform(-0.12, 0.12), TILE * 0.26))
    dark, light = (58, 96, 44), (176, 196, 84)
    # 付け根の葉を先に描き、枝先の葉を上に重ねる
    for t, p, a, size in sorted(leaves, key=lambda l: l[0]):
        polygon = leaf_polygon(p, a, size, rng)
        draw.polygon(polygon, fill=mix(dark, light, t ** 0.8), outline=(30, 62, 34))
        draw.line(polygon + [polygon[0]], fill=(30, 62, 34), width=3)
        mdraw.polygon(polygon, fill=255)
    return image, mask


def guide(guide_path, mask_path):
    sheet, mask = Image.new("RGB", (SIZE, SIZE), BACKGROUND), Image.new("L", (SIZE, SIZE), 0)
    for i in range(4):
        tile, m = paint_tile(i)
        sheet.paste(tile, ((i % 2) * TILE, (i // 2) * TILE))
        mask.paste(m, ((i % 2) * TILE, (i // 2) * TILE))
    sheet.save(guide_path)
    mask.save(mask_path)


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] != "guide":
        sys.exit(__doc__)
    guide(sys.argv[2], sys.argv[3])
