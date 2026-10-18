# 森の小屋の一角（エリア f1_glade「木漏れ日の小屋」）: 木と石の小屋・前庭・周りの森をまとめて作って並べる
#   実行（作り直し）: blender -b -P tools/blender/cottage_glade.py
#   実行（.blend で手直ししたあと、書き出しだけ）: blender -b tools/blender/cottage_glade.blend -P tools/blender/cottage_glade.py -- --export-only
#   プレビュー画像も描く: 末尾に -- --render（Cycles・CPU。数分かかる）
#
#   作るもの
#     tools/blender/cottage_glade.blend                       編集用（コレクション: 小屋 / 庭 / 森 / 目印 / プレビュー）
#     public/assets/models/blender/cottage_glade.glb          エリア全体（小屋・庭・森。目印とプレビュー用の地面は入れない）
#     public/assets/models/blender/cottage.glb                小屋だけ（箱庭の「外部モデル」の列に並ぶ）
#     public/shared/glade-layout.js                           当たり判定・小道・花壇・明かり・煙突の位置（ゲームとサーバーが読む）
#
#   取り決め（mmo_common と同じ）: 1 単位 = 1 m / フラットシェード / 色は材質（材質名 = パレットの名前）
#   座標: Blender の X = ゲームの x、Blender の Y = ゲームの -z（北が +Y）。小屋の正面は南（-Y）= ゲームのカメラの側
#   当たり判定は物体のカスタムプロパティ col（'circle' / 'box'）・col_r・col_w・col_d から書き出す。.blend で動かせばそのまま付いてくる
import os, sys, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) if os.path.exists(__file__) else '.')
import importlib, mmo_common as C
importlib.reload(C)
import bpy, bmesh
from mathutils import Vector, Matrix, Euler, noise

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
AREA = {'id': 'f1_glade', 'R': 18, 'ell': (1.15, 1.0), 'wob': 0.08}  # shared/areas.js の f1_glade と同じ値
EXIT_Y = -13.45  # 湖畔への出口（ゲームの z = 13.45）

C.PALETTE.update({
    '石壁': (0x9a, 0x95, 0x8a), '石壁_暗': (0x78, 0x73, 0x6a), '石壁_明': (0xb2, 0xac, 0x9e),
    '漆喰': (0xee, 0xe4, 0xcc), '木組み': (0x4a, 0x32, 0x22), '板': (0x6a, 0x4a, 0x30), '板_明': (0x8a, 0x64, 0x40), '木口': (0xc8, 0xa0, 0x70),
    '屋根': (0xa8, 0x55, 0x3c), '屋根_暗': (0x82, 0x3e, 0x30), '屋根_苔': (0x6e, 0x8a, 0x48),
    '鎧戸': (0x4f, 0x7a, 0x6a), '鉄': (0x4a, 0x4c, 0x58), '素焼き': (0xb0, 0x64, 0x40), '水': (0x3a, 0x7a, 0xb0),
    '発光_窓': (0xff, 0xc8, 0x70), '発光_灯': (0xff, 0xd8, 0x90), '発光_妖精': (0x9a, 0xf0, 0xd8),
    '敷石': (0xb4, 0xad, 0xa0), '敷石_暗': (0x96, 0x90, 0x84), '土': (0x5a, 0x42, 0x2e),
    '茎': (0x4a, 0x8a, 0x3a), '低木': (0x3a, 0x74, 0x38), '低木_明': (0x58, 0x96, 0x46), '蔦': (0x3c, 0x7c, 0x34),
    '花_桃': (0xff, 0x7a, 0x8a), '花_黄': (0xff, 0xd8, 0x4a), '花_白': (0xff, 0xf6, 0xe8), '花_紫': (0xb0, 0x7a, 0xff),
    '花_橙': (0xff, 0x9a, 0x4a), '花_青': (0x7a, 0xa8, 0xff), 'ラベンダー': (0x9a, 0x7a, 0xd8), '薔薇': (0xe8, 0x5a, 0x7a),
    '南瓜': (0xe0, 0x8a, 0x2a), 'キノコ_赤': (0xd8, 0x58, 0x4a), 'キノコ_白': (0xf0, 0xe8, 0xd8),
    '針葉': (0x2c, 0x5a, 0x3a), '針葉_明': (0x3f, 0x72, 0x48), 'シダ': (0x4a, 0x8a, 0x3a), 'シダ_明': (0x6a, 0xa8, 0x4a),
    '白樺': (0xe8, 0xe4, 0xd8), '白樺_斑': (0x3a, 0x34, 0x30), '芝': (0x4c, 0x8a, 0x3a),
})

def mat(name):
    m = C.material(name)
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if name.startswith('発光'):
        bsdf.inputs['Emission Color'].default_value = m.diffuse_color
        bsdf.inputs['Emission Strength'].default_value = 4.0 if name != '発光_妖精' else 2.0
    if name == '水': bsdf.inputs['Roughness'].default_value = 0.2
    return m

# ---------------------------------------------------------------------------
# 形を足していく入れ物（1つの bmesh に材質の番号つきで積む）
# ---------------------------------------------------------------------------
def M4(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))

class MB:
    def __init__(self, rnd=None):
        self.bm = bmesh.new(); self.names = []; self.rnd = rnd or random.Random(1)
    def mi(self, name):
        if name not in self.names: self.names.append(name)
        return self.names.index(name)
    def _faces(self, verts, name):
        fs = {f for v in verts for f in v.link_faces}
        i = self.mi(name)
        for f in fs: f.material_index = i
        return fs
    def _jit(self, verts, j):
        if j:
            for v in verts: v.co += Vector((self.rnd.uniform(-j, j), self.rnd.uniform(-j, j), self.rnd.uniform(-j, j)))
    def box(self, size, loc, rot=(0, 0, 0), m='板', jit=0.0, bevel=0.0):
        vs = bmesh.ops.create_cube(self.bm, size=1.0)['verts']
        if bevel:
            es = list({e for v in vs for e in v.link_edges})
            # 先に寸法を決めてから角を落とす（bevel は実寸で効く）
            bmesh.ops.transform(self.bm, matrix=Matrix.Diagonal((*size, 1)), verts=vs)
            r = bmesh.ops.bevel(self.bm, geom=vs + es, offset=min(bevel, min(size) * 0.45), offset_type='OFFSET', segments=1, affect='EDGES', clamp_overlap=True, profile=0.5)
            vs = list({v for f in r['faces'] for v in f.verts} | set(vs))
            vs = [v for v in vs if v.is_valid]
            bmesh.ops.transform(self.bm, matrix=M4(loc, rot), verts=vs)
        else:
            bmesh.ops.transform(self.bm, matrix=M4(loc, rot, size), verts=vs)
        self._jit(vs, jit)
        return self._faces(vs, m)
    def cyl(self, r1, r2, h, loc, rot=(0, 0, 0), m='板', seg=8, jit=0.0, scale=(1, 1, 1)):
        # 底の中心が loc（Z 方向に h）
        vs = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=max(r2, 1e-3), depth=h)['verts']
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation((0, 0, h / 2)), verts=vs)
        bmesh.ops.transform(self.bm, matrix=M4(loc, rot, scale), verts=vs)
        self._jit(vs, jit)
        if r2 <= 1e-3: bmesh.ops.remove_doubles(self.bm, verts=vs, dist=2e-3); vs = [v for v in vs if v.is_valid]
        return self._faces(vs, m)
    def blob(self, r, loc, scale=(1, 1, 1), rot=(0, 0, 0), m='葉', sub=1, amp=0.25, freq=1.6, seed=0, shade=None):
        # でこぼこの球（葉の房・低木・苔・岩のかけら）。shade=(下, 中, 上) で面の向きごとに材質を変える
        vs = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r)['verts']
        off = Vector((seed * 7.13, seed * 3.71, seed * 5.29))
        for v in vs:
            n = noise.fractal(v.co / r * freq + off, 0.6, 2.0, 3)
            v.co += v.co.normalized() * n * amp * r
        bmesh.ops.transform(self.bm, matrix=M4(loc, rot, scale), verts=vs)
        fs = self._faces(vs, m)
        if shade:
            lo, mid, hi = (self.mi(s) for s in shade)
            for f in fs:
                nz = f.normal.z
                f.material_index = hi if nz > 0.72 and self.rnd.random() < 0.55 else mid if nz > 0.05 else lo
        return fs
    def hull(self, pts, m='漆喰'):
        vs = [self.bm.verts.new(Vector(p)) for p in pts]
        r = bmesh.ops.convex_hull(self.bm, input=vs)
        for g in r['geom_interior'] + r['geom_unused']:
            if isinstance(g, bmesh.types.BMVert) and g.is_valid: self.bm.verts.remove(g)
        return self._faces([v for v in vs if v.is_valid], m)
    def beam(self, a, b, t, m='木組み', w=None, jit=0.0):
        # a から b への角材（断面 t×w）
        a, b = Vector(a), Vector(b); d = b - a; L = d.length
        q = d.to_track_quat('Z', 'Y')
        vs = bmesh.ops.create_cube(self.bm, size=1.0)['verts']
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((t, w or t, L, 1)), verts=vs)
        self._jit(vs, jit)
        return self._faces(vs, m)
    def plank(self, a, b, width, thick, m='板', jit=0.0):
        # a から b への板（幅は水平方向、厚みはそれに直交）。シダの葉・柵の横木に使う
        a, b = Vector(a), Vector(b); d = b - a; L = d.length; dn = d / L
        side = dn.cross(Vector((0, 0, 1)))
        side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0))
        up = side.cross(dn)
        Mx = Matrix(((side.x * width, up.x * thick, dn.x * L, 0), (side.y * width, up.y * thick, dn.y * L, 0), (side.z * width, up.z * thick, dn.z * L, 0), (0, 0, 0, 1)))
        vs = bmesh.ops.create_cube(self.bm, size=1.0)['verts']
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation((a + b) / 2) @ Mx, verts=vs)
        self._jit(vs, jit)
        return self._faces(vs, m)
    def tube(self, path, radius, rings=6, sides=6, m='幹'):
        loops = []
        for i in range(rings + 1):
            t = i / rings
            p, q = path(t), path(min(1, t + 0.01) if t < 1 else t - 0.01)
            d = (q - p).normalized() if t < 1 else (p - q).normalized()
            u = d.orthogonal().normalized(); w = d.cross(u); r = radius(t)
            loops.append([self.bm.verts.new(p + (u * math.cos(a) + w * math.sin(a)) * r) for a in (k / sides * 6.2832 for k in range(sides))])
        i_m = self.mi(m)
        for i in range(rings):
            a, b = loops[i], loops[i + 1]
            for k in range(sides):
                self.bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k])).material_index = i_m
        self.bm.faces.new(list(reversed(loops[0]))).material_index = i_m
        self.bm.faces.new(loops[-1]).material_index = i_m
    def mesh(self, name):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me); self.bm.free()
        for n in self.names: me.materials.append(mat(n))
        for p in me.polygons: p.use_smooth = False
        return me

COLL = {}
def coll(name):
    if name not in COLL:
        c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); COLL[name] = c
    return COLL[name]

def place(me, name, cname, loc=(0, 0, 0), rz=0.0, s=1.0, col=None, **colp):
    ob = bpy.data.objects.new(name, me)
    ob.location = loc; ob.rotation_euler = (0, 0, rz); ob.scale = (s, s, s)
    coll(cname).objects.link(ob)
    if col:
        ob['col'] = col
        for k, v in colp.items(): ob['col_' + k] = v
    return ob

def marker(name, loc, kind):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = 'SPHERE'; ob.empty_display_size = 0.3; ob.location = loc
    ob['mark'] = kind
    coll('目印').objects.link(ob)
    return ob

# ---------------------------------------------------------------------------
# エリアの輪郭（shared/areas.js の boundR と同じ式）
# ---------------------------------------------------------------------------
def _hash(s):
    a = 7
    for ch in s: a = (a * 31 + ord(ch)) & 0xffffffff
    return a
def _seeded(seed):
    st = [seed & 0xffffffff]
    def r():
        st[0] = (st[0] * 1664525 + 1013904223) & 0xffffffff
        return st[0] / 4294967296
    return r
_R = _seeded(_hash(AREA['id']) ^ 0x9e37); SHAPE = (_R() * 6.28, _R() * 6.28, _R() * 6.28)
def bound(a):
    sx, sz = AREA['ell']; dx, dz = math.sin(a), -math.cos(a)
    base = 1 / ((abs(dx / (AREA['R'] * sx)) ** 2 + abs(dz / (AREA['R'] * sz)) ** 2) ** 0.5)
    p1, p2, p3 = SHAPE; w = AREA['wob']
    return base * (1 + w * (0.55 * math.sin(3 * a + p1) + 0.3 * math.sin(5 * a + p2) + 0.15 * math.sin(8 * a + p3)))
def ang_of(x, y): return math.atan2(x, y)  # ゲームの angOf(x, z) = atan2(x, -z)、z = -Y
def rel(x, y): return math.hypot(x, y) / bound(ang_of(x, y))  # 1 で輪郭

# ---------------------------------------------------------------------------
# 配置の骨組み
# ---------------------------------------------------------------------------
HX, HY, HW, HD = 0.0, 5.8, 6.4, 4.8   # 小屋の中心と幅・奥行き（正面の壁は y = 3.4）
FRONT = HY - HD / 2
PATH = [(0.0, FRONT - 0.95), (0.05, 1.2), (0.3, -1.4), (0.0, -4.6), (-0.55, -7.0), (0.35, -9.4), (0.8, -11.4), (0.0, EXIT_Y), (0.0, EXIT_Y - 3.5)]
FENCE_Y, FENCE_X = -4.6, 6.6
WELL = (-9.4, 0.6)
PUMPKINS = (8.9, -1.6)
FAIRY = (-8.6, -8.4)
WAYPOINT = (-3.4, -8.6)
LANTERNS = [(1.45, -6.7), (-1.5, -10.6)]

def path_pt(t):
    # 折れ線の上の点（t: 0〜1、長さで等分）
    segs = [(Vector(PATH[i]), Vector(PATH[i + 1])) for i in range(len(PATH) - 1)]
    L = sum((b - a).length for a, b in segs); d = t * L
    for a, b in segs:
        l = (b - a).length
        if d <= l: return a.lerp(b, d / l), (b - a).normalized()
        d -= l
    return segs[-1][1], (segs[-1][1] - segs[-1][0]).normalized()
def path_len(): return sum((Vector(PATH[i + 1]) - Vector(PATH[i])).length for i in range(len(PATH) - 1))
def dist_path(x, y):
    p = Vector((x, y)); best = 1e9
    for i in range(len(PATH) - 1):
        a, b = Vector(PATH[i]), Vector(PATH[i + 1]); ab = b - a
        t = max(0, min(1, (p - a).dot(ab) / ab.length_squared))
        best = min(best, (a + ab * t - p).length)
    return best
def in_garden(x, y, pad=0.0): return -FENCE_X - pad < x < FENCE_X + pad and FENCE_Y - pad < y < FRONT + pad
def near_house(x, y, pad=0.0): return abs(x - HX) < HW / 2 + 1.3 + pad and abs(y - HY) < HD / 2 + 0.6 + pad

# ---------------------------------------------------------------------------
# 小屋
# ---------------------------------------------------------------------------
def wall_frame(face):
    # 壁の向き: (u 軸, 外向きの法線, 面の位置)。u は外から見て左→右
    W2, D2 = HW / 2, HD / 2
    return {'S': (Vector((1, 0, 0)), Vector((0, -1, 0)), D2), 'N': (Vector((-1, 0, 0)), Vector((0, 1, 0)), D2),
            'W': (Vector((0, -1, 0)), Vector((-1, 0, 0)), W2), 'E': (Vector((0, 1, 0)), Vector((1, 0, 0)), W2)}[face]

def on_wall(face, u, z, n):
    ax, nrm, off = wall_frame(face)
    return ax * u + nrm * (off + n) + Vector((0, 0, z))

def wbox(mb, face, u, z, n, su, sz, sn, m, jit=0.0, bevel=0.0):
    ax, nrm, _ = wall_frame(face)
    size = (abs(ax.x) * su + abs(nrm.x) * sn, abs(ax.y) * su + abs(nrm.y) * sn, sz)
    return mb.box(size, on_wall(face, u, z, n), m=m, jit=jit, bevel=bevel)

def window(mb, face, u, z, w=0.9, h=1.0, shutters=True, flowerbox=True):
    rnd = mb.rnd
    wbox(mb, face, u, z, 0.03, w, h, 0.06, '発光_窓')
    for s in (-1, 1):
        wbox(mb, face, u + s * (w / 2 + 0.04), z, 0.08, 0.1, h + 0.16, 0.1, '木組み')
    wbox(mb, face, u, z + h / 2 + 0.05, 0.09, w + 0.26, 0.14, 0.14, '木組み')   # まぐさ
    wbox(mb, face, u, z - h / 2 - 0.05, 0.12, w + 0.3, 0.09, 0.2, '板_明')      # 窓台
    wbox(mb, face, u, z, 0.07, 0.05, h, 0.05, '木組み')
    wbox(mb, face, u, z + h * 0.08, 0.07, w, 0.05, 0.05, '木組み')
    if shutters:
        for s in (-1, 1):
            wbox(mb, face, u + s * (w / 2 + 0.03 + w * 0.21), z, 0.06, w * 0.42, h + 0.06, 0.05, '鎧戸')
            for k in (-1, 1): wbox(mb, face, u + s * (w / 2 + 0.03 + w * 0.21), z + k * h * 0.28, 0.095, w * 0.38, 0.06, 0.03, '木組み')
    if flowerbox:
        wbox(mb, face, u, z - h / 2 - 0.22, 0.2, w + 0.18, 0.24, 0.26, '板')
        cols = ['花_桃', '花_黄', '花_白', '薔薇', '花_紫']
        for k in range(6):
            p = on_wall(face, u - w / 2 + 0.08 + k * (w - 0.16) / 5, z - h / 2 - 0.06, 0.2 + rnd.uniform(-0.05, 0.05))
            mb.blob(0.11, p, scale=(1, 1, 0.8), m='低木', sub=1, amp=0.3, seed=rnd.random() * 50)
            mb.blob(0.05, p + Vector((rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), 0.09)), m=cols[(k + int(u * 3)) % len(cols)], sub=0, amp=0.1)

def roof_side(mb, sgn, W, y0, z0, y1, z1, rnd, skip=None):
    # 片側の屋根: 下地の板と、軒からむねへ並ぶ板葺き（sgn: -1 = 正面側）。板葺きは屋根より少し寝かせて、下の縁を浮かせる
    a, b = Vector((0, y0, z0)), Vector((0, y1, z1)); d = b - a; L = d.length; up = d.normalized()
    nrm = Vector((0, up.z, -up.y))
    if nrm.z < 0: nrm = -nrm
    tilt = math.atan2(d.z, abs(d.y)) * (-sgn)
    mid = (a + b) / 2 + nrm * 0.06
    vs = list({v for f in mb.box((W, L, 0.14), mid, m='板') for v in f.verts})
    bmesh.ops.rotate(mb.bm, cent=mid, matrix=Matrix.Rotation(tilt, 3, 'X'), verts=vs)
    rows = int(L / 0.29)
    for i in range(rows):
        t = (i + 0.5) / rows
        p0 = a + d * t + nrm * 0.16
        x = -W / 2 - (rnd.random() * 0.2 if i % 2 else 0)
        while x < W / 2:
            w = rnd.uniform(0.34, 0.46); xa, xb = max(x, -W / 2), min(x + w, W / 2)
            if xb - xa > 0.1 and not (skip and skip((xa + xb) / 2, p0.y)):
                edge = i < 2 or abs((xa + xb) / 2) > W / 2 - 0.6
                m = '屋根_苔' if rnd.random() < (0.22 if edge else 0.06) else '屋根_暗' if rnd.random() < 0.22 else '屋根'
                c = Vector(((xa + xb) / 2, p0.y, p0.z))
                fs = mb.box((xb - xa - 0.035, L / rows * 1.45, 0.05), c, m=m, jit=0.012)
                vs = list({v for f in fs for v in f.verts})
                bmesh.ops.rotate(mb.bm, cent=c, matrix=Matrix.Rotation(tilt + sgn * 0.07 + rnd.uniform(-0.03, 0.03), 3, 'X') @ Matrix.Rotation(rnd.uniform(-0.04, 0.04), 3, 'Y'), verts=vs)
            x += w

def build_cottage():
    rnd = random.Random(11); mb = MB(rnd)
    W, D, SH, WH, RH = HW, HD, 1.15, 2.9, 3.1
    W2, D2 = W / 2, D / 2
    # 芯: 石の腰壁と漆喰の壁
    mb.box((W + 0.08, D + 0.08, SH), (0, 0, SH / 2), m='石壁_暗')
    mb.box((W - 0.04, D - 0.04, WH - SH + 0.02), (0, 0, SH + (WH - SH) / 2), m='漆喰')
    # 腰壁の石積み（段ごとに長さを変え、目地をずらす）
    for face in 'SNWE':
        L = (W if face in 'SN' else D) + 0.14
        z, row = 0.0, 0
        while z < SH - 0.06:
            h = min(rnd.uniform(0.25, 0.34), SH - z); s = -L / 2 - (rnd.uniform(0.1, 0.3) if row % 2 else 0)
            while s < L / 2:
                l = rnd.uniform(0.32, 0.6); a, b = max(s, -L / 2), min(s + l, L / 2); u = (a + b) / 2
                door = face == 'S' and abs(u) < 0.72
                if b - a > 0.12 and not door:
                    m = '石壁_明' if rnd.random() < 0.25 else '石壁_暗' if rnd.random() < 0.2 else '石壁'
                    wbox(mb, face, u, z + h / 2, 0.06 + rnd.uniform(0, 0.04), b - a - 0.035, h - 0.035, 0.16, m, jit=0.018, bevel=0.035)
                s += l
            z += h; row += 1
        # 腰壁の上の苔
        for k in range(int(L / 0.7)):
            if rnd.random() < 0.45:
                u = rnd.uniform(-L / 2, L / 2)
                if face == 'S' and abs(u) < 0.8: continue
                mb.blob(0.12, on_wall(face, u, SH + 0.02, 0.1), scale=(1.6, 1.0, 0.45), m='苔', sub=1, amp=0.35, seed=rnd.random() * 40)
    # 木組み: 土台・桁・柱・筋かい
    for face in 'SNWE':
        L = W if face in 'SN' else D
        wbox(mb, face, 0, SH + 0.08, 0.06, L + 0.16, 0.16, 0.14, '木組み', jit=0.01)
        wbox(mb, face, 0, WH - 0.06, 0.06, L + 0.2, 0.18, 0.16, '木組み', jit=0.01)
        posts = {'S': [-W2 + 0.08, -1.0, 1.0, W2 - 0.08], 'N': [-W2 + 0.08, -0.9, 0.9, W2 - 0.08], 'W': [-D2 + 0.08, 0.0, D2 - 0.08], 'E': [-D2 + 0.08, 0.0, D2 - 0.08]}[face]
        for u in posts: wbox(mb, face, u, (SH + WH) / 2, 0.07, 0.16, WH - SH, 0.12, '木組み', jit=0.01)
        # 窓のない区画に斜めの筋かい
        braces = {'S': [], 'N': [(-W2 + 0.08, -0.9)], 'W': [(0.0, D2 - 0.08)], 'E': [(0.0, D2 - 0.08)]}[face]
        for u0, u1 in braces:
            for k in (0, 1):
                a = on_wall(face, u0 if k == 0 else u1, SH + 0.16, 0.07); b = on_wall(face, u1 if k == 0 else u0, WH - 0.15, 0.07)
                mb.beam(a, b, 0.12, w=0.1, jit=0.008)
    # 窓（正面に2つ・西・北・東）と、正面の妻壁の窓
    for u in (-2.05, 2.05): window(mb, 'S', u, 1.95, 0.95, 0.95)
    window(mb, 'W', -1.1, 1.95, 0.8, 0.85)
    window(mb, 'N', 1.9, 1.95, 0.8, 0.85, flowerbox=False)
    window(mb, 'E', -1.2, 1.95, 0.7, 0.8, shutters=False)
    # 扉（上が丸い板戸）と石のアーチ
    dz0, dh, dw = 0.04, 1.75, 1.08
    for k in range(5):
        u = -dw / 2 + dw / 10 + k * dw / 5
        wbox(mb, 'S', u, dz0 + dh / 2, 0.05, dw / 5 - 0.012, dh, 0.08, '板' if k % 2 else '板_明', jit=0.006)
    arc = [on_wall('S', math.cos(math.pi * k / 10) * dw / 2, dz0 + dh + math.sin(math.pi * k / 10) * dw / 2 * 0.85, n) for k in range(11) for n in (0.01, 0.09)]
    mb.hull(arc, m='板')
    for z in (0.45, 1.45): wbox(mb, 'S', 0, z, 0.1, dw - 0.1, 0.07, 0.03, '鉄')
    mb.cyl(0.05, 0.05, 0.04, on_wall('S', 0.36, 1.0, 0.1), rot=(math.pi / 2, 0, 0), m='鉄', seg=8)
    for k in range(9):
        a = math.pi * k / 8
        p = on_wall('S', math.cos(a) * (dw / 2 + 0.12), dz0 + dh + math.sin(a) * (dw / 2 * 0.85 + 0.12), 0.1)
        mb.box((0.2, 0.2, 0.22), p, rot=(0, -(a - math.pi / 2), 0), m='石壁_明', jit=0.02, bevel=0.03)
    for s in (-1, 1):
        z = 0.0
        while z < dz0 + dh - 0.05:
            h = rnd.uniform(0.28, 0.38); wbox(mb, 'S', s * (dw / 2 + 0.12), z + h / 2, 0.1, 0.22 + rnd.uniform(0, 0.08), h - 0.03, 0.22, '石壁_明', jit=0.015, bevel=0.03); z += h
    # 戸口の踏み石
    mb.box((1.7, 0.55, 0.14), (0, -D2 - 0.33, 0.07), m='敷石', jit=0.02, bevel=0.04)
    mb.box((1.3, 0.45, 0.1), (0.05, -D2 - 0.85, 0.05), m='敷石_暗', jit=0.02, bevel=0.03)
    # 壁掛けの角灯
    mb.box((0.06, 0.4, 0.06), on_wall('S', 0.95, 2.15, 0.2), m='鉄')
    lan = on_wall('S', 0.95, 1.92, 0.36)
    mb.box((0.2, 0.2, 0.26), lan, m='発光_灯')
    for dx in (-0.1, 0.1):
        for dy in (-0.1, 0.1): mb.box((0.03, 0.03, 0.3), lan + Vector((dx, dy, 0)), m='鉄')
    mb.cyl(0.17, 0.02, 0.14, lan + Vector((0, 0, 0.13)), m='鉄', seg=4, rot=(0, 0, math.pi / 4))
    mb.box((0.24, 0.24, 0.04), lan + Vector((0, 0, -0.14)), m='鉄')
    marker('mark_light_door', (HX + lan.x, HY + lan.y, lan.z), 'light')
    # 妻壁（東西）と、正面の小さな破風（壁から屋根へ立ち上がる窓）
    for s in (-1, 1):
        x = s * (W2 - 0.04)
        mb.hull([(x - 0.1, -D2, WH), (x - 0.1, D2, WH), (x - 0.1, 0, WH + RH - 0.1), (x + 0.1, -D2, WH), (x + 0.1, D2, WH), (x + 0.1, 0, WH + RH - 0.1)], m='漆喰')
        mb.beam((x + s * 0.1, 0, WH), (x + s * 0.1, 0, WH + RH - 0.25), 0.16, jit=0.01)
        for k in (-1, 1):
            mb.beam((x + s * 0.1, k * (D2 - 0.4), WH + 0.05), (x + s * 0.1, k * 0.05, WH + RH * 0.62), 0.12, w=0.1, jit=0.01)
        mb.beam((x + s * 0.1, -D2 * 0.72, WH + RH * 0.28), (x + s * 0.1, D2 * 0.72, WH + RH * 0.28), 0.12, w=0.12)
    # 西の妻壁に丸窓
    gw = Vector((-W2 - 0.12, 0.0, WH + 1.25))
    mb.cyl(0.36, 0.36, 0.06, gw + Vector((-0.02, 0, 0)), rot=(0, math.pi / 2, 0), m='発光_窓', seg=12)
    for k in range(10):
        a = k / 10 * math.pi * 2
        mb.box((0.1, 0.16, 0.12), gw + Vector((-0.05, math.cos(a) * 0.42, math.sin(a) * 0.42)), rot=(a, 0, 0), m='木組み')
    mb.box((0.06, 0.06, 0.74), gw + Vector((-0.06, 0, 0)), m='木組み'); mb.box((0.06, 0.74, 0.06), gw + Vector((-0.06, 0, 0)), m='木組み')
    # 正面の破風: 前の壁を屋根の上まで立ち上げ、小さな切妻屋根をかける
    DW, DT, DR = 1.25, WH + 1.05, WH + 2.0   # 半幅・壁の上・むね
    def roof_z(y): return WH + RH * (1 - abs(y) / D2)
    yb = -D2 * (1 - (DR - WH) / RH)            # 小さな屋根のむねが大屋根に当たる位置
    mb.hull([(-DW, -D2 - 0.02, WH - 0.1), (DW, -D2 - 0.02, WH - 0.1), (-DW, -D2 - 0.02, DT), (DW, -D2 - 0.02, DT), (0, -D2 - 0.02, DR - 0.08),
             (-DW, -D2 + 0.18, WH - 0.1), (DW, -D2 + 0.18, WH - 0.1), (-DW, -D2 + 0.18, DT), (DW, -D2 + 0.18, DT), (0, -D2 + 0.18, DR - 0.08)], m='漆喰')
    for s in (-1, 1):
        yc = -D2 * (1 - (DT - WH) / RH)
        mb.hull([(s * DW, -D2, WH), (s * DW, -D2, DT), (s * DW, yc, DT), (s * DW - s * 0.16, -D2, WH), (s * DW - s * 0.16, -D2, DT), (s * DW - s * 0.16, yc, DT)], m='漆喰')
        mb.beam((s * DW, -D2 - 0.06, WH - 0.05), (s * DW, -D2 - 0.06, DT + 0.05), 0.15, jit=0.01)
    mb.beam((-DW - 0.05, -D2 - 0.07, DT), (DW + 0.05, -D2 - 0.07, DT), 0.15)
    window(mb, 'S', 0, WH + 0.5, 0.7, 0.62, shutters=False, flowerbox=True)
    mb.beam((0, -D2 - 0.06, DT + 0.08), (0, -D2 - 0.06, DR - 0.3), 0.12, jit=0.01)                      # 破風の束
    for s in (-1, 1): mb.beam((s * (DW - 0.1), -D2 - 0.06, DT + 0.08), (s * 0.08, -D2 - 0.06, DR - 0.45), 0.1, w=0.1)
    rnd2 = random.Random(5)
    for s in (-1, 1):
        # 小さな屋根の両面（むねは前後方向）
        p_top = Vector((0, 0, DR + 0.12)); p_eave = Vector((s * (DW + 0.38), 0, DT - 0.22))
        d = p_eave - p_top; L = d.length; ang = math.atan2(-d.z, abs(d.x))
        length = abs(yb) - D2 + 0.55 + 0.4
        yc = (-D2 - 0.55 + yb + 0.4) / 2
        c = (p_top + p_eave) / 2; c.y = yc
        vs = list({v for f in mb.box((L, length, 0.12), c, m='板') for v in f.verts})
        bmesh.ops.rotate(mb.bm, cent=c, matrix=Matrix.Rotation(ang * s, 3, 'Y'), verts=vs)
        rows = 6
        for i in range(rows):
            t = (i + 0.5) / rows; q = p_eave.lerp(p_top, t)
            y = -D2 - 0.55
            while y < yb + 0.3:
                l = rnd2.uniform(0.34, 0.44)
                cc = Vector((q.x + s * 0.0, y + l / 2, q.z + 0.11))
                fs = mb.box((L / rows * 1.4, l - 0.035, 0.05), cc, m='屋根_苔' if rnd2.random() < 0.1 else '屋根_暗' if rnd2.random() < 0.25 else '屋根', jit=0.01)
                vs = list({v for f in fs for v in f.verts})
                bmesh.ops.rotate(mb.bm, cent=cc, matrix=Matrix.Rotation(ang * s - s * 0.06, 3, 'Y'), verts=vs)
                y += l
        # 破風板（先が交差して突き出す）
        mb.beam(p_eave + Vector((0, -D2 - 0.62, 0.05)), p_top + Vector((-s * 0.32, -D2 - 0.62, 0.25)), 0.07, w=0.16, jit=0.01)
    # 大屋根: むねは東西。正面側（-Y）と裏側。妻側は 0.45 m、軒は 0.55 m 張り出す
    OV, OG = 0.55, 0.45
    for sg in (-1, 1):
        roof_side(mb, sg, W + OG * 2, sg * (D2 + OV), WH - RH * OV / D2, 0, WH + RH, rnd)
    # むね: 丸瓦の列と、両端の飾り
    for k in range(int((W + OG * 2) / 0.36)):
        x = -W2 - OG + 0.18 + k * 0.36
        mb.cyl(0.13, 0.13, 0.38, (x - 0.19, 0, WH + RH + 0.15), rot=(0, math.pi / 2, 0), m='屋根_暗', seg=6, jit=0.008)
    for s in (-1, 1):
        x = s * (W2 + OG - 0.05)
        for k in (-1, 1):
            mb.beam((x, k * (D2 + OV), WH - RH * OV / D2 + 0.08), (x, -k * 0.38, WH + RH + 0.55), 0.07, w=0.18, jit=0.01)
    # 煙突（東の妻壁の外。石を積んで上を細く）
    cx, cy = W2 + 0.5, 0.95
    mb.box((0.95, 1.05, 2.6), (cx, cy, 1.3), m='石壁_暗')
    mb.hull([(cx - 0.47, cy - 0.52, 2.6), (cx + 0.47, cy - 0.52, 2.6), (cx - 0.47, cy + 0.52, 2.6), (cx + 0.47, cy + 0.52, 2.6),
             (cx - 0.33, cy - 0.36, 3.3), (cx + 0.33, cy - 0.36, 3.3), (cx - 0.33, cy + 0.36, 3.3), (cx + 0.33, cy + 0.36, 3.3)], m='石壁_暗')
    mb.box((0.66, 0.72, 3.3), (cx, cy, 3.3 + 1.65), m='石壁_暗')
    z = 0.0
    while z < 6.5:
        h = rnd.uniform(0.24, 0.32); half = (0.5, 0.55) if z < 2.6 else (0.36, 0.39)
        for side in range(3):
            if side == 0:   p, sz = (cx + half[0] + 0.02, cy + rnd.uniform(-0.2, 0.2), z + h / 2), (0.12, half[1] * 2 * rnd.uniform(0.45, 0.6), h - 0.03)
            elif side == 1: p, sz = (cx + rnd.uniform(-0.15, 0.15), cy - half[1] - 0.02, z + h / 2), (half[0] * 2 * rnd.uniform(0.45, 0.65), 0.12, h - 0.03)
            else:           p, sz = (cx + rnd.uniform(-0.15, 0.15), cy + half[1] + 0.02, z + h / 2), (half[0] * 2 * rnd.uniform(0.45, 0.65), 0.12, h - 0.03)
            if 2.55 < z < 3.3: continue
            mb.box(sz, p, m='石壁_明' if rnd.random() < 0.3 else '石壁', jit=0.015, bevel=0.03)
        z += h
    mb.box((0.84, 0.9, 0.14), (cx, cy, 6.66), m='石壁_明', bevel=0.03)
    for k, (dx, dy) in enumerate(((-0.14, -0.1), (0.15, 0.14))):
        mb.cyl(0.13, 0.11, 0.34 + k * 0.08, (cx + dx, cy + dy, 6.72), m='素焼き', seg=8)
    marker('mark_smoke', (HX + cx + 0.15, HY + cy + 0.14, 7.2), 'smoke')
    # 西の薪棚（片流れの屋根の下に薪を積む）
    wx = -W2 - 0.55
    for k in range(4):
        for j in range(6 - (k > 2)):
            y = -1.75 + j * 0.27 + (k % 2) * 0.13; z = 0.16 + k * 0.25
            mb.cyl(0.12 + rnd.uniform(-0.015, 0.02), 0.12, 0.62, (wx - 0.31, y, z), rot=(0, math.pi / 2, 0), m='板', seg=7, jit=0.01)
            mb.cyl(0.1, 0.1, 0.02, (wx - 0.33, y, z), rot=(0, math.pi / 2, 0), m='木口', seg=7)
    for y in (-2.0, 0.0):
        mb.box((0.1, 0.1, 1.7), (wx - 0.42, y, 0.85), m='木組み', jit=0.01)
    vs = list({v for f in mb.box((0.95, 2.05, 0.08), (wx - 0.15, -1.1, 1.82), m='板') for v in f.verts})
    bmesh.ops.rotate(mb.bm, cent=Vector((wx - 0.15, -1.1, 1.82)), matrix=Matrix.Rotation(-0.35, 3, 'Y'), verts=vs)
    for k in range(5):
        c = Vector((wx - 0.2, -2.0 + k * 0.45, 1.88))
        vs = list({v for f in mb.box((1.0, 0.44, 0.05), c, m='屋根_苔' if k == 1 else '屋根') for v in f.verts})
        bmesh.ops.rotate(mb.bm, cent=c, matrix=Matrix.Rotation(-0.38, 3, 'Y'), verts=vs)
    # 雨水の樽（正面の東の角）と植木鉢
    bx, by = W2 + 0.15, -D2 - 0.45
    mb.cyl(0.32, 0.36, 0.45, (bx, by, 0), m='板', seg=10); mb.cyl(0.36, 0.32, 0.45, (bx, by, 0.45), m='板', seg=10)
    for z in (0.12, 0.45, 0.8): mb.cyl(0.365, 0.365, 0.05, (bx, by, z), m='鉄', seg=10)
    mb.cyl(0.3, 0.3, 0.02, (bx, by, 0.86), m='水', seg=10)
    for (px, py, cl) in ((-1.08, -D2 - 0.45, '花_桃'), (-1.42, -D2 - 0.3, '花_黄'), (1.12, -D2 - 0.45, '花_白')):
        mb.cyl(0.14, 0.18, 0.28, (px, py, 0), m='素焼き', seg=8)
        mb.blob(0.2, (px, py, 0.38), scale=(1, 1, 0.8), m='低木', sub=1, amp=0.3, seed=px * 9, shade=('低木', '低木', '低木_明'))
        for k in range(4): mb.blob(0.05, (px + rnd.uniform(-0.12, 0.12), py + rnd.uniform(-0.12, 0.12), 0.5), m=cl, sub=0, amp=0.1)
    # 角を這う蔦（正面の東の角から屋根へ）
    for k in range(26):
        t = k / 25
        p = Vector((W2 + 0.05 + rnd.uniform(-0.05, 0.12), -D2 - 0.03 + rnd.uniform(-0.1, 0.25) + t * 0.2, 0.3 + t * 2.4))
        p.x -= max(0, t - 0.6) * 1.6
        mb.blob(0.14 + rnd.uniform(0, 0.06), p, scale=(1, 0.7, 1), m='蔦', sub=1, amp=0.4, seed=k * 3.3, shade=('葉_暗', '蔦', '葉_明'))
    # 軒先の苔
    for k in range(14):
        x = rnd.uniform(-W2 - OG + 0.2, W2 + OG - 0.2)
        if abs(x) < DW + 0.4: continue
        mb.blob(0.16, (x, -D2 - OV + 0.25, WH - RH * OV / D2 + 0.32), scale=(1.8, 1.0, 0.4), m='屋根_苔', sub=1, amp=0.3, seed=k * 1.7)
    me = mb.mesh('小屋')
    return me

# ---------------------------------------------------------------------------
# 庭
# ---------------------------------------------------------------------------
def build_path():
    rnd = random.Random(21); mb = MB(rnd)
    L = path_len(); n = int(L / 0.52)
    for i in range(n):
        p, d = path_pt((i + 0.5) / n)
        side = Vector((-d.y, d.x))
        if i * 0.52 > L - 3.2: break
        for k in ((-0.38, 0.0), (0.36, 0.26)) if i % 2 == 0 else ((0.0, 0.0),):
            if rnd.random() < 0.12: continue
            q = p + side * (k[0] + rnd.uniform(-0.08, 0.08)) + d * k[1] * 0.3
            r = rnd.uniform(0.26, 0.4)
            fs = mb.cyl(r, r * 0.92, 0.07, (q.x, q.y, -0.01), rot=(0, 0, rnd.random() * 3), m='敷石' if rnd.random() < 0.7 else '敷石_暗', seg=7, jit=0.035,
                        scale=(rnd.uniform(0.85, 1.25), rnd.uniform(0.7, 1.0), 1))
        # 縁の小石
        if i % 3 == 1 and rnd.random() < 0.7:
            for s in (-1, 1):
                q = p + side * s * rnd.uniform(0.85, 1.05)
                mb.blob(rnd.uniform(0.07, 0.12), (q.x, q.y, 0.02), scale=(1.3, 1, 0.6), m='敷石_暗', sub=0, amp=0.2)
    # 井戸への飛び石
    pts = [Vector(p) for p in ((-1.3, -5.3), (-5.4, -5.7), (-7.5, -3.9), (-8.4, -0.9))]
    stones = []
    for i in range(len(pts) - 1):
        n = max(1, int((pts[i + 1] - pts[i]).length / 0.75))
        stones += [pts[i].lerp(pts[i + 1], (k + 0.5) / n) for k in range(n)]
    for k, q in enumerate(stones):
        q = q + Vector((math.sin(k * 1.3) * 0.15, math.cos(k * 1.7) * 0.15))
        mb.cyl(0.28, 0.26, 0.06, (q.x, q.y, -0.01), rot=(0, 0, rnd.random() * 3), m='敷石', seg=7, jit=0.03)
    return mb.mesh('小道')

def fence_posts(a, b, step=1.15):
    a, b = Vector(a), Vector(b); n = max(1, round((b - a).length / step))
    return [a.lerp(b, k / n) for k in range(n + 1)]

def build_fence():
    rnd = random.Random(31); mb = MB(rnd); segs = []
    runs = [((-FENCE_X, FENCE_Y), (-1.05, FENCE_Y)), ((1.05, FENCE_Y), (FENCE_X, FENCE_Y)),
            ((-FENCE_X, FENCE_Y), (-FENCE_X, 2.4)), ((FENCE_X, FENCE_Y), (FENCE_X, 2.4)),
            ((-FENCE_X, 2.4), (-4.5, 2.4)), ((FENCE_X, 2.4), (4.6, 2.4))]
    for a, b in runs:
        ps = fence_posts(a, b)
        for p in ps:
            h = rnd.uniform(0.95, 1.12)
            mb.box((0.12, 0.12, h), (p.x, p.y, h / 2 - 0.05), rot=(rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), rnd.uniform(0, 0.3)), m='木組み', bevel=0.02)
            mb.cyl(0.075, 0.01, 0.1, (p.x, p.y, h - 0.06), m='木組み', seg=4)
        for i in range(len(ps) - 1):
            for z in (0.38, 0.78):
                mb.plank(ps[i].to_3d() + Vector((0, 0, z + rnd.uniform(-0.04, 0.04))), ps[i + 1].to_3d() + Vector((0, 0, z + rnd.uniform(-0.04, 0.04))), 0.07, 0.11, m='板_明' if rnd.random() < 0.5 else '板', jit=0.008)
        segs.append((a, b))
    # 門: 薔薇のアーチと、内へ開いた木戸
    for s in (-1, 1):
        mb.box((0.14, 0.14, 2.3), (s * 1.0, FENCE_Y, 1.1), m='木組み', bevel=0.02)
    for k in range(8):
        a0, a1 = math.pi * k / 8, math.pi * (k + 1) / 8
        p0 = Vector((math.cos(a0) * 1.0, FENCE_Y, 2.2 + math.sin(a0) * 0.55)); p1 = Vector((math.cos(a1) * 1.0, FENCE_Y, 2.2 + math.sin(a1) * 0.55))
        mb.beam(p0, p1, 0.12, m='木組み', w=0.14)
    for k in range(34):
        t = k / 33
        if t < 0.3:   p = Vector((-1.0, FENCE_Y, 0.3 + t / 0.3 * 1.9))
        elif t < 0.7: a = math.pi * (1 - (t - 0.3) / 0.4); p = Vector((math.cos(a) * 1.0, FENCE_Y, 2.2 + math.sin(a) * 0.55))
        else:         p = Vector((1.0, FENCE_Y, 2.2 - (t - 0.7) / 0.3 * 1.9))
        p += Vector((rnd.uniform(-0.12, 0.12), rnd.uniform(-0.15, 0.15), rnd.uniform(-0.08, 0.08)))
        mb.blob(0.17, p, scale=(1, 1, 0.85), m='葉', sub=1, amp=0.35, seed=k * 2.1, shade=('葉_暗', '葉', '葉_明'))
        if rnd.random() < 0.65:
            mb.blob(0.07, p + Vector((rnd.uniform(-0.1, 0.1), -0.14, rnd.uniform(-0.05, 0.1))), m='薔薇' if rnd.random() < 0.7 else '花_白', sub=0, amp=0.15)
    for s in (-1, 1):
        hinge = Vector((s * 0.93, FENCE_Y + 0.05, 0)); ang = s * 1.15
        for k in range(4):
            u = 0.12 + k * 0.2
            q = hinge + Vector((-s * math.cos(ang) * u, math.sin(abs(ang)) * u, 0))
            mb.box((0.08, 0.04, 0.85), (q.x, q.y, 0.48), rot=(0, 0, -ang), m='板_明')
        for z in (0.3, 0.72):
            q = hinge + Vector((-s * math.cos(ang) * 0.42, math.sin(abs(ang)) * 0.42, z))
            mb.box((0.84, 0.05, 0.08), q, rot=(0, 0, -ang * 1.0 * 1), m='板')
    return mb.mesh('柵'), segs

def flower_clump(rnd, col, kind='花'):
    mb = MB(rnd)
    if kind == 'ラベンダー':
        for k in range(7):
            a, r = rnd.random() * 6.28, rnd.uniform(0, 0.18)
            p = Vector((math.cos(a) * r, math.sin(a) * r, 0))
            tilt = (rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), 0)
            mb.cyl(0.015, 0.012, 0.3, p, rot=tilt, m='茎', seg=3)
            top = p + Euler(tilt).to_matrix() @ Vector((0, 0, 0.3))
            mb.cyl(0.045, 0.01, 0.22, top, rot=tilt, m='ラベンダー', seg=4)
        mb.blob(0.17, (0, 0, 0.06), scale=(1, 1, 0.5), m='低木', sub=1, amp=0.3, seed=rnd.random() * 9)
        return mb.mesh('ラベンダー')
    mb.blob(0.2, (0, 0, 0.08), scale=(1.15, 1.15, 0.6), m='茎', sub=1, amp=0.35, seed=rnd.random() * 9, shade=('低木', '茎', '低木_明'))
    for k in range(6):
        a, r = k / 6 * 6.28 + rnd.random() * 0.5, rnd.uniform(0.05, 0.19)
        p = Vector((math.cos(a) * r, math.sin(a) * r, rnd.uniform(0.15, 0.24)))
        mb.blob(0.065 + rnd.uniform(0, 0.02), p, scale=(1.2, 1.2, 0.7), m=col, sub=0, amp=0.15)
    return mb.mesh('花_' + col)

def shrub(rnd, seed, light=False):
    mb = MB(rnd)
    for k in range(3):
        a = k * 2.1 + rnd.random()
        mb.blob(0.42 - k * 0.06, (math.cos(a) * 0.22, math.sin(a) * 0.22, 0.36 - k * 0.03), scale=(1, 1, 0.82), m='低木', sub=1, amp=0.32, seed=seed + k,
                shade=('葉_暗', '低木', '低木_明'))
    if light:
        for k in range(6):
            a = rnd.random() * 6.28
            mb.blob(0.06, (math.cos(a) * 0.45, math.sin(a) * 0.45, 0.45 + rnd.uniform(0, 0.25)), m='花_白', sub=0, amp=0.1)
    return mb.mesh('低木')

def build_beds():
    # 花壇: 土の盛り（低い箱）を敷き、花の株を並べる。株は種類ごとに1つの形を共有する（リンク複製）
    rnd = random.Random(41); mb = MB(rnd)
    beds = [(-5.6, -1.4, -3.9, 1.6), (1.4, 5.6, -3.9, 1.6), (-3.1, -0.9, 2.45, 3.05), (0.9, 3.1, 2.45, 3.05)]  # x0, x1, y0, y1
    for x0, x1, y0, y1 in beds:
        mb.box((x1 - x0, y1 - y0, 0.16), ((x0 + x1) / 2, (y0 + y1) / 2, 0.0), m='土', jit=0.03, bevel=0.06)
    soil = mb.mesh('花壇の土'); place(soil, '花壇の土', '庭')
    kinds = {c: flower_clump(random.Random(i * 7 + 3), c) for i, c in enumerate(['花_桃', '花_黄', '花_白', '花_紫', '花_橙', '花_青', '薔薇'])}
    lav = flower_clump(random.Random(99), None, 'ラベンダー')
    for bi, (x0, x1, y0, y1) in enumerate(beds):
        y = y0 + 0.25
        while y < y1 - 0.15:
            x = x0 + 0.25 + rnd.uniform(0, 0.2)
            while x < x1 - 0.15:
                # 花壇の中を色の帯に分ける（同じ色がまとまって咲く）
                if bi >= 2: me = lav
                else:
                    zone = noise.noise(Vector((x * 0.55, y * 0.55, bi * 3.0)))
                    names = list(kinds)
                    me = kinds[names[int((zone + 1) * 3.5 + bi) % len(names)]]
                if dist_path(x, y) > 1.15:
                    place(me, '花', '庭', (x + rnd.uniform(-0.08, 0.08), y + rnd.uniform(-0.08, 0.08), 0.07), rz=rnd.random() * 6.28, s=rnd.uniform(0.95, 1.35))
                x += rnd.uniform(0.5, 0.62)
            y += rnd.uniform(0.48, 0.58)
    return beds

def build_garden_props():
    rnd = random.Random(51)
    # 低木（家の角と柵の角）
    sh = [shrub(random.Random(k), k * 5.0, light=k == 2) for k in range(3)]
    for k, (x, y, s) in enumerate([(-3.9, 2.7, 1.25), (3.9, 2.75, 1.15), (-6.15, -4.1, 1.1), (6.15, -4.05, 1.15), (-6.2, 1.9, 1.0), (6.2, 1.9, 1.05),
                                   (-1.65, -4.25, 0.8), (1.7, -4.3, 0.85), (-5.0, 3.6, 1.2)]):
        place(sh[k % 3], '低木', '庭', (x, y, 0), rz=rnd.random() * 6.28, s=s, col='circle', r=0.6 * s)
    # 井戸
    mb = MB(rnd); wx, wy = WELL
    for ring in range(3):
        n = 11
        for k in range(n):
            a = (k + ring * 0.5) / n * 6.2832
            mb.box((0.42, 0.28, 0.26), (math.cos(a) * 0.78, math.sin(a) * 0.78, 0.13 + ring * 0.25), rot=(0, 0, a + math.pi / 2), m='石壁_明' if rnd.random() < 0.3 else '石壁', jit=0.02, bevel=0.035)
    mb.cyl(0.64, 0.64, 0.05, (0, 0, 0.55), m='水', seg=12)
    for s in (-1, 1): mb.box((0.13, 0.13, 2.0), (s * 0.85, 0, 1.0), m='木組み', bevel=0.02)
    mb.cyl(0.08, 0.08, 1.9, (-0.95, 0, 1.55), rot=(0, math.pi / 2, 0), m='板', seg=6)
    mb.cyl(0.015, 0.015, 0.75, (0, 0, 0.82), m='茎', seg=4)
    mb.cyl(0.13, 0.15, 0.2, (0, 0, 0.62), m='板', seg=8)
    for s in (-1, 1):
        c = Vector((0, s * 0.4, 2.15))
        vs = list({v for f in mb.box((2.1, 0.95, 0.07), c, m='板') for v in f.verts})
        bmesh.ops.rotate(mb.bm, cent=c, matrix=Matrix.Rotation(-s * 0.6, 3, 'X'), verts=vs)
        for k in range(3):
            c2 = Vector((0, s * (0.18 + k * 0.27), 2.35 - k * 0.17))
            vs = list({v for f in mb.box((2.15, 0.34, 0.05), c2, m='屋根_苔' if (k + s) % 3 == 0 else '屋根', jit=0.01) for v in f.verts})
            bmesh.ops.rotate(mb.bm, cent=c2, matrix=Matrix.Rotation(-s * 0.6, 3, 'X'), verts=vs)
    mb.cyl(0.12, 0.12, 2.15, (-1.07, 0, 2.48), rot=(0, math.pi / 2, 0), m='屋根_暗', seg=6)
    place(mb.mesh('井戸'), '井戸', '庭', (wx, wy, 0), rz=0.2, col='circle', r=1.1)
    # ベンチ（井戸の脇、南向き）
    mb = MB(rnd)
    for k in range(3): mb.box((1.5, 0.13, 0.05), (0, -0.14 + k * 0.14, 0.45), m='板_明' if k % 2 else '板', jit=0.005)
    for k in range(2): mb.box((1.5, 0.05, 0.13), (0, 0.2, 0.68 + k * 0.18), m='板')
    for s in (-1, 1):
        mb.box((0.08, 0.38, 0.45), (s * 0.62, 0, 0.22), m='木組み')
        mb.box((0.07, 0.07, 0.95), (s * 0.62, 0.21, 0.47), m='木組み')
    place(mb.mesh('ベンチ'), 'ベンチ', '庭', (-8.3, 2.95, 0), rz=-0.25, col='circle', r=0.8)
    # かぼちゃ畑
    mb = MB(rnd); px, py = PUMPKINS
    mb.box((2.6, 1.9, 0.12), (0, 0, 0.0), m='土', jit=0.03, bevel=0.05)
    for k in range(7):
        a, r = rnd.random() * 6.28, rnd.uniform(0.2, 0.8)
        p = Vector((math.cos(a) * r * 1.2, math.sin(a) * r * 0.8, 0.0)); s = rnd.uniform(0.18, 0.3)
        for j in range(6):
            b = j / 6 * 6.28
            mb.blob(s * 0.6, p + Vector((math.cos(b) * s * 0.42, math.sin(b) * s * 0.42, s * 0.72)), scale=(1, 1, 1.2), m='南瓜', sub=1, amp=0.05)
        mb.cyl(0.03, 0.02, 0.12, p + Vector((0, 0, s * 1.35)), rot=(0.3, 0, 0), m='木組み', seg=5)
        mb.blob(0.22, p + Vector((s + 0.15, 0.1, 0.08)), scale=(1.2, 1, 0.35), m='低木', sub=1, amp=0.3, seed=k)
    place(mb.mesh('かぼちゃ畑'), 'かぼちゃ畑', '庭', (px, py, 0), rz=0.15)
    # 角灯の柱（小道沿い）
    mb = MB(rnd)
    mb.box((0.14, 0.14, 2.1), (0, 0, 1.05), m='木組み', bevel=0.02)
    mb.box((0.5, 0.07, 0.07), (0.22, 0, 2.0), m='木組み')
    mb.beam((0.0, 0, 1.7), (0.3, 0, 1.98), 0.05, m='木組み')
    mb.box((0.03, 0.03, 0.16), (0.42, 0, 1.9), m='鉄')
    mb.box((0.18, 0.18, 0.24), (0.42, 0, 1.68), m='発光_灯')
    mb.cyl(0.16, 0.02, 0.12, (0.42, 0, 1.8), rot=(0, 0, math.pi / 4), m='鉄', seg=4)
    mb.box((0.22, 0.22, 0.04), (0.42, 0, 1.55), m='鉄')
    mb.cyl(0.18, 0.2, 0.2, (0, 0, 0), m='石壁', seg=7, jit=0.02)
    post = mb.mesh('角灯の柱')
    for k, (x, y) in enumerate(LANTERNS):
        rz = 0.0 if x < 0 else math.pi
        place(post, '角灯の柱', '庭', (x, y, 0), rz=rz, col='circle', r=0.3)
        marker(f'mark_light_post{k}', (x + math.cos(rz) * 0.42, y + math.sin(rz) * 0.42, 1.68), 'light')
    marker('mark_waypoint', (WAYPOINT[0], WAYPOINT[1], 0), 'waypoint')

# ---------------------------------------------------------------------------
# 周りの森（樹木・岩・下草）
# ---------------------------------------------------------------------------
def broadleaf(seed, H):
    rnd = random.Random(seed); mb = MB(rnd)
    lean = rnd.uniform(-0.3, 0.3)
    trunk = lambda t: Vector((math.sin(t * 2.2 + seed) * 0.3 + lean * t * t, math.cos(t * 1.7 + seed) * 0.18, t * H))
    mb.tube(trunk, lambda t: 0.42 * (1 - t * 0.55) + max(0, 0.14 - t) * 2.6, 9, 8, '幹')
    for k in range(5):
        a, L = k / 5 * 6.2832 + rnd.random(), rnd.uniform(1.0, 1.5)
        mb.tube(lambda t, a=a, L=L: Vector((math.cos(a) * t * L, math.sin(a) * t * L, 0.4 * (1 - t) ** 2 - 0.05)), lambda t: 0.17 * (1 - t) + 0.02, 4, 5, '幹_暗')
    tips = [trunk(1)]
    for k in range(5 + rnd.randrange(2)):
        t0 = rnd.uniform(0.45, 0.8); b = trunk(t0); a = k / 5.5 * 6.2832 + rnd.random() * 0.6; L = rnd.uniform(1.5, 2.3)
        pth = lambda t, b=b, a=a, L=L: b + Vector((math.cos(a) * t * L, math.sin(a) * t * L, t * L * 0.65))
        mb.tube(pth, lambda t: 0.15 * (1 - t * 0.7), 4, 5, '幹_暗')
        tips += [pth(1), pth(0.6)]
    for k, tp in enumerate(tips):
        for j in range(1 + rnd.randrange(2) + (k == 0)):
            s = rnd.uniform(0.95, 1.35) * (1.2 if k == 0 else 1)
            c = tp + Vector((rnd.uniform(-0.8, 0.8), rnd.uniform(-0.8, 0.8), rnd.uniform(-0.1, 0.6)))
            mb.blob(1.0, c, scale=(s * 1.15, s * 1.15, s * 0.8), rot=(rnd.random(), rnd.random(), rnd.random() * 6.28), m='葉', sub=1, amp=0.3, freq=1.6,
                    seed=seed * 13 + k * 5 + j, shade=('葉_暗', '葉', '葉_明'))
    return mb.mesh(f'広葉樹_{seed}')

def conifer(seed, H):
    rnd = random.Random(seed); mb = MB(rnd)
    mb.cyl(0.3, 0.12, H * 0.5, (0, 0, -0.1), m='幹', seg=7, jit=0.02)
    tiers = 5
    for i in range(tiers):
        t = i / tiers; z = H * (0.18 + t * 0.66); r = (1 - t) * H * 0.26 + 0.35
        fs = mb.cyl(r, 0.05, H * 0.32, (rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08), z), rot=(rnd.uniform(-0.06, 0.06), rnd.uniform(-0.06, 0.06), rnd.random() * 6.28),
                    m='針葉', seg=9, jit=0.09)
        for f in fs:
            if f.normal.z > 0.55 and rnd.random() < 0.5: f.material_index = mb.mi('針葉_明')
        # 下の縁をぎざぎざに（裾の頂点を交互に下げる）
        vs = sorted({v for f in fs for v in f.verts}, key=lambda v: v.co.z)[:9]
        for k, v in enumerate(vs): v.co.z -= 0.18 if k % 2 else 0.0
    return mb.mesh(f'針葉樹_{seed}')

def birch(seed, H):
    rnd = random.Random(seed); mb = MB(rnd)
    trunk = lambda t: Vector((math.sin(t * 2.0 + seed) * 0.15, math.cos(t * 1.5 + seed) * 0.1, t * H))
    mb.tube(trunk, lambda t: 0.2 * (1 - t * 0.5) + max(0, 0.1 - t) * 1.2, 8, 7, '白樺')
    for k in range(9):
        t = rnd.uniform(0.08, 0.8); p = trunk(t); a = rnd.random() * 6.28
        mb.box((0.16, 0.05, 0.06), p + Vector((math.cos(a) * 0.17, math.sin(a) * 0.17, 0)), rot=(0, 0, a + math.pi / 2), m='白樺_斑')
    tips = []
    for k in range(4):
        b = trunk(rnd.uniform(0.55, 0.85)); a = k / 4 * 6.28 + rnd.random(); L = rnd.uniform(0.9, 1.4)
        pth = lambda t, b=b, a=a, L=L: b + Vector((math.cos(a) * t * L, math.sin(a) * t * L, t * L * 0.8))
        mb.tube(pth, lambda t: 0.07 * (1 - t * 0.6), 3, 4, '白樺')
        tips.append(pth(1))
    tips.append(trunk(1))
    for k, tp in enumerate(tips):
        for j in range(2):
            s = rnd.uniform(0.6, 0.85)
            mb.blob(1.0, tp + Vector((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), rnd.uniform(0, 0.5))), scale=(s, s, s * 1.15), m='葉_明', sub=1, amp=0.3,
                    seed=seed * 7 + k * 3 + j, shade=('葉', '葉_明', '葉_明'))
    return mb.mesh(f'白樺_{seed}')

def rock(seed, size=1.0):
    rnd = random.Random(seed); mb = MB(rnd)
    fs = mb.blob(size, (0, 0, size * 0.25), scale=(rnd.uniform(1.0, 1.4), rnd.uniform(0.8, 1.1), rnd.uniform(0.55, 0.8)), m='岩', sub=2, amp=0.22, freq=1.1, seed=seed)
    vs = list({v for f in fs for v in f.verts})
    cut = [(Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.2, 1))).normalized(), size * rnd.uniform(0.55, 0.75)) for _ in range(5)] + [(Vector((0, 0, -1)), 0.0)]
    for n, d in cut:
        for v in vs:
            s = (v.co - Vector((0, 0, size * 0.25))).dot(n) if n.z > -0.9 else -v.co.z
            if n.z <= -0.9:
                if v.co.z < -0.08: v.co.z = -0.08
            elif s > d: v.co -= n * (s - d)
    for f in fs:
        f.material_index = mb.mi('苔') if f.normal.z > 0.6 and rnd.random() < 0.85 else mb.mi('岩_暗') if f.normal.z < -0.1 else mb.mi('岩')
    return mb.mesh(f'岩_{seed}')

def fern(seed):
    rnd = random.Random(seed); mb = MB(rnd)
    n = 6
    for k in range(n):
        a = k / n * 6.28 + rnd.uniform(-0.2, 0.2); L = rnd.uniform(0.55, 0.8); rise = rnd.uniform(0.45, 0.65)
        prev = Vector((0, 0, 0.02))
        for i in range(1, 4):
            t = i / 3
            p = Vector((math.cos(a) * L * t, math.sin(a) * L * t, rise * math.sin(t * math.pi * 0.75) * L + 0.02))
            w = 0.15 * math.sin(t * math.pi * 0.8 + 0.3) + 0.03
            mb.plank(prev, p, w * 2, 0.025, m='シダ' if i % 2 else 'シダ_明')
            prev = p
    return mb.mesh(f'シダ_{seed}')

def mushrooms(seed, glow=False):
    rnd = random.Random(seed); mb = MB(rnd)
    for k in range(3 if not glow else 1):
        p = Vector((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0)); h = rnd.uniform(0.14, 0.3); r = h * 0.75
        mb.cyl(0.03, 0.025, h, p, m='キノコ_白', seg=5)
        mb.cyl(r, 0.02, r * 0.75, p + Vector((0, 0, h - 0.02)), m='発光_妖精' if glow else 'キノコ_赤', seg=8)
    return mb.mesh('キノコ' + ('_光' if glow else ''))

def log_and_stump(rnd):
    mb = MB(rnd)
    mb.tube(lambda t: Vector((t * 4.2 - 2.1, math.sin(t * 2) * 0.15, 0.32)), lambda t: 0.34 - t * 0.06, 6, 8, '幹')
    mb.cyl(0.28, 0.28, 0.02, (-2.12, 0.0, 0.32), rot=(0, -math.pi / 2, 0), m='木口', seg=8)
    for k in range(8):
        mb.blob(0.2, (rnd.uniform(-1.8, 1.8), rnd.uniform(-0.1, 0.1), 0.6), scale=(1.8, 1.0, 0.45), m='苔', sub=1, amp=0.3, seed=k)
    mb.tube(lambda t: Vector((0.6 + t * 0.5, 0.25 + t * 0.6, 0.45 + t * 0.5)), lambda t: 0.08 * (1 - t * 0.6), 3, 5, '幹_暗')
    log = mb.mesh('倒木')
    mb = MB(rnd)
    mb.cyl(0.42, 0.36, 0.5, (0, 0, -0.05), m='幹', seg=9, jit=0.03)
    mb.cyl(0.36, 0.36, 0.02, (0, 0, 0.45), m='木口', seg=9)
    for k in range(4):
        a = k / 4 * 6.28 + 0.4
        mb.tube(lambda t, a=a: Vector((math.cos(a) * (0.3 + t * 0.5), math.sin(a) * (0.3 + t * 0.5), 0.15 * (1 - t))), lambda t: 0.12 * (1 - t) + 0.02, 3, 5, '幹_暗')
    mb.blob(0.14, (0.15, 0.1, 0.48), scale=(1.4, 1, 0.4), m='苔', sub=1, amp=0.3)
    return log, mb.mesh('切り株')

def build_forest():
    rnd = random.Random(61)
    trees = [('広葉樹', broadleaf(s, h), 0.5) for s, h in ((3, 5.4), (8, 6.2), (14, 5.0), (21, 6.6))] + \
            [('針葉樹', conifer(s, h), 0.38) for s, h in ((4, 7.5), (9, 8.6), (17, 6.8))] + [('白樺', birch(5, 6.2), 0.25)]
    spots = []
    def free(x, y, r):
        if near_house(x, y, 1.6) or in_garden(x, y, 2.0) or dist_path(x, y) < 3.4: return False
        if math.hypot(x - WELL[0], y - WELL[1]) < 3.2 or math.hypot(x - PUMPKINS[0], y - PUMPKINS[1]) < 2.8: return False
        if math.hypot(x - FAIRY[0], y - FAIRY[1]) < 2.6 or math.hypot(x - WAYPOINT[0], y - WAYPOINT[1]) < 3.0: return False
        return all(math.hypot(x - q[0], y - q[1]) > r + q[2] for q in spots)
    # 内側の輪（エリアの中・木と木の間を通れる）と外側（輪郭の外で、森を厚くする）
    for ring, (lo, hi, n, gap) in enumerate(((0.62, 0.95, 26, 1.5), (0.98, 1.45, 36, 1.3))):
        placed, tries = 0, 0
        while placed < n and tries < 3000:
            tries += 1
            a = rnd.random() * 6.2832; f = rnd.uniform(lo, hi); r = bound(a) * f
            x, y = math.sin(a) * r, math.cos(a) * r     # ang_of(x, y) = atan2(x, y) と同じ向き
            if not free(x, y, gap) or (y < -5.0 and rel(x, y) < 0.86 and abs(x) < 9.0): continue
            kind = rnd.random()
            t = trees[rnd.randrange(4)] if kind < 0.5 else trees[4 + rnd.randrange(3)] if kind < 0.88 else trees[7]
            s = rnd.uniform(0.85, 1.3) * (1.1 if ring else 1)
            spots.append((x, y, gap + 0.6 * s))
            inside = rel(x, y) < 1.02
            place(t[1], t[0], '森', (x, y, 0), rz=rnd.random() * 6.28, s=s, **({'col': 'circle', 'r': round(t[2] * s + 0.15, 2)} if inside else {}))
            placed += 1
    # 岩
    rocks = [rock(s, sz) for s, sz in ((2, 0.9), (6, 1.2), (12, 0.7), (19, 1.0))]
    for x, y, s in [(-6.8, -10.5, 1.0), (5.6, -9.6, 0.8), (9.6, 4.2, 1.3), (-11.5, 5.6, 1.1), (3.4, 13.4, 1.4), (-4.2, 12.6, 0.9),
                    (12.6, -6.4, 1.0), (-13.4, -3.8, 0.9), (-2.4, -13.0, 0.6), (2.6, -12.6, 0.7), (8.0, 9.8, 0.8), (-8.4, 10.6, 1.2),
                    (-11.4, -1.4, 0.5), (11.2, 0.6, 0.6)]:
        place(rocks[int(abs(x * 7 + y)) % 4], '岩', '森', (x, y, 0), rz=rnd.random() * 6.28, s=s, col='circle', r=round(1.0 * s, 2))
    # 倒木と切り株
    log, stump = log_and_stump(rnd)
    place(log, '倒木', '森', (10.4, 7.4, 0), rz=0.5, col='box', w=4.4, d=0.8)
    for x, y in ((-7.2, 7.2), (6.8, -7.8), (-11.0, -6.2)): place(stump, '切り株', '森', (x, y, 0), rz=rnd.random() * 6.28, s=rnd.uniform(0.8, 1.1), col='circle', r=0.5)
    # 下草: シダ・低木・キノコ（木の根元と、森の縁に寄せる）
    ferns = [fern(s) for s in (1, 2, 3)]; bushes = [shrub(random.Random(70 + k), 70.0 + k * 3) for k in range(2)]; mush = mushrooms(7)
    n_f = 0
    for (x, y, _) in spots:
        for k in range(rnd.randrange(1, 4)):
            a, r = rnd.random() * 6.28, rnd.uniform(0.9, 2.0)
            px, py = x + math.cos(a) * r, y + math.sin(a) * r
            if near_house(px, py, 0.5) or in_garden(px, py, 0.6) or dist_path(px, py) < 1.6: continue
            pick = rnd.random()
            if pick < 0.55: place(ferns[rnd.randrange(3)], 'シダ', '森', (px, py, 0), rz=rnd.random() * 6.28, s=rnd.uniform(0.8, 1.4)); n_f += 1
            elif pick < 0.85: place(bushes[rnd.randrange(2)], '低木', '森', (px, py, 0), rz=rnd.random() * 6.28, s=rnd.uniform(0.8, 1.3))
            else: place(mush, 'キノコ', '森', (px, py, 0), rz=rnd.random() * 6.28, s=rnd.uniform(0.8, 1.3))
    # 小道の両脇のシダ（入口を森の切れ目に見せる）
    for k in range(14):
        p, d = path_pt(rnd.uniform(0.55, 0.95)); side = Vector((-d.y, d.x)) * (1 if k % 2 else -1)
        q = p + side * rnd.uniform(1.4, 2.4)
        if in_garden(q.x, q.y, 0.4) or math.hypot(q.x - WAYPOINT[0], q.y - WAYPOINT[1]) < 1.6: continue
        place(ferns[k % 3], 'シダ', '森', (q.x, q.y, 0), rz=rnd.random() * 6.28, s=rnd.uniform(0.9, 1.3))
    # 妖精の輪: 淡く光るキノコの輪
    glow = mushrooms(8, glow=True)
    for k in range(11):
        a = k / 11 * 6.28 + rnd.uniform(-0.1, 0.1)
        place(glow, '光るキノコ', '森', (FAIRY[0] + math.cos(a) * 1.35, FAIRY[1] + math.sin(a) * 1.15, 0), rz=rnd.random() * 6.28, s=rnd.uniform(0.8, 1.3))
    marker('mark_fairy', (FAIRY[0], FAIRY[1], 0.4), 'fairy')

def build_preview():
    # .blend とプレビュー画像のための地面と光（書き出さない）
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=60, y_segments=60, size=34)
    for v in bm.verts:
        r = rel(v.co.x, v.co.y)
        v.co.z = max(0, r - 1.0) * 0.6 * bound(ang_of(v.co.x, v.co.y)) if r > 1 else 0
    me = bpy.data.meshes.new('地面'); bm.to_mesh(me); bm.free()
    me.materials.append(mat('芝')); me.materials.append(mat('土'))
    for p in me.polygons:
        c = p.center
        if dist_path(c.x, c.y) < 0.9: p.material_index = 1
    ob = bpy.data.objects.new('地面', me); coll('プレビュー').objects.link(ob)
    sun = bpy.data.lights.new('日差し', 'SUN'); sun.energy = 3.2; sun.color = (1.0, 0.9, 0.75); sun.angle = 0.08
    so = bpy.data.objects.new('日差し', sun); so.rotation_euler = (math.radians(52), math.radians(-18), math.radians(-35)); coll('プレビュー').objects.link(so)
    for ob in coll('目印').objects:
        if ob.get('mark') == 'light':
            L = bpy.data.lights.new('灯り', 'POINT'); L.energy = 60; L.color = (1.0, 0.75, 0.4); L.shadow_soft_size = 0.2
            lo = bpy.data.objects.new('灯り', L); lo.location = ob.location; coll('プレビュー').objects.link(lo)
    win = bpy.data.lights.new('窓の灯り', 'POINT'); win.energy = 120; win.color = (1.0, 0.72, 0.38)
    wo = bpy.data.objects.new('窓の灯り', win); wo.location = (HX, FRONT - 0.6, 1.9); coll('プレビュー').objects.link(wo)
    world = bpy.data.worlds.new('空'); bpy.context.scene.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.55, 0.72, 0.85, 1); bg.inputs['Strength'].default_value = 0.9
    cams = {'俯瞰': ((-7.5, -23.0, 19.0), (0.4, 0.6, 0.6), 34), '正面': ((3.4, -10.5, 3.2), (0.0, 4.0, 2.5), 50), 'ゲーム視点': ((0.0, -13.0, 12.0), (0.0, -3.0, 1.2), 50)}
    for name, (loc, tgt, fl) in cams.items():
        cd = bpy.data.cameras.new(name); cd.lens = fl
        co = bpy.data.objects.new(name, cd); co.location = loc
        d = Vector(tgt) - Vector(loc); co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        coll('プレビュー').objects.link(co)
    bpy.context.scene.camera = bpy.data.objects['俯瞰']

# ---------------------------------------------------------------------------
# 書き出し
# ---------------------------------------------------------------------------
def game_xz(x, y): return round(x, 3), round(-y, 3)

def write_layout(beds):
    cols = []
    for ob in bpy.data.objects:
        k = ob.get('col')
        if not k: continue
        x, z = game_xz(ob.location.x, ob.location.y); s = ob.scale.x
        if k == 'circle': cols.append({'x': x, 'z': z, 'r': round(ob['col_r'], 2)})
        else:
            w, d = ob['col_w'] * s, ob['col_d'] * s
            cols.append({'x': x, 'z': z, 'r': round(math.hypot(w, d) / 2, 2), 'box': {'x': x, 'z': z, 'w': round(w, 2), 'd': round(d, 2), 'ry': round(ob.rotation_euler.z, 4)}})
    marks = {}
    for ob in coll('目印').objects:
        if not ob.get('mark'): continue
        x, z = game_xz(ob.location.x, ob.location.y)
        marks.setdefault(ob['mark'], []).append([x, round(ob.location.z, 2), z])
    cols.sort(key=lambda c: (c['z'], c['x']))
    data = {
        'model': 'blender/cottage_glade.glb',
        'colliders': cols,
        'path': [list(game_xz(x, y)) for x, y in PATH],
        'beds': [[round(x0, 2), round(-y1, 2), round(x1, 2), round(-y0, 2)] for x0, x1, y0, y1 in beds],  # x0, z0, x1, z1
        'lights': marks.get('light', []), 'smoke': marks.get('smoke', []), 'fairy': marks.get('fairy', []),
        'waypoint': {'x': marks['waypoint'][0][0], 'z': marks['waypoint'][0][2]},
    }
    path = os.path.join(C.repo_root(), 'public', 'shared', 'glade-layout.js')
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    body = body.replace('},{', '},\n    {').replace('"colliders":[', '"colliders":[\n    ').replace('],"path"', '\n  ],\n  "path"')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('// 自動生成: tools/blender/cottage_glade.py（Blender で配置を変えたら書き出し直す。手で直さない）\n')
        f.write('// 森の小屋の一角（f1_glade）の当たり判定・小道・花壇・明かり。座標はゲームの x・z（m）\n')
        f.write('export const GLADE = ' + body + ';\n')
    print('書き出し:', path, len(cols), '個の当たり判定')

def export_glb(objs, name):
    out = os.path.join(C.repo_root(), 'public', 'assets', 'models', 'blender', name + '.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT', export_cameras=False, export_lights=False)
    print('書き出し:', out, os.path.getsize(out) // 1024, 'KB')

def export_all(beds):
    scene_objs = [o for c in ('小屋', '庭', '森') for o in COLL[c].objects]
    export_glb(scene_objs, 'cottage_glade')
    # 小屋だけ（原点を底の中心へ寄せて書き出し、元に戻す）
    house = bpy.data.objects['小屋']; keep = house.location.copy(); house.location = (0, 0, 0)
    export_glb([house], 'cottage'); house.location = keep
    C.add_manifest('blender/cottage.glb', '建物', 1.0)
    write_layout(beds)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in scene_objs)
    print('三角形の数（配置したぶん）:', tris)

def render_previews():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 40; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 1280, 800; sc.view_settings.view_transform = 'AgX'
    try: sc.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError: pass
    out_dir = os.path.join(C.repo_root(), 'docs', 'glade', 'toon')
    os.makedirs(out_dir, exist_ok=True)
    for cam, fn in (('俯瞰', 'blender-overview.png'), ('正面', 'blender-front.png')):
        sc.camera = bpy.data.objects[cam]; sc.render.filepath = os.path.join(out_dir, fn)
        bpy.ops.render.render(write_still=True); print('描画:', sc.render.filepath)
    sc.camera = bpy.data.objects['俯瞰']

def load_existing():
    for c in bpy.data.collections: COLL[c.name] = c
    return [tuple(b) for b in json.loads(bpy.context.scene.get('glade_beds', '[]'))]

def main():
    if '--export-only' in ARGS:
        beds = load_existing()
    else:
        C.reset_scene()
        bpy.context.scene.unit_settings.system = 'METRIC'
        place(build_cottage(), '小屋', '小屋', (HX, HY, 0), col='box', w=HW + 1.9, d=HD + 0.5)
        place(build_path(), '小道', '庭')
        fence, segs = build_fence()
        place(fence, '柵', '庭')
        for a, b in segs:
            a, b = Vector(a), Vector(b); c = (a + b) / 2; d = b - a
            o = bpy.data.objects.new('柵の当たり', None); o.location = (c.x, c.y, 0.5); o.rotation_euler = (0, 0, math.atan2(d.y, d.x))
            o['col'] = 'box'; o['col_w'] = d.length + 0.2; o['col_d'] = 0.3; o.empty_display_type = 'CUBE'; o.empty_display_size = 0.2
            coll('目印').objects.link(o)
        for s in (-1, 1):
            o = bpy.data.objects.new('門柱の当たり', None); o.location = (s * 1.0, FENCE_Y, 0.5); o['col'] = 'circle'; o['col_r'] = 0.25
            coll('目印').objects.link(o)
        o = bpy.data.objects.new('樽の当たり', None); o.location = (HX + HW / 2 + 0.15, HY - HD / 2 - 0.45, 0.4); o['col'] = 'circle'; o['col_r'] = 0.45
        coll('目印').objects.link(o)
        beds = build_beds()
        bpy.context.scene['glade_beds'] = json.dumps(beds)
        build_garden_props()
        build_forest()
        build_preview()
    export_all(beds)
    blend = os.path.join(C.repo_root(), 'tools', 'blender', 'cottage_glade.blend')
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    print('保存:', blend)
    if '--render' in ARGS: render_previews()

if __name__ == '__main__':  # RO3 風の比較版（cottage_glade_ro3.py）は部品として読み込む
    main()
