#!/usr/bin/env python3
"""見本の広葉樹を 1 本作って撮る。葉の塊を枝の先に並べ、段ごとの葉の絵と幹の絵を共有する。

使い方: blender --background --python tree_blockout.py -- --out <フォルダ> [--atlas <絵>]
"""

import argparse
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from barrel_blockout import aim, setup_scene, shoot  # noqa: E402

UP = Vector((0.0, 0.0, 1.0))

# 葉の長さ方向の位置と幅（0 は先端）。先を丸くする。
ROWS = ((0.0, 0.50), (0.30, 0.96), (0.60, 1.0), (0.85, 0.66), (1.0, 0.0))
PILLOW = 0.32          # 葉の縁が中央より下がる量。ふっくらした陰影を作る

# 段: 枚数, 付け根の半径, 付け根の高さ, 長さ, 幅, 付け根の垂れ, 先の垂れ（度）, 回転のずれ
TIERS = (
    (6, 0.00, 0.84, 0.34, 0.36, -8, 28, 0.0),
    (8, 0.11, 0.82, 0.46, 0.38, 8, 42, 0.5),
    (10, 0.30, 0.68, 0.52, 0.36, 28, 68, 0.0),
    (12, 0.48, 0.44, 0.50, 0.33, 56, 88, 0.5),
)
BRANCHED = 10   # 枝を付ける塊の数。残りは隠れるので枝を省く
WIDE, FLAT = 1.45, 0.85
TILT = 20.0   # 外側の塊ほど外へ傾ける（度）
JITTER_ANGLE, JITTER_LENGTH, JITTER_DROOP = 5.0, 0.08, 5.0

# 葉の塊: x, y, z（塊の原点）, 大きさ。y がマイナスの側がカメラの手前。
# 塊どうしを重ねて密集させる。
CLUMPS = (
    (0.00, 0.04, 2.62, 1.05),
    (-0.68, -0.12, 2.25, 0.92),
    (0.68, -0.08, 2.30, 0.95),
    (-0.24, -0.56, 2.00, 0.82),
    (0.36, -0.58, 1.92, 0.80),
    (-0.84, 0.36, 1.90, 0.72),
    (0.84, 0.40, 1.95, 0.75),
    (0.04, 0.60, 2.30, 0.85),
    (1.14, -0.36, 1.62, 0.62),
    (-1.12, -0.24, 1.60, 0.60),
    (-0.42, 0.34, 2.48, 0.82),
    (0.46, 0.36, 2.50, 0.84),
    (0.02, -0.36, 2.28, 0.88),
    (-0.72, -0.52, 1.72, 0.66),
    (0.76, -0.50, 1.70, 0.66),
)
FORK = Vector((0.0, 0.0, 1.10))
TRUNK_RINGS = ((0.00, 0.46, 0.85), (0.12, 0.42, 0.62), (0.30, 0.38, 0.36), (0.55, 0.34, 0.16),
               (0.80, 0.32, 0.05), (1.00, 0.31, 0.0), (1.20, 0.33, 0.0))   # 高さ, 半径, 根の張り
TRUNK_SIDES, ROOTS, TWIST = 15, 5, 0.70
BRANCH_SIDES, BRANCH_RINGS = 6, 4
BRANCH_R0, BRANCH_R1 = 0.17, 0.07
CULL_XY, CULL_Z = 0.56, 0.30   # 別の塊の中に隠れる葉を消す範囲

SIZE = 1024
TILE, GAP = 244, 8
VARIANTS = 3
DARK_RECT = (GAP + VARIANTS * (TILE + GAP), GAP, 16, 16)
BARK_RECT = (GAP + VARIANTS * (TILE + GAP), 32, 244, 984)
BOTTOM_SHADE, TOP_SHADE = 0.84, 1.0   # 木全体の高さによる色の流れ


def tile_rect(tier, variant):
    return (GAP + variant * (TILE + GAP), GAP + tier * (TILE + GAP), TILE, TILE)


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--atlas")
    return parser.parse_args(argv)


def to_uv(rect, s, t):
    x, y, w, h = rect
    return ((x + s * w) / SIZE, 1.0 - (y + (1.0 - t) * h) / SIZE)


def inside_other_clump(point, own):
    for index, (cx, cy, cz, scale) in enumerate(CLUMPS):
        if index == own:
            continue
        dx = (point.x - cx) / (CULL_XY * WIDE * scale)
        dy = (point.y - cy) / (CULL_XY * WIDE * scale)
        dz = (point.z - (cz + 0.46 * scale)) / (CULL_Z * scale)
        if dx * dx + dy * dy + dz * dz < 1.0:
            return True
    return False


def add_leaf_rows(tier, rng, angle):
    count, r0, z0, length, width, droop0, droop1, phase = tier
    leaf_length = length * (1.0 + rng.uniform(-JITTER_LENGTH, JITTER_LENGTH))
    droop_shift = rng.uniform(-JITTER_DROOP, JITTER_DROOP)
    radial = Vector((math.cos(angle), math.sin(angle), 0.0))
    side = UP.cross(radial)
    position = radial * r0 + UP * z0
    previous = 0.0
    rows = []
    for t, w in ROWS:
        droop = math.radians(droop0 + (droop1 - droop0) * t + droop_shift)
        direction = radial * math.cos(droop) - UP * math.sin(droop)
        position = position + direction * (t - previous) * leaf_length
        previous = t
        above = direction.cross(side)
        half = width * w / 2
        if w == 0.0:
            rows.append([(position.copy(), (0.5, t))])
        else:
            rows.append([(position - side * half - above * width * w * PILLOW, (0.5 - w / 2, t)),
                         (position.copy(), (0.5, t)),
                         (position + side * half - above * width * w * PILLOW, (0.5 + w / 2, t))])
    return rows


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.color = self.bm.verts.layers.float_color.new("Color")
        self.leaves = self.culled = 0

    def face(self, items, smooth=True):
        face = self.bm.faces.new([item[0] for item in items])
        face.smooth = smooth
        for loop, item in zip(face.loops, items):
            loop[self.uv].uv = item[1]

    def add_clump(self, index, rng):
        cx, cy, cz, scale = CLUMPS[index]
        yaw = rng.uniform(0.0, math.tau)
        outward = Vector((cx, cy, 0.0))
        tilt = Matrix.Rotation(math.radians(TILT) * min(1.0, outward.length / 1.4), 3, UP.cross(outward).normalized())             if outward.length > 0.01 else Matrix.Identity(3)
        pivot = Vector((cx, cy, cz))
        def place(point):
            x, y = point.x * WIDE, point.y * WIDE
            local = Vector((x * math.cos(yaw) - y * math.sin(yaw), x * math.sin(yaw) + y * math.cos(yaw), point.z * FLAT))
            return pivot + tilt @ local * scale
        for tier_index, tier in enumerate(TIERS):
            count, phase = tier[0], tier[7]
            for number in range(count):
                angle = (number + phase) / count * math.tau + math.radians(rng.uniform(-JITTER_ANGLE, JITTER_ANGLE))
                rect = tile_rect(tier_index, rng.randrange(VARIANTS))
                rows = add_leaf_rows(tier, rng, angle)
                self.leaves += 1
                if inside_other_clump(place(rows[-1][0][0]), index) and inside_other_clump(place(rows[2][1][0]), index):
                    self.culled += 1
                    continue
                mesh_rows = [[(self.bm.verts.new(place(point)), to_uv(rect, *st)) for point, st in row] for row in rows]
                for near, far in zip(mesh_rows[:-2], mesh_rows[1:-1]):
                    for i in (0, 1):
                        self.face((near[i + 1], near[i], far[i], far[i + 1]))
                self.face((mesh_rows[-2][1], mesh_rows[-2][0], mesh_rows[-1][0]))
                self.face((mesh_rows[-2][2], mesh_rows[-2][1], mesh_rows[-1][0]))
        # 真ん中の小さな芯。
        apex_uv = to_uv(tile_rect(0, 0), 0.5, 0.9)
        apex = self.bm.verts.new(place(Vector((0.0, 0.0, 0.885))))
        ring = [self.bm.verts.new(place(Vector((0.04 * math.cos(i / 6 * math.tau), 0.04 * math.sin(i / 6 * math.tau), 0.85))))
                for i in range(6)]
        for i in range(6):
            self.face(((ring[i], apex_uv), (ring[(i + 1) % 6], apex_uv), (apex, apex_uv)))
        # 葉のすき間から向こうが見えないように、中間の緑の塊を入れる。
        core = bmesh.ops.create_icosphere(self.bm, subdivisions=1, radius=1.0)
        dark_uv = to_uv(DARK_RECT, 0.5, 0.5)
        for vert in core["verts"]:
            vert.co = place(Vector((vert.co.x * 0.36, vert.co.y * 0.36, vert.co.z * 0.26 + 0.46)))
        faces = {face for vert in core["verts"] for face in vert.link_faces}
        for face in faces:
            face.smooth = True
            for loop in face.loops:
                loop[self.uv].uv = dark_uv

    def add_sweep(self, rings, sides, v_range, s_scale=1.0):
        """rings: (中心, 半径, 張り, 回転)。幹の絵の縦が長さ方向。"""
        grid = []
        total = len(rings) - 1
        first_axis = rings[0][4]
        helper = Vector((1.0, 0.0, 0.0)) if abs(first_axis.x) < 0.8 else Vector((0.0, 1.0, 0.0))
        a = first_axis.cross(helper).normalized()
        for ring_index, (center, radius, flare, twist, axis) in enumerate(rings):
            # 前の輪の向きを引き継ぐ。輪ごとに基準を取り直すと、ねじれて棘になる。
            a = (a - axis * a.dot(axis)).normalized()
            b = axis.cross(a).normalized()
            row = []
            for i in range(sides + 1):
                theta = (i % sides) / sides * math.tau + twist
                lobe = max(0.0, math.cos(ROOTS * (i % sides) / sides * math.tau)) * flare if flare else 0.0
                point = center + (a * math.cos(theta) + b * math.sin(theta)) * radius * (1.0 + lobe)
                if flare and lobe > 0.3:
                    point.z = max(point.z - 0.05 * lobe, -0.05)
                vert = self.bm.verts.new(point)
                t = v_range[0] + (v_range[1] - v_range[0]) * ring_index / total
                row.append((vert, to_uv(BARK_RECT, i / sides * s_scale, t)))
            grid.append(row)
        for near, far in zip(grid[:-1], grid[1:]):
            for i in range(sides):
                self.face((near[i], near[i + 1], far[i + 1], far[i]))


def bezier(p0, p1, p2, t):
    return p0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + p2 * t * t


def build_tree(seed=23):
    rng = random.Random(seed)
    builder = Builder()
    for index in range(len(CLUMPS)):
        builder.add_clump(index, rng)
    # 幹。少しよじれながら太い根へ広がる。
    trunk = [(Vector((0.04 * math.sin(z * 2.0), 0.0, z)), radius, flare, z * TWIST, UP)
             for z, radius, flare in TRUNK_RINGS]
    builder.add_sweep(trunk, TRUNK_SIDES, (0.0, 0.45))
    # 枝。分かれ目から各塊の中心へ、外へ張り出してから上がる。
    for index, (cx, cy, cz, scale) in enumerate(CLUMPS[:BRANCHED]):
        end = Vector((cx, cy, cz + 0.42 * scale))
        start = FORK - UP * 0.15 + Vector((cx, cy, 0.0)).normalized() * 0.08
        middle = (start + end) / 2 + Vector((cx * 0.15, cy * 0.15, -0.30))
        rings = []
        for ring in range(BRANCH_RINGS + 1):
            t = ring / BRANCH_RINGS
            point = bezier(start, middle, end, t)
            ahead = bezier(start, middle, end, min(1.0, t + 0.05)) - bezier(start, middle, end, max(0.0, t - 0.05))
            rings.append((point, BRANCH_R0 + (BRANCH_R1 - BRANCH_R0) * t, 0.0, 0.0, ahead.normalized()))
        builder.add_sweep(rings, BRANCH_SIDES, (0.5 + index * 0.04, 0.54 + index * 0.04), 0.5)

    # 木全体の高さで色を流す。
    bm = builder.bm
    heights = [vert.co.z for vert in bm.verts]
    z_max = max(heights)
    for vert in bm.verts:
        h = max(0.0, vert.co.z - 1.6) / (z_max - 1.6)
        shade = BOTTOM_SHADE + (TOP_SHADE - BOTTOM_SHADE) * h ** 0.8
        vert[builder.color] = (shade, shade, shade, 1.0)

    mesh = bpy.data.meshes.new("tree_blockout")
    triangles = sum(len(face.verts) - 2 for face in bm.faces)
    leaves, culled = builder.leaves, builder.culled
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("tree_blockout", mesh)
    bpy.context.collection.objects.link(obj)
    return obj, triangles, leaves, culled


def attach_material(mesh, path=None):
    # 名前に leaf を入れない。ゲームが切り抜きの板の葉として扱ってしまう。
    material = bpy.data.materials.new("broadtree_paint")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    principled = nodes["Principled BSDF"]
    principled.inputs["Roughness"].default_value = 0.95
    texture = nodes.new("ShaderNodeTexImage")
    if path:
        texture.image = bpy.data.images.load(path)
    else:
        image = bpy.data.images.new("blockout_gray", 4, 4)
        image.pixels = [0.42, 0.42, 0.42, 1.0] * 16
        image.pack()
        texture.image = image
    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = "Color"
    multiply = nodes.new("ShaderNodeMix")
    multiply.data_type = "RGBA"
    multiply.blend_type = "MULTIPLY"
    multiply.inputs[0].default_value = 1.0
    links = material.node_tree.links
    links.new(texture.outputs["Color"], multiply.inputs[6])
    links.new(attribute.outputs["Color"], multiply.inputs[7])
    links.new(multiply.outputs[2], principled.inputs["Base Color"])
    mesh.materials.append(material)


def main():
    args = arguments()
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obj, triangles, leaves, culled = build_tree()
    attach_material(obj.data, os.path.abspath(args.atlas) if args.atlas else None)
    with open(os.path.join(out, "layout.json"), "w", encoding="utf8") as handle:
        json.dump({"rows": ROWS, "tiers": len(TIERS), "variants": VARIANTS,
                   "tiles": [[tile_rect(t, v) for v in range(VARIANTS)] for t in range(len(TIERS))],
                   "dark": DARK_RECT, "bark": BARK_RECT}, handle)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, "tree.glb"), export_format="GLB",
                              use_selection=True, export_yup=True, export_apply=True,
                              export_vertex_color="ACTIVE",
                              export_image_format="JPEG", export_jpeg_quality=90)
    scene, camera = setup_scene()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 5.0
    target = (0.0, 0.0, 1.75)
    aim(camera, 20, 18, 12, target=target)
    shoot(scene, os.path.join(out, "angle.png"), 460, 460)
    aim(camera, 200, 18, 12, target=target)
    shoot(scene, os.path.join(out, "back.png"), 460, 460)
    print("TREE_RESULT triangles=%d leaves=%d culled=%d dimensions=%s" % (
        triangles, leaves, culled, tuple(round(v, 3) for v in obj.dimensions)))


if __name__ == "__main__":
    main()
