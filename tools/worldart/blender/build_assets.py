"""環境アセットを Blender で作り、.blend と GLB に書き出す。
  blender -b --factory-startup --python tools/worldart/blender/build_assets.py -- [--out public/worldart/assets] [--blend art/blender/assets.blend]

作るもの（名前 = GLB のファイル名 = three.js 側の型名）:
  tree_broad_a/b  広葉樹（幹と枝はチューブ、樹冠は葉カードの房。カードの法線は房の中心から外向き）
  pine_a/b        もみ（シダ状の葉カードを水平〜垂れ下がりで段に重ねる）
  bush_a          茂み（地面に接した葉カードの房）
  grass_a         草の房（十字のカード。法線は真上 → 地面と同じに光る）
  rock_a/b/c      岩（細分化した箱を崩して面を減らした、平らな面の塊）
  fence_spike     拒馬（中心の丸太から四方へ尖った杭）
  crate           木箱
すべてメートル。原点は根元（地面に接する点）。頂点色 COLOR_0 は AO（暗さ）と色のゆらぎ。
乱数はアセット名ごとに固定シード。
"""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix, noise

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, arg('--out', 'public/worldart/assets'))
BLEND = os.path.join(ROOT, arg('--blend', 'art/blender/assets.blend'))
TEX = os.path.join(ROOT, 'public/worldart/tex')
os.makedirs(OUT, exist_ok=True); os.makedirs(os.path.dirname(BLEND), exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
UP = Vector((0, 0, 1))


# ------------------------------------------------------------ 材質
def material(name, tex, alpha=False, rough=1.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Specular IOR Level'].default_value = 0.0
    img = nt.nodes.new('ShaderNodeTexImage')
    img.image = bpy.data.images.load(os.path.join(TEX, tex), check_existing=True)
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    nt.links.new(img.outputs['Color'], mul.inputs[6]); nt.links.new(vc.outputs['Color'], mul.inputs[7])
    nt.links.new(mul.outputs[2], bsdf.inputs['Base Color'])
    if alpha:
        rnd = nt.nodes.new('ShaderNodeMath'); rnd.operation = 'ROUND'   # glTF: alphaMode MASK
        nt.links.new(img.outputs['Alpha'], rnd.inputs[0]); nt.links.new(rnd.outputs[0], bsdf.inputs['Alpha'])
        m.use_backface_culling = False
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    return m


M_BARK = lambda: material('bark', 'wood.png')
M_WOOD = lambda: material('wood', 'wood.png')
M_LEAF = lambda: material('leaf_broad', 'leaf_broad.png', alpha=True)
M_FROND = lambda: material('leaf_frond', 'leaf_frond.png', alpha=True)
M_GRASS = lambda: material('grass', 'grass_blades.png', alpha=True)
M_ROCK = lambda: material('rock', 'rock.png')
M_PALM = lambda: material('leaf_palm', 'leaf_palm.png', alpha=True)


# ------------------------------------------------------------ メッシュの組み立て
class Builder:
    """頂点・面・UV・頂点色・（任意の）法線を溜めて1つのメッシュにする"""
    def __init__(self):
        self.v = []; self.f = []; self.uv = []; self.col = []; self.nrm = []; self.mat = []; self.mats = []
        self.has_custom = False

    def mat_index(self, m):
        if m not in self.mats: self.mats.append(m)
        return self.mats.index(m)

    def face(self, idx, uvs, cols, nrms, m):
        self.f.append(idx); self.uv.append(uvs); self.col.append(cols); self.nrm.append(nrms)
        self.mat.append(self.mat_index(m))
        if nrms is not None: self.has_custom = True

    def add_v(self, p):
        self.v.append(tuple(p)); return len(self.v) - 1

    def build(self, name, smooth=True):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        for m in self.mats: me.materials.append(m)
        me.uv_layers.new(name='UVMap')
        me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        # 層を足すと前に取った参照が無効になる（書くと別の層を壊す）。両方作ってから名前で取り直す
        uvl = me.uv_layers['UVMap']; ca = me.color_attributes['Col']
        li = 0
        for pi, poly in enumerate(me.polygons):
            poly.material_index = self.mat[pi]
            poly.use_smooth = smooth
            for k, l in enumerate(poly.loop_indices):
                uvl.data[l].uv = self.uv[pi][k]
                c = self.col[pi][k]; ca.data[l].color = (c[0], c[1], c[2], 1.0)
        me.validate(clean_customdata=False); me.update()
        if self.has_custom:
            loops = [None] * len(me.loops)
            for pi, poly in enumerate(me.polygons):
                for k, l in enumerate(poly.loop_indices):
                    n = self.nrm[pi][k] if self.nrm[pi] is not None else poly.normal
                    loops[l] = tuple(Vector(n).normalized())
            me.normals_split_custom_set(loops)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def tube(B, pts, radii, m, sides=7, ao=(0.55, 1.0), u0=0.0, u1=0.5, tip_u=None):
    """折れ線に沿ったチューブ（幹・枝・杭）。uは周方向（樹皮の半分）、vは長さ方向"""
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        a = t.cross(Vector((0.3, 0.1, 1)) if abs(t.z) < 0.95 else Vector((1, 0, 0))).normalized()
        b = t.cross(a)
        ring = []
        for s in range(sides + 1):
            ang = 2 * math.pi * s / sides
            ring.append(B.add_v(p + (a * math.cos(ang) + b * math.sin(ang)) * radii[i]))
        rings.append(ring)
    length = 0.0; vs = [0.0]
    for i in range(1, n): length += (pts[i] - pts[i - 1]).length; vs.append(length)
    circ = 2 * math.pi * max(radii)
    for i in range(n - 1):
        for s in range(sides):
            idx = [rings[i][s], rings[i][s + 1], rings[i + 1][s + 1], rings[i + 1][s]]
            uv = [(u0 + (u1 - u0) * s / sides, vs[i] / max(circ, 0.3) * 0.5), (u0 + (u1 - u0) * (s + 1) / sides, vs[i] / max(circ, 0.3) * 0.5),
                  (u0 + (u1 - u0) * (s + 1) / sides, vs[i + 1] / max(circ, 0.3) * 0.5), (u0 + (u1 - u0) * s / sides, vs[i + 1] / max(circ, 0.3) * 0.5)]
            ta, tb = i / (n - 1), (i + 1) / (n - 1)
            ca = ao[0] + (ao[1] - ao[0]) * ta; cb = ao[0] + (ao[1] - ao[0]) * tb
            c = [(ca,) * 3, (ca,) * 3, (cb,) * 3, (cb,) * 3]
            B.face(idx, uv, c, None, m)
    return rings


def card(B, center, normal_hint, size, m, rot, out_n, ao, tint=(1, 1, 1), aspect=1.0, uvrect=(0, 0, 1, 1)):
    """葉カード1枚。法線は out_n（房の中心から外向き）を全頂点に入れる"""
    n = normal_hint.normalized()
    a = n.cross(Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))).normalized()
    b = n.cross(a)
    ca, sa = math.cos(rot), math.sin(rot)
    ax = (a * ca + b * sa) * size * 0.5; bx = (b * ca - a * sa) * size * 0.5 * aspect
    ps = [center - ax - bx, center + ax - bx, center + ax + bx, center - ax + bx]
    u0, v0, u1, v1 = uvrect
    uv = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    idx = [B.add_v(p) for p in ps]
    col = tuple(ao * t for t in tint)
    B.face(idx, uv, [col] * 4, [out_n] * 4, m)


def fib_sphere(n, r):
    pts = []
    for i in range(n):
        y = 1 - 2 * (i + 0.5) / n; rad = math.sqrt(1 - y * y); th = math.pi * (3 - math.sqrt(5)) * i
        pts.append(Vector((math.cos(th) * rad, math.sin(th) * rad, y)))
    return pts


def leaf_clump(B, c, R, R_, m, cards, size, squash=0.75, tint_jit=0.08, ao_floor=0.42):
    """葉の房: 球面上にカードを並べる。カードの向きは外向きと乱数の間。法線は外向き"""
    for d in fib_sphere(cards, 1.0):
        d = (d + Vector((R_.uniform(-.25, .25), R_.uniform(-.25, .25), R_.uniform(-.25, .25)))).normalized()
        d.z *= squash
        p = c + Vector((d.x * R, d.y * R, d.z * R)) * R_.uniform(0.6, 1.0)
        out = (p - c).normalized()
        hint = (out + Vector((R_.uniform(-1, 1), R_.uniform(-1, 1), R_.uniform(-1, 1))) * 0.7).normalized()
        # 下側・内側ほど暗く（AO）
        up = (out.z + 1) / 2
        ao = ao_floor + (1 - ao_floor) * (0.35 + 0.65 * up) * ((p - c).length / R) ** 0.3
        j = R_.uniform(-tint_jit, tint_jit)
        nrm = (out * 0.85 + UP * 0.15).normalized()
        card(B, p, hint, size * R_.uniform(0.8, 1.2), m, R_.uniform(0, 6.28), nrm, ao, (1 + j, 1 + j * 0.6, 1 - j))


# ------------------------------------------------------------ アセット
def tree_broad(name, seed, height=4.2, crown=1.0):
    R_ = random.Random(seed); B = Builder()
    # 幹: 少し傾いて曲がる
    lean = Vector((R_.uniform(-.3, .3), R_.uniform(-.3, .3), 0))
    trunk = [Vector((0, 0, -0.3))] + [Vector((lean.x * (t ** 1.5), lean.y * (t ** 1.5), height * 0.62 * t)) for t in (0.0, 0.3, 0.6, 1.0)]
    trunk[1] = Vector((0, 0, 0))
    tube(B, trunk, [0.34, 0.30, 0.22, 0.18, 0.14], M_BARK(), sides=8, ao=(0.45, 0.9))
    top = trunk[-1]
    tips = []
    nb = R_.randint(3, 4)
    for i in range(nb):
        a = 2 * math.pi * i / nb + R_.uniform(-.4, .4)
        L = R_.uniform(1.1, 1.6) * crown
        d = Vector((math.cos(a), math.sin(a), R_.uniform(0.7, 1.2))).normalized()
        s = top - Vector((0, 0, R_.uniform(0, height * 0.12)))
        mid = s + d * L * 0.5 + Vector((0, 0, 0.2))
        e = s + d * L + Vector((0, 0, 0.35))
        tube(B, [s, mid, e], [0.12, 0.08, 0.04], M_BARK(), sides=6, ao=(0.55, 0.85))
        tips.append(e)
    tips.append(top + Vector((0, 0, 0.9 * crown)))
    # 枝先ごとに房を3つ寄せる → 輪郭がでこぼこ、房の間に陰ができる
    for e in tips:
        for k in range(3):
            off = Vector((R_.uniform(-.6, .6), R_.uniform(-.6, .6), R_.uniform(-.2, .5))) * crown
            Rc = R_.uniform(0.85, 1.15) * crown
            leaf_clump(B, e + off, Rc, R_, M_LEAF(), cards=int(13 * Rc * Rc) + 6, size=1.6 * crown)
    return B.build(name)


def frond_strip(B, base, out, L, W, droop, ao, m, lift=0.0):
    """もみの枝1本: 根元→中ほど→先の2枚つづきのカード。先が垂れる。法線は外向き+上"""
    side = out.cross(UP).normalized()
    mid = base + out * L * 0.5 + UP * (lift * L)
    tip = base + out * L - UP * droop * L
    rows = [(base, 0.0, W * 0.55), (mid, 0.5, W), (tip, 1.0, W * 0.7)]
    vid = []
    for p, v, w in rows:
        vid.append((B.add_v(p - side * w / 2), B.add_v(p + side * w / 2), v))
    nrm = (out * 0.65 + UP * 0.55).normalized()
    for (a0, a1, v0), (b0, b1, v1) in zip(vid[:-1], vid[1:]):
        c0 = (ao * (0.75 + 0.3 * v0),) * 3; c1 = (ao * (0.75 + 0.3 * v1),) * 3
        B.face([a0, a1, b1, b0], [(0, 1 - v0), (1, 1 - v0), (1, 1 - v1), (0, 1 - v1)], [c0, c0, c1, c1], [nrm] * 4, m)


def pine(name, seed, height=6.0, width=2.1):
    """もみ: 段ごとに枝を放射状に並べ、先を垂らす。下の段ほど長く暗い。R03"""
    R_ = random.Random(seed); B = Builder()
    tube(B, [Vector((0, 0, -0.3)), Vector((0, 0, 0)), Vector((0, 0, height * 0.9))], [0.22, 0.2, 0.04], M_BARK(), sides=7, ao=(0.4, 0.7))
    tiers = 13
    for i in range(tiers):
        t = i / (tiers - 1)                       # 0=下 1=上
        h = height * (0.14 + 0.82 * t)
        r = width * (1 - t) ** 1.05 + 0.3
        n = max(5, int(14 * (1 - t) + 5))
        for k in range(n):
            a = 2 * math.pi * k / n + R_.uniform(-.3, .3) + i * 0.7
            out = Vector((math.cos(a), math.sin(a), 0))
            L = r * R_.uniform(0.85, 1.1)
            ao = 0.5 + 0.5 * (0.25 + 0.75 * t)
            frond_strip(B, Vector((0, 0, h)) + out * 0.08, out, L, L * 0.55, R_.uniform(0.25, 0.45), ao, M_FROND(), lift=0.08)
        # 段の間を埋める短い枝（内側の陰）
        for k in range(n // 2):
            a = 2 * math.pi * (k + 0.5) / (n // 2) + i
            out = Vector((math.cos(a), math.sin(a), 0))
            frond_strip(B, Vector((0, 0, h - 0.2)), out, r * 0.6, r * 0.4, 0.5, 0.42 + 0.3 * t, M_FROND())
    for k in range(3):                          # てっぺん
        a = k * 2.1
        out = Vector((math.cos(a), math.sin(a), 0))
        frond_strip(B, Vector((0, 0, height * 0.93)), (out * 0.25 + UP).normalized(), 0.9, 0.45, -0.1, 1.0, M_FROND())
    return B.build(name)


def palm(name, seed, height=4.4, lean=1.1):
    """ヤシ: 弓なりの幹（節の段を明暗で）と、てっぺんから放射状に垂れる長い葉。葉は frond_strip（もみと同じ規則）"""
    R_ = random.Random(seed); B = Builder()
    a = R_.uniform(0, 6.28); d = Vector((math.cos(a), math.sin(a), 0))
    pts = [Vector((0, 0, -0.3))] + [d * lean * (t ** 2) + UP * height * t for t in [i / 8 for i in range(9)]]
    radii = [0.26] + [0.24 - 0.1 * (i / 8) for i in range(9)]
    tube(B, pts, radii, M_BARK(), sides=7, ao=(0.55, 0.95))
    top = pts[-1]
    n = 11
    for k in range(n):
        b = 2 * math.pi * k / n + R_.uniform(-.2, .2)
        out = Vector((math.cos(b), math.sin(b), R_.uniform(0.1, 0.45))).normalized()
        L = R_.uniform(1.45, 1.75)
        frond_strip(B, top, out, L, L * 0.45, R_.uniform(0.55, 0.85), R_.uniform(0.8, 1.0), M_PALM(), lift=0.25)
    for k in range(4):                       # 上へ立つ若い葉
        b = 2 * math.pi * k / 4 + 0.4
        out = Vector((math.cos(b) * 0.4, math.sin(b) * 0.4, 1)).normalized()
        frond_strip(B, top, out, 1.1, 0.45, 0.1, 1.0, M_PALM())
    return B.build(name)


def tint_variant(src_fn, name, tint):
    """同じ形で葉の色だけ変える（頂点色に掛ける）"""
    ob = src_fn(name)
    me = ob.data; ca = me.color_attributes['Col']
    leaf_idx = [i for i, m in enumerate(me.materials) if m.name.startswith('leaf')]
    for poly in me.polygons:
        if poly.material_index in leaf_idx:
            for l in poly.loop_indices:
                c = ca.data[l].color; ca.data[l].color = (c[0] * tint[0], c[1] * tint[1], c[2] * tint[2], 1)
    return ob


def bush(name, seed, size=1.0):
    R_ = random.Random(seed); B = Builder()
    for k in range(3):
        c = Vector((R_.uniform(-.5, .5) * size, R_.uniform(-.5, .5) * size, 0.45 * size))
        leaf_clump(B, c, 0.75 * size, R_, M_LEAF(), cards=14, size=1.25 * size, squash=0.7, ao_floor=0.35)
    return B.build(name)


def grass(name, seed):
    """草の房: 根元の1点から外へ倒れたカードを5枚、噴水のように開く。
    十字の縦カードは真上から「×」の模様に見えるので使わない。法線は真上（地面と同じに光る）"""
    R_ = random.Random(seed); B = Builder()
    k5 = 5
    for k in range(k5):
        a = 2 * math.pi * k / k5 + R_.uniform(-.3, .3)
        out = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-out.y, out.x, 0))
        tilt = math.radians(R_.uniform(30, 50))
        h = R_.uniform(0.38, 0.52); w = R_.uniform(0.30, 0.40)
        up = (UP * math.cos(tilt) + out * math.sin(tilt)) * h
        base = out * 0.04
        ps = [base - side * w / 2, base + side * w / 2, base + side * w / 2 + up, base - side * w / 2 + up]
        idx = [B.add_v(p) for p in ps]
        lo = (0.9,) * 3; hi = (1.05,) * 3
        B.face(idx, [(0, 0), (1, 0), (1, 1), (0, 1)], [lo, lo, hi, hi], [UP] * 4, M_GRASS())
    return B.build(name)


def rock(name, seed, size=(1.2, 1.0, 0.8), facet=0.18):
    """箱を細分化してノイズで崩し、面を減らす → 平らな面と角が残る塊"""
    R_ = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.5)
    off = Vector((R_.uniform(0, 100), R_.uniform(0, 100), R_.uniform(0, 100)))
    for v in bm.verts:
        p = v.co.copy()
        n1 = noise.fractal(p * 1.6 + off, 0.55, 2.0, 3) * 0.35          # 大きな凹凸
        n2 = noise.fractal(p * 5.0 + off, 0.5, 2.0, 2) * 0.06
        d = p.normalized()
        # 平らな面が出るよう、いくつかの切断面で押さえる
        for k in range(5):
            pn = Vector((math.sin(k * 2.4 + off.x), math.cos(k * 1.7 + off.y), math.sin(k * 3.1 + off.z))).normalized()
            if d.dot(pn) > 0.55: p = p - pn * (p.dot(pn) - 0.36) * 0.8
        v.co = Vector((p.x * size[0], p.y * size[1], p.z * size[2])) * (1 + n1 + n2)
    # 下を平らに（地面に埋める）
    for v in bm.verts:
        if v.co.z < -size[2] * 0.3: v.co.z = -size[2] * 0.3
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    md = ob.modifiers.new('dec', 'DECIMATE'); md.decimate_type = 'COLLAPSE'; md.ratio = facet
    bpy.ops.object.modifier_apply(modifier='dec')
    me = ob.data
    me.materials.append(M_ROCK())
    for p in me.polygons: p.use_smooth = False
    # 平らな面の UV: 面ごとに箱投影（UV の島ごとに岩肌のどこかが当たる）
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.cube_project(cube_size=2.0); bpy.ops.object.mode_set(mode='OBJECT')
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        for l in poly.loop_indices:
            z = me.vertices[me.loops[l].vertex_index].co.z
            a = 0.6 + 0.4 * min(1, max(0, (z + size[2] * 0.3) / (size[2] * 1.2)))   # 根元を暗く
            ca.data[l].color = (a, a, a, 1)
    ob.location.z = size[2] * 0.3 * 0.6
    bpy.ops.object.transform_apply(location=True)
    ob.select_set(False)
    return ob


def fence_spike(name, seed, length=3.0):
    """拒馬: 中心の丸太（地面と平行）から X 字に尖った杭が出る。R01・R04"""
    R_ = random.Random(seed); B = Builder()
    y0, y1 = -length / 2, length / 2
    hc = 0.55
    tube(B, [Vector((0, y0, hc)), Vector((0, y1, hc))], [0.16, 0.16], M_WOOD(), sides=8, ao=(0.75, 0.75))
    n = int(length / 0.42)
    for i in range(n):
        y = y0 + (i + 0.5) * length / n
        for sgn in (-1, 1):
            a = math.radians(sgn * 42 + R_.uniform(-6, 6))
            d = Vector((math.sin(a), 0, math.cos(a)))
            base = Vector((0, y, hc)) - d * 0.75
            body_end = Vector((0, y, hc)) + d * 0.75
            tip = body_end + d * 0.38
            tube(B, [base, body_end], [0.085, 0.085], M_WOOD(), sides=6, ao=(0.55, 0.95))
            # 削った先（木口の明るい側の UV）
            ring = tube(B, [body_end, tip], [0.085, 0.004], M_WOOD(), sides=6, ao=(1.05, 1.15), u0=0.5, u1=1.0)
    # 斜めの板2枚
    for sgn in (-1, 1):
        p0 = Vector((sgn * 0.42, y0 + 0.2, 0.15)); p1 = Vector((sgn * 0.42, y1 - 0.2, 0.95))
        tube(B, [p0, p1], [0.05, 0.05], M_WOOD(), sides=4, ao=(0.5, 0.7))
    return B.build(name)


def crate(name, size=0.8):
    bpy.ops.mesh.primitive_cube_add(size=size, location=(0, 0, size / 2))
    ob = bpy.context.object; ob.name = name
    md = ob.modifiers.new('bev', 'BEVEL'); md.width = 0.035; md.segments = 2
    bpy.ops.object.modifier_apply(modifier='bev')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.cube_project(cube_size=size * 2.2); bpy.ops.object.mode_set(mode='OBJECT')
    me = ob.data; me.materials.append(M_WOOD())
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        for l in poly.loop_indices:
            z = me.vertices[me.loops[l].vertex_index].co.z
            a = 0.65 + 0.35 * z / size
            ca.data[l].color = (a, a * 0.97, a * 0.92, 1)
    bpy.ops.object.transform_apply(location=True)
    ob.select_set(False)
    return ob


ASSETS = {
    'tree_broad_a': lambda n: tree_broad(n, 101),
    'tree_broad_b': lambda n: tree_broad(n, 102, height=5.0, crown=1.2),
    'pine_a': lambda n: pine(n, 201),
    'pine_b': lambda n: pine(n, 202, height=7.5, width=2.5),
    'bush_a': lambda n: bush(n, 301),
    'palm_a': lambda n: palm(n, 701),
    'palm_b': lambda n: palm(n, 702, height=5.2, lean=1.6),
    'tree_broad_y': lambda n: tint_variant(lambda m: tree_broad(m, 103, height=4.6, crown=1.1), n, (1.35, 1.15, 0.55)),
    'grass_a': lambda n: grass(n, 401),
    'rock_a': lambda n: rock(n, 501),
    'rock_b': lambda n: rock(n, 502, size=(2.2, 1.6, 1.4), facet=0.14),
    'rock_c': lambda n: rock(n, 503, size=(0.5, 0.4, 0.3), facet=0.2),
    'fence_spike': lambda n: fence_spike(n, 601),
    'crate': lambda n: crate(n),
}


def export(ob, path):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    loc = ob.location.copy(); ob.location = (0, 0, 0)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_normals=True, export_texcoords=True,
                              export_vertex_color='ACTIVE', export_image_format='AUTO')
    ob.location = loc


def check(ob):
    """書き出し前の検査: 原点・寸法・面数・材質・頂点色"""
    me = ob.data
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    return dict(name=ob.name, tris=sum(len(p.vertices) - 2 for p in me.polygons),
                size=[round(max(xs) - min(xs), 2), round(max(ys) - min(ys), 2), round(max(zs) - min(zs), 2)],
                zmin=round(min(zs), 2), mats=[m.name for m in me.materials], colors=len(me.color_attributes))


if __name__ == '__main__':
    only = arg('--only', None)
    report = []
    x = 0.0
    for name, fn in ASSETS.items():
        if only and name not in only.split(','): continue
        ob = fn(name)
        export(ob, os.path.join(OUT, name + '.glb'))
        report.append(check(ob))
        ob.location.x = x; x += 6.0      # .blend の中では横に並べて見られるように
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    import json
    with open(os.path.join(OUT, 'assets_report.json'), 'w') as f: json.dump(report, f, indent=1)
    for r in report: print('ASSET', r)
