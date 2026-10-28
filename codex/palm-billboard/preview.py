"""ブラウザと同じ断面変形で撮影する。Three.js実画面の確認とは別。"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

BASE = Path(__file__).resolve().parent
OUT = BASE / "shots/v3"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE / "assets/palms.blend"))
for ob in bpy.context.scene.objects:
    ob.hide_render = True
current, designed = bpy.data.objects["current"], bpy.data.objects["palm2_a"]
current.location = designed.location = (0, 0, 0)
cards = json.loads((BASE / "assets/cards.json").read_text(encoding="utf-8"))["models"]["palm2_a"]["cards"]
rest = [v.co.copy() for v in designed.data.vertices]
normals = [n.vector.copy() for n in designed.data.corner_normals]
ids = [int(a.value) for a in designed.data.attributes["_CARD_ID"].data]
world = bpy.data.worlds.new("確認用の空")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (.42, .51, .64, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = .7
bpy.context.scene.world = world
bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
mat = bpy.data.materials.new("確認用の地面")
mat.diffuse_color = (.32, .38, .13, 1)
floor.data.materials.append(mat)
bpy.ops.object.light_add(type="SUN", location=(-4, -5, 8))
sun = bpy.context.object
sun.data.energy = 2.5
sun.data.angle = math.radians(8)
sun.rotation_euler = (-sun.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.lens = 36 / (2 * math.tan(math.radians(27) / 2) * (1000 / 870))
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.eevee.taa_render_samples = 32
scene.render.resolution_x, scene.render.resolution_y = 1000, 870
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"


def zup(p):
    return Vector((p[0], -p[2], p[1]))


def row_rotation(card, amount):
    direction = (camera.location - zup(card["center"])).normalized()
    sine = max(-.99999, min(.99999, zup(card["normal"]).cross(direction).dot(zup(card["facingAxis"]))))
    angle = max(-card["maxAngle"], min(card["maxAngle"], math.asin(sine))) * amount * card["weight"]
    return Matrix.Rotation(angle, 3, zup(card["axis"]))


center_error, fixed_error = 0, 0
for pitch, yaw in ((40, 0), (18, 0), (40, 90)):
    target = Vector((.3, 0, 2.0))
    p, y = math.radians(pitch), math.radians(yaw)
    camera.location = target + Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p))) * 12.8
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    for label, ob, amount in (("current", current, 0), ("fixed", designed, 0), ("follow", designed, .7), ("max", designed, 1)):
        current.hide_render, designed.hide_render = ob != current, ob != designed
        if ob == designed:
            rotations = [row_rotation(card, amount) for card in cards]
            for i, vertex in enumerate(designed.data.vertices):
                if ids[i] < 0:
                    vertex.co = rest[i]
                    continue
                card = cards[ids[i]]
                pivot = zup(card["pivot"])
                vertex.co = rest[i] if amount == 0 or card["weight"] == 0 else pivot + rotations[ids[i]] @ (rest[i] - pivot)
                if (rest[i] - pivot).length < .00001:
                    center_error = max(center_error, (vertex.co - rest[i]).length)
                if card["weight"] == 0:
                    fixed_error = max(fixed_error, (vertex.co - rest[i]).length)
            designed.data.update()
            designed.data.normals_split_custom_set(normals)
        scene.render.filepath = str(OUT / f"{label}-{pitch}-{yaw}.png")
        bpy.ops.render.render(write_still=True)
        print(f"PREVIEW {label} pitch={pitch} yaw={yaw}", flush=True)
print(f"CENTERLINE_ERROR={center_error:.8f} m; ROOT_TIP_ERROR={fixed_error:.8f} m", flush=True)
