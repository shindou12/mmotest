import sys, numpy as np
from PIL import Image
def ld(p): return np.asarray(Image.open(p).convert('RGB')).astype(float)
def lum(a): return a @ [0.2126, 0.7152, 0.0722]
for st in sys.argv[2].split(','):
    for k in sys.argv[1].split(','):
        r = []
        for pat in ('browser/%s_%s_12.png', 'godot/p_%s_%s_12.png'):
            f, b = ld(pat % (st, k)), ld(pat % (st, 'none'))
            d = lum(f) - lum(b); m = np.abs(d) > 20
            sat = lambda a: (a.max(-1) - a.min(-1))
            r.append((((d * m).sum()) / (np.maximum(255 - lum(b), 1) * m).sum(), (sat(f) / np.maximum(f.max(-1), 1))[m].mean(), m.sum()))
        print(st, k, 'headroom b/g %.3f/%.3f ratio %.2f | HSVsat b/g %.3f/%.3f | n %d/%d' % (r[0][0], r[1][0], r[1][0] / r[0][0], r[0][1], r[1][1], r[0][2], r[1][2]))
