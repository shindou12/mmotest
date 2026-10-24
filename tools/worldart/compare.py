"""見本と撮影画像を並べて比べる。
python3 -I tools/worldart/compare.py <out.png> <ref> <img1> [img2 ...] [--labels a,b,c] [--gray]
  - 各画像を 640x360 にそろえ、横に並べる（見本が左端）。--gray で輝度だけの段も足す。
  - 標準出力に refstats の主要な値の表（見本との差）を出す。
"""
import sys, os
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from refstats import load, stats

args = [a for a in sys.argv[1:] if not a.startswith('--')]
labels = None
if '--labels' in sys.argv:
    labels = sys.argv[sys.argv.index('--labels') + 1].split(','); args.remove(','.join(labels))
out, imgs = args[0], args[1:]
W, H = 640, 360
rows = [[], []]
for i, p in enumerate(imgs):
    im = Image.open(p).convert('RGB').resize((W, H), Image.LANCZOS)
    d = ImageDraw.Draw(im); lab = (labels[i] if labels and i < len(labels) else os.path.basename(p))
    d.rectangle([0, 0, 8 + 7 * len(lab), 16], fill=(0, 0, 0)); d.text((4, 2), lab, fill=(255, 255, 255))
    rows[0].append(im)
    rows[1].append(im.convert('L').convert('RGB'))
nrow = 2 if '--gray' in sys.argv else 1
cols = min(len(imgs), 3)
gr = (len(imgs) + cols - 1) // cols
sheet = Image.new('RGB', (W * cols, H * gr * nrow), (30, 30, 30))
for i in range(len(imgs)):
    for r in range(nrow):
        sheet.paste(rows[r][i], ((i % cols) * W, ((i // cols) * nrow + r) * H))
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
sheet.save(out)
keys = ['L_mean', 'lit_shadow_ratio', 'S_mean', 'detail', 'top_L', 'bot_L']
ref = stats(*load(imgs[0]))
print('%-28s' % 'image' + ''.join('%14s' % k for k in keys) + '%22s%22s' % ('shadow_hsv', 'lit_hsv'))
for p in imgs:
    s = stats(*load(p))
    print('%-28s' % os.path.basename(p)[:28] + ''.join('%14.3f' % s.get(k, 0) for k in keys)
          + '%22s%22s' % (str([round(s['shadow_hsv'][0] * 360), round(s['shadow_hsv'][1], 2), round(s['shadow_hsv'][2], 2)]),
                          str([round(s['lit_hsv'][0] * 360), round(s['lit_hsv'][1], 2), round(s['lit_hsv'][2], 2)])))
