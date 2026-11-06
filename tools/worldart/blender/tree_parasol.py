"""RO3 の広葉樹の作りの仮説を確かめる木。細い幹に、星形の葉の小枝の板を傘状に 2〜3 段載せる。

仮説:
- 樹冠は球でなく、幹のまわりの傘が段になったもの。段の間から幹が見える
- 傘は表の明るい板と、その内側の暗い板の 2 層。すき間の暗さは奥の暗い板が作る
- 葉は平らな塗り。明暗は葉の絵でなく、板ごとの頂点色で出す
- 色は木ごとに変える

使い方: blender --background --python tree_parasol.py -- --atlas sprays.png --bark wood.png --out tree.glb
        [--seed 3] [--tint 1,1,1] [--tiers a|b] [--card 1.25]
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
args.add_argument("--tint", default="1,1,1", help="葉の色の倍率 R,G,B。木ごとの色の差")
args.add_argument("--tiers", default="a", choices=("a", "b", "c", "d"))
args.add_argument("--mass", type=float, default=0.14, help="暗い塊の頂点色")
args.add_argument("--side", type=float, default=0.7, help="法線を横へ倒す量。大きいほど日陰の側が暗い")
args.add_argument("--bake", type=float, default=0.0, help="太陽の側と反対の側の明暗を頂点色に焼く強さ")
args.add_argument("--sun-az", type=float, default=0.0, help="太陽の方位（度。地図の sun と同じ向き、木は回さず置く）")
args.add_argument("--bark-shade", type=float, default=0.5, help="幹の頂点色")
args.add_argument("--card", type=float, default=1.25, help="板の幅 (m)")
args.add_argument("--bright", type=float, default=1.0, help="表の板の頂点色に掛ける")
args.add_argument("--outer", type=float, default=1.0, help="表の板の数の倍率")
args = args.parse_args(sys.argv[sys.argv.index("--") + 1:])

UP = Vector((0.0, 0.0, 1.0))
# 地図の方位は sin(az) が x、cos(az) が z。glTF の z は Blender の -y
SUN_X, SUN_Y = math.sin(math.radians(args.sun_az)), -math.cos(math.radians(args.sun_az))
# 段: 高さ, 半径, 傘の高さ, 表の板, 内の板, ずらし x, y
TIERS = {
    "a": ((1.95, 1.75, 0.55, 24, 14, -0.15, -0.10), (3.15, 1.85, 0.75, 28, 14, 0.15, 0.05)),
    "b": ((1.75, 1.55, 0.45, 20, 12, 0.20, -0.10), (2.75, 1.60, 0.55, 22, 12, -0.20, 0.0), (3.75, 1.20, 0.60, 16, 8, 0.05, 0.05)),
    # 段の間を大きく開けて、幹を見せる高い木
    "c": ((2.0, 1.75, 0.40, 22, 12, -0.25, -0.05), (4.4, 2.00, 0.70, 30, 14, 0.20, 0.05)),
    "d": ((1.9, 1.55, 0.35, 18, 10, 0.25, -0.10), (3.7, 1.70, 0.45, 22, 12, -0.25, 0.0), (5.3, 1.25, 0.55, 16, 8, 0.05, 0.05)),
}[args.tiers]
TRUNK_TOP = TIERS[-1][0] + 0.2
TRUNK_R0, TRUNK_R1, TRUNK_SIDES = 0.20, 0.09, 8
TINT = tuple(float(c) for c in args.tint.split(","))

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
    """塊に使う、不透明で中くらいの明るさの色の場所を絵から探す。"""
    width, height = image.size
    pixels = image.pixels[:]
    found = []
    for y in range(4, height - 4, 16):
        for x in range(4, width - 4, 16):
            i = (y * width + x) * 4
            if pixels[i + 3] > 0.99:
                found.append((pixels[i] + pixels[i + 1] + pixels[i + 2], (x + 0.5) / width, (y + 0.5) / height))
    found.sort()
    return found[len(found) // 2][1:]


SOLID_UV = find_solid_uv(atlas)
vert_shade = {}


def add_face(items, material):
    face = bm.faces.new([item[0] for item in items])
    face.material_index = material
    face.smooth = True
    for loop, item in zip(face.loops, items):
        loop[uv_layer].uv = item[1]
        loop[color_layer] = (*item[2], 1.0)


def leaf_color(shade, warm):
    """明るい面はわずかに暖かく、暗い面も色相を大きく変えない（計測より）。"""
    return (shade * (0.96 + 0.08 * warm) * TINT[0], shade * TINT[1], shade * (0.98 - 0.08 * warm) * TINT[2])


def add_card(root, out, droop, width, length, base_shade, tip_shade, warm, normal):
    side = UP.cross(out).normalized()
    tilt = math.radians(droop)
    direction = out * math.cos(tilt) - UP * math.sin(tilt)
    half = side * width / 2
    column, row = rng.randrange(2), rng.randrange(2)
    u0, v0 = column / 2, row / 2
    corners = (root - half, root + half, root + direction * length + half, root + direction * length - half)
    uvs = ((u0, v0), (u0 + 0.5, v0), (u0 + 0.5, v0 + 0.5), (u0, v0 + 0.5))
    shades = (base_shade, base_shade, tip_shade, tip_shade)
    items = []
    for corner, uv, shade in zip(corners, uvs, shades):
        vert = bm.verts.new(corner)
        normals[vert] = normal
        items.append((vert, uv, leaf_color(shade, warm)))
    add_face(items, 0)


def direction_of(out, droop):
    tilt = math.radians(droop)
    return out * math.cos(tilt) - UP * math.sin(tilt)


def add_parasol(z, radius, height, outer, inner, dx, dy, tier_index):
    center = Vector((dx, dy, z))
    # 不透明な暗い塊。樹冠に穴が開かないのはこれのため（仮説）
    mass = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    mass_faces = set()
    for vert in mass["verts"]:
        direction = vert.co.normalized()
        vert.co = center + Vector((direction.x * radius * 0.66, direction.y * radius * 0.66,
                                   direction.z * (height + 0.15) * 0.70 + height * 0.05))
        normals[vert] = (direction + UP * 0.5).normalized()
        vert_shade[vert] = args.mass * (0.8 + 0.4 * (direction.z * 0.5 + 0.5))
        mass_faces.update(vert.link_faces)
    for face in mass_faces:
        face.material_index = 0
        face.smooth = True
        for loop in face.loops:
            loop[uv_layer].uv = SOLID_UV
            loop[color_layer] = (*leaf_color(vert_shade[loop.vert], 0.0), 1.0)
    # 内の暗い板。下から見える底にもなる
    for index in range(inner):
        angle = index / inner * math.tau + rng.uniform(-0.2, 0.2)
        out = Vector((math.cos(angle), math.sin(angle), 0.0))
        reach = rng.uniform(0.0, radius * 0.45)
        root = center + out * reach + UP * (height * 0.25 + rng.uniform(-0.08, 0.08))
        size = args.card * rng.uniform(0.95, 1.15)
        add_card(root, out, rng.uniform(14, 34), size, size, 0.22, 0.34, 0.0, (out * 0.3 + UP).normalized())
    # 表の板。内側から外へ向けて並べ、外ほど垂らす
    golden = math.pi * (3 - math.sqrt(5))
    phase = rng.uniform(0, math.tau)
    for index in range(outer):
        t = (index + 0.5) / outer
        r = math.sqrt(t) * radius * 0.72
        angle = phase + index * golden + rng.uniform(-0.15, 0.15)
        out = Vector((math.cos(angle), math.sin(angle), 0.0))
        dome = height * (1 - (r / max(radius, 1e-3)) ** 2)
        size = args.card * rng.uniform(0.85, 1.12)
        droop = 8 + 44 * (r / radius) ** 1.2 + rng.uniform(-6, 6)
        # 根元を内へ下げて、板の中ほどが傘の面に来るようにする（中心に穴を作らない）
        root = center + out * (r - size * 0.42) + UP * (dome + rng.uniform(-0.05, 0.05) + size * 0.42 * math.sin(math.radians(droop)))
        # 上の段ほど明るく、外の下がる所ほど暗い
        shade = args.bright * (0.74 + 0.08 * tier_index) * (1.0 - 0.28 * (r / radius)) * rng.uniform(0.9, 1.08)
        # 樹冠全体の明暗: 太陽の側を明るく、反対の側と裾を暗くする（固定カメラの前提で絵に焼く）
        spot = (root + direction_of(out, droop) * size * 0.5 - center) / radius
        lit = spot.x * SUN_X + spot.y * SUN_Y
        shade *= max(0.28, 1.0 + args.bake * (lit - 0.15))
        normal = (out * (r / radius) * args.side + UP).normalized()
        add_card(root, out, droop, size, size, shade * 0.62, shade, 1.0, normal)


def add_sweep(rings, sides, shade=None):
    shade = args.bark_shade if shade is None else shade
    grid = []
    first = rings[0][2]
    helper = Vector((1.0, 0.0, 0.0)) if abs(first.x) < 0.8 else Vector((0.0, 1.0, 0.0))
    a = first.cross(helper).normalized()
    for ring_index, (center, radius, axis) in enumerate(rings):
        a = (a - axis * a.dot(axis)).normalized()
        b = axis.cross(a).normalized()
        row = []
        for i in range(sides + 1):
            theta = (i % sides) / sides * math.tau
            ray = a * math.cos(theta) + b * math.sin(theta)
            vert = bm.verts.new(center + ray * radius)
            normals[vert] = ray
            row.append((vert, (i / sides, ring_index * 0.6)))
        grid.append(row)
    color = (shade, shade, shade)
    for near, far in zip(grid[:-1], grid[1:]):
        for i in range(sides):
            add_face(((near[i][0], near[i][1], color), (near[i + 1][0], near[i + 1][1], color),
                      (far[i + 1][0], far[i + 1][1], color), (far[i][0], far[i][1], color)), 1)


for tier_index, tier in enumerate(TIERS):
    z, radius, height, outer, inner, dx, dy = tier
    add_parasol(z, radius, height, int(outer * args.outer), inner, dx, dy, tier_index)
# 幹はほぼまっすぐ。わずかに傾く
lean = Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.05, 0.05), 0.0))
trunk = []
for ring in range(7):
    t = ring / 6
    radius = TRUNK_R0 + (TRUNK_R1 - TRUNK_R0) * t
    if ring == 0:
        radius *= 1.35
    trunk.append((lean * t + UP * (TRUNK_TOP * t - 0.05), radius, UP))
add_sweep(trunk, TRUNK_SIDES)
# 短い枝を段の下に
for tier_index, tier in enumerate(TIERS):
    for number in range(2):
        angle = rng.uniform(0, math.tau)
        out = Vector((math.cos(angle), math.sin(angle), 0.0))
        z = tier[0] - 0.05
        start = lean * (z / TRUNK_TOP) + UP * z
        axis = (out + UP * 0.45).normalized()
        add_sweep([(start, 0.06, axis), (start + axis * 0.65, 0.025, axis)], 5)

vertex_normals = [None] * len(bm.verts)
bm.verts.index_update()
for vert in bm.verts:
    vertex_normals[vert.index] = tuple(normals.get(vert, UP))
triangles = sum(len(face.verts) - 2 for face in bm.faces)
mesh = bpy.data.meshes.new("tree_parasol")
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
obj = bpy.data.objects.new("tree_parasol", mesh)
bpy.context.scene.collection.objects.link(obj)
print("INFO tris", triangles, "cards", sum(t[3] + t[4] for t in TIERS))
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
