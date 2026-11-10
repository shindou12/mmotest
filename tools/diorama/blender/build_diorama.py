"""72×72 の箱庭、歩行 JSON、GLB と確認画像を同じ種から生成する。"""
import argparse
import json
import math
import random
import struct
import sys
from array import array
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
W = D = 72
COUNT = W * D
TILE = 256
ATLAS_W, ATLAS_H, MARGIN = 2048, 1024, 4
BEVEL, BEVEL_SEGMENTS = 0.045, 1
STAGE_IDS = ["meadow", "canyon", "snow", "volcano", "skyisles"]
NAMES = {"meadow": "草原と滝の川", "canyon": "砂漠の峡谷", "snow": "雪山と氷の川",
         "volcano": "火山と溶岩の川", "skyisles": "浮島"}
MATERIALS = {
    "meadow": ["grass", "dirt", "stone", "sand", "wood", "turf", "cloudstone"],
    "canyon": ["sand", "sandstone", "redrock", "wood", "grass"],
    "snow": ["snow", "ice", "stone", "basalt", "ash", "wood"],
    "volcano": ["basalt", "ash", "obsidian", "lava", "wood", "sulfur"],
    "skyisles": ["turf", "cloudstone", "crystal", "wood"],
}
ATLAS = {
    "grass_top": (0, 0), "grass_side": (1, 0), "dirt": (2, 0), "stone": (3, 0),
    "sand": (4, 0), "sandstone_side": (5, 0), "redrock": (6, 0), "cobble": (7, 0),
    "snow_top": (0, 1), "snow_side": (1, 1), "ice": (2, 1), "basalt": (3, 1),
    "ash": (4, 1), "lava": (5, 1), "obsidian": (6, 1), "planks": (7, 1),
    "turf_top": (0, 2), "turf_side": (1, 2), "cloudstone": (2, 2), "crystal": (3, 2),
    "bark": (4, 2), "leaves": (5, 2), "pine": (6, 2), "cactus": (7, 2),
    "mush_cap": (0, 3), "mush_stem": (1, 3), "deadwood": (2, 3), "flowers": (3, 3),
    "water": (4, 3), "pedestal": (5, 3), "rock": (6, 3), "spare": (7, 3),
}
TOP_TILE = {
    "grass": "grass_top", "dirt": "dirt", "stone": "stone", "sand": "sand",
    "sandstone": "sand", "redrock": "redrock", "snow": "snow_top", "ice": "ice",
    "basalt": "basalt", "ash": "ash", "sulfur": "ash", "lava": "lava",
    "obsidian": "obsidian", "wood": "planks", "turf": "turf_top",
    "cloudstone": "cloudstone", "crystal": "crystal",
}
NEUTRAL = [(1.00, 1.00, 1.00), (0.94, 0.97, 0.92),
           (1.06, 1.03, 0.94), (0.91, 0.94, 0.98)]
SWATCH = {tile: NEUTRAL for tile in ATLAS}
SWATCH["grass_top"] = [(0.74, 0.76, 0.68), (0.50, 0.60, 0.50),
                       (0.95, 0.88, 0.58), (0.40, 0.52, 0.42)]
SWATCH["stone"] = [(0.62, 0.60, 0.56), (0.46, 0.45, 0.44), (0.78, 0.74, 0.66)]
SWATCH["snow_top"] = [(1, 1, 1), (.94, .97, 1.00), (1.00, 1.03, 1.06), (.91, .93, 1.00)]
SWATCH["ice"] = [(1, 1, 1), (.92, .97, 1.04), (1.02, 1.04, 1.06), (.91, .94, 1.00)]
SWATCH["turf_top"] = [(1, 1, 1), (.93, .97, .93), (1.04, 1.03, .94), (.91, .94, .91)]
SWATCH["leaves"] = [(1.00, 1.00, 1.00), (1.04, 1.07, .94), (.94, 1.02, .92), (1.08, 1.04, .91)]
PURPLE_SWATCH = [(.52, .17, .49), (.66, .22, .60), (.40, .13, .42), (.58, .26, .66)]
PINK_SWATCH = [(1.0, .48, .78), (.98, .58, .86), (.92, .40, .72), (1.0, .66, .90)]


def idx(i, k):
    return k * W + i


def inside(i, k):
    return 0 <= i < W and 0 <= k < D


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def lerp(a, b, t):
    return a + (b - a) * t


def distance_to_polyline(x, z, points):
    best = math.inf
    for a, b in zip(points, points[1:]):
        vx, vz = b[0] - a[0], b[1] - a[1]
        length2 = vx * vx + vz * vz
        t = 0 if length2 == 0 else clamp(((x - a[0]) * vx + (z - a[1]) * vz) / length2, 0, 1)
        best = min(best, math.hypot(x - (a[0] + vx * t), z - (a[1] + vz * t)))
    return best


def hash_noise(x, z, seed):
    n = (int(x) * 374761393 + int(z) * 668265263 + int(seed) * 1442695041) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    n ^= n >> 16
    return n / 2147483647.5 - 1.0


def value_noise(x, z, spacing, seed):
    px, pz = x / spacing, z / spacing
    ix, iz = math.floor(px), math.floor(pz)
    tx, tz = px - ix, pz - iz
    tx, tz = tx * tx * (3 - 2 * tx), tz * tz * (3 - 2 * tz)
    a = lerp(hash_noise(ix, iz, seed), hash_noise(ix + 1, iz, seed), tx)
    b = lerp(hash_noise(ix, iz + 1, seed), hash_noise(ix + 1, iz + 1, seed), tx)
    return lerp(a, b, tz)


def new_stage(config, seed):
    sid = config["id"]
    return {
        "id": sid, "name": NAMES[sid], "seed": seed, "heights": [-1] * COUNT,
        "surface_names": [MATERIALS[sid][0]] * COUNT, "materials": MATERIALS[sid][:],
        "blocked": [0] * COUNT, "liquid": [0] * COUNT, "spawn": [36, 36],
        "water_level": 4.0, "light": config["light"], "ambience": config["ambience"],
        "particles": config["particles"], "params": config.get("params", {}),
        "props": [], "glow": [], "water": [], "water_shades": {}, "tree_colors": {},
        "lava": [], "falls": [], "bridges": set(), "tints": {}, "flow": {},
        "island_bottoms": {}, "bridge_cells": set(), "ramp_cells": set(),
        "counts": {"trees": 0, "conifers": 0, "small_props": 0, "landmarks": 0,
                   "ramps": 0, "bridges": 0},
    }


def set_cell(s, i, k, h, material=None, liquid=None):
    if not inside(i, k):
        return
    n = idx(i, k)
    s["heights"][n] = int(clamp(round(h), 0, 28))
    if material is not None:
        s["surface_names"][n] = material
    if liquid is not None:
        s["liquid"][n] = liquid


def add_box(boxes, i, k, ground, tile, size, offset=(0, 0, 0), rotation=0.0, color=None):
    box = {"center": (i + .5 + offset[0], -(k + .5) + offset[1], ground + offset[2]),
           "size": tuple(size), "tile": tile, "rotation": rotation}
    if color is not None:
        box["color"] = tuple(color)
    boxes.append(box)


def voxel(boxes, i, k, ground, dx, dk, level, tile, size=.88, zsize=None, rotation=0.0, color=None):
    sz = size if zsize is None else zsize
    add_box(boxes, i, k, ground, tile, (size, size, sz),
            (dx, -dk, level + sz * .5), rotation, color)


def face(verts, tile, group=None, color=None):
    result = {"verts": [tuple(v) for v in verts], "tile": tile}
    if group is not None:
        result["group"] = group
    if color is not None:
        result["color"] = tuple(color)
    return result


def box_faces(box, group=None):
    cx, cy, cz = box["center"]
    sx, sy, sz = box["size"]
    c, s = math.cos(box.get("rotation", 0)), math.sin(box.get("rotation", 0))
    points = []
    for x, y, z in ((-.5, -.5, -.5), (.5, -.5, -.5), (.5, .5, -.5), (-.5, .5, -.5),
                    (-.5, -.5, .5), (.5, -.5, .5), (.5, .5, .5), (-.5, .5, .5)):
        x, y, z = x * sx, y * sy, z * sz
        points.append((cx + x * c - y * s, cy + x * s + y * c, cz + z))
    orders = ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
              (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5))
    return [face([points[n] for n in order], box["tile"], group, box.get("color")) for order in orders]


def face_grid_key(spec):
    points = spec["verts"]
    spans = [max(p[a] for p in points) - min(p[a] for p in points) for a in range(3)]
    axis = next((a for a, span in enumerate(spans) if span < 1e-5), None)
    if axis is None:
        return None
    u_axis, v_axis = ((1, 2), (0, 2), (0, 1))[axis]
    if abs(spans[u_axis] - 1) > 1e-5 or abs(spans[v_axis] - 1) > 1e-5:
        return None
    a, b, c = points[0], points[1], points[2]
    ab = [b[n] - a[n] for n in range(3)]
    ac = [c[n] - a[n] for n in range(3)]
    normal = (ab[1] * ac[2] - ab[2] * ac[1],
              ab[2] * ac[0] - ab[0] * ac[2],
              ab[0] * ac[1] - ab[1] * ac[0])
    sign = 1 if normal[axis] > 0 else -1
    color = spec.get("color")
    color_key = tuple(round(float(v), 5) for v in color) if color is not None else None
    plane = round(sum(p[axis] for p in points) / len(points), 5)
    u0 = int(round(min(p[u_axis] for p in points)))
    v0 = int(round(min(p[v_axis] for p in points)))
    return (axis, sign, plane, spec["tile"], color_key), (u_axis, v_axis, u0, v0)


def face_from_grid_rect(key, axes, u0, u1, v0, v1):
    axis, sign, plane, tile, color_key = key
    u_axis, v_axis = axes
    def point(u, v):
        coords = [0.0, 0.0, 0.0]
        coords[axis], coords[u_axis], coords[v_axis] = plane, u, v
        return tuple(coords)
    corners = [point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1)]
    base_sign = (1, -1, 1)[axis]
    if sign != base_sign:
        corners = [corners[0], corners[3], corners[2], corners[1]]
    color = tuple(color_key) if color_key is not None else None
    return face(corners, tile, color=color)


def merge_unit_faces(specs):
    masks, other = {}, []
    for spec in specs:
        parsed = face_grid_key(spec)
        if parsed is None:
            other.append(spec)
            continue
        key, cell = parsed
        axes = (cell[0], cell[1])
        u0, v0 = cell[2], cell[3]
        masks.setdefault(key, {"axes": axes, "cells": {}})["cells"][(u0, v0)] = spec
    merged = list(other)
    for key, entry in sorted(masks.items(), key=lambda item: repr(item[0])):
        cells = set(entry["cells"])
        axes = entry["axes"]
        while cells:
            u0, v0 = min(cells, key=lambda p: (p[1], p[0]))
            u1 = u0 + 1
            while (u1, v0) in cells:
                u1 += 1
            v1 = v0 + 1
            while all((u, v1) in cells for u in range(u0, u1)):
                v1 += 1
            merged.append(face_from_grid_rect(key, axes, u0, u1, v0, v1))
            for v in range(v0, v1):
                for u in range(u0, u1):
                    cells.remove((u, v))
    return merged


def box_face_specs(boxes):
    unit = {}
    is_unit = []
    for box in boxes:
        cx, cy, cz = box["center"]
        sx, sy, sz = box["size"]
        aligned = (abs(sx - 1) < 1e-5 and abs(sy - 1) < 1e-5 and abs(sz - 1) < 1e-5
                   and abs(box.get("rotation", 0)) < 1e-5)
        if aligned:
            cell = (round(cx - .5), round(-cy - .5), round(cz - .5))
            unit.setdefault(cell, []).append(box)
        is_unit.append(aligned)
    occupied = set(unit)
    directions = ((2, -1), (2, 1), (1, -1), (1, 1), (0, -1), (0, 1))
    specs = []
    for box, aligned in zip(boxes, is_unit):
        faces = box_faces(box)
        if not aligned:
            specs.extend(faces)
            continue
        cx, cy, cz = box["center"]
        cell = [round(cx - .5), round(-cy - .5), round(cz - .5)]
        for spec, (axis, sign) in zip(faces, directions):
            neighbor = cell[:]
            neighbor[axis] += sign
            if tuple(neighbor) not in occupied:
                specs.append(spec)
    return merge_unit_faces(specs)


def top_face(faces, i, k, z, tile, color=None):
    faces.append(face([(i, -k - 1, z), (i + 1, -k - 1, z),
                       (i + 1, -k, z), (i, -k, z)], tile, color=color))


def side_faces(faces, i, k, low, high, direction, tile_for_row):
    for row in range(int(low), int(high)):
        z0, z1 = row, row + 1
        if direction == "east":
            verts = [(i + 1, -k - 1, z0), (i + 1, -k, z0), (i + 1, -k, z1), (i + 1, -k - 1, z1)]
        elif direction == "west":
            verts = [(i, -k, z0), (i, -k - 1, z0), (i, -k - 1, z1), (i, -k, z1)]
        elif direction == "south":
            verts = [(i, -k - 1, z0), (i + 1, -k - 1, z0), (i + 1, -k - 1, z1), (i, -k - 1, z1)]
        else:
            verts = [(i + 1, -k, z0), (i, -k, z0), (i, -k, z1), (i + 1, -k, z1)]
        tile, color = tile_for_row(row)
        faces.append(face(verts, tile, color=color))


def side_center(i, k, row, direction):
    if direction == "east":
        return (i + 1, -k - .5, row + .5)
    if direction == "west":
        return (i, -k - .5, row + .5)
    if direction == "south":
        return (i + .5, -k - 1, row + .5)
    return (i + .5, -k, row + .5)


def add_fall(s, center_x, y, low, high, tile, width=7, axis="y"):
    a, b = center_x - width / 2, center_x + width / 2
    if axis == "y":
        verts = [(a, y, low), (b, y, low), (b, y, high), (a, y, high)]
    else:
        verts = [(center_x, y - width / 2, low), (center_x, y + width / 2, low),
                 (center_x, y + width / 2, high), (center_x, y - width / 2, high)]
    s["falls"].append(face(verts, tile))


def boundaries(count, seed):
    values = []
    for n in range(1, count):
        base = round(D * n / count)
        values.append([clamp(base + round(value_noise(i, n * 13, 12, seed) * 1.2), 1, D - 1)
                       for i in range(W)])
    return values


def band_at(i, k, edges):
    return sum(k >= edge[i] for edge in edges)


def terraces(s, seed, levels, material):
    edges = boundaries(len(levels), seed)
    for k in range(D):
        for i in range(W):
            band = band_at(i, k, edges)
            set_cell(s, i, k, levels[band], material)
    for band, edge in enumerate(edges):
        drop = levels[band] - levels[band + 1]
        for x in (12,):
            for i in (x,):
                b = edge[i]
                start, end = b - 2, b + drop + 2
                for k in range(max(0, start), min(D, end + 1)):
                    t = clamp((k - start) / max(1, end - start), 0, 1)
                    set_cell(s, i, k, round(lerp(levels[band], levels[band + 1], t)), material)
                    s["ramp_cells"].add((i, k))
            s["counts"]["ramps"] += 1
    return edges


def smooth_small_relief(s, iterations=2):
    for _ in range(iterations):
        source = s["heights"][:]
        changed = source[:]
        for k in range(1, D - 1):
            for i in range(1, W - 1):
                n = idx(i, k)
                if source[n] < 0 or s["liquid"][n] or (i, k) in s["bridges"] or (i, k) in s["ramp_cells"]:
                    continue
                nearby = [source[idx(i + di, k + dk)] for dk in (-1, 0, 1) for di in (-1, 0, 1)
                          if (di or dk) and source[idx(i + di, k + dk)] >= 0]
                if len(nearby) < 5 or max(nearby) - min(nearby) > 2:
                    continue
                median = sorted(nearby)[len(nearby) // 2]
                if abs(source[n] - median) == 1 and sum(value == median for value in nearby) >= 5:
                    changed[n] = median
        s["heights"] = changed


def changed_neighbor_ratio(s):
    land, changed = 0, 0
    for k in range(D):
        for i in range(W):
            h = s["heights"][idx(i, k)]
            if h < 0 or s["liquid"][idx(i, k)]:
                continue
            land += 1
            if any(inside(i + di, k + dk)
                   and s["heights"][idx(i + di, k + dk)] >= 0
                   and not s["liquid"][idx(i + di, k + dk)]
                   and s["heights"][idx(i + di, k + dk)] != h
                   for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                changed += 1
    return 0 if not land else changed / land * 100


def river_center(k, seed, center=36, amplitude=5.6, phase=0):
    return center + amplitude * math.sin(k * .105 + phase) + 1.2 * value_noise(k, phase * 10, 7, seed + 211)


def carve_flow(s, seed, kind, center_fn, width=7, material="sand", k_start=0, k_end=71):
    for k in range(k_start, k_end + 1):
        cx = center_fn(k)
        s["flow"][k] = cx
        for i in range(round(cx) - width // 2, round(cx) + width // 2 + 1):
            if not inside(i, k):
                continue
            old = s["heights"][idx(i, k)]
            if old < 0:
                continue
            set_cell(s, i, k, max(0, old - 1), "lava" if kind == 2 else "ice" if kind == 3 else material, kind)
            s["water_shades"][idx(i, k)] = .60 if abs(i - round(cx)) <= 1 else .92


def carve_path_flow(s, points, kind, material, width=3):
    path = []
    for (x0, k0), (x1, k1) in zip(points, points[1:]):
        steps = max(abs(x1 - x0), abs(k1 - k0))
        for n in range(steps + 1):
            p = (round(lerp(x0, x1, n / max(1, steps))), round(lerp(k0, k1, n / max(1, steps))))
            if not path or p != path[-1]:
                path.append(p)
    previous = None
    for i, k in path:
        if not inside(i, k):
            continue
        for dx in range(-(width // 2), width // 2 + 1):
            x = i + dx
            if not inside(x, k):
                continue
            n = idx(x, k)
            old = s["heights"][n]
            if old < 0:
                continue
            floor = max(0, old - 1)
            if previous is not None:
                floor = min(floor, previous)
            set_cell(s, x, k, floor, material, kind)
        previous = min(s["heights"][idx(x, k)] for x in range(i - width // 2, i + width // 2 + 1)
                       if inside(x, k) and s["liquid"][idx(x, k)] == kind)


def river_islands(s, seed, ks=(24, 47)):
    for n, k in enumerate(ks):
        c = int(round(s["flow"].get(k, 36)))
        for di, dk in ((0, 0), (-1 if n % 2 == 0 else 1, 0), (0, 1)):
            i, kk = c + di, k + dk
            if inside(i, kk):
                cell = idx(i, kk)
                if s["liquid"][cell] in (1, 3):
                    set_cell(s, i, kk, s["heights"][cell] + 1, "stone", 0)


def path_center(points, k):
    for (x0, k0), (x1, k1) in zip(points, points[1:]):
        if min(k0, k1) <= k <= max(k0, k1):
            t = (k - k0) / max(1, k1 - k0)
            return lerp(x0, x1, t)
    return points[0][0] if k < points[0][1] else points[-1][0]


def river_bridges(s, center_fn, ks, width=7, surface="wood", tile="planks"):
    half = width // 2
    for k in ks:
        c = int(round(center_fn(k)))
        left, right = c - half - 1, c + half + 1
        if not inside(left, k) or not inside(right, k):
            continue
        h = max(s["heights"][idx(left, k)], s["heights"][idx(right, k)])
        for i in range(c - half, c + half + 1):
            set_cell(s, i, k, h, surface, 0)
            s["bridges"].add((i, k))
            add_box(s["props"], i, k, h, tile, (.94, .94, .16), (0, 0, -.08))
        s["counts"]["bridges"] += 1


def spawn_pad(s, i, k, material):
    i, k = int(clamp(i, 4, W - 5)), int(clamp(k, 4, D - 5))
    def clear_pad(x, z):
        for dk in range(-2, 3):
            for di in range(-2, 3):
                n = idx(x + di, z + dk)
                if (s["heights"][n] < 0 or s["liquid"][n] != 0 or s["blocked"][n]
                        or (x + di, z + dk) in s["bridges"]):
                    return False
        return True

    if not clear_pad(i, k):
        candidates = [(x, z) for z in range(4, D - 4) for x in range(4, W - 4) if clear_pad(x, z)]
        if not candidates:
            raise RuntimeError("{} に5x5のspawn空地を作れません".format(s["id"]))
        i, k = min(candidates, key=lambda p: ((p[0] - i) ** 2 + (p[1] - k) ** 2,
                                               -cliff_score(s, *p)))
    h = s["heights"][idx(i, k)]
    for dk in range(-2, 3):
        for di in range(-2, 3):
            set_cell(s, i + di, k + dk, h, material, 0)
    s["spawn"] = [i, k]


def meadow(s, seed):
    # 棚の形はノイズの等高線で決める（まっすぐな帯にしない）。奥（k が小さい側）が高い。
    def shelf(i, k):
        base = 26.5 - .31 * k + 6.0 * value_noise(i, k, 24, seed + 31) + 2.8 * value_noise(i, k, 10, seed + 37)
        t = base / 6.0
        level = math.floor(t)
        return int(clamp(level * 6 + (1 if t - level > .72 else 0), 3, 27))
    for k in range(D):
        for i in range(W):
            set_cell(s, i, k, shelf(i, k), "grass")
    smooth_small_relief(s, 3)
    width = int(s["params"].get("riverWidth", 8))
    center = lambda k: river_center(k, seed, 37, 6.2, .4)
    # 川は幅いっぱい同じ高さで、手前へ下がるだけ（段の所が滝になる）
    level = None
    for k in range(D):
        cx = int(round(center(k)))
        s["flow"][k] = center(k)
        cells = [i for i in range(cx - width // 2, cx + width // 2 + 1) if inside(i, k)]
        row = min(s["heights"][idx(i, k)] for i in cells)
        level = row if level is None else min(level, row)
        for i in cells:
            edge = min(i - cells[0], cells[-1] - i)
            set_cell(s, i, k, max(1, level - 1), "sand", 1)
            s["water_shades"][idx(i, k)] = .55 if edge >= 3 else .74 if edge == 2 else .95
        # 岸: 川より低い所を川の高さまで上げ、川へ落ち込む 1 段の砂の縁を作る
        for i in (cells[0] - 1, cells[-1] + 1):
            if inside(i, k) and s["heights"][idx(i, k)] <= level:
                set_cell(s, i, k, level, "sand")
    river_islands(s, seed)
    river_bridges(s, center, (10, 34, 60), width)
    s["water_level"] = 4.0
    patches = ((18, 33, 8.5), (55, 18, 9.5))
    s["purple_patches"] = patches
    for patch_index, (cx, ck, radius) in enumerate(patches):
        for k in range(max(0, int(ck - radius - 2)), min(D, int(ck + radius + 3))):
            for i in range(max(0, int(cx - radius - 2)), min(W, int(cx + radius + 3))):
                if math.hypot(i + .5 - cx, k + .5 - ck) + value_noise(i, k, 5, seed + 571 + patch_index) * .7 < radius:
                    n = idx(i, k)
                    if s["liquid"][n] == 0:
                        set_cell(s, i, k, s["heights"][n], "cloudstone", 0)
                        s["tints"][n] = "purple"
    spawn_pad(s, int(round(center(54) + 8)), 54, "grass")
    return center, None


def canyon(s, seed):
    center = lambda k: 36 + 9.0 * math.sin((k - 38) * .078) + 1.4 * value_noise(k, 5, 6, seed + 611)
    s["canyon_center"] = center
    floor_range = s["params"].get("valleyFloor", [4, 8])
    floor_height = round(sum(floor_range) / 2)
    floor_half = sum(s["params"].get("canyonWidth", [4, 6])) / 4
    for k in range(D):
        for i in range(W):
            d = abs(i + .5 - center(k))
            if d < floor_half:
                h, mat = floor_height, "sand"
            elif d < floor_half + 4:
                h, mat = floor_height + 3, "sandstone"
            elif d < floor_half + 10:
                h, mat = floor_height + 7, "sandstone"
            elif d < floor_half + 17:
                h, mat = floor_height + 12, "redrock"
            elif d < floor_half + 24:
                h, mat = floor_height + 17, "redrock"
            else:
                h, mat = 26, "sand"
            set_cell(s, i, k, h, mat)
    red_islands = ((15, 16, 6), (57, 18, 7), (16, 53, 7), (57, 53, 6))
    for cx, ck, radius in red_islands:
        for k in range(max(0, ck - radius - 1), min(D, ck + radius + 2)):
            for i in range(max(0, cx - radius - 1), min(W, cx + radius + 2)):
                n = idx(i, k)
                d = math.hypot(i + .5 - cx, k + .5 - ck)
                if d < radius and s["heights"][n] >= floor_height + 14:
                    set_cell(s, i, k, s["heights"][n], "redrock", 0)
    branches = [((0, 13), (12, 17), (23, 23), (round(center(29)), 29)),
                ((71, 57), (59, 53), (49, 47), (round(center(42)), 42))]
    for k in range(D):
        for i in range(W):
            distance = min(distance_to_polyline(i + .5, k + .5, branch) for branch in branches)
            n = idx(i, k)
            old = s["heights"][n]
            if distance < 2.5:
                set_cell(s, i, k, min(old, floor_height + 1), "sand")
            elif distance < 5.5:
                set_cell(s, i, k, min(old, floor_height + 5), "sandstone")
            elif distance < 8.5:
                set_cell(s, i, k, min(old, floor_height + 11), "redrock")
    for station in (10, 20, 30, 41, 52, 62):
        c = center(station)
        for side in (-1, 1):
            for step in range(15):
                x = round(c + side * (floor_half + step))
                h = min(25, floor_height + step)
                for dk in (-1, 0, 1):
                    set_cell(s, x, station + dk, h, "sandstone")
            s["counts"]["ramps"] += 1
    oasis = s["params"].get("oasisCenter", [round(center(38)), 38])
    radii = s["params"].get("oasisRadii", [4.0, 3.5])
    ox, ok = oasis
    for k in range(max(0, int(ok - radii[1] - 1)), min(D, int(ok + radii[1] + 2))):
        for i in range(max(0, int(ox - radii[0] - 1)), min(W, int(ox + radii[0] + 2))):
            d = ((i + .5 - ox) / radii[0]) ** 2 + ((k + .5 - ok) / radii[1]) ** 2
            if d + value_noise(i, k, 3.2, seed + 631) * .12 < 1:
                set_cell(s, i, k, max(0, floor_height - 1), "sand", 1)
    for k in range(33, 52):
        for i in range(18, 39):
            if inside(i, k) and math.hypot(i + .5 - 28, k + .5 - 42) + value_noise(i, k, 3.6, seed + 641) * 1.5 < 8:
                n = idx(i, k)
                if s["liquid"][n] == 0 and abs(i + .5 - center(k)) > floor_half + 1:
                    set_cell(s, i, k, s["heights"][n], "grass", 0)
    s["water_level"] = floor_height - .9
    spawn_pad(s, int(round(center(56) + 10)), 56, "sandstone")
    return center, None


def snow(s, seed):
    levels = [16, 13, 10, 7, 5, 3]
    edges = terraces(s, seed + 701, levels, "snow")
    center = lambda k: river_center(k, seed, 36, 4.2, .2)
    peaks = s["params"].get("peaks", [[20, 18, 28, .82], [43, 19, 22, .72], [51, 39, 18, .62]])
    for k in range(D):
        for i in range(W):
            h = s["heights"][idx(i, k)]
            for px, pk, top, slope in peaks:
                d = math.hypot(i + .5 - px, k + .5 - pk)
                h = max(h, round(top - d * slope))
            set_cell(s, i, k, clamp(h, 3, 28), "snow")
    points = ((20, 18), (31, 22), (43, 19), (47, 30), (51, 39))
    path = []
    for (x0, k0), (x1, k1) in zip(points, points[1:]):
        steps = max(abs(x1 - x0), abs(k1 - k0))
        for n in range(steps + 1):
            p = (round(lerp(x0, x1, n / max(1, steps))), round(lerp(k0, k1, n / max(1, steps))))
            if not path or p != path[-1]:
                path.append(p)
    for n, (i, k) in enumerate(path):
        h = round(28 - 10 * n / max(1, len(path) - 1))
        for di in (-1, 0, 1):
            for dk in (-1, 0, 1):
                if inside(i + di, k + dk):
                    old = s["heights"][idx(i + di, k + dk)]
                    set_cell(s, i + di, k + dk, max(old, h), "snow")
    lake_center = s["params"].get("lakeCenter", [52, 56])
    lake_radii = s["params"].get("lakeRadii", [13.0, 9.0])
    lx, lk = lake_center
    for k in range(max(0, int(lk - lake_radii[1] - 1)), min(D, int(lk + lake_radii[1] + 2))):
        for i in range(max(0, int(lx - lake_radii[0] - 1)), min(W, int(lx + lake_radii[0] + 2))):
            d = ((i + .5 - lx) / lake_radii[0]) ** 2 + ((k + .5 - lk) / lake_radii[1]) ** 2
            if d + value_noise(i, k, 4, seed + 719) * .08 < 1:
                set_cell(s, i, k, 3, "ice", 3)
    wall_k, fx = 46, int(round(lx))
    for i in range(fx - 5, fx + 6):
        set_cell(s, i, wall_k - 1, 15, "stone", 0)
    for k in range(wall_k - 4, wall_k - 1):
        for i in range(fx - 3, fx + 4):
            set_cell(s, i, k, 15, "ice", 3)
    for i in range(fx - 3, fx + 4):
        set_cell(s, i, wall_k, 3, "ice", 3)
    add_fall(s, fx + .5, -float(wall_k), 3.0, 15.035, "ice", 7)
    glacier_points = [(int(round(center(k))), k) for k in (0, 8, 16, 24, 32, 40)]
    glacier_points.extend([(int(round(lerp(center(40), lx, .5))), 48), (int(round(lx)), int(lk))])
    carve_path_flow(s, glacier_points, 3, "ice", 7)
    glacier_center = lambda k: path_center(glacier_points, k)
    river_bridges(s, glacier_center, (12, 30, 44), 7, "ice", "ice")
    hx, hk = 55, 47
    for k in range(hk - 7, hk + 8):
        for i in range(hx - 7, hx + 8):
            if inside(i, k) and math.hypot(i + .5 - hx, k + .5 - hk) + value_noise(i, k, 3, seed + 727) * 1.6 < 7:
                n = idx(i, k)
                if s["liquid"][n] == 0:
                    set_cell(s, i, k, s["heights"][n], "basalt" if (i + k) % 3 else "ash", 0)
    for k in range(hk - 3, hk + 4):
        for i in range(hx - 3, hx + 4):
            if inside(i, k) and math.hypot(i + .5 - hx, k + .5 - hk) < 3:
                set_cell(s, i, k, 5, "ice", 1)
    s["water_level"] = 3.05
    spawn_pad(s, int(round(center(54) + 7)), 54, "snow")
    return center, edges


def volcano(s, seed):
    levels = [27, 23, 19, 15, 11, 6]
    edges = terraces(s, seed + 811, levels, "basalt")
    crater = s["params"].get("center", [40, 31])
    cx, ck = crater
    radius = float(s["params"].get("craterRadius", 7.5))
    for k in range(D):
        for i in range(W):
            d = math.hypot(i + .5 - cx, k + .5 - ck)
            n = idx(i, k)
            rim = d + value_noise(i, k, 2.3, seed + 821) * 1.15
            if rim < radius * .55:
                set_cell(s, i, k, 18, "lava", 2)
            elif rim < radius:
                set_cell(s, i, k, 26 + int(value_noise(i, k, 2.1, seed + 823) > 0), "basalt", 0)
            elif d < radius + 4.5:
                set_cell(s, i, k, max(s["heights"][n], 21), "ash" if int(d) % 2 else "basalt", 0)
            elif value_noise(i, k, 8, seed + 825) > .34:
                set_cell(s, i, k, s["heights"][n], "ash", 0)
    paths = [
        [(cx, ck + 3), (cx + 2, ck + 12), (cx - 2, 48), (cx + 2, 57), (cx - 1, 66), (cx, 71)],
        [(cx - 2, ck + 3), (cx - 8, ck + 10), (31, 44), (22, 53), (14, 63), (6, 71)],
        [(cx + 2, ck + 3), (cx + 8, ck + 10), (51, 44), (59, 53), (65, 63), (70, 71)],
    ]
    for path in paths:
        carve_path_flow(s, path, 2, "lava", 3)
    bridge_k, bridge_half = 48, 1
    bridge_c = int(round(path_center(paths[0], bridge_k)))
    left_h = s["heights"][idx(bridge_c - bridge_half - 1, bridge_k)]
    right_h = s["heights"][idx(bridge_c + bridge_half + 1, bridge_k)]
    for offset, i in enumerate(range(bridge_c - bridge_half, bridge_c + bridge_half + 1)):
        h = round(lerp(left_h, right_h, (offset + 1) / (bridge_half * 2 + 2)))
        set_cell(s, i, bridge_k, h, "obsidian", 0)
        s["bridges"].add((i, bridge_k))
        add_box(s["props"], i, bridge_k, h, "obsidian", (.94, .94, .16), (0, 0, -.08))
    s["counts"]["bridges"] += 1
    for k in range(37, 56):
        for i in range(9, 28):
            if inside(i, k) and math.hypot(i + .5 - 18, k + .5 - 46) + value_noise(i, k, 3.4, seed + 829) * 1.7 < 9:
                n = idx(i, k)
                if s["liquid"][n] == 0:
                    set_cell(s, i, k, s["heights"][n], "sulfur", 0)
                    s["tints"][n] = "sulfur"
    s["water_level"] = 18.05
    spawn = s["params"].get("spawn", [10, 61])
    spawn_pad(s, spawn[0], spawn[1], "basalt")
    return None, edges


def skyisles(s, seed):
    configured = s["params"].get("islands", [[35, 36, 13, 18], [12, 12, 5, 8], [59, 11, 4.5, 13],
                                                [11, 48, 5.2, 11], [60, 47, 5.5, 21], [20, 63, 4, 6], [51, 63, 5, 15]])
    depth_range = s["params"].get("undersideDepth", [6, 14])
    rng = random.Random(seed + 907)
    islands = [(int(x), int(k), float(r), int(base), rng.randint(int(depth_range[0]), int(depth_range[1])))
               for x, k, r, base in configured]
    s["islands"] = islands
    for number, (cx, ck, radius, base, depth) in enumerate(islands):
        for k in range(max(0, int(ck - radius - 2)), min(D, int(ck + radius + 3))):
            for i in range(max(0, int(cx - radius - 2)), min(W, int(cx + radius + 3))):
                d = math.hypot(i + .5 - cx, k + .5 - ck)
                edge_noise = value_noise(i, k, 3.0, seed + 921 + number) * .45
                edge_distance = d + edge_noise
                if edge_distance > radius:
                    continue
                rough = value_noise(i, k, 10, seed + 925 + number)
                h = base + (2 if d < radius * .36 else 1 if d < radius * .70 else 0)
                h += 1 if rough > .22 else -1 if rough < -.22 else 0
                h = max(base, h)
                set_cell(s, i, k, h, "turf", 0)
                cone_depth = max(1, min(depth, math.ceil((radius - d) / radius * depth)))
                s["island_bottoms"][idx(i, k)] = base - cone_depth
    s["purple_patches"] = ((40, 34, 5.5),)
    for cx, ck, radius in s["purple_patches"]:
        for k in range(max(0, int(ck - radius - 1)), min(D, int(ck + radius + 2))):
            for i in range(max(0, int(cx - radius - 1)), min(W, int(cx + radius + 2))):
                n = idx(i, k)
                if s["heights"][n] >= 0 and math.hypot(i + .5 - cx, k + .5 - ck) < radius:
                    s["tints"][n] = "purple"
    joined = {0}
    while len(joined) < len(islands):
        best = None
        for a in sorted(joined):
            for b in range(len(islands)):
                if b in joined:
                    continue
                d = math.hypot(islands[a][0] - islands[b][0], islands[a][1] - islands[b][1])
                if best is None or d < best[0]:
                    best = (d, a, b)
        _, a, b = best
        joined.add(b)
        ax, ak, ar, ah, _ = islands[a]
        bx, bk, br, bh, _ = islands[b]
        dx, dk = bx - ax, bk - ak
        length = max(1, math.hypot(dx, dk))
        inset_a = max(2, min(4, round(ar * .45)))
        inset_b = max(2, min(4, round(br * .45)))
        start = (round(ax + dx / length * (ar - inset_a)), round(ak + dk / length * (ar - inset_a)))
        end = (round(bx - dx / length * (br - inset_b)), round(bk - dk / length * (br - inset_b)))
        steps = max(abs(end[0] - start[0]), abs(end[1] - start[1]))
        previous = None
        for n in range(steps + 1):
            t = n / max(1, steps)
            i, k = round(lerp(start[0], end[0], t)), round(lerp(start[1], end[1], t))
            cells = {(i, k)}
            if previous and i != previous[0] and k != previous[1]:
                cells.add((i, previous[1]))
                cells.add((previous[0], k))
            h = round(lerp(ah, bh, t))
            for cell_i, cell_k in sorted(cells):
                if inside(cell_i, cell_k):
                    if s["heights"][idx(cell_i, cell_k)] < 0:
                        s["bridge_cells"].add(idx(cell_i, cell_k))
                    set_cell(s, cell_i, cell_k, h, "wood", 0)
                    s["bridges"].add((cell_i, cell_k))
                    add_box(s["props"], cell_i, cell_k, h, "planks", (.94, .94, .16), (0, 0, -.08))
            previous = (i, k)
        s["counts"]["bridges"] += 1
    cx, ck, radius, base, _ = islands[0]
    for k in range(ck - 2, ck + 4):
        for i in range(cx - 1, int(cx + radius * .72) + 1):
            if inside(i, k) and s["heights"][idx(i, k)] >= 0:
                set_cell(s, i, k, s["heights"][idx(i, k)], "turf", 1)
    add_fall(s, cx + radius - .5, -(ck + .5), base - 13, base + 1, "water", 7)
    for cx, ck, radius, base, _ in islands:
        for angle in (.3, 2.5):
            end = (round(cx), round(ck))
            start = (round(cx + math.cos(angle) * (radius - 1)), round(ck + math.sin(angle) * (radius - 1)))
            steps = max(abs(end[0] - start[0]), abs(end[1] - start[1]))
            for n in range(steps + 1):
                t = n / max(1, steps)
                i, k = round(lerp(start[0], end[0], t)), round(lerp(start[1], end[1], t))
                h = round(lerp(base, base + 2, t))
                for di in (0, 1):
                    if inside(i + di, k) and s["heights"][idx(i + di, k)] >= 0:
                        set_cell(s, i + di, k, min(s["heights"][idx(i + di, k)], h), "turf", 0)
            s["counts"]["ramps"] += 1
    spawn_pad(s, 36, 40, "turf")
    s["water_level"] = islands[0][3] + 1.2


def filled(s, i, k, row):
    return inside(i, k) and s["heights"][idx(i, k)] > row + .001


def ao_factor(side1, side2, corner):
    level = 0 if side1 and side2 else 3 - int(side1) - int(side2) - int(corner)
    return .5 + level / 6.0


def terrain_ao(s, cell, vertex, normal, top):
    i, k = cell
    if top:
        h = s["heights"][idx(i, k)]
        sx = 1 if vertex.x >= i + .5 else -1
        sk = 1 if -vertex.y >= k + .5 else -1
        return ao_factor(filled(s, i + sx, k, h), filled(s, i, k + sk, h), filled(s, i + sx, k + sk, h))
    row = math.floor(vertex.z + .001)
    if abs(normal.x) >= abs(normal.y):
        sk = 1 if -vertex.y >= k + .5 else -1
        return ao_factor(filled(s, i, k + sk, row), filled(s, i, k, row + 1), filled(s, i, k + sk, row + 1))
    si = 1 if vertex.x >= i + .5 else -1
    return ao_factor(filled(s, i + si, k, row), filled(s, i, k, row + 1), filled(s, i + si, k, row + 1))


def voxel_occupancy(boxes):
    result = set()
    for box in boxes:
        cx, cy, cz = box["center"]
        sx, sy, sz = box["size"]
        if sx < .62 or sy < .62 or sz < .52:
            continue
        result.add((round(cx - .5), round(-cy - .5), math.floor(cz - sz * .5 + .001)))
    return result


def prop_ao(occupancy, center, vertex, normal):
    x, y, z = center
    i, k, base = round(x - .5), round(-y - .5), math.floor(z)
    if abs(normal.z) > .62:
        sx = 1 if vertex.x >= i + .5 else -1
        sk = 1 if -vertex.y >= k + .5 else -1
        return ao_factor((i + sx, k, base) in occupancy, (i, k + sk, base) in occupancy,
                         (i + sx, k + sk, base) in occupancy)
    if abs(normal.x) >= abs(normal.y):
        sk = 1 if -vertex.y >= k + .5 else -1
        return ao_factor((i, k + sk, base) in occupancy, (i, k, base + 1) in occupancy,
                         (i, k + sk, base + 1) in occupancy)
    sx = 1 if vertex.x >= i + .5 else -1
    return ao_factor((i + sx, k, base) in occupancy, (i, k, base + 1) in occupancy,
                     (i + sx, k, base + 1) in occupancy)


def palette_id(tile, x, y, z, seed, side, normal):
    if side:
        if tile == "stone":
            return (math.floor(z) + seed) % 3
        u = -y if abs(normal.x) > abs(normal.y) else x
        field = value_noise(u, z, 2.7, seed + 401) * .76 + hash_noise(round(u), math.floor(z), seed + 433) * .24
        return int(clamp(math.floor((field + 1) * 1.5), 0, 2))
    field = value_noise(x, y, 3.2, seed + 503) * .68 + hash_noise(round(x), round(y), seed + 541) * .32
    return int(clamp(math.floor((field + 1) * 2), 0, 3))


def terrain_color(s, tile, center, seed, side=False, cell=None, dark_side=False):
    x, y, z = center
    if cell is None:
        cell = (int(clamp(math.floor(x), 0, W - 1)), int(clamp(math.floor(-y), 0, D - 1)))
    normal = Vector((0, 0, -1 if side else 1))
    variant = palette_id(tile, x, y, z, seed, side, normal)
    tint = s.get("tints", {}).get(idx(*cell))
    if tint == "purple" and tile in ("turf_top", "turf_side", "cloudstone"):
        rgb = PURPLE_SWATCH[variant % len(PURPLE_SWATCH)]
    elif tint == "pink":
        rgb = PINK_SWATCH[variant % len(PINK_SWATCH)]
    else:
        rgb = SWATCH.get(tile, NEUTRAL)[variant % len(SWATCH.get(tile, NEUTRAL))]
    if tint == "sulfur" and tile in ("ash", "basalt"):
        rgb = (rgb[0] * 1.04, rgb[1] * 1.02, rgb[2] * .72)
    if s["id"] == "volcano" and tile == "basalt" and not side:
        rgb = tuple(value * 1.35 for value in rgb)
    if dark_side:
        rgb = tuple(value * .8 for value in rgb)
    return tuple(round(float(value), 5) for value in rgb)


def make_material(tile):
    existing = bpy.data.materials.get(tile)
    if existing:
        return existing
    material = bpy.data.materials.new(tile)
    material.diffuse_color = (1, 1, 1, 1)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (1, 1, 1, 1)
    shader.inputs["Roughness"].default_value = .82
    color = nodes.new("ShaderNodeVertexColor")
    color.layer_name = "Color"
    links.new(color.outputs["Color"], shader.inputs["Base Color"])
    if tile in ("lava", "crystal", "mush_cap"):
        emission = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
        if emission:
            emission.default_value = (1, 1, 1, 1)
        if shader.inputs.get("Emission Strength"):
            shader.inputs["Emission Strength"].default_value = .7
    material.use_backface_culling = False
    return material


def assign_uvs(mesh, tiles):
    layer = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        tile = tiles[poly.material_index]
        col, row = ATLAS[tile]
        n = poly.normal
        if abs(n.z) >= abs(n.x) and abs(n.z) >= abs(n.y):
            axes, signs = (0, 1), (1, -1)
        elif abs(n.x) >= abs(n.y):
            axes, signs = (1, 2), (-1, 1)
        else:
            axes, signs = (0, 2), (1, 1)
        coords = [(mesh.vertices[v].co[axes[0]] * signs[0], mesh.vertices[v].co[axes[1]] * signs[1])
                  for v in poly.vertices]
        lo = [min(p[a] for p in coords) for a in (0, 1)]
        hi = [max(p[a] for p in coords) for a in (0, 1)]
        span = [max(1e-6, hi[a] - lo[a]) for a in (0, 1)]
        for loop, p in zip(poly.loop_indices, coords):
            u = col * TILE + MARGIN + clamp((p[0] - lo[0]) / span[0], 0, 1) * (TILE - 2 * MARGIN)
            v = row * TILE + MARGIN + clamp((p[1] - lo[1]) / span[1], 0, 1) * (TILE - 2 * MARGIN)
            layer.data[loop].uv = (u / ATLAS_W, 1 - v / ATLAS_H)


def assign_colors(mesh, seed, s, kind, occupancy=None, face_colors=None):
    layer = mesh.color_attributes.get("Color") or mesh.color_attributes.new(
        name="Color", type="BYTE_COLOR", domain="CORNER")
    mesh.color_attributes.active_color_index = list(mesh.color_attributes).index(layer)
    for poly in mesh.polygons:
        c, normal = poly.center, poly.normal
        top = normal.z > .62
        cell = (int(clamp(math.floor(c.x), 0, W - 1)), int(clamp(math.floor(-c.y), 0, D - 1)))
        tile = mesh.materials[poly.material_index].name
        variant = palette_id(tile, c.x, c.y, c.z, seed, not top, normal)
        palette = SWATCH.get(tile, NEUTRAL)
        rgb = face_colors[poly.index] if face_colors and poly.index < len(face_colors) else None
        has_face_color = rgb is not None
        if rgb is None:
            rgb = palette[variant % len(palette)]
        tint = s.get("tints", {}).get(idx(*cell))
        if not has_face_color and tint == "pink":
            rgb = PINK_SWATCH[variant % len(PINK_SWATCH)]
        elif not has_face_color and tint == "purple" and tile in ("turf_top", "turf_side"):
            rgb = PURPLE_SWATCH[variant % len(PURPLE_SWATCH)]
        elif not has_face_color and tint == "sulfur" and tile in ("ash", "basalt"):
            rgb = (rgb[0] * 1.04, rgb[1] * 1.02, rgb[2] * .72)
        if has_face_color and tile in ("leaves", "pine"):
            rgb = tuple(value * (1.08 if top else .96) for value in rgb)
        if kind == "fall":
            if tile == "water":
                rgb = (.78, .96, 1.0)
            elif tile == "ice":
                rgb = (.86, .98, 1.0)
            elif tile == "lava":
                rgb = (1.0, .64, .28)
        if kind == "water":
            rgb = tuple(value * s.get("water_shades", {}).get(idx(*cell), 1.0) for value in rgb)
        for loop in poly.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop].vertex_index].co
            if kind == "terrain":
                ao = terrain_ao(s, cell, vertex, normal, top)
            elif occupancy:
                ao = prop_ao(occupancy, c, vertex, normal)
            else:
                ao = 1.0
            if tile in ("leaves", "pine"):
                ao = max(.72, ao)
            elif kind == "glow":
                ao = max(.84, ao)
            color = tuple(max(.03, min(1.0, rgb[n] * ao)) for n in range(3))   # 色みを保つため、下限は成分ごとに掛けない
            layer.data[loop].color = (*color, 1.0)


def make_object(name, specs, seed, s, kind, bevel=True, mesh_name=None, occupancy=None):
    if not specs:
        return None
    tiles = sorted({spec["tile"] for spec in specs})
    missing = set(tiles) - set(ATLAS)
    if missing:
        raise ValueError("未定義のアトラスマス: " + ", ".join(sorted(missing)))
    mesh = bpy.data.meshes.new(mesh_name or name)
    vertices, faces, material_ids, face_colors, lookup = [], [], [], [], {}
    for spec in specs:
        poly = []
        for co in spec["verts"]:
            pos = tuple(round(float(v), 5) for v in co)
            key = (spec.get("group"), pos) if spec.get("group") is not None else pos
            if key not in lookup:
                lookup[key] = len(vertices)
                vertices.append(pos)
            poly.append(lookup[key])
        if len(set(poly)) >= 3:
            faces.append(poly)
            material_ids.append(tiles.index(spec["tile"]))
            face_colors.append(spec.get("color"))
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for tile in tiles:
        mesh.materials.append(make_material(tile))
    for poly, mid in zip(mesh.polygons, material_ids):
        poly.material_index = mid
    color_by_face = {}
    for spec in specs:
        if spec.get("color") is None:
            continue
        signature = (spec["tile"], tuple(sorted(tuple(round(float(v), 5) for v in point)
                                                 for point in spec["verts"])))
        color_by_face[signature] = spec["color"]
    repaired = mesh.validate(verbose=False, clean_customdata=False)
    mesh.update()
    face_colors = []
    for poly in mesh.polygons:
        tile = tiles[poly.material_index]
        signature = (tile, tuple(sorted(tuple(round(float(v), 5) for v in mesh.vertices[n].co)
                                        for n in poly.vertices)))
        face_colors.append(color_by_face.get(signature))
    if repaired:
        print("[mesh] {} の不正な頂点・面を除去しました".format(name))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    assign_colors(obj.data, seed, s, kind, occupancy, face_colors)
    if bevel and mesh.edges:
        mod = obj.modifiers.new("Soft voxel corners", "BEVEL")
        mod.width, mod.segments = BEVEL, BEVEL_SEGMENTS
        mod.limit_method, mod.angle_limit = "ANGLE", math.radians(30)
        mod.harden_normals, mod.use_clamp_overlap = True, True
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    if s["id"] == "skyisles" and kind == "terrain":
        obj.data.validate(verbose=False)
        obj.data.update()
    # ベベル前に付けた COLOR_0 は角の面へ補間し、UV は追加面も含めて付ける。
    assign_uvs(obj.data, tiles)
    return obj


def side_tile(s, logical, row, top, low):
    depth = top - low
    sid = s["id"]
    if logical == "wood":
        return "planks"
    top_tile = TOP_TILE.get(logical, "rock")
    if depth <= 2:
        return top_tile
    if sid == "meadow":
        if row == low:
            return "dirt"
        return top_tile if row == top - 1 else "stone"
    if sid == "canyon":
        return top_tile if row == top - 1 else "sandstone_side" if row % 2 else "redrock"
    if sid == "snow":
        return "snow_top" if row == top - 1 else "stone"
    if sid == "volcano":
        return top_tile if row == top - 1 else "ash" if row % 2 else "basalt"
    return top_tile if row == top - 1 else "cloudstone"


def terrain_faces(s, base, seed):
    faces = []
    sky = s["id"] == "skyisles"
    if sky:
        columns = {}
        for k in range(D):
            for i in range(W):
                n = idx(i, k)
                h = s["heights"][n]
                if h < 0 or n in s["bridge_cells"]:
                    continue
                logical = s["surface_names"][n]
                bottom = s["island_bottoms"].get(n, h - 1)
                columns[(i, k)] = (h, bottom, logical)
                tile = TOP_TILE.get(logical, "rock")
                center = (i + .5, -(k + .5), h)
                top_face(faces, i, k, h, tile, terrain_color(s, tile, center, seed, cell=(i, k)))
                bottom_center = (i + .5, -(k + .5), bottom)
                bottom_color = terrain_color(s, "cloudstone", bottom_center, seed, True, (i, k))
                faces.append(face([(i, -k - 1, bottom), (i, -k, bottom),
                                   (i + 1, -k, bottom), (i + 1, -k - 1, bottom)], "cloudstone", color=bottom_color))
        for (i, k), (h, bottom, logical) in columns.items():
            for direction, di, dk in (("east", 1, 0), ("west", -1, 0), ("south", 0, 1), ("north", 0, -1)):
                neighbor = columns.get((i + di, k + dk))
                if neighbor is None:
                    low = bottom
                    def edge_tile(row, logical=logical, h=h, low=low, i=i, k=k):
                        tile = side_tile(s, logical, row, h, low)
                        center = side_center(i, k, row, direction)
                        return tile, terrain_color(s, tile, center, seed, True, (i, k))
                    side_faces(faces, i, k, low, h, direction, edge_tile)
                    continue
                neighbor_h, neighbor_bottom, _ = neighbor
                high_start = max(bottom, neighbor_h)
                if h > high_start:
                    low = high_start
                    def high_tile(row, logical=logical, h=h, low=low, i=i, k=k):
                        tile = side_tile(s, logical, row, h, low)
                        center = side_center(i, k, row, direction)
                        dark = (h - low <= 2)
                        return tile, terrain_color(s, tile, center, seed, True, (i, k), dark)
                    side_faces(faces, i, k, low, h, direction, high_tile)
                low_end = min(h, neighbor_bottom)
                if low_end > bottom:
                    side_faces(faces, i, k, bottom, low_end, direction,
                               lambda row, i=i, k=k, direction=direction: (
                                   "cloudstone", terrain_color(s, "cloudstone", side_center(i, k, row, direction),
                                                                seed, True, (i, k))))
        unique = {}
        for spec in faces:
            key = tuple(sorted(tuple(round(float(value), 5) for value in vertex) for vertex in spec["verts"]))
            previous = unique.get(key)
            if previous is None or (previous["tile"] == "cloudstone" and spec["tile"] != "cloudstone"):
                unique[key] = spec
        return merge_unit_faces(list(unique.values()))
    for k in range(D):
        for i in range(W):
            n, h = idx(i, k), s["heights"][idx(i, k)]
            if h < 0:
                continue
            logical = s["surface_names"][n]
            tile = TOP_TILE.get(logical, "rock")
            center = (i + .5, -(k + .5), h)
            top_face(faces, i, k, h, tile, terrain_color(s, tile, center, seed, cell=(i, k)))
            for direction, di, dk in (("east", 1, 0), ("west", -1, 0), ("south", 0, 1), ("north", 0, -1)):
                ni, nk = i + di, k + dk
                low = s["heights"][idx(ni, nk)] if inside(ni, nk) else -1
                if low < 0:
                    low = s["island_bottoms"].get(n, h - 1) if sky else base
                if sky:
                    low = max(low, s["island_bottoms"].get(n, h - 1))
                if h > low:
                    def tile_for_row(row, logical=logical, h=h, low=low, i=i, k=k, direction=direction):
                        tile = side_tile(s, logical, row, h, low)
                        center = side_center(i, k, row, direction)
                        return tile, terrain_color(s, tile, center, seed, True, (i, k), h - low <= 2)
                    side_faces(faces, i, k, low, h, direction, tile_for_row)
    faces.append(face([(0, 0, base), (W, 0, base), (W, -D, base), (0, -D, base)], "stone"))
    return merge_unit_faces(faces)


def liquid_faces(s):
    for k in range(D):
        for i in range(W):
            n, kind, h = idx(i, k), s["liquid"][idx(i, k)], s["heights"][idx(i, k)]
            if kind == 1:
                top_face(s["water"], i, k, h + .035, "water")
            elif kind == 2:
                top_face(s["lava"], i, k, h + .045, "lava")
    return s["water"], s["lava"]


def contiguous_runs(values):
    values = sorted(values)
    if not values:
        return []
    runs, start, last = [], values[0], values[0]
    for value in values[1:]:
        if value != last + 1:
            runs.append(list(range(start, last + 1)))
            start = value
        last = value
    runs.append(list(range(start, last + 1)))
    return runs


def waterfall_faces(s, kind):
    for k in range(1, D):
        up = [i for i in range(W) if s["liquid"][idx(i, k - 1)] == kind]
        down = [i for i in range(W) if s["liquid"][idx(i, k)] == kind]
        up_runs, down_runs = contiguous_runs(up), contiguous_runs(down)
        overlap = set(up) & set(down)
        tile = "lava" if kind == 2 else "ice" if kind == 3 else "water"
        for run in contiguous_runs(overlap):
            uh = sorted(s["heights"][idx(i, k - 1)] for i in run)
            dh = sorted(s["heights"][idx(i, k)] for i in run)
            offset = .045 if kind == 2 else .035
            top = uh[len(uh) // 2] + offset
            low = dh[len(dh) // 2] + offset
            if top - low < 2:
                continue
            center = sum(run) / len(run) + .5
            near_up = min(up_runs, key=lambda xs: abs(sum(xs) / len(xs) + .5 - center))
            near_down = min(down_runs, key=lambda xs: abs(sum(xs) / len(xs) + .5 - center))
            width = max(len(run), len(near_up), len(near_down))
            add_fall(s, center, -float(k), low, top, tile, width)
    for run in contiguous_runs([i for i in range(W) if s["liquid"][idx(i, D - 1)] == kind]):
        hs = sorted(s["heights"][idx(i, D - 1)] for i in run)
        top = hs[len(hs) // 2] + (.045 if kind == 2 else .035)
        tile = "lava" if kind == 2 else "ice" if kind == 3 else "water"
        add_fall(s, sum(run) / len(run) + .5, -72.0, top - 6, top, tile, len(run))


def walkable(s):
    return [h >= 0 and not s["blocked"][n] and s["liquid"][n] != 2 for n, h in enumerate(s["heights"])]


def flood(s):
    allowed = walkable(s)
    si, sk = s["spawn"]
    start = idx(si, sk)
    if not allowed[start]:
        return set(), allowed
    reached, queue = {start}, [start]
    for current in queue:
        i, k, h = current % W, current // W, s["heights"][current]
        for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ni, nk = i + di, k + dk
            if inside(ni, nk):
                n = idx(ni, nk)
                if allowed[n] and n not in reached and s["heights"][n] <= h + 1:
                    reached.add(n)
                    queue.append(n)
    return reached, allowed


def repair_walkability(s):
    for repairs in range(COUNT):
        reached, allowed = flood(s)
        total = sum(allowed)
        if total == 0 or len(reached) / total >= .65:
            return repairs, reached, total
        queue, previous = list(reached), {n: None for n in reached}
        target, head = None, 0
        while head < len(queue) and target is None:
            current = queue[head]
            head += 1
            i, k = current % W, current // W
            for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ni, nk = i + di, k + dk
                if not inside(ni, nk):
                    continue
                n = idx(ni, nk)
                if not allowed[n] or n in previous:
                    continue
                previous[n] = current
                if n not in reached:
                    target = n
                    break
                queue.append(n)
        if target is None:
            return repairs, reached, total
        path = [target]
        while previous[path[-1]] is not None:
            path.append(previous[path[-1]])
        for a, b in zip(reversed(path), reversed(path[:-1])):
            if s["heights"][b] > s["heights"][a] + 1:
                # 崖へ幅 2 の階段を切り込む（a から b の向きへ 1 段ずつ上がる）
                ai, ak, bi, bk = a % W, a // W, b % W, b // W
                di, dk = bi - ai, bk - ak
                step = s["heights"][a] + 1
                ci, ck = bi, bk
                while inside(ci, ck) and s["heights"][idx(ci, ck)] > step and s["liquid"][idx(ci, ck)] == 0:
                    for wi, wk in ((ci, ck), (ci + dk, ck + di)):
                        if inside(wi, wk) and s["liquid"][idx(wi, wk)] == 0 and s["heights"][idx(wi, wk)] > step:
                            s["heights"][idx(wi, wk)] = step
                            s["ramp_cells"].add((wi, wk))
                    ci, ck, step = ci + di, ck + dk, step + 1
                s["counts"]["ramps"] += 1
    reached, allowed = flood(s)
    return COUNT, reached, sum(allowed)


def prop_cells(s, spawn_dist=5):
    si, sk = s["spawn"]
    # 坂と橋のまわり 2 マスには物を置かない（通り道をふさがない）
    keep = set()
    for (i, k) in list(s["ramp_cells"]) + list(s["bridges"]):
        for dk in range(-2, 3):
            for di in range(-2, 3):
                keep.add((i + di, k + dk))
    return [(i, k) for k in range(3, D - 3) for i in range(3, W - 3)
            if s["heights"][idx(i, k)] >= 0 and s["blocked"][idx(i, k)] == 0
            and s["liquid"][idx(i, k)] == 0 and (i, k) not in keep
            and math.hypot(i - si, k - sk) >= spawn_dist]


def cliff_score(s, i, k):
    h = s["heights"][idx(i, k)]
    return max([abs(h - s["heights"][idx(i + di, k + dk)])
                for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1))
                if inside(i + di, k + dk) and s["heights"][idx(i + di, k + dk)] >= 0] or [0])


def add_tree(s, i, k, rng, kind):
    ground = s["heights"][idx(i, k)]
    s["blocked"][idx(i, k)] = 1
    if kind == "broadleaf":
        trunk = rng.randint(2, 3)
        for z in range(trunk):
            voxel(s["props"], i, k, ground, 0, 0, z, "bark", .84, .84)
        radius = rng.choice((2, 3))
        base_color = (.95, .90, .19)
        for z in range(radius * 2 + 1):
            vertical = z - radius
            layer_radius = max(0, int(math.floor(math.sqrt(max(0, radius * radius - vertical * vertical * .8)))))
            low_shade = .92 if z == 0 or z == radius * 2 else 1.0
            for dx in range(-radius, radius + 1):
                for dk in range(-radius, radius + 1):
                    if dx * dx + dk * dk <= layer_radius * layer_radius + .2:
                        variation = rng.choice((.92, .97, 1.03, 1.08))
                        color = tuple(value * variation * low_shade for value in base_color)
                        voxel(s["props"], i, k, ground, dx, dk, trunk + z, "leaves", 1.0, 1.0,
                              color=color)
    elif kind == "conifer":
        trunk = rng.randint(2, 3)
        for z in range(trunk):
            voxel(s["props"], i, k, ground, 0, 0, z, "bark", .84, .84)
        total_height = rng.randint(8, 12)
        foliage_height = total_height - trunk
        tiers = min(rng.randint(4, 6), foliage_height)
        tier_heights = [foliage_height // tiers + (1 if tier < foliage_height % tiers else 0)
                        for tier in range(tiers)]
        tile = "pine" if s["id"] == "snow" else "leaves"
        base_color = (1.0, 1.0, .82) if s["id"] == "snow" else (.17, .48, .13)
        level = trunk
        for tier, tier_height in enumerate(tier_heights):
            radius = 2 if tier == 0 else 1 if tier in (1, 2) else 0
            tier_shade = .92 if tier == 0 else 1.0
            for dx in range(-radius, radius + 1):
                for dk in range(-radius, radius + 1):
                    if radius == 2 and abs(dx) == 2 and abs(dk) == 2:
                        continue
                    variation = rng.choice((.92, .97, 1.03, 1.08))
                    color = tuple(value * variation * tier_shade for value in base_color)
                    for row in range(tier_height):
                        voxel(s["props"], i, k, ground, dx, dk, level + row, tile, 1.0, 1.0,
                              color=color)
            if s["id"] == "snow":
                voxel(s["props"], i, k, ground, 0, 0, level + tier_height - 1,
                      "snow_top", .90, .14)
            level += tier_height
    elif kind == "cactus":
        trunk = rng.randint(5, 7)
        for z in range(trunk):
            voxel(s["props"], i, k, ground, 0, 0, z, "cactus", .76)
        for side in (-1, 1):
            if rng.random() < .72:
                for z in (trunk - 3, trunk - 2):
                    voxel(s["props"], i, k, ground, side, 0, z, "cactus", .74)
    elif kind == "palm":
        trunk = rng.randint(5, 7)
        for z in range(trunk):
            voxel(s["props"], i, k, ground, 0, 0, z, "bark", .78)
        for angle in range(0, 360, 60):
            a = math.radians(angle)
            for step in (1, 2, 3):
                voxel(s["props"], i, k, ground, round(math.cos(a) * step), round(math.sin(a) * step),
                      trunk - 1 + (step == 1), "leaves", .78, .20, a)
    else:
        trunk = rng.randint(5, 7)
        for z in range(trunk):
            voxel(s["props"], i, k, ground, 0, 0, z, "deadwood", .78)
        for side in (-1, 1):
            if rng.random() < .8:
                for dx in (side, side * 2):
                    voxel(s["props"], i, k, ground, dx, 0, trunk - 2, "deadwood", .74)
    s["counts"]["trees"] += 1
    if kind == "conifer":
        s["counts"]["conifers"] += 1


def trees(s, seed):
    rng = random.Random(seed + 1009)
    available = prop_cells(s, 6)
    limits = s["params"].get("treeCount", [68, 82])
    target = rng.randint(int(limits[0]), int(limits[1]))
    # 林の濃さはノイズで決め、木どうしは 3 マス以上あける（葉がつながって 1 つの塊に見えないように）
    def score(p):
        forest = value_noise(p[0], p[1], 13, seed + 1013)
        return -(forest * 1.0 + min(1.0, cliff_score(s, *p) / 4) * .35) + hash_noise(p[0], p[1], seed + 1019) * .45
    available.sort(key=score)
    selected = []
    for gap in (3.2, 2.6):
        for p in available:
            if len(selected) >= target:
                break
            if all(abs(p[0] - q[0]) >= gap or abs(p[1] - q[1]) >= gap or math.hypot(p[0] - q[0], p[1] - q[1]) >= gap * 1.25
                   for q in selected):
                selected.append(p)
    for n, (i, k) in enumerate(selected):
        if s["id"] == "meadow":
            kind = "conifer" if n % 5 < 3 else "broadleaf"
        elif s["id"] == "canyon":
            kind = "palm" if math.hypot(i - 28, k - 42) < 11 and n % 2 == 0 else "cactus" if n % 3 else "dead"
        elif s["id"] == "snow":
            kind = "conifer"
        elif s["id"] == "volcano":
            kind = "dead"
        else:
            kind = "broadleaf" if n % 3 == 0 else "conifer"
        add_tree(s, i, k, rng, kind)


def choose_props(s, count, seed, spacing=6):
    rng = random.Random(seed)
    cells, out = prop_cells(s, 7), []
    rng.shuffle(cells)
    for cell in cells:
        if all(math.hypot(cell[0] - x, cell[1] - k) >= spacing for x, k in out):
            out.append(cell)
            if len(out) == count:
                break
    return out


def mushroom(s, i, k, rng, glow=False):
    ground, stem = s["heights"][idx(i, k)], rng.randint(2, 3)
    for z in range(stem):
        voxel(s["props"], i, k, ground, 0, 0, z, "mush_stem", .72, .90,
              color=(.96, .90, .74))
    boxes = s["glow"] if glow else s["props"]
    radius = rng.choice((1, 2))
    for layer in range(2):
        layer_radius = radius if layer == 0 else max(0, radius - 1)
        for dx in range(-layer_radius, layer_radius + 1):
            for dk in range(-layer_radius, layer_radius + 1):
                if dx * dx + dk * dk > layer_radius * layer_radius + .2:
                    continue
                voxel(boxes, i, k, ground, dx, dk, stem + layer - 1, "mush_cap", 1.0, 1.0,
                      color=(1.0, .58, .22) if not glow else (1.0, .58, .82))


def crystal_cluster(s, i, k, rng, black=False):
    ground = s["heights"][idx(i, k)]
    for _ in range(rng.randint(3, 6)):
        dx, dk = rng.choice(((-1, 0), (1, 0), (0, -1), (0, 1), (0, 0)))
        height = rng.randint(2, 5)
        tile = "obsidian" if black else "crystal"
        for level in range(height):
            voxel(s["props"], i, k, ground, dx, dk, level, tile, .84 if level < height - 1 else .70)
        voxel(s["glow"], i, k, ground, dx, dk, height, "crystal", .62, .32,
              color=(1.0, .50, .82))


def rock_cluster(s, i, k, rng, tile="rock"):
    ground = s["heights"][idx(i, k)]
    for _ in range(rng.randint(3, 6)):
        dx, dk = rng.choice(((-1, 0), (1, 0), (0, -1), (0, 1), (0, 0)))
        voxel(s["props"], i, k, ground, dx, dk, rng.randint(0, 1), tile, rng.uniform(.82, 1.0),
              rng.uniform(.60, .95), color=(.86, .88, .90))


def stump(s, i, k):
    ground = s["heights"][idx(i, k)]
    for z in range(2):
        voxel(s["props"], i, k, ground, 0, 0, z, "bark", .86, .86)
    voxel(s["props"], i, k, ground, 0, 0, 2, "planks", .90, .12,
          color=(.94, .82, .60))


def purple_pillars(s, seed):
    patches = s.get("purple_patches", ())
    if not patches:
        return
    rng = random.Random(seed + 1181)
    for cx, ck, radius in patches:
        cells = [(i, k) for k in range(max(0, int(ck - radius + 2)), min(D, int(ck + radius - 1)))
                 for i in range(max(0, int(cx - radius + 2)), min(W, int(cx + radius - 1)))
                 if s["tints"].get(idx(i, k)) == "purple" and s["liquid"][idx(i, k)] == 0
                 and not s["blocked"][idx(i, k)]
                 and math.hypot(i + .5 - cx, k + .5 - ck) < radius - 2]
        rng.shuffle(cells)
        target = rng.randint(4, 7)
        chosen = []
        for cell in cells:
            if all(math.hypot(cell[0] - x, cell[1] - z) >= 2.5 for x, z in chosen):
                chosen.append(cell)
                if len(chosen) == target:
                    break
        body_tile = "obsidian" if s["id"] == "meadow" else "crystal"
        for i, k in chosen:
            ground = s["heights"][idx(i, k)]
            height = rng.randint(2, 6)
            s["blocked"][idx(i, k)] = 1
            for level in range(height):
                voxel(s["props"], i, k, ground, 0, 0, level, body_tile, 1.0, 1.0)
            voxel(s["glow"], i, k, ground, 0, 0, height, "crystal", .74, .30,
                  color=(1.0, .48, .78))
            for dx, dk in ((-1, 0), (1, 0), (0, -1), (0, 1), (-2, 0), (2, 0)):
                if inside(i + dx, k + dk):
                    add_box(s["glow"], i, k, ground, "crystal", (.22, .22, .20),
                            (dx, -dk, .14), color=(1.0, .50, .82))
            s["counts"]["special_crystals"] = s["counts"].get("special_crystals", 0) + 1


def landmark(s, i, k, kind, rng):
    ground = s["heights"][idx(i, k)]
    s["blocked"][idx(i, k)] = 1
    if kind in ("mushroom", "glow_mushroom"):
        mushroom(s, i, k, rng, kind == "glow_mushroom")
    elif kind == "crystal":
        crystal_cluster(s, i, k, rng, False)
    elif kind == "black_crystal":
        crystal_cluster(s, i, k, rng, True)
    elif kind == "tower":
        height = rng.randint(8, 12)
        for z in range(height):
            voxel(s["props"], i, k, ground, 0, 0, z, "redrock", .92)
        for dx in (-1, 1):
            voxel(s["props"], i, k, ground, dx, 0, height - 2, "redrock", .82)
    elif kind == "arch":
        for dx in (-3, 3):
            for z in range(3):
                voxel(s["props"], i, k, ground, dx, 0, z, "sandstone_side", .92)
        for dx in range(-2, 3):
            voxel(s["props"], i, k, ground, dx, 0, 3, "sandstone_side", .92)
    elif kind == "log":
        for dx in range(-3, 4):
            add_box(s["props"], i, k, ground, "deadwood", (.92, .58, .58), (dx * .72, 0, .26))
    elif kind == "ice":
        for z in range(rng.randint(3, 5)):
            voxel(s["props"], i, k, ground, 0, 0, z, "ice", .88, .92)
    elif kind == "snow_rock":
        rock_cluster(s, i, k, rng, "stone")
        add_box(s["props"], i, k, ground, "snow_top", (1.5, 1.5, .24), (0, 0, 1.3))
    elif kind == "obsidian":
        height = rng.randint(3, 5)
        for z in range(height):
            voxel(s["props"], i, k, ground, 0, 0, z, "obsidian", .88)
        voxel(s["glow"], i, k, ground, 0, 0, height - 1, "lava", .50, .35)
    elif kind == "stump":
        stump(s, i, k)
    elif kind == "vent":
        for dx, dk in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            voxel(s["props"], i, k, ground, dx, dk, 0, "ash", .72)
        add_box(s["glow"], i, k, ground, "lava", (.26, .26, .18), (0, 0, .78))
    else:
        rock_cluster(s, i, k, rng)
    s["counts"]["landmarks"] += 1


def landmarks(s, seed):
    rng = random.Random(seed + 1103)
    cells = []
    if s["id"] == "canyon":
        center = s["canyon_center"]
        for k in (18, 45, 60):
            i = int(round(center(k)))
            candidates = [(x, k + dk) for dk in (-1, 0, 1) for x in range(i - 2, i + 3)
                          if inside(x, k + dk) and s["liquid"][idx(x, k + dk)] == 0]
            if candidates:
                cells.append(min(candidates, key=lambda p: abs(p[0] - center(p[1]))))
        k = 32
        cells.append((int(round(center(k))), k))
    elif s["id"] == "meadow":
        cells.extend(choose_props(s, 3, seed + 1107, 8))
        patch_cells = [
            (i, k) for k in range(D) for i in range(W)
            if s["tints"].get(idx(i, k)) == "purple" and s["liquid"][idx(i, k)] == 0
        ]
        rng.shuffle(patch_cells)
        for cell in patch_cells:
            if all(math.hypot(cell[0] - x, cell[1] - k) >= 4 for x, k in cells):
                cells.append(cell)
                if len(cells) == 5:
                    break
    for cell in choose_props(s, 16, seed + 1109, 7):
        if all(math.hypot(cell[0] - x, cell[1] - k) >= 6 for x, k in cells):
            cells.append(cell)
            if len(cells) == 8:
                break
    if len(cells) < 8:
        for cell in choose_props(s, 24, seed + 1117, 4):
            if all(math.hypot(cell[0] - x, cell[1] - k) >= 4 for x, k in cells):
                cells.append(cell)
                if len(cells) == 8:
                    break
    sets = {
        "meadow": ["mushroom"] * 3 + ["black_crystal"] * 2 + ["log", "rock", "stump"],
        "canyon": ["tower"] * 3 + ["arch", "rock", "rock", "log", "palm"],
        "snow": ["ice"] * 3 + ["snow_rock"] * 3 + ["crystal", "rock"],
        "volcano": ["obsidian"] * 3 + ["log"] * 2 + ["vent"] * 2 + ["rock"],
        "skyisles": ["glow_mushroom"] * 4 + ["crystal"] * 3 + ["rock"],
    }
    for (i, k), kind in zip(cells, sets[s["id"]]):
        landmark(s, i, k, kind, rng)


def small_prop(s, i, k, rng, n):
    h = s["heights"][idx(i, k)]
    kind = n % 4
    tuft = {"meadow": "grass_top", "canyon": "cactus", "snow": "snow_top",
            "volcano": "basalt", "skyisles": "turf_top"}[s["id"]]
    pebble = "rock"
    flower = "ash" if s["id"] == "volcano" else "flowers"
    if kind == 0:
        for angle in (0, .85, 1.6)[:rng.randint(2, 3)]:
            add_box(s["props"], i, k, h, tuft, (.30, .60, .45),
                    (rng.uniform(-.12, .12), rng.uniform(-.12, .12), .225), angle,
                    color=(.82, 1.0, .56))
    elif kind == 1:
        zsize = rng.uniform(.20, .28)
        width = rng.uniform(.40, .50)
        add_box(s["props"], i, k, h, pebble, (width, rng.uniform(.40, .48), zsize),
                (0, 0, zsize * .5), rng.random() * math.tau, color=(.86, .88, .90))
    elif kind == 2:
        petal_color = (1.0, .96, .60) if n % 2 else (1.0, 1.0, .92)
        add_box(s["props"], i, k, h, flower, (.14, .14, .28), (0, 0, .14),
                color=(.72, .92, .54))
        add_box(s["props"], i, k, h, flower, (.44, .44, .12), (0, 0, .06),
                rng.random() * math.tau, color=petal_color)
    else:
        petal_color = (1.0, 1.0, .92) if n % 2 else (1.0, .94, .54)
        add_box(s["props"], i, k, h, flower, (.14, .14, .30), (0, 0, .15),
                color=(.74, .94, .54))
        add_box(s["props"], i, k, h, flower, (.46, .46, .12), (0, 0, .06),
                rng.random() * math.tau, color=petal_color)
    s["counts"]["small_props"] += 1


def small_props(s, seed, count=420):
    rng = random.Random(seed + 1201)
    cells = prop_cells(s, 4)
    rng.shuffle(cells)
    if len(cells) < count:
        raise RuntimeError("{} 小物を置く地面が足りません: {}".format(s["id"], len(cells)))
    for n, (i, k) in enumerate(cells[:count]):
        small_prop(s, i, k, rng, n)


def make_props(s, seed):
    landmarks(s, seed)
    purple_pillars(s, seed)
    trees(s, seed)
    small_props(s, seed, int(s["params"].get("smallCount", 420)))


def color_stats(objects):
    values = []
    for obj in objects:
        layer = obj.data.color_attributes.get("Color")
        if layer:
            for item in layer.data:
                values.extend(item.color[:3])
    return (min(values), sum(values) / len(values)) if values else (1, 1)


def triangles(objects):
    total = 0
    for obj in objects:
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def make_stage_objects(s, seed, base):
    terrain = terrain_faces(s, base, seed)
    props = box_face_specs(s["props"])
    glow = box_face_specs(s["glow"])
    water, lava = liquid_faces(s)
    glow.extend(lava)
    prop_occ, glow_occ = voxel_occupancy(s["props"]), voxel_occupancy(s["glow"])
    fall_node = "fall_lava" if s["id"] == "volcano" else "fall_ice" if s["id"] == "snow" else "fall_water"
    objects = []
    specs = [
        ("terrain", "terrain", terrain, "terrain", True, None),
        ("props", "props", props, "props", False, prop_occ),
        ("glow", "glow", glow, "glow", False, glow_occ),
        ("water_surface", "water", water, "water", False, None),
        (fall_node, "fall", s["falls"], "fall", False, None),
    ]
    for name, data_name, faces, kind, bevel, occ in specs:
        if faces:
            objects.append(make_object(name, faces, seed + len(objects) * 101, s, kind, bevel, data_name, occ))
    if s["id"] != "canyon" and not any(o.data.name == "fall" for o in objects):
        raise RuntimeError("{} に fall メッシュがありません".format(s["id"]))
    return objects


def export_glb(objects, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_vertex_color="ACTIVE",
                              export_all_vertex_colors=True)
    bpy.ops.object.select_all(action="DESELECT")
    compact_glb_uvs(path)


def compact_glb_uvs(path):
    raw = path.read_bytes()
    _, _, total = struct.unpack_from("<4sII", raw, 0)
    if total != len(raw):
        raise RuntimeError("{} の GLB サイズが一致しません".format(path))
    offset, document, binary = 12, None, None
    while offset < len(raw):
        length, chunk_type = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk = raw[offset:offset + length]
        offset += length
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.decode("utf-8").rstrip(" \t\r\n\0"))
        elif chunk_type == 0x004E4942:
            binary = bytearray(chunk)
    if document is None or binary is None:
        raise RuntimeError("{} に JSON または BIN チャンクがありません".format(path))
    uv_accessors = {primitive.get("attributes", {}).get("TEXCOORD_0")
                    for mesh in document.get("meshes", [])
                    for primitive in mesh.get("primitives", [])}
    uv_bounds = {}
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            accessor_index = primitive.get("attributes", {}).get("TEXCOORD_0")
            material_index = primitive.get("material")
            if accessor_index is None or material_index is None:
                continue
            tile = document["materials"][material_index].get("name", "")
            if tile not in ATLAS:
                continue
            col, row = ATLAS[tile]
            bounds = ((col * TILE + MARGIN) / ATLAS_W,
                      ((col + 1) * TILE - MARGIN) / ATLAS_W,
                      (row * TILE + MARGIN) / ATLAS_H,
                      ((row + 1) * TILE - MARGIN) / ATLAS_H)
            uv_bounds.setdefault(accessor_index, bounds)
    for accessor_index in sorted(index for index in uv_accessors if index is not None):
        accessor = document["accessors"][accessor_index]
        if accessor.get("componentType") != 5126 or accessor.get("type") != "VEC2":
            continue
        view = document["bufferViews"][accessor["bufferView"]]
        base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        stride = view.get("byteStride", 8)
        packed = bytearray()
        u_min, u_max, v_min, v_max = uv_bounds.get(accessor_index, (0.0, 1.0, 0.0, 1.0))
        guard = 2 / 65535
        for n in range(accessor["count"]):
            u, v = struct.unpack_from("<ff", binary, base + n * stride)
            packed.extend(struct.pack("<HH", int(round(clamp(u, u_min + guard, u_max - guard) * 65535)),
                                      int(round(clamp(v, v_min + guard, v_max - guard) * 65535))))
        while len(binary) % 4:
            binary.append(0)
        view_index = len(document["bufferViews"])
        document["bufferViews"].append({"buffer": 0, "byteOffset": len(binary),
                                        "byteLength": len(packed), "target": 34962})
        binary.extend(packed)
        accessor["bufferView"] = view_index
        accessor.pop("byteOffset", None)
        accessor["componentType"] = 5123
        accessor["normalized"] = True
        accessor.pop("min", None)
        accessor.pop("max", None)
    referenced_views = {accessor["bufferView"] for accessor in document.get("accessors", [])
                        if "bufferView" in accessor}
    for accessor in document.get("accessors", []):
        sparse = accessor.get("sparse", {})
        for entry in (sparse.get("indices", {}), sparse.get("values", {})):
            if "bufferView" in entry:
                referenced_views.add(entry["bufferView"])
    referenced_views.update(image.get("bufferView") for image in document.get("images", [])
                            if "bufferView" in image)
    compact = bytearray()
    remap = {}
    compact_views = []
    for old_index in sorted(referenced_views):
        view = document["bufferViews"][old_index]
        while len(compact) % 4:
            compact.append(0)
        offset = view.get("byteOffset", 0)
        length = view["byteLength"]
        new_view = dict(view)
        new_view["byteOffset"] = len(compact)
        compact.extend(binary[offset:offset + length])
        remap[old_index] = len(compact_views)
        compact_views.append(new_view)

    def remap_view_refs(value):
        if isinstance(value, dict):
            for key, item in list(value.items()):
                if key == "bufferView" and isinstance(item, int):
                    value[key] = remap[item]
                elif key == "bufferViews" and isinstance(item, list):
                    value[key] = [remap[index] for index in item]
                else:
                    remap_view_refs(item)
        elif isinstance(value, list):
            for item in value:
                remap_view_refs(item)

    for key, value in document.items():
        if key != "bufferViews":
            remap_view_refs(value)
    document["bufferViews"] = compact_views
    binary = compact
    document["buffers"][0]["byteLength"] = len(binary)
    json_chunk = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * ((-len(json_chunk)) % 4)
    binary.extend(b"\0" * ((-len(binary)) % 4))
    total_length = 12 + 8 + len(json_chunk) + 8 + len(binary)
    output = bytearray(struct.pack("<4sII", b"glTF", 2, total_length))
    output.extend(struct.pack("<II", len(json_chunk), 0x4E4F534A))
    output.extend(json_chunk)
    output.extend(struct.pack("<II", len(binary), 0x004E4942))
    output.extend(binary)
    path.write_bytes(output)


def preview_materials(atlas_path):
    image = bpy.data.images.load(str(atlas_path), check_existing=True)
    for material in bpy.data.materials:
        if material.name not in ATLAS or material.node_tree is None:
            continue
        nodes, links = material.node_tree.nodes, material.node_tree.links
        shader = nodes.get("Principled BSDF")
        color = nodes.get("Vertex Color") or nodes.new("ShaderNodeVertexColor")
        color.layer_name = "Color"
        coordinates = nodes.get("Texture Coordinate") or nodes.new("ShaderNodeTexCoord")
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        links.new(coordinates.outputs["UV"], tex.inputs["Vector"])
        multiply = nodes.new("ShaderNodeMixRGB")
        multiply.blend_type = "MULTIPLY"
        multiply.inputs[0].default_value = 1
        links.new(tex.outputs["Color"], multiply.inputs[1])
        links.new(color.outputs["Color"], multiply.inputs[2])
        links.new(multiply.outputs["Color"], shader.inputs["Base Color"])
        if material.name in ("lava", "crystal", "mush_cap"):
            emission = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
            if emission:
                links.new(multiply.outputs["Color"], emission)
            if shader.inputs.get("Emission Strength"):
                shader.inputs["Emission Strength"].default_value = .7


def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4


def setup_render(scene, path, focus, scale, offset):
    engines = {item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1280, 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.filepath = str(path)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    world = bpy.data.worlds.new("Diorama dark background") if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = tuple(linear(v / 255) for v in (29, 43, 43)) + (1,)
    bg.inputs["Strength"].default_value = 1
    cd = bpy.data.cameras.new("Preview camera")
    camera = bpy.data.objects.new("Preview camera", cd)
    scene.collection.objects.link(camera)
    target = Vector(focus)
    camera.location = target + Vector(offset)
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    cd.type, cd.ortho_scale, scene.camera = "ORTHO", scale, camera
    sd = bpy.data.lights.new("Sun with soft shadows", "SUN")
    sun = bpy.data.objects.new("Sun with soft shadows", sd)
    scene.collection.objects.link(sun)
    sd.energy, sd.angle, sd.use_shadow = 2.2, math.radians(12), True
    sun.rotation_euler = Vector((-.42, .32, -1)).to_track_quat("-Z", "Y").to_euler()
    ad = bpy.data.lights.new("Soft fill", "AREA")
    area = bpy.data.objects.new("Soft fill", ad)
    scene.collection.objects.link(area)
    area.location = target + Vector((4, -18, 34))
    ad.energy, ad.shape, ad.size = 2400, "DISK", 28
    area.rotation_euler = (target - area.location).to_track_quat("-Z", "Y").to_euler()
    eevee = getattr(scene, "eevee", None)
    if eevee is not None and hasattr(eevee, "taa_render_samples"):
        eevee.taa_render_samples = 48
    return camera


def render_stage(s, shots):
    heights = [h for h in s["heights"] if h >= 0]
    prop_top = max([b["center"][2] + b["size"][2] / 2 for b in s["props"] + s["glow"]] or heights)
    focus_z = (min(heights) + prop_top) / 2
    full = shots / (s["id"] + ".png")
    yaw, pitch, distance = math.radians(14), math.radians(52), 120
    full_offset = (math.sin(yaw) * distance, -math.cos(yaw) * distance,
                   math.tan(pitch) * distance)
    camera = setup_render(bpy.context.scene, full, (36, -36, focus_z), 110, full_offset)
    bpy.context.scene.render.filepath = str(full)
    bpy.ops.render.render(write_still=True)
    i, k = s["spawn"]
    h = s["heights"][idx(i, k)]
    target = Vector((i + .5, -(k + .5), h + 1.2))
    camera.location = target + Vector((10, -14.5, 12.2))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = 27
    close = shots / (s["id"] + "_close.png")
    bpy.context.scene.render.filepath = str(close)
    bpy.ops.render.render(write_still=True)


def make_hero(stage):
    root = bpy.data.objects.new("hero", None)
    bpy.context.scene.collection.objects.link(root)
    scale = 1.9 / 1.44
    parts = []
    pieces = [
        ("body", (0, 0, .52), (0, 0, .25), (.40, .31, .54), (.22, .38, .67)),
        ("head", (0, 0, 1.04), (0, 0, .20), (.36, .36, .40), (.80, .63, .43)),
        ("armL", (-.27, 0, .98), (0, 0, -.21), (.18, .20, .42), (.22, .38, .67)),
        ("armR", (.27, 0, .98), (0, 0, -.21), (.18, .20, .42), (.22, .38, .67)),
        ("legL", (-.11, 0, .52), (0, 0, -.26), (.18, .22, .52), (.18, .20, .23)),
        ("legR", (.11, 0, .52), (0, 0, -.26), (.18, .22, .52), (.18, .20, .23)),
        ("cape", (0, .16, 1.02), (0, 0, -.35), (.40, .12, .70), (.60, .12, .10)),
    ]
    for name, location, center, size, color in pieces:
        spec = box_faces({"center": tuple(v * scale for v in center),
                          "size": tuple(v * scale for v in size), "tile": "spare"})
        obj = make_object(name, spec, 131, stage, "hero", True)
        obj.location = tuple(v * scale for v in location)
        obj.parent = root
        for item in obj.data.color_attributes["Color"].data:
            item.color = (*color, 1)
        parts.append(obj)
        if name == "head":
            eyes = []
            for x in (-.09, .09):
                eyes.extend(box_faces({"center": (x * scale, -.19 * scale, .20 * scale),
                                       "size": (.045 * scale, .028 * scale, .052 * scale), "tile": "spare"}))
            eye = make_object("eyes", eyes, 137, stage, "hero", True)
            eye.parent = obj
            for item in eye.data.color_attributes["Color"].data:
                item.color = (.12, .10, .08, 1)
            parts.append(eye)
    root.select_set(True)
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    return root, parts


def export_hero(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage = {"id": "meadow", "seed": 1, "heights": [0] * COUNT, "tints": {}}
    make_hero(stage)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_vertex_color="ACTIVE",
                              export_all_vertex_colors=True)
    bpy.ops.object.select_all(action="DESELECT")


def preview_hero(path, atlas_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage = {"id": "meadow", "seed": 1, "heights": [0] * COUNT, "tints": {}}
    make_hero(stage)
    floor = box_faces({"center": (0, 0, -.12), "size": (2.8, 2.8, .24), "tile": "pedestal"})
    make_object("preview_floor", floor, 141, stage, "terrain", True)
    preview_materials(atlas_path)
    setup_render(bpy.context.scene, path, (0, 0, .94), 3.8, (2.8, -4, 2.8))
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def output_json(s, out):
    material_index = {name: n for n, name in enumerate(s["materials"])}
    data = {
        "id": s["id"], "name": s["name"], "seed": s["seed"], "size": [W, D],
        "height": s["heights"],
        "surface": [material_index.get(name, 0) for name in s["surface_names"]],
        "materials": s["materials"], "blocked": s["blocked"], "liquid": s["liquid"],
        "waterLevel": s["water_level"], "spawn": s["spawn"], "light": s["light"],
        "ambience": s["ambience"], "particles": s["particles"],
    }
    path = out / (s["id"] + ".json")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def compare_meadow(shots):
    left = bpy.data.images.load(str(ROOT / "art" / "diorama" / "ref" / "ref01.png"), check_existing=True)
    right = bpy.data.images.load(str(shots / "meadow.png"), check_existing=True)
    left.scale(1280, 1024)
    right.scale(1280, 1024)
    lp, rp = array("f", left.pixels[:]), array("f", right.pixels[:])
    output = bpy.data.images.new("Meadow comparison", width=2560, height=1024, alpha=True)
    pixels = array("f", [0]) * (2560 * 1024 * 4)
    row_size = 1280 * 4
    for row in range(1024):
        src, dst = row * row_size, row * row_size * 2
        pixels[dst:dst + row_size] = lp[src:src + row_size]
        pixels[dst + row_size:dst + 2 * row_size] = rp[src:src + row_size]
    output.pixels[:] = pixels
    output.filepath_raw = str(shots / "compare_meadow.png")
    output.file_format = "PNG"
    output.save()


def generate(config, out, shots, seed, preview):
    s = new_stage(config, seed)
    sid = s["id"]
    if sid == "meadow":
        center, _ = meadow(s, seed)
        kind = 1
    elif sid == "canyon":
        center, _ = canyon(s, seed)
        kind = 1
    elif sid == "snow":
        center, _ = snow(s, seed)
        kind = 3
    elif sid == "volcano":
        center, _ = volcano(s, seed)
        kind = 2
    else:
        skyisles(s, seed)
        center, kind = None, 1
    smooth_small_relief(s)
    if sid in ("meadow", "volcano"):
        waterfall_faces(s, kind)
    fall_heights = [max(vertex[2] for vertex in spec["verts"]) - min(vertex[2] for vertex in spec["verts"])
                    for spec in s["falls"]]
    tall_falls = [height for height in fall_heights if 4 - 1e-5 <= height <= 8 + 1e-5]
    if sid == "meadow" and not 3 <= len(tall_falls) <= 4:
        raise RuntimeError("meadow の滝が 4～8 段で 3～4 本ではありません: {}".format(fall_heights))
    repairs, reached, total = repair_walkability(s)
    ratio = len(reached) / total if total else 0
    if ratio < .65:
        raise RuntimeError("{} 歩ける割合が65%未満: {:.1f}%".format(sid, ratio * 100))
    make_props(s, seed)
    reached, allowed = flood(s)
    total = sum(allowed)
    ratio = len(reached) / total if total else 0
    if ratio < .65:
        raise RuntimeError("{} walkable ratio after props {:.1f}%".format(sid, ratio * 100))
    heights = [h for h in s["heights"] if h >= 0]
    if not heights or min(heights) < 0 or max(heights) > 28:
        raise RuntimeError("{} height範囲が0..28ではありません".format(sid))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    base = min(heights) - (1 if sid == "skyisles" else 7)
    objects = make_stage_objects(s, seed, base)
    tri = triangles(objects)
    if tri > 300000:
        raise RuntimeError("{} 三角形が30万を超えました: {}".format(sid, tri))
    color_min, color_avg = color_stats(objects)
    export_glb(objects, out / (sid + ".glb"))
    glb_bytes = (out / (sid + ".glb")).stat().st_size
    if glb_bytes > 15 * 1024 * 1024:
        raise RuntimeError("{} GLB が15MBを超えました: {} bytes".format(sid, glb_bytes))
    output_json(s, out)
    if s["counts"]["trees"] < 60 or s["counts"]["small_props"] < 300 or s["counts"]["landmarks"] < 6:
        raise RuntimeError("{} 物の数が足りません: {}".format(sid, s["counts"]))
    changed_pct = changed_neighbor_ratio(s)
    conifer_pct = 100 * s["counts"]["conifers"] / max(1, s["counts"]["trees"])
    print("{:<9} {:>8} {:>8.2f} {:>8.1f}% {:>5}/{:<5} {:>5.1f}% {:>6} {:>4} {:>5} {:>7.3f} {:>7.3f} {:>8.2f}%".format(
        sid, tri, glb_bytes / (1024 * 1024), ratio * 100, s["counts"]["trees"], s["counts"]["conifers"],
        conifer_pct, s["counts"]["small_props"], s["counts"]["landmarks"], len(s["falls"]),
        color_min, color_avg, changed_pct))
    if preview:
        preview_materials(ROOT / "public" / "diorama" / "tex" / "atlas.png")
        render_stage(s, shots)


def main():
    parser = argparse.ArgumentParser(description="72x72 の箱庭を GLB と JSON に書き出す")
    parser.add_argument("--stage", required=True, choices=STAGE_IDS + ["all"])
    parser.add_argument("--seed", type=int)
    parser.add_argument("--out", default=str(ROOT / "public" / "diorama" / "stages"))
    parser.add_argument("--preview", action="store_true")
    args, _ = parser.parse_known_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    selected = STAGE_IDS if args.stage == "all" else [args.stage]
    out, shots = Path(args.out).resolve(), ROOT / "art" / "shots" / "diorama" / "gen"
    out.mkdir(parents=True, exist_ok=True)
    shots.mkdir(parents=True, exist_ok=True)
    print("stage     triangles  GLB_MB walkable trees/conifers conifer% small landmarks falls COLORmin COLORavg changedTop")
    for sid in selected:
        with (ROOT / "tools" / "diorama" / "stages" / (sid + ".json")).open("r", encoding="utf-8") as stream:
            config = json.load(stream)
        seed = args.seed if args.seed is not None else int(config.get("seed", 1))
        generate(config, out, shots, seed, args.preview)
    (out / "index.json").write_text(json.dumps(STAGE_IDS, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    hero = ROOT / "public" / "diorama" / "models" / "hero.glb"
    export_hero(hero)
    if args.preview:
        preview_hero(shots / "hero.png", ROOT / "public" / "diorama" / "tex" / "atlas.png")
        if "meadow" in selected:
            compare_meadow(shots)
    print("index.json: {}".format(out / "index.json"))
    print("hero.glb: {}".format(hero))
    if args.preview:
        print("shots: {}".format(shots))
        if "meadow" in selected:
            print("compare_meadow.png: {}".format(shots / "compare_meadow.png"))


if __name__ == "__main__":
    main()
