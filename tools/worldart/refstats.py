"""参考画像/撮影画像の環境部分の色統計。UI・人物の矩形はマスクで除く。
python3 -I tools/worldart/refstats.py img1 [img2 ...] [--json out.json]"""
import sys, json, colorsys
import numpy as np
from PIL import Image

# 1919x1079基準のUI矩形 (x0,y0,x1,y1)。撮影画像はUIがないので無視される
UI = [(0,0,1919,95),(0,95,290,290),(1720,0,1919,230),(0,930,1919,1079),(1600,930,1919,1079),
      (0,560,300,720),(1620,700,1919,760),(40,790,420,940)]

def load(p, W=960):
    im = Image.open(p).convert('RGB'); sx = W/im.width
    im = im.resize((W, round(im.height*sx)), Image.BILINEAR)
    a = np.asarray(im).astype(np.float32)/255
    m = np.ones(a.shape[:2], bool)
    if im.height/im.width < 0.6:  # 16:9 ゲーム画面
        f = W/1919
        for x0,y0,x1,y1 in UI: m[int(y0*f):int(y1*f), int(x0*f):int(x1*f)] = False
    return a, m

def stats(a, m):
    L = a@np.array([0.2126,0.7152,0.0722])
    mx, mn = a.max(2), a.min(2); S = np.where(mx>0,(mx-mn)/np.maximum(mx,1e-6),0)
    r,g,b = a[...,0],a[...,1],a[...,2]
    green = m & (g>=r*0.9) & (g>b) & (S>0.15)
    out = {}
    v = L[m]; out['L_mean']=float(v.mean()); out['L_p10']=float(np.percentile(v,10)); out['L_p90']=float(np.percentile(v,90))
    out['S_mean']=float(S[m].mean()); out['green_frac']=float(green.sum()/m.sum())
    gl = L[green]
    if gl.size>100:
        lo, hi = np.percentile(gl,25), np.percentile(gl,75)
        sh = green & (L<=lo); li = green & (L>=hi)
        out['grass_shadow_rgb']=[round(float(x),3) for x in a[sh].mean(0)]
        out['grass_lit_rgb']=[round(float(x),3) for x in a[li].mean(0)]
        out['lit_shadow_ratio']=float(L[li].mean()/max(L[sh].mean(),1e-4))
        h = lambda c: [float(x) for x in colorsys.rgb_to_hsv(*[float(y) for y in c])]
        out['shadow_hsv']=[round(x,3) for x in h(a[sh].mean(0))]; out['lit_hsv']=[round(x,3) for x in h(a[li].mean(0))]
    H = a.shape[0]
    for name,(y0,y1) in {'top':(0.09,0.3),'mid':(0.3,0.65),'bot':(0.65,0.86)}.items():
        mm = m.copy(); mm[:int(y0*H)]=False; mm[int(y1*H):]=False
        out[f'{name}_L']=float(L[mm].mean()); out[f'{name}_S']=float(S[mm].mean())
        out[f'{name}_rgb']=[round(float(x),3) for x in a[mm].mean(0)]
    # 細部量: ラプラシアンの平均絶対値（テクスチャの細かさ・シャープさ）
    lap = np.abs(4*L[1:-1,1:-1]-L[:-2,1:-1]-L[2:,1:-1]-L[1:-1,:-2]-L[1:-1,2:])
    out['detail']=float(lap[m[1:-1,1:-1]].mean())
    return out

if __name__=='__main__':
    args=[x for x in sys.argv[1:] if not x.startswith('--')]
    jo = sys.argv[sys.argv.index('--json')+1] if '--json' in sys.argv else None
    if jo: args=[x for x in args if x!=jo]
    res={p:stats(*load(p)) for p in args}
    for p,s in res.items():
        print(p); print('  '+'  '.join(f'{k}={v if not isinstance(v,float) else round(v,3)}' for k,v in s.items()))
    if jo: json.dump(res,open(jo,'w'),indent=1)
