"""岩の曲率と AO を頂点色へ重ねる。"""
import math

from mathutils import Vector
from mathutils.bvhtree import BVHTree


# Opus が比較後に調整する実験用の定数。
RAY_COUNT = 48
RAY_DISTANCE_SCALE = 0.6
RAY_BIAS_SCALE = 0.0005
SMOOTH_PASSES = 2
PERCENTILE_LOW = 0.05
PERCENTILE_HIGH = 0.95
CONVEX_COLOR = (1.10, 1.06, 0.96)
CONCAVE_AO_COLOR = (0.74, 0.72, 0.74)
EPSILON = 1e-8


def _clamp(value, low=0.0, high=1.0):
    return min(high, max(low, value))


def _percentile(values, fraction):
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def _smooth(values, neighbors):
    result = list(values)
    for _ in range(SMOOTH_PASSES):
        result = [
            (values[index] + sum(values[other] for other in adjacent)) / (len(adjacent) + 1)
            for index, adjacent in enumerate(neighbors)
        ]
        values = result
    return result


def _normalize_ao(values):
    low = _percentile(values, PERCENTILE_LOW)
    high = _percentile(values, PERCENTILE_HIGH)
    if high - low <= EPSILON:
        return [0.0] * len(values)
    return [_clamp((value - low) / (high - low)) for value in values]


def _ao_mask(mesh, positions, normals, neighbors):
    mesh.calc_loop_triangles()
    triangles = [tuple(triangle.vertices) for triangle in mesh.loop_triangles]
    tree = BVHTree.FromPolygons(positions, triangles, all_triangles=True)
    dimensions = [
        max(position[axis] for position in positions) - min(position[axis] for position in positions)
        for axis in range(3)
    ]
    max_distance = min(dimensions) * RAY_DISTANCE_SCALE
    bias = min(dimensions) * RAY_BIAS_SCALE
    if max_distance <= EPSILON:
        return [0.0] * len(positions)

    directions = []
    golden_angle = math.pi * (3.0 - math.sqrt(5.0))
    for ray_index in range(RAY_COUNT):
        z = (ray_index + 0.5) / RAY_COUNT
        radius = math.sqrt(max(0.0, 1.0 - z * z))
        angle = ray_index * golden_angle
        directions.append((radius * math.cos(angle), radius * math.sin(angle), z))

    occlusion = []
    for position, normal in zip(positions, normals):
        if normal.length_squared <= EPSILON:
            occlusion.append(0.0)
            continue
        normal = normal.normalized()
        tangent = normal.orthogonal().normalized()
        bitangent = normal.cross(tangent).normalized()
        origin = position + normal * bias
        hits = 0
        for x, y, z in directions:
            direction = (tangent * x + bitangent * y + normal * z).normalized()
            location, _hit_normal, face_index, _distance = tree.ray_cast(origin, direction, max_distance)
            if location is not None and face_index >= 0:
                hits += 1
        occlusion.append(hits / RAY_COUNT)
    return _smooth(_normalize_ao(occlusion), neighbors)


def apply_rock_mask(ob, strength):
    """Col 頂点色へ、曲率と自己 AO の色倍率を strength で重ねる。"""
    strength = _clamp(float(strength))
    if strength <= 0.0:
        return

    mesh = ob.data
    color = mesh.color_attributes.get('Col')
    if color is None or color.domain != 'CORNER':
        raise ValueError(f'{ob.name}: Col の CORNER 頂点色がありません')

    vertices = mesh.vertices
    positions = [vertex.co.copy() for vertex in vertices]
    normals = [vertex.normal.copy() for vertex in vertices]
    neighbors = [[] for _vertex in vertices]
    curvature_sum = [0.0] * len(vertices)
    curvature_count = [0] * len(vertices)

    for edge in mesh.edges:
        a, b = edge.vertices
        delta = positions[b] - positions[a]
        if delta.length_squared <= EPSILON:
            continue
        direction = delta.normalized()
        curvature_sum[a] += direction.dot(normals[a])
        curvature_count[a] += 1
        curvature_sum[b] += (-direction).dot(normals[b])
        curvature_count[b] += 1
        neighbors[a].append(b)
        neighbors[b].append(a)

    curvature = [
        curvature_sum[index] / curvature_count[index] if curvature_count[index] else 0.0
        for index in range(len(vertices))
    ]
    low = _percentile(curvature, PERCENTILE_LOW)
    high = _percentile(curvature, PERCENTILE_HIGH)
    convex_scale = max(-low, EPSILON)
    concave_scale = max(high, EPSILON)
    convex = _smooth([_clamp(-value / convex_scale) for value in curvature], neighbors)
    concave = _smooth([_clamp(value / concave_scale) for value in curvature], neighbors)
    ao = _ao_mask(mesh, positions, normals, neighbors)

    for loop in mesh.loops:
        vertex_index = loop.vertex_index
        cavity = max(concave[vertex_index], ao[vertex_index])
        if convex[vertex_index] > cavity:
            mask = convex[vertex_index]
            target = CONVEX_COLOR
        else:
            mask = cavity
            target = CONCAVE_AO_COLOR
        factor = strength * mask
        old = color.data[loop.index].color
        color.data[loop.index].color = (
            old[0] * (1.0 + (target[0] - 1.0) * factor),
            old[1] * (1.0 + (target[1] - 1.0) * factor),
            old[2] * (1.0 + (target[2] - 1.0) * factor),
            old[3],
        )
