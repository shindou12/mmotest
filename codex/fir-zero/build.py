"""独立したもみの試作。幹と枝の骨格、湾曲した葉房カードをBlenderで組む。"""
import math
import random
from pathlib import Path
import bpy
from mathutils import Vector

BASE = Path(__file__).resolve().parent
OUT = BASE / 'assets'
rng = random.Random(2710)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
up = Vector((0, 0, 1))
bark_v, bark_f, bark_c, bark_uv = [], [], [], []
leaf_v, leaf_f, leaf_uv, leaf_c = [], [], [], []

def axis(z):
    t = z / 6.0
    return Vector((.13 * t * t, .08 * math.sin(t * math.pi), z))

def tube(points, radii, sides=8):
    start = len(bark_v)
    for i, (p, radius) in enumerate(zip(points, radii)):
        tangent = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        u = tangent.cross(Vector((0, 1, 0))).normalized()
        v = tangent.cross(u).normalized()
        for k in range(sides):
            a = 2 * math.pi * k / sides
            bark_v.append(tuple(p + radius * (u * math.cos(a) + v * math.sin(a))))
            grain = .78 + .12 * math.sin(k * 2.7 + .9) + .05 * math.sin(i * 1.9 + k * 1.1)
            bark_c.append((grain, grain * .98, grain * .94, 1))
    distance=[0.0]
    for i in range(1,len(points)):
        distance.append(distance[-1]+(points[i]-points[i-1]).length)
    for i in range(len(points) - 1):
        for k in range(sides):
            a = start + i * sides + k
            b = start + i * sides + (k + 1) % sides
            bark_f.append((a, b, b + sides, a + sides))
            bark_uv.append(((k/sides,distance[i]),((k+1)/sides,distance[i]),((k+1)/sides,distance[i+1]),(k/sides,distance[i+1])))

def card(root, angle, length, width, drop, shade, tilt=0):
    out = Vector((math.cos(angle), math.sin(angle), 0))
    side = Vector((-out.y, out.x, tilt)).normalized()
    rows, steps = [], 7
    for i in range(steps + 1):
        t = i / steps
        center = root + out * length * t + up * length * (.11 * t - drop * t * t)
        row = []
        for u in (0, .5, 1):
            # 房に浅い折りと下向きの曲がりを入れる。
            pos = center + side * width * (u - .5) + up * (.12 * length * math.sin(math.pi * t) * (1 - abs(2*u-1)))
            row.append(len(leaf_v)); leaf_v.append(tuple(pos))
            light = shade * (.82 + .18 * t)
            leaf_c.append((.91 * light, .98 * light, .84 * light, 1))
        rows.append(row)
    flip = rng.random() < .5
    for i in range(steps):
        for j in range(2):
            leaf_f.append((rows[i][j+1], rows[i][j], rows[i+1][j], rows[i+1][j+1]))
            y0, y1 = j / 2, (j+1) / 2
            if not flip: y0, y1 = 1-y0, 1-y1
            leaf_uv.append(((i/steps,y1),(i/steps,y0),((i+1)/steps,y0),((i+1)/steps,y1)))

zs = [0, .22, .65, 1.25, 2.0, 2.8, 3.6, 4.4, 5.15, 5.85, 6.2]
tube([axis(z) for z in zs], [.35,.31,.26,.22,.18,.145,.11,.08,.055,.03,.008], 12)
for i in range(6):
    a = i * math.tau / 6 + .22
    d = Vector((math.cos(a), math.sin(a), 0))
    tube([axis(.30), d*.28+up*.12, d*.62+up*.025], [.17,.105,.012], 7)

levels = [(1.48,2.02,6),(2.12,1.91,6),(2.82,1.68,6),(3.48,1.40,6),
          (4.02,1.19,6),(4.48,.98,5),(4.86,.79,5),(5.18,.63,5),(5.48,.48,5),(5.76,.34,4),(5.98,.24,4)]
for tier, (height, extent, count) in enumerate(levels):
    for k in range(count):
        angle = k * math.tau / count + tier * 1.83 + rng.uniform(-.14,.14)
        d = Vector((math.cos(angle), math.sin(angle), 0))
        length = extent * rng.uniform(.90,1.07)
        root = axis(height + rng.uniform(-.08,.08))
        pts = [root + d*(length*t) + up*(length*(.18*t-.20*t*t)) for t in (0,.25,.5,.75,1)]
        tube([pts[0], pts[1], pts[0].lerp(pts[2], .60)], [.045*length,.024*length,.006], 6)
        # 一枝を一つの塊にし、中心と左右の小枝へ画像を貼る。
        card(pts[0]+d*(length*.10), angle, length*.93, length*.70, .34, .90, rng.uniform(-.12,.12))
        for sign in (-1, 1):
            fork = angle + sign*rng.uniform(.46,.70)
            origin = pts[2] + up*.03
            card(origin, fork, length*.58, length*.45, .52, .84 if sign<0 else .96, sign*.20)
        # 暗い内側の短い房で層をつなぐ。
        inner_len=max(.48,length*.45)
        card(pts[0]-up*.02, angle + .12, inner_len, max(.38,length*.39), 1.0, .76, .38)

# 先端の若芽は短い2枚を交差させる。
for a in (0, math.pi/2):
    root=axis(5.98)
    card(root,a,.23,.24,-.80,.95,.45)

def make_mesh(name, verts, faces, colors, uvs=None):
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts, [], faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
    for p in mesh.polygons: p.use_smooth=True
    attr=mesh.color_attributes.new(name='Color',type='BYTE_COLOR',domain='CORNER')
    layer=mesh.uv_layers.new(name='UVMap') if uvs else None
    for poly in mesh.polygons:
        for j, li in enumerate(poly.loop_indices):
            attr.data[li].color=colors[mesh.loops[li].vertex_index]
            if layer: layer.data[li].uv=uvs[poly.index][j]
    return obj

bark=make_mesh('trunk_and_branches',bark_v,bark_f,bark_c,bark_uv)
leaves=make_mesh('foliage_cards',leaf_v,leaf_f,leaf_c,leaf_uv)
mat=bpy.data.materials.new('bark'); mat.use_nodes=True
nodes=mat.node_tree.nodes; bsdf=nodes.get('Principled BSDF'); bsdf.inputs['Roughness'].default_value=1
col=nodes.new('ShaderNodeVertexColor'); col.layer_name='Color'
tex=nodes.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(str(OUT/'bark.png')); tex.image.pack()
mix=nodes.new('ShaderNodeMix'); mix.data_type='RGBA'; mix.blend_type='MULTIPLY'; mix.inputs['Factor'].default_value=1
mat.node_tree.links.new(tex.outputs['Color'],mix.inputs[6]); mat.node_tree.links.new(col.outputs['Color'],mix.inputs[7]); mat.node_tree.links.new(mix.outputs[2],bsdf.inputs['Base Color'])
bark.data.materials.append(mat)
mat=bpy.data.materials.new('leaf_sprig'); mat.use_nodes=True
nodes=mat.node_tree.nodes; bsdf=nodes.get('Principled BSDF'); bsdf.inputs['Roughness'].default_value=1
tex=nodes.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(str(OUT/'sprig-soft.png')); tex.image.pack()
col=nodes.new('ShaderNodeVertexColor'); col.layer_name='Color'
mix=nodes.new('ShaderNodeMix'); mix.data_type='RGBA'; mix.blend_type='MULTIPLY'; mix.inputs['Factor'].default_value=1
mat.node_tree.links.new(tex.outputs['Color'],mix.inputs[6]); mat.node_tree.links.new(col.outputs['Color'],mix.inputs[7]); mat.node_tree.links.new(mix.outputs[2],bsdf.inputs['Base Color'])
mat.node_tree.links.new(tex.outputs['Alpha'],bsdf.inputs['Alpha']); mat.use_backface_culling=False
leaves.data.materials.append(mat)
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active=leaves
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'fir-zero.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'fir-zero.glb'),export_format='GLB',use_selection=True,export_yup=True,export_vertex_color='ACTIVE')
print(f'FIR_ZERO_BUILT bark_faces={len(bark_f)}; foliage_cards={len(leaf_f)//14}; triangles={(len(bark_f)+len(leaf_f))*2}', flush=True)
