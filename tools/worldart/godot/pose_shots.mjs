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
const SIDE_CAM = { fov: 50, pos: [1.9, 1.9, 3.2], target: [-0.2, 1.3, 0.3] };
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
  // 槍・短剣・斧・弓: 構え・通常・溜め・技 1 つ（弓は引き 0.5 と 1.0）と、全部の形の構え
  ...[['sp', 'spear', '槍', 'spear_stake', 4], ['dg', 'dagger', '短剣', 'dagger_vital', 4], ['ax', 'axe', '斧', 'axe_execute', 4]].flatMap(([p, kind, jp, tech, nf]) => [
    [`${p}_rest`, `${jp} 構え`, `${kind}:0:${TIER}`, {}],
    [`${p}_n1`, `${jp} 通常1段(0.5)`, `${kind}:0:${TIER}`, { swing: 0.5, combo: 0 }],
    [`${p}_ch05`, `${jp} 溜め 0.5`, `${kind}:0:${TIER}`, { charging: true, charge: 0.5, swing: 0.02 }],
    [`${p}_tech`, `${jp} 技 ${TECHNIQUES[tech].name}`, `${kind}:0:${TIER}`, { motion: tech, motionT: hit(tech) }],
    ...Array.from({ length: nf - 1 }, (_, i) => i + 1).map((f) => [`${p}_form${f}`, `${jp} 形${f} 構え`, `${kind}:${f}:${TIER}`, {}]),
  ]),
  ['bw_rest', '弓 構え', `bow:0:${TIER}`, {}],
  ['bw_n1', '弓 通常(0.1 放つ)', `bow:0:${TIER}`, { swing: 0.1 }],
  ['bw_draw05', '弓 引き 0.5', `bow:0:${TIER}`, { charging: true, charge: 0.5, swing: 0.02 }],
  ['bw_draw10', '弓 引き 1.0', `bow:0:${TIER}`, { charging: true, charge: 1, swing: 0.02 }],
  // 弦と矢が見える横からの画角（job.camera で上書き）。引き 0 / 0.5 / 1.0
  ...[['0', 0], ['05', 0.5], ['10', 1]].map(([n, c]) => [`bw_side${n}`, `弓 横から 引き${c}`, `bow:0:${TIER}`, c ? { charging: true, charge: c, swing: 0.02 } : {}, 0, SIDE_CAM]),
  ['bw_tech', `弓 技 ${TECHNIQUES.bow_double.name}`, `bow:0:${TIER}`, { motion: 'bow_double', motionT: hit('bow_double') }],
  ...[1, 2, 3].map((f) => [`bw_form${f}`, `弓 形${f} 構え`, `bow:${f}:${TIER}`, {}]),
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
  jobs: poses.map(([id, label, weapon, state, armor, camera]) => ({ id, label, weapon, armor: armor || 0, camera, hide_weapon: id.startsWith('eq_shield'), color: COLOR, state, out: path.join(OUT, 'godot', id + '.png') })),
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
        const cam = j.camera || list.camera;
        camera.position.set(...cam.pos); camera.lookAt(new THREE.Vector3(...cam.target));
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
