"""Blenderの連続フレームを、見返せるGIFと確認用の並びにまとめる。"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

OUT = Path(__file__).resolve().parent / "shots" / ("v5-flow" if "--flow" in sys.argv else "v4-soft" if "--soft" in sys.argv else "v3-reference" if "--reference" in sys.argv else "v2-painted" if "--paint" in sys.argv else "v1")
for label in ("weak", "medium"):
    frames = [Image.open(path).convert("RGB") for path in sorted((OUT/label).glob("*.png"))]
    palette = frames[0].quantize(colors=128)
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    indexed[0].save(OUT/f"wind-{label}.gif", save_all=True, append_images=indexed[1:],
                    duration=[80, 80, 90]*32, loop=0, optimize=False, disposal=2)
    sheet = Image.new("RGB", (384*4, 238*2), "#182119")
    draw = ImageDraw.Draw(sheet)
    for i, frame in enumerate(range(0, 96, 12)):
        x, y = (i%4)*384, (i//4)*238
        sheet.paste(frames[frame].resize((384, 216)), (x, y+22))
        draw.text((x+8, y+4), f"{label} {frame/12:.1f}s", fill="white")
    sheet.save(OUT/f"sequence-{label}.png")
    print(f"GIF {label}: frames={len(frames)}, duration=8s", flush=True)
changes = []
for time in (0, 2, 4):
    baseline = np.asarray(Image.open(OUT/f"none-{time}.png").convert("RGB")).astype(np.int16)
    for label in ("weak", "medium"):
        pixels = np.asarray(Image.open(OUT/f"{label}-{time}.png").convert("RGB")).astype(np.int16)
        changed = int(np.any(np.abs(pixels-baseline)>3, axis=2).sum())
        changes.append({"time": time, "strength": label, "changedPixels": changed, "pixels": baseline.shape[0]*baseline.shape[1]})
(OUT/"pixels.json").write_text(json.dumps(changes, indent=2), encoding="utf-8", newline="\n")
for change in changes:
    print(change)
