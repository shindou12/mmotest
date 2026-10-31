"""沖の水面の明るさの分布（歪度・分位点）。見本は明るい側に偏る（明るい短い波頭）。
  python -I -X utf8 tools/worldart/water/skew.py <画像> x0,y0,x1,y1 ..."""
import sys
import numpy as np
from PIL import Image
args = sys.argv[1:]
for i in range(0, len(args), 2):
    im = np.asarray(Image.open(args[i]).convert('RGB')).astype(np.float32) / 255.0
    x0, y0, x1, y1 = (int(v) for v in args[i + 1].split(','))
    a = im[y0:y1, x0:x1]; L = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]).ravel()
    m, s = L.mean(), L.std(); sk = ((L - m) ** 3).mean() / s ** 3
    p = np.percentile(L, [5, 50, 95, 99])
    print(f'{args[i]}: 歪度 {sk:.2f}、p5 {p[0]:.3f} p50 {p[1]:.3f} p95 {p[2]:.3f} p99 {p[3]:.3f}（p95-p50 {p[2]-p[1]:.3f}、p50-p5 {p[1]-p[0]:.3f}）')
