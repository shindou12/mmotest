"""既存の GLB に、物の明暗の決まりを頂点色で焼く。形も絵も変えない。

RO3 の小物から立てた仮説を確かめる道具:
- 上が明るく、地面に近いほど暗い
- 窪みは暗く（AO）、出た角は少し明るい
- 太陽の向きの光は焼かない

使い方: blender --background --python asset_value_bake.py -- --in a.glb --out b.glb
        [--low 0.62] [--high 1.08] [--ao 0.55] [--edge 0.25] [--contact 0.35] [--skip leaf,frond,grass]
"""
import argparse
import math
import random
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

parser = argparse.ArgumentParser()
parser.add_argument("--in", dest="source", required=True)
parser.add_argument("--out", required=True)
parser.add_argument("--low", type=float, default=0.62, help="一番下の明るさ")
parser.add_argument("--high", type=float, default=1.08, help="一番上の明るさ")
parser.add_argument("--ao", type=float, default=0.55, help="窪みの暗さの強さ")
parser.add_argument("--edge", type=float, default=0.25, help="出た角の明るさの強さ")
parser.add_argument("--contact", type=float, default=0.35, help="接地の暗さの強さ")
parser.add_argument("--skip", default="leaf,frond,grass", help="名前にこれを含む材質の面は焼かない")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.source)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
SKIP = tuple(s for s in args.skip.split(",") if s)
rng = random.Random(1)
DIRECTIONS = []
for _ in range(16):
    z = rng.uniform(0.15, 1.0)
    angle = rng.uniform(0, math.tau)
    r = math.sqrt(1 - z * z)
    DIRECTIONS.append(Vector((r * math.cos(angle), r * math.sin(angle), z)))

points, faces = [], []
for obj in meshes:
    offset = len(points)
    points += [obj.matrix_world @ v.co for v in obj.data.vertices]
    faces += [[i + offset for i in p.vertices] for p in obj.data.polygons]
tree = BVHTree.FromPolygons(points, faces)
zs = [p.z for p in points]
bottom, top = min(zs), max(zs)
height = max(top - bottom, 1e-3)
reach = max(height * 0.6, 0.3)


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


for obj in meshes:
    mesh = obj.data
    normals = [(obj.matrix_world.to_3x3() @ v.normal).normalized() for v in mesh.vertices]
    bend = [0.0] * len(mesh.vertices)
    count = [0] * len(mesh.vertices)
    for edge in mesh.edges:
        a, b = edge.vertices
        along = (obj.matrix_world @ mesh.vertices[b].co) - (obj.matrix_world @ mesh.vertices[a].co)
        if along.length < 1e-5:
            continue
        convex = (normals[b] - normals[a]).dot(along.normalized())
        bend[a] += convex
        bend[b] += convex
        count[a] += 1
        count[b] += 1
    shade = []
    for index, vert in enumerate(mesh.vertices):
        world = obj.matrix_world @ vert.co
        t = (world.z - bottom) / height
        value = args.low + (args.high - args.low) * smooth(0.0, 1.0, t)
        value *= 1.0 - args.contact * (1.0 - smooth(0.0, min(0.35, height * 0.3), world.z - bottom))
        hits = 0
        for direction in DIRECTIONS:
            ray = direction if direction.dot(normals[index]) > 0 else -direction
            hit = tree.ray_cast(world + normals[index] * 0.012, ray, reach)
            if hit[0] is not None:
                hits += 1
        value *= 1.0 - args.ao * hits / len(DIRECTIONS)
        convexity = max(0.0, bend[index] / max(count[index], 1))
        value *= 1.0 + args.edge * min(1.0, convexity * 2.0)
        shade.append(value)
    attribute = mesh.color_attributes[0] if mesh.color_attributes else mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    if attribute.domain != "CORNER":
        name = attribute.name
        bpy.context.view_layer.objects.active = obj
        bpy.ops.geometry.color_attribute_convert(domain="CORNER", data_type="FLOAT_COLOR")
        attribute = mesh.color_attributes[name]
    had_color = bool(mesh.color_attributes) and any(c != 0 for c in attribute.data[0].color[:3]) if len(attribute.data) else False
    skip_faces = {p.index for p in mesh.polygons
                  if p.material_index < len(mesh.materials) and mesh.materials[p.material_index]
                  and any(s in mesh.materials[p.material_index].name.lower() for s in SKIP)}
    for polygon in mesh.polygons:
        if polygon.index in skip_faces:
            continue
        for loop_index in polygon.loop_indices:
            vertex = mesh.loops[loop_index].vertex_index
            before = attribute.data[loop_index].color if had_color else (1, 1, 1, 1)
            attribute.data[loop_index].color = (before[0] * shade[vertex], before[1] * shade[vertex],
                                                before[2] * shade[vertex], 1.0)
    mesh.color_attributes.active_color = attribute
print("INFO height", round(height, 2), "verts", len(points))
bpy.ops.export_scene.gltf(filepath=args.out, export_format="GLB", export_normals=True, export_texcoords=True,
                          export_materials="EXPORT", export_vertex_color="ACTIVE", export_apply=False)
print("WROTE", args.out)
