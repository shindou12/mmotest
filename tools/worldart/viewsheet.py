"""固定ビューの比較シート。見本のあるビューは「見本 | 撮影 | 輝度（見本/撮影）」を 1 行に、見本のないビューは撮影だけを並べる。
python3 -I tools/worldart/viewsheet.py <撮影フォルダ> <出力.png> [--ref-dir art/ref/mihon2]
  撮影フォルダの B01.png は art/ref/mihon2/B01_game.webp と組にする。その他（oblique_B01.png など）は撮影だけ。"""
import sys, os, glob
from PIL import Image, ImageDraw, ImageOps
args = [a for a in sys.argv[1:] if not a.startswith('--')]
shots, out = args[0], args[1]
refd = sys.argv[sys.argv.index('--ref-dir') + 1] if '--ref-dir' in sys.argv else 'art/ref/mihon2'
if '--ref-dir' in sys.argv: args.remove(refd)
W, H = 560, 318
def lab(im, t):
    d = ImageDraw.Draw(im); d.rectangle([0, 0, 8 + 7 * len(t), 16], fill=(0, 0, 0)); d.text((4, 2), t, fill=(255, 255, 0)); return im
rows = []
files = sorted(f for f in glob.glob(os.path.join(shots, '*.png')) if not os.path.basename(f).startswith('sheet'))
refs = [f for f in files if os.path.exists(os.path.join(refd, os.path.basename(f)[:-4] + '_game.webp'))]
others = [f for f in files if f not in refs]
for f in refs:
    n = os.path.basename(f)[:-4]
    r = Image.open(os.path.join(refd, n + '_game.webp')).convert('RGB').resize((W, H))
    o = Image.open(f).convert('RGB').resize((W, H))
    g = Image.new('RGB', (W, H)); g.paste(ImageOps.grayscale(r).resize((W // 2, H // 2)), (0, 0)); g.paste(ImageOps.grayscale(o).resize((W // 2, H // 2)), (W // 2, 0))
    g.paste(r.resize((W // 2, H // 2)).convert('L').point(lambda v: 255 if v > 150 else (0 if v < 75 else 128)).convert('RGB'), (0, H // 2))
    g.paste(o.resize((W // 2, H // 2)).convert('L').point(lambda v: 255 if v > 150 else (0 if v < 75 else 128)).convert('RGB'), (W // 2, H // 2))
    rows.append([lab(r, f'{n} 見本'.encode('ascii', 'ignore').decode() or n + ' ref'), lab(o, n + ' ours'), lab(g, 'gray / 3-level: ref | ours')])
oth = [lab(Image.open(f).convert('RGB').resize((W, H)), os.path.basename(f)[:-4]) for f in others]
for i in range(0, len(oth), 3): rows.append(oth[i:i + 3])
sheet = Image.new('RGB', (W * 3 + 8, (H + 4) * len(rows)), (25, 25, 25))
for j, row in enumerate(rows):
    for i, im in enumerate(row): sheet.paste(im, (i * (W + 4), j * (H + 4)))
sheet.save(out); print(out, len(refs), 'ref rows +', len(oth), 'others')
