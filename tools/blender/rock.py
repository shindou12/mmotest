# 岩（割れ面のある塊 + 周りの小石、上向きの面だけ苔）
#   実行: Blender の Scripting で開いて Run / または blender -b -P tools/blender/rock.py
import os, sys, random, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) if os.path.exists(__file__) else '.')
import importlib, mmo_common as C
importlib.reload(C)

def make_rock(seed, name, size=(1.25, 1.05, 0.8)):
    rnd = random.Random(seed)
    mats = [C.material('岩'), C.material('岩_暗'), C.material('苔')]
    parts = []
    def lump(sd, sub, amp, cuts, at, loc, scl):
        bm = C.ico(1.0, sub)
        C.displace(bm, sd, amp=amp, freq=1.1)
        C.cut(bm, random.Random(sd), count=cuts, at=at)
        for f in bm.faces:  # 上向きは苔、下向きは暗く
            nz = f.normal.z
            f.material_index = 2 if nz > 0.8 and rnd.random() < 0.75 else 1 if nz < -0.1 or rnd.random() < 0.15 else 0
        ob = C.to_object(bm, name + '_part', mats)
        ob.scale = scl; ob.location = loc
        ob.rotation_euler = (rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), rnd.uniform(0, 6.28))
        parts.append(ob)
    lump(seed, 2, 0.24, 7, 0.62, (0, 0, 0.45), size)
    for k in range(2 + rnd.randrange(3)):
        a, d, s = rnd.uniform(0, 6.28), rnd.uniform(1.15, 1.6), rnd.uniform(0.22, 0.45)
        lump(seed * 31 + k, 1, 0.2, 4, 0.6, (d * math.cos(a), d * math.sin(a), s * 0.4), (s, s * 0.85, s * 0.75))
    ob = C.join(parts, name)
    C.ground_origin(ob, sink=0.08)
    return ob

C.reset_scene()
objs = []
for i, (seed, size) in enumerate([(3, (1.25, 1.05, 0.8)), (8, (0.9, 0.8, 1.1)), (21, (1.6, 1.2, 0.6))]):
    ob = make_rock(seed, 'rock_%02d' % (i + 1), size)
    C.export([ob], ob.name, '岩')
    objs.append(ob)
