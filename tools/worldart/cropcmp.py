"""見本と撮影の同じ画面位置を切り出して並べる（局所の比較）。
python3 -I tools/worldart/cropcmp.py <out.png> <ref> <img> u0,v0,u1,v1 [u0,v0,u1,v1 ...]  （0〜1 の画面座標）"""
import sys
from PIL import Image
out, ref, img = sys.argv[1:4]; boxes = [tuple(map(float, b.split(','))) for b in sys.argv[4:]]
A = Image.open(ref).convert('RGB'); B = Image.open(img).convert('RGB').resize(A.size)
H = 360; tiles = []
for u0, v0, u1, v1 in boxes:
    box = (int(u0 * A.width), int(v0 * A.height), int(u1 * A.width), int(v1 * A.height))
    a = A.crop(box); b = B.crop(box); w = int(H * a.width / a.height)
    t = Image.new('RGB', (w * 2 + 6, H), (255, 255, 255)); t.paste(a.resize((w, H)), (0, 0)); t.paste(b.resize((w, H)), (w + 6, 0)); tiles.append(t)
W = max(t.width for t in tiles); s = Image.new('RGB', (W, (H + 6) * len(tiles)), (30, 30, 30))
for i, t in enumerate(tiles): s.paste(t, (0, i * (H + 6)))
s.save(out)
