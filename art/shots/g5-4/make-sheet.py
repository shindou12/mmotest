from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SHOTS = [
    ("ヌシ・ギガスライム / f1_lake", "lake-nushi"),
    ("精鋭 / f1_dun", "f1-dun-elite"),
    ("門番 / f2_lab", "f2-gatekeeper"),
    ("罠床 / f2_lab", "f2-traps"),
    ("番兵 K / f1_lab", "f1-lab-sentinel"),
    ("群れ w / f1_lab", "f1-lab-swarm"),
    ("感圧板 消灯 / f3_lab", "f3-plate-unlit"),
    ("感圧板 点灯 / f3_lab", "f3-plate-lit"),
    ("ボスの輪・オーラ / f1_lab", "f1-lab-boss"),
    ("レバー / f1_lab", "f1-lab-lever"),
    ("扉 閉 / f1_lab", "f1-lab-door-closed"),
    ("扉 開 / f1_lab", "f1-lab-door-open"),
]
WIDTH = 720
HEADER = 58
GAP = 12
FONT_PATH = Path("C:/Windows/Fonts/meiryo.ttc")
FONT = ImageFont.truetype(str(FONT_PATH), 24) if FONT_PATH.exists() else ImageFont.load_default()

loaded = []
for label, name in SHOTS:
    browser = Image.open(ROOT / "browser" / f"{name}.png").convert("RGB")
    godot = Image.open(ROOT / "godot" / f"{name}.png").convert("RGB")
    browser.thumbnail((WIDTH, 10000), Image.Resampling.LANCZOS)
    godot.thumbnail((WIDTH, 10000), Image.Resampling.LANCZOS)
    size = (WIDTH, max(browser.height, godot.height))
    row = Image.new("RGB", (WIDTH * 2 + GAP, size[1] + HEADER), "#20242b")
    draw = ImageDraw.Draw(row)
    draw.text((12, 12), label, fill="white", font=FONT)
    draw.text((12, 39), "Browser", fill="#94d5ff", font=ImageFont.truetype(str(FONT_PATH), 17) if FONT_PATH.exists() else FONT)
    draw.text((WIDTH + GAP + 12, 39), "Godot", fill="#ffd18a", font=ImageFont.truetype(str(FONT_PATH), 17) if FONT_PATH.exists() else FONT)
    row.paste(browser.resize(size, Image.Resampling.LANCZOS), (0, HEADER))
    row.paste(godot.resize(size, Image.Resampling.LANCZOS), (WIDTH + GAP, HEADER))
    loaded.append(row)

sheet = Image.new("RGB", (loaded[0].width, sum(row.height for row in loaded) + GAP * (len(loaded) - 1)), "#101318")
y = 0
for row in loaded:
    sheet.paste(row, (0, y))
    y += row.height + GAP
out = ROOT / "comparison.png"
sheet.save(out, optimize=True)
print(f"comparison sheet: {out} size={sheet.width}x{sheet.height}")
