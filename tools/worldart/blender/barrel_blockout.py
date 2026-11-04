#!/usr/bin/env python3
"""見本の樽の 1 段目（大きな形だけ）を、断面の回転で作って撮る。

断面の数値は見本 art/shots/barrel_m0164/ref.webp の輪郭から測った（直径 0.80m・高さ 0.95m）。
使い方: blender --background --python barrel_blockout.py -- --out <出力先のフォルダ>
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

SIDES = 16
SHARP_ANGLE = math.radians(35)

# 断面 (半径, 高さ)。底の中心から外へ回り、天面のくぼみの中心で終わる。
PROFILE = [
    (0.000, 0.000),
    (0.262, 0.000),
    (0.284, 0.024),
    # 下のたがより下の胴
    (0.306, 0.118),
    # 下のたが（胴より外へ張り出す。33m のカメラで読めるよう、見本の 1.2cm より厚い 2.4cm）
    (0.330, 0.118),
    (0.382, 0.258),
    # 胴のふくらみ
    (0.358, 0.258),
    (0.384, 0.360),
    (0.400, 0.462),
    (0.384, 0.575),
    (0.353, 0.690),
    # 上のたが
    (0.380, 0.690),
    (0.347, 0.812),
    # 上のたがより上の胴と、縁
    (0.311, 0.812),
    (0.285, 0.905),
    (0.262, 0.950),
    # 天面の縁とくぼみ
    (0.232, 0.950),
    (0.222, 0.895),
    (0.000, 0.895),
]


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--stage", type=int, default=1, choices=(1, 2, 3, 4))
    parser.add_argument("--bake-guides", action="store_true", help="stage 4: 形の情報を焼いて終わる")
    parser.add_argument("--atlas", help="stage 4: 塗った絵。なければ灰色で UV だけ作る")
    return parser.parse_args(argv)


def build_barrel():
    """断面を回して閉じた 1 メッシュを作る。段差だけ硬く、周りはなめらかに見せる。"""
    mesh = bpy.data.meshes.new("barrel_blockout")
    bm = bmesh.new()
    rings = []
    for radius, height in PROFILE:
        if radius == 0.0:
            rings.append([bm.verts.new((0.0, 0.0, height))])
            continue
        ring = []
        for side in range(SIDES):
            angle = 2.0 * math.pi * side / SIDES
            ring.append(bm.verts.new((radius * math.cos(angle), radius * math.sin(angle), height)))
        rings.append(ring)
    for lower, upper in zip(rings, rings[1:]):
        for side in range(SIDES):
            next_side = (side + 1) % SIDES
            if len(lower) == 1:
                bm.faces.new((lower[0], upper[side], upper[next_side]))
            elif len(upper) == 1:
                bm.faces.new((lower[side], upper[0], lower[next_side]))
            else:
                bm.faces.new((lower[side], lower[next_side], upper[next_side], upper[side]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.faces.ensure_lookup_table()
    for face in bm.faces:
        face.smooth = True
    for edge in bm.edges:
        if len(edge.link_faces) == 2:
            edge.smooth = edge.calc_face_angle(0.0) < SHARP_ANGLE
    bm.to_mesh(mesh)
    triangles = sum(len(face.verts) - 2 for face in bm.faces)
    non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
    bm.free()
    obj = bpy.data.objects.new("barrel_blockout", mesh)
    bpy.context.collection.objects.link(obj)
    material = bpy.data.materials.new("blockout_gray")
    material.use_nodes = True
    principled = material.node_tree.nodes["Principled BSDF"]
    principled.inputs["Base Color"].default_value = (0.42, 0.42, 0.42, 1.0)
    principled.inputs["Roughness"].default_value = 0.95
    # ゲームの材質は色の絵しか読まないので、灰色の小さな絵を貼る。絵がないと真っ白になる。
    image = bpy.data.images.new("blockout_gray", 4, 4)
    image.pixels = [0.42, 0.42, 0.42, 1.0] * 16
    image.pack()
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    material.node_tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    mesh.materials.append(material)
    return obj, triangles, non_manifold


# 2 段目: 断面の各行の種類。body = 胴（板に分かれる）、band = たが、rim = 縁（板の頭）、lid = ふた。
PROFILE_KINDS = ["base", "base", "body", "body", "band", "band", "body", "body", "body", "body",
                 "body", "band", "band", "body", "body", "rim", "rim", "lid", "lid"]
STAVES = 12
GROOVE_DEPTH = 0.016     # 板の境の谷の深さ
STAVE_BULGE = 0.006      # 板ごとの厚みの違いの幅
STAVE_WIDTH_JITTER = 0.14
RIM_HEIGHT_JITTER = 0.008
BAND_TILT = 0.005        # たがのわずかな傾き


RIVETS_PER_BAND = 8
RIVET_RADIUS = 0.038     # 見本の鋲の直径は約 8cm（ゲームの画面で約 6 画素）
RIVET_HEIGHT = 0.017
RIVET_SIDES = 6
RIVET_UV_CENTER = (0.42, 0.06)
RIVET_UV_RADIUS = 0.05
RIM_CHIPS = {2: (0.012, 0.006), 7: (0.009, 0.004)}  # 板の番号: (下げる高さ, 削る厚み)


def add_rivet(bm, center, normal, uv_layer=None):
    """たがの面に乗せる低い丸頭。裏は見えないので閉じない。"""
    normal = normal.normalized()
    up = Vector((0.0, 0.0, 1.0))
    tangent = up.cross(normal).normalized()
    bitangent = normal.cross(tangent).normalized()
    base = []
    shoulder = []
    for side in range(RIVET_SIDES):
        angle = 2.0 * math.pi * side / RIVET_SIDES
        direction = tangent * math.cos(angle) + bitangent * math.sin(angle)
        base.append(bm.verts.new(center - normal * 0.004 + direction * RIVET_RADIUS))
        shoulder.append(bm.verts.new(center + normal * RIVET_HEIGHT * 0.72 + direction * RIVET_RADIUS * 0.68))
    tip = bm.verts.new(center + normal * RIVET_HEIGHT)
    faces = []
    for side in range(RIVET_SIDES):
        next_side = (side + 1) % RIVET_SIDES
        faces.append(bm.faces.new((base[side], base[next_side], shoulder[next_side], shoulder[side])))
        faces.append(bm.faces.new((shoulder[side], shoulder[next_side], tip)))
    for face in faces:
        face.smooth = True
        if uv_layer is not None:
            # 鋲は全部同じ丸い絵を共有する。上から見た丸として展開する。
            for loop in face.loops:
                if loop.vert in base:
                    index, radius = base.index(loop.vert), RIVET_UV_RADIUS
                elif loop.vert in shoulder:
                    index, radius = shoulder.index(loop.vert), RIVET_UV_RADIUS * 0.62
                else:
                    index, radius = 0, 0.0
                angle = 2.0 * math.pi * index / RIVET_SIDES
                loop[uv_layer].uv = (RIVET_UV_CENTER[0] + radius * math.cos(angle),
                                     RIVET_UV_CENTER[1] + radius * math.sin(angle))
    return len(faces)


def add_rivets(bm, rng, tilts, uv_layer=None):
    """上下のたがに鋲を並べる。行 4-5 が下のたが、行 11-12 が上のたが。"""
    triangles = 0
    for rows, tilt in (((4, 5), tilts[0]), ((11, 12), tilts[1])):
        (r0, z0), (r1, z1) = PROFILE[rows[0]], PROFILE[rows[1]]
        radius, height = (r0 + r1) * 0.5, (z0 + z1) * 0.5
        slope = Vector((z1 - z0, 0.0, -(r1 - r0))).normalized()
        offset = rng.uniform(0.0, 0.7)
        for index in range(RIVETS_PER_BAND):
            angle = offset + 2.0 * math.pi * index / RIVETS_PER_BAND + rng.uniform(-0.04, 0.04)
            cos_a, sin_a = math.cos(angle), math.sin(angle)
            center = Vector((radius * cos_a, radius * sin_a,
                             height + tilt[1] * math.sin(angle + tilt[0])))
            normal = Vector((slope.x * cos_a, slope.x * sin_a, slope.z))
            add_rivet(bm, center, normal, uv_layer)
            triangles += RIVET_SIDES * 3
    return triangles


def assign_atlas_uv(bm, rings, columns, start):
    """1 枚の絵の中の場所を面ごとに決める。胴は上半分、たが・縁・ふた・鋲は下半分。"""
    uv_layer = bm.loops.layers.uv.new("UVMap")
    count = len(columns)
    us = [(angle - start) / (2.0 * math.pi) for angle, _, _ in columns]

    def body_v(row):
        return 0.5 + 0.5 * PROFILE[row][1] / 0.96

    # 面の下の行 → (下の行の v, 上の行の v)。None は胴の高さで決める。
    # たがの段差の面は絵の縁に置くと明るい擦れを拾って白い帯になるので、帯の内側の色を使う。
    # 鋲の跡（帯の中央の高さ）も避ける。
    fixed_v = {3: (0.315, 0.315), 4: (0.30, 0.38), 5: (0.365, 0.365), 10: (0.415, 0.415), 11: (0.40, 0.48),
               12: (0.465, 0.465), 15: (0.24, 0.28), 16: (0.20, 0.24)}
    for row, (lower, upper) in enumerate(zip(rings, rings[1:])):
        lookup = {}
        for side, vert in enumerate(lower):
            lookup[vert] = (side, 0)
        for side, vert in enumerate(upper):
            lookup[vert] = (side, 1)
        faces = {face for vert in lower for face in vert.link_faces
                 if all(loop.vert in lookup for loop in face.loops)}
        for face in faces:
            if row == 0:
                for loop in face.loops:
                    loop[uv_layer].uv = (0.35, 0.10)
                continue
            if row == 17:
                for loop in face.loops:
                    x, y, _ = loop.vert.co
                    loop[uv_layer].uv = (0.10 + 0.09 * x / 0.222, 0.10 + 0.09 * y / 0.222)
                continue
            sides = {lookup[loop.vert][0] for loop in face.loops}
            wraps = 0 in sides and count - 1 in sides
            for loop in face.loops:
                side, is_upper = lookup[loop.vert]
                u = us[side]
                if wraps and side == 0:
                    u = 1.0
                if row in fixed_v:
                    v = fixed_v[row][is_upper]
                else:
                    v = body_v(row + is_upper)
                loop[uv_layer].uv = (u, v)
    return uv_layer, us


def build_barrel_stage2(seed=7, details=False, uv_layout=None):
    """板 12 枚の胴に分ける。各板は境が谷、中央が山。縁は板の頭ごとに高さが違う。"""
    rng = random.Random(seed)
    weights = [1.0 + rng.uniform(-STAVE_WIDTH_JITTER, STAVE_WIDTH_JITTER) for _ in range(STAVES)]
    total = sum(weights)
    edge_angles = []
    angle = rng.uniform(0.0, 0.3)
    for weight in weights:
        edge_angles.append(angle)
        angle += 2.0 * math.pi * weight / total
    start = edge_angles[0]
    columns = []
    for index in range(STAVES):
        next_angle = edge_angles[(index + 1) % STAVES] if index + 1 < STAVES else start + 2.0 * math.pi
        columns.append((edge_angles[index], "edge", index))
        columns.append(((edge_angles[index] + next_angle) * 0.5, "mid", index))
    stave_offset = [rng.uniform(-STAVE_BULGE, STAVE_BULGE) for _ in range(STAVES)]
    stave_top = [rng.uniform(-RIM_HEIGHT_JITTER, RIM_HEIGHT_JITTER) for _ in range(STAVES)]
    tilts = {0: (rng.uniform(0, 6.28), BAND_TILT), 1: (rng.uniform(0, 6.28), BAND_TILT)}

    mesh = bpy.data.meshes.new("barrel_blockout")
    bm = bmesh.new()
    rings = []
    for row, ((radius, height), kind) in enumerate(zip(PROFILE, PROFILE_KINDS)):
        if radius == 0.0:
            rings.append([bm.verts.new((0.0, 0.0, height))])
            continue
        tilt = None
        if 3 <= row <= 6:
            tilt = tilts[0]
        elif 10 <= row <= 13:
            tilt = tilts[1]
        ring = []
        for column_angle, column_kind, stave in columns:
            r, z = radius, height
            if kind in ("body", "rim"):
                if column_kind == "edge":
                    r -= GROOVE_DEPTH * (0.6 if kind == "rim" else 1.0)
                else:
                    r += stave_offset[stave]
            if kind == "rim" and column_kind == "mid":
                z += stave_top[stave]
                if details and stave in RIM_CHIPS:
                    z -= RIM_CHIPS[stave][0]
                    r -= RIM_CHIPS[stave][1]
            # 3 と 6、10 と 13 の行は段差の相手なので、たがと同じ高さに傾ける。
            if tilt is not None and row in (3, 4, 5, 6, 10, 11, 12, 13):
                z += tilt[1] * math.sin(column_angle + tilt[0])
            ring.append(bm.verts.new((r * math.cos(column_angle), r * math.sin(column_angle), z)))
        rings.append(ring)
    count = len(columns)
    for lower, upper in zip(rings, rings[1:]):
        for side in range(count):
            next_side = (side + 1) % count
            if len(lower) == 1:
                bm.faces.new((lower[0], upper[side], upper[next_side]))
            elif len(upper) == 1:
                bm.faces.new((lower[side], upper[0], lower[next_side]))
            else:
                bm.faces.new((lower[side], lower[next_side], upper[next_side], upper[side]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for face in bm.faces:
        face.smooth = True
    for edge in bm.edges:
        if len(edge.link_faces) == 2:
            edge.smooth = edge.calc_face_angle(0.0) < SHARP_ANGLE
    # 板の境は角度によらず硬くして、谷を線として読ませる。
    for row in range(len(rings) - 1):
        kinds = (PROFILE_KINDS[row], PROFILE_KINDS[row + 1])
        if len(rings[row]) == 1 or len(rings[row + 1]) == 1:
            continue
        if kinds[0] in ("body", "rim") and kinds[1] in ("body", "rim"):
            for side in range(0, count, 2):
                edge = bm.edges.get((rings[row][side], rings[row + 1][side]))
                if edge is not None:
                    edge.smooth = False
    non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
    uv_layer = None
    if uv_layout is not None:
        uv_layer, us = assign_atlas_uv(bm, rings, columns, start)
        uv_layout["stave_edges"] = us[0::2]
    if details:
        add_rivets(bm, rng, tilts, uv_layer)
    bm.to_mesh(mesh)
    triangles = sum(len(face.verts) - 2 for face in bm.faces)
    bm.free()
    obj = bpy.data.objects.new("barrel_blockout", mesh)
    bpy.context.collection.objects.link(obj)
    attach_gray(mesh)
    return obj, triangles, non_manifold


def bake_guides(obj, out):
    """形の情報を UV へ焼く: 奥まり（AO）と角（Bevel とそのままの法線の差）。光は使わない。"""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 64
    scene.cycles.device = "CPU"
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    material = obj.data.materials[0]
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    output = next(node for node in nodes if node.type == "OUTPUT_MATERIAL")

    def target(name):
        image = bpy.data.images.new(name, 1024, 1024, alpha=False, float_buffer=False)
        node = nodes.new("ShaderNodeTexImage")
        node.image = image
        nodes.active = node
        node.select = True
        return image

    ao = target("guide_ao")
    bpy.ops.object.bake(type="AO", margin=8, use_clear=True)
    ao.filepath_raw = os.path.join(out, "guide_ao.png")
    ao.file_format = "PNG"
    ao.save()

    bevel = nodes.new("ShaderNodeBevel")
    bevel.samples = 8
    bevel.inputs["Radius"].default_value = 0.022
    geometry = nodes.new("ShaderNodeNewGeometry")
    dot = nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    links.new(bevel.outputs["Normal"], dot.inputs[0])
    links.new(geometry.outputs["True Normal"], dot.inputs[1])
    invert = nodes.new("ShaderNodeMath")
    invert.operation = "SUBTRACT"
    invert.inputs[0].default_value = 1.0
    links.new(dot.outputs["Value"], invert.inputs[1])
    gain = nodes.new("ShaderNodeMath")
    gain.operation = "MULTIPLY"
    gain.inputs[1].default_value = 8.0
    links.new(invert.outputs[0], gain.inputs[0])
    emission = nodes.new("ShaderNodeEmission")
    links.new(gain.outputs[0], emission.inputs["Color"])
    links.new(emission.outputs[0], output.inputs["Surface"])
    edge = target("guide_edge")
    bpy.ops.object.bake(type="EMIT", margin=8, use_clear=True)
    edge.filepath_raw = os.path.join(out, "guide_edge.png")
    edge.file_format = "PNG"
    edge.save()


def attach_atlas(mesh, path):
    material = bpy.data.materials.new("barrel_paint")
    material.use_nodes = True
    principled = material.node_tree.nodes["Principled BSDF"]
    principled.inputs["Roughness"].default_value = 0.95
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(path)
    material.node_tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    mesh.materials.clear()
    mesh.materials.append(material)


def attach_gray(mesh):
    material = bpy.data.materials.new("blockout_gray")
    material.use_nodes = True
    principled = material.node_tree.nodes["Principled BSDF"]
    principled.inputs["Roughness"].default_value = 0.95
    # ゲームの材質は色の絵しか読まないので、灰色の小さな絵を貼る。絵がないと真っ白になる。
    image = bpy.data.images.new("blockout_gray", 4, 4)
    image.pixels = [0.42, 0.42, 0.42, 1.0] * 16
    image.pack()
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    material.node_tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    mesh.materials.append(material)


def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs[0].default_value = (0.55, 0.62, 0.75, 1.0)
    background.inputs[1].default_value = 0.55
    scene.world = world
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.0
    sun_data.angle = math.radians(6)
    sun = bpy.data.objects.new("sun", sun_data)
    # 第 3 世代の規則に合わせて、高度 40 度の横からの光。
    sun.rotation_euler = (math.radians(50), 0.0, math.radians(-60))
    bpy.context.collection.objects.link(sun)
    camera_data = bpy.data.cameras.new("camera")
    camera = bpy.data.objects.new("camera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    return scene, camera


def aim(camera, azimuth, elevation, distance, target=(0.0, 0.0, 0.475)):
    target = Vector(target)
    az, el = math.radians(azimuth), math.radians(elevation)
    camera.location = target + distance * Vector((math.sin(az) * math.cos(el),
                                                  -math.cos(az) * math.cos(el), math.sin(el)))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def shoot(scene, path, width, height, transparent=False):
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.film_transparent = transparent
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)


def main():
    args = arguments()
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    layout = {} if args.stage == 4 else None
    obj, triangles, non_manifold = (build_barrel() if args.stage == 1 else
                                    build_barrel_stage2(details=args.stage >= 3, uv_layout=layout))
    if layout is not None:
        with open(os.path.join(out, "layout.json"), "w", encoding="utf8") as handle:
            json.dump(layout, handle)
        if args.bake_guides:
            bake_guides(obj, out)
            return
        if args.atlas:
            attach_atlas(obj.data, os.path.abspath(args.atlas))
    scene, camera = setup_scene()

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, "barrel_stage%d.glb" % args.stage), export_format="GLB",
                              use_selection=True, export_yup=True, export_apply=True,
                              export_image_format="JPEG", export_jpeg_quality=90)

    # 輪郭を見本と重ねるための正面（1m = 300 画素の平行投影、背景は透明）
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 400 / 300
    aim(camera, 0, 0, 10)
    shoot(scene, os.path.join(out, "front_alpha.png"), 400, 400, transparent=True)
    shoot(scene, os.path.join(out, "front.png"), 400, 400)
    aim(camera, 0, 90, 10, target=(0.0, 0.0, 0.0))
    shoot(scene, os.path.join(out, "top.png"), 400, 400)
    # 見本の斜めの絵に近い向き
    aim(camera, 0, 26, 10)
    shoot(scene, os.path.join(out, "angle.png"), 400, 400)

    # ゲームのカメラ: 俯角 45 度・縦の画角 18 度・距離 33m。872 画素で 1m ≈ 83 画素。
    bpy.ops.mesh.primitive_plane_add(size=30)
    bpy.context.object.data.materials.append(bpy.data.materials.new("floor"))
    bpy.context.object.data.materials[0].diffuse_color = (0.5, 0.5, 0.5, 1.0)
    camera.data.type = "PERSP"
    camera.data.sensor_fit = "VERTICAL"
    camera.data.angle_y = math.radians(18)
    aim(camera, 30, 45, 33)
    shoot(scene, os.path.join(out, "game.png"), 872, 872)

    print("BARREL_RESULT triangles=%d non_manifold=%d dimensions=%s" % (
        triangles, non_manifold, tuple(round(v, 4) for v in obj.dimensions)))


if __name__ == "__main__":
    main()
