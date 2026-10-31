# 効果の明るさ・彩度の比較: 効果なしの画面との差（効果の足した分）を、効果の出ている範囲で平均する
import sys, numpy as np
from PIL import Image
def ld(p): return np.asarray(Image.open(p).convert('RGB')).astype(float)
def lum(a): return a @ [0.2126, 0.7152, 0.0722]
def sat(a): return a.max(-1) - a.min(-1)
for st in sys.argv[2].split(','):
    for k in sys.argv[1].split(','):
        res = {}
        for who, pat in (('b', 'browser/%s_%s_12.png'), ('g', 'godot/p_%s_%s_12.png')):
            res[who] = (ld(pat % (st, k)), ld(pat % (st, 'none')))
        db = lum(res['b'][0]) - lum(res['b'][1]); dg = lum(res['g'][0]) - lum(res['g'][1])
        out = []
        mb = db > 20
        for who, d in (('b', db), ('g', dg)):
            m = mb
            f, base = res[who]
            hr = ((lum(f) - lum(base)) / np.maximum(255 - lum(base), 1))[m].mean()
            print('   headroom', who, round(hr, 3), 'base', round(lum(base)[m].mean()))
            out.append((m.sum(), d[m].mean() if m.any() else 0, (sat(f) - sat(base))[m].mean() if m.any() else 0, lum(f)[m].mean() if m.any() else 0))
        print('%s %-8s browser: n=%d dLum=%.1f dSat=%.1f lum=%.0f | godot: n=%d dLum=%.1f dSat=%.1f lum=%.0f | dLum ratio %.2f' % (st, k, *out[0], *out[1], out[1][1] / max(out[0][1], 1e-6)))
