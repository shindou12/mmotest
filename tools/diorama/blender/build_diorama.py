"""契約に沿った箱庭の地形、歩行データ、GLB を生成する。"""

import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[3]
WIDTH = 48
DEPTH = 48
COUNT = WIDTH * DEPTH
TILE_SIZE = 256
ATLAS_WIDTH = 2048
ATLAS_HEIGHT = 1024
UV_MARGIN = 4
BEVEL_WIDTH = 0.15
BEVEL_SEGMENTS = 2
STAGE_IDS = ["meadow", "canyon", "snow", "volcano", "skyisles"]

ATLAS_TILES = {
    "grass_top": (0, 0), "grass_side": (1, 0), "dirt": (2, 0), "stone": (3, 0),
    "sand": (4, 0), "sandstone_side": (5, 0), "redrock": (6, 0), "cobble": (7, 0),
    "snow_top": (0, 1), "snow_side": (1, 1), "ice": (2, 1), "basalt": (3, 1),
    "ash": (4, 1), "lava": (5, 1), "obsidian": (6, 1), "planks": (7, 1),
    "turf_top": (0, 2), "turf_side": (1, 2), "cloudstone": (2, 2), "crystal": (3, 2),
    "bark": (4, 2), "leaves": (5, 2), "pine": (6, 2), "cactus": (7, 2),
    "mush_cap": (0, 3), "mush_stem": (1, 3), "deadwood": (2, 3), "flowers": (3, 3),
    "water": (4, 3), "pedestal": (5, 3), "rock": (6, 3), "spare": (7, 3),
}

PALETTE = {
    "grass_top": (0.30, 0.53, 0.19), "grass_side": (0.31, 0.45, 0.20),
    "dirt": (0.36, 0.24, 0.14), "stone": (0.39, 0.42, 0.43), "sand": (0.70, 0.53, 0.30),
    "sandstone_side": (0.67, 0.42, 0.23), "redrock": (0.47, 0.23, 0.15), "cobble": (0.37, 0.38, 0.36),
    "snow_top": (0.78, 0.87, 0.92), "snow_side": (0.66, 0.76, 0.83), "ice": (0.33, 0.69, 0.83),
    "basalt": (0.19, 0.21, 0.24), "ash": (0.35, 0.31, 0.29), "lava": (1.0, 0.16, 0.015),
    "obsidian": (0.12, 0.13, 0.21), "planks": (0.42, 0.25, 0.12),
    "turf_top": (0.22, 0.56, 0.49), "turf_side": (0.18, 0.43, 0.41), "cloudstone": (0.43, 0.48, 0.62),
    "crystal": (0.25, 0.78, 0.93), "bark": (0.30, 0.18, 0.11), "leaves": (0.21, 0.44, 0.20),
    "pine": (0.12, 0.31, 0.26), "cactus": (0.18, 0.40, 0.25), "mush_cap": (0.73, 0.32, 0.65),
    "mush_stem": (0.72, 0.65, 0.68), "deadwood": (0.25, 0.16, 0.12), "flowers": (0.90, 0.50, 0.37),
    "water": (0.14, 0.49, 0.71), "pedestal": (0.32, 0.17, 0.09), "rock": (0.43, 0.42, 0.38),
    "spare": (0.84, 0.82, 0.74),
}

LOGICAL_TOP = {
    "grass": "grass_top", "dirt": "dirt", "stone": "stone", "sand": "sand",
    "sandstone": "sand", "redrock": "redrock", "snow": "snow_top", "ice": "ice",
    "basalt": "basalt", "ash": "ash", "lava": "lava", "obsidian": "obsidian",
    "wood": "planks", "turf": "turf_top", "cloudstone": "cloudstone", "crystal": "crystal",
}


def index(i, k):
    return k * WIDTH + i


def inside(i, k):
    return 0 <= i < WIDTH and 0 <= k < DEPTH


def clamp(value, low, high):
    return max(low, min(high, value))


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(t):
    return t * t * (3.0 - 2.0 * t)


def hash_noise(ix, iz, seed):
    value = (ix * 374761393 + iz * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    value = ((value ^ (value >> 13)) * 1274126177) & 0xFFFFFFFF
    value ^= value >> 16
    return (value / 2147483647.5) - 1.0


def value_noise(x, z, spacing, seed):
    px = x / spacing
    pz = z / spacing
    ix = math.floor(px)
    iz = math.floor(pz)
    tx = smooth(px - ix)
    tz = smooth(pz - iz)
    a = lerp(hash_noise(ix, iz, seed), hash_noise(ix + 1, iz, seed), tx)
    b = lerp(hash_noise(ix, iz + 1, seed), hash_noise(ix + 1, iz + 1, seed), tx)
    return lerp(a, b, tz)


def fractal_noise(x, z, seed):
    return (value_noise(x, z, 14.0, seed) * 0.55
            + value_noise(x, z, 7.0, seed + 29) * 0.30
            + value_noise(x, z, 3.5, seed + 71) * 0.15)


def blank_stage(config, seed):
    return {
        "id": config["id"], "name": config["name"], "seed": seed,
        "heights": [-1] * COUNT, "surface_names": [config["materials"][0]] * COUNT,
        "materials": list(config["materials"]), "blocked": [0] * COUNT,
        "liquid": [0] * COUNT, "spawn": list(config["spawn"]), "water_level": config["waterLevel"],
        "light": config["light"], "ambience": config["ambience"], "particles": config["particles"],
        "props_boxes": [], "glow_boxes": [], "extra_terrain": [], "water_specs": [],
        "bridge_cells": set(), "ramp_count": 0, "planned_ramps": 0,
    }


def set_cell(stage, i, k, height, surface=None, liquid=None):
    if not inside(i, k):
        return
    cell = index(i, k)
    stage["heights"][cell] = int(height)
    if surface is not None:
        stage["surface_names"][cell] = surface
    if liquid is not None:
        stage["liquid"][cell] = liquid


def set_blocked(stage, i, k, value=1):
    if inside(i, k):
        stage["blocked"][index(i, k)] = value


def add_box(boxes, i, k, ground_height, tile, size, offset=(0.0, 0.0, 0.0), rotation=0.0, cell=None):
    boxes.append({
        "center": (i + 0.5 + offset[0], -(k + 0.5) + offset[1], ground_height + offset[2]),
        "size": size, "tile": tile, "rotation": rotation, "cell": cell,
    })


def row_line(start, end):
    """四近傍だけでつながる簡単なマンハッタン線を返す。"""
    i, k = start
    ti, tk = end
    cells = [(i, k)]
    step_i = 1 if ti > i else -1
    while i != ti:
        i += step_i
        cells.append((i, k))
    step_k = 1 if tk > k else -1
    while k != tk:
        k += step_k
        cells.append((i, k))
    return cells


def raster_line4(start, end):
    """斜め線を四近傍で連結したセル列にする。"""
    i, k = start
    ti, tk = end
    dx, dz = ti - i, tk - k
    steps = max(abs(dx), abs(dz), 1)
    cells = [(i, k)]
    for step in range(1, steps + 1):
        want_i = int(round(start[0] + dx * step / steps))
        want_k = int(round(start[1] + dz * step / steps))
        while i != want_i:
            i += 1 if want_i > i else -1
            cells.append((i, k))
        while k != want_k:
            k += 1 if want_k > k else -1
            cells.append((i, k))
    return cells


def near_cells(cx, cz, rx, rz, noise_seed=0, irregularity=0.0):
    cells = []
    for k in range(max(0, int(cz - rz - 2)), min(DEPTH, int(cz + rz + 3))):
        for i in range(max(0, int(cx - rx - 2)), min(WIDTH, int(cx + rx + 3))):
            d = ((i + 0.5 - cx) / rx) ** 2 + ((k + 0.5 - cz) / rz) ** 2
            jitter = value_noise(i, k, 4.0, noise_seed) * irregularity
            if d + jitter <= 1.0:
                cells.append((i, k))
    return cells


def meadow(stage, params, seed):
    for k in range(DEPTH):
        for i in range(WIDTH):
            n = fractal_noise(i, k, seed + 10)
            h = int(round(params["hillBase"] + n * params["hillAmplitude"] + 0.6 * math.sin(i * 0.12) * math.cos(k * 0.10)))
            peak_x, peak_k = params["hillPeak"]
            hill_height = int(round(params["hillPeakHeight"] - math.hypot(i + 0.5 - peak_x, k + 0.5 - peak_k) * 0.42))
            h = max(h, hill_height)
            set_cell(stage, i, k, clamp(h, 3, 8), "grass")

    cx, cz = params["lakeCenter"]
    rx, rz = params["lakeRadii"]
    for i, k in near_cells(cx, cz, rx, rz, seed + 11, 0.12):
        set_cell(stage, i, k, 3, "sand", 1)

    stream = []
    for i in range(45, 23, -1):
        k = int(round(31.0 - (i - 24) * 0.36 + math.sin(i * 0.23) * 2.0))
        stream.append((i, clamp(k, 0, 47)))
    stream.extend(row_line(stream[-1], (24, 22))[1:])
    for i, k in stream:
        for dk in (-1, 0):
            set_cell(stage, i, k + dk, 3, "sand", 1)

    bridge = row_line((18, 21), (30, 21))
    for i, k in bridge:
        if stage["liquid"][index(i, k)]:
            set_cell(stage, i, k, 4, "wood", 0)
            stage["bridge_cells"].add((i, k))
            add_box(stage["props_boxes"], i, k, 4, "planks", (0.96, 0.90, 0.13), offset=(0, 0, -0.05), cell=(i, k))
    for i in range(19, 30, 3):
        add_box(stage["props_boxes"], i, 21, 4, "bark", (0.16, 0.16, 0.62), offset=(0, 0, 0.30), cell=(i, 21))


def canyon_center(k):
    return 24.0 + 7.0 * math.sin((k + 2) * 0.13) + 1.8 * math.sin(k * 0.31)


def canyon(stage, params, seed):
    stage["planned_ramps"] = 2
    mesa_low, mesa_high = params["mesaHeight"]
    floor_low, floor_high = params["valleyFloor"]
    shelf_width = params["shelfWidth"]
    for k in range(DEPTH):
        center = canyon_center(k)
        for i in range(WIDTH):
            d = abs(i + 0.5 - center)
            if d < 4.0:
                h = floor_low + int(fractal_noise(i, k, seed + 20) > 0.35)
                h = min(floor_high, h)
                surface = "sand"
            elif d < 4.0 + shelf_width:
                h, surface = floor_high + 1, "sand"
            elif d < 4.0 + shelf_width * 2:
                h, surface = floor_high + 3, "sandstone"
            elif d < 4.0 + shelf_width * 3:
                h, surface = floor_high + 5, "sandstone"
            elif d < 4.0 + shelf_width * 4:
                h, surface = mesa_low - 1, "redrock"
            else:
                h = int(round((mesa_low + mesa_high) * 0.5 + 1.5 * fractal_noise(i, k, seed + 21)))
                h = clamp(h, mesa_low, mesa_high)
                surface = "sand"
            set_cell(stage, i, k, h, surface)

    # 二本の一段ずつ下る坂。幅二マスにして道を見つけやすくする。
    for z, direction in ((params["rampZ"][0], 1), (params["rampZ"][1], -1)):
        center = int(round(canyon_center(z)))
        top_h = int(round((mesa_low + mesa_high) * 0.5))
        floor_h = int(round((floor_low + floor_high) * 0.5))
        if direction > 0:
            path = [(i, z + dz) for i in range(4, center - 2) for dz in (0, 1)]
            path.sort(key=lambda p: (p[0], p[1]))
        else:
            path = [(i, z + dz) for i in range(43, center + 2, -1) for dz in (0, 1)]
            path.sort(key=lambda p: (-p[0], p[1]))
        length = max(1, len(path) // 2 - 1)
        for ordinal, (i, k) in enumerate(path):
            step = ordinal // 2
            h = max(floor_h, top_h - int(round((top_h - floor_h) * step / max(1, length - 1))))
            set_cell(stage, i, k, h, "sandstone")

    oasis_x, oasis_z = params["oasisCenter"]
    oasis_rx, oasis_rz = params["oasisRadii"]
    for i, k in near_cells(oasis_x, oasis_z, oasis_rx, oasis_rz, seed + 22, 0.08):
        set_cell(stage, i, k, floor_low, "sand", 1)


def line_distance(px, pz, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    denom = dx * dx + dz * dz
    t = 0.0 if denom == 0 else clamp(((px - ax) * dx + (pz - az) * dz) / denom, 0.0, 1.0)
    return math.hypot(px - (ax + t * dx), pz - (az + t * dz)), t


def snow(stage, params, seed):
    stage["planned_ramps"] = 1
    peaks = params["peaks"]
    for k in range(DEPTH):
        for i in range(WIDTH):
            values = []
            for cx, cz, top, slope in peaks:
                d = math.hypot(i + 0.5 - cx, k + 0.5 - cz)
                values.append(top - d * slope)
            raw = max(3.2, max(values) + fractal_noise(i, k, seed + 30) * 0.65)
            h = int(round(3 + math.floor(max(0.0, raw - 3) / 2.0) * 2))
            set_cell(stage, i, k, clamp(h, 3, 18), "snow")

    # ふもとから主峰へ続く道。地形を一段ずつ上げる。
    trail_points = params["trail"]
    trail = []
    for start, end in zip(trail_points, trail_points[1:]):
        trail.extend(raster_line4(tuple(start), tuple(end)) if not trail else raster_line4(tuple(start), tuple(end))[1:])
    trail = [(i, k) for i, k in trail if inside(i, k)]
    start_h = stage["heights"][index(*trail[0])]
    end_h = stage["heights"][index(*trail[-1])]
    for n, (i, k) in enumerate(trail):
        h = int(round(lerp(start_h, end_h, n / max(1, len(trail) - 1))) )
        h = min(h, stage["heights"][index(i, k)])
        set_cell(stage, i, k, max(3, h), "snow")

    lake_x, lake_z = params["lakeCenter"]
    for i, k in near_cells(lake_x, lake_z, params["lakeRadii"][0], params["lakeRadii"][1], seed + 31, 0.05):
        set_cell(stage, i, k, 3, "ice", 3)


def volcano(stage, params, seed):
    cx, cz = params["center"]
    crater_radius = params["craterRadius"]
    mountain_height = params["mountainHeight"]
    for k in range(DEPTH):
        for i in range(WIDTH):
            d = math.hypot(i + 0.5 - cx, k + 0.5 - cz)
            if d < crater_radius:
                h, surface = 8, "ash"
            elif d < crater_radius + 2.1:
                h, surface = mountain_height, "basalt"
            else:
                tier = max(0, int((d - crater_radius - 2.1) / 3.0))
                h = max(3, mountain_height - 1 - tier * 2 + int(round(fractal_noise(i, k, seed + 40) * 0.5)))
                surface = "basalt" if d < 12 or tier % 2 == 0 else "ash"
            set_cell(stage, i, k, h, surface)
            if d < crater_radius - 0.2:
                stage["liquid"][index(i, k)] = 2

    rivers = params["rivers"]
    for angle in rivers:
        end_i = int(round(cx + math.cos(angle) * 22.0))
        end_k = int(round(cz + math.sin(angle) * 22.0))
        start_i = int(round(cx + math.cos(angle) * (crater_radius - 0.2)))
        start_k = int(round(cz + math.sin(angle) * (crater_radius - 0.2)))
        path = raster_line4((start_i, start_k), (end_i, end_k))
        for ordinal, (i, k) in enumerate(path):
            if not inside(i, k):
                continue
            for offset in (0, 1):
                x, z = i, k + offset
                if inside(x, z) and math.hypot(x + 0.5 - cx, z + 0.5 - cz) > 3.0:
                    stage["liquid"][index(x, z)] = 2

    # 冷えた岩橋が東向きの溶岩を越える。
    bridge = row_line((29, 24), (38, 24))
    for i, k in bridge:
        if stage["liquid"][index(i, k)] == 2:
            set_cell(stage, i, k, max(6, stage["heights"][index(i, k)]), "obsidian", 0)
            stage["bridge_cells"].add((i, k))
            add_box(stage["props_boxes"], i, k, stage["heights"][index(i, k)], "obsidian",
                    (0.96, 0.90, 0.18), offset=(0, 0, -0.08), cell=(i, k))


def skyisles(stage, params, seed):
    islands = params["islands"]
    for number, (cx, cz, radius, base) in enumerate(islands):
        for i, k in near_cells(cx, cz, radius, radius * 0.86, seed + 100 + number, 0.0):
            d = math.hypot((i + 0.5 - cx), (k + 0.5 - cz) / 0.86)
            h = base + int(max(0.0, min(2.0, (radius - d) * 0.36)))
            set_cell(stage, i, k, h, "turf")

    # 距離が近い島から順につなぐ最小全域木。
    connected = {0}
    links = []
    while len(connected) < len(islands):
        best = None
        for a in connected:
            for b in range(len(islands)):
                if b in connected:
                    continue
                ax, az, _, _ = islands[a]
                bx, bz, _, _ = islands[b]
                distance = math.hypot(ax - bx, az - bz)
                if best is None or distance < best[0]:
                    best = (distance, a, b)
        _, a, b = best
        connected.add(b)
        links.append((a, b))

    for a, b in links:
        ax, az, _, ah = islands[a]
        bx, bz, _, bh = islands[b]
        path = raster_line4((int(round(ax)), int(round(az))), (int(round(bx)), int(round(bz))))
        for ordinal, (i, k) in enumerate(path):
            if not inside(i, k):
                continue
            t = ordinal / max(1, len(path) - 1)
            h = int(round(lerp(ah, bh, t)))
            set_cell(stage, i, k, h, "wood")
            stage["bridge_cells"].add((i, k))
            add_box(stage["props_boxes"], i, k, h, "planks", (0.93, 0.92, 0.12),
                    offset=(0, 0, -0.05), cell=(i, k))

    # 浮島の逆円すいは、島のふちから下の一点へ集める。
    for number, (cx, cz, radius, base) in enumerate(islands):
        segments = 16
        rim = []
        for j in range(segments):
            angle = j * (math.tau / segments)
            rim.append((cx + math.cos(angle) * radius, -(cz + math.sin(angle) * radius * 0.86), base - 0.1))
        depth_low, depth_high = params["undersideDepth"]
        depth = lerp(depth_low, depth_high, (number % 3) / 2.0)
        tip = (cx, -cz, base - depth)
        for j in range(segments):
            stage["extra_terrain"].append({
                "verts": [rim[j], rim[(j + 1) % segments], tip], "tile": "cloudstone",
            })

    # 浮島ごとに水の板を垂らす。
    for number, (cx, cz, radius, base) in enumerate(islands):
        if number % 2:
            continue
        x = cx + radius * 1.02
        y = -cz - 0.3
        bottom = base - 3.8
        stage["water_specs"].append({
            "verts": [(x, y - 0.8, bottom), (x, y + 0.8, bottom),
                      (x, y + 0.8, base + 0.2), (x, y - 0.8, base + 0.2)],
            "tile": "water",
        })

    stage["spawn"] = [int(round(islands[1][0])), int(round(islands[1][1]))]


def add_tree(stage, i, k, rng, tile="leaves", height_scale=1.0):
    cell = index(i, k)
    ground = stage["heights"][cell]
    if ground < 0:
        return
    stage["blocked"][cell] = 1
    yaw = rng.random() * math.tau
    trunk_h = rng.uniform(1.45, 2.0) * height_scale
    add_box(stage["props_boxes"], i, k, ground, "bark",
            (0.24 * height_scale, 0.24 * height_scale, trunk_h),
            offset=(0, 0, trunk_h * 0.5), rotation=yaw, cell=(i, k))
    for n in range(2 + rng.randrange(3)):
        ox = rng.uniform(-0.42, 0.42) * height_scale
        oy = rng.uniform(-0.42, 0.42) * height_scale
        oz = trunk_h + rng.uniform(0.18, 0.68) * height_scale
        sx = rng.uniform(0.7, 1.05) * height_scale
        sy = rng.uniform(0.65, 0.95) * height_scale
        sz = rng.uniform(0.55, 0.82) * height_scale
        add_box(stage["props_boxes"], i, k, ground, tile, (sx, sy, sz),
                offset=(ox, oy, oz), rotation=rng.random() * math.tau, cell=(i, k))


def add_rock(stage, i, k, rng, tile="rock", scale=1.0):
    cell = index(i, k)
    ground = stage["heights"][cell]
    if ground < 0:
        return
    stage["blocked"][cell] = 1
    add_box(stage["props_boxes"], i, k, ground, tile,
            (rng.uniform(0.55, 0.9) * scale, rng.uniform(0.52, 0.82) * scale, rng.uniform(0.55, 0.95) * scale),
            offset=(0, 0, 0.42 * scale), rotation=rng.random() * math.tau, cell=(i, k))
    if rng.random() < 0.7:
        add_box(stage["props_boxes"], i, k, ground, tile,
                (0.42 * scale, 0.38 * scale, 0.38 * scale),
                offset=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 0.22 * scale),
                rotation=rng.random() * math.tau, cell=(i, k))


def choose_cells(stage, count, seed, min_spawn_distance=6, edge=3):
    si, sk = stage["spawn"]
    cells = []
    for k in range(edge, DEPTH - edge):
        for i in range(edge, WIDTH - edge):
            cell = index(i, k)
            if stage["heights"][cell] < 0 or stage["liquid"][cell] in (2, 3) or stage["blocked"][cell]:
                continue
            if (i, k) in stage["bridge_cells"] or math.hypot(i - si, k - sk) < min_spawn_distance:
                continue
            cells.append((i, k))
    random.Random(seed).shuffle(cells)
    return cells[:count]


def make_props(stage, params, seed):
    rng = random.Random(seed + 500)
    sid = stage["id"]
    if sid == "meadow":
        tree_min, tree_max = params["treeCount"]
        tree_count = rng.randint(tree_min, tree_max)
        for i, k in choose_cells(stage, tree_count, seed + 51):
            add_tree(stage, i, k, rng, "leaves", rng.uniform(0.85, 1.15))
        for i, k in choose_cells(stage, 10, seed + 52, min_spawn_distance=4):
            add_rock(stage, i, k, rng, "rock", rng.uniform(0.65, 1.0))
        for i, k in choose_cells(stage, 54, seed + 53, min_spawn_distance=2):
            ground = stage["heights"][index(i, k)]
            add_box(stage["props_boxes"], i, k, ground, "flowers", (0.12, 0.12, 0.22), offset=(0, 0, 0.12), cell=(i, k))
            if rng.random() < 0.35:
                add_box(stage["props_boxes"], i, k, ground, "flowers", (0.09, 0.09, 0.18),
                        offset=(0.18, 0.08, 0.10), rotation=rng.random() * math.tau, cell=(i, k))
    elif sid == "canyon":
        oasis_x, oasis_z = params["oasisCenter"]
        oasis_rx, oasis_rz = params["oasisRadii"]
        grove = [
            (int(round(oasis_x - oasis_rx - 1)), int(round(oasis_z))),
            (int(round(oasis_x + oasis_rx + 1)), int(round(oasis_z))),
            (int(round(oasis_x)), int(round(oasis_z - oasis_rz - 1))),
            (int(round(oasis_x)), int(round(oasis_z + oasis_rz + 1))),
        ]
        for i, k in grove:
            if inside(i, k) and stage["heights"][index(i, k)] >= 0 and not stage["liquid"][index(i, k)]:
                add_tree(stage, i, k, rng, "leaves", 0.85)
        for i, k in choose_cells(stage, 12, seed + 61, min_spawn_distance=7):
            cell = index(i, k)
            g = stage["heights"][cell]
            stage["blocked"][cell] = 1
            add_box(stage["props_boxes"], i, k, g, "cactus", (0.28, 0.28, 1.35), offset=(0, 0, 0.66), cell=(i, k))
            add_box(stage["props_boxes"], i, k, g, "cactus", (0.60, 0.20, 0.18), offset=(0.30, 0, 0.78), cell=(i, k))
            add_box(stage["props_boxes"], i, k, g, "cactus", (0.20, 0.20, 0.60), offset=(0.50, 0, 0.48), cell=(i, k))
        for i, k in choose_cells(stage, 8, seed + 62, min_spawn_distance=5):
            add_rock(stage, i, k, rng, "redrock", rng.uniform(0.9, 1.3))
        for i, k in choose_cells(stage, 5, seed + 63, min_spawn_distance=9):
            g = stage["heights"][index(i, k)]
            stage["blocked"][index(i, k)] = 1
            add_box(stage["props_boxes"], i, k, g, "redrock", (0.58, 0.58, 2.4), offset=(0, 0, 1.18), cell=(i, k))
        # 一つの石のアーチ。柱の根元は歩けないマス。
        ai, ak = 31, 26
        for dx in (0, 3):
            x, z = ai + dx, ak
            if inside(x, z):
                g = stage["heights"][index(x, z)]
                stage["blocked"][index(x, z)] = 1
                add_box(stage["props_boxes"], x, z, g, "sandstone_side", (0.62, 0.74, 2.0), offset=(0, 0, 0.98), cell=(x, z))
        g = stage["heights"][index(ai + 1, ak)]
        add_box(stage["props_boxes"], ai + 1, ak, g, "sandstone_side", (3.3, 0.78, 0.55), offset=(0, 0, 2.12), cell=(ai + 1, ak))
        for i, k in choose_cells(stage, 5, seed + 64, min_spawn_distance=4):
            g = stage["heights"][index(i, k)]
            add_box(stage["props_boxes"], i, k, g, "deadwood", (0.22, 0.22, 1.25), offset=(0, 0, 0.62), rotation=rng.uniform(-0.2, 0.2), cell=(i, k))
    elif sid == "snow":
        for i, k in choose_cells(stage, 11, seed + 71, min_spawn_distance=6):
            cell = index(i, k)
            g = stage["heights"][cell]
            stage["blocked"][cell] = 1
            h = rng.uniform(2.0, 3.2)
            add_box(stage["props_boxes"], i, k, g, "bark", (0.24, 0.24, h), offset=(0, 0, h * 0.5), rotation=rng.random() * math.tau, cell=(i, k))
            for n in range(3):
                radius = 0.9 - n * 0.18
                add_box(stage["props_boxes"], i, k, g, "pine", (radius, radius * 0.9, 0.78),
                        offset=(0, 0, h * 0.3 + n * 0.58), rotation=rng.random() * math.tau, cell=(i, k))
        for i, k in choose_cells(stage, 9, seed + 72, min_spawn_distance=5):
            g = stage["heights"][index(i, k)]
            stage["blocked"][index(i, k)] = 1
            h = rng.uniform(1.2, 2.8)
            add_box(stage["props_boxes"], i, k, g, "ice", (0.42, 0.42, h), offset=(0, 0, h * 0.5), rotation=rng.uniform(-0.15, 0.15), cell=(i, k))
        for i, k in choose_cells(stage, 7, seed + 73, min_spawn_distance=4):
            add_rock(stage, i, k, rng, "stone", 0.9)
    elif sid == "volcano":
        for i, k in choose_cells(stage, 10, seed + 81, min_spawn_distance=8):
            g = stage["heights"][index(i, k)]
            add_box(stage["props_boxes"], i, k, g, "deadwood", (0.24, 0.24, 1.5), offset=(0, 0, 0.70), rotation=rng.random() * math.tau, cell=(i, k))
            add_box(stage["props_boxes"], i, k, g, "deadwood", (0.85, 0.18, 0.15), offset=(0.32, 0, 0.88), rotation=rng.random() * math.tau, cell=(i, k))
        for i, k in choose_cells(stage, 8, seed + 82, min_spawn_distance=5):
            g = stage["heights"][index(i, k)]
            stage["blocked"][index(i, k)] = 1
            h = rng.uniform(1.3, 2.5)
            add_box(stage["props_boxes"], i, k, g, "obsidian", (0.48, 0.48, h), offset=(0, 0, h * 0.5), cell=(i, k))
        for i, k in choose_cells(stage, 8, seed + 83, min_spawn_distance=4):
            add_rock(stage, i, k, rng, "basalt", 0.9)
    elif sid == "skyisles":
        for n, (cx, cz, radius, base) in enumerate(params["islands"]):
            i, k = int(round(cx)), int(round(cz))
            g = stage["heights"][index(i, k)]
            stage["blocked"][index(i, k)] = 1
            h = 1.6 + (n % 2) * 0.25
            add_box(stage["props_boxes"], i, k, g, "mush_stem", (0.62, 0.62, h), offset=(0, 0, h * 0.5), cell=(i, k))
            for scale, offset in ((1.0, 0.0), (0.78, 0.36), (0.50, 0.66)):
                add_box(stage["glow_boxes"], i, k, g, "mush_cap", (2.1 * scale, 1.85 * scale, 0.46),
                        offset=(0, 0, h + offset), cell=(i, k))
        for i, k in choose_cells(stage, 12, seed + 91, min_spawn_distance=3):
            g = stage["heights"][index(i, k)]
            stage["blocked"][index(i, k)] = 1
            h = rng.uniform(1.1, 2.0)
            add_box(stage["glow_boxes"], i, k, g, "crystal", (0.34, 0.34, h), offset=(0, 0, h * 0.5), rotation=rng.uniform(-0.1, 0.1), cell=(i, k))
            add_box(stage["glow_boxes"], i, k, g, "crystal", (0.65, 0.17, 0.12), offset=(0, 0, h * 0.64), rotation=rng.random() * math.tau, cell=(i, k))


def walkable_mask(stage):
    return [h >= 0 and not stage["blocked"][n] and stage["liquid"][n] != 2
            for n, h in enumerate(stage["heights"])]


def flood(stage):
    walkable = walkable_mask(stage)
    si, sk = stage["spawn"]
    start = index(si, sk)
    if not inside(si, sk) or not walkable[start]:
        options = [n for n, ok in enumerate(walkable) if ok]
        if not options:
            return set(), walkable
        start = min(options, key=lambda n: (n // WIDTH - sk) ** 2 + (n % WIDTH - si) ** 2)
        stage["spawn"] = [start % WIDTH, start // WIDTH]
    reached = {start}
    queue = [start]
    head = 0
    while head < len(queue):
        current = queue[head]
        head += 1
        i, k = current % WIDTH, current // WIDTH
        h = stage["heights"][current]
        for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ni, nk = i + di, k + dk
            if not inside(ni, nk):
                continue
            neighbor = index(ni, nk)
            if walkable[neighbor] and neighbor not in reached and stage["heights"][neighbor] <= h + 1:
                reached.add(neighbor)
                queue.append(neighbor)
    return reached, walkable


def repair_walkability(stage):
    repairs = 0
    while repairs < COUNT:
        reached, walkable = flood(stage)
        total = sum(walkable)
        if not total or len(reached) / total >= 0.70:
            return repairs, len(reached), total
        # 地形としてつながる最短経路を探し、急な上りだけを一段ずつにする。
        queue = list(reached)
        previous = {node: None for node in reached}
        target = None
        head = 0
        while head < len(queue) and target is None:
            current = queue[head]
            head += 1
            i, k = current % WIDTH, current // WIDTH
            for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ni, nk = i + di, k + dk
                if not inside(ni, nk):
                    continue
                neighbor = index(ni, nk)
                if not walkable[neighbor] or neighbor in previous:
                    continue
                previous[neighbor] = current
                if neighbor not in reached:
                    target = neighbor
                    break
                queue.append(neighbor)
        if target is None:
            return repairs, len(reached), total
        path = [target]
        while previous[path[-1]] is not None:
            path.append(previous[path[-1]])
        path.reverse()
        changed = False
        for a, b in zip(path, path[1:]):
            limit = stage["heights"][a] + 1
            if stage["heights"][b] > limit:
                stage["heights"][b] = limit
                changed = True
        if not changed:
            return repairs, len(reached), total
        repairs += 1
    reached, walkable = flood(stage)
    return repairs, len(reached), sum(walkable)


def shift_attached_boxes(boxes, old_heights, new_heights):
    for box in boxes:
        cell = box.get("cell")
        if cell is None:
            continue
        i, k = cell
        n = index(i, k)
        dz = new_heights[n] - old_heights[n]
        if dz:
            center = list(box["center"])
            center[2] += dz
            box["center"] = tuple(center)


def top_tile(logical):
    return LOGICAL_TOP.get(logical, "rock")


def side_tile(stage, logical, row, top):
    depth = top - row
    sid = stage["id"]
    if sid == "meadow":
        return "grass_side" if depth == 1 else "dirt" if depth <= 3 else "stone"
    if sid == "canyon":
        return "sandstone_side" if logical in ("sand", "sandstone") and depth == 1 else (
            "redrock" if depth >= 5 else "sand")
    if sid == "snow":
        return "snow_side" if depth == 1 else "snow_top" if depth <= 3 else "stone"
    if sid == "volcano":
        return "basalt" if depth <= 2 else "ash" if depth <= 4 else "obsidian"
    return "turf_side" if depth == 1 else "cloudstone"


def make_face(verts, tile):
    return {"verts": [tuple(v) for v in verts], "tile": tile}


def add_top_face(faces, i, k, z, tile):
    faces.append(make_face([(i, -k - 1, z), (i + 1, -k - 1, z),
                            (i + 1, -k, z), (i, -k, z)], tile))


def add_side_faces(faces, i, k, low, high, direction, tile_for_row):
    for row in range(int(low), int(high)):
        z0, z1 = row, row + 1
        tile = tile_for_row(row)
        if direction == "east":
            verts = [(i + 1, -k - 1, z0), (i + 1, -k, z0), (i + 1, -k, z1), (i + 1, -k - 1, z1)]
        elif direction == "west":
            verts = [(i, -k, z0), (i, -k - 1, z0), (i, -k - 1, z1), (i, -k, z1)]
        elif direction == "south":
            verts = [(i, -k - 1, z0), (i + 1, -k - 1, z0), (i + 1, -k - 1, z1), (i, -k - 1, z1)]
        else:  # north
            verts = [(i + 1, -k, z0), (i, -k, z0), (i, -k, z1), (i + 1, -k, z1)]
        faces.append(make_face(verts, tile))


def box_faces(box):
    cx, cy, cz = box["center"]
    sx, sy, sz = box["size"]
    hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
    angle = box.get("rotation", 0.0)
    c, s = math.cos(angle), math.sin(angle)
    points = []
    for x, y, z in ((-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
                    (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)):
        points.append((cx + x * c - y * s, cy + x * s + y * c, cz + z))
    face_indices = ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                    (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5))
    return [make_face([points[n] for n in face], box["tile"]) for face in face_indices]


def terrain_faces(stage, base_level):
    faces = []
    old_heights = stage["heights"]
    for k in range(DEPTH):
        for i in range(WIDTH):
            n = index(i, k)
            h = old_heights[n]
            if h < 0:
                continue
            logical = stage["surface_names"][n]
            add_top_face(faces, i, k, h, top_tile(logical))
            for direction, di, dk in (("east", 1, 0), ("west", -1, 0), ("south", 0, 1), ("north", 0, -1)):
                ni, nk = i + di, k + dk
                low = base_level if not inside(ni, nk) else old_heights[index(ni, nk)]
                if stage["id"] == "skyisles" and low < 0:
                    low = h - 1
                if low < 0:
                    low = base_level
                if h > low:
                    add_side_faces(faces, i, k, low, h, direction,
                                   lambda row, logical=logical, h=h: side_tile(stage, logical, row, h))

    faces.extend(stage["extra_terrain"])
    if stage["id"] != "skyisles":
        # 角を丸めた木の台。上端は地形切断面に接する。
        faces.extend(box_faces({"center": (24.0, -24.0, base_level - 0.72),
                                "size": (50.0, 50.0, 1.44), "tile": "pedestal"}))
    return faces


def liquid_faces(stage):
    water = []
    glow = []
    for k in range(DEPTH):
        for i in range(WIDTH):
            n = index(i, k)
            kind = stage["liquid"][n]
            h = stage["heights"][n]
            if kind in (1, 3):
                z = stage["water_level"] if kind == 1 else h + 0.025
                add_top_face(water, i, k, z, "water" if kind == 1 else "ice")
            elif kind == 2:
                add_top_face(glow, i, k, h + 0.035, "lava")
    water.extend(stage["water_specs"])
    return water, glow


def srgb_to_linear(value):
    if value <= 0.04045:
        return value / 12.92
    return ((value + 0.055) / 1.055) ** 2.4


def node_material(tile, color_override=None, emissive=False):
    name = tile
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    material = bpy.data.materials.new(name)
    rgb = color_override if color_override is not None else PALETTE.get(tile, (0.8, 0.8, 0.8))
    rgba = tuple(srgb_to_linear(c) for c in rgb) + (1.0,)
    material.diffuse_color = rgba
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba
    shader.inputs["Roughness"].default_value = 0.78
    color_node = nodes.new("ShaderNodeVertexColor")
    color_node.layer_name = "Color"
    multiply = nodes.new("ShaderNodeMixRGB")
    multiply.blend_type = "MULTIPLY"
    multiply.inputs[0].default_value = 1.0
    multiply.inputs[1].default_value = rgba
    links.new(color_node.outputs["Color"], multiply.inputs[2])
    links.new(multiply.outputs["Color"], shader.inputs["Base Color"])
    if emissive:
        if "Emission Color" in shader.inputs:
            shader.inputs["Emission Color"].default_value = rgba
            shader.inputs["Emission Strength"].default_value = 0.65
        elif "Emission" in shader.inputs:
            shader.inputs["Emission"].default_value = rgba
    return material


def object_from_faces(name, specs, seed, bevel=True, smooth_normals=True, color_override=None):
    if not specs:
        return None
    tiles = sorted({spec["tile"] for spec in specs})
    for tile in tiles:
        if tile not in ATLAS_TILES:
            raise ValueError("未定義のアトラスマス: " + tile)
    mesh = bpy.data.meshes.new(name)
    vertices = []
    faces = []
    material_for_face = []
    vertex_lookup = {}
    for spec in specs:
        face = []
        group = spec.get("group")
        for co in spec["verts"]:
            position = tuple(round(float(value), 5) for value in co)
            key = (group, position) if group is not None else position
            vertex = vertex_lookup.get(key)
            if vertex is None:
                vertex = len(vertices)
                vertex_lookup[key] = vertex
                vertices.append(position)
            face.append(vertex)
        if len(set(face)) >= 3:
            faces.append(face)
            material_for_face.append(tiles.index(spec["tile"]))
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for tile in tiles:
        emissive = tile in ("lava", "crystal", "mush_cap")
        material_color = (1.0, 1.0, 1.0) if color_override is not None else None
        mesh.materials.append(node_material(tile, color_override=material_color, emissive=emissive))
    for polygon, material_index in zip(mesh.polygons, material_for_face):
        polygon.material_index = material_index

    bm = bmesh.new()
    bm.from_mesh(mesh)
    if bm.verts:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00002)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if bevel and mesh.edges:
        mod = obj.modifiers.new("Rounded block edges", "BEVEL")
        mod.width = BEVEL_WIDTH
        mod.segments = BEVEL_SEGMENTS
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(30.0)
        mod.harden_normals = True
        mod.use_clamp_overlap = True
        mod.loop_slide = True
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    if smooth_normals:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        try:
            normal = obj.modifiers.new("Area weighted normals", "WEIGHTED_NORMAL")
            normal.keep_sharp = True
            normal.weight = 50
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.modifier_apply(modifier=normal.name)
            obj.select_set(False)
        except Exception:
            pass

    assign_uvs(obj.data, tiles)
    assign_colors(obj.data, seed, color_override)
    return obj


def assign_uvs(mesh, tiles):
    layer = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        slot = polygon.material_index
        tile = tiles[slot] if 0 <= slot < len(tiles) else tiles[0]
        col, row = ATLAS_TILES[tile]
        normal = polygon.normal
        if abs(normal.z) >= abs(normal.x) and abs(normal.z) >= abs(normal.y):
            axes = (0, 1)
            sign = (1.0, -1.0)
        elif abs(normal.x) >= abs(normal.y):
            axes = (1, 2)
            sign = (-1.0, 1.0)
        else:
            axes = (0, 2)
            sign = (1.0, 1.0)
        coords = []
        for vertex_index in polygon.vertices:
            co = mesh.vertices[vertex_index].co
            coords.append((co[axes[0]] * sign[0], co[axes[1]] * sign[1]))
        minima = [min(p[a] for p in coords) for a in (0, 1)]
        maxima = [max(p[a] for p in coords) for a in (0, 1)]
        spans = [max(1e-6, maxima[a] - minima[a]) for a in (0, 1)]
        for loop_index, pair in zip(polygon.loop_indices, coords):
            fu = clamp((pair[0] - minima[0]) / spans[0], 0.0, 1.0)
            fv = clamp((pair[1] - minima[1]) / spans[1], 0.0, 1.0)
            u_px = col * TILE_SIZE + UV_MARGIN + fu * (TILE_SIZE - UV_MARGIN * 2)
            y_px = row * TILE_SIZE + UV_MARGIN + fv * (TILE_SIZE - UV_MARGIN * 2)
            layer.data[loop_index].uv = (u_px / ATLAS_WIDTH, 1.0 - y_px / ATLAS_HEIGHT)


def assign_colors(mesh, seed, color_override=None):
    color_layer = mesh.color_attributes.get("Color")
    if color_layer is None:
        color_layer = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
    mesh.color_attributes.active_color_index = list(mesh.color_attributes).index(color_layer)
    for polygon in mesh.polygons:
        center = polygon.center
        coord_seed = int(round((center.x * 31.0 + center.y * 17.0 + center.z * 11.0) * 1000)) + seed
        variation = 0.94 + (hash_noise(coord_seed, polygon.index, seed) + 1.0) * 0.06
        ao = 0.98 if abs(polygon.normal.z) > 0.9 else 0.90
        if color_override is not None:
            base = tuple(srgb_to_linear(c) for c in color_override)
        else:
            base = (ao * variation, ao * variation, ao * variation)
        for loop_index in polygon.loop_indices:
            color_layer.data[loop_index].color = (base[0], base[1], base[2], 1.0)


def finish_stage_scene(stage, params, base_level):
    terrain_specs = terrain_faces(stage, base_level)
    prop_specs = []
    for box_id, box in enumerate(stage["props_boxes"]):
        for face in box_faces(box):
            face["group"] = ("props", box_id)
            prop_specs.append(face)
    glow_specs = []
    for box_id, box in enumerate(stage["glow_boxes"]):
        for face in box_faces(box):
            face["group"] = ("glow", box_id)
            glow_specs.append(face)
    water_specs, lava_specs = liquid_faces(stage)
    glow_specs.extend(lava_specs)
    objects = []
    for name, specs in (("terrain", terrain_specs), ("props", prop_specs), ("glow", glow_specs), ("water", water_specs)):
        if specs:
            obj = object_from_faces(name, specs, stage["seed"] + len(objects) * 101)
            objects.append(obj)
    return objects


def triangle_count(objects):
    count = 0
    for obj in objects:
        obj.data.calc_loop_triangles()
        count += len(obj.data.loop_triangles)
    return count


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


def setup_render(scene, output_path, focus_point, ortho_width, camera_offset):
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = str(output_path)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    world = bpy.data.worlds.new("Diorama preview world") if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.66, 0.77, 0.88, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55

    camera_data = bpy.data.cameras.new("Preview camera")
    camera = bpy.data.objects.new("Preview camera", camera_data)
    scene.collection.objects.link(camera)
    focus = Vector(focus_point)
    camera.location = focus + Vector(camera_offset)
    camera.rotation_euler = (focus - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = ortho_width
    scene.camera = camera

    sun_data = bpy.data.lights.new("Soft sun", type="SUN")
    sun = bpy.data.objects.new("Soft sun", sun_data)
    scene.collection.objects.link(sun)
    sun_data.energy = 2.1
    sun_data.angle = math.radians(18.0)
    sun.rotation_euler = Vector((-0.45, 0.35, -1.0)).to_track_quat("-Z", "Y").to_euler()

    area_data = bpy.data.lights.new("Large softbox", type="AREA")
    area = bpy.data.objects.new("Large softbox", area_data)
    scene.collection.objects.link(area)
    area.location = focus + Vector((5.0, -16.0, 28.0))
    area_data.energy = 4200
    area_data.shape = "DISK"
    area_data.size = 24.0
    area.rotation_euler = (focus - area.location).to_track_quat("-Z", "Y").to_euler()


def render_stage(stage, target):
    heights = [h for h in stage["heights"] if h >= 0]
    high = max(heights) if heights else 10
    if stage["id"] == "skyisles":
        focus_z = sum(stage["heights"][n] for n in range(COUNT) if stage["heights"][n] >= 0) / max(1, len(heights))
    else:
        focus_z = (high + min(heights)) * 0.5 - 0.3
    ortho_width = 112.0 if stage["id"] == "skyisles" else 102.0
    setup_render(bpy.context.scene, target, (24.0, -24.0, focus_z), ortho_width, (49.0, -61.0, 55.0))
    bpy.context.scene.camera.data.lens = 50.0
    bpy.context.scene.render.filepath = str(target)
    bpy.ops.render.render(write_still=True)


def hero_parts():
    parts = []
    component_data = [
        ("body", (0, 0, 0.52), (0, 0, 0.25), (0.40, 0.31, 0.54), (0.22, 0.38, 0.67)),
        ("head", (0, 0, 1.04), (0, 0, 0.20), (0.36, 0.36, 0.40), (0.80, 0.63, 0.43)),
        ("armL", (-0.27, 0, 0.98), (0, 0, -0.21), (0.18, 0.20, 0.42), (0.22, 0.38, 0.67)),
        ("armR", (0.27, 0, 0.98), (0, 0, -0.21), (0.18, 0.20, 0.42), (0.22, 0.38, 0.67)),
        ("legL", (-0.11, 0, 0.52), (0, 0, -0.26), (0.18, 0.22, 0.52), (0.18, 0.20, 0.23)),
        ("legR", (0.11, 0, 0.52), (0, 0, -0.26), (0.18, 0.22, 0.52), (0.18, 0.20, 0.23)),
        ("cape", (0, 0.16, 1.02), (0, 0, -0.35), (0.40, 0.12, 0.70), (0.60, 0.12, 0.10)),
    ]
    root = bpy.data.objects.new("hero", None)
    bpy.context.scene.collection.objects.link(root)
    for name, location, local_center, size, color in component_data:
        face_specs = box_faces({"center": local_center, "size": size, "tile": "spare"})
        obj = object_from_faces(name, face_specs, 111, bevel=True, color_override=color)
        obj.location = location
        obj.parent = root
        parts.append(obj)
        if name == "head":
            eyes = []
            for x in (-0.09, 0.09):
                eyes.extend(box_faces({"center": (x, -0.19, 0.20),
                                       "size": (0.045, 0.028, 0.052), "tile": "spare"}))
            eye_obj = object_from_faces("eyes", eyes, 112, bevel=True, color_override=(0.07, 0.055, 0.04))
            eye_obj.parent = obj
            parts.append(eye_obj)
    root.select_set(True)
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    return root, parts


def export_hero(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root, parts = hero_parts()
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_vertex_color="ACTIVE",
                              export_all_vertex_colors=True)
    bpy.ops.object.select_all(action="DESELECT")
    return root, parts


def preview_hero(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    hero_parts()
    floor_specs = box_faces({"center": (0, 0, -0.12), "size": (2.8, 2.8, 0.24), "tile": "pedestal"})
    object_from_faces("preview_floor", floor_specs, 4, bevel=True)
    setup_render(bpy.context.scene, path, (0.0, 0.0, 0.72), 3.2, (2.6, -3.8, 2.5))
    bpy.ops.render.render(write_still=True)


def load_config(stage_id):
    path = ROOT / "tools" / "diorama" / "stages" / (stage_id + ".json")
    with path.open("r", encoding="utf-8") as stream:
        return json.load(stream)


def output_json(stage, output_dir, reachable, total):
    materials = stage["materials"]
    material_index = {name: n for n, name in enumerate(materials)}
    surface = [material_index.get(name, 0) for name in stage["surface_names"]]
    data = {
        "id": stage["id"], "name": stage["name"], "seed": stage["seed"], "size": [WIDTH, DEPTH],
        "height": stage["heights"], "surface": surface, "materials": materials,
        "blocked": stage["blocked"], "liquid": stage["liquid"],
        "waterLevel": stage["water_level"], "spawn": stage["spawn"], "light": stage["light"],
        "ambience": stage["ambience"], "particles": stage["particles"],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / (stage["id"] + ".json")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def main():
    parser = argparse.ArgumentParser(description="48x48 の箱庭を GLB と JSON に書き出す")
    parser.add_argument("--stage", required=True, choices=STAGE_IDS + ["all"])
    parser.add_argument("--seed", type=int, help="すべての対象ステージに使う種")
    parser.add_argument("--out", default=str(ROOT / "public" / "diorama" / "stages"))
    parser.add_argument("--preview", action="store_true", help="確認用 PNG も出力する")
    args, _ = parser.parse_known_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    stages = STAGE_IDS if args.stage == "all" else [args.stage]
    output_dir = Path(args.out).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    shot_dir = ROOT / "art" / "shots" / "diorama" / "gen"

    for stage_id in stages:
        config = load_config(stage_id)
        seed = args.seed if args.seed is not None else config["seed"]
        stage = blank_stage(config, seed)
        if stage_id == "meadow":
            meadow(stage, config["params"], seed)
        elif stage_id == "canyon":
            canyon(stage, config["params"], seed)
        elif stage_id == "snow":
            snow(stage, config["params"], seed)
        elif stage_id == "volcano":
            volcano(stage, config["params"], seed)
        else:
            skyisles(stage, config["params"], seed)

        make_props(stage, config["params"], seed)
        old_heights = list(stage["heights"])
        ramps, reachable, total = repair_walkability(stage)
        shift_attached_boxes(stage["props_boxes"], old_heights, stage["heights"])
        shift_attached_boxes(stage["glow_boxes"], old_heights, stage["heights"])
        stage["ramp_count"] = ramps + stage["planned_ramps"]

        bpy.ops.wm.read_factory_settings(use_empty=True)
        heights = [h for h in stage["heights"] if h >= 0]
        base_level = min(heights) - 4 if heights else -4
        objects = finish_stage_scene(stage, config["params"], base_level)
        triangles = triangle_count(objects)
        if triangles > 250000:
            raise RuntimeError("三角形数が上限を超えました: " + str(triangles))
        export_glb(objects, output_dir / (stage_id + ".glb"))
        output_json(stage, output_dir, reachable, total)
        pct = 0.0 if not total else reachable / total * 100.0
        print("[{}] triangles={} walkable={:.1f}% height={}..{} ramps={}".format(
            stage_id, triangles, pct, min(heights), max(heights), stage["ramp_count"]))
        if args.preview:
            shot_dir.mkdir(parents=True, exist_ok=True)
            render_stage(stage, shot_dir / (stage_id + ".png"))

    (output_dir / "index.json").write_text(json.dumps(STAGE_IDS, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    hero_path = ROOT / "public" / "diorama" / "models" / "hero.glb"
    export_hero(hero_path)
    if args.preview:
        shot_dir.mkdir(parents=True, exist_ok=True)
        preview_hero(shot_dir / "hero.png")
    print("index.json: {}".format(output_dir / "index.json"))
    print("hero.glb: {}".format(hero_path))


if __name__ == "__main__":
    main()
