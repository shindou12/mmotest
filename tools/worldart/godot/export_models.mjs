// ゲームの人物・武器・盾・防具・敵のモデル（public/js/models.js がコードで組み立てる three.js の形）を glTF に書き出す（L27 CP6 / G2-2）。
//   node tools/worldart/godot/export_models.mjs            人物・武器・盾・防具・握り手を書く（敵は --mobs を付けたときだけ）
//   → godot/worldart/data/models/ 以下
//       player.glb                     人物。部品に rig.json と同じ名前（body head armL armR elbowL elbowR hand handL leg0 leg1 cape）
//                                      プレイヤーごとの色の材質は名前が player_color*（色の作り方は player_color.json）
//       weapons/<武器>_f<形>_<ハッシュ>.glb + weapons/index.json   大剣 形 0〜7・片手剣 形 0〜8 を飾りの段階 0〜5 ごとに
//                                      （中身が同じ段階は同じファイルを指す。index.json の "greatsword:3:4" → ファイル名）
//       shield_kite_t<段階>.glb         盾（kite）
//       armor_look<1〜6>.glb + armor_looks.json   防具の見た目（onBody / onHead の 2 部品と、隠す部品の表）
//       grip_hand.glb                   片手剣の握り手
// 輪郭線の殻（toon.js の outline）は書かない。殻を持っていたメッシュは、ノード名に ow<太さ×100>_（outline(root, w) の w）を付ける。
// 材質の名前は toon / glow のまま。光る部品の色が 1 を超えるとき（レア度の色 ×1.6 など）は、ノード名に gm<倍率×100>_ を付ける
// （Godot 4.3 の取り込みは glTF の extras をノードに渡さないため、名前で運ぶ）
// ブラウザ（playwright）でゲームを開き、GLTFExporter で書く。材質は色だけ（トゥーンの階調は Godot の toon.gdshader が付ける）
import fs from 'node:fs';
import crypto from 'node:crypto';
import { loadPlaywright, startServer } from '../../../e2e/lib/harness.mjs';

const OUT = new URL('../../../godot/worldart/data/models/', import.meta.url);
const WOUT = new URL('weapons/', OUT);
fs.mkdirSync(WOUT, { recursive: true });
const withMobs = process.argv.includes('--mobs');
const { chromium } = await loadPlaywright();
const srv = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(srv.url + '/index.html?solo&low');
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  const out = await page.evaluate(async (withMobs) => {
    const THREE = await import('three');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const M = await import('/js/models.js');
    const D = await import('/shared/data.js');
    const GH = await import('/js/models/grip-hands.js');
    const ex = new GLTFExporter();
    const toB64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
    const PLAYER = '#448a9b';
    // プレイヤーの色から作る材質の作り方（models.js makePlayer / setPlayerArmor の式）。Godot はこの表で色を作り直す
    const RECIPES = {
      cloth: { name: 'player_color', a: 'player', b: 0x24394b, t: 0.32 },
      clothD: { name: 'player_color_clothD', a: 'player', b: 0x18232e, t: 0.70 },
      coat: { name: 'player_color_coat', a: 'player', b: 0x101a26, t: 0.62 },
      hair: { name: 'player_color_hair', a: 0x17232d, b: 'player', t: 0.12 },
      armor_cloth: { name: 'player_color_armor_cloth', a: 'player', b: 0x2a2a3a, t: 0.35 },
      armor_dark: { name: 'player_color_armor_dark', a: 'player', b: 0x101018, t: 0.70 },
    };
    const roleColors = (hex) => {
      const c = new THREE.Color(hex), r = new Map();
      for (const [k, d] of Object.entries(RECIPES)) {
        const a = d.a === 'player' ? c.clone() : new THREE.Color(d.a);
        const b = d.b === 'player' ? c.clone() : new THREE.Color(d.b);
        r.set(a.lerp(b, d.t).getHex(), d.name);
      }
      return r;
    };
    // 輪郭線の殻（裏返しの黒い殻）と光る効果の板を外し、材質を色だけの標準の材質にする。殻があったメッシュには ow（太さ）を残す
    const clean = (root, { roles = null, dropAdditive = false } = {}) => {
      const drop = [];
      root.traverse((o) => {
        if (o.isMesh && (Array.isArray(o.material) ? o.material[0] : o.material)?.side === THREE.BackSide) {
          const key = (o.material.customProgramCacheKey?.() || '');
          const w = parseFloat(key.replace('outline', ''));
          if (o.parent && o.parent.isMesh) o.parent.userData.ow = Number.isFinite(w) ? w : 1;
        }
      });
      const cache = new Map();
      let n = 0;
      root.traverse((o) => {
        if (!o.isMesh) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!m || m.side === THREE.BackSide || o.userData.outline || /outline/i.test(o.name)) { drop.push(o); return; }
        if (dropAdditive && m.blending === THREE.AdditiveBlending) { drop.push(o); return; }
        const c = m.color ? m.color.clone() : new THREE.Color(1, 1, 1);
        const glow = !!(m.isMeshBasicMaterial && !m.map);
        let em = null;
        if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05) em = m.emissive.clone().multiplyScalar(m.emissiveIntensity ?? 1);
        // 色が 1 を超える光る部品は、最大の成分で割って倍率をノード名に残す（glTF の色は 0〜1）
        let gm = 1;
        const mx = Math.max(c.r, c.g, c.b);
        if (mx > 1) { gm = mx; c.multiplyScalar(1 / mx); }
        const role = !glow && roles ? roles.get(m.color.getHex()) : null;
        const name = glow ? 'glow' : (role || 'toon');
        const side = m.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide;
        const key = [name, c.getHexString(), em ? em.getHexString() : '', side, glow].join('|');
        if (!cache.has(key)) {
          const nm = new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0, emissive: glow ? c : (em || new THREE.Color(0)), side });
          nm.name = name;
          cache.set(key, nm);
        }
        o.material = cache.get(key);
        // 輪郭線の太さ（ow）・光る倍率（gm）は、Godot の取り込みが extras を渡さないので、ノード名に残す（ow85 = 0.85、gm160 = 1.6）
        if (!o.name) o.name = `m${n++}_` + (o.userData.ow ? `ow${Math.round(o.userData.ow * 100)}_` : '') + (gm !== 1 ? `gm${Math.round(gm * 100)}_` : '');
        o.userData = {};
      });
      for (const o of drop) o.parent?.remove(o);
      return root;
    };
    const exportOne = (obj, opt) => new Promise((res, rej) => ex.parse(clean(obj, opt), (r) => res(toB64(r)), rej, { binary: true }));
    const res = { files: {}, weapons: {}, armor: {}, info: {} };

    // ---- 人物 ----
    const pl = M.makePlayer(PLAYER);
    const u = pl.userData;
    pl.name = 'model';
    u.body.name = 'body'; u.head.name = 'head'; u.armL.name = 'armL'; u.armR.name = 'armR';
    u.elbowL.name = 'elbowL'; u.elbowR.name = 'elbowR'; u.hand.name = 'hand'; u.handL.name = 'handL';
    u.legs[0].name = 'leg0'; u.legs[1].name = 'leg1'; u.cape.name = 'cape'; u.hair.name = 'hair';
    u.baseGear.name = 'baseGear'; u.shoulders.name = 'shoulders'; u.ring.name = 'ring';
    // 循環する参照を持つ userData は書けないので空にする
    for (const o of [pl, u.armL, u.armR]) o.userData = {};
    res.files['player.glb'] = await exportOne(pl, { roles: roleColors(PLAYER) });
    res.info.recipes = { base: PLAYER, roles: RECIPES };

    // ---- 武器（大剣 形 0〜7・片手剣 形 0〜8 × 飾りの段階 0〜5）----
    // 段階 → レア度（visTier の逆。0→0, 1→2, 2→3, 3→4, 4→5, 5→7）
    const TIER_RARITY = [0, 2, 3, 4, 5, 7];
    const FORMS = { greatsword: 8, sword: 9 };
    const seen = new Map();
    for (const [kind, nForms] of Object.entries(FORMS)) {
      for (let form = 0; form < nForms; form++) {
        for (let tier = 0; tier < 6; tier++) {
          const g = M.makeWeapon(kind, TIER_RARITY[tier], form);
          g.name = 'weaponModel';
          const b64 = await exportOne(g);
          const h = [...new TextEncoder().encode(b64.slice(0, 4096) + b64.length)].reduce((a, c) => (a * 31 + c) >>> 0, 7).toString(16);
          if (!seen.has(b64)) seen.set(b64, `${kind}_f${form}_${h}.glb`);
          res.weapons[`${kind}:${form}:${tier}`] = seen.get(b64);
          res.files['weapons/' + seen.get(b64)] = b64;
        }
      }
    }

    // ---- 盾（kite）と握り手 ----
    for (let tier = 0; tier < 6; tier++) {
      const m = M.makePlayer(PLAYER);
      M.setPlayerWeapon(m, 'spear', TIER_RARITY[tier], 0);
      const s = m.userData.shield;
      s.removeFromParent(); s.position.set(0, 0, 0); s.rotation.set(0, 0, 0); s.name = 'shield'; s.userData = {};
      res.files[`shield_kite_t${tier}.glb`] = await exportOne(s, { dropAdditive: true });
    }
    {
      const hnd = GH.makeSwordHand(); hnd.name = 'gripHand';
      res.files['grip_hand.glb'] = await exportOne(hnd);
    }

    // ---- 防具の見た目 1〜6 ----
    for (let look = 1; look <= 6; look++) {
      const m = M.makePlayer(PLAYER);
      M.setPlayerArmor(m, look);
      const root = new THREE.Group(); root.name = 'armor';
      for (const [parent, g] of m.userData.armor) {
        g.removeFromParent();
        g.name = parent === m.userData.body ? 'onBody' : 'onHead';
        g.userData = {};
        root.add(g);
      }
      const uu = m.userData;
      res.armor[look] = { name: M.ARMOR_LOOK_NAMES[look], hide: { baseGear: !uu.baseGear.visible, shoulders: !uu.shoulders.visible, hair: !uu.hair.visible, cape: !uu.cape.visible } };
      res.files[`armor_look${look}.glb`] = await exportOne(root, { roles: roleColors(PLAYER) });
    }

    // ---- 敵（--mobs）----
    if (withMobs) {
      const F = D.FLOORS[0];
      for (const m of [...F.mobs, ...(F.elites || [])]) if (!res.files['mob_' + m.t + '.glb']) res.files['mob_' + m.t + '.glb'] = await exportOne(M.makeMob(m.t, m.color, 1));
      if (F.boss) res.files['boss_' + F.boss.t + '.glb'] = await exportOne(M.makeMob(F.boss.t, F.boss.color, 1, F.boss.accent, true, F.boss.appearance));
    }
    return res;
  }, withMobs);

  // 前の書き出しの武器ファイル（名前にハッシュが入るので、残ると古い物が混ざる）を消す
  for (const f of fs.readdirSync(WOUT)) if (/\.glb(\.import)?$/.test(f)) fs.rmSync(new URL(f, WOUT));
  const rows = [];
  for (const [k, b64] of Object.entries(out.files)) {
    const buf = Buffer.from(b64, 'base64');
    fs.writeFileSync(new URL(k, OUT), buf);
    rows.push([k, buf.length]);
  }
  fs.writeFileSync(new URL('weapons/index.json', OUT), JSON.stringify(out.weapons, null, 1) + '\n');
  fs.writeFileSync(new URL('armor_looks.json', OUT), JSON.stringify(out.armor, null, 1) + '\n');
  fs.writeFileSync(new URL('player_color.json', OUT), JSON.stringify(out.info.recipes, null, 1) + '\n');
  const wfiles = rows.filter(([k]) => k.startsWith('weapons/'));
  const other = rows.filter(([k]) => !k.startsWith('weapons/'));
  for (const [k, n] of other) console.log(k.padEnd(28), (n / 1024).toFixed(0).padStart(6), 'KB');
  const gs = new Set(Object.entries(out.weapons).filter(([k]) => k.startsWith('greatsword')).map(([, v]) => v));
  const sw = new Set(Object.entries(out.weapons).filter(([k]) => k.startsWith('sword')).map(([, v]) => v));
  console.log(`weapons/ ${wfiles.length} ファイル ${(wfiles.reduce((a, [, n]) => a + n, 0) / 1024).toFixed(0)} KB（大剣 8 形×6 段階=48 組 → ${gs.size} ファイル、片手剣 9 形×6 段階=54 組 → ${sw.size} ファイル）`);
  for (const [k, n] of wfiles) console.log('  ' + k.padEnd(34), (n / 1024).toFixed(1).padStart(6), 'KB');
  console.log('armor_looks.json / player_color.json / weapons/index.json を書いた');
} finally { await browser.close(); srv.close(); }
