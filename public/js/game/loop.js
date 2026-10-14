import { MOTION_DURATIONS } from '../../shared/motion-catalog.js';
import { REVIVE } from '../../shared/balance.js';
import * as THREE from 'three';
import { FLOORS, RARITIES, WEAPONS } from '../../shared/data.js';
import { AREAS, HAZARDS, collide, hazardsOf, insideOpen } from '../../shared/areas.js';
import { animateMob, animatePlayer } from '../models.js';
import { OCC } from '../toon.js';
import { angDiff, clamp, now, rnd } from './util.js';
import { floatText, toast, ui } from './ui-bridge.js';
import { char, saveChar, settings } from './save.js';
import { ambient, audio, camera, composer, fx, scene, sun, weatherParts } from './render.js';
import { CAM_ZOOM, CHARGE_MAX, CHARGE_MIN, cam, keys, me, mobs, npcs, others, pending, setStarted, started, tmpV, world } from './state.js';
import { S, bowRange, buffMod, hasBuff } from './stats.js';
import { GUARD, guardRegen, updateMouseWorld } from './input.js';
import { net } from './net-client.js';
import { env, heightAt, pinTick, waypointTick } from './area.js';
import { reviveRing } from './snapshot.js';
import { REACT, crawlTick, fall, getUp, hitStop, setHitStop, updateTeles } from './hurt.js';
import { aimAngle, aimPoint, autoTarget, dealDamage, setShake, shake, touch } from './combat.js';
import { setMom, wtAura, wtPoisonTick, wtToxMul } from './tree-effects.js';
import { desperate, tf, titleMove } from './variants.js';
import { canAct, doSwing, sweepAngle, sweepTick, updateBossProjs, updateProjs } from './actions.js';
import { chestOpen, exploreTick } from './progress.js';
import { lootWalk, updateCoins, updateDrops } from './loot.js';
import { updateMobLabels } from './labels.js';

// ======================================================================
// メインループ
// ======================================================================
export let lastT = now();
export let sendT = 0;
export let saveT = 0;
// ---- 弓の照準ガイド: 足元の射程の円（引くほど広がり、最大射程で止まる）と狙いの線 ----
export let bowGuide = null;
export function makeBowGuide() {
  const group = new THREE.Group();
  const flat = (geo, c, op) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, depthTest: false })); m.rotation.x = -Math.PI / 2; return m; };
  const disc = flat(new THREE.CircleGeometry(1, 96), 0x9affd8, 0.05); // 射程の内側（うっすら）
  const ring = flat(new THREE.RingGeometry(0.975, 1, 128), 0x9affd8, 0.6); // いまの射程
  const max = flat(new THREE.RingGeometry(0.99, 1, 128), 0xffffff, 0.2); // 最大射程（引いている間だけ）
  // 狙いの線（引いている間）
  const aim = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  aim.geometry.translate(0, 0.5, 0);
  aim.geometry.rotateX(Math.PI / 2); // +z 方向へ伸びる
  for (const m of [disc, ring, max, aim]) { m.renderOrder = 4; group.add(m); }
  return { group, disc, ring, max, aim };
}
export function updateBowGuide(t) {
  if (!bowGuide) return;
  const G = bowGuide;
  G.group.visible = !!S.W.ranged && !me.dead;
  if (!G.group.visible) return;
  const r = bowRange(), drawing = me.charging && me.chargeT >= CHARGE_MIN, full = drawing && r >= S.bowMax - 0.01;
  G.group.position.set(me.x, heightAt(me.x, me.z) + 0.1, me.z);
  G.disc.scale.set(r, r, 1); G.ring.scale.set(r, r, 1); G.max.scale.set(S.bowMax, S.bowMax, 1);
  G.ring.material.color.set(full ? 0xffd84a : drawing ? 0xffffff : 0x9affd8);
  G.ring.material.opacity = drawing ? 0.9 : 0.4;
  G.disc.material.color.set(full ? 0xffd84a : 0x9affd8);
  G.disc.material.opacity = drawing ? 0.07 + (full ? 0.04 * Math.sin(t * 10) : 0) : 0.03;
  G.max.visible = drawing && !full;
  G.aim.visible = drawing;
  if (G.aim.visible) {
    const k = clamp(me.chargeT / S.chargeMax, 0, 1);
    G.aim.rotation.y = aimAngle();
    G.aim.scale.set(1 + k, 1, r);
    G.aim.material.opacity = 0.35 + 0.4 * k + 0.15 * Math.sin(t * 20);
  }
}

// ---- スマホの狙い: 自動ターゲットの印と、ボタンを引っぱったときの狙い線 ----
export let touchGuide = null;
export function updateTouchAim(t) {
  if (!touch.on) { if (touchGuide) touchGuide.group.visible = false; return; }
  if (!touchGuide) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    line.geometry.translate(0, 0.5, 0); line.geometry.rotateX(Math.PI / 2);
    const spot = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.5, 40), new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    spot.rotation.x = -Math.PI / 2;
    for (const m of [ring, line, spot]) { m.renderOrder = 5; group.add(m); }
    scene.add(group);
    touchGuide = { group, ring, line, spot };
  }
  const G = touchGuide;
  G.group.visible = !me.dead;
  touch.target = touch.aim == null ? autoTarget() : null;
  const tg = touch.target;
  G.ring.visible = !!tg;
  if (tg) {
    const s = tg.rad * 1.6 + Math.sin(t * 6) * 0.08;
    G.ring.position.set(tg.x, heightAt(tg.x, tg.z) + 0.12, tg.z); G.ring.scale.set(s, s, 1);
  }
  G.line.visible = G.spot.visible = touch.aim != null;
  if (touch.aim != null) {
    const len = S.W.ranged ? WEAPONS.bow.range : Math.max(4, S.W.range + 2);
    G.line.position.set(me.x, heightAt(me.x, me.z) + 0.15, me.z);
    G.line.rotation.y = touch.aim; G.line.scale.set(1, 1, len);
    const p = aimPoint();
    G.spot.position.set(p.x, heightAt(p.x, p.z) + 0.15, p.z);
  }
}

// ---- ハザード / 宝箱 ----
export function hazardAt(x, z) {
  if (world.def.shape !== 'open' || tf('t_boss2')) return null; // 称号「霧を越えし者」は影響を受けない
  return hazardsOf(world.def).find((h) => Math.hypot(h.x - x, h.z - z) < h.r - 0.3) || null;
}

export function moveMe(dx, dz) {
  me.x += dx; me.z += dz;
  const c = collide(world.def, me.x, me.z, 0.45, world.door);
  me.x = c.x; me.z = c.z;
}

export function update(dt) {
  const t = now();
  if (me.motion) { me.motionT += dt;if (me.motionT > (MOTION_DURATIONS[me.motion] || 0)) me.motion = ''; }
  updateMouseWorld();
  // 遅延処理（スキルの多段ヒットなど）
  for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= t) { const p = pending.splice(i, 1)[0]; if (!me.dead && !me.crawl) p.fn(); }

  me.dodgeCd -= dt; me.wsCd -= dt; me.potCd -= dt; me.iframe -= dt; me.staggerT -= dt; me.hurtT -= dt;
  me.dStackT -= dt; if (me.dStackT <= 0) me.dStack = 0;
  const cdt = S?.wt?.br('sw_brave') === 'B' && hasBuff('sw_brave') ? dt / 0.7 : dt; // ブレイブハートB「速攻」
  me.wsCd -= cdt - dt;
  for (const k in me.tcd) me.tcd[k] -= cdt;
  for (const b of me.buffs) b.t -= dt;
  if (me.saintOn && !hasBuff('sw_saint')) { me.saintOn = false; setMom(0); } // 剣聖の全会心が終わったら勢いは0
  wtAura(dt);
  me.buffs = me.buffs.filter((b) => b.t > 0);
  // しばらく倒れずにいると、起こしにくさが1段階戻る
  if (me.downs > 0 && !me.crawl && t - me.downsAt > REVIVE.decay) { me.downs--; me.downsAt = t; }
  const safe =world.def.type === 'town' || world.def.type === 'camp';

  if (me.dead) {
    me.deadT = Math.max(0, me.deathAt - now());
    if (me.deadT <= 0) {
      // Reload into a fresh login; the lost character cannot respawn or be autosaved.
      setStarted(false);
      location.reload();
      return;
    }
  } else if (me.crawl) {
    crawlTick(dt);
  } else {
    // 移動
    let dx = 0, dz = 0;
    {
      if (keys.has('w') || keys.has('arrowup')) dz -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dz += 1;
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
    }
    // スマホのアナログスティック（倒した量で歩く速さが変わる）
    let analog = 1;
    const sl = Math.hypot(touch.stick.x, touch.stick.y);
    if (sl > 0.12) { dx = touch.stick.x; dz = touch.stick.y; analog = Math.min(1, sl * 1.15); }
    const l = Math.hypot(dx, dz);
    me.moving = false;
    // 押し戻し・吹き飛び（ほかの動きと重ねて流される）
    if (me.kbT > 0) {
      const k = Math.min(dt, me.kbT);
      me.kbT -= dt;
      moveMe(me.kbX * k, me.kbZ * k);
      if (me.downT > 0 && Math.random() < 0.6) fx.parts.emit(me.x, 0.3, me.z, { color: 0xd8c8a8, size: 0.4, life: 0.4, speed: 1, gravity: 1 });
    }
    if (me.downT > 0) {
      // ダウン中は動けない（回避で受け身）
      me.downT -= dt;
      if (me.downT <= 0) getUp();
    } else if (me.sweepT > 0) {
      // ガードカウンターの回転なぎ払い中は、その場から動かない
    } else if (me.dodgeT > 0) {
      me.dodgeT -= dt;
      const sp = 17 * S.wc.roll * S.dodgeDist;
      moveMe(me.dodgeDir[0] * sp * dt, me.dodgeDir[1] * sp * dt);
      if (Math.random() < 0.5) fx.parts.emit(me.x, 0.6, me.z, { color: hasBuff('afterimage') ? 0x9affff : 0xbfe6ff, size: 0.4, life: hasBuff('afterimage') ? 0.6 : 0.3, speed: 0.5, gravity: 0 });
    } else if (me.dashT > 0) {
      const dashDt = Math.min(dt, me.dashT);
      me.dashT -= dt;
      moveMe(Math.sin(me.dashA) * me.dashSpeed * dashDt, Math.cos(me.dashA) * me.dashSpeed * dashDt);
      fx.parts.emit(me.x, 0.8, me.z, { color: RARITIES[S.wr].color, size: 0.4, life: 0.3, speed: 0.5, gravity: 0 });
    } else if (me.staggerT > 0) {
      // ひるみ中は動けない
      if (Math.random() < 0.3) fx.parts.emit(me.x + rnd(-0.3, 0.3), 2.2, me.z + rnd(-0.3, 0.3), { color: 0xffffff, size: 0.25, life: 0.3, speed: 1, gravity: 0 });
    } else if (me.lootGo && !l && canAct()) {
      lootWalk(dt); // 札をクリックした落とし物へ歩いていく
    } else if (l > 0) {
      me.lootGo = 0;
      const busy = me.swingT < me.swingDur || me.skillT >= 0;
      const slow = me.guarding ? 0.45 : busy ? 0.45 : me.charging && me.chargeT > CHARGE_MIN ? 0.4 : 1;
      const sp = 7.2 * (1 + (S.move + buffMod('move') + (desperate() ? 25 : 0) + titleMove()) / 100) * slow * analog * (hazardAt(me.x, me.z)?.kind === 'sand' ? 0.5 : 1);
      moveMe(dx / l * sp * dt, dz / l * sp * dt);
      me.moving = true;
      if (!busy && !me.charging && !me.guarding) me.a = Math.atan2(dx, dz);
      me.walkT += dt;
      me.stepT -= dt;
      if (me.stepT <= 0) { me.stepT = 0.32; audio.sfx('step'); }
    }
    // 盾槍: 強攻撃を溜めている間はガードを構える
    if (me.charging && S.guard && me.chargeT >= CHARGE_MIN && !me.guarding && me.gg > 0) { me.guarding = true; me.guardStart = now(); me.counter = false; audio.sfx('equip'); }
    if (me.guarding) me.a = aimAngle();

    // 出口
    if (!me.transit) {
      for (const p of env.portals) {
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        if (d < p.r && p.armed) {
          if (AREAS[p.to].floor > world.unlocked) { toast('この先はまだ開放されていない', '#f99'); p.armed = false; continue; }
          me.transit = true; net.send({ t: 'move', to: p.to }); audio.sfx('warp');
          break;
        }
        if (d > p.r + 1.5) p.armed = true;
      }
    }

    // 溜め
    if (me.charging) {
      me.chargeT += dt * (1 + buffMod('chargeRate') / 100) * (me.eyeCharge ? 2 : 1); // 集中・見切り眼Aで溜めが速くなる
      if (me.chargeT >= CHARGE_MIN) {
        me.a = aimAngle();
        const lv = me.chargeT >= S.chargeMax ? 2 : 1;
        if (lv !== me.chargeLv) {
          me.chargeLv = lv;
          audio.sfx(lv === 2 ? 'charged' : 'charge', { lv });
          if (lv === 2) { fx.ringWave(me.x, me.z, RARITIES[S.wr].color, 2.5, 0.3); fx.flash(me.x, 1.5, me.z, RARITIES[S.wr].color, 20, 0.3); }
        }
        // 光が集まる演出
        if (Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2, rr = 1.8;
          fx.parts.emit(me.x + Math.sin(a) * rr, rnd(0.3, 1.8), me.z + Math.cos(a) * rr, { color: lv === 2 ? 0xffd84a : RARITIES[S.wr].color, size: 0.35, life: 0.35, dir: [-Math.sin(a), 0, -Math.cos(a)], speed: 5, spread: 0.2, gravity: 0, drag: 0 });
        }
      }
    }

    // 通常攻撃（短押しの入力を少し保持してコンボをつなぐ）
    me.swingT += dt;
    if (me.queued > t && canAct() && me.swingT >= me.swingDur && !safe) { me.queued = 0; doSwing(); }
    if (me.skillT >= 0) { me.skillT += dt; if (me.skillT > (me.skillDuration || .55)) me.skillT = -1; }

    // ハザード: 毒沼は踏んでいる間ダメージ、流砂は足が遅くなる（移動のところ）
    const hz = hazardAt(me.x, me.z);
    if (hz && hz.kind !== me.hazKind) ui.toast(`${HAZARDS[hz.kind].name}: ${HAZARDS[hz.kind].desc}`, hz.kind === 'poison' ? '#c08aff' : '#e0c890');
    me.hazKind = hz?.kind;
    if (hz?.kind === 'poison') {
      me.hazT = (me.hazT ?? 0) - dt;
      if (me.hazT <= 0) {
        me.hazT = 0.5;
        me.hp -= Math.max(1, Math.round(S.mhp * 0.025));
        me.lastHurt = t;
        floatText(me.x, 2.2, me.z, '毒', 'poison');
        fx.parts.burst(me.x, 0.4, me.z, 8, { color: 0x9aff7a, speed: 2, size: 0.35, life: 0.5, gravity: -1 });
        if (me.hp <= 0) fall();
      }
    }

    // 自然回復はなし（回復はポーション・スキル・吸収などで）。町や転移門の近くだけ、HPとポーションが戻る
    if (safe) { me.hp = Math.min(S.mhp, me.hp + S.mhp * 0.1 * dt); me.potions = S.maxPot; }
  }

  // 毒
  for (const mb of [...mobs.values()]) {
    if (mb.poisonUntil > t) {
      mb.poisonT -= dt;
      if (mb.poisonT <= 0) { mb.poisonT = 0.5; dealDamage(mb, mb.vStack ? wtPoisonTick(mb) : Math.max(0.12, mb.poisonPow || 0), { type: 'dot', noProc: true }); fx.parts.emit(mb.x, 1.2, mb.z, { color: 0x8aff5a, size: 0.4 + (mb.vStack || 0) * 0.06, life: 0.5, speed: 1, gravity: 1 }); }
    } else if (mb.vStack) mb.vStack = 0;
    // 出血（短剣）
    if (mb.bleedUntil > t) {
      mb.bleedT = (mb.bleedT || 0) - dt;
      if (mb.bleedT <= 0) { mb.bleedT = 0.5; dealDamage(mb, mb.bleedPow * 0.5 * wtToxMul(), { type: 'dot', noProc: true }); fx.parts.emit(mb.x, 1.0, mb.z, { color: 0xff4a5a, size: 0.35, life: 0.45, speed: 1.4, gravity: 4 }); }
    } else if (mb.bleedN) { mb.bleedN = 0; mb.bleedPow = 0; }
    // 燃焼（スキル変化「爆炎」）
    if (mb.burnUntil > t) {
      if (Math.random() < 0.5) fx.parts.emit(mb.x + rnd(-0.4, 0.4), rnd(0.5, 1.8), mb.z + rnd(-0.4, 0.4), { color: Math.random() < 0.5 ? 0xff7a20 : 0xffc040, size: 0.45, life: 0.5, speed: 0.6, gravity: -3 });
      mb.burnT = (mb.burnT ?? 1) - dt;
      if (mb.burnT <= 0) { mb.burnT = 1; dealDamage(mb, mb.burnPow, { type: 'dot', noProc: true }); }
    }
  }

  // 自キャラモデル
  me.model.position.set(me.x, heightAt(me.x, me.z), me.z);
  me.model.rotation.y = me.a;
  animatePlayer(me.model, {
    t, moving: me.moving, walkT: me.walkT, kind: S.wk, combo: me.combo, dead: me.dead, guard: me.guarding, shieldBack: S.wt?.ks1 === 'sp_dragoon',
    swing: me.swingT < me.swingDur ? me.swingT / me.swingDur : me.charging && me.chargeT > CHARGE_MIN ? 0.02 : -1,
    spin: me.skillT >= 0 && me.spin ? me.skillT / 0.55 : -1,
    dodge: me.dodgeT > 0 ? me.dodgeT / 0.38 : 0,
    // 倒れる → 起き上がる（最後の0.25秒で起きる）/ のけぞり
    down: me.crawl ? 1 : me.downT > 0 ? Math.min(1, (REACT.downT - me.downT) / 0.12, me.downT / 0.25) : 0,
    hurt: me.hurtT > 0 ? Math.sin(me.hurtT / 0.28 * Math.PI) : 0,
    motion: me.motion, motionT: me.motionT,
    charging: me.charging, charge: Math.min(1, me.chargeT / (S?.chargeMax || CHARGE_MAX)),
    gg: me.gg / GUARD.max, // 盾の縁の光（ガードゲージの残り）
    sweep: me.sweepT > 0 ? sweepAngle(me.sweepT) : -1, // ガードカウンターの回転なぎ払い（回った角度）
  });
  reviveRing(me, me.x, me.z, me.crawl ? me.rv : -1);
  for (const o of others.values()) reviveRing(o, o.x, o.z, o.rv);
  if (me.guarding && Math.random() < 0.3) fx.parts.emit(me.x + Math.sin(me.a) * 0.9 + rnd(-0.4, 0.4), rnd(0.6, 1.8), me.z + Math.cos(me.a) * 0.9 + rnd(-0.4, 0.4), { color: 0xbfe0ff, size: 0.25, life: 0.3, speed: 0.3, gravity: 0 });
  for (const b of me.buffs) if (Math.random() < 0.25) fx.parts.emit(me.x + rnd(-0.5, 0.5), rnd(0.2, 2), me.z + rnd(-0.5, 0.5), { color: b.color, size: 0.3, life: 0.6, speed: 1, gravity: 2 });
  // 伝説・神器のオーラ
  if (S.wr >= 5 && Math.random() < 0.3) fx.parts.emit(me.x + rnd(-0.6, 0.6), rnd(0.3, 2), me.z + rnd(-0.6, 0.6), { color: RARITIES[S.wr].color, size: 0.25, life: 0.8, speed: 0.4, gravity: 1.5 });

  // NPC（近くに来たらこちらを向く）
  for (const n of npcs) {
    const d = Math.hypot(me.x - n.x, me.z - n.z);
    const want = d < 8 ? Math.atan2(me.x - n.x, me.z - n.z) : Math.PI;
    n.model.rotation.y += angDiff(want, n.model.rotation.y) * Math.min(1, dt * 4);
    animatePlayer(n.model, { t: t + n.x, moving: false, walkT: 0, kind: 'sword', combo: 0, dead: false, swing: -1, spin: -1, dodge: 0 });
  }

  // 他プレイヤー
  for (const o of others.values()) {
    const k = 1 - Math.exp(-12 * dt);
    const mx = o.tx - o.x, mz = o.tz - o.z;
    const moving = Math.hypot(mx, mz) > 0.03;
    o.x += mx * k; o.z += mz * k;
    o.a += angDiff(o.ta, o.a) * k;
    o.motionT += dt;
    if (o.motionT > (MOTION_DURATIONS[o.motion] || 0)) o.motion = '';
    o.swingT += dt; if (o.spinT >= 0) { o.spinT += dt; if (o.spinT > 0.55) o.spinT = -1; }
    if (moving) o.walkT += dt;
    o.model.position.set(o.x, heightAt(o.x, o.z), o.z);
    o.model.rotation.y = o.a;
    animatePlayer(o.model, { t, moving, walkT: o.walkT, kind: o.wk, motion: o.motion, motionT: o.motionT, combo: o.combo, dead: o.dead, guard: !!o.gd, shieldBack: o.wk === 'spear' && (o.cl & 1) > 0, swing: o.swingT < 0.35 ? o.swingT / 0.35 : -1, spin: o.spinT >= 0 && (o.wk === 'greatsword' || o.motion === 'whirlspear' || o.motion === 'whirl') ? o.spinT / 0.55 : -1, dodge: o.dg > 0 ? 0.5 : 0, down: o.rv >= 0 || o.rc === 2 ? 1 : 0, hurt: o.rc === 1 ? 0.8 : 0 });
  }

  // モンスター
  for (const mb of mobs.values()) {
    const k = 1 - Math.exp(-10 * dt);
    mb.x += (mb.tx - mb.x) * k; mb.z += (mb.tz - mb.z) * k;
    mb.a += angDiff(mb.ta, mb.a) * k;
    mb.flash = Math.max(0, mb.flash - dt * 6);
    mb.model.position.set(mb.x, heightAt(mb.x, mb.z), mb.z);
    mb.model.rotation.y = mb.a;
    animateMob(mb.model, { t: t + mb.id, st: mb.st, flash: mb.flash, enraged: mb.enraged });
    if (mb.model.userData.float && !mb.model.userData.flap && Math.random() < 0.25) fx.parts.emit(mb.x + rnd(-0.3, 0.3), 1.2 * mb.model.scale.y + mb.model.userData.body.position.y, mb.z + rnd(-0.3, 0.3), { color: FLOORS[world.floor - 1].mobs.find((d) => d.t === 'wisp')?.color ?? 0xffffff, size: 0.35, life: 0.7, speed: 0.4, gravity: 0.8 });
    if (mb.elite && Math.random() < 0.15) fx.parts.emit(mb.x + rnd(-0.6, 0.6), rnd(0.3, 2.4), mb.z + rnd(-0.6, 0.6), { color: 0xffb030, size: 0.3, life: 0.7, speed: 0.4, gravity: 1.5 });
    if (mb.stunT > 0 && Math.random() < 0.5) {
      // スタン中: 頭上で星が回る
      const a = t * 6 + Math.random() * 6, h = 2.6 * mb.model.scale.y;
      fx.parts.emit(mb.x + Math.sin(a) * 1.5, h, mb.z + Math.cos(a) * 1.5, { color: 0xffe060, size: 0.5, life: 0.4, speed: 0.3, gravity: 0 });
      mb.model.userData.body.rotation.z = Math.sin(t * 3) * 0.15;
    } else if (mb.model.userData.body) mb.model.userData.body.rotation.z = 0;
    if (mb.kind === 2 && mb.enraged && Math.random() < 0.5) fx.parts.emit(mb.x + rnd(-2, 2), rnd(0.5, 5), mb.z + rnd(-2, 2), { color: 0xff3a20, size: 0.6, life: 0.8, speed: 1, gravity: 3 });
  }

  // ギミックの見た目
  if (env.door) {
    const y = world.door ? -3.4 : 0;
    env.door.position.y += (y - env.door.position.y) * Math.min(1, dt * 3);
    env.door.visible = env.door.position.y > -3.3;
  }
  if (env.lever) env.lever.userData.stick.rotation.z += ((world.door ? -0.6 : 0.6) - env.lever.userData.stick.rotation.z) * Math.min(1, dt * 6);
  for (const c of env.chests || []) {
    const open = chestOpen(c);
    const lid = c.obj.userData.lid;
    lid.rotation.x += ((open ? -1.9 : 0) - lid.rotation.x) * Math.min(1, dt * 5);
    c.obj.userData.shine.visible = !open;
  }
  env.plates?.forEach((m, i) => { m.material.emissiveIntensity = world.plates[i] ? 1.6 + Math.sin(t * 8) * 0.4 : 0; });

  updateTeles();
  updateProjs(dt);
  updateBossProjs(dt);
  updateDrops(dt);
  updateCoins(dt);
  updateBowGuide(t);
  updateTouchAim(t);

  // 送信
  sendT -= dt;
  if (sendT <= 0) {
    sendT = 0.066;
    net.send({ t: 'st', x: +me.x.toFixed(2), z: +me.z.toFixed(2), a: +me.a.toFixed(2), hp: Math.round(me.hp), mhp: S.mhp, lv: char.lv, dead: me.dead, wk: S.wk, wr: S.wr, sw: me.sw, sk: me.sk, dg: me.dodgeT > 0 ? 1 : 0, gd: me.guarding ? 1 : 0, wst: S.wst, arm: S.arm, pm: me.motion || '', pt: +(me.motionT || 0).toFixed(3), rc: me.downT > 0 ? 2 : me.hurtT > 0 ? 1 : 0, cl: S.wt?.ks1 === 'sp_dragoon' ? 1 : 0 }); // cl: クラスの見た目（1 = 竜騎士の背負った盾）
  }
  saveT -= dt;
  if (saveT <= 0) { saveT = 10; saveChar(); }

  // BGM 切り替え（ボス戦中で部屋の近くならボス曲）
  const fdef = FLOORS[world.floor - 1];
  const lair = env.lair;
  const bossNear = world.bossState === 'fight' && lair && Math.hypot(me.x - lair.x, me.z - lair.z) < lair.r + 20;
  audio.setMusic(fdef.music, !!bossNear);

  // カメラ: 注視点（自キャラ）を滑らかに追い、ズームは目標値へ指数的に近づける。
  // 寄るほど少し低い角度から見る
  setShake(Math.max(0, shake - dt * 2.5));
  cam.zoom += (cam.zoomT - cam.zoom) * (1 - Math.exp(-10 * dt));
  cam.focus.lerp(tmpV.set(me.x, heightAt(me.x, me.z) + 1.2, me.z), 1 - Math.exp(-12 * dt));
  const zoom = cam.zoom * (world.def.shape === 'grid' ? 0.9 : 1);
  const pitch = THREE.MathUtils.lerp(0.62, 0.92, clamp((cam.zoom - CAM_ZOOM[0]) / (CAM_ZOOM[1] - CAM_ZOOM[0]), 0, 1));
  const dist = 19.5 * zoom;
  // 屋外の端では、カメラが外周の崖の中に入らないよう、真上寄りから見下ろす
  let back = Math.cos(pitch) * dist;
  if (world.def.shape === 'open') {
    while (back > 2 && !insideOpen(world.def, cam.focus.x, cam.focus.z + back, 1)) back -= 0.5;
  }
  cam.back = cam.back == null ? back : cam.back + (back - cam.back) * (1 - Math.exp(-6 * dt));
  camera.position.set(cam.focus.x, cam.focus.y + Math.sqrt(Math.max(0, dist * dist - cam.back * cam.back)), cam.focus.z + cam.back);
  if (shake > 0) camera.position.add(tmpV.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(shake * 0.35));
  camera.lookAt(cam.focus);
  // 近景の透過（カメラと自キャラの間のもの・カメラに近すぎるもの）
  OCC.uOccCam.value.copy(camera.position);
  OCC.uOccTgt.value.set(me.x, heightAt(me.x, me.z) + 1.1, me.z);
  OCC.uOccR.value = settings.occlusion === false ? 0 : 1.9;
  OCC.uOccNear.value = camera.position.distanceTo(OCC.uOccTgt.value) * 0.5;

  sun.position.set(me.x + 20, 40, me.z + 10);
  sun.target.position.set(me.x, 0, me.z);

  env.update(t, me.x, me.z);
  const fighting = world.bossState === 'fight';
  for (const m of env.ringMats) m.opacity = fighting ? 0.28 + Math.sin(t * 4) * 0.1 : 0.4;
  if (world.def.gate && Math.random() < 0.3) fx.parts.emit(world.def.gate.x + rnd(-3, 3), 0.5, world.def.gate.z + rnd(-0.5, 0.5), { color: 0x6ad0ff, size: 0.3, life: 1.5, speed: 0.5, gravity: 2 });
  ambient.update(dt, me.x, me.z, t);
  if (weatherParts.kind) weatherParts.update(dt, me.x, me.z, t);
  exploreTick();
  waypointTick();
  guardRegen(dt);
  sweepTick(dt);
  pinTick();
  fx.update(dt);
  updateMobLabels();
  ui.frame(dt);
}

export function loop() {
  requestAnimationFrame(loop);
  const t = now();
  let dt = Math.min(0.05, t - lastT);
  lastT = t;
  // ヒットストップ: 被弾の瞬間だけ動きをほぼ止めて、手応えを出す
  if (hitStop > 0) { setHitStop(hitStop - dt); dt *= 0.1; }
  if (started) update(dt);
  if (!window.__noRender) composer.render(); // 自動テスト（挙動の記録）は描画を省いて速く回す
}

export function setBowGuide(v) { bowGuide = v; }
