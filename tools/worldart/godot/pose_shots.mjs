// 人物の姿勢を、ブラウザ版（three.js）と Godot で同じ条件で撮る（G2-2）。比べる並べ方は pose_sheet.py。
//   node tools/worldart/godot/pose_shots.mjs                 three.js 側を撮り、Godot 用の一覧（poses.json）を書く
//   node tools/worldart/godot/pose_shots.mjs --godot         さらに Godot（godot/worldart/scenes/pose_view.tscn）でも撮る
//   node tools/worldart/godot/pose_shots.mjs --only=gs_rest,gs_walk   一部だけ
//   python3 tools/worldart/godot/pose_sheet.py               並べた比較シート → art/shots/godot-pose/
// 出力: out/godot-pose/{three,godot}/<id>.png と out/godot-pose/poses.json（out/ は git に入れない）
// 条件（Godot 側の pose_view.gd と同じ値。poses.json に書いて Godot へ渡す）:
//   カメラ: 画角 50（縦）、注視点 (0,1.05,0)、位置 (0,4.21,3.61)（ゲームのカメラの向きで、人物が大きく入る距離）
//   光: ゲームの第 1 層の野外（game/area.js: hemi 空 0xcfe8ff 地 0x3a5a2a 強さ 1.1、太陽 0xfff1d6 強さ 2.2、位置 (20,40,10) → 原点）
//   描画: ACES Filmic・露出 1・sRGB 出力（game/render.js と同じ）。影・ブルーム・仕上げ（彩度・コントラスト・ビネット）なし。背景は無地
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, startServer } from '../../../e2e/lib/harness.mjs';
import { MOTION_DURATIONS } from '../../../public/shared/motion-catalog.js';
import { TECHNIQUES } from '../../../public/shared/techniques.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'out/godot-pose');
const W = 960, H = 720;
const CAMERA = { fov: 50, pos: [0, 4.21, 3.61], target: [0, 1.05, 0] };
const LIGHT = { sun_dir: [20, 40, 10], sun_color: '#fff1d6', sun_i: 2.2, sky: '#cfe8ff', ground: '#3a5a2a', hemi_i: 1.1, aces: true, exposure: 1 };
const BG = '#7d8a95';
const COLOR = '#448a9b';
const TIER = 4;                       // 飾りの段階（レア度 5）。形の比較は全部これ

// 姿勢の一覧: [id, ラベル, 武器 '種類:形:段階', 状態]
const GS = `greatsword:0:${TIER}`;
const hit = (id) => TECHNIQUES[id]?.hits?.[0] ?? MOTION_DURATIONS[id] * 0.5;
const POSES = [
  ['gs_rest', '大剣 構え', GS, {}],
  ['gs_walk', '大剣 歩き', GS, { moving: true, walkT: 0.3 }],
  ['gs_n1', '大剣 通常1段(0.5)', GS, { swing: 0.5, combo: 0 }],
  ['gs_n2', '大剣 通常2段(0.5)', GS, { swing: 0.5, combo: 1 }],
  ['gs_n3', '大剣 通常3段(0.5)', GS, { swing: 0.5, combo: 2 }],
  ['gs_ch01', '大剣 溜め 0.1', GS, { charging: true, charge: 0.1, swing: 0.02 }],
  ['gs_ch05', '大剣 溜め 0.5', GS, { charging: true, charge: 0.5, swing: 0.02 }],
  ['gs_ch10', '大剣 溜め 1', GS, { charging: true, charge: 1, swing: 0.02 }],
  ['gs_heavy', '大剣 強攻撃 振り下ろし', GS, { heavy: true, swing: 0.4 }],
  ...['gs_guillotine', 'gs_rising', 'gs_broad', 'gs_siege'].map((id) => [id, `大剣 技 ${TECHNIQUES[id].name}`, GS, { motion: id, motionT: hit(id) }]),
  ['gs_dodge', '大剣 回避(0.5)', GS, { dodge: 0.5 }],
  ['gs_hurt', '大剣 被弾(0.6)', GS, { hurt: 0.6 }],
  ['gs_down', '大剣 ダウン(1)', GS, { down: 1 }],
  ...[1, 2, 3, 4, 5, 6, 7].map((f) => [`gs_form${f}`, `大剣 形${f} 構え`, `greatsword:${f}:${TIER}`, {}]),
  ['sw_rest', '片手剣 構え', `sword:0:${TIER}`, {}],
  ['sw_n1', '片手剣 通常1段(0.5)', `sword:0:${TIER}`, { swing: 0.5, combo: 0 }],
  ['sw_ch05', '片手剣 溜め 0.5', `sword:0:${TIER}`, { charging: true, charge: 0.5, swing: 0.02 }],
  // 防具の見た目 1〜6（armor-looks.js）と盾（kite、盾槍の spear）
  ...[1, 2, 3, 4, 5, 6].map((a) => [`eq_armor${a}`, `防具 見た目${a}`, `sword:0:${TIER}`, {}, a]),
  ['eq_shield', '盾 kite 構え', `spear:0:${TIER}`, {}],
  ['eq_shield_guard', '盾 kite ガード', `spear:0:${TIER}`, { guard: true, gg: 1 }],
];
const args = Object.fromEntries(process.argv.slice(2).map((a) => (a.startsWith('--') ? [a.slice(2).split('=')[0], a.includes('=') ? a.slice(a.indexOf('=') + 1) : true] : [a, true])));
const only = args.only ? new Set(String(args.only).split(',')) : null;
const poses = POSES.filter((p) => !only || only.has(p[0]));
fs.mkdirSync(path.join(OUT, 'three'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'godot'), { recursive: true });

// Godot 用の一覧
const list = {
  camera: CAMERA, light: LIGHT, bg: BG,
  jobs: poses.map(([id, label, weapon, state, armor]) => ({ id, label, weapon, armor: armor || 0, hide_weapon: id.startsWith('eq_shield'), color: COLOR, state, out: path.join(OUT, 'godot', id + '.png') })),
};
fs.writeFileSync(path.join(OUT, 'poses.json'), JSON.stringify(list, null, 1) + '\n');

{
  const { chromium } = await loadPlaywright();
  const srv = await startServer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    await page.goto(srv.url + '/index.html?solo&low');
    await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
    const shots = await page.evaluate(async ({ list, W, H }) => {
      const THREE = await import('three');
      const M = await import('/js/models.js');
      const TIER_RARITY = [0, 2, 3, 4, 5, 7];
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      document.body.appendChild(cv);
      const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1); renderer.setSize(W, H, false);
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = list.light.exposure;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(list.bg);
      const hemi = new THREE.HemisphereLight(list.light.sky, list.light.ground, list.light.hemi_i); scene.add(hemi);
      const sun = new THREE.DirectionalLight(list.light.sun_color, list.light.sun_i); sun.position.set(...list.light.sun_dir); scene.add(sun, sun.target);
      const camera = new THREE.PerspectiveCamera(list.camera.fov, W / H, 0.1, 900);
      camera.position.set(...list.camera.pos); camera.lookAt(new THREE.Vector3(...list.camera.target));
      const base = { t: 1, moving: false, walkT: 0, combo: 0, swing: -1, spin: -1, sweep: -1, dodge: 0, down: 0, hurt: 0 };
      const out = {};
      for (const j of list.jobs) {
        const [kind, form, tier] = j.weapon.split(':');
        const model = M.makePlayer(j.color);
        M.setPlayerWeapon(model, kind, TIER_RARITY[+tier], +form);
        if (j.armor) M.setPlayerArmor(model, j.armor);
        model.userData.ring.visible = false;
        scene.add(model);
        M.animatePlayer(model, { ...base, kind, ...j.state });
        if (j.hide_weapon) model.userData.weapon.visible = false;   // 盾の確認: 槍は書き出していない（大剣・片手剣だけ）
        renderer.render(scene, camera);
        out[j.id] = cv.toDataURL('image/png').split(',')[1];
        scene.remove(model);
      }
      return out;
    }, { list, W, H });
    for (const [id, b64] of Object.entries(shots)) fs.writeFileSync(path.join(OUT, 'three', id + '.png'), Buffer.from(b64, 'base64'));
    console.log(`three.js: ${Object.keys(shots).length} 枚 → ${path.join(OUT, 'three')}`);
  } finally { await browser.close(); srv.close(); }
}

if (args.godot) {
  const env = { ...process.env, VK_ICD_FILENAMES: '/usr/share/vulkan/icd.d/lvp_icd.json' };
  const r = spawnSync('timeout', ['-k', '5', '900', 'xvfb-run', '-a', 'godot', '--path', path.join(ROOT, 'godot/worldart'), '--resolution', `${W}x${H}`, 'scenes/pose_view.tscn', '--', '--list=' + path.join(OUT, 'poses.json')],
    { env, encoding: 'utf8' });
  const lines = (r.stdout || '').split('\n').filter((l) => /pose_view|ERROR|SCRIPT|Parse/.test(l));
  console.log('Godot:', lines.join('\n') || '(出力なし)', 'status', r.status);
  if (r.status !== 0) console.log((r.stderr || '').split('\n').filter((l) => !/ALSA|audio/i.test(l)).slice(0, 15).join('\n'));
}
