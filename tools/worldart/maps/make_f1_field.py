"""ゲームの第 1 層「ひだまりの草原」（public/shared/areas.js の f1_field）を、第 3 世代の規則（docs/world-art/rulebook.md）で作り直す地図を書く（L25）。
python3 -I tools/worldart/maps/make_f1_field.py   → public/worldart/maps/f1_field.json
遊びに関わる形はゲームのまま: 輪郭（boundR）、出口 4 つ、当たり判定のある木 11 本と岩 1 つ、宝箱 2 つ、出現位置、ワープポイント（tools/worldart/maps/dump_area.mjs が書き出す）。
道もゲームと同じ曲がり方（中心から出口へ、横に sin(along*0.12)*2.5 ずれる）。
見た目の演出（ステージの再ディレクション。当たり判定は増やさない）:
  外周   = 輪郭のすぐ外が 3m の段の岩肌（草が垂れる）、その上は画面の外まで林。出口は段を切った谷で、道が林の奥へ続く
  中心   = 4 本の道が交わる土の広場に、ワープポイントの石柱（waystone）と道しるべ
  南（街へ）   = 日当たりのよい花の多い草地。木は少なく、倒木の腰掛け
  西（古井戸の洞窟へ）= 暗い林（もみを混ぜた木立が多い）、苔の岩と倒木
  北（迷宮区へ）     = 当たり判定の大岩のまわりに岩の組、木立
  東（イノシシの丘へ）= 開けた草地に柵と切り株（狩り場の手前）
光・階調・仕上げ・地面の色は雛形（docs/world-art/templates/map-gen3.json）のまま。"""
import os, json, math, subprocess, copy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
AREA = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'tools/worldart/maps/dump_area.mjs'), 'f1_field'], cwd=ROOT))
TPL = json.load(open(os.path.join(ROOT, 'docs/world-art/templates/map-gen3.json')))
rng = np.random.default_rng(25)
r2 = lambda v: round(float(v), 2)

OUT = np.array(AREA['outline'])          # 1° ごとの輪郭
ang = np.arctan2(OUT[:, 0], -OUT[:, 1])
rad = np.hypot(OUT[:, 0], OUT[:, 1])


def bound(a):
    """角度 a（北 0、東 +）の輪郭までの距離（1° の表を補間）"""
    return float(np.interp(a % (2 * math.pi), np.r_[ang % (2 * math.pi)][np.argsort(ang % (2 * math.pi))], rad[np.argsort(ang % (2 * math.pi))], period=2 * math.pi))


def ring(off):
    """輪郭を外へ off m 広げた閉じた多角形（3° ごと）"""
    pts = []
    for i in range(0, 360, 3):
        a = math.radians(i); r = bound(a) + off
        pts.append([r2(math.sin(a) * r), r2(-math.cos(a) * r)])
    return pts + [pts[0]]


def inside_r(x, z, pad=0.0):
    return math.hypot(x, z) < bound(math.atan2(x, -z)) - pad


# ------------------------------------------------------------ 道（ゲームと同じ形）
EXITS = AREA['exits']
MAIN = {'f1_town': 3.0, 'f1_lab': 3.0, 'f1_hunt': 2.4, 'f1_dun': 2.4}
paths, path_lines = [], []
for e in EXITS:
    L = math.hypot(e['x'], e['z']); ux, uz = e['x'] / L, e['z'] / L; px, pz = uz, -ux
    pts = []
    for along in list(np.arange(2.0, L + 0.01, 3.0)) + [L, L + 6, L + 14, L + 24]:
        side = -math.sin(along * 0.12) * 2.5 if along <= L else -math.sin(L * 0.12) * 2.5
        pts.append([r2(ux * along + px * side), r2(uz * along + pz * side)])
    paths.append({'world': pts, 'width': MAIN[e['to']], 'mat': 'dirt', 'soft': 0.7})
    path_lines.append((np.array(pts), MAIN[e['to']]))
paths.append({'world': [[-0.5, 0.3], [0.5, -0.3]], 'width': 5.5, 'mat': 'dirt', 'soft': 1.0})   # 中心の土の広場（L25b: 7.5 → 5.5、広すぎて画面が土だけになった）
path_lines.append((np.array([[-0.5, 0.3], [0.5, -0.3]]), 5.5))
for c in AREA['chests']:   # 宝箱の足元を踏み固めた土に（茂みと草の房が宝箱を隠さない。遊びの目印）
    paths.append({'world': [[c['x'] - 0.3, c['z']], [c['x'] + 0.3, c['z']]], 'width': 3.0, 'mat': 'dirt', 'soft': 0.6, 'jag': 1.4})


def path_dist(x, z):
    best = 1e9
    for P, w in path_lines:
        for a, b in zip(P[:-1], P[1:]):
            ab = b - a; t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / (ab @ ab), 0, 1)
            best = min(best, math.hypot(x - a[0] - ab[0] * t, z - a[1] - ab[1] * t) - w / 2)
    return best


# ------------------------------------------------------------ 避ける所（遊びの場所）
SOLID = [o for o in AREA['obstacles'] if o['solid']]
keep_clear = [(e['x'], e['z'], 7.0) for e in EXITS] + [(c['x'], c['z'], 3.0) for c in AREA['chests']] + \
             [(v['x'], v['z'], 4.0) for v in AREA['arrivals'].values()] + [(0, 0, 6.5)]
taken = [(o['x'], o['z'], o['r'] + 0.6) for o in SOLID]


def free(x, z, r, path_pad=2.2, edge=3.0):
    if not inside_r(x, z, edge) or path_dist(x, z) < path_pad: return False
    if any(math.hypot(x - a, z - b) < c for a, b, c in keep_clear): return False
    return not any(math.hypot(x - a, z - b) < c + r for a, b, c in taken)


def region(x, z):
    a = math.degrees(math.atan2(x, -z)) % 360
    if math.hypot(x, z) < 12: return 'center'
    if 135 <= a < 225: return 'south'
    if 225 <= a < 320: return 'west'
    if a >= 320 or a < 40: return 'north'
    return 'east'


# 地域ごとの木立の種類と数（ゲームの飾りの木は ≈46 本。ここでは当たり判定の木 11 本 + 飾り）
STYLE = {
    'south': dict(trees=['maple2_s', 'maple2_t', 'maple2_a'], groves=10, count=(2, 4)),
    'west': dict(trees=['fir4_a', 'maple2_t', 'fir4_b', 'fir4_c', 'maple2_s'], groves=18, count=(3, 6)),
    'north': dict(trees=['maple2_t', 'fir4_c', 'maple2_s'], groves=11, count=(2, 4)),
    'east': dict(trees=['maple2_s', 'maple2_a', 'maple2_t'], groves=9, count=(2, 3)),
    'center': dict(trees=['maple2_s'], groves=0, count=(1, 1)),
}
trees, props = [], []
# 当たり判定の木: 大きな広葉樹（半径の大きい方を maple2_b）
for o in SOLID:
    if o['kind'] == 'tree':
        a = 'maple2_b' if o['r'] > 2.3 else 'maple2_a'
        trees.append({'asset': a, 'world': [o['x'], o['z']], 'scale': r2(0.95 + (o['r'] - 1.7) * 0.12), 'rot': r2(rng.uniform(0, 6.28)), 'solid': True})
    elif o['kind'] == 'rock':
        props.append({'asset': 'outcrop_a', 'world': [o['x'], o['z']], 'rot': int(rng.uniform(0, 360)), 'scale': r2(o['r'] / 2.9), 'solid': True})
        for k in range(5):   # 岩の組（大岩の根元に中・小の岩と小石）
            aa = rng.uniform(0, 6.28); d = o['r'] + rng.uniform(0.4, 1.6)
            x, z = o['x'] + math.cos(aa) * d, o['z'] + math.sin(aa) * d
            if path_dist(x, z) < 0.8: continue
            props.append({'asset': ['outcrop_b', 'boulder_a', 'rock_s', 'rock_s', 'boulder_a'][k], 'world': [r2(x), r2(z)], 'rot': int(rng.uniform(0, 360)), 'scale': r2(rng.uniform(0.8, 1.15))})
# 当たり判定の木のまわりに 1〜2 本（木立にする。触れ合う距離 2.4〜2.8m）
for o in [o for o in SOLID if o['kind'] == 'tree']:
    st = STYLE[region(o['x'], o['z'])]
    for k in range(int(rng.integers(1, 3))):
        for _ in range(12):
            aa = rng.uniform(0, 6.28); d = o['r'] + rng.uniform(1.0, 1.6)
            x, z = o['x'] + math.cos(aa) * d, o['z'] + math.sin(aa) * d
            if free(x, z, 1.2, path_pad=2.0):
                trees.append({'asset': st['trees'][int(rng.integers(len(st['trees'])))], 'world': [r2(x), r2(z)], 'scale': r2(rng.uniform(0.9, 1.05))})
                taken.append((x, z, 1.2)); break
# 地域ごとの木立（飾り）
for reg, st in STYLE.items():
    made = 0
    for _ in range(4000):
        if made >= st['groves']: break
        a = rng.uniform(0, 6.28); f = math.sqrt(rng.uniform(0.08, 0.85)); x, z = math.sin(a) * bound(a) * f, -math.cos(a) * bound(a) * f
        if region(x, z) != reg or not free(x, z, 3.0, path_pad=3.5, edge=5.0): continue
        k = int(rng.integers(st['count'][0], st['count'][1] + 1)); a0 = rng.uniform(0, 6.28)
        for j in range(k):
            rr = 0 if j == 0 else 2.5 * rng.uniform(0.85, 1.15); aj = a0 + j * 2 * math.pi / max(1, k - 1) + rng.uniform(-0.4, 0.4)
            tx, tz = x + math.cos(aj) * rr, z + math.sin(aj) * rr
            if not free(tx, tz, 1.1, path_pad=2.0, edge=3.0): continue
            trees.append({'asset': st['trees'][int(rng.integers(len(st['trees'])))], 'world': [r2(tx), r2(tz)], 'scale': r2(rng.uniform(0.9, 1.08))})
            taken.append((tx, tz, 1.1))
        made += 1

# 道ばたの木（L25b、L25c で密に）: 道を樹冠で縁取る（rulebook 10.1: 草地・林は樹冠 25〜45%、上と片側）。5〜9m おきに、左右を入れ替えながら道の縁の 2.2〜3.5m 外へ 1〜3 本
for P, w in path_lines[:4]:
    seg = np.diff(P, axis=0); segL = np.hypot(*seg.T); total = segL.sum(); s_ = rng.uniform(6, 10); sgn = 1 if rng.random() < 0.5 else -1
    while s_ < total - 6:
        k = int(np.searchsorted(np.cumsum(segL), s_)); k = min(k, len(seg) - 1)
        t = (s_ - (np.cumsum(segL)[k] - segL[k])) / segL[k]; x, z = P[k] + seg[k] * t; d = seg[k] / segL[k]; n_ = np.array([-d[1], d[0]])
        for j in range(int(rng.integers(1, 4))):
            off = w / 2 + rng.uniform(2.2, 3.5) + j * 2.4
            tx, tz = np.array([x, z]) + n_ * sgn * off + d * rng.uniform(-1.2, 1.2)
            if not free(tx, tz, 1.1, path_pad=1.9, edge=3.0): continue
            st = STYLE[region(tx, tz)]
            trees.append({'asset': st['trees'][int(rng.integers(len(st['trees'])))], 'world': [r2(tx), r2(tz)], 'scale': r2(rng.uniform(0.9, 1.05))})
            taken.append((tx, tz, 1.1))
        sgn = -sgn if rng.random() < 0.7 else sgn; s_ += rng.uniform(5, 9)   # L25c: 8〜14m では開けた道のビューの暗い所が 3〜7%（目標 13〜17%）

# ------------------------------------------------------------ 小物（遊びの物 + 演出）
for c in AREA['chests']:
    props.append({'asset': 'chest_s', 'world': [c['x'], c['z']], 'rot': r2(math.degrees(math.atan2(-c['x'], -c['z']))), 'chest': c['id']})
for e in EXITS:   # 出口の門: 道をまたぐ（門の正面 = 道の向き）。出口の印の少し外
    L = math.hypot(e['x'], e['z']); ux, uz = e['x'] / L, e['z'] / L; side = -math.sin(L * 0.12) * 2.5
    gx, gz = ux * (L + 1.5) + uz * side, uz * (L + 1.5) - ux * side
    props.append({'asset': 'waygate', 'world': [r2(gx), r2(gz)], 'rot': r2(math.degrees(math.atan2(ux, uz))), 'exit': e['to'], 'scale': r2(MAIN[e['to']] / 3.0 * 0.15 + 0.85)})
wp = AREA['waypoint']   # ワープポイント（ゲームでは光る石柱。中央の広場）
props.append({'asset': 'waystone', 'world': [r2(wp['x']), r2(wp['z'])], 'rot': 0, 'waypoint': True})
props.append({'asset': 'signpost', 'world': [4.6, -3.2], 'rot': 30})
props += [{'asset': 'stump', 'world': [-4.8, 4.4], 'rot': 0}, {'asset': 'log_fallen', 'world': [5.3, 4.9], 'rot': 62}]   # 広場の腰掛け


def put(asset, reg, n, pad=1.5, rr=0.8, scale=(0.85, 1.15), edge=4.0):
    made = 0
    for _ in range(3000):
        if made >= n: return
        a = rng.uniform(0, 6.28); f = math.sqrt(rng.uniform(0.05, 0.9)); x, z = math.sin(a) * bound(a) * f, -math.cos(a) * bound(a) * f
        if (reg and region(x, z) != reg) or not free(x, z, rr, path_pad=pad, edge=edge): continue
        props.append({'asset': asset, 'world': [r2(x), r2(z)], 'rot': int(rng.uniform(0, 360)), 'scale': r2(rng.uniform(*scale))}); taken.append((x, z, rr)); made += 1


put('log_fallen', 'south', 2, rr=1.8); put('stump', 'south', 2)
put('log_fallen', 'west', 3, rr=1.8); put('boulder_a', 'west', 5); put('rock_s', 'west', 6, rr=0.4); put('stump', 'west', 2)
put('boulder_a', 'north', 3); put('rock_s', 'north', 5, rr=0.4)
put('stump', 'east', 4); put('rock_s', 'east', 3, rr=0.4)
# 東の道（イノシシの丘へ）の両側の柵: 道の中心線から 3.2m 横に、3m の柵を 2〜3 枚ずつ途切れながら
lines = []
e = next(e for e in EXITS if e['to'] == 'f1_hunt'); L = math.hypot(e['x'], e['z']); ux, uz = e['x'] / L, e['z'] / L
for s0, s1, sgn in ((22, 31, 1), (36, 48, 1), (25, 40, -1)):
    pts = []
    for along in np.linspace(s0, s1, 5):
        side = -math.sin(along * 0.12) * 2.5 + sgn * 3.4
        pts.append([r2(ux * along + uz * side), r2(uz * along - ux * side)])
    lines.append({'world': pts, 'asset': 'rail_fence', 'step': 3.0})

# ------------------------------------------------------------ 地図
g = copy.deepcopy(TPL)
g.update(name='f1_field', seed=25)
g['note'] = ('ゲームの第 1 層「ひだまりの草原」（f1_field）を第 3 世代の規則で作り直したもの（tools/worldart/maps/make_f1_field.py が書く。手で直さない）。'
             '輪郭・出口・当たり判定の木と岩・宝箱・出現位置はゲームのまま。木・岩の solid、宝箱の chest、門の exit はゲーム側の対応の印。')
sp = AREA['spawn']
g['camera'] = dict(TPL['camera'], target=[r2(sp['x']), 0, r2(sp['z'] - 6)])
g['game'] = {'area': 'f1_field', 'outline': ring(0.0), 'exits': EXITS, 'spawn': sp, 'waypoint': AREA['waypoint'], 'chests': AREA['chests'], 'obstacles': AREA['obstacles']}
xs = OUT[:, 0]; zs = OUT[:, 1]
g['terrain'] = {
    'size': 196, 'cell': 0.5, 'center': [r2((xs.min() + xs.max()) / 2), 0.0], 'ground': 'grass',
    'hills': {'amp': 0.35, 'scale': 18},
    'cliffs': [{
        # 外周の段: 輪郭の 1.5m 外を縁に、外側を 3m 持ち上げる。上半分に草が垂れる。出口は切って谷にする
        'world': ring(1.5), 'lowPoint': [0, 0], 'raise': True, 'drop': 3.0, 'width': 2.4, 'jag': 1.0, 'relief': 0.4, 'drape': 0.5,
        'gaps': [{'world': [[r2(e['x'] * 0.9), r2(e['z'] * 0.9)], [r2(e['x'] * 2.2), r2(e['z'] * 2.2)]], 'r': MAIN[e['to']] / 2 + 1.6} for e in EXITS],
    }],
}
g['paths'] = paths
g['zones'] = [{
    # 外周の林: 輪郭の 3〜24m 外（中から見て画面の上端より外まで）（画面の外の木の影も暗い所を作る。rulebook 10.2）
    'kind': 'forest', 'world': ring(24.0), 'exclude': ring(3.0), 'noRock': True,
    'trees': ['maple2_s', 'maple2_t', 'fir4_a', 'maple2_a', 'maple2_t'], 'spacing': 3.3, 'scale': [0.9, 1.08],
}]
g['groves'] = []
g['trees'] = trees
g['props'] = props
g['lines'] = lines
g['scatter_within'] = ring(4.5)
cx_ = g['terrain']['center'][0]
g['scatter_box'] = [r2(cx_ - 97), r2(cx_ + 97), -97, 97]   # 散らす範囲は地形の全体（歩ける地図。既定はカメラに映る範囲だけ）
# 固定ビュー（評価用）: 出現位置（街から）、中心の広場、西の林、北の大岩、東の柵、宝箱
V = lambda x, z, yaw=0: dict(TPL['camera'], target=[r2(x), 0, r2(z)], yaw=yaw)
c0, c1 = AREA['chests']
g['views'] = {
    'F01': V(sp['x'], sp['z'] - 4), 'F02': V(1, 1), 'F03': V(-36, -4), 'F04': V(-6, -16),
    'F05': V(34, -10), 'F06': V(c0['x'], c0['z'] - 2), 'F07': V(-3, -33),
    'OV': dict(TPL['camera'], target=[2.5, 0, 0], pitch=88, dist=300, fov=32),   # 全体の見下ろし（配置の確認用。評価には使わない）
}
json.dump(g, open(os.path.join(ROOT, 'public/worldart/maps/f1_field.json'), 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print('trees', len(trees), Counter(t['asset'] for t in trees)); print('props', Counter(p['asset'] for p in props))
