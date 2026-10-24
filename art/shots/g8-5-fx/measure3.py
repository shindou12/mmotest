import numpy as np, sys
from PIL import Image
def ld(p): return np.asarray(Image.open(p).convert('RGB')).astype(float)
def lum(a): return a @ [0.2126, 0.7152, 0.0722]
for st in sys.argv[2].split(','):
  for k in sys.argv[1].split(','):
    r=[]
    for pat in ('browser/%s_%s_12.png','godot/p_%s_%s_12.png'):
        f,b=ld(pat%(st,k)),ld(pat%(st,'none')); d=f-b; m=lum(d)>25
        dd=d[m]; r+= [((dd.max(-1)-dd.min(-1))/np.maximum(dd.max(-1),1)).mean(), lum(d)[m].mean(), ((lum(d)/np.maximum(255-lum(b),1))[m]).mean()]
    print(st,k,'dchroma %.2f/%.2f  dLum %.1f/%.1f  headroom %.2f/%.2f'%(r[0],r[3],r[1],r[4],r[2],r[5]))
