"""W1の区間回転をBlenderで撮影する。Three.jsの撮影ではない。"""
import json
import math
import runpy
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

BASE = Path(__file__).resolve().parent
PALM = BASE.parent / "palm-billboard"
FLOW = "--flow" in sys.argv
SOFT = "--soft" in sys.argv or FLOW
REFERENCE = "--reference" in sys.argv or SOFT
PAINTED = "--paint" in sys.argv or REFERENCE
OUT = BASE / "shots" / ("v5-flow" if FLOW else "v4-soft" if SOFT else "v3-reference" if REFERENCE else "v2-painted" if PAINTED else "v1")
OUT.mkdir(parents=True, exist_ok=True)
C = json.loads((BASE / "config.json").read_text(encoding="utf-8"))
bpy.ops.wm.open_mainfile(filepath=str(PALM / "assets/palms.blend"))
for ob in bpy.context.scene.objects:
    ob.hide_render = True
tree = bpy.data.objects["palm2_a"]
tree.hide_render = False
tree.location = (0, 0, 0)
if PAINTED:
    textures = BASE.parent / "palm-textures"
    profiles = json.loads((textures / "profiles.json").read_text(encoding="utf-8"))
    runpy.run_path(str(textures / "materials.py"))["install_painted_materials"](tree, textures / "assets", profiles["flow" if FLOW else "soft" if SOFT else "reference" if REFERENCE else "1"])(True)
cards = json.loads((PALM / "assets/cards.json").read_text(encoding="utf-8"))["models"]["palm2_a"]["cards"]
rest_z = [v.co.copy() for v in tree.data.vertices]
rest = [Vector((p.x, p.z, -p.y)) for p in rest_z]
normals = [n.vector.copy() for n in tree.data.corner_normals]
ids = [int(a.value) for a in tree.data.attributes["_CARD_ID"].data]
groups = {}
for card in cards:
    groups.setdefault(card["frond"], []).append(card)
records = {}
for group in groups.values():
    root, tip, mid = [Vector(group[i]["pivot"]) for i in (0, 8, 4)]
    length = math.hypot(tip.x-root.x, tip.z-root.z)
    end_height, mid_height = (tip.y-root.y)/length, (mid.y-root.y)/length
    droop = 4*mid_height-2*end_height
    rise = end_height+droop
    out = Vector((group[0]["facingAxis"][0], 0, group[0]["facingAxis"][2])).normalized()
    for i, card in enumerate(group):
        records[id(card)] = (root, length, rise, droop, out, i)
axis = Vector((0, 1, 0)).cross(Vector(C["direction"])).normalized()

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
camera.data.lens = 36 / (2 * math.tan(math.radians(27) / 2) * (16/9))
target = Vector((.3, 0, 2))
camera.location = target + Vector((0, -math.cos(math.radians(40)), math.sin(math.radians(40)))) * 12.8
camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.eevee.taa_render_samples = 32
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"

root_error, segment_error, max_tip = 0, 0, {"weak": 0, "medium": 0}


def pose(strength, seconds):
    """wind.jsのwindPositionと同じ8区間・2波。定数はconfig.jsonから読む。"""
    global root_error, segment_error
    posed = []
    rotations = []
    for card in cards:
        origin, length, rise, droop, out, row = records[id(card)]
        phase = out.x*C["phaseDirection"][0] + out.z*C["phaseDirection"][1]
        time = seconds * math.tau / C["period"]
        wave = math.sin(time+phase)*C["primaryWeight"] + math.sin(time*C["secondaryFrequency"]+phase*C["secondaryPhase"])*C["secondaryWeight"]
        bend = wave*C["bendRadians"]*strength*(C["newLeafStiffness"] if rise > 1 else 1)
        center = origin.copy()
        for i in range(row):
            t0, t1 = i/8, (i+1)/8
            segment = out*length*.125 + Vector((0, length*(rise*.125-droop*(t1*t1-t0*t0)), 0))
            center += Matrix.Rotation(bend*(t0+t1)*.5, 3, axis) @ segment
        posed.append(center)
        rotations.append(Matrix.Rotation(bend*row/8, 3, axis))
        if row == 0:
            root_error = max(root_error, (center-origin).length)
        else:
            previous = posed[-2]
            original_length = (Vector(card["pivot"])-Vector(cards[len(posed)-2]["pivot"])).length
            segment_error = max(segment_error, abs((center-previous).length-original_length))
        if row == 8 and strength > 0:
            label = "weak" if strength < 1 else "medium"
            max_tip[label] = max(max_tip[label], (center-Vector(card["pivot"])).length)
    for i, vertex in enumerate(tree.data.vertices):
        card_id = ids[i]
        if card_id < 0 or strength == 0 or records[id(cards[card_id])][-1] == 0:
            vertex.co = rest_z[i]
        else:
            p = posed[card_id] + rotations[card_id] @ (rest[i]-Vector(cards[card_id]["pivot"]))
            vertex.co = (p.x, -p.z, p.y)
    tree.data.update()
    tree.data.normals_split_custom_set(normals)


scene.render.resolution_x, scene.render.resolution_y = 1280, 720
for seconds in (0, 2, 4):
    for label, strength in (("none", 0), ("weak", .55), ("medium", 1)):
        pose(strength, seconds)
        scene.render.filepath = str(OUT / f"{label}-{seconds}.png")
        bpy.ops.render.render(write_still=True)
        print(f"STILL {label} time={seconds}", flush=True)

scene.render.resolution_x, scene.render.resolution_y = 768, 432
scene.eevee.taa_render_samples = 16
for label, strength in (("weak", .55), ("medium", 1)):
    frames = OUT / label
    frames.mkdir(exist_ok=True)
    for frame in range(96):
        pose(strength, frame/12)
        scene.render.filepath = str(frames / f"{frame:03}.png")
        bpy.ops.render.render(write_still=True)
    print(f"ANIMATION {label}: 96 frames, 8 seconds, 12 fps", flush=True)
report = {"rootError": root_error, "segmentLengthError": segment_error, "maxTipDisplacement": max_tip,
          "cameraFollow": 0, "period": C["period"], "nativeOnly": True}
(OUT / "geometry.json").write_text(json.dumps(report, indent=2), encoding="utf-8", newline="\n")
print(json.dumps(report), flush=True)
