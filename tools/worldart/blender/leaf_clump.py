#!/usr/bin/env python3
"""見本の木の葉の塊を 1 個作って撮る。葉を放射状に段で重ね、絵は段ごとの葉の絵を共有する。

使い方: blender --background --python leaf_clump.py -- --out <フォルダ> [--atlas <絵>]
"""

import argparse
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from barrel_blockout import aim, setup_scene, shoot  # noqa: E402

# 葉の長さ方向の位置と、その位置の幅（0 は先端）
ROWS = ((0.0, 0.45), (0.25, 0.92), (0.55, 1.0), (0.80, 0.70), (1.0, 0.0))
PILLOW = 0.20          # 葉の縁が中央より下がる量（幅に対する割合）

# 段: 枚数, 付け根の半径, 付け根の高さ, 長さ, 幅, 付け根の垂れ, 先の垂れ（度）, 回転のずれ
TIERS = (
    (6, 0.00, 0.84, 0.34, 0.30, -8, 28, 0.0),
    (8, 0.11, 0.82, 0.46, 0.32, 8, 42, 0.5),
    (11, 0.30, 0.68, 0.52, 0.33, 28, 68, 0.0),
    (14, 0.48, 0.44, 0.50, 0.29, 56, 88, 0.5),
)
WIDE = 1.28
JITTER_ANGLE = 5.0
JITTER_LENGTH = 0.08
JITTER_DROOP = 5.0

SIZE = 1024
TILE, GAP = 244, 8
VARIANTS = 3


def tile_rect(tier, variant):
    return (GAP + variant * (TILE + GAP), GAP + tier * (TILE + GAP), TILE, TILE)


DARK_RECT = (GAP + VARIANTS * (TILE + GAP), GAP, 16, 16)


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--atlas")
    return parser.parse_args(argv)


def build_clump(seed=11):
    rng = random.Random(seed)
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    def to_uv(rect, s, t):
        x, y, w, h = rect
        # 葉の先が絵の上
        return ((x + s * w) / SIZE, 1.0 - (y + (1.0 - t) * h) / SIZE)

    def add_face(items):
        face = bm.faces.new([item[0] for item in items])
        face.smooth = True
        for loop, item in zip(face.loops, items):
            loop[uv_layer].uv = item[1]

    for tier_index, (count, r0, z0, length, width, droop0, droop1, phase) in enumerate(TIERS):
        for number in range(count):
            angle = (number + phase) / count * math.tau + math.radians(rng.uniform(-JITTER_ANGLE, JITTER_ANGLE))
            leaf_length = length * (1.0 + rng.uniform(-JITTER_LENGTH, JITTER_LENGTH))
            droop_shift = rng.uniform(-JITTER_DROOP, JITTER_DROOP)
            rect = tile_rect(tier_index, rng.randrange(VARIANTS))
            radial = Vector((math.cos(angle), math.sin(angle), 0.0))
            side = Vector((0.0, 0.0, 1.0)).cross(radial)
            position = radial * r0 + Vector((0.0, 0.0, z0))
            previous_t = 0.0
            rows = []
            for t, w in ROWS:
                droop = math.radians(droop0 + (droop1 - droop0) * t + droop_shift)
                direction = radial * math.cos(droop) - Vector((0.0, 0.0, 1.0)) * math.sin(droop)
                position = position + direction * (t - previous_t) * leaf_length
                previous_t = t
                up = direction.cross(side)
                half = width * w / 2
                if w == 0.0:
                    rows.append([(bm.verts.new(position), to_uv(rect, 0.5, t))])
                    continue
                rows.append([
                    (bm.verts.new(position - side * half - up * width * w * PILLOW), to_uv(rect, 0.5 - w / 2, t)),
                    (bm.verts.new(position), to_uv(rect, 0.5, t)),
                    (bm.verts.new(position + side * half - up * width * w * PILLOW), to_uv(rect, 0.5 + w / 2, t)),
                ])
            for near, far in zip(rows[:-2], rows[1:-1]):
                for i in (0, 1):
                    add_face((near[i + 1], near[i], far[i], far[i + 1]))
            add_face((rows[-2][1], rows[-2][0], rows[-1][0]))
            add_face((rows[-2][2], rows[-2][1], rows[-1][0]))

    # 真ん中の小さな芯。見本の黄色い点。
    center = tile_rect(0, 0)
    apex = bm.verts.new((0.0, 0.0, 0.885))
    apex_uv = to_uv(center, 0.5, 0.9)
    ring = [bm.verts.new((0.04 * math.cos(i / 6 * math.tau), 0.04 * math.sin(i / 6 * math.tau), 0.85)) for i in range(6)]
    for i in range(6):
        add_face(((ring[i], apex_uv), (ring[(i + 1) % 6], apex_uv), (apex, apex_uv)))

    # 葉のすき間から向こうが見えないように、暗い塊を中に入れる。
    core = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    dark_uv = ((DARK_RECT[0] + 8) / SIZE, 1.0 - (DARK_RECT[1] + 8) / SIZE)
    for vert in core["verts"]:
        vert.co = Vector((vert.co.x * 0.36, vert.co.y * 0.36, vert.co.z * 0.26 + 0.46))
    core_verts = set(core["verts"])
    for face in bm.faces:
        if all(vert in core_verts for vert in face.verts):
            face.smooth = True
            for loop in face.loops:
                loop[uv_layer].uv = dark_uv

    # 見本の塊は高さより幅が広い。
    for vert in bm.verts:
        vert.co.x *= WIDE
        vert.co.y *= WIDE

    mesh = bpy.data.meshes.new("leaf_clump")
    triangles = sum(len(face.verts) - 2 for face in bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("leaf_clump", mesh)
    bpy.context.collection.objects.link(obj)
    return obj, triangles


def attach_material(mesh, path=None):
    # 名前に leaf を入れない。ゲームが切り抜きの板の葉として扱ってしまう。
    material = bpy.data.materials.new("clump_paint")
    material.use_nodes = True
    principled = material.node_tree.nodes["Principled BSDF"]
    principled.inputs["Roughness"].default_value = 0.95
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    if path:
        texture.image = bpy.data.images.load(path)
    else:
        image = bpy.data.images.new("blockout_gray", 4, 4)
        image.pixels = [0.42, 0.42, 0.42, 1.0] * 16
        image.pack()
        texture.image = image
    material.node_tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    mesh.materials.append(material)


def main():
    args = arguments()
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obj, triangles = build_clump()
    attach_material(obj.data, os.path.abspath(args.atlas) if args.atlas else None)
    with open(os.path.join(out, "layout.json"), "w", encoding="utf8") as handle:
        json.dump({"rows": ROWS, "tiers": len(TIERS), "variants": VARIANTS,
                   "tiles": [[tile_rect(t, v) for v in range(VARIANTS)] for t in range(len(TIERS))],
                   "dark": DARK_RECT}, handle)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, "leaf_clump.glb"), export_format="GLB",
                              use_selection=True, export_yup=True, export_apply=True,
                              export_image_format="JPEG", export_jpeg_quality=90)
    scene, camera = setup_scene()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.6
    target = (0.0, 0.0, 0.35)
    aim(camera, 30, 45, 10, target=target)
    shoot(scene, os.path.join(out, "angle.png"), 460, 460)
    aim(camera, 30, 12, 10, target=target)
    shoot(scene, os.path.join(out, "low.png"), 460, 460)
    print("LEAF_RESULT triangles=%d dimensions=%s" % (triangles, tuple(round(v, 3) for v in obj.dimensions)))


if __name__ == "__main__":
    main()
