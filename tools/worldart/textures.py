"""環境アートのテクスチャを描く（シード固定・再生成可能）。
python3 -I tools/worldart/textures.py [出力先=art/textures]

出力（すべて PNG）:
  leaf_broad.png   掌状の葉の小枝（アルファ抜き）      広葉樹・茂みのカード
  leaf_frond.png   シダ状の葉（アルファ抜き）          もみの段のカード
  grass_blades.png 草の葉の束（アルファ抜き）          地面の草の房
  ground_grass.png 草地（端がつながる）
  ground_dirt.png  土・砂の道（端がつながる）
  ground_sand.png  浜の砂（端がつながる）
  ground_cobble.png 石畳（端がつながる）
  rock.png         岩肌（端がつながる）
  wood.png         木（左半分=樹皮の筋、右半分=削った木口）
  albedo の明るさは「日なたで参考の色になる手前」に置く。最終の色は光と頂点色で決める。
"""
import sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else 'public/worldart/tex'
os.makedirs(OUT, exist_ok=True)


def rng(seed):
    return np.random.default_rng(seed)


def fnoise(n, scale, seed, octaves=1):
    """端がつながる帯域ノイズ（周波数領域でガウス帯を通す）。0..1"""
    r = rng(seed)
    acc = np.zeros((n, n))
    amp = 1.0
    for o in range(octaves):
        w = r.standard_normal((n, n))
        fy = np.fft.fftfreq(n)[:, None]; fx = np.fft.fftfreq(n)[None, :]
        f = np.sqrt(fx * fx + fy * fy)
        f0 = 1.0 / (scale / (2 ** o))
        filt = np.exp(-((f / f0) ** 2))
        v = np.real(np.fft.ifft2(np.fft.fft2(w) * filt))
        acc += amp * v / (v.std() + 1e-9)
        amp *= 0.5
    acc = (acc - acc.min()) / (acc.max() - acc.min())
    return acc


def lerp(a, b, t):
    a = np.asarray(a, float); b = np.asarray(b, float)
    return a + (b - a) * t


def save_rgb(arr, name):
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGB').save(os.path.join(OUT, name))


def save_rgba(img, name):
    img.save(os.path.join(OUT, name))


def tiled_draw(n, draw_fn):
    """3x3 に並べたキャンバスに描いて中央を切り出す → 端がつながる"""
    big = Image.new('RGBA', (n * 3, n * 3), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    draw_fn(d, n)
    tile = big.crop((n, n, 2 * n, 2 * n))
    # 外側に描いた分も中央へ足し込む
    acc = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    for oy in range(3):
        for ox in range(3):
            acc = Image.alpha_composite(acc, big.crop((ox * n, oy * n, ox * n + n, oy * n + n)))
    return acc


def col(c):
    return tuple(int(max(0, min(1, x)) * 255) for x in c)


# ---------------------------------------------------------------- 葉
def leaflet_poly(cx, cy, ang, length, width, serr=0.0, r=None, steps=14):
    """先のとがった披針形の小葉。縁に小さなぎざぎざ"""
    pts_l, pts_r = [], []
    for i in range(steps + 1):
        t = i / steps
        w = width * math.sin(math.pi * t ** 0.8) * (1 - 0.15 * t)
        if serr and r is not None and 0.15 < t < 0.9:
            w *= 1 + serr * (r.random() - 0.3)
        px = cx + math.cos(ang) * length * t
        py = cy + math.sin(ang) * length * t
        nx, ny = -math.sin(ang), math.cos(ang)
        pts_l.append((px + nx * w, py + ny * w))
        pts_r.append((px - nx * w, py - ny * w))
    return pts_l + pts_r[::-1]


def leaf_broad(n=512, seed=11):
    """掌状の葉（5〜7枚の小葉）を小枝ごと集めた絵。R02 右下の茂み・R04 右の木"""
    r = rng(seed)
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 小枝の軸
    stem = (0.30, 0.24, 0.12, 1)
    leaves = []
    for k in range(13):
        a = r.uniform(0, 2 * math.pi); rad = (r.uniform(0.0, 1.0) ** 0.6) * 0.27 * n
        cx = n / 2 + math.cos(a) * rad; cy = n / 2 + math.sin(a) * rad
        leaves.append((cx, cy, r.uniform(0.19, 0.25) * n, r.uniform(0, 2 * math.pi), r.uniform(0, 1)))
        d.line([(n / 2, n / 2), (cx, cy)], fill=col(stem), width=3)
    # 下の葉ほど暗く（奥行き）、明るい葉を後で上に重ねる
    leaves.sort(key=lambda l: l[4])
    for cx, cy, size, rot, depth in leaves:
        lobes = int(r.integers(5, 8))
        base_dark = lerp((0.20, 0.30, 0.08), (0.34, 0.44, 0.12), depth)
        tip_light = lerp((0.50, 0.58, 0.18), (0.80, 0.84, 0.36), depth)
        for j in range(lobes):
            ang = rot + (j - (lobes - 1) / 2) * (2.2 / lobes) * 1.25
            L = size * (1 - 0.35 * abs(j - (lobes - 1) / 2) / ((lobes - 1) / 2))
            poly = leaflet_poly(cx, cy, ang, L, L * 0.16, 0.25, r)
            # 1枚の小葉を、根元→先の明るさで3段に塗り重ねる
            d.polygon(poly, fill=col(base_dark))
            poly2 = leaflet_poly(cx + math.cos(ang) * L * 0.25, cy + math.sin(ang) * L * 0.25, ang, L * 0.75, L * 0.13)
            d.polygon(poly2, fill=col(lerp(base_dark, tip_light, 0.55)))
            poly3 = leaflet_poly(cx + math.cos(ang) * L * 0.5, cy + math.sin(ang) * L * 0.5, ang, L * 0.5, L * 0.09)
            d.polygon(poly3, fill=col(tip_light))
            # 中肋
            d.line([(cx, cy), (cx + math.cos(ang) * L * 0.85, cy + math.sin(ang) * L * 0.85)],
                   fill=col(lerp(base_dark, tip_light, 0.3)), width=1)
    save_rgba(img, 'leaf_broad.png')


def leaf_frond(n=512, seed=12):
    """シダ状の葉（2回羽状）。根元が広い三角形で、羽片ごとに丸い小羽片が並ぶレース状。R03 のもみ。
    （細長いひし形だとリュウゼツランに見える: 失敗 F13）"""
    r = rng(seed)
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = n / 2
    P = 13
    for i in range(P):
        t = (i + 0.4) / P                     # 0=根元 1=先
        y = n * (0.96 - 0.9 * t)
        Lp = n * 0.47 * (1 - t) ** 0.85 + n * 0.03
        for side in (-1, 1):
            ang = math.radians(-90 + side * (70 - 25 * t)) + r.normal(0, 0.04)
            dark = lerp((0.17, 0.27, 0.07), (0.27, 0.40, 0.10), t)
            light = lerp((0.48, 0.58, 0.18), (0.78, 0.82, 0.34), t)
            k = max(3, int(9 * (1 - t) + 3))
            for j in range(k):
                sj = (j + 0.7) / (k + 0.4)
                px = cx + math.cos(ang) * Lp * sj; py = y + math.sin(ang) * Lp * sj
                rr = n * 0.028 * (1 - 0.6 * sj) * (1.15 - 0.5 * t)
                for sd in (-1, 1):   # 小羽片（先のとがった小さな葉を、羽片の先の向きへ倒して重ねる）
                    a2 = ang + sd * r.uniform(0.7, 1.0)
                    c = lerp(dark, light, 0.25 + 0.75 * (1 - sj) * 0.4 + 0.45 * t + r.uniform(-.06, .06))
                    d.polygon(leaflet_poly(px, py, a2, rr * 2.6, rr * 0.75, 0.3, r, 8), fill=col(c))
                    d.polygon(leaflet_poly(px + math.cos(a2) * rr * 0.6, py + math.sin(a2) * rr * 0.6, a2, rr * 1.6, rr * 0.35), fill=col(lerp(c, light, 0.45)))
            d.line([(cx, y), (cx + math.cos(ang) * Lp, y + math.sin(ang) * Lp)], fill=col(dark), width=2)
    d.line([(cx, n * 0.99), (cx, n * 0.05)], fill=col((0.24, 0.30, 0.10)), width=4)
    save_rgba(img, 'leaf_frond.png')


def grass_blades(n=256, seed=13):
    """草の房（根元が暗く先が明るい細い葉）。R01 下の草"""
    r = rng(seed)
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for k in range(46):
        x0 = n / 2 + r.normal(0, n * 0.13)
        h = r.uniform(0.45, 0.95) * n
        lean = r.normal(0, 0.22) * h
        w0 = r.uniform(6, 11)
        segs = 8
        light = lerp((0.55, 0.66, 0.20), (0.86, 0.88, 0.42), r.random())
        for s in range(segs):
            t0, t1 = s / segs, (s + 1) / segs
            p0 = (x0 + lean * t0 ** 1.6, n - h * t0); p1 = (x0 + lean * t1 ** 1.6, n - h * t1)
            w = w0 * (1 - t0)
            c = lerp((0.30, 0.40, 0.12), light, t1 ** 0.8)
            d.line([p0, p1], fill=col(c), width=max(1, int(round(w))))
    save_rgba(img, 'grass_blades.png')


def leaf_palm(n=512, seed=14):
    """ヤシの葉（1枚の長い羽状の葉。根元が下、先が上）。R02 左・R07 左・R12 のヤシ"""
    r = rng(seed)
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = n / 2
    for i in range(44):
        t = (i + 0.5) / 44
        y = n * (0.97 - 0.92 * t)
        L = n * 0.46 * math.sin(math.pi * (0.1 + 0.9 * t) ** 0.8) * (1.05 - 0.6 * t) + 6
        for side in (-1, 1):
            ang = math.radians(-90 + side * (58 + 18 * t)) + r.normal(0, 0.06)
            dark = lerp((0.18, 0.28, 0.08), (0.28, 0.40, 0.10), t)
            light = lerp((0.50, 0.60, 0.18), (0.74, 0.80, 0.32), r.random() * 0.5 + 0.5 * t)
            x0 = cx + side * 2
            d.polygon(leaflet_poly(x0, y, ang, L, L * 0.06), fill=col(dark))
            d.polygon(leaflet_poly(x0 + math.cos(ang) * L * 0.35, y + math.sin(ang) * L * 0.35 - 1, ang, L * 0.6, L * 0.03), fill=col(light))
    d.line([(cx, n), (cx, n * 0.04)], fill=col((0.26, 0.30, 0.10)), width=3)
    save_rgba(img, 'leaf_palm.png')


def flowers(n=256, seed=15):
    """草地の小花（青・白・薄桃の5弁）を数輪ずつ。R01・R03 の草地の点景"""
    r = rng(seed)
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pal = [((0.45, 0.62, 0.95), (0.85, 0.92, 1.0))] * 3 + [((0.95, 0.95, 0.92), (1, 1, 1)), ((0.95, 0.66, 0.74), (1.0, 0.88, 0.9))]
    for k in range(9):
        cx, cy = r.uniform(0.15, 0.85) * n, r.uniform(0.15, 0.85) * n
        base, hi = pal[int(r.integers(len(pal)))]
        rad = r.uniform(0.045, 0.07) * n
        for j in range(5):
            a = j * 2 * math.pi / 5 + r.uniform(0, 1)
            px, py = cx + math.cos(a) * rad * 0.6, cy + math.sin(a) * rad * 0.6
            d.ellipse([px - rad * 0.5, py - rad * 0.5, px + rad * 0.5, py + rad * 0.5], fill=col(base))
            d.ellipse([px - rad * 0.3, py - rad * 0.3, px + rad * 0.2, py + rad * 0.2], fill=col(hi))
        d.ellipse([cx - rad * 0.25, cy - rad * 0.25, cx + rad * 0.25, cy + rad * 0.25], fill=col((0.98, 0.85, 0.3)))
    save_rgba(img, 'flowers.png')


# ---------------------------------------------------------------- 地面
def ground_grass(n=1024, seed=21):
    big = fnoise(n, 0.18 * n, seed)            # 大きなむら
    mid = fnoise(n, 0.04 * n, seed + 1, 2)
    base = lerp((0.42, 0.52, 0.17), (0.60, 0.66, 0.26), big[..., None])
    base *= (0.85 + 0.3 * mid[..., None])
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), 'RGB').convert('RGBA')
    r = rng(seed + 2)

    def strokes(d, n):
        # 草の葉の筆致: 短い斜めの線を明暗2系統で
        for k in range(9000):
            x = r.uniform(n, 2 * n); y = r.uniform(n, 2 * n)
            L = r.uniform(6, 16); a = math.radians(-90 + r.normal(0, 22))
            lit = r.random() < 0.55
            c = (lerp((0.52, 0.62, 0.20), (0.74, 0.80, 0.34), r.random()) if lit
                 else lerp((0.16, 0.25, 0.07), (0.26, 0.36, 0.10), r.random()))
            d.line([(x, y), (x + math.cos(a) * L, y + math.sin(a) * L)], fill=col(c) + (150,), width=2)
    over = tiled_draw(n, strokes)
    img = Image.alpha_composite(img, over).filter(ImageFilter.GaussianBlur(0.6))
    img.convert('RGB').save(os.path.join(OUT, 'ground_grass.png'))


def ground_dirt(n=1024, seed=31):
    big = fnoise(n, 0.2 * n, seed); mid = fnoise(n, 0.03 * n, seed + 1, 2)
    base = lerp((0.62, 0.50, 0.32), (0.80, 0.68, 0.46), big[..., None]) * (0.9 + 0.2 * mid[..., None])
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), 'RGB').convert('RGBA')
    r = rng(seed + 2)

    def marks(d, n):
        for k in range(700):   # 踏み固めた明るいすじ
            x = r.uniform(n, 2 * n); y = r.uniform(n, 2 * n); L = r.uniform(10, 40); a = r.normal(0, 0.3)
            d.line([(x, y), (x + math.cos(a) * L, y + math.sin(a) * L)], fill=col((0.86, 0.76, 0.56)) + (70,), width=3)
        for k in range(500):   # 小石
            x = r.uniform(n, 2 * n); y = r.uniform(n, 2 * n); s = r.uniform(2, 6)
            d.ellipse([x - s, y - s * 0.7 + 1.5, x + s, y + s * 0.7 + 1.5], fill=col((0.40, 0.32, 0.22)) + (160,))
            d.ellipse([x - s, y - s * 0.7, x + s, y + s * 0.7], fill=col(lerp((0.66, 0.60, 0.50), (0.86, 0.80, 0.68), r.random())) + (230,))
    img = Image.alpha_composite(img, tiled_draw(n, marks)).filter(ImageFilter.GaussianBlur(0.7))
    img.convert('RGB').save(os.path.join(OUT, 'ground_dirt.png'))


def ground_sand(n=1024, seed=41):
    big = fnoise(n, 0.25 * n, seed); mid = fnoise(n, 0.02 * n, seed + 1, 2)
    base = lerp((0.76, 0.62, 0.40), (0.90, 0.78, 0.55), big[..., None]) * (0.94 + 0.12 * mid[..., None])
    save_rgb(base, 'ground_sand.png')


def voronoi(n, cells, seed, grid=False):
    """端がつながるボロノイ: (最寄り距離, 2番目との差, セルID)。grid=True でゆらぎのある格子の点（大きさがそろう）"""
    r = rng(seed)
    if grid:
        k = int(round(math.sqrt(cells))); step = n / k
        pts = np.array([((i + 0.5 + r.uniform(-0.3, 0.3)) * step, (j + 0.5 + r.uniform(-0.3, 0.3)) * step + (i % 2) * step * 0.5)
                        for i in range(k) for j in range(k)]) % n
    else:
        pts = r.uniform(0, n, (cells, 2))
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    d1 = np.full((n, n), 1e9, np.float32); d2 = np.full((n, n), 1e9, np.float32); idx = np.zeros((n, n), np.int32)
    for i, (px, py) in enumerate(pts):
        dx = np.abs(xx - px); dx = np.minimum(dx, n - dx)
        dy = np.abs(yy - py); dy = np.minimum(dy, n - dy)
        dd = np.sqrt(dx * dx + dy * dy)
        closer = dd < d1
        d2 = np.where(closer, d1, np.minimum(d2, dd))
        idx = np.where(closer, i, idx); d1 = np.where(closer, dd, d1)
    return d1, d2 - d1, idx


def ground_cobble(n=1024, seed=51):
    """石畳: 石の一つずつ、暗い目地、石ごとの明暗"""
    d1, edge, idx = voronoi(n, 324, seed, grid=True)
    r = rng(seed + 1)
    tone = r.uniform(0.0, 1.0, idx.max() + 1)[idx]
    stone = lerp((0.60, 0.60, 0.57), (0.80, 0.79, 0.74), tone[..., None])
    # 石の中央ほど少し明るい（ふくらみ）。d1 も使って角を丸く
    bulge = np.clip(edge / 14, 0, 1) ** 0.5 * np.clip(1.2 - d1 / 40, 0.6, 1)
    stone *= (0.86 + 0.18 * bulge[..., None])
    stone *= (0.92 + 0.12 * fnoise(n, 0.01 * n, seed + 2)[..., None])
    grout = lerp((0.40, 0.40, 0.36), (0.50, 0.50, 0.44), fnoise(n, 0.05 * n, seed + 3)[..., None])
    m = np.clip((edge - 4.0) / 3.0, 0, 1)[..., None]
    save_rgb(lerp(grout, stone, m), 'ground_cobble.png')


def rock(n=512, seed=61):
    """岩肌: 横に走る層（厚みが不ぞろい）と、層の中の縦の割れ目。層の上面は明るく、下の縁は暗い。
    ボロノイの網目は敷石に見えるので使わない（v04 の失敗）"""
    r = rng(seed)
    y = np.arange(n)[:, None].astype(float); x = np.arange(n)[None, :].astype(float)
    warp = (fnoise(n, 0.12 * n, seed) - 0.5) * 0.10 * n
    yy = (y + warp) % n
    # 層の境目（端がつながるよう n を割り切る位置に）
    cuts = np.sort(r.choice(np.arange(8, n, 8), 7, replace=False)).astype(float)
    cuts = np.concatenate([cuts, [cuts[0] + n]])
    layer = np.zeros((n, n)); edge = np.full((n, n), 1e9); tone = np.zeros((n, n))
    tones = r.uniform(0, 1, len(cuts))
    for i in range(len(cuts) - 1):
        a0, a1 = cuts[i], cuts[i + 1]
        m = ((yy >= a0) & (yy < a1)) | ((yy + n >= a0) & (yy + n < a1))
        t = np.where(yy >= a0, yy - a0, yy + n - a0) / (a1 - a0)
        layer = np.where(m, t, layer); tone = np.where(m, tones[i], tone)
    base = lerp((0.50, 0.52, 0.44), (0.70, 0.70, 0.60), tone[..., None])
    base *= (0.86 + 0.24 * fnoise(n, 0.05 * n, seed + 2, 2)[..., None])
    # 層の上は明るく（日が当たる棚）、下の縁は暗い（えぐれ）
    base *= (1.12 - 0.35 * layer[..., None] ** 2)[..., :]
    top_edge = np.clip(1 - layer / 0.06, 0, 1)[..., None]
    base = base * (1 - 0.35 * top_edge)
    # 縦の割れ目（層ごとに位置が変わる）
    cr = fnoise(n, 0.015 * n, seed + 3)
    crack = np.clip(1 - np.abs(np.sin((x / n * 9 + tone * 3.1) * math.pi + cr * 6)) / 0.06, 0, 1) * (layer > 0.15)
    base *= (1 - 0.3 * crack[..., None])
    # 苔のむら（緑がかる）
    moss = np.clip((fnoise(n, 0.1 * n, seed + 4) - 0.55) * 3, 0, 1)[..., None]
    base = lerp(base, base * np.array([0.82, 0.98, 0.62]), moss * 0.6)
    save_rgb(base, 'rock.png')


def wood(n=512, seed=71):
    """左半分=樹皮（縦の筋）、右半分=削った木口（明るい・年輪）"""
    r = rng(seed)
    h = n; w = n // 2
    x = np.linspace(0, 1, w)[None, :]; y = np.linspace(0, 1, h)[:, None]
    grain = fnoise(n, 0.01 * n, seed)[:, :w]
    stretch = np.repeat(fnoise(n, 0.006 * n, seed + 1)[:1, :w], h, 0)
    bark = lerp((0.46, 0.34, 0.22), (0.68, 0.53, 0.36), (0.6 * stretch + 0.4 * grain)[..., None])
    cut = lerp((0.84, 0.72, 0.54), (0.96, 0.88, 0.70), fnoise(n, 0.05 * n, seed + 2)[:, :w][..., None])
    out = np.concatenate([bark, cut], 1)
    save_rgb(out, 'wood.png')


def crate_tex(n=512, seed=72):
    """木箱の面: 横板4枚、外枠、×の補強材。R01・R04 の木箱"""
    r = rng(seed)
    g = fnoise(n, 0.008 * n, seed)
    base = lerp((0.52, 0.38, 0.24), (0.70, 0.54, 0.36), g[..., None])
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), 'RGB')
    d = ImageDraw.Draw(img)
    for k in range(1, 4):   # 板の継ぎ目
        y = k * n / 4; d.line([(0, y), (n, y)], fill=col((0.28, 0.19, 0.11)), width=4)
    fw = int(n * 0.1)
    dark = col((0.40, 0.28, 0.17)); light = col((0.78, 0.62, 0.42))
    for a, b in [((0, 0), (n, fw)), ((0, n - fw), (n, n)), ((0, 0), (fw, n)), ((n - fw, 0), (n, n))]:
        d.rectangle([a, b], fill=dark)
    d.line([(fw, fw), (n - fw, n - fw)], fill=dark, width=int(fw * 0.9))
    d.line([(n - fw, fw), (fw, n - fw)], fill=dark, width=int(fw * 0.9))
    d.line([(fw, fw + 4), (n - fw - 4, n - fw)], fill=light, width=3)
    d.rectangle([(2, 2), (n - 3, n - 3)], outline=light, width=3)
    img.save(os.path.join(OUT, 'crate.png'))


def plaster_timber(n=512, seed=81):
    """漆喰の壁と木組み（512px = 横 4m × 縦 4m、横につながる）。R10・R18 の家"""
    g = fnoise(n, 0.08 * n, seed, 2)
    base = lerp((0.80, 0.74, 0.62), (0.93, 0.89, 0.78), g[..., None])
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), 'RGB').convert('RGBA')
    def beams(d, n):
        dark = col((0.30, 0.20, 0.13)) + (255,); hi = col((0.52, 0.38, 0.25)) + (255,)
        w = int(n * 0.045)
        for off in (0, n):   # 横につながるよう 2 回
            for y in (int(n * 0.04), int(n * 0.52), n - w):
                d.rectangle([n + 0, n + y, 2 * n, n + y + w], fill=dark)
            for x in (0, n // 3, 2 * n // 3):
                d.rectangle([n + x, n, n + x + w, 2 * n], fill=dark)
                d.line([(n + x + w, n + int(n * 0.52)), (n + x + n // 3, n + int(n * 0.06))], fill=dark, width=w)
            for y in (int(n * 0.04), int(n * 0.52)):
                d.line([(n, n + y + 2), (2 * n, n + y + 2)], fill=hi, width=2)
    img = Image.alpha_composite(img, tiled_draw(n, beams))
    img.convert('RGB').save(os.path.join(OUT, 'plaster_timber.png'))


def stone_wall(n=512, seed=82):
    """切り石の積み（512px = 2m 角）。土台・植え込みの縁"""
    r = rng(seed)
    base = np.zeros((n, n, 3))
    rows = 6; h = n // rows
    img = Image.new('RGB', (n, n), col((0.30, 0.30, 0.28)))
    d = ImageDraw.Draw(img)
    for i in range(rows):
        x = -r.uniform(0, n * 0.3)
        while x < n:
            w = r.uniform(0.18, 0.34) * n
            t = r.uniform(0, 1)
            c = lerp((0.55, 0.55, 0.52), (0.74, 0.72, 0.66), t)
            for dx in (0, n, -n):
                d.rounded_rectangle([x + dx + 3, i * h + 3, x + dx + w - 3, i * h + h - 3], radius=6, fill=col(c))
                d.line([(x + dx + 5, i * h + 5), (x + dx + w - 6, i * h + 5)], fill=col(c * 1.15), width=3)
            x += w
    a = np.asarray(img).astype(float) / 255 * (0.9 + 0.2 * fnoise(n, 0.03 * n, seed + 1)[..., None])
    save_rgb(a, 'stone_wall.png')


def roof_tiles(n=512, seed=83):
    """瓦（512px = 2m 角、横の列が重なる）。赤茶。R10・R18"""
    r = rng(seed)
    img = Image.new('RGB', (n, n), col((0.30, 0.13, 0.08)))
    d = ImageDraw.Draw(img)
    rows = 8; h = n / rows; w = n / 10
    for i in range(rows):
        off = (i % 2) * w / 2
        for j in range(-1, 11):
            x = j * w + off; y = i * h
            c = lerp((0.58, 0.26, 0.16), (0.76, 0.40, 0.26), r.uniform(0, 1))
            d.rounded_rectangle([x + 2, y, x + w - 2, y + h * 1.15], radius=int(w * 0.45), fill=col(c))
            d.line([(x + w * 0.3, y + 4), (x + w * 0.3, y + h * 0.9)], fill=col(c * 1.2), width=3)
            d.line([(x + 2, y + h * 1.1), (x + w - 2, y + h * 1.1)], fill=col((0.28, 0.12, 0.08)), width=3)
    img.save(os.path.join(OUT, 'roof_tiles.png'))


def window_tex(n=256, seed=84):
    """窓: 青灰の枠と、暗い格子のガラス。R04・R18"""
    img = Image.new('RGB', (n, n), col((0.36, 0.42, 0.52)))
    d = ImageDraw.Draw(img)
    m = int(n * 0.12)
    d.rectangle([m, m, n - m, n - m], fill=col((0.10, 0.13, 0.20)))
    for k in (1, 2):
        x = m + (n - 2 * m) * k / 3; d.line([(x, m), (x, n - m)], fill=col((0.36, 0.42, 0.52)), width=8)
    d.line([(m, n / 2), (n - m, n / 2)], fill=col((0.36, 0.42, 0.52)), width=8)
    d.line([(m + 6, m + 6), (n * 0.45, n * 0.4)], fill=col((0.35, 0.45, 0.6)), width=6)
    d.rectangle([2, 2, n - 3, n - 3], outline=col((0.62, 0.68, 0.76)), width=4)
    img.save(os.path.join(OUT, 'window.png'))


def banner_tex(n=256, seed=85):
    """旗: 紺地に金の縁と紋（盾）。R10"""
    img = Image.new('RGB', (n, n), col((0.16, 0.24, 0.48)))
    d = ImageDraw.Draw(img)
    d.rectangle([6, 6, n - 7, n - 7], outline=col((0.86, 0.72, 0.36)), width=8)
    cx, cy = n / 2, n * 0.45
    d.polygon([(cx - 50, cy - 50), (cx + 50, cy - 50), (cx + 50, cy + 10), (cx, cy + 60), (cx - 50, cy + 10)], fill=col((0.72, 0.76, 0.86)))
    d.polygon([(cx - 36, cy - 38), (cx + 36, cy - 38), (cx + 36, cy + 6), (cx, cy + 44), (cx - 36, cy + 6)], fill=col((0.20, 0.30, 0.58)))
    d.line([(cx, cy - 30), (cx, cy + 30)], fill=col((0.86, 0.72, 0.36)), width=10)
    d.line([(cx - 25, cy - 5), (cx + 25, cy - 5)], fill=col((0.86, 0.72, 0.36)), width=10)
    img.save(os.path.join(OUT, 'banner.png'))


def paint(n=128, seed=86):
    """塗装・鉄など色を頂点色で付ける物の下地（明るい灰のむら）"""
    save_rgb(lerp((0.80, 0.80, 0.80), (0.95, 0.95, 0.95), fnoise(n, 0.1 * n, seed)[..., None]), 'paint.png')


if __name__ == '__main__':
    leaf_broad(); leaf_frond(); leaf_palm(); grass_blades(); flowers()
    ground_grass(); ground_dirt(); ground_sand(); ground_cobble(); rock(); wood(); crate_tex()
    plaster_timber(); stone_wall(); roof_tiles(); window_tex(); banner_tex(); paint()
    print('textures ->', OUT, sorted(os.listdir(OUT)))
