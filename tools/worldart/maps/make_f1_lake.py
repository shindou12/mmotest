"""ゲームの第 1 層「静かな湖畔」（public/shared/areas.js の f1_lake）を、第 3 世代の規則（docs/world-art/rulebook.md）と
水の規則 w1（docs/world-art/rules/water-w1.md）で作り直す地図を書く。天気は晴れ（雨はゲームの天気の演出で上からかける。G8）。
python -I tools/worldart/maps/make_f1_lake.py   → public/worldart/maps/f1_lake.json
遊びに関わる形はゲームのまま（tools/worldart/maps/dump_area.mjs）: 輪郭、出口 1 つ（東、街へ）、当たり判定の池（中心 (0, -2.97)・半径 12.48）、
宝箱 1 つ（南）、出現位置、ワープポイント（西）。ネームド「ヌシ・ギガスライム」の見た目はゲームの側（従来版のまま）。
見た目の演出（当たり判定は増やさない）:
  湖     = 当たり判定の池の円に水際をそろえる。岸から 3m は浅瀬（寄せる波の泡が一本の線で出るよう傾きをそろえる）、中ほどは 3m の深さで沖の青
  岸     = 水際に 2〜3m の砂の浜、その外は草地。岸に小石と大岩をところどころ
  外周   = 輪郭のすぐ外が 3m の段の岩肌、その上は画面の外まで林（f1_field と同じ）。出口は段を切った谷
  北（奥）= 対岸の林。湖の上端を樹冠で縁取る
  東     = 街からの道（出口 → 湖の東の岸）。道しるべ
  西     = ワープポイントの石柱のある小さな草の広場、もみの木立
  南（手前）= 宝箱と倒木・切り株。木は少なく、湖が見えるように開ける
光・階調・仕上げ・地面の色は雛形（docs/world-art/templates/map-gen3.json）のまま。"""
import os, json, math, subprocess, copy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
AREA = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'tools/worldart/maps/dump_area.mjs'), 'f1_lake'], cwd=ROOT))
TPL = json.load(open(os.path.join(ROOT, 'docs/world-art/templates/map-gen3.json'), encoding='utf-8'))
rng = np.random.default_rng(26)
r2 = lambda v: round(float(v), 2)

OUT = np.array(AREA['outline'])
ang = np.arctan2(OUT[:, 0], -OUT[:, 1])
rad = np.hypot(OUT[:, 0], OUT[:, 1])
POND = next(o for o in AREA['obstacles'] if o['kind'] == 'pond')
PX, PZ, PR = POND['x'], POND['z'], POND['r']
WATER_LV = -0.45


def bound(a):
    """角度 a（北 0、東 +）の輪郭までの距離"""
    o = np.argsort(ang % (2 * math.pi))
    return float(np.interp(a % (2 * math.pi), (ang % (2 * math.pi))[o], rad[o], period=2 * math.pi))


def ring(off):
    pts = []
    for i in range(0, 360, 3):
        a = math.radians(i); r = bound(a) + off
        pts.append([r2(math.sin(a) * r), r2(-math.cos(a) * r)])
    return pts + [pts[0]]


def inside_r(x, z, pad=0.0):
    return math.hypot(x, z) < bound(math.atan2(x, -z)) - pad


def lake_d(x, z):
    """水際（当たり判定の池の縁）からの距離。内が負"""
    return math.hypot(x - PX, z - PZ) - PR


# ------------------------------------------------------------ 道
EXITS = AREA['exits']; e = EXITS[0]
sp = AREA['spawn']
paths, path_lines = [], []
L = math.hypot(e['x'] - PX, e['z'] - PZ); ux, uz = (e['x'] - PX) / L, (e['z'] - PZ) / L
pts = []
for along in list(np.arange(PR + 1.0, L + 0.01, 2.5)) + [L, L + 6, L + 14, L + 24]:
    side = math.sin(along * 0.15) * 1.6 if along <= L else math.sin(L * 0.15) * 1.6
    pts.append([r2(PX + ux * along - uz * side), r2(PZ + uz * along + ux * side)])
paths.append({'world': pts, 'width': 2.6, 'mat': 'dirt', 'soft': 0.7})
path_lines.append((np.array(pts), 2.6))
wp = AREA['waypoint']
paths.append({'world': [[wp['x'] - 0.4, wp['z']], [wp['x'] + 0.4, wp['z']]], 'width': 3.6, 'mat': 'dirt', 'soft': 0.9, 'jag': 1.3})
path_lines.append((np.array([[wp['x'] - 0.4, wp['z']], [wp['x'] + 0.4, wp['z']]]), 3.6))
for c in AREA['chests']:
    paths.append({'world': [[c['x'] - 0.3, c['z']], [c['x'] + 0.3, c['z']]], 'width': 3.0, 'mat': 'dirt', 'soft': 0.6, 'jag': 1.4})


def path_dist(x, z):
    best = 1e9
    for P, w in path_lines:
        for a, b in zip(P[:-1], P[1:]):
            ab = b - a; t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / (ab @ ab), 0, 1)
            best = min(best, math.hypot(x - a[0] - ab[0] * t, z - a[1] - ab[1] * t) - w / 2)
    return best


keep_clear = [(e['x'], e['z'], 6.0), (sp['x'], sp['z'], 4.0), (wp['x'], wp['z'], 3.5)] + [(c['x'], c['z'], 3.0) for c in AREA['chests']]
taken = []


def free(x, z, r, path_pad=2.2, edge=3.0, shore=3.0):
    if not inside_r(x, z, edge) or path_dist(x, z) < path_pad or lake_d(x, z) < shore: return False
    if any(math.hypot(x - a, z - b) < c for a, b, c in keep_clear): return False
    return not any(math.hypot(x - a, z - b) < c + r for a, b, c in taken)


def region(x, z):
    a = math.degrees(math.atan2(x - PX, -(z - PZ))) % 360
    if 135 <= a < 225: return 'south'
    if 225 <= a < 315: return 'west'
    if a >= 315 or a < 45: return 'north'
    return 'east'


STYLE = {
    'north': dict(trees=['maple2_t', 'fir3_a', 'maple2_a', 'maple2_s', 'fir3_b'], groves=9, count=(3, 5)),
    'west': dict(trees=['fir3_a', 'fir3_b', 'maple2_t', 'fir3_a'], groves=6, count=(2, 4)),
    'east': dict(trees=['maple2_s', 'maple2_a', 'maple2_t'], groves=4, count=(2, 3)),
    'south': dict(trees=['maple2_s', 'maple2_t'], groves=2, count=(1, 2)),
}
trees, props = [], []
for reg, st in STYLE.items():
    made = 0
    for _ in range(5000):
        if made >= st['groves']: break
        a = rng.uniform(0, 6.28); f = math.sqrt(rng.uniform(0.2, 0.9)); x, z = math.sin(a) * bound(a) * f, -math.cos(a) * bound(a) * f
        if region(x, z) != reg or not free(x, z, 3.0, path_pad=3.0, edge=4.0, shore=5.0): continue
        k = int(rng.integers(st['count'][0], st['count'][1] + 1)); a0 = rng.uniform(0, 6.28)
        for j in range(k):
            rr = 0 if j == 0 else 2.5 * rng.uniform(0.85, 1.15); aj = a0 + j * 2 * math.pi / max(1, k - 1) + rng.uniform(-0.4, 0.4)
            tx, tz = x + math.cos(aj) * rr, z + math.sin(aj) * rr
            if not free(tx, tz, 1.1, path_pad=2.0, edge=3.0, shore=4.0): continue
            trees.append({'asset': st['trees'][int(rng.integers(len(st['trees'])))], 'world': [r2(tx), r2(tz)], 'scale': r2(rng.uniform(0.9, 1.08))})
            taken.append((tx, tz, 1.1))
        made += 1

# ------------------------------------------------------------ 小物
for c in AREA['chests']:
    props.append({'asset': 'chest_s', 'world': [c['x'], c['z']], 'rot': r2(math.degrees(math.atan2(-(c['x'] - PX), -(c['z'] - PZ)))), 'chest': c['id']})
L = math.hypot(e['x'], e['z']); gx, gz = e['x'] / L * (L + 1.5), e['z'] / L * (L + 1.5)
props.append({'asset': 'waygate', 'world': [r2(gx), r2(gz)], 'rot': r2(math.degrees(math.atan2(e['x'] / L, e['z'] / L))), 'exit': e['to']})
props.append({'asset': 'waystone', 'world': [r2(wp['x']), r2(wp['z'])], 'rot': 0, 'waypoint': True})
props.append({'asset': 'signpost', 'world': [r2(PX + PR + 5.5), r2(PZ + 3.2)], 'rot': 75})
c0 = AREA['chests'][0]
props += [{'asset': 'log_fallen', 'world': [r2(c0['x'] - 3.4), r2(c0['z'] - 0.8)], 'rot': 20}, {'asset': 'stump', 'world': [r2(c0['x'] + 3.0), r2(c0['z'] - 1.4)], 'rot': 0}]
taken += [(p['world'][0], p['world'][1], 1.5) for p in props]
# 岸の石: 水際の 0.3〜1.8m 外に小石、ところどころ大岩の組
for i in range(26):
    a = rng.uniform(0, 6.28); d = PR + rng.uniform(0.3, 1.8); x, z = PX + math.sin(a) * d, PZ - math.cos(a) * d
    if path_dist(x, z) < 0.6 or any(math.hypot(x - p, z - q) < r for p, q, r in keep_clear): continue
    props.append({'asset': 'rock_s', 'world': [r2(x), r2(z)], 'rot': int(rng.uniform(0, 360)), 'scale': r2(rng.uniform(0.7, 1.2))})
for a_deg in (330, 20, 250):   # 大岩の組: 北の対岸 2 つ、西 1 つ
    a = math.radians(a_deg); d = PR + 1.6; x, z = PX + math.sin(a) * d, PZ - math.cos(a) * d
    props.append({'asset': 'boulder_a', 'world': [r2(x), r2(z)], 'rot': int(rng.uniform(0, 360)), 'scale': r2(rng.uniform(1.0, 1.3))})
    for k in range(3):
        aa = rng.uniform(0, 6.28); dd = rng.uniform(1.0, 1.8)
        props.append({'asset': ['rock_s', 'boulder_a', 'rock_s'][k], 'world': [r2(x + math.cos(aa) * dd), r2(z + math.sin(aa) * dd)], 'rot': int(rng.uniform(0, 360)), 'scale': r2(rng.uniform(0.6, 0.9))})


def put(asset, reg, n, rr=0.8, scale=(0.85, 1.15), shore=3.0):
    made = 0
    for _ in range(3000):
        if made >= n: return
        a = rng.uniform(0, 6.28); f = math.sqrt(rng.uniform(0.05, 0.9)); x, z = math.sin(a) * bound(a) * f, -math.cos(a) * bound(a) * f
        if (reg and region(x, z) != reg) or not free(x, z, rr, path_pad=1.5, edge=4.0, shore=shore): continue
        props.append({'asset': asset, 'world': [r2(x), r2(z)], 'rot': int(rng.uniform(0, 360)), 'scale': r2(rng.uniform(*scale))}); taken.append((x, z, rr)); made += 1


put('log_fallen', 'west', 1, rr=1.8); put('stump', 'west', 1); put('boulder_a', 'west', 2)
put('stump', 'east', 2); put('rock_s', 'east', 3, rr=0.4)
put('boulder_a', 'north', 2, shore=4.0)

# ------------------------------------------------------------ 地図
g = copy.deepcopy(TPL)
g.update(name='f1_lake', seed=26)
g['note'] = ('ゲームの第 1 層「静かな湖畔」（f1_lake）を第 3 世代の規則と水の規則 w1 で作り直したもの（tools/worldart/maps/make_f1_lake.py が書く。手で直さない）。'
             '輪郭・出口・当たり判定の池・宝箱・出現位置・ワープポイントはゲームのまま。天気は晴れ。')
g['camera'] = dict(TPL['camera'], target=[r2(sp['x'] - 4), 0, r2(sp['z'] - 3)])
g['game'] = {'area': 'f1_lake', 'outline': ring(0.0), 'exits': EXITS, 'spawn': sp, 'waypoint': wp, 'chests': AREA['chests'], 'obstacles': AREA['obstacles']}
xs = OUT[:, 0]
g['terrain'] = {
    'size': 160, 'cell': 0.5, 'center': [r2((xs.min() + xs.max()) / 2), 0.0], 'ground': 'grass',
    'hills': {'amp': 0.3, 'scale': 18},
    # 湖の窪み: 縁の半径を当たり判定の円より 1.2m 大きく（水面 -0.45 と交わる所が円にそろう）
    'basins': [{'world': [PX, PZ], 'r': r2(PR + 1.2), 'jag': 0.7, 'shelf': 3.5, 'shelfDepth': 0.9, 'depth': 3.2, 'slope': 5.0, 'beach': 3.0}],
    'water': {'level': WATER_LV, 'rule': 'w1', 'deepAt': 2.2, 'causticAt': 3.0, 'bandAt': 0.5},
    'cliffs': [{
        'world': ring(1.5), 'lowPoint': [0, 0], 'raise': True, 'drop': 3.0, 'width': 2.4, 'jag': 1.0, 'relief': 0.4, 'drape': 0.5,
        'gaps': [{'world': [[r2(e['x'] * 0.9), r2(e['z'] * 0.9)], [r2(e['x'] * 2.2), r2(e['z'] * 2.2)]], 'r': 2.9}],
    }],
}
# 浜の砂の色を rulebook 6.1 の砂の日なた (223〜243, 183〜195, 119〜125) に（既定の絵のままでは青みが強く (236, 203, 147)）
g['ground'] = dict(g['ground'], altTint=[0.98, 0.93, 0.8])
g['paths'] = paths
g['zones'] = [{
    'kind': 'forest', 'world': ring(24.0), 'exclude': ring(3.0), 'noRock': True,
    'trees': ['maple2_s', 'maple2_t', 'fir3_a', 'maple2_a', 'maple2_t'], 'spacing': 3.3, 'scale': [0.9, 1.08],
}]
g['groves'] = []
g['trees'] = trees
g['props'] = props
g['lines'] = []
g['scatter_within'] = ring(4.5)
cx_ = g['terrain']['center'][0]
g['scatter_box'] = [r2(cx_ - 80), r2(cx_ + 80), -80, 80]
V = lambda x, z, yaw=0: dict(TPL['camera'], target=[r2(x), 0, r2(z)], yaw=yaw)
g['views'] = {
    'L01': V(sp['x'] - 4, sp['z'] - 3),            # 街から来た所（東）。湖の東の岸が見える
    'L02': V(PX, PZ + 9),                           # 南の岸から湖の中心（手前に浜、奥に対岸の林）
    'L03': V(wp['x'] + 2, wp['z'] - 3),             # 西のワープポイントと西の岸
    'L04': V(PX + 2, PZ - 12),                      # 北の対岸（大岩の組と林）
    'L05': V(c0['x'], c0['z'] - 4),                 # 南の宝箱と南の岸
    'OV': dict(TPL['camera'], target=[0, 0, 0], pitch=88, dist=240, fov=32),
}
json.dump(g, open(os.path.join(ROOT, 'public/worldart/maps/f1_lake.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
from collections import Counter
print('trees', len(trees), Counter(t['asset'] for t in trees)); print('props', Counter(p['asset'] for p in props))
