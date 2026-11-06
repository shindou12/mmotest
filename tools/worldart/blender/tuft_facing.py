"""固定カメラの前提で、カメラの側を向いた草の房を作る。真上から見ても星形にならない。

カードをカメラの視線に向けて立て、少しずつ向きとずらしを変えて重ねる。置くときは回さない。
カメラは +z の側から 45° で見下ろす（glTF の座標。Blender では -y の側）。

使い方: blender --background --python tuft_facing.py -- --atlas 絵.png --out grass.glb [--cards 3] [--width 0.62] [--height 0.5]
"""
import argparse
import math
import random
import sys

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument("--atlas", required=True)
parser.add_argument("--out", required=True)
parser.add_argument("--cards", type=int, default=3)
parser.add_argument("--width", type=float, default=0.62)
parser.add_argument("--height", type=float, default=0.5)
parser.add_argument("--back", type=float, default=30.0, help="カードを後ろへ倒す角度")
parser.add_argument("--seed", type=int, default=2)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])

bpy.ops.wm.read_factory_settings(use_empty=True)
rng = random.Random(args.seed)
vertices, faces, uvs, colors = [], [], [], []
tilt = math.radians(args.back)
for index in range(args.cards):
    yaw = math.radians(rng.uniform(-24, 24))
    side = Vector((math.cos(yaw), math.sin(yaw), 0.0))
    away = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
    up = (Vector((0, 0, 1)) * math.cos(tilt) + away * math.sin(tilt)) * args.height * rng.uniform(0.85, 1.1)
    half = side * args.width * rng.uniform(0.8, 1.05) / 2
    root = Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.08, 0.08), 0.0))
    start = len(vertices)
    vertices += [root - half, root + half, root + half + up, root - half + up]
    faces.append((start, start + 1, start + 2, start + 3))
    column, row = rng.randrange(2), rng.randrange(2)
    u0, v0 = column / 2, row / 2
    uvs += [(u0, v0), (u0 + 0.5, v0), (u0 + 0.5, v0 + 0.5), (u0, v0 + 0.5)]
    colors += [(0.9, 0.9, 0.9, 1)] * 2 + [(1.05, 1.05, 1.05, 1)] * 2

mesh = bpy.data.meshes.new("tuft")
mesh.from_pydata([tuple(v) for v in vertices], [], faces)
mesh.update()
uv_layer = mesh.uv_layers.new(name="UVMap")
color_layer = mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
for loop in mesh.loops:
    uv_layer.data[loop.index].uv = uvs[loop.vertex_index]
    color_layer.data[loop.index].color = colors[loop.vertex_index]
for polygon in mesh.polygons:
    polygon.use_smooth = True
mesh.normals_split_custom_set_from_vertices([(0.0, 0.0, 1.0)] * len(vertices))

image = bpy.data.images.load(args.atlas)
image.pack()
material = bpy.data.materials.new("grass_tuft")
material.use_nodes = True
tex = material.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = image
bsdf = material.node_tree.nodes["Principled BSDF"]
material.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
material.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
material.blend_method = "CLIP"
mesh.materials.append(material)
obj = bpy.data.objects.new("tuft", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.ops.export_scene.gltf(filepath=args.out, export_format="GLB", export_normals=True, export_texcoords=True,
                          export_materials="EXPORT", export_vertex_color="ACTIVE", export_apply=False)
print("WROTE", args.out)
