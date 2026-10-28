"""現行モデルと3案を同じ光・カメラで撮る。"""
import math
from pathlib import Path

import bpy
from mathutils import Vector

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
ASSETS = ROOT / "codex/palm-billboard/assets"
OUT = BASE / "shots"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ASSETS / "palms-round.blend"))

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(ASSETS / "palm2_a_before_round.glb"))
baseline = [ob for ob in set(bpy.data.objects) - before if ob.type == "MESH"]
if not baseline:
    raise RuntimeError("現行モデルを読み込めません")
image = bpy.data.images.load(str(ROOT / "codex/palm-textures/assets/frond-round-v1.png"), check_existing=True)
for ob in baseline:
    ob.location = (0, 0, 0)
    for material in ob.data.materials:
        if not material or "leaf" not in material.name.lower():
            continue
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE":
                node.image = image
                break

models = {"current": baseline}
for name in ("palm_round_v1", "palm_round_v2", "palm2_a"):
    models[name] = [bpy.data.objects[name]]
for ob in bpy.context.scene.objects:
    ob.hide_render = True

world = bpy.data.worlds.new("比較用の空")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (.42, .50, .34, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = .7
bpy.context.scene.world = world
bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
floor.name = "比較用の地面"
floor.data.materials.append(bpy.data.materials.new("地面"))
floor.data.materials[0].diffuse_color = (.32, .38, .13, 1)
floor.rotation_euler.x = math.radians(0)
floor.hide_render = False
bpy.ops.object.light_add(type="SUN", location=(-4, -5, 8))
sun = bpy.context.object
sun.data.energy = 2.5
sun.data.angle = math.radians(8)
sun.rotation_euler = (-sun.location).to_track_quat("-Z", "Y").to_euler()
sun.hide_render = False
bpy.ops.object.camera_add()
camera = bpy.context.object
camera.hide_render = False
camera.data.lens = 36 / (2 * math.tan(math.radians(27) / 2) * (1000 / 870))
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.eevee.taa_render_samples = 40
scene.render.resolution_x, scene.render.resolution_y = 1000, 870
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"
target = Vector((.15, 0, 1.9))
pitch, yaw = math.radians(40), math.radians(0)
camera.location = target + Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch))) * 11.8
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()

for label, objects in models.items():
    for ob in objects:
        ob.location = (0, 0, 0)
        ob.hide_render = False
    scene.render.filepath = str(OUT / f"{label}.png")
    bpy.ops.render.render(write_still=True)
    for ob in objects:
        ob.hide_render = True
    print(f"SAVED {label}: {scene.render.filepath}", flush=True)

print(f"MODELS={','.join(models)}; RESOLUTION={scene.render.resolution_x}x{scene.render.resolution_y}", flush=True)
