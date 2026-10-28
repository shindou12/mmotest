"""同じカード回転をBlender内で描く。Three.jsの画面検証とは分ける。"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

BASE = Path(__file__).resolve().parent
OUT = BASE / "shots/v2"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE / "assets/leaves.blend"))
tree = bpy.data.objects["maple2_s"]
for ob in list(bpy.context.scene.objects):
    if ob != tree:
        ob.hide_render = True
mesh = tree.data
rest = [v.co.copy() for v in mesh.vertices]
normals = [n.vector.copy() for n in mesh.corner_normals]
metadata = json.loads((BASE / "assets/cards.json").read_text(encoding="utf-8"))["models"][tree.name]["cards"]
ids = [int(v.value) for v in mesh.attributes["_CARD_ID"].data]


def zup(p):
    return Vector((p[0], -p[2], p[1]))


world = bpy.data.worlds.new("確認用の空")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.51, 0.64, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
bpy.context.scene.world = world
bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
floor.name = "確認用の地面"
mat = bpy.data.materials.new("確認用の緑")
mat.diffuse_color = (0.32, 0.38, 0.13, 1)
floor.data.materials.append(mat)
bpy.ops.object.light_add(type="SUN", location=(4, -6, 9))
sun = bpy.context.object
sun.data.energy = 2.5
sun.data.angle = math.radians(8)
sun.rotation_euler = (math.radians(35), math.radians(-20), math.radians(-35))
bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.lens = 52
bpy.context.scene.camera = camera
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.eevee.taa_render_samples = 32
scene.render.resolution_x = 900
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"
scene.render.film_transparent = False
max_radius_error = 0
for pitch in (45, 20):
    target = Vector((0, 0, 2.2))
    a = math.radians(pitch)
    camera.location = target + Vector((0, -11 * math.cos(a), 11 * math.sin(a)))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    for amount in (0, 0.5, 1):
        rotations = []
        for card in metadata:
            center, normal = zup(card["center"]), zup(card["normal"])
            toward = (camera.location - center).normalized()
            axis = normal.cross(toward)
            if axis.length < 0.00001:
                axis = zup(card["right"])
            axis.normalize()
            angle = math.acos(max(-1, min(1, normal.dot(toward)))) * amount
            rotations.append(Matrix.Rotation(angle, 3, axis))
        for i, vertex in enumerate(mesh.vertices):
            card_id = ids[i]
            if card_id < 0:
                vertex.co = rest[i]
                continue
            center = zup(metadata[card_id]["center"])
            vertex.co = center + rotations[card_id] @ (rest[i] - center)
            max_radius_error = max(max_radius_error, abs((vertex.co - center).length - (rest[i] - center).length))
        mesh.update()
        mesh.normals_split_custom_set(normals)
        scene.render.filepath = str(OUT / f"blender-{pitch}-follow-{int(amount * 100)}.png")
        bpy.ops.render.render(write_still=True)
        print(f"PREVIEW pitch={pitch} follow={amount} {scene.render.filepath}", flush=True)
print(f"CARD_RADIUS_MAX_ERROR {max_radius_error:.8f} m", flush=True)
