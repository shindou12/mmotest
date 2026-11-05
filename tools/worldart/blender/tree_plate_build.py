"""太い幹と枝の上に、手描きの房の板を塊にして並べた木を組む。

房の絵は 2x2 で、1 枠の下の中央が根元、上が外側。板は塊の中心から外へ広げ、下の段ほど垂らす。
木全体の明暗と塊の間の影は頂点色で出す（板の根元を暗く、下の段を暗く）。

使い方: blender --background --python tree_plate_build.py -- --atlas clumps.png --bark wood.png --out tree.glb
        [--seed 3] [--plate 1.25] [--gap 0.6] [--scale-tree 1.0]
"""
import argparse
import math
import random
import sys

import bmesh
import bpy
from mathutils import Vector

args = argparse.ArgumentParser()
args.add_argument("--atlas", required=True)
args.add_argument("--bark", required=True)
args.add_argument("--out", required=True)
args.add_argument("--seed", type=int, default=3)
args.add_argument("--plate", type=float, default=1.25, help="塊の大きさ 1 のときの板の幅 (m)")
args.add_argument("--gap", type=float, default=0.6, help="板の根元の暗さ（頂点色に掛ける）")
args.add_argument("--bright", type=float, default=1.0, help="葉の頂点色に掛ける")
args.add_argument("--layout", default="round", choices=("round", "wide", "tall"))
args = args.parse_args(sys.argv[sys.argv.index("--") + 1:])

UP = Vector((0.0, 0.0, 1.0))
# 塊: x, y, z, 大きさ。y がマイナスの側がカメラの手前。奥行きを浅くして幹を見せる
LAYOUTS = {
    "round": ((0.05, 0.25, 3.45, 1.00), (-1.08, 0.05, 2.85, 0.84), (1.10, 0.10, 2.95, 0.90),
              (-1.72, -0.25, 2.12, 0.62), (1.78, -0.20, 2.20, 0.60), (0.08, -0.55, 2.62, 0.70)),
    "wide": ((-0.50, 0.25, 3.15, 0.92), (0.75, 0.20, 3.25, 0.96), (-1.65, 0.0, 2.50, 0.76),
             (1.85, 0.05, 2.55, 0.74), (0.10, -0.55, 2.45, 0.66)),
    "tall": ((0.10, 0.20, 3.85, 0.88), (-0.75, 0.10, 3.15, 0.80), (0.85, 0.10, 3.05, 0.84),
             (-1.30, -0.25, 2.30, 0.60), (1.30, -0.20, 2.25, 0.62), (0.05, -0.50, 2.65, 0.66)),
}
CLUMPS = LAYOUTS[args.layout]
# 段: 数, 高さ, 根元の距離, 垂れる角度（度）, 長さ, 頂点色
TIERS = ((4, 0.46, 0.0, 10, 0.86, 0.80),
         (5, 0.20, 0.18, 26, 1.00, 0.68),
         (7, -0.05, 0.30, 44, 1.02, 0.54),
         (7, -0.28, 0.32, 66, 0.92, 0.42))
FORK_Z = 1.45
TRUNK = ((0.00, 0.44, 0.95), (0.14, 0.40, 0.62), (0.34, 0.36, 0.30), (0.70, 0.32, 0.08),
         (1.05, 0.31, 0.0), (1.35, 0.33, 0.0), (1.60, 0.30, 0.0))   # 高さ, 半径, 根の張り
TRUNK_SIDES, ROOTS, TWIST = 12, 5, 0.75
BRANCH_SIDES, BRANCH_RINGS = 5, 3
BRANCH_R0, BRANCH_R1 = 0.20, 0.07
CORE = 0.46   # 塊の芯の大きさ。大きいと頂上に暗い多角形が見える

rng = random.Random(args.seed)
bpy.ops.wm.read_factory_settings(use_empty=True)
bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
color_layer = bm.loops.layers.color.new("Color")
normals = {}

atlas = bpy.data.images.load(args.atlas)
atlas.pack()
bark_image = bpy.data.images.load(args.bark)
bark_image.pack()


def find_solid_uv(image):
    """芯に使う、暗くて不透明な色の場所を絵から探す。"""
    width, height = image.size
    pixels = image.pixels[:]
    best, best_uv = 9.0, (0.25, 0.25)
    for y in range(4, height - 4, 24):
        for x in range(4, width - 4, 24):
            i = (y * width + x) * 4
            if pixels[i + 3] > 0.99:
                value = pixels[i] + pixels[i + 1] + pixels[i + 2]
                if value < best:
                    best, best_uv = value, ((x + 0.5) / width, (y + 0.5) / height)
    return best_uv


SOLID_UV = find_solid_uv(atlas)


def add_face(items, material):
    """items: (頂点, uv, 色)"""
    face = bm.faces.new([item[0] for item in items])
    face.material_index = material
    face.smooth = True
    for loop, item in zip(face.loops, items):
        loop[uv_layer].uv = item[1]
        loop[color_layer] = (item[2], item[2], item[2], 1.0)
    return face


def add_plate(center, direction, side, width, length, shade, clump_center, flat):
    column, row = rng.randrange(2), rng.randrange(2)
    u0, v0 = column / 2, row / 2
    half = side * width / 2
    corners = (center - half, center + half, center + direction * length + half, center + direction * length - half)
    uvs = ((u0, v0), (u0 + 0.5, v0), (u0 + 0.5, v0 + 0.5), (u0, v0 + 0.5))
    base = shade * args.gap
    shades = (base, base, shade, shade)
    items = []
    for corner, uv, value in zip(corners, uvs, shades):
        vert = bm.verts.new(corner)
        radial = (corner - clump_center)
        radial.z /= flat
        normals[vert] = (radial.normalized() + UP * 0.55).normalized()
        items.append((vert, uv, value * args.bright))
    add_face(items, 0)


def add_clump(x, y, z, scale):
    center = Vector((x, y, z))
    flat = 0.8
    # 芯: 向こうが透けないように、葉の暗い色の小さな球を入れる
    core = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    core_faces = set()
    for vert in core["verts"]:
        direction = vert.co.normalized()
        vert.co = center + Vector((direction.x, direction.y, direction.z * flat - 0.25)) * scale * CORE
        normals[vert] = (direction + UP * 0.55).normalized()
        core_faces.update(vert.link_faces)
    for face in core_faces:
        face.material_index = 0
        face.smooth = True
        for loop in face.loops:
            loop[uv_layer].uv = SOLID_UV
            loop[color_layer] = (0.34, 0.34, 0.34, 1.0)
    phase = rng.uniform(0, math.tau)
    for count, height, inner, droop, length, shade in TIERS:
        for number in range(count):
            angle = phase + (number + rng.uniform(-0.18, 0.18)) / count * math.tau
            out = Vector((math.cos(angle), math.sin(angle), 0.0))
            side = UP.cross(out).normalized()
            tilt = math.radians(droop + rng.uniform(-6, 6))
            direction = out * math.cos(tilt) - UP * math.sin(tilt)
            size = scale * rng.uniform(0.92, 1.08)
            root = center + out * inner * scale + UP * height * scale * flat
            add_plate(root, direction, side, args.plate * size, args.plate * size * length, shade, center, flat)
        phase += 0.4


def add_sweep(rings, sides, v_scale, roots=0):
    grid = []
    first = rings[0][4]
    helper = Vector((1.0, 0.0, 0.0)) if abs(first.x) < 0.8 else Vector((0.0, 1.0, 0.0))
    a = first.cross(helper).normalized()
    for ring_index, (center, radius, flare, twist, axis) in enumerate(rings):
        # 前の輪の向きを引き継ぐ。輪ごとに取り直すとねじれて棘になる
        a = (a - axis * a.dot(axis)).normalized()
        b = axis.cross(a).normalized()
        row = []
        for i in range(sides + 1):
            theta = (i % sides) / sides * math.tau + twist
            lobe = max(0.0, math.cos(roots * (i % sides) / sides * math.tau)) * flare if flare else 0.0
            ray = a * math.cos(theta) + b * math.sin(theta)
            point = center + ray * radius * (1.0 + lobe)
            if flare and lobe > 0.3:
                point.z = max(point.z - 0.05 * lobe, -0.05)
            vert = bm.verts.new(point)
            normals[vert] = ray
            row.append((vert, (i / sides, ring_index * v_scale)))
        grid.append(row)
    for near, far in zip(grid[:-1], grid[1:]):
        for i in range(sides):
            shade = 0.70
            add_face(((near[i][0], near[i][1], shade), (near[i + 1][0], near[i + 1][1], shade),
                      (far[i + 1][0], far[i + 1][1], shade), (far[i][0], far[i][1], shade)), 1)


def bezier(p0, p1, p2, t):
    return p0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + p2 * t * t


for clump in CLUMPS:
    add_clump(*clump)
add_sweep([(Vector((0.05 * math.sin(z * 2.2), 0.0, z)), radius, flare, z * TWIST, UP)
           for z, radius, flare in TRUNK], TRUNK_SIDES, 0.5, ROOTS)
for x, y, z, scale in CLUMPS:
    end = Vector((x, y, z))
    start = Vector((0.0, 0.0, FORK_Z - 0.1)) + Vector((x, y, 0.0)).normalized() * 0.08
    middle = (start + end) / 2 + Vector((x * 0.15, y * 0.15, -0.35))
    rings = []
    for ring in range(BRANCH_RINGS + 1):
        t = ring / BRANCH_RINGS
        ahead = bezier(start, middle, end, min(1.0, t + 0.05)) - bezier(start, middle, end, max(0.0, t - 0.05))
        rings.append((bezier(start, middle, end, t), BRANCH_R0 + (BRANCH_R1 - BRANCH_R0) * t, 0.0, 0.0, ahead.normalized()))
    add_sweep(rings, BRANCH_SIDES, 0.4)

vertex_normals = [None] * len(bm.verts)
bm.verts.index_update()
for vert in bm.verts:
    vertex_normals[vert.index] = tuple(normals.get(vert, UP))
triangles = sum(len(face.verts) - 2 for face in bm.faces)

mesh = bpy.data.meshes.new("tree_plate")
bm.to_mesh(mesh)
bm.free()
mesh.normals_split_custom_set_from_vertices(vertex_normals)


def make_material(name, image, alpha):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tex = material.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    bsdf = material.node_tree.nodes["Principled BSDF"]
    material.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha:
        material.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        material.blend_method = "CLIP"
    return material


mesh.materials.append(make_material("painted_leaf", atlas, True))
mesh.materials.append(make_material("bark", bark_image, False))
obj = bpy.data.objects.new("tree_plate", mesh)
bpy.context.scene.collection.objects.link(obj)
print("INFO tris", triangles, "plates", sum(t[0] for t in TIERS) * len(CLUMPS), "solid uv", SOLID_UV)

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
