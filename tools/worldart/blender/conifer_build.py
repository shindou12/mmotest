"""手描きの枝の房の板を段に並べて垂らした針葉樹を組む（M-0187、style-secrets.md 4.3）。

枝の絵は 2x2 で、1 枠の下の中央が付け根、上が枝先。段ごとに輪に並べ、付け根を幹に寄せて外へ垂らす。
- 段の上面を閉じるために、各段を外の輪と内の輪（短く、半歩ずらす）の 2 枚重ねにする
- 奥が透けないように、暗い円錐の芯を入れる
- 木全体の明暗は頂点色で出す（下の段ほど暗く青く、上の段ほど明るく黄色く。板の付け根を暗く）
- 法線は円錐の丸みから作る（板 1 枚ごとの陰影のばらつきを消し、塊として光を回す）

使い方: blender -b --factory-startup --python conifer_build.py -- --atlas boughs.png --bark wood.png --out conifer.glb
        [--seed 1] [--height 6.6] [--width 3.6] [--tiers 7] [--lean 0.1] [--render preview.png]
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
args.add_argument("--seed", type=int, default=1)
args.add_argument("--height", type=float, default=6.6)
args.add_argument("--width", type=float, default=3.6, help="一番下の段の直径 (m)")
args.add_argument("--tiers", type=int, default=7)
args.add_argument("--lean", type=float, default=0.1, help="幹の傾き (m)")
args.add_argument("--render", default="", help="ゲームのカメラに近い向きで描いた確認の画像")
args = args.parse_args(sys.argv[sys.argv.index("--") + 1:])

UP = Vector((0.0, 0.0, 1.0))
SKIRT = 0.9              # 一番下の段の付け根の高さ (m)。この下は幹が見える
ROOT_SHADE = 0.42        # 板の付け根の暗さ
BOTTOM, TOP = (0.34, 0.48, 0.56), (0.95, 1.00, 0.80)   # 下の段と上の段の頂点色（下は暗く青く、上は明るく黄色く）
CORE_SHADE = 0.45
rng = random.Random(args.seed)

bpy.ops.wm.read_factory_settings(use_empty=True)
bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
color_layer = bm.loops.layers.float_color.new("Color")   # 浮動小数（線形）。バイトの色は書き出しで sRGB から変換されて暗くなる
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
lean = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0.0)).normalized() * args.lean


def axis_point(z):
    return Vector((0.0, 0.0, z)) + lean * (max(z, 0.0) / args.height) ** 1.5


def add_face(items, material):
    """items: (頂点, uv, 色)"""
    face = bm.faces.new([item[0] for item in items])
    face.material_index = material
    face.smooth = True
    for loop, item in zip(face.loops, items):
        loop[uv_layer].uv = item[1]
        loop[color_layer] = (*item[2], 1.0)


def cone_normal(point, upward):
    radial = point - axis_point(point.z)
    radial.z = 0.0
    if radial.length < 1e-4:
        return UP.copy()
    return (radial.normalized() * (1.0 - upward) + UP * upward).normalized()


def add_bough(root, out, length, width, droop, sag, tone):
    """付け根 root から out の向きへ垂らした板。3 つに折って枝先をさらに垂らす。"""
    side = UP.cross(out).normalized()
    column, row = rng.randrange(2), rng.randrange(2)
    flip = rng.random() < 0.5
    u0, u1 = (column / 2 + 0.5, column / 2) if flip else (column / 2, column / 2 + 0.5)
    v0 = row / 2
    rows, point = [], root.copy()
    for step in range(4):
        t = step / 3
        if step:
            tilt = math.radians(droop + sag * (t ** 1.4))
            point = point + (out * math.cos(tilt) - UP * math.sin(tilt)) * (length / 3)
        shade = ROOT_SHADE + (1.0 - ROOT_SHADE) * t ** 0.7
        color = tuple(c * shade for c in tone)
        pair = []
        for sign, u in ((-1, u0), (1, u1)):
            # 板を少し山形にして、真上から見ても幅が出るようにする
            vert = bm.verts.new(point + side * sign * width / 2 - UP * 0.10 * width * (0.4 + t))
            normals[vert] = cone_normal(vert.co, 0.62 + 0.2 * (1 - t))
            pair.append((vert, (u, v0 + 0.5 * t), color))
        rows.append(pair)
    for near, far in zip(rows[:-1], rows[1:]):
        add_face((near[0], near[1], far[1], far[0]), 0)


def add_tier(index):
    t = index / (args.tiers - 1)                      # 0 が一番下、1 が一番上
    z = SKIRT + 0.35 + (args.height - SKIRT - 1.35) * t
    radius = args.width / 2 * (1.0 - 0.68 * t) * rng.uniform(0.94, 1.06)
    tone = tuple(BOTTOM[i] + (TOP[i] - BOTTOM[i]) * t ** 0.85 for i in range(3))
    count = max(5, round(9 - 4 * t))
    droop = 24 - 8 * t                               # 下の段ほど強く垂らす（度）
    phase = rng.uniform(0, math.tau)
    for layer, (scale, lift, step, bright) in enumerate(((1.0, 0.0, 0.0, 1.0), (0.66, 0.16, 0.5, 1.12))):
        for number in range(count if layer == 0 else max(3, count - 2)):
            n = count if layer == 0 else max(3, count - 2)
            angle = phase + (number + step + rng.uniform(-0.16, 0.16)) / n * math.tau
            out = Vector((math.cos(angle), math.sin(angle), 0.0))
            length = radius * scale * rng.uniform(0.95, 1.10) / math.cos(math.radians(droop + 8))
            root = axis_point(z + lift * radius) + out * 0.10 + UP * rng.uniform(-0.08, 0.08)
            add_bough(root, out, length, length * rng.uniform(1.35, 1.55), droop + rng.uniform(-5, 5),
                      rng.uniform(14, 24), tuple(c * bright * rng.uniform(0.94, 1.06) for c in tone))


def add_crown():
    """頂上: 上へ立つ小さな房を 4 枚。"""
    z = args.height - 1.25
    phase = rng.uniform(0, math.tau)
    for number in range(5):
        angle = phase + number / 5 * math.tau
        out = Vector((math.cos(angle), math.sin(angle), 0.0))
        add_bough(axis_point(z) + out * 0.02, out, 1.05, 1.2, -78, -10, TOP)


def add_core():
    """奥が透けないように、葉の暗い色の円錐を入れる。"""
    sides, rings = 8, ((SKIRT + 0.15, 0.30), (SKIRT + 0.5, 0.42), (args.height * 0.55, 0.26), (args.height - 0.9, 0.04))
    grid = []
    for z, r in rings:
        r *= args.width / 2
        row = []
        for i in range(sides):
            a = i / sides * math.tau
            vert = bm.verts.new(axis_point(z) + Vector((math.cos(a), math.sin(a), 0.0)) * r)
            normals[vert] = cone_normal(vert.co, 0.3)
            row.append(vert)
        grid.append(row)
    color = (CORE_SHADE, CORE_SHADE * 1.1, CORE_SHADE * 1.1)
    for near, far in zip(grid[:-1], grid[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            add_face([(v, SOLID_UV, color) for v in (near[i], near[j], far[j], far[i])], 0)


def add_trunk():
    sides, grid = 8, []
    for z, r in ((-0.05, 0.34), (0.12, 0.25), (0.5, 0.19), (SKIRT + 0.6, 0.15), (args.height * 0.6, 0.07)):
        row = []
        for i in range(sides + 1):
            a = (i % sides) / sides * math.tau
            ray = Vector((math.cos(a), math.sin(a), 0.0))
            vert = bm.verts.new(axis_point(max(z, 0.0)) + ray * r + UP * min(z, 0.0))
            normals[vert] = ray
            row.append((vert, (i / sides * 2, z * 0.5)))
        grid.append(row)
    shade = (0.62, 0.58, 0.56)
    for near, far in zip(grid[:-1], grid[1:]):
        for i in range(sides):
            add_face(((near[i][0], near[i][1], shade), (near[i + 1][0], near[i + 1][1], shade),
                      (far[i + 1][0], far[i + 1][1], shade), (far[i][0], far[i][1], shade)), 1)


add_trunk()
add_core()
for tier in range(args.tiers):
    add_tier(tier)
add_crown()

bm.verts.index_update()
vertex_normals = [tuple(normals.get(vert, UP)) for vert in bm.verts]
triangles = sum(len(face.verts) - 2 for face in bm.faces)
mesh = bpy.data.meshes.new("conifer")
bm.to_mesh(mesh)
bm.free()
mesh.normals_split_custom_set_from_vertices(vertex_normals)
# 書き出す色を明示する。指定しないと COLOR_0 が白で出て、自分の色が COLOR_1 に回る（ゲームは COLOR_0 しか読まない）
mesh.color_attributes.active_color_name = "Color"
mesh.color_attributes.render_color_index = mesh.color_attributes.find("Color")


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


mesh.materials.append(make_material("painted_leaf_conifer", atlas, True))
mesh.materials.append(make_material("bark", bark_image, False))
obj = bpy.data.objects.new("conifer", mesh)
bpy.context.scene.collection.objects.link(obj)
print("INFO tris", triangles, "solid uv", SOLID_UV)

bpy.ops.export_scene.gltf(filepath=args.out, export_format="GLB", export_normals=True, export_texcoords=True,
                          export_materials="EXPORT", export_image_format="AUTO", export_vertex_color="ACTIVE", export_all_vertex_colors=False,
                          export_apply=False)
print("WROTE", args.out)

if args.render:
    # 確認用: 頂点色を絵に掛け、ゲームに近いカメラ（俯角 45°）と横からの 2 枚を並べて描く
    for material in mesh.materials:
        tree = material.node_tree
        bsdf = tree.nodes["Principled BSDF"]
        tex = next(n for n in tree.nodes if n.type == "TEX_IMAGE")
        attr = tree.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Color"
        mul = tree.nodes.new("ShaderNodeMixRGB")
        mul.blend_type = "MULTIPLY"
        mul.inputs["Fac"].default_value = 1.0
        tree.links.new(tex.outputs["Color"], mul.inputs["Color1"])
        tree.links.new(attr.outputs["Color"], mul.inputs["Color2"])
        tree.links.new(mul.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 1.0
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
    scene = bpy.context.scene
    copies = [(4.2, 0.6, 1.2, 0.85), (-4.0, 1.2, 2.6, 1.1), (1.6, 4.6, 4.1, 0.95)]
    for x, y, turn, scale in copies:
        other = bpy.data.objects.new("copy", mesh)
        other.location, other.rotation_euler.z, other.scale = (x, y, 0), turn, (scale,) * 3
        scene.collection.objects.link(other)
    ground = bpy.data.meshes.new("ground")
    ground.from_pydata([(-30, -30, 0), (30, -30, 0), (30, 30, 0), (-30, 30, 0)], [], [(0, 1, 2, 3)])
    gmat = bpy.data.materials.new("ground")
    gmat.use_nodes = True
    gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.30, 0.42, 0.12, 1)
    gmat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
    ground.materials.append(gmat)
    scene.collection.objects.link(bpy.data.objects.new("ground", ground))
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy, sun.data.angle = 3.6, math.radians(6)
    sun.rotation_euler = (math.radians(52), 0, math.radians(-115))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.72, 0.95, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    scene.world = world
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.eevee.use_shadows = True
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    target = Vector((0.3, 1.5, 2.6))
    for name, pitch, distance, fov in (("game", 45, 33, 26), ("side", 12, 30, 26)):
        camera.data.angle = math.radians(fov)
        p = math.radians(pitch)
        camera.location = target + Vector((0, -math.cos(p), math.sin(p))) * distance
        camera.rotation_euler = (math.radians(90) - p, 0, 0)
        scene.render.filepath = args.render.replace(".png", "_" + name + ".png")
        bpy.ops.render.render(write_still=True)
        print("RENDER", scene.render.filepath)
