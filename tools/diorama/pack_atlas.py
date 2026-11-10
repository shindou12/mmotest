"""箱庭用のテクスチャを色と平らさを整えてアトラスにまとめる。"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageStat


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "art" / "diorama" / "tex_src"
ATLAS_DIR = ROOT / "public" / "diorama" / "tex"
SHOT_DIR = ROOT / "art" / "shots" / "diorama" / "tex"
TILE_SIZE = 256
EXTRUDE = 4
INTERIOR_SIZE = TILE_SIZE - EXTRUDE * 2

# docs/diorama/contract.md の固定配置。
TILE_ROWS = [
    ["grass_top", "grass_side", "dirt", "stone", "sand", "sandstone_side", "redrock", "cobble"],
    ["snow_top", "snow_side", "ice", "basalt", "ash", "lava", "obsidian", "planks"],
    ["turf_top", "turf_side", "cloudstone", "crystal", "bark", "leaves", "pine", "cactus"],
    ["mush_cap", "mush_stem", "deadwood", "flowers", "water", "pedestal", "rock", "spare"],
]

SOURCE_OVERRIDES = {name: f"{name}_seamless.png" for row in TILE_ROWS for name in row}
REFERENCE_OVERRIDES = {"cactus": "cactus_v2.png"}

# 各素材の平均色。分割面は上側、下側の順。
TARGET_COLORS = {
    "grass_top": ("#8fae4a",),
    "grass_side": ("#8fae4a", "#8a6a4a"),
    "dirt": ("#8a6a4a",),
    "stone": ("#9a948a",),
    "sand": ("#e2c27a",),
    "sandstone_side": ("#d49a5a",),
    "redrock": ("#b8603e",),
    "cobble": ("#a09a96",),
    "snow_top": ("#e4edf6",),
    "snow_side": ("#e4edf6", "#7c8494"),
    "ice": ("#a9dff0",),
    "basalt": ("#5a5a66",),
    "ash": ("#8c8480",),
    "lava": ("#ff7a1e",),
    "obsidian": ("#3a3460",),
    "planks": ("#b98850",),
    "turf_top": ("#4fb79a",),
    "turf_side": ("#4fb79a", "#7a8a86"),
    "cloudstone": ("#b9b6da",),
    "crystal": ("#7fb4ff",),
    "bark": ("#7a5238",),
    "leaves": ("#c9d4c0",),
    "pine": ("#5e8a66",),
    "cactus": ("#8aa04e",),
    "mush_cap": ("#e8834a",),
    "mush_stem": ("#ead2b4",),
    "deadwood": ("#8a7468",),
    "flowers": ("#9cb060",),
    "water": ("#2fb5a6",),
    "pedestal": ("#cdb089",),
    "rock": ("#a6a2a0",),
    "spare": ("#9a7450",),
}

SIDE_LABELS = {
    "grass_side": ("grass", "dirt"),
    "snow_side": ("snow", "rock"),
    "turf_side": ("turf", "base"),
}


def parse_hex(value: str) -> tuple[int, int, int]:
    """#RRGGBB を RGB の整数タプルにする。"""
    value = value.removeprefix("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def mean_color_and_brightness(image: Image.Image) -> tuple[tuple[int, int, int], float]:
    """sRGB の平均色と Rec.709 輝度を返す。"""
    means = ImageStat.Stat(image.convert("RGB")).mean
    color = tuple(round(channel) for channel in means)
    brightness = (0.2126 * means[0] + 0.7152 * means[1] + 0.0722 * means[2]) / 255.0
    return color, brightness


def brightness_std(image: Image.Image) -> float:
    """グレースケール輝度の標準偏差を 0〜255 で返す。"""
    return ImageStat.Stat(image.convert("L")).stddev[0]


def crop_center_square(image: Image.Image) -> Image.Image:
    """切り出し時に縦横比の差が生じないよう中央で正方形にする。"""
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side))


def match_mean_color(image: Image.Image, reference: Image.Image) -> Image.Image:
    """従来どおり、元絵の平均色を対応する参照絵に合わせる。"""
    image = image.convert("RGB")
    target = ImageStat.Stat(reference.convert("RGB")).mean
    current = ImageStat.Stat(image).mean
    lookup = [
        max(0, min(255, value + round(target[channel] - current[channel])))
        for channel in range(3)
        for value in range(256)
    ]
    return image.point(lookup)


def flatten_texture(image: Image.Image, amount: float) -> Image.Image:
    """平均色へ寄せ、細部を少しならしてから元絵を 20% 重ねて輪郭を戻す。"""
    if amount <= 0:
        return image.copy()

    mean = tuple(round(value) for value in ImageStat.Stat(image.convert("RGB")).mean)
    average = Image.new("RGB", image.size, mean)
    flattened = Image.blend(image, average, amount)
    softened = Image.blend(flattened, flattened.filter(ImageFilter.GaussianBlur(radius=3.0)), amount)
    outline = image.filter(ImageFilter.GaussianBlur(radius=4.0))
    outline = outline.filter(ImageFilter.UnsharpMask(radius=5, percent=100, threshold=1))
    return Image.blend(softened, outline, 0.20)


def make_region_masks(name: str, image: Image.Image) -> list[Image.Image]:
    """草・雪・土の境目を元絵から拾い、分割面の上側マスクを作る。"""
    if name not in SIDE_LABELS:
        return [Image.new("L", image.size, 255)]

    pixels = image.load()
    top = Image.new("L", image.size, 0)
    mask_pixels = top.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue = pixels[x, y]
            if name == "grass_side":
                is_top = green - red > 15
            elif name == "snow_side":
                brightness = 0.2126 * red + 0.7152 * green + 0.0722 * blue
                is_top = brightness > 160
            else:
                is_top = y < 92 and green - red > 15 and blue - red > 8
            if is_top:
                mask_pixels[x, y] = 255
    return [top, Image.eval(top, lambda value: 255 - value)]


def fit_region_mean(image: Image.Image, target: tuple[int, int, int], mask: Image.Image) -> Image.Image:
    """一つの領域の平均 RGB を目標色に合わせ、色のはみ出しを避ける。"""
    channels = list(image.convert("RGB").split())
    adjusted_channels = []
    for channel, target_value in zip(channels, target):
        mean = ImageStat.Stat(channel, mask=mask).mean[0]
        centered = Image.composite(channel, Image.new("L", image.size, round(mean)), mask)
        minimum, maximum = centered.getextrema()
        scale = 1.0
        if maximum > mean:
            scale = min(scale, (255 - target_value) / (maximum - mean))
        if minimum < mean:
            scale = min(scale, target_value / (mean - minimum))
        scale = max(0.0, scale)
        lookup = [
            max(0, min(255, round(target_value + (value - mean) * scale)))
            for value in range(256)
        ]
        shifted = channel.point(lookup)
        adjusted_channels.append(Image.composite(shifted, channel, mask))
    return Image.merge("RGB", adjusted_channels)


def colorize_regions(
    name: str, image: Image.Image, masks: list[Image.Image]
) -> tuple[Image.Image, list[tuple[str, tuple[int, int, int], Image.Image]]]:
    """素材ごとの平均色を合わせ、領域と目標色の組を返す。"""
    targets = [parse_hex(value) for value in TARGET_COLORS[name]]
    labels = SIDE_LABELS.get(name, (name,))
    result = image.convert("RGB")
    regions = []
    for label, target, mask in zip(labels, targets, masks):
        result = fit_region_mean(result, target, mask)
        regions.append((label, target, mask))
    return result, regions


def extrude_edges(image: Image.Image) -> Image.Image:
    """外周の色を 4px 伸ばして UV のにじみを防ぐ。"""
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
    """ブロック枠を幅 3px、暗部 6%、明部 5% の薄い線で加える。"""
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    edge_min = EXTRUDE
    edge_max = TILE_SIZE - EXTRUDE - 1
    draw.rectangle((edge_min, edge_min, edge_max, edge_max), outline=(0, 0, 0, 15), width=3)
    draw.line((edge_min, edge_min, edge_max, edge_min), fill=(255, 255, 245, 13), width=3)
    draw.line((edge_min, edge_min, edge_min, edge_max), fill=(255, 255, 245, 13), width=3)
    return Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")


def load_source(name: str) -> tuple[Image.Image, list[Image.Image]]:
    """元絵を 256px にし、領域マスクを作る。"""
    path = SOURCE_DIR / SOURCE_OVERRIDES[name]
    if not path.is_file():
        raise FileNotFoundError(f"元画像がありません: {path}")
    reference_path = SOURCE_DIR / REFERENCE_OVERRIDES.get(name, f"{name}.png")
    reference = crop_center_square(Image.open(reference_path).convert("RGB"))
    source = match_mean_color(Image.open(path), reference)
    source = crop_center_square(source).resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
    return source, make_region_masks(name, source)


def prepare_tile(
    name: str, source: Image.Image, source_masks: list[Image.Image], flat_amount: float
) -> tuple[Image.Image, Image.Image, list[tuple[str, tuple[int, int, int], Image.Image]]]:
    """元絵を平らにし、目標色と枠線を加えたタイルを返す。"""
    flattened = flatten_texture(source, flat_amount)
    colored, regions = colorize_regions(name, flattened, source_masks)
    interior_box = (EXTRUDE, EXTRUDE, TILE_SIZE - EXTRUDE, TILE_SIZE - EXTRUDE)
    interior = colored.crop(interior_box)
    interior_regions = [
        (label, target, mask.crop(interior_box)) for label, target, mask in regions
    ]
    tile = add_block_edge(extrude_edges(interior))
    return tile, interior, interior_regions


def expected_mean(regions: list[tuple[str, tuple[int, int, int], Image.Image]]) -> tuple[int, int, int]:
    """分割面は各領域の面積で重み付けした目標平均を返す。"""
    total = sum(mask.histogram()[255] for _, _, mask in regions)
    channels = []
    for channel in range(3):
        weighted = sum(
            target[channel] * mask.histogram()[255]
            for _, target, mask in regions
        )
        channels.append(round(weighted / total))
    return tuple(channels)


def rgb_distance(first: tuple[float, float, float], second: tuple[float, float, float]) -> float:
    """RGB 空間で二色の距離を返す。"""
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(first, second)))


def save_tiling_preview(tiles: dict[str, Image.Image]) -> Path:
    """各素材を 3×3 に並べた一覧を保存する。"""
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="箱庭用テクスチャをアトラスにまとめる")
    parser.add_argument("--flat", type=float, default=0.6, help="平均色へ寄せる量 (0〜1、既定: 0.6)")
    args = parser.parse_args()
    if not 0.0 <= args.flat <= 1.0:
        parser.error("--flat は 0〜1 の範囲で指定してください")
    return args


def main() -> None:
    args = parse_args()
    ATLAS_DIR.mkdir(parents=True, exist_ok=True)
    tiles: dict[str, Image.Image] = {}
    textures: dict[str, Image.Image] = {}
    metrics = {}
    atlas = Image.new("RGB", (8 * TILE_SIZE, 4 * TILE_SIZE))

    for row, names in enumerate(TILE_ROWS):
        for col, name in enumerate(names):
            source, source_masks = load_source(name)
            _, texture_zero, regions_zero = prepare_tile(name, source, source_masks, 0.0)
            tile, texture, regions = prepare_tile(name, source, source_masks, args.flat)
            tiles[name] = tile
            textures[name] = texture
            atlas.paste(tile, (col * TILE_SIZE, row * TILE_SIZE))
            metrics[name] = (texture_zero, regions_zero, texture, regions)

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
    print(f"flat={args.flat:.2f}; target RGB distance limit=12")
    print(f"{'material':<14} {'mean RGB':<13} {'target RGB':<13} {'dRGB':>6} {'std flat=0':>11} {'std flat='+format(args.flat, '.1f'):>12}")

    failures = []
    for row in TILE_ROWS:
        for name in row:
            texture_zero, regions_zero, texture, regions = metrics[name]
            actual_mean, _ = mean_color_and_brightness(texture)
            target_mean = expected_mean(regions)
            distance = rgb_distance(actual_mean, target_mean)
            print(
                f"{name:<14} #{actual_mean[0]:02X}{actual_mean[1]:02X}{actual_mean[2]:02X}   "
                f"#{target_mean[0]:02X}{target_mean[1]:02X}{target_mean[2]:02X}   {distance:6.2f} "
                f"{brightness_std(texture_zero):11.2f} {brightness_std(texture):12.2f}"
            )
            if distance > 12:
                failures.append(f"{name}: mean RGB distance={distance:.2f}")

            for label, target, mask in regions:
                region_mean = ImageStat.Stat(texture, mask=mask).mean
                region_distance = rgb_distance(region_mean, target)
                if region_distance > 12:
                    failures.append(f"{name}/{label}: mean RGB distance={region_distance:.2f}")

    if failures:
        raise SystemExit("目標色の許容差を超えました: " + "; ".join(failures))


if __name__ == "__main__":
    main()
