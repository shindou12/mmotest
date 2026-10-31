"""mihon2 の地面に向けた空の可視率を、配置済みアセットと地形から焼く。

blender -b --factory-startup --python tools/worldart/blender/bake_skyvis.py -- mihon2
"""
import bpy
import json
import math
import os
import re
import struct
import sys
import time
import zlib

import numpy as np
from mathutils.bvhtree import BVHTree
from mathutils import Vector


ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
MAP = ARGS[0] if ARGS else 'mihon2'
RAYS = 64
MAX_DISTANCE = 12.0
LEAF_TRANSMITTANCE = 0.5
RAY_EPSILON = 0.003
ORIGIN_OFFSET = 0.06
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'public', 'worldart', 'maps', MAP, 'skyvis.png')


def load_build_map():
    import importlib.util

    path = os.path.join(ROOT, 'tools', 'worldart', 'blender', 'build_map.py')
    spec = importlib.util.spec_from_file_location('build_map_for_skyvis', path)
    module = importlib.util.module_from_spec(spec)
    old_argv = sys.argv[:]
    try:
        sys.argv = [old_argv[0], '--', MAP]
        spec.loader.exec_module(module)
    finally:
        sys.argv = old_argv
    return module


def write_gray_png(path, values):
    pixels = np.round(np.clip(values, 0.0, 1.0) * 255.0).astype(np.uint8)
    height, width = pixels.shape

    def chunk(kind, data):
        body = kind + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)

    rows = b''.join(b'\0' + pixels[y].tobytes() for y in range(height))
    payload = (b'\x89PNG\r\n\x1a\n'
               + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 0, 0, 0, 0))
               + chunk(b'IDAT', zlib.compress(rows, 6))
               + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(payload)


def radical_inverse(value):
    result = 0.0
    scale = 0.5
    while value:
        result += (value & 1) * scale
        value >>= 1
        scale *= 0.5
    return result


def main():
    start = time.perf_counter()
    bm = load_build_map()
    with open(os.path.join(ROOT, 'public', 'worldart', 'maps', MAP, 'placements.json'), encoding='utf-8') as f:
        placed = json.load(f)
    meta = placed['terrain']
    n = bm.n
    if n != int(round(meta['size'] / bm.cell)) + 1:
        raise RuntimeError(f'grid mismatch: build_map={n}, placements={meta["size"]}/{bm.cell}')

    terrain_parts = bm.build_terrain()
    terrain = next(o for o in terrain_parts if o.name == 'terrain')

    with bpy.data.libraries.load(bm.ASSETS_BLEND, link=True) as (src, dst):
        dst.objects = list(src.objects)
    library = {o.name: o for o in dst.objects if o}

    missing = set()
    templates = {}

    def template_for(mesh):
        key = mesh.as_pointer()
        if key in templates:
            return templates[key]
        mesh.calc_loop_triangles()
        local = np.empty((len(mesh.vertices), 3), dtype=np.float32)
        mesh.vertices.foreach_get('co', local.ravel())
        triangles = np.empty((len(mesh.loop_triangles), 3), dtype=np.int32)
        mesh.loop_triangles.foreach_get('vertices', triangles.ravel())
        polygon_ids = np.empty(len(mesh.loop_triangles), dtype=np.int32)
        mesh.loop_triangles.foreach_get('polygon_index', polygon_ids)
        polygon_foliage = np.fromiter(
            (bool(re.search(r'leaf|frond|grass', mesh.materials[p.material_index].name, re.I))
             if p.material_index < len(mesh.materials) and mesh.materials[p.material_index] else False
             for p in mesh.polygons), dtype=np.bool_, count=len(mesh.polygons))
        result = (local, triangles, polygon_foliage[polygon_ids])
        templates[key] = result
        return result

    terrain_template = template_for(terrain.data)
    vertex_count = len(terrain_template[0])
    triangle_count = len(terrain_template[1])
    placed_count = 0
    instance_data = []
    for name, items in placed['assets'].items():
        source_name = name.replace('@shadow', '')
        source = library.get(source_name)
        if source is None or source.type != 'MESH':
            missing.add(source_name)
            continue
        local, triangles, foliage = template_for(source.data)
        for x, y, z, rot, scale in items:
            instance_data.append((local, triangles, foliage, float(x), float(y), float(z), float(rot), float(scale)))
            vertex_count += len(local)
            triangle_count += len(triangles)
            placed_count += 1

    # 全配置を一つの BVH にまとめる。Blender のシーン ray_cast を数百万回呼ぶより、
    # BVH へ直接問い合わせるほうが短時間で同じ配置の交差判定をできる。
    vertices = np.empty((vertex_count, 3), dtype=np.float32)
    triangles = np.empty((triangle_count, 3), dtype=np.int32)
    foliage_faces = np.zeros(triangle_count, dtype=np.bool_)
    terrain_local, terrain_triangles, _terrain_foliage = terrain_template
    vertices[:len(terrain_local)] = terrain_local
    triangles[:len(terrain_triangles)] = terrain_triangles
    vertex_cursor = len(terrain_local)
    triangle_cursor = len(terrain_triangles)
    for local, local_triangles, foliage, x, y, z, rot, scale in instance_data:
        vertex_end = vertex_cursor + len(local)
        triangle_end = triangle_cursor + len(local_triangles)
        c, s = math.cos(rot), math.sin(rot)
        vertices[vertex_cursor:vertex_end, 0] = x + scale * (c * local[:, 0] - s * local[:, 1])
        vertices[vertex_cursor:vertex_end, 1] = -z + scale * (s * local[:, 0] + c * local[:, 1])
        vertices[vertex_cursor:vertex_end, 2] = y + scale * local[:, 2]
        triangles[triangle_cursor:triangle_end] = local_triangles + vertex_cursor
        foliage_faces[triangle_cursor:triangle_end] = foliage
        vertex_cursor = vertex_end
        triangle_cursor = triangle_end
    del instance_data, templates
    bvh = BVHTree.FromPolygons(vertices, triangles, all_triangles=True)
    del vertices, triangles
    print(f'BVH vertices={vertex_count} triangles={triangle_count}', flush=True)

    # Hammersley 配列を cosine-weighted hemisphere に写す。
    sample_x = np.empty(RAYS, dtype=np.float64)
    sample_y = np.empty(RAYS, dtype=np.float64)
    sample_n = np.empty(RAYS, dtype=np.float64)
    for i in range(RAYS):
        u = (i + 0.5) / RAYS
        phi = 2.0 * math.pi * radical_inverse(i)
        radius = math.sqrt(u)
        sample_x[i] = radius * math.cos(phi)
        sample_y[i] = radius * math.sin(phi)
        sample_n[i] = math.sqrt(1.0 - u)

    visibility = np.empty((n, n), dtype=np.float32)
    row_start = time.perf_counter()
    progress_every = max(1, n // 10)
    for iz in range(n):
        for ix in range(n):
            normal = Vector((-float(bm.gx[iz, ix]), float(bm.gz[iz, ix]), 1.0)).normalized()
            reference = Vector((1.0, 0.0, 0.0)) if abs(normal.x) < 0.9 else Vector((0.0, 1.0, 0.0))
            tangent = reference.cross(normal).normalized()
            bitangent = normal.cross(tangent)
            origin = Vector((float(bm.xs[ix]), -float(bm.zs[iz]), float(bm.H[iz, ix]))) + normal * ORIGIN_OFFSET
            total = 0.0
            for sample in range(RAYS):
                direction = (tangent * sample_x[sample] + bitangent * sample_y[sample] + normal * sample_n[sample]).normalized()
                ray_origin = origin.copy()
                remaining = MAX_DISTANCE
                transmittance = 1.0
                while remaining > RAY_EPSILON and transmittance > 0.01:
                    location, _normal, face_index, traveled = bvh.ray_cast(ray_origin, direction, remaining)
                    if location is None or face_index < 0:
                        break
                    if face_index >= len(foliage_faces) or not foliage_faces[face_index]:
                        transmittance = 0.0
                        break
                    transmittance *= LEAF_TRANSMITTANCE
                    step = traveled + RAY_EPSILON
                    remaining -= step
                    ray_origin = location + direction * RAY_EPSILON
                total += transmittance
            visibility[iz, ix] = total / RAYS
        if iz % progress_every == 0 or iz == n - 1:
            print(f'PROGRESS row={iz + 1}/{n} elapsed={time.perf_counter() - row_start:.1f}s', flush=True)

    ray_seconds = time.perf_counter() - row_start
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    write_gray_png(OUT, visibility)

    # 代表点は、区画 B01 近辺の樹冠・開けた地面と、最初の崖線から選ぶ。
    tree_names = ('maple2_', 'palm2_', 'fir2_', 'tree_broad_')
    tree_points = []
    for name, items in placed['assets'].items():
        if name.endswith('@shadow') or not name.startswith(tree_names):
            continue
        tree_points.extend((float(p[0]), float(p[2])) for p in items)
    xs = np.asarray(bm.xs, dtype=np.float32)
    zs = np.asarray(bm.zs, dtype=np.float32)
    target = np.array([0.0, 0.0], dtype=np.float32)
    if tree_points:
        tree_array = np.asarray(tree_points, dtype=np.float32)
        tree_distance = np.sqrt(((tree_array - target) ** 2).sum(axis=1))
        tree_x, tree_z = tree_array[int(tree_distance.argmin())]
        under_x, under_z = tree_x + 0.8, tree_z + 0.3
    else:
        under_x, under_z = 0.0, 0.0
    under_ix = int(np.clip(round((under_x - meta['x0']) / bm.cell), 0, n - 1))
    under_iz = int(np.clip(round((under_z - meta['z0']) / bm.cell), 0, n - 1))

    ix_grid, iz_grid = np.meshgrid(xs, zs)
    in_b01 = (np.abs(ix_grid - 0.0) <= 24.0) & (np.abs(iz_grid - 0.0) <= 24.0)
    open_mask = in_b01.copy()
    for tx, tz in tree_points:
        if abs(tx) < 40 and abs(tz) < 40:
            open_mask &= ((ix_grid - tx) ** 2 + (iz_grid - tz) ** 2) >= 5.0 ** 2
    open_ix, open_iz = np.unravel_index(np.argmax(np.where(open_mask, visibility, -1.0)), visibility.shape)

    if bm.CLIFF_LINES:
        cliff_poly = bm.CLIFF_LINES[0][0]
        cliff_x, cliff_z = cliff_poly[len(cliff_poly) // 2]
        cliff_ix = int(np.clip(round((float(cliff_x) - meta['x0']) / bm.cell), 0, n - 1))
        cliff_iz = int(np.clip(round((float(cliff_z) - meta['z0']) / bm.cell), 0, n - 1))
    else:
        cliff_ix = cliff_iz = 0

    q = np.round(np.clip(visibility, 0.0, 1.0) * 255.0).astype(np.uint8).astype(np.float32) / 255.0
    print(f'OUTPUT {OUT} {n}x{n}', flush=True)
    print(f'RAYS {RAYS} max_distance={MAX_DISTANCE:.1f}m cosine_weighted=Hammersley foliage_transmittance={LEAF_TRANSMITTANCE:.2f}', flush=True)
    print(f'DISTRIBUTION min={q.min():.3f} median={np.median(q):.3f} max={q.max():.3f}', flush=True)
    print(f'SAMPLE canopy_under x={float(xs[under_ix]):.2f} z={float(zs[under_iz]):.2f} value={q[under_iz, under_ix]:.3f}', flush=True)
    print(f'SAMPLE open_grass x={float(xs[open_ix]):.2f} z={float(zs[open_iz]):.2f} value={q[open_iz, open_ix]:.3f}', flush=True)
    print(f'SAMPLE cliff_edge x={float(xs[cliff_ix]):.2f} z={float(zs[cliff_iz]):.2f} value={q[cliff_iz, cliff_ix]:.3f}', flush=True)
    print(f'PLACED instances={placed_count} missing_assets={sorted(missing)}', flush=True)
    print(f'RAY_SECONDS {ray_seconds:.1f} TOTAL_SECONDS {time.perf_counter() - start:.1f}', flush=True)


if __name__ == '__main__':
    main()
