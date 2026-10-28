"""既存の後付け版と専用樹形を、Blender内の同じ条件で撮る。"""
import json
import math
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

BASE = Path(__file__).resolve().parent
OUT = BASE / "shots/v2"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE / "assets/trees.blend"))
designed = bpy.data.objects["maple2_s"]
for ob in list(bpy.context.scene.objects):
    ob.hide_render = True
old_base = BASE.parent / "partial-billboard/assets"
with bpy.data.libraries.load(str(old_base / "leaves.blend"), link=False) as (_, data):
    data.objects = ["maple2_s"]
current = data.objects[0]
current.name = "current"
current.location = (0, 0, 0)
bpy.context.scene.collection.objects.link(current)
new_cards = json.loads((BASE / "assets/cards.json").read_text(encoding="utf-8"))["models"]["maple2_s"]["cards"]
old_cards = json.loads((old_base / "cards.json").read_text(encoding="utf-8"))["models"]["maple2_s"]["cards"]
records = {}
for ob, cards in ((current, old_cards), (designed, new_cards)):
    mesh = ob.data
    records[ob.name] = (cards, [v.co.copy() for v in mesh.vertices], [n.vector.copy() for n in mesh.corner_normals], [int(a.value) for a in mesh.attributes["_CARD_ID"].data])

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
bpy.ops.object.light_add(type="SUN", location=(4, -6, 9))
sun = bpy.context.object
sun.data.energy = 2.5
sun.data.angle = math.radians(8)
sun.rotation_euler = (math.radians(35), math.radians(-20), math.radians(-35))
bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.lens = 52
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.eevee.taa_render_samples = 32
scene.render.resolution_x, scene.render.resolution_y = 1000, 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"


def zup(p):
    return Vector((p[0], -p[2], p[1]))


max_radius_error, fixed_error = 0, 0
for pitch, yaw in ((45, 0), (20, 0), (45, 90), (20, 90)):
    target = Vector((0, 0, 2.2))
    p, y = math.radians(pitch), math.radians(yaw)
    camera.location = target + Vector((12 * math.sin(y) * math.cos(p), -12 * math.cos(y) * math.cos(p), 12 * math.sin(p)))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    for label, ob, amount in (("current", current, .5), ("designed-fixed", designed, 0), ("designed", designed, .65), ("designed-max", designed, 1)):
        current.hide_render, designed.hide_render = ob != current, ob != designed
        cards, rest, normals, ids = records[ob.name]
        rotations = []
        for card in cards:
            center, normal = zup(card["center"]), zup(card["normal"])
            toward = (camera.location - center).normalized()
            axis = normal.cross(toward)
            if axis.length < .00001:
                axis = zup(card["right"])
            angle = min(math.acos(max(-1, min(1, normal.dot(toward)))) * amount * card.get("weight", 1), card.get("maxAngle", math.pi))
            rotations.append(Matrix.Rotation(angle, 3, axis.normalized()))
        for i, vertex in enumerate(ob.data.vertices):
            if ids[i] < 0:
                vertex.co = rest[i]
                continue
            card = cards[ids[i]]
            pivot = zup(card.get("pivot", card["center"]))
            vertex.co = pivot + rotations[ids[i]] @ (rest[i] - pivot)
            max_radius_error = max(max_radius_error, abs((vertex.co - pivot).length - (rest[i] - pivot).length))
            if card.get("weight", 1) == 0:
                fixed_error = max(fixed_error, (vertex.co - rest[i]).length)
        ob.data.update()
        ob.data.normals_split_custom_set(normals)
        scene.render.filepath = str(OUT / f"{label}-{pitch}-{yaw}.png")
        bpy.ops.render.render(write_still=True)
        print(f"PREVIEW {label} pitch={pitch} yaw={yaw}", flush=True)
print(f"PIVOT_RADIUS_ERROR {max_radius_error:.8f} m; FIXED_VERTEX_ERROR {fixed_error:.8f} m", flush=True)
