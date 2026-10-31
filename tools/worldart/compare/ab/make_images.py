"""見本くらべのページ（index.html、claude.ai の Artifact「見本くらべ L27」と同じもの）の画像を、コミット済みの撮影から作る。
python -I -X utf8 tools/worldart/compare/ab/make_images.py   → tools/worldart/compare/ab/img/<名前>_<ビュー>.webp
版を足すときは SRC に 1 行足し、index.html の VERSIONS に [名前, ボタンの名前, 比べる現在の名前] を足す。
見本は rulecheck.load で UI の多い左右の帯を落とし、撮影と同じ 1400 幅にそろえる。"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import rulecheck as rc
import numpy as np
from PIL import Image
S = 'art/shots/ab'
SRC = {   # 名前 → 撮影のフォルダ（B01・B03 の webp か png がある所）
    'ref': 'art/ref',
    'base': f'{S}/L27h/mihon2/base', 'base2': f'{S}/L27e/base', 'base3': f'{S}/L27f/base', 'base4': f'{S}/L27g/diff0',
    'base5': f'{S}/L27h2/base', 'base6': f'{S}/L27i/base', 'base8': f'{S}/L28x/base', 'base9': f'{S}/L28k/base',
    'vsoft': f'{S}/L27i/soft', 'bake5': f'{S}/L27f/bake5',
    'srad24': f'{S}/L28k/k1_srad24', 'srad12': f'{S}/L28k/k1_srad12', 'k3': f'{S}/L28k/k3_srad24_gwide3',
    **{f'xc{c}_b{b}': f'{S}/L28x/c{c}_b{b}' for c in 'SML' for b in 'sml'},
}
out = os.path.join(os.path.dirname(__file__), 'img'); os.makedirs(out, exist_ok=True)
for k, d in SRC.items():
    for v in ('B01', 'B03'):
        p = next((f'{d}/{v}.{e}' for e in ('webp', 'png') if os.path.exists(f'{d}/{v}.{e}')), None)
        if not p: print('ない:', d, v); continue
        Image.fromarray((rc.load(p, 1400) * 255).astype(np.uint8)).save(f'{out}/{k}_{v}.webp', quality=85)
print('ok', len(os.listdir(out)))
