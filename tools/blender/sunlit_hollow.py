# 陽だまりの森の家（エリア f1_hollow）: 見本（RO3 の明るい森のフィールド）を基準に、ゼロから作る新作
#   実行: blender -b -P tools/blender/sunlit_hollow.py            （プレビュー画像も: 末尾に -- --render）
#   前回の木漏れ日の小屋（cottage_glade*.py / .blend / .glb）は読み込まず、形・地形・配置もすべてここで新しく作る
#
#   作るもの
#     tools/blender/sunlit_hollow.blend                   編集用（コレクション: 地形 / 岩 / 小屋 / 庭 / 木 / 下草 / 目印 / プレビュー）
#     tools/blender/sunlit_hollow_textures/               Blender の中で描いたテクスチャ（地面・石積み・漆喰・木・瓦・敷石）
#     public/assets/models/blender/sunlit_hollow.glb      エリア全体（地形を含む）
#     public/shared/hollow-layout.js                      当たり判定・地面の高さの表・明かり・煙突・ワープポイント（ゲームとサーバーが読む）
#     docs/hollow/blender-*.png                           プレビュー
#
#   画づくり（見本から）
#     - 明るい黄緑の芝、温かい土の道（縁はやわらかく芝がかぶる）、芝と石畳のはっきりした境目
#     - 灰色の岩壁と苔が作る一段高い台地（奥行き）。台地へは西の坂で上がれる
#     - 木の樹冠は立体: でこぼこの葉の塊を枝先に重ね、表面に立体の葉の小枝を挿す。上は明るい黄緑、内側と下は深い緑（頂点の色）
#     - 低木・シダ・ラベンダー・黄色い小花・草の株を道の縁や木の根元に密に。光は暖かい日差し（樹影はゲームの影・Cycles の影が作る）
#   座標: Blender の X = ゲームの x、Blender の Y = ゲームの -z（北が +Y）。1 単位 = 1 m
import os, sys, math, random, json
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix, Euler, noise

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() and os.path.exists(__file__) else os.getcwd()
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
TEX = os.path.join(ROOT, 'tools', 'blender', 'sunlit_hollow_textures')
AREA = {'id': 'f1_hollow', 'R': 24, 'ell': (1.25, 1.0), 'wob': 0.06}   # shared/areas.js の f1_hollow と同じ値

def srgb(h):
    c = [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
def lerp3(a, b, t): return [a[i] + (b[i] - a[i]) * t for i in range(3)]
def smooth(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)

# ---------------------------------------------------------------------------
# エリアの輪郭（shared/areas.js の boundR と同じ式）
# ---------------------------------------------------------------------------
def _hash(s):
    a = 7
    for ch in s: a = (a * 31 + ord(ch)) & 0xffffffff
    return a
def _lcg(seed):
    st = [seed & 0xffffffff]
    def r():
        st[0] = (st[0] * 1664525 + 1013904223) & 0xffffffff
        return st[0] / 4294967296
    return r
_r = _lcg(_hash(AREA['id']) ^ 0x9e37); SHAPE = (_r() * 6.28, _r() * 6.28, _r() * 6.28)
def bound(a):
    sx, sz = AREA['ell']; dx, dz = math.sin(a), -math.cos(a)
    b = 1 / math.sqrt((dx / (AREA['R'] * sx)) ** 2 + (dz / (AREA['R'] * sz)) ** 2)
    p1, p2, p3 = SHAPE; w = AREA['wob']
    return b * (1 + w * (0.55 * math.sin(3 * a + p1) + 0.3 * math.sin(5 * a + p2) + 0.15 * math.sin(8 * a + p3)))
def rel(x, y): return math.hypot(x, y) / bound(math.atan2(x, y))
EXIT = (0.0, -(bound(math.pi) - 4))   # 湖畔への出口（ゲームの exitsOf と同じ位置）

# ---------------------------------------------------------------------------
# 配置の骨組み（すべて新しく決めたもの）
# ---------------------------------------------------------------------------
CLIFF = [(-40, 1), (-26, 4.0), (-18, 7.6), (-11, 11.4), (-4, 15.0), (5, 17.6), (16, 17.4), (28, 15.5), (42, 13)]  # 台地の縁（北が高い）
RAMP_X = (-20.5, -13.0)          # この区間の縁はなだらかな坂
TERRACE_H = 3.4
HOUSE = {'x': -3.2, 'y': 9.6, 'rz': math.radians(-6), 'w': 7.0, 'd': 5.4}
PATH_MAIN = [(0.4, EXIT[1] - 6), (0.6, EXIT[1]), (2.4, -14.5), (0.6, -9.5), (-1.8, -5.2), (-2.6, -0.8), (-2.6, 3.6)]
PATH_RAMP = [(-2.4, -3.2), (-6.8, -2.0), (-11.2, 0.4), (-14.4, 4.4), (-16.2, 9.0), (-17.6, 13.6), (-19.4, 18.5)]
PATH_EAST = [(0.9, -9.8), (4.8, -8.0), (9.0, -6.8), (12.6, -3.8)]
PATHS = [(PATH_MAIN, 1.25), (PATH_RAMP, 0.95), (PATH_EAST, 0.7)]
YARD = (-7.6, 2.2, 3.2, 6.7)     # 前庭の石畳（x0, x1, y0, y1。小屋の正面の前）
WAYPOINT = (6.2, -1.6)
PICNIC = (13.4, -3.2)

def seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (a + ab * t - p).length, t
def poly_dist(x, y, pts):
    p = Vector((x, y)); best = 1e9
    for i in range(len(pts) - 1):
        d, _ = seg_dist(p, Vector(pts[i]), Vector(pts[i + 1])); best = min(best, d)
    return best
def path_dist(x, y): return min(poly_dist(x, y, p) - w for p, w in PATHS)
def cliff_s(x, y):
    # 台地の縁からの符号つき距離（北 = 台地の上が +）
    p = Vector((x, y)); best, sgn = 1e9, 1
    for i in range(len(CLIFF) - 1):
        a, b = Vector(CLIFF[i]), Vector(CLIFF[i + 1]); d, t = seg_dist(p, a, b)
        if d < best:
            ab = b - a; cr = ab.x * (p.y - a.y) - ab.y * (p.x - a.x)
            best, sgn = d, (1 if cr > 0 else -1)
    return best * sgn
def ramp_k(x): return smooth((x - RAMP_X[0]) / 1.5) * smooth((RAMP_X[1] - x) / 1.5)

def H(x, y):
    # 地面の高さ: ゆるい起伏 + 北西の台地（縁は崖、西の区間だけ坂）+ 輪郭の外は森の丘
    h = noise.noise(Vector((x * 0.06, y * 0.06, 1.7))) * 0.45 + noise.noise(Vector((x * 0.17, y * 0.17, 4.2))) * 0.12
    s = cliff_s(x, y); w = 0.45 + 6.5 * ramp_k(x)
    h += TERRACE_H * smooth((s + w * 0.5) / w)
    # 小屋と前庭・道は平らに近づける
    k = smooth(1 - (max(abs(x - HOUSE['x']) - 5.0, 0) + max(abs(y - (HOUSE['y'] - 2.0)) - 5.4, 0)) / 2.5)
    h = h * (1 - k) + (0.05) * k
    pd = path_dist(x, y)
    if pd < 1.5: h -= 0.06 * smooth(1 - pd / 1.5)
    r = rel(x, y)
    if r > 0.97: h += (r - 0.97) * bound(math.atan2(x, y)) * 0.55
    return h

# ---------------------------------------------------------------------------
# 形を積む入れ物（bmesh。UV と頂点の色つき）
# ---------------------------------------------------------------------------
def M4(loc=(0, 0, 0), rot=(0, 0, 0), sc=(1, 1, 1)):
    return Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*sc, 1))

class MB:
    def __init__(self, seed=1):
        self.bm = bmesh.new(); self.names = []; self.rnd = random.Random(seed)
        self.uv = self.bm.loops.layers.uv.verify(); self.col = self.bm.loops.layers.color.new('Col')
        self.cn = self.bm.verts.layers.float_vector.new('cn'); self.has_cn = False
    def mi(self, n):
        if n not in self.names: self.names.append(n)
        return self.names.index(n)
    def tag(self, verts, m, color=None):
        fs = {f for v in verts for f in v.link_faces}; i = self.mi(m)
        for f in fs:
            f.material_index = i
            if color is not None:
                for l in f.loops: l[self.col] = (*color, 1.0)
        return fs
    def box(self, size, loc, rot=(0, 0, 0), m='木', bevel=0.0, jit=0.0, color=None):
        vs = bmesh.ops.create_cube(self.bm, size=1.0)['verts']
        bmesh.ops.transform(self.bm, matrix=Matrix.Diagonal((*size, 1)), verts=vs)
        if bevel:
            es = list({e for v in vs for e in v.link_edges})
            r = bmesh.ops.bevel(self.bm, geom=vs + es, offset=min(bevel, min(size) * 0.45), offset_type='OFFSET', segments=1, affect='EDGES', clamp_overlap=True, profile=0.5)
            vs = [v for v in set(vs) | {v for f in r['faces'] for v in f.verts} if v.is_valid]
        bmesh.ops.transform(self.bm, matrix=M4(loc, rot), verts=vs)
        if jit:
            for v in vs: v.co += Vector((self.rnd.uniform(-jit, jit) for _ in range(3)))
        return self.tag(vs, m, color)
    def cyl(self, r1, r2, h, loc, rot=(0, 0, 0), m='木', seg=10, color=None, sc=(1, 1, 1)):
        vs = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=max(r2, 1e-3), depth=h)['verts']
        bmesh.ops.transform(self.bm, matrix=M4(loc, rot, sc) @ Matrix.Translation((0, 0, h / 2)), verts=vs)
        return self.tag(vs, m, color)
    def sphere(self, r, loc, sc=(1, 1, 1), m='葉', sub=2, rot=(0, 0, 0)):
        vs = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r)['verts']
        bmesh.ops.transform(self.bm, matrix=M4(loc, rot, sc), verts=vs)
        return vs
    def tube(self, path, radius, rings=8, sides=8, m='樹皮', color=None):
        loops = []
        for i in range(rings + 1):
            t = i / rings; p = path(t); q = path(min(1, t + 0.02)) if t < 1 else p + (p - path(t - 0.02))
            d = (q - p).normalized(); u = d.orthogonal().normalized(); w = d.cross(u); r = radius(t)
            loops.append([self.bm.verts.new(p + (u * math.cos(a) + w * math.sin(a)) * r) for a in (k / sides * 6.2832 for k in range(sides))])
        i_m = self.mi(m); fs = []
        for i in range(rings):
            a, b = loops[i], loops[i + 1]
            for k in range(sides): fs.append(self.bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k])))
        fs.append(self.bm.faces.new(list(reversed(loops[0])))); fs.append(self.bm.faces.new(loops[-1]))
        for f in fs:
            f.material_index = i_m
            if color is not None:
                for l in f.loops: l[self.col] = (*color, 1)
        return fs
    def hull(self, pts, m):
        vs = [self.bm.verts.new(Vector(p)) for p in pts]
        r = bmesh.ops.convex_hull(self.bm, input=vs)
        for g in r['geom_interior'] + r['geom_unused']:
            if isinstance(g, bmesh.types.BMVert) and g.is_valid: self.bm.verts.remove(g)
        return self.tag([v for v in vs if v.is_valid], m)
    def leaf(self, base, d, side, L, W, color, m='葉', nrm=None):
        # 立体の葉1枚: 中央の筋を少し持ち上げ、先を垂らした菱形（裏表とも見える）
        up = d.cross(side).normalized()
        pts = [base, base + d * L * 0.45 + side * W * 0.5 + up * W * 0.15, base + d * L * 0.5 + up * W * 0.3,
               base + d * L * 0.45 - side * W * 0.5 + up * W * 0.15, base + d * L - up * L * 0.18]
        vs = [self.bm.verts.new(p) for p in pts]
        fs = [self.bm.faces.new((vs[0], vs[1], vs[2])), self.bm.faces.new((vs[0], vs[2], vs[3])),
              self.bm.faces.new((vs[1], vs[4], vs[2])), self.bm.faces.new((vs[2], vs[4], vs[3]))]
        i = self.mi(m)
        for k, f in enumerate(fs):
            f.material_index = i
            for l in f.loops:
                t = 0.85 + 0.25 * (l.vert is vs[4] or l.vert is vs[2])
                l[self.col] = (*[c * t for c in color], 1)
        if nrm is not None:
            self.has_cn = True
            for v in vs: v[self.cn] = nrm
        return fs
    def mesh(self, name, smooth_angle=40):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        cn = [v[self.cn].copy() for v in bm.verts]; has_cn = self.has_cn
        # 色の付いていない面（テクスチャの材質）は世界座標の3方向投影で UV を付ける
        for f in bm.faces:
            n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
            tile = TILE.get(self.names[f.material_index], 1.0)
            for l in f.loops:
                co = l.vert.co; uv = (co.y, co.z) if ax == 0 else (co.x, co.z) if ax == 1 else (co.x, co.y)
                l[self.uv].uv = (uv[0] / tile, uv[1] / tile)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        for n in self.names: me.materials.append(MAT[n])
        for p in me.polygons: p.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(smooth_angle))
        if has_cn:
            ln = []
            for p in me.polygons:
                for li in p.loop_indices:
                    v = cn[me.loops[li].vertex_index]
                    ln.append(tuple(v) if v.length > 0 else (0.0, 0.0, 0.0))
            me.normals_split_custom_set(ln)
        return me

COLL = {}
def coll(n):
    if n not in COLL:
        c = bpy.data.collections.new(n); bpy.context.scene.collection.children.link(c); COLL[n] = c
    return COLL[n]
def put(me, name, cname, loc, rz=0.0, s=1.0, col=None, **cp):
    ob = bpy.data.objects.new(name, me); ob.location = loc; ob.rotation_euler = (0, 0, rz); ob.scale = (s, s, s)
    coll(cname).objects.link(ob)
    if col:
        ob['col'] = col
        for k, v in cp.items(): ob['col_' + k] = v
    return ob
def marker(name, loc, kind):
    ob = bpy.data.objects.new(name, None); ob.location = loc; ob['mark'] = kind; ob.empty_display_size = 0.3
    coll('目印').objects.link(ob); return ob
def ground(x, y): return H(x, y)

# ---------------------------------------------------------------------------
# テクスチャ（numpy で描く。繰り返しても継ぎ目が出ない）
# ---------------------------------------------------------------------------
def vnoise(n, octaves, seed, f0=4, m=None):
    rng = np.random.default_rng(seed); m = m or n; out = np.zeros((n, m), np.float32); amp = tot = 0.0; amp = 1.0
    for o in range(octaves):
        g = f0 * 2 ** o; grid = rng.random((g, g)).astype(np.float32)
        def ax(k):
            x = np.arange(k, dtype=np.float32) * g / k; i0 = np.floor(x).astype(int); f = x - i0; return i0 % g, (i0 + 1) % g, f * f * (3 - 2 * f)
        r0, r1, fy = ax(n); c0, c1, fx = ax(m)
        a, b, c, d = grid[np.ix_(r0, c0)], grid[np.ix_(r0, c1)], grid[np.ix_(r1, c0)], grid[np.ix_(r1, c1)]
        fx, fy = fx[None], fy[:, None]
        out += ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy) * amp; tot += amp; amp *= 0.55
    return out / tot
def hexa(h): return np.array([(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255], np.float32)
def grad(v, stops):
    ps = [p for p, _ in stops]; cs = np.array([hexa(c) for _, c in stops])
    return np.stack([np.interp(v, ps, cs[:, k]) for k in range(3)], -1).astype(np.float32)
def cells(n, count, seed):
    # 繰り返すボロノイ: 一番近い点までの距離・2番目との差・点の番号
    rng = np.random.default_rng(seed); pts = rng.random((count, 2)) * n
    tiles = np.concatenate([pts + np.array([dx, dy]) * n for dx in (-1, 0, 1) for dy in (-1, 0, 1)])
    ids = np.tile(np.arange(count), 9)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    d1 = np.full((n, n), 1e9, np.float32); d2 = d1.copy(); idx = np.zeros((n, n), int)
    for k, (px, py) in enumerate(tiles):
        d = np.hypot(xx - px, yy - py)
        closer = d < d1
        d2 = np.where(closer, d1, np.minimum(d2, d)); idx = np.where(closer, ids[k], idx); d1 = np.where(closer, d, d1)
    return d1, d2 - d1, idx
def save(name, rgb, fmt='JPEG'):
    os.makedirs(TEX, exist_ok=True)
    h, w = rgb.shape[:2]; path = os.path.join(TEX, name + ('.jpg' if fmt == 'JPEG' else '.png'))
    im = bpy.data.images.new(name + '_tmp', w, h)
    im.pixels.foreach_set(np.concatenate([np.clip(rgb, 0, 1), np.ones((h, w, 1), np.float32)], 2).astype(np.float32).ravel())
    im.filepath_raw = path; im.file_format = fmt; im.save(); bpy.data.images.remove(im)
    im = bpy.data.images.load(path); im.name = name; return im

def tex_stonewall():
    # 石積み: 丸みのある不ぞろいの石、明るい目地、ところどころの苔
    n = 512; d1, edge, idx = cells(n, 46, 11)
    rng = np.random.default_rng(12); tone = rng.uniform(0.82, 1.12, 46)[idx]
    base = grad(vnoise(n, 5, 13, 6), [(0, 0x8e8a80), (0.5, 0xb4ae9e), (1, 0xd2cab6)]) * tone[..., None]
    bevel = np.clip(edge / 7.0, 0, 1)
    img = base * (0.62 + 0.38 * bevel[..., None])
    mortar = (edge < 2.2)[..., None]
    img = np.where(mortar, hexa(0x6e6a5e) * 0.9, img)
    moss = np.clip((vnoise(n, 4, 14, 3) - 0.6) * 4, 0, 1)[..., None] * (1 - bevel[..., None] * 0.6)
    return save('hollow_stonewall', img * (1 - moss * 0.7) + hexa(0x6e9a34) * moss * 0.7)
def tex_paving():
    # 敷石: 四角い石を互い違いに並べ、目地に苔と芝
    n = 512; img = np.zeros((n, n, 3), np.float32); rng = np.random.default_rng(21)
    yy, xx = np.mgrid[0:n, 0:n]
    rows = 6; rh = n // rows
    noise_ = vnoise(n, 5, 22, 8)
    for r in range(rows):
        off = (r % 2) * rh // 2; cols = 4
        for c in range(cols + 1):
            x0 = c * n // cols + off - rh // 2; x1 = x0 + n // cols
            sel = (yy >= r * rh) & (yy < (r + 1) * rh) & (((xx - x0) % n) < (x1 - x0))
            img[sel] = hexa(0xb8b4aa) * rng.uniform(0.85, 1.08)
    gx = np.minimum((yy % rh), rh - (yy % rh))
    gap = (gx < 3)
    for r in range(rows):
        off = (r % 2) * rh // 2
        for c in range(5):
            x0 = (c * n // 4 + off - rh // 2) % n
            band = (yy >= r * rh) & (yy < (r + 1) * rh) & (np.minimum((xx - x0) % n, (x0 - xx) % n) < 3)
            gap |= band
    img = img * (0.8 + 0.3 * noise_[..., None])
    img[gap] = hexa(0x5e8a30) * (0.8 + 0.4 * noise_[gap][:, None])
    return save('hollow_paving', img)
def tex_plaster(): return save('hollow_plaster', grad(vnoise(512, 6, 31, 3), [(0, 0xe6dcc2), (0.6, 0xf4ecd6), (1, 0xfffaea)]))
def tex_wood(name, lo, hi, seed):
    n = 512; v = vnoise(n, 4, seed, 2) * 0.4 + np.repeat(vnoise(n, 5, seed + 1, 24)[:, :1], n, 1) * 0.6
    img = grad(v, [(0, lo), (1, hi)])
    k = (np.sin(np.arange(n)[:, None] / n * 6.28 * 9 + vnoise(n, 3, seed + 2, 4) * 6) > 0.92)[..., None]
    return save(name, np.where(k, img * 0.78, img))
def tex_slate():
    # 丸瓦: 青みのある灰色。下の縁ほど暗い
    n = 512; v = vnoise(n, 5, 41, 6)
    img = grad(v, [(0, 0x4a5e78), (0.5, 0x627a96), (1, 0x86a0b8)])
    y = (np.arange(n) % (n // 4)) / (n / 4)
    return save('hollow_slate', img * (0.7 + 0.3 * y)[:, None, None])

def paint_ground(n=2048, half=40.0):
    # 地形の色: 明るい芝（濃淡と葉先）+ 道の土（縁はでこぼこ）+ 台地の上は少し濃い + 岩のまわりの土
    s = half * 2 / n; xs = (np.arange(n, dtype=np.float32) + 0.5) * s - half
    X, Y = np.meshgrid(xs, xs)
    v = vnoise(n, 7, 101, 6) * 0.6 + vnoise(n, 4, 102, 64) * 0.4
    img = grad(v, [(0, 0x3e7e1c), (0.35, 0x5e9e24), (0.7, 0x86ba30), (1, 0xb2d446)])
    rng = np.random.default_rng(103)
    for col, cnt, ln in ((0xc0e060, 260000, 6), (0x2e6a18, 220000, 5)):
        x0 = rng.random(cnt) * n; y0 = rng.random(cnt) * n; a = rng.random(cnt) * 6.28
        for t in range(ln):
            xi = ((x0 + np.cos(a) * t) % n).astype(int); yi = ((y0 + np.sin(a) * t) % n).astype(int)
            img[yi, xi] = img[yi, xi] * 0.6 + hexa(col) * 0.4
    # 道（3本）
    def pd(pts):
        d = np.full((n, n), 1e9, np.float32)
        for (ax_, ay), (bx, by) in zip(pts[:-1], pts[1:]):
            dx, dy = bx - ax_, by - ay
            t = np.clip(((X - ax_) * dx + (Y - ay) * dy) / (dx * dx + dy * dy), 0, 1)
            d = np.minimum(d, np.hypot(ax_ + dx * t - X, ay + dy * t - Y))
        return d
    dirt = grad(vnoise(n, 6, 104, 20), [(0, 0x8e6a3a), (0.5, 0xb48a52), (1, 0xd0aa70)])
    pebbles = rng.random((n, n)) < 0.012
    dirt[pebbles] = hexa(0x8a7458)
    edge = vnoise(n, 5, 105, 28) - 0.5
    for pts, w in PATHS:
        d = pd(pts) + edge * 0.9
        k = np.clip((w - d) / 0.45, 0, 1)
        k = k * np.clip(1 - (vnoise(n, 3, 106, 90) - 0.5) * 1.4 * (k < 0.95), 0, 1)
        img = img * (1 - k[..., None]) + dirt * k[..., None]
    # 台地の上と崖ぎわ: 少し濃く、土がのぞく
    S = np.vectorize(cliff_s)(X[::8, ::8], Y[::8, ::8]).astype(np.float32)
    S = np.kron(S, np.ones((8, 8), np.float32))[:n, :n]
    k = np.clip(1 - np.abs(S) / 2.2, 0, 1) * 0.55
    img = img * (1 - k[..., None]) + grad(vnoise(n, 5, 107, 24), [(0, 0x6a5a3a), (1, 0x8a8a4a)]) * k[..., None]
    img *= (1 - 0.12 * np.clip(S / 6, 0, 1))[..., None]
    # 輪郭の外は暗い森の床
    ang = np.arctan2(X, Y)
    sx, sz = AREA['ell']; R = AREA['R']; dx_, dz_ = np.sin(ang), -np.cos(ang)
    b = 1 / np.sqrt((dx_ / (R * sx)) ** 2 + (dz_ / (R * sz)) ** 2)
    p1, p2, p3 = SHAPE
    b = b * (1 + AREA['wob'] * (0.55 * np.sin(3 * ang + p1) + 0.3 * np.sin(5 * ang + p2) + 0.15 * np.sin(8 * ang + p3)))
    k = np.clip((np.hypot(X, Y) / b - 0.95) * 3, 0, 1)[..., None] * 0.6
    img = img * (1 - k) + grad(vnoise(n, 6, 108, 14), [(0, 0x3e5222), (1, 0x6a6a34)]) * k
    return save('hollow_ground', img)

MAT, TILE = {}, {}
def mat(name, im=None, color=None, vc=False, tile=1.0, rough=0.85, emit=None, double=False):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bs.outputs['BSDF'], out.inputs['Surface'])
    bs.inputs['Roughness'].default_value = rough
    if im is not None:
        tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = im; nt.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
    elif vc:
        ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'; nt.links.new(ca.outputs['Color'], bs.inputs['Base Color'])
    if color is not None: bs.inputs['Base Color'].default_value = (*srgb(color), 1)
    if emit is not None:
        bs.inputs['Emission Color'].default_value = (*srgb(emit), 1); bs.inputs['Emission Strength'].default_value = 7.0
        bs.inputs['Base Color'].default_value = (*srgb(emit), 1)
    m.use_backface_culling = not double
    MAT[name] = m; TILE[name] = tile
    return m

def build_materials():
    mat('石積み', tex_stonewall(), tile=1.6); mat('敷石', tex_paving(), tile=1.8); mat('漆喰', tex_plaster(), tile=2.5)
    mat('木', tex_wood('hollow_wood', 0x7a5232, 0xb88a56, 51), tile=1.4); mat('木_濃', tex_wood('hollow_timber', 0x40281a, 0x6e4a2e, 52), tile=1.4)
    mat('瓦', tex_slate(), tile=0.9)
    mat('地面', paint_ground(), rough=1.0)
    for n in ('葉', '針葉', '草', '花', '岩', '樹皮', '苔'): mat(n, vc=True, rough=0.9, double=n in ('葉', '針葉', '草', '花'))
    mat('窓', emit=0xffc46a); mat('灯', emit=0xffd890); mat('鉄', color=0x3a3c44, rough=0.45); mat('素焼き', color=0xb86a44)
    mat('かご', color=0xb08a52); mat('水', color=0x4a8ab8, rough=0.15)

# ---------------------------------------------------------------------------
# 色（頂点の色）
# ---------------------------------------------------------------------------
LEAF_DARK, LEAF_MID, LEAF_LIGHT, LEAF_SUN = srgb(0x1c4614), srgb(0x3e8424), srgb(0x7cba2c), srgb(0xc2e04a)
def leaf_color(shade, rnd):
    # shade: 0 = 茂みの奥・下、1 = 外の上（日なた）
    c = lerp3(LEAF_DARK, LEAF_MID, smooth(shade * 1.6)) if shade < 0.6 else lerp3(LEAF_MID, LEAF_LIGHT, smooth((shade - 0.6) / 0.3))
    if shade > 0.88: c = lerp3(c, LEAF_SUN, (shade - 0.88) / 0.12)
    j = rnd.uniform(0.9, 1.1); return [min(1, x * j) for x in c]

# ---------------------------------------------------------------------------
# 木（立体の樹冠）
# ---------------------------------------------------------------------------
def foliage_mass(mb, c, R, center, rnd, sprigs=16, sub=2, top_bias=0.0):
    # 葉の塊: でこぼこの球（頂点の色で奥は暗く上は明るい）+ 表面に立体の葉の小枝
    c = Vector(c); center = Vector(center)
    vs = mb.sphere(R, c, sc=(1, 1, 0.82), m='葉', sub=sub)
    off = Vector((rnd.random() * 50, rnd.random() * 50, rnd.random() * 50))
    for v in vs:
        d = (v.co - c); n = d.normalized()
        bump = noise.fractal(n * 2.4 + off, 0.6, 2.0, 3) * 0.45 + noise.noise(n * 6.0 + off) * 0.12
        v.co = c + d * (1 + bump)
    fs = mb.tag(vs, '葉')
    for f in fs:
        for l in f.loops:
            p = l.vert.co; out = (p - center); up = (p.z - center.z) / max(R * 2.5, 1)
            shade = 0.25 + 0.45 * max(0, (p - c).normalized().z) + 0.25 * min(1, out.length / (R * 2.2)) + 0.15 * up
            l[mb.col] = (*leaf_color(max(0, min(1, shade)), rnd), 1)
    for k in range(sprigs):
        n = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), abs(rnd.gauss(0, 1)) * 0.9 + top_bias)).normalized()
        p = c + Vector((n.x, n.y, n.z * 0.82)) * R * rnd.uniform(0.9, 1.08)
        out = (p - center).normalized()
        nrm = (out * 0.55 + Vector((0, 0, 0.6))).normalized()
        side0 = n.cross(Vector((0, 0, 1)))
        side0 = side0.normalized() if side0.length > 0.1 else Vector((1, 0, 0))
        for j in range(5):
            a = (j - 2) * 0.55 + rnd.uniform(-0.15, 0.15)
            d = (Matrix.Rotation(a, 3, n) @ (n.cross(side0) * 0.6 + n * 0.8)).normalized()
            d = (d + Vector((0, 0, -0.1))).normalized()
            side = d.cross(n).normalized()
            L = R * rnd.uniform(0.4, 0.55)
            shade = 0.62 + 0.38 * max(0, n.z)
            mb.leaf(p - n * R * 0.08, d, side, L, L * 0.62, leaf_color(shade, rnd), nrm=nrm)

def broadleaf(seed, H_, lobes=9, sprigs=16, name='広葉樹', sub=2):
    rnd = random.Random(seed); mb = MB(seed)
    lean = Vector((rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), 0))
    trunk = lambda t: Vector((math.sin(t * 2.4 + seed) * 0.22, math.cos(t * 1.9 + seed) * 0.16, 0)) + lean * t * t + Vector((0, 0, t * H_ * 0.62))
    bark = lambda: srgb(0x6a5238) if rnd.random() < 0.5 else srgb(0x7e6446)
    mb.tube(trunk, lambda t: 0.36 * (1 - 0.5 * t) + 0.32 * max(0, 0.18 - t) / 0.18, 10, 10, '樹皮', color=bark())
    for k in range(6):  # 根張り
        a = k / 6 * 6.28 + rnd.random() * 0.5; L = rnd.uniform(0.9, 1.5)
        mb.tube(lambda t, a=a, L=L: Vector((math.cos(a) * t * L, math.sin(a) * t * L, 0.42 * (1 - t) ** 2 - 0.08)), lambda t: 0.16 * (1 - t) + 0.03, 5, 6, '樹皮', color=srgb(0x5a4430))
    top = trunk(1); crown_c = top + Vector((0, 0, H_ * 0.12))
    tips = []
    for k in range(lobes - 1):
        a = k / (lobes - 1) * 6.2832 + rnd.uniform(-0.3, 0.3); t0 = rnd.uniform(0.55, 0.95); b = trunk(t0)
        L = rnd.uniform(1.6, 2.6) * H_ / 6.5; rise = rnd.uniform(0.35, 0.95)
        e = b + Vector((math.cos(a) * L, math.sin(a) * L, L * rise))
        mid = b.lerp(e, 0.5) + Vector((0, 0, 0.25))
        mb.tube(lambda t, b=b, e=e, mid=mid: (b * (1 - t) ** 2 + mid * 2 * t * (1 - t) + e * t * t), lambda t: 0.16 * (1 - t * 0.7) * H_ / 6.5, 5, 6, '樹皮', color=bark())
        tips.append(e)
    tips.append(top + Vector((0, 0, H_ * 0.18)))
    for k, tp in enumerate(tips):
        R = rnd.uniform(1.05, 1.45) * H_ / 6.5 * (1.15 if k == len(tips) - 1 else 1)
        foliage_mass(mb, tp + Vector((0, 0, R * 0.25)), R, crown_c - Vector((0, 0, H_ * 0.15)), rnd, sprigs=sprigs, sub=sub)
    # 樹冠の内側を埋める大きな塊（隙間から空が抜けないように、奥は暗い）
    foliage_mass(mb, crown_c, H_ * 0.28, crown_c - Vector((0, 0, H_ * 0.3)), rnd, sprigs=0, sub=2)
    return mb.mesh(f'{name}_{seed}')

def fir(seed, H_, name='針葉樹'):
    # 針葉樹: 垂れた枝の段（ふちが波打つ笠）を重ね、ふちに針葉の小枝
    rnd = random.Random(seed); mb = MB(seed)
    mb.tube(lambda t: Vector((0, 0, t * H_ * 0.9 - 0.1)), lambda t: 0.3 * (1 - t) + 0.05, 6, 9, '樹皮', color=srgb(0x5e4630))
    tiers = 8
    for i in range(tiers):
        t = i / tiers; z = H_ * (0.16 + t * 0.78); R = (1 - t) ** 1.05 * H_ * 0.3 + 0.4
        seg = 14; rings = 3; verts = []
        center = bmesh.ops.create_vert(mb.bm, co=Vector((0, 0, z + R * 0.35)))['vert'][0]
        for r_i in range(1, rings + 1):
            ring = []
            for k in range(seg):
                a = k / seg * 6.2832 + i * 0.4
                wob = 1 + 0.18 * math.sin(a * 5 + i) + rnd.uniform(-0.06, 0.06)
                rr = R * r_i / rings * wob; droop = -(r_i / rings) ** 1.6 * R * 0.55
                ring.append(mb.bm.verts.new(Vector((math.cos(a) * rr, math.sin(a) * rr, z + R * 0.35 * (1 - r_i / rings) + droop))))
            verts.append(ring)
        fs = []
        for k in range(seg): fs.append(mb.bm.faces.new((center, verts[0][k], verts[0][(k + 1) % seg])))
        for r_i in range(rings - 1):
            for k in range(seg): fs.append(mb.bm.faces.new((verts[r_i][k], verts[r_i + 1][k], verts[r_i + 1][(k + 1) % seg], verts[r_i][(k + 1) % seg])))
        # 下の面（厚み）
        under = [mb.bm.verts.new(v.co - Vector((0, 0, 0.22))) for v in verts[-1]]
        for k in range(seg): fs.append(mb.bm.faces.new((verts[-1][(k + 1) % seg], verts[-1][k], under[k], under[(k + 1) % seg])))
        uc = mb.bm.verts.new(Vector((0, 0, z - R * 0.2)))
        for k in range(seg): fs.append(mb.bm.faces.new((under[(k + 1) % seg], under[k], uc)))
        im = mb.mi('針葉')
        for f in fs:
            f.material_index = im
            for l in f.loops:
                p = l.vert.co; up = 1 if f.normal.z > 0 else 0
                sh = 0.2 + 0.5 * up * min(1, math.hypot(p.x, p.y) / R) + 0.25 * t
                l[mb.col] = (*lerp3(srgb(0x24522c), srgb(0x7cb252), min(1, sh * 1.15)), 1)
        for k in range(seg):  # ふちの小枝
            a = (k + 0.5) / seg * 6.2832 + i * 0.4
            base = Vector((math.cos(a) * R * 0.92, math.sin(a) * R * 0.92, z - R * 0.2))
            d = Vector((math.cos(a), math.sin(a), -0.5)).normalized(); side = Vector((-math.sin(a), math.cos(a), 0))
            for j in range(3):
                dd = (Matrix.Rotation((j - 1) * 0.35, 3, 'Z') @ d)
                mb.leaf(base, dd, side, R * 0.35, R * 0.12, lerp3(srgb(0x4a8a40), srgb(0x9cc860), rnd.random() * 0.6 + 0.3 * t), m='針葉',
                        nrm=(Vector((math.cos(a), math.sin(a), 0)) * 0.5 + Vector((0, 0, 0.8))).normalized())
    return mb.mesh(f'{name}_{seed}')

def shrub(seed, R=0.75, flowers=None):
    rnd = random.Random(seed); mb = MB(seed); c = Vector((0, 0, R * 0.55))
    for k in range(4):
        a = k / 4 * 6.28 + rnd.random()
        foliage_mass(mb, c + Vector((math.cos(a) * R * 0.45, math.sin(a) * R * 0.45, rnd.uniform(-0.1, 0.25) * R)), R * rnd.uniform(0.55, 0.75), c - Vector((0, 0, R)), rnd, sprigs=9, sub=1)
    if flowers:
        for k in range(10):
            n = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), abs(rnd.gauss(0, 1)) + 0.4)).normalized()
            p = c + Vector((n.x * R * 1.05, n.y * R * 1.05, n.z * R * 0.85))
            vs = mb.sphere(0.07, p, sc=(1, 1, 0.6), m='花', sub=1); mb.tag(vs, '花', srgb(flowers))
    return mb.mesh('低木')

def fern(seed):
    rnd = random.Random(seed); mb = MB(seed)
    for k in range(8):
        a = k / 8 * 6.2832 + rnd.uniform(-0.2, 0.2); L = rnd.uniform(0.7, 1.05); lift = rnd.uniform(0.6, 0.95)
        pt = lambda t, a=a, L=L, lift=lift: Vector((math.cos(a) * L * t, math.sin(a) * L * t, math.sin(t * math.pi * 0.85) * L * lift * 0.6 + 0.03))
        for i in range(1, 7):
            t = i / 7; p = pt(t); d = (pt(t + 0.05) - p).normalized(); side = Vector((-math.sin(a), math.cos(a), 0))
            w = (1 - t) * 0.22 + 0.04
            col = lerp3(srgb(0x3e7a24), srgb(0x9ccc3c), t * 0.8 + rnd.uniform(0, 0.2))
            for s in (-1, 1):
                dd = (side * s + d * 0.5 - Vector((0, 0, 0.25))).normalized()
                mb.leaf(p, dd, dd.cross(Vector((0, 0, 1))).normalized() if abs(dd.z) < 0.95 else side, w, w * 0.45, col, m='草', nrm=Vector((0, 0, 1)))
    return mb.mesh('シダ')

def grass_clump(seed, h=0.5, n=8):
    rnd = random.Random(seed); mb = MB(seed)
    for k in range(n):
        a = rnd.random() * 6.28; lean = rnd.uniform(0.1, 0.5); hh = h * rnd.uniform(0.6, 1.15)
        base = Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, -0.03)); d = Vector((math.cos(a) * lean, math.sin(a) * lean, 1)).normalized()
        side = Vector((-math.sin(a), math.cos(a), 0)); prev_l = prev_r = None
        for i in range(4):
            t = i / 3; p = base + d * hh * t + Vector((math.cos(a), math.sin(a), 0)) * (t * t) * hh * 0.35
            w = 0.035 * (1 - t) + 0.004
            l = mb.bm.verts.new(p - side * w); r = mb.bm.verts.new(p + side * w)
            for v in (l, r): v[mb.cn] = Vector((0, 0, 1))
            if prev_l:
                f = mb.bm.faces.new((prev_l, prev_r, r, l)); f.material_index = mb.mi('草')
                for lp in f.loops:
                    tt = (lp.vert.co.z + 0.03) / hh
                    lp[mb.col] = (*lerp3(srgb(0x3a7020), srgb(0xb4dc50), min(1, tt * 1.1)), 1)
            prev_l, prev_r = l, r
    mb.has_cn = True
    return mb.mesh('草')

def flower_patch(seed, kind):
    # 花の株: 茎と花（ラベンダーは穂、ほかは平たい花と芯）と根元の葉
    rnd = random.Random(seed); mb = MB(seed)
    cols = {'lav': [0x9a7ae0, 0xb89af0, 0x7e5ec8], 'yel': [0xffe048, 0xffc830], 'white': [0xfff8ee, 0xf0eadc], 'pink': [0xff8aaa, 0xf06a8e]}[kind]
    for k in range(7 if kind == 'lav' else 6):
        a = rnd.random() * 6.28; r = rnd.uniform(0, 0.28); x, y = math.cos(a) * r, math.sin(a) * r
        hh = rnd.uniform(0.32, 0.55) if kind == 'lav' else rnd.uniform(0.16, 0.3)
        mb.cyl(0.012, 0.01, hh, (x, y, -0.02), m='草', seg=3, color=srgb(0x4a8a2a))
        if kind == 'lav':
            for j in range(4):
                vs = mb.sphere(0.04 - j * 0.004, (x, y, hh - 0.03 - j * 0.07), sc=(1, 1, 1.6), m='花', sub=0); mb.tag(vs, '花', srgb(cols[j % 3]))
        else:
            vs = mb.sphere(0.07, (x, y, hh), sc=(1, 1, 0.35), m='花', sub=0, rot=(0, 0, rnd.random())); mb.tag(vs, '花', srgb(cols[k % len(cols)]))
            vs = mb.sphere(0.022, (x, y, hh + 0.02), m='花', sub=0); mb.tag(vs, '花', srgb(0xe8a020 if kind != 'yel' else 0xd07a10))
    for k in range(4):  # 根元の葉
        a = rnd.random() * 6.28
        mb.leaf(Vector((0, 0, 0.0)), Vector((math.cos(a), math.sin(a), 0.4)).normalized(), Vector((-math.sin(a), math.cos(a), 0)), 0.22, 0.09, srgb(0x5a9a30), m='草', nrm=Vector((0, 0, 1)))
    return mb.mesh('花_' + kind)

# ---------------------------------------------------------------------------
# 岩・岩壁（Blender のモディファイア: 細分化・ディスプレイス・ポリゴン削減）
# ---------------------------------------------------------------------------
def tex_noise(name, kind, size, **kw):
    t = bpy.data.textures.get(name) or bpy.data.textures.new(name, kind)
    t.noise_scale = size
    for k, v in kw.items(): setattr(t, k, v)
    return t

def apply_mods(ob):
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    ob.select_set(False)

def rock_colors(me, seed, moss=0.75):
    # 岩の頂点の色: 灰色の濃淡、上を向いた面に苔、下は暗く（小数の色の属性へ直接書く）
    me.update()
    for a in list(me.color_attributes): me.color_attributes.remove(a)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    off = Vector((seed * 3.1, seed * 1.7, 0.4)); vals = []
    for l in me.loops:
        v = me.vertices[l.vertex_index]; p = v.co; n = v.normal
        g = 0.5 + noise.fractal(p * 0.7 + off, 0.6, 2.0, 3) * 0.3
        c = lerp3(srgb(0x8a877e), srgb(0xc4beae), max(0, min(1, g)))
        c = [x * (0.75 + 0.25 * max(0, min(1, n.z + 0.5))) for x in c]
        mk = smooth((n.z - 0.4) / 0.3) * moss * (0.65 + 0.35 * noise.noise(p * 0.9 + off))
        c = lerp3(c, lerp3(srgb(0x5a8c2a), srgb(0x9cc444), max(0, min(1, g))), max(0, min(1, mk)))
        vals += [*c, 1.0]
    ca.data.foreach_set('color', vals)
    me.color_attributes.active_color_name = 'Col'; me.color_attributes.render_color_index = me.color_attributes.active_color_index

def boulder(seed, size=1.0, flat=0.7):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=4, radius=size)
    me = bpy.data.meshes.new(f'岩_{seed}'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('tmp', me); bpy.context.scene.collection.objects.link(ob)
    ob.scale = (1.2, 1.0, flat)
    d1 = ob.modifiers.new('割れ', 'DISPLACE'); d1.texture = tex_noise(f'岩V{seed}', 'VORONOI', 0.55 * size, distance_metric='DISTANCE'); d1.strength = 0.35 * size
    d2 = ob.modifiers.new('凹凸', 'DISPLACE'); d2.texture = tex_noise(f'岩C{seed}', 'CLOUDS', 0.25 * size, noise_depth=3); d2.strength = 0.18 * size
    dec = ob.modifiers.new('削減', 'DECIMATE'); dec.ratio = 0.35
    apply_mods(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True); bpy.ops.object.transform_apply(scale=True); ob.select_set(False)
    for v in me.vertices:
        if v.co.z < -size * 0.15: v.co.z = -size * 0.15
    me.materials.append(MAT['岩'])
    for p in me.polygons: p.use_smooth = True
    me.update(); rock_colors(me, seed)
    bpy.data.objects.remove(ob)
    return me

def cliff_wall(seed, a, b, h0, h1):
    # 台地の縁の岩壁: 縁に沿った帯を細分化し、外へ押し出して割れ目と段を付ける
    a, b = Vector(a), Vector(b); L = (b - a).length; d = (b - a).normalized(); n = Vector((-d.y, d.x, 0))  # n は台地の上（北）向き
    bm = bmesh.new(); nu, nv = max(6, int(L * 2.2)), 9
    grid = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            t = i / nu; v = j / nv
            p = a.lerp(b, t).to_3d()
            z0 = H(p.x - n.x * 0.8, p.y - n.y * 0.8) - 0.5; z1 = H(p.x + n.x * 1.2, p.y + n.y * 1.2) + 0.35
            lean = (1 - v) * 0.25 - v * 0.05
            row.append(bm.verts.new(p - n * lean + Vector((0, 0, z0 + (z1 - z0) * v))))
        grid.append(row)
    for j in range(nv):
        for i in range(nu): bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    back = [bm.verts.new(v.co + n * 1.6) for v in grid[-1]]
    for i in range(nu): bm.faces.new((grid[-1][i], grid[-1][i + 1], back[i + 1], back[i]))
    me = bpy.data.meshes.new(f'岩壁_{seed}'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('tmp', me); bpy.context.scene.collection.objects.link(ob)
    sub = ob.modifiers.new('細分', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2; sub.subdivision_type = 'SIMPLE'
    d1 = ob.modifiers.new('割れ', 'DISPLACE'); d1.texture = tex_noise(f'壁V{seed}', 'VORONOI', 0.9, distance_metric='DISTANCE_SQUARED'); d1.strength = 0.7; d1.direction = 'NORMAL'
    d2 = ob.modifiers.new('凹凸', 'DISPLACE'); d2.texture = tex_noise(f'壁C{seed}', 'CLOUDS', 0.35, noise_depth=4); d2.strength = 0.3
    dec = ob.modifiers.new('削減', 'DECIMATE'); dec.ratio = 0.5
    apply_mods(ob)
    me.materials.append(MAT['岩'])
    for p in me.polygons: p.use_smooth = True
    me.update(); rock_colors(me, seed, moss=0.95)
    bpy.data.objects.remove(ob)
    return me

# ---------------------------------------------------------------------------
# 地形
# ---------------------------------------------------------------------------
def terrain(half=40.0, n=128):
    bm = bmesh.new(); uvl = bm.loops.layers.uv.verify(); col = bm.loops.layers.color.new('Col')
    vs = {}
    for i in range(n + 1):
        for j in range(n + 1):
            x = -half + j / n * half * 2; y = -half + i / n * half * 2
            vs[i, j] = bm.verts.new((x, y, H(x, y)))
    for i in range(n):
        for j in range(n):
            f = bm.faces.new((vs[i, j], vs[i, j + 1], vs[i + 1, j + 1], vs[i + 1, j]))
            for l in f.loops: l[uvl].uv = ((l.vert.co.x + half) / (half * 2), (l.vert.co.y + half) / (half * 2))
    me = bpy.data.meshes.new('地形'); bm.to_mesh(me); bm.free()
    me.materials.append(MAT['地面'])
    for p in me.polygons: p.use_smooth = True
    return me

# ---------------------------------------------------------------------------
# 小屋（青灰の丸瓦の急な屋根・石の1階と張り出した木組みの2階・円い塔・庇と吊り角灯）
# ---------------------------------------------------------------------------
def build_house():
    mb = MB(7); rnd = mb.rnd
    W, D = HOUSE['w'], HOUSE['d']; G1, G2, OV = 2.3, 2.1, 0.28   # 1階の高さ・2階の高さ・2階の張り出し
    W2, D2 = W / 2, D / 2
    # 1階: 石積み（角に大きめの隅石）
    mb.box((W, D, G1), (0, 0, G1 / 2 - 0.3), m='石積み', bevel=0.06)
    for sx in (-1, 1):
        for sy in (-1, 1):
            z = -0.3
            while z < G1 - 0.3:
                h = rnd.uniform(0.32, 0.42); big = (int(z * 7) % 2 == 0)
                mb.box((0.62 if big else 0.42, 0.42 if big else 0.62, h - 0.03), (sx * (W2 - 0.18), sy * (D2 - 0.18), z + h / 2), m='石積み', bevel=0.05, jit=0.015)
                z += h
    # 2階: 張り出した木組みの漆喰壁
    mb.box((W + OV * 2, D + OV * 2, 0.22), (0, 0, G1 - 0.2), m='木_濃', bevel=0.03)
    for k in range(int((W + OV * 2) / 0.55) + 1):  # 張り出しを支える梁の先
        x = -W2 - OV + 0.2 + k * 0.55
        if x > W2 + OV - 0.1: break
        for s in (-1, 1): mb.box((0.14, 0.3, 0.14), (x, s * (D2 + OV - 0.05), G1 - 0.36), m='木_濃', bevel=0.02)
    mb.box((W + OV * 2 - 0.1, D + OV * 2 - 0.1, G2), (0, 0, G1 + G2 / 2 - 0.1), m='漆喰', bevel=0.04)
    for face in range(4):
        L = (W if face < 2 else D) + OV * 2; s = 1 if face % 2 else -1
        def at(u, z, n=0.02):
            return (u, s * (D2 + OV + n), z) if face < 2 else (s * (W2 + OV + n), u, z)
        def sz(su, sz_, sn=0.12):
            return (su, sn, sz_) if face < 2 else (sn, su, sz_)
        mb.box(sz(L + 0.05, 0.16), at(0, G1 + 0.02), m='木_濃', bevel=0.02)
        mb.box(sz(L + 0.05, 0.18), at(0, G1 + G2 - 0.12), m='木_濃', bevel=0.02)
        posts = [-L / 2 + 0.08, -L / 4, 0, L / 4, L / 2 - 0.08]
        for u in posts: mb.box(sz(0.15, G2), at(u, G1 + G2 / 2 - 0.05), m='木_濃', bevel=0.02)
        for i in range(len(posts) - 1):
            if face == 0 and i in (1, 2): continue   # 正面の中央2区画は窓
            u0, u1 = posts[i], posts[i + 1]
            for flip in (0, 1):
                a = at(u0 if not flip else u1, G1 + 0.12, 0.03); b = at(u1 if not flip else u0, G1 + G2 - 0.22, 0.03)
                a, b = Vector(a), Vector(b); c = (a + b) / 2; dvec = b - a
                fs = mb.box((dvec.length, 0.1, 0.11) if face < 2 else (0.1, dvec.length, 0.11), c, m='木_濃')
                vs = list({v for f in fs for v in f.verts})
                ang = math.atan2(dvec.z, dvec.x if face < 2 else dvec.y)
                bmesh.ops.rotate(mb.bm, cent=c, matrix=Matrix.Rotation(ang if face >= 2 else -ang, 3, 'X' if face >= 2 else 'Y'), verts=vs)
    # 窓（1階は石の窓枠、2階は木の窓枠と花箱）
    def window(face_y, x, z, w, h, upper):
        y = face_y
        sgn = -1 if y < 0 else 1
        mb.box((w, 0.08, h), (x, y + sgn * 0.02, z), m='窓')
        frame = '木_濃' if upper else '石積み'
        for s in (-1, 1): mb.box((0.14, 0.18, h + 0.2), (x + s * (w / 2 + 0.07), y + sgn * 0.06, z), m=frame, bevel=0.03)
        mb.box((w + 0.36, 0.22, 0.14), (x, y + sgn * 0.08, z + h / 2 + 0.1), m=frame, bevel=0.03)
        mb.box((w + 0.4, 0.3, 0.1), (x, y + sgn * 0.12, z - h / 2 - 0.06), m=frame, bevel=0.03)
        mb.box((0.05, 0.1, h), (x, y + sgn * 0.06, z), m='木_濃'); mb.box((w, 0.1, 0.05), (x, y + sgn * 0.06, z + h * 0.1), m='木_濃')
        if upper:
            mb.box((w + 0.2, 0.3, 0.24), (x, y + sgn * 0.24, z - h / 2 - 0.2), m='木', bevel=0.03)
            for k in range(7):
                p = Vector((x - w / 2 + k * w / 6, y + sgn * 0.26, z - h / 2 - 0.04))
                foliage_mass(mb, p, 0.11, p - Vector((0, 0, 0.3)), rnd, sprigs=2, sub=1)
                vs = mb.sphere(0.05, p + Vector((rnd.uniform(-0.04, 0.04), sgn * 0.05, 0.08)), m='花', sub=1); mb.tag(vs, '花', srgb([0xff7a9a, 0xffd84a, 0xfff6ee, 0xb88af0][k % 4]))
    fy = -(D2 + 0.01)
    for x in (-2.1, 1.7): window(fy, x, 1.15, 0.95, 1.0, False)
    for x in (-1.4, 1.2): window(-(D2 + OV + 0.01), x, G1 + 1.0, 0.9, 0.9, True)
    window(D2 + 0.01, -1.5, 1.15, 0.8, 0.9, False); window(D2 + OV + 0.01, 1.0, G1 + 1.0, 0.8, 0.85, True)
    # 扉（上が丸い板戸）と庇
    dx = -0.2
    for k in range(5): mb.box((0.215, 0.1, 1.85), (dx - 0.43 + k * 0.215, fy - 0.03, 0.62), m='木' if k % 2 else '木_濃', bevel=0.01)
    mb.hull([(dx + math.cos(math.pi * k / 10) * 0.54, fy - y_, 1.545 + math.sin(math.pi * k / 10) * 0.45) for k in range(11) for y_ in (0.0, 0.08)], m='木')
    for s in (-1, 1): mb.box((0.2, 0.24, 2.3), (dx + s * 0.66, fy - 0.06, 0.85), m='石積み', bevel=0.04)
    mb.cyl(0.05, 0.05, 0.05, (dx + 0.3, fy - 0.1, 0.65), rot=(math.pi / 2, 0, 0), m='鉄', seg=8)
    pz = 2.05
    for s in (-1, 1): mb.box((0.14, 0.14, pz + 0.3), (dx + s * 0.95, fy - 1.25, (pz + 0.3) / 2 - 0.3), m='木_濃', bevel=0.02)
    for s in (-1, 1):
        c = Vector((dx + s * 0.62, fy - 0.7, pz + 0.38))
        vs = list({v for f in mb.box((1.45, 1.75, 0.08), c, m='瓦') for v in f.verts})
        bmesh.ops.rotate(mb.bm, cent=c, matrix=Matrix.Rotation(s * 0.55, 3, 'Y'), verts=vs)
    mb.box((0.12, 1.8, 0.14), (dx, fy - 0.7, pz + 0.72), m='木_濃')
    mb.box((1.9, 0.6, 0.16), (dx, fy - 1.0, -0.24), m='石積み', bevel=0.04)
    mb.box((0.04, 0.04, 0.3), (dx, fy - 1.3, pz - 0.05), m='鉄')
    mb.box((0.22, 0.22, 0.3), (dx, fy - 1.3, pz - 0.35), m='灯'); mb.cyl(0.18, 0.03, 0.14, (dx, fy - 1.3, pz - 0.2), m='鉄', seg=6)
    # 大屋根: むねは東西。丸瓦の列（下ほど少し反る）
    RH = 3.4; OVr = 0.5; Lx = W + OV * 2 + 0.9; z0 = G1 + G2 - 0.1
    half = D2 + OV + OVr
    for s in (-1, 1):
        rows = 15
        for i in range(rows):
            t = (i + 0.5) / rows
            y = s * half * (1 - t); zz = z0 - RH * OVr / (D2 + OV) + (RH + RH * OVr / (D2 + OV)) * t
            zz += 0.18 * (1 - t) ** 3  # 軒先の反り
            ang = math.atan2(RH, D2 + OV) * (-s)
            tiles = int(Lx / 0.36)
            for k in range(tiles):
                x = -Lx / 2 + (k + 0.5 + (0.5 if i % 2 else 0)) * Lx / tiles
                if abs(x) > Lx / 2 - 0.1: continue
                c = Vector((x, y, zz + 0.08))
                fs = mb.cyl(0.19, 0.17, half / rows * 1.55, (0, 0, 0), rot=(0, 0, 0), m='瓦', seg=8, sc=(1, 0.42, 1))
                vs = list({v for f in fs for v in f.verts})
                bmesh.ops.transform(mb.bm, matrix=Matrix.Translation(c) @ Matrix.Rotation(ang + s * (math.pi / 2), 4, 'X') @ Matrix.Translation((0, 0, -half / rows * 0.75)), verts=vs)
        # 屋根の下地
        c = Vector((0, s * half / 2, z0 + RH / 2 - RH * OVr / (D2 + OV) / 2))
        vs = list({v for f in mb.box((Lx, math.hypot(half, RH + RH * OVr / (D2 + OV)), 0.16), c, m='木_濃') for v in f.verts})
        bmesh.ops.rotate(mb.bm, cent=c, matrix=Matrix.Rotation(math.atan2(RH + RH * OVr / (D2 + OV), half) * (-s), 3, 'X'), verts=vs)
    for k in range(int(Lx / 0.4)):
        mb.cyl(0.16, 0.16, 0.42, (-Lx / 2 + 0.2 + k * 0.4 - 0.21, 0, z0 + RH + 0.1), rot=(0, math.pi / 2, 0), m='瓦', seg=8)
    for sx in (-1, 1):  # 妻壁
        x = sx * (W2 + OV - 0.05)
        mb.hull([(x - 0.1, -(D2 + OV), z0), (x - 0.1, D2 + OV, z0), (x - 0.1, 0, z0 + RH - 0.1), (x + 0.1, -(D2 + OV), z0), (x + 0.1, D2 + OV, z0), (x + 0.1, 0, z0 + RH - 0.1)], m='漆喰')
        for yy in (-(D2 + OV) * 0.45, 0.0, (D2 + OV) * 0.45):
            hh = RH * (1 - abs(yy) / (D2 + OV)) - 0.25
            mb.box((0.14, 0.14, hh), (x + sx * 0.1, yy, z0 + hh / 2), m='木_濃')
        vs = mb.sphere(0.32, (x + sx * 0.11, 0, z0 + RH * 0.42), sc=(0.3, 1, 1), m='窓', sub=2); mb.tag(vs, '窓')
    # 煙突（西の妻）
    cx = -(W2 + OV + 0.45)
    for k in range(int((z0 + RH + 1.4) / 0.36)):
        z = -0.3 + k * 0.36; wdt = 1.1 if z < z0 else 0.8
        mb.box((wdt, wdt * 1.05, 0.34), (cx + (0 if z < z0 else 0.08), 0.6, z + 0.17), m='石積み', bevel=0.05, jit=0.02)
    mb.box((1.0, 1.0, 0.16), (cx + 0.08, 0.6, z0 + RH + 1.45), m='石積み', bevel=0.04)
    mb.cyl(0.16, 0.13, 0.4, (cx + 0.08, 0.6, z0 + RH + 1.5), m='素焼き', seg=10)
    smoke = Vector((cx + 0.08, 0.6, z0 + RH + 2.0))
    # 円い塔（正面の東の角）: 石の円柱・細い窓・円錐の屋根（裾が反る）・頂の飾り
    tx, ty, tr, th = W2 + 0.4, -(D2 - 0.3), 1.45, G1 + G2 + 1.3
    for k in range(int(th / 0.38)):
        z = -0.3 + k * 0.38; n = 16
        for j in range(n):
            a = (j + (0.5 if k % 2 else 0)) / n * 6.2832
            fs = mb.box((0.6, 0.3, 0.35), (tx + math.cos(a) * (tr - 0.1), ty + math.sin(a) * (tr - 0.1), z + 0.19), rot=(0, 0, a + math.pi / 2), m='石積み', bevel=0.05, jit=0.012)
    mb.cyl(tr - 0.2, tr - 0.2, th, (tx, ty, -0.3), m='石積み', seg=16)
    for a, z in ((-2.0, 1.2), (-1.2, G1 + 1.0), (-0.3, G1 + G2 + 0.3)):
        p = Vector((tx + math.cos(a) * (tr + 0.02), ty + math.sin(a) * (tr + 0.02), z))
        mb.box((0.3, 0.12, 0.62), p, rot=(0, 0, a + math.pi / 2), m='窓')
        mb.box((0.46, 0.2, 0.12), p + Vector((0, 0, 0.38)), rot=(0, 0, a + math.pi / 2), m='石積み', bevel=0.03)
    cone_h = 3.8; base_z = th - 0.32
    rings = 12
    for i in range(rings):
        t0, t1 = i / rings, (i + 1) / rings
        r0 = (tr + 0.45) * (1 - t0) ** 1.15 + 0.05; z = base_z + cone_h * t0 + 0.25 * (1 - t0) ** 4
        n = max(6, int(r0 * 6.28 / 0.32))
        for j in range(n):
            a = (j + (0.5 if i % 2 else 0)) / n * 6.2832
            c = Vector((tx + math.cos(a) * r0, ty + math.sin(a) * r0, z))
            fs = mb.cyl(0.16, 0.14, cone_h / rings * 1.7, (0, 0, 0), m='瓦', seg=7, sc=(1, 0.42, 1))
            vs = list({v for f in fs for v in f.verts})
            slope = math.atan2(cone_h, tr + 0.45)
            bmesh.ops.transform(mb.bm, matrix=Matrix.Translation(c) @ Matrix.Rotation(a + math.pi / 2, 4, 'Z') @ Matrix.Rotation(-(math.pi / 2 - slope), 4, 'X') @ Matrix.Translation((0, 0, -cone_h / rings * 0.4)), verts=vs)
    mb.cyl(tr + 0.35, 0.05, cone_h, (tx, ty, base_z), m='木_濃', seg=16)
    mb.cyl(0.05, 0.02, 0.9, (tx, ty, base_z + cone_h - 0.1), m='鉄', seg=6)
    vs = mb.sphere(0.11, (tx, ty, base_z + cone_h + 0.45), m='鉄', sub=1); mb.tag(vs, '鉄')
    # 壁ぎわの花と蔦
    for k in range(18):
        t = k / 17
        p = Vector((tx - tr * 0.75 + rnd.uniform(-0.1, 0.1), ty - tr * 0.6, -0.1 + t * 3.0))
        foliage_mass(mb, p, 0.22, p - Vector((0.6, -0.4, 0.4)), rnd, sprigs=3, sub=1)
    me = mb.mesh('小屋', smooth_angle=35)
    lights = [(dx, fy - 1.3, pz - 0.35)]
    return me, smoke, lights, (tx, ty, tr)

def build_yard_props():
    # 前庭の石畳（縁石つき）・角灯の柱・樽と木箱・薪の山・花の鉢・ベンチ
    mb = MB(31); rnd = mb.rnd
    x0, x1, y0, y1 = YARD
    y = y1
    while y > y0 + 0.1:
        h = rnd.uniform(0.42, 0.56); x = x0 + (0.0 if int(y * 7) % 2 else -0.25)
        while x < x1:
            w = rnd.uniform(0.5, 0.8); a, b = max(x, x0), min(x + w, x1)
            edge = (a <= x0 + 0.01 or b >= x1 - 0.01 or y - h <= y0 + 0.05)
            if b - a > 0.2 and not (edge and rnd.random() < 0.35):
                gx, gy = (a + b) / 2, y - h / 2
                mb.box((b - a - 0.07, h - 0.07, 0.14), (gx, gy, ground(gx, gy) + 0.0), m='敷石', bevel=0.03, jit=0.01)
            x += w
        y -= h
    for xx in np.arange(x0 + 0.2, x1, 0.45):  # 縁石（南の縁）
        mb.box((0.42, 0.2, 0.18), (xx, y0 - 0.05, ground(xx, y0) + 0.02), m='石積み', bevel=0.04, jit=0.01)
    for yy in np.arange(y0, y1, 0.45):
        for xx in (x0 - 0.05, x1 + 0.05): mb.box((0.2, 0.42, 0.18), (xx, yy + 0.2, ground(xx, yy) + 0.02), m='石積み', bevel=0.04, jit=0.01)
    lights = []
    for (lx, ly) in ((x0 - 0.5, y0 - 0.5), (x1 + 0.5, y0 - 0.5)):
        z = ground(lx, ly)
        mb.box((0.16, 0.16, 2.3), (lx, ly, z + 1.15), m='木_濃', bevel=0.03)
        mb.box((0.6, 0.08, 0.08), (lx + 0.25 * (1 if lx < 0 else -1), ly, z + 2.2), m='木_濃')
        lp = (lx + 0.48 * (1 if lx < 0 else -1), ly, z + 1.85)
        mb.box((0.24, 0.24, 0.3), lp, m='灯'); mb.cyl(0.2, 0.03, 0.14, (lp[0], lp[1], lp[2] + 0.15), m='鉄', seg=6)
        mb.box((0.28, 0.28, 0.04), (lp[0], lp[1], lp[2] - 0.17), m='鉄'); mb.box((0.04, 0.04, 0.2), (lp[0], lp[1], lp[2] + 0.3), m='鉄')
        mb.cyl(0.2, 0.24, 0.24, (lx, ly, z - 0.05), m='石積み', seg=8)
        lights.append(lp)
    # 樽と木箱（小屋の東の脇）
    props = []
    for k, (bx, by) in enumerate(((3.2, 4.0), (3.9, 4.6), (3.4, 5.4))):
        z = ground(bx, by); r = 0.38
        mb.cyl(r * 0.9, r, 0.45, (bx, by, z), m='木', seg=14); mb.cyl(r, r * 0.9, 0.45, (bx, by, z + 0.45), m='木', seg=14)
        for hz in (0.12, 0.45, 0.8): mb.cyl(r + 0.02, r + 0.02, 0.05, (bx, by, z + hz), m='鉄', seg=14)
        props.append((bx, by, r + 0.1))
    for k, (cx, cy, s, rz) in enumerate(((4.7, 3.6, 0.7, 0.3), (5.3, 4.5, 0.6, -0.2), (4.9, 4.1, 0.55, 0.6))):
        z = ground(cx, cy) + (0.7 if k == 2 else 0)
        mb.box((s, s, s), (cx, cy, z + s / 2), rot=(0, 0, rz), m='木', bevel=0.03)
        for e in (-1, 1): mb.box((s + 0.04, 0.08, 0.1), (cx, cy, z + s / 2 + e * (s / 2 - 0.06)), rot=(0, 0, rz), m='木_濃')
        props.append((cx, cy, s * 0.75))
    # 薪の山（西の壁ぎわ、煙突の手前）
    wx, wy = HOUSE['x'] - HOUSE['w'] / 2 - 1.6, HOUSE['y'] - 2.0
    for row in range(4):
        for k in range(7 - row):
            p = (wx + rnd.uniform(-0.03, 0.03), wy - 0.9 + k * 0.28 + row * 0.14, ground(wx, wy) + 0.14 + row * 0.24)
            mb.cyl(0.13, 0.13, 0.7, (p[0] - 0.35, p[1], p[2]), rot=(0, math.pi / 2, 0), m='木', seg=8)
    props.append((wx, wy, 1.1))
    # ベンチ（前庭の西の端）
    bx, by = x0 + 0.9, y1 - 0.45; z = ground(bx, by)
    for k in range(3): mb.box((1.6, 0.14, 0.06), (bx, by - 0.14 + k * 0.14, z + 0.45), m='木', bevel=0.01)
    for s in (-1, 1): mb.box((0.1, 0.42, 0.45), (bx + s * 0.65, by, z + 0.22), m='木_濃')
    # 鉢植え
    for (px, py, col) in ((-1.3, 4.3, 0xff7a9a), (0.9, 4.3, 0xffd84a), (-5.6, 4.0, 0xb88af0)):
        z = ground(px, py)
        mb.cyl(0.2, 0.26, 0.38, (px, py, z), m='素焼き', seg=12)
        p = Vector((px, py, z + 0.55)); foliage_mass(mb, p, 0.26, p - Vector((0, 0, 0.5)), rnd, sprigs=6, sub=2)
        for k in range(6):
            vs = mb.sphere(0.06, p + Vector((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0.2)), m='花', sub=1); mb.tag(vs, '花', srgb(col))
    me = mb.mesh('前庭')
    return me, lights, props

# ---------------------------------------------------------------------------
# 組み立て
# ---------------------------------------------------------------------------
def blocked(x, y, pad=0.0, objs=()):
    hx, hy = HOUSE['x'], HOUSE['y']
    if abs(x - hx) < HOUSE['w'] / 2 + 2.6 + pad and abs(y - hy) < HOUSE['d'] / 2 + 1.0 + pad: return True
    x0, x1, y0, y1 = YARD
    if x0 - 0.6 - pad < x < x1 + 0.6 + pad and y0 - 0.9 - pad < y < y1: return True
    if path_dist(x, y) < 0.2 + pad: return True
    if math.hypot(x - WAYPOINT[0], y - WAYPOINT[1]) < 2.6 + pad: return True
    if abs(cliff_s(x, y)) < 1.1 + pad and ramp_k(x) < 0.5: return True
    return any(math.hypot(x - ox, y - oy) < orr + pad for ox, oy, orr in objs)

def build():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    build_materials()
    # 地形
    put(terrain(), '地形', '地形', (0, 0, 0))
    # 小屋
    hme, smoke, hl, tower = build_house()
    hob = put(hme, '小屋', '小屋', (HOUSE['x'], HOUSE['y'], ground(HOUSE['x'], HOUSE['y']) + 0.3), rz=HOUSE['rz'], col='box', w=HOUSE['w'] + 0.8, d=HOUSE['d'] + 0.8)
    Mh = hob.matrix_basis
    tw = Mh @ Vector((tower[0], tower[1], 0)); o = bpy.data.objects.new('塔の当たり', None); o.location = (tw.x, tw.y, 0); o['col'] = 'circle'; o['col_r'] = tower[2] + 0.2; coll('目印').objects.link(o)
    ch = Mh @ Vector((-(HOUSE['w'] / 2 + 0.28 + 0.45), 0.6, 0)); o = bpy.data.objects.new('煙突の当たり', None); o.location = (ch.x, ch.y, 0); o['col'] = 'circle'; o['col_r'] = 0.8; coll('目印').objects.link(o)
    po = Mh @ Vector((-0.2, -(HOUSE['d'] / 2) - 1.25, 0))
    for s in (-1, 1):
        p = Mh @ Vector((-0.2 + s * 0.95, -(HOUSE['d'] / 2) - 1.25, 0)); o = bpy.data.objects.new('庇の柱', None); o.location = (p.x, p.y, 0); o['col'] = 'circle'; o['col_r'] = 0.2; coll('目印').objects.link(o)
    marker('mark_smoke', Mh @ smoke, 'smoke')
    for k, l in enumerate(hl): marker(f'mark_light_h{k}', Mh @ Vector(l), 'light')
    # 前庭
    yme, yl, props = build_yard_props()
    put(yme, '前庭', '庭', (0, 0, 0))
    for k, l in enumerate(yl): marker(f'mark_light_y{k}', l, 'light')
    for k, (px, py, pr) in enumerate(props):
        o = bpy.data.objects.new('小物の当たり', None); o.location = (px, py, 0); o['col'] = 'circle'; o['col_r'] = pr; coll('目印').objects.link(o)
    for s in (-1, 1):
        x0, x1, y0, y1 = YARD
        o = bpy.data.objects.new('灯の柱', None); o.location = ((x0 - 0.5) if s < 0 else (x1 + 0.5), y0 - 0.5, 0); o['col'] = 'circle'; o['col_r'] = 0.3; coll('目印').objects.link(o)
    marker('mark_waypoint', (WAYPOINT[0], WAYPOINT[1], 0), 'waypoint')
    # 岩壁（坂の区間を除く）と、ふもとの大岩
    for i in range(len(CLIFF) - 1):
        a, b = Vector(CLIFF[i]), Vector(CLIFF[i + 1]); L = (b - a).length; n = max(1, int(L / 5.5))
        for k in range(n):
            pa, pb = a.lerp(b, k / n), a.lerp(b, (k + 1) / n)
            mid = (pa + pb) / 2
            if ramp_k(mid.x) > 0.25: continue
            if rel(mid.x, mid.y) > 1.6: continue
            put(cliff_wall(100 + i * 10 + k, pa - (pb - pa).normalized() * 0.4, pb + (pb - pa).normalized() * 0.4, 0, 0), '岩壁', '岩', (0, 0, 0))
            # 当たり判定: 崖の下の縁に沿って円を並べる
            d = (pb - pa).normalized(); nn = Vector((-d.y, d.x))
            for t in np.arange(0.0, 1.0, 1.3 / (pb - pa).length):
                p = pa.lerp(pb, t) + nn * 0.2
                if rel(p.x, p.y) < 1.05:
                    o = bpy.data.objects.new('崖の当たり', None); o.location = (p.x, p.y, 0); o['col'] = 'circle'; o['col_r'] = 0.95; coll('目印').objects.link(o)
    rocks = [boulder(s, sz, fl) for s, sz, fl in ((1, 1.0, 0.75), (2, 1.3, 0.6), (3, 0.7, 0.8), (4, 1.6, 0.55), (5, 0.9, 0.9))]
    placed = []
    rnd = random.Random(5)
    for (x, y, s) in [(-9.0, 9.4, 1.0), (-13.5, 7.2, 0.8), (6.5, 14.8, 1.1), (11.0, 14.6, 0.8), (-22.0, 2.8, 1.2), (-6.8, -10.5, 0.9), (4.2, -17.5, 0.7),
                      (-3.4, -17.8, 0.8), (14.8, -1.6, 1.0), (12.2, -5.8, 0.7), (16.0, -4.2, 0.55), (19.0, 8.0, 1.2), (-18.5, -8.5, 0.9), (9.2, -13.0, 0.6),
                      (-8.6, 2.4, 0.55), (22.5, -6.0, 1.0), (-24.5, -4.0, 1.1), (24.0, 3.0, 0.9)]:
        if blocked(x, y, 0.3) and not (abs(cliff_s(x, y)) < 2.5): continue
        m = rocks[len(placed) % len(rocks)]
        put(m, '岩', '岩', (x, y, ground(x, y) - 0.05), rz=rnd.random() * 6.28, s=s, **({'col': 'circle', 'r': round(1.2 * s, 2)} if rel(x, y) < 1.05 else {}))
        placed.append((x, y, 1.3 * s))
    # 木: 見せ場の木（手で決めた位置）と、外周の森
    maples = {s: broadleaf(s, h, lobes=11, sprigs=22) for s, h in ((11, 6.8), (12, 7.6), (13, 6.0), (14, 8.2))}
    firs = {s: fir(s, h) for s, h in ((21, 9.5), (22, 8.0), (23, 11.0))}
    far_maple = broadleaf(15, 7.0, lobes=7, sprigs=5, name='広葉樹_遠', sub=1)
    trees = []
    hero = [('m', 8.6, -12.4, 1.15), ('m', -10.4, -13.6, 1.05), ('m', 12.6, 4.6, 1.0), ('m', 17.4, -9.8, 0.95), ('m', -20.8, -3.6, 1.1),
            ('m', 5.0, 11.8, 0.85), ('m', -22.4, 11.0, 1.0), ('m', -9.8, 19.0, 1.1), ('m', 14.0, 19.0, 1.0), ('m', 21.4, 5.0, 0.9),
            ('m', -14.6, -9.0, 0.8), ('f', -6.4, 17.6, 1.0), ('f', -14.2, 15.8, 0.9), ('f', 2.4, 20.4, 1.0), ('f', 22.0, 14.2, 0.95),
            ('f', -25.6, 6.6, 1.0), ('f', 16.6, -15.6, 0.85), ('m', -4.0, -21.6, 0.9), ('m', 4.6, -22.4, 0.95)]
    for k, (kind, x, y, s) in enumerate(hero):
        if blocked(x, y, 0.4, placed):
            continue
        me = maples[11 + k % 4] if kind == 'm' else firs[21 + k % 3]
        inside = rel(x, y) < 1.03
        put(me, '広葉樹' if kind == 'm' else '針葉樹', '木', (x, y, ground(x, y) - 0.1), rz=rnd.random() * 6.28, s=s,
            **({'col': 'circle', 'r': round((0.6 if kind == 'm' else 0.5) * s + 0.1, 2)} if inside else {}))
        trees.append((x, y, (3.6 if kind == 'm' else 2.6) * s)); placed.append((x, y, 1.0 * s))
    # 外周の森（輪郭の外に厚く。入口の南は開ける）
    tries = 0; outer = 0
    while outer < 46 and tries < 4000:
        tries += 1
        a = rnd.random() * 6.2832; f = rnd.uniform(1.02, 1.55); r = bound(a) * f
        x, y = math.sin(a) * r, math.cos(a) * r
        if abs(x) < 4.5 and y < 0: continue
        if any(math.hypot(x - tx, y - ty) < 4.4 for tx, ty, _ in trees): continue
        kind = 'f' if rnd.random() < 0.35 else 'm'
        me = far_maple if kind == 'm' else firs[21 + rnd.randrange(3)]
        put(me, '広葉樹' if kind == 'm' else '針葉樹', '木', (x, y, ground(x, y) - 0.1), rz=rnd.random() * 6.28, s=rnd.uniform(0.95, 1.35))
        trees.append((x, y, 3.4)); outer += 1
    # 低木・シダ・花・草
    shrubs = [shrub(41 + k, R=rnd.uniform(0.7, 0.95), flowers=[None, 0xfff6ee, 0xff8aaa, None][k]) for k in range(4)]
    ferns = [fern(51 + k) for k in range(3)]
    flowers = {k: flower_patch(60 + i, k) for i, k in enumerate(('lav', 'yel', 'white', 'pink'))}
    grass = [grass_clump(70 + k, h=rnd.uniform(0.38, 0.6), n=rnd.randint(7, 11)) for k in range(4)]
    def scatter(me_list, n, near, radius, pad, cname, sc=(0.8, 1.25), name='下草', avoid_path=0.4, extra=None):
        cnt = 0
        for k in range(n * 6):
            if cnt >= n: break
            cx, cy = near() if callable(near) else near
            a = rnd.random() * 6.28; r = math.sqrt(rnd.random()) * radius
            x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
            if rel(x, y) > 1.25 or blocked(x, y, pad, placed) or path_dist(x, y) < avoid_path: continue
            if extra and not extra(x, y): continue
            put(rnd.choice(me_list), name, cname, (x, y, ground(x, y) - 0.04), rz=rnd.random() * 6.28, s=rnd.uniform(*sc)); cnt += 1
    # 道の縁の低木とシダ（見本1・4のように道を縁取る）
    for pts, w in PATHS:
        for i in range(len(pts) - 1):
            a, b = Vector(pts[i]), Vector(pts[i + 1]); L = (b - a).length; d = (b - a).normalized(); nrm = Vector((-d.y, d.x))
            for t in np.arange(0, L, 2.2):
                for s in (-1, 1):
                    if rnd.random() < 0.45: continue
                    p = a + d * t + nrm * s * (w + rnd.uniform(1.0, 2.2))
                    if blocked(p.x, p.y, 0.6, placed) or rel(p.x, p.y) > 1.1: continue
                    me = rnd.choice(shrubs) if rnd.random() < 0.5 else rnd.choice(ferns)
                    put(me, '低木' if me in shrubs else 'シダ', '下草', (p.x, p.y, ground(p.x, p.y) - 0.05), rz=rnd.random() * 6.28, s=rnd.uniform(0.85, 1.3))
                    placed.append((p.x, p.y, 0.7))
    # 木の根元と崖のふもと
    for tx, ty, tr in trees:
        if rel(tx, ty) > 1.3: continue
        scatter(ferns + shrubs, 2, (tx, ty), tr * 0.7, 0.3, '下草', name='シダ')
    for i in range(len(CLIFF) - 1):
        a, b = Vector(CLIFF[i]), Vector(CLIFF[i + 1])
        scatter(ferns + shrubs[:2] + [flowers['lav']], 6, lambda a=a, b=b: (a.lerp(b, rnd.random()) - Vector((-(b - a).y, (b - a).x)).normalized() * 1.6)[:], 1.4, 0.0, '下草', name='シダ',
                extra=lambda x, y: -3.0 < cliff_s(x, y) < -1.0 or ramp_k(x) > 0.5)
    # 花: 小屋の正面の花壇・前庭の縁・芝に散る黄色い小花（見本3）・ラベンダーの群れ（見本2）
    hx, hy = HOUSE['x'], HOUSE['y']
    for k in range(26):
        x = hx - HOUSE['w'] / 2 + 0.3 + k * (HOUSE['w'] - 0.6) / 25; y = hy - HOUSE['d'] / 2 - 0.45 + rnd.uniform(-0.12, 0.12)
        if abs(x - (hx - 0.2)) < 1.1: continue
        put(flowers[['pink', 'white', 'lav', 'yel'][k % 4]], '花', '下草', (x, y, ground(x, y)), rz=rnd.random() * 6.28, s=rnd.uniform(1.0, 1.3))
    for cx, cy in ((-9.4, 4.2), (-5.4, -6.4), (4.2, -4.8), (9.0, 0.2), (-12.8, -2.8), (2.6, 8.0)):
        scatter([flowers['lav']], 9, (cx, cy), 1.4, 0.0, '下草', sc=(1.0, 1.4), name='花', avoid_path=0.3)
    scatter([flowers['yel'], flowers['white'], flowers['yel']], 64, (0, 0), 22, 0.0, '下草', sc=(0.9, 1.3), name='花', avoid_path=0.5)
    scatter([flowers['pink']], 16, (6.0, -6.0), 9, 0.0, '下草', name='花')
    # 草の株（芝の上に密に。道・石畳・小屋は避ける）
    scatter(grass, 850, (0, 0), 27, 0.0, '下草', sc=(0.8, 1.4), name='草', avoid_path=0.15)
    # 切り株とピクニックの一角（テントの代わりに、森の家らしい小さな休み場）
    mb = MB(81)
    mb.cyl(0.45, 0.38, 0.5, (0, 0, -0.1), m='樹皮', seg=12, color=srgb(0x6a5238)); mb.cyl(0.38, 0.38, 0.03, (0, 0, 0.4), m='木', seg=12)
    stump = mb.mesh('切り株')
    px, py = PICNIC
    put(stump, '切り株', '庭', (px, py, ground(px, py)), s=1.3, col='circle', r=0.6)
    for k in range(3):
        a = k / 3 * 6.28 + 0.4
        sx, sy = px + math.cos(a) * 1.3, py + math.sin(a) * 1.3
        put(stump, '切り株', '庭', (sx, sy, ground(sx, sy) - 0.12), rz=a, s=0.75, col='circle', r=0.4)
    return trees

def write_layout():
    cols = []
    for ob in bpy.data.objects:
        k = ob.get('col')
        if not k: continue
        x, z = round(ob.location.x, 2), round(-ob.location.y, 2); s = ob.scale.x
        if k == 'circle': cols.append({'x': x, 'z': z, 'r': round(ob['col_r'], 2)})
        else:
            w, d = ob['col_w'] * s, ob['col_d'] * s
            cols.append({'x': x, 'z': z, 'r': round(math.hypot(w, d) / 2, 2), 'box': {'x': x, 'z': z, 'w': round(w, 2), 'd': round(d, 2), 'ry': round(ob.rotation_euler.z, 4)}})
    marks = {}
    for ob in coll('目印').objects:
        if ob.get('mark'): marks.setdefault(ob['mark'], []).append([round(ob.location.x, 2), round(ob.location.z, 2), round(-ob.location.y, 2)])
    # 地面の高さの表（ゲームの x・z で 1 m ごと）。ゲームはこれを補間して足元の高さにする
    half, step = 40, 1.0; n = int(half * 2 / step) + 1
    hs = [round(H(-half + j * step, -(-half + i * step)), 2) for i in range(n) for j in range(n)]  # 行 i = ゲームの z、列 j = x
    data = {'model': 'blender/sunlit_hollow.glb', 'style': 'pbr', 'ownGround': True, 'hideGround': True,
            'colliders': sorted(cols, key=lambda c: (c['z'], c['x'])), 'path': [[p[0], -p[1]] for p in PATH_MAIN], 'beds': [],
            'lights': marks.get('light', []), 'smoke': marks.get('smoke', []), 'waypoint': {'x': marks['waypoint'][0][0], 'z': marks['waypoint'][0][2]},
            'height': {'x0': -half, 'z0': -half, 'step': step, 'n': n, 'h': hs}}
    path = os.path.join(ROOT, 'public', 'shared', 'hollow-layout.js')
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    with open(path, 'w', encoding='utf-8') as f:
        f.write('// 自動生成: tools/blender/sunlit_hollow.py（陽だまりの森の家 f1_hollow。手で直さない）\n')
        f.write('// 当たり判定・地面の高さの表（1 m ごと）・明かり・煙突・ワープポイント。座標はゲームの x・z（m）\n')
        f.write('export const HOLLOW = ' + body + ';\n')
    print('書き出し:', path, len(cols), '個の当たり判定')

def export():
    objs = [o for c in ('地形', '岩', '小屋', '庭', '木', '下草') for o in COLL[c].objects]
    out = os.path.join(ROOT, 'public', 'assets', 'models', 'blender', 'sunlit_hollow.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT',
                              export_cameras=False, export_lights=False, export_vertex_color='ACTIVE', export_image_format='AUTO')
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
    print('書き出し:', out, os.path.getsize(out) // 1024, 'KB / 三角形', tris)
    write_layout()

def preview():
    sun = bpy.data.lights.new('日差し', 'SUN'); sun.energy = 3.6; sun.color = (1.0, 0.93, 0.8); sun.angle = math.radians(1.5)
    so = bpy.data.objects.new('日差し', sun); so.rotation_euler = (math.radians(46), math.radians(-10), math.radians(205)); coll('プレビュー').objects.link(so)
    for ob in coll('目印').objects:
        if ob.get('mark') == 'light':
            L = bpy.data.lights.new('灯り', 'POINT'); L.energy = 40; L.color = (1.0, 0.78, 0.45); L.shadow_soft_size = 0.2
            lo = bpy.data.objects.new('灯り', L); lo.location = ob.location; coll('プレビュー').objects.link(lo)
    w = bpy.data.worlds.new('空'); bpy.context.scene.world = w; w.use_nodes = True
    nt = w.node_tree; bg = nt.nodes['Background']; sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(44); sky.sun_rotation = math.radians(205); sky.dust_density = 1.2
    nt.links.new(sky.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 0.22
    cams = {'全景': ((10.0, -40.0, 30.0), (-1.5, 1.0, 0.0), 38), '小屋': ((6.0, -1.2, 4.6), (-3.0, 8.6, 2.8), 30), '小道': ((-3.0, -27.0, 10.0), (-1.0, -5.0, 0.5), 32),
            'ゲーム視点': ((0.0, -16.0, 15.5), (-1.0, -1.0, 0.5), 45)}
    for n, (loc, tgt, fl) in cams.items():
        cd = bpy.data.cameras.new('カメラ_' + n); cd.lens = fl; co = bpy.data.objects.new('カメラ_' + n, cd); co.location = loc
        co.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); coll('プレビュー').objects.link(co)
    bpy.context.scene.camera = bpy.data.objects['カメラ_全景']

def render(cams=('全景', '小屋', '小道', 'ゲーム視点'), samples=48, scale=100, out_dir=None):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 1280, 800; sc.render.resolution_percentage = scale
    sc.view_settings.view_transform = 'AgX'
    try: sc.view_settings.look = 'AgX - Punchy'
    except TypeError: pass
    sc.view_settings.exposure = -0.45
    out_dir = out_dir or os.path.join(ROOT, 'docs', 'hollow'); os.makedirs(out_dir, exist_ok=True)
    names = {'全景': 'blender-overview.png', '小屋': 'blender-cottage.png', '小道': 'blender-path.png', 'ゲーム視点': 'blender-gameview.png'}
    for c in cams:
        sc.camera = bpy.data.objects['カメラ_' + c]; sc.render.filepath = os.path.join(out_dir, names[c]); bpy.ops.render.render(write_still=True); print('描画:', sc.render.filepath)

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in ('地形', '岩', '小屋', '庭', '木', '下草', '目印', 'プレビュー'): coll(c)
    build()
    preview()
    export()
    blend = os.path.join(ROOT, 'tools', 'blender', 'sunlit_hollow.blend')
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True, relative_remap=True)
    print('保存:', blend)
    if '--render' in ARGS: render()
    elif '--quick' in ARGS: render(samples=12, scale=50, out_dir=os.environ.get('QUICK_OUT'))

if __name__ == '__main__':
    main()
