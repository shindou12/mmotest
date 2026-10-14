import * as THREE from 'three';
import { FLOORS, RARITIES, WEAPONS } from '../../shared/data.js';
import { makeMob, makePlayer, setPlayerArmor, setPlayerWeapon } from '../models.js';
import { now } from './util.js';
import { audio, fx, scene } from './render.js';
import { me, mobs, others, world } from './state.js';
import { S } from './stats.js';
import { heightAt } from './area.js';
import { addShake } from './combat.js';
import { tf } from './variants.js';
import { fxArrow, heal } from './actions.js';
import { makeMobLabel } from './labels.js';
import { fxCall } from './weapon-fx.js';

// ======================================================================
// スナップショット適用
// ======================================================================
export function onSnap(m) {
  if (m.ar !== world.area) return;
  world.bossState = m.bs;
  world.door = !!m.door;
  world.plates = m.pl || [];
  const seenP = new Set();
  for (const p of m.p) {
    const [id, name, x, z, a, hp, mhp, lv, color, wk, wr, sw, sk, dead, dg, gd, wst, arm, rc, pm = '', pt = 0, rv = -1, cl = 0] = p;
    if (id === me.id) { if (me.crawl && rv >= 0) me.rv = rv; continue; }
    seenP.add(id);
    let o = others.get(id);
    if (!o) {
      o = { id, model: makePlayer(color), x, z, a, swingT: 9, combo: 0, sw, sk, spinT: -1, walkT: 0 };
      scene.add(o.model);
      others.set(id, o);
    }
    Object.assign(o, { tx: x, tz: z, ta: a, hp, mhp, lv, name, dead, dg, wk, wr, gd, rc: rc | 0, motion: pm, motionT: pt, rv, cl: cl | 0 });
    setPlayerWeapon(o.model, wk, wr, wst | 0);
    setPlayerArmor(o.model, arm | 0);
    if (sw !== o.sw) {
      o.sw = sw; o.swingT = 0; o.combo++;
      const W = WEAPONS[wk];
      if (W.ranged) fxArrow(o.x, o.z, o.a, RARITIES[wr].color);
      else fx.slash(o.x, o.z, o.a, W.range, W.arc, RARITIES[wr].color, 1.0, o.combo % 2 === 1);
    }
    if (sk !== o.sk) { o.sk = sk; o.spinT = 0; fx.ringWave(o.x, o.z, 0x9ad8ff, 5); fx.parts.burst(o.x, 1, o.z, 30, { color: 0x9ad8ff, speed: 6 }); }
  }
  for (const id of [...others.keys()]) if (!seenP.has(id)) removeOther(id);

  const seenM = new Set();
  const fdef = FLOORS[world.floor - 1];
  for (const r of m.m) {
    const [id, d, x, z, a, hp, mhp, lv, st, kind, enr, elite, target, hateT, stunPct, stunT] = r;
    seenM.add(id);
    let mb = mobs.get(id);
    if (!mb) {
      let model, name, rad;
      if (kind === 2) {
        const b = fdef.boss;
        model = makeMob(b.t, b.color, b.scale, b.accent, true);
        name = b.name; rad = 0.9 * b.scale;
      } else {
        const md = fdef.mobs[d];
        // elite: 1 精鋭 / 2 門番 / 3 ネームド（秘境の主）
        const sc = kind === 1 ? 0.8 : elite === 3 ? 1.9 : elite ? 1.3 : 1;
        model = makeMob(md.t, md.color, sc, elite === 3 ? 0xff60d0 : elite ? 0xffb030 : null);
        name = elite === 3 ? `★ ${world.def.named?.name || md.name}` : elite === 2 ? '門番' : (elite ? '精鋭 ' : '') + md.name;
        rad = 0.75 * sc;
      }
      mb = { id, model, name, rad, kind, elite, x, z, a, hp, mhp, lv, st, flash: 0, label: null, localT: 0, poisonUntil: 0, poisonT: 0 };
      if (kind !== 2) mb.label = makeMobLabel(mb);
      model.position.set(x, heightAt(x, z), z);
      scene.add(model);
      mobs.set(id, mb);
      if (kind === 2) {
        fx.parts.burst(x, 2, z, 120, { color: fdef.boss.accent, size: 1, speed: 14, life: 1.2 });
        fx.ringWave(x, z, fdef.boss.accent, 14, 0.8);
        fx.flash(x, 4, z, fdef.boss.accent, 80, 0.6, 30);
      }
    }
    Object.assign(mb, { tx: x, tz: z, ta: a, mhp, lv, st, enraged: !!enr, target, hateT, stunPct, stunT });
    // ローカル予測ダメージを少しの間優先
    if (now() - mb.localT > 0.4) mb.hp = hp; else mb.hp = Math.min(mb.hp, hp);
  }
  for (const id of [...mobs.keys()]) if (!seenM.has(id)) removeMob(id);
}

export function removeMob(id) {
  const mb = mobs.get(id);
  if (!mb) return;
  if (mb.label) mb.label.material.map.dispose();
  fx.dispose(mb.model);
  mobs.delete(id);
}
export function removeOther(id) {
  const o = others.get(id);
  if (!o) return;
  fx.dispose(o.model);
  reviveRing(o, 0, 0, -1);
  others.delete(id);
}

// 這いずりのゲージ: 倒れている人の足元の円。円1周が最大（最近倒れた回数が多いほど長い）
export const RING = [1.35, 1.75];
export function reviveRing(h, x, z, rv) {
  if (!(rv >= 0)) {
    if (h.revRing) { fx.dispose(h.revRing.g); h.revRing = null; }
    return;
  }
  let R = h.revRing;
  if (!R) {
    const mat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.RingGeometry(RING[0] - 0.08, RING[1] + 0.08, 64), mat(0x101820, 0.6));
    const fg = new THREE.Mesh(new THREE.RingGeometry(RING[0], RING[1], 4), mat(0xffd84a, 0.95));
    bg.renderOrder = 20; fg.renderOrder = 21;
    g.add(bg, fg);
    g.rotation.x = -Math.PI / 2;
    scene.add(g);
    R = h.revRing = { g, fg, v: -1, shown: rv, t: now() };
  }
  // サーバーの値に向かってなめらかに追いかける（減るときも戻るときも）
  const t = now();
  R.shown += (rv - R.shown) * Math.min(1, (t - R.t) * 12);
  R.t = t;
  if (Math.abs(R.v - R.shown) > 0.002) {
    R.v = R.shown;
    R.fg.geometry.dispose();
    R.fg.geometry = new THREE.RingGeometry(RING[0], RING[1], Math.max(4, Math.ceil(R.v * 64)), 1, Math.PI / 2, Math.max(0.01, R.v) * Math.PI * 2);
  }
  R.g.position.set(x, heightAt(x, z) + 0.08, z);
  R.fg.material.opacity = 0.75 + 0.25 * Math.sin(t * 6);
}

export function onMobDie(m) {
  const mb = mobs.get(m.id);
  // 称号「血の渇き」: 自分がとどめを刺した（直前に当てた）敵ならHP回復
  fxCall('onKill', mb); // ブレイブハートA「猛り」 など
  if (mb && tf('t_blood') && now() - mb.localT < 1.2 && S) { heal(S.mhp * 0.06, true); fx.parts.burst(me.x, 1, me.z, 14, { color: 0xff4a5a, speed: 3, size: 0.4, life: 0.5 }); }
  const fdef = FLOORS[world.floor - 1];
  const col = mb ? (m.boss ? fdef.boss.accent : fdef.mobs[0].color) : 0xffffff;
  // ポリゴン片が砕け散る演出
  fx.parts.burst(m.x, 1.2, m.z, m.boss ? 300 : 40, { color: 0x9ad8ff, size: m.boss ? 0.9 : 0.45, speed: m.boss ? 16 : 7, life: m.boss ? 2 : 0.9, gravity: -3 });
  fx.parts.burst(m.x, 1.2, m.z, m.boss ? 100 : 15, { color: col, size: 0.6, speed: 5, life: 1 });
  fx.flash(m.x, 2, m.z, 0x9ad8ff, m.boss ? 100 : 20, 0.4);
  audio.sfx('mobdie');
  if (m.boss) { addShake(1.5); audio.sfx('impact'); }
  removeMob(m.id);
}
