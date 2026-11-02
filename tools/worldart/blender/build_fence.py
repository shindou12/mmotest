"""手描きトリムを共用する実寸の柵。指定 Blender 4.2.23 で実行する。
blender -b --factory-startup --python tools/worldart/blender/build_fence.py -- --lengths 1.5,2,2.5,3 --preview
"""
import argparse
import json
import math
from pathlib import Path
import random
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools/worldart/maps'))
from fence_fit import asset_name

TEXTURE = ROOT / 'public/worldart/tex/fence_trim.png'
OUT = ROOT / 'public/worldart/assets'
SHOTS = ROOT / 'art/shots/painted_glade/v5'
REPEATS_PER_M = 1.0
POST_WIDTH = .32
POST_HEIGHT = 1.10
POST_BURY = .10
RAIL_WIDTH = .12
RAIL_HEIGHT = .24
RAIL_BEVEL = .008
RAIL_LEVELS = (.42, .80)
RAIL_STEP = .5
RAIL_OFFSET_Y = .004
RAIL_WAVE_Y = .0045
RAIL_WAVE_Z = .009
VERTEX_SHADE_HEIGHT = 1.15
TRIM_SATURATION = .70
TRIM_HUE_SHIFT = -.015
TRIM_VALUE = .90

if '--trim-only' not in sys.argv:
    import bpy
    from mathutils import Vector


def assemble_trim():
    """元絵から v4 と同じ帯を組み、光と階調を保って色だけを補正する。"""
    from PIL import Image
    import numpy as np
    src = Image.open(ROOT / 'art/painted-gen/fence/wood_source.png').convert('RGB')
    w, h = src.size
    atlas = np.zeros((1024, 1024, 3), np.uint8)
    for i in range(3):
        crop = src.crop((0, round(h * (i * .25 + .012)), w, round(h * ((i + 1) * .25 - .012))))
        a = np.array(crop.resize((1024, 256), Image.Resampling.LANCZOS), dtype=float)
        common = (a[:, 0] + a[:, -1]) * .5
        for j in range(80):
            blend = (1 - j / 79) ** 2
            a[:, j] = a[:, j] * (1 - blend) + common * blend
            a[:, -1 - j] = a[:, -1 - j] * (1 - blend) + common * blend
        for y in range(256):
            top = max(0, 1 - abs(y - 10) / 9) * .22
            bottom = max(0, 1 - abs(y - 245) / 6) * .32
            a[y] = a[y] * (1 - bottom) * (1 - top) + np.array([255, 216, 139]) * top
        atlas[i * 256:(i + 1) * 256] = np.clip(a, 0, 255).astype(np.uint8)
    atlas[768:] = [183, 124, 62]
    end = src.crop((0, round(h * .70), round(w * .32), h)).resize((240, 240), Image.Resampling.LANCZOS)
    atlas[776:1016, 8:248] = np.array(end)
    hsv = np.array(Image.fromarray(atlas).convert('HSV'), dtype=float)
    hsv[:, :, 0] = (hsv[:, :, 0] + TRIM_HUE_SHIFT * 255) % 256
    hsv[:, :, 1] *= TRIM_SATURATION
    hsv[:, :, 2] *= TRIM_VALUE
    Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB').save(TEXTURE)
    print('TRIM', TRIM_SATURATION, TRIM_HUE_SHIFT, TRIM_VALUE)


def material():
    mat = bpy.data.materials.get('fence_w')
    if mat:
        return mat
    mat = bpy.data.materials.new('fence_w')
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = 1.0
    shader.inputs['Specular IOR Level'].default_value = 0.0
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(str(TEXTURE))
    tex.extension = 'REPEAT'
    mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    return mat


class TimberMesh:
    def __init__(self):
        self.vertices, self.faces, self.uvs = [], [], []
        self.rail_checks = []

    def tube(self, rings, section, band, axis):
        """周ごとの面を分離した UV。木口だけ専用の正方形に割り当てる。"""
        base, sides = len(self.vertices), len(section)
        centers = [Vector(c) for c, _ in rings]
        along = [0.0]
        for a, b in zip(centers, centers[1:]):
            along.append(along[-1] + (b - a).length)
        for center, taper in rings:
            for a, b in section:
                offset = (0, a * taper, b * taper) if axis == 'X' else (a * taper, b * taper, 0)
                self.vertices.append(tuple(center[i] + offset[i] for i in range(3)))
        for j in range(len(rings) - 1):
            for i in range(sides):
                nxt = (i + 1) % sides
                self.faces.append((base + j * sides + i, base + j * sides + nxt,
                                   base + (j + 1) * sides + nxt, base + (j + 1) * sides + i))
                v0, v1 = 1 - (band * 256 + 248) / 1024, 1 - (band * 256 + 8) / 1024
                if section[i][1] > section[nxt][1]:
                    v0, v1 = v1, v0
                u0, u1 = along[j] * REPEATS_PER_M, along[j + 1] * REPEATS_PER_M
                self.uvs.append(((u0, v0), (u0, v1), (u1, v1), (u1, v0)))
        for j, reverse in ((0, True), (len(rings) - 1, False)):
            indices = list(range(sides))
            if reverse:
                indices.reverse()
            self.faces.append(tuple(base + j * sides + i for i in indices))
            # 断面が太くなっても木口を専用の正方形内に収める。
            half_a = max(abs(a) for a, _ in section)
            half_b = max(abs(b) for _, b in section)
            self.uvs.append(tuple(((128 + section[i][0] / half_a * 100) / 1024,
                                   1 - (896 + section[i][1] / half_b * 100) / 1024) for i in indices))
        if axis == 'X':
            self.rail_checks.append(dict(meters=along[-1], u_span=along[-1] * REPEATS_PER_M))

    def post(self, seed):
        rng = random.Random(seed)
        section = [(-.075, -.10), (.071, -.10), (.10, -.071), (.10, .073),
                   (.072, .10), (-.073, .10), (-.10, .073), (-.10, -.072)]
        section = [(x * POST_WIDTH / .2 * rng.uniform(.96, 1.04),
                    y * POST_WIDTH / .2 * rng.uniform(.96, 1.04)) for x, y in section]
        first = len(self.vertices)
        self.tube([((0, 0, -POST_BURY), 1.04), ((.004, -.002, .45), 1.0),
                   ((.006, .0015, POST_HEIGHT), .96)], section, 2, 'Z')
        for i in range(first + 16, first + 24):
            x, y, z = self.vertices[i]
            self.vertices[i] = (x, y, z + .26 * x - .12 * y)

    def rail(self, length, height, seed, band):
        rng = random.Random(seed)
        # 小さな面取りだけを残した平たい角材。
        a, b, bevel = RAIL_WIDTH / 2, RAIL_HEIGHT / 2, RAIL_BEVEL
        section = [(-a + bevel, -b), (a - bevel, -b), (a, -b + bevel), (a, b - bevel),
                   (a - bevel, b), (-a + bevel, b), (-a, b - bevel), (-a, -b + bevel)]
        section = [(a * rng.uniform(.95, 1.05), b * rng.uniform(.95, 1.05)) for a, b in section]
        # 両端は柱の中心で止める。横方向も柱内に収め、隣の横木と重ねない。
        count = max(2, math.ceil(length / RAIL_STEP))
        rings = []
        for j in range(count + 1):
            t = j / count
            x = length * t
            rings.append(((x, RAIL_OFFSET_Y * math.sin(length * 2.3 + seed) + RAIL_WAVE_Y * math.sin(math.pi * t),
                           height + RAIL_WAVE_Z * math.sin(2 * math.pi * t + .2 * band)),
                          1 + .035 * math.sin(math.pi * t)))
        self.tube(rings, section, band, 'X')

    def object(self, name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        mesh.uv_layers.new(name='UVMap')
        colors = mesh.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='CORNER')
        # 色属性の追加後に UV の参照を取り直す。
        uv = mesh.uv_layers['UVMap']
        for polygon, coords in zip(mesh.polygons, self.uvs):
            polygon.use_smooth = False
            for loop, coord in zip(polygon.loop_indices, coords):
                uv.data[loop].uv = coord
                z = mesh.vertices[mesh.loops[loop].vertex_index].co.z
                c = .7 + .3 * max(0, min(1, (z + POST_BURY) / VERTEX_SHADE_HEIGHT))
                colors.data[loop].color = (c, c, c, 1)
        mesh.materials.append(material())
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj['rail_uv_checks'] = json.dumps(self.rail_checks)
        return obj


def fence_w(length, seed=156):
    if not math.isfinite(length) or length <= 0:
        raise ValueError('長さは正の有限数にしてください')
    timber = TimberMesh()
    timber.post(seed)
    for i, height in enumerate(RAIL_LEVELS):
        timber.rail(length, height, seed + i + 1, i)
    obj = timber.object(asset_name(length))
    obj['length_m'] = length
    obj['post_count'] = 1
    return obj


def fence_w_post(seed=156):
    timber = TimberMesh()
    timber.post(seed)
    obj = timber.object('fence_w_post')
    obj['post_count'] = 1
    return obj


def export(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=str(OUT / (obj.name + '.glb')), export_format='GLB',
                              use_selection=True, export_yup=True, export_normals=True,
                              export_vertex_color='ACTIVE', export_materials='EXPORT')
    obj.data.calc_loop_triangles()
    return dict(asset=obj.name, triangles=len(obj.data.loop_triangles), posts=obj['post_count'],
                rails=json.loads(obj['rail_uv_checks']))


def preview():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # 4 列とも同じカメラの 45 度俯角で撮る。最後の列だけ 2 区間。
    for y, lengths in ((0, [1.5]), (1.8, [2]), (3.6, [3]), (5.4, [1.5, 2])):
        x = 0
        for length in lengths:
            obj = fence_w(length)
            obj.location = (x, y, 0)
            x += length
        fence_w_post().location = (x, y, 0)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    world = bpy.data.worlds.new('preview_world')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.7, .7, .7, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .8
    light = bpy.data.lights.new('preview_sun', 'SUN')
    light.energy = 2
    obj = bpy.data.objects.new('preview_sun', light)
    bpy.context.collection.objects.link(obj)
    obj.rotation_euler = (math.radians(25), math.radians(-20), math.radians(-25))
    camera = bpy.data.cameras.new('preview_camera')
    camera.type = 'ORTHO'
    camera.ortho_scale = 9
    obj = bpy.data.objects.new('preview_camera', camera)
    bpy.context.collection.objects.link(obj)
    target = Vector((1.7, 2.7, .4))
    obj.location = target + Vector((0, -10, 10))
    obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = obj
    scene.view_settings.view_transform = 'Standard'
    scene.render.resolution_x, scene.render.resolution_y = 1280, 1000
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(SHOTS / 'lengths.png')
    bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lengths', default='1.5,2,2.5,3')
    parser.add_argument('--seed', type=int, default=156)
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    lengths = sorted(set(float(x) for x in args.lengths.split(',')))
    if not lengths or any(not math.isfinite(x) or x <= 0 for x in lengths):
        parser.error('長さは正の有限数にしてください')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUT.mkdir(parents=True, exist_ok=True)
    SHOTS.mkdir(parents=True, exist_ok=True)
    results = [export(fence_w(length, args.seed)) for length in lengths]
    results.append(export(fence_w_post(args.seed)))
    report = dict(blender=bpy.app.version_string, repeats_per_meter=REPEATS_PER_M, assets=results)
    print('FENCE_RESULT', json.dumps(report))
    if args.preview:
        preview()


if __name__ == '__main__':
    if '--trim-only' in sys.argv:
        assemble_trim()
    else:
        main()
