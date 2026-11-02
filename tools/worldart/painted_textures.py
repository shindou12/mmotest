"""手描き画像を地面・葉・切り株用のテクスチャに切り分ける。"""
from pathlib import Path
import json

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "art" / "painted-src"
OUT = ROOT / "public" / "worldart"
SIZE = 1024
LEAF_RADIUS = SIZE * 0.46

# 元画像内で葉の房が切れていない領域を、絵ごとに少しずつずらして使う。
FOLIAGE_CROPS = {
    "plate_maple": (600, 650, 480),
    "clump_maple": (200, 850, 480),
    "spray_maple": (1000, 350, 480),
    "spray_clover": (400, 550, 480),
    "leaf_broad": (1000, 950, 480),
}


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def blend_seam(image, axis, fraction=0.12):
    """中央へ移した継ぎ目を、両側の短い帯で混ぜて隠す。"""
    length = image.shape[axis]
    center = length // 2
    half = max(1, round(length * fraction / 2))
    for offset in range(half):
        left_i = center - 1 - offset
        right_i = center + offset
        amount = 0.5 * (1.0 - offset / half)
        left = np.take(image, left_i, axis=axis).astype(np.float32)
        right = np.take(image, right_i, axis=axis).astype(np.float32)
        mixed_left = left * (1.0 - amount) + right * amount
        mixed_right = right * (1.0 - amount) + left * amount
        left_slice = [slice(None)] * image.ndim
        right_slice = [slice(None)] * image.ndim
        left_slice[axis] = left_i
        right_slice[axis] = right_i
        image[tuple(left_slice)] = np.clip(mixed_left, 0, 255).astype(np.uint8)
        image[tuple(right_slice)] = np.clip(mixed_right, 0, 255).astype(np.uint8)
    return image


def tileable(crop):
    shifted = np.roll(crop, shift=(crop.shape[0] // 2, crop.shape[1] // 2), axis=(0, 1)).copy()
    blend_seam(shifted, axis=1)
    blend_seam(shifted, axis=0)
    return Image.fromarray(shifted, "RGB").resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def bleed_rgb(rgb, alpha, passes=32):
    """透明画素の RGB を近くの葉から伸ばし、ミップマップの暗い縁を防ぐ。"""
    colors = rgb.astype(np.float32).copy()
    filled = alpha > 0
    for _ in range(passes):
        pad_colors = np.pad(colors, ((1, 1), (1, 1), (0, 0)), mode="edge")
        pad_filled = np.pad(filled, ((1, 1), (1, 1)), mode="edge")
        sums = np.zeros_like(colors)
        counts = np.zeros(filled.shape, dtype=np.float32)
        for dy in range(3):
            for dx in range(3):
                valid = pad_filled[dy:dy + filled.shape[0], dx:dx + filled.shape[1]]
                sums += pad_colors[dy:dy + filled.shape[0], dx:dx + filled.shape[1]] * valid[..., None]
                counts += valid
        grow = (~filled) & (counts > 0)
        if not np.any(grow):
            break
        colors[grow] = sums[grow] / counts[grow, None]
        filled[grow] = True
    return np.clip(colors, 0, 255).astype(np.uint8)


def foliage_texture(source, cx, cy, side):
    half = side // 2
    crop = source.crop((cx - half, cy - half, cx + half, cy + half)).resize(
        (SIZE, SIZE), Image.Resampling.LANCZOS
    )
    rgb = np.asarray(crop.convert("RGB"), dtype=np.uint8)
    rgb_f = rgb.astype(np.float32)
    luminance = rgb_f @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    green_contrast = rgb[:, :, 1].astype(np.float32) - rgb[:, :, 2].astype(np.float32)
    leaf_mask = smoothstep(84.0, 110.0, luminance) * smoothstep(12.0, 36.0, green_contrast)
    alpha = np.round(np.maximum(leaf_mask, smoothstep(126.0, 150.0, luminance)) * 255).astype(np.uint8)
    yy, xx = np.ogrid[:SIZE, :SIZE]
    distance = np.sqrt((xx - (SIZE - 1) / 2) ** 2 + (yy - (SIZE - 1) / 2) ** 2)
    circle_edge = smoothstep(0.0, 8.0, LEAF_RADIUS - distance)
    alpha = np.round(alpha * circle_edge).astype(np.uint8)
    dark_lift = 1.0 - smoothstep(80.0, 160.0, luminance)
    rgb = np.clip(rgb_f * (1.0 + 0.25 * dark_lift[:, :, None]), 0, 255).astype(np.uint8)
    rgb = bleed_rgb(rgb, alpha)
    return Image.fromarray(np.dstack((rgb, alpha)), "RGBA")


def main():
    out_textures = OUT / "tex_painted"
    out_textures.mkdir(parents=True, exist_ok=True)

    tile_sets = {
        "ground_grass": ("tiles_rich.webp", (0, 627, 627, 1254)),
        "rock_crack": ("tiles_rich.webp", (627, 0, 1254, 627)),
        "rock_face": ("tiles_rich.webp", (627, 0, 1254, 627), 2),
        "wood": ("tiles_flat.webp", (0, 0, 627, 627)),
    }
    for name, texture_spec in tile_sets.items():
        source_name, bounds, *repeat = texture_spec
        with Image.open(SRC / source_name) as source:
            crop = np.asarray(source.convert("RGB").crop(bounds), dtype=np.uint8)
            if repeat:
                crop = np.tile(crop, (repeat[0], repeat[0], 1))
            tileable(crop).save(
                out_textures / f"{name}.png"
            )

    with Image.open(SRC / "foliage.webp") as foliage:
        foliage = foliage.convert("RGB")
        for name, (cx, cy, side) in FOLIAGE_CROPS.items():
            texture = foliage_texture(foliage, cx, cy, side)
            alpha = np.asarray(texture.getchannel("A"))
            yy, xx = np.ogrid[:SIZE, :SIZE]
            circle = (xx - SIZE / 2) ** 2 + (yy - SIZE / 2) ** 2 <= (SIZE * 0.46) ** 2
            coverage = float(np.mean(alpha[circle] >= 128))
            texture.save(out_textures / f"{name}.png")
            print(f"LEAF {name} alpha_fill={coverage:.3f}")

    (out_textures / "index.json").write_text(
        json.dumps(["wood", *FOLIAGE_CROPS.keys()], indent=2) + "\n", encoding="utf-8"
    )

    with Image.open(SRC / "stump_flat.webp") as stump:
        stump.convert("RGB").resize((SIZE, SIZE), Image.Resampling.LANCZOS).save(
            OUT / "tex" / "stump_painted.png"
        )


if __name__ == "__main__":
    main()
