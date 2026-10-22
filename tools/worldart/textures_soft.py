"""L27 仮説 A2: 葉の絵の「縁が暗い 3 段の塗り」をやわらかくした版を作る（比較用。元の絵は変えない）。
python3 -I tools/worldart/textures_soft.py [出力フォルダ=public/worldart/tex_soft] [縁の寄せ=0.75] [ぼかし=3]
  textures2.py の葉（星形の葉の 3 種と spray_clover）を同じ乱数で描き直す。変えるのは 2 つだけ:
  1. 外側の段（暗い縁）の色を中の段へ寄せる（寄せ=1 で縁と中が同じ色）
  2. 描いたあと、色を透明な側へ広げてから（alpha bleeding）色だけをぼかす。形（alpha）はそのまま
  world.js の ?ltex=tex_soft で、GLB の中の同じ名前の絵と差し替えて撮る"""
import sys, os, json
import numpy as np
from PIL import Image, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else 'public/worldart/tex_soft'
RIM = float(sys.argv[2]) if len(sys.argv) > 2 else 0.75
BLUR = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0
os.makedirs(OUT, exist_ok=True)
sys.argv = [sys.argv[0], OUT]   # textures2 は OUT を argv[1] から読む
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import textures2 as T

def soft_finish(img, w, h, name):
    a = np.asarray(img).astype(np.float32)
    rgb, al = a[..., :3].copy(), a[..., 3].copy()
    filled = al >= 200
    # 色を透明な側へ広げる（1 画素ずつ、近傍の平均）。ぼかしで縁に黒が混ざらないように
    for _ in range(int(BLUR * 4) + 8):
        if filled.all(): break
        s = np.zeros_like(rgb); c = np.zeros(al.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                f = np.roll(np.roll(filled, dy, 0), dx, 1); s += np.roll(np.roll(rgb, dy, 0), dx, 1) * f[..., None]; c += f
        grow = (~filled) & (c > 0)
        rgb[grow] = s[grow] / c[grow][:, None]; filled = filled | grow
    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(BLUR * T.SS))
    out = np.dstack([np.asarray(im), al.astype(np.uint8)])
    Image.fromarray(out, 'RGBA').resize((w, h), Image.LANCZOS).save(os.path.join(OUT, name))

star0 = T.star_leaf
def star_soft(d, cx, cy, ang, L, base, mid, hi, vein):
    base = np.asarray(base) + (np.asarray(mid) - np.asarray(base)) * RIM
    star0(d, cx, cy, ang, L, base, mid, hi, vein)
T.star_leaf = star_soft
T.finish = soft_finish
T.LEAF_DARK = tuple(np.asarray(T.LEAF_DARK) + (np.asarray(T.LEAF_MID) - np.asarray(T.LEAF_DARK)) * RIM)   # spray_clover の外側の段

names = ['spray_maple', 'clump_maple', 'plate_maple', 'spray_clover']
for n in names: getattr(T, n)()
json.dump(names, open(os.path.join(OUT, 'index.json'), 'w'))
print(OUT, names, 'rim', RIM, 'blur', BLUR)
