// 弓の武器ツリーの効果（狙撃手・連射・罠師・遠見・弓引き など）と、弓の射程の特性。差し込み口は game/weapon-fx.js
import * as THREE from 'three';
import { now, rnd } from '../util.js';
import { floatText } from '../ui-bridge.js';
import { audio, fx } from '../render.js';
import { me, mobs, world } from '../state.js';
import { S } from '../stats.js';
import { heightAt } from '../area.js';
import { addShake, aimPoint, later } from '../combat.js';
import { quietBuff } from '../tree-effects.js';
import { combat } from '../actions.js';
import { registerWeaponFx } from '../weapon-fx.js';

// 最大まで引いた矢（狙撃手）が当たった / 外れた: 鷹の目・狙い澄まし
function bwSnipe(hit) {
  const W = S.wt;
  if (W?.ks2 === 'bw_hawk' && hit && now() - me.hawkT > 8) { me.hawkT = now(); me.iaiReady = true; fx.ringWave(me.x, me.z, 0xffd84a, 2, 0.3); }
  if (W?.ks2 === 'bw_aim') {
    me.aimN = hit ? Math.min(3, me.aimN + 1) : 0;
    me.buffs = me.buffs.filter((b) => b.id !== 'bw_aim');
    if (me.aimN > 0) me.buffs.push({ id: 'bw_aim', label: `狙い澄まし +${me.aimN * 10}%`, t: 1e9, max: 1e9, mods: {}, color: 0xffd84a });
  }
}
// 矢嵐: 狙った場所に矢の雨
function bwRain(p) {
  for (let i = 0; i < 5; i++) later(0.12 + i * 0.07, () => {
    const x = p.x + rnd(-1.6, 1.6), z = p.z + rnd(-1.6, 1.6);
    fx.parts.burst(x, 6, z, 6, { color: 0xbfe8ff, speed: 2, size: 0.35, life: 0.3, gravity: 40 });
    later(0.15, () => { combat.circle(x, z, 1.5, 0.5, { type: 'proc', noProc: true }); fx.ringWave(x, z, 0xbfe8ff, 1.6, 0.2); });
  });
}
// 罠（罠師の回避・置き矢）: 踏まれると発動。dodge: 罠師の罠（数に上限がある）
function bwTrap(x, z, o) {
  const g = new THREE.Group(), col = o.color ?? 0xffc860;
  const ring = new THREE.Mesh(new THREE.RingGeometry(o.r - 0.12, o.r, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 5), new THREE.MeshLambertMaterial({ color: 0xd8c8a8 }));
    const a = i / 6 * Math.PI * 2; sp.position.set(Math.sin(a) * o.r * 0.45, 0.15, Math.cos(a) * o.r * 0.45); g.add(sp);
  }
  g.position.set(x, heightAt(x, z), z);
  const t = { x, z, ...o, armAt: now() + (o.arm ?? 0.5), until: now() + o.life, area: world.area, mesh: g };
  fx.add(g, o.life + 0.2, (obj) => { ring.material.opacity = now() < t.armAt ? 0.2 : 0.4 + Math.sin(now() * 8) * 0.15; });
  if (o.dodge) {
    const mine = me.traps.filter((q) => q.dodge);
    if (mine.length >= (S.wt?.ks2 === 'bw_lure' ? 4 : 2)) bwTrapGone(mine[0]);
  }
  me.traps.push(t);
  fx.parts.burst(x, 0.3, z, 10, { color: col, speed: 2, size: 0.3, life: 0.3 });
  return t;
}
function bwTrapGone(t) {
  me.traps = me.traps.filter((q) => q !== t);
  const it = fx.items.find((q) => q.obj === t.mesh);
  if (it) it.life = 0;
}
function bwTrapTick() {
  for (const t of [...me.traps]) {
    if (t.area !== world.area || now() > t.until) { bwTrapGone(t); continue; }
    if (now() < t.armAt) continue;
    if (![...mobs.values()].some((mb) => mb.hp > 0 && Math.hypot(mb.x - t.x, mb.z - t.z) < t.r + mb.rad * 0.5)) continue;
    bwTrapGone(t);
    combat.circle(t.x, t.z, t.r, t.mult, { type: t.dodge ? 'proc' : 'tskill', tech: 'bow_trap', stun: t.stun, noProc: t.dodge });
    fx.parts.burst(t.x, 0.4, t.z, 30, { color: t.color ?? 0xffc860, speed: 6, size: 0.4, life: 0.4, up: 3 }); fx.ringWave(t.x, t.z, t.color ?? 0xffc860, t.r + 0.4, 0.3);
    audio.sfx('hit');
  }
}
// 射抜き: 罠を矢で撃ち抜いて大爆発
function bwBlast(t) {
  bwTrapGone(t);
  combat.circle(t.x, t.z, 3.5, 3.5, { type: 'proc', noProc: true, stun: 6 });
  fx.ringWave(t.x, t.z, 0xff9a4a, 4, 0.4); fx.flash(t.x, 1.2, t.z, 0xff9a4a, 50, 0.3);
  fx.parts.burst(t.x, 0.6, t.z, 50, { color: 0xffb060, speed: 9, size: 0.55, life: 0.5, up: 3 });
  floatText(t.x, 2.6, t.z, '射抜き!', 'just'); audio.sfx('impact'); addShake(0.35);
}

// スキルに渡す文脈に、罠を置く道具を足す（c.trap）
Object.assign(combat, { trap: (x, z, o) => bwTrap(x, z, o) });

registerWeaponFx('bow', {
  // 弓: 引かずに撃つ射程（張り弦 +4m）・最大射程（遠見の心得）・弓を引く速さ（速引き +30%）。最大射程まで引いたら最大の溜め
  stats(S, WT, W) {
    S.chargeMax = S.chargeMax * (WT?.br('bw_draw') === 'A' ? 0.8 : 1);
    S.iframeBonus = S.iframeBonus + (WT?.br('bw_roll') === 'B' ? 0.1 : 0);
    S.bowBase = S.bowBase + (WT?.br('bw_zone') === 'A' ? 4 : 0);
    S.bowMax = S.bowMax + (WT ? WT.v('bw_zone', 'rng') : 0);
    S.bowDraw = S.bowDraw * (WT?.br('bw_draw') === 'A' ? 1.3 : 1);
    if (W.ranged) S.chargeMax = Math.max(0.3, (S.bowMax - S.bowBase) / S.bowDraw); // 弓: 最大射程まで引いたら最大の溜め
  },
  treeReset() { me.aimN = 0; },
  // 急所射ち・鋭矢
  critAdd: (v, o) => v + (S.wt?.br('bw_crit') === 'A' && o.full ? 15 : 0) + (S.wt?.br('bw_quiver') === 'A' && o.type === 'tskill' && S.wk === 'bow' ? 15 : 0),
  // 狙い澄まし
  dmgMult: (k, W, o) => (W.ks2 === 'bw_aim' && o.snipe ? k * (1 + 0.1 * me.aimN) : k),
  stun: (st, o) => (S.wt?.br('bw_draw') === 'B' && o.type === 'heavy' ? st * 1.5 : st), // 重矢
  afterCast() { if (S.wt.br('bw_quiver') === 'B') quietBuff('bw_quiverB', '余勢', 2, { aspd: 25 }, 0x9affc8); },
  // 回避した（受け身引き・速射・罠師）
  onDodge() {
    const W = S.wt;
    if (!W) return;
    if (W.br('bw_roll') === 'A') quietBuff('bw_rollA', '受け身引き', 1.4, { chargeRate: 100 }, 0x9ae8ff);
    if (W.ks2 === 'bw_quick') quietBuff('bw_quick', '速射', 1.5 + 0.38, { aspd: 40 }, 0x9affc8);
    if (W.ks1 === 'bw_trapper' && now() - me.trapT >= 2) {
      me.trapT = now();
      const lure = W.ks2 === 'bw_lure';
      bwTrap(me.x, me.z, { mult: 2.0 * (lure ? 1.3 : 1), r: 1.8, stun: lure ? 15 : 3, life: 15, arm: 0.5, dodge: true });
    }
  },
  // 連射: 通常攻撃で2本ずつ（矢嵐: 5回ごとに矢の雨）
  shoot(a, mult) {
    if (S.wt?.ks1 !== 'bw_rapid') return false;
    for (const d of [-0.04, 0.04]) combat.arrow({ a: a + d, mult: mult * 0.75, type: 'normal' });
    if (S.wt.ks2 === 'bw_storm' && ++me.stormN % 5 === 0) bwRain(aimPoint());
    return true;
  },
  // 最大まで引いた矢: 反動と、射程いっぱいの輪
  heavyStart(lv) { if (S.wk === 'bow' && lv === 2) { me.motion = 'bw_full'; me.motionT = 0; fx.ringWave(me.x, me.z, 0xffd84a, S.bowMax, 0.35); } },
  iaiLabel: (label) => (S.wk === 'bow' ? '鷹の目' : label),
  // 射抜き: 自分の罠を矢で射抜くと大爆発
  arrowTick(w) {
    if (S.wt?.ks2 === 'bw_shot' && !w.trapShot) {
      const tr = me.traps.find((q) => q.dodge && Math.hypot(q.x - w.x, q.z - w.z) < 1.3);
      if (tr) { w.trapShot = true; bwBlast(tr); }
    }
  },
  // 遠矢: 射程の端（8割より先）で当たると +20%
  arrowEdge: (w, d) => S.wt?.br('bw_zone') === 'B' && d >= w.range * 0.8,
  arrowHit(w) { if (w.snipe && !w.snipeDone) { w.snipeDone = true; bwSnipe(true); } },
  arrowGone(w) { if (w.snipe && !w.snipeDone) bwSnipe(false); },
  aura() { bwTrapTick(); },
});
