from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
PANEL_W, PANEL_H = 760, 431
GAP = 12
ROW_GAP = 8
AREAS = ("f1_hunt", "f2_field", "f3_hunt")
SHEET = Image.new("RGB", (PANEL_W * 2 + GAP, (PANEL_H + ROW_GAP) * 4), (24, 26, 22))
DRAW = ImageDraw.Draw(SHEET)
try:
    FONT = ImageFont.truetype("arial.ttf", 18)
except OSError:
    FONT = ImageFont.load_default()


def add_panel(path: Path, x: int, y: int, label: str) -> None:
    image = Image.open(path).convert("RGB").resize((PANEL_W, PANEL_H), Image.Resampling.LANCZOS)
    SHEET.paste(image, (x, y))
    DRAW.rectangle((x, y, x + 330, y + 32), fill=(0, 0, 0))
    DRAW.text((x + 8, y + 6), label, fill=(255, 255, 255), font=FONT)


for row, area in enumerate(AREAS):
    y = row * (PANEL_H + ROW_GAP)
    add_panel(ROOT / "browser" / f"{area}.png", 0, y, f"{area}  browser")
    add_panel(ROOT / "godot" / f"{area}.png", PANEL_W + GAP, y, f"{area}  Godot")

lake_y = 3 * (PANEL_H + ROW_GAP)
DRAW.rectangle((0, lake_y, PANEL_W, lake_y + PANEL_H), fill=(35, 38, 42))
DRAW.rectangle((0, lake_y, PANEL_W, lake_y + 32), fill=(0, 0, 0))
DRAW.text((8, lake_y + 6), "f1_lake  Godot only", fill=(255, 255, 255), font=FONT)
DRAW.text((28, lake_y + 64), "Third-generation map", fill=(225, 230, 235), font=FONT)
DRAW.text((28, lake_y + 92), "Rain particles and screen tint", fill=(225, 230, 235), font=FONT)
add_panel(ROOT / "godot" / "f1_lake.png", PANEL_W + GAP, lake_y, "f1_lake  Godot")

out = ROOT / "weather-comparison.webp"
SHEET.save(out, quality=90)
print(f"-> {out} {SHEET.size}")
