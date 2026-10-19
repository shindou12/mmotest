# 森の家（RO風: public/ro-cottage.html）の細かい形を Blender で作る: コテージの飾り（瓦・石・蔦・金具）と、庭や道の小物
#   実行: blender -b -P tools/blender/ro_props.py
#   作るもの: public/assets/models/blender/ro-props.glb / tools/blender/ro_props.blend
#   - 色は頂点の色（線形の小数）。材質は場面のコードが付ける（MeshLambertMaterial + 頂点の色。RO風の背景は Lambert でやわらかく塗る）
#   - 角は面取り（ベベル）し、なめらかな陰影。溝・継ぎ目・足元の陰（AO）を Cycles で焼いて頂点の色に掛ける
#   - cot_*: コテージの飾り。座標はコテージの中（実験場のコテージと同じ寸法: 幅 7・奥行 5.4・壁 3.1・土台 0.6、three.js の Y 上を Blender の Z 上へ直したもの）。
#            場面はコテージと同じ行列（位置・向き・0.75 倍）で置く
#   - prop_*: 小物。原点は底の中心。場面が地面の高さに置く
import os, math, random
import bpy, bmesh
from mathutils import Vector, Matrix, Euler, noise

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'models', 'blender', 'ro-props.glb')
BLEND = os.path.join(ROOT, 'tools', 'blender', 'ro_props.blend')

def lin(h):
    c = [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
def jit(h, rnd, k=0.08):
    c = lin(h); f = 1 + rnd.uniform(-k, k); return [min(1, x * f) for x in c]

class K:
    # 形を溜める入れ物（bmesh、頂点の色つき）
    def __init__(self, seed=1):
        self.bm = bmesh.new(); self.col = self.bm.loops.layers.color.new('Col'); self.rnd = random.Random(seed)
    def paint(self, verts, c):
        for f in {f for v in verts for f in v.link_faces}:
            for l in f.loops: l[self.col] = (*c, 1)
    def box(self, size, loc, rot=(0, 0, 0), c=(1, 1, 1), bevel=0.0):
        vs = bmesh.ops.create_cube(self.bm, size=1)['verts']
        bmesh.ops.transform(self.bm, matrix=Matrix.Diagonal((*size, 1)), verts=vs)
        if bevel:
            es = list({e for v in vs for e in v.link_edges})
            r = bmesh.ops.bevel(self.bm, geom=vs + es, offset=min(bevel, min(size) * 0.4), offset_type='OFFSET', segments=2, profile=0.6, affect='EDGES', clamp_overlap=True)
            vs = [v for v in set(vs) | {v for f in r['faces'] for v in f.verts} if v.is_valid]
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4(), verts=vs)
        self.paint(vs, c); return vs
    def cyl(self, r1, r2, h, loc, rot=(0, 0, 0), c=(1, 1, 1), seg=12, sc=(1, 1, 1), caps=True):
        vs = bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r1, radius2=max(r2, 1e-3), depth=h)['verts']
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*sc, 1)) @ Matrix.Translation((0, 0, h / 2)), verts=vs)
        self.paint(vs, c); return vs
    def ball(self, r, loc, sc=(1, 1, 1), c=(1, 1, 1), sub=2, rough=0.0, seed=0):
        vs = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r)['verts']
        if rough:
            off = Vector((seed * 3.1, seed * 1.7, seed * 0.7))
            for v in vs: v.co *= 1 + noise.noise(v.co / r * 1.8 + off) * rough
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation(Vector(loc)) @ Matrix.Diagonal((*sc, 1)), verts=vs)
        self.paint(vs, c); return vs
    def beam(self, a, b, w, t, c=(1, 1, 1), bevel=0.0):
        a, b = Vector(a), Vector(b); d = b - a; q = d.to_track_quat('Z', 'Y')
        vs = bmesh.ops.create_cube(self.bm, size=1)['verts']
        bmesh.ops.transform(self.bm, matrix=Matrix.Diagonal((w, t, d.length, 1)), verts=vs)
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4(), verts=vs)
        self.paint(vs, c); return vs
    def leaf(self, p, d, side, L, W, c):
        p, d, side = Vector(p), Vector(d).normalized(), Vector(side).normalized(); up = d.cross(side)
        pts = [p, p + d * L * 0.45 + side * W / 2 + up * W * 0.1, p + d * L, p + d * L * 0.45 - side * W / 2 + up * W * 0.1]
        vs = [self.bm.verts.new(x) for x in pts]
        f = self.bm.faces.new(vs)
        for l in f.loops: l[self.col] = (*c, 1)
        return vs
    def obj(self, name, coll, loc=(0, 0, 0), three_local=False, smooth_angle=40):
        if three_local:   # three.js（Y 上・Z 手前）→ Blender（Z 上・-Y 手前）
            bmesh.ops.transform(self.bm, matrix=Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))), verts=self.bm.verts)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(name); self.bm.to_mesh(me); self.bm.free()
        for p in me.polygons: p.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(smooth_angle))
        ob = bpy.data.objects.new(name, me); coll.objects.link(ob); ob.location = loc
        return ob

def collection(n):
    c = bpy.data.collections.new(n); bpy.context.scene.collection.children.link(c); return c

# ---------------------------------------------------------------------------
# コテージの飾り（コテージの中の座標。three.js の向き: x 右・y 上・z 正面）
# ---------------------------------------------------------------------------
W, D, H, BASE = 7.0, 5.4, 3.1, 0.6
PITCH = 0.95; HALF = D / 2 + 0.9; RISE = math.tan(PITCH) * (D / 2)
ROOF = [0xd8865a, 0xcc7a50, 0xe09466, 0xc47450, 0xdc8c5e]   # コードの屋根（0xc4764e）より少し明るく（瓦の段の陰で暗くなる分）

def lerp(a, b, t): return a + (b - a) * t
def roof_y(t): return BASE + H - 0.35 + lerp(-0.6, RISE + 0.25, t) - math.sin(math.pi * t) * 0.25

def cot_roof(k):
    # 大屋根の瓦: 軒からむねへ、丸みのある瓦を互い違いに並べる。軒先の列は少し反らせる
    rnd = k.rnd
    for s in (-1, 1):
        rows = 22
        for i in range(rows):
            t0, t1 = i / rows, (i + 1) / rows; tm = (t0 + t1) / 2
            z0, z1 = s * lerp(HALF, 0, t0), s * lerp(HALF, 0, t1); y0, y1 = roof_y(t0), roof_y(t1)
            dz, dy = z1 - z0, y1 - y0; L = math.hypot(dz, dy)
            n = Vector((0, dz, -dy)).normalized() if s > 0 else Vector((0, -dz, dy)).normalized()
            if n.y < 0: n = -n
            base = Vector((0, (y0 + y1) / 2, (z0 + z1) / 2)) + n * 0.17
            cols = int((W + 1.4) / 0.3)
            for j in range(cols):
                x = -(W + 1.4) / 2 + (j + 0.5 + (0.5 if i % 2 else 0)) * (W + 1.4) / cols
                if abs(x) > (W + 1.4) / 2 - 0.1: continue
                c = jit(ROOF[rnd.randrange(len(ROOF))], rnd, 0.1)
                if i < 2 and rnd.random() < 0.3: c = jit(0x8a9a4a, rnd)   # 軒先に少し苔
                p = base + Vector((x, 0, 0))
                vs = k.cyl(0.17, 0.16, L * 1.35, (0, 0, 0), c=c, seg=7, sc=(1, 0.38, 1))   # 隣と重なる幅（すき間から下地の暗さが見えない）
                ang = math.atan2(dy, dz)   # 斜面の向き（YZ 平面）
                M = Matrix.Translation(p) @ Matrix.Rotation(-(ang - math.pi / 2) if True else 0, 4, 'X') @ Matrix.Translation((0, 0, -L * 0.6))
                bmesh.ops.transform(k.bm, matrix=M, verts=vs)
    # むねの瓦
    for j in range(26):
        x = -(W + 1.6) / 2 + (j + 0.5) * (W + 1.6) / 26
        k.cyl(0.21, 0.21, (W + 1.6) / 26 + 0.03, (x - (W + 1.6) / 52, roof_y(1) + 0.28, 0), rot=(0, math.pi / 2, 0), c=jit(0x8a4a32, k.rnd), seg=8)

def cot_tower(k):
    # 丸い塔: 石積み（ずらして積む）と、帽子の屋根の板（輪ごと）、てっぺんの飾りの台
    rnd = k.rnd; T = Vector((-W / 2 - 0.3, 0, D / 2 - 0.6))
    for row in range(15):
        y = 0.18 + row * 0.36; r = lerp(1.5, 1.35, y / 5.4) + 0.03; n = 18
        for j in range(n):
            a = (j + (0.5 if row % 2 else 0)) / n * 6.2832
            p = T + Vector((math.sin(a) * r, y, math.cos(a) * r))
            k.box((0.5, 0.32, 0.18), p, rot=(0, a, 0), c=jit(0xb4ac9c, rnd, 0.12), bevel=0.05)
    prof = [(1.9, -0.12), (1.95, 0), (1.55, 0.25), (1.05, 1.2), (0.6, 2.4), (0.25, 3.4), (0.01, 4.2)]
    def r_at(h):
        for (r0, h0), (r1, h1) in zip(prof[1:], prof[2:]):
            if h0 <= h <= h1: return lerp(r0, r1, (h - h0) / (h1 - h0))
        return 0.0
    hatM = Matrix.Translation(T + Vector((0, 5.4, 0))) @ Euler((0.06, 0, 0.13)).to_matrix().to_4x4()
    hv = []
    for i in range(16):
        h = 0.05 + i * 0.22; r = r_at(h) + 0.05
        if r < 0.15: break
        n = max(6, int(r * 6.2832 / 0.28))
        for j in range(n):
            a = (j + (0.5 if i % 2 else 0)) / n * 6.2832
            c = jit(ROOF[rnd.randrange(len(ROOF))], rnd, 0.1)
            slope = math.atan2(0.22, max(0.01, r_at(h) - r_at(h + 0.22)))
            vs = k.box((0.36, 0.05, 0.4), (0, 0, 0), c=c, bevel=0.015)
            M = Matrix.Translation(Vector((math.sin(a) * r, h, math.cos(a) * r))) @ Matrix.Rotation(a, 4, 'Y') @ Matrix.Rotation(slope - math.pi / 2, 4, 'X')
            bmesh.ops.transform(k.bm, matrix=M, verts=vs); hv += vs
    k.cyl(0.32, 0.3, 0.16, (0, 4.05, 0), rot=(-math.pi / 2, 0, 0), c=jit(0x4a4a52, rnd), seg=10)
    hv += [v for v in k.bm.verts if v.co.y > 4.0 and v.co.y < 4.3 and abs(v.co.x) < 0.4 and abs(v.co.z) < 0.4 and v not in hv]
    bmesh.ops.transform(k.bm, matrix=hatM, verts=list(set(hv)))
    # 塔を這う蔦（正面側）
    for i in range(140):
        a = rnd.uniform(-0.9, 0.6); y = rnd.uniform(0.2, 3.8) * (1 - abs(a) * 0.4)
        p = T + Vector((math.sin(a) * 1.52, y, math.cos(a) * 1.52))
        out = Vector((math.sin(a), 0, math.cos(a)))
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-0.3, 1), 0)).normalized(); d = (d - out * d.dot(out)).normalized()
        k.leaf(p, d, out.cross(d), 0.2, 0.15, jit([0x5a8a2a, 0x7aa83a, 0x4a7a26][i % 3], rnd, 0.12))

def cot_walls(k):
    # 土台の石（4面に2段）と煙突の石、扉の金具
    rnd = k.rnd
    for face in range(4):
        L = (W + 0.4) if face < 2 else (D + 0.4); s = 1 if face % 2 else -1
        for row in range(2):
            y = 0.15 + row * 0.3; x = -L / 2 + (0.2 if row else 0)
            while x < L / 2:
                w = rnd.uniform(0.35, 0.6); xa, xb = max(x, -L / 2), min(x + w, L / 2)
                if xb - xa > 0.15:
                    u = (xa + xb) / 2
                    p = (u, y, s * ((D + 0.4) / 2 + 0.03)) if face < 2 else (s * ((W + 0.4) / 2 + 0.03), y, u)
                    if not (face == 1 and abs(u + 0.6) < 0.9):   # 戸口の前の段は除く
                        k.box(((xb - xa - 0.04) if face < 2 else 0.14, 0.27, 0.14 if face < 2 else (xb - xa - 0.04)), p, c=jit(0x9c968a, rnd, 0.14), bevel=0.04)
                x += w
    ch = Vector((W / 2 - 1.2, 0, -0.9))
    for row in range(10):
        y = BASE + H - 0.3 + row * 0.34
        for side in range(4):
            a = side * math.pi / 2
            for j in range(2):
                off = (j - 0.5) * 0.45 + (0.1 if row % 2 else -0.1)
                p = ch + Vector((math.sin(a) * 0.47 + math.cos(a) * off, y, math.cos(a) * 0.47 - math.sin(a) * off))
                k.box((0.42, 0.3, 0.12), p, rot=(0, a, 0), c=jit(0x8a7a6a, rnd, 0.14), bevel=0.035)
    fz = D / 2 + 0.05
    for yy in (BASE + 0.35, BASE + 1.25):   # 扉の蝶番
        k.box((0.9, 0.07, 0.03), (-0.75, yy, fz + 0.1), c=lin(0x2e2a28), bevel=0.01)
        for j in range(4): k.ball(0.025, (-1.05 + j * 0.2, yy, fz + 0.12), c=lin(0x6a6050), sub=1)

# ---------------------------------------------------------------------------
# 小物（原点は底の中心。Blender の Z 上）
# ---------------------------------------------------------------------------
def p_well(k):
    rnd = k.rnd
    for row in range(3):
        n = 13
        for j in range(n):
            a = (j + row * 0.5) / n * 6.2832
            k.box((0.42, 0.26, 0.24), (math.cos(a) * 0.82, math.sin(a) * 0.82, 0.12 + row * 0.24), rot=(0, 0, a + math.pi / 2), c=jit(0xa8a294, rnd, 0.14), bevel=0.04)
    k.cyl(0.7, 0.7, 0.04, (0, 0, 0.5), c=lin(0x3a6a8a), seg=20)
    for s in (-1, 1): k.box((0.12, 0.12, 2.0), (s * 0.9, 0, 1.0), c=jit(0x6a4a2e, rnd), bevel=0.02)
    k.cyl(0.07, 0.07, 1.9, (-0.95, 0, 1.55), rot=(0, math.pi / 2, 0), c=lin(0x7a5a3a), seg=8)
    k.cyl(0.012, 0.012, 0.8, (0, 0, 0.75), c=lin(0xc8b080), seg=4)
    k.cyl(0.13, 0.15, 0.22, (0, 0, 0.55), c=lin(0x8a6a42), seg=10)
    for s in (-1, 1):
        for j in range(4):
            vs = k.box((2.2, 0.32, 0.05), (0, s * (0.16 + j * 0.26), 2.28 - j * 0.15), c=jit(ROOF[j % 4], rnd, 0.1), bevel=0.015)
            bmesh.ops.rotate(k.bm, cent=Vector((0, s * (0.16 + j * 0.26), 2.28 - j * 0.15)), matrix=Matrix.Rotation(-s * 0.55, 3, 'X'), verts=vs)
    k.cyl(0.1, 0.1, 2.25, (-1.12, 0, 2.42), rot=(0, math.pi / 2, 0), c=lin(0x7a4a32), seg=8)

def p_bench(k):
    rnd = k.rnd
    for j in range(3): k.box((1.5, 0.14, 0.05), (0, -0.15 + j * 0.15, 0.45), c=jit(0x9a7048, rnd), bevel=0.015)
    for j in range(2): k.box((1.5, 0.05, 0.12), (0, 0.24, 0.7 + j * 0.18), c=jit(0x9a7048, rnd), bevel=0.015)
    for s in (-1, 1):
        k.box((0.08, 0.4, 0.44), (s * 0.62, 0, 0.22), c=lin(0x5a3e28), bevel=0.015)
        k.box((0.07, 0.07, 0.98), (s * 0.62, 0.25, 0.49), c=lin(0x5a3e28), bevel=0.015)

def p_barrel(k):
    # 樽: ふくらんだ胴を1つの形で（板を重ねると継ぎ目が全部陰になって黒く見える）、たがは開いた輪、上はふた
    rnd = k.rnd; n = 18
    prof = [(0.0, 0.31), (0.15, 0.345), (0.45, 0.375), (0.75, 0.345), (0.9, 0.31)]
    rings = []
    for z, r in prof:
        rings.append([k.bm.verts.new((math.cos(j / n * 6.2832) * r, math.sin(j / n * 6.2832) * r, z)) for j in range(n)])
    for a, b in zip(rings[:-1], rings[1:]):
        for j in range(n):
            f = k.bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
            c = jit(0x9a6c40 if j % 2 else 0x8a6038, rnd, 0.05)
            for l in f.loops: l[k.col] = (*c, 1)
    for ring, z in ((rings[0], 0.0), (rings[-1], 0.9)):
        f = k.bm.faces.new(ring if z else list(reversed(ring)))
        for l in f.loops: l[k.col] = (*lin(0xa88050), 1)
    for z in (0.12, 0.45, 0.78):
        r = 0.31 + 0.065 * math.sin(math.pi * z / 0.9) + 0.012
        k.cyl(r, r, 0.05, (0, 0, z - 0.025), c=lin(0x5a5048), seg=20, caps=False)

def p_crates(k):
    rnd = k.rnd
    for (x, y, z, s, r) in ((0, 0, 0, 0.7, 0.2), (0.75, 0.1, 0, 0.6, -0.15), (0.3, 0.05, 0.7, 0.55, 0.5)):
        cx, cy = x, y
        vs = k.box((s, s, s), (cx, cy, z + s / 2), c=jit(0xa8804e, rnd), bevel=0.02)
        for e in (-1, 1):
            k.box((s + 0.03, 0.06, 0.08), (cx, cy - s / 2 - 0.01, z + s / 2 + e * (s / 2 - 0.05)), c=lin(0x6a4a2a), bevel=0.01)
            k.box((0.06, s + 0.03, 0.08), (cx + s / 2 + 0.01, cy, z + s / 2 + e * (s / 2 - 0.05)), c=lin(0x6a4a2a), bevel=0.01)
        k.beam((cx - s / 2, cy - s / 2 - 0.02, z + 0.06), (cx + s / 2, cy - s / 2 - 0.02, z + s - 0.06), 0.06, 0.03, c=lin(0x6a4a2a))

def p_sacks(k):
    rnd = k.rnd
    for (x, y, s) in ((0, 0, 1.0), (0.45, 0.2, 0.85), (0.2, -0.35, 0.8)):
        k.ball(0.32 * s, (x, y, 0.3 * s), sc=(1, 0.85, 1.05), c=jit(0xc8b088, rnd), sub=3, rough=0.12, seed=x * 10)
        k.cyl(0.08 * s, 0.05 * s, 0.14 * s, (x, y, 0.6 * s), c=jit(0xb09870, rnd), seg=8)

def p_pot(k, flower=0xff7a9a):
    rnd = k.rnd
    k.cyl(0.18, 0.24, 0.36, (0, 0, 0), c=jit(0xc06a44, rnd), seg=14); k.cyl(0.25, 0.25, 0.06, (0, 0, 0.33), c=jit(0xb05e3a, rnd), seg=14)
    k.cyl(0.2, 0.2, 0.02, (0, 0, 0.38), c=lin(0x4a3422), seg=12)
    for j in range(16):
        a = j / 16 * 6.28 + rnd.random(); r = rnd.uniform(0.02, 0.2)
        p = Vector((math.cos(a) * r, math.sin(a) * r, 0.4))
        k.leaf(p, (math.cos(a), math.sin(a), rnd.uniform(0.3, 0.9)), (-math.sin(a), math.cos(a), 0), 0.2, 0.1, jit(0x5a9a30, rnd, 0.15))
    for j in range(7):
        a = rnd.random() * 6.28; r = rnd.uniform(0, 0.15)
        k.ball(0.05, (math.cos(a) * r, math.sin(a) * r, 0.52 + rnd.uniform(0, 0.08)), sc=(1, 1, 0.6), c=jit(flower, rnd), sub=1)

def p_signpost(k):
    rnd = k.rnd
    k.cyl(0.07, 0.08, 1.9, (0, 0, 0), c=jit(0x9a7450, rnd), seg=8)
    for (h, ang, w) in ((1.55, 0.4, 0.85), (1.2, -0.6, 0.75)):
        vs = k.box((w, 0.05, 0.2), (w / 2 - 0.05, 0, h), c=jit(0xd4ac74, rnd), bevel=0.015)
        tip = k.box((0.16, 0.05, 0.16), (w - 0.03, 0, h), rot=(0, math.pi / 4, 0), c=jit(0xd4ac74, rnd), bevel=0.01)
        bmesh.ops.rotate(k.bm, cent=Vector((0, 0, h)), matrix=Matrix.Rotation(ang, 3, 'Z'), verts=vs + tip)
    k.cyl(0.1, 0.01, 0.12, (0, 0, 1.9), c=lin(0x5a3e28), seg=8)

def p_laundry(k):
    rnd = k.rnd
    for s in (-1, 1):
        k.box((0.09, 0.09, 1.9), (s * 1.6, 0, 0.95), c=jit(0x6a4a2e, rnd), bevel=0.015)
        k.box((0.5, 0.07, 0.07), (s * 1.6, 0, 1.85), c=jit(0x6a4a2e, rnd))
    pts = [Vector((-1.6 + 3.2 * t, 0, 1.8 - math.sin(math.pi * t) * 0.18)) for t in (i / 12 for i in range(13))]
    for a, b in zip(pts[:-1], pts[1:]): k.beam(a, b, 0.015, 0.015, c=lin(0xd8d0b8))
    for (t, w, h, col) in ((0.22, 0.55, 0.7, 0xf4f0e6), (0.5, 0.45, 0.5, 0x8ab0d8), (0.76, 0.6, 0.45, 0xe8a0a8)):
        x = -1.6 + 3.2 * t; z = 1.8 - math.sin(math.pi * t) * 0.18
        bm0 = len(k.bm.verts)
        vs = k.box((w, 0.02, h), (x, 0, z - h / 2), c=jit(col, rnd, 0.05))
        for v in vs: v.co.y += math.sin((v.co.x - x) * 6) * 0.04 + (z - v.co.z) * 0.08
        k.ball(0.025, (x - w / 2 + 0.05, 0, z), c=lin(0x8a6a42), sub=1); k.ball(0.025, (x + w / 2 - 0.05, 0, z), c=lin(0x8a6a42), sub=1)

def p_wheelbarrow(k):
    rnd = k.rnd
    vs = k.box((0.75, 0.55, 0.32), (0, 0, 0.5), c=jit(0x8a6a42, rnd), bevel=0.03)
    for v in vs:
        if v.co.z > 0.5: v.co.x *= 1.15; v.co.y *= 1.12
    k.box((0.6, 0.42, 0.06), (0, 0, 0.62), c=lin(0x6a4a2a))
    for j in range(5): k.ball(0.11, (rnd.uniform(-0.2, 0.2), rnd.uniform(-0.12, 0.12), 0.66), c=jit(0xe08a2a, rnd), sub=2)
    k.cyl(0.24, 0.24, 0.07, (0.55, 0, 0.24), rot=(math.pi / 2, 0, 0), c=lin(0x5a4030), seg=16)
    for s in (-1, 1):
        k.beam((0.5, s * 0.2, 0.25), (-0.95, s * 0.28, 0.55), 0.05, 0.05, c=jit(0x6a4a2e, rnd))
        k.box((0.05, 0.05, 0.36), (-0.25, s * 0.2, 0.18), c=jit(0x6a4a2e, rnd))

def p_vegbed(k):
    rnd = k.rnd; Lx, Ly = 2.2, 1.0
    for s in (-1, 1):
        k.box((Lx, 0.08, 0.3), (0, s * Ly / 2, 0.15), c=jit(0x8a6038, rnd), bevel=0.02)
        k.box((0.08, Ly, 0.3), (s * Lx / 2, 0, 0.15), c=jit(0x8a6038, rnd), bevel=0.02)
    k.box((Lx - 0.08, Ly - 0.08, 0.04), (0, 0, 0.26), c=lin(0x4a3422))
    for i in range(5):
        for j in range(2):
            x, y = -Lx / 2 + 0.25 + i * 0.42, -0.22 + j * 0.44
            if (i + j) % 2:
                k.ball(0.15, (x, y, 0.38), sc=(1, 1, 0.8), c=jit(0x8ac060, rnd), sub=2, rough=0.15, seed=i * 3 + j)
            else:
                for m in range(5):
                    a = m / 5 * 6.28
                    k.leaf((x, y, 0.28), (math.cos(a) * 0.3, math.sin(a) * 0.3, 1), (-math.sin(a), math.cos(a), 0), 0.25, 0.06, jit(0x5aa030, rnd))
                k.cyl(0.035, 0.01, 0.06, (x, y, 0.24), c=lin(0xe0782a), seg=6)

def p_stump(k):
    rnd = k.rnd
    k.cyl(0.42, 0.36, 0.5, (0, 0, -0.05), c=jit(0x6a4e34, rnd), seg=12)
    k.cyl(0.36, 0.36, 0.02, (0, 0, 0.44), c=lin(0xc8a070), seg=12)
    for j in range(5):
        a = j / 5 * 6.28 + 0.3
        k.beam((math.cos(a) * 0.3, math.sin(a) * 0.3, 0.12), (math.cos(a) * 0.75, math.sin(a) * 0.75, -0.05), 0.16, 0.12, c=jit(0x5e4430, rnd))
    for j in range(4):
        a = rnd.uniform(-0.8, 0.8) + 1.0; h = rnd.uniform(0.1, 0.22); x, y = math.cos(a) * 0.5, math.sin(a) * 0.5
        k.cyl(0.03, 0.025, h, (x, y, 0), c=lin(0xf0e8d8), seg=6)
        k.ball(0.09, (x, y, h), sc=(1, 1, 0.55), c=jit(0xd8584a, rnd), sub=2)
    k.box((0.06, 0.4, 0.12), (0.05, 0, 0.6), rot=(0.3, 0, 0), c=lin(0x7a5232))   # 斧の柄
    k.box((0.2, 0.04, 0.14), (0.05, -0.12, 0.47), c=lin(0x8a8c94), bevel=0.01)

def p_log(k):
    rnd = k.rnd
    k.cyl(0.28, 0.25, 2.6, (-1.3, 0, 0.26), rot=(0, math.pi / 2, 0), c=jit(0x6a4e34, rnd), seg=12)
    k.cyl(0.27, 0.27, 0.02, (-1.31, 0, 0.26), rot=(0, math.pi / 2, 0), c=lin(0xc8a070), seg=12)
    for j in range(7):
        k.ball(0.16, (-1.1 + j * 0.35, rnd.uniform(-0.06, 0.06), 0.48), sc=(1.6, 1.0, 0.35), c=jit(0x6a9a34, rnd), sub=2, rough=0.2, seed=j)

def p_lantern(k):
    rnd = k.rnd
    k.cyl(0.08, 0.1, 2.3, (0, 0, 0), c=lin(0x3a2a1e), seg=8)
    k.cyl(0.18, 0.2, 0.15, (0, 0, 0), c=lin(0x8a8478), seg=8)
    k.box((0.75, 0.07, 0.07), (0.3, 0, 2.25), c=lin(0x3a2a1e), bevel=0.01)
    k.beam((0.0, 0, 1.95), (0.45, 0, 2.22), 0.04, 0.04, c=lin(0x3a2a1e))
    for s in (-1, 1):
        for t in (-1, 1): k.box((0.03, 0.03, 0.34), (0.6 + s * 0.12, t * 0.12, 1.98), c=lin(0x2a2420))
    k.cyl(0.24, 0.02, 0.18, (0.6, 0, 2.15), c=lin(0x2a2420), seg=4, rot=(0, 0, math.pi / 4))
    k.box((0.3, 0.3, 0.05), (0.6, 0, 1.8), c=lin(0x2a2420), bevel=0.01)

def p_fence(k):
    rnd = k.rnd   # 2m の素朴な柵（端から端まで）
    for x in (-1.0, 0.0, 1.0):
        k.box((0.12, 0.12, 1.05), (x, 0, 0.5), rot=(rnd.uniform(-0.04, 0.04), rnd.uniform(-0.04, 0.04), rnd.uniform(0, 0.3)), c=jit(0xa08058, rnd), bevel=0.02)
        k.cyl(0.075, 0.01, 0.1, (x, 0, 1.02), c=jit(0xa08058, rnd), seg=4)
    for z in (0.4, 0.82): k.box((2.1, 0.06, 0.11), (0, 0.06, z + rnd.uniform(-0.03, 0.03)), c=jit(0xc49a68, rnd), bevel=0.015)

def p_pumpkins(k):
    rnd = k.rnd
    for (x, y, s) in ((0, 0, 1), (0.45, 0.2, 0.75), (-0.35, 0.3, 0.6)):
        for j in range(8):
            a = j / 8 * 6.28
            k.ball(0.17 * s, (x + math.cos(a) * 0.1 * s, y + math.sin(a) * 0.1 * s, 0.17 * s), sc=(0.8, 0.8, 1.0), c=jit(0xe8862a, rnd, 0.06), sub=2)
        k.cyl(0.03 * s, 0.02 * s, 0.1 * s, (x, y, 0.32 * s), c=lin(0x5a6a2a), seg=6)
        for m in range(3):
            a = rnd.random() * 6.28
            k.leaf((x, y, 0.02), (math.cos(a), math.sin(a), 0.2), (-math.sin(a), math.cos(a), 0), 0.35 * s, 0.3 * s, jit(0x5a9a30, rnd))

def p_wateringcan(k):
    k.cyl(0.15, 0.15, 0.28, (0, 0, 0), c=lin(0x7a9aa8), seg=14)
    k.beam((0.12, 0, 0.08), (0.42, 0, 0.32), 0.04, 0.04, c=lin(0x7a9aa8))
    k.cyl(0.05, 0.035, 0.06, (0.44, 0, 0.32), rot=(0, 1.0, 0), c=lin(0x6a8a98), seg=8)
    k.beam((-0.12, 0, 0.3), (0.06, 0, 0.36), 0.03, 0.03, c=lin(0x6a8a98))

PROPS = {'well': p_well, 'bench': p_bench, 'barrel': p_barrel, 'crates': p_crates, 'sacks': p_sacks, 'pot_pink': lambda k: p_pot(k, 0xff7a9a),
         'pot_yellow': lambda k: p_pot(k, 0xffd84a), 'pot_purple': lambda k: p_pot(k, 0xb88af0), 'signpost': p_signpost, 'laundry': p_laundry,
         'wheelbarrow': p_wheelbarrow, 'vegbed': p_vegbed, 'stump': p_stump, 'log': p_log, 'lantern': p_lantern, 'fence': p_fence,
         'pumpkins': p_pumpkins, 'wateringcan': p_wateringcan}

def densify(ob, step=0.22):
    # 長い辺を分ける（板の角の頂点が隣の板に埋まって、AO が物全体を暗くするのを防ぐ）
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for _ in range(5):
        long = [e for e in bm.edges if e.calc_length() > step]
        if not long: break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
    bm.to_mesh(ob.data); bm.free()

def bake_ao(objs, dist=0.35, k=0.45):
    for ob in objs:
        if ob.name.startswith('prop_') or ob.name == 'cot_walls': densify(ob)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48
    sc.world = bpy.data.worlds.new('空'); sc.world.light_settings.distance = dist
    mat = bpy.data.materials.new('焼く用')
    for ob in objs:
        me = ob.data
        if not me.materials: me.materials.append(mat)
        me.color_attributes.new('AO', 'FLOAT_COLOR', 'CORNER'); me.color_attributes.active_color = me.color_attributes['AO']
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs: ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    for ob in objs:
        me = ob.data; col = me.color_attributes['Col']; ao = me.color_attributes['AO']; n = len(col.data)
        c = [0.0] * (n * 4); a = [0.0] * (n * 4); col.data.foreach_get('color', c); ao.data.foreach_get('color', a)
        for i in range(n):
            t = max(0.0, min(1.0, (0.8 - a[i * 4]) / 0.6)); f = 1 - k * t * t * (3 - 2 * t)
            c[i * 4] *= f; c[i * 4 + 1] *= f ** 1.05; c[i * 4 + 2] *= f ** 1.2
        col.data.foreach_set('color', c); me.color_attributes.remove(ao); me.color_attributes.active_color = col; me.materials.clear()

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    C1, C2 = collection('コテージの飾り'), collection('小物')
    objs = []
    for name, fn in (('cot_roof', cot_roof), ('cot_tower', cot_tower), ('cot_walls', cot_walls)):
        k = K(hash(name) % 1000); fn(k); objs.append(k.obj(name, C1, three_local=True))
    for i, (name, fn) in enumerate(PROPS.items()):
        k = K(i + 7); fn(k); objs.append(k.obj('prop_' + name, C2, loc=((i % 6) * 6.0 + 20, (i // 6) * 6.0, 0)))   # 焼くときに互いの陰が付かないよう離す
    bake_ao(objs)
    for ob in objs: ob.location = (0, 0, 0) if ob.name.startswith('prop_') else ob.location   # 書き出しは原点のまま（場面が置く）
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_materials='NONE', export_vertex_color='ACTIVE', export_cameras=False, export_lights=False)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
    print('書き出し:', OUT, os.path.getsize(OUT) // 1024, 'KB / 三角形', tris, '/', len(objs), '個')
    for i, ob in enumerate(o for o in objs if o.name.startswith('prop_')): ob.location = ((i % 6) * 6.0 + 20, (i // 6) * 6.0, 0)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
    print('保存:', BLEND)

main()
