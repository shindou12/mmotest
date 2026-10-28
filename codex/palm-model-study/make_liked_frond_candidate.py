"""付け根をまとめたヤシの頂部3枚を、芯を保って外へ開く。"""
import copy
import json
import math
import random
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
ASSETS = ROOT / "codex/palm-billboard/assets"
BLEND = ASSETS / "palms-round.blend"
SOURCE = BASE / "reference/liked-frond-v1.png"
BARK_SOURCE = ROOT / "codex/palm-textures/assets/bark-reference-v1.png"
MODEL = "palm2_a_liked_frond_v4"
OUTPUT = ASSETS / f"{MODEL}.glb"
STUDY_ASSETS = BASE / "assets"
STUDY_ASSETS.mkdir(exist_ok=True)
REPORT_PATH = ASSETS / "cards.json"

if not SOURCE.is_file():
    raise FileNotFoundError(SOURCE)
if not BLEND.is_file():
    raise FileNotFoundError(BLEND)
if not BARK_SOURCE.is_file():
    raise FileNotFoundError(BARK_SOURCE)

bpy.ops.wm.open_mainfile(filepath=str(BLEND))
obj = bpy.data.objects.get("palm2_a")
if obj is None or obj.type != "MESH":
    raise RuntimeError("palms-round.blend に palm2_a がありません")

# build_round.py の palm2_a と同じ幹の中心線から、曲がりだけを弱める。
# 太さは縮めず、各断面を新しい中心線と接線へ移す。
report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
model_report = copy.deepcopy(report["models"]["palm2_a"])
mesh = obj.data
ids = [round(value.value) for value in mesh.attributes["_CARD_ID"].data]
normals = [normal.vector.copy() for normal in mesh.corner_normals]
up = Vector((0, 0, 1))
azimuth = random.Random(963).uniform(0, math.tau)
lean_direction = Vector((math.cos(azimuth), math.sin(azimuth), 0))
cross_direction = Vector((-lean_direction.y, lean_direction.x, 0))


def trunk_points(lean):
    return [Vector((0, 0, -.12))] + [
        lean_direction * lean * t * t
        + cross_direction * lean * .18 * math.sin(math.pi * t)
        + up * 3.2 * t
        for t in [i / 16 for i in range(17)]
    ]


old_trunk, new_trunk = trunk_points(.78), trunk_points(.46)
trunk_vertices = [i for i, card_id in enumerate(ids) if card_id < 0]
if trunk_vertices != list(range(270)):
    raise RuntimeError("元モデルの幹の断面が変わっています。再確認が必要です")
rotations = {}
for ring, (old_center, new_center) in enumerate(zip(old_trunk, new_trunk)):
    previous, following = max(0, ring - 1), min(len(old_trunk) - 1, ring + 1)
    old_tangent = (old_trunk[following] - old_trunk[previous]).normalized()
    new_tangent = (new_trunk[following] - new_trunk[previous]).normalized()
    rotation = old_tangent.rotation_difference(new_tangent)
    for index in range(ring * 15, (ring + 1) * 15):
        mesh.vertices[index].co = new_center + rotation @ (mesh.vertices[index].co - old_center)
        rotations[index] = rotation


def zup(point):
    return Vector((point[0], -point[2], point[1]))


def yup(point):
    return [round(point.x, 8), round(point.z, 8), round(-point.y, 8)]


# 葉ごとの形と流れは保ち、付け根の横幅と段差だけを狭める。
shifts = {}
for card in model_report["cards"]:
    frond = card["frond"]
    if frond in shifts:
        continue
    old_root = zup(card["pivot"])
    offset = old_root - old_trunk[-1]
    compact_offset = Vector((offset.x * .45, offset.y * .45, offset.z * .35))
    shifts[frond] = new_trunk[-1] + compact_offset - old_root
for index, card_id in enumerate(ids):
    if card_id >= 0:
        mesh.vertices[index].co += shifts[model_report["cards"][card_id]["frond"]]
for card in model_report["cards"]:
    shift = shifts[card["frond"]]
    card["center"] = yup(zup(card["center"]) + shift)
    card["pivot"] = yup(zup(card["pivot"]) + shift)

# 上段だけを付け根まわりに倒す。葉の曲線・長さと中央脈はそのまま保つ。
fronds = {}
for card in model_report["cards"]:
    fronds.setdefault(card["frond"], []).append(card)
top_fronds = sorted(fronds, key=lambda frond: zup(fronds[frond][0]["pivot"]).z)[-3:]
top_rotations = {}
for frond, angle in zip(sorted(top_fronds), (22, 27, 24)):
    rows = fronds[frond]
    root = zup(rows[0]["pivot"])
    outward = zup(rows[-1]["pivot"]) - root
    outward.z = 0
    rotation = Quaternion(up.cross(outward).normalized(), math.radians(angle))
    top_rotations[frond] = (root, rotation, angle)
for index, card_id in enumerate(ids):
    if card_id < 0:
        continue
    frond = model_report["cards"][card_id]["frond"]
    if frond in top_rotations:
        root, rotation, _ = top_rotations[frond]
        mesh.vertices[index].co = root + rotation @ (mesh.vertices[index].co - root)
        rotations[index] = rotation
for card in model_report["cards"]:
    if card["frond"] not in top_rotations:
        continue
    root, rotation, _ = top_rotations[card["frond"]]
    for field in ("center", "pivot"):
        card[field] = yup(root + rotation @ (zup(card[field]) - root))
    for field in ("normal", "facingAxis", "axis"):
        card[field] = yup(rotation @ zup(card[field]))
mesh.update()
mesh.normals_split_custom_set([
    rotations[loop.vertex_index] @ normal if loop.vertex_index in rotations else normal
    for loop, normal in zip(mesh.loops, normals)
])
row_vertices = {}
for vertex, card_id in zip(mesh.vertices, ids):
    if card_id >= 0:
        row_vertices.setdefault(card_id, []).append(vertex.co.copy())
pivot_error = max(
    (sum(vertices, Vector()) / len(vertices) - zup(model_report["cards"][card_id]["pivot"])).length
    for card_id, vertices in row_vertices.items()
)
if pivot_error > 1e-5:
    raise RuntimeError(f"葉の実頂点と追従用の中心がずれています: {pivot_error}")

image = bpy.data.images.load(str(SOURCE), check_existing=False)
image.colorspace_settings.name = "sRGB"
image.pack()
bark_image = bpy.data.images.load(str(BARK_SOURCE), check_existing=False)
bark_image.colorspace_settings.name = "sRGB"
bark_image.pack()
changed = 0
for material in obj.data.materials:
    if not material or not material.node_tree:
        continue
    if "leaf_palm2" in material.name.lower():
        replacement = image
    elif material.name.lower().startswith("bark"):
        replacement = bark_image
    else:
        continue
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE":
            node.image = replacement
            changed += 1
            break
if changed == 0:
    raise RuntimeError("ヤシの葉材質を見つけられません")

# blend 内では比較用に横並びなので、GLB では原点へ戻す。
obj.location = (0, 0, 0)
obj.name = MODEL
for other in list(bpy.data.objects):
    if other != obj:
        bpy.data.objects.remove(other, do_unlink=True)
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(STUDY_ASSETS / "palm-soft-top-v4.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_normals=True,
    export_texcoords=True,
    export_vertex_color="ACTIVE",
    export_attributes=True,
    export_image_format="AUTO",
)
report["models"][MODEL] = model_report
REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
(STUDY_ASSETS / "soft-top-v4-report.json").write_text(json.dumps({
    "model": MODEL,
    "source": str(BLEND.relative_to(ROOT)),
    "trunkTipBefore": yup(old_trunk[-1]),
    "trunkTipAfter": yup(new_trunk[-1]),
    "rootSpreadBefore": .04,
    "rootSpreadAfter": .018,
    "rootLayerScale": .35,
    "fronds": len(shifts),
    "rowPivotError": pivot_error,
    "topFrondDownwardRotations": {str(frond): values[2] for frond, values in top_rotations.items()},
}, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
print(f"LIKED_FROND_GLB={OUTPUT}; TEXTURED_MATERIALS={changed}", flush=True)
print(f"CROWN_ATTACHMENT: trunk_lean=0.78->0.46; root_radius=0.04->0.018; fronds={len(shifts)}", flush=True)
print(f"ROW_PIVOT_ERROR={pivot_error:.8f}", flush=True)
print(f"TOP_FRONDS_OPENED={[(frond, values[2]) for frond, values in top_rotations.items()]}", flush=True)
