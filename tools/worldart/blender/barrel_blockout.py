#!/usr/bin/env python3
"""見本の樽の 1 段目（大きな形だけ）を、断面の回転で作って撮る。

断面の数値は見本 art/shots/barrel_m0164/ref.webp の輪郭から測った（直径 0.80m・高さ 0.95m）。
使い方: blender --background --python barrel_blockout.py -- --out <出力先のフォルダ>
"""

import argparse
import math
import os
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
    obj, triangles, non_manifold = build_barrel()
    scene, camera = setup_scene()

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, "barrel_stage1.glb"), export_format="GLB",
                              use_selection=True, export_yup=True, export_apply=True)

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
