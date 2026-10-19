"""書き出した GLB を読み戻して並べ、EEVEE で描く（書き出しの往復の検査）。
  blender -b --factory-startup --python tools/worldart/blender/preview.py -- art/assets out.png"""
import bpy, sys, os, math
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
names = sorted(f for f in os.listdir(src) if f.endswith('.glb'))
x = 0.0
for f in names:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, f))
    new = [o for o in bpy.data.objects if o not in before]
    w = max(max(o.dimensions.x, o.dimensions.y) for o in new)
    for o in new: o.location.x += x + w / 2
    x += w + 0.8
bpy.ops.mesh.primitive_plane_add(size=200, location=(x / 2, 0, 0))
g = bpy.context.object; m = bpy.data.materials.new('g'); m.use_nodes = True
m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.25, 0.32, 0.12, 1); g.data.materials.append(m)
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(55), 0, math.radians(-40)))
bpy.context.object.data.energy = 4.0; bpy.context.object.data.angle = math.radians(3)
w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.65, 0.8, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
bpy.ops.object.camera_add(location=(x / 2, -x * 0.95, x * 0.55), rotation=(math.radians(62), 0, 0))
cam = bpy.context.object; cam.data.lens = 50; bpy.context.scene.camera = cam
s = bpy.context.scene; s.render.engine = 'BLENDER_EEVEE_NEXT'; s.render.resolution_x = 1600; s.render.resolution_y = 600
s.view_settings.view_transform = 'Standard'
s.render.filepath = out; bpy.ops.render.render(write_still=True)
print('PREVIEW', out, len(names))
