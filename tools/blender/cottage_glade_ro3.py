# 森の小屋の一角・RO3 風の比較版（明るく豊かなファンタジー 3D）
#   現状版（cottage_glade.py / .blend / .glb）は基準として残し、こちらは別名で作る。配置・規模・当たり判定は現状版の .blend からそのまま読む
#   実行: blender -b -P tools/blender/cottage_glade_ro3.py            （先に現状版の tools/blender/cottage_glade.blend が要る）
#         プレビュー画像も描く: 末尾に -- --render
#
#   作るもの
#     tools/blender/cottage_glade_ro3.blend                 編集用（コレクション: 小屋 / 庭 / 森 / 地面 / 目印 / プレビュー）
#     tools/blender/ro3_textures/*.png|jpg                  Blender の中で描いたテクスチャ（.blend と GLB が使う）
#     public/assets/models/blender/cottage_glade_ro3.glb    エリア全体（地面・岩壁を含む）
#     public/shared/glade-layout-ro3.js                     当たり判定などは現状版と同じ値。model と見た目の指定だけ違う
#     docs/glade/ro3/blender-*.png                          プレビュー（現状版と同じカメラ）
#
#   見た目の方針（現状版との違い）
#     - 色は材質の単色ではなく、Blender の中で描いたテクスチャ（芝・土の小道・石・漆喰・木目・樹皮・葉）。面はなめらかに（角だけ立てる）
#     - 木・低木・シダ・草・花は、葉を描いた板（アルファの切り抜き）を重ねる。板の法線は茂みの外向きにそろえ、ふんわり明るく
#     - 地面は1枚の描いたテクスチャ（芝の濃淡・木の下の陰と落ち葉・土の小道のやわらかい縁・花壇の土・妖精の輪）
#     - 外周の後ろに苔むした岩壁を足して奥行きを出す。玄関前は石畳と芝の境目
import os, sys, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) if os.path.exists(__file__) else '.')
import importlib
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix, Euler, noise
import mmo_common as C
import cottage_glade as base
importlib.reload(C); importlib.reload(base)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ROOT = C.repo_root()
TEX_DIR = os.path.join(ROOT, 'tools', 'blender', 'ro3_textures')

# ---------------------------------------------------------------------------
# テクスチャを描く（numpy。すべて繰り返しても継ぎ目が出ない）
# ---------------------------------------------------------------------------
def fbm(n, octaves=5, seed=0, base_f=4, m=None):
    rng = np.random.default_rng(seed); m = m or n
    out = np.zeros((n, m), np.float32); amp, tot = 1.0, 0.0
    for o in range(octaves):
        g = base_f * 2 ** o
        grid = rng.random((g, g)).astype(np.float32)
        def axis(k):
            x = np.arange(k, dtype=np.float32) * g / k; i0 = np.floor(x).astype(int); f = x - i0; f = f * f * (3 - 2 * f)
            return i0 % g, (i0 + 1) % g, f
        r0, r1, fy = axis(n); c0, c1, fx = axis(m)
        a = grid[np.ix_(r0, c0)]; b = grid[np.ix_(r0, c1)]; c = grid[np.ix_(r1, c0)]; d = grid[np.ix_(r1, c1)]
        fx = fx[None, :]; fy = fy[:, None]
        out += ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy) * amp
        tot += amp; amp *= 0.5
    return out / tot

def hexc(h): return np.array([(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255], np.float32)

def ramp(v, stops):
    # v: 0〜1 の配列、stops: [(位置, 0xRRGGBB)]。色は sRGB のまま混ぜる（絵の具の感覚）
    ps = [p for p, _ in stops]; cs = np.array([hexc(c) for _, c in stops])
    return np.stack([np.interp(v, ps, cs[:, k]).astype(np.float32) for k in range(3)], axis=-1)

def strokes(img, n, length, width, color, alpha, seed, angle=None, jitter=0.6):
    # 短い筆あと（芝の葉先・木目・樹皮の筋）。img: (H, W, 3) を直接塗る。端は繰り返し
    H, W = img.shape[:2]; rng = np.random.default_rng(seed)
    x0 = rng.random(n) * W; y0 = rng.random(n) * H
    a = rng.random(n) * 6.2832 if angle is None else angle + (rng.random(n) - 0.5) * jitter
    L = length * (0.6 + rng.random(n) * 0.8)
    for t in np.linspace(0, 1, max(2, int(length))):
        for w in range(width):
            xs = ((x0 + np.cos(a) * L * t + w * np.sin(a)) % W).astype(int); ys = ((y0 + np.sin(a) * L * t - w * np.cos(a)) % H).astype(int)
            k = alpha * (0.4 + 0.6 * t)
            img[ys, xs] = img[ys, xs] * (1 - k) + np.asarray(color, np.float32) * k

def save(name, rgb, alpha=None, fmt='JPEG'):
    os.makedirs(TEX_DIR, exist_ok=True)
    H, W = rgb.shape[:2]
    path = os.path.join(TEX_DIR, name + ('.png' if fmt == 'PNG' else '.jpg'))
    im = bpy.data.images.get(name) or bpy.data.images.new(name, W, H, alpha=alpha is not None)
    a = alpha if alpha is not None else np.ones((H, W), np.float32)
    # 手順の都合で上下を入れ替えない（行 0 = 画像の下。UV の v = 0 と同じ）
    im.pixels.foreach_set(np.concatenate([np.clip(rgb, 0, 1), a[..., None]], axis=2).astype(np.float32).ravel())
    im.filepath_raw = path; im.file_format = fmt
    im.save()
    bpy.data.images.remove(im)
    im = bpy.data.images.load(path)  # ファイルから読み直す（GLB へは JPEG / PNG のまま入る。.blend には相対パスで残る）
    im.name = name
    if alpha is None: im.alpha_mode = 'NONE'
    return im

def tex_simple(name, stops, seed, size=512, octaves=6, base_f=4, streak=None, specks=None, contrast=1.0):
    v = fbm(size, octaves, seed, base_f)
    v = np.clip((v - 0.5) * contrast + 0.5, 0, 1)
    img = ramp(v, stops)
    if streak: strokes(img, *streak, seed=seed + 1)
    if specks:
        rng = np.random.default_rng(seed + 2)
        for col, n in specks:
            ys, xs = rng.integers(0, size, n), rng.integers(0, size, n)
            img[ys, xs] = img[ys, xs] * 0.4 + hexc(col) * 0.6
    return save(name, img)

def tex_stone(name, c_lo, c_mid, c_hi, seed, moss=0.0):
    # 石: 濃淡のむら・細かい粒・ところどころの苔
    n = 512; v = fbm(n, 6, seed, 3); g = fbm(n, 3, seed + 9, 16)
    img = ramp(np.clip(v * 0.8 + g * 0.35 - 0.05, 0, 1), [(0.0, c_lo), (0.5, c_mid), (1.0, c_hi)])
    if moss:
        mv = fbm(n, 5, seed + 5, 2)
        k = np.clip((mv - (1 - moss)) * 4, 0, 1)[..., None] * 0.8
        img = img * (1 - k) + ramp(fbm(n, 4, seed + 6, 8), [(0, 0x5a7a2a), (1, 0x9ab84a)]) * k
    rng = np.random.default_rng(seed)
    ys, xs = rng.integers(0, n, 9000), rng.integers(0, n, 9000)
    img[ys, xs] *= rng.uniform(0.82, 1.15, (9000, 1)).astype(np.float32)
    return save(name, img)

def tex_wood(name, c_lo, c_hi, seed, size=512):
    # 木目: 横に伸びたむら + 筋
    v = fbm(size, 5, seed, 2, size)
    stretch = fbm(size, 4, seed + 3, 32)[:, :1].repeat(size, 1) * 0.6 + v * 0.4
    img = ramp(stretch, [(0, c_lo), (1, c_hi)])
    strokes(img, 1400, 60, 1, hexc(c_lo) * 0.75, 0.35, seed + 4, angle=0.0, jitter=0.05)
    return save(name, img)

def tex_roof_moss(name, seed):
    # 苔の付いた屋根板: 屋根の色に苔の斑を半分ほど重ねる
    n = 512; img = ramp(fbm(n, 5, seed, 4), [(0, 0x8a4430), (1, 0xbc6a46)])
    strokes(img, 1800, 40, 1, hexc(0x7a3226), 0.3, seed + 1, angle=1.5708, jitter=0.08)
    k = np.clip((fbm(n, 5, seed + 2, 6) - 0.45) * 3.0, 0, 1)[..., None] * 0.75
    img = img * (1 - k) + ramp(fbm(n, 4, seed + 3, 16), [(0, 0x5e7a2c), (1, 0x9ab84a)]) * k
    return save(name, img)

def tex_roof(name, c_lo, c_hi, seed):
    # 屋根板: 縦方向の木目と、板の下の縁の陰
    n = 512; img = ramp(fbm(n, 5, seed, 4), [(0, c_lo), (1, c_hi)])
    strokes(img, 1800, 40, 1, hexc(c_lo) * 0.8, 0.3, seed + 1, angle=1.5708, jitter=0.08)
    y = np.arange(n)[:, None] / n
    img *= (0.78 + 0.22 * np.clip(y * 3, 0, 1))[..., None]
    return save(name, img)

# 葉・草・花の板（アルファ付き）。2×2 のマスに1種類ずつ
def leaf_shape(img, cx, cy, ang, L, W, col, light=1.0, vein=True):
    H, Wd = img.shape[:2]
    r = int(L) + 2; x0, x1 = max(0, int(cx - r)), min(Wd, int(cx + r)); y0, y1 = max(0, int(cy - r)), min(H, int(cy + r))
    if x1 <= x0 or y1 <= y0: return
    ys, xs = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    dx, dy = xs - cx, ys - cy
    u = (dx * math.cos(ang) + dy * math.sin(ang)) / L; w = (-dx * math.sin(ang) + dy * math.cos(ang)) / W
    width = np.where((u > 0) & (u < 1), np.sin(np.clip(u, 0, 1) * math.pi) ** 0.7 * (1 - u * 0.25), 0)
    inside = (np.abs(w) < width) & (u > 0)
    sh = (0.62 + 0.5 * u) * light * (1 - 0.18 * np.abs(w) / np.maximum(width, 1e-3))
    if vein: sh = sh * np.where(np.abs(w) < 0.08, 0.82, 1.0)
    c = np.asarray(col, np.float32)[None, None, :] * sh[..., None]
    reg = img[y0:y1, x0:x1]
    reg[inside, :3] = np.clip(c[inside], 0, 1); reg[inside, 3] = 1.0

def atlas_leaves(seed=3):
    S = 512; img = np.zeros((S * 2, S * 2, 4), np.float32); rng = np.random.default_rng(seed)
    greens = [hexc(0xa8d040), hexc(0x8cc23c), hexc(0x6aa834), hexc(0x56962e), hexc(0xc8e050)]
    # マス0（左下）: 広葉樹の葉の房。中心ほど暗く、外の葉先ほど明るい
    for k in range(95):
        a = rng.random() * 6.2832; d = rng.random() ** 0.7 * S * 0.34
        cx, cy = S * 0.5 + math.cos(a) * d * 0.6, S * 0.5 + math.sin(a) * d * 0.6
        col = greens[rng.integers(0, 5)] * rng.uniform(0.85, 1.1)
        leaf_shape(img[:S, :S], cx, cy, a + rng.uniform(-0.6, 0.6), rng.uniform(60, 95), rng.uniform(20, 30), col, light=0.7 + 0.5 * d / (S * 0.34))
    # マス1（右下）: シダの葉（羽状）
    cell = img[:S, S:]
    for i in range(40):
        t = i / 40; y = S * 0.04 + t * S * 0.9; x = S * 0.5 + math.sin(t * 2.5) * 10
        cell[int(y):int(y) + 4, int(x) - 2:int(x) + 2, :3] = hexc(0x4a7a2a); cell[int(y):int(y) + 4, int(x) - 2:int(x) + 2, 3] = 1
        span = (1 - t) ** 0.8 * S * 0.42 + 12
        for s in (-1, 1):
            leaf_shape(cell, x, y, (math.pi / 2 - s * (math.pi / 2 - 0.35)), span, 9, greens[(i + (s > 0)) % 4] * 1.05, light=0.8 + 0.35 * t, vein=False)
    # マス2（左上）: 草の束（根元が濃く先が明るい細い葉）
    cell = img[S:, :S]
    for k in range(70):
        bx = S * 0.5 + rng.normal(0, S * 0.08); lean = rng.normal(0, 0.35); h = rng.uniform(0.45, 0.95) * S
        col = greens[rng.integers(0, 5)]
        for j in range(int(h)):
            t = j / h; x = bx + lean * j + math.sin(t * 2) * lean * 20; wdt = max(1, int(7 * (1 - t)))
            yi = int(j); x0 = int(x - wdt / 2)
            if 0 <= yi < S and 0 <= x0 and x0 + wdt < S:
                cell[yi, x0:x0 + wdt, :3] = col * (0.45 + 0.75 * t); cell[yi, x0:x0 + wdt, 3] = 1
    # マス3（右上）: 針葉樹の小枝（細い葉が両側に並ぶ）
    cell = img[S:, S:]
    for i in range(70):
        t = i / 70; y = S * 0.05 + t * S * 0.9; x = S * 0.5
        cell[int(y):int(y) + 3, int(x) - 2:int(x) + 2, :3] = hexc(0x4a3a24); cell[int(y):int(y) + 3, int(x) - 2:int(x) + 2, 3] = 1
        span = (1 - t * 0.7) * S * 0.36
        for s in (-1, 1):
            leaf_shape(cell, x, y, math.pi / 2 - s * 1.15, span, 4, (hexc(0x2f6a3a) if i % 3 else hexc(0x4f8a4a)) * (0.8 + 0.4 * t), light=1.0, vein=False)
    rgb, a = img[..., :3], img[..., 3]
    # 切り抜きの縁がにじまないように、透明な所の色を近くの葉の色で埋める
    filled = rgb.copy(); m = a > 0.5
    for _ in range(8):
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(filled, dy, 0), dx, 1); shm = np.roll(np.roll(m, dy, 0), dx, 1)
            grow = ~m & shm
            filled = np.where(grow[..., None], sh, filled); m = m | grow
    return save('ro3_leaves', filled, alpha=img[..., 3], fmt='PNG')

def atlas_flowers(seed=4):
    S = 256; img = np.zeros((S * 2, S * 2, 4), np.float32); rng = np.random.default_rng(seed)
    def stem(cell, x, y0, y1, col=0x4f8a32, w=3):
        for y in range(int(y0), int(y1)):
            cell[y, int(x) - w // 2:int(x) + w // 2 + 1, :3] = hexc(col) * (0.7 + 0.4 * y / y1); cell[y, int(x) - w // 2:int(x) + w // 2 + 1, 3] = 1
    def dot(cell, x, y, r, col):
        ys, xs = np.mgrid[0:S, 0:S]; d = np.hypot(xs - x, ys - y); m = d < r
        cell[m, :3] = np.clip(hexc(col) * (1.15 - 0.4 * d[m, None] / r), 0, 1); cell[m, 3] = 1
    cells = {(0, 0): 'lav', (0, 1): 'yel', (1, 0): 'pink', (1, 1): 'white'}
    for (cy, cx), kind in cells.items():
        cell = img[cy * S:(cy + 1) * S, cx * S:(cx + 1) * S]
        for k in range(6):  # 葉
            leaf_shape(cell, S * 0.5 + rng.normal(0, 18), 6, math.pi / 2 + rng.normal(0, 0.6), S * rng.uniform(0.3, 0.45), 10, hexc(0x5a9a34), light=0.9, vein=False)
        n = {'lav': 7, 'yel': 9, 'pink': 6, 'white': 7}[kind]
        for k in range(n):
            x = S * 0.5 + rng.normal(0, S * 0.15); top = S * rng.uniform(0.55, 0.9)
            stem(cell, x, 0, top)
            if kind == 'lav':
                for j in range(9): dot(cell, x + rng.normal(0, 2), top - j * 7, 5.5 - j * 0.25, [0x9a7ad8, 0xb89af0, 0x7a5ac0][j % 3])
            elif kind == 'yel':
                for p in range(5): dot(cell, x + math.cos(p * 1.256) * 6, top + math.sin(p * 1.256) * 6, 5, 0xffd84a)
                dot(cell, x, top, 3.5, 0xe08a20)
            elif kind == 'pink':
                for p in range(6): dot(cell, x + math.cos(p * 1.047) * 9, top + math.sin(p * 1.047) * 9, 7, [0xff8aa8, 0xff6a8a][p % 2])
                dot(cell, x, top, 4.5, 0xffd84a)
            else:
                for p in range(8): dot(cell, x + math.cos(p * 0.785) * 8, top + math.sin(p * 0.785) * 8, 5, 0xfffaf0)
                dot(cell, x, top, 4, 0xffc830)
    return save('ro3_flowers', img[..., :3], alpha=img[..., 3], fmt='PNG')

# ---------------------------------------------------------------------------
# 材質
# ---------------------------------------------------------------------------
MATS = {}
def mat_tex(name, im, tile=1.0, alpha=False, emission=None, rough=0.9, color=None):
    # 材質名はゲームの読み込みでも見る（「カード_」で始まるものは両面・切り抜き）
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Roughness'].default_value = rough
    if im is not None:
        tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = im
        tx.interpolation = 'Linear'
        nt.links.new(tx.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha:
            rnd = nt.nodes.new('ShaderNodeMath'); rnd.operation = 'ROUND'
            nt.links.new(tx.outputs['Alpha'], rnd.inputs[0]); nt.links.new(rnd.outputs[0], bsdf.inputs['Alpha'])
            m.use_backface_culling = False
            try: m.surface_render_method = 'DITHERED'
            except Exception: pass
        else: m.use_backface_culling = False
    if color is not None:
        lin = [C.srgb_to_lin(float(c)) for c in color]
        bsdf.inputs['Base Color'].default_value = (*lin, 1)
    if emission is not None:
        lin = [C.srgb_to_lin(float(c)) for c in emission]
        bsdf.inputs['Emission Color'].default_value = (*lin, 1); bsdf.inputs['Emission Strength'].default_value = 8.0
        bsdf.inputs['Base Color'].default_value = (*lin, 1)
    m['tile'] = tile
    MATS[name] = m
    return m

def build_materials():
    T = {}
    T['stone'] = tex_stone('ro3_stone', 0x8a8478, 0xb0aa9c, 0xd2ccbc, 11, moss=0.18)
    T['stone_d'] = tex_stone('ro3_stone_dark', 0x6a665e, 0x8c877c, 0xaaa496, 12, moss=0.28)
    T['stone_l'] = tex_stone('ro3_stone_light', 0xa8a294, 0xcac4b4, 0xe6e0d0, 13, moss=0.1)
    T['pave'] = tex_stone('ro3_paving', 0x9a978e, 0xbcb8ac, 0xd8d4c6, 14, moss=0.22)
    T['cliff'] = tex_stone('ro3_cliff', 0x6e6c66, 0x989488, 0xbcb6a6, 15, moss=0.0)
    T['plaster'] = tex_simple('ro3_plaster', [(0, 0xe2d6b8), (0.5, 0xf2e8d0), (1, 0xfff8e6)], 21, octaves=6, base_f=3, specks=[(0xcab890, 3000)])
    T['wood'] = tex_wood('ro3_wood', 0x7a5232, 0xb48654, 31)
    T['wood_l'] = tex_wood('ro3_wood_light', 0x9a6c42, 0xd0a46c, 32)
    T['timber'] = tex_wood('ro3_timber', 0x3e2a1a, 0x6e4a2e, 33)
    T['shutter'] = tex_wood('ro3_shutter', 0x3c6a62, 0x6a9a88, 34)
    T['roof'] = tex_roof('ro3_roof', 0x9a4030, 0xd0704a, 41)
    T['roof_d'] = tex_roof('ro3_roof_dark', 0x7a3226, 0xa8503a, 42)
    T['roof_m'] = tex_roof_moss('ro3_roof_moss', 44)
    T['moss'] = tex_simple('ro3_moss', [(0, 0x4a6e24), (0.5, 0x76a034), (1, 0xa8c850)], 44, base_f=10, octaves=5)
    T['bark'] = tex_simple('ro3_bark', [(0, 0x3e2e22), (0.5, 0x6a5038), (1, 0x8e7050)], 51, base_f=3, streak=(2600, 40, 1, hexc(0x2e2018), 0.4))
    T['birch'] = tex_simple('ro3_birch', [(0, 0xd8d2c4), (1, 0xf6f2e8)], 52, base_f=4, streak=(500, 14, 2, hexc(0x2e2a26), 0.85))
    T['soil'] = tex_simple('ro3_soil', [(0, 0x4a3422), (0.5, 0x6a4c32), (1, 0x8a6a48)], 61, base_f=8, specks=[(0xb09070, 4000), (0x2e2016, 3000)])
    T['leafcore'] = tex_simple('ro3_leafcore', [(0, 0x3a6e24), (0.5, 0x5a9230), (1, 0x7cb03c)], 71, base_f=10)
    leaves, flowers = atlas_leaves(), atlas_flowers()
    M = {
        '石壁': mat_tex('石壁', T['stone'], 1.2), '石壁_暗': mat_tex('石壁_暗', T['stone_d'], 1.2), '石壁_明': mat_tex('石壁_明', T['stone_l'], 1.0),
        '敷石': mat_tex('敷石', T['pave'], 1.0), '敷石_暗': mat_tex('敷石_暗', T['stone_d'], 1.0),
        '漆喰': mat_tex('漆喰', T['plaster'], 2.0), '木組み': mat_tex('木組み', T['timber'], 1.5), '板': mat_tex('板', T['wood'], 1.2), '板_明': mat_tex('板_明', T['wood_l'], 1.2),
        '木口': mat_tex('木口', None, color=(0xd8, 0xb0, 0x7a)), '鎧戸': mat_tex('鎧戸', T['shutter'], 1.0),
        '屋根': mat_tex('屋根', T['roof'], 0.5), '屋根_暗': mat_tex('屋根_暗', T['roof_d'], 0.5), '屋根_苔': mat_tex('屋根_苔', T['roof_m'], 0.6),
        '苔': mat_tex('苔', T['moss'], 1.0), '土': mat_tex('土', T['soil'], 1.5), '岩壁': mat_tex('岩壁', T['cliff'], 3.0),
        '幹': mat_tex('幹', T['bark'], 1.2), '幹_暗': mat_tex('幹_暗', T['bark'], 1.0), '白樺': mat_tex('白樺', T['birch'], 1.0),
        '葉_芯': mat_tex('葉_芯', T['leafcore'], 1.0),
        'カード_葉': mat_tex('カード_葉', leaves, alpha=True), 'カード_花': mat_tex('カード_花', flowers, alpha=True),
        '発光_窓': mat_tex('発光_窓', None, emission=(0xff, 0xc8, 0x70)), '発光_灯': mat_tex('発光_灯', None, emission=(0xff, 0xd8, 0x90)),
        '発光_妖精': mat_tex('発光_妖精', None, emission=(0x9a, 0xf0, 0xd8)),
        '鉄': mat_tex('鉄', None, color=(0x3a, 0x3c, 0x46), rough=0.5), '水': mat_tex('水', None, color=(0x4a, 0x8a, 0xb8), rough=0.1),
        '素焼き': mat_tex('素焼き', None, color=(0xc0, 0x70, 0x48)), '南瓜': mat_tex('南瓜', None, color=(0xf0, 0x92, 0x2a), rough=0.6),
        'キノコ_赤': mat_tex('キノコ_赤', None, color=(0xd8, 0x48, 0x3a), rough=0.6), 'キノコ_白': mat_tex('キノコ_白', None, color=(0xf4, 0xec, 0xdc)),
    }
    # 小屋の飾りに使っている単色の葉・花（窓の花箱・蔦・薔薇）は、葉の芯のテクスチャと明るい単色で
    for nm, col in (('葉', 0x5c9e32), ('葉_暗', 0x3c7a28), ('葉_明', 0x8cc23e), ('低木', 0x4a8a2e), ('低木_明', 0x7cb83a), ('蔦', 0x4a8e2e), ('茎', 0x4f8a32),
                    ('花_桃', 0xff8aa8), ('花_黄', 0xffd84a), ('花_白', 0xfffaf0), ('花_紫', 0xb89af0), ('花_橙', 0xffa050), ('花_青', 0x8ab4ff), ('ラベンダー', 0x9a7ad8),
                    ('薔薇', 0xf06a8a), ('岩', 0x9a968c), ('岩_暗', 0x7a766c), ('芝', 0x6aa83a)):
        M[nm] = mat_tex(nm, None, color=(col >> 16 & 255, col >> 8 & 255, col & 255))
    return M

# ---------------------------------------------------------------------------
# 形: 現状版の部品（MB）に、UV（世界座標の3方向投影 / 板は絵の位置）と、なめらかな面・板の法線を足す
# ---------------------------------------------------------------------------
CELL = {'leaf': (0, 0), 'fern': (0.5, 0), 'grass': (0, 0.5), 'pine': (0.5, 0.5), 'lav': (0, 0), 'yel': (0.5, 0), 'pink': (0, 0.5), 'white': (0.5, 0.5)}

FOLIAGE = {'葉', '蔦', '低木', '低木_明'}

class RB(base.MB):
    def __init__(self, rnd=None):
        super().__init__(rnd)
        self.uv = self.bm.loops.layers.uv.verify()
        self.card_nrm = self.bm.verts.layers.float_vector.new('card_n')
        self.is_card = self.bm.faces.layers.int.new('card')
    def card(self, center, right, up, w, h, cell, m='カード_葉', nrm=None, bottom=False):
        # 絵を貼った板。right・up は向き（単位ベクトル）、cell は 2×2 のマスの左下の UV。bottom: center が下の辺の中央
        c = Vector(center); r = Vector(right).normalized() * w / 2; u = Vector(up).normalized() * h
        b = c if bottom else c - u / 2
        pts = [b - r, b + r, b + r + u, b - r + u]
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs); f.material_index = self.mi(m); f[self.is_card] = 1
        u0, v0 = cell
        for loop, (uu, vv) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[self.uv].uv = (u0 + 0.005 + uu * 0.49, v0 + 0.005 + vv * 0.49)
        n = Vector(nrm) if nrm is not None else r.cross(u).normalized()
        for v in vs: v[self.card_nrm] = n.normalized()
        return f
    def blob(self, r, loc, scale=(1, 1, 1), rot=(0, 0, 0), m='葉', sub=1, amp=0.25, freq=1.6, seed=0, shade=None):
        # 現状版の「葉の塊」（薔薇のアーチ・蔦・花箱・植木鉢）は、葉の板の小さな茂みにする
        if m in FOLIAGE and r >= 0.1:
            R = r * max(scale)
            canopy(self, loc, R * 1.15, max(5, int(9 * R / 0.18)), self.rnd)
            return set()
        return super().blob(r, loc, scale, rot, m, sub, amp, freq, seed, shade)
    def mesh(self, name):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if not f[self.is_card]])
        names = self.names
        for f in bm.faces:
            if f[self.is_card]: continue
            tile = MATS[names[f.material_index]].get('tile', 1.0) if names[f.material_index] in MATS else 1.0
            n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
            for loop in f.loops:
                co = loop.vert.co
                uv = (co.y, co.z) if ax == 0 else (co.x, co.z) if ax == 1 else (co.x, co.y)
                loop[self.uv].uv = (uv[0] / tile, uv[1] / tile)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        loop_n = []
        cn = [v[self.card_nrm].copy() for v in bm.verts]
        cards = [f[self.is_card] for f in bm.faces]
        bm.free()
        for n in names: me.materials.append(MATS.get(n) or base.mat(n))
        for p in me.polygons: p.use_smooth = True
        try: me.set_sharp_from_angle(angle=math.radians(40))
        except AttributeError: pass
        for p in me.polygons:
            for li in p.loop_indices:
                loop_n.append(tuple(cn[me.loops[li].vertex_index]) if cards[p.index] else (0.0, 0.0, 0.0))
        if any(cards): me.normals_split_custom_set(loop_n)
        return me

base.MB = RB  # 現状版の部品（小屋・柵・井戸…）も UV となめらかな面で作られる

# ---------------------------------------------------------------------------
# 植物（板を重ねる）
# ---------------------------------------------------------------------------
def canopy(rb, c, R, n, rnd, center=None, core=True, cell='leaf'):
    # 茂みの塊: 中に暗い芯、表面に葉の板。板の法線は木全体の中心から外向き（やわらかい陰影）
    c = Vector(c); center = Vector(center) if center is not None else c
    if core: rb.blob(R * 0.72, c, scale=(1, 1, 0.85), m='葉_芯', sub=1, amp=0.25, seed=rnd.random() * 50)
    for k in range(n):
        d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1) * 0.8 + 0.15)).normalized()
        p = c + d * R * rnd.uniform(0.6, 1.0)
        out = (p - center).normalized()
        right = out.cross(Vector((0, 0, 1)))
        if right.length < 0.1: right = Vector((1, 0, 0))
        up = right.cross(out).normalized()
        # 板は外へ少し倒し、ねじる
        q = Matrix.Rotation(rnd.uniform(-0.6, 0.6), 3, out)
        s = R * rnd.uniform(0.85, 1.2)
        rb.card(p, q @ right, q @ (up * 0.85 + out * 0.4), s * 1.15, s, CELL[cell], nrm=(out * 0.6 + Vector((0, 0, 0.7))))

def tree_broad(seed, H):
    rnd = random.Random(seed); rb = RB(rnd)
    lean = rnd.uniform(-0.3, 0.3)
    trunk = lambda t: Vector((math.sin(t * 2.2 + seed) * 0.3 + lean * t * t, math.cos(t * 1.7 + seed) * 0.18, t * H))
    rb.tube(trunk, lambda t: 0.4 * (1 - t * 0.55) + max(0, 0.14 - t) * 2.4, 9, 10, '幹')
    for k in range(5):
        a, L = k / 5 * 6.2832 + rnd.random(), rnd.uniform(1.0, 1.5)
        rb.tube(lambda t, a=a, L=L: Vector((math.cos(a) * t * L, math.sin(a) * t * L, 0.4 * (1 - t) ** 2 - 0.05)), lambda t: 0.17 * (1 - t) + 0.02, 5, 6, '幹_暗')
    tips = [trunk(1)]
    for k in range(5 + rnd.randrange(2)):
        t0 = rnd.uniform(0.45, 0.8); b = trunk(t0); a = k / 5.5 * 6.2832 + rnd.random() * 0.6; L = rnd.uniform(1.6, 2.4)
        pth = lambda t, b=b, a=a, L=L: b + Vector((math.cos(a) * t * L, math.sin(a) * t * L, t * L * 0.6))
        rb.tube(pth, lambda t: 0.15 * (1 - t * 0.7), 5, 6, '幹_暗')
        tips += [pth(1), pth(0.55)]
    top = trunk(1) + Vector((0, 0, 0.6))
    for k, tp in enumerate(tips):
        R = rnd.uniform(1.15, 1.5) * (1.25 if k == 0 else 1)
        canopy(rb, tp + Vector((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0.1, 0.5))), R, 42, rnd, center=top - Vector((0, 0, 1.2)))
    return rb.mesh(f'ro3_広葉樹_{seed}')

def tree_fir(seed, H):
    rnd = random.Random(seed); rb = RB(rnd)
    rb.cyl(0.32, 0.1, H * 0.95, (0, 0, -0.1), m='幹', seg=9, jit=0.02)
    tiers = 9
    for i in range(tiers):
        t = i / tiers; z = H * (0.2 + t * 0.75); R = (1 - t) ** 1.1 * H * 0.3 + 0.35
        n = int(9 + (1 - t) * 10)
        for k in range(n):
            a = k / n * 6.2832 + rnd.random() * 0.4 + i
            out = Vector((math.cos(a), math.sin(a), 0))
            droop = rnd.uniform(-0.55, -0.25)
            dirv = (out + Vector((0, 0, droop))).normalized()
            side = Vector((-out.y, out.x, 0))
            # 小枝の板は幹から外へ（絵の下の辺が幹側）
            rb.card(Vector((0, 0, z)) + out * 0.1, side, dirv, R * 0.75, R, CELL['pine'], bottom=True, nrm=(out * 0.6 + Vector((0, 0, 0.8))))
    rb.blob(0.5, (0, 0, H * 0.98), scale=(0.6, 0.6, 1.4), m='葉_芯', sub=1, amp=0.2)
    return rb.mesh(f'ro3_針葉樹_{seed}')

def tree_birch(seed, H):
    rnd = random.Random(seed); rb = RB(rnd)
    trunk = lambda t: Vector((math.sin(t * 2.0 + seed) * 0.15, math.cos(t * 1.5 + seed) * 0.1, t * H))
    rb.tube(trunk, lambda t: 0.2 * (1 - t * 0.5) + max(0, 0.1 - t) * 1.2, 8, 8, '白樺')
    tips = [trunk(1)]
    for k in range(4):
        b = trunk(rnd.uniform(0.55, 0.85)); a = k / 4 * 6.28 + rnd.random(); L = rnd.uniform(0.9, 1.4)
        pth = lambda t, b=b, a=a, L=L: b + Vector((math.cos(a) * t * L, math.sin(a) * t * L, t * L * 0.8))
        rb.tube(pth, lambda t: 0.07 * (1 - t * 0.6), 3, 5, '白樺')
        tips.append(pth(1))
    for tp in tips: canopy(rb, tp + Vector((0, 0, 0.3)), rnd.uniform(0.8, 1.0), 20, rnd, center=trunk(0.8))
    return rb.mesh(f'ro3_白樺_{seed}')

def bush(seed, R=0.55, flowers=False):
    rnd = random.Random(seed); rb = RB(rnd)
    for k in range(2):
        canopy(rb, (rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), R * 0.75), R, 22, rnd, center=(0, 0, 0))
    if flowers:
        for k in range(6):
            a = rnd.random() * 6.28
            rb.card((math.cos(a) * R * 0.8, math.sin(a) * R * 0.8, R * 1.1), (-math.sin(a), math.cos(a), 0), (math.cos(a) * 0.3, math.sin(a) * 0.3, 1), 0.35, 0.35, CELL['white'], m='カード_花', nrm=(0, 0, 1))
    return rb.mesh('ro3_低木')

def fern_ro3(seed):
    rnd = random.Random(seed); rb = RB(rnd)
    n = 9
    for k in range(n):
        a = k / n * 6.2832 + rnd.uniform(-0.2, 0.2)
        out = Vector((math.cos(a), math.sin(a), 0)); side = Vector((-out.y, out.x, 0))
        up = (out * math.cos(rnd.uniform(0.7, 1.0)) + Vector((0, 0, math.sin(rnd.uniform(0.7, 1.0))))).normalized()
        rb.card((0, 0, 0.02), side, up, 0.42, rnd.uniform(0.75, 1.05), CELL['fern'], bottom=True, nrm=(0, 0, 1))
    return rb.mesh('ro3_シダ')

def grass_tuft(seed, h=0.55):
    rnd = random.Random(seed); rb = RB(rnd)
    for k in range(3):
        a = k / 3 * math.pi + rnd.random() * 0.4
        rb.card((0, 0, -0.02), (math.cos(a), math.sin(a), 0), (rnd.uniform(-0.1, 0.1), rnd.uniform(-0.1, 0.1), 1), h * 1.1, h, CELL['grass'], bottom=True, nrm=(0, 0, 1))
    return rb.mesh('ro3_草')

def flower_tuft(kind, seed, h=0.45):
    rnd = random.Random(seed); rb = RB(rnd)
    for k in range(3):
        a = k / 3 * math.pi + rnd.random() * 0.5
        rb.card((rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), -0.01), (math.cos(a), math.sin(a), 0), (0, 0, 1), h, h, CELL[kind], m='カード_花', bottom=True, nrm=(0, 0, 1))
    rb.card((0, 0, 0.03), (1, 0, 0), (0, 1, 0.05), h * 0.8, h * 0.8, CELL['grass'], bottom=False, nrm=(0, 0, 1))
    return rb.mesh(f'ro3_花_{kind}')

def bed_clump(kind, seed):
    # 花壇の株: 花の板を4枚、葉の板を2枚。現状版の株と同じ大きさ（直径 0.5 m ほど）
    rnd = random.Random(seed); rb = RB(rnd)
    for k in range(4):
        a = k / 4 * math.pi + rnd.random() * 0.4
        rb.card((rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08), 0.0), (math.cos(a), math.sin(a), 0), (rnd.uniform(-0.15, 0.15), 0, 1), 0.55, rnd.uniform(0.42, 0.55), CELL[kind], m='カード_花', bottom=True, nrm=(0, 0, 1))
    for k in range(2):
        a = rnd.random() * 6.28
        rb.card((0, 0, 0.0), (math.cos(a), math.sin(a), 0), (math.cos(a + 1.57) * 0.8, math.sin(a + 1.57) * 0.8, 0.6), 0.5, 0.42, CELL['fern'], bottom=True, nrm=(0, 0, 1))
    # 上から見ても花が見えるように、寝かせた花の板を2枚（ゲームのカメラは高い所から見下ろす）
    for k in range(2):
        a = k * 1.7 + rnd.random()
        rb.card((math.cos(a) * 0.06, math.sin(a) * 0.06, 0.12), (math.cos(a), math.sin(a), 0), (-math.sin(a) * 0.9, math.cos(a) * 0.9, 0.45), 0.55, 0.5, CELL[kind], m='カード_花', nrm=(0, 0, 1))
    return rb.mesh(f'ro3_花壇_{kind}')

def rock_ro3(seed, size=1.0):
    rnd = random.Random(seed); rb = RB(rnd)
    fs = rb.blob(size, (0, 0, size * 0.22), scale=(rnd.uniform(1.0, 1.4), rnd.uniform(0.8, 1.1), rnd.uniform(0.6, 0.85)), m='石壁', sub=3, amp=0.28, freq=1.0, seed=seed)
    for f in fs:
        if f.normal.z > 0.55: f.material_index = rb.mi('苔')
    for v in {v for f in fs for v in f.verts}:
        if v.co.z < -0.1: v.co.z = -0.1
    return rb.mesh(f'ro3_岩_{seed}')

def cliff(seed, w, h):
    # 岩壁の1枚: 縦横に分けた面を押し出し、段と割れ目を付ける。上の縁に苔
    rnd = random.Random(seed); rb = RB(rnd)
    bm = rb.bm; nx, nz = 16, 10; grid = []
    for i in range(nz + 1):
        row = []
        for j in range(nx + 1):
            x = (j / nx - 0.5) * w; z = i / nz * h
            d = noise.fractal(Vector((x * 0.35 + seed, z * 0.45, seed * 0.3)), 0.7, 2.0, 4) * 0.9 + math.floor(z / h * 3) * 0.25
            bend = (x / w) ** 2 * w * 0.35
            row.append(bm.verts.new((x, d + bend - z * 0.18, z - 0.4)))
        grid.append(row)
    mi = rb.mi('岩壁')
    for i in range(nz):
        for j in range(nx):
            bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j])).material_index = mi
    # 裏と上を閉じる（輪郭線は使わないが、影を正しく落とすため）
    back = [bm.verts.new((v.co.x, v.co.y + 2.5, v.co.z)) for v in grid[-1]]
    for j in range(nx): bm.faces.new((grid[-1][j], back[j], back[j + 1], grid[-1][j + 1])).material_index = mi
    for j in range(0, nx + 1, 2):
        p = grid[-1][j].co
        rb.blob(rnd.uniform(0.45, 0.7), (p.x, p.y + 0.6, p.z + 0.05), scale=(1.6, 1.4, 0.45), m='苔', sub=1, amp=0.3, seed=j + seed)
        if rnd.random() < 0.6: canopy(rb, (p.x, p.y + 0.4, p.z + 0.35), 0.55, 8, rnd, core=False)
    return rb.mesh(f'ro3_岩壁_{seed}')

# ---------------------------------------------------------------------------
# 地面: 1枚の描いたテクスチャ（芝・土の小道・木の下・花壇・妖精の輪・小屋の足元）
# ---------------------------------------------------------------------------
GROUND_HALF, GROUND_PX = 30.0, 2048

def paint_ground(trees, stones_rects):
    n = GROUND_PX; s = GROUND_HALF * 2 / n
    xs = (np.arange(n, dtype=np.float32) + 0.5) * s - GROUND_HALF
    X, Y = np.meshgrid(xs, xs)  # 行 = Y（下から上）
    # 芝: 大きな濃淡 + 細かい斑 + 葉先の筆あと
    v = fbm(n, 7, 101, 6) * 0.65 + fbm(n, 4, 102, 48) * 0.35
    img = ramp(v, [(0.0, 0x6a9e2e), (0.35, 0x86b836), (0.65, 0xa6cc42), (1.0, 0xcae05a)])
    strokes(img, 160000, 7, 1, hexc(0xc8e070), 0.35, 103)
    strokes(img, 120000, 6, 1, hexc(0x4e8a2a), 0.3, 104)
    # 木の下の陰と落ち葉・土（森の床）
    shade = np.zeros((n, n), np.float32)
    for x, y, r in trees:
        shade += np.exp(-((X - x) ** 2 + (Y - y) ** 2) / (2 * (r * 1.4) ** 2)).astype(np.float32)
    shade = np.clip(shade, 0, 1)
    floor = ramp(fbm(n, 6, 105, 12), [(0, 0x52662a), (0.5, 0x6e8232), (1, 0x8e7e44)])
    k = (shade * 0.55)[..., None]
    img = img * (1 - k) + floor * k
    # 外側（輪郭の外）ほど暗い森の床
    ang = np.arctan2(X, Y); rel = np.hypot(X, Y) / bound_np(ang)
    k = np.clip((rel - 0.92) * 2.2, 0, 1)[..., None] * 0.7
    img = img * (1 - k) + floor * 0.85 * k
    # 土の小道（縁はでこぼこで、芝が少しかぶる）
    def poly_dist(pts):
        d = np.full((n, n), 1e9, np.float32)
        for (ax, ay), (bx, by) in zip(pts[:-1], pts[1:]):
            dx, dy = bx - ax, by - ay
            t = np.clip(((X - ax) * dx + (Y - ay) * dy) / (dx * dx + dy * dy), 0, 1)
            d = np.minimum(d, np.hypot(ax + dx * t - X, ay + dy * t - Y))
        return d
    edge = fbm(n, 5, 106, 24) - 0.5
    dirt = ramp(fbm(n, 6, 107, 16), [(0, 0xb08a52), (0.5, 0xd2aa6a), (1, 0xe8cc90)])
    rng = np.random.default_rng(108)
    for col, cnt in ((0x7a6448, 30000), (0xe8d4a8, 20000)):
        ys, xs2 = rng.integers(0, n, cnt), rng.integers(0, n, cnt); dirt[ys, xs2] = hexc(col)
    for pts, w in ((base.PATH, 1.05), ([(-1.3, -5.3), (-5.4, -5.7), (-7.5, -3.9), (-8.4, -0.9)], 0.45)):
        d = poly_dist(pts) + edge * 0.7
        k = np.clip((w - d) / 0.35, 0, 1)
        k = np.clip(k + (fbm(n, 3, 109, 64) - 0.5) * 0.4 * (k > 0) * (k < 1), 0, 1)[..., None]
        img = img * (1 - k) + dirt * k
    # 花壇の土・小屋の足元の陰・石畳の目地のまわり
    soil = ramp(fbm(n, 5, 110, 20), [(0, 0x3e2a1a), (1, 0x6a4a30)])
    for x0, x1, y0, y1 in base_beds():
        k = np.clip(np.minimum.reduce([X - x0, x1 - X, Y - y0, y1 - Y]) / 0.15 + 0.4, 0, 1)[..., None]
        img = img * (1 - k) + soil * k
    hx, hy = base.HX, base.HY
    dh = np.maximum(np.abs(X - hx) - base.HW / 2, 0) ** 2 + np.maximum(np.abs(Y - hy) - base.HD / 2, 0) ** 2
    img *= (1 - 0.45 * np.exp(-dh / 0.5))[..., None]
    for x0, x1, y0, y1 in stones_rects:
        dd = np.maximum.reduce([x0 - X, X - x1, y0 - Y, Y - y1])
        img *= (1 - 0.3 * np.clip(1 - np.abs(dd) / 0.25, 0, 1))[..., None]
    # 妖精の輪: 少し濃い芝の輪
    fx, fy = base.FAIRY
    ring = np.exp(-((np.hypot((X - fx) / 1.35, (Y - fy) / 1.15) - 1.0) ** 2) / 0.02)
    img = img * (1 - 0.25 * ring[..., None]) + hexc(0x3e7a2a) * 0.25 * ring[..., None]
    return save('ro3_ground', img)

def bound_np(a):
    # base.bound と同じ式（配列で）
    sx, sz = base.AREA['ell']; R = base.AREA['R']; dx, dz = np.sin(a), -np.cos(a)
    b = 1 / np.sqrt((dx / (R * sx)) ** 2 + (dz / (R * sz)) ** 2)
    p1, p2, p3 = base.SHAPE; w = base.AREA['wob']
    return (b * (1 + w * (0.55 * np.sin(3 * a + p1) + 0.3 * np.sin(5 * a + p2) + 0.15 * np.sin(8 * a + p3)))).astype(np.float32)

def base_beds():
    return [tuple(b) for b in json.loads(bpy.context.scene.get('glade_beds', '[]'))] or BEDS

BEDS = [(-5.6, -1.4, -3.9, 1.6), (1.4, 5.6, -3.9, 1.6), (-3.1, -0.9, 2.45, 3.05), (0.9, 3.1, 2.45, 3.05)]

def ground_mesh(im):
    bm = bmesh.new(); n = 120
    uvl = bm.loops.layers.uv.verify()
    vs = {}
    for i in range(n + 1):
        for j in range(n + 1):
            x = -GROUND_HALF + j / n * GROUND_HALF * 2; y = -GROUND_HALF + i / n * GROUND_HALF * 2
            a = math.atan2(x, y); br = base.bound(a) - 0.5; r = math.hypot(x, y)
            z = (r - br) * 0.6 if r > br else 0.0   # ゲームの makeHeight と同じ（一角は平ら、輪郭の外は上がる）
            vs[i, j] = bm.verts.new((x, y, z + 0.03))
    for i in range(n):
        for j in range(n):
            f = bm.faces.new((vs[i, j], vs[i, j + 1], vs[i + 1, j + 1], vs[i + 1, j]))
            for loop in f.loops:
                loop[uvl].uv = ((loop.vert.co.x + GROUND_HALF) / (GROUND_HALF * 2), (loop.vert.co.y + GROUND_HALF) / (GROUND_HALF * 2))
    me = bpy.data.meshes.new('ro3_地面'); bm.to_mesh(me); bm.free()
    me.materials.append(mat_tex('地面', im, 1.0, rough=1.0))
    for p in me.polygons: p.use_smooth = True
    return me

# ---------------------------------------------------------------------------
# 現状版の配置を読む
# ---------------------------------------------------------------------------
def read_baseline():
    path = os.path.join(ROOT, 'tools', 'blender', 'cottage_glade.blend')
    bpy.ops.wm.open_mainfile(filepath=path)
    objs = []
    for ob in bpy.data.objects:
        cname = ob.users_collection[0].name if ob.users_collection else ''
        if cname == 'プレビュー': continue
        objs.append({'name': ob.name.split('.')[0], 'mesh': ob.data.name if ob.type == 'MESH' else None, 'coll': cname, 'empty': ob.type == 'EMPTY',
                     'loc': tuple(ob.location), 'rz': ob.rotation_euler.z, 's': ob.scale.x,
                     'props': {k: ob[k] for k in ob.keys() if k.startswith('col') or k == 'mark'}})
    beds = bpy.context.scene.get('glade_beds', '[]')
    return objs, beds

def put(me, name, cname, d):
    ob = bpy.data.objects.new(name, me)
    ob.location = d['loc']; ob.rotation_euler = (0, 0, d['rz']); ob.scale = (d['s'],) * 3
    base.coll(cname).objects.link(ob)
    for k, v in d['props'].items(): ob[k] = v
    return ob

# ---------------------------------------------------------------------------
# 組み立て
# ---------------------------------------------------------------------------
def build():
    objs, beds_json = read_baseline()
    C.reset_scene(); base.COLL.clear()
    bpy.context.scene['glade_beds'] = beds_json
    build_materials()
    # 現状版と同じ部品（小屋・柵・井戸・ベンチ・かぼちゃ畑・角灯の柱・花壇の土）を、UV となめらかな面で作り直す
    meshes = {}
    meshes['小屋'] = base.build_cottage()
    fence, _ = base.build_fence(); meshes['柵'] = fence
    rnd = random.Random(7)
    # 植物・岩の置き換え先
    broad = {s: tree_broad(s, h) for s, h in ((3, 5.4), (8, 6.2), (14, 5.0), (21, 6.6))}
    firs = {s: tree_fir(s, h) for s, h in ((4, 7.5), (9, 8.6), (17, 6.8))}
    birch = tree_birch(5, 6.2)
    bushes = [bush(70 + k, flowers=k == 1) for k in range(3)]
    ferns = [fern_ro3(s) for s in (1, 2)]
    flowers = {k: flower_tuft(k, i) for i, k in enumerate(('lav', 'yel', 'pink', 'white'))}
    beds_m = {k: bed_clump(k, 10 + i) for i, k in enumerate(('lav', 'yel', 'pink', 'white'))}
    rocks = [rock_ro3(s, sz) for s, sz in ((2, 0.9), (6, 1.2), (12, 0.7), (19, 1.0))]
    grass = [grass_tuft(s, h) for s, h in ((1, 0.5), (2, 0.65), (3, 0.42))]
    # 庭の小物は現状版の関数で作る（place() で置かれる。位置は現状版と同じ）
    base.build_garden_props()
    garden_made = {ob.name.split('.')[0] for ob in base.coll('庭').objects}
    for ob in list(base.coll('庭').objects):
        if ob.name.split('.')[0] == '低木': bpy.data.objects.remove(ob)  # 低木は板の茂みで置き直す（下のループ）
    for ob in list(base.coll('目印').objects): bpy.data.objects.remove(ob)
    trees = []
    flower_kinds = ['pink', 'yel', 'white', 'lav']
    for d in objs:
        nm, mesh = d['name'], d['mesh']
        if d['empty']:
            e = bpy.data.objects.new(nm, None); e.location = d['loc']; e.rotation_euler = (0, 0, d['rz'])
            for k, v in d['props'].items(): e[k] = v
            base.coll('目印').objects.link(e); continue
        if nm == '小屋': put(meshes['小屋'], '小屋', '小屋', d)
        elif nm == '柵': put(meshes['柵'], '柵', '庭', d)
        elif nm == '小道': put(paving(), '小道', '庭', d)
        elif nm == '花壇の土': put(soil_beds(), '花壇の土', '庭', d)
        elif nm == '花':
            k = flower_kinds[int(abs(d['loc'][0] * 3.1 + d['loc'][1] * 1.7)) % 4]
            if d['loc'][1] > 2.3: k = 'lav'
            put(beds_m[k], '花', '庭', d)
        elif nm == '低木': put(bushes[int(abs(d['loc'][0] * 7 + d['loc'][1] * 3)) % 3], '低木', d['coll'], d)
        elif nm.startswith('広葉樹'):
            put(broad[int(mesh.split('_')[1])], '広葉樹', '森', d); trees.append((d['loc'][0], d['loc'][1], 2.6 * d['s']))
        elif nm.startswith('針葉樹'):
            put(firs[int(mesh.split('_')[1])], '針葉樹', '森', d); trees.append((d['loc'][0], d['loc'][1], 1.9 * d['s']))
        elif nm.startswith('白樺'):
            put(birch, '白樺', '森', d); trees.append((d['loc'][0], d['loc'][1], 1.5 * d['s']))
        elif nm == 'シダ': put(ferns[int(abs(d['loc'][0] * 5 + d['loc'][1])) % 2], 'シダ', '森', d)
        elif nm == '岩': put(rocks[int(abs(d['loc'][0] * 7 + d['loc'][1])) % 4], '岩', '森', d)
        elif nm in ('キノコ', '光るキノコ', '切り株', '倒木') and nm not in MESH_CACHE:
            MESH_CACHE[nm] = rebuild_small(nm)
            put(MESH_CACHE[nm], nm, '森', d)
        elif nm in MESH_CACHE: put(MESH_CACHE[nm], nm, '森', d)
    # 草むら・野の花（RO3 らしい密度）: 小道・花壇・小屋・柵・岩を避けて散らす
    sc_rnd = random.Random(201)
    cols = [(o['loc'][0], o['loc'][1], o['props'].get('col_r', 0.5)) for o in objs if o['props'].get('col') == 'circle']
    def blocked(x, y, pad):
        if base.near_house(x, y, -0.6 + pad) or base.dist_path(x, y) < 1.0 + pad: return True
        if any(x0 - 0.2 < x < x1 + 0.2 and y0 - 0.2 < y < y1 + 0.2 for x0, x1, y0, y1 in BEDS): return True
        if abs(y - base.FENCE_Y) < 0.35 and abs(x) < base.FENCE_X + 0.3: return True
        if abs(abs(x) - base.FENCE_X) < 0.35 and base.FENCE_Y < y < 2.6: return True
        return any(math.hypot(x - cx, y - cy) < r + pad for cx, cy, r in cols)
    for k in range(2600):
        a = sc_rnd.random() * 6.2832; r = math.sqrt(sc_rnd.random()) * base.bound(a) * 1.15
        x, y = math.sin(a) * r, math.cos(a) * r
        if blocked(x, y, 0.1): continue
        rel = base.rel(x, y)
        # 庭の中は刈った芝（草むらを少なく）、外の縁ほど濃く
        if base.in_garden(x, y) and sc_rnd.random() < 0.85: continue
        if rel < 0.5 and sc_rnd.random() < 0.5: continue
        g = grass[sc_rnd.randrange(3)]
        if sc_rnd.random() < 0.12 and rel < 1.0: g = flowers[sc_rnd.choice(['yel', 'yel', 'white', 'pink', 'lav'])]
        place_simple(g, '草', '森', (x, y, 0), sc_rnd.random() * 6.28, sc_rnd.uniform(0.8, 1.3) * (1.2 if rel > 0.9 else 1))
    # 外周の後ろの岩壁（入口のある南は開ける）
    for k, deg in enumerate((-120, -95, -70, -45, -20, 5, 30, 55, 80, 105, 128)):
        a = math.radians(deg) + random.Random(k).uniform(-0.05, 0.05)
        r = base.bound(a) * 1.28
        x, y = math.sin(a) * r, math.cos(a) * r
        w, h = 7.5, random.Random(k).uniform(3.5, 6.0)
        ob = place_simple(cliff(300 + k, w, h), '岩壁', '森', (x, y, (r - base.bound(a) + 0.5) * 0.6 - 0.4), math.atan2(-x, y), 1.0)
    # 地面
    rects = [(-0.9, 0.9, base.FENCE_Y, base.FRONT - 0.6)]
    ground = ground_mesh(paint_ground(trees, rects))
    gob = bpy.data.objects.new('地面', ground); base.coll('地面').objects.link(gob)
    return objs

MESH_CACHE = {}

def place_simple(me, name, cname, loc, rz, s):
    ob = bpy.data.objects.new(name, me); ob.location = loc; ob.rotation_euler = (0, 0, rz); ob.scale = (s, s, s)
    base.coll(cname).objects.link(ob); return ob

def rebuild_small(nm):
    rnd = random.Random(9)
    if nm == 'キノコ': return base.mushrooms(7)
    if nm == '光るキノコ': return base.mushrooms(8, glow=True)
    log, stump = base.log_and_stump(rnd)
    return log if nm == '倒木' else stump

def soil_beds():
    rnd = random.Random(41); rb = RB(rnd)
    for x0, x1, y0, y1 in base_beds():
        rb.box((x1 - x0, y1 - y0, 0.16), ((x0 + x1) / 2, (y0 + y1) / 2, 0.0), m='土', jit=0.03, bevel=0.06)
        # 花壇の縁石
        for side in range(4):
            L = (x1 - x0) if side < 2 else (y1 - y0); nstone = int(L / 0.32)
            for k in range(nstone):
                t = (k + 0.5) / nstone
                p = (x0 + (x1 - x0) * t, y0 if side == 0 else y1) if side < 2 else (x0 if side == 2 else x1, y0 + (y1 - y0) * t)
                rb.blob(0.13, (p[0], p[1], 0.06), scale=(1.2, 1.0, 0.7), m='石壁_明', sub=1, amp=0.2, seed=k + side * 31)
    return rb.mesh('ro3_花壇の土')

def paving():
    # 玄関から門までの石畳（長方形の石を互い違いに）と、門の外の飛び石。目地には苔と芝
    rnd = random.Random(21); rb = RB(rnd)
    y = base.FRONT - 0.65; row = 0
    while y > base.FENCE_Y + 0.1:
        h = rnd.uniform(0.42, 0.55); x = -0.95 - (0.25 if row % 2 else 0)
        while x < 0.95:
            w = rnd.uniform(0.45, 0.7); xa, xb = max(x, -0.95), min(x + w, 0.95)
            if xb - xa > 0.15:
                rb.box((xb - xa - 0.06, h - 0.06, 0.1), ((xa + xb) / 2, y - h / 2, 0.02), m='敷石' if rnd.random() < 0.75 else '敷石_暗', jit=0.012, bevel=0.03)
            x += w
        y -= h; row += 1
    for s in (-1, 1):  # 縁石
        yy = base.FRONT - 0.65
        while yy > base.FENCE_Y + 0.1:
            rb.box((0.16, 0.38, 0.14), (s * 1.05, yy - 0.2, 0.04), m='石壁', jit=0.01, bevel=0.03); yy -= 0.42
    L = base.path_len(); n = int(L / 0.85)
    for i in range(n):
        p, d = base.path_pt((i + 0.5) / n)
        if p.y > base.FENCE_Y - 0.6 or i * 0.85 > L - 3.4: continue
        if rnd.random() < 0.35: continue
        side = Vector((-d.y, d.x)) * rnd.uniform(-0.35, 0.35)
        rb.cyl(rnd.uniform(0.24, 0.34), 0.3, 0.06, (p.x + side.x, p.y + side.y, -0.02), rot=(0, 0, rnd.random() * 3), m='敷石', seg=9, jit=0.03, scale=(rnd.uniform(0.9, 1.3), 0.85, 1))
    # 井戸への飛び石（現状版と同じ道筋）
    pts = [Vector(p) for p in ((-1.3, -5.3), (-5.4, -5.7), (-7.5, -3.9), (-8.4, -0.9))]
    for i in range(len(pts) - 1):
        m = max(1, int((pts[i + 1] - pts[i]).length / 0.9))
        for k in range(m):
            q = pts[i].lerp(pts[i + 1], (k + 0.5) / m)
            rb.cyl(0.26, 0.24, 0.06, (q.x, q.y, -0.02), rot=(0, 0, rnd.random() * 3), m='敷石', seg=9, jit=0.03)
    return rb.mesh('ro3_小道')

# ---------------------------------------------------------------------------
# プレビュー・書き出し
# ---------------------------------------------------------------------------
def build_preview():
    # 現状版と同じカメラ。光は暖かい日差しとやわらかい空（木漏れ日は木の板の影がつくる）
    sun = bpy.data.lights.new('日差し', 'SUN'); sun.energy = 3.0; sun.color = (1.0, 0.92, 0.78); sun.angle = math.radians(2.5)
    so = bpy.data.objects.new('日差し', sun); so.rotation_euler = (math.radians(50), math.radians(-12), math.radians(210))  # 南西から（小屋の正面に日が当たる）; base.coll('プレビュー').objects.link(so)
    for ob in base.coll('目印').objects:
        if ob.get('mark') == 'light':
            L = bpy.data.lights.new('灯り', 'POINT'); L.energy = 45; L.color = (1.0, 0.78, 0.45); L.shadow_soft_size = 0.25
            lo = bpy.data.objects.new('灯り', L); lo.location = ob.location; base.coll('プレビュー').objects.link(lo)
    win = bpy.data.lights.new('窓の灯り', 'POINT'); win.energy = 90; win.color = (1.0, 0.75, 0.42)
    wo = bpy.data.objects.new('窓の灯り', win); wo.location = (base.HX, base.FRONT - 0.6, 1.9); base.coll('プレビュー').objects.link(wo)
    world = bpy.data.worlds.new('空'); bpy.context.scene.world = world; world.use_nodes = True
    nt = world.node_tree; bg = nt.nodes['Background']
    sky = nt.nodes.new('ShaderNodeTexSky')
    try:
        sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(42); sky.sun_rotation = math.radians(220); sky.air_density = 1.0; sky.dust_density = 1.5
        nt.links.new(sky.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 0.2
    except Exception:
        bg.inputs['Color'].default_value = (0.6, 0.78, 0.95, 1); bg.inputs['Strength'].default_value = 1.0
    cams = {'俯瞰': ((-7.5, -23.0, 19.0), (0.4, 0.6, 0.6), 34), '正面': ((3.4, -10.5, 3.2), (0.0, 4.0, 2.5), 50), 'ゲーム視点': ((0.0, -13.0, 12.0), (0.0, -3.0, 1.2), 50)}
    for name, (loc, tgt, fl) in cams.items():
        cd = bpy.data.cameras.new(name); cd.lens = fl
        co = bpy.data.objects.new(name, cd); co.location = loc
        co.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        base.coll('プレビュー').objects.link(co)
    bpy.context.scene.camera = bpy.data.objects['俯瞰']

def write_layout():
    # 当たり判定・小道・明かりは現状版のレイアウトと同じ値を使う（置き場所は同じ）。モデルと見た目の指定だけ変える
    js = os.path.join(ROOT, 'public', 'shared', 'glade-layout-ro3.js')
    with open(js, 'w', encoding='utf-8') as f:
        f.write('// 自動生成: tools/blender/cottage_glade_ro3.py（RO3 風の比較版。手で直さない）\n')
        f.write('// 置き場所・当たり判定は現状版（glade-layout.js）と同じ。モデル・地面・草の扱いだけ違う\n')
        f.write("import { GLADE } from './glade-layout.js';\n\n")
        f.write("export const GLADE_RO3 = { ...GLADE, model: 'blender/cottage_glade_ro3.glb', style: 'ro3', ownGround: true };\n")
    print('書き出し:', js)

def export():
    objs = [o for c in ('小屋', '庭', '森', '地面') for o in base.COLL[c].objects]
    out = os.path.join(ROOT, 'public', 'assets', 'models', 'blender', 'cottage_glade_ro3.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT',
                              export_cameras=False, export_lights=False, export_image_format='AUTO')
    print('書き出し:', out, os.path.getsize(out) // 1024, 'KB')
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
    print('三角形の数（配置したぶん）:', tris)
    write_layout()

def render():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 1280, 800; sc.view_settings.view_transform = 'AgX'
    try: sc.view_settings.look = 'AgX - Punchy'
    except TypeError: pass
    sc.view_settings.exposure = -0.1
    out_dir = os.path.join(ROOT, 'docs', 'glade', 'ro3'); os.makedirs(out_dir, exist_ok=True)
    for cam, fn in (('俯瞰', 'blender-overview.png'), ('正面', 'blender-front.png')):
        sc.camera = bpy.data.objects[cam]; sc.render.filepath = os.path.join(out_dir, fn)
        bpy.ops.render.render(write_still=True); print('描画:', sc.render.filepath)
    sc.camera = bpy.data.objects['俯瞰']

def main():
    build()
    for c in ('地面', '目印', 'プレビュー'): base.coll(c)
    build_preview()
    export()
    blend = os.path.join(ROOT, 'tools', 'blender', 'cottage_glade_ro3.blend')
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True, relative_remap=True)
    print('保存:', blend)
    if '--render' in ARGS: render()

if __name__ == '__main__':
    main()
