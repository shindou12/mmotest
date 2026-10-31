#!/usr/bin/env python3
"""生成シートを格子順に切り、透過PNGと一覧画像を作る。"""

import argparse
import json
import math
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
ICON_DIR = ROOT / "godot" / "worldart" / "assets" / "icons"
SHEET_DIR = ICON_DIR / "sheets"
TYPE_COLORS = {
    "skill": (77, 142, 224),
    "tree": (132, 105, 190),
    "buff": (219, 156, 73),
    "item": (111, 164, 127),
    "area": (76, 153, 157),
}
TYPE_NAMES = {
    "skill": "技",
    "tree": "ツリー",
    "buff": "バフ",
    "item": "持ち物",
    "area": "エリア",
}
BACKGROUND_RGB = np.array([255, 0, 255], dtype=np.int16)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/meiryo.ttc"),
        Path("C:/Windows/Fonts/YuGothM.ttc"),
        Path("C:/Windows/Fonts/msgothic.ttc"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def key_candidate(rgb: np.ndarray) -> np.ndarray:
    """マゼンタ背景と、輪郭に混ざった近似色を検出する。"""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r >= 155) & (b >= 155) & (g <= 155) & ((r + b - 2 * g) >= 170)


def flood_from_edges(mask: np.ndarray) -> np.ndarray:
    """セル端につながる背景色だけを塗りつぶし、絵の内側の同系色を残す。"""
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    queue = deque()
    for x in range(width):
        if mask[0, x]:
            seen[0, x] = True
            queue.append((0, x))
        if mask[height - 1, x] and not seen[height - 1, x]:
            seen[height - 1, x] = True
            queue.append((height - 1, x))
    for y in range(1, height - 1):
        if mask[y, 0] and not seen[y, 0]:
            seen[y, 0] = True
            queue.append((y, 0))
        if mask[y, width - 1] and not seen[y, width - 1]:
            seen[y, width - 1] = True
            queue.append((y, width - 1))

    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return seen


def remove_chroma(cell: Image.Image) -> Image.Image:
    rgba = cell.convert("RGBA")
    pixels = np.asarray(rgba).copy()
    rgb = pixels[..., :3].astype(np.int32)
    delta = rgb - BACKGROUND_RGB.astype(np.int32)
    distance = np.sqrt(np.sum(delta * delta, axis=2))
    candidates = key_candidate(rgb)
    connected_bg = flood_from_edges(candidates)
    # キー色に近い背景は透過し、境目は半透明にして色の縁を抑える。
    alpha = np.full(connected_bg.shape, 255, dtype=np.uint8)
    fade = np.clip((distance - 24.0) / 176.0, 0.0, 1.0)
    alpha[connected_bg] = (fade[connected_bg] * 255).astype(np.uint8)
    pixels[..., 3] = np.minimum(pixels[..., 3], alpha)
    return Image.fromarray(pixels, "RGBA")


def fit_text(draw: ImageDraw.ImageDraw, text: str, max_width: int, font_size: int) -> tuple[str, ImageFont.ImageFont]:
    font = load_font(font_size)
    if draw.textlength(text, font=font) <= max_width:
        return text, font
    while font_size > 9:
        font_size -= 1
        font = load_font(font_size)
        if draw.textlength(text, font=font) <= max_width:
            return text, font
    return text, font


def make_contact(icons: list[dict], index: dict[str, dict], target: Path) -> None:
    columns = 8
    tile_w, tile_h = 176, 184
    rows = math.ceil(len(icons) / columns)
    sheet = Image.new("RGB", (columns * tile_w, rows * tile_h), (29, 36, 46))
    draw = ImageDraw.Draw(sheet)
    name_font_size = 16
    key_font = load_font(11)
    for i, icon in enumerate(icons):
        x = (i % columns) * tile_w
        y = (i // columns) * tile_h
        type_color = TYPE_COLORS.get(icon["type"], (115, 125, 138))
        draw.rounded_rectangle((x + 4, y + 4, x + tile_w - 4, y + tile_h - 4), radius=8, fill=(39, 48, 60), outline=(65, 76, 91), width=1)
        draw.rounded_rectangle((x + 4, y + 4, x + tile_w - 4, y + 9), radius=3, fill=type_color)
        file_path = ICON_DIR / index[icon["key"]]["file"]
        icon_img = Image.open(file_path).convert("RGBA")
        sheet.paste(icon_img, (x + (tile_w - 128) // 2, y + 14), icon_img)
        name = icon["name"]
        name, name_font = fit_text(draw, name, tile_w - 14, name_font_size)
        name_w = draw.textlength(name, font=name_font)
        draw.text((x + (tile_w - name_w) / 2, y + 146), name, font=name_font, fill=(244, 246, 249))
        key_text = icon["key"]
        key_w = draw.textlength(key_text, font=key_font)
        draw.text((x + (tile_w - key_w) / 2, y + 166), key_text, font=key_font, fill=(159, 172, 188))
        label = TYPE_NAMES.get(icon["type"], icon["type"])
        label_font = load_font(10)
        draw.text((x + 9, y + 12), label, font=label_font, fill=type_color)
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target, "PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="4×4 アイコンシートを切り分けます")
    parser.add_argument("--list", type=Path, default=ICON_DIR / "list.json")
    parser.add_argument("--sheets", type=Path, default=SHEET_DIR)
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--rows", type=int, default=4)
    parser.add_argument("--size", type=int, default=128)
    parser.add_argument("--out", type=Path, default=ICON_DIR)
    args = parser.parse_args()

    icons = json.loads(args.list.read_text(encoding="utf-8"))
    per_sheet = args.columns * args.rows
    sheet_count = math.ceil(len(icons) / per_sheet)
    sheets = [args.sheets / f"sheet-{i:03d}.png" for i in range(1, sheet_count + 1)]
    missing = [sheet for sheet in sheets if not sheet.is_file()]
    if missing:
        raise FileNotFoundError("シートがありません: " + ", ".join(str(p) for p in missing))

    args.out.mkdir(parents=True, exist_ok=True)
    index: dict[str, dict] = {}
    for icon_index, icon in enumerate(icons):
        sheet_no = icon_index // per_sheet
        cell_no = icon_index % per_sheet
        sheet = Image.open(sheets[sheet_no]).convert("RGB")
        width, height = sheet.size
        cell_x, cell_y = cell_no % args.columns, cell_no // args.columns
        # 生成器が出力サイズを変えても、画像全体を等分した格子で切る。
        left = round(cell_x * width / args.columns)
        right = round((cell_x + 1) * width / args.columns)
        top = round(cell_y * height / args.rows)
        bottom = round((cell_y + 1) * height / args.rows)
        crop = sheet.crop((left, top, right, bottom))
        icon_image = remove_chroma(crop).resize((args.size, args.size), Image.Resampling.LANCZOS)
        filename = f"{icon['key']}.png"
        icon_image.save(args.out / filename, "PNG", optimize=True)
        index[icon["key"]] = {
            "file": filename,
            "symbol": icon["symbol"],
            "type": icon["type"],
        }

    if len(index) != len(icons):
        raise ValueError(f"index件数が一致しません: {len(index)} != {len(icons)}")
    (args.out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    make_contact(icons, index, args.out / "contact.png")
    print(f"index: {len(index)} / list: {len(icons)}")
    print(f"PNG: {args.size}x{args.size}, RGBA, 全件")
    print(f"シート: {sheet_count} 枚")
    print(f"contact: {args.out / 'contact.png'}")


if __name__ == "__main__":
    main()
