"""第 2 世代の地図に第 3 世代の規則（docs/world-art/rulebook.md、L23 の光と色）を当て、<名>_g3.json を書く（元の地図は残す）。
python3 -I tools/worldart/maps/to_gen3.py orc_meadow south_coast town_plaza forest_path palm_clearing
当てるもの（地図ごとに変えないもの）: カメラ（45°/18°/33m）、太陽の色と強さ（向きと高度は地図のまま）、空の光、階調（線形 + 露出）、
MSAA、やわらかい影、葉の光と色味、アイデア01、草・岩肌の地色、崖（置いた岩の列 → 地形の岩肌 + 起伏 + 苔の斑）、
第 3 世代のアセット（広葉樹 maple2、もみ fir3、小石 rock_s。どれも build_assets.py で Blender から作る）。
地図のまま残すもの: 構図（道・区域・小物・木の位置）、地面の種類（砂・石畳・水）、太陽の向き、土・砂・敷石の色。"""
import sys, os, json, copy
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
TPL = json.load(open(os.path.join(ROOT, 'docs/world-art/templates/map-gen3.json')))
REP = {'maple_a': 'maple2_a', 'maple_b': 'maple2_b', 'maple_c': 'maple2_c', 'maple_big': 'maple2_big',   # 見本②と同じ置き換え（L06）
       'fir2_a': 'fir4_a', 'fir2_b': 'fir4_b',      # もみ 第 4 世代（2026-10-23: 段の枝。第 3 世代 fir3 は L24）
       'rock_c': 'rock_s'}                            # 小石はなめらかな形（rulebook 7.2）


def rep(o):
    if isinstance(o, dict): return {k: rep(v) for k, v in o.items()}
    if isinstance(o, list): return [rep(v) for v in o]
    return REP.get(o, o) if isinstance(o, str) else o


def convert(name):
    s = json.load(open(os.path.join(ROOT, 'public/worldart/maps', f'{name}.json')))
    g = rep(copy.deepcopy(s))
    g['name'] = f'{name}_g3'
    g['note'] = f'{name} に第 3 世代の規則を当てたもの（tools/worldart/maps/to_gen3.py が書く。手で直さず元の地図か規則を直す）。' + s.get('note', '')
    g['camera'] = dict(s['camera'], pitch=TPL['camera']['pitch'], dist=TPL['camera']['dist'], fov=TPL['camera']['fov'])
    g['sun'] = dict(s['sun'], color=TPL['sun']['color'], intensity=TPL['sun']['intensity'])
    for k in ('sky', 'tone', 'albedoSat', 'shadowMap', 'shadowRadius'):
        g[k] = copy.deepcopy(TPL[k])
    g['foliage'] = copy.deepcopy(TPL['foliage'])
    g['post'] = dict(copy.deepcopy(TPL['post']), dof=s.get('post', {}).get('dof', 1.0))
    gr = dict(s.get('ground', {}))
    for k in ('grassTint', 'rockTint', 'lushBias'):
        if k in TPL['ground']: gr[k] = TPL['ground'][k]
    gr.update(rock='face', rockPix=True)
    g['ground'] = gr
    for cl in g['terrain'].get('cliffs', []):          # 崖は地形の岩肌（rulebook 7.1、F21・F23）
        cl.pop('rocks', None)
        cl['relief'] = 0.4
        if cl.get('drop', 0) >= 3: cl['drape'] = 0.5
    return g


if __name__ == '__main__':
    for n in sys.argv[1:]:
        g = convert(n)
        out = os.path.join(ROOT, 'public/worldart/maps', f'{n}_g3.json')
        json.dump(g, open(out, 'w'), ensure_ascii=False, indent=1)
        print('->', out)
