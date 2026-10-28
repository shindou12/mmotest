"""追従する葉房と固定した奥の葉房を組み合わせる専用樹形。"""
import json
import math
import random
import runpy
import sys
from pathlib import Path

import bpy
from mathutils import Vector

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
OUT = BASE / "assets"
OUT.mkdir(parents=True, exist_ok=True)
source = ROOT / "tools/worldart/blender/build_assets.py"
sys.argv = [str(source), "--", "--out", str(OUT), "--blend", str(OUT / "trees.blend")]
lib = runpy.run_path(str(source), run_name="tree_library")
UP = Vector((0, 0, 1))


def yup(p):
    return [round(p.x, 8), round(p.z, 8), round(-p.y, 8)]


def tree(name, seed, height):
    rng = random.Random(seed)
    b = lib["Builder"]()
    cards, ids = [], {}
    sz = height / 4.4
    crown = Vector((0.1, 0, 2.95 * sz))
    trunk = [Vector(p) for p in [(0, 0, -0.12), (0, 0, 0), (-0.08, 0.03, 1.4 * sz), (0.12, 0, 2.6 * sz), (0.04, 0.07, 3.8 * sz)]]
    lib["tube"](b, trunk, [.21, .19, .13, .075, .025], lib["M_BARK"](), sides=8, ao=(.63, .94))

    def patch(pivot, azimuth, length, width, tilt, weight, droop=.12):
        out = Vector((math.cos(azimuth), math.sin(azimuth), 0))
        side = Vector((-out.y, out.x, 0))
        forward = out * math.cos(tilt) + UP * math.sin(tilt)
        normal = (UP * math.cos(tilt) - out * math.sin(tilt)).normalized()
        rows = []
        for t, w in ((0, .56), (.5, 1), (1, .64)):
            center = pivot + forward * length * t - UP * droop * length * t * t
            rows.append([b.add_v(center - side * width * w / 2), b.add_v(center + side * width * w / 2)])
        positions = [Vector(b.v[v]) for row in rows for v in row]
        center = sum(positions, Vector()) / 6
        shading = (Vector(((center.x - crown.x) / 1.6, (center.y - crown.y) / 1.6, (center.z - crown.z) / (1.3 * sz))) + UP * .38).normalized()
        h = max(0, min(1, (center.z / sz - 1.55) / 2.8))
        base_color = lib["crown_color"](h, .8, .62, 1.05)
        card_id = len(cards)
        cards.append({"center": yup(center), "pivot": yup(pivot), "normal": yup(normal), "right": yup(side), "weight": weight, "maxAngle": math.radians(38)})
        for row in rows:
            for vertex in row:
                ids[vertex] = card_id
        for i in range(2):
            a, c = rows[i], rows[i + 1]
            bottom = tuple(v * (.89 + .06 * i) for v in base_color)
            top = tuple(v * (.98 + .03 * i) for v in base_color)
            b.face([a[0], a[1], c[1], c[0]], [(0, i / 2), (1, i / 2), (1, (i + 1) / 2), (0, (i + 1) / 2)], [bottom, bottom, top, top], [shading] * 4, lib["M_LEAF"]())

    # 枝ごとの大きな房。下部は横へ、頂部は小さく上へ広がる。
    for layer, (z, count, reach, size) in enumerate(((1.95, 5, .65, 1.0), (2.65, 6, .74, 1.08), (3.25, 5, .65, .94), (3.8, 4, .4, .72))):
        phase = layer * 1.23 + rng.uniform(-.2, .2)
        for j in range(count):
            az = phase + math.tau * j / count + rng.uniform(-.15, .15)
            out = Vector((math.cos(az), math.sin(az), 0))
            pivot = out * reach + UP * (z + rng.uniform(-.13, .13)) * sz
            start = Vector((.03, 0, (z - .25) * sz))
            lib["tube"](b, [start, (start + pivot) / 2 + UP * .1, pivot], [.055, .035, .015], lib["M_BARK"](), sides=5, ao=(.58, .87))
            # 3枚のうち下の1枚は固定。残りは同じ付け根から別方向へ。
            patch(pivot - UP * .12, az, size * .85, size * 1.0, math.radians(8), 0)
            for sign in (-1, 1):
                patch(pivot, az + sign * .32, size * rng.uniform(1.0, 1.23), size * rng.uniform(1.05, 1.22), math.radians(rng.uniform(24, 40)), rng.uniform(.7, .95))
    # 奥の葉はカメラへ回さず、幹と房の隙間に厚みを残す。
    for j in range(56):
        az = j * 2.39996
        z = rng.uniform(2.05, 3.85) * sz
        # 画像の葉が集まる中央を幹まわりへ置く。付け根から外へ向けるだけだと幹が透ける。
        center = Vector((rng.uniform(-.38, .38), rng.uniform(-.38, .38), z))
        tilt = math.radians(rng.uniform(18, 68))
        length = rng.uniform(1.3, 1.65)
        forward = Vector((math.cos(az) * math.cos(tilt), math.sin(az) * math.cos(tilt), math.sin(tilt)))
        pivot = center - forward * length * .48
        patch(pivot, az, length, rng.uniform(1.25, 1.6), tilt, 0, droop=.08)
    ob = b.build(name)
    attribute = ob.data.attributes.new("_CARD_ID", "FLOAT", "POINT")
    for i, item in enumerate(attribute.data):
        item.value = ids.get(i, -1)
    return ob, {"cards": cards, "fixed": sum(c["weight"] == 0 for c in cards), "moving": sum(c["weight"] > 0 for c in cards)}


report = {"models": {}, "design": "固定した奥の房と、枝先を支点に回る曲面の房"}
for i, (name, seed, height) in enumerate((("maple2_s", 3101, 4.4), ("maple2_t", 3102, 5.0))):
    ob, data = tree(name, seed, height)
    report["models"][name] = data
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=str(OUT / f"{name}.glb"), export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_normals=True, export_texcoords=True, export_vertex_color="ACTIVE", export_attributes=True, export_image_format="AUTO")
    print(f"DESIGNED_TREE {name}: {len(data['cards'])} patches, fixed={data['fixed']}, moving={data['moving']}, faces={len(ob.data.polygons)}", flush=True)
    ob.location.x = i * 6
(OUT / "cards.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
bpy.ops.file.pack_all()
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "trees.blend"))
