"""three.js 版と Godot 版を同じ条件で撮り、地図ごとに比較する。

python -I -X utf8 tools/worldart/godot/port_check.py [地図 ...] [--skip-three] [--skip-godot] [--views a,b]
  出力: art/shots/port/<地図>/{three,godot}/<ビュー>.png, compare.webp, summary.{md,json}
  解像度: 1532x869。判定: 輝度 ±0.03、彩度 ±0.04、明暗比 ±0.25
"""
import glob
import json
import os
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'worldart'))
import refstats  # 輝度・彩度・明暗比の定義はこれと同じ

W, H = 1532, 869
OUT = os.path.join(ROOT, 'art', 'shots', 'port')
MAPS = os.path.join(ROOT, 'public', 'worldart', 'maps')
GODOT_PROJECT = os.path.join(ROOT, 'godot', 'worldart')
THREE_PORT = 8097
LIM = {'L': 0.03, 'S': 0.04, 'R': 0.25}


def parse_args():
    maps, views = [], None
    skip_three = skip_godot = False
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        arg = args[i]
        if arg == '--skip-three':
            skip_three = True
        elif arg == '--skip-godot':
            skip_godot = True
        elif arg == '--views' and i + 1 < len(args):
            i += 1
            views = args[i].split(',')
        elif arg.startswith('--views='):
            views = arg.split('=', 1)[1].split(',')
        elif not arg.startswith('--'):
            maps.extend(part for part in arg.split(',') if part)
        i += 1
    return maps or all_maps(), views, skip_three, skip_godot


def all_maps():
    return sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(MAPS, '*.json'))
                  if os.path.exists(os.path.join(MAPS, os.path.basename(p)[:-5], 'placements.json')))


def map_views(m):
    with open(os.path.join(MAPS, m + '.json'), encoding='utf-8') as f:
        spec = json.load(f)
    return list(spec.get('views', {}).keys()) or ['cam']


def shot_path(folder, view):
    return os.path.join(folder, view + '.png')


def image_ok(path):
    try:
        with Image.open(path) as im:
            return im.format == 'PNG' and im.size == (W, H)
    except (OSError, ValueError):
        return False


def clear_shots(folder, views):
    os.makedirs(folder, exist_ok=True)
    for view in views:
        path = shot_path(folder, view)
        if os.path.exists(path):
            os.remove(path)


def three_healthy():
    try:
        with urlopen(f'http://localhost:{THREE_PORT}/health', timeout=1) as response:
            return response.status == 200
    except (OSError, URLError):
        return False


def start_three_server():
    if three_healthy():
        raise RuntimeError(f'port {THREE_PORT} は既に使用中です。既存プロセスは停止せずに終了します。')
    os.makedirs(OUT, exist_ok=True)
    log_path = os.path.join(OUT, 'server.log')
    log_file = open(log_path, 'w', encoding='utf-8')
    env = dict(os.environ, PORT=str(THREE_PORT), WA_PORT=str(THREE_PORT))
    try:
        process = subprocess.Popen(['node', 'server.js'], cwd=ROOT, env=env,
                                   stdout=log_file, stderr=subprocess.STDOUT)
        for _ in range(120):
            if three_healthy():
                print(f'[server] started PID {process.pid} on port {THREE_PORT}', flush=True)
                return process, log_file
            if process.poll() is not None:
                break
            time.sleep(0.25)
        log_file.flush()
        with open(log_path, encoding='utf-8', errors='replace') as f:
            tail = ''.join(f.readlines()[-20:]).strip()
        raise RuntimeError(f'three.js サーバーの起動に失敗しました。ログ: {log_path}\n{tail}')
    except Exception:
        if 'process' in locals() and process.poll() is None:
            process.terminate()
            process.wait(timeout=10)
        log_file.close()
        raise


def stop_three_server(server):
    process, log_file = server
    pid = process.pid
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
    log_file.close()
    print(f'[server] stopped own PID {pid} (exit {process.returncode})', flush=True)


def shoot_three(m, views, d):
    clear_shots(d, views)
    env = dict(os.environ, PORT=str(THREE_PORT), WA_PORT=str(THREE_PORT))
    cmd = ['node', 'tools/worldart/views.mjs', m, d, ','.join(views), str(W), str(H)]
    print(f'[three.js] {m}: {", ".join(views)}', flush=True)
    subprocess.run(cmd, cwd=ROOT, env=env, check=True)
    missing = [v for v in views if not image_ok(shot_path(d, v))]
    if missing:
        raise RuntimeError(f'three.js の画像がありません/サイズ不一致: {m} {", ".join(missing)}')


def output_tail(output):
    if isinstance(output, bytes):
        output = output.decode('utf-8', errors='replace')
    lines = [line for line in (output or '').splitlines()
             if not any(k in line.lower() for k in ('alsa', 'audio', 'status < 0'))]
    markers = ('shot ', 'error:', 'script error', 'parse error', 'warning:')
    important = [line for line in lines if any(marker in line.lower() for marker in markers)]
    return '\n'.join((important or lines[-20:])[-30:])[-3000:]


def godot_executable():
    godot = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'Godot_4.3',
                         'Godot_v4.3-stable_win64_console.exe')
    if not os.path.isfile(godot):
        raise FileNotFoundError(f'Godot 4.3 console executable がありません: {godot}')
    return godot


def ensure_godot_imported(godot):
    cache = os.path.join(GODOT_PROJECT, '.godot', 'global_script_class_cache.cfg')
    if os.path.isfile(cache):
        return
    os.makedirs(OUT, exist_ok=True)
    log_path = os.path.abspath(os.path.join(OUT, 'godot_import.log'))
    cmd = [godot, '--headless', '--editor', '--import', '--quit', '--path', GODOT_PROJECT,
           '--log-file', log_path, '--audio-driver', 'Dummy']
    print('[Godot] initial import (global script class cache is missing)', flush=True)
    try:
        os.remove(log_path)
    except OSError:
        pass
    process = subprocess.Popen(cmd, cwd=ROOT, env=os.environ,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    start = time.monotonic()
    while process.poll() is None and time.monotonic() - start < 300:
        time.sleep(0.5)
    if process.poll() is None:
        stop_godot_tree(process)
        raise RuntimeError(f'Godot 初回 import が300秒で終了しませんでした: {log_path}')
    output = read_log(log_path)
    tail = output_tail(output)
    if tail:
        print(tail, flush=True)
    if process.returncode != 0 or not os.path.isfile(cache):
        raise RuntimeError(f'Godot 初回 import に失敗しました (exit {process.returncode}): {log_path}')
    print('[Godot] global script class cache ready', flush=True)


def stop_godot_tree(process):
    if process.poll() is not None:
        return
    if os.name == 'nt':
        subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    else:
        process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def read_log(path):
    if not path:
        return ''
    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            return f.read()
    except OSError:
        return ''


def run_godot(cmd, env, views, output_dir, log_path=None):
    if os.name == 'nt':
        try:
            os.remove(log_path)
        except (OSError, TypeError):
            pass
        process = subprocess.Popen(cmd, cwd=ROOT, env=env,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        started = time.monotonic()
        images_ready_at = None
        timed_out = False
        fatal_log = False
        try:
            while process.poll() is None:
                if all(image_ok(shot_path(output_dir, view)) for view in views):
                    if images_ready_at is None:
                        images_ready_at = time.monotonic()
                    elif time.monotonic() - images_ready_at >= 5:
                        break
                log = read_log(log_path)
                if 'Failed to load script' in log or 'Parse Error:' in log:
                    fatal_log = True
                    break
                if time.monotonic() - started >= 300:
                    timed_out = True
                    break
                time.sleep(0.5)
        finally:
            if process.poll() is None:
                stop_godot_tree(process)
        return process.returncode, read_log(log_path), timed_out, fatal_log

    try:
        result = subprocess.run(cmd, cwd=ROOT, env=env, timeout=1500,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, encoding='utf-8', errors='replace')
        return result.returncode, result.stdout, False, False
    except subprocess.TimeoutExpired as exc:
        return None, exc.stdout, True, False


def shoot_godot(m, views, d):
    clear_shots(d, views)
    os.makedirs(d, exist_ok=True)
    env = dict(os.environ)
    log_path = None
    if os.name == 'nt':
        godot = godot_executable()
        log_path = os.path.abspath(os.path.join(d, 'godot.log'))
        cmd = [godot, '--path', GODOT_PROJECT, '--resolution', f'{W}x{H}',
               '--fixed-fps', '60', '--log-file', log_path, '--audio-driver', 'Dummy',
               'res://scenes/main.tscn', '--',
               f'--map={m}', f'--shot={",".join(views)}', f'--out={d}']
    else:
        env['VK_ICD_FILENAMES'] = '/usr/share/vulkan/icd.d/lvp_icd.json'
        cmd = ['xvfb-run', '-a', '-s', f'-screen 0 {W}x{H}x24', 'godot', '--path', GODOT_PROJECT,
               '--resolution', f'{W}x{H}', '--audio-driver', 'Dummy', 'res://scenes/main.tscn', '--',
               f'--map={m}', f'--shot={",".join(views)}', f'--out={d}']

    print(f'[Godot] {m}: {", ".join(views)} (GPU/direct on Windows)', flush=True)
    for attempt in range(2):
        if attempt:
            print(f'[Godot] {m}: missing or invalid image; retrying once', flush=True)
        code, output, timed_out, fatal_log = run_godot(cmd, env, views, d, log_path)
        tail = output_tail(output)
        if tail:
            print(tail, flush=True)
        missing = [v for v in views if not image_ok(shot_path(d, v))]
        if not missing:
            if timed_out:
                print(f'[Godot] {m}: process timed out after saving all images; images accepted', flush=True)
            elif code:
                print(f'[Godot] {m}: exit code {code}; all requested images exist', flush=True)
            return
        reason = ' (timeout)' if timed_out else (' (script/shader error)' if fatal_log else '')
        print(f'[Godot] {m}: missing/invalid: {", ".join(missing)}' +
              (f' (exit {code})' if code is not None else '') + reason, flush=True)
    raise RuntimeError(f'Godot の画像がありません/サイズ不一致: {m} {", ".join(missing)}')


def measure(path):
    a, mask = refstats.load(path, W)
    stats = refstats.stats(a, mask)
    return {'L': stats['L_mean'], 'S': stats['S_mean'], 'R': stats.get('lit_shadow_ratio')}


def suspect_guess(row):
    reasons = []
    lake_water = row['map'] == 'f1_lake' and row['view'] in ('L02', 'L03', 'L04', 'OV')
    if lake_water:
        reasons.append('比較画像で Godot 側の水面が単色。ログの wa_water_w1 引数数不一致によるシェーダー失敗が候補')
    if 'L' in row['ng'] and not lake_water:
        reasons.append('露出・照明、空/水/地面の輝度差')
    if 'S' in row['ng'] and not lake_water:
        reasons.append('色処理、葉色、点描の抜きの差')
    if 'R' in row['ng']:
        reasons.append('植生の揺れ時刻、VSM と Godot の影方式、three.js の shadowMap / shadowRadius の差')
    return '；'.join(reasons)


def sheet(m, views, d3, dg, out):
    font = ImageFont.load_default()
    for path in (r'C:\Windows\Fonts\segoeui.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        try:
            font = ImageFont.truetype(path, 22)
            break
        except OSError:
            pass
    w, h = 760, 431
    canvas = Image.new('RGB', (w * 2 + 12, (h + 8) * len(views)), (24, 26, 22))
    draw = ImageDraw.Draw(canvas)
    for i, view in enumerate(views):
        for j, (folder, label) in enumerate(((d3, 'three.js'), (dg, 'Godot'))):
            path = shot_path(folder, view)
            x, y = j * (w + 12), i * (h + 8)
            if image_ok(path):
                with Image.open(path) as im:
                    canvas.paste(im.convert('RGB').resize((w, h), Image.Resampling.LANCZOS), (x, y))
            draw.rectangle([x, y, x + 330, y + 32], fill=(0, 0, 0))
            draw.text((x + 8, y + 3), f'{view}  {label}' + ('' if image_ok(path) else '  (なし)'),
                      fill=(255, 255, 255), font=font)
    canvas.save(out, quality=82)
    print('->', out, canvas.size, flush=True)


def fmt(value):
    return '-' if value is None else f'{value:.3f}'


def compare_row(m, view, d3, dg):
    p3, pg = shot_path(d3, view), shot_path(dg, view)
    row = {'map': m, 'view': view, 'three': None, 'godot': None, 'diff': None, 'ng': []}
    if image_ok(p3):
        row['three'] = measure(p3)
    if image_ok(pg):
        row['godot'] = measure(pg)
    if row['three'] is not None and row['godot'] is not None:
        row['diff'] = {key: (row['godot'][key] - row['three'][key])
                       if row['three'][key] is not None and row['godot'][key] is not None else None
                       for key in LIM}
        row['ng'] = [key for key in LIM if row['diff'][key] is not None and abs(row['diff'][key]) > LIM[key]]
        row['status'] = '外れ' if row['ng'] else '合格'
        row['suspect'] = suspect_guess(row)
    else:
        row['status'] = '未計測'
        row['suspect'] = ''
    return row


def write_summary(rows):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'summary.json'), 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    passed = sum(row['status'] == '合格' for row in rows)
    failed = sum(row['status'] == '外れ' for row in rows)
    incomplete = sum(row['status'] == '未計測' for row in rows)
    lines = ['# three.js と Godot の比較（port_check）', '',
             f'解像度: {W}×{H}。差 = Godot - three.js。合格: {passed}/{len(rows)}、外れ: {failed}、未計測: {incomplete}。',
             '判定: 輝度差 ≤ 0.03、彩度差 ≤ 0.04、明暗比差 ≤ 0.25。', '',
             '| 地図 | ビュー | 輝度 3/G/差 | 彩度 3/G/差 | 明暗比 3/G/差 | 判定 |',
             '|---|---|---|---|---|---|']
    for row in rows:
        cells = []
        for key in ('L', 'S', 'R'):
            three = (row['three'] or {}).get(key)
            godot = (row['godot'] or {}).get(key)
            diff = (row['diff'] or {}).get(key)
            cells.append(f'{fmt(three)} / {fmt(godot)} / {"-" if diff is None else f"{diff:+.3f}"}' +
                         (' ✗' if key in row['ng'] else ''))
        status = '—' if row['status'] == '未計測' else ('✗ ' + ','.join(row['ng']) if row['ng'] else '合格')
        lines.append(f'| {row["map"]} | {row["view"]} | ' + ' | '.join(cells) + f' | {status} |')
    lines.extend(['', '## 外れたビューと原因の見当', ''])
    failures = [row for row in rows if row['status'] == '外れ']
    if failures:
        for row in failures:
            lines.append(f'- **{row["map"]}/{row["view"]}**（{", ".join(row["ng"])}）: {row["suspect"]}')
    else:
        lines.append('外れなし。')
    if incomplete:
        lines.extend(['', '## 未計測', ''])
        for row in rows:
            if row['status'] == '未計測':
                have = ', '.join(name for name, value in (('three.js', row['three']), ('Godot', row['godot']))
                                 if value is not None) or '画像なし'
                lines.append(f'- **{row["map"]}/{row["view"]}**: 片側の撮影画像がない（{have}）')
    path = os.path.join(OUT, 'summary.md')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'\n合格 {passed}/{len(rows)}、外れ {failed}、未計測 {incomplete}', flush=True)
    print('\n'.join(lines), flush=True)
    return incomplete == 0


def main():
    maps, view_override, skip_three, skip_godot = parse_args()
    rows, errors = [], []
    server = None
    if not skip_godot and os.name == 'nt':
        try:
            ensure_godot_imported(godot_executable())
        except Exception as exc:
            print(f'[error] {exc}', flush=True)
            return 1
    if not skip_three:
        try:
            server = start_three_server()
        except Exception as exc:
            print(f'[error] {exc}', flush=True)
            return 1
    try:
        for m in maps:
            views = view_override or map_views(m)
            d3 = os.path.join(OUT, m, 'three')
            dg = os.path.join(OUT, m, 'godot')
            if not skip_three:
                try:
                    shoot_three(m, views, d3)
                except Exception as exc:
                    errors.append(f'three.js {m}: {exc}')
                    print(f'[error] {errors[-1]}', flush=True)
            if not skip_godot:
                try:
                    shoot_godot(m, views, dg)
                except Exception as exc:
                    errors.append(f'Godot {m}: {exc}')
                    print(f'[error] {errors[-1]}', flush=True)
            for view in views:
                rows.append(compare_row(m, view, d3, dg))
            os.makedirs(os.path.join(OUT, m), exist_ok=True)
            sheet(m, views, d3, dg, os.path.join(OUT, m, 'compare.webp'))
    finally:
        if server:
            stop_three_server(server)

    complete = write_summary(rows)
    if errors:
        print('[errors]\n' + '\n'.join(errors), flush=True)
    return 0 if complete and not errors else 1


if __name__ == '__main__':
    sys.exit(main())
