"""既存の木を読み、カードID付きGLBを試作フォルダだけへ書く。"""
import hashlib
import json
import runpy
import sys
from pathlib import Path

import bpy
from mathutils import Vector

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
OUT = BASE / "assets"
SOURCE = ROOT / "tools/worldart/blender/build_assets.py"
OUT.mkdir(parents=True, exist_ok=True)
sys.argv = [str(SOURCE), "--", "--out", str(OUT), "--blend", str(OUT / "leaves.blend")]
library = runpy.run_path(str(SOURCE), run_name="leaf_card_library")


def yup(v):
    """既存のexport_yupと同じ、Blender Z-UpからglTF Y-Upへの変換。"""
    return [round(v.x, 8), round(v.z, 8), round(-v.y, 8)]


report = {"sourceSHA256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(), "models": {}}
for index, name in enumerate(("maple2_s", "maple2_t")):
    ob = library["ASSETS"][name](name)
    mesh = ob.data
    card_id = mesh.attributes.new("_CARD_ID", "FLOAT", "POINT")
    for value in card_id.data:
        value.value = -1
    cards = []
    for poly in mesh.polygons:
        material = mesh.materials[poly.material_index]
        if not material.name.startswith("leaf"):
            continue
        if len(poly.vertices) != 4:
            raise ValueError(f"{name}: 葉カードが四角形ではありません")
        points = [mesh.vertices[v].co.copy() for v in poly.vertices]
        center = sum(points, Vector()) / 4
        right = (points[1] - points[0]).normalized()
        normal = (points[1] - points[0]).cross(points[3] - points[0]).normalized()
        # 両面カードの好ましい表を上へ揃える。巻き順の下向き法線を
        # そのまま使うと、部分追従で裏返る途中の細い面が見えてしまう。
        if normal.z < 0:
            normal.negate()
        current_id = len(cards)
        cards.append({"center": yup(center), "normal": yup(normal), "right": yup(right)})
        for vertex in poly.vertices:
            if card_id.data[vertex].value >= 0:
                raise ValueError("カード同士で頂点が共有されています")
            card_id.data[vertex].value = current_id
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / f"{name}.glb"), export_format="GLB", use_selection=True,
        export_yup=True, export_apply=True, export_normals=True, export_texcoords=True,
        export_vertex_color="ACTIVE", export_attributes=True, export_image_format="AUTO",
    )
    report["models"][name] = {"cards": cards, "vertices": len(mesh.vertices)}
    ob.location.x = index * 6
    print(f"LEAF_CARDS {name}: {len(cards)} cards, {len(mesh.vertices)} vertices", flush=True)

(OUT / "cards.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
bpy.ops.file.pack_all()
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "leaves.blend"))
print("OUTPUT", OUT, flush=True)
