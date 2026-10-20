"""アイデアの入／切を、同じ地図・同じカメラ・同じ光で撮った 2 枚で比べる（L22）。
python3 -I tools/worldart/abcompare.py <切の画像> <入の画像> <拡大の出力.png> [--label 名前]
  rulecheck の数値（草・土の日陰/日なたの比と青の寄り、階調）を両方で出し、
  画面全体の輝度の差（平均 |ΔL|、ΔL > 3/255 の画素の割合）と、いちばん差の大きい 192px 四方を 3 倍に拡大して左右に並べる
  （左 = 切、中 = 入、右 = 差を 8 倍に強めた絵）。"""
import sys, os, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rulecheck as R

off, on, out = sys.argv[1:4]
label = sys.argv[sys.argv.index('--label') + 1] if '--label' in sys.argv else ''
A = np.asarray(Image.open(off).convert('RGB')).astype(np.float32)
B = np.asarray(Image.open(on).convert('RGB')).astype(np.float32)
W = np.array([0.2126, 0.7152, 0.0722])
dL = (B @ W) - (A @ W)
k = 64
H_, W_ = dL.shape
blk = np.abs(dL[: H_ // k * k, : W_ // k * k]).reshape(H_ // k, k, W_ // k, k).mean((1, 3))
iy, ix = np.unravel_index(np.argmax(blk), blk.shape)
cy = min(max(iy * k + k // 2 - 96, 0), H_ - 192); cx = min(max(ix * k + k // 2 - 96, 0), W_ - 192)
crop = lambda a: Image.fromarray(np.clip(a[cy:cy + 192, cx:cx + 192], 0, 255).astype(np.uint8)).resize((384, 384), Image.NEAREST)
d = np.clip(128 + (B - A) * 8, 0, 255)
sheet = Image.new('RGB', (384 * 3 + 8, 384), (20, 20, 20))
for i, im in enumerate([crop(A), crop(B), crop(d)]): sheet.paste(im, (i * 392, 0))
sheet.save(out)
ra, rb = R.check(off), R.check(on)
f = lambda m: None if not m else [m['ratio'], m['blue']]
res = dict(label=label, mean_abs_dL=round(float(np.abs(dL).mean()), 2), changed=round(float((np.abs(dL) > 3).mean()), 3),
           mean_dL=round(float(dL.mean()), 2), crop=[int(cx), int(cy)],
           off=dict(grass=f(ra['grass']), soil=f(ra['soil']), tone=ra['tone']),
           on=dict(grass=f(rb['grass']), soil=f(rb['soil']), tone=rb['tone']))
print(json.dumps(res, ensure_ascii=False))
