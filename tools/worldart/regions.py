"""場所ごとの日なた（明るい 1/4）と日陰（暗い 1/4）の HSV を、見本と撮影で並べる。
python3 -I tools/worldart/regions.py <ref> <img> name=u0,v0,u1,v1 [...]
  name=見本の範囲|撮影の範囲 と書くと、構図が違うとき別々の場所を測れる（例: 純粋な日なたの草）"""
import sys, colorsys
import numpy as np
from PIL import Image
ref, img = sys.argv[1:3]
def reg(p, b, W=1520, H=869):
    a = np.asarray(Image.open(p).convert('RGB').resize((W, H))).astype(float) / 255
    r = a[int(b[1] * H):int(b[3] * H), int(b[0] * W):int(b[2] * W)].reshape(-1, 3); L = r @ [0.2126, 0.7152, 0.0722]
    out = []
    for lo, hi in [(75, 100), (0, 25)]:
        m = (L >= np.percentile(L, lo)) & (L <= np.percentile(L, hi)); h = colorsys.rgb_to_hsv(*r[m].mean(0))
        out.append(f'{round(h[0] * 360):3d}°/{h[1]:.2f}/{h[2]:.2f}')
    return out
print(f'{"":14s} {"見本 日なた":>16s} {"見本 日陰":>14s} | {"撮影 日なた":>16s} {"撮影 日陰":>14s}')
for a in sys.argv[3:]:
    n, b = a.split('='); bs = b.split('|')
    b1 = tuple(map(float, bs[0].split(','))); b2 = tuple(map(float, bs[-1].split(',')))
    r1, r2 = reg(ref, b1), reg(img, b2)
    print(f'{n:14s} {r1[0]:>16s} {r1[1]:>14s} | {r2[0]:>16s} {r2[1]:>14s}')
