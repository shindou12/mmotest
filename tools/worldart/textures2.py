"""第 2 世代のテクスチャ（B03・B01・E04 の拡大から）。2 倍で描いて縮小する（輪郭の荒れを消す）。
python3 -I tools/worldart/textures2.py [出力先=public/worldart/tex]

  spray_maple.png  星形（5 裂）の小さな葉を小枝ごとにまとめた房。広葉樹の樹冠のカード（下端が枝元）
  spray_clover.png 3 裂の小さな葉の小山（上から見た）。クローバーの茂み
  frond_fir.png    細長いシダの葉（512x1024、下端が根元）。もみ
  grass_tall.png   細く長い葉の房（下端が根元）
  rock_crack.png   膨らんだ岩の面と細く暗い割れ目（端がつながる）。崖・岩（三方向投影で貼る）
葉の絵は明るさの基準だけを持ち、樹冠の上下の明暗と色相（上=黄緑・下=青緑）は頂点色で付ける。
"""
import sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else 'public/worldart/tex'
os.makedirs(OUT, exist_ok=True)
SS = 2   # 描くときの倍率
# 葉の色（暗・中・明）。暖かい太陽の下でも葉が緑（≈ 80°）に見えるよう、絵では青寄りの緑にしておく（E18）
LEAF_DARK, LEAF_MID, LEAF_HI = (0.31, 0.36, 0.20), (0.50, 0.61, 0.26), (0.74, 0.84, 0.36)   # L04: 日なたの葉は黄緑（見本② B01/B02 の木 65〜70°）


def rng(seed): return np.random.default_rng(seed)
def lerp(a, b, t): a = np.asarray(a, float); b = np.asarray(b, float); return a + (b - a) * t
def col(c, a=255): return tuple(int(max(0, min(1, x)) * 255) for x in c) + (a,)


def periodic_noise(n, bx, seed, by=None):
    """FFT の周期ノイズ。端が自然につながる大きなむらを作る"""
    by = bx if by is None else by
    w = rng(seed).standard_normal((n, n))
    fx = np.fft.fftfreq(n)[None, :]; fy = np.fft.fftfreq(n)[:, None]
    f = np.exp(-((fx * n / bx) ** 2 + (fy * n / by) ** 2))
    v = np.real(np.fft.ifft2(np.fft.fft2(w) * f))
    return (v - v.min()) / (v.max() - v.min() + 1e-8)


def canvas(w, h): return Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
def finish(img, w, h, name):
    img.resize((w, h), Image.LANCZOS).save(os.path.join(OUT, name))


def lobe(cx, cy, ang, L, W, steps=10):
    """先のとがった葉片（根元が細く、中ほどが太い）"""
    pl, pr = [], []
    nx, ny = -math.sin(ang), math.cos(ang)
    for i in range(steps + 1):
        t = i / steps
        w = W * math.sin(math.pi * min(1, t * 1.15) ** 0.7) * (1 - t) ** 0.35
        px, py = cx + math.cos(ang) * L * t, cy + math.sin(ang) * L * t
        pl.append((px + nx * w, py + ny * w)); pr.append((px - nx * w, py - ny * w))
    return pl + pr[::-1]


STAR = [(0, 1.0), (0.95, 0.85), (-0.95, 0.85), (2.0, 0.55), (-2.0, 0.55)]   # (角度, 長さ) 5 裂


def star_leaf(d, cx, cy, ang, L, base, mid, hi, vein):
    """星形の葉 1 枚を 3 段の明るさで塗る（外側=暗、内側=中、芯=明）。光は葉の先から"""
    for k, (scale, c, shift) in enumerate([(1.0, base, 0.0), (0.78, mid, 0.08), (0.5, hi, 0.16)]):
        ox, oy = cx + math.cos(ang) * L * shift, cy + math.sin(ang) * L * shift
        for da, ll in STAR:
            d.polygon(lobe(ox, oy, ang + da, L * ll * scale, L * ll * scale * 0.32), fill=col(c))
        d.ellipse([ox - L * 0.16 * scale, oy - L * 0.16 * scale, ox + L * 0.16 * scale, oy + L * 0.16 * scale], fill=col(c))
    for da, ll in STAR[:3]:
        d.line([(cx, cy), (cx + math.cos(ang + da) * L * ll * 0.8, cy + math.sin(ang + da) * L * ll * 0.8)], fill=col(vein), width=max(1, int(L * 0.05)))


def spray_maple(n=512, seed=101):
    r = rng(seed); W = n * SS
    img = canvas(n, n); d = ImageDraw.Draw(img)
    stem = (0.36, 0.30, 0.16)
    # 小枝: 下端の中央から上へ、ゆるく曲がる。左右に短い枝
    pts = [(W * 0.5 + math.sin(t * 2.2) * W * 0.04, W * (0.98 - 0.86 * t)) for t in np.linspace(0, 1, 12)]
    d.line(pts, fill=col(stem), width=int(W * 0.012))
    leaves = []
    for i, t in enumerate(np.linspace(0.08, 1.0, 15)):
        px, py = pts[int(t * 11)]
        side = 1 if i % 2 else -1
        a = -math.pi / 2 + side * r.uniform(0.6, 1.0)
        L = W * (0.15 - 0.04 * t) * r.uniform(0.9, 1.1)
        bx, by = px + math.cos(a) * L * 0.9, py + math.sin(a) * L * 0.9
        d.line([(px, py), (bx, by)], fill=col(stem), width=int(W * 0.007))
        leaves.append((bx + math.cos(a) * L * 0.6, by + math.sin(a) * L * 0.6, a + r.normal(0, 0.15), L, r.random()))
        # 枝先にもう 1〜2 枚
        for j in range(int(r.integers(2, 4))):
            a2 = a + r.uniform(-0.7, 0.7)
            leaves.append((bx + math.cos(a2) * L * 1.2, by + math.sin(a2) * L * 1.2, a2, L * 0.8, r.random()))
    tx, ty = pts[-1]
    leaves.append((tx, ty - W * 0.04, -math.pi / 2, W * 0.13, 1.0))
    leaves.sort(key=lambda l: l[4])
    for x, y, a, L, depth in leaves:
        k = 0.75 + 0.25 * depth
        base = np.array((0.30, 0.42, 0.13)) * k; mid = np.array((0.52, 0.66, 0.22)) * k; hi = np.array((0.74, 0.84, 0.36)) * k
        star_leaf(d, x, y, a, L, base, mid, hi, mid * 0.8)
    finish(img, n, n, 'spray_maple.png')


def spray_clover(n=512, seed=102):
    """上から見た 3 裂の小さな葉の集まり（円い小山）"""
    r = rng(seed); W = n * SS
    img = canvas(n, n); d = ImageDraw.Draw(img)
    items = []
    for k in range(34):
        rad = (r.random() ** 0.6) * W * 0.36
        a = r.uniform(0, 2 * math.pi)
        items.append((W / 2 + math.cos(a) * rad, W / 2 + math.sin(a) * rad, r.uniform(0, 6.28), W * r.uniform(0.07, 0.1), 1 - rad / (W * 0.36) + r.uniform(-.2, .2)))
    items.sort(key=lambda t: t[4])
    for x, y, a, L, h in items:
        k = 0.65 + 0.4 * max(0, min(1, h))
        for j in range(3):
            aa = a + j * 2 * math.pi / 3
            for sc, c in [(1.0, LEAF_DARK), (0.78, LEAF_MID), (0.5, LEAF_HI)]:
                # 先の広いハート形: 根元から先へ広がる 2 枚の葉片
                for sd in (-0.28, 0.28):
                    d.polygon(lobe(x, y, aa + sd, L * 1.05 * sc, L * 0.42 * sc, 8), fill=col(np.array(c) * k))
    finish(img, n, n, 'spray_clover.png')


def frond_fir(w=512, h=1024, seed=103):
    """細長いシダの葉: 中軸の左右に細い羽片が 30 対、羽片のふちに小さな切れ込み。根元=下端"""
    r = rng(seed); W, H = w * SS, h * SS
    img = canvas(w, h); d = ImageDraw.Draw(img)
    cx = W / 2
    P = 22
    for i in range(P):
        t = (i + 0.5) / P
        y = H * (0.98 - 0.94 * t)
        L = W * 0.46 * (1 - t) ** 0.7 * min(1.0, 0.55 + t * 3.0) + W * 0.04
        base = lerp((0.20, 0.30, 0.10), (0.28, 0.40, 0.12), t); mid = lerp((0.34, 0.52, 0.20), (0.50, 0.70, 0.26), t)
        hi = lerp((0.46, 0.68, 0.30), (0.64, 0.88, 0.46), t)
        for side in (-1, 1):
            ang = -math.pi / 2 + side * math.radians(62 - 14 * t) + r.normal(0, 0.03)
            d.polygon(lobe(cx, y, ang, L, L * 0.26), fill=col(base))
            # 切れ込みのある羽片（小さな葉片を並べる）
            for j in range(4):
                s = (j + 0.5) / 7
                px, py = cx + math.cos(ang) * L * s, y + math.sin(ang) * L * s
                ll = L * 0.24 * (1 - 0.5 * s)
                for sd in (-1, 1):
                    d.polygon(lobe(px, py, ang + sd * 0.8 - side * 0.25, ll, ll * 0.45, 6), fill=col(mid))
            d.polygon(lobe(cx + math.cos(ang) * L * 0.1, y + math.sin(ang) * L * 0.1 - W * 0.006, ang, L * 0.8, L * 0.09), fill=col(hi))
    d.line([(cx, H), (cx, H * 0.03)], fill=col((0.30, 0.36, 0.14)), width=int(W * 0.012))
    finish(img, w, h, 'frond_fir.png')


def frond_fir3(w=512, h=640, seed=115):
    """もみの小枝 第 3 世代（L24、見本 B03・R03 のもみ）: 短い小枝 1 本。中軸に沿って、外へ下向きに垂れる切れ込みの葉片（3〜5 裂の扇）を
    根元から先へ重ねて、先のとがったしずく形をほぼ埋める。重なりが下向きの山形（へ の字）の段になる。
    先（上端）ほど明るい黄緑、根元は暗い青緑、葉片ごとに上の縁が明るい。根元 = 下端"""
    r = rng(seed); W, H = w * SS, h * SS
    img = canvas(w, h); d = ImageDraw.Draw(img)
    cx = W / 2
    d.line([(cx, H), (cx, H * 0.06)], fill=col((0.22, 0.24, 0.13)), width=int(W * 0.014))   # 中軸（葉の下に）
    def half(t):                # しずく形の半幅（t: 0 = 根元、1 = 先）。根元は細く、中ほどが広く、先がとがる
        return W * 0.46 * (math.sin(math.pi * min(1.0, 0.12 + 0.88 * t)) ** 0.6) * (1 - 0.55 * t)
    rows = 15
    for i in range(rows):       # 根元の段から先の段へ（先の段が上に重なる）
        t = i / (rows - 1)
        y = H * (0.84 - 0.76 * t)              # 下向きの葉片が絵の下端で切れないよう余白（E14）
        hw = half(t)
        n = max(2, int(round(2 + 6 * hw / (W * 0.46))))
        for j in range(n):
            u = (j + 0.5) / n * 2 - 1                    # -1〜1（左右）
            x = cx + u * hw * 0.85 + r.normal(0, W * 0.01)
            size = W * (0.10 + 0.05 * (1 - t)) * r.uniform(0.85, 1.15)
            ang = math.pi / 2 + u * 0.9 + r.normal(0, 0.12)   # 下向き（画像の y+）に、外側ほど外へ開く
            dark = lerp((0.14, 0.25, 0.16), (0.30, 0.44, 0.15), t); mid = lerp((0.24, 0.40, 0.20), (0.48, 0.64, 0.22), t)
            hi = lerp((0.36, 0.54, 0.24), (0.72, 0.84, 0.36), t)
            k = int(r.integers(3, 6))
            for q in range(k):
                aa = ang + (q - (k - 1) / 2) * 0.42
                d.polygon(lobe(x, y, aa, size, size * 0.55, 8), fill=col(dark if q % 2 else mid))
            d.polygon(lobe(x, y, ang, size * 0.55, size * 0.34, 8), fill=col(hi))      # 付け根の上の明るい面
    finish(img, w, h, 'frond_fir3.png')


def grass_tall(n=512, seed=104):
    r = rng(seed); W = n * SS
    img = canvas(n, n); d = ImageDraw.Draw(img)
    blades = []
    for k in range(38):
        x0 = W / 2 + r.normal(0, W * 0.09)
        hgt = r.uniform(0.5, 0.97) * W
        lean = r.normal(0, 0.28) * hgt + (x0 - W / 2) * 0.8
        blades.append((r.random(), x0, hgt, lean, r.uniform(0.010, 0.017) * W))
    blades.sort()
    for depth, x0, hgt, lean, w0 in blades:
        segs = 12
        # 日なたの草は金色（見本 B03 の日なたの草 ≈ 56°/0.56/0.82）、根元は緑
        hi = lerp((0.74, 0.72, 0.24), (0.94, 0.86, 0.36), depth)
        lo = lerp((0.24, 0.36, 0.10), (0.36, 0.48, 0.14), depth)
        pl, pr = [], []
        for s in range(segs + 1):
            t = s / segs
            x = x0 + lean * t ** 1.7; y = W - hgt * t
            w = w0 * (1 - t) ** 0.8
            pl.append((x - w, y)); pr.append((x + w, y))
        poly = pl + pr[::-1]
        d.polygon(poly, fill=col(lo))
        # 上 2/3 を明るく（葉の中ほどから先へ）
        for s in range(segs):
            t0, t1 = s / segs, (s + 1) / segs
            c = lerp(lo, hi, t1 ** 0.7)
            q = [pl[s], pl[s + 1], (pl[s + 1][0] * 0.5 + pr[s + 1][0] * 0.5, pl[s + 1][1]), (pl[s][0] * 0.5 + pr[s][0] * 0.5, pl[s][1])]
            d.polygon(q, fill=col(c))
    finish(img, n, n, 'grass_tall.png')


def rock_crack(n=1024, seed=107):
    """岩の面: なめらかな大きな膨らみの陰影（光は左上）、途中で途切れる細く暗い割れ目、灰色に少し緑、苔のむら。
    ボロノイの網目は閉じた多角形が並んで敷石に見える（F6）ので使わない。割れ目はノイズの等高線を細く切り、
    別のノイズで半分ほど消す。端がつながる。512px ≈ 1.5m で貼る想定"""
    def fn(scale, s):
        w = rng(s).standard_normal((n, n)); f = np.sqrt(np.fft.fftfreq(n)[:, None] ** 2 + np.fft.fftfreq(n)[None, :] ** 2)
        v = np.real(np.fft.ifft2(np.fft.fft2(w) * np.exp(-(f * scale) ** 2))); return (v - v.min()) / (v.max() - v.min())
    big = fn(n / 2.5, seed) * 0.7 + fn(n / 6, seed + 1) * 0.3        # 膨らみ（1 枚に 2〜4 個）
    gy, gx = np.gradient(big)
    g = (-gx * 0.6 - gy * 0.8); shade = np.clip(0.5 + g / (np.abs(g).max() + 1e-9) * 0.6, 0, 1)
    tone = fn(n / 4, seed + 2)
    base = lerp((0.54, 0.58, 0.52), (0.72, 0.75, 0.68), tone[..., None])
    base *= (0.78 + 0.42 * shade[..., None])
    base *= (0.92 + 0.14 * fn(n / 120, seed + 3)[..., None])
    crack = np.zeros((n, n))
    for k, (sc, wdt) in enumerate([(n / 3.5, 0.014), (n / 6, 0.010)]):
        c = fn(sc, seed + 10 + k)
        line = np.clip(1 - np.abs(c - 0.5) / wdt, 0, 1)
        keep = np.clip((fn(n / 5, seed + 20 + k) - 0.4) * 5, 0, 1)     # 途中で途切れる
        crack = np.maximum(crack, line * keep)
    # 割れ目の下側に明るい縁（欠けた面が光る）
    lit = np.roll(crack, 3, axis=0) * (1 - crack)
    base = lerp(base, np.array([0.22, 0.24, 0.21]), crack[..., None] * 0.9) + lit[..., None] * 0.08
    moss = np.clip((fn(n / 6, seed + 4) - 0.56) * 4, 0, 1) * np.clip(big * 1.6 - 0.4, 0, 1)
    base = lerp(base, base * np.array([0.86, 1.02, 0.62]), moss[..., None] * 0.7)
    Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), 'RGB').save(os.path.join(OUT, 'rock_crack.png'))


def frond_palm(w=512, h=1024, seed=106):
    """ヤシの葉（B03 下・B01 中央）: 中軸から細い小葉が密に、先へ向かって斜めに並ぶ羽根形。明るい黄緑、中肋は目立たせない。根元=下端"""
    r = rng(seed); W, H = w * SS, h * SS
    img = canvas(w, h); d = ImageDraw.Draw(img)
    cx = W / 2
    P = 26
    for i in range(P):
        t = (i + 0.5) / P
        y = H * (0.97 - 0.93 * t)
        L = W * 0.48 * math.sin(math.pi * min(1.0, 0.12 + t * 0.95)) ** 0.6 * (1 - 0.25 * t)
        for side in (-1, 1):
            ang = -math.pi / 2 + side * math.radians(48 + 10 * t) + r.normal(0, 0.04)
            c0 = lerp((0.36, 0.50, 0.14), (0.50, 0.64, 0.18), t); c1 = lerp((0.66, 0.78, 0.26), (0.86, 0.92, 0.42), r.uniform(0.3, 1.0))
            d.polygon(lobe(cx, y, ang, L, L * 0.075, 8), fill=col(c0))
            d.polygon(lobe(cx + math.cos(ang) * L * 0.15, y + math.sin(ang) * L * 0.15 - W * 0.004, ang, L * 0.78, L * 0.045, 8), fill=col(c1))
    d.line([(cx, H), (cx, H * 0.03)], fill=col((0.48, 0.58, 0.20)), width=int(W * 0.012))
    finish(img, w, h, 'frond_palm.png')


def clump_maple(n=512, seed=108):
    """星形の葉を丸く詰めた葉の塊（不透明 ≈ 60%）。ふちだけ葉の形が出て、内側・下側は暗く詰まる。
    広葉樹の樹冠のカード（B03 右の木の塊）。上 = 光の側"""
    r = rng(seed); W = n * SS
    img = canvas(n, n); d = ImageDraw.Draw(img)
    items = []
    R0 = W * 0.27; step = W * 0.12   # 葉の中心の範囲。葉が絵の端で切れないよう、半径 0.5 から葉の大きさを引く
    for gy in np.arange(-R0, R0 + 1, step):
        for gx in np.arange(-R0, R0 + 1, step):
            x = gx + r.uniform(-0.45, 0.45) * step; y = gy + r.uniform(-0.45, 0.45) * step
            rad = math.hypot(x, y * 1.1)
            if rad > R0: continue
            depth = 0.55 * (0.5 - y / (2 * R0)) + 0.45 * (rad / R0) + r.uniform(-0.12, 0.12)
            items.append((depth, W / 2 + x, W / 2 + y, r.uniform(0, 2 * math.pi), W * r.uniform(0.17, 0.2) * (1.1 - 0.3 * rad / R0)))
    # 内側の暗い詰まり（葉の奥の陰）
    d.ellipse([W / 2 - R0 * 0.6, W / 2 - R0 * 0.5, W / 2 + R0 * 0.6, W / 2 + R0 * 0.62], fill=col(np.array(LEAF_DARK) * 1.2))
    items.sort()
    for depth, x, y, a, L in items:
        k = 0.68 + 0.4 * max(0, min(1, depth))
        base = np.array(LEAF_DARK) * k; mid = np.array(LEAF_MID) * k; hi = np.array(LEAF_HI) * k
        star_leaf(d, x, y, a, L, base, mid, hi, mid * 0.8)
    finish(img, n, n, 'clump_maple.png')


def noise_soft(n=256, seed=109):
    """やわらかい大きなむら（R・G・B に別々のノイズ、0〜1 に広げる）。地面の色むらなどの分布用。端がつながる"""
    chans = []
    for k, sc in enumerate([n / 3, n / 6, n / 12]):
        w = rng(seed + k).standard_normal((n, n)); f = np.sqrt(np.fft.fftfreq(n)[:, None] ** 2 + np.fft.fftfreq(n)[None, :] ** 2)
        v = np.real(np.fft.ifft2(np.fft.fft2(w) * np.exp(-(f * sc) ** 2))); chans.append((v - v.min()) / (v.max() - v.min()))
    Image.fromarray((np.stack(chans, -1) * 255).astype(np.uint8), 'RGB').save(os.path.join(OUT, 'noise_soft.png'))


def canvas_beige(n=512, seed=110):
    """円錐の天幕の布（B01 右下・B02 左下）: ベージュ、縦の縫い目とたるみの陰、こげ茶の渦巻き模様。u=周、v=高さ"""
    r = rng(seed)
    x = np.linspace(0, 1, n)[None, :]; y = np.linspace(0, 1, n)[:, None]
    fold = 0.5 + 0.5 * np.sin(x * 2 * math.pi * 8)
    base = lerp((0.70, 0.62, 0.44), (0.88, 0.82, 0.64), (0.55 + 0.45 * fold)[..., None] * np.ones((n, 1, 1)))
    base = base * (0.94 + 0.06 * rng(seed).standard_normal((n, n, 1)).clip(-1, 1) * 0.5)
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), 'RGB'); d = ImageDraw.Draw(img)
    for k in range(8):
        cx = (k + 0.5) / 8 * n; cy = n * 0.62
        pts = [(cx + math.cos(t) * t * 3.2, cy + math.sin(t) * t * 3.2) for t in np.linspace(0, 4.2 * math.pi, 80)]
        d.line(pts, fill=(118, 92, 60), width=5)
        d.line([(k / 8 * n, 0), (k / 8 * n, n)], fill=(150, 128, 90), width=3)
    d.rectangle([0, n - 34, n, n - 26], fill=(120, 96, 64))
    img.save(os.path.join(OUT, 'canvas_beige.png'))


def canvas_blue(n=512, seed=111):
    """布の天幕の布（B01 左下）: 青みの灰、しわの陰、縁のかがり"""
    r = rng(seed)
    w = r.standard_normal((n, n)); f = np.sqrt(np.fft.fftfreq(n)[:, None] ** 2 + np.fft.fftfreq(n)[None, :] ** 2)
    v = np.real(np.fft.ifft2(np.fft.fft2(w) * np.exp(-(f * n / 24) ** 2))); v = (v - v.min()) / (v.max() - v.min())
    base = lerp((0.50, 0.52, 0.78), (0.66, 0.68, 0.90), v[..., None])   # 薄い藤色（B01）。L11: 日なたで見本の (185,189,225) に
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), 'RGB'); d = ImageDraw.Draw(img)
    d.rectangle([0, 0, n, 10], fill=(120, 124, 140)); d.rectangle([0, n - 10, n, n], fill=(120, 124, 140))
    img.save(os.path.join(OUT, 'canvas_blue.png'))


def canvas_hide(n=512, seed=113):
    """円錐の天幕の革の板（B02 左下、L13）: 1 枚の板 = u 0〜1、v 0〜1（下が 0）。クリーム色、板の中ほどが膨らんで明るく縁が暗い、
    下の段（v 0.15〜0.65）に薄い灰の渦巻き、裾に細い暗い縁"""
    r = rng(seed)
    x = np.linspace(0, 1, n)[None, :, None]; y = np.linspace(1, 0, n)[:, None, None]
    puff = np.sin(np.pi * x) ** 0.6 * (0.75 + 0.25 * np.sin(np.pi * np.clip(y, 0, 1)))
    base = lerp((0.50, 0.44, 0.24), (0.86, 0.79, 0.52), 0.25 + 0.75 * puff)   # 見本の暖かいクリーム（日陰はオリーブ）
    base = base * (0.96 + 0.04 * r.standard_normal((n, n, 1)).clip(-1, 1))
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), 'RGB'); d = ImageDraw.Draw(img)
    cx, cy = n * 0.5, n * 0.6
    pts = [(cx + math.cos(t) * t * n * 0.016, cy + math.sin(t) * t * n * 0.016) for t in np.linspace(0.3, 3.6 * math.pi, 120)]
    d.line(pts, fill=(196, 188, 160), width=7)
    d.line([(cx + n * 0.18, cy + n * 0.02), (n * 0.95, cy + n * 0.06)], fill=(196, 188, 160), width=6)
    d.rectangle([0, n - 14, n, n], fill=(128, 110, 76))
    img.save(os.path.join(OUT, 'canvas_hide.png'))


def rock_face(n=1024, seed=114):
    """崖の岩肌（B03、L15）: 縦に少し長い角ばった板（ボロノイの胞）。板ごとに明るさが違い（面の向き）、上の縁が明るく下の縁が暗い（面取り）、
    板の境目は真っすぐな暗い割れ目。灰に少し黄緑。継ぎ目なしに繰り返す"""
    r = rng(seed); k = 46
    pts = r.random((k, 2)); val = r.uniform(0.72, 1.05, k)
    yy, xx = np.mgrid[0:n, 0:n] / n
    d1 = np.full((n, n), 9.0); d2 = np.full((n, n), 9.0); idx = np.zeros((n, n), int)
    for i, (px, py) in enumerate(pts):
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                dx = xx - (px + ox); dy = (yy - (py + oy)) * 0.7      # 縦に長い板
                d = np.sqrt(dx * dx + dy * dy)
                m = d < d1; d2 = np.where(m, d1, np.minimum(d2, d)); idx = np.where(m, i, idx); d1 = np.where(m, d, d1)
    edge = d2 - d1
    shade = val[idx]
    # 面取り: 胞の中心より上（画像の上 = 岩の上）は明るく、下は暗い
    cy = pts[idx, 1]; up = np.clip((cy - yy) * 6, -1, 1)
    shade = shade * (1 + 0.12 * up)
    crack = np.clip(edge / 0.010, 0, 1) ** 0.7
    def soft(sc, sd):       # 継ぎ目なしのやわらかいノイズ 0〜1
        w = rng(sd).standard_normal((n, n)); f = np.sqrt(np.fft.fftfreq(n)[:, None] ** 2 + np.fft.fftfreq(n)[None, :] ** 2)
        v = np.real(np.fft.ifft2(np.fft.fft2(w) * np.exp(-(f * n / sc) ** 2))); return (v - v.min()) / (v.max() - v.min())
    keep = np.clip((soft(10, seed + 1) - 0.42) * 6, 0, 1)        # 割れ目の半分ほどは途切れる（敷石に見せない）
    crack = 1 - (1 - crack) * keep
    big = soft(4, seed + 2); streak = soft(18, seed + 3)
    shade = shade * (0.8 + 0.35 * big) * (0.92 + 0.16 * streak)
    base = np.array([0.60, 0.62, 0.54])[None, None, :] * shade[..., None]
    base = base * (0.35 + 0.65 * crack[..., None])
    base = base * (0.94 + 0.06 * r.standard_normal((n, n, 1)).clip(-1, 1))
    Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), 'RGB').save(os.path.join(OUT, 'rock_face.png'))


def rock_mass(n=1024, seed=116):
    """崖の丸い岩塊。周期ノイズの重ね合わせを滑らかな明暗にし、閉じた割れ目は描かない"""
    r = rng(seed)
    yy, xx = np.mgrid[0:n, 0:n] / n
    warp_x = periodic_noise(n, 4.5, seed + 1) - 0.5
    warp_y = periodic_noise(n, 3.8, seed + 2) - 0.5
    height = np.zeros((n, n), dtype=float)
    for _ in range(7):
        cx, cy = r.random(2); rx, ry = r.uniform(0.12, 0.23, 2); amp = r.uniform(0.78, 1.2)
        dx = np.abs(xx - cx + warp_x * 0.035); dy = np.abs(yy - cy + warp_y * 0.035)
        dx = np.minimum(dx, 1.0 - dx); dy = np.minimum(dy, 1.0 - dy)
        d = (dx / rx) ** 2 + (dy / ry) ** 2
        bump = amp * np.exp(-1.45 * d)
        height = np.maximum(height, bump) + np.log1p(np.exp(-12.0 * np.abs(height - bump))) / 12.0
    height = 0.88 * (height - height.min()) / (height.max() - height.min() + 1e-8) + 0.12 * periodic_noise(n, 3.5, seed + 3)
    gx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * n * 0.5
    gy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * n * 0.5
    top = 0.5 + 0.5 * np.cos(2 * np.pi * yy)  # 周期の境目も明るさをそろえる
    upper_face = 0.5 + 0.5 * np.tanh(0.48 * gy - 0.08 * gx)
    light = np.clip(0.36 + 0.12 * top + 0.40 * upper_face + 0.18 * height, 0.12, 0.98)
    cool = np.array((0.24, 0.31, 0.40))[None, None, :]
    warm = np.array((0.75, 0.71, 0.64))[None, None, :]
    base = cool + (warm - cool) * light[..., None]
    moss_noise = periodic_noise(n, 7.0, seed + 4)
    upper = np.clip(0.58 * top + 0.42 * upper_face, 0, 1)
    moss = np.clip((moss_noise - 0.55) * 3.2, 0, 1) * np.clip((upper - 0.48) * 2.4, 0, 1) * 0.30
    moss_color = np.array((0.40, 0.45, 0.29))[None, None, :]
    base = base * (1 - moss[..., None]) + moss_color * moss[..., None]
    grain = periodic_noise(n, 26.0, seed + 5)
    base *= (0.97 + 0.06 * grain[..., None])
    Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), 'RGB').save(os.path.join(OUT, 'rock_mass.png'))


def crate2_tex(n=512, seed=117):
    """木箱・荷車・樽用。暖色の板に、曲がった浅い継ぎ目と細い木目を入れる"""
    yy, xx = np.mgrid[0:n, 0:n] / n
    broad = periodic_noise(n, 4.0, seed)
    grain = periodic_noise(n, 14.0, seed + 1)
    bend = periodic_noise(n, 3.0, seed + 2)
    warp = 0.018 * np.sin(2 * np.pi * (xx * 1.7 + 0.25 * bend)) + 0.012 * (bend - 0.5)
    phase = (yy * 4.0 + warp) % 1.0
    edge = np.minimum(phase, 1.0 - phase)
    seam = np.exp(-((edge / 0.027) ** 2))
    lip = np.exp(-(((phase - 0.075) / 0.040) ** 2))
    grain_line = np.sin(2 * np.pi * (xx * 25.0 + 0.18 * broad + 0.07 * np.sin(2 * np.pi * yy * 3.0)))
    value = np.clip(0.48 + 0.30 * broad + 0.16 * grain + 0.035 * grain_line, 0, 1)
    dark = np.array((0.38, 0.25, 0.15))[None, None, :]
    light = np.array((0.76, 0.53, 0.32))[None, None, :]
    base = dark + (light - dark) * value[..., None]
    seam_color = np.array((0.34, 0.23, 0.15))[None, None, :]
    base = base * (1 - 0.50 * seam[..., None]) + seam_color * (0.50 * seam[..., None])
    edge_light = np.array((0.84, 0.63, 0.39))[None, None, :]
    base = base * (1 - 0.14 * lip[..., None]) + edge_light * (0.14 * lip[..., None])
    Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), 'RGB').save(os.path.join(OUT, 'crate2.png'))


def lavender(n=256, seed=112):
    """ラベンダーの株（B01・B02）: 細い茎の先に紫の穂。下端が根元"""
    r = rng(seed); W = n * SS
    img = canvas(n, n); d = ImageDraw.Draw(img)
    for k in range(9):
        x0 = W / 2 + r.normal(0, W * 0.08); lean = r.normal(0, 0.18) * W; h = r.uniform(0.6, 0.95) * W
        d.line([(x0, W), (x0 + lean, W - h)], fill=col((0.36, 0.48, 0.22)), width=int(W * 0.012))
        for j in range(10):
            t = 0.62 + 0.38 * j / 9; px, py = x0 + lean * t, W - h * t
            rr = W * 0.022 * (1.1 - 0.5 * j / 9)
            c = lerp((0.46, 0.36, 0.72), (0.74, 0.64, 0.92), r.random())
            d.ellipse([px - rr, py - rr * 1.3, px + rr, py + rr * 1.3], fill=col(c))
    finish(img, n, n, 'lavender.png')


def flagstone(n=1024, seed=113):
    """切り石の敷石（B04 右）: 横長の長方形（1 枚 ≈ 0.75×0.45m、絵 1 枚 = 3m）、目地に苔、石ごとの明暗"""
    r = rng(seed)
    img = Image.new('RGB', (n, n), (84, 96, 70)); d = ImageDraw.Draw(img)
    rows = 7; h = n / rows
    for i in range(rows):
        x = -r.uniform(0, n * 0.25)
        while x < n:
            w = r.uniform(0.2, 0.32) * n
            t = r.uniform(0, 1); c = lerp((0.62, 0.62, 0.60), (0.80, 0.80, 0.77), t)
            for dx in (0, n, -n):
                d.rectangle([x + dx + 4, i * h + 4, x + dx + w - 4, i * h + h - 4], fill=col(c))
                d.line([(x + dx + 6, i * h + 6), (x + dx + w - 7, i * h + 6)], fill=col(c * 1.08), width=4)
                d.line([(x + dx + 6, i * h + h - 6), (x + dx + w - 7, i * h + h - 6)], fill=col(c * 0.85), width=4)
            x += w
    a = np.asarray(img).astype(float) / 255
    def fn(scale, s_):
        w_ = rng(s_).standard_normal((n, n)); f = np.sqrt(np.fft.fftfreq(n)[:, None] ** 2 + np.fft.fftfreq(n)[None, :] ** 2)
        v = np.real(np.fft.ifft2(np.fft.fft2(w_) * np.exp(-(f * scale) ** 2))); return (v - v.min()) / (v.max() - v.min())
    a *= (0.9 + 0.18 * fn(n / 30, seed + 1)[..., None])
    moss = np.clip((fn(n / 10, seed + 2) - 0.6) * 4, 0, 1)[..., None] * 0.6
    a = lerp(a, a * np.array([0.78, 0.98, 0.6]), moss)
    save = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'RGB'); save.save(os.path.join(OUT, 'ground_flagstone.png'))


def meander(n=512, seed=114):
    """台座の石（B04）: 明るい灰の石に、帯状の雷文（ギリシャの鍵模様）。上下に帯、中は切り石"""
    img = Image.new('RGB', (n, n), (176, 178, 170)); d = ImageDraw.Draw(img)
    for k in range(4):
        y = k * n / 4 + n / 8
        d.line([(0, y), (n, y)], fill=(140, 142, 134), width=3)
    band = (int(n * 0.36), int(n * 0.64)); d.rectangle([0, band[0], n, band[1]], fill=(186, 188, 180))
    step = n / 8; y0, y1 = band[0] + 14, band[1] - 14
    for k in range(8):
        x = k * step
        pts = [(x + 8, y1), (x + 8, y0), (x + step - 8, y0), (x + step - 8, y1 - 26), (x + 34, y1 - 26), (x + 34, y0 + 26), (x + step - 34, y0 + 26)]
        d.line(pts, fill=(118, 120, 112), width=7)
    d.rectangle([0, band[0], n, band[0] + 4], fill=(128, 130, 122)); d.rectangle([0, band[1] - 4, n, band[1]], fill=(128, 130, 122))
    img.save(os.path.join(OUT, 'stone_meander.png'))


def plate_maple(n=512, seed=115):
    """上から見た平たい葉の房（見本② B01/B02 の広葉樹、L06）: 中心の小枝から放射状に大きな星形の葉が 2 重の輪で並ぶ。
    不透明 ≈ 60%、暗い詰まりは作らない（下の房との重なりで陰を作る）。葉 1 枚 ≈ 房の幅の 1/4"""
    r = rng(seed); W = n * SS
    img = canvas(n, n); d = ImageDraw.Draw(img)
    cx = cy = W / 2
    leaves = []
    for ring, (rad, cnt, size, depth) in enumerate([(0.26, 8, 0.21, 0.85), (0.12, 5, 0.21, 0.98), (0.0, 1, 0.2, 1.1)]):   # L07: 葉を大きく（房の幅の ≈ 1/3）
        for k in range(cnt):
            a = 2 * math.pi * k / max(cnt, 1) + r.uniform(-0.25, 0.25) + ring * 0.4
            rr = rad * W * r.uniform(0.85, 1.05)
            x, y = cx + math.cos(a) * rr, cy + math.sin(a) * rr
            leaves.append((depth + r.uniform(-0.1, 0.1), x, y, a + r.normal(0, 0.3), W * size * r.uniform(0.9, 1.1)))
            d.line([(cx, cy), (x, y)], fill=col((0.40, 0.36, 0.20)), width=int(W * 0.008))
    leaves.sort()
    for depth, x, y, a, L in leaves:
        k = 0.8 + 0.25 * depth
        mid = np.array((0.52, 0.64, 0.14)); hi = np.array((0.72, 0.80, 0.22))     # L07: 葉はほぼ一色の鮮やかな緑、明るいのは芯だけ
        star_leaf(d, x, y, a, L, mid * 0.78 * k, mid * k, (mid * 0.5 + hi * 0.5) * k, mid * 0.7)
    finish(img, n, n, 'plate_maple.png')


def needle_spray(d, x, y, ang, L, W, dark, mid, hi, teeth=9):
    """針葉の小枝 1 本: 根元 (x, y) から ang へ長さ L。縁は先へ向いた針の先の歯（左右で半歯ずらす）の、先のとがった葉片。下に暗い影、上半分に明るい面"""
    def outline(L_, W_, k):
        nx, ny = -math.sin(ang), math.cos(ang); ux, uy = math.cos(ang), math.sin(ang)
        steps = teeth * 2
        def side(sgn, phase, kk):
            ps = []
            for i in range(steps + 1):
                t = min(1.0, (i + phase) / steps)
                tip = (i % 2 == 1)
                hw = W_ * math.sin(math.pi * min(1.0, 0.08 + t * 0.92)) ** 0.5 * (1 - 0.3 * t) * (1.0 if tip else 0.55)
                tt = t + (0.025 if tip else 0.0)                 # 歯の先は少し先へ（針が前を向く）
                ps.append((x + ux * L_ * tt + sgn * nx * hw * kk, y + uy * L_ * tt + sgn * ny * hw * kk))
            return ps
        return side(1, 0.0, k) + side(-1, 0.5, 1.0)[::-1]
    d.polygon(outline(L * 1.04, W * 1.1, 1.0), fill=col(dark))
    d.polygon(outline(L, W, 1.0), fill=col(mid))
    d.polygon(outline(L * 0.82, W * 0.55, 0.2), fill=col(hi))


def fan_fir4(n=512, seed=117):
    """もみの枝 第 4 世代（見本 art/ref/trees/T01〜T04、RO3 プロンテラ南門のもみ）: 1 本の枝を上から見た扇。根元（下端の中央）から
    のこぎり歯の縁の短い針葉の小枝が、枝の軸に沿って左右に重なる。外の縁は小枝の先のぎざぎざ、根元ほど暗い。
    根元 = 下端（v = 0）。小枝を細かく・多くするより、木の側で枝を傾ける（ユーザー、2026-10-23）。
    同じ形が並ぶと不自然なので（ユーザー、2026-10-23）、横に 4 種類並べた絵にする: 1 = 対称に近い枝、2 = 軸が横へ曲がった左右不ぞろいの枝、
    3 = 小枝の多い詰まった短い枝、4 = 小枝のまばらな大きく曲がった枝（u 0.25 ごと）"""
    r = rng(seed); W = n * SS
    img = canvas(4 * n, n); d = ImageDraw.Draw(img)
    for v, (pairs, bend, skip, reach) in enumerate([(6, 0.0, 0.0, 1.0), (5, 0.22, 0.18, 1.0), (8, -0.08, 0.05, 0.86), (4, -0.34, 0.22, 1.04)]):
        bx, by = W * (v + 0.5), W * 0.98
        def axis(s):                         # 軸の点（s: 0 = 根元、1 = 先）。右の枝は先が横へ曲がる
            return bx + W * bend * 0.3 * s * s, by - W * 0.8 * reach * s
        d.line([axis(s / 10) for s in range(11)], fill=col((0.20, 0.22, 0.12)), width=int(W * 0.016))   # 枝の軸（葉の下に）
        sprays = []
        for j in range(pairs):               # 軸に沿って左右の小枝。根元ほど長く外へ開き、先ほど短く前を向く
            s = 0.06 + 0.72 / pairs * j + r.uniform(-0.02, 0.02)
            x, y = axis(s)
            for side in (-1, 1):
                if r.random() < skip: continue
                a = -math.pi / 2 + bend * 0.6 * s + side * (1.15 - 0.6 * s) + r.normal(0, 0.13)
                L = W * 0.44 * reach * (1 - 0.6 * s) * r.uniform(0.8, 1.12) * (1 + side * bend * 0.6)
                sprays.append((s + r.uniform(-0.03, 0.03), x, y, a, L))
        tx, ty = axis(0.76)
        sprays.append((0.8, tx, ty, -math.pi / 2 + bend * 0.7, W * r.uniform(0.17, 0.23)))
        sprays.sort()
        for depth, x, y, a, L in sprays:
            dark = lerp((0.13, 0.24, 0.17), (0.20, 0.33, 0.16), depth)
            mid = lerp((0.27, 0.43, 0.20), (0.44, 0.60, 0.21), depth)
            hi = mid + (lerp((0.38, 0.55, 0.22), (0.64, 0.78, 0.29), depth) - mid) * 0.45   # 明るい筋は弱く（見本の枝はやわらかい。強いとシダの羽片に見える）
            needle_spray(d, x, y, a, L, L * r.uniform(0.3, 0.38), dark, mid, hi, teeth=int(r.integers(7, 11)))
    finish(img, 4 * n, n, 'fan_fir4.png')


if __name__ == '__main__':
    spray_maple(); clump_maple(); spray_clover(); frond_fir(); frond_palm(); grass_tall(); rock_crack(); noise_soft()
    plate_maple(); canvas_beige(); canvas_blue(); canvas_hide(); rock_face(); frond_fir3(); lavender(); flagstone(); meander()
    fan_fir4()
    print('textures2 ->', OUT)
