"""木の葉の板を消して、葉 1 枚の板を塊の表面に屋根瓦で並べ直す。幹はそのまま使う。

塊の位置は元の葉の板の位置から決める。絵は 4 列 2 行の葉の絵（透明度つき、上が先、下が根元）。

使い方: blender --background --python tree_leaf_cards.py -- --in a.glb --atlas leaf.png --out b.glb
        [--count 400] [--clumps 6] [--leaf 0.62] [--lift 16] [--jitter 14] [--flat 0.72]
"""
import argparse
import math
import sys

import bmesh
import bpy
import numpy as np

args = argparse.ArgumentParser()
args.add_argument("--in", dest="source", required=True)
args.add_argument("--atlas", required=True)
args.add_argument("--out", required=True)
args.add_argument("--count", type=int, default=400)
args.add_argument("--clumps", type=int, default=6)
args.add_argument("--leaf", type=float, default=0.62, help="葉の幅 (m)")
args.add_argument("--aspect", type=float, default=1.33, help="葉の縦/横")
args.add_argument("--lift", type=float, default=16.0, help="瓦の反り（度）")
args.add_argument("--jitter", type=float, default=14.0, help="先端の向きのばらつき（度）")
args.add_argument("--flat", type=float, default=0.72, help="塊の高さ/幅")
args.add_argument("--radius", type=float, default=1.15, help="元の板の広がりに対する塊の半径の倍率")
args.add_argument("--under", type=float, default=0.22, help="塊の下半分に置く葉の割合")
args = args.parse_args(sys.argv[sys.argv.index("--") + 1:])

# 絵の並びの暗い順（M-0169 の 8 枚）
TONE_ORDER = (6, 0, 7, 1, 2, 3, 4, 5)
ROOM = 4  # 絵の列数
ROWS = 2

rng = np.random.default_rng(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.source)
obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
mesh = obj.data
leaf_index = next(i for i, m in enumerate(mesh.materials) if "leaf" in m.name)
old_tris = sum(1 for p in mesh.polygons if p.material_index == leaf_index)

centers_old = np.array([np.array(p.center) for p in mesh.polygons if p.material_index == leaf_index])
# 2 面で 1 枚なので、組の中心でよい。塊に分ける
centers = centers_old[rng.choice(len(centers_old), args.clumps, replace=False)]
for _ in range(40):
    labels = ((centers_old[:, None] - centers[None]) ** 2).sum(axis=2).argmin(axis=1)
    centers = np.array([centers_old[labels == k].mean(axis=0) if (labels == k).any() else centers[k]
                        for k in range(args.clumps)])
radii = np.array([max(0.45, np.linalg.norm((centers_old[labels == k] - centers[k])[:, :2], axis=1).mean() * args.radius + 0.25)
                  for k in range(args.clumps)])
print("INFO clumps", np.round(centers, 2).tolist(), "radii", np.round(radii, 2).tolist())
crown_low, crown_high = centers_old[:, 2].min(), centers_old[:, 2].max()

# 古い葉を消す
bm = bmesh.new()
bm.from_mesh(mesh)
bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == leaf_index], context="FACES_ONLY")
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context="VERTS")
bm.to_mesh(mesh)
bm.free()

# 新しい葉の材質
material = bpy.data.materials.new("painted_leaf")
material.use_nodes = True
image = bpy.data.images.load(args.atlas)
image.pack()
tex = material.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = image
bsdf = material.node_tree.nodes["Principled BSDF"]
material.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
material.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
material.blend_method = "CLIP"
vertex_color_node = material.node_tree.nodes.new("ShaderNodeVertexColor")
vertex_color_node.layer_name = mesh.color_attributes.active_color.name if mesh.color_attributes.active_color else "Color"

# 葉の板を作る
weights = radii ** 2
counts = np.floor(weights / weights.sum() * args.count).astype(int)
vertices, faces, face_uvs, face_colors, face_normals = [], [], [], [], []
half_w = args.leaf / 2
height = args.leaf * args.aspect
lift = math.radians(args.lift)
for clump, number in enumerate(counts):
    center, radius = centers[clump], radii[clump]
    apex = center + np.array([0, 0, radius * args.flat * 1.9])
    for _ in range(number):
        # 上半分に多く、下半分に少し
        phi = rng.uniform(0, 2 * math.pi)
        if rng.random() < args.under:
            z = -rng.uniform(0.0, 0.75)
        else:
            z = rng.uniform(0.0, 1.0)
        ring = math.sqrt(max(0.0, 1 - z * z))
        direction = np.array([ring * math.cos(phi), ring * math.sin(phi), z])
        position = center + direction * radius * np.array([1, 1, args.flat])
        surface = direction / np.linalg.norm(direction)
        tip = position - apex
        tip = tip - surface * tip.dot(surface)
        if np.linalg.norm(tip) < 1e-4:
            tip = np.array([math.cos(phi), math.sin(phi), 0.0])
        tip /= np.linalg.norm(tip)
        turn = math.radians(rng.uniform(-args.jitter, args.jitter))
        side = np.cross(surface, tip)
        tip = tip * math.cos(turn) + side * math.sin(turn)
        side = np.cross(surface, tip)
        new_tip = tip * math.cos(lift) + surface * math.sin(lift)
        # 明るさ: 木の上・塊の上ほど明るい
        crown = (position[2] - crown_low) / max(crown_high - crown_low, 1e-3)
        light = 0.55 * np.clip(crown, 0, 1) + 0.45 * (z * 0.5 + 0.5) + rng.normal(0, 0.09)
        tone = TONE_ORDER[int(np.clip(light, 0, 0.999) * len(TONE_ORDER))]
        u0, v1 = (tone % ROOM) / ROOM, 1 - (tone // ROOM) / ROWS
        u1, v0 = u0 + 1 / ROOM, v1 - 1 / ROWS
        # 葉の根元を中心の少し内側に置く（中心を葉の中ほどに）
        corners = (position - new_tip * height * 0.45 - side * half_w,
                   position - new_tip * height * 0.45 + side * half_w,
                   position + new_tip * height * 0.55 + side * half_w,
                   position + new_tip * height * 0.55 - side * half_w)
        base = len(vertices)
        vertices.extend(corners)
        faces.append((base, base + 1, base + 2, base + 3))
        face_uvs.append(((u0, v0), (u1, v0), (u1, v1), (u0, v1)))
        # 頂点色は絵に掛かる。今の木の葉は 0.55 前後なので合わせる（1.0 近いと白く飛ぶ）
        shade = 0.44 + 0.2 * (z * 0.5 + 0.5)
        face_colors.append(shade)
        normals = []
        for corner in corners:
            radial = (corner - center) / np.array([1, 1, args.flat])
            radial /= np.linalg.norm(radial)
            normals.append(radial)
        face_normals.append(normals)

leaf_mesh = bpy.data.meshes.new("cards")
leaf_mesh.from_pydata([tuple(v) for v in vertices], [], faces)
leaf_mesh.update()
uv_name = mesh.uv_layers.active.name
color_name = vertex_color_node.layer_name
leaf_mesh.uv_layers.new(name=uv_name)
leaf_mesh.color_attributes.new(color_name, "BYTE_COLOR", "CORNER")
# 層を足すと配列が移るので、足し終えてから取り直す
uv_values = np.empty(len(leaf_mesh.loops) * 2)
color_values = np.empty(len(leaf_mesh.loops) * 4)
loop_normal = []
for polygon, uvs, shade, normals in zip(leaf_mesh.polygons, face_uvs, face_colors, face_normals):
    for corner, loop in enumerate(polygon.loop_indices):
        uv_values[loop * 2:loop * 2 + 2] = uvs[corner]
        color_values[loop * 4:loop * 4 + 4] = (shade, shade, shade, 1.0)
        loop_normal.append(tuple(normals[corner]))
leaf_mesh.uv_layers[uv_name].data.foreach_set("uv", uv_values)
leaf_mesh.color_attributes[color_name].data.foreach_set("color", color_values)
leaf_mesh.normals_split_custom_set(loop_normal)
leaf_mesh.materials.append(material)
leaf_mesh.update()
leaf_object = bpy.data.objects.new("cards", leaf_mesh)
bpy.context.scene.collection.objects.link(leaf_object)
leaf_object.matrix_world = obj.matrix_world

bpy.ops.object.select_all(action="DESELECT")
leaf_object.select_set(True)
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.join()
obj.data.calc_loop_triangles()
print("INFO leaves", len(faces), "tris", len(obj.data.loop_triangles), "old leaf tris", old_tris)

bpy.ops.export_scene.gltf(
    filepath=args.out,
    export_format="GLB",
    export_normals=True,
    export_texcoords=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_vertex_color="ACTIVE",
    export_apply=False,
)
print("WROTE", args.out)
