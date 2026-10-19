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
M_CRATE = lambda: material('crate', 'crate.png')
M_LEAF = lambda: material('leaf_broad', 'leaf_broad.png', alpha=True)
M_FROND = lambda: material('leaf_frond', 'leaf_frond.png', alpha=True)
M_GRASS = lambda: material('grass', 'grass_blades.png', alpha=True)
M_ROCK = lambda: material('rock', 'rock.png')
M_PLASTER = lambda: material('plaster', 'plaster_timber.png')
M_STONE = lambda: material('stone', 'stone_wall.png')
M_ROOF = lambda: material('roof', 'roof_tiles.png')
M_WINDOW = lambda: material('window', 'window.png')
M_BANNER = lambda: material('banner', 'banner.png')
M_PAINT = lambda: material('paint', 'paint.png')
M_SOIL = lambda: material('soil', 'ground_dirt.png')
M_SPRAY = lambda: material('leaf_spray', 'spray_maple.png', alpha=True)
M_CLUMP = lambda: material('leaf_clump', 'clump_maple.png', alpha=True)
M_CLOVER = lambda: material('leaf_clover', 'spray_clover.png', alpha=True)
M_FIRF = lambda: material('leaf_firfrond', 'frond_fir.png', alpha=True)
M_GRASS2 = lambda: material('grass_tall', 'grass_tall.png', alpha=True)
M_ROCK2 = lambda: material('rock_crack', 'rock_crack.png')
M_PALM2 = lambda: material('leaf_palm2', 'frond_palm.png', alpha=True)
M_FLOWER = lambda: material('leaf_flower', 'flowers.png', alpha=True)
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


NORMAL_MODE = arg('--normals', 'mix')   # clump: 小房の中心 / crown: 樹冠全体の中心 / mix: 6:4 で混ぜる（E07 で採用）


def leaf_clump(B, c, R, R_, m, cards, size, squash=0.75, tint_jit=0.08, ao_floor=0.42, crown_c=None, crown_r=None):
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
        if NORMAL_MODE == 'crown' and crown_c is not None:
            out = (p - crown_c).normalized()
        elif NORMAL_MODE == 'mix' and crown_c is not None:
            out = ((p - crown_c).normalized() * 0.6 + out * 0.4).normalized()   # 大きな塊の明暗 + 小房のでこぼこ
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
    crown_c = sum(tips, Vector()) / len(tips)
    # 枝先ごとに房を3つ寄せる → 輪郭がでこぼこ、房の間に陰ができる
    for e in tips:
        for k in range(3):
            off = Vector((R_.uniform(-.6, .6), R_.uniform(-.6, .6), R_.uniform(-.2, .5))) * crown
            Rc = R_.uniform(0.85, 1.15) * crown
            leaf_clump(B, e + off, Rc, R_, M_LEAF(), cards=int(13 * Rc * Rc) + 6, size=1.6 * crown, crown_c=crown_c)
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
    """拒馬: 地面と平行な丸太から、杭が四方へらせん状に突き出す（ブラシ状）。杭の先は太く長く削り、木口の明るい色。
    斜めの板2枚で組む。R01・R04（平面の梯子にすると違う物に見える）"""
    R_ = random.Random(seed); B = Builder()
    y0, y1 = -length / 2, length / 2
    hc = 0.62
    tube(B, [Vector((0, y0, hc)), Vector((0, y1, hc))], [0.2, 0.2], M_WOOD(), sides=8, ao=(0.8, 0.8))
    n = int(length / 0.17)
    for i in range(n):
        y = y0 + (i + 0.5) * length / n
        a = i * 2.4 + R_.uniform(-0.3, 0.3)              # らせん
        tilt = R_.uniform(-0.25, 0.25)
        d = Vector((math.cos(a), math.sin(tilt), math.sin(a))).normalized()
        if d.z < -0.35: d.z = -d.z                        # 地面に刺さる向きは上へ返す
        L = R_.uniform(0.55, 0.85); r = R_.uniform(0.11, 0.15)
        base = Vector((0, y, hc)) + d * 0.1
        body = base + d * L
        tip = body + d * R_.uniform(0.45, 0.6)
        tube(B, [base, body], [r, r * 0.95], M_WOOD(), sides=6, ao=(0.9, 1.35))
        tube(B, [body, tip], [r * 0.95, 0.01], M_WOOD(), sides=5, ao=(1.0, 1.1), u0=0.5, u1=1.0)
    for sgn in (-1, 1):
        p0 = Vector((sgn * 0.5, y0 + 0.2, 0.1)); p1 = Vector((sgn * 0.5, y1 - 0.2, 1.05))
        tube(B, [p0, p1], [0.06, 0.06], M_WOOD(), sides=4, ao=(0.55, 0.75))
    return B.build(name)


def flower_patch(name, seed):
    """小花: 寝かせた2枚のカード（地面から 0.08m、15〜25° 傾ける）。法線は真上"""
    R_ = random.Random(seed); B = Builder()
    for k in range(2):
        a = k * 1.7 + R_.uniform(0, 1)
        dx = Vector((math.cos(a), math.sin(a), 0)) * 0.35; dy = Vector((-math.sin(a), math.cos(a), 0)) * 0.35
        tilt = UP * 0.12 * (1 if k else -1)
        ps = [-dx - dy + UP * 0.06, dx - dy + UP * 0.06 + tilt, dx + dy + UP * 0.1 + tilt, -dx + dy + UP * 0.1]
        idx = [B.add_v(p) for p in ps]
        B.face(idx, [(0, 0), (1, 0), (1, 1), (0, 1)], [(1.0,) * 3] * 4, [UP] * 4, M_FLOWER())
    return B.build(name)


def crate(name, size=0.8):
    bpy.ops.mesh.primitive_cube_add(size=size, location=(0, 0, size / 2))
    ob = bpy.context.object; ob.name = name
    md = ob.modifiers.new('bev', 'BEVEL'); md.width = 0.035; md.segments = 2
    bpy.ops.object.modifier_apply(modifier='bev')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.cube_project(cube_size=size); bpy.ops.object.mode_set(mode='OBJECT')
    me = ob.data; me.materials.append(M_CRATE())
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        for l in poly.loop_indices:
            z = me.vertices[me.loops[l].vertex_index].co.z
            a = 0.65 + 0.35 * z / size
            ca.data[l].color = (a, a * 0.97, a * 0.92, 1)
    bpy.ops.object.transform_apply(location=True)
    ob.select_set(False)
    return ob


# ------------------------------------------------------------ 町（R06・R10・R18）
def quad_uv(ps, tile, origin=None):
    """面の 2 辺を軸にしたメートル単位の UV"""
    p0 = origin or ps[0]
    u = (ps[1] - ps[0]).normalized(); v = (ps[-1] - ps[0]).normalized()
    v = (v - u * v.dot(u)).normalized()
    return [((p - p0).dot(u) / tile[0], (p - p0).dot(v) / tile[1]) for p in ps]


def poly(B, ps, m, tile, ao=None):
    idx = [B.add_v(p) for p in ps]
    cols = [((ao(p),) * 3) if ao else (1.0, 1.0, 1.0) for p in ps]
    B.face(idx, quad_uv(ps, tile), cols, None, m)


def hexa(B, b, t, m, tile, ao=None, skip=()):
    """下の 4 点（上から見て反時計回り）と上の 4 点の六面体。面ごとに UV"""
    if 'bottom' not in skip: poly(B, [b[0], b[3], b[2], b[1]], m, tile, ao)
    if 'top' not in skip: poly(B, [t[0], t[1], t[2], t[3]], m, tile, ao)
    for i in range(4):
        j = (i + 1) % 4
        poly(B, [b[i], b[j], t[j], t[i]], m, tile, ao)


def box(B, x0, y0, z0, x1, y1, z1, m, tile, ao=None, skip=()):
    b = [Vector((x0, y0, z0)), Vector((x1, y0, z0)), Vector((x1, y1, z0)), Vector((x0, y1, z0))]
    hexa(B, b, [p + Vector((0, 0, z1 - z0)) for p in b], m, tile, ao, skip)


def house(name, seed, w=7.0, d=5.0, h=4.6, roof_h=2.6, ov=0.55):
    """家: 石の土台、漆喰と木組みの壁、切妻の厚い瓦屋根、煙突、窓と扉。正面は -y（three.js では +z）"""
    R_ = random.Random(seed); B = Builder()
    ao = lambda p: 0.72 + 0.28 * min(1.0, max(0.0, p.z / 2.5))
    box(B, -w / 2 - 0.1, -d / 2 - 0.1, -0.3, w / 2 + 0.1, d / 2 + 0.1, 0.9, M_STONE(), (2, 2), ao, skip=('bottom',))
    box(B, -w / 2, -d / 2, 0.9, w / 2, d / 2, h, M_PLASTER(), (4, 4), ao, skip=('bottom', 'top'))
    # 妻の三角（左右の端）
    for sx in (-1, 1):
        a = Vector((sx * w / 2, -d / 2, h)); b_ = Vector((sx * w / 2, d / 2, h)); c = Vector((sx * w / 2, 0, h + roof_h))
        tri = [a, b_, c] if sx > 0 else [b_, a, c]
        idx = [B.add_v(p) for p in tri]
        B.face(idx, [((p.y + d / 2) / 4, (p.z - 0.9) / 4) for p in tri], [(1.0,) * 3] * 3, None, M_PLASTER())
    # 屋根（2 枚の厚い板）
    th = 0.24; x0, x1 = -w / 2 - 0.45, w / 2 + 0.45
    slope = roof_h / (d / 2)
    for sy in (-1, 1):
        ye = sy * (d / 2 + ov); ze = h - ov * slope
        if sy < 0: bq = [Vector((x0, ye, ze)), Vector((x1, ye, ze)), Vector((x1, 0, h + roof_h)), Vector((x0, 0, h + roof_h))]
        else: bq = [Vector((x0, 0, h + roof_h)), Vector((x1, 0, h + roof_h)), Vector((x1, ye, ze)), Vector((x0, ye, ze))]
        tq = [p + Vector((0, 0, th)) for p in bq]
        hexa(B, bq, tq, M_ROOF(), (2, 2), lambda p: 0.85 + 0.15 * min(1, (p.z - h + 1) / 3))
    # 煙突
    cx, cy = w * 0.22, -d * 0.12
    box(B, cx - 0.4, cy - 0.4, h + roof_h * 0.35, cx + 0.4, cy + 0.4, h + roof_h + 1.0, M_STONE(), (2, 2))
    # 窓と扉（壁から 3cm 出す）
    def front_quad(x, z0, ww, hh, y, m, flip=False):
        ps = [Vector((x - ww / 2, y, z0)), Vector((x + ww / 2, y, z0)), Vector((x + ww / 2, y, z0 + hh)), Vector((x - ww / 2, y, z0 + hh))]
        if flip: ps = [ps[1], ps[0], ps[3], ps[2]]
        idx = [B.add_v(p) for p in ps]
        B.face(idx, [(0, 0), (1, 0), (1, 1), (0, 1)], [(1.0,) * 3] * 4, None, m)
    nwin = max(2, int(w / 2.3))
    for k in range(nwin):
        x = -w / 2 + (k + 0.5) * w / nwin
        front_quad(x, 2.9, 0.95, 1.05, -d / 2 - 0.03, M_WINDOW())
        front_quad(x, 2.9, 0.95, 1.05, d / 2 + 0.03, M_WINDOW(), flip=True)
        if k != nwin // 2: front_quad(x, 1.3, 0.85, 0.95, -d / 2 - 0.03, M_WINDOW())
    front_quad(-w / 2 + (nwin // 2 + 0.5) * w / nwin, 0.9, 1.2, 1.9, -d / 2 - 0.03, M_CRATE())
    return B.build(name, smooth=False)


def tinted_box(B, x0, y0, z0, x1, y1, z1, m, tint, tile=(1, 1)):
    box(B, x0, y0, z0, x1, y1, z1, m, tile, lambda p: 1.0)
    # 直前の 6 面の頂点色を tint に
    for k in range(1, 7): B.col[-k] = [tint] * len(B.col[-k])


def lamp(name, seed, h=3.4):
    """街灯: 濃い緑の鉄の柱と、青緑のガラスのランタン（R06）"""
    B = Builder(); g = (0.22, 0.34, 0.27)
    tube(B, [Vector((0, 0, -0.2)), Vector((0, 0, h))], [0.08, 0.06], M_PAINT(), sides=8, ao=(0.25, 0.3))
    for k in range(len(B.col)): B.col[k] = [tuple(c * gg for c, gg in zip((1, 1, 1), g))] * 4
    tinted_box(B, -0.22, -0.22, h, 0.22, 0.22, h + 0.45, M_PAINT(), (0.55, 0.95, 1.0))
    tinted_box(B, -0.3, -0.3, h + 0.45, 0.3, 0.3, h + 0.55, M_PAINT(), g)
    tinted_box(B, -0.4, -0.4, -0.05, 0.4, 0.4, 0.35, M_PAINT(), g)
    return B.build(name, smooth=False)


def banner_pole(name, seed, h=4.2):
    B = Builder()
    tube(B, [Vector((0, 0, -0.2)), Vector((0, 0, h))], [0.07, 0.06], M_WOOD(), sides=8, ao=(0.5, 0.9))
    tube(B, [Vector((0, -0.05, h - 0.3)), Vector((0, -0.95, h - 0.3))], [0.04, 0.04], M_WOOD(), sides=6, ao=(0.8, 0.8))
    for flip in (False, True):
        ps = [Vector((0.01 * (1 if flip else -1), -0.15, h - 2.0)), Vector((0.01 * (1 if flip else -1), -0.95, h - 2.0)),
              Vector((0.01 * (1 if flip else -1), -0.95, h - 0.32)), Vector((0.01 * (1 if flip else -1), -0.15, h - 0.32))]
        if flip: ps = [ps[1], ps[0], ps[3], ps[2]]
        idx = [B.add_v(p) for p in ps]
        uv = [(0, 0), (1, 0), (1, 1), (0, 1)] if not flip else [(1, 0), (0, 0), (0, 1), (1, 1)]
        B.face(idx, uv, [(1.0,) * 3] * 4, None, M_BANNER())
    return B.build(name, smooth=False)


def bench(name, seed):
    B = Builder(); g = (0.36, 0.52, 0.40)
    for k in range(3):
        tinted_box(B, -1.0, -0.25 + k * 0.17, 0.45, 1.0, -0.12 + k * 0.17, 0.52, M_CRATE(), g, (2, 2))
    tinted_box(B, -1.0, 0.2, 0.55, 1.0, 0.26, 0.95, M_CRATE(), g, (2, 2))
    for sx in (-0.85, 0.85):
        tinted_box(B, sx - 0.05, -0.28, 0.0, sx + 0.05, 0.28, 0.45, M_PAINT(), (0.2, 0.22, 0.2))
    return B.build(name, smooth=False)


def planter(name, seed, s=2.4):
    B = Builder()
    ao = lambda p: 0.75 + 0.25 * min(1, p.z / 0.6)
    for (x0, y0, x1, y1) in [(-s / 2, -s / 2, s / 2, -s / 2 + 0.3), (-s / 2, s / 2 - 0.3, s / 2, s / 2),
                             (-s / 2, -s / 2 + 0.3, -s / 2 + 0.3, s / 2 - 0.3), (s / 2 - 0.3, -s / 2 + 0.3, s / 2, s / 2 - 0.3)]:
        box(B, x0, y0, -0.2, x1, y1, 0.6, M_STONE(), (2, 2), ao, skip=('bottom',))
    poly(B, [Vector((-s / 2 + 0.3, -s / 2 + 0.3, 0.45)), Vector((s / 2 - 0.3, -s / 2 + 0.3, 0.45)),
             Vector((s / 2 - 0.3, s / 2 - 0.3, 0.45)), Vector((-s / 2 + 0.3, s / 2 - 0.3, 0.45))], M_SOIL(), (3, 3), lambda p: 0.6)
    return B.build(name, smooth=False)


# ------------------------------------------------------------ 第 2 世代（B03・B01 の拡大から。docs/world-art/observations.md「追加の見本」）
TEAL = (1.0, 1.0, 0.86)    # E25: 日陰の葉が青くなりすぎる（空の光が青いため）ので、内側はむしろ暖かく      # 樹冠の下・内側の色相（青緑）
YELLOW = (0.82, 1.04, 1.00)    # 樹冠の上・日なた。暖かい太陽と ACES で黄へずれるのを打ち消し、葉は日なたでも緑（色相 ≈ 80°）を保つ。黄にするのは地面の草（E18）


def crown_color(h, out=0.5, lo=0.42, hi=1.10):
    """樹冠の中の高さ h(0=下 1=上) と外側への近さ out から頂点色。上ほど明るく黄、下ほど暗く青緑"""
    b = lo + (hi - lo) * (h ** 0.9) * (0.75 + 0.25 * out)
    t = [TEAL[i] + (YELLOW[i] - TEAL[i]) * h for i in range(3)]
    return tuple(b * c for c in t)


def card2(B, base, fwd, side, L, W, m, cols, nrm):
    """根元 base から fwd へ長さ L、幅 W のカード。UV は v=0 が根元（絵の下端）"""
    ps = [base - side * W / 2, base + side * W / 2, base + side * W / 2 + fwd * L, base - side * W / 2 + fwd * L]
    idx = [B.add_v(p) for p in ps]
    B.face(idx, [(0, 0), (1, 0), (1, 1), (0, 1)], [cols[0], cols[0], cols[1], cols[1]], [nrm] * 4, m)


def strip2(B, pts, widths, side, m, cols, nrm, v_end=1.0):
    """折れ線に沿った帯（垂れる葉）。pts[0] が根元。UV v は 0→v_end"""
    n = len(pts); acc = [0.0]
    for i in range(1, n): acc.append(acc[-1] + (pts[i] - pts[i - 1]).length)
    rows = [(B.add_v(p - side * w / 2), B.add_v(p + side * w / 2)) for p, w in zip(pts, widths)]
    for i in range(n - 1):
        v0, v1 = acc[i] / acc[-1] * v_end, acc[i + 1] / acc[-1] * v_end
        a, b = rows[i], rows[i + 1]
        B.face([a[0], a[1], b[1], b[0]], [(0, v0), (1, v0), (1, v1), (0, v1)], [cols[i], cols[i], cols[i + 1], cols[i + 1]], [nrm] * 4, m)


def maple(name, seed, width=3.4, height=4.8, base=1.6, clusters=11):
    """広葉樹（B03 右・B01）。実寸で作る（置くときの倍率は 0.9〜1.1）。
    樹冠 = 葉の塊（クラスター）を 3 段に積んだもの。塊は半径 0.5〜0.75m の小さな丸屋根で、spray_maple の房を
    上向き・外向きに 9〜12 枚。塊ごとに上が明るく下が暗い（法線は塊の中心から外向き、頂点色も塊の中の高さで）。
    塊のすき間から暗い内側と幹・枝が見える。"""
    R_ = random.Random(seed); B = Builder()
    rx = width / 2; ch = height - base
    lean = Vector((R_.uniform(-.15, .15), R_.uniform(-.15, .15), 0))
    trunk_top = Vector((0, 0, base + ch * 0.55)) + lean
    tube(B, [Vector((0, 0, -0.3)), Vector((0, 0, 0)), Vector((0, 0, base * 0.6)) + lean * 0.3, Vector((0, 0, base)) + lean * 0.6, trunk_top],
         [0.17, 0.16, 0.13, 0.11, 0.07], M_BARK(), sides=8, ao=(0.5, 0.8))
    cents = []
    tiers = [(0.08, 1.0, 3), (0.45, 0.85, 3), (0.78, 0.55, 2)]   # 段の間をあけて幹と陰を見せる（B03 右の木）
    for tz, tr, k in tiers:
        a0 = R_.uniform(0, 6.28)
        for j in range(k):
            a = a0 + j * 2 * math.pi / k + R_.uniform(-.3, .3)
            rr = rx * tr * R_.uniform(0.55, 0.8)
            cents.append(Vector((math.cos(a) * rr, math.sin(a) * rr, base + ch * tz + R_.uniform(-.15, .15))) + lean * 0.5)
    cents.append(Vector((0, 0, base + ch * 0.95)) + lean)
    zmin = base - 0.3; zmax = height
    for c in cents:
        st = Vector((0, 0, min(c.z - 0.4, trunk_top.z))) + lean * 0.5
        tube(B, [st, (st + c) / 2 + UP * 0.1, c], [0.06, 0.045, 0.025], M_BARK(), sides=5, ao=(0.5, 0.7))
        cr = R_.uniform(0.5, 0.7)
        for d in fib_sphere(R_.randint(9, 11), 1.0):
            if d.z < -0.45: continue
            p = c + Vector((d.x * 1.2, d.y * 1.2, d.z * 0.5)) * cr * R_.uniform(0.55, 0.9)   # 横に広い皿（段）
            # 葉の塊のカード: 面は塊の外向き（上寄り）。カードの上（絵の上端）を世界の上へ向ける
            nrm_card = (d * 0.6 + UP * 1.0).normalized()
            hint_up = (UP - nrm_card * nrm_card.dot(UP)); hint_up = hint_up.normalized() if hint_up.length > 0.1 else Vector((1, 0, 0))
            side = hint_up.cross(nrm_card).normalized()
            L = R_.uniform(1.15, 1.35)   # 絵の中の塊は直径 ≈ 0.7（端で切れない余白）
            hc = (d.z + 0.45) / 1.45; hg = (c.z - zmin) / (zmax - zmin)
            h0 = max(0.0, min(1.0, 0.6 * hc + 0.4 * hg))
            nrm = (d * 0.75 + UP * 0.35).normalized()
            card2(B, p - hint_up * L * 0.5, hint_up, side, L, L, M_CLUMP(),
                  [crown_color(max(0.0, h0 - 0.15), 0.6, 0.5, 1.12), crown_color(min(1.0, h0 + 0.1), 1.0, 0.5, 1.12)], nrm)
    return B.build(name)


def palm2(name, seed, height=3.2, frond=1.15, lean=0.6):
    """ヤシ（B03 下・B01）。実寸で作る。細い弓なりの幹（節の段）と、14 枚の葉（frond_palm）が上へ立ってから外へ弧を描いて垂れる"""
    R_ = random.Random(seed); B = Builder()
    a = R_.uniform(0, 6.28); dv = Vector((math.cos(a), math.sin(a), 0))
    pts = [Vector((0, 0, -0.3))] + [dv * lean * (t ** 2) + UP * height * t for t in [i / 8 for i in range(9)]]
    tube(B, pts, [0.13] + [0.12 - 0.04 * (i / 8) for i in range(9)], M_BARK(), sides=7, ao=(1.0, 1.45))
    top = pts[-1]
    n = 14
    for k in range(n):
        b = 2 * math.pi * k / n + R_.uniform(-.15, .15)
        out = Vector((math.cos(b), math.sin(b), 0)); side = out.cross(UP).normalized()
        L = frond * R_.uniform(0.85, 1.1); rise = R_.uniform(0.25, 0.55); droop = R_.uniform(0.7, 1.1)
        ps = [top + out * L * s + UP * L * (rise * s - droop * s * s) for s in (0.0, 0.3, 0.6, 1.0)]
        ws = [L * 0.2, L * 0.42, L * 0.4, L * 0.22]
        hcol = crown_color(0.9, 1.0, 0.5, 1.15)
        cols = [crown_color(0.5, 0.5, 0.5, 1.0), hcol, hcol, crown_color(0.7, 1.0, 0.5, 1.05)]
        strip2(B, ps, ws, side, M_PALM2(), cols, (out * 0.4 + UP * 0.8).normalized())
    return B.build(name)


def fir2(name, seed, height=6.4, width=2.0):
    """もみ（B03 中央・E04）: 16 段の輪に、先の垂れる細長いシダの葉（frond_fir）。上ほど明るく黄、下ほど青緑"""
    R_ = random.Random(seed); B = Builder()
    tube(B, [Vector((0, 0, -0.3)), Vector((0, 0, 0)), Vector((0, 0, height * 0.55))], [0.16, 0.14, 0.05], M_BARK(), sides=7, ao=(0.3, 0.45))
    tiers = 18
    for i in range(tiers):
        t = i / (tiers - 1)
        hz = height * (0.12 + 0.84 * t)
        L = 0.45 + width * 1.05 * (1 - t) ** 0.95
        n = int(5 + 7 * (1 - t))
        for k in range(n):
            a = 2 * math.pi * k / n + i * 0.9 + R_.uniform(-.2, .2)
            out = Vector((math.cos(a), math.sin(a), 0))
            side = out.cross(UP).normalized()
            rise = R_.uniform(0.15, 0.4); droop = R_.uniform(0.5, 0.95)
            pts = [Vector((0, 0, hz)) + out * (L * s) + UP * (L * (rise * s - droop * s * s)) for s in (0.0, 0.33, 0.66, 1.0)]
            ws = [L * 0.28, L * 0.36, L * 0.34, L * 0.24]
            # 段ごとの明暗: 下の段ほど暗く青緑、上の段の先だけ明るく黄（B03 のもみ）
            tb = t ** 1.3
            c0 = crown_color(tb * 0.5, 0.0, 0.3, 0.7); c1 = crown_color(min(1.0, tb * 0.9 + 0.1), 1.0, 0.4 + 0.25 * tb, 0.65 + 0.5 * tb)
            cols = [c0, tuple((a_ + b_) / 2 for a_, b_ in zip(c0, c1)), c1, c1]
            nrm = (out * 0.55 + UP * 0.7).normalized()
            strip2(B, pts, ws, side, M_FIRF(), cols, nrm)
    for k in range(3):
        a = k * 2.1
        out = Vector((math.cos(a), math.sin(a), 0)) * 0.25
        pts = [Vector((0, 0, height * 0.9)) + (out + UP) * s * 0.9 for s in (0, 0.5, 1)]
        strip2(B, pts, [0.25, 0.3, 0.2], out.cross(UP).normalized() if out.length else Vector((1, 0, 0)), M_FIRF(), [crown_color(1.0, 1)] * 3, (out + UP).normalized())
    return B.build(name)


def clover_bush(name, seed, radius=0.8):
    """クローバーの茂み（B03 左下・右）: 半球の面に spray_clover のカードを外向きに並べた小山"""
    R_ = random.Random(seed); B = Builder()
    for d in fib_sphere(56, 1.0):
        if d.z < -0.15: continue
        d = Vector((d.x, d.y, abs(d.z) * 0.75 + 0.05)).normalized()
        p = Vector((d.x * radius, d.y * radius, d.z * radius * 0.7)) * R_.uniform(0.75, 1.0)
        hint = (d * 0.8 + UP * 0.6).normalized()
        a_ = hint.cross(Vector((0, 0, 1)) if abs(hint.z) < 0.95 else Vector((1, 0, 0))).normalized(); b_ = hint.cross(a_)
        rot = R_.uniform(0, 6.28); sz = R_.uniform(0.55, 0.75)
        ax = (a_ * math.cos(rot) + b_ * math.sin(rot)) * sz / 2; bx = (b_ * math.cos(rot) - a_ * math.sin(rot)) * sz / 2
        ps = [p - ax - bx, p + ax - bx, p + ax + bx, p - ax + bx]
        h = max(0.0, min(1.0, p.z / (radius * 0.7)))
        c = crown_color(h, 0.8, 0.45, 1.05)
        idx = [B.add_v(q) for q in ps]
        B.face(idx, [(0, 0), (1, 0), (1, 1), (0, 1)], [c] * 4, [(d * 0.6 + UP * 0.6).normalized()] * 4, M_CLOVER())
    return B.build(name)


def grass_tall_tuft(name, seed):
    """背の高い草の房: 根元の 1 点から外へ 15〜35° 倒した 5 枚（grass_tall）。法線は真上"""
    R_ = random.Random(seed); B = Builder()
    for k in range(5):
        a = 2 * math.pi * k / 5 + R_.uniform(-.3, .3)
        out = Vector((math.cos(a), math.sin(a), 0)); side = Vector((-out.y, out.x, 0))
        tilt = math.radians(R_.uniform(15, 35)); h = R_.uniform(0.5, 0.7); w = R_.uniform(0.45, 0.6)
        up = (UP * math.cos(tilt) + out * math.sin(tilt)) * h
        ps = [-side * w / 2, side * w / 2, side * w / 2 + up, -side * w / 2 + up]
        idx = [B.add_v(p) for p in ps]
        B.face(idx, [(0, 0), (1, 0), (1, 1), (0, 1)], [(0.85,) * 3, (0.85,) * 3, (1.05,) * 3, (1.05,) * 3], [UP] * 4, M_GRASS2())
    return B.build(name)


def smooth_rock(name, seed, size=(2.6, 1.8, 2.2), bulge=0.22, sub=4, flat_top=True):
    """なめらかに膨らんだ岩（B03 の崖・D03 の岩）: 二十面体を細かく分け、大きな低い周波数のノイズで膨らませる。
    フラットシェーディングは使わない（多面体に見える）。割れ目と苔は実行時に三方向投影で貼る（rock_crack）"""
    R_ = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=0.5)
    off = Vector((R_.uniform(0, 100), R_.uniform(0, 100), R_.uniform(0, 100)))
    for v in bm.verts:
        p = v.co.copy(); d = p.normalized()
        n1 = noise.noise(d * 1.3 + off) * bulge
        n2 = noise.noise(d * 3.1 + off * 1.7) * bulge * 0.35
        # 上を少し平らに、角を丸く
        q = d * (0.5 + n1 + n2)
        if flat_top: q.z = q.z if q.z < 0.28 else 0.28 + (q.z - 0.28) * 0.45
        v.co = Vector((q.x * size[0], q.y * size[1], q.z * size[2]))
    for v in bm.verts:
        if v.co.z < -size[2] * 0.25: v.co.z = -size[2] * 0.25
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.cube_project(cube_size=2.0); bpy.ops.object.mode_set(mode='OBJECT')
    me.materials.append(M_ROCK2())
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        for l in poly.loop_indices:
            z = me.vertices[me.loops[l].vertex_index].co.z
            a = 0.62 + 0.38 * min(1, max(0, (z + size[2] * 0.25) / (size[2] * 0.6)))
            ca.data[l].color = (a, a, a, 1)
    ob.location.z = size[2] * 0.25 * 0.7
    bpy.ops.object.transform_apply(location=True); ob.select_set(False)
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
    'flowers_a': lambda n: flower_patch(n, 451),
    'rock_a': lambda n: rock(n, 501),
    'rock_b': lambda n: rock(n, 502, size=(2.2, 1.6, 1.4), facet=0.14),
    'rock_c': lambda n: rock(n, 503, size=(0.5, 0.4, 0.3), facet=0.2),
    'fence_spike': lambda n: fence_spike(n, 601),
    'crate': lambda n: crate(n),
    'maple_a': lambda n: maple(n, 901),
    'maple_b': lambda n: maple(n, 902, width=3.8, height=5.4, base=1.8, clusters=12),
    'maple_c': lambda n: maple(n, 903, width=3.0, height=4.2, base=1.4),
    'fir2_a': lambda n: fir2(n, 911, height=6.6, width=1.1),
    'fir2_b': lambda n: fir2(n, 912, height=7.6, width=1.3),
    'palm2_a': lambda n: palm2(n, 951),
    'palm2_b': lambda n: palm2(n, 952, height=3.8, frond=1.3, lean=0.9),
    'clover_a': lambda n: clover_bush(n, 921),
    'clover_b': lambda n: clover_bush(n, 922, radius=1.1),
    'grass_tall_a': lambda n: grass_tall_tuft(n, 931),
    'cliff_rock_a': lambda n: smooth_rock(n, 941),
    'cliff_rock_b': lambda n: smooth_rock(n, 942, size=(3.4, 2.2, 3.0), bulge=0.26),
    'boulder_a': lambda n: smooth_rock(n, 943, size=(1.3, 1.1, 0.9), bulge=0.18, sub=3),
    # 崖の面を作る縦長の岩の柱（B03 の崖: 幅 1〜1.5m・高さ 3m 前後の膨らんだ柱が並び、すき間が暗い割れ目になる）
    'cliff_col_a': lambda n: smooth_rock(n, 944, size=(1.5, 1.1, 4.6), bulge=0.14, flat_top=False),
    'cliff_col_b': lambda n: smooth_rock(n, 945, size=(1.2, 0.95, 4.0), bulge=0.18, flat_top=False),
    'house_a': lambda n: house(n, 801),
    'house_b': lambda n: house(n, 802, w=9.0, d=5.5, h=5.4, roof_h=3.0),
    'lamp': lambda n: lamp(n, 811),
    'banner_pole': lambda n: banner_pole(n, 812),
    'bench': lambda n: bench(n, 813),
    'planter': lambda n: planter(n, 814),
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
