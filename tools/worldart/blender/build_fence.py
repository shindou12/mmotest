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
from fence_fit import VARIANTS, asset_name

TEXTURE = ROOT / 'public/worldart/tex/fence_trim.png'
OUT = ROOT / 'public/worldart/assets'
SHOTS = ROOT / 'art/shots/painted_glade/v6'
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

if '--trim-only' not in sys.argv:
    import bpy
    from mathutils import Vector


def assemble_trim():
    """木の帯と木口を保ち、未使用部分に淡い麻色の帯だけを足す。"""
    from PIL import Image
    atlas = Image.open(TEXTURE).convert('RGB')
    for y in range(800, 976):
        light = 1 - .14 * abs((y - 888) / 88)
        atlas.paste(tuple(round(c * light) for c in (202, 188, 151)), (288, y, 1024, y + 1))
    atlas.save(TEXTURE)
    print('TRIM rope=(288,800)-(1024,976); wood unchanged')


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
    def __init__(self, plain=False, variant=0):
        self.vertices, self.faces, self.uvs = [], [], []
        self.rail_checks = []
        self.plain, self.variant = plain, variant

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
        """v5 の柱を基準に、側面の受けと柱頭の欠けだけを加える。"""
        if self.plain:
            return self.plain_post(seed)
        # 両側の横木を受ける深さ 5cm の切り欠き。段の面は水平で硬い角。
        profile = [(-POST_BURY, False), (.28, False), (.28, True),
                   (.56, True), (.56, False), (.66, False), (.66, True),
                   (.94, True), (.94, False), (POST_HEIGHT, False)]
        first = len(self.vertices)
        section = self.post_section(seed)
        rings = []
        for z, _ in profile:
            if z <= .45:
                t = (z + POST_BURY) / (.45 + POST_BURY)
                rings.append(((.004 * t, -.002 * t, z), 1.04 - .04 * t))
            else:
                t = (z - .45) / (POST_HEIGHT - .45)
                rings.append(((.004 + .002 * t, -.002 + .0035 * t, z), 1 - .04 * t))
        self.tube(rings, section, 2, 'Z')
        lean = math.tan(math.radians((-2.5, 1.5, 3)[self.variant]))
        top_delta = (-.04, .02, .06)[self.variant]
        cut_angle = math.radians((0, 90, 210)[self.variant])
        chip = (1, 4, 6)[self.variant]
        for j, (z, inset) in enumerate(profile):
            for i in range(8):
                k = first + j * 8 + i
                x, y, _ = self.vertices[k]
                if inset:
                    x -= math.copysign(.05, x)
                top = j == len(profile) - 1
                if top:
                    u = x * math.cos(cut_angle) + y * math.sin(cut_angle)
                    v = -x * math.sin(cut_angle) + y * math.cos(cut_angle)
                    z1 = z + top_delta + .26 * u - .12 * v
                    if i in (chip, (chip + 1) % 8):
                        z1 -= .05
                    if self.variant == 2 and i == 2:
                        z1 -= .06
                else:
                    z1 = z
                self.vertices[k] = (x + lean * max(0, z1), y, z1)

    @staticmethod
    def post_section(seed):
        """v5 の post() の断面。細部あり・なしで同じ太さを使う。"""
        rng = random.Random(seed)
        section = [(-.075, -.10), (.071, -.10), (.10, -.071), (.10, .073),
                   (.072, .10), (-.073, .10), (-.10, .073), (-.10, -.072)]
        return [(x * POST_WIDTH / .2 * rng.uniform(.96, 1.04),
                 y * POST_WIDTH / .2 * rng.uniform(.96, 1.04)) for x, y in section]

    def plain_post(self, seed):
        """v5 の post(): 比較用の寸法・乱数・斜めの木口を保つ。"""
        section = self.post_section(seed)
        first = len(self.vertices)
        self.tube([((0, 0, -POST_BURY), 1.04), ((.004, -.002, .45), 1.0),
                   ((.006, .0015, POST_HEIGHT), .96)], section, 2, 'Z')
        for i in range(first + 16, first + 24):
            x, y, z = self.vertices[i]
            self.vertices[i] = (x, y, z + .26 * x - .12 * y)

    def rail(self, length, height, seed, band):
        """v5 の rail() と同じ中心線。断面を ±15% 変え、両端を削る。"""
        if self.plain:
            return self.plain_rail(length, height, seed, band)
        section = self.rail_section(seed)
        center_y = RAIL_OFFSET_Y * math.sin(length * 2.3 + seed)
        count = max(2, math.ceil(length / RAIL_STEP))
        # 任意長でも一部品 600 三角形以内。短い両端以外は v5 の刻み。
        count = min(6, count)
        end = min(.10, length * .15)
        positions = sorted(set([length * j / count for j in range(count + 1)] + [end, length - end]))
        rings = []
        for x in positions:
            t = x / length
            taper = 1 + .15 * math.sin(2 * math.pi * t + self.variant * 1.7 + band)
            taper = .85 + (taper - .85) * min(1, x / end, (length - x) / end)
            rings.append(((x, center_y + RAIL_WAVE_Y * math.sin(math.pi * t),
                           height + RAIL_WAVE_Z * math.sin(2 * math.pi * t + .2 * band)), taper))
        self.tube(rings, section, band, 'X')

    @staticmethod
    def rail_section(seed):
        """v5 の rail() の断面。既存の面取りを保つ。"""
        rng = random.Random(seed)
        # 小さな面取りだけを残した平たい角材。
        a, b, bevel = RAIL_WIDTH / 2, RAIL_HEIGHT / 2, RAIL_BEVEL
        section = [(-a + bevel, -b), (a - bevel, -b), (a, -b + bevel), (a, b - bevel),
                   (a - bevel, b), (-a + bevel, b), (-a, b - bevel), (-a, -b + bevel)]
        return [(a * rng.uniform(.95, 1.05), b * rng.uniform(.95, 1.05)) for a, b in section]

    def plain_rail(self, length, height, seed, band):
        """v5 の rail(): 波打ち・太さ・UV の比較基準。"""
        section = self.rail_section(seed)
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

    def binding(self):
        """直径 4cm の縄を、上下どちらか一方の交点に斜めに 2〜3 周巻く。"""
        height = RAIL_LEVELS[self.variant % 2]
        turns = (2, 3, 2)[self.variant]
        for turn in range(turns):
            dz = (turn - (turns - 1) / 2) * .06
            points = [(-.18, -.18, height - .14 + dz),
                      (.12, -.18, height + .14 + dz),
                      (.23, -.08, height + .14 + dz),
                      (.23, .08, height + .14 + dz),
                      (.12, .18, height + .14 + dz),
                      (-.18, .18, height - .14 + dz)]
            centers = [Vector(p) for p in points]
            base = len(self.vertices)
            for j, center in enumerate(centers):
                tangent = (centers[(j + 1) % 6] - centers[(j - 1) % 6]).normalized()
                side = tangent.cross(Vector((0, 0, 1))).normalized()
                up = tangent.cross(side).normalized()
                for k in range(4):
                    self.vertices.append(tuple(center + .02 * (side * math.cos(k * math.pi / 2)
                                                               + up * math.sin(k * math.pi / 2))))
            for j in range(6):
                for k in range(4):
                    self.faces.append((base + j * 4 + k, base + j * 4 + (k + 1) % 4,
                                       base + ((j + 1) % 6) * 4 + (k + 1) % 4, base + ((j + 1) % 6) * 4 + k))
                    self.uvs.append(((.35, .14), (.35, .18), (.85, .18), (.85, .14)))

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


def fence_w(length, seed=156, variant=0, plain=False):
    if not math.isfinite(length) or length <= 0:
        raise ValueError('長さは正の有限数にしてください')
    timber = TimberMesh(plain, variant)
    shape_seed = seed if plain else seed + variant * 31
    timber.post(shape_seed)
    for i, height in enumerate(RAIL_LEVELS):
        timber.rail(length, height, shape_seed + i + 1, i)
    if not plain:
        timber.binding()
    obj = timber.object(asset_name(length, None if plain else VARIANTS[variant]))
    obj['length_m'] = length
    obj['post_count'] = 1
    return obj


def fence_w_post(seed=156, variant=0, plain=False):
    timber = TimberMesh(plain, variant)
    timber.post(seed if plain else seed + variant * 31)
    obj = timber.object('fence_w_post' + ('' if plain else '_' + VARIANTS[variant]))
    obj['post_count'] = 1
    return obj


def export(obj):
    obj.data.calc_loop_triangles()
    triangles = len(obj.data.loop_triangles)
    if triangles > 600:
        raise ValueError(f'{obj.name}: {triangles} 三角形（上限 600）')
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=str(OUT / (obj.name + '.glb')), export_format='GLB',
                              use_selection=True, export_yup=True, export_normals=True,
                              export_vertex_color='ACTIVE', export_materials='EXPORT')
    return dict(asset=obj.name, triangles=triangles, posts=obj['post_count'],
                rails=json.loads(obj['rail_uv_checks']))


def preview(seed=156, plain=False, blockout=False):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # 4 列とも同じカメラの 45 度俯角で撮る。最後の列だけ 2 区間。
    for row, (y, lengths) in enumerate(((0, [1.5]), (1.8, [2]), (3.6, [3]), (5.4, [1.5, 2]))):
        x = 0
        for index, length in enumerate(lengths):
            obj = fence_w(length, seed, (row + index) % 3, plain)
            obj.location = (x, y, 0)
            x += length
        fence_w_post(seed, (row + len(lengths)) % 3, plain).location = (x, y, 0)
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
    if blockout:
        gray = bpy.data.materials.new('blockout_gray')
        gray.use_nodes = True
        shader = gray.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (.42, .42, .42, 1)
        shader.inputs['Roughness'].default_value = 1
        shader.inputs['Specular IOR Level'].default_value = 0
        scene.view_layers[0].material_override = gray
    scene.render.resolution_x, scene.render.resolution_y = 1280, 1000
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(SHOTS / ('blockout.png' if blockout else 'lengths.png'))
    bpy.ops.render.render(write_still=True)


def main():
    global OUT, SHOTS
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lengths', default='1.5,2,2.5,3')
    parser.add_argument('--seed', type=int, default=156)
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--plain', action='store_true', help='細部を足さず v5 の形を出す')
    parser.add_argument('--blockout', action='store_true', help='絵と頂点色を使わず灰色の陰影で撮る')
    parser.add_argument('--preview-only', action='store_true', help='GLB を書き出さず撮影する')
    parser.add_argument('--out', type=Path, default=OUT)
    parser.add_argument('--shots-dir', type=Path, default=SHOTS)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    lengths = sorted(set(float(x) for x in args.lengths.split(',')))
    if not lengths or any(not math.isfinite(x) or x <= 0 for x in lengths):
        parser.error('長さは正の有限数にしてください')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUT, SHOTS = args.out, args.shots_dir
    OUT.mkdir(parents=True, exist_ok=True)
    SHOTS.mkdir(parents=True, exist_ok=True)
    results = []
    if not args.preview_only:
        for variant in range(1 if args.plain else len(VARIANTS)):
            results.extend(export(fence_w(length, args.seed, variant, args.plain)) for length in lengths)
            results.append(export(fence_w_post(args.seed, variant, args.plain)))
    report = dict(blender=bpy.app.version_string, repeats_per_meter=REPEATS_PER_M, assets=results)
    print('FENCE_RESULT', json.dumps(report))
    if args.preview or args.blockout or args.preview_only:
        preview(args.seed, args.plain, args.blockout)


if __name__ == '__main__':
    if '--trim-only' in sys.argv:
        assemble_trim()
    else:
        main()
