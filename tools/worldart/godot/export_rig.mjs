// 人物の骨組みと動きの表を Godot へ渡す（G2-1）。
//   node tools/worldart/godot/export_rig.mjs
// 書くもの（godot/worldart/data/）:
//   rig.json           makePlayer の部品（名前・親・休みの位置/回転(オイラー XYZ)/拡大）と、setPlayerWeapon で
//                      武器 6 種 × 形 0〜3 を付けたときの武器・盾の取り付け、animatePlayer が読む武器の値（握る位置など）
//   motions.json       動きの表（styles.js の BASE/STYLES/KEYFRAMES/FULL_TURN、TREE_MOTIONS+TECHNIQUES、MOTION_DURATIONS、SPEAR_TIMINGS）
//   poses_golden.json  test/golden/pose-trace.mjs と同じ入力の、ハッシュにする前の sample の値と、その入力の状態
// 自己確認: 書く前の生の値を pose-trace.mjs と同じ方法でハッシュにし、test/fixtures/golden-poses.json と全キーを比べる。違えば書かずに止まる。
// 数値の表は手で写さず、元の JS の値をそのまま JSON にする。
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { makePlayer, setPlayerWeapon, animatePlayer } from '../../../public/js/models.js';
import { MOTION_DURATIONS } from '../../../public/shared/motion-catalog.js';
import { TREE_MOTIONS } from '../../../public/shared/tree-motions.js';
import { TECHNIQUES } from '../../../public/shared/techniques.js';
import { SPEAR_TIMINGS } from '../../../public/shared/skill-timings.js';
import { WEAPONS } from '../../../public/shared/data.js';
import { BASE, STYLES, DEFAULT_STYLE, KEYFRAMES, FULL_TURN } from '../../../public/js/motions/styles.js';
import { GRIP_Y } from '../../../public/js/weapon-pose.js';

const OUT = new URL('../../../godot/worldart/data/', import.meta.url);
const FIX = new URL('../../../test/fixtures/golden-poses.json', import.meta.url);

// ---- pose-trace.mjs と同じ記録（式は元と同じ。違いは、ハッシュにする前の値と入力の状態も残すこと） ----
const KINDS = ['sword', 'greatsword', 'spear', 'dagger', 'axe', 'bow'];
const base = { t: 1, moving: false, walkT: 0, combo: 0, swing: -1, spin: -1, sweep: -1, dodge: 0, down: 0, hurt: 0 };
const r = (n) => Math.round(n * 1e8) / 1e8;
function sample(model) {
  model.updateMatrixWorld(true);
  const u = model.userData, v = [model.visible];
  for (const o of [u.body, u.head, u.armL, u.armR, u.elbowL, u.elbowR, u.hand, u.handL, ...u.legs, u.cape, u.weapon, u.weaponModel, u.shield]) {
    if (!o) { v.push(null); continue; }
    v.push(o.visible, ...o.matrixWorld.elements.map(r));
  }
  return v;
}
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);

function traces() {
  const cases = {};
  const motionKind = {};
  for (const m of Object.values(TREE_MOTIONS)) motionKind[m.id] = m.kind;
  for (const t of Object.values(TECHNIQUES)) motionKind[t.id] = t.kind;
  for (const [id, dur] of Object.entries(MOTION_DURATIONS)) {
    const kinds = motionKind[id] ? [motionKind[id]] : KINDS;
    for (const kind of kinds) {
      const model = makePlayer('#448a9b'); setPlayerWeapon(model, kind, 4, 1);
      const states = [], expect = [];
      for (let i = 0; i <= 12; i++) {
        const s = { ...base, kind, motion: id, motionT: dur * i / 12 };
        animatePlayer(model, s); states.push(s); expect.push(sample(model));
      }
      cases[`motion/${id}/${kind}`] = { kind, rarity: 4, style: 1, states, expect };
    }
  }
  const states = [
    ...[0, 0.1, 0.25, 0.5, 0.9].flatMap((swing) => [0, 1, 2].map((combo) => ({ swing, combo }))),
    ...[0.1, 0.5, 1].map((charge) => ({ charging: true, charge, swing: 0.02 })),
    { guard: true, gg: 1 }, { guard: true, gg: 0.5 }, { guard: true, gg: 0.1 },
    { dodge: 0.2 }, { dodge: 0.7 }, { hurt: 0.4 }, { hurt: 1 }, { down: 0.5 }, { down: 1 },
    { moving: true, walkT: 0.3 }, { moving: true, walkT: 1.1 }, { spin: 0.4 }, { sweep: 2 },
    { shieldBack: true }, { shieldBack: true, swing: 0.3 }, { shieldBack: true, guard: true }, {},
  ];
  for (const kind of KINDS) for (let style = 0; style < 4; style++) {
    const model = makePlayer('#448a9b'); setPlayerWeapon(model, kind, 4, style);
    const full = [], expect = [];
    for (const s0 of states) { const s = { ...base, kind, ...s0 }; animatePlayer(model, s); full.push(s); expect.push(sample(model)); }
    cases[`basic/${kind}/${style}`] = { kind, rarity: 4, style, states: full, expect };
  }
  return cases;
}

// ---- 自己確認 ----
const cases = traces();
const g = JSON.parse(fs.readFileSync(FIX, 'utf8'));
const got = Object.fromEntries(Object.entries(cases).map(([k, c]) => [k, hash(c.expect)]));
const bad = Object.keys(g).filter((k) => got[k] !== g[k]);
const extra = Object.keys(got).filter((k) => !(k in g));
if (bad.length || extra.length) {
  console.error(`自己確認 NG: 不一致 ${bad.length} 件 ${bad.slice(0, 3).join(', ')} / 余分 ${extra.length} 件`);
  process.exit(1);
}
console.log(`自己確認 OK: ${Object.keys(got).length} キー全部がハッシュ一致（golden-poses.json は ${Object.keys(g).length} キー）`);

// ---- rig.json ----
const NODES = (u) => [['body', u.body], ['head', u.head], ['armL', u.armL], ['armR', u.armR], ['elbowL', u.elbowL], ['elbowR', u.elbowR],
  ['hand', u.hand], ['handL', u.handL], ['leg0', u.legs[0]], ['leg1', u.legs[1]], ['cape', u.cape], ['weapon', u.weapon], ['weaponModel', u.weaponModel], ['shield', u.shield]].filter(([, o]) => o);
function part(u, root, o) {
  if (o.rotation.order !== 'XYZ') throw new Error('回転順が XYZ ではない');
  const hit = NODES(u).find(([, x]) => x === o.parent);
  const parent = o.parent === root ? 'model' : hit && hit[0];
  if (!parent) throw new Error('親が名前表にない');
  return { parent, pos: o.position.toArray(), rot: [o.rotation.x, o.rotation.y, o.rotation.z], scl: o.scale.toArray() };
}
const rig = { rotation_order: 'XYZ', parts: {}, weapons: {} };
{
  const model = makePlayer('#448a9b');
  const u = model.userData;
  for (const [n, o] of NODES(u)) rig.parts[n] = part(u, model, o);
}
for (const kind of KINDS) {
  const W = WEAPONS[kind];
  const entry = { grip: GRIP_Y[kind], twoHanded: !!W.twoHanded, edgeForward: !!W.edgeForward, offHand: !!W.offHand, shieldShape: W.shield ?? null, styles: [] };
  for (let style = 0; style < 4; style++) {
    const model = makePlayer('#448a9b'); setPlayerWeapon(model, kind, 4, style);
    const u = model.userData;
    // setPlayerWeapon の最後の animatePlayer で向きが変わる前の、付けた直後の値にする
    // （武器の握り: new Group の回転 0 / 盾: makeShield の rotation.set(0, -π/2 + 0.25, 0)。位置は animatePlayer が変えない）
    const weapon = part(u, model, u.weapon), shield = u.shield ? part(u, model, u.shield) : null;
    weapon.rot = [0, 0, 0];
    if (shield) shield.rot = [0, -Math.PI / 2 + 0.25, 0];
    // bowSx: 弓の弦の x（applyBowPose が引き手の位置に使う。弓の形ごとに違う）
    entry.styles.push({ weapon, weaponModel: part(u, model, u.weaponModel), shield, bowSx: u.weaponModel.userData.bow?.sx ?? null });
  }
  rig.weapons[kind] = entry;
}

// ---- motions.json（表はそのまま） ----
const motions = {
  base: BASE, styles: STYLES, defaultStyle: DEFAULT_STYLE, keyframes: KEYFRAMES, fullTurn: [...FULL_TURN],
  motions: { ...TECHNIQUES, ...TREE_MOTIONS }, durations: MOTION_DURATIONS, spearTimings: SPEAR_TIMINGS,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(new URL('rig.json', OUT), JSON.stringify(rig));
fs.writeFileSync(new URL('motions.json', OUT), JSON.stringify(motions));
fs.writeFileSync(new URL('poses_golden.json', OUT), JSON.stringify({ round: 1e-8, cases }));
const nm = Object.keys(cases).filter((k) => k.startsWith('motion/')).length;
console.log(`書いた: rig.json（部品 ${Object.keys(rig.parts).length}・武器 ${Object.keys(rig.weapons).length} 種×4形）、motions.json（動き ${Object.keys(motions.motions).length}）、poses_golden.json（basic ${Object.keys(cases).length - nm} 件・motion ${nm} 件）`);
