#!/usr/bin/env python3
"""見本の木箱を、面ごとの四角で組み立てて撮る。全部の面の場所を展開図の上に数値で決める。

使い方: blender --background --python crate_blockout.py -- --out <フォルダ> --stage 1|2|3 [--bake-guides] [--atlas <絵>]
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
from barrel_blockout import aim, bake_guides, setup_scene, shoot  # noqa: E402

HALF = 0.40            # 箱の半分の大きさ（0.8m 角）
BEAM = 0.12            # 枠の角材の太さ（見本は 1 辺の約 15%）
PANEL_DEPTH = 0.025    # 板の面が枠より奥まる量
BRACE_WIDTH = 0.10
BRACE_LIFT = 0.018     # 斜め材が板の面から出る量
PLATE = 0.20           # 角の金具の大きさ（見本は 1 辺の約 25%）
PLATE_PROUD = 0.010    # 金具が枠より出る量
BOARDS = 4             # 面ごとの板の枚数
BOARD_JITTER = 0.004   # 板ごとの高さの違い
BEAM_JITTER = 0.004    # 角材の位置のずれ

SIZE = 1024
PIXELS_PER_M = 340
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
SIDES = ((X, Y), (-X, -Y), (Y, -X), (-Y, X))   # (外向き, 面の横方向)


class Atlas:
    """部品を左上から順に並べる。幅が尽きたら次の行へ。"""

    def __init__(self):
        self.x, self.y, self.row, self.parts = 8, 8, 0, []

    def place(self, name, kind, w, h):
        if self.x + w + 8 > SIZE:
            self.x, self.y, self.row = 8, self.y + self.row + 8, 0
        if self.y + h > SIZE:
            raise RuntimeError("展開図からはみ出した: " + name)
        rect = (self.x, self.y, w, h)
        self.parts.append({"name": name, "kind": kind, "rect": rect})
        self.x += w + 8
        self.row = max(self.row, h)
        return rect


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--stage", type=int, default=3, choices=(1, 2, 3))
    parser.add_argument("--bake-guides", action="store_true")
    parser.add_argument("--atlas")
    return parser.parse_args(argv)


def build_crate(stage, seed=5):
    rng = random.Random(seed)
    atlas = Atlas()
    panel_span = (HALF - BEAM + 0.05) * 2
    panel_px = int(panel_span * PIXELS_PER_M)
    beam_len_px = int(HALF * 2 * PIXELS_PER_M)
    beam_w_px = int(BEAM * PIXELS_PER_M)
    brace_w_px = int(BRACE_WIDTH * PIXELS_PER_M)

    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    def rect_face(center, normal, length_axis, length, width, rect, st=(0.0, 1.0)):
        side = normal.cross(length_axis)
        points = (center - length_axis * length / 2 - side * width / 2,
                  center + length_axis * length / 2 - side * width / 2,
                  center + length_axis * length / 2 + side * width / 2,
                  center - length_axis * length / 2 + side * width / 2)
        face = bm.faces.new([bm.verts.new(p + Z * HALF) for p in points])
        x, y, w, h = rect
        for loop, (s, t) in zip(face.loops, ((st[0], 0), (st[1], 0), (st[1], 1), (st[0], 1))):
            loop[uv_layer].uv = ((x + s * w) / SIZE, 1.0 - (y + (1.0 - t) * h) / SIZE)

    # 枠の内側の板の面。見本と同じく、向かい合う 2 面は横板、残りの 2 面は縦板にする。
    inner = HALF - PANEL_DEPTH
    faces = [("top", Z, X)]
    for index, (normal, across) in enumerate(SIDES):
        faces.append(("side%d" % index, normal, Z if index < 2 else across))
    rects = {name: atlas.place("panel_" + name, "panel", panel_px, panel_px) for name, _, _ in faces}
    dark = atlas.place("dark", "dark", 32, 32)
    plate = atlas.place("plate", "plate", 128, 128)
    # 板のすき間から向こうが透けないように、暗い箱を中に入れる。
    for name, normal, axis in faces:
        rect_face(normal * (inner - 0.012), normal, axis, (inner - 0.012) * 2, (inner - 0.012) * 2, dark)
    for name, normal, axis in faces:
        center = normal * inner
        if stage == 1:
            rect_face(center, normal, axis, panel_span, panel_span, rects[name])
            continue
        step = panel_span / BOARDS
        for board in range(BOARDS):
            offset = (board + 0.5 - BOARDS / 2) * step
            lift = rng.uniform(-BOARD_JITTER, BOARD_JITTER)
            rect_face(center + axis * offset + normal * lift, normal, axis, step, panel_span,
                      rects[name], (board / BOARDS, (board + 1) / BOARDS))

    # 枠の角材 12 本。外に見える面だけ展開図に場所を持ち、内向きの面は暗い場所を共有する。
    beams = []
    for sign_a in (-1, 1):
        for sign_b in (-1, 1):
            beams.append((Z, X * sign_a, Y * sign_b, "v%+d%+d" % (sign_a, sign_b)))
            beams.append((X, Y * sign_a, Z * sign_b, "x%+d%+d" % (sign_a, sign_b)))
            beams.append((Y, X * sign_a, Z * sign_b, "y%+d%+d" % (sign_a, sign_b)))
    for axis, out_a, out_b, name in beams:
        center = (out_a + out_b) * (HALF - BEAM / 2)
        if stage >= 2:
            center = center + out_a * rng.uniform(-BEAM_JITTER, 0) + out_b * rng.uniform(-BEAM_JITTER, 0)
        for number, normal in enumerate((out_a, out_b, -out_a, -out_b)):
            if normal.z < -0.5 and number < 2:
                continue   # 底は見えない
            rect = atlas.place("beam_%s_%d" % (name, number), "beam", beam_len_px, beam_w_px) if number < 2 else dark
            rect_face(center + normal * BEAM / 2, normal, axis, HALF * 2, BEAM, rect)

    # 斜め材。上の面にはない。
    if stage >= 2:
        reach = HALF - BEAM + 0.02
        length = reach * 2 * math.sqrt(2.0)
        brace_px = int(length * PIXELS_PER_M)
        for index, (normal, across) in enumerate(SIDES):
            direction = (across + Z * (1 if index % 2 == 0 else -1)).normalized()
            center = normal * (inner + BRACE_LIFT)
            rect = atlas.place("brace_%d" % index, "brace", brace_px, brace_w_px)
            rect_face(center, normal, direction, length, BRACE_WIDTH, rect)
            wall = normal.cross(direction)
            for sign in (-1, 1):
                rect_face(center + wall * sign * BRACE_WIDTH / 2 - normal * BRACE_LIFT / 2, wall * sign,
                          direction, length, BRACE_LIFT, dark)

    # 角の金具。全部が同じ絵を共有する。鋲は絵で描く。
    if stage >= 3:
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    center = Vector((sx, sy, sz)) * (HALF + PLATE_PROUD - PLATE / 2)
                    for normal, axis in ((X * sx, Y), (Y * sy, X), (Z * sz, X), (-X * sx, Y), (-Y * sy, X), (-Z * sz, X)):
                        if normal.z < -0.5 and sz < 0:
                            continue
                        # 奥まりに見える内向きの面に金具の絵を貼ると、小さな耳に見える。
                        inward = normal.dot(Vector((sx, sy, sz))) < 0
                        rect_face(center + normal * PLATE / 2, normal, axis, PLATE, PLATE, dark if inward else plate)

    for face in bm.faces:
        face.smooth = False
    mesh = bpy.data.meshes.new("crate_blockout")
    bm.to_mesh(mesh)
    triangles = sum(len(face.verts) - 2 for face in bm.faces)
    bm.free()
    obj = bpy.data.objects.new("crate_blockout", mesh)
    bpy.context.collection.objects.link(obj)
    return obj, triangles, atlas


def attach_material(mesh, path=None):
    material = bpy.data.materials.new("crate_paint")
    material.use_nodes = True
    principled = material.node_tree.nodes["Principled BSDF"]
    principled.inputs["Roughness"].default_value = 0.95
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    if path:
        texture.image = bpy.data.images.load(path)
    else:
        # ゲームの材質は色の絵しか読まないので、灰色の小さな絵を貼る。
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
    obj, triangles, atlas = build_crate(args.stage)
    with open(os.path.join(out, "layout.json"), "w", encoding="utf8") as handle:
        json.dump({"parts": atlas.parts}, handle)
    attach_material(obj.data, os.path.abspath(args.atlas) if args.atlas else None)
    if args.bake_guides:
        bake_guides(obj, out)
        return
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, "crate_stage%d.glb" % args.stage), export_format="GLB",
                              use_selection=True, export_yup=True, export_apply=True,
                              export_image_format="JPEG", export_jpeg_quality=90)
    scene, camera = setup_scene()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 1.8
    target = (0.0, 0.0, HALF)
    aim(camera, 40, 30, 10, target=target)
    shoot(scene, os.path.join(out, "angle.png"), 460, 460)
    aim(camera, 220, 30, 10, target=target)
    shoot(scene, os.path.join(out, "back.png"), 460, 460)
    print("CRATE_RESULT triangles=%d dimensions=%s parts=%d" % (
        triangles, tuple(round(v, 3) for v in obj.dimensions), len(atlas.parts)))


if __name__ == "__main__":
    main()
