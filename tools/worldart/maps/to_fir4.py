"""もみを第 3 世代（fir3_a/b、細長い葉の帯）から第 4 世代（fir4_a/b/c、段の枝）に差し替える（2026-10-23）。
  python -I -X utf8 tools/worldart/maps/to_fir4.py
地図の JSON（public/worldart/maps/<名>.json）の木の一覧・個別の配置と、組み立て済みの配置（<名>/placements.json）の両方を書き換える。
同じ形が並ばないように（ユーザー、2026-10-23）、fir3_a は fir4_a と fir4_c（小さく傾いた木）に分ける（配置は位置から決まる乱数で 6:4、
地図の JSON の名前は出てくる順に a, a, c）。fir3_b は fir4_b。
地図の生成スクリプト（make_f1_field.py など）の名前も同じに置き換えておくこと。"""
import glob, json, os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
MAPS = os.path.join(ROOT, 'public', 'worldart', 'maps')


def pick(x, z):
    """位置から決まる 0〜1（同じ場所はいつも同じ種類）"""
    h = (int(round(x * 100)) * 73856093) ^ (int(round(z * 100)) * 19349663)
    return (h & 0xffff) / 0xffff


def spec(path):
    """地図の JSON は書式を保つため文字列で置き換える。fir3_a は出てくる順に a, a, c の繰り返し"""
    s = open(path, encoding='utf8').read()
    if 'fir3' not in s: return 0
    k = [0]
    def a_or_c(m):
        k[0] += 1
        return '"fir4_c"' if k[0] % 3 == 0 else '"fir4_a"'
    s = re.sub(r'"fir3_a"', a_or_c, s).replace('"fir3_b"', '"fir4_b"')
    open(path, 'w', encoding='utf8', newline='').write(s)
    return 1


def placements(path):
    d = json.load(open(path, encoding='utf8'))
    a = d.get('assets', {})
    if 'fir3_a' not in a and 'fir3_b' not in a: return 0
    for p in a.pop('fir3_a', []):
        a.setdefault('fir4_c' if pick(p[0], p[2]) < 0.4 else 'fir4_a', []).append(p)
    if 'fir3_b' in a: a.setdefault('fir4_b', []).extend(a.pop('fir3_b'))
    d['counts'] = {k: len(v) for k, v in a.items()}
    open(path, 'w', encoding='utf8', newline='\n').write(json.dumps(d, ensure_ascii=False))
    return 1


def spread(path):
    """2 回目（2026-10-23）: 形の種類を 5 つに増やした（fir4_d 細く高い、fir4_e 低く横に張った）。組み立て済みの配置の
    fir4_a の 35% を fir4_d へ、fir4_b の 40% を fir4_e へ移す（位置から決まる乱数、1 回目とは別の種）。何度流しても同じ結果"""
    d = json.load(open(path, encoding='utf8'))
    a = d.get('assets', {})
    if 'fir4_d' in a or 'fir4_e' in a or not ('fir4_a' in a or 'fir4_b' in a): return 0
    for src, dst, share in (('fir4_a', 'fir4_d', 0.35), ('fir4_b', 'fir4_e', 0.4)):
        keep = []
        for p in a.get(src, []):
            (a.setdefault(dst, []) if pick(p[0] + 0.37, p[2] - 0.71) < share else keep).append(p)
        if src in a: a[src] = keep
    d['counts'] = {k: len(v) for k, v in a.items()}
    open(path, 'w', encoding='utf8', newline='\n').write(json.dumps(d, ensure_ascii=False))
    return 1


if __name__ == '__main__':
    for f in sorted(glob.glob(os.path.join(MAPS, '*.json'))):
        if spec(f): print('spec', os.path.basename(f))
    for f in sorted(glob.glob(os.path.join(MAPS, '*', 'placements.json'))):
        if placements(f): print('placements', os.path.relpath(f, MAPS))
        if spread(f): print('spread', os.path.relpath(f, MAPS))
