#!/usr/bin/env python3
"""人物の姿勢の比較シート（G2-2）: three.js と Godot の画像を左右に並べ、差も出す。
  node tools/worldart/godot/pose_shots.mjs --godot       # 先に両方を撮る（out/godot-pose/{three,godot}/<id>.png と poses.json）
  python3 -I tools/worldart/godot/pose_sheet.py          # → art/shots/godot-pose/pose-<組>-<n>.png と pose_numbers.md
1 行 = 1 つの姿勢: [ラベル | three.js | Godot | 差（×4）]。人物の周りを切り出して（両方の人物を含む枠）同じ倍率で並べる。
数（背景の色との差で人物の画素を拾う）:
  輝度  人物の画素の平均の輝度（sRGB の値 0〜255、Rec.709）。差 = Godot − three
  面積  人物の画素の数（シルエット）。比 = Godot / three
  IoU   2 つのシルエットの重なり（共通 / 合計）
  差    共通部分の RGB の差の平均（0〜255）
  暗    輝度 40 未満の画素の数（輪郭線・暗い部品。輪郭線の太さの目安）。比 = Godot / three
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'out/godot-pose'
DST = ROOT / 'art/shots/godot-pose'
CELL = (400, 300)
LABEL_W = 210
CHUNK = 6
THRESH = 24     # 背景との RGB 差の合計がこれ以上の画素を人物とみなす


def font(size):
    for p in ['/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf', '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf']:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def hex_rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.int32)


def load(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.int32)


def mask_of(a, bg):
    return np.abs(a - bg).sum(axis=2) >= THRESH


def lum(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def stats(a, b, bg):
    ma, mb = mask_of(a, bg), mask_of(b, bg)
    inter, union = (ma & mb).sum(), (ma | mb).sum()
    la, lb = lum(a), lum(b)
    return {
        'lum_a': float(la[ma].mean()) if ma.any() else 0.0, 'lum_b': float(lb[mb].mean()) if mb.any() else 0.0,
        'area_a': int(ma.sum()), 'area_b': int(mb.sum()), 'iou': float(inter / union) if union else 1.0,
        'diff': float(np.abs(a - b)[ma & mb].mean()) if inter else 0.0,
        'dark_a': int((la[ma] < 40).sum()), 'dark_b': int((lb[mb] < 40).sum()),
    }, ma | mb


def crop_box(mask, size):
    ys, xs = np.where(mask)
    w, h = size
    if len(xs) == 0:
        return 0, 0, w, h
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    m = 24
    x0, y0, x1, y1 = x0 - m, y0 - m, x1 + m, y1 + m
    cw, ch = x1 - x0, y1 - y0
    ar = CELL[0] / CELL[1]
    if cw / ch < ar:
        nw = int(ch * ar); x0 -= (nw - cw) // 2; x1 = x0 + nw
    else:
        nh = int(cw / ar); y0 -= (nh - ch) // 2; y1 = y0 + nh
    return int(x0), int(y0), int(x1), int(y1)


def cell(a, box, bg):
    img = Image.fromarray(a.astype(np.uint8))
    x0, y0, x1, y1 = box
    canvas = Image.new('RGB', (x1 - x0, y1 - y0), tuple(int(v) for v in bg))
    canvas.paste(img, (-x0, -y0))
    return canvas.resize(CELL, Image.LANCZOS)


def group_of(pid):
    if pid.startswith('sw_'):
        return 'sword'
    if pid.startswith('eq_'):
        return 'equipment'
    if pid == 'gs_rest' or pid.startswith('gs_form'):
        return 'greatsword-forms'
    return 'greatsword-poses'


def main():
    cfg = json.loads((SRC / 'poses.json').read_text())
    bg = hex_rgb(cfg['bg'])
    DST.mkdir(parents=True, exist_ok=True)
    rows, groups = [], {}
    for j in cfg['jobs']:
        pa, pb = SRC / 'three' / (j['id'] + '.png'), SRC / 'godot' / (j['id'] + '.png')
        if not (pa.exists() and pb.exists()):
            print('skip (画像なし):', j['id'])
            continue
        a, b = load(pa), load(pb)
        st, union = stats(a, b, bg)
        box = crop_box(union, (a.shape[1], a.shape[0]))
        d = np.clip(np.abs(a - b) * 4, 0, 255)
        r = {'id': j['id'], 'label': j['label'], 'weapon': j['weapon'], 'st': st,
             'imgs': (cell(a, box, bg), cell(b, box, bg), cell(d, box, np.array([0, 0, 0])))}
        rows.append(r)
        groups.setdefault(group_of(j['id']), []).append(r)
    f_l, f_s, f_h = font(15), font(12), font(16)
    files = []
    for g, rs in groups.items():
        chunks = [rs[i:i + CHUNK] for i in range(0, len(rs), CHUNK)]
        for ci, ch in enumerate(chunks):
            W = LABEL_W + CELL[0] * 3
            H = 28 + len(ch) * (CELL[1] + 4)
            sheet = Image.new('RGB', (W, H), (24, 26, 30))
            dr = ImageDraw.Draw(sheet)
            for k, t in enumerate(['three.js（ブラウザ版）', 'Godot', '差 ×4']):
                dr.text((LABEL_W + k * CELL[0] + 8, 5), t, fill=(230, 230, 230), font=f_h)
            for i, r in enumerate(ch):
                y = 28 + i * (CELL[1] + 4)
                dr.text((8, y + 6), r['label'], fill=(255, 255, 255), font=f_l)
                dr.text((8, y + 28), r['weapon'], fill=(170, 175, 185), font=f_s)
                s = r['st']
                lines = [f"輝度 {s['lum_a']:.0f} / {s['lum_b']:.0f}", f"面積比 {s['area_b'] / max(1, s['area_a']):.3f}",
                         f"IoU {s['iou']:.3f}", f"差 {s['diff']:.1f}", f"暗 {s['dark_a']} / {s['dark_b']}"]
                for k, ln in enumerate(lines):
                    dr.text((8, y + 56 + k * 18), ln, fill=(200, 215, 235), font=f_s)
                for k, im in enumerate(r['imgs']):
                    sheet.paste(im, (LABEL_W + k * CELL[0], y))
            name = f'pose-{g}-{ci + 1}.png' if len(chunks) > 1 else f'pose-{g}.png'
            sheet.save(DST / name)
            files.append(name)
            print('シート:', DST / name)
    # 数の表
    md = ['# 人物の姿勢: three.js と Godot の比較（pose_sheet.py が書く）', '',
          '| 姿勢 | 武器 | 輝度 three | 輝度 Godot | 輝度差 | 面積比 | IoU | 差(RGB) | 暗 three | 暗 Godot | 暗比 |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for r in rows:
        s = r['st']
        md.append(f"| {r['label']} | {r['weapon']} | {s['lum_a']:.1f} | {s['lum_b']:.1f} | {s['lum_b'] - s['lum_a']:+.1f} | {s['area_b'] / max(1, s['area_a']):.3f} | {s['iou']:.3f} | {s['diff']:.1f} | {s['dark_a']} | {s['dark_b']} | {s['dark_b'] / max(1, s['dark_a']):.2f} |")
    if rows:
        ious = [r['st']['iou'] for r in rows]
        lds = [abs(r['st']['lum_b'] - r['st']['lum_a']) for r in rows]
        md += ['', f'平均 IoU {np.mean(ious):.3f}（最小 {min(ious):.3f}）、輝度差の絶対値の平均 {np.mean(lds):.2f}（最大 {max(lds):.2f}）、姿勢 {len(rows)} 件']
    (DST / 'pose_numbers.md').write_text('\n'.join(md) + '\n')
    print('\n'.join(md))


if __name__ == '__main__':
    sys.exit(main())
