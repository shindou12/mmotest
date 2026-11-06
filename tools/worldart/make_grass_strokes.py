#!/usr/bin/env python3
"""草のシェル用に、向きのある高さテクスチャを作る。"""

from pathlib import Path

import numpy as np
from PIL import Image


SIZE = 512
SUPERSAMPLE = 2
SEED = 183
STROKE_COUNT = 700
TILE_METERS = 1.8


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    t = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def make_texture() -> np.ndarray:
    """白い根元から暗い先端へ細く消えるストロークを、周期境界で重ねる。"""
    rng = np.random.default_rng(SEED)
    side = SIZE * SUPERSAMPLE
    canvas = np.zeros((side, side), dtype=np.float32)

    for _ in range(STROKE_COUNT):
        # 幅 3〜7px、長さ 4〜12 倍。画像上では 2 倍に描いてから縮小する。
        width = rng.uniform(3.0, 7.0) * SUPERSAMPLE
        length = width * rng.uniform(4.0, 12.0)
        angle = np.pi * 0.5 + np.deg2rad(rng.uniform(-25.0, 25.0))
        center_x, center_y = rng.uniform(0.0, side, size=2)

        along = np.arange(-length * 0.5 - 2.0, length * 0.5 + 3.0, dtype=np.float32)
        across = np.arange(-width * 0.75 - 2.0, width * 0.75 + 3.0, dtype=np.float32)
        s, d = np.meshgrid(along, across)
        u = np.clip(s / length + 0.5, 0.0, 1.0)

        half_width = (width * 0.5) * (0.72 + 0.32 * np.sin(np.pi * u)) * np.sqrt(np.maximum(0.0, 1.0 - u))
        side_fade = np.clip(1.0 - np.abs(d) / np.maximum(half_width, 0.01), 0.0, 1.0)
        side_fade = side_fade * side_fade * (3.0 - 2.0 * side_fade)
        tip_fade = 1.0 - smoothstep(0.72, 1.0, u)
        root_to_tip = 0.98 - 0.56 * u
        height = rng.uniform(0.9, 1.0) * root_to_tip * tip_fade * side_fade

        dx = np.cos(angle) * s - np.sin(angle) * d
        dy = np.sin(angle) * s + np.cos(angle) * d
        x = np.rint(center_x + dx).astype(np.int32) % side
        y = np.rint(center_y + dy).astype(np.int32) % side
        np.maximum.at(canvas, (y.ravel(), x.ravel()), height.ravel())

    # LANCZOS で縮小し、細いストロークの縁を滑らかにする。
    pixels = np.clip(np.rint(canvas * 255.0), 0, 255).astype(np.uint8)
    image = Image.fromarray(pixels, mode="L").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    return np.asarray(image, dtype=np.uint8)


def main() -> None:
    # Acerola の shell texturing にある高さマップの閾値化を参考に、層ごとに草の形を切り出す。
    root = Path(__file__).resolve().parents[2]
    image = Image.fromarray(make_texture(), mode="L")
    targets = (
        root / "public/worldart/tex/grass_strokes.png",
        root / "godot/worldart/data/tex/grass_strokes.png",
    )
    for path in targets:
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path, optimize=True)
        print(f"{path.relative_to(root)}: {SIZE}x{SIZE}, tile={TILE_METERS:.1f}m")

    values = np.asarray(image, dtype=np.float32) / 255.0
    print(f"mean={values.mean():.4f} nonzero={(values > 0.03).mean():.1%} peak={values.max():.3f}")


if __name__ == "__main__":
    main()
