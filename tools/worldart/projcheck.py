"""地図の配置を、あるビューの画面座標に投げて一覧にする（どの物が画面のどこに映るか）。
python3 -I tools/worldart/projcheck.py <地図> <ビュー> [u0,v0,u1,v1]"""
import sys, json, math
import numpy as np
m, vname = sys.argv[1], sys.argv[2]
box = tuple(map(float, sys.argv[3].split(','))) if len(sys.argv) > 3 else (0, 0, 1, 1)
spec = json.load(open(f'public/worldart/maps/{m}.json')); pl = json.load(open(f'public/worldart/maps/{m}/placements.json'))
v = dict(spec['camera'], **spec['views'][vname]); asp = v.get('aspect', spec.get('aspect', 16 / 9))
t = np.array(v['target'], float); yw, pc = math.radians(v['yaw']), math.radians(v['pitch'])
C = t + v['dist'] * np.array([math.sin(yw) * math.cos(pc), math.sin(pc), math.cos(yw) * math.cos(pc)])
F = (t - C) / np.linalg.norm(t - C); R = np.cross(F, [0, 1, 0]); R /= np.linalg.norm(R); U = np.cross(R, F); th = math.tan(math.radians(v['fov']) / 2)
def proj(p):
    d = np.array(p) - C; z = d @ F; return (d @ R / z / (th * asp) + 1) / 2, (1 - d @ U / z / th) / 2
SKIP = {'grass_a', 'grass_tall_a', 'flowers_a', 'clover_a'}
for a, items in sorted(pl['assets'].items()):
    if a in SKIP: continue
    hits = []
    for it in items:
        u, vv = proj(it[:3]); ut, vt = proj([it[0], it[1] + 4 * it[4], it[2]])     # 根元と、高さ 4m（樹冠の中ほど）
        if (box[0] <= u <= box[2] and box[1] <= vv <= box[3]) or ('--top' in sys.argv and box[0] <= ut <= box[2] and box[1] <= vt <= box[3]):
            hits.append(f'({u:.2f},{vv:.2f})->({ut:.2f},{vt:.2f})')
    if hits: print(f'{a:16s} {len(hits):3d}  ' + ' '.join(hits[:10]))
