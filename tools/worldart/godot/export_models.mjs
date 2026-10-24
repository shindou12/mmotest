// ゲームの人物・武器・盾・防具・敵のモデル（public/js/models.js がコードで組み立てる three.js の形）を glTF に書き出す（L27 CP6 / G2-2）。
//   node tools/worldart/godot/export_models.mjs            人物・武器・盾・防具・握り手を書く（敵は --mobs を付けたときだけ）
//   node tools/worldart/godot/export_models.mjs --only-mobs 敵 11 形だけを書き、ほかの生成物には触れない
//   → godot/worldart/data/models/ 以下
//       player.glb                     人物。部品に rig.json と同じ名前（body head armL armR elbowL elbowR hand handL leg0 leg1 cape）
//                                      プレイヤーごとの色の材質は名前が player_color*（色の作り方は player_color.json）
//       weapons/<武器>_f<形>_<ハッシュ>.glb + weapons/index.json   大剣 形 0〜7・片手剣 形 0〜8・槍 短剣 斧 弓（形 0〜3）を飾りの段階 0〜5 ごとに
//       weapons/bow_parts.json（弓の弦の先端・sx・色）+ bow_arrow.glb（矢）  weapons/styles.json（固有武器の形・防具の見た目の表。weaponStyle / armorLook 用）
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
const mobsOnly = process.argv.includes('--only-mobs');
const withMobs = mobsOnly || process.argv.includes('--mobs');
const { chromium } = await loadPlaywright();
const srv = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(srv.url + '/index.html?solo&low');
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  const out = await page.evaluate(async ({ withMobs, mobsOnly }) => {
    const THREE = await import('three');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const M = await import('/js/models.js');
    const D = await import('/shared/data.js');
    const GH = await import('/js/models/grip-hands.js');
    const WM = await import('/js/models/weapon-models.js');
    const WA = await import('/shared/weapon-appearances.js');
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
      root.traverse((o) => { if (o.isLine) drop.push(o); });   // 弓の弦（THREE.Line）。Godot 側で線を作る
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
        const role = roles ? (roles.get(m.color.getHex()) ?? roles.get(colorKey(m.color))) : null;
        const materialRole = typeof role === 'string' ? role : null;
        const nodeRole = role && typeof role === 'object' ? role.node : null;
        const name = glow ? 'glow' : (materialRole || 'toon');
        const side = m.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide;
        const key = [name, c.getHexString(), em ? em.getHexString() : '', side, glow].join('|');
        if (!cache.has(key)) {
          const nm = new THREE.MeshStandardMaterial({ color: c, opacity: m.transparent ? m.opacity : 1, transparent: !!m.transparent,
            roughness: 1, metalness: 0, emissive: glow ? c : (em || new THREE.Color(0)), side });
          nm.name = name;
          cache.set(key, nm);
        }
        o.material = cache.get(key);
        // 輪郭線の太さ（ow）・光る倍率（gm）は、Godot の取り込みが extras を渡さないので、ノード名に残す（ow85 = 0.85、gm160 = 1.6）
        const tags = (o.userData.ow ? `ow${Math.round(o.userData.ow * 100)}_` : '') + (gm !== 1 ? `gm${Math.round(gm * 100)}_` : '');
        if (nodeRole) o.name = `${nodeRole}__m${n++}_${tags}`;
        else if (!o.name) o.name = `m${n++}_${tags}`;
        o.userData = {};
      });
      for (const o of drop) o.parent?.remove(o);
      return root;
    };
    const exportOne = (obj, opt) => new Promise((res, rej) => ex.parse(clean(obj, opt), (r) => res(toB64(r)), rej, { binary: true }));
    const res = { files: {}, weapons: {}, armor: {}, info: {} };

    const colorKey = (c) => [c.r, c.g, c.b].map((v) => v.toFixed(6)).join(',');
    const mobRoleColors = (bodyHex, accentHex) => {
      const c = new THREE.Color(bodyHex), ac = new THREE.Color(accentHex ?? 0xff4030);
      const roles = new Map();
      const add = (color, node) => roles.set(colorKey(color), { node });
      add(c, 'mob_body');
      add(c.clone().multiplyScalar(0.5), 'mob_body_dark50');
      add(c.clone().multiplyScalar(0.55), 'mob_body_dark55');
      add(c.clone().multiplyScalar(0.6), 'mob_body_dark60');
      add(c.clone().lerp(new THREE.Color(0xffffff), 0.35), 'mob_body_light35');
      add(c.clone().multiplyScalar(1.5), 'mob_body_glow');
      add(ac, 'mob_accent');
      for (const scale of [1.3, 1.4, 1.5, 1.6]) add(ac.clone().multiplyScalar(scale), 'mob_accent_glow');
      return roles;
    };
    const asHex = (value) => Number(value).toString(16).padStart(6, '0').slice(-6);
    const seededMob = (t, make) => {
      const originalRandom = Math.random;
      let seed = [...t].reduce((n, ch) => (Math.imul(n ^ ch.charCodeAt(0), 16777619) >>> 0), 2166136261);
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000);
      try { return make(); } finally { Math.random = originalRandom; }
    };
    const exportMobs = async () => {
      const { MOB_MODELS } = await import('/js/models/mob-models.js');
      const examples = new Map();
      const palettes = new Map();
      const addExample = (mob, source) => {
        if (!examples.has(mob.t)) examples.set(mob.t, { ...mob, source });
        if (mob.accent != null) {
          const rows = palettes.get(mob.t) || [];
          const key = `${mob.color}:${mob.accent}`;
          if (!rows.some((row) => row.key === key)) rows.push({ key, color: mob.color, accent: mob.accent });
          palettes.set(mob.t, rows);
        }
      };
      D.FLOORS.forEach((floor, i) => {
        for (const [kind, rows] of [['mobs', floor.mobs || []], ['elites', floor.elites || []], ['boss.minions', floor.boss?.minions || []]]) {
          for (const mob of rows) addExample(mob, `FLOORS[${i}].${kind}`);
        }
        if (floor.boss) addExample(floor.boss, `FLOORS[${i}].boss`);
      });
      addExample(D.TREASURE_DEF, 'TREASURE_DEF');
      res.info.mobs = {};
      for (const t of Object.keys(MOB_MODELS)) {
        const mob = examples.get(t);
        if (!mob) throw new Error(`敵の色が見つからない: ${t}`);
        const accent = mob.accent ?? null;
        const model = seededMob(t, () => M.makeMob(t, mob.color, 1, accent));
        for (const row of palettes.get(t) || []) {
          const marker = new THREE.Group();
          marker.name = `mob_palette_${asHex(row.color)}_${asHex(row.accent)}`;
          const payload = new THREE.Mesh(
            new THREE.BoxGeometry(0.001, 0.001, 0.001),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
          );
          payload.name = 'mob_palette_marker';
          marker.add(payload);
          model.add(marker);
        }
        res.files[`mob_${t}.glb`] = await exportOne(model, { roles: mobRoleColors(mob.color, accent) });
        res.info.mobs[t] = { color: '#' + asHex(mob.color), accent: accent == null ? null : '#' + asHex(accent), source: mob.source };
      }
    };

    if (mobsOnly) {
      await exportMobs();
      return { files: res.files, info: res.info };
    }

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
    // 他の武器（槍・短剣・斧・弓）の形は、登録表 WEAPON_MODELS の styles の鍵（0 は基本の形）。3 は伝説・神器の専用形
    const FORMS = { greatsword: 8, sword: 9 };
    for (const kind of ['spear', 'dagger', 'axe', 'bow']) FORMS[kind] = 1 + Object.keys(WM.WEAPON_MODELS[kind].styles || {}).filter((k) => +k > 0).length;
    res.info.forms = FORMS;
    res.bow = {};
    const seen = new Map();
    for (const [kind, nForms] of Object.entries(FORMS)) {
      for (let form = 0; form < nForms; form++) {
        for (let tier = 0; tier < 6; tier++) {
          const g = M.makeWeapon(kind, TIER_RARITY[tier], form);
          g.name = 'weaponModel';
          const bw = g.userData.bow;
          if (bw) {
            // 弦と矢（bowString）: 弦は 3 点の折れ線（先端・sx・先端）。引くと中央の点が sx - 引き分 に動く。矢は 1 本（bow_arrow.glb）を別に書く
            res.bow[`${kind}:${form}:${tier}`] = { tip: bw.tip, sx: bw.sx, color: '#' + bw.string.material.color.getHexString() };
            if (!res.files['bow_arrow.glb']) {
              const a = bw.arrow; a.removeFromParent(); a.visible = true; a.position.set(0, 0, 0); a.name = 'bowArrow'; a.userData = {};
              res.files['bow_arrow.glb'] = await exportOne(a);
            } else bw.arrow.removeFromParent();
            g.userData = {};   // bow は Line を持つ（書けない）。ほかの武器の userData は今までどおり
          }
          const b64 = await exportOne(g);
          const h = [...new TextEncoder().encode(b64.slice(0, 4096) + b64.length)].reduce((a, c) => (a * 31 + c) >>> 0, 7).toString(16);
          if (!seen.has(b64)) seen.set(b64, `${kind}_f${form}_${h}.glb`);
          res.weapons[`${kind}:${form}:${tier}`] = seen.get(b64);
          res.files['weapons/' + seen.get(b64)] = b64;
        }
      }
    }

    // ---- 装備 → 見た目の選び方の表（Godot の weaponStyle / armorLook が読む。表は JS から作る）----
    {
      const uniq = {};
      for (const [k, tbl] of [['sword', WA.SWORD_UNIQUE_STYLES], ['greatsword', WA.GREATSWORD_UNIQUE_STYLES]]) uniq[k] = { ...tbl };
      // armorLook(it) は cls × atype → 見た目。ARMOR_TYPES の全部と、未知の atype（cls ごと）を JS の関数で引く
      const armor = {};
      for (const cls of ['light', 'medium', 'heavy']) {
        armor[`${cls}:`] = M.armorLook({ slot: 'armor', armor: cls, atype: '?' });
        for (const t of D.ARMOR_TYPES) armor[`${cls}:${t.id}`] = M.armorLook({ slot: 'armor', armor: cls, atype: t.id });
      }
      armor[':'] = M.armorLook({ slot: 'armor', atype: '?' });
      for (const t of D.ARMOR_TYPES) armor[`:${t.id}`] = M.armorLook({ slot: 'armor', atype: t.id });
      res.info.styles = { unique: uniq, armor };
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
      await exportMobs();
      const F = D.FLOORS[0];
      if (F.boss) res.files['boss_' + F.boss.t + '.glb'] = await exportOne(M.makeMob(F.boss.t, F.boss.color, 1, F.boss.accent, true, F.boss.appearance));
    }
    return res;
  }, { withMobs, mobsOnly });

  if (mobsOnly) {
    const rows = [];
    for (const [k, b64] of Object.entries(out.files)) {
      if (!/^mob_[a-z]+\.glb$/.test(k)) throw new Error(`敵以外の生成物を拒否: ${k}`);
      const buf = Buffer.from(b64, 'base64');
      fs.writeFileSync(new URL(k, OUT), buf);
      rows.push([k, buf.length]);
    }
    for (const [k, n] of rows) console.log(k.padEnd(24), (n / 1024).toFixed(1).padStart(6), 'KB');
    console.log(`敵 ${rows.length} 形を書いた`);
    for (const [t, d] of Object.entries(out.info.mobs || {})) console.log(`  ${t}: ${d.color} ${d.accent || '(標準アクセント)'} ← ${d.source}`);
  } else {

  // 前の書き出しの武器ファイル（名前にハッシュが入るので、残ると古い物が混ざる）を消す
  for (const f of fs.readdirSync(WOUT)) if (/\.glb(\.import)?$/.test(f)) fs.rmSync(new URL(f, WOUT));
  const rows = [];
  for (const [k, b64] of Object.entries(out.files)) {
    const buf = Buffer.from(b64, 'base64');
    fs.writeFileSync(new URL(k, OUT), buf);
    rows.push([k, buf.length]);
  }
  fs.writeFileSync(new URL('weapons/index.json', OUT), JSON.stringify(out.weapons, null, 1) + '\n');
  fs.writeFileSync(new URL('weapons/bow_parts.json', OUT), JSON.stringify(out.bow, null, 1) + '\n');
  fs.writeFileSync(new URL('weapons/styles.json', OUT), JSON.stringify(out.info.styles, null, 1) + '\n');
  fs.writeFileSync(new URL('armor_looks.json', OUT), JSON.stringify(out.armor, null, 1) + '\n');
  fs.writeFileSync(new URL('player_color.json', OUT), JSON.stringify(out.info.recipes, null, 1) + '\n');
  const wfiles = rows.filter(([k]) => k.startsWith('weapons/'));
  const other = rows.filter(([k]) => !k.startsWith('weapons/'));
  for (const [k, n] of other) console.log(k.padEnd(28), (n / 1024).toFixed(0).padStart(6), 'KB');
  const per = (kind) => new Set(Object.entries(out.weapons).filter(([k]) => k.startsWith(kind + ':')).map(([, v]) => v));
  const cnt = (kind) => Object.keys(out.weapons).filter((k) => k.startsWith(kind + ':')).length;
  console.log(`weapons/ ${wfiles.length} ファイル ${(wfiles.reduce((a, [, n]) => a + n, 0) / 1024).toFixed(0)} KB`);
  for (const kind of Object.keys(out.info.forms)) console.log(`  ${kind}: ${out.info.forms[kind]} 形×6 段階=${cnt(kind)} 組 → ${per(kind).size} ファイル`);
  for (const [k, n] of wfiles) console.log('  ' + k.padEnd(34), (n / 1024).toFixed(1).padStart(6), 'KB');
  console.log('armor_looks.json / player_color.json / weapons/index.json / weapons/bow_parts.json / weapons/styles.json を書いた');
  }
} finally { await browser.close(); srv.close(); }
