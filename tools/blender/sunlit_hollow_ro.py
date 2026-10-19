# 陽だまりの森の家（f1_hollow）の RO 風版: 見本（RO3）に寄せて、植物・岩・地面を作り直す
#   実行: blender -b -P tools/blender/sunlit_hollow_ro.py            （プレビュー画像も: 末尾に -- --render）
#   配置・地形・小屋・前庭は sunlit_hollow.py と同じ（同じ関数で作る）。そのうえで、角ばった植物と岩を Blender で作り直した形に入れ替える
#     木:   なめらかな葉の塊（描いた葉のテクスチャ × 奥ほど暗い頂点の色）+ まわりに楓の葉の房（切り抜き）。房の法線は木の外向き → ふんわり明るい
#     針葉樹: 暗い芯の円錐 + 垂れた針葉の小枝（切り抜き）を段に重ねる
#     低木・シダ・草: 葉の塊 + 葉の房 / 反ったシダの葉（帯）/ 細い草の束（帯）
#     岩・岩壁: なめらかな面に描いた岩肌 × 苔の頂点の色
#     地面: 4096 の描いた芝と土の道（RO3 の明るい黄緑と温かい土）
#   作るもの: tools/blender/sunlit_hollow_ro.blend / sunlit_hollow_ro_textures/ / public/assets/models/blender/sunlit_hollow_ro.glb /
#            public/shared/hollow-layout-ro.js（当たり判定・高さは前の版と同じ）/ docs/hollow/ro/*.png
#   前の版（sunlit_hollow.blend / .glb / hollow-layout.js / docs/hollow/*.png）は上書きしない
import os, sys, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) if os.path.exists(__file__) else 'tools/blender')
import importlib
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix, Euler, noise
import sunlit_hollow as B
importlib.reload(B)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ROOT = B.ROOT
B.TEX = os.path.join(ROOT, 'tools', 'blender', 'sunlit_hollow_ro_textures')   # テクスチャもこの版の置き場へ
srgb, lerp3, smooth = B.srgb, B.lerp3, B.smooth

# ---------------------------------------------------------------------------
# テクスチャ（葉・草・シダ・岩肌・地面）
# ---------------------------------------------------------------------------
def leaf_shape(img, cx, cy, ang, L, W, col, lobes=1, light=1.0, vein=True):
    # 葉1枚（lobes=5 で楓のような手のひら形）。img は (H, W, 4)
    H, Wd = img.shape[:2]; r = int(L * 1.2) + 2
    x0, x1, y0, y1 = max(0, int(cx - r)), min(Wd, int(cx + r)), max(0, int(cy - r)), min(H, int(cy + r))
    if x1 <= x0 or y1 <= y0: return
    ys, xs = np.mgrid[y0:y1, x0:x1].astype(np.float32); dx, dy = xs - cx, ys - cy
    inside = np.zeros(xs.shape, bool); shade = np.zeros(xs.shape, np.float32)
    spread = [0.0] if lobes == 1 else [-1.15, -0.55, 0.0, 0.55, 1.15]
    for k, a0 in enumerate(spread):
        a = ang + a0; ll = L * (1.0 if a0 == 0 else 0.78 if abs(a0) < 1 else 0.55)
        u = (dx * math.cos(a) + dy * math.sin(a)) / ll; w = (-dx * math.sin(a) + dy * math.cos(a)) / (W if lobes == 1 else W * 0.55)
        width = np.where((u > 0) & (u < 1), np.sin(np.clip(u, 0, 1) * math.pi) ** 0.75 * (1 - u * 0.35), 0)
        m = (np.abs(w) < width) & (u > 0)
        inside |= m
        sh = (0.62 + 0.5 * u) * (1 - 0.2 * np.abs(w) / np.maximum(width, 1e-3))
        if vein: sh = sh * np.where(np.abs(w) < 0.07, 0.8, 1.0)
        shade = np.where(m, np.maximum(shade, sh), shade)
    c = np.asarray(col, np.float32)[None, None, :] * (shade * light)[..., None]
    reg = img[y0:y1, x0:x1]
    reg[inside, :3] = np.clip(c[inside], 0, 1); reg[inside, 3] = 1.0

def bleed(rgb, a):
    # 切り抜きの縁がにじまないよう、透明な所の色を近くの葉の色で埋める
    m = a > 0.5; out = rgb.copy()
    for _ in range(10):
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(out, dy, 0), dx, 1); shm = np.roll(np.roll(m, dy, 0), dx, 1); g = ~m & shm
            out = np.where(g[..., None], sh, out); m = m | g
    return out

def save_rgba(name, img):
    os.makedirs(B.TEX, exist_ok=True)
    h, w = img.shape[:2]; path = os.path.join(B.TEX, name + '.png')
    im = bpy.data.images.new(name + '_tmp', w, h, alpha=True)
    rgb = bleed(img[..., :3], img[..., 3])
    im.pixels.foreach_set(np.concatenate([np.clip(rgb, 0, 1), img[..., 3:4]], 2).astype(np.float32).ravel())
    im.filepath_raw = path; im.file_format = 'PNG'; im.save(); bpy.data.images.remove(im)
    im = bpy.data.images.load(path); im.name = name; return im

GREENS = [0xb4d84a, 0x94c63c, 0x74ae32, 0x5a962a, 0xd2e660, 0x86bc36]
def atlas_leaves(seed=5):
    # 2×2 のマス: 0 楓の葉の房 / 1 シダの葉 / 2 草の束 / 3 丸い葉の低木の房
    S = 512; img = np.zeros((S * 2, S * 2, 4), np.float32); rng = np.random.default_rng(seed)
    g = [B.hexa(c) for c in GREENS]
    cell = img[:S, :S]   # 楓: 中心から外へ。外の葉ほど明るい（日なた）
    for k in range(70):
        a = rng.random() * 6.2832; d = rng.random() ** 0.6 * S * 0.3
        leaf_shape(cell, S / 2 + math.cos(a) * d, S / 2 + math.sin(a) * d, a + rng.uniform(-0.5, 0.5), rng.uniform(52, 78), rng.uniform(26, 34),
                   g[rng.integers(0, 6)] * rng.uniform(0.85, 1.1), lobes=5, light=0.62 + 0.55 * d / (S * 0.3))
    cell = img[:S, S:]   # シダ: 下から上へ伸びる羽状の葉
    for i in range(46):
        t = i / 46; y = 8 + t * (S - 20); x = S / 2 + math.sin(t * 2.2) * 14
        cell[int(y):int(y) + 4, int(x) - 2:int(x) + 3, :3] = B.hexa(0x4a7a24); cell[int(y):int(y) + 4, int(x) - 2:int(x) + 3, 3] = 1
        span = (1 - t) ** 0.7 * S * 0.4 + 10
        for s in (-1, 1):
            leaf_shape(cell, x, y, math.pi / 2 - s * (math.pi / 2 - 0.45), span, 10, g[(i + (s > 0)) % 6] * (0.8 + 0.3 * t), vein=False)
    cell = img[S:, :S]   # 草: 根元が濃く、先が明るい細い葉
    for k in range(90):
        bx = S / 2 + rng.normal(0, S * 0.12); lean = rng.normal(0, 0.3); h = rng.uniform(0.5, 0.97) * S; col = g[rng.integers(0, 6)]
        for j in range(int(h)):
            t = j / h; x = bx + lean * j + math.sin(t * 2.4) * lean * 24; w = max(1, int(8 * (1 - t) ** 0.8))
            x0 = int(x - w / 2)
            if 0 <= j < S and 0 <= x0 and x0 + w < S:
                cell[j, x0:x0 + w, :3] = col * (0.42 + 0.78 * t); cell[j, x0:x0 + w, 3] = 1
    cell = img[S:, S:]   # 丸い葉の房（低木）
    for k in range(80):
        a = rng.random() * 6.2832; d = rng.random() ** 0.6 * S * 0.32
        leaf_shape(cell, S / 2 + math.cos(a) * d, S / 2 + math.sin(a) * d, a + rng.uniform(-0.6, 0.6), rng.uniform(42, 60), rng.uniform(22, 30),
                   g[rng.integers(0, 6)] * rng.uniform(0.8, 1.05), lobes=1, light=0.6 + 0.55 * d / (S * 0.32))
    return save_rgba('ro_leaves', img)

def atlas_pine(seed=6):
    # 針葉樹の小枝（下の辺が幹側）。1枚の絵
    S = 512; img = np.zeros((S, S, 4), np.float32)
    for i in range(80):
        t = i / 80; y = 6 + t * (S - 14); x = S / 2 + math.sin(t * 1.6) * 8
        img[int(y):int(y) + 3, int(x) - 2:int(x) + 2, :3] = B.hexa(0x4a3a24); img[int(y):int(y) + 3, int(x) - 2:int(x) + 2, 3] = 1
        span = (1 - t * 0.75) * S * 0.38
        for s in (-1, 1):
            col = B.hexa(0x2e6a34) if i % 3 else B.hexa(0x5e9a48)
            leaf_shape(img, x, y, math.pi / 2 - s * 1.2, span, 4.5, col * (0.75 + 0.5 * t), vein=False)
    return save_rgba('ro_pine', img)

def tex_leafmass(seed=7):
    # 葉の塊の地の絵（すき間なく重なった楓の葉。繰り返しても継ぎ目が出ないよう端を回り込ませる）
    S = 512; img = np.zeros((S, S, 4), np.float32); img[..., :3] = B.hexa(0x3a6e20); img[..., 3] = 1
    rng = np.random.default_rng(seed); g = [B.hexa(c) for c in GREENS]
    big = np.zeros((S * 2, S * 2, 4), np.float32); big[..., :3] = B.hexa(0x3a6e20); big[..., 3] = 1
    for k in range(420):
        cx, cy = rng.random() * S, rng.random() * S; a = rng.random() * 6.28
        col = g[rng.integers(0, 6)] * rng.uniform(0.7, 1.0)
        for ox in (0, S):
            for oy in (0, S):
                leaf_shape(big, cx + ox, cy + oy, a, rng.uniform(34, 52), 20, col, lobes=5, light=rng.uniform(0.75, 1.05))
    img = big[S // 2:S // 2 + S, S // 2:S // 2 + S].copy()
    return B.save('ro_leafmass', img[..., :3])

def tex_rock(seed=8):
    # 岩肌: 大きな割れ目・層・細かい粒（色は頂点の色で付けるので明るい灰）
    n = 512; d1, edge, idx = B.cells(n, 26, seed)
    rng = np.random.default_rng(seed); tone = rng.uniform(0.85, 1.08, 26)[idx]
    v = B.vnoise(n, 6, seed + 1, 4)
    img = B.grad(v, [(0, 0xb0aca2), (0.5, 0xd4cfc2), (1, 0xece6d8)]) * tone[..., None]
    img *= (0.72 + 0.28 * np.clip(edge / 6, 0, 1))[..., None]
    strata = (np.sin(np.arange(n)[:, None] / n * 6.28 * 7 + B.vnoise(n, 3, seed + 2, 4) * 5) > 0.93)
    img = np.where(strata[..., None], img * 0.8, img)
    ys, xs = rng.integers(0, n, 12000), rng.integers(0, n, 12000); img[ys, xs] *= rng.uniform(0.8, 1.1, (12000, 1)).astype(np.float32)
    return B.save('ro_rock', img)

def paint_ground(n=4096, half=40.0):
    # 地面: 明るい黄緑の芝（日なたは黄色み、大きな濃淡）、温かい土の道（縁に芝がかぶる・轍）、木の下と崖ぎわは濃く
    s = half * 2 / n; xs = (np.arange(n, dtype=np.float32) + 0.5) * s - half
    X, Y = np.meshgrid(xs, xs)
    v = B.vnoise(n, 7, 201, 5) * 0.55 + B.vnoise(n, 4, 202, 96) * 0.45
    img = B.grad(v, [(0, 0x4a8a1e), (0.3, 0x6aa626), (0.62, 0x92c234), (0.85, 0xb4d444), (1, 0xd0e25a)])
    rng = np.random.default_rng(203)
    for col, cnt, ln, al in ((0xd8ec78, 900000, 7, 0.45), (0x3e7a1a, 700000, 6, 0.4), (0xa8d048, 500000, 5, 0.35)):
        x0 = rng.random(cnt) * n; y0 = rng.random(cnt) * n; a = rng.random(cnt) * 6.28
        for t in range(ln):
            xi = ((x0 + np.cos(a) * t) % n).astype(int); yi = ((y0 + np.sin(a) * t) % n).astype(int)
            img[yi, xi] = img[yi, xi] * (1 - al) + B.hexa(col) * al
    def pd(pts):
        d = np.full((n, n), 1e9, np.float32)
        for (ax_, ay), (bx, by) in zip(pts[:-1], pts[1:]):
            dx, dy = bx - ax_, by - ay
            t = np.clip(((X - ax_) * dx + (Y - ay) * dy) / (dx * dx + dy * dy), 0, 1)
            d = np.minimum(d, np.hypot(ax_ + dx * t - X, ay + dy * t - Y))
        return d
    dirt = B.grad(B.vnoise(n, 6, 204, 24), [(0, 0x9a7240), (0.5, 0xc29a5c), (1, 0xdcb87c)])
    dirt *= (0.92 + 0.12 * B.vnoise(n, 3, 205, 200))[..., None]
    peb = rng.random((n, n)); dirt[peb < 0.01] = B.hexa(0x7a6448); dirt[peb > 0.993] = B.hexa(0xead2a0)
    edge = B.vnoise(n, 5, 206, 36) - 0.5
    for pts, w in B.PATHS:
        d = pd(pts) + edge * 0.8
        rut = 1 - 0.1 * np.exp(-((d - w * 0.45) ** 2) / 0.02)
        k = np.clip((w - d) / 0.5, 0, 1)
        k = k * np.clip(1 - (B.vnoise(n, 3, 207, 140) - 0.5) * 1.6 * (k < 0.97), 0, 1)
        img = img * (1 - k[..., None]) + dirt * rut[..., None] * k[..., None]
    S = np.vectorize(B.cliff_s)(X[::16, ::16], Y[::16, ::16]).astype(np.float32)
    S = np.kron(S, np.ones((16, 16), np.float32))[:n, :n]
    k = np.clip(1 - np.abs(S) / 2.0, 0, 1) * 0.5
    img = img * (1 - k[..., None]) + B.grad(B.vnoise(n, 5, 208, 30), [(0, 0x5e5232), (1, 0x7e8a40)]) * k[..., None]
    ang = np.arctan2(X, Y); sx, sz = B.AREA['ell']; R = B.AREA['R']; dx_, dz_ = np.sin(ang), -np.cos(ang)
    b = 1 / np.sqrt((dx_ / (R * sx)) ** 2 + (dz_ / (R * sz)) ** 2); p1, p2, p3 = B.SHAPE
    b = b * (1 + B.AREA['wob'] * (0.55 * np.sin(3 * ang + p1) + 0.3 * np.sin(5 * ang + p2) + 0.15 * np.sin(8 * ang + p3)))
    k = np.clip((np.hypot(X, Y) / b - 0.95) * 3, 0, 1)[..., None] * 0.55
    img = img * (1 - k) + B.grad(B.vnoise(n, 6, 209, 18), [(0, 0x3a5a1e), (1, 0x6a7a30)]) * k
    return B.save('ro_ground', img)

# ---------------------------------------------------------------------------
# 材質
# ---------------------------------------------------------------------------
def mat_tex_vc(name, im, alpha=False, rough=0.9, double=False, tile=1.0):
    # テクスチャ × 頂点の色（GLB では baseColorTexture と COLOR_0。three.js も同じく掛け合わせる）
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bs.outputs['BSDF'], out.inputs['Surface']); bs.inputs['Roughness'].default_value = rough
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = im
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1
    nt.links.new(tx.outputs['Color'], mx.inputs[6]); nt.links.new(vc.outputs['Color'], mx.inputs[7]); nt.links.new(mx.outputs[2], bs.inputs['Base Color'])
    if alpha:
        rd = nt.nodes.new('ShaderNodeMath'); rd.operation = 'ROUND'
        nt.links.new(tx.outputs['Alpha'], rd.inputs[0]); nt.links.new(rd.outputs[0], bs.inputs['Alpha'])
    m.use_backface_culling = not double
    B.MAT[name] = m; B.TILE[name] = tile
    return m

TEX = {}
def build_materials():
    B.build_materials()   # 小屋・前庭・地形の材質（前の版と同じ作り方。テクスチャはこの版の置き場に描き直す）
    TEX['leaves'] = atlas_leaves(); TEX['pine'] = atlas_pine(); TEX['mass'] = tex_leafmass(); TEX['rock'] = tex_rock()
    mat_tex_vc('カード_葉', TEX['leaves'], alpha=True, double=True)
    mat_tex_vc('カード_針葉', TEX['pine'], alpha=True, double=True)
    mat_tex_vc('葉の塊', TEX['mass'], tile=1.2)
    mat_tex_vc('岩肌', TEX['rock'], tile=2.2)
    g = B.MAT['地面']; tx = next(n for n in g.node_tree.nodes if n.type == 'TEX_IMAGE'); tx.image = paint_ground()

# ---------------------------------------------------------------------------
# 形を積む入れ物: 前の版の部品（B.MB）に「絵を貼った板」と「帯」を足す
# ---------------------------------------------------------------------------
CELL = {'maple': (0.0, 0.0), 'fern': (0.5, 0.0), 'grass': (0.0, 0.5), 'round': (0.5, 0.5)}
class RB(B.MB):
    def card(self, base, right, up, w, h, cell, m='カード_葉', nrm=None, color=(1, 1, 1), bottom=False, uvs=None):
        c = Vector(base); r = Vector(right).normalized() * w / 2; u = Vector(up).normalized() * h
        b = c if bottom else c - u / 2
        vs = [self.bm.verts.new(p) for p in (b - r, b + r, b + r + u, b - r + u)]
        f = self.bm.faces.new(vs); f.material_index = self.mi(m)
        u0, v0, su, sv = (cell[0], cell[1], 0.49, 0.49) if uvs is None else uvs
        for l, (a, bb) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            l[self.uv].uv = (u0 + 0.005 + a * su, v0 + 0.005 + bb * sv); l[self.col] = (*color, 1)
        if nrm is not None:
            self.has_cn = True
            for v in vs: v[self.cn] = Vector(nrm).normalized()
        f[self.fixed] = 1
        return f
    def strip(self, pts, widths, side, cell, m='カード_葉', nrm=(0, 0, 1), colors=None):
        # 曲がった帯（シダの葉・草）。pts に沿って side 方向へ幅を取り、絵は下から上へ貼る
        n = len(pts); prev = None; side = Vector(side).normalized()
        for i in range(n):
            t = i / (n - 1); p = Vector(pts[i]); w = widths[i]
            a, b = self.bm.verts.new(p - side * w / 2), self.bm.verts.new(p + side * w / 2)
            for v in (a, b): v[self.cn] = Vector(nrm).normalized()
            if prev:
                f = self.bm.faces.new((prev[0], prev[1], b, a)); f.material_index = self.mi(m); f[self.fixed] = 1
                for l in f.loops:
                    tt = prev[2] if l.vert in prev[:2] else t
                    uu = 0 if l.vert in (prev[0], a) else 1
                    l[self.uv].uv = (cell[0] + 0.005 + uu * 0.49, cell[1] + 0.005 + tt * 0.49)
                    c = colors(tt) if colors else (1, 1, 1); l[self.col] = (*c, 1)
            prev = (a, b, t)
        self.has_cn = True
    def __init__(self, seed=1):
        super().__init__(seed); self.fixed = self.bm.faces.layers.int.new('fixed_uv')
    def mesh(self, name, smooth_angle=180):
        # 板・帯の UV はそのまま、ほかは3方向投影。面はなめらかに（角を立てない）
        bm = self.bm
        keep = {f.index: [l[self.uv].uv.copy() for l in f.loops] for f in bm.faces if f[self.fixed]}
        bm.faces.index_update()
        keep = {f.index: [l[self.uv].uv.copy() for l in f.loops] for f in bm.faces if f[self.fixed]}
        me = super().mesh(name, smooth_angle=smooth_angle)
        uvl = me.uv_layers.active.data
        for p in me.polygons:
            if p.index in keep:
                for li, uv in zip(p.loop_indices, keep[p.index]): uvl[li].uv = uv
        return me

def spherical_uv(mb, verts, c, scale=1.0):
    # 葉の塊の UV: 球の周りに巻く（繰り返しの絵なので継ぎ目は目立たない）
    for v in verts:
        d = (v.co - c)
        for f in v.link_faces:
            for l in f.loops:
                if l.vert is v: l[mb.uv].uv = (math.atan2(d.y, d.x) / 6.2832 * 3 * scale, d.z * 0.7 * scale)

def leaf_mass(mb, c, R, tree_c, rnd, cards=22, cell='maple', core=True, sq=0.85):
    # 葉の塊（芯）と、まわりの葉の房。色は木の中心から外・上ほど明るい
    c = Vector(c); tree_c = Vector(tree_c)
    def tone(p, n):
        out = (p - tree_c); sh = 0.35 + 0.35 * max(0, n.z) + 0.3 * min(1, out.length / (R * 2.4))
        k = max(0.0, min(1.0, sh)); return lerp3(srgb(0x4a6a38), srgb(0xffffff), k ** 0.8)
    if core:
        vs = mb.sphere(R * 0.82, c, sc=(1, 1, sq), m='葉の塊', sub=3)
        off = Vector((rnd.random() * 40, rnd.random() * 40, 0))
        for v in vs:
            d = v.co - c; v.co = c + d * (1 + noise.noise(d.normalized() * 2.0 + off) * 0.18)
        fs = mb.tag(vs, '葉の塊')
        for f in fs:
            f[mb.fixed] = 1
            for l in f.loops:
                d = l.vert.co - c; l[mb.uv].uv = (math.atan2(d.y, d.x) / 6.2832 * 3, d.z / R * 0.8)
                l[mb.col] = (*tone(l.vert.co, d.normalized()), 1)
        for v in vs: v[mb.cn] = ((v.co - tree_c).normalized() * 0.6 + (v.co - c).normalized() * 0.4).normalized()
        mb.has_cn = True
    for k in range(cards):
        n = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), abs(rnd.gauss(0, 1)) * 0.8 + 0.1)).normalized()
        p = c + Vector((n.x, n.y, n.z * sq)) * R * rnd.uniform(0.78, 1.02)
        out = (p - tree_c).normalized()
        right = n.cross(Vector((0, 0, 1))); right = right.normalized() if right.length > 0.1 else Vector((1, 0, 0))
        up = right.cross(n).normalized()
        q = Matrix.Rotation(rnd.uniform(-0.7, 0.7), 3, n)
        s = R * rnd.uniform(0.75, 1.0)
        mb.card(p, q @ right, q @ (up * 0.8 + n * 0.5), s * 1.1, s, CELL[cell], nrm=(out * 0.6 + n * 0.25 + Vector((0, 0, 0.45))), color=tone(p, n))

def ro_maple(seed, H_, lobes=11, cards=22, far=False):
    rnd = random.Random(seed); mb = RB(seed)
    lean = Vector((rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), 0))
    trunk = lambda t: Vector((math.sin(t * 2.4 + seed) * 0.22, math.cos(t * 1.9 + seed) * 0.16, 0)) + lean * t * t + Vector((0, 0, t * H_ * 0.62))
    bark = srgb(0x6e5640)
    mb.tube(trunk, lambda t: 0.36 * (1 - 0.5 * t) + 0.32 * max(0, 0.18 - t) / 0.18, 12, 12, '樹皮', color=bark)
    for k in range(6):
        a = k / 6 * 6.28 + rnd.random() * 0.5; L = rnd.uniform(0.9, 1.5)
        mb.tube(lambda t, a=a, L=L: Vector((math.cos(a) * t * L, math.sin(a) * t * L, 0.42 * (1 - t) ** 2 - 0.08)), lambda t: 0.16 * (1 - t) + 0.03, 6, 8, '樹皮', color=srgb(0x5e4834))
    top = trunk(1); crown = top + Vector((0, 0, H_ * 0.1)); tips = []
    for k in range(lobes - 1):
        a = k / (lobes - 1) * 6.2832 + rnd.uniform(-0.3, 0.3); b = trunk(rnd.uniform(0.55, 0.95))
        L = rnd.uniform(1.6, 2.6) * H_ / 6.5; e = b + Vector((math.cos(a) * L, math.sin(a) * L, L * rnd.uniform(0.35, 0.95)))
        mid = b.lerp(e, 0.5) + Vector((0, 0, 0.25))
        mb.tube(lambda t, b=b, e=e, mid=mid: b * (1 - t) ** 2 + mid * 2 * t * (1 - t) + e * t * t, lambda t: 0.15 * (1 - t * 0.7) * H_ / 6.5, 6, 7, '樹皮', color=bark)
        tips.append(e)
    tips.append(top + Vector((0, 0, H_ * 0.2)))
    for k, tp in enumerate(tips):
        R = rnd.uniform(1.15, 1.5) * H_ / 6.5 * (1.2 if k == len(tips) - 1 else 1)
        leaf_mass(mb, tp + Vector((0, 0, R * 0.2)), R, crown - Vector((0, 0, H_ * 0.15)), rnd, cards=cards)
    leaf_mass(mb, crown, H_ * 0.3, crown - Vector((0, 0, H_ * 0.3)), rnd, cards=0)
    return mb.mesh(f'RO広葉樹_{seed}')

def ro_fir(seed, H_):
    rnd = random.Random(seed); mb = RB(seed)
    mb.tube(lambda t: Vector((0, 0, t * H_ * 0.92 - 0.1)), lambda t: 0.32 * (1 - t) + 0.05, 8, 10, '樹皮', color=srgb(0x5e4630))
    vs = mb.sphere(1.0, (0, 0, H_ * 0.52), sc=(H_ * 0.17, H_ * 0.17, H_ * 0.42), m='葉の塊', sub=3)
    fs = mb.tag(vs, '葉の塊')
    for f in fs:
        f[mb.fixed] = 1
        for l in f.loops:
            p = l.vert.co; l[mb.uv].uv = (math.atan2(p.y, p.x) / 6.28 * 3, p.z * 0.4); l[mb.col] = (*lerp3(srgb(0x22442a), srgb(0x5a7a52), min(1, p.z / H_)), 1)
    tiers = 10
    for i in range(tiers):
        t = i / tiers; z = H_ * (0.15 + t * 0.8); R = (1 - t) ** 1.05 * H_ * 0.32 + 0.45
        n = int(10 + (1 - t) * 12)
        for k in range(n):
            a = k / n * 6.2832 + rnd.random() * 0.35 + i * 0.7
            out = Vector((math.cos(a), math.sin(a), 0)); side = Vector((-out.y, out.x, 0))
            d = (out + Vector((0, 0, rnd.uniform(-0.6, -0.3)))).normalized()
            col = lerp3(srgb(0x6a8a62), srgb(0xffffff), 0.45 + 0.5 * t + rnd.uniform(-0.1, 0.1))
            mb.card(Vector((0, 0, z)) + out * 0.15, side, d, R * 0.8, R * 1.05, (0, 0), m='カード_針葉', bottom=True,
                    nrm=(out * 0.55 + Vector((0, 0, 0.85))), color=col, uvs=(0, 0, 0.99, 0.99))
    return mb.mesh(f'RO針葉樹_{seed}')

def ro_shrub(seed, R=0.8, flowers=None):
    rnd = random.Random(seed); mb = RB(seed); c = Vector((0, 0, R * 0.55))
    for k in range(3):
        a = k / 3 * 6.28 + rnd.random()
        leaf_mass(mb, c + Vector((math.cos(a) * R * 0.4, math.sin(a) * R * 0.4, rnd.uniform(-0.05, 0.2) * R)), R * rnd.uniform(0.6, 0.75), c - Vector((0, 0, R)), rnd, cards=12, cell='round')
    if flowers:
        for k in range(10):
            n = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), abs(rnd.gauss(0, 1)) + 0.5)).normalized()
            vs = mb.sphere(0.07, c + Vector((n.x * R, n.y * R, n.z * R * 0.85)), sc=(1, 1, 0.6), m='花', sub=1); mb.tag(vs, '花', srgb(flowers))
    return mb.mesh('RO低木')

def ro_fern(seed):
    rnd = random.Random(seed); mb = RB(seed)
    for k in range(10):
        a = k / 10 * 6.2832 + rnd.uniform(-0.2, 0.2); L = rnd.uniform(0.75, 1.15); lift = rnd.uniform(0.55, 0.9)
        out = Vector((math.cos(a), math.sin(a), 0)); side = Vector((-out.y, out.x, 0))
        pts = [out * L * t + Vector((0, 0, math.sin(t * math.pi * 0.8) * L * lift * 0.6 + 0.02)) for t in (i / 6 for i in range(7))]
        mb.strip(pts, [0.5 * (1 - i / 6) ** 0.5 + 0.06 for i in range(7)], side, CELL['fern'], colors=lambda t: lerp3(srgb(0x8aa070), srgb(0xffffff), 0.4 + 0.6 * t))
    return mb.mesh('ROシダ')

def ro_grass(seed, h=0.55):
    rnd = random.Random(seed); mb = RB(seed)
    for k in range(3):
        a = k / 3 * math.pi + rnd.random() * 0.4; side = Vector((math.cos(a), math.sin(a), 0)); lean = Vector((-side.y, side.x, 0)) * rnd.uniform(-0.25, 0.25)
        pts = [Vector((0, 0, -0.03)) + Vector((0, 0, h * t)) + lean * h * t * t for t in (0, 0.5, 1)]
        mb.strip(pts, [0.6 * h, 0.62 * h, 0.66 * h], side, CELL['grass'], colors=lambda t: lerp3(srgb(0x88a060), srgb(0xffffff), 0.5 + 0.5 * t))
    return mb.mesh('RO草')

def ro_boulder(seed, size=1.0, flat=0.7):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=4, radius=size)
    me = bpy.data.meshes.new(f'RO岩_{seed}'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('tmp', me); bpy.context.scene.collection.objects.link(ob); ob.scale = (1.2, 1.0, flat)
    d1 = ob.modifiers.new('割れ', 'DISPLACE'); d1.texture = B.tex_noise(f'RO岩V{seed}', 'VORONOI', 0.6 * size, distance_metric='DISTANCE'); d1.strength = 0.3 * size
    d2 = ob.modifiers.new('凹凸', 'DISPLACE'); d2.texture = B.tex_noise(f'RO岩C{seed}', 'CLOUDS', 0.3 * size, noise_depth=3); d2.strength = 0.12 * size
    sm = ob.modifiers.new('なめらか', 'SMOOTH'); sm.factor = 0.5; sm.iterations = 2
    B.apply_mods(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True); bpy.ops.object.transform_apply(scale=True); ob.select_set(False)
    for v in me.vertices:
        if v.co.z < -size * 0.15: v.co.z = -size * 0.15
    bpy.data.objects.remove(ob)
    return me

def rockify(me, seed, moss=0.8):
    # 岩の形に、3方向投影の UV・岩肌の材質・なめらかな面・苔の頂点の色を付ける
    bm = bmesh.new(); bm.from_mesh(me); uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            co = l.vert.co; uv = (co.y, co.z) if ax == 0 else (co.x, co.z) if ax == 1 else (co.x, co.y); l[uvl].uv = (uv[0] / 2.2, uv[1] / 2.2)
    bm.to_mesh(me); bm.free()
    me.materials.clear(); me.materials.append(B.MAT['岩肌'])
    for p in me.polygons: p.use_smooth = True
    me.update()
    B.rock_colors(me, seed, moss=moss)
    # 岩肌のテクスチャに掛けるので、頂点の色は少し明るめに
    ca = me.color_attributes['Col']; vals = [0.0] * (len(ca.data) * 4); ca.data.foreach_get('color', vals)
    vals = [min(1.0, v * 1.35) if (i % 4) != 3 else 1.0 for i, v in enumerate(vals)]; ca.data.foreach_set('color', vals)

# ---------------------------------------------------------------------------
# 組み立て: 前の版と同じ配置を作り、植物・岩の形を入れ替える
# ---------------------------------------------------------------------------
def build():
    B.COLL.clear(); bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in ('地形', '岩', '小屋', '庭', '木', '下草', '目印', 'プレビュー'): B.coll(c)
    build_materials()
    B.build_materials = lambda: None   # B.build() の中で材質を作り直さない
    B.build()
    rnd = random.Random(3)
    maples = {s: ro_maple(s, h) for s, h in ((11, 6.8), (12, 7.6), (13, 6.0), (14, 8.2))}
    far = ro_maple(15, 7.0, lobes=8, cards=12)
    firs = {s: ro_fir(s, h) for s, h in ((21, 9.5), (22, 8.0), (23, 11.0))}
    shrubs = [ro_shrub(41 + k, R=0.85, flowers=[None, 0xfff6ee, 0xff8aaa, None][k]) for k in range(4)]
    ferns = [ro_fern(51 + k) for k in range(3)]
    grass = [ro_grass(70 + k, h=h) for k, h in enumerate((0.45, 0.6, 0.5, 0.7))]
    rocks = [ro_boulder(s, sz, fl) for s, sz, fl in ((1, 1.0, 0.75), (2, 1.3, 0.6), (3, 0.7, 0.8), (4, 1.6, 0.55), (5, 0.9, 0.9))]
    for k, me in enumerate(rocks): rockify(me, 10 + k)
    swapped = {}
    for ob in list(bpy.data.objects):
        if ob.type != 'MESH': continue
        mn = ob.data.name
        if mn.startswith('広葉樹_遠'): new = far
        elif mn.startswith('広葉樹_'): new = maples[int(mn.split('_')[1].split('.')[0])]
        elif mn.startswith('針葉樹_'): new = firs[int(mn.split('_')[1].split('.')[0])]
        elif mn.startswith('低木'): new = shrubs[hash(ob.name) % 4 if False else int(abs(ob.location.x * 7 + ob.location.y * 3)) % 4]
        elif mn.startswith('シダ'): new = ferns[int(abs(ob.location.x * 5 + ob.location.y)) % 3]
        elif mn.startswith('草'): new = grass[int(abs(ob.location.x * 3 + ob.location.y * 7)) % 4]
        elif mn.startswith('岩_'): new = rocks[(int(mn.split('_')[1].split('.')[0]) - 1) % 5]
        elif mn.startswith('岩壁_'): rockify(ob.data, int(mn.split('_')[1].split('.')[0]), moss=0.95); continue
        else: continue
        swapped[mn] = swapped.get(mn, 0) + 1
        ob.data = new
    print('入れ替え:', swapped)
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)

def write_layout():
    path = os.path.join(ROOT, 'public', 'shared', 'hollow-layout-ro.js')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('// 自動生成: tools/blender/sunlit_hollow_ro.py（陽だまりの森の家の RO 風版。手で直さない）\n')
        f.write('// 当たり判定・地面の高さ・明かりは前の版（hollow-layout.js）と同じ。モデルだけ違う\n')
        f.write("import { HOLLOW } from './hollow-layout.js';\n\n")
        f.write("export const HOLLOW_RO = { ...HOLLOW, model: 'blender/sunlit_hollow_ro.glb' };\n")
    print('書き出し:', path)

def export():
    objs = [o for c in ('地形', '岩', '小屋', '庭', '木', '下草') for o in B.COLL[c].objects]
    out = os.path.join(ROOT, 'public', 'assets', 'models', 'blender', 'sunlit_hollow_ro.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT',
                              export_cameras=False, export_lights=False, export_vertex_color='ACTIVE', export_image_format='AUTO')
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
    print('書き出し:', out, os.path.getsize(out) // 1024, 'KB / 三角形', tris)
    write_layout()

def main():
    build()
    B.preview()
    bpy.data.objects['カメラ_小道'].location = (-3.0, -27.0, 10.0)
    bpy.data.objects['カメラ_小道'].rotation_euler = (Vector((-1.0, -5.0, 0.5)) - Vector((-3.0, -27.0, 10.0))).to_track_quat('-Z', 'Y').to_euler()
    export()
    blend = os.path.join(ROOT, 'tools', 'blender', 'sunlit_hollow_ro.blend')
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True, relative_remap=True)
    print('保存:', blend)
    od = os.path.join(ROOT, 'docs', 'hollow', 'ro')
    if '--render' in ARGS: B.render(out_dir=od)
    elif '--quick' in ARGS: B.render(samples=10, scale=50, out_dir=os.environ.get('QUICK_OUT', od))

if __name__ == '__main__':
    main()
