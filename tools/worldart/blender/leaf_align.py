"""葉を 1 枚ずつ置き直して、塊の表面に沿った屋根瓦の重なりに揃える。葉の位置と UV は変えない。

- 面の向き: 塊の中心から葉へ向かう向き（塊の表面に沿う）
- 先端の向き: 塊の頂点より上の点から葉へ向かう線を面に写した向き。上面は外へ、横は下へ流れる
- 瓦の反り: 先端を外へ少し持ち上げ、下の葉に重ねる
- 法線: 塊の丸みから作り直す（ふっくら見える）
- 小片（3 面の部品）は既定で消す。暗い菱形の正体で、葉の形には要らない

使い方: blender --background --python leaf_align.py -- --in a.glb --out b.glb
        [--material painted_leaf] [--clumps 7] [--jitter 14] [--lift 16] [--wobble 6] [--keep-small]
"""
import argparse
import math
import sys

import bmesh
import bpy
import numpy as np

args = argparse.ArgumentParser()
args.add_argument("--in", dest="source", required=True)
args.add_argument("--out", required=True)
args.add_argument("--material", default="painted_leaf")
args.add_argument("--clumps", type=int, default=7)
args.add_argument("--jitter", type=float, default=14.0, help="先端の向きのばらつき（度）")
args.add_argument("--lift", type=float, default=16.0, help="瓦の反り（度）")
args.add_argument("--wobble", type=float, default=6.0, help="面の傾きのばらつき（度）")
args.add_argument("--apex", type=float, default=0.9, help="塊の半径に対する、基準の点の高さ")
args.add_argument("--keep-small", action="store_true")
args.add_argument("--leaf-faces", type=int, default=7, help="葉 1 枚の面の数（板なら 2）")
args.add_argument("--up", type=float, default=0.0, help="面の向きを上へ寄せる量。絵の房の板は横を向くと棒に見える")
args.add_argument("--uv-grid", type=int, default=1, help="絵を N x N に分けて、板ごとに 1 枠を選ぶ（板の UV が 0〜1 のとき）")
args = args.parse_args(sys.argv[sys.argv.index("--") + 1:])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.source)
obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
mesh = obj.data
material_index = next(i for i, m in enumerate(mesh.materials) if m.name == args.material)

count = len(mesh.vertices)
positions = np.empty(count * 3)
mesh.vertices.foreach_get("co", positions)
positions = positions.reshape(-1, 3)
loop_count = len(mesh.loops)
loop_normals = np.empty(loop_count * 3)
mesh.corner_normals.foreach_get("vector", loop_normals)
loop_normals = loop_normals.reshape(-1, 3)
loop_verts = np.empty(loop_count, dtype=np.int32)
mesh.loops.foreach_get("vertex_index", loop_verts)
uvs = np.empty(loop_count * 2)
mesh.uv_layers.active.data.foreach_get("uv", uvs)
uvs = uvs.reshape(-1, 2)

# つながった面を 1 つの部品にまとめる
parent = list(range(count))


def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]
        a = parent[a]
    return a


leaf_polygons = [p for p in mesh.polygons if p.material_index == material_index]
for polygon in leaf_polygons:
    first = find(polygon.vertices[0])
    for vertex in polygon.vertices[1:]:
        parent[find(vertex)] = first

pieces = {}
for polygon in leaf_polygons:
    pieces.setdefault(find(polygon.vertices[0]), []).append(polygon)
pieces = list(pieces.values())
large = [p for p in pieces if len(p) == args.leaf_faces]
small = [p for p in pieces if len(p) == 3]
print("INFO large", len(large), "small", len(small))


def piece_info(polygons):
    verts = sorted({v for p in polygons for v in p.vertices})
    center = positions[verts].mean(axis=0)
    normal = np.zeros(3)
    high, low = (-1, None), (2, None)
    for polygon in polygons:
        normal += np.array(polygon.normal) * polygon.area
        for loop in polygon.loop_indices:
            v = uvs[loop][1]
            if v > high[0]:
                high = (v, positions[loop_verts[loop]])
            if v < low[0]:
                low = (v, positions[loop_verts[loop]])
    normal /= np.linalg.norm(normal) + 1e-9
    return verts, center, normal, high[1] - low[1]


def unit(vector):
    return vector / (np.linalg.norm(vector) + 1e-9)


info_large = [piece_info(p) for p in large]
info_small = [piece_info(p) for p in small]
large_centers = np.array([i[1] for i in info_large])

# 葉を塊に分ける（k-means、決まった乱数）
rng = np.random.default_rng(7)
centers = large_centers[rng.choice(len(large_centers), args.clumps, replace=False)]
for _ in range(40):
    labels = ((large_centers[:, None] - centers[None]) ** 2).sum(axis=2).argmin(axis=1)
    centers = np.array([large_centers[labels == k].mean(axis=0) if (labels == k).any() else centers[k]
                        for k in range(args.clumps)])
radii = np.array([np.linalg.norm(large_centers[labels == k] - centers[k], axis=1).mean() for k in range(args.clumps)])
print("INFO clump sizes", np.bincount(labels).tolist(), "radii", np.round(radii, 2).tolist())
apexes = centers + np.array([0.0, 0.0, 1.0]) * (radii * (1.0 + args.apex))[:, None]

lift = math.radians(args.lift)
new_positions = positions.copy()
vertex_normal = {}
for index, (verts, center, old_normal, old_tip) in enumerate(info_large):
    clump = labels[index]
    surface = unit(center - centers[clump] + rng.normal(0, math.radians(args.wobble), 3) * radii[clump])
    tip = center - apexes[clump]
    surface = unit(surface + np.array([0.0, 0.0, args.up]))
    tip = tip - surface * tip.dot(surface)
    if np.linalg.norm(tip) < 1e-4:
        tip = np.cross(surface, [1.0, 0.0, 0.0])
    tip = unit(tip)
    turn = math.radians(rng.uniform(-args.jitter, args.jitter))
    side = np.cross(surface, tip)
    tip = tip * math.cos(turn) + side * math.sin(turn)
    side = np.cross(surface, tip)
    new_tip = tip * math.cos(lift) + surface * math.sin(lift)
    new_normal = surface * math.cos(lift) - tip * math.sin(lift)
    old_t = unit(old_tip - old_normal * old_tip.dot(old_normal))
    old_side = np.cross(old_normal, old_t)
    rotation = np.column_stack((new_tip, side, new_normal)) @ np.column_stack((old_t, old_side, old_normal)).T
    group = np.array(verts)
    new_positions[group] = (positions[group] - center) @ rotation.T + center
    for vertex in group:
        radial = unit(new_positions[vertex] - centers[clump])
        vertex_normal[int(vertex)] = unit(radial * 0.75 + new_normal * 0.25)

for loop in range(loop_count):
    normal = vertex_normal.get(int(loop_verts[loop]))
    if normal is not None:
        loop_normals[loop] = normal

if args.uv_grid > 1:
    new_uvs = uvs.copy()
    for polygons in large:
        column, row = rng.integers(0, args.uv_grid, 2)
        for polygon in polygons:
            for loop in polygon.loop_indices:
                new_uvs[loop] = (uvs[loop] + (column, row)) / args.uv_grid
    mesh.uv_layers.active.data.foreach_set("uv", new_uvs.ravel())

mesh.vertices.foreach_set("co", new_positions.ravel())
mesh.normals_split_custom_set(loop_normals.tolist())
mesh.update()

if not args.keep_small:
    remove = {v for info in info_small for v in info[0]}
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[v] for v in remove], context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

mesh.calc_loop_triangles()
print("INFO tris", len(mesh.loop_triangles))

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
