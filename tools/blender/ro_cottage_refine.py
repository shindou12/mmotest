# 森の家（RO風: public/ro-cottage.html）の形を Blender で仕上げる
#   元: 場面のコードで組んだ形（tools/ro-look/export-models.mjs で書き出した GLB）。名前（house_* / flowers_* / rock_*）はそのまま返す
#   実行: blender -b -P tools/blender/ro_cottage_refine.py -- out/ro-cottage/models-raw.glb
#   作るもの: public/assets/models/blender/ro-cottage-refined.glb（場面が読んで形だけ差し替える）/ tools/blender/ro_cottage_refined.blend
#   仕上げ
#     1. 三角形のばらばらの面をつなぎ直す（同じ位置の頂点をまとめる）
#     2. 角を面取り（ベベル。角度で選ぶ）: 家は丸みのある角に、岩は欠けた角に。光が角に乗って、箱の継ぎ目が目立たなくなる
#     3. なめらかな陰影（角は 40° で立てる）
#     4. 家は長い辺を 0.45m ごとに分ける（大きな三角形のままだと、隣の箱に埋まった角の頂点の AO が面全体を暗くする）
#     5. 溝・軒下・石の間に溜まる陰（AO）を Cycles で焼き、頂点の色に掛ける（絵の上に、手で描いたような陰が付く）
import os, sys, math
import bpy, bmesh

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.abspath(ARGS[0]) if ARGS else os.path.join(ROOT, 'out', 'ro-cottage', 'models-raw.glb')
OUT = os.path.join(ROOT, 'public', 'assets', 'models', 'blender', 'ro-cottage-refined.glb')
BLEND = os.path.join(ROOT, 'tools', 'blender', 'ro_cottage_refined.blend')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
print('読み込み:', len(objs))

def weld(ob, dist=0.0006):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(ob.data); bm.free()

def densify(ob, step=0.45):
    # 長い辺を分ける。大きな三角形のままだと、角の頂点が隣の箱に埋まって AO が面全体を暗くする
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for _ in range(6):
        long = [e for e in bm.edges if e.calc_length() > step]
        if not long: break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(ob.data); bm.free()

def apply_mods(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)

for ob in objs:
    kind = ob.name.split('_')[0]
    weld(ob)
    if kind in ('house', 'rock'):
        bv = ob.modifiers.new('面取り', 'BEVEL')
        bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(30)
        bv.width = 0.035 if kind == 'house' else 0.05; bv.segments = 2 if kind == 'house' else 1
        bv.profile = 0.6 if kind == 'house' else 0.3; bv.harden_normals = kind == 'house'; bv.use_clamp_overlap = True
        apply_mods(ob)
    if kind == 'house': densify(ob)
    for p in ob.data.polygons: p.use_smooth = True
    ob.data.set_sharp_from_angle(angle=math.radians(40))

# AO を焼く（家の足元の陰のために、家の下に地面の板を置く。書き出さない）
xs = [v.co.x for o in objs if o.name.startswith('house') for v in o.data.vertices]
ys = [v.co.y for o in objs if o.name.startswith('house') for v in o.data.vertices]
zs = [v.co.z for o in objs if o.name.startswith('house') for v in o.data.vertices]
bpy.ops.mesh.primitive_plane_add(size=1, location=((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs) + 0.02))
floor = bpy.context.object; floor.name = '地面（焼くだけ）'; floor.scale = (max(xs) - min(xs) + 12, max(ys) - min(ys) + 12, 1)

sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48
sc.world = bpy.data.worlds.new('空'); sc.world.light_settings.distance = 0.4   # AO の届く距離（m）。長いと重なった屋根板どうしで全体が暗くなる
bake_mat = bpy.data.materials.new('焼く用'); bake_mat.use_nodes = True
for ob in objs:
    me = ob.data
    if not me.materials: me.materials.append(bake_mat)
    if 'AO' not in me.color_attributes: me.color_attributes.new('AO', 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = me.color_attributes['AO']
bpy.ops.object.select_all(action='DESELECT')
for ob in objs: ob.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
print('AO を焼いた')

# 元の色 × AO（いちばん暗い所で 0.5。真っ黒にしない: RO風の影は暖かい深緑で、黒くしない）
for ob in objs:
    me = ob.data
    col = next(a for a in me.color_attributes if a.name != 'AO')
    ao = me.color_attributes['AO']
    n = len(col.data); c = [0.0] * (n * 4); a = [0.0] * (n * 4)
    if col.domain != 'CORNER':
        print('点ごとの色は角ごとへ', ob.name)
    col.data.foreach_get('color', c); ao.data.foreach_get('color', a)
    k = 0.0 if ob.name.startswith('flowers') or os.environ.get('NO_AO') else 0.38 if ob.name.startswith('rock') else 0.45
    def crease(v):  # 開けた面（AO 0.75 以上）は暗くしない。溝・軒下・足元（AO が小さい所）だけ暗く
        t = max(0.0, min(1.0, (0.75 - v) / 0.55)); return t * t * (3 - 2 * t)
    for i in range(n):
        f = 1 - k * crease(a[i * 4])
        c[i * 4] *= f; c[i * 4 + 1] *= f ** 1.05; c[i * 4 + 2] *= f ** 1.2  # 陰は少し暖かい色へ（f = 1 では変えない）
    col.data.foreach_set('color', c)
    me.color_attributes.remove(ao)
    me.color_attributes.active_color = me.color_attributes[col.name]
    me.materials.clear()

bpy.data.objects.remove(floor)
bpy.ops.object.select_all(action='DESELECT')
for ob in objs: ob.select_set(True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_materials='NONE', export_vertex_color='ACTIVE', export_cameras=False, export_lights=False)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
print('書き出し:', OUT, os.path.getsize(OUT) // 1024, 'KB / 三角形', tris)
bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
print('保存:', BLEND)
