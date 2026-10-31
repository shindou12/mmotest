"""撮った絵の水を、水面の深さ（height.png）から作った枠ではなく、手で選んだ枠で測る（measure_ref.py と同じ指標）。
  python -I -X utf8 measure_shot.py <画像> deep=x0,y0,x1,y1 shallow=... sand=...
"""
import sys, colorsys
import numpy as np
from PIL import Image

a = np.asarray(Image.open(sys.argv[1]).convert('RGB')) / 255.0
R = {k: tuple(int(v) for v in s.split(',')) for k, s in (x.split('=') for x in sys.argv[2:])}
out = {}
for k, (x0, y0, x1, y1) in R.items():
    f = a[y0:y1, x0:x1].reshape(-1, 3)
    lum = 0.2126 * f[:, 0] + 0.7152 * f[:, 1] + 0.0722 * f[:, 2]
    m = np.median(f, 0); h, s, v = colorsys.rgb_to_hsv(*m)
    out[k] = (lum.mean(), h * 360, s, (m * 255).round().astype(int).tolist())
sand = out.get('sand', (1,))[0]
for k, (l, h, s, rgb) in out.items():
    print(f'{k}: lum {l:.3f}（砂比 {l / sand:.2f}）hue {h:.0f} sat {s:.2f} rgb {rgb}')
