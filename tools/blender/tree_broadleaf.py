# 広葉樹（曲がった幹・根・枝 + 小さめの葉の房を多数。下向きの面は暗く、上だけ明るく）
#   実行: Blender の Scripting で開いて Run / または blender -b -P tools/blender/tree_broadleaf.py
import os, sys, random, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) if os.path.exists(__file__) else '.')
import importlib, mmo_common as C
importlib.reload(C)
from mathutils import Vector

def tube(path, radius, rings=8, sides=6, mat=0):
    # path(t) -> Vector, radius(t) -> float の先細りの管
    bm = C.bmesh.new()
    loops = []
    for i in range(rings + 1):
        t = i / rings
        p, q = path(t), path(min(1, t + 0.01) if t < 1 else t - 0.01)
        d = (q - p).normalized() if t < 1 else (p - q).normalized()
        u = d.orthogonal().normalized(); w = d.cross(u)
        r = radius(t)
        loops.append([bm.verts.new(p + (u * math.cos(a) + w * math.sin(a)) * r) for a in (k / sides * 6.2832 for k in range(sides))])
    for i in range(rings):
        a, b = loops[i], loops[i + 1]
        for k in range(sides):
            f = bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k])); f.material_index = mat
    f = bm.faces.new(list(reversed(loops[0]))); f.material_index = mat
    f = bm.faces.new(loops[-1]); f.material_index = mat
    return bm

def make_tree(seed, name, H=3.8):
    rnd = random.Random(seed)
    mats = [C.material('幹'), C.material('幹_暗'), C.material('葉_暗'), C.material('葉'), C.material('葉_明')]
    parts = []
    def add(bm, nm):
        ob = C.to_object(bm, nm, mats); parts.append(ob); return ob
    lean = rnd.uniform(-0.25, 0.25)
    trunk = lambda t: Vector((math.sin(t * 2.2 + seed) * 0.22 + lean * t * t, math.cos(t * 1.7 + seed) * 0.12, t * H))
    add(tube(trunk, lambda t: 0.34 * (1 - t * 0.55) + max(0, 0.12 - t) * 2.2, 8, 7, 0), 'trunk')
    for k in range(5):  # 根
        a, L = k / 5 * 6.2832 + rnd.random(), rnd.uniform(0.8, 1.25)
        add(tube(lambda t, a=a, L=L: Vector((math.cos(a) * t * L, math.sin(a) * t * L, 0.32 * (1 - t) ** 2 - 0.04)), lambda t: 0.14 * (1 - t) + 0.02, 4, 5, 1), 'root')
    tips = [trunk(1)]
    for k in range(4 + rnd.randrange(2)):  # 枝
        t0 = rnd.uniform(0.5, 0.82); b = trunk(t0); a = k / 4.5 * 6.2832 + rnd.random() * 0.6; L = rnd.uniform(1.1, 1.7)
        pth = lambda t, b=b, a=a, L=L: b + Vector((math.cos(a) * t * L, math.sin(a) * t * L, t * L * 0.7))
        add(tube(pth, lambda t: 0.12 * (1 - t * 0.7), 4, 5, 1), 'branch')
        tips.append(pth(1)); tips.append(pth(0.6))
    # 葉の房: 枝先ごとに小さな塊を 2〜3 個。全体として平たいドーム
    for k, tp in enumerate(tips):
        for j in range(2 + rnd.randrange(2)):
            s = rnd.uniform(0.55, 0.85) * (1.15 if k == 0 else 1)
            c = tp + Vector((rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), rnd.uniform(-0.1, 0.45)))
            bm = C.ico(1.0, 1)
            C.displace(bm, seed * 13 + k * 5 + j, amp=0.3, freq=1.6)
            C.cut(bm, random.Random(seed + k * 7 + j), count=2, at=0.85, flat_bottom=False)
            for f in bm.faces:
                nz = f.normal.z
                f.material_index = 4 if nz > 0.75 and rnd.random() < 0.35 else 3 if nz > 0.2 else 2
            ob = add(bm, 'leaf')
            ob.location = c; ob.scale = (s * 1.1, s * 1.1, s * 0.78)
            ob.rotation_euler = (rnd.random(), rnd.random(), rnd.random() * 6.28)
    ob = C.join(parts, name)
    C.ground_origin(ob, sink=0.05)
    return ob

C.reset_scene()
for i, (seed, h) in enumerate([(4, 3.8), (9, 3.3), (17, 4.3)]):
    ob = make_tree(seed, 'tree_broadleaf_%02d' % (i + 1), h)
    C.export([ob], ob.name, '木')
