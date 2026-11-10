"""生成された箱庭 JSON と GLB が契約の配列、名前、属性、UV に合うか調べる。"""

import json
import math
import struct
import sys
from pathlib import Path


STAGE_IDS = ["meadow", "canyon", "snow", "volcano", "skyisles"]
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
TILE = 256
ATLAS_W = 2048
ATLAS_H = 1024
MARGIN = 4


def fail(message):
    raise ValueError(message)


def parse_glb(path):
    raw = path.read_bytes()
    if len(raw) < 20:
        fail("GLB が短すぎます: " + str(path))
    magic, version, total = struct.unpack_from("<4sII", raw, 0)
    if magic != b"glTF" or version != 2 or total != len(raw):
        fail("GLB ヘッダーが不正です: " + str(path))
    offset = 12
    document = None
    binary = None
    while offset < len(raw):
        length, chunk_type = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk = raw[offset:offset + length]
        offset += length
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.decode("utf-8").rstrip(" \t\r\n\0"))
        elif chunk_type == 0x004E4942:
            binary = chunk
    if document is None:
        fail("GLB に JSON チャンクがありません: " + str(path))
    return document, binary or b""


def read_vec2(document, binary, accessor_index):
    accessor = document["accessors"][accessor_index]
    if accessor.get("componentType") != 5126 or accessor.get("type") != "VEC2":
        fail("UV accessor の形式が float VEC2 ではありません")
    view = document["bufferViews"][accessor["bufferView"]]
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride", 8)
    count = accessor["count"]
    values = []
    for n in range(count):
        at = base + n * stride
        values.append(struct.unpack_from("<ff", binary, at))
    return values


def read_scalar_indices(document, accessor_index):
    accessor = document["accessors"][accessor_index]
    return accessor.get("count", 0)


def color_stats(document, binary, accessor_index):
    accessor = document["accessors"][accessor_index]
    value_type = accessor.get("type")
    if value_type not in ("VEC3", "VEC4"):
        fail("COLOR_0 accessor が VEC3/VEC4 ではありません")
    component_count = 3 if value_type == "VEC3" else 4
    component_type = accessor.get("componentType")
    formats = {5126: ("f", 4, 1.0), 5121: ("B", 1, 255.0), 5123: ("H", 2, 65535.0)}
    if component_type not in formats:
        fail("COLOR_0 accessor の componentType が未対応です")
    fmt, component_size, denominator = formats[component_type]
    if component_type != 5126 and not accessor.get("normalized", False):
        fail("整数 COLOR_0 accessor が normalized ではありません")
    view = document["bufferViews"][accessor["bufferView"]]
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride", component_count * component_size)
    minimum = math.inf
    total = 0.0
    value_count = 0
    for n in range(accessor.get("count", 0)):
        at = base + n * stride
        values = struct.unpack_from("<" + fmt * component_count, binary, at)
        for value in values[:3]:
            value = value if component_type == 5126 else value / denominator
            minimum = min(minimum, value)
            total += value
            value_count += 1
    return minimum, total, value_count


def validate_uvs(document, binary, path):
    materials = document.get("materials", [])
    primitive_count = 0
    triangles = 0
    color_min = math.inf
    color_total = 0.0
    color_count = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            primitive_count += 1
            attributes = primitive.get("attributes", {})
            if "POSITION" not in attributes:
                fail("POSITION がありません: " + str(path))
            if "TEXCOORD_0" not in attributes:
                fail("TEXCOORD_0 がありません: {} / {}".format(path, mesh.get("name")))
            if "COLOR_0" not in attributes:
                fail("COLOR_0 がありません: {} / {}".format(path, mesh.get("name")))
            minimum, total, count = color_stats(document, binary, attributes["COLOR_0"])
            color_min = min(color_min, minimum)
            color_total += total
            color_count += count
            material_index = primitive.get("material")
            if material_index is None or material_index >= len(materials):
                fail("材質が指定されていません: {} / {}".format(path, mesh.get("name")))
            material_name = materials[material_index].get("name", "")
            if material_name not in ATLAS:
                fail("固定アトラスにない材質名 {}: {}".format(material_name, path))
            col, row = ATLAS[material_name]
            u_min = (col * TILE + MARGIN) / ATLAS_W
            u_max = ((col + 1) * TILE - MARGIN) / ATLAS_W
            v_min = (row * TILE + MARGIN) / ATLAS_H
            v_max = ((row + 1) * TILE - MARGIN) / ATLAS_H
            for u, v in read_vec2(document, binary, attributes["TEXCOORD_0"]):
                if not (u_min - 1e-6 <= u <= u_max + 1e-6 and v_min - 1e-6 <= v <= v_max + 1e-6):
                    fail("UV が {} タイル外です: {} ({:.6f}, {:.6f})".format(material_name, path, u, v))
            if primitive.get("mode", 4) != 4:
                fail("三角形以外の primitive です: {}".format(path))
            indices = primitive.get("indices")
            triangles += read_scalar_indices(document, indices) // 3 if indices is not None else document["accessors"][attributes["POSITION"]]["count"] // 3
    if not primitive_count:
        fail("GLB に primitive がありません: " + str(path))
    return triangles, color_min, color_total / max(1, color_count)


def walkability(data):
    width, depth = data["size"]
    walkable = [h >= 0 and not blocked and liquid != 2
                for h, blocked, liquid in zip(data["height"], data["blocked"], data["liquid"])]
    si, sk = data["spawn"]
    if not (0 <= si < width and 0 <= sk < depth):
        fail("spawn が地図の外です: " + data["id"])
    start = sk * width + si
    if not walkable[start]:
        fail("spawn が歩けないマスです: " + data["id"])
    reached = {start}
    queue = [start]
    for current in queue:
        i, k = current % width, current // width
        h = data["height"][current]
        for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ni, nk = i + di, k + dk
            if not (0 <= ni < width and 0 <= nk < depth):
                continue
            neighbor = nk * width + ni
            if walkable[neighbor] and neighbor not in reached and data["height"][neighbor] <= h + 1:
                reached.add(neighbor)
                queue.append(neighbor)
    total = sum(walkable)
    return 0.0 if total == 0 else len(reached) / total * 100.0


def validate_stage_json(path, expected_id):
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("id") != expected_id:
        fail("JSON id がファイル名と一致しません: " + str(path))
    width, depth = data.get("size", [0, 0])
    if (width, depth) != (72, 72):
        fail("size が 72x72 ではありません: " + str(path))
    expected = width * depth
    for key in ("height", "surface", "blocked", "liquid"):
        if not isinstance(data.get(key), list) or len(data[key]) != expected:
            fail("{} の長さが {} ではありません: {}".format(key, expected, path))
    materials = data.get("materials", [])
    if not materials or len(materials) != len(set(materials)):
        fail("materials が空か重複しています: " + str(path))
    for number in data["surface"]:
        if not isinstance(number, int) or number < 0 or number >= len(materials):
            fail("surface の材質番号が範囲外です: " + str(path))
    if any(value not in (0, 1) for value in data["blocked"]):
        fail("blocked に 0/1 以外があります: " + str(path))
    if any(value not in (0, 1, 2, 3) for value in data["liquid"]):
        fail("liquid に 0..3 以外があります: " + str(path))
    if any(not isinstance(value, int) or value < -1 for value in data["height"]):
        fail("height に -1 未満または整数以外があります: " + str(path))
    if any(value > 28 for value in data["height"]):
        fail("height が28を超えています: " + str(path))
    pct = walkability(data)
    if pct < 65.0:
        fail("歩ける割合が 65% 未満です: {} {:.1f}%".format(expected_id, pct))
    si, sk = data["spawn"]
    spawn_height = data["height"][sk * width + si]
    for dk in (-1, 0, 1):
        for di in (-1, 0, 1):
            n = (sk + dk) * width + si + di
            if data["height"][n] != spawn_height or data["liquid"][n] != 0 or data["blocked"][n] != 0:
                fail("spawn の周囲3x3が平坦な陸地ではありません: " + expected_id)
    return data, pct


def check_atlas_contract(root):
    atlas_path = root / "tex" / "atlas.json"
    if not atlas_path.exists():
        print("atlas.json が未作成のため、契約の固定 8x4 配置で UV を検査します")
        return
    atlas = json.loads(atlas_path.read_text(encoding="utf-8"))
    if atlas.get("tile") != TILE or atlas.get("cols") != 8 or atlas.get("rows") != 4:
        fail("atlas.json の大きさが契約と一致しません")
    expected_tiles = {name: list(position) for name, position in ATLAS.items()}
    if atlas.get("tiles") != expected_tiles:
        fail("atlas.json のタイル名・位置が契約と一致しません")


def main():
    if len(sys.argv) != 2:
        fail("使い方: python -I tools/diorama/check_stage.py public/diorama/stages")
    stage_dir = Path(sys.argv[1]).resolve()
    if not stage_dir.is_dir():
        fail("ステージ出力先がありません: " + str(stage_dir))
    diorama_root = stage_dir.parent
    check_atlas_contract(diorama_root)
    index_path = stage_dir / "index.json"
    if not index_path.exists() or json.loads(index_path.read_text(encoding="utf-8")) != STAGE_IDS:
        fail("index.json が契約の 5 ステージ配列と一致しません")

    stage_results = []
    for stage_id in STAGE_IDS:
        json_path = stage_dir / (stage_id + ".json")
        glb_path = stage_dir / (stage_id + ".glb")
        if not json_path.exists() or not glb_path.exists():
            fail("ステージ JSON/GLB がありません: " + stage_id)
        data, pct = validate_stage_json(json_path, stage_id)
        document, binary = parse_glb(glb_path)
        mesh_names = {mesh.get("name") for mesh in document.get("meshes", [])}
        required = {"terrain", "props"}
        if stage_id != "canyon":
            required.add("fall")
        if not required.issubset(mesh_names) or not mesh_names.issubset({"terrain", "props", "glow", "water", "fall"}):
            fail("ステージのメッシュ名が不正です: {} {}".format(stage_id, sorted(mesh_names)))
        triangles, color_min, color_avg = validate_uvs(document, binary, glb_path)
        if triangles > 800000:
            fail("三角形が 80 万を超えています: {} {}".format(stage_id, triangles))
        if color_min < 0.35:
            fail("COLOR_0 の最小値が 0.35 未満です: {} {:.4f}".format(stage_id, color_min))
        stage_results.append((stage_id, triangles, pct, color_min, color_avg))

    hero_path = diorama_root / "models" / "hero.glb"
    if not hero_path.exists():
        fail("人物 GLB がありません: " + str(hero_path))
    hero, binary = parse_glb(hero_path)
    expected_parts = {"head", "body", "armL", "armR", "legL", "legR", "cape"}
    hero_names = {mesh.get("name") for mesh in hero.get("meshes", [])}
    node_names = {node.get("name") for node in hero.get("nodes", [])}
    if not expected_parts.issubset(hero_names) or not expected_parts.issubset(node_names):
        fail("人物の部品名が不足しています: meshes={} nodes={}".format(sorted(hero_names), sorted(node_names)))
    hero_triangles, _, _ = validate_uvs(hero, binary, hero_path)

    for stage_id, triangles, pct, color_min, color_avg in stage_results:
        print("{}: triangles={} walkable={:.1f}% COLOR_0 min={:.4f} avg={:.4f} OK".format(
            stage_id, triangles, pct, color_min, color_avg))
    print("hero.glb: 7 parts, triangles={} UV + COLOR_0 OK".format(hero_triangles))
    print("OK: 5 stages, 72x72 arrays, materials, mesh names, atlas UVs, COLOR_0 >= 0.35")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("ERROR: {}".format(error), file=sys.stderr)
        sys.exit(1)
