"""箱庭用の手描き材画像をアトラスにまとめる。"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "art" / "diorama" / "tex_src"
ATLAS_DIR = ROOT / "public" / "diorama" / "tex"
SHOT_DIR = ROOT / "art" / "shots" / "diorama" / "tex"
TILE_SIZE = 256
EXTRUDE = 4
INTERIOR_SIZE = TILE_SIZE - EXTRUDE * 2
SEAM_BLUR_RATIO = 0.028
SEAM_BAND_RATIO = 0.06

# docs/diorama/contract.md の固定配置。
TILE_ROWS = [
    ["grass_top", "grass_side", "dirt", "stone", "sand", "sandstone_side", "redrock", "cobble"],
    ["snow_top", "snow_side", "ice", "basalt", "ash", "lava", "obsidian", "planks"],
    ["turf_top", "turf_side", "cloudstone", "crystal", "bark", "leaves", "pine", "cactus"],
    ["mush_cap", "mush_stem", "deadwood", "flowers", "water", "pedestal", "rock", "spare"],
]

BRIGHT_MATERIALS = {"grass_top", "grass_side", "sand", "sandstone_side", "snow_top", "snow_side"}
DARK_MATERIALS = {"basalt", "obsidian"}
# 個別に描き直した元画像を、シートからの切り出しより優先する。
SOURCE_OVERRIDES = {"cactus": "cactus_v2.png"}


def mean_color_and_brightness(image: Image.Image) -> tuple[tuple[int, int, int], float]:
    """sRGB の平均色と Rec.709 輝度を 0〜1 で返す。"""
    means = ImageStat.Stat(image.convert("RGB")).mean
    color = tuple(round(channel) for channel in means)
    brightness = (0.2126 * means[0] + 0.7152 * means[1] + 0.0722 * means[2]) / 255.0
    return color, brightness


def crop_center_square(image: Image.Image) -> Image.Image:
    """分割時に 1px 生じる寸法差を中央でそろえる。"""
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side))


def repair_seams(image: Image.Image, wrap_vertical: bool) -> Image.Image:
    """半分ずらし、中央のつなぎ目を薄くぼかして混ぜる。"""
    width, height = image.size
    shifted = ImageChops.offset(image, width // 2, height // 2 if wrap_vertical else 0)
    radius = max(2, round(min(width, height) * SEAM_BLUR_RATIO))
    blurred = shifted.filter(ImageFilter.GaussianBlur(radius=radius))
    band = max(6, round(min(width, height) * SEAM_BAND_RATIO))
    mask = Image.new("L", image.size, 0)
    pixels = mask.load()
    center_x = width // 2
    center_y = height // 2
    for y in range(height):
        y_weight = max(0.0, 1.0 - abs(y - center_y) / band) if wrap_vertical else 0.0
        for x in range(width):
            x_weight = max(0.0, 1.0 - abs(x - center_x) / band)
            pixels[x, y] = round(255 * max(x_weight, y_weight))
    return Image.composite(blurred, shifted, mask)


def adjust_required_brightness(name: str, image: Image.Image) -> Image.Image:
    """契約の明るさ範囲を外れた材だけ、全体を控えめに補正する。"""
    _, brightness = mean_color_and_brightness(image)
    target: float | None = None
    if name in BRIGHT_MATERIALS and brightness < 0.5:
        target = 0.54
    elif name in BRIGHT_MATERIALS and brightness > 0.8:
        target = 0.78
    elif name in DARK_MATERIALS and brightness < 0.15:
        target = 0.18
    if target is None or brightness <= 0:
        return image

    # 単純な倍率より色相と明部を保ちやすいガンマで目標値に合わせる。
    low, high = 0.1, 8.0
    result = image
    for _ in range(18):
        gamma = (low + high) / 2
        lookup = [round(255 * (value / 255) ** gamma) for value in range(256)]
        candidate = image.point(lookup * 3)
        _, candidate_brightness = mean_color_and_brightness(candidate)
        result = candidate
        if candidate_brightness > target:
            low = gamma
        else:
            high = gamma
    return result


def extrude_edges(image: Image.Image) -> Image.Image:
    """内側の色を外周 4px に伸ばして UV のにじみを防ぐ。"""
    width, height = image.size
    horizontal = Image.new("RGB", (width + EXTRUDE * 2, height))
    horizontal.paste(image, (EXTRUDE, 0))
    left = image.crop((0, 0, 1, height)).resize((EXTRUDE, height), Image.Resampling.NEAREST)
    right = image.crop((width - 1, 0, width, height)).resize((EXTRUDE, height), Image.Resampling.NEAREST)
    horizontal.paste(left, (0, 0))
    horizontal.paste(right, (EXTRUDE + width, 0))

    padded = Image.new("RGB", (horizontal.width, height + EXTRUDE * 2))
    padded.paste(horizontal, (0, EXTRUDE))
    top = horizontal.crop((0, 0, horizontal.width, 1)).resize((horizontal.width, EXTRUDE), Image.Resampling.NEAREST)
    bottom = horizontal.crop((0, height - 1, horizontal.width, height)).resize((horizontal.width, EXTRUDE), Image.Resampling.NEAREST)
    padded.paste(top, (0, 0))
    padded.paste(bottom, (0, EXTRUDE + height))
    return padded


def add_block_edge(image: Image.Image) -> Image.Image:
    """全材で同じ細さの薄い縁と左上の明るい縁を描き足す。"""
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    edge_min = EXTRUDE
    edge_max = TILE_SIZE - EXTRUDE - 1
    draw.rectangle((edge_min, edge_min, edge_max, edge_max), outline=(24, 20, 18, 42), width=1)
    draw.line((edge_min, edge_min, edge_max, edge_min), fill=(255, 255, 245, 34), width=1)
    draw.line((edge_min, edge_min, edge_min, edge_max), fill=(255, 255, 245, 34), width=1)
    return Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")


def prepare_tile(name: str) -> Image.Image:
    path = SOURCE_DIR / SOURCE_OVERRIDES.get(name, f"{name}.png")
    if not path.is_file():
        raise FileNotFoundError(f"元画像がありません: {path}")
    source = Image.open(path).convert("RGB")
    source = crop_center_square(source)
    interior = source.resize((INTERIOR_SIZE, INTERIOR_SIZE), Image.Resampling.LANCZOS)
    interior = repair_seams(interior, wrap_vertical=not name.endswith("_side"))
    interior = adjust_required_brightness(name, interior)
    return add_block_edge(extrude_edges(interior))


def save_tiling_preview(tiles: dict[str, Image.Image]) -> Path:
    """各材を 3×3 に繰り返した一覧画像を保存する。"""
    sample_size = 64
    repeated_size = sample_size * 3
    preview = Image.new("RGB", (8 * repeated_size, 4 * repeated_size), (34, 35, 40))
    for row, names in enumerate(TILE_ROWS):
        for col, name in enumerate(names):
            sample = tiles[name].resize((sample_size, sample_size), Image.Resampling.LANCZOS)
            repeated = Image.new("RGB", (repeated_size, repeated_size))
            for y in range(3):
                for x in range(3):
                    repeated.paste(sample, (x * sample_size, y * sample_size))
            preview.paste(repeated, (col * repeated_size, row * repeated_size))
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    path = SHOT_DIR / "tiling.png"
    preview.save(path, optimize=True)
    return path


def main() -> None:
    ATLAS_DIR.mkdir(parents=True, exist_ok=True)
    tiles: dict[str, Image.Image] = {}
    atlas = Image.new("RGB", (8 * TILE_SIZE, 4 * TILE_SIZE))
    for row, names in enumerate(TILE_ROWS):
        for col, name in enumerate(names):
            tile = prepare_tile(name)
            tiles[name] = tile
            atlas.paste(tile, (col * TILE_SIZE, row * TILE_SIZE))

    atlas_path = ATLAS_DIR / "atlas.png"
    atlas.save(atlas_path, optimize=True)
    atlas_data = {
        "tile": TILE_SIZE,
        "cols": 8,
        "rows": 4,
        "tiles": {
            name: [col, row]
            for row, names in enumerate(TILE_ROWS)
            for col, name in enumerate(names)
        },
    }
    json_path = ATLAS_DIR / "atlas.json"
    json_path.write_text(json.dumps(atlas_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    preview_path = save_tiling_preview(tiles)

    print(f"Created: {atlas_path} ({atlas.width}x{atlas.height})")
    print(f"Created: {json_path}")
    print(f"Created: {preview_path} ({8 * 3 * 64}x{4 * 3 * 64})")
    print("material       mean RGB  brightness")
    for row in TILE_ROWS:
        for name in row:
            color, brightness = mean_color_and_brightness(tiles[name].crop((EXTRUDE, EXTRUDE, TILE_SIZE - EXTRUDE, TILE_SIZE - EXTRUDE)))
            print(f"{name:<14} #{color[0]:02X}{color[1]:02X}{color[2]:02X}   {brightness:.3f}")


if __name__ == "__main__":
    main()
