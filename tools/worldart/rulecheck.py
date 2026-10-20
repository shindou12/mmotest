"""制作規則の相対の数値を、見本と撮影で同じ測り方で出す（L21、docs/world-art/rules/）。
撮影の差（スマホ・動画の圧縮）に強いよう、絶対値ではなく同じ画面の中の比を測る。
python3 -I tools/worldart/rulecheck.py img1 [img2 ...] [--json out.json]
  草・土/砂の 2 つの材質ごとに: 日陰/日なたの輝度比、R/G/B の比、青の寄り（日陰の B/R ÷ 日なたの B/R）
  階調: 輝度の p0.5 / p50 / p99.5（0〜255）
  上の帯: 上 15% の彩度 ÷ 中央の彩度（遠くのもや）"""
import sys, json, colorsys
import numpy as np
from PIL import Image

def load(p, W=960):
    im = Image.open(p).convert('RGB')
    w, h = im.size
    if w / h > 2.0:                     # B（スマホ撮影）の左右の黒い帯を落とす
        im = im.crop((int(w * 176 / 1884), 0, int(w * 1708 / 1884), h))
    im = im.resize((W, int(W * im.size[1] / im.size[0])))
    return np.asarray(im).astype(np.float32) / 255.0

def hsv(a):
    mx = a.max(2); mn = a.min(2); d = mx - mn + 1e-6
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    return h, d / (mx + 1e-6), mx

def otsu(v):
    hist, edges = np.histogram(v, 64, (0, 1)); c = (edges[:-1] + edges[1:]) / 2
    w0 = np.cumsum(hist); w1 = w0[-1] - w0; m0 = np.cumsum(hist * c) / np.maximum(w0, 1)
    m1 = (np.sum(hist * c) - np.cumsum(hist * c)) / np.maximum(w1, 1)
    return c[np.argmax(w0 * w1 * (m0 - m1) ** 2)]

def material(a, m):
    px = a[m]
    if len(px) < 500: return None
    L = px @ np.array([0.2126, 0.7152, 0.0722])
    t = otsu(L); lit = px[L > t + 0.04]; sh = px[L < t - 0.04]
    if len(lit) < 200 or len(sh) < 200: return None
    lm, sm = lit.mean(0), sh.mean(0)
    Ll, Ls = lm @ np.array([0.2126, 0.7152, 0.0722]), sm @ np.array([0.2126, 0.7152, 0.0722])
    return dict(ratio=round(float(Ls / Ll), 3), rgb=[round(float(x), 3) for x in sm / lm],
                blue=round(float((sm[2] / sm[0]) / (lm[2] / lm[0])), 3),
                lit=[int(x * 255) for x in lm], shadow=[int(x * 255) for x in sm], n=int(m.sum()))

def check(p):
    a = load(p); H, W, _ = a.shape
    y0, y1, x0, x1 = int(H * 0.12), int(H * 0.85), int(W * 0.1), int(W * 0.9)     # UI の多い縁を除く
    c = a[y0:y1, x0:x1]; h, s, v = hsv(c)
    grass = (h > 0.13) & (h < 0.32) & (s > 0.3)
    soil = (h > 0.05) & (h <= 0.13) & (s > 0.2) & (s < 0.75)
    L = (a @ np.array([0.2126, 0.7152, 0.0722])) * 255
    _, sa, _ = hsv(a)
    top = sa[: int(H * 0.15), x0:x1].mean(); mid = sa[int(H * 0.35):int(H * 0.65), x0:x1].mean()
    return dict(grass=material(c, grass), soil=material(c, soil),
                tone=[round(float(np.percentile(L, q)), 1) for q in (0.5, 50, 99.5)],
                top_sat=round(float(top / mid), 3))

if __name__ == '__main__':
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    out = {}
    for p in args:
        r = check(p); out[p] = r
        g, s_ = r['grass'], r['soil']
        f = lambda m: '-' if not m else f"{m['ratio']:.2f} b{m['blue']:.2f}"
        print(f"{p.split('/')[-1][:14]:14s} grass {f(g):12s} soil {f(s_):12s} tone {r['tone']} top_sat {r['top_sat']}")
    if '--json' in sys.argv:
        json.dump(out, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1)
