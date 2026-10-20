// ゲームの人物・敵のモデル（public/js/models.js がコードで組み立てる three.js の形）を glTF に書き出す（L27 CP6）。
//   node tools/worldart/godot/export_models.mjs   → godot/worldart/data/models/<名>.glb
// ブラウザ（playwright）でゲームを開き、makePlayer・makeMob で作った形を GLTFExporter で書く。輪郭線（裏返しの黒い殻）は除く。
// 材質は色だけ（トゥーンの階調は Godot 側のシェーダーで付ける）。動き（歩き・振り）は Godot 側で部品を動かす
import fs from 'node:fs';
import { loadPlaywright, startServer } from '../../../e2e/lib/harness.mjs';

const OUT = new URL('../../../godot/worldart/data/models/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = await loadPlaywright();
const srv = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.goto(srv.url + '/index.html?solo&low');
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  const out = await page.evaluate(async () => {
    const THREE = await import('three');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const M = await import('/js/models.js');
    const D = await import('/shared/data.js');
    const ex = new GLTFExporter();
    const toB64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
    // 輪郭線（toon.js の outline: 裏面だけを描く黒い殻）と光る効果の板を外し、材質を色だけの標準の材質にする
    const clean = (root) => {
      const drop = [];
      root.traverse((o) => {
        if (!o.isMesh) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!m || m.side === THREE.BackSide || o.userData.outline || /outline/i.test(o.name)) { drop.push(o); return; }
        const c = m.color ? m.color.clone() : new THREE.Color(1, 1, 1);
        const em = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05 ? m.emissive.clone() : null;
        const glow = !!(m.isMeshBasicMaterial && !m.map);
        o.material = new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0, emissive: glow ? c : (em || new THREE.Color(0)), side: m.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide });
        o.material.name = glow ? 'glow' : 'toon';
      });
      for (const o of drop) o.parent?.remove(o);
      return root;
    };
    const exportOne = (obj) => new Promise((res, rej) => ex.parse(clean(obj), (r) => res(toB64(r)), rej, { binary: true }));
    const res = {};
    res.player = await exportOne(M.makePlayer('#448a9b'));
    const F = D.FLOORS[0];
    for (const m of [...F.mobs, ...(F.elites || [])]) if (!res['mob_' + m.t]) res['mob_' + m.t] = await exportOne(M.makeMob(m.t, m.color, 1));
    if (F.boss) res['boss_' + F.boss.t] = await exportOne(M.makeMob(F.boss.t, F.boss.color, 1, F.boss.accent, true, F.boss.appearance));
    return res;
  });
  for (const [k, b64] of Object.entries(out)) { fs.writeFileSync(new URL(k + '.glb', OUT), Buffer.from(b64, 'base64')); console.log(k, (b64.length * 0.75 / 1024).toFixed(0), 'KB'); }
} finally { await browser.close(); srv.close(); }
