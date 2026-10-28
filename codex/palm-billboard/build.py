"""ヤシの芯を固定し、断面だけをひねる帯を作る。出力はこのフォルダだけ。"""
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
sys.argv = [str(source), "--", "--out", str(OUT), "--blend", str(OUT / "palms.blend")]
lib = runpy.run_path(str(source), run_name="palm_library")
UP = Vector((0, 0, 1))


def yup(p):
    return [round(p.x, 8), round(p.z, 8), round(-p.y, 8)]


def palm(name, seed, height, lean, size):
    """幹は既存palm2同様の曲線。葉の断面と軸は専用に組み立てる。"""
    rng = random.Random(seed)
    b = lib["Builder"]()
    az = rng.uniform(0, math.tau)
    lean_dir = Vector((math.cos(az), math.sin(az), 0))
    trunk = [lean_dir * lean * t * t + UP * height * t for t in [i / 10 for i in range(11)]]
    lib["tube"](b, [Vector((0, 0, -.12))] + trunk,
                [.145] + [.13 - .05 * i / 10 for i in range(11)],
                lib["M_BARK"](), sides=8, ao=(.8, 1.15))
    top = trunk[-1]
    # 下に開いた成熟葉、中段の長い葉、立ち上がる新葉。各層の方位をずらす。
    layers = ((7, -.03, .90, .04, .82), (7, .07, 1.0, .56, .93), (4, .13, .68, 1.5, 1.0))
    cards, ids = [], {}
    frond = 0
    for layer, (count, dz, length_scale, rise, droop) in enumerate(layers):
        phase = layer * 1.37 + .25
        for k in range(count):
            az = phase + math.tau * k / count + rng.uniform(-.065, .065)
            out = Vector((math.cos(az), math.sin(az), 0))
            side = Vector((-out.y, out.x, 0))
            length = size * length_scale * rng.uniform(.93, 1.07)
            origin = top + out * .035 + UP * dz
            facing_axis = (out + UP * (rise - droop)).normalized()
            facing_normal = side.cross(facing_axis).normalized()
            if facing_normal.z < 0:
                facing_normal.negate()
            view_center = origin + out * length * .48 + UP * length * (rise * .48 - droop * .48**2)
            rows = []
            # 断面を隣の面と共有。回転しても面と面の境界は開かない。
            for i in range(9):
                t = i / 8
                center = origin + out * length * t + UP * length * (rise * t - droop * t * t)
                tangent = (out + UP * (rise - 2 * droop * t)).normalized()
                width = length * .53
                # 付け根と先端は固定。中間だけを連続的にひねる。
                weight = math.sin(math.pi * t) ** .6 * (.70 if layer < 2 else .45)
                ids_row = []
                row_id = len(cards)
                cards.append({"frond": frond, "center": yup(view_center),
                              "normal": yup(facing_normal), "facingAxis": yup(facing_axis),
                              "pivot": yup(center), "axis": yup(tangent),
                              "weight": round(weight, 8), "maxAngle": math.radians(32)})
                # 中央の頂点も作り、葉の芯を実際のメッシュの線として共有する。
                for u in (0, .5, 1):
                    vertex = b.add_v(center + side * width * (u - .5))
                    ids[vertex] = row_id
                    ids_row.append(vertex)
                rows.append(ids_row)
            normal = (out * .35 + UP * .9).normalized()
            for i in range(8):
                for half in range(2):
                    # 表の巻き順も上向きにする。照明法線だけ上向きだと裏面で暗くなる。
                    indices = [rows[i][half + 1], rows[i][half], rows[i + 1][half], rows[i + 1][half + 1]]
                    u0, u1 = half / 2, (half + 1) / 2
                    uv = [(u1, i / 8), (u0, i / 8), (u0, (i + 1) / 8), (u1, (i + 1) / 8)]
                    c0 = lib["crown_color"](.72 + .18 * layer / 2, .78 + .22 * i / 8, .5, 1.15)
                    c1 = lib["crown_color"](.72 + .18 * layer / 2, .78 + .22 * (i + 1) / 8, .5, 1.15)
                    b.face(indices, uv, [c0, c0, c1, c1], [normal] * 4, lib["M_PALM2"]())
            frond += 1
    ob = b.build(name)
    attr = ob.data.attributes.new("_CARD_ID", "FLOAT", "POINT")
    for i, value in enumerate(attr.data):
        value.value = ids.get(i, -1)
    print(f"PALM {name}: fronds={frond}, rows={len(cards)}, leaf_triangles={frond * 32}", flush=True)
    return ob, {"cards": cards, "fronds": frond}


def export(ob, filename):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=str(OUT / filename), export_format="GLB", use_selection=True,
                              export_yup=True, export_apply=True, export_normals=True, export_texcoords=True,
                              export_vertex_color="ACTIVE", export_attributes=True, export_image_format="AUTO")


report = {"models": {}, "design": "葉の芯と生える方位を固定し、断面だけをひねる"}
current = lib["ASSETS"]["palm2_a"]("current")
export(current, "current.glb")
current.location.x = -5
for i, (name, seed, height, lean, size) in enumerate((("palm2_a", 951, 3.2, .6, 1.65), ("palm2_b", 952, 3.8, .9, 1.85), ("palm2_low", 953, .5, .1, 1.15))):
    ob, data = palm(name, seed, height, lean, size)
    report["models"][name] = data
    export(ob, name + ".glb")
    ob.location.x = i * 5
(OUT / "cards.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
bpy.ops.file.pack_all()
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "palms.blend"))
