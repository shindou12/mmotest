# mmotest 用 Blender 共通処理（Blender 4.x）
#   取り決め: 1 単位 = 1 m / 原点は底の中心 / Z 上（書き出し時に Y 上へ変換）/ フラットシェード
#   色は「パレットの材質」で付ける（材質名 = 分類名）。箱庭の toon 化はこの色をそのまま使う
#   書き出し先: public/assets/models/blender/<name>.glb、manifest.json に追記
import bpy, bmesh, json, os, random
from mathutils import Vector, Matrix, noise

PALETTE = {  # 現行ゲームの色に寄せた基本色（sRGB）
    '岩': (0x7a, 0x7f, 0x86), '苔': (0x5f, 0x8f, 0x3c), '岩_暗': (0x5c, 0x60, 0x68),
    '葉': (0x3f, 0x8a, 0x46), '葉_暗': (0x2c, 0x66, 0x36), '葉_明': (0x5c, 0xa4, 0x52),
    '幹': (0x6b, 0x4a, 0x32), '幹_暗': (0x52, 0x38, 0x26),
}

def repo_root():
    here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() and os.path.exists(__file__) else None
    if not here:  # Blender のテキストエディタから実行したとき
        try: here = os.path.dirname(bpy.path.abspath(bpy.context.space_data.text.filepath))
        except Exception: here = os.getcwd()
    return os.path.abspath(os.path.join(here, '..', '..'))

def srgb_to_lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def material(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    r, g, b = PALETTE[name]
    m.diffuse_color = (srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b), 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = m.diffuse_color
    bsdf.inputs['Roughness'].default_value = 1.0
    return m

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def ico(radius=1.0, sub=2):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=radius)
    return bm

def displace(bm, seed, amp=0.2, freq=1.2):
    off = Vector((seed * 7.13, seed * 3.71, seed * 5.29))
    for v in bm.verts:
        n = noise.fractal(v.co * freq + off, 0.6, 2.0, 3)
        v.co += v.co.normalized() * n * amp

def cut(bm, rnd, count=6, at=0.65, flat_bottom=True):
    # 平面で削いで面取りの「割れ面」を作る（平面より外の頂点を平面へ押し戻す）
    planes = []
    for _ in range(count):
        n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.3, 1))).normalized()
        planes.append((n, at + rnd.uniform(-0.1, 0.12)))
    if flat_bottom: planes.append((Vector((0, 0, -1)), 0.35))
    for n, d in planes:
        for v in bm.verts:
            s = v.co.dot(n)
            if s > d: v.co -= n * (s - d)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.004)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=0.002)

def to_object(bm, name, mats):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    for p in me.polygons: p.use_smooth = False
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob

def ground_origin(ob, sink=0.0):
    # 底の中心を原点に（sink だけ地面に埋める）
    zs = [v.co.z for v in ob.data.vertices]
    xs = [v.co.x for v in ob.data.vertices]; ys = [v.co.y for v in ob.data.vertices]
    c = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs) + sink))
    ob.data.transform(Matrix.Translation(-c))

def export(objs, name, kind, scale=1.0):
    out_dir = os.path.join(repo_root(), 'public', 'assets', 'models', 'blender')
    os.makedirs(out_dir, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    path = os.path.join(out_dir, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
    add_manifest('blender/' + name + '.glb', kind, scale)
    print('書き出し:', path)

def add_manifest(file, kind, scale):
    path = os.path.join(repo_root(), 'public', 'assets', 'models', 'manifest.json')
    data = {'source': 'Blender 生成（tools/blender）', 'items': []}
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f: data = json.load(f)
    data['items'] = [i for i in data.get('items', []) if i.get('file') != file]
    data['items'].append({'file': file, 'kind': kind, 'scale': scale})
    data['items'].sort(key=lambda i: i['file'])
    with open(path, 'w', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, indent=2); f.write('\n')
