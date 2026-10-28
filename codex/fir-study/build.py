"""枝葉の透過画像を、芯がつながる曲面カードへ貼ってもみを組む。"""
import argparse
import hashlib
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
OUT.mkdir(exist_ok=True)
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument("--version", default="v5", choices=["v1", "v2", "v3", "v4", "v5"])
version = parser.parse_args(argv).version
settings = json.loads((BASE / f"settings-{version}.json").read_text(encoding="utf-8"))
source = ROOT / "tools/worldart/blender/build_assets.py"
sys.argv = [str(source), "--", "--out", str(OUT), "--blend", str(OUT / f"fir_soft_{version}.blend")]
lib = runpy.run_path(str(source), run_name="fir_study_library")
UP = Vector((0, 0, 1))
rng = random.Random(settings["seed"])
builder = lib["Builder"]()


def leaf_material(name):
    path = OUT / settings.get("textures", {}).get(name, f"branch-{name}.png")
    if not path.is_file():
        raise FileNotFoundError(path)
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = "sRGB"
    image.pack()
    material = bpy.data.materials.new(f"leaf_fir_soft_{name}")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Roughness"].default_value = 1
    shader.inputs["Specular IOR Level"].default_value = 0
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    if settings.get("materialVertexColor", False):
        color = nodes.new("ShaderNodeVertexColor")
        color.layer_name = "Col"
        multiply = nodes.new("ShaderNodeMix")
        multiply.data_type = "RGBA"
        multiply.blend_type = "MULTIPLY"
        multiply.inputs["Factor"].default_value = 1
        material.node_tree.links.new(texture.outputs["Color"], multiply.inputs[6])
        material.node_tree.links.new(color.outputs["Color"], multiply.inputs[7])
        material.node_tree.links.new(multiply.outputs[2], shader.inputs["Base Color"])
    else:
        material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    material.node_tree.links.new(texture.outputs["Alpha"], shader.inputs["Alpha"])
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    material.use_backface_culling = False
    return material


materials = {name: leaf_material(name) for name in ["dense", "droop", "tip"]}
height = settings["height"]


def trunk(z):
    t = max(0, z / height)
    return Vector((.10 * t * t, .055 * math.sin(t * math.pi), z))


# 元のtubeを再利用。根元と幹の輪郭はなだらかにする。
zs = [-.15, 0, .28, .7, 1.4, 2.3, 3.3, 4.3, settings.get("trunkTop", 5.2)]
lib["tube"](builder, [trunk(z) for z in zs], [.23, .23, .18, .14, .12, .095, .075, .05, .02], lib["M_BARK"](), sides=12, ao=(.75, .92))
for k in range(4):
    angle = k * math.tau / 4 + .3
    out = Vector((math.cos(angle), math.sin(angle), 0))
    lib["tube"](builder, [trunk(.32), out * .20 + UP * .12, out * .42 + UP * .015], [.12, .095, .025], lib["M_BARK"](), sides=8, ao=(.76, .85))

branches = []


def spray(origin, angle, length, width, rise, droop, fold, material_name, tier, roll=0, arc=0, upright=False,
          parent=None, uv_span=None, shade=1):
    out = Vector((math.cos(angle), math.sin(angle), 0))
    side = Vector((-out.y, out.x, 0))
    side = (side * math.cos(roll) + UP * math.sin(roll)).normalized()
    segments = settings["segments"]
    rows = []
    start_vertex = len(builder.v)
    normal = (out * .38 + UP * .92).normalized()
    flip = settings.get("alternateSpray", False) and rng.random() < .5
    for row_index in range(segments + 1):
        t = row_index / segments
        if upright:
            center = origin + out * (length * .20 * t) + UP * length * t
            normal = (out * .65 + UP * .65).normalized()
        else:
            center = origin + out * (length * t) + side * (length * arc * math.sin(math.pi * t)) + UP * (length * (rise * t - droop * t * t))
        row = []
        for u in (0, .5, 1):
            # 芯を高く、左右を少し落とし、画像の面に浅い折りを付ける。
            point = center + side * width * (u - .5) + UP * (fold * length * math.sin(math.pi * t) * (1 - abs(u - .5) * 2))
            row.append(builder.add_v(point))
        rows.append(row)
    for i in range(segments):
        t0, t1 = i / segments, (i + 1) / segments
        ao0 = settings["aoRoot"] + (settings["aoTip"] - settings["aoRoot"]) * t0
        ao1 = settings["aoRoot"] + (settings["aoTip"] - settings["aoRoot"]) * t1
        tint = settings.get("tint", [1, 1, 1])
        color0, color1 = [ao0 * value * shade for value in tint], [ao1 * value * shade for value in tint]
        if uv_span:
            t0, t1 = uv_span[0] + (uv_span[1] - uv_span[0]) * t0, uv_span[0] + (uv_span[1] - uv_span[0]) * t1
        elif material_name == "tip" and settings.get("terminalCrop", False):
            # 若葉には画像の末端の房だけを使い、短い枝へ木全体を押し縮めない。
            crop = settings.get("terminalStart", .70)
            t0, t1 = crop + (1 - crop) * t0, crop + (1 - crop) * t1
        for half in range(2):
            u0, u1 = half / 2, (half + 1) / 2
            v0, v1 = (u0, u1) if flip else (1 - u0, 1 - u1)
            indices = [rows[i][half + 1], rows[i][half], rows[i + 1][half], rows[i + 1][half + 1]]
            normals = [normal] * 4
            if settings.get("curvedNormals", False) and not upright:
                normals = []
                for t, u in [(i / segments, u1), (i / segments, u0), ((i + 1) / segments, u0), ((i + 1) / segments, u1)]:
                    tangent = out + side * (arc * math.pi * math.cos(math.pi * t)) + UP * (rise - 2 * droop * t)
                    lateral = side * width + UP * (fold * length * math.sin(math.pi * t) * (1 - 2 * u) * 2)
                    normals.append(tangent.cross(lateral).normalized())
            builder.face(indices,
                         [(t0, v1), (t0, v0), (t1, v0), (t1, v1)],
                         [color0, color0, color1, color1], normals, materials[material_name])
    branches.append({"tier": tier, "texture": material_name, "root": list(origin), "length": length,
                     "vertexStart": start_vertex, "vertices": len(builder.v) - start_vertex,
                     "parent": parent})


skeleton = []
if settings.get("hierarchy", False):
    hierarchy = runpy.run_path(str(BASE / "hierarchy.py"))
    skeleton = hierarchy["build"](globals())
else:
    for tier in range(settings["tiers"]):
        t = tier / (settings["tiers"] - 1)
        z = .98 + (1 - (1 - t) ** settings.get("tierCurve", 1)) * 3.98
        radius = settings["width"] * .5 * (1 - .83 * t) ** 1.05
        z += rng.uniform(-.08, .08) * settings["irregularity"] * 5
        phase = tier * 1.67 + .2
        for layer, count in enumerate([settings["outerCount"], settings["innerCount"]]):
            for k in range(count):
                angle = phase + math.tau * (k + layer * .36) / count + rng.uniform(-settings["irregularity"], settings["irregularity"])
                length = radius * (1 if layer == 0 else .64) * rng.uniform(.94, 1.06)
                if layer:
                    length = max(settings.get("minInnerLength", 0), length)
                material_name = "tip" if tier >= settings["tiers"] - 2 else ("droop" if (k + tier) % 3 == 0 else "dense")
                origin = trunk(z + (.13 * radius if layer else 0))
                width = max(settings.get("minWidth", .42), length * settings["widthRatio"]) * rng.uniform(.95, 1.05)
                roll = rng.uniform(-settings["irregularity"], settings["irregularity"])
                rise = settings.get("innerRise", -.08 + t * .12) if layer else -.08 + t * .12
                droop = settings.get("innerDroop", settings["droop"]) if layer else settings["droop"]
                spray(origin, angle, length, width, rise, droop, settings["fold"], material_name, tier,
                      roll=roll, arc=rng.uniform(-settings["irregularity"], settings["irregularity"]))

    tip_count = settings.get("tipCount", 3)
    for k in range(tip_count):
        spray(trunk(settings.get("tipRoot", 4.91)), k * math.tau / tip_count + .4,
              settings.get("tipLength", .66), settings.get("tipWidth", .40),
              settings.get("tipRise", 0), settings.get("tipDroop", 0), .06, "tip", settings["tiers"],
              upright=settings.get("tipUpright", True))

model_id = f"fir_soft_{version}"
obj = builder.build(model_id)
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"{model_id}.blend"))
bpy.ops.export_scene.gltf(filepath=str(OUT / f"{model_id}.glb"), export_format="GLB", use_selection=True,
                          export_yup=True, export_apply=True, export_normals=True, export_texcoords=True,
                          export_vertex_color="ACTIVE", export_image_format="AUTO")
report = lib["check"](obj)
report.update({"id": model_id, "settings": settings, "branches": branches, "skeleton": skeleton,
               "sourceGeneratorSHA256": hashlib.sha256(source.read_bytes()).hexdigest()})
(OUT / f"{model_id}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
print(f"FIR_BUILT {model_id}; sprays={len(branches)}; triangles={report['tris']}; size={report['size']}", flush=True)
