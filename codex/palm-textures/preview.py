"""同じヤシ・光・カメラで、画像だけを替えて比較する。"""
import math
import json
import runpy
import sys
from pathlib import Path
import bpy
from mathutils import Vector

BASE = Path(__file__).resolve().parent
FLOW = "--flow" in sys.argv
OUT = BASE / ("shots/v4-flow" if FLOW else "shots/v3-soft")
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE.parent / "palm-billboard/assets/palms.blend"))
for ob in bpy.context.scene.objects:
    ob.hide_render = True
tree = bpy.data.objects["palm2_a"]
tree.hide_render = False
tree.location = (0, 0, 0)
profiles = json.loads((BASE / "profiles.json").read_text(encoding="utf-8"))
install = runpy.run_path(str(BASE / "materials.py"))["install_painted_materials"]
install(tree, BASE / "assets", profiles["soft" if FLOW else "reference"])(True)
painted = install(tree, BASE / "assets", profiles["flow" if FLOW else "soft"])
world = bpy.data.worlds.new("比較用の空")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (.42, .51, .64, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = .7
bpy.context.scene.world = world
bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
mat = bpy.data.materials.new("比較用の地面")
mat.diffuse_color = (.32, .38, .13, 1)
floor.data.materials.append(mat)
bpy.ops.object.light_add(type="SUN", location=(-4, -5, 8))
sun = bpy.context.object
sun.data.energy = 2.5
sun.data.angle = math.radians(8)
sun.rotation_euler = (-sun.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.lens = 36 / (2 * math.tan(math.radians(27)/2) * (16/9))
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.eevee.taa_render_samples = 32
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"
for pitch, yaw in ((40, 0), (18, 0), (40, 90)):
    p, y = math.radians(pitch), math.radians(yaw)
    target = Vector((.3, 0, 2))
    camera.location = target + Vector((math.sin(y)*math.cos(p), -math.cos(y)*math.cos(p), math.sin(p))) * 12.8
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
    for label, enabled in (("current", False), ("painted", True)):
        painted(enabled)
        scene.render.filepath = str(OUT / f"{label}-{pitch}-{yaw}.png")
        bpy.ops.render.render(write_still=True)
        print(f"TEXTURE_PREVIEW {label} pitch={pitch} yaw={yaw}", flush=True)
