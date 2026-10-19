"""地図の仕様（public/worldart/maps/<name>.json）から、地形と配置を Blender で作る。
  blender -b --factory-startup --python tools/worldart/blender/build_map.py -- <name> [--render]

出力:
  public/worldart/maps/<name>/terrain.glb     地形（頂点色 R=土の道 G=砂/石畳 B=岩肌）と水面
  public/worldart/maps/<name>/placements.json アセットの配置 {asset: [[x,y,z,rotY,scale], ...]}（three.js の座標）
  art/blender/<name>.blend                     地形 + アセットの実体（assets.blend からリンク）+ ゲームと同じカメラと太陽
  art/shots/<name>/blender_view.png             --render のとき、Blender(EEVEE)で同じカメラから描いた絵

座標: 仕様と placements は three.js の座標（x 右, y 上, z 手前）。Blender へは (x, -z, y) で入れる。
位置の書き方: "screen": [u, v] はゲームのカメラから見た画面上の位置（u 左0〜右1、v 上0〜下1）。
              "world": [x, z] は世界の位置。どちらでも書ける。
"""
import bpy, sys, os, json, math, random
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
NAME = argv[0] if argv else 'orc_meadow'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SPEC = json.load(open(os.path.join(ROOT, 'public/worldart/maps', NAME + '.json')))
OUTD = os.path.join(ROOT, 'public/worldart/maps', NAME); os.makedirs(OUTD, exist_ok=True)
ASSETS_BLEND = os.path.join(ROOT, 'art/blender/assets.blend')
RNG = np.random.default_rng(SPEC.get('seed', 1))

# ------------------------------------------------------------ カメラと画面上の位置
cam = SPEC['camera']
T = np.array(cam['target'], float)
yaw, pitch = math.radians(cam['yaw']), math.radians(cam['pitch'])
C = T + cam['dist'] * np.array([math.sin(yaw) * math.cos(pitch), math.sin(pitch), math.cos(yaw) * math.cos(pitch)])
F = (T - C) / np.linalg.norm(T - C)
Rv = np.cross(F, [0, 1, 0]); Rv /= np.linalg.norm(Rv)
Uv = np.cross(Rv, F)
TH = math.tan(math.radians(cam['fov']) / 2); ASP = SPEC.get('aspect', 16 / 9)


def screen_to_world(u, v, h=0.0):
    d = F + Rv * (2 * u - 1) * TH * ASP + Uv * (1 - 2 * v) * TH
    t = (h - C[1]) / d[1]
    return C + d * t


def pt(p):
    """[u,v]（screen）か {"world":[x,z]} を (x, z) に"""
    return screen_to_world(*p)[[0, 2]]


def poly_of(item):
    if 'screen' in item: return np.array([pt(p) for p in item['screen']])
    return np.array(item['world'], float)


# ------------------------------------------------------------ ノイズと距離
def make_noise(seed, n=14):
    r = np.random.default_rng(seed)
    dirs = r.normal(size=(n, 2)); dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    freq = r.uniform(0.6, 1.4, n); ph = r.uniform(0, 6.28, n)
    def f(x, z, scale):
        acc = 0
        for i in range(n):
            acc = acc + np.sin((x * dirs[i, 0] + z * dirs[i, 1]) * freq[i] * 2 * math.pi / scale + ph[i])
        return 0.5 + 0.5 * acc / math.sqrt(n / 2) / 2.2
    return f
N1 = make_noise(SPEC.get('seed', 1)); N2 = make_noise(SPEC.get('seed', 1) + 9)


def seg_dist(px, pz, poly):
    """折れ線までの距離と、どちら側か（符号: 進む向きの左が +）"""
    best = np.full(np.shape(px), 1e9); side = np.ones(np.shape(px))
    for a, b in zip(poly[:-1], poly[1:]):
        ab = b - a; L2 = ab @ ab
        t = np.clip(((px - a[0]) * ab[0] + (pz - a[1]) * ab[1]) / L2, 0, 1)
        dx = px - (a[0] + ab[0] * t); dz = pz - (a[1] + ab[1] * t)
        d = np.sqrt(dx * dx + dz * dz)
        cr = np.sign(ab[0] * dz - ab[1] * dx)
        closer = d < best
        best = np.where(closer, d, best); side = np.where(closer, cr, side)
    return best, side


def inside(px, pz, poly):
    """点が多角形の中か（偶奇則）"""
    res = np.zeros(np.shape(px), bool)
    for a, b in zip(poly, np.roll(poly, -1, 0)):
        cond = ((a[1] > pz) != (b[1] > pz))
        xint = (b[0] - a[0]) * (pz - a[1]) / (b[1] - a[1] + 1e-12) + a[0]
        res ^= cond & (px < xint)
    return res


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


# ------------------------------------------------------------ 地形
TS = SPEC['terrain']; size = TS['size']; cell = TS['cell']
n = int(size / cell) + 1
cx, cz = (TS['center'] if 'center' in TS else (T[0], T[2] - 6))
xs = cx - size / 2 + np.arange(n) * cell; zs = cz - size / 2 + np.arange(n) * cell
X, Z = np.meshgrid(xs, zs)          # [iz, ix]
H = (N1(X, Z, TS['hills']['scale']) - 0.5) * 2 * TS['hills']['amp']
camxz = C[[0, 2]]
CLIFF_LINES = []
for cl in TS.get('cliffs', []):
    # 段差: 折れ線の片側を drop だけ下げる。低い側は "lowPoint": [x, z]（その点のある側）か "low": "far"（カメラの反対側）
    poly = poly_of(cl)
    d, s = seg_dist(X, Z, poly)
    ref = np.array(cl['lowPoint'], float) if 'lowPoint' in cl else None
    if ref is not None:
        _, ref_side = seg_dist(np.array(ref[0]), np.array(ref[1]), poly); low = (s == ref_side)
    else:
        _, cam_side = seg_dist(np.array(camxz[0]), np.array(camxz[1]), poly)
        low = (s != cam_side) if cl.get('low', 'far') == 'far' else (s == cam_side)
    sd = np.where(low, d, -d) + (N2(X, Z, 6) - 0.5) * 2 * cl.get('jag', 1.2)      # 縁をでこぼこに
    H = H - cl['drop'] * smooth(-cl['width'] / 2, cl['width'] / 2, sd)
    CLIFF_LINES.append((poly, cl, ref))

DIRT = np.zeros_like(H); ALT = np.zeros_like(H); GRASSP = []
PATHS = []
for p in SPEC.get('paths', []):
    poly = poly_of(p); PATHS.append((poly, p['width']))
    d, _ = seg_dist(X, Z, poly)
    jag = (N2(X * 3.1, Z * 3.1, 5) - 0.5) * 0.9 + (N1(X * 7, Z * 7, 5) - 0.5) * 0.4   # 筆でなぞったような縁
    w = 1 - smooth(p["width"] / 2 - 0.45, p["width"] / 2 + 0.45, d + jag)
    if p.get('mat', 'dirt') == 'dirt': DIRT = np.maximum(DIRT, w)
    elif p['mat'] == 'grass': GRASSP.append(w)       # 草の帯（石畳・砂を抜く）。あとで適用
    else: ALT = np.maximum(ALT, w)
    H = H - 0.06 * w
if TS.get('ground') in ('sand', 'alt'): ALT = np.maximum(ALT, 1.0 - DIRT)
for w_ in GRASSP:
    ALT = np.minimum(ALT, 1 - w_); DIRT = np.minimum(DIRT, 1 - w_)
for band in TS.get('bands', []):
    # 高さで塗り分ける（例: 浜の砂は高さ below より下）
    edge = H + (N1(X * 2.3, Z * 2.3, 4) - 0.5) * 2 * band.get('noise', 0.4)
    w = 1 - smooth(band['below'] - 0.25, band['below'] + 0.25, edge)
    if band['mat'] == 'dirt': DIRT = np.maximum(DIRT, w)
    else: ALT = np.maximum(ALT, w)

# 法線と傾き → 岩肌
gz, gx = np.gradient(H, cell)
ny = 1 / np.sqrt(1 + gx * gx + gz * gz)
ROCK = smooth(0.82, 0.62, ny)


def height_at(x, z):
    fx = (x - xs[0]) / cell; fz = (z - zs[0]) / cell
    ix = int(np.clip(math.floor(fx), 0, n - 2)); iz = int(np.clip(math.floor(fz), 0, n - 2))
    tx, tz = fx - ix, fz - iz
    h0 = H[iz, ix] * (1 - tx) + H[iz, ix + 1] * tx; h1 = H[iz + 1, ix] * (1 - tx) + H[iz + 1, ix + 1] * tx
    return float(h0 * (1 - tz) + h1 * tz)


def field_at(Fd, x, z):
    ix = int(np.clip(round((x - xs[0]) / cell), 0, n - 1)); iz = int(np.clip(round((z - zs[0]) / cell), 0, n - 1))
    return float(Fd[iz, ix])


def build_terrain():
    verts = [(float(X[i, j]), float(-Z[i, j]), float(H[i, j])) for i in range(n) for j in range(n)]
    faces = []
    for i in range(n - 1):
        for j in range(n - 1):
            a = i * n + j
            faces.append((a, a + n, a + n + 1, a + 1))   # Blender で上向きになる順
    me = bpy.data.meshes.new('terrain'); me.from_pydata(verts, [], faces)
    me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    me.uv_layers.new(name='UVMap')
    ca = me.color_attributes['Col']
    flat = np.stack([DIRT.ravel(), ALT.ravel(), ROCK.ravel(), np.ones(n * n)], 1).astype(np.float32)
    ca.data.foreach_set('color', flat.ravel())
    uvl = me.uv_layers['UVMap']
    uvs = np.zeros((len(me.loops), 2), np.float32)
    vidx = np.zeros(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', vidx)
    co = np.array(verts, np.float32)
    uvs[:, 0] = co[vidx, 0] / 8.0; uvs[:, 1] = co[vidx, 1] / 8.0
    uvl.data.foreach_set('uv', uvs.ravel())
    for p in me.polygons: p.use_smooth = True
    m = bpy.data.materials.new('terrain'); m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']; vc = m.node_tree.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    # Blender の中で見るとき: 草の緑と土の色を頂点色で混ぜる（実行環境ではシェーダーで絵を混ぜる）
    mix = m.node_tree.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    sep = m.node_tree.nodes.new('ShaderNodeSeparateColor')
    m.node_tree.links.new(vc.outputs['Color'], sep.inputs[0]); m.node_tree.links.new(sep.outputs[0], mix.inputs['Factor'])
    mix.inputs[6].default_value = (0.25, 0.38, 0.09, 1); mix.inputs[7].default_value = (0.62, 0.5, 0.3, 1)
    m.node_tree.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 1.0; bsdf.inputs['Specular IOR Level'].default_value = 0
    me.materials.append(m)
    ob = bpy.data.objects.new('terrain', me); bpy.context.scene.collection.objects.link(ob)
    objs = [ob]
    if 'water' in TS:
        wl = TS['water']['level']
        bpy.ops.mesh.primitive_plane_add(size=size * 1.6, location=(cx, -cz, wl))
        w = bpy.context.object; w.name = 'water'
        wm = bpy.data.materials.new('water'); wm.use_nodes = True
        wm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.05, 0.25, 0.45, 1)
        w.data.materials.append(wm); objs.append(w)
    return objs


# ------------------------------------------------------------ 配置
PL = {}
# 樹冠の中心の高さ（scale=1）。アセットの寸法から（assets_report.json の高さの約 0.65）
CANOPY_H = {'tree_broad_a': 3.8, 'tree_broad_b': 4.4, 'pine_a': 3.5, 'pine_b': 4.3, 'bush_a': 0.6}
def place(asset, x, z, rot=None, scale=1.0, y=None):
    hy = height_at(x, z) + (y or 0)
    PL.setdefault(asset, []).append([round(float(x), 3), round(hy, 3), round(float(z), 3),
                                     round(float(rot if rot is not None else RNG.uniform(0, 6.283)), 3), round(float(scale), 3)])


WATER_LV = TS.get('water', {}).get('level', None)
def dry(x, z, margin=0.35):
    """乾いた地面か（水がない地図ではいつも真）"""
    return WATER_LV is None or height_at(x, z) > WATER_LV + margin


def path_dist(x, z):
    best = 1e9
    for poly, w in PATHS:
        d, _ = seg_dist(np.array(x), np.array(z), poly); best = min(best, float(d) - w / 2)
    return best


def jitter_grid(x0, x1, z0, z1, sp):
    gx = np.arange(x0, x1, sp); gz = np.arange(z0, z1, sp)
    P = np.array([(a, b) for a in gx for b in gz], float)
    return P + RNG.uniform(-0.45, 0.45, P.shape) * sp


def visible_box(margin=8):
    corners = np.array([screen_to_world(u, v)[[0, 2]] for u in (-0.15, 1.15) for v in (-0.25, 1.25)])
    return corners[:, 0].min() - margin, corners[:, 0].max() + margin, corners[:, 1].min() - margin, corners[:, 1].max() + margin


def rule_rng(name):
    """規則ごとに独立した乱数（規則を足しても、他の規則の配置が動かない）"""
    global RNG
    RNG = np.random.default_rng([SPEC.get('seed', 1), sum(ord(c) * (i + 1) for i, c in enumerate(name))])


def scatter():
    x0, x1, z0, z1 = visible_box()
    rule_rng('zones')
    trees = []
    for zn in SPEC.get('zones', []):
        poly = poly_of(zn)
        P = jitter_grid(x0, x1, z0, z1, zn.get('spacing', 4.5))
        m = inside(P[:, 0], P[:, 1], poly)
        for x, z in P[m]:
            if path_dist(x, z) < 1.8 or not dry(x, z): continue
            a = zn['trees'][RNG.integers(len(zn['trees']))]
            sc0, sc1 = zn.get('scale', [0.85, 1.25])
            place(a, x, z, scale=RNG.uniform(sc0, sc1)); trees.append((x, z))
    rule_rng('trees')
    for t in SPEC.get('trees', []):
        # "canopy": [u, v] は樹冠の中心が画面のどこに見えるか。樹冠の高さで光線を切って幹の位置を逆算する
        sc_ = t.get('scale', 1.0)
        if 'canopy' in t:
            hc = CANOPY_H.get(t['asset'], 4.0) * sc_
            x, z = screen_to_world(*t['canopy'], h=hc)[[0, 2]]
        else:
            x, z = pt(t['screen']) if 'screen' in t else t['world']
        place(t['asset'], x, z, rot=t.get('rot'), scale=sc_, y=t.get('y')); trees.append((x, z))
    trees = np.array(trees) if trees else np.zeros((0, 2))
    sc = SPEC.get('scatter', {})
    rule_rng('bush')
    if 'bush' in sc and len(trees):
        b = sc['bush']
        for x, z in jitter_grid(x0, x1, z0, z1, 2.2):
            dt = np.min(np.hypot(trees[:, 0] - x, trees[:, 1] - z))
            if b['edge'][0] < dt < b['edge'][1] + 1.5 and path_dist(x, z) > 0.8 and RNG.random() < b['prob'] and dry(x, z) and field_at(ALT, x, z) < 0.5:
                place(b['asset'], x, z, scale=RNG.uniform(0.7, 1.3))
    rule_rng('grass')
    if 'grass' in sc:
        g = sc['grass']
        for x, z in jitter_grid(x0, x1, z0, z1, g['spacing']):
            dirt = field_at(DIRT, x, z); rock = field_at(ROCK, x, z); alt = field_at(ALT, x, z)
            if rock > 0.4 or not dry(x, z, 0.1): continue
            clus = N2(np.array(x), np.array(z), 3.0)
            edge = 1 - abs(dirt - 0.35) / 0.35 if dirt < 0.7 else 0
            p = ((1 - dirt) ** 2 * (0.35 + 0.65 * float(clus)) + g.get('edge_boost', 0) * max(0, edge)) * (1 - alt) ** 3
            if RNG.random() < p: place(g['asset'], x, z, scale=RNG.uniform(*g.get('scale', [0.75, 1.35])))
    rule_rng('flowers')
    if 'flowers' in sc:
        # 小花: 草の上に、群れのノイズの高いところだけ
        fl = sc['flowers']
        for x, z in jitter_grid(x0, x1, z0, z1, fl.get('spacing', 1.2)):
            if field_at(DIRT, x, z) > 0.3 or field_at(ALT, x, z) > 0.3 or not dry(x, z, 0.3): continue
            if float(N1(np.array(x * 1.3), np.array(z * 1.3), 5.0)) > 0.62 and RNG.random() < fl['prob']:
                place(fl['asset'], x, z, scale=RNG.uniform(0.7, 1.2))
    rule_rng('beachgrass')
    if 'beachgrass' in sc:
        # 砂の上の草: 崖の下（崖の線から near m 以内）に群れて生える
        bg = sc['beachgrass']
        for x, z in jitter_grid(x0, x1, z0, z1, 0.6):
            if field_at(ALT, x, z) < 0.5 or not dry(x, z, 0.6): continue
            dc = min(float(seg_dist(np.array(x), np.array(z), poly)[0]) for poly, _, _ in CLIFF_LINES[:1]) if CLIFF_LINES else 99
            clus = float(N2(np.array(x * 1.7), np.array(z * 1.7), 3.0))
            if dc < bg.get('near', 4) and RNG.random() < bg['prob'] * (1 - dc / bg.get('near', 4)) * clus * 2:
                place(bg['asset'], x, z, scale=RNG.uniform(0.7, 1.2))
    rule_rng('pebble')
    if 'pebble' in sc:
        for x, z in jitter_grid(x0, x1, z0, z1, 1.0):
            d = field_at(DIRT, x, z)
            if 0.2 < d < 0.8 and RNG.random() < sc['pebble']['prob'] * 4:
                place(sc['pebble']['asset'], x, z, scale=RNG.uniform(0.5, 1.2))
    rule_rng('lines')
    for ln in SPEC.get('lines', []):
        poly = poly_of(ln); step = ln.get('step', 3.0)
        segL = np.hypot(*np.diff(poly, axis=0).T); total = segL.sum(); s = step / 2
        while s < total:
            k = 0; acc = 0
            while acc + segL[k] < s: acc += segL[k]; k += 1
            t = (s - acc) / segL[k]; a, b = poly[k], poly[k + 1]
            x, z = a + (b - a) * t; dx, dz = b - a
            place(ln['asset'], x, z, rot=math.atan2(dx, dz) + RNG.uniform(-0.08, 0.08), scale=ln.get('scale', 1.0))
            s += step
    rule_rng('cliffrocks')
    for poly, cl, ref in CLIFF_LINES:
        rk = cl.get('rocks')
        if not rk: continue
        # 崖の面に岩の塊を並べる（崖は「地形の急な面」と「張りついた岩」の2層で作る）
        segL = np.hypot(*np.diff(poly, axis=0).T); s_ = 0.0
        while s_ < segL.sum():
            k = 0; acc = 0
            while acc + segL[k] < s_: acc += segL[k]; k += 1
            a, b = poly[k], poly[k + 1]; t = (s_ - acc) / segL[k]
            x, z = a + (b - a) * t
            nrm = np.array([-(b - a)[1], (b - a)[0]]) / segL[k]
            if ref is not None: lowdir = nrm if np.dot(ref - np.array([x, z]), nrm) > 0 else -nrm
            else: lowdir = -nrm if np.dot(camxz - np.array([x, z]), nrm) > 0 else nrm      # far: カメラの反対側
            for j in range(rk.get('rows', 2)):
                off = (j / max(1, rk.get('rows', 2) - 1) - 0.4) * cl['width'] + RNG.uniform(-0.3, 0.3)
                px, pz = np.array([x, z]) + lowdir * off
                if height_at(px, pz) < TS.get('water', {}).get('level', -99) - 0.3: continue
                place(rk['asset'], px, pz, scale=RNG.uniform(*rk.get('scale', [0.8, 1.4])), y=-0.3)
            s_ += rk.get('spacing', 1.6) * RNG.uniform(0.7, 1.2)
    rule_rng('props')
    for p in SPEC.get('props', []):
        x, z = pt(p['screen']) if 'screen' in p else p['world']
        place(p['asset'], x, z, rot=math.radians(p.get('rot', 0)), scale=p.get('scale', 1.0), y=p.get('y'))


def link_assets():
    with bpy.data.libraries.load(ASSETS_BLEND, link=True) as (src, dst):
        dst.objects = list(src.objects)
    return {o.name: o for o in dst.objects if o}


def blend_scene(objs, render):
    lib = link_assets()
    col = bpy.data.collections.new('placements'); bpy.context.scene.collection.children.link(col)
    for asset, items in PL.items():
        src = lib.get(asset)
        if not src: continue
        if asset.startswith('grass'): items = items[::12]   # 草は見本として 1/12 だけ（.blend を軽く保つ）
        for x, y, z, r, s in items:
            o = bpy.data.objects.new(asset, src.data)
            o.location = (x, -z, y); o.rotation_euler = (0, 0, r); o.scale = (s, s, s)
            col.objects.link(o)
    # ゲームと同じカメラ
    bc = bpy.data.cameras.new('game'); bc.sensor_fit = 'VERTICAL'; bc.angle_y = math.radians(cam['fov'])
    co = bpy.data.objects.new('game_camera', bc); bpy.context.scene.collection.objects.link(co)
    co.location = (C[0], -C[2], C[1])
    look = Vector((T[0], -T[2], T[1])) - Vector(co.location)
    co.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = co
    sun = SPEC['sun']; az, el = math.radians(sun['azimuth']), math.radians(sun['elevation'])
    d3 = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))   # 太陽への向き（Blender）
    ld = bpy.data.lights.new('sun', 'SUN'); ld.energy = 4.0; ld.angle = math.radians(2)
    lo = bpy.data.objects.new('sun', ld); bpy.context.scene.collection.objects.link(lo)
    lo.rotation_euler = (-d3).to_track_quat('-Z', 'Y').to_euler()
    w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.6, 0.7, 0.8, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
    s = bpy.context.scene; s.render.resolution_x = 1280; s.render.resolution_y = 720
    s.view_settings.view_transform = 'Standard'
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'art/blender', NAME + '.blend'))
    if render:
        s.render.engine = 'BLENDER_EEVEE_NEXT'
        out = os.path.join(ROOT, 'art/shots', NAME, 'blender_view.png'); os.makedirs(os.path.dirname(out), exist_ok=True)
        s.render.filepath = out; bpy.ops.render.render(write_still=True); print('RENDER', out)


if __name__ == '__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = build_terrain()
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUTD, 'terrain.glb'), export_format='GLB', use_selection=True,
                              export_yup=True, export_normals=True, export_vertex_color='ACTIVE', export_materials='PLACEHOLDER')
    scatter()
    # 高さマップ（水の深さ・泡に使う）。8bit、範囲は meta に
    hmin, hmax = float(H.min()), float(H.max())
    img = bpy.data.images.new('height', n, n, alpha=False, float_buffer=False)
    g = ((H - hmin) / max(hmax - hmin, 1e-6)).astype(np.float32)[::-1]          # 画像の下が z の大きい側
    img.pixels.foreach_set((np.repeat(g.ravel(), 4) * np.tile([1, 1, 1, 0], n * n) + np.tile([0, 0, 0, 1], n * n)).astype(np.float32))
    img.filepath_raw = os.path.join(OUTD, 'height.png'); img.file_format = 'PNG'; img.save()
    meta_terrain = dict(x0=float(xs[0]), z0=float(zs[0]), size=float(xs[-1] - xs[0]), hmin=hmin, hmax=hmax)
    meta = dict(name=NAME, camera=cam, center=[float(cx), float(cz)], size=size, terrain=meta_terrain,
                counts={k: len(v) for k, v in PL.items()}, assets=PL)
    json.dump(meta, open(os.path.join(OUTD, 'placements.json'), 'w'))
    print('PLACED', meta['counts'])
    blend_scene(objs, '--render' in argv)
