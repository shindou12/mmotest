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
SHOTS = ROOT / 'art/shots/painted_glade/v7'
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
ATLAS_HEIGHT = 2048
POST_BAND_HEIGHT = 384
POST_BAND_TOP = 768
POST_SIDES = 8
RAIL_SIDES = 6
FACET_CONTRAST = .08

if '--trim-only' not in sys.argv:
    import bpy
    from mathutils import Vector


def assemble_trim():
    """v5 の木の色を保ち、全周の柱三種類に隙間・割れ・生成した縄を描く。"""
    from PIL import Image
    import numpy as np
    original = Image.open(TEXTURE).convert('RGB')
    atlas = Image.new('RGB', (1024, ATLAS_HEIGHT), original.getpixel((512, 700)))
    atlas.paste(original.crop((0, 0, 1024, 768)))
    cap_box = (8, 776, 248, 1016) if original.height == 1024 else (8, 1928, 248, 2040)
    atlas.paste(original.crop(cap_box).resize((240, 112), Image.Resampling.LANCZOS), (8, 1928))
    wood = np.array(original.crop((0, 512, 1024, 768)))
    rope = Image.open(ROOT / 'art/painted-gen/fence/rope.png').convert('RGBA')
    # 生成画像の透明部分に残るごく薄い画素を切り出しに数えない。
    solid = rope.getchannel('A').point(lambda alpha: 255 if alpha > 64 else 0)
    rope = rope.crop(solid.getbbox())
    yy, xx = np.mgrid[:POST_BAND_HEIGHT, :1024]
    z = POST_HEIGHT - (yy - 8) / (POST_BAND_HEIGHT - 16) * (POST_HEIGHT + POST_BURY)
    u = xx / 1024
    minima = []
    for variant in range(len(VARIANTS)):
        section = faceted_post_sections(156 + variant * 31)[0]
        widths = [math.dist(section[i], section[(i + 1) % POST_SIDES]) for i in range(POST_SIDES)]
        bounds = np.r_[0, np.cumsum(widths)] / sum(widths)
        facets = np.clip(np.searchsorted(bounds, u, side='right') - 1, 0, POST_SIDES - 1)
        across = (u - bounds[facets]) / (bounds[facets + 1] - bounds[facets])
        # 木目の長手 U を面ごとにずらしてから、全周の細部を重ねる。
        src_u = (((z + POST_BURY) * REPEATS_PER_M + facets * .173 + variant * .097) * 1024).astype(int) % 1024
        src_v = np.clip((8 + across * 240).astype(int), 0, 255)
        painted = wood[src_v, src_u].astype(float)
        darkness = np.zeros_like(z)
        for height in RAIL_LEVELS:
            for edge in (-1, 1):
                line = height + edge * (RAIL_HEIGHT / 2 + .012) + .003 * np.sin(u * math.tau * 3)
                darkness = np.maximum(darkness, .4 * np.exp(-.5 * ((z - line) / .013) ** 2))
        for crack in range(1 + variant % 2):
            path = (.18 + crack * .47 + variant * .08 + .012 * np.sin(z * 8 + crack)) % 1
            dist = np.abs((u - path + .5) % 1 - .5)
            center, extent = (.64, .46) if crack == 0 else (.30, .30)
            envelope = np.clip(1 - np.abs(z - center) / extent, 0, 1)
            darkness = np.maximum(darkness, .4 * envelope * np.exp(-.5 * (dist / .0035) ** 2))
        factor = np.maximum(.6, 1 - darkness)
        minima.append(float(factor.min()))
        panel = Image.fromarray(np.uint8(np.clip(painted * factor[..., None], 0, 255))).convert('RGBA')
        if variant < 2:
            height = RAIL_LEVELS[1 - variant]
            rope_height = round(.075 / (POST_HEIGHT + POST_BURY) * (POST_BAND_HEIGHT - 16))
            strip = np.array(rope.resize((1024, rope_height), Image.Resampling.LANCZOS)).astype(float)
            # 周の継ぎ目は左右の同じ画素へ寄せる。縄の光や影は足さない。
            for i in range(24):
                blend = (1 - i / 24) * .5
                left, right = strip[:, i].copy(), strip[:, -1 - i].copy()
                strip[:, i] = left * (1 - blend) + right * blend
                strip[:, -1 - i] = right * (1 - blend) + left * blend
            strip = Image.fromarray(np.uint8(strip))
            top = round(8 + (POST_HEIGHT - height) / (POST_HEIGHT + POST_BURY) * (POST_BAND_HEIGHT - 16) - rope_height / 2)
            panel.alpha_composite(strip, (0, top))
        # ミップの隣帯の混入を避けるため、上下に同じ画素を延ばす。
        panel.paste(panel.crop((0, 8, 1024, 9)).resize((1024, 8)), (0, 0))
        panel.paste(panel.crop((0, POST_BAND_HEIGHT - 9, 1024, POST_BAND_HEIGHT - 8)).resize((1024, 8)), (0, POST_BAND_HEIGHT - 8))
        atlas.paste(panel.convert('RGB'), (0, POST_BAND_TOP + variant * POST_BAND_HEIGHT))
    atlas.save(TEXTURE)
    print('TRIM 1024x2048; post a=upper-rope b=lower-rope c=no-rope; min_dark=', minima)


def faceted_post_sections(seed):
    """柱の全周 UV と描き込む帯で共用する八面の断面。"""
    rng = random.Random(seed)
    angles = [math.pi / 8 + i * math.tau / POST_SIDES + rng.uniform(-.025, .025)
              for i in range(POST_SIDES)]
    sections = []
    for phase in (1, -1, 1, .6):
        cross = []
        for i, angle in enumerate(angles):
            a = angle + phase * .085 * math.sin(i * math.pi / 2 + .4)
            cross.append((math.cos(a), math.sin(a)))
        sx, sy = max(abs(x) for x, _ in cross), max(abs(y) for _, y in cross)
        sections.append([(x / sx * POST_WIDTH / 2, y / sy * POST_WIDTH / 2) for x, y in cross])
    return sections


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
    color = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Col'
    multiply = mat.node_tree.nodes.new('ShaderNodeMixRGB')
    multiply.blend_type = 'MULTIPLY'
    multiply.inputs[0].default_value = 1
    mat.node_tree.links.new(tex.outputs['Color'], multiply.inputs[1])
    mat.node_tree.links.new(color.outputs['Color'], multiply.inputs[2])
    mat.node_tree.links.new(multiply.outputs[0], shader.inputs['Base Color'])
    return mat


class TimberMesh:
    def __init__(self, plain=False, variant=0):
        self.vertices, self.faces, self.uvs = [], [], []
        self.face_tints, self.end_shades, self.facet_checks = [], [], []
        self.rail_checks = []
        self.plain, self.variant = plain, variant

    def tube(self, rings, section, band, axis, sections=None):
        """周ごとの面を分離した UV。木口だけ専用の正方形に割り当てる。"""
        base, sides = len(self.vertices), len(section)
        centers = [Vector(c) for c, _ in rings]
        along = [0.0]
        for a, b in zip(centers, centers[1:]):
            along.append(along[-1] + (b - a).length)
        sections = sections or [section] * len(rings)
        for (center, taper), cross in zip(rings, sections):
            for a, b in cross:
                offset = (0, a * taper, b * taper) if axis == 'X' else (a * taper, b * taper, 0)
                self.vertices.append(tuple(center[i] + offset[i] for i in range(3)))
        widths = [math.dist(cross[i], cross[(i + 1) % sides]) * taper
                  for (_, taper), cross in zip(rings, sections) for i in range(sides)]
        if not self.plain and min(widths) < .04:
            raise ValueError(f'{axis}: 面の幅 {min(widths):.4f}m < 0.04m')
        self.facet_checks.append(dict(axis=axis, sides=sides, min_width=min(widths)))
        tints = [random.Random(156 + self.variant * 31 + band * 13 + i).uniform(1 - FACET_CONTRAST, 1 + FACET_CONTRAST)
                 for i in range(sides)]
        # 柱は全周を一枚の帯に対応させる。木目の U ずらしは帯を作る時に行う。
        perimeter = [0.0]
        for i in range(sides):
            perimeter.append(perimeter[-1] + math.dist(section[i], section[(i + 1) % sides]))
        for j in range(len(rings) - 1):
            for i in range(sides):
                nxt = (i + 1) % sides
                self.faces.append((base + j * sides + i, base + j * sides + nxt,
                                   base + (j + 1) * sides + nxt, base + (j + 1) * sides + i))
                if axis == 'Z' and not self.plain:
                    u0, u1 = perimeter[i] / perimeter[-1], perimeter[i + 1] / perimeter[-1]
                    top = POST_BAND_TOP + self.variant * POST_BAND_HEIGHT + 8
                    span = POST_BAND_HEIGHT - 16
                    v0 = 1 - (top + (1 - (rings[j][0][2] + POST_BURY) / (POST_HEIGHT + POST_BURY)) * span) / ATLAS_HEIGHT
                    v1 = 1 - (top + (1 - (rings[j + 1][0][2] + POST_BURY) / (POST_HEIGHT + POST_BURY)) * span) / ATLAS_HEIGHT
                    self.uvs.append(((u0, v0), (u1, v0), (u1, v1), (u0, v1)))
                else:
                    v0, v1 = 1 - (band * 256 + 248) / ATLAS_HEIGHT, 1 - (band * 256 + 8) / ATLAS_HEIGHT
                    if section[i][1] > section[nxt][1]:
                        v0, v1 = v1, v0
                    shift = 0 if self.plain else (i * .173 + self.variant * .097) % 1
                    u0, u1 = along[j] * REPEATS_PER_M + shift, along[j + 1] * REPEATS_PER_M + shift
                    self.uvs.append(((u0, v0), (u0, v1), (u1, v1), (u1, v0)))
                # 色は長手の同じ面で共通。上向きの面だけ少し明るくする。
                upward = axis == 'X' and section[nxt][0] < section[i][0]
                tint = 1 if self.plain else tints[i] * (1.035 if upward else 1)
                self.face_tints.append(tint)
                shade = []
                for k in self.faces[-1]:
                    x = self.vertices[k][0]
                    d = min(x, rings[-1][0][0] - x) - POST_WIDTH / 2
                    shade.append(.7 + .3 * max(0, min(1, d / .12)) if axis == 'X' and not self.plain else 1)
                self.end_shades.append(shade)
        for j, reverse in ((0, True), (len(rings) - 1, False)):
            indices = list(range(sides))
            if reverse:
                indices.reverse()
            self.faces.append(tuple(base + j * sides + i for i in indices))
            # 断面が太くなっても木口を専用の正方形内に収める。
            half_a = max(abs(a) for a, _ in section)
            half_b = max(abs(b) for _, b in section)
            self.uvs.append(tuple(((128 + section[i][0] / half_a * 100) / 1024,
                                   1 - (1984 + section[i][1] / half_b * 45) / ATLAS_HEIGHT) for i in indices))
            self.face_tints.append(1 if self.plain else 1.035)
            self.end_shades.append([.7 if axis == 'X' and not self.plain else 1] * sides)
        if axis == 'X':
            self.rail_checks.append(dict(meters=along[-1], u_span=along[-1] * REPEATS_PER_M))

    def post(self, seed):
        """v5 の post() の寸法と、v6 の柱頭。側面は二度折れる大きな面だけ。"""
        if self.plain:
            return self.plain_post(seed)
        first = len(self.vertices)
        sections = faceted_post_sections(seed)
        rings = [((0, 0, -POST_BURY), 1.04), ((.003, -.002, .30), 1.01),
                 ((.005, 0, .73), .98), ((.006, .0015, POST_HEIGHT), .96)]
        self.tube(rings, sections[0], 2, 'Z', sections)
        lean = math.tan(math.radians((-2.5, 1.5, 3)[self.variant]))
        top_delta = (-.04, .02, .06)[self.variant]
        cut_angle = math.radians((0, 90, 210)[self.variant])
        chip = (1, 4, 6)[self.variant]
        for j, (center, _) in enumerate(rings):
            for i in range(POST_SIDES):
                z = center[2]
                k = first + j * POST_SIDES + i
                x, y, _ = self.vertices[k]
                top = j == len(rings) - 1
                if top:
                    u = x * math.cos(cut_angle) + y * math.sin(cut_angle)
                    v = -x * math.sin(cut_angle) + y * math.cos(cut_angle)
                    z1 = z + top_delta + .26 * u - .12 * v
                    if i in (chip, (chip + 1) % POST_SIDES):
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
        """v6 の rail() の太さの不ぞろい。六つの広い面を途中で二度折る。"""
        if self.plain:
            return self.plain_rail(length, height, seed, band)
        center_y = RAIL_OFFSET_Y * math.sin(length * 2.3 + seed)
        end = min(.10, length * .15)
        # 色の減衰点もリングに置く。面の境界の折れは .36L と .68L だけ。
        edge = min(POST_WIDTH / 2, length * .15)
        fade = min(edge + .12, length * .30)
        positions = sorted(set([0, edge, fade, length * .36, length * .68,
                                length - fade, length - edge, length]))
        rings, sections = [], []
        rng = random.Random(seed)
        width_scale, height_scale = rng.uniform(.98, 1.02), rng.uniform(.98, 1.02)
        for x in positions:
            t = x / length
            taper = 1 + .15 * math.sin(2 * math.pi * t + self.variant * 1.7 + band)
            taper = .85 + (taper - .85) * min(1, x / end, (length - x) / end)
            rings.append(((x, center_y + RAIL_WAVE_Y * math.sin(math.pi * t),
                           height + RAIL_WAVE_Z * math.sin(2 * math.pi * t + .2 * band)), taper))
            if t <= .36:
                phase = 1 - 2 * t / .36
            elif t <= .68:
                phase = -1 + 2 * (t - .36) / .32
            else:
                phase = 1 - .4 * (t - .68) / .32
            a, b = RAIL_WIDTH / 2, RAIL_HEIGHT / 2
            cy, cz = .043 + .009 * phase, .055 + .009 * phase
            cross = [(-a, -b + cz), (-a + cy, -b), (a, -b),
                     (a, b - cz), (a - cy, b), (-a, b)]
            sections.append([(y * width_scale, z * height_scale) for y, z in cross])
        self.tube(rings, sections[0], band, 'X', sections)

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

    def object(self, name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        mesh.uv_layers.new(name='UVMap')
        colors = mesh.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='CORNER')
        # 色属性の追加後に UV の参照を取り直す。
        uv = mesh.uv_layers['UVMap']
        for polygon, coords, tint, end_shades in zip(mesh.polygons, self.uvs, self.face_tints, self.end_shades):
            polygon.use_smooth = False
            for loop, coord, end_shade in zip(polygon.loop_indices, coords, end_shades):
                uv.data[loop].uv = coord
                z = mesh.vertices[mesh.loops[loop].vertex_index].co.z
                c = .7 + .3 * max(0, min(1, (z + POST_BURY) / VERTEX_SHADE_HEIGHT))
                c = min(1, c * tint * end_shade)
                colors.data[loop].color = (c, c, c, 1)
        mesh.materials.append(material())
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj['rail_uv_checks'] = json.dumps(self.rail_checks)
        obj['facet_checks'] = json.dumps(self.facet_checks)
        return obj


def fence_w(length, seed=156, variant=0, plain=False):
    if not math.isfinite(length) or length <= 0:
        raise ValueError('長さは正の有限数にしてください')
    timber = TimberMesh(plain, variant)
    shape_seed = seed if plain else seed + variant * 31
    timber.post(shape_seed)
    for i, height in enumerate(RAIL_LEVELS):
        timber.rail(length, height, shape_seed + i + 1, i)
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
                              export_vertex_color='ACTIVE', export_materials='EXPORT',
                              export_image_format='JPEG', export_jpeg_quality=85)
    return dict(asset=obj.name, triangles=triangles, posts=obj['post_count'],
                rails=json.loads(obj['rail_uv_checks']), facets=json.loads(obj['facet_checks']))


def preview(seed=156, plain=False, blockout=False):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # 4 列とも同じカメラの 45 度俯角で撮る。最後の列だけ 2 区間。
    rows = ((0, [1.5]), (1.8, [2]), (3.6, [3]), (5.4, [1.5, 2]))
    if blockout:
        rows = ((0, [1.5]), (0, [1.5]))
    for row, (y, lengths) in enumerate(rows):
        row_plain = row == 0 if blockout else plain
        x = -1.7 if blockout and row == 0 else .8 if blockout else 0
        for index, length in enumerate(lengths):
            obj = fence_w(length, seed, (row + index) % 3, row_plain)
            obj.location = (x, y, 0)
            x += length
        fence_w_post(seed, (row + len(lengths)) % 3, row_plain).location = (x, y, 0)
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
    camera.ortho_scale = 5.3 if blockout else 9
    obj = bpy.data.objects.new('preview_camera', camera)
    bpy.context.collection.objects.link(obj)
    target = Vector((.3, 0, .45) if blockout else (1.7, 2.7, .4))
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
    scene.render.resolution_x, scene.render.resolution_y = (1600, 800) if blockout else (1280, 1000)
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(SHOTS / ('blockout.png' if blockout else 'lengths.png'))
    bpy.ops.render.render(write_still=True)


def main():
    global OUT, SHOTS, FACET_CONTRAST
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lengths', default='1.5,2,2.5,3')
    parser.add_argument('--seed', type=int, default=156)
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--plain', action='store_true', help='細部を足さず v5 の形を出す')
    parser.add_argument('--blockout', action='store_true', help='絵と頂点色を使わず灰色の陰影で撮る')
    parser.add_argument('--preview-only', action='store_true', help='GLB を書き出さず撮影する')
    parser.add_argument('--out', type=Path, default=OUT)
    parser.add_argument('--shots-dir', type=Path, default=SHOTS)
    parser.add_argument('--facet-contrast', type=float, default=FACET_CONTRAST, help='面ごとの頂点色の振れ幅（比較用）')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    lengths = sorted(set(float(x) for x in args.lengths.split(',')))
    if not lengths or any(not math.isfinite(x) or x <= 0 for x in lengths):
        parser.error('長さは正の有限数にしてください')
    if not math.isfinite(args.facet_contrast) or not 0 <= args.facet_contrast <= .08:
        parser.error('面の振れ幅は 0〜0.08 にしてください')
    FACET_CONTRAST = args.facet_contrast
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
