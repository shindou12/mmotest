// 姿勢の記録: 全モーション（武器ツリー・技・強攻撃など）と、武器ごとの通常攻撃・溜め・ガード・回避・被弾・竜騎士の盾を、
// 時間ごとの骨と武器の位置で書き留める（既存の motion-parity に足りない分）
import { createHash } from 'node:crypto';
import { makePlayer, setPlayerWeapon, animatePlayer } from '../../public/js/models.js';
import { MOTION_DURATIONS } from '../../public/shared/motion-catalog.js';
import { TREE_MOTIONS } from '../../public/shared/tree-motions.js';
import { TECHNIQUES } from '../../public/shared/techniques.js';

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

export function poseTraces() {
  const out = {};
  const motionKind = {};
  for (const m of Object.values(TREE_MOTIONS)) motionKind[m.id] = m.kind;
  for (const t of Object.values(TECHNIQUES)) motionKind[t.id] = t.kind;
  // すべてのモーション名（サーバーが受け付ける一覧）を、その武器で（武器が決まらないものは全武器で）
  for (const [id, dur] of Object.entries(MOTION_DURATIONS)) {
    const kinds = motionKind[id] ? [motionKind[id]] : KINDS;
    for (const kind of kinds) {
      const model = makePlayer('#448a9b'); setPlayerWeapon(model, kind, 4, 1);
      const vals = [];
      for (let i = 0; i <= 12; i++) { animatePlayer(model, { ...base, kind, motion: id, motionT: dur * i / 12 }); vals.push(sample(model)); }
      out[`motion/${id}/${kind}`] = hash(vals);
    }
  }
  // 武器ごとの基本の動き（形 0〜3）
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
    const vals = states.map((s) => { animatePlayer(model, { ...base, kind, ...s }); return sample(model); });
    out[`basic/${kind}/${style}`] = hash(vals);
  }
  return out;
}
