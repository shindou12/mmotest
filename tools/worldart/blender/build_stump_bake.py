#!/usr/bin/env python3
"""切り株の形を作り、色を 1 枚に焼いて GLB を出力する。"""

import argparse
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / "art" / "painted-gen" / "stump"
WORK = Path(os.environ.get("STUMP_WORK_DIR", ROOT / ".agents" / "stump"))
GLB = ROOT / "public" / "worldart" / "assets" / "stump_b.glb"
BAKED = ART / "baked.png"
BLOCKOUT_SHOT = WORK / "1_blockout.png"
FINAL_SHOT = WORK / "2_baked_blender.png"

HEIGHT = 0.75
BODY_RADIUS = 0.49
ROOT_ANGLES = (0.18, 1.02, 1.91, 2.79, 3.63, 4.66, 5.48)
# 長い根を2本、途中で地面に潜る短い根を2本にする。
ROOT_LENGTHS = (0.29, 0.11, 0.19, 0.075, 0.30, 0.16, 0.065)
ROOT_WIDTHS = (0.17, 0.13, 0.20, 0.15, 0.19, 0.14, 0.12)
GROOVES = ((0.48, 0.060, 0.050), (0.85, 0.035, 0.033),
           (1.43, 0.085, 0.065), (2.24, 0.045, 0.041),
           (2.61, 0.070, 0.055), (3.20, 0.050, 0.039),
           (3.98, 0.090, 0.068), (4.40, 0.040, 0.044),
           (5.08, 0.075, 0.057), (5.84, 0.055, 0.046))
BASE_Z = -0.035
THETA_STEPS = 512
HEIGHT_STEPS = 128
TOP_RADIAL_STEPS = 28
BAKE_SIZE = 1024
BAKE_MARGIN = 16
TARGET_TRIANGLES = 3800

# 焼きの強さはここにまとめる。
BAKE_STRENGTH = {
    "color_variation": 0.08,
    "pointiness": 0.18,
    "ao": 0.32,
    "moss": 0.74,
    "moss_height": 0.34,
    "moss_up": 0.35,
    "moss_grooves": 0.22,
    "moss_noise_low": 0.34,
    "moss_noise_high": 0.68,
}

def args_from_blender():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blockout-only", action="store_true", help="灰色の形だけを作って撮影する")
    parser.add_argument("--skip-blockout-render", action="store_true", help="確認済みの灰色画像を残して焼く")
    parser.add_argument("--work-dir", help="撮影用の中間画像を置く場所")
    return parser.parse_args(argv)


def smoothstep(a, b, x):
    if a == b:
        return 0.0
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def angle_delta(a, b):
    return (a - b + math.pi) % (2.0 * math.pi) - math.pi


def edge_cut(theta):
    chips = (
        0.038 * math.exp(-((angle_delta(theta, 1.17) / 0.075) ** 2)),
        0.031 * math.exp(-((angle_delta(theta, 4.56) / 0.095) ** 2)),
    )
    return (0.010 * math.sin(4.0 * theta + 0.3)
            + 0.008 * math.sin(7.0 * theta + 1.2)
            - 0.018 * sum(chips) / 0.038)


def trunk_radius(theta, z):
    """幹の板から根の先まで、同じ側面の半径でつなぐ。"""
    v = max(0.0, min(1.0, (z - BASE_Z) / (HEIGHT - BASE_Z)))
    lower = 1.0 - v
    # 根を除く裾の半径は切り口の約1.38倍。上はほぼ円に戻る。
    r = BODY_RADIUS + 0.185 * lower ** 2.1
    r += (0.007 * math.sin(3.0 * theta + 0.4)
          + 0.005 * math.sin(5.0 * theta + 1.1))
    r += 0.004 * math.sin(23.0 * theta + 0.12 * v) * (0.4 + 0.6 * lower)
    for angle, width, depth in GROOVES:
        drift = 0.018 * math.sin(v * 2.7 + angle)
        groove = math.exp(-(angle_delta(theta, angle + drift) / width) ** 2)
        r -= depth * groove * (0.42 + 0.58 * lower ** 0.6)
    roots = 0.0
    for angle, length, width in zip(ROOT_ANGLES, ROOT_LENGTHS, ROOT_WIDTHS):
        bend = 0.055 * lower ** 2 * math.sin(angle * 2.0 + 0.7)
        spread = width + 0.075 * v
        ridge = math.exp(-(angle_delta(theta, angle + bend) / spread) ** 2)
        roots += length * ridge * (0.45 * lower ** 1.6 + 0.55 * lower ** 5)
    chips = (0.045 * math.exp(-((angle_delta(theta, 1.17) / 0.070) ** 2))
             + 0.037 * math.exp(-((angle_delta(theta, 4.56) / 0.090) ** 2)))
    r += roots
    r -= chips * smoothstep(0.70, 1.0, v)
    return r


def side_point(theta, z):
    v = max(0.0, min(1.0, z / HEIGHT))
    r = trunk_radius(theta, z)
    wave = edge_cut(theta) * smoothstep(0.94, 1.0, v)
    ox = 0.005 * math.sin(v * 5.0 + 0.2)
    oy = 0.006 * math.sin(v * 4.0 + 1.4)
    return (ox + r * math.cos(theta), oy + r * math.sin(theta), z + wave)


def add_face(verts, faces, uv_faces, material_ids, face, uv, material_id):
    faces.append(tuple(face))
    uv_faces.append(tuple(uv))
    material_ids.append(material_id)


def stump_mesh_data():
    verts, faces, uv_faces, material_ids = [], [], [], []

    # 円筒座標の密な格子で側面を作る。縦板と溝の位相は高さ方向に揃える。
    side_start = len(verts)
    for j in range(HEIGHT_STEPS + 1):
        z = BASE_Z + (HEIGHT - BASE_Z) * j / HEIGHT_STEPS
        for i in range(THETA_STEPS):
            theta = 2.0 * math.pi * i / THETA_STEPS
            verts.append(side_point(theta, z))
    for j in range(HEIGHT_STEPS):
        v0, v1 = j / HEIGHT_STEPS, (j + 1) / HEIGHT_STEPS
        for i in range(THETA_STEPS):
            i1 = (i + 1) % THETA_STEPS
            u0, u1 = i / THETA_STEPS, (i + 1) / THETA_STEPS
            a = side_start + j * THETA_STEPS + i
            b = side_start + j * THETA_STEPS + i1
            c = side_start + (j + 1) * THETA_STEPS + i1
            d = side_start + (j + 1) * THETA_STEPS + i
            add_face(verts, faces, uv_faces, material_ids, (a, b, c, d),
                     ((u0, v0), (u1, v0), (u1, v1), (u0, v1)), 0)

    # 中央は平らで、外縁だけ少し上下し、2か所の欠けを半径にも入れる。
    center = len(verts)
    verts.append((0.0, 0.0, HEIGHT))
    previous = None
    for ring in range(1, TOP_RADIAL_STEPS + 1):
        t = ring / TOP_RADIAL_STEPS
        start = len(verts)
        for i in range(THETA_STEPS):
            theta = 2.0 * math.pi * i / THETA_STEPS
            edge = side_point(theta, HEIGHT)
            x = edge[0] * t
            y = edge[1] * t
            z = HEIGHT + edge_cut(theta) * smoothstep(0.84, 1.0, t)
            verts.append((x, y, z))
        for i in range(THETA_STEPS):
            i1 = (i + 1) % THETA_STEPS
            u0, u1 = i / THETA_STEPS, (i + 1) / THETA_STEPS
            if previous is None:
                face = (center, start + i, start + i1)
                a0 = 2.0 * math.pi * i / THETA_STEPS
                a1 = 2.0 * math.pi * i1 / THETA_STEPS
                uv = ((0.5, 0.5), (0.5 + 0.5 * t * math.cos(a0), 0.5 + 0.5 * t * math.sin(a0)),
                      (0.5 + 0.5 * t * math.cos(a1), 0.5 + 0.5 * t * math.sin(a1)))
            else:
                face = (previous + i, start + i, start + i1, previous + i1)
                t0 = (ring - 1) / TOP_RADIAL_STEPS
                uv = ((0.5 + 0.5 * t0 * math.cos(2 * math.pi * i / THETA_STEPS),
                       0.5 + 0.5 * t0 * math.sin(2 * math.pi * i / THETA_STEPS)),
                      (0.5 + 0.5 * t * math.cos(2 * math.pi * i / THETA_STEPS),
                       0.5 + 0.5 * t * math.sin(2 * math.pi * i / THETA_STEPS)),
                      (0.5 + 0.5 * t * math.cos(2 * math.pi * i1 / THETA_STEPS),
                       0.5 + 0.5 * t * math.sin(2 * math.pi * i1 / THETA_STEPS)),
                      (0.5 + 0.5 * t0 * math.cos(2 * math.pi * i1 / THETA_STEPS),
                       0.5 + 0.5 * t0 * math.sin(2 * math.pi * i1 / THETA_STEPS)))
            add_face(verts, faces, uv_faces, material_ids, face, uv, 1)
        previous = start

    # 底面は地面から見えないが、閉じた形にしておく。
    bottom_center = len(verts)
    verts.append((0.0, 0.0, BASE_Z))
    bottom_ring = len(verts)
    for i in range(THETA_STEPS):
        theta = 2.0 * math.pi * i / THETA_STEPS
        x, y, _ = side_point(theta, BASE_Z)
        verts.append((x, y, BASE_Z))
    for i in range(THETA_STEPS):
        i1 = (i + 1) % THETA_STEPS
        p0 = Vector(verts[bottom_ring + i])
        p1 = Vector(verts[bottom_ring + i1])
        uv0 = (0.5 + p0.x / (2.0 * BODY_RADIUS), 0.5 + p0.y / (2.0 * BODY_RADIUS))
        uv1 = (0.5 + p1.x / (2.0 * BODY_RADIUS), 0.5 + p1.y / (2.0 * BODY_RADIUS))
        add_face(verts, faces, uv_faces, material_ids,
                 (bottom_center, bottom_ring + i1, bottom_ring + i),
                 ((0.5, 0.5), uv1, uv0), 0)

    return verts, faces, uv_faces, material_ids


def make_material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = 0.88
    return mat


def create_camera_and_stage(body):
    scene = bpy.context.scene
    # 同じ俯角45度・画角18度のカメラを形と焼き後の両方で使う。
    target = Vector((0.0, 0.0, 0.36))
    direction = Vector((math.cos(math.radians(45.0)) * math.sin(math.radians(45.0)),
                       -math.cos(math.radians(45.0)) * math.cos(math.radians(45.0)),
                       math.sin(math.radians(45.0))))
    camera_data = bpy.data.cameras.new("stump_camera")
    camera_data.sensor_fit = "VERTICAL"
    camera_data.angle_y = math.radians(18.0)
    camera = bpy.data.objects.new("stump_camera", camera_data)
    scene.collection.objects.link(camera)
    camera.location = target + direction * 6.0
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera

    ground_mat = make_material("blockout_ground", (0.19, 0.20, 0.20))
    bpy.ops.mesh.primitive_plane_add(size=5.0, location=(0.0, 0.0, -0.025))
    ground = bpy.context.object
    ground.name = "preview_ground"
    ground.data.materials.append(ground_mat)

    light_data = bpy.data.lights.new("key", type="AREA")
    light_data.energy = 500.0
    light_data.shape = "DISK"
    light_data.size = 4.0
    light = bpy.data.objects.new("key", light_data)
    scene.collection.objects.link(light)
    light.location = (3.2, -4.0, 5.0)
    light.rotation_euler = (Vector((0.0, 0.0, 0.3)) - light.location).to_track_quat("-Z", "Y").to_euler()

    world = bpy.data.worlds.new("stump_world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.18, 0.19, 0.20, 1.0)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.45
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 1280
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    return ground, camera, light


def render_to(path):
    scene = bpy.context.scene
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def build_blockout():
    verts, faces, uv_faces, material_ids = stump_mesh_data()
    mesh = bpy.data.meshes.new("stump_high_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    body = bpy.data.objects.new("stump_b_body", mesh)
    bpy.context.scene.collection.objects.link(body)
    gray = make_material("blockout_gray", (0.46, 0.47, 0.46))
    body.data.materials.append(gray)
    top_start = HEIGHT_STEPS * THETA_STEPS
    top_end = top_start + TOP_RADIAL_STEPS * THETA_STEPS
    for index, poly in enumerate(mesh.polygons):
        poly.material_index = 0
        poly.use_smooth = not (top_start <= index < top_end)
    paint_uv = mesh.uv_layers.new(name="PaintUV")
    for poly_index, poly in enumerate(mesh.polygons):
        for loop_index, uv in zip(poly.loop_indices, uv_faces[poly_index]):
            paint_uv.data[loop_index].uv = uv
    # 切り口・底面との境界も溶接し、曲率を取れる一続きの面にする。
    select_only(body)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.000001)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    print("BLOCKOUT_BOUNDS", {"dimensions": [round(float(v), 4) for v in body.dimensions],
                               "min_z": round(min(v[2] for v in verts), 4),
                               "max_z": round(max(v[2] for v in verts), 4)})
    WORK.mkdir(parents=True, exist_ok=True)
    ART.mkdir(parents=True, exist_ok=True)
    GLB.parent.mkdir(parents=True, exist_ok=True)
    print("BLOCKOUT", {"vertices": len(verts), "faces": len(faces), "roots": len(ROOT_ANGLES)})
    return body


def add_uv_target(obj):
    mesh = obj.data
    bake_uv = mesh.uv_layers.new(name="BakeUV")
    mesh.uv_layers.active_index = mesh.uv_layers.find("BakeUV")
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0),
                             island_margin=BAKE_MARGIN / BAKE_SIZE,
                             area_weight=0.0,
                             correct_aspect=True,
                             scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    bake_uv.active_render = True
    mesh.uv_layers["PaintUV"].active_render = False


def select_only(obj):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def node(tree, node_type, name, location):
    n = tree.nodes.new(node_type)
    n.label = name
    n.location = location
    return n


def math_node(tree, operation, name, location, value=None):
    n = node(tree, "ShaderNodeMath", name, location)
    n.operation = operation
    if value is not None:
        n.inputs[1].default_value = value
    return n


def map_range(tree, name, location, from_min, from_max, to_min, to_max, clamp=True):
    n = node(tree, "ShaderNodeMapRange", name, location)
    n.inputs[1].default_value = from_min
    n.inputs[2].default_value = from_max
    n.inputs[3].default_value = to_min
    n.inputs[4].default_value = to_max
    n.clamp = clamp
    n.interpolation_type = "SMOOTHSTEP"
    return n


def image_node(tree, name, image, location, extension="REPEAT"):
    n = node(tree, "ShaderNodeTexImage", name, location)
    n.image = image
    n.extension = extension
    return n


def load_image(path, name=None):
    if not path.exists():
        raise FileNotFoundError(f"必要な画像がありません: {path}")
    img = bpy.data.images.load(str(path), check_existing=True)
    if name:
        img.name = name
    img.colorspace_settings.name = "sRGB"
    return img


def configure_color_material(mat, source_image, moss_image, baked_image):
    mat.use_nodes = True
    tree = mat.node_tree
    nodes, links = tree.nodes, tree.links
    nodes.clear()

    uv = node(tree, "ShaderNodeUVMap", "形に沿った UV", (-1100, 180))
    uv.uv_map = "PaintUV"
    base_tex = image_node(tree, "生成した木の絵", source_image, (-880, 260))
    links.new(uv.outputs["UV"], base_tex.inputs["Vector"])

    geom = node(tree, "ShaderNodeNewGeometry", "曲率と高さ", (-1100, -220))
    noise = node(tree, "ShaderNodeTexNoise", "大きな色むら", (-880, -80))
    noise.inputs["Scale"].default_value = 3.2
    noise.inputs["Detail"].default_value = 2.0
    links.new(geom.outputs["Position"], noise.inputs["Vector"])
    noise_ramp = node(tree, "ShaderNodeValToRGB", "色むらを控えめに", (-650, -20))
    noise_ramp.color_ramp.elements[0].position = 0.25
    noise_ramp.color_ramp.elements[0].color = (0.75, 0.65, 0.50, 1.0)
    noise_ramp.color_ramp.elements[1].position = 0.78
    noise_ramp.color_ramp.elements[1].color = (1.06, 0.98, 0.82, 1.0)
    links.new(noise.outputs["Fac"], noise_ramp.inputs["Fac"])
    color_mix = node(tree, "ShaderNodeMixRGB", "色むら", (-410, 230))
    color_mix.blend_type = "MULTIPLY"
    color_mix.inputs[0].default_value = BAKE_STRENGTH["color_variation"]
    links.new(base_tex.outputs["Color"], color_mix.inputs[1])
    links.new(noise_ramp.outputs["Color"], color_mix.inputs[2])

    point_ramp = node(tree, "ShaderNodeValToRGB", "出っ張りと溝", (-650, -250))
    point_ramp.color_ramp.elements[0].position = 0.25
    point_ramp.color_ramp.elements[0].color = (0.60, 0.42, 0.27, 1.0)
    point_ramp.color_ramp.elements[1].position = 0.67
    point_ramp.color_ramp.elements[1].color = (1.06, 0.93, 0.72, 1.0)
    links.new(geom.outputs["Pointiness"], point_ramp.inputs["Fac"])
    curve_mix = node(tree, "ShaderNodeMixRGB", "曲率の色", (-150, 220))
    curve_mix.blend_type = "MULTIPLY"
    curve_mix.inputs[0].default_value = BAKE_STRENGTH["pointiness"]
    links.new(color_mix.outputs["Color"], curve_mix.inputs[1])
    links.new(point_ramp.outputs["Color"], curve_mix.inputs[2])

    ao = node(tree, "ShaderNodeAmbientOcclusion", "隙間の AO", (-650, -480))
    ao.inputs["Distance"].default_value = 0.42
    ao_mix = node(tree, "ShaderNodeMixRGB", "AO を色だけに使う", (70, 220))
    ao_mix.blend_type = "MULTIPLY"
    ao_mix.inputs[0].default_value = BAKE_STRENGTH["ao"]
    links.new(curve_mix.outputs["Color"], ao_mix.inputs[1])
    links.new(ao.outputs["AO"], ao_mix.inputs[2])

    moss_tex = image_node(tree, "生成した苔の絵", moss_image, (-880, -700))
    links.new(uv.outputs["UV"], moss_tex.inputs["Vector"])
    separate_z = node(tree, "ShaderNodeSeparateXYZ", "高さ", (-880, -920))
    links.new(geom.outputs["Position"], separate_z.inputs["Vector"])
    height_mask = map_range(tree, "根元の高さ", (-650, -900), -0.04,
                            BAKE_STRENGTH["moss_height"], 1.0, 0.0)
    links.new(separate_z.outputs["Z"], height_mask.inputs["Value"])
    separate_n = node(tree, "ShaderNodeSeparateXYZ", "上向き", (-880, -1120))
    links.new(geom.outputs["Normal"], separate_n.inputs["Vector"])
    up_mask = map_range(tree, "面の向き", (-650, -1110), 0.0, 0.82,
                        BAKE_STRENGTH["moss_up"], 1.0)
    links.new(separate_n.outputs["Z"], up_mask.inputs["Value"])
    moss_noise = node(tree, "ShaderNodeTexNoise", "苔のまだら", (-880, -1350))
    moss_noise.inputs["Scale"].default_value = 8.0
    moss_noise.inputs["Detail"].default_value = 2.0
    links.new(geom.outputs["Position"], moss_noise.inputs["Vector"])
    moss_noise_mask = map_range(tree, "苔の塊", (-650, -1330),
                                BAKE_STRENGTH["moss_noise_low"],
                                BAKE_STRENGTH["moss_noise_high"], 0.0, 1.0)
    links.new(moss_noise.outputs["Fac"], moss_noise_mask.inputs["Value"])
    mask_a = math_node(tree, "MULTIPLY", "高さと上向き", (-400, -920))
    links.new(height_mask.outputs["Result"], mask_a.inputs[0])
    links.new(up_mask.outputs["Result"], mask_a.inputs[1])
    mask_b = math_node(tree, "MULTIPLY", "高さと苔の塊", (-180, -920))
    links.new(mask_a.outputs[0], mask_b.inputs[0])
    links.new(moss_noise_mask.outputs["Result"], mask_b.inputs[1])
    groove_mask = map_range(tree, "溝に沿う苔", (-400, -1180), 0.22, 0.56, 1.0, 0.0)
    links.new(geom.outputs["Pointiness"], groove_mask.inputs["Value"])
    groove_amount = math_node(tree, "MULTIPLY", "縦溝への薄い伸び", (-180, -1160))
    links.new(height_mask.outputs["Result"], groove_amount.inputs[0])
    links.new(groove_mask.outputs["Result"], groove_amount.inputs[1])
    groove_scale = math_node(tree, "MULTIPLY", "溝苔の強さ", (30, -1040), BAKE_STRENGTH["moss_grooves"])
    links.new(groove_amount.outputs[0], groove_scale.inputs[0])
    mask_max = math_node(tree, "MAXIMUM", "苔マスク", (230, -850))
    links.new(mask_b.outputs[0], mask_max.inputs[0])
    links.new(groove_scale.outputs[0], mask_max.inputs[1])
    mask_strength = math_node(tree, "MULTIPLY", "苔の濃さ", (440, -780), BAKE_STRENGTH["moss"])
    links.new(mask_max.outputs[0], mask_strength.inputs[0])
    moss_mix = node(tree, "ShaderNodeMixRGB", "苔を重ねる", (500, 200))
    links.new(mask_strength.outputs[0], moss_mix.inputs[0])
    links.new(ao_mix.outputs["Color"], moss_mix.inputs[1])
    links.new(moss_tex.outputs["Color"], moss_mix.inputs[2])

    emission = node(tree, "ShaderNodeEmission", "光と影を焼かない", (740, 200))
    links.new(moss_mix.outputs["Color"], emission.inputs["Color"])
    output = node(tree, "ShaderNodeOutputMaterial", "焼き用", (960, 200))
    links.new(emission.outputs["Emission"], output.inputs["Surface"])

    target = image_node(tree, "焼き先", baked_image, (740, -80), "EXTEND")
    target.select = True
    nodes.active = target
    return mat


def configure_cut_material(mat, cut_image, baked_image):
    mat.use_nodes = True
    tree = mat.node_tree
    nodes, links = tree.nodes, tree.links
    nodes.clear()
    uv = node(tree, "ShaderNodeUVMap", "平面 UV", (-600, 120))
    uv.uv_map = "PaintUV"
    tex = image_node(tree, "生成した切り口の絵", cut_image, (-400, 180))
    links.new(uv.outputs["UV"], tex.inputs["Vector"])
    geom = node(tree, "ShaderNodeNewGeometry", "AO", (-400, -100))
    ao = node(tree, "ShaderNodeAmbientOcclusion", "切り口の隙間", (-200, -100))
    ao.inputs["Distance"].default_value = 0.25
    mix = node(tree, "ShaderNodeMixRGB", "色の AO", (20, 160))
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = BAKE_STRENGTH["ao"] * 0.45
    links.new(tex.outputs["Color"], mix.inputs[1])
    links.new(ao.outputs["AO"], mix.inputs[2])
    emission = node(tree, "ShaderNodeEmission", "色のみ", (250, 160))
    links.new(mix.outputs["Color"], emission.inputs["Color"])
    output = node(tree, "ShaderNodeOutputMaterial", "焼き用", (460, 160))
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    target = image_node(tree, "焼き先", baked_image, (250, -150), "EXTEND")
    target.select = True
    nodes.active = target


def bake_texture(obj):
    bark = load_image(ART / "bark.png", "stump_bark")
    cut = load_image(ART / "cut.png", "stump_cut")
    moss = load_image(ART / "moss.png", "stump_moss")
    baked = bpy.data.images.new("stump_baked", width=BAKE_SIZE, height=BAKE_SIZE,
                                alpha=False, float_buffer=False)
    baked.filepath_raw = str(BAKED)
    baked.file_format = "PNG"
    baked.colorspace_settings.name = "sRGB"

    side_mat = bpy.data.materials.new("stump_side_bake")
    configure_color_material(side_mat, bark, moss, baked)
    cut_mat = bpy.data.materials.new("stump_cut_bake")
    configure_cut_material(cut_mat, cut, baked)
    obj.data.materials.clear()
    obj.data.materials.append(side_mat)
    obj.data.materials.append(cut_mat)
    for poly in obj.data.polygons:
        poly.material_index = 1 if poly.center.z > HEIGHT * 0.91 and poly.normal.z > 0.75 else 0

    add_uv_target(obj)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.render.bake.margin = BAKE_MARGIN
    scene.render.bake.use_clear = True
    scene.render.bake.target = "IMAGE_TEXTURES"
    scene.render.bake.use_selected_to_active = False
    for mat in (side_mat, cut_mat):
        for n in mat.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image == baked:
                for item in mat.node_tree.nodes:
                    item.select = False
                n.select = True
                mat.node_tree.nodes.active = n
    select_only(obj)
    bpy.ops.object.bake(type="EMIT", pass_filter={"COLOR"})
    baked.save()
    print("BAKED", {"path": str(BAKED), "size": [BAKE_SIZE, BAKE_SIZE], "margin": BAKE_MARGIN})
    return baked


def final_material(name, image, alpha=False, uv_map=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    tex = node(tree, "ShaderNodeTexImage", "焼いた色", (-360, 40))
    tex.image = image
    tex.extension = "CLIP" if alpha else "EXTEND"
    tex.interpolation = "Linear"
    if uv_map:
        uv = node(tree, "ShaderNodeUVMap", "焼いた UV を使う", (-580, 40))
        uv.uv_map = uv_map
        tree.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    bsdf = node(tree, "ShaderNodeBsdfPrincipled", "つやを抑える", (-80, 40))
    bsdf.inputs["Roughness"].default_value = 0.88
    tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha:
        tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "DITHERED"
        mat.use_backface_culling = False
    output = node(tree, "ShaderNodeOutputMaterial", "出力", (200, 40))
    tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def apply_baked_material(obj, baked):
    mat = final_material("stump_baked", baked, uv_map="BakeUV")
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.material_index = 0


def decimate_to_target(obj):
    select_only(obj)
    dec = obj.modifiers.new("Decimate_after_bake", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.use_collapse_triangulate = True
    original = sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)
    dec.ratio = min(0.95, TARGET_TRIANGLES / max(1, original))
    for _ in range(8):
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        triangles = sum(max(0, len(poly.vertices) - 2) for poly in mesh.polygons)
        evaluated.to_mesh_clear()
        if 3000 <= triangles <= 5000:
            break
        factor = TARGET_TRIANGLES / max(1, triangles)
        dec.ratio = max(0.001, min(0.95, dec.ratio * factor))
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=dec.name)
    triangles = sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)
    if not 3000 <= triangles <= 5000:
        raise RuntimeError(f"Decimate 後の三角形数が範囲外です: {triangles}")
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return triangles


def add_white_vertex_color(obj):
    colors = obj.data.color_attributes
    col = colors.get("Col") or colors.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    for item in col.data:
        item.color = (1.0, 1.0, 1.0, 1.0)
    colors.active_color = col


def texture_region_uv(u0, v0, u1, v1, x, y):
    return (u0 + (u1 - u0) * x, v0 + (v1 - v0) * y)


def mesh_object(name, verts, faces, uv_faces, material):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(material)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    for poly_index, poly in enumerate(mesh.polygons):
        for loop_index, value in zip(poly.loop_indices, uv_faces[poly_index]):
            uv.data[loop_index].uv = value
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mushroom_cap(name, center, radius, height, material):
    verts, faces, uv_faces = [], [], []
    segments, rings = 18, 6
    # 半球の頂点から縁へ。上面画像を円筒側へ平面投影する。
    verts.append((center[0], center[1], center[2] + height))
    for ring in range(1, rings + 1):
        theta = (math.pi * 0.5) * ring / rings
        rr = radius * math.sin(theta)
        z = height * math.cos(theta)
        for i in range(segments):
            a = 2.0 * math.pi * i / segments
            verts.append((center[0] + rr * math.cos(a), center[1] + rr * math.sin(a), center[2] + z))
    # details.png の左上 1/4 が赤い傘。
    def cap_uv(x, y):
        return texture_region_uv(0.015, 0.515, 0.485, 0.985, 0.5 + 0.5 * x, 0.5 + 0.5 * y)
    for i in range(segments):
        i1 = (i + 1) % segments
        faces.append((0, 1 + i, 1 + i1))
        uv_faces.append((cap_uv(0.0, 0.0), cap_uv(math.cos(2 * math.pi * i / segments), math.sin(2 * math.pi * i / segments)),
                         cap_uv(math.cos(2 * math.pi * i1 / segments), math.sin(2 * math.pi * i1 / segments))))
    for ring in range(1, rings):
        a = 1 + (ring - 1) * segments
        b = 1 + ring * segments
        for i in range(segments):
            i1 = (i + 1) % segments
            faces.append((a + i, b + i, b + i1, a + i1))
            uv_faces.append((cap_uv(math.cos(2 * math.pi * i / segments) * ring / rings, math.sin(2 * math.pi * i / segments) * ring / rings),
                             cap_uv(math.cos(2 * math.pi * i / segments) * (ring + 1) / rings, math.sin(2 * math.pi * i / segments) * (ring + 1) / rings),
                             cap_uv(math.cos(2 * math.pi * i1 / segments) * (ring + 1) / rings, math.sin(2 * math.pi * i1 / segments) * (ring + 1) / rings),
                             cap_uv(math.cos(2 * math.pi * i1 / segments) * ring / rings, math.sin(2 * math.pi * i1 / segments) * ring / rings)))
    obj = mesh_object(name, verts, faces, uv_faces, material)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def mushroom_stem(name, x, y, ground_z, height, material):
    verts, faces, uv_faces = [], [], []
    segments = 12
    for ring, (z, radius) in enumerate(((ground_z, 0.025), (ground_z + height, 0.014))):
        for i in range(segments):
            a = 2.0 * math.pi * i / segments
            verts.append((x + radius * math.cos(a), y + radius * math.sin(a), z))
    for i in range(segments):
        i1 = (i + 1) % segments
        faces.append((i, i1, segments + i1, segments + i))
        u0, u1 = i / segments, (i + 1) / segments
        uv_faces.append(((u0, 0.0), (u1, 0.0), (u1, 1.0), (u0, 1.0)))
    faces.append(tuple(range(segments - 1, -1, -1)))
    uv_faces.append(tuple((i / segments, 0.0) for i in range(segments - 1, -1, -1)))
    faces.append(tuple(segments + i for i in range(segments)))
    uv_faces.append(tuple((i / segments, 1.0) for i in range(segments)))
    return mesh_object(name, verts, faces, uv_faces, material)


def leaf_plane(name, center, size, material, region, rotation):
    x, y, z = center
    sx, sy = size[0] * 0.5, size[1] * 0.5
    cs, sn = math.cos(rotation), math.sin(rotation)
    verts, uvs = [], []
    for px, py, uv in ((-sx, -sy, (0.0, 0.0)), (sx, -sy, (1.0, 0.0)),
                       (sx, sy, (1.0, 1.0)), (-sx, sy, (0.0, 1.0))):
        verts.append((x + px * cs - py * sn, y + px * sn + py * cs, z))
        uvs.append(texture_region_uv(*region, *uv))
    faces = [(0, 1, 2, 3)]
    uv_faces = [tuple(uvs)]
    return mesh_object(name, verts, faces, uv_faces, material)


def add_details(details_image):
    cap_mat = final_material("mushroom_cap_red", details_image, alpha=True)
    leaf_mat = final_material("leaf_stump_autumn", details_image, alpha=True)
    stem_mat = make_material("mushroom_stem_white", (0.92, 0.87, 0.72))
    placements = ((0.65, -0.40, 0.084, 0.066), (-0.58, -0.47, 0.074, 0.061), (0.11, 0.74, 0.081, 0.064))
    for i, (x, y, stem_h, cap_r) in enumerate(placements, 1):
        mushroom_stem(f"mushroom_stem_{i:02d}", x, y, -0.005, stem_h, stem_mat)
        mushroom_cap(f"mushroom_cap_{i:02d}", (x, y, stem_h - 0.005), cap_r, 0.042, cap_mat)
    # V は Blender の左下原点。画像シートの右上、左下、右下を使う。
    leaf_regions = ((0.515, 0.515, 0.985, 0.985), (0.015, 0.015, 0.485, 0.485),
                    (0.515, 0.015, 0.985, 0.485))
    leaf_places = ((-0.76, -0.20, 0.004, (0.22, 0.17), 0.25),
                   (0.56, -0.62, 0.004, (0.20, 0.16), -0.45),
                   (-0.10, 0.81, 0.004, (0.19, 0.16), 0.82))
    for i, (placement, region) in enumerate(zip(leaf_places, leaf_regions), 1):
        leaf_plane(f"leaf_stump_{i:02d}", placement[:3], placement[3], leaf_mat, region, placement[4])


def main():
    opts = args_from_blender()
    global WORK, BLOCKOUT_SHOT, FINAL_SHOT
    if opts.work_dir:
        WORK = Path(opts.work_dir).resolve()
    BLOCKOUT_SHOT = WORK / "1_blockout.png"
    FINAL_SHOT = WORK / "2_baked_blender.png"
    if bpy.app.version != (4, 2, 23):
        raise RuntimeError(f"Blender 4.2.23 が必要です。現在: {bpy.app.version_string}")
    WORK.mkdir(parents=True, exist_ok=True)
    ART.mkdir(parents=True, exist_ok=True)
    GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body = build_blockout()
    ground, camera, light = create_camera_and_stage(body)
    if not opts.skip_blockout_render:
        render_to(BLOCKOUT_SHOT)
    print("BLOCKOUT_SHOT", str(BLOCKOUT_SHOT))
    if opts.blockout_only:
        return

    details_image = load_image(ART / "details.png", "stump_details")
    baked = bake_texture(body)
    apply_baked_material(body, baked)
    triangles = decimate_to_target(body)
    add_white_vertex_color(body)
    add_details(details_image)
    render_to(FINAL_SHOT)
    print("FINAL_SHOT", str(FINAL_SHOT))

    # レンダリング後に、撮影用の地面とライトを外して GLB へ書く。
    bpy.data.objects.remove(ground, do_unlink=True)
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.objects.remove(light, do_unlink=True)
    select = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in select:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.export_scene.gltf(filepath=str(GLB), export_format="GLB", use_selection=True,
                              export_yup=True, export_normals=True,
                              export_vertex_color="ACTIVE", export_materials="EXPORT")
    total_triangles = sum(max(0, len(poly.vertices) - 2)
                          for obj in select if obj.type == "MESH" for poly in obj.data.polygons)
    print("RESULT", {"blender": bpy.app.version_string, "body_triangles": triangles,
                     "glb_total_triangles": total_triangles,
                     "baked": str(BAKED), "glb": str(GLB)})


if __name__ == "__main__":
    main()
