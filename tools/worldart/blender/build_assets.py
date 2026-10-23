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
M_WOOD2 = lambda: material('wood2', 'crate2.png')
M_CRATE2 = lambda: material('crate2', 'crate2.png')
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
M_PLATE = lambda: material('leaf_plate', 'plate_maple.png', alpha=True)
M_CLUMP = lambda: material('leaf_clump', 'clump_maple.png', alpha=True)
M_CLOVER = lambda: material('leaf_clover', 'spray_clover.png', alpha=True)
M_FIR3 = lambda: material('leaf_fir3', 'frond_fir3.png', alpha=True)
M_FIR4 = lambda: material('leaf_fir4', 'fan_fir4.png', alpha=True)
M_FIRF = lambda: material('leaf_firfrond', 'frond_fir.png', alpha=True)
M_GRASS2 = lambda: material('grass_tall', 'grass_tall.png', alpha=True)
M_ROCK2 = lambda: material('rock_crack', 'rock_crack.png')
M_PALM2 = lambda: material('leaf_palm2', 'frond_palm.png', alpha=True)
M_CANVAS_B = lambda: material('canvas_beige', 'canvas_beige.png')
M_HIDE = lambda: material('canvas_hide', 'canvas_hide.png')
M_CANVAS_BL = lambda: material('canvas_blue', 'canvas_blue.png')
M_LAVENDER = lambda: material('leaf_lavender', 'lavender.png', alpha=True)
M_MEANDER = lambda: material('stone_meander', 'stone_meander.png')
M_FLAG = lambda: material('flagstone', 'ground_flagstone.png')
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


def fit_mesh_bounds(ob, lo, hi):
    """メッシュの外寸を保ちながら、少し崩した輪郭を指定寸法へ合わせる"""
    for axis in range(3):
        values = [v.co[axis] for v in ob.data.vertices]
        mn, mx = min(values), max(values)
        scale = (hi[axis] - lo[axis]) / (mx - mn)
        for v in ob.data.vertices:
            v.co[axis] = lo[axis] + (v.co[axis] - mn) * scale


def wooden_block(name, center, size, mat, seed, bevel_width, cuts=1, uv_size=0.8):
    """少しゆがませて角を丸めた木の板を作る"""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    ob = bpy.context.object; ob.name = name; ob.dimensions = size
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.subdivide(number_cuts=cuts)
    bpy.ops.object.mode_set(mode='OBJECT')
    R_ = random.Random(seed)
    for v in ob.data.vertices:
        for axis in range(3): v.co[axis] += R_.uniform(-0.018, 0.018) * size[axis]
    ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.cube_project(cube_size=uv_size)
    bpy.ops.object.mode_set(mode='OBJECT')
    md = ob.modifiers.new('丸い縁', 'BEVEL'); md.width = bevel_width; md.segments = 3
    bpy.ops.object.modifier_apply(modifier=md.name)
    return ob


def wood_colors(ob, height, base=0.66):
    ca = ob.data.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for poly in ob.data.polygons:
        for l in poly.loop_indices:
            z = ob.data.vertices[ob.data.loops[l].vertex_index].co.z
            a = base + (1.0 - base) * min(1.0, max(0.0, z / height))
            ca.data[l].color = (a, a * 0.97, a * 0.92, 1.0)


def crate2(name, size=0.8):
    ob = wooden_block(name, (0, 0, size / 2), (size, size, size), M_CRATE2(), 2051, 0.035, cuts=3, uv_size=size)
    fit_mesh_bounds(ob, (-size / 2, -size / 2, 0.0), (size / 2, size / 2, size))
    wood_colors(ob, size, 0.65)
    ob.data.name = name; ob.select_set(False)
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


def strip2(B, pts, widths, side, m, cols, nrm, v_end=1.0, u=(0.0, 1.0)):
    """折れ線に沿った帯（垂れる葉）。pts[0] が根元。UV v は 0→v_end、u は u[0]→u[1]（絵の一部・左右反転に使う）"""
    n = len(pts); acc = [0.0]
    for i in range(1, n): acc.append(acc[-1] + (pts[i] - pts[i - 1]).length)
    rows = [(B.add_v(p - side * w / 2), B.add_v(p + side * w / 2)) for p, w in zip(pts, widths)]
    for i in range(n - 1):
        v0, v1 = acc[i] / acc[-1] * v_end, acc[i + 1] / acc[-1] * v_end
        a, b = rows[i], rows[i + 1]
        B.face([a[0], a[1], b[1], b[0]], [(u[0], v0), (u[1], v0), (u[1], v1), (u[0], v1)], [cols[i], cols[i], cols[i + 1], cols[i + 1]], [nrm] * 4, m)


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
    n = 20
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


def fir3(name, seed, height=6.6, width=3.2):
    """もみ 第 3 世代（L24、見本 B03・R03）: 円錐に詰まった短い小枝（frond_fir3、長さ 0.7〜1.3m）を、幹から外へ下向きに垂らして段に重ねる。
    輪郭は先のとがった円錐（幅 ≈ 高さの 0.5、Hc で幅 ≈2・高さ 3〜5）。小枝の間に隙間をほとんど作らない（見本の樹冠は閉じる）。
    法線は円錐の軸から外向き + 上（アイデア04）。頂点色は下・内側ほど暗い青緑、上・外側の先ほど明るい黄緑（アイデア08）"""
    R_ = random.Random(seed); B = Builder()
    tube(B, [Vector((0, 0, -0.3)), Vector((0, 0, 0)), Vector((0, 0, height * 0.7))], [0.17, 0.15, 0.05], M_BARK(), sides=7, ao=(0.3, 0.45))
    tiers = 22
    base = height * 0.1
    for i in range(tiers):
        t = i / (tiers - 1)
        hz = base + (height * 0.97 - base) * t
        R = width / 2 * (1 - t) ** 0.95 + 0.15            # この高さの円錐の半径
        L = max(0.55, min(1.35, R * 0.75 + 0.35))           # 小枝の長さ
        n = max(4, int(round(2 * math.pi * R / 0.42)))      # 周りを隙間なく埋める本数
        for k in range(n):
            a = 2 * math.pi * k / n + i * 0.61 + R_.uniform(-.15, .15)
            out = Vector((math.cos(a), math.sin(a), 0)); side = out.cross(UP).normalized()
            r0 = max(0.0, R - L * 0.85)                      # 付け根（幹寄り）
            droop = R_.uniform(0.35, 0.6)
            pts = [Vector((0, 0, hz)) + out * (r0 + L * s) + UP * (-L * droop * s * s + 0.12 * s) for s in (0.0, 0.5, 1.0)]
            ws = [L * 0.55, L * 0.8, L * 0.55]
            tb = t ** 1.2
            c0 = crown_color(tb * 0.45, 0.0, 0.3, 0.68); c1 = crown_color(min(1.0, tb * 0.85 + 0.15), 1.0, 0.42 + 0.2 * tb, 0.75 + 0.45 * tb)
            cols = [c0, tuple((p_ + q_) / 2 for p_, q_ in zip(c0, c1)), c1]
            nrm = (out * 0.65 + UP * 0.55).normalized()
            strip2(B, pts, ws, side, M_FIR3(), cols, nrm)
    for k in range(4):                                       # てっぺん
        a = k * math.pi / 2 + 0.3
        out = Vector((math.cos(a), math.sin(a), 0)) * 0.18
        pts = [Vector((0, 0, height * 0.88)) + (out + UP) * s * 0.7 for s in (0, 0.5, 1)]
        strip2(B, pts, [0.35, 0.4, 0.25], out.cross(UP).normalized(), M_FIR3(), [crown_color(1.0, 1.0, 0.6, 1.15)] * 3, (out + UP).normalized())
    return B.build(name)


def fir4(name, seed, height=6.6, width=3.4, tiers=8, lean=0.15, upper_density=1.6):
    """もみ 第 4 世代（見本 art/ref/trees/T01〜T04、RO3 プロンテラ南門）: 段（輪生）に分かれた円錐。段ごとに、幹から外へ
    枝の絵（fan_fir4: 上から見た 1 本の枝、2 種類）を輪に並べ、先を垂らす。2 枚重ね（上の輪は短く、半歩ずらす）で段の上面を閉じる。
    枝の先がとがって段の縁がぎざぎざになり、段の下に暗い切れ目が残る。上の段ほど小さく明るい。細長い葉の帯（fir3）はシダに見えた。
    同じ形を繰り返さない（ユーザー、2026-10-23）: 枝ごとに絵の種類・左右反転・長さ・垂れ・向き・抜けを、段ごとに大きさ・高さ・片寄り・ねじれを揺らす。
    幹は少し傾け、木ごとに段の数と片寄りの向きを変える"""
    R_ = random.Random(seed); B = Builder()
    lx, ly = R_.uniform(-1, 1) * lean, R_.uniform(-1, 1) * lean    # 幹の傾き（先で lean m ずれる）
    def trunk(z): return Vector((lx * (z / height) ** 1.5, ly * (z / height) ** 1.5, z))
    tube(B, [Vector((0, 0, -0.3)), trunk(0), trunk(height * 0.4), trunk(height * 0.6)], [0.18, 0.15, 0.1, 0.02], M_BARK(), sides=7, ao=(0.3, 0.45))
    base = height * R_.uniform(0.12, 0.16)                    # 一番下の段の付け根。枝が下向きに出て、裾は地面の近くまで下がる（P02・P04）
    top = height * 0.9
    Rs = [(width / 2 * (1 - i / tiers) ** 1.15 + 0.2) * R_.uniform(0.86, 1.12) * R_.choice((1.0, 1.0, 1.0, 0.82, 1.16)) for i in range(tiers)]   # 段の外の半径（下から）。細くとがった先からまっすぐ広がる円錐（幅 ≈ 高さの 0.6、P02・P04・T01）
    gaps = [(r_ + width * 0.25) * R_.uniform(0.88, 1.12) for r_ in Rs[:-1]]   # 段の間隔は下ほど少し広い（段ごとに揺らす）
    zs = [base]
    for g in gaps: zs.append(zs[-1] + (top - base) * g / sum(gaps))
    phi = R_.uniform(0, 2 * math.pi)                           # 木全体の片寄りの向き（光の来る側へ枝が長い、など）
    for i in range(tiers):
        t = i / (tiers - 1)
        hz = zs[i]; R = Rs[i]
        tb = t ** 1.1
        upper = hz >= height * 0.45
        # 上半分は芯の層を幹へ寄せて太くし、内側の枝を増やして幹を隠す
        core_lf, core_rise = (0.62, 0.08) if upper else (0.48, 0.3)
        skew = R_.uniform(0.05, 0.22); phi_i = phi + R_.uniform(-0.8, 0.8)
        twist = R_.uniform(0, 2 * math.pi)
        tilt, tdir = R_.uniform(0.0, 0.1), R_.uniform(0, 2 * math.pi)   # 段の傾き（段全体が片側へ下がる。輪がそろうと作り物に見える）
        bright = R_.uniform(0.92, 1.08)                       # 段ごとの明るさの揺れ
        for layer, (lf, rise, dark) in enumerate([(1.0, 0.0, 0.0), (0.74, 0.14, 0.2), (core_lf, core_rise, 0.35)]):   # 外・中・芯の 3 枚重ね
            Lb = R * lf
            W = max(Lb * 1.05, 0.6)                           # 上の段も枝の幅を保つ（細いと幹が見えた）
            fill = upper_density if upper and layer > 0 else 1.0
            base_n = math.ceil(2 * math.pi * (Lb * 0.55) / (W * 0.45))
            n = max(4, int(math.ceil(base_n * fill)) + R_.choice((-1, 0, 0, 1)))
            for k in range(n):
                if layer == 0 and i < tiers - 2 and R_.random() < 0.09: continue   # ときどき枝が抜けて、下の段が見える
                a = twist + 2 * math.pi * (k + 0.37 * layer) / n + R_.uniform(-.25, .25)
                out = Vector((math.cos(a), math.sin(a), 0)); side = out.cross(UP).normalized()
                # 枝を軸のまわりに傾ける（ユーザー、2026-10-23）: 平らに寝かせると、上から枝の絵がそのまま読めてシダの葉に見える
                roll = R_.choice((-1, 1)) * R_.uniform(0.2, 0.5)
                side = (side * math.cos(roll) + UP * math.sin(roll)).normalized()
                L = Lb * (1 + skew * math.cos(a - phi_i)) * R_.uniform(0.78, 1.15)
                Wk = W * R_.uniform(0.82, 1.12)
                # 枝の向き（実物の写真 art/ref/trees/real/P02・P04・P05）: 下の段は幹から下向きに出て先が少し上へ反り、上の段ほど上を向く。
                # 水平に突き出すと不自然（ユーザー、2026-10-23）。内側の層はさらに下向きにして段の下を埋める
                # 枝は全部の段で幹から下向きに出て、先がさらに垂れる（ユーザー、2026-10-23: 枝が幹に垂直・上向きに見えた。
                # 前は上の段ほど上向き（最上段 +17°）で、枝先を反り上げていた）。下の段 -36°、上の段 -20°
                pitch = -0.62 + 0.28 * t + R_.uniform(-0.12, 0.12) - 0.2 * (layer == 2) - tilt * math.cos(a - tdir)
                curl = -(0.16 + 0.12 * t) * R_.uniform(0.7, 1.3)         # 枝先の垂れ（負 = 下へ。上の段の短い枝も垂れて見えるように）
                o = trunk(hz + rise * Lb + R_.uniform(-0.08, 0.08))
                drop = -math.sin(pitch) * L - curl * L + abs(math.sin(roll)) * Wk * 0.5   # 枝先・傾けた縁の下がる量
                if pitch < 0 and drop > o.z - 0.1:                         # 地面に潜らせない
                    pitch = -math.asin(max(0.0, min(0.95, (o.z - 0.1 + curl * L - abs(math.sin(roll)) * Wk * 0.5) / L)))
                L = L / max(0.6, math.cos(pitch))                       # 下向きの枝も水平には段の半径まで届かせる（裾を末広がりに）
                d_ = out * math.cos(pitch) + UP * math.sin(pitch)
                pts = [o + d_ * (L * s) + UP * (curl * L * s * s) for s in (0.0, 0.5, 1.0)]
                c0 = crown_color(min(1.0, 0.1 + 0.5 * tb), 0.0, 0.26 + 0.1 * tb + 0.1 * dark, 0.5 + 0.3 * tb)
                c1 = crown_color(min(1.0, 0.35 + 0.65 * tb + 0.1 * dark), 1.0, 0.42 + 0.2 * tb + 0.1 * dark, 0.8 + 0.4 * tb)
                j = R_.uniform(-0.1, 0.1); kb = bright * R_.uniform(0.93, 1.07)   # 枝ごとの黄み・明るさ
                c1 = (c1[0] * (1 + j) * kb, c1[1] * (1 + j * 0.6) * kb, c1[2] * (1 - j) * kb)
                cols = [c0, tuple((p_ + q_) / 2 for p_, q_ in zip(c0, c1)), c1]
                nrm = (out * 0.55 + UP * 0.8).normalized()             # 法線は段の丸みのまま（傾けた枝も段の面として光る、アイデア04）
                v = R_.choice((0.0, 0.25, 0.5, 0.75)); uu = (v, v + 0.25) if R_.random() < 0.5 else (v + 0.25, v)   # 絵の種類（4）と左右反転
                strip2(B, pts, [Wk * 0.9, Wk, Wk * 0.9], side, M_FIR4(), cols, nrm, u=uu)
    for k in range(4):                                        # てっぺん: ほぼ真上へ向いた細い枝で先をとがらせる（P04 の細い頂）
        a = k * 2 * math.pi / 4 + R_.uniform(0, 1.2)
        out = Vector((math.cos(a), math.sin(a), 0))
        o = trunk(top - 0.05)
        Lt = R_.uniform(0.7, 0.95)
        pts = [o + (out * R_.uniform(0.12, 0.28) + UP) * s * Lt for s in (0, 0.5, 1)]
        v = R_.choice((0.0, 0.25, 0.5, 0.75))
        strip2(B, pts, [0.5, 0.42, 0.28], out.cross(UP).normalized(), M_FIR4(), [crown_color(0.85, 1.0, 0.5, 1.05)] * 3, (out * 0.6 + UP).normalized(), u=(v, v + 0.25))
    # 樹冠の芯（定番の「中身の塊」）: 枝のカードの奥に、段の半径の 0.4 倍の暗い円錐を置く。段の間から幹と向こうの景色が
    # 透けて、上の段が薄く見えた（Luna 1・2 回目、art/shots/fir4/luna1・luna2）。縦のカードで埋めると外へとげが突き出た
    m_core = M_FIR4(); sides = 9                                # 絵は枝の絵の、葉で埋まった軸の近くの 1 点だけを使う（不透明）
    rings = []
    for i in range(tiers):
        z = zs[i] - Rs[i] * 0.25
        r = Rs[i] * 0.26 * (1 - 0.65 * i / tiers)   # 上の段ほど細く（枝が垂れると付け根の上に芯が黒い点で見えた）
        rings.append((trunk(z), r, tuple(0.45 * x for x in crown_color(0.08 + 0.3 * i / tiers, 0.0, 0.2, 0.42))))   # 影として読ませる（明るいと緑の柱に見えた）
    rings.append((trunk(top + 0.35), 0.02, crown_color(0.5, 0.0, 0.3, 0.6)))
    idx = []
    for c, r, _ in rings:
        idx.append([B.add_v(c + Vector((math.cos(2 * math.pi * k / sides), math.sin(2 * math.pi * k / sides), 0)) * r) for k in range(sides)])
    for i in range(len(rings) - 1):
        ca = rings[i][2]; cb = rings[i + 1][2]
        for k in range(sides):
            k2 = (k + 1) % sides
            q = [idx[i][k], idx[i][k2], idx[i + 1][k2], idx[i + 1][k]]
            na = Vector((math.cos(2 * math.pi * k / sides), math.sin(2 * math.pi * k / sides), -0.3)).normalized()   # 少し下向き（日が当たりにくい）
            nb = Vector((math.cos(2 * math.pi * k2 / sides), math.sin(2 * math.pi * k2 / sides), -0.3)).normalized()
            uvc = [(0.125, 0.3), (0.126, 0.3), (0.126, 0.301), (0.125, 0.301)]
            B.face(q, uvc, [ca, ca, cb, cb], [na, nb, nb, na], m_core)
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


def clover_bb(name):
    """クローバーの茂み: 光を描き込んだ絵を、カメラ向けに回す 5 枚の板へ貼る。中心は COLOR_0 に記録する。"""
    B = Builder()
    cards = [
        (Vector((0.00, -0.04, 0.125)), 1.58, 0.95, 0.00),
        (Vector((-0.35, -0.02, 0.10)), 1.36, 0.78, -0.12),
        (Vector((0.35, -0.02, 0.10)), 1.36, 0.79, 0.12),
        (Vector((0.00, 0.04, 0.09)), 1.99, 0.86, math.pi / 2),
        (Vector((0.00, 0.00, 0.09)), 1.66, 0.84, math.pi / 2),
    ]
    for center, width, height, angle in cards:
        right = Vector((math.cos(angle), math.sin(angle), 0))
        up = UP
        ps = [center - right * width / 2 - up * height / 2,
              center + right * width / 2 - up * height / 2,
              center + right * width / 2 + up * height / 2,
              center - right * width / 2 + up * height / 2]
        idx = [B.add_v(p) for p in ps]
        # glTF は (x, z, -y) に軸を変える。中心を 0〜1 に符号化し、実行時に aCenter として読む。
        center_gltf = (center.x, center.z, -center.y)
        encoded = (0.5 + center_gltf[0] / 2.2, center_gltf[1] / 1.2, 0.5 + center_gltf[2] / 2.2)
        cols = [encoded] * 4
        normal = right.cross(up).normalized()
        B.face(idx, [(0, 0), (1, 0), (1, 1), (0, 1)], cols, [normal] * 4, M_CLOVER_BB())
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


# ------------------------------------------------------------ 見本②（南パヨン）の小物と石の構造物
def teepee(name, seed, r=1.7, h=3.1):
    """円錐の天幕（B01 右下・B02 左下）: 10 角の円錐の布（canvas_beige、u=周 v=高さ）、入口の三角の切れ目、
    てっぺんから突き出た 6 本の木の支柱、裾の張り綱"""
    R_ = random.Random(seed); B = Builder(); n = 10
    top = Vector((0, 0, h)); door = 0
    for i in range(n):
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        p0 = Vector((math.cos(a0) * r, math.sin(a0) * r, 0)); p1 = Vector((math.cos(a1) * r, math.sin(a1) * r, 0))
        if i == door:     # 入口: 下 45% を開ける
            q0 = p0.lerp(top, 0.45); q1 = p1.lerp(top, 0.45)
            idx = [B.add_v(q) for q in (q0, q1, top)]
            B.face(idx, [(i / n, 0.45), ((i + 1) / n, 0.45), ((i + 0.5) / n, 1.0)], [(0.95,) * 3] * 3, None, M_CANVAS_B())
            continue
        idx = [B.add_v(q) for q in (p0, p1, top)]
        B.face(idx, [(i / n, 0.0), ((i + 1) / n, 0.0), ((i + 0.5) / n, 1.0)], [(0.8,) * 3, (0.8,) * 3, (1.05,) * 3], None, M_CANVAS_B())
    # 内側（暗い）: 入口から見える
    idx = [B.add_v(q) for q in (Vector((r * 0.95, 0, 0.02)), Vector((-r * 0.95, 0.2, 0.02)), top * 0.98)]
    B.face(idx, [(0, 0), (1, 0), (0.5, 1)], [(0.25,) * 3] * 3, None, M_CANVAS_B())
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.3
        base = Vector((math.cos(a) * r * 0.92, math.sin(a) * r * 0.92, 0))
        d = (top - base).normalized()
        tube(B, [base, top + d * R_.uniform(0.55, 0.85)], [0.055, 0.045], M_WOOD(), sides=5, ao=(0.9, 1.3), u0=0.5, u1=1.0)
    for k in range(4):
        a = 2 * math.pi * k / 4 + 0.8
        tube(B, [Vector((math.cos(a) * r * 0.8, math.sin(a) * r * 0.8, h * 0.35)), Vector((math.cos(a) * (r + 1.0), math.sin(a) * (r + 1.0), 0.0))],
             [0.012, 0.012], M_WOOD(), sides=3, ao=(0.8, 0.8))
    return B.build(name, smooth=False)


def teepee2(name, seed, r=1.9, h=3.0):
    """円錐の天幕 第 2 版（B02 左下の拡大から、L13）: 革の板を 3 段の裾に重ねた膨らんだ円錐。板は 7 枚で中ほどが外へ膨らみ、
    裾は板の中ほどで下がる（丸い縁）。上の段が下の段の上端に影を落とす（頂点色）。入口は下の段の板 1 枚を開ける。
    てっぺんに短く太い支柱 6 本の束を綱で縛り、太い綱 4 本が円錐の面を下ってから外の地面へ伸びる"""
    R_ = random.Random(seed); B = Builder()
    rc = lambda z: r * max(0.0, 1 - z / h) ** 0.85
    tiers = [(0.0, 1.25), (1.05, 2.15), (1.95, 2.85)]
    P_, M_ = 7, 5
    for ti, (zb, zt) in enumerate(tiers):
        a_off = ti * math.pi / P_
        for pi_ in range(P_):
            if ti == 0 and pi_ == 0: continue          # 入口
            ring_b, ring_t = [], []
            for m in range(M_ + 1):
                f = m / M_; a = a_off + 2 * math.pi * (pi_ + f) / P_
                bul = math.sin(math.pi * f)
                zb_ = zb - 0.14 * bul if ti == 0 else zb - 0.18 * bul
                rb = rc(max(zb_, 0)) * (1.06 + 0.10 * bul) + (0.04 if ti else 0)
                rt = rc(zt) * (1.0 + 0.05 * bul)
                d = Vector((math.cos(a), math.sin(a), 0))
                ring_b.append(d * rb + Vector((0, 0, max(zb_, 0.0)))); ring_t.append(d * rt + Vector((0, 0, zt)))
            vt = (0.62, 1.0) if ti else (0.0, 1.0)
            for m in range(M_):
                f0, f1 = m / M_, (m + 1) / M_
                idx = [B.add_v(q) for q in (ring_b[m], ring_b[m + 1], ring_t[m + 1], ring_t[m])]
                cb, ct = (1.0,) * 3, ((0.62,) * 3 if ti < 2 else (0.95,) * 3)
                B.face(idx, [(f0, vt[0]), (f1, vt[0]), (f1, vt[1]), (f0, vt[1])], [cb, cb, ct, ct], None, M_HIDE())
    # 入口の奥（暗い内側）
    a0, a1 = 0.0, 2 * math.pi / P_
    idx = [B.add_v(q) for q in (Vector((math.cos(a0) * r * 0.5, math.sin(a0) * r * 0.5, 0)), Vector((math.cos(a1) * r * 0.5, math.sin(a1) * r * 0.5, 0)),
                                Vector((0, 0, 1.3)))]
    B.face(idx, [(0, 0), (1, 0), (0.5, 0.5)], [(0.18,) * 3] * 3, None, M_HIDE())
    top = Vector((0, 0, h * 0.93))
    for k in range(6):       # 支柱の束
        a = 2 * math.pi * k / 6 + R_.uniform(-0.2, 0.2)
        d = Vector((math.cos(a) * 0.22, math.sin(a) * 0.22, 1.0)).normalized()
        b0 = top - d * 0.35 + Vector((math.cos(a), math.sin(a), 0)) * 0.05
        tube(B, [b0, b0 + d * R_.uniform(0.75, 0.95)], [0.14, 0.13], M_WOOD(), sides=6, ao=(0.8, 1.25), u0=0.5, u1=1.0)
    ring = [top + Vector((math.cos(t) * 0.2, math.sin(t) * 0.2, 0.05)) for t in [2 * math.pi * i / 8 for i in range(9)]]
    tube(B, ring, [0.05] * 9, M_WOOD(), sides=5, ao=(0.75, 0.9))
    for k in range(4):       # 張り綱: 面を下ってから外へ
        a = 2 * math.pi * k / 4 + 0.5
        d = Vector((math.cos(a), math.sin(a), 0))
        pts = [top + d * 0.2]
        for z in (2.3, 1.6, 1.0):
            pts.append(d * (rc(z) * 1.12 + 0.05) + Vector((0, 0, z)))
        pts += [d * (r + 1.2) + Vector((0, 0, 0.45)), d * (r + 2.6) + Vector((0, 0, 0.0))]
        tube(B, pts, [0.035] * len(pts), M_WOOD(), sides=4, ao=(0.7, 0.8))
    return B.build(name)


def tarp_tent(name, seed):
    """布をかけた荷の山（B01 左下、L03 で作り直し）: 2 段の木の荷箱に、薄い藤色の布を上からかぶせて四隅を外へ引く。
    布は 7x7 の面で、荷の上は平ら、縁は垂れ、四隅は斜めの金属の杭へ引かれる"""
    R_ = random.Random(seed); B = Builder()
    L, W = 2.1, 1.6
    box(B, -L / 2, -W / 2, 0.0, L / 2, W / 2, 0.75, M_CRATE(), (0.8, 0.8), lambda p: 0.7 + 0.3 * p.z / 0.75)
    box(B, -L / 2 + 0.15, -W / 2 + 0.1, 0.75, L / 2 - 0.1, W / 2 - 0.15, 1.45, M_CRATE(), (0.8, 0.8), lambda p: 0.75 + 0.25 * (p.z - 0.75) / 0.7)
    box(B, L / 2 - 0.05, -W / 2 - 0.1, 0.0, L / 2 + 0.55, W / 2 - 0.2, 0.9, M_CRATE(), (0.8, 0.8), lambda p: 0.7 + 0.3 * p.z / 0.9)   # 横の箱（布の外）
    N = 7; HT = 1.55
    grid = []
    for j in range(N):
        row = []
        for i in range(N):
            u, v = i / (N - 1), j / (N - 1)
            x = (u - 0.5) * (L + 0.5); y = (v - 0.5) * (W + 0.5)
            inside_ = abs(x) < L / 2 - 0.05 and abs(y) < W / 2 - 0.05
            edge = max(abs(x) / (L / 2 + 0.25), abs(y) / (W / 2 + 0.25))
            z = HT - (0.0 if inside_ else (edge - 0.82) * 6.0)          # 縁で垂れる
            corner = abs(abs(x) - (L / 2 + 0.25)) < 0.05 and abs(abs(y) - (W / 2 + 0.25)) < 0.05
            if corner: z = HT + 0.12                                     # 四隅は杭に引かれて持ち上がる
            z += R_.uniform(-0.03, 0.03) - 0.05 * math.sin(math.pi * u) * math.sin(math.pi * v)
            row.append(B.add_v(Vector((x, y, max(0.35, z)))))
        grid.append(row)
    for j in range(N - 1):
        for i in range(N - 1):
            B.face([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]],
                   [(i / (N - 1), j / (N - 1)), ((i + 1) / (N - 1), j / (N - 1)), ((i + 1) / (N - 1), (j + 1) / (N - 1)), (i / (N - 1), (j + 1) / (N - 1))],
                   [(1.0,) * 3] * 4, None, M_CANVAS_BL())
    for sx in (-1, 1):
        for sy in (-1, 1):
            c = Vector((sx * (L / 2 + 0.25), sy * (W / 2 + 0.25), HT + 0.12))
            g = Vector((sx * (L / 2 + 1.0), sy * (W / 2 + 0.9), -0.05))
            tube(B, [c, g], [0.035, 0.03], M_PAINT(), sides=5, ao=(0.55, 0.45))
            box(B, g.x - 0.08, g.y - 0.08, -0.05, g.x + 0.08, g.y + 0.08, 0.1, M_PAINT(), (0.3, 0.3), lambda p: 0.5)
    return B.build(name, smooth=False)


def barrel(name, seed, r=0.38, h=0.9):
    """樽: ふくらんだ胴（12 角）と 3 本の暗い帯、明るい木口のふた"""
    B = Builder(); n = 12; rings = []
    zs = [0, 0.12, 0.3, 0.5, 0.7, 0.88, 1.0]
    for z in zs:
        rr = r * (0.86 + 0.14 * math.sin(math.pi * z))
        rings.append([B.add_v(Vector((math.cos(2 * math.pi * i / n) * rr, math.sin(2 * math.pi * i / n) * rr, z * h))) for i in range(n + 1)])
    band = lambda z: abs(z - 0.12) < 0.07 or abs(z - 0.88) < 0.07 or abs(z - 0.5) < 0.05
    for j in range(len(zs) - 1):
        for i in range(n):
            zc = (zs[j] + zs[j + 1]) / 2
            c = (0.45,) * 3 if band(zc) else (0.95,) * 3
            B.face([rings[j][i], rings[j][i + 1], rings[j + 1][i + 1], rings[j + 1][i]],
                   [(i / n * 0.5, zs[j]), ((i + 1) / n * 0.5, zs[j]), ((i + 1) / n * 0.5, zs[j + 1]), (i / n * 0.5, zs[j + 1])], [c] * 4, None, M_WOOD())
    top = rings[-1]; cidx = B.add_v(Vector((0, 0, h)))
    for i in range(n):
        B.face([top[i], top[i + 1], cidx], [(0.6, 0.2), (0.9, 0.2), (0.75, 0.6)], [(1.1,) * 3] * 3, None, M_WOOD())
    return B.build(name, smooth=True)


def barrel2(name, seed, r=0.38, h=0.9):
    """樽の試作。丸い胴、浅い木色の帯、明るい木口"""
    R_ = random.Random(seed); B = Builder(); n = 16
    zs = [0.0, 0.12, 0.16, 0.30, 0.48, 0.52, 0.70, 0.84, 0.88, 1.0]
    phase = R_.uniform(0, math.tau)
    waves = [1.0 + 0.025 * math.sin(3 * 2 * math.pi * i / n + phase) + 0.008 * math.sin(5 * 2 * math.pi * i / n - phase) for i in range(n)]
    peak = max(waves)
    rings = []
    for z in zs:
        band = max(max(0.0, 1.0 - abs(z - c) / 0.045) for c in (0.14, 0.50, 0.86))
        rr = r * min(1.0, 0.86 + 0.14 * math.sin(math.pi * z) + 0.012 * band)
        rings.append([B.add_v(Vector((math.cos(2 * math.pi * i / n) * rr * waves[i % n] / peak,
                                      math.sin(2 * math.pi * i / n) * rr * waves[i % n] / peak, z * h))) for i in range(n + 1)])
    for j in range(len(zs) - 1):
        zc = (zs[j] + zs[j + 1]) / 2
        band = any(abs(zc - c) < 0.055 for c in (0.14, 0.50, 0.86))
        ao = 0.72 + 0.28 * zc
        shade = 0.78 if band else 0.96
        for i in range(n):
            B.face([rings[j][i], rings[j][i + 1], rings[j + 1][i + 1], rings[j + 1][i]],
                   [(i / n, zs[j]), ((i + 1) / n, zs[j]), ((i + 1) / n, zs[j + 1]), (i / n, zs[j + 1])],
                   [(ao * shade,) * 3] * 4, None, M_WOOD2())
    top = rings[-1]; cidx = B.add_v(Vector((0, 0, h)))
    for i in range(n):
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        B.face([top[i], top[i + 1], cidx],
               [((math.cos(a0) + 1) * 0.5, (math.sin(a0) + 1) * 0.5), ((math.cos(a1) + 1) * 0.5, (math.sin(a1) + 1) * 0.5), (0.5, 0.5)],
               [(1.06, 1.03, 0.98)] * 3, None, M_WOOD2())
    ob = B.build(name, smooth=True)
    fit_mesh_bounds(ob, (-r, -r, 0.0), (r, r, h))
    md = ob.modifiers.new('丸い縁', 'BEVEL'); md.width = 0.012; md.segments = 2
    bpy.ops.object.modifier_apply(modifier=md.name)
    ob.data.name = name; ob.select_set(False)
    return ob


def cart_frame(name, seed):
    """木の荷車の枠（B01 中央）: 床板と、すき間のある板の囲い（四辺）、角の柱"""
    B = Builder(); L, W, H = 1.8, 1.25, 0.95
    ao = lambda p: 0.72 + 0.35 * min(1, p.z / H)
    box(B, -L / 2, -W / 2, 0.25, L / 2, W / 2, 0.33, M_CRATE(), (1.2, 1.2), ao)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(B, sx * L / 2 - 0.06, sy * W / 2 - 0.06, 0.0, sx * L / 2 + 0.06, sy * W / 2 + 0.06, H, M_WOOD(), (0.6, 0.6), ao)
    for k, z in enumerate((0.45, 0.65, 0.85)):
        for sy in (-1, 1):
            box(B, -L / 2, sy * W / 2 - 0.03, z, L / 2, sy * W / 2 + 0.03, z + 0.11, M_CRATE(), (1.2, 1.2), ao)
        for sx in (-1, 1):
            box(B, sx * L / 2 - 0.03, -W / 2, z, sx * L / 2 + 0.03, W / 2, z + 0.11, M_CRATE(), (1.2, 1.2), ao)
    return B.build(name, smooth=False)


def cart_frame2(name, seed):
    """荷車の試作。丸い板の縁と少し不ぞろいな輪郭を保ち、外寸は旧型に合わせる"""
    R_ = random.Random(seed); parts = []; k = 0
    def add(center, size, mat, bevel):
        nonlocal k
        parts.append(wooden_block(f'{name}_part_{k:02d}', center, size, mat, seed + k * 17, bevel, cuts=1, uv_size=0.8)); k += 1
    L, W, H = 1.8, 1.25, 0.95
    add((0, 0, 0.29), (L, W, 0.08), M_CRATE2(), 0.018)
    for sx in (-1, 1):
        for sy in (-1, 1): add((sx * L / 2, sy * W / 2, H / 2), (0.12, 0.12, H), M_WOOD2(), 0.018)
    for z in (0.45, 0.65, 0.85):
        for sy in (-1, 1): add((0, sy * (W / 2 + 0.03), z + 0.055), (L, 0.06, 0.11), M_CRATE2(), 0.014)
        for sx in (-1, 1): add((sx * L / 2, 0, z + 0.055), (0.06, W, 0.11), M_CRATE2(), 0.014)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts: ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
    ob = bpy.context.object; ob.name = name; ob.data.name = name
    fit_mesh_bounds(ob, (-0.96, -0.685, 0.0), (0.96, 0.685, 0.96))
    wood_colors(ob, 0.96, 0.72)
    ob.select_set(False)
    return ob


def stump(name, seed, r=0.42, h=0.55):
    """切り株（B01・B02）: 根の張り出した低い胴（樹皮）と、明るい木口の上面"""
    R_ = random.Random(seed); B = Builder(); n = 10
    rings = []
    for z, sc in ((0.0, 1.45), (0.12, 1.15), (0.35, 1.0), (1.0, 0.96)):
        rings.append([B.add_v(Vector((math.cos(2 * math.pi * i / n) * r * sc * (1 + (0.18 if (i % 3 == 0 and z == 0) else 0)),
                                       math.sin(2 * math.pi * i / n) * r * sc * (1 + (0.18 if (i % 3 == 0 and z == 0) else 0)), z * h - (0.08 if z == 0 else 0)))) for i in range(n + 1)])
    for j in range(3):
        for i in range(n):
            B.face([rings[j][i], rings[j][i + 1], rings[j + 1][i + 1], rings[j + 1][i]],
                   [(i / n * 0.5, j / 3), ((i + 1) / n * 0.5, j / 3), ((i + 1) / n * 0.5, (j + 1) / 3), (i / n * 0.5, (j + 1) / 3)],
                   [(0.6 + 0.15 * j,) * 3] * 4, None, M_BARK())
    c = B.add_v(Vector((0, 0, h + 0.02)))
    for i in range(n):
        B.face([rings[3][i], rings[3][i + 1], c], [(0.55, 0.1), (0.95, 0.1), (0.75, 0.9)], [(1.2,) * 3] * 3, None, M_WOOD())
    return B.build(name)


def lavender_bush(name, seed):
    """ラベンダーの株: 6 枚の縦のカードを放射状に（下端が根元）。法線は外向き + 上"""
    R_ = random.Random(seed); B = Builder()
    for k in range(6):
        a = k * math.pi / 6 + R_.uniform(-.2, .2)
        side = Vector((math.cos(a), math.sin(a), 0)); out = side.cross(UP)
        card2(B, Vector((0, 0, 0)), (UP + out * 0.15).normalized(), side, 0.75, 0.75, M_LAVENDER(), [(0.85,) * 3, (1.1,) * 3], (out * 0.4 + UP).normalized())
    return B.build(name)


def stone_steps(name, seed, w=2.6, steps=12, rise=0.17, run=0.3):
    """石段 1 列（B04 奥、L03 で作り直し）: 浅い段がたくさん、踏み面は明るく蹴上げは暗い（頂点色）。
    列の間は細い角柱の手すり（幅 0.22m、段の高さ + 0.15m）。袖の厚い壁は付けない"""
    B = Builder()
    for i in range(steps):
        z1 = (i + 1) * rise; y0 = i * run
        hexa(B, [Vector((-w / 2, y0, -0.1)), Vector((w / 2, y0, -0.1)), Vector((w / 2, steps * run + 0.4, -0.1)), Vector((-w / 2, steps * run + 0.4, -0.1))],
             [Vector((-w / 2, y0, z1)), Vector((w / 2, y0, z1)), Vector((w / 2, steps * run + 0.4, z1)), Vector((-w / 2, steps * run + 0.4, z1))],
             M_FLAG(), (3, 3), lambda p: 0.82 + 0.18 * min(1, p.z / (steps * rise)))
        # 蹴上げを暗く（直前の 6 面のうち前の面 = 3 番目の側面）
        B.col[-4] = [(0.62,) * 3] * 4
    for sx in (-1, 1):
        x0 = sx * w / 2
        pts_b = [Vector((x0 - 0.11, -0.05, -0.1)), Vector((x0 + 0.11, -0.05, -0.1)), Vector((x0 + 0.11, steps * run + 0.4, -0.1)), Vector((x0 - 0.11, steps * run + 0.4, -0.1))]
        pts_t = [Vector((x0 - 0.11, -0.05, 0.32)), Vector((x0 + 0.11, -0.05, 0.32)), Vector((x0 + 0.11, steps * run + 0.4, steps * rise + 0.15)), Vector((x0 - 0.11, steps * run + 0.4, steps * rise + 0.15))]
        hexa(B, pts_b, pts_t, M_STONE(), (1.5, 1.5), lambda p: 0.85)
    return B.build(name, smooth=False)


def pedestal_statue(name, seed):
    """台座と座った戦士の石像（B04）: 台座 = 雷文の帯のある四角。像は球・円柱を組んでボクセルで溶かし、なめらかにした塊
    （見本は鎧の戦士。細部は再現しない: 大きさ・シルエット・苔の色を合わせる）"""
    R_ = random.Random(seed); B = Builder()
    pw, pd, ph = 1.6, 1.4, 0.85   # L09: 台座は小さく、像ははみ出す大きさ（下で 1.45 倍）
    box(B, -pw / 2 - 0.12, -pd / 2 - 0.12, -0.2, pw / 2 + 0.12, pd / 2 + 0.12, 0.18, M_STONE(), (2, 2), lambda p: 0.8)
    box(B, -pw / 2, -pd / 2, 0.18, pw / 2, pd / 2, ph, M_MEANDER(), (pw, ph), lambda p: 0.85 + 0.15 * p.z / ph, skip=('bottom',))
    base_ob = B.build(name + '_base', smooth=False)
    parts = []
    def add(prim, loc, scale, rot=(0, 0, 0)):
        if prim == 'sphere': bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=loc, segments=16, ring_count=10)
        else: bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=2, location=loc, vertices=14)
        o = bpy.context.object; o.scale = scale; o.rotation_euler = rot; parts.append(o)
    z = ph
    add('cyl', (0, 0.1, z + 0.35), (0.75, 0.6, 0.35))                       # 腰掛け（岩）
    add('sphere', (0, 0.15, z + 1.25), (0.62, 0.48, 0.72))                  # 胴
    add('sphere', (0, 0.12, z + 2.05), (0.3, 0.3, 0.33))                    # 頭
    add('sphere', (-0.62, 0.15, z + 1.62), (0.32, 0.3, 0.28))               # 肩当て
    add('sphere', (0.62, 0.15, z + 1.62), (0.32, 0.3, 0.28))
    add('cyl', (-0.75, -0.05, z + 1.1), (0.16, 0.16, 0.45), (0.25, 0, 0))   # 腕
    add('cyl', (0.75, -0.05, z + 1.1), (0.16, 0.16, 0.45), (0.25, 0, 0))
    add('cyl', (-0.32, -0.35, z + 0.72), (0.2, 0.2, 0.42), (1.35, 0, 0))    # もも
    add('cyl', (0.32, -0.35, z + 0.72), (0.2, 0.2, 0.42), (1.35, 0, 0))
    add('cyl', (-0.34, -0.75, z + 0.35), (0.17, 0.17, 0.38))                # すね
    add('cyl', (0.34, -0.75, z + 0.35), (0.17, 0.17, 0.38))
    add('sphere', (-0.34, -0.85, z + 0.06), (0.2, 0.3, 0.1))                # 足
    add('sphere', (0.34, -0.85, z + 0.06), (0.2, 0.3, 0.1))
    add('cyl', (0.0, -0.55, z + 1.0), (0.07, 0.07, 0.8), (0.0, 0, 0))       # 剣（ひざの間に立てる）
    add('sphere', (0.0, -0.55, z + 1.85), (0.22, 0.06, 0.05))               # 鍔
    for k in range(5):                                                        # 草摺（腰から垂れる板）
        a = -0.9 + k * 0.45
        add('cyl', (math.sin(a) * 0.55, -0.15 - math.cos(a) * 0.45, z + 0.78), (0.2, 0.05, 0.3), (0.25, 0, -a))
    add('sphere', (-0.36, -0.95, z + 0.1), (0.24, 0.36, 0.14))                # 大きな足（指先が台座の縁に）
    add('sphere', (0.36, -0.95, z + 0.1), (0.24, 0.36, 0.14))
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
    st = bpy.context.object; st.name = name + '_fig'
    md = st.modifiers.new('rm', 'REMESH'); md.mode = 'VOXEL'; md.voxel_size = 0.07; bpy.ops.object.modifier_apply(modifier='rm')
    md = st.modifiers.new('sm', 'SMOOTH'); md.factor = 0.6; md.iterations = 6; bpy.ops.object.modifier_apply(modifier='sm')
    md = st.modifiers.new('dc', 'DECIMATE'); md.ratio = 0.35; bpy.ops.object.modifier_apply(modifier='dc')
    for v_ in st.data.vertices: v_.co = v_.co + Vector((0, 0.32, 0))   # 足を台座の上に（奥へ 0.32m）。像の大きさは見本のすね ≈ 1.1m に合わせて 1.0 倍
    for p_ in st.data.polygons: p_.use_smooth = True
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.cube_project(cube_size=2.0); bpy.ops.object.mode_set(mode='OBJECT')
    st.data.materials.append(M_ROCK2())
    ca = st.data.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for poly_ in st.data.polygons:
        for l in poly_.loop_indices:
            zz = st.data.vertices[st.data.loops[l].vertex_index].co.z
            a = 0.7 + 0.35 * min(1, max(0, (zz - ph) / 2.2)); ca.data[l].color = (a * 0.92, a, a * 0.85, 1)
    bpy.ops.object.select_all(action='DESELECT'); st.select_set(True); base_ob.select_set(True)
    bpy.context.view_layer.objects.active = base_ob; bpy.ops.object.join()
    ob = bpy.context.object; ob.name = name; ob.data.name = name; ob.select_set(False)
    return ob


def slab(B, p0, p1, side, w0, w1, d, m, ao=None):
    """p0 → p1 の向きの板（幅 w0 → w1、厚み d）。side は幅の向き、厚みは軸と side に直交"""
    ax = (p1 - p0).normalized(); sd = (side - ax * side.dot(ax)).normalized(); nm = ax.cross(sd).normalized()
    b = [p0 - sd * w0 / 2 - nm * d / 2, p0 + sd * w0 / 2 - nm * d / 2, p0 + sd * w0 / 2 + nm * d / 2, p0 - sd * w0 / 2 + nm * d / 2]
    t = [p1 - sd * w1 / 2 - nm * d / 2, p1 + sd * w1 / 2 - nm * d / 2, p1 + sd * w1 / 2 + nm * d / 2, p1 - sd * w1 / 2 + nm * d / 2]
    hexa(B, b, t, m, (1, 1), ao)


def pedestal_statue2(name, seed):
    """台座と座った鎧の戦士の石像 第 2 版（B04 の拡大から、L20）。
    見本: 像は台座の奥の腰掛けに座り、画面の左の脚はすねを真っすぐ下ろして素足を台座の前に、右の脚はひざを外へ開いて素足を台座の右の縁へ。
    腰から前へ縦の筋と鋲のある前垂れ、ももに重ねた板の草摺、左のひざに手。素足とすねに苔。
    → 肌（脚・足・手・胴・頭）は球をつないでボクセルで溶かす、鎧（前垂れ・草摺・胸当て・肩当て）は角のある板（Builder）"""
    R_ = random.Random(seed); B = Builder()
    pw, pd, ph = 1.6, 1.4, 0.85
    box(B, -pw / 2 - 0.12, -pd / 2 - 0.12, -0.2, pw / 2 + 0.12, pd / 2 + 0.12, 0.18, M_STONE(), (2, 2), lambda p: 0.8)
    box(B, -pw / 2, -pd / 2, 0.18, pw / 2, pd / 2, ph, M_MEANDER(), (pw, ph), lambda p: 0.85 + 0.15 * p.z / ph, skip=('bottom',))
    base_ob = B.build(name + '_base', smooth=False)
    z = ph; V = lambda x, y, zz: Vector((x, y, z + zz))
    parts = []
    def sph(c, sc):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=c, segments=16, ring_count=10); o = bpy.context.object; o.scale = sc; parts.append(o)
    def limb(a, b, r0, r1, n=10):   # L20b: 球を密に・太く（見本の脚は太い。粗いと数珠に見えた）
        for i in range(n + 1):
            t = i / n; sph(a.lerp(b, t), ((r0 + (r1 - r0) * t) * 1.3,) * 3)
    # 腰掛け（台座の奥）・胴・頭
    bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=2, location=V(0, 0.38, 0.42), vertices=14); o = bpy.context.object; o.scale = (0.72, 0.42, 0.42); parts.append(o)
    sph(V(0, 0.22, 1.62), (0.58, 0.42, 0.62)); sph(V(0, 0.18, 2.42), (0.27, 0.27, 0.3))
    # 画面の左の脚（像の右）: もも → ひざ → すね真っすぐ → 素足は台座の前
    limb(V(-0.3, 0.2, 1.02), V(-0.42, -0.42, 0.98), 0.24, 0.2); limb(V(-0.42, -0.42, 0.98), V(-0.42, -0.5, 0.16), 0.18, 0.14)
    sph(V(-0.42, -0.62, 0.08), (0.19, 0.3, 0.1))
    for k in range(4): sph(V(-0.52 + k * 0.07, -0.88, 0.06), (0.045, 0.06, 0.05))          # 足の指
    # 画面の右の脚: ひざを外へ開き、素足は台座の右の縁（指先は右へ）
    limb(V(0.3, 0.2, 1.02), V(0.66, -0.25, 0.92), 0.24, 0.2); limb(V(0.66, -0.25, 0.92), V(0.6, -0.12, 0.16), 0.18, 0.14)
    sph(V(0.72, -0.12, 0.08), (0.3, 0.18, 0.1))
    for k in range(4): sph(V(0.99, -0.2 + k * 0.06, 0.06), (0.06, 0.04, 0.05))
    # 腕: 左のひざに手、右は肩から下ろして太ももの上
    limb(V(-0.62, 0.15, 1.85), V(-0.62, -0.15, 1.35), 0.17, 0.15); limb(V(-0.62, -0.15, 1.35), V(-0.46, -0.42, 1.12), 0.15, 0.13)
    sph(V(-0.44, -0.48, 1.12), (0.2, 0.17, 0.11))
    limb(V(0.64, 0.15, 1.85), V(0.7, -0.05, 1.3), 0.17, 0.15); sph(V(0.7, -0.15, 1.12), (0.18, 0.18, 0.12))
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
    st = bpy.context.object; st.name = name + '_fig'
    md = st.modifiers.new('rm', 'REMESH'); md.mode = 'VOXEL'; md.voxel_size = 0.05; bpy.ops.object.modifier_apply(modifier='rm')
    md = st.modifiers.new('sm', 'SMOOTH'); md.factor = 0.6; md.iterations = 8; bpy.ops.object.modifier_apply(modifier='sm')
    md = st.modifiers.new('dc', 'DECIMATE'); md.ratio = 0.3; bpy.ops.object.modifier_apply(modifier='dc')
    for p_ in st.data.polygons: p_.use_smooth = True
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.cube_project(cube_size=2.0); bpy.ops.object.mode_set(mode='OBJECT')
    st.data.materials.append(M_ROCK2())
    ca = st.data.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for poly_ in st.data.polygons:
        for l in poly_.loop_indices:
            zz = st.data.vertices[st.data.loops[l].vertex_index].co.z
            a = 0.72 + 0.3 * min(1, max(0, (zz - ph) / 2.2)); ca.data[l].color = (a * 0.92, a, a * 0.85, 1)
    # 鎧（角のある板）。材質は像の肌と同じ石（M_STONE の煉瓦の絵だと壁に見えた）
    A = Builder(); ao = lambda p: 0.78 + 0.22 * min(1, max(0, (p.z - ph) / 2.0)); X = Vector((1, 0, 0))
    slab(A, V(0, -0.4, 1.38), V(0, -0.66, 0.3), X, 0.66, 0.98, 0.08, M_ROCK2(), ao)            # 前垂れ（ひざの間を覆い台座の近くまで）
    for k in range(5):                                                                            # 縦の筋
        f = (k - 2) / 2
        slab(A, V(f * 0.24, -0.45, 1.32), V(f * 0.36, -0.71, 0.36), X, 0.04, 0.05, 0.06, M_ROCK2(), lambda p: 0.7)
    for k in range(6):                                                                            # 鋲（縁）
        t = k / 5
        for sx in (-1, 1):
            c = V(sx * (0.31 + 0.15 * t), -0.45 - 0.26 * t, 1.3 - 0.98 * t); box(A, c.x - 0.025, c.y - 0.03, c.z - 0.025, c.x + 0.025, c.y + 0.0, c.z + 0.025, M_ROCK2(), (0.2, 0.2), lambda p: 1.0)
    for sx, kx in ((-1, -0.42), (1, 0.6)):                                                        # 草摺: ももに重ねた板 3 段
        for r in range(3):
            t = r / 3
            hip = V(sx * 0.32, 0.12, 1.2); knee = V(kx, -0.36 if sx < 0 else -0.2, 1.08)
            a0 = hip.lerp(knee, t) + Vector((0, 0, 0.16)); a1 = hip.lerp(knee, t + 0.42) + Vector((0, 0, 0.1))
            slab(A, a0, a1, Vector((0, 0, 1)).cross((knee - hip).normalized()), 0.66, 0.6, 0.07, M_ROCK2(), ao)
    slab(A, V(0, -0.12, 1.25), V(0, -0.1, 2.05), X, 0.95, 1.05, 0.12, M_ROCK2(), ao)               # 胸当て
    for sx in (-1, 1):                                                                            # 肩当て 3 段
        for r in range(3):
            c = V(sx * (0.62 + 0.04 * r), 0.15, 2.0 - 0.13 * r)
            slab(A, c + Vector((-sx * 0.1, 0, 0.1)), c + Vector((sx * 0.22, 0, -0.12)), Vector((0, 1, 0)), 0.55, 0.5, 0.07, M_ROCK2(), ao)
    slab(A, V(-0.95, 0.25, 0.0), V(-0.8, 0.0, 2.3), Vector((0, 1, 0)), 0.16, 0.13, 0.08, M_ROCK2(), lambda p: 0.6)   # 剣（左に立てる）
    arm = A.build(name + '_armor', smooth=False)
    bpy.ops.object.select_all(action='DESELECT'); st.select_set(True); arm.select_set(True); base_ob.select_set(True)
    bpy.context.view_layer.objects.active = base_ob; bpy.ops.object.join()
    ob = bpy.context.object; ob.name = name; ob.data.name = name; ob.select_set(False)
    return ob


def stone_lantern(name, seed):
    """石の灯籠（B04）: 台・柱・火袋・笠・宝珠"""
    B = Builder(); ao = lambda p: 0.75 + 0.3 * min(1, p.z / 1.8)
    box(B, -0.32, -0.32, -0.1, 0.32, 0.32, 0.18, M_STONE(), (1, 1), ao)
    tube(B, [Vector((0, 0, 0.18)), Vector((0, 0, 1.05))], [0.13, 0.11], M_STONE(), sides=8, ao=(0.8, 0.95))
    box(B, -0.26, -0.26, 1.05, 0.26, 0.26, 1.12, M_STONE(), (1, 1), ao)
    box(B, -0.19, -0.19, 1.12, 0.19, 0.19, 1.45, M_STONE(), (1, 1), lambda p: 0.55)
    # 笠（四角錐）
    tp = Vector((0, 0, 1.78))
    cs = [Vector((-0.42, -0.42, 1.45)), Vector((0.42, -0.42, 1.45)), Vector((0.42, 0.42, 1.45)), Vector((-0.42, 0.42, 1.45))]
    for i in range(4):
        idx = [B.add_v(q) for q in (cs[i], cs[(i + 1) % 4], tp)]
        B.face(idx, [(0, 0), (1, 0), (0.5, 1)], [(0.9,) * 3, (0.9,) * 3, (1.05,) * 3], None, M_STONE())
    tube(B, [Vector((0, 0, 1.75)), Vector((0, 0, 1.92))], [0.07, 0.02], M_STONE(), sides=6, ao=(1, 1))
    return B.build(name, smooth=False)


def curb(name, seed, L=3.0):
    """低い石の縁石（B04 の草地と敷石・台地の縁）: 長さ 3m、幅 0.3m、高さ 0.25m"""
    B = Builder()
    box(B, -0.15, -L / 2, -0.1, 0.15, L / 2, 0.25, M_STONE(), (1.5, 1.5), lambda p: 0.8 + 0.2 * min(1, p.z / 0.25))   # 長さは Y（lines の向き）
    return B.build(name, smooth=False)


def rail_fence(name, seed, L=3.0):
    """木の柵（B04 奥）: 柱 2 本と横木 2 本"""
    B = Builder()
    for y in (-L / 2 + 0.1, L / 2 - 0.1):
        box(B, -0.06, y - 0.06, -0.1, 0.06, y + 0.06, 1.0, M_WOOD(), (0.5, 0.5), lambda p: 0.7)
    for z in (0.45, 0.85):
        box(B, -0.04, -L / 2, z, 0.04, L / 2, z + 0.09, M_WOOD(), (1.5, 1.5), lambda p: 0.75)
    return B.build(name, smooth=False)


def maple2(name, seed, height=6.0, width=4.2, base=2.0, tiers=5, dens=1.0):
    """広葉樹 第 3 世代（見本② B01/B02、L06）: 細い幹が上まで伸び、枝ごとに平たい葉の房（plate_maple、1.2〜1.7m）を
    ほぼ水平（外へ 15〜35° 傾ける）に置き、段を 4〜5 つ重ねる。上の段ほど小さく明るい。段の間から幹と下の房の陰が見える"""
    R_ = random.Random(seed); B = Builder()
    lean = Vector((R_.uniform(-.2, .2), R_.uniform(-.2, .2), 0))
    top = Vector((0, 0, height * 0.92)) + lean
    tube(B, [Vector((0, 0, -0.3)), Vector((0, 0, 0)), Vector((0, 0, base)) + lean * 0.3, Vector((0, 0, height * 0.6)) + lean * 0.7, top],
         [0.16, 0.14, 0.11, 0.08, 0.04], M_BARK(), sides=7, ao=(0.55, 0.85))
    for i in range(tiers):
        t = i / (tiers - 1)
        z = base + (height * 0.95 - base) * t
        rad = width / 2 * (1.0 - 0.35 * t) * R_.uniform(0.9, 1.05)
        cnt = max(3, int(round((9 - 5 * t) * dens)))
        a0 = R_.uniform(0, 6.28)
        for k in range(cnt):
            a = a0 + 2 * math.pi * k / cnt + R_.uniform(-0.35, 0.35)
            out = Vector((math.cos(a), math.sin(a), 0))
            ctr = Vector((0, 0, z + R_.uniform(-0.25, 0.25))) + lean * (z / height) + out * rad * R_.uniform(0.35, 0.7)
            st = Vector((0, 0, z - 0.35)) + lean * (z / height)
            tube(B, [st, ctr - out * 0.45 - UP * 0.2], [0.04, 0.02], M_BARK(), sides=5, ao=(0.55, 0.75))   # 枝は房の下で終える（上から星形に見えない、L10）
            S = R_.uniform(1.25, 1.7) * (1.0 - 0.25 * t)
            tilt = math.radians(R_.uniform(15, 35))
            nrm_plate = (UP * math.cos(tilt) + out * math.sin(tilt)).normalized()
            fwd = (out - nrm_plate * out.dot(nrm_plate)).normalized(); side = nrm_plate.cross(fwd).normalized()
            rot = R_.uniform(0, 6.28); fwd, side = (fwd * math.cos(rot) + side * math.sin(rot)), (side * math.cos(rot) - fwd * math.sin(rot))
            hb = 0.45 + 0.55 * t
            c0 = crown_color(hb * 0.8, 0.5, 0.4, 0.95); c1 = crown_color(min(1.0, hb), 1.0, 0.45, 1.02)
            nrm = (nrm_plate * 0.6 + (ctr - Vector((0, 0, (base + height) / 2))).normalized() * 0.4).normalized()
            card2(B, ctr - fwd * S / 2, fwd, side, S, S, M_PLATE(), [c0, c1], nrm)
            if R_.random() < 0.6:     # 房の下にもう 1 枚（厚み）
                card2(B, ctr - fwd * S * 0.45 - nrm_plate * 0.25 + side * 0.2, fwd, side, S * 0.9, S * 0.9, M_PLATE(),
                      [crown_color(hb * 0.5, 0.3, 0.45, 0.9), crown_color(hb * 0.7, 0.6, 0.45, 1.0)], nrm)
    S = width * 0.42; ctr = top + Vector((0, 0, 0.12))       # 頂の房: 幹の先と最上段の枝を上から隠す（L10）
    card2(B, ctr - Vector((S / 2, 0, 0)), Vector((1, 0, 0)), Vector((0, 1, 0)), S, S, M_PLATE(),
          [crown_color(0.9, 1.0, 0.45, 1.0), crown_color(1.0, 1.0, 0.45, 1.02)], UP)
    return B.build(name)


def temple_wall(name, seed, L=6.0, H=3.6):
    """奥の建物の壁（B04 の上、L09）: 石の腰壁の上に暗い木の板壁と太い柱、上に横の梁。長さは Y（lines の向き）"""
    B = Builder()
    box(B, -0.3, -L / 2, -0.1, 0.3, L / 2, 0.9, M_STONE(), (2, 2), lambda p: 0.7)
    box(B, -0.2, -L / 2, 0.9, 0.2, L / 2, H, M_WOOD(), (1.5, 1.5), lambda p: 0.32)
    for y in (-L / 2 + 0.2, 0.0, L / 2 - 0.2):
        box(B, -0.32, y - 0.18, 0.9, 0.32, y + 0.18, H + 0.2, M_WOOD(), (1, 1), lambda p: 0.42)
    box(B, -0.36, -L / 2, H - 0.2, 0.36, L / 2, H + 0.25, M_WOOD(), (1.5, 1.5), lambda p: 0.4)
    return B.build(name, smooth=False)


# ------------------------------------------------------------ 第 1 層 ひだまりの草原（f1_field、L25）の小物
def tint_last(B, k, tint):
    """直前の k 面の頂点色に tint を掛ける"""
    for j in range(1, k + 1): B.col[-j] = [tuple(c * t for c, t in zip(cc, tint)) for cc in B.col[-j]]


def chest_s(name, seed, w=0.9, d=0.6, h=0.42):
    """小さな宝箱（ゲームの屋外の宝箱）: 木の箱と、かまぼこ形のふた、鉄の帯（暗い頂点色）、金の錠前。正面は -y（three.js では +z）"""
    B = Builder(); ao = lambda p: 0.7 + 0.3 * min(1, max(0, p.z / (h + 0.3)))
    box(B, -w / 2, -d / 2, 0, w / 2, d / 2, h, M_CRATE(), (0.9, 0.9), ao)
    # ふた: 半円の断面を x に押し出す（8 分割）
    n = 8; rr = d / 2; sides = []
    for sx in (-w / 2, w / 2):
        sides.append([Vector((sx, -math.cos(math.pi * i / n) * rr, h + math.sin(math.pi * i / n) * rr * 0.62)) for i in range(n + 1)])
    for i in range(n):
        ps = [sides[0][i], sides[1][i], sides[1][i + 1], sides[0][i + 1]]
        idx = [B.add_v(q) for q in ps]
        B.face(idx, [(0, i / n), (1, i / n), (1, (i + 1) / n), (0, (i + 1) / n)], [(1.05,) * 3] * 4, None, M_WOOD())
    for k, sx in enumerate((-w / 2, w / 2)):
        c = B.add_v(Vector((sx, 0, h)))
        for i in range(n):
            tri = [sides[k][i], sides[k][i + 1], c] if k else [sides[k][i + 1], sides[k][i], c]
            B.face([B.add_v(q) if isinstance(q, Vector) else q for q in tri[:2]] + [c], [(0, 0), (1, 0), (0.5, 0.5)], [(0.9,) * 3] * 3, None, M_WOOD())
    # 鉄の帯（箱とふたに 2 本ずつ。少し外へ出した暗い板）
    for bx in (-w * 0.32, w * 0.32):
        box(B, bx - 0.035, -d / 2 - 0.012, 0, bx + 0.035, d / 2 + 0.012, h, M_STONE(), (1, 1), lambda p: 0.42)
        for i in range(n):
            a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
            q0 = Vector((bx, -math.cos(a0) * (rr + 0.012), h + math.sin(a0) * (rr + 0.012) * 0.62)); q1 = Vector((bx, -math.cos(a1) * (rr + 0.012), h + math.sin(a1) * (rr + 0.012) * 0.62))
            ps = [q0 + Vector((-0.035, 0, 0)), q0 + Vector((0.035, 0, 0)), q1 + Vector((0.035, 0, 0)), q1 + Vector((-0.035, 0, 0))]
            B.face([B.add_v(q) for q in ps], [(0, 0), (1, 0), (1, 1), (0, 1)], [(0.42,) * 3] * 4, None, M_STONE())
    # 錠前（金）
    tinted_box(B, -0.08, -d / 2 - 0.04, h - 0.16, 0.08, -d / 2 + 0.005, h + 0.05, M_PAINT(), (1.35, 1.0, 0.38))
    return B.build(name, smooth=False)


def signpost(name, seed, h=2.3):
    """道しるべ（分かれ道）: 細い角柱と、矢羽の形の板 3 枚（向きを変えて高さをずらす）、柱の頭に小さな笠"""
    R_ = random.Random(seed); B = Builder()
    box(B, -0.1, -0.1, -0.25, 0.1, 0.1, h, M_WOOD(), (0.6, 0.6), lambda p: 0.62 + 0.3 * min(1, max(0, p.z / h)))
    for k, (ang, z) in enumerate(((10, 1.85), (125, 1.55), (-110, 1.25))):
        a = math.radians(ang + R_.uniform(-6, 6)); dx, dy = math.cos(a), math.sin(a); nx, ny = -dy, dx
        L, W, T = 1.05, 0.3, 0.06
        def P(u, v, t): return Vector((dx * u + nx * t, dy * u + ny * t, z + v))
        pts = [(0.05, -W / 2), (L - 0.14, -W / 2), (L, 0), (L - 0.14, W / 2), (0.05, W / 2)]
        for t, flip in ((-T / 2, True), (T / 2, False)):
            ring = [P(u, v, t) for u, v in pts]
            if flip: ring = ring[::-1]
            idx = [B.add_v(q) for q in ring]
            B.face(idx, [((u) / L, (v + W / 2) / W * 0.3) for u, v in (pts[::-1] if flip else pts)], [(1.25, 1.18, 1.05)] * 5, None, M_CRATE())
        for i in range(5):
            j = (i + 1) % 5
            ps = [P(*pts[i], -T / 2), P(*pts[j], -T / 2), P(*pts[j], T / 2), P(*pts[i], T / 2)]
            B.face([B.add_v(q) for q in ps], [(0, 0), (1, 0), (1, 0.05), (0, 0.05)], [(0.75,) * 3] * 4, None, M_WOOD())
    tp = Vector((0, 0, h + 0.22)); cs = [Vector((sx * 0.17, sy * 0.17, h)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for i in range(4):
        B.face([B.add_v(q) for q in (cs[i], cs[(i + 1) % 4], tp)], [(0, 0), (1, 0), (0.5, 1)], [(0.85,) * 3] * 3, None, M_WOOD())
    return B.build(name, smooth=False)


def waygate(name, seed, span=4.6, h=3.3):
    """出口の門（エリアの出口）: 道の両側の太い丸太の柱、上に反った横木 2 本、中央に吊るした札。幅は X（道を横切る向き）"""
    R_ = random.Random(seed); B = Builder()
    for sx in (-1, 1):
        x = sx * span / 2
        tube(B, [Vector((x, 0, -0.3)), Vector((x + sx * 0.04, 0, h * 0.5)), Vector((x, 0, h + 0.15))], [0.2, 0.17, 0.16], M_BARK(), sides=9, ao=(0.5, 0.95))
        # 柱の根元の石（3 個）
        for k in range(3):
            a = k * 2.1 + R_.uniform(-.3, .3)
            box(B, x + math.cos(a) * 0.32 - 0.13, math.sin(a) * 0.32 - 0.11, -0.1, x + math.cos(a) * 0.32 + 0.13, math.sin(a) * 0.32 + 0.11, 0.16, M_STONE(), (1, 1), lambda p: 0.7)
    def beam(z, over, sag, r):
        pts = [Vector((u * (span / 2 + over), 0, z + sag * (abs(u) ** 2))) for u in (-1, -0.5, 0, 0.5, 1)]
        tube(B, pts, [r * 0.9, r, r, r, r * 0.9], M_WOOD(), sides=8, ao=(0.85, 0.85))
    beam(h - 0.05, 0.55, 0.22, 0.13)       # 上の横木（端が反り上がる）
    beam(h - 0.75, 0.05, 0.0, 0.09)
    # 札（2 本の短い縄 + 板）
    for sx in (-0.28, 0.28): tube(B, [Vector((sx, 0, h - 0.82)), Vector((sx, 0, h - 1.05))], [0.015, 0.015], M_WOOD(), sides=4, ao=(0.5, 0.5))
    box(B, -0.48, -0.04, h - 1.55, 0.48, 0.04, h - 1.05, M_CRATE(), (0.9, 0.9), lambda p: 1.0)
    return B.build(name, smooth=True)


def log_fallen(name, seed, L=3.4, r=0.3):
    """倒木: 横たわる丸太（少し曲がる）と、折れた枝の短い突起、明るい木口。苔は実行時の三方向投影ではなく頂点色の上側を緑に"""
    R_ = random.Random(seed); B = Builder()
    pts = [Vector((-L / 2 + L * t, 0.08 * math.sin(t * 3 + 1), r * 0.8 + 0.04 * math.sin(t * 5))) for t in (0, 0.2, 0.4, 0.6, 0.8, 1.0)]
    rings = tube(B, pts, [r * 1.05, r, r * 0.97, r * 0.95, r * 0.9, r * 0.86], M_BARK(), sides=10, ao=(0.75, 0.75))
    # 上側を苔の緑に、下側を暗く
    nf = 5 * 10
    for j in range(1, nf + 1):
        f = B.f[-j]; cols = []
        for vi in f:
            x_, y_, z = B.v[vi]; k = min(1, max(0, (z - r * 1.05) / (r * 0.6)))      # 苔は上面だけ、まだらに
            k *= 0.5 + 0.5 * max(0.0, noise.noise(Vector((x_ * 1.3, y_ * 1.3, z * 1.3)) + Vector((seed % 97, 3.1, 7.7))) * 2 + 0.3)
            k = min(1.0, k)
            g = 0.6 + 0.4 * min(1, max(0, z / (r * 1.6)))
            cols.append((g * (1 - 0.3 * k), g * (1 + 0.1 * k), g * (1 - 0.5 * k)))
        B.col[-j] = cols
    for end, rr in ((0, r * 1.05), (len(pts) - 1, r * 0.86)):
        c = B.add_v(pts[end]); ring = rings[end]
        for s in range(10):
            tri = [ring[s], ring[s + 1], c] if end else [ring[s + 1], ring[s], c]
            B.face(tri, [(0.6, 0.2), (0.9, 0.2), (0.75, 0.6)], [(1.15, 1.05, 0.85)] * 3, None, M_WOOD())
    for k in range(3):
        t = R_.uniform(0.25, 0.8); base = pts[0].lerp(pts[-1], t) + Vector((0, 0, r * 0.6))
        tip = base + Vector((R_.uniform(-.25, .25), R_.uniform(-.35, .35), R_.uniform(0.3, 0.5)))
        tube(B, [base, tip], [r * 0.3, r * 0.12], M_BARK(), sides=6, ao=(0.7, 0.9))
    return B.build(name, smooth=True)



def waystone(name, seed):
    """ワープポイント（ゲームの waypointOf、エリアの中央）: 六角の 2 段の石の台、短い石柱、上に浮く細長い水晶（淡い水色の頂点色）"""
    B = Builder()
    def prism(r0, r1, z0, z1, m, ao, n=6, rot=0.0):
        b = [Vector((math.cos(rot + 2 * math.pi * i / n) * r0, math.sin(rot + 2 * math.pi * i / n) * r0, z0)) for i in range(n)]
        t = [Vector((math.cos(rot + 2 * math.pi * i / n) * r1, math.sin(rot + 2 * math.pi * i / n) * r1, z1)) for i in range(n)]
        for i in range(n):
            j = (i + 1) % n; ps = [b[i], b[j], t[j], t[i]]
            B.face([B.add_v(q) for q in ps], [(i / n, 0), ((i + 1) / n, 0), ((i + 1) / n, (z1 - z0)), (i / n, (z1 - z0))], [(ao[0],) * 3] * 2 + [(ao[1],) * 3] * 2, None, m)
        c = B.add_v(Vector((0, 0, z1)))
        for i in range(n):
            B.face([B.add_v(t[i]), B.add_v(t[(i + 1) % n]), c], [(0, 0), (1, 0), (0.5, 1)], [(ao[1] * 1.08,) * 3] * 3, None, m)
    prism(1.45, 1.35, -0.2, 0.22, M_FLAG(), (0.7, 0.9))
    prism(0.95, 0.88, 0.22, 0.45, M_FLAG(), (0.8, 0.95), rot=math.pi / 6)
    prism(0.3, 0.24, 0.45, 1.25, M_STONE(), (0.8, 0.95), rot=math.pi / 6)
    prism(0.4, 0.4, 1.25, 1.35, M_STONE(), (0.9, 1.0), rot=math.pi / 6)
    # 水晶（上下にとがった八面体を縦に伸ばす）
    top, bot, mid = Vector((0, 0, 2.75)), Vector((0, 0, 1.55)), 2.05
    ring = [Vector((math.cos(2 * math.pi * i / 6) * 0.26, math.sin(2 * math.pi * i / 6) * 0.26, mid)) for i in range(6)]
    for i in range(6):
        j = (i + 1) % 6
        B.face([B.add_v(q) for q in (ring[i], ring[j], top)], [(0, 0), (1, 0), (0.5, 1)], [(0.75, 1.15, 1.3)] * 2 + [(0.95, 1.3, 1.4)], None, M_PAINT())
        B.face([B.add_v(q) for q in (ring[j], ring[i], bot)], [(0, 0), (1, 0), (0.5, 1)], [(0.55, 0.85, 1.05)] * 3, None, M_PAINT())
    return B.build(name, smooth=False)


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
    'crate2': lambda n: crate2(n),
    'maple_a': lambda n: maple(n, 901),
    'maple_b': lambda n: maple(n, 902, width=3.8, height=5.4, base=1.8, clusters=12),
    'maple_c': lambda n: maple(n, 903, width=3.0, height=4.2, base=1.4),
    'fir2_a': lambda n: fir2(n, 911, height=6.6, width=1.1),
    'fir3_a': lambda n: fir3(n, 931),                              # もみ 第 3 世代（L24）
    'fir3_b': lambda n: fir3(n, 932, height=7.8, width=3.6),
    'fir4_a': lambda n: fir4(n, 941),                              # もみ 第 4 世代（段の枝の塊、見本 art/ref/trees）
    'fir4_b': lambda n: fir4(n, 942, height=7.8, width=3.9, tiers=9),
    'fir4_c': lambda n: fir4(n, 943, height=5.6, width=3.1, tiers=7, lean=0.25),
    'fir4_d': lambda n: fir4(n, 944, height=7.2, width=2.9, tiers=9, lean=0.1),     # 細く高い
    'fir4_e': lambda n: fir4(n, 945, height=5.0, width=3.6, tiers=6, lean=0.3),     # 低く横に張った
    'rock_s': lambda n: smooth_rock(n, 947, size=(0.55, 0.45, 0.32), bulge=0.2, sub=3),   # 小石 第 3 世代（rock_c の面のある形をやめる）
    'fir2_b': lambda n: fir2(n, 912, height=7.6, width=1.3),
    'palm2_a': lambda n: palm2(n, 951),
    'palm2_b': lambda n: palm2(n, 952, height=3.8, frond=1.3, lean=0.9),
    'clover_a': lambda n: clover_bush(n, 921),
    'clover_b': lambda n: clover_bush(n, 922, radius=1.1),
    'clover_bb': lambda n: clover_bb(n),
    'grass_tall_a': lambda n: grass_tall_tuft(n, 931),
    'cliff_rock_a': lambda n: smooth_rock(n, 941),
    'cliff_rock_b': lambda n: smooth_rock(n, 942, size=(3.4, 2.2, 3.0), bulge=0.26),
    'boulder_a': lambda n: smooth_rock(n, 943, size=(1.3, 1.1, 0.9), bulge=0.18, sub=3),
    # 崖の面を作る縦長の岩の柱（B03 の崖: 幅 1〜1.5m・高さ 3m 前後の膨らんだ柱が並び、すき間が暗い割れ目になる）
    'cliff_col_a': lambda n: smooth_rock(n, 944, size=(1.5, 1.1, 4.6), bulge=0.14, flat_top=False),
    'cliff_col_b': lambda n: smooth_rock(n, 945, size=(1.2, 0.95, 4.0), bulge=0.18, flat_top=False),
    'teepee': lambda n: teepee(n, 1001),
    'teepee2': lambda n: teepee2(n, 1011),
    'slab_a': lambda n: rock(n, 1021, size=(1.7, 1.2, 0.75), facet=0.24),   # 崖の面に積む平たい岩（B03、L15）
    'slab_b': lambda n: rock(n, 1022, size=(1.3, 1.0, 0.65), facet=0.24),
    'tarp_tent': lambda n: tarp_tent(n, 1002),
    'barrel': lambda n: barrel(n, 1003),
    'barrel2': lambda n: barrel2(n, 2053),
    'cart_frame': lambda n: cart_frame(n, 1004),
    'cart_frame2': lambda n: cart_frame2(n, 2055),
    'stump': lambda n: stump(n, 1005),
    'lavender': lambda n: lavender_bush(n, 1006),
    'stone_steps': lambda n: stone_steps(n, 1007),
    'statue': lambda n: pedestal_statue(n, 1008),
    'statue2': lambda n: pedestal_statue2(n, 1009),   # 置くときに 1.6 倍（見本の像は台座からはみ出す大きさ）
    'stone_lantern': lambda n: stone_lantern(n, 1009),
    'curb': lambda n: curb(n, 1010),
    'rail_fence': lambda n: rail_fence(n, 1011),
    'temple_wall': lambda n: temple_wall(n, 1012),
    'maple_big': lambda n: maple(n, 904, width=5.6, height=7.5, base=2.4),
    'maple2_a': lambda n: maple2(n, 961),
    'maple2_b': lambda n: maple2(n, 962, height=7.0, width=4.8, base=2.4),
    'maple2_c': lambda n: maple2(n, 963, height=5.0, width=3.6, base=1.6, tiers=4),
    'maple2_big': lambda n: maple2(n, 964, height=8.5, width=6.2, base=2.8, tiers=6),
    'maple2_s': lambda n: maple2(n, 965, height=4.4, width=3.0, base=1.3, tiers=5, dens=1.5),   # 見本② B01 の小さく詰まった木（樹冠 ≈ 3m、L11）
    'maple2_t': lambda n: maple2(n, 966, height=5.2, width=3.4, base=1.6, tiers=5, dens=1.5),
    'palm2_low': lambda n: palm2(n, 953, height=0.5, frond=0.9, lean=0.1),
    'house_a': lambda n: house(n, 801),
    'house_b': lambda n: house(n, 802, w=9.0, d=5.5, h=5.4, roof_h=3.0),
    'lamp': lambda n: lamp(n, 811),
    'banner_pole': lambda n: banner_pole(n, 812),
    'bench': lambda n: bench(n, 813),
    'planter': lambda n: planter(n, 814),
    # 第 1 層 ひだまりの草原（f1_field、L25）
    'chest_s': lambda n: chest_s(n, 1101),
    'waystone': lambda n: waystone(n, 1107),
    'signpost': lambda n: signpost(n, 1102),
    'waygate': lambda n: waygate(n, 1103),
    'log_fallen': lambda n: log_fallen(n, 1104),
    'outcrop_a': lambda n: smooth_rock(n, 1105, size=(5.6, 4.6, 3.9), bulge=0.24, sub=4),     # 岩の障害物（半径 2.9m）の大岩
    'outcrop_b': lambda n: smooth_rock(n, 1106, size=(2.8, 2.3, 2.4), bulge=0.24, sub=4),
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
    rp = os.path.join(OUT, 'assets_report.json')
    if only and os.path.exists(rp):          # --only のときは既存の一覧の該当項目だけ差し替える
        with open(rp) as f: old = json.load(f)
        merged = [next((r for r in report if r['name'] == o['name']), o) for o in old]
        merged += [r for r in report if r['name'] not in [o['name'] for o in old]]
    else:
        merged = report
    with open(rp, 'w') as f: json.dump(merged, f, indent=1)
    for r in report: print('ASSET', r)
