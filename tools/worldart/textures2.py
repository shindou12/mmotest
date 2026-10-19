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


def rng(seed): return np.random.default_rng(seed)
def lerp(a, b, t): a = np.asarray(a, float); b = np.asarray(b, float); return a + (b - a) * t
def col(c, a=255): return tuple(int(max(0, min(1, x)) * 255) for x in c) + (a,)


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
            for sc, c in [(1.0, (0.28, 0.42, 0.12)), (0.78, (0.48, 0.64, 0.20)), (0.5, (0.70, 0.82, 0.32))]:
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
        base = lerp((0.20, 0.32, 0.10), (0.30, 0.44, 0.12), t); mid = lerp((0.40, 0.55, 0.18), (0.62, 0.74, 0.26), t)
        hi = lerp((0.58, 0.70, 0.24), (0.84, 0.90, 0.42), t)
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
        hi = lerp((0.62, 0.74, 0.24), (0.90, 0.92, 0.48), depth)
        lo = lerp((0.22, 0.34, 0.10), (0.34, 0.46, 0.14), depth)
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
    base = lerp((0.50, 0.53, 0.50), (0.72, 0.74, 0.68), tone[..., None])
    base *= (0.74 + 0.5 * shade[..., None])
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
    d.ellipse([W / 2 - R0 * 0.6, W / 2 - R0 * 0.5, W / 2 + R0 * 0.6, W / 2 + R0 * 0.62], fill=col((0.30, 0.42, 0.14)))
    items.sort()
    for depth, x, y, a, L in items:
        k = 0.68 + 0.4 * max(0, min(1, depth))
        base = np.array((0.30, 0.42, 0.13)) * k; mid = np.array((0.52, 0.66, 0.22)) * k; hi = np.array((0.74, 0.84, 0.36)) * k
        star_leaf(d, x, y, a, L, base, mid, hi, mid * 0.8)
    finish(img, n, n, 'clump_maple.png')


if __name__ == '__main__':
    spray_maple(); clump_maple(); spray_clover(); frond_fir(); frond_palm(); grass_tall(); rock_crack()
    print('textures2 ->', OUT)
