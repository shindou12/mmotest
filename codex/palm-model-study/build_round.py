"""丸みと曲線を強めたヤシの試作を作る。出力はcodex内の専用フォルダだけ。"""
import json
import math
import random
import runpy
import shutil
import sys
from pathlib import Path

import bpy
from mathutils import Vector

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
OUT = ROOT / "codex/palm-billboard/assets"
OUT.mkdir(parents=True, exist_ok=True)
lib_path = ROOT / "tools/worldart/blender/build_assets.py"
sys.argv = [str(lib_path), "--", "--out", str(OUT), "--blend", str(OUT / "palms-round.blend")]
lib = runpy.run_path(str(lib_path), run_name="palm_round_library")
UP = Vector((0, 0, 1))
TEXTURES = [ROOT / "codex/palm-textures/assets" / f"frond-reference-copy-v{i}.png" for i in range(1, 4)]
BASELINE_GLB = OUT / "palm2_a_before_round.glb"

for texture_path in TEXTURES:
    if not texture_path.exists():
        raise FileNotFoundError(texture_path)

# 以前の専用ヤシを比較用に一度だけ保存する。
if not BASELINE_GLB.exists():
    shutil.copy2(OUT / "palm2_a.glb", BASELINE_GLB)


def yup(point):
    return [round(point.x, 8), round(point.z, 8), round(-point.y, 8)]


def round_material(texture_path):
    material = lib["M_PALM2"]()
    image = bpy.data.images.load(str(texture_path), check_existing=True)
    image.colorspace_settings.name = "sRGB"
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE":
            node.image = image
            break
    else:
        raise RuntimeError("葉の画像ノードが見つかりません")
    return material


LEAF_MATERIALS = [round_material(path) for path in TEXTURES]


def palm(name, seed, settings):
    """葉カードを少数にまとめ、葉の芯と幹にゆるい曲線を付ける。"""
    rng = random.Random(seed)
    b = lib["Builder"]()
    height, lean, size = settings["height"], settings["lean"], settings["size"]
    az = rng.uniform(0, math.tau)
    lean_dir = Vector((math.cos(az), math.sin(az), 0))
    cross_dir = Vector((-lean_dir.y, lean_dir.x, 0))
    trunk = []
    for i in range(17):
        t = i / 16
        horizontal = lean_dir * lean * t * t + cross_dir * lean * settings["trunk_s"] * math.sin(math.pi * t)
        trunk.append(horizontal + UP * height * t)
    lib["tube"](b, [Vector((0, 0, -.12))] + trunk,
                [.15] + [.14 - .045 * i / 16 for i in range(17)],
                lib["M_BARK"](), sides=14, ao=(.86, 1.1))

    top = trunk[-1]
    layers = settings["layers"]
    cards, card_ids = [], {}
    texture_counts = [0] * len(LEAF_MATERIALS)
    frond_id = 0
    for layer, (count, dz, length_scale, rise, droop) in enumerate(layers):
        phase = layer * settings["phase_step"] + .22
        for k in range(count):
            # 葉の中央脈は保ち、小葉の違う見本を葉ごとに割り当てる。
            leaf_variant = rng.randrange(len(LEAF_MATERIALS))
            texture_counts[leaf_variant] += 1
            angle = phase + math.tau * k / count + rng.uniform(-settings["angle_jitter"], settings["angle_jitter"])
            out = Vector((math.cos(angle), math.sin(angle), 0))
            side = Vector((-out.y, out.x, 0))
            length = size * length_scale * rng.uniform(.96, 1.04)
            origin = top + out * .04 + UP * dz
            arc = settings["arc"] * (1 if (k + layer) % 2 == 0 else -1) * rng.uniform(.82, 1.18)

            def center_at(t):
                horizontal = out * (length * t) + side * (length * arc * 4 * t * (1 - t))
                vertical = length * (rise * t - droop * t * t)
                return origin + horizontal + UP * vertical

            def tangent_at(t):
                horizontal = out * length + side * (4 * length * arc * (1 - 2 * t))
                vertical = length * (rise - 2 * droop * t)
                return (horizontal + UP * vertical).normalized()

            facing_axis = tangent_at(.48)
            facing_normal = side.cross(facing_axis).normalized()
            if facing_normal.z < 0:
                facing_normal.negate()
            view_center = center_at(.48)
            rows = []
            for i in range(9):
                t = i / 8
                center = center_at(t)
                tangent = tangent_at(t)
                width = length * settings["width"]
                weight = math.sin(math.pi * t) ** .7 * (.72 if layer < 2 else .48)
                row_id = len(cards)
                cards.append({
                    "frond": frond_id,
                    "leafVariant": leaf_variant,
                    "center": yup(view_center),
                    "normal": yup(facing_normal),
                    "facingAxis": yup(facing_axis),
                    "pivot": yup(center),
                    "axis": yup(tangent),
                    "weight": round(weight, 8),
                    "maxAngle": math.radians(24),
                })
                row = []
                for u in (0, .5, 1):
                    vertex = b.add_v(center + side * width * (u - .5))
                    card_ids[vertex] = row_id
                    row.append(vertex)
                rows.append(row)

            normal = (out * .35 + UP * .9).normalized()
            for i in range(8):
                for half in range(2):
                    indices = [rows[i][half + 1], rows[i][half], rows[i + 1][half], rows[i + 1][half + 1]]
                    u0, u1 = half / 2, (half + 1) / 2
                    uv = [(u1, i / 8), (u0, i / 8), (u0, (i + 1) / 8), (u1, (i + 1) / 8)]
                    c0 = lib["crown_color"](.82 + .12 * layer / max(1, len(layers) - 1), .84 + .12 * i / 8, .54, 1.05)
                    c1 = lib["crown_color"](.82 + .12 * layer / max(1, len(layers) - 1), .84 + .12 * (i + 1) / 8, .54, 1.05)
                    b.face(indices, uv, [c0, c0, c1, c1], [normal] * 4, LEAF_MATERIALS[leaf_variant])
            frond_id += 1

    ob = b.build(name)
    attr = ob.data.attributes.new("_CARD_ID", "FLOAT", "POINT")
    for index, value in enumerate(attr.data):
        value.value = card_ids.get(index, -1)
    print(f"PALM {name}: fronds={frond_id}, rows={len(cards)}, leaf_triangles={frond_id * 32}", flush=True)
    return ob, {"cards": cards, "fronds": frond_id, "leafVariants": texture_counts}


def export(ob, filename):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=str(OUT / filename), export_format="GLB", use_selection=True,
                              export_yup=True, export_apply=True, export_normals=True, export_texcoords=True,
                              export_vertex_color="ACTIVE", export_attributes=True, export_image_format="AUTO")


variants = [
    ("palm_round_v1", 961, {"height": 3.2, "lean": .62, "size": 1.65,
      "layers": ((6, -.03, 1.12, .32, .98), (4, .06, .98, .70, .93), (2, .14, .68, 1.36, .48)),
      "arc": 0, "trunk_s": 0, "phase_step": 1.37, "angle_jitter": .055, "width": .56}),
    ("palm_round_v2", 962, {"height": 3.2, "lean": .68, "size": 1.65,
      "layers": ((6, -.03, 1.12, .32, .98), (4, .06, .98, .70, .93), (2, .14, .68, 1.36, .48)),
      "arc": .105, "trunk_s": .13, "phase_step": 1.37, "angle_jitter": .075, "width": .56}),
    ("palm2_a", 963, {"height": 3.2, "lean": .78, "size": 1.65,
      "layers": ((7, -.035, 1.10, .38, 1.02), (5, .055, .96, .76, .91), (3, .14, .68, 1.34, .46)),
      "arc": .15, "trunk_s": .18, "phase_step": 1.51, "angle_jitter": .10, "width": .60}),
]

old_report = json.loads((OUT / "cards.json").read_text(encoding="utf-8"))
models = old_report["models"]
models.setdefault("palm2_a_before_round", models["palm2_a"])
models.pop("palm_round_v1", None)
models.pop("palm_round_v2", None)
report = {"models": models, "design": "中心脈を保ち、小葉の数・切れ込み・角度が異なる葉を混ぜたヤシ"}

for index, (name, seed, settings) in enumerate(variants):
    ob, data = palm(name, seed, settings)
    report["models"][name] = data
    export(ob, name + ".glb")
    ob.location.x = index * 4.5

for ob in bpy.context.scene.objects:
    if ob.name == "current":
        ob.hide_render = True
bpy.ops.file.pack_all()
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "palms-round.blend"))
(OUT / "cards.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
