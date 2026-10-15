// 見た目の記録テスト: 武器・プレイヤー（防具・武器・竜騎士の盾）・敵・ボスを決まった角度で描き、
// 画素を粗くまとめた値を、記録した期待値と比べる。GOLDEN_DUMP を指定すると PNG も書き出す。
// 期待値を作り直すときだけ GOLDEN_UPDATE=1（リファクタリング中は作り直さない）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPlaywright, startServer } from './lib/harness.mjs';

const FIX = new URL('./fixtures/render.json', import.meta.url);
const OUT = process.env.GOLDEN_DUMP;

test('weapons, outfits, monsters and bosses render the same as recorded', { timeout: 1800_000 }, async () => {
  const { chromium } = await loadPlaywright();
  const srv = await startServer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let result;
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
    await page.addInitScript('Math.random = () => 0.5;');
    await page.goto(srv.url + '/js/../index.html?solo&low');
    await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
    result = await page.evaluate(async (dump) => {
      const THREE = await import('three');
      const M = await import('/js/models.js');
      const D = await import('/shared/data.js');
      const W = 96, H = 96;
      const r = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
      r.setPixelRatio(1); r.setSize(W, H);
      const sc = new THREE.Scene(); sc.background = new THREE.Color(0x26303e);
      sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(3, 6, 4); sc.add(dl);
      const gl = r.getContext(), px = new Uint8Array(W * H * 4);
      const out = {}, pngs = {};
      const shoot = (name, obj, dist, y) => {
        sc.add(obj);
        const vals = [];
        for (const [i, ang] of [0, 2.2].entries()) {
          const cam = new THREE.PerspectiveCamera(35, 1, 0.05, 200); cam.position.set(Math.sin(ang) * dist, y + dist * 0.3, Math.cos(ang) * dist); cam.lookAt(0, y, 0);
          r.render(sc, cam);
          gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
          let h = 2166136261 >>> 0; for (let k = 0; k < px.length; k++) { if (k % 4 === 3) continue; h = Math.imul(h ^ (px[k] >> 4), 16777619) >>> 0; }
          vals.push(h.toString(16));
          if (dump && i === 0) pngs[name] = r.domElement.toDataURL('image/png');
        }
        sc.remove(obj);
        out[name] = vals.join('-');
      };
      for (const kind of ['sword', 'greatsword', 'spear', 'dagger', 'axe', 'bow']) for (const [rarity, style] of [[1, 0], [4, 1], [5, 2], [7, 3]]) shoot(`weapon/${kind}/${rarity}/${style}`, M.makeWeapon(kind, rarity, style), 2.6, 0.4);
      const base = { t: 1, moving: false, walkT: 0, combo: 0, swing: -1, spin: -1, sweep: -1, dodge: 0, down: 0, hurt: 0 };
      for (let look = 0; look < M.ARMOR_LOOK_NAMES.length; look++) { const m = M.makePlayer('#448a9b'); M.setPlayerArmor(m, look); M.setPlayerWeapon(m, ['sword', 'spear', 'bow', 'axe', 'dagger', 'greatsword', 'sword'][look % 7], 4, look % 4); M.animatePlayer(m, { ...base, kind: m.userData.wKind }); shoot(`player/armor${look}`, m, 5, 1.1); }
      for (const [label, s, kind] of [['guard', { guard: true, gg: 0.5 }, 'spear'], ['dragoon', { shieldBack: true }, 'spear'], ['charge', { charging: true, charge: 1, swing: 0.02 }, 'bow'], ['swing', { swing: 0.25, combo: 2 }, 'greatsword']]) {
        const m = M.makePlayer('#c05050'); M.setPlayerWeapon(m, kind, 3, 0); M.animatePlayer(m, { ...base, kind, ...s }); M.animatePlayer(m, { ...base, kind, ...s }); shoot(`pose/${label}`, m, 5, 1.1);
      }
      const seen = new Set();
      for (const f of D.FLOORS) {
        for (const md of f.mobs) { if (seen.has(md.t + md.color)) continue; seen.add(md.t + md.color); const m = M.makeMob(md.t, md.color, 1, null); M.animateMob(m, { t: 1.3, st: 1 }); shoot(`mob/${md.t}/${md.color}`, m, 6, 1); }
        if (f.boss) { const m = M.makeMob(f.boss.t, f.boss.color, f.boss.scale, f.boss.accent, true, f.boss.appearance); M.animateMob(m, { t: 2, st: 2, enraged: true }); shoot(`boss/${f.boss.name}`, m, 6 * f.boss.scale, 2 * f.boss.scale); }
      }
      return { out, pngs };
    }, !!OUT);
  } finally { await browser.close(); srv.close(); }
  if (OUT) { fs.mkdirSync(OUT, { recursive: true }); for (const [k, v] of Object.entries(result.pngs)) fs.writeFileSync(`${OUT}/${k.replace(/[\/ ]/g, '_')}.png`, Buffer.from(v.split(',')[1], 'base64')); }
  if (process.env.GOLDEN_UPDATE) { fs.writeFileSync(FIX, JSON.stringify(result.out, null, 1)); return; }
  const golden = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  for (const [k, v] of Object.entries(golden)) assert.equal(result.out[k], v, k);
  assert.deepEqual(Object.keys(result.out).sort(), Object.keys(golden).sort());
});
