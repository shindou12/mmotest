import { MOTION_DURATIONS } from '../../shared/motion-catalog.js';
import { REVIVE } from '../../shared/balance.js';
import { FLOORS, RARITIES, WEAPONS } from '../../shared/data.js';
import { AREAS, HAZARDS, collide, hazardsOf, insideOpen, inLair } from '../../shared/areas.js';
import { angDiff, clamp, now, rnd, lerp } from './util.js';
import { fxCall, fxReduce, fxSome } from './weapon-fx.js';
import { isSpinMotion } from '../../shared/skill-timings.js';
import { field, link, rules, screen, state, stats, view } from './ports.js';

// ======================================================================
// メインループ
// ======================================================================
export let lastT = now();
export let sendT = 0;
export let saveT = 0;
// ---- 弓の照準ガイド: 足元の射程の円（引くほど広がり、最大射程で止まる）と狙いの線 ----
export let bowGuide = null;
// 振りの軌跡の色: 武器の出来（レア度）の色。粗悪・普通は白っぽい青
const trailColor = (r) => (r >= 2 ? RARITIES[r].color : 0xcfe8ff);
// 残像: すばやく動いた瞬間（回避・すり抜け・跳び退きなど）に、0.04秒ごとに体の像を残す。ワープのような大移動は除く
const GHOST = { speed: 11, every: 0.04, jump: 6 };
function afterimage(who, model, x, z, color, dt) {
  const d = who.ghostP ? Math.hypot(x - who.ghostP.x, z - who.ghostP.z) : 0;
  who.ghostP = { x, z };
  if (state.settings.quality === 'low' || dt <= 0 || d > GHOST.jump || d / dt < GHOST.speed) { who.ghostT = 0; return; }
  who.ghostT = (who.ghostT || 0) - dt;
  if (who.ghostT > 0) return;
  who.ghostT = GHOST.every;
  view.fx.ghost(model, color);
}

export function updateBowGuide(t) {
  if (!bowGuide) return;
  const G = bowGuide;
  G.group.visible = !!stats.S.W.ranged && !state.me.dead;
  if (!G.group.visible) return;
  const r = stats.bowRange(), drawing = state.me.charging && state.me.chargeT >= state.CHARGE_MIN, full = drawing && r >= stats.S.bowMax - 0.01;
  G.group.position.set(state.me.x, field.heightAt(state.me.x, state.me.z) + 0.1, state.me.z);
  G.disc.scale.set(r, r, 1); G.ring.scale.set(r, r, 1); G.max.scale.set(stats.S.bowMax, stats.S.bowMax, 1);
  G.ring.material.color.set(full ? 0xffd84a : drawing ? 0xffffff : 0x9affd8);
  G.ring.material.opacity = drawing ? 0.9 : 0.4;
  G.disc.material.color.set(full ? 0xffd84a : 0x9affd8);
  G.disc.material.opacity = drawing ? 0.07 + (full ? 0.04 * Math.sin(t * 10) : 0) : 0.03;
  G.max.visible = drawing && !full;
  G.aim.visible = drawing;
  if (G.aim.visible) {
    const k = clamp(state.me.chargeT / stats.S.chargeMax, 0, 1);
    G.aim.rotation.y = rules.aimAngle();
    G.aim.scale.set(1 + k, 1, r);
    G.aim.material.opacity = 0.35 + 0.4 * k + 0.15 * Math.sin(t * 20);
  }
}

// ---- スマホの狙い: 自動ターゲットの印と、ボタンを引っぱったときの狙い線 ----
export let touchGuide = null;
export function updateTouchAim(t) {
  if (!rules.touch.on) { if (touchGuide) touchGuide.group.visible = false; return; }
  if (!touchGuide) {
    const { group, ring, line, spot } = view.touchGuideMesh();
    view.scene.add(group);
    touchGuide = { group, ring, line, spot };
  }
  const G = touchGuide;
  G.group.visible = !state.me.dead;
  rules.touch.target = rules.touch.aim == null ? rules.autoTarget() : null;
  const tg = rules.touch.target;
  G.ring.visible = !!tg;
  if (tg) {
    const s = tg.rad * 1.6 + Math.sin(t * 6) * 0.08;
    G.ring.position.set(tg.x, field.heightAt(tg.x, tg.z) + 0.12, tg.z); G.ring.scale.set(s, s, 1);
  }
  G.line.visible = G.spot.visible = rules.touch.aim != null;
  if (rules.touch.aim != null) {
    const len = stats.S.W.ranged ? stats.S.W.range : Math.max(4, stats.S.W.range + 2);
    G.line.position.set(state.me.x, field.heightAt(state.me.x, state.me.z) + 0.15, state.me.z);
    G.line.rotation.y = rules.touch.aim; G.line.scale.set(1, 1, len);
    const p = rules.aimPoint();
    G.spot.position.set(p.x, field.heightAt(p.x, p.z) + 0.15, p.z);
  }
}

// ---- ハザード / 宝箱 ----
export function hazardAt(x, z) {
  if (state.world.def.shape !== 'open' || rules.tf('t_boss2')) return null; // 称号「霧を越えし者」は影響を受けない
  return hazardsOf(state.world.def).find((h) => Math.hypot(h.x - x, h.z - z) < h.r - 0.3) || null;
}

export function moveMe(dx, dz) {
  state.me.x += dx; state.me.z += dz;
  const c = collide(state.world.def, state.me.x, state.me.z, 0.45, state.world.door);
  state.me.x = c.x; state.me.z = c.z;
}

export function update(dt) {
  const t = now();
  if (state.me.motion) { state.me.motionT += dt;if (state.me.motionT > (MOTION_DURATIONS[state.me.motion] || 0)) state.me.motion = ''; }
  rules.updateMouseWorld();
  // 遅延処理（スキルの多段ヒットなど）
  for (let i = state.pending.length - 1; i >= 0; i--) if (state.pending[i].at <= t) { const p = state.pending.splice(i, 1)[0]; if (!state.me.dead && !state.me.crawl) p.fn(); }

  state.me.dodgeCd -= dt; state.me.wsCd -= dt; state.me.potCd -= dt; state.me.iframe -= dt; state.me.staggerT -= dt; state.me.hurtT -= dt;
  state.me.dStackT -= dt; if (state.me.dStackT <= 0) state.me.dStack = 0;
  const cdt = fxReduce('cooldownDt', dt); // ブレイブハートB「速攻」 など
  state.me.wsCd -= cdt - dt;
  for (const k in state.me.tcd) state.me.tcd[k] -= cdt;
  for (const b of state.me.buffs) b.t -= dt;
  fxCall('tick'); // 剣聖の全会心が終わったら勢いは0 など
  rules.wtAura(dt);
  state.me.buffs = state.me.buffs.filter((b) => b.t > 0);
  // しばらく倒れずにいると、起こしにくさが1段階戻る
  if (state.me.downs > 0 && !state.me.crawl && t - state.me.downsAt > REVIVE.decay) { state.me.downs--; state.me.downsAt = t; }
  const safe =state.world.def.type === 'town' || state.world.def.type === 'camp';

  if (state.me.dead) {
    state.me.deadT = Math.max(0, state.me.deathAt - now());
    if (state.me.deadT <= 0) {
      // Reload into a fresh login; the lost character cannot respawn or be autosaved.
      state.setStarted(false);
      location.reload();
      return;
    }
  } else if (state.me.crawl) {
    rules.crawlTick(dt);
  } else {
    // 移動
    let dx = 0, dz = 0;
    {
      if (state.keys.has('w') || state.keys.has('arrowup')) dz -= 1;
      if (state.keys.has('s') || state.keys.has('arrowdown')) dz += 1;
      if (state.keys.has('a') || state.keys.has('arrowleft')) dx -= 1;
      if (state.keys.has('d') || state.keys.has('arrowright')) dx += 1;
    }
    // スマホのアナログスティック（倒した量で歩く速さが変わる）
    let analog = 1;
    const sl = Math.hypot(rules.touch.stick.x, rules.touch.stick.y);
    if (sl > 0.12) { dx = rules.touch.stick.x; dz = rules.touch.stick.y; analog = Math.min(1, sl * 1.15); }
    const l = Math.hypot(dx, dz);
    state.me.moving = false;
    // 押し戻し・吹き飛び（ほかの動きと重ねて流される）
    if (state.me.kbT > 0) {
      const k = Math.min(dt, state.me.kbT);
      state.me.kbT -= dt;
      moveMe(state.me.kbX * k, state.me.kbZ * k);
      if (state.me.downT > 0 && Math.random() < 0.6) view.fx.parts.emit(state.me.x, 0.3, state.me.z, { color: 0xd8c8a8, size: 0.4, life: 0.4, speed: 1, gravity: 1 });
    }
    if (state.me.downT > 0) {
      // ダウン中は動けない（回避で受け身）
      state.me.downT -= dt;
      if (state.me.downT <= 0) rules.getUp();
    } else if (state.me.sweepT > 0) {
      // ガードカウンターの回転なぎ払い中は、その場から動かない
    } else if (state.me.dodgeT > 0) {
      state.me.dodgeT -= dt;
      const sp = 17 * stats.S.wc.roll * stats.S.dodgeDist;
      moveMe(state.me.dodgeDir[0] * sp * dt, state.me.dodgeDir[1] * sp * dt);
      if (Math.random() < 0.5) view.fx.parts.emit(state.me.x, 0.6, state.me.z, { color: stats.hasBuff('afterimage') ? 0x9affff : 0xbfe6ff, size: 0.4, life: stats.hasBuff('afterimage') ? 0.6 : 0.3, speed: 0.5, gravity: 0 });
    } else if (state.me.dashT > 0) {
      const dashDt = Math.min(dt, state.me.dashT);
      state.me.dashT -= dt;
      moveMe(Math.sin(state.me.dashA) * state.me.dashSpeed * dashDt, Math.cos(state.me.dashA) * state.me.dashSpeed * dashDt);
      view.fx.parts.emit(state.me.x, 0.8, state.me.z, { color: RARITIES[stats.S.wr].color, size: 0.4, life: 0.3, speed: 0.5, gravity: 0 });
    } else if (state.me.staggerT > 0) {
      // ひるみ中は動けない
      if (Math.random() < 0.3) view.fx.parts.emit(state.me.x + rnd(-0.3, 0.3), 2.2, state.me.z + rnd(-0.3, 0.3), { color: 0xffffff, size: 0.25, life: 0.3, speed: 1, gravity: 0 });
    } else if (state.me.lootGo && !l && rules.canAct()) {
      rules.lootWalk(dt); // 札をクリックした落とし物へ歩いていく
    } else if (l > 0) {
      state.me.lootGo = 0;
      const busy = state.me.swingT < state.me.swingDur || state.me.skillT >= 0;
      const slow = state.me.guarding ? 0.45 : busy ? 0.45 : state.me.charging && state.me.chargeT > state.CHARGE_MIN ? 0.4 : 1;
      const sp = 7.2 * (1 + (stats.S.move + stats.buffMod('move') + (rules.desperate() ? 25 : 0) + rules.titleMove()) / 100) * slow * analog * (hazardAt(state.me.x, state.me.z)?.kind === 'sand' ? 0.5 : 1);
      moveMe(dx / l * sp * dt, dz / l * sp * dt);
      state.me.moving = true;
      if (!busy && !state.me.charging && !state.me.guarding) state.me.a = Math.atan2(dx, dz);
      state.me.walkT += dt;
      state.me.stepT -= dt;
      if (state.me.stepT <= 0) { state.me.stepT = 0.32; view.audio.sfx('step'); }
    }
    // 盾槍: 強攻撃を溜めている間はガードを構える
    if (state.me.charging && state.me.chargeT >= state.CHARGE_MIN && rules.canGuard()) { state.me.guarding = true; state.me.guardStart = now(); state.me.counter = false; view.audio.sfx('equip'); }
    if (state.me.guarding) state.me.a = rules.aimAngle();

    // 出口
    if (!state.me.transit) {
      for (const p of field.env.portals) {
        const d = Math.hypot(p.x - state.me.x, p.z - state.me.z);
        if (d < p.r && p.armed) {
          if (AREAS[p.to].floor > state.world.unlocked) { screen.toast('この先はまだ開放されていない', '#f99'); p.armed = false; continue; }
          state.me.transit = true; link.net.send({ t: 'move', to: p.to }); view.audio.sfx('warp');
          break;
        }
        if (d > p.r + 1.5) p.armed = true;
      }
    }

    // 溜め
    if (state.me.charging) {
      state.me.chargeT += dt * (1 + stats.buffMod('chargeRate') / 100) * (state.me.eyeCharge ? 2 : 1); // 集中・見切り眼Aで溜めが速くなる
      if (state.me.chargeT >= state.CHARGE_MIN) {
        state.me.a = rules.aimAngle();
        const lv = state.me.chargeT >= stats.S.chargeMax ? 2 : 1;
        if (lv !== state.me.chargeLv) {
          state.me.chargeLv = lv;
          view.audio.sfx(lv === 2 ? 'charged' : 'charge', { lv });
          if (lv === 2) { view.fx.ringWave(state.me.x, state.me.z, RARITIES[stats.S.wr].color, 2.5, 0.3); view.fx.flash(state.me.x, 1.5, state.me.z, RARITIES[stats.S.wr].color, 20, 0.3); }
        }
        // 光が集まる演出
        if (Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2, rr = 1.8;
          view.fx.parts.emit(state.me.x + Math.sin(a) * rr, rnd(0.3, 1.8), state.me.z + Math.cos(a) * rr, { color: lv === 2 ? 0xffd84a : RARITIES[stats.S.wr].color, size: 0.35, life: 0.35, dir: [-Math.sin(a), 0, -Math.cos(a)], speed: 5, spread: 0.2, gravity: 0, drag: 0 });
        }
      }
    }

    // 通常攻撃（短押しの入力を少し保持してコンボをつなぐ）
    state.me.swingT += dt;
    if (state.me.queued > t && rules.canAct() && state.me.swingT >= state.me.swingDur && !safe) { state.me.queued = 0; rules.doSwing(); }
    if (state.me.skillT >= 0) { state.me.skillT += dt; if (state.me.skillT > (state.me.skillDuration || .55)) state.me.skillT = -1; }

    // ハザード: 毒沼は踏んでいる間ダメージ、流砂は足が遅くなる（移動のところ）
    const hz = hazardAt(state.me.x, state.me.z);
    if (hz && hz.kind !== state.me.hazKind) screen.ui.toast(`${HAZARDS[hz.kind].name}: ${HAZARDS[hz.kind].desc}`, hz.kind === 'poison' ? '#c08aff' : '#e0c890');
    state.me.hazKind = hz?.kind;
    if (hz?.kind === 'poison') {
      state.me.hazT = (state.me.hazT ?? 0) - dt;
      if (state.me.hazT <= 0) {
        state.me.hazT = 0.5;
        state.me.hp -= Math.max(1, Math.round(stats.S.mhp * 0.025));
        state.me.lastHurt = t;
        screen.floatText(state.me.x, 2.2, state.me.z, '毒', 'poison');
        view.fx.parts.burst(state.me.x, 0.4, state.me.z, 8, { color: 0x9aff7a, speed: 2, size: 0.35, life: 0.5, gravity: -1 });
        if (state.me.hp <= 0) rules.fall();
      }
    }

    // 自然回復はなし（回復はポーション・スキル・吸収などで）。町や転移門の近くだけ、HPとポーションが戻る
    if (safe) { state.me.hp = Math.min(stats.S.mhp, state.me.hp + stats.S.mhp * 0.1 * dt); state.me.potions = stats.S.maxPot; }
  }

  // 毒
  for (const mb of [...state.mobs.values()]) {
    if (mb.poisonUntil > t) {
      mb.poisonT -= dt;
      if (mb.poisonT <= 0) { mb.poisonT = 0.5; rules.dealDamage(mb, mb.vStack ? fxReduce('poisonTick', 0, mb) : Math.max(0.12, mb.poisonPow || 0), { type: 'dot', noProc: true }); view.fx.parts.emit(mb.x, 1.2, mb.z, { color: 0x8aff5a, size: 0.4 + (mb.vStack || 0) * 0.06, life: 0.5, speed: 1, gravity: 1 }); }
    } else if (mb.vStack) mb.vStack = 0;
    // 出血（短剣）
    if (mb.bleedUntil > t) {
      mb.bleedT = (mb.bleedT || 0) - dt;
      if (mb.bleedT <= 0) { mb.bleedT = 0.5; rules.dealDamage(mb, mb.bleedPow * 0.5 * fxReduce('bleedMul', 1), { type: 'dot', noProc: true }); view.fx.parts.emit(mb.x, 1.0, mb.z, { color: 0xff4a5a, size: 0.35, life: 0.45, speed: 1.4, gravity: 4 }); }
    } else if (mb.bleedN) { mb.bleedN = 0; mb.bleedPow = 0; }
    // 燃焼（スキル変化「爆炎」）
    if (mb.burnUntil > t) {
      if (Math.random() < 0.5) view.fx.parts.emit(mb.x + rnd(-0.4, 0.4), rnd(0.5, 1.8), mb.z + rnd(-0.4, 0.4), { color: Math.random() < 0.5 ? 0xff7a20 : 0xffc040, size: 0.45, life: 0.5, speed: 0.6, gravity: -3 });
      mb.burnT = (mb.burnT ?? 1) - dt;
      if (mb.burnT <= 0) { mb.burnT = 1; rules.dealDamage(mb, mb.burnPow, { type: 'dot', noProc: true }); }
    }
  }

  // 自キャラモデル
  state.me.model.position.set(state.me.x, field.heightAt(state.me.x, state.me.z), state.me.z);
  state.me.model.rotation.y = state.me.a;
  view.animatePlayer(state.me.model, {
    t, moving: state.me.moving, walkT: state.me.walkT, kind: stats.S.wk, combo: state.me.combo, dead: state.me.dead, guard: state.me.guarding, shieldBack: fxSome('shieldBack'),
    swing: state.me.swingT < state.me.swingDur ? state.me.swingT / state.me.swingDur : state.me.charging && state.me.chargeT > state.CHARGE_MIN ? 0.02 : -1,
    spin: state.me.skillT >= 0 && state.me.spin ? state.me.skillT / 0.55 : -1,
    dodge: state.me.dodgeT > 0 ? state.me.dodgeT / 0.38 : 0,
    // 倒れる → 起き上がる（最後の0.25秒で起きる）/ のけぞり
    crawl: state.me.crawl,
    down: state.me.crawl ? 1 : state.me.downT > 0 ? Math.min(1, (rules.REACT.downT - state.me.downT) / 0.12, state.me.downT / 0.25) : 0,
    hurt: state.me.hurtT > 0 ? Math.sin(state.me.hurtT / 0.28 * Math.PI) : 0,
    motion: state.me.motion, motionT: state.me.motionT,
    charging: state.me.charging, charge: Math.min(1, state.me.chargeT / (stats.S?.chargeMax || state.CHARGE_MAX)),
    gg: state.me.gg / rules.GUARD.max, // 盾の縁の光（ガードゲージの残り）
    sweep: state.me.sweepT > 0 ? rules.sweepAngle(state.me.sweepT) : -1, // ガードカウンターの回転なぎ払い（回った角度）
  });
  afterimage(state.me, state.me.model, state.me.x, state.me.z, trailColor(stats.S.wr), dt);
  // 振りの軌跡（近接武器。画質「低」では出さない）
  if (state.settings.quality !== 'low' && !WEAPONS[stats.S.wk]?.ranged && state.me.model.userData.weaponModel) {
    state.me.model.updateMatrixWorld();
    view.fx.swordTrail(state.me.model.userData.weaponModel, state.me.swingT < state.me.swingDur || state.me.skillT >= 0, trailColor(stats.S.wr), dt);
  }
  view.reviveRing(state.me, state.me.x, state.me.z, state.me.crawl ? state.me.rv : -1);
  for (const o of state.others.values()) view.reviveRing(o, o.x, o.z, o.rv);
  if (state.me.guarding && Math.random() < 0.3) view.fx.parts.emit(state.me.x + Math.sin(state.me.a) * 0.9 + rnd(-0.4, 0.4), rnd(0.6, 1.8), state.me.z + Math.cos(state.me.a) * 0.9 + rnd(-0.4, 0.4), { color: 0xbfe0ff, size: 0.25, life: 0.3, speed: 0.3, gravity: 0 });
  for (const b of state.me.buffs) if (Math.random() < 0.25) view.fx.parts.emit(state.me.x + rnd(-0.5, 0.5), rnd(0.2, 2), state.me.z + rnd(-0.5, 0.5), { color: b.color, size: 0.3, life: 0.6, speed: 1, gravity: 2 });
  // 伝説・神器のオーラ
  if (stats.S.wr >= 5 && Math.random() < 0.3) view.fx.parts.emit(state.me.x + rnd(-0.6, 0.6), rnd(0.3, 2), state.me.z + rnd(-0.6, 0.6), { color: RARITIES[stats.S.wr].color, size: 0.25, life: 0.8, speed: 0.4, gravity: 1.5 });

  // NPC（近くに来たらこちらを向く）
  for (const n of state.npcs) {
    const d = Math.hypot(state.me.x - n.x, state.me.z - n.z);
    const want = d < 8 ? Math.atan2(state.me.x - n.x, state.me.z - n.z) : Math.PI;
    n.model.rotation.y += angDiff(want, n.model.rotation.y) * Math.min(1, dt * 4);
    view.animatePlayer(n.model, { t: t + n.x, moving: false, walkT: 0, kind: 'sword', combo: 0, dead: false, swing: -1, spin: -1, dodge: 0 });
  }

  // 他プレイヤー
  for (const o of state.others.values()) {
    const k = 1 - Math.exp(-12 * dt);
    const mx = o.tx - o.x, mz = o.tz - o.z;
    const moving = Math.hypot(mx, mz) > 0.03;
    o.x += mx * k; o.z += mz * k;
    o.a += angDiff(o.ta, o.a) * k;
    o.motionT += dt;
    if (o.motionT > (MOTION_DURATIONS[o.motion] || 0)) o.motion = '';
    o.swingT += dt; if (o.spinT >= 0) { o.spinT += dt; if (o.spinT > 0.55) o.spinT = -1; }
    if (moving) o.walkT += dt;
    o.model.position.set(o.x, field.heightAt(o.x, o.z), o.z);
    o.model.rotation.y = o.a;
    view.animatePlayer(o.model, { t, moving, walkT: o.walkT, kind: o.wk, motion: o.motion, motionT: o.motionT, combo: o.combo, dead: o.dead, guard: !!o.gd, shieldBack: !!WEAPONS[o.wk]?.shield && (o.cl & 1) > 0, swing: o.swingT < 0.35 ? o.swingT / 0.35 : -1, spin: o.spinT >= 0 && (WEAPONS[o.wk]?.skillSpin || isSpinMotion(o.motion)) ? o.spinT / 0.55 : -1, dodge: o.dg > 0 ? 0.5 : 0, crawl: o.rv >= 0, down: o.rv >= 0 || o.rc === 2 ? 1 : 0, hurt: o.rc === 1 ? 0.8 : 0 });
    afterimage(o, o.model, o.x, o.z, trailColor(o.wr ?? 0), dt);
    if (state.settings.quality !== 'low' && !WEAPONS[o.wk]?.ranged && o.model.userData.weaponModel) {
      o.model.updateMatrixWorld();
      view.fx.swordTrail(o.model.userData.weaponModel, o.swingT < 0.35 || o.spinT >= 0, trailColor(o.wr ?? 0), dt);
    }
  }

  // モンスター
  for (const mb of state.mobs.values()) {
    const k = 1 - Math.exp(-10 * dt);
    mb.x += (mb.tx - mb.x) * k; mb.z += (mb.tz - mb.z) * k;
    mb.a += angDiff(mb.ta, mb.a) * k;
    mb.flash = Math.max(0, mb.flash - dt * 6);
    mb.model.position.set(mb.x, field.heightAt(mb.x, mb.z), mb.z);
    // 被弾の揺れ（ビクッと震えてすぐ収まる）
    if (mb.jolt > 0) { mb.jolt -= dt; const k = Math.max(0, mb.jolt / mb.joltMax) * mb.joltAmp; mb.model.position.x += Math.sin(t * 95) * k; mb.model.position.z += Math.cos(t * 83) * k * 0.6; }
    mb.model.rotation.y = mb.a;
    if (mb.act) { mb.act.age = now() - mb.act.start; if (mb.act.done) mb.act = null; }
    if (mb.look === 'player') {
      // 番兵（プレイヤーの姿）: 盾を構える／攻撃中は振りをくり返す（連撃 0.45 秒ごと）
      const moving = mb.st === 1;
      if (moving) mb.walkT += dt;
      if (mb.atkT >= 0) mb.atkT += dt;
      const swing = mb.st >= 2 && mb.atkT >= 0 ? (mb.atkT % 0.45) / 0.45 : -1;
      view.animatePlayer(mb.model, { t, moving, walkT: mb.walkT, kind: mb.weapon, guard: mb.guard, swing, spin: -1, dodge: 0, down: 0, hurt: mb.flash > 0.5 ? 0.4 : 0, combo: Math.floor((mb.atkT || 0) / 0.45) % 2 });
      if (Math.random() < 0.35) view.fx.parts.emit(mb.x + rnd(-0.7, 0.7), rnd(0.4, 3.2), mb.z + rnd(-0.7, 0.7), { color: mb.accent, size: 0.35, life: 0.8, speed: 0.3, gravity: -0.6 }); // 暗いオーラ
    } else view.animateMob(mb.model, { t: t + mb.id, st: mb.st, flash: mb.flash, enraged: mb.enraged, act: mb.act, stun: mb.stunT > 0 });
    // 武器を持ったボス（グラズ）の振りの軌跡: 技の動きの最中だけ
    if (mb.kind === 2 && mb.model.userData.weaponModel && state.settings.quality !== 'low') {
      mb.model.updateMatrixWorld();
      view.fx.swordTrail(mb.model.userData.weaponModel, !!mb.act && !mb.act.done && mb.st >= 2, mb.accent ?? 0xffcc33, dt);
    }
    if (mb.model.userData.float && !mb.model.userData.flap && Math.random() < 0.25) view.fx.parts.emit(mb.x + rnd(-0.3, 0.3), 1.2 * mb.model.scale.y + mb.model.userData.body.position.y, mb.z + rnd(-0.3, 0.3), { color: FLOORS[state.world.floor - 1].mobs.find((d) => d.t === 'wisp')?.color ?? 0xffffff, size: 0.35, life: 0.7, speed: 0.4, gravity: 0.8 });
    if (mb.elite && Math.random() < 0.15) view.fx.parts.emit(mb.x + rnd(-0.6, 0.6), rnd(0.3, 2.4), mb.z + rnd(-0.6, 0.6), { color: 0xffb030, size: 0.3, life: 0.7, speed: 0.4, gravity: 1.5 });
    // きらめくトカゲ: いつもきらめき、走ると金色の粒を残す
    if (mb.t === 'lizard') view.fx.parts.emit(mb.x + rnd(-0.6, 0.6), rnd(0.3, 1.4), mb.z + rnd(-0.6, 0.6), { color: Math.random() < 0.5 ? 0xffd84a : 0xffffff, size: 0.35, life: 0.6, speed: 0.6, gravity: -0.5 });
    // 砂に潜って追ってくる（潜行）: 盛り上がりの砂ぼこり
    if (mb.act?.p === 'burrow' && mb.act.age > 0.4 && mb.act.age < mb.act.d - 1.2) {
      const sand = FLOORS[state.world.floor - 1].ground2 ?? 0xc8a070;
      for (let i = 0; i < 3; i++) view.fx.parts.emit(mb.x + rnd(-1.6, 1.6), rnd(0.1, 0.8), mb.z + rnd(-1.6, 1.6), { color: sand, size: 0.7, life: 0.7, speed: 2.2, gravity: 4, up: 3 });
    }
    // ボスとつながる手下（吸い上げの根瘤）: 手下から大樹へ光の粒が流れ込む
    if (mb.link) {
      const boss = [...state.mobs.values()].find((o) => o.kind === 2);
      if (boss) for (let i = 0; i < 2; i++) {
        const k = Math.random(), x = mb.x + (boss.x - mb.x) * k, z = mb.z + (boss.z - mb.z) * k;
        view.fx.parts.emit(x + rnd(-0.3, 0.3), 1.0 + k * 3 + Math.sin(k * Math.PI) * 1.5, z + rnd(-0.3, 0.3), { color: 0x9cff7a, size: 0.55, life: 0.35, speed: 0.4, gravity: 0 });
      }
    }
    // スタン中はピヨピヨと鳴り続け、終わったら立ち上がる音
    if (mb.kind === 2) {
      if (mb.stunT > 0) { mb.tweetT = (mb.tweetT ?? 0.5) - dt; if (mb.tweetT <= 0) { mb.tweetT = 0.45; view.audio.sfx('stunTweet'); } mb.wasStun = true; }
      else if (mb.wasStun) { mb.wasStun = false; view.audio.sfx('stunEnd'); view.fx.ringWave(mb.x, mb.z, 0xd8c8a0, 6, 0.4); }
    }
    if (mb.stunT > 0 && Math.random() < 0.5) {
      // スタン中: 頭上で星が回る
      const a = t * 6 + Math.random() * 6, h = 2.6 * mb.model.scale.y;
      view.fx.parts.emit(mb.x + Math.sin(a) * 1.5, h, mb.z + Math.cos(a) * 1.5, { color: 0xffe060, size: 0.5, life: 0.4, speed: 0.3, gravity: 0 });
      mb.model.userData.body.rotation.z = Math.sin(t * 3) * 0.15;
    } else if (mb.model.userData.body) mb.model.userData.body.rotation.z = 0;
    if (mb.kind === 2 && mb.enraged && Math.random() < 0.5) view.fx.parts.emit(mb.x + rnd(-2, 2), rnd(0.5, 5), mb.z + rnd(-2, 2), { color: 0xff3a20, size: 0.6, life: 0.8, speed: 1, gravity: 3 });
  }

  // ギミックの見た目
  if (field.env.door) {
    const y = state.world.door ? -3.4 : 0;
    field.env.door.position.y += (y - field.env.door.position.y) * Math.min(1, dt * 3);
    field.env.door.visible = field.env.door.position.y > -3.3;
  }
  if (field.env.lever) field.env.lever.userData.stick.rotation.z += ((state.world.door ? -0.6 : 0.6) - field.env.lever.userData.stick.rotation.z) * Math.min(1, dt * 6);
  for (const c of field.env.chests || []) {
    const open = rules.chestOpen(c);
    const lid = c.obj.userData.lid;
    lid.rotation.x += ((open ? -1.9 : 0) - lid.rotation.x) * Math.min(1, dt * 5);
    c.obj.userData.shine.visible = !open;
  }
  field.env.plates?.forEach((m, i) => { m.material.emissiveIntensity = state.world.plates[i] ? 1.6 + Math.sin(t * 8) * 0.4 : 0; });

  rules.updateTeles();
  rules.updateProjs(dt);
  rules.updateBossProjs(dt);
  rules.updateDrops(dt);
  rules.updateCoins(dt);
  updateBowGuide(t);
  updateTouchAim(t);

  // 送信
  sendT -= dt;
  if (sendT <= 0) {
    sendT = 0.066;
    link.net.send({ t: 'st', x: +state.me.x.toFixed(2), z: +state.me.z.toFixed(2), a: +state.me.a.toFixed(2), hp: Math.round(state.me.hp), mhp: stats.S.mhp, lv: state.char.lv, dead: state.me.dead, wk: stats.S.wk, wr: stats.S.wr, sw: state.me.sw, sk: state.me.sk, dg: state.me.dodgeT > 0 ? 1 : 0, gd: state.me.guarding ? 1 : 0, wst: stats.S.wst, arm: stats.S.arm, pm: state.me.motion || '', pt: +(state.me.motionT || 0).toFixed(3), rc: state.me.downT > 0 ? 2 : state.me.hurtT > 0 ? 1 : 0, cl: fxSome('shieldBack') ? 1 : 0 }); // cl: クラスの見た目（1 = 竜騎士の背負った盾）
  }
  saveT -= dt;
  if (saveT <= 0) { saveT = 10; state.saveChar(); }

  // BGM 切り替え（ボス戦中で部屋の近くならボス曲）
  const fdef = FLOORS[state.world.floor - 1];
  const lair = field.env.lair;
  const bossNear = state.world.bossState === 'fight' && lair && inLair(lair, state.me.x, state.me.z, 20);
  view.audio.setMusic(fdef.music, !!bossNear);

  // カメラ: 注視点（自キャラ）を滑らかに追い、ズームは目標値へ指数的に近づける。
  // 寄るほど少し低い角度から見る
  rules.setShake(Math.max(0, rules.shake - dt * 2.5));
  view.cam.zoom += (view.cam.zoomT - view.cam.zoom) * (1 - Math.exp(-10 * dt));
  view.cam.focus.lerp(view.tmpV.set(state.me.x, field.heightAt(state.me.x, state.me.z) + 1.2, state.me.z), 1 - Math.exp(-12 * dt));
  const zoom = view.cam.zoom * (state.world.def.shape === 'grid' ? 0.9 : 1);
  const pitch = lerp(0.62, 0.92, clamp((view.cam.zoom - state.CAM_ZOOM[0]) / (state.CAM_ZOOM[1] - state.CAM_ZOOM[0]), 0, 1));
  const dist = 19.5 * zoom;
  // 屋外の端では、カメラが外周の崖の中に入らないよう、真上寄りから見下ろす
  let back = Math.cos(pitch) * dist;
  if (state.world.def.shape === 'open') {
    while (back > 2 && !insideOpen(state.world.def, view.cam.focus.x, view.cam.focus.z + back, 1)) back -= 0.5;
  }
  view.cam.back = view.cam.back == null ? back : view.cam.back + (back - view.cam.back) * (1 - Math.exp(-6 * dt));
  view.camera.position.set(view.cam.focus.x, view.cam.focus.y + Math.sqrt(Math.max(0, dist * dist - view.cam.back * view.cam.back)), view.cam.focus.z + view.cam.back);
  if (rules.shake > 0) view.camera.position.add(view.tmpV.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(rules.shake * 0.35));
  view.camera.lookAt(view.cam.focus);
  // 近景の透過（カメラと自キャラの間のもの・カメラに近すぎるもの）
  view.OCC.uOccCam.value.copy(view.camera.position);
  view.OCC.uOccTgt.value.set(state.me.x, field.heightAt(state.me.x, state.me.z) + 1.1, state.me.z);
  view.OCC.uOccR.value = state.settings.occlusion === false ? 0 : 1.9;
  view.OCC.uOccNear.value = view.camera.position.distanceTo(view.OCC.uOccTgt.value) * 0.5;

  view.sun.position.set(state.me.x + 20, 40, state.me.z + 10);
  view.sun.target.position.set(state.me.x, 0, state.me.z);

  field.env.update(t, state.me.x, state.me.z);
  const fighting = state.world.bossState === 'fight';
  for (const m of field.env.ringMats) m.opacity = fighting ? 0.28 + Math.sin(t * 4) * 0.1 : 0.4;
  if (state.world.def.gate && Math.random() < 0.3) view.fx.parts.emit(state.world.def.gate.x + rnd(-3, 3), 0.5, state.world.def.gate.z + rnd(-0.5, 0.5), { color: 0x6ad0ff, size: 0.3, life: 1.5, speed: 0.5, gravity: 2 });
  view.ambient.update(dt, state.me.x, state.me.z, t);
  if (view.weatherParts.kind) view.weatherParts.update(dt, state.me.x, state.me.z, t);
  rules.exploreTick();
  field.waypointTick();
  rules.guardRegen(dt);
  rules.sweepTick(dt);
  field.pinTick();
  view.fx.update(dt);
  view.updateMobLabels();
  screen.ui.frame(dt);
}

export function loop() {
  requestAnimationFrame(loop);
  const t = now();
  let dt = Math.min(0.05, t - lastT);
  lastT = t;
  // ヒットストップ: 被弾の瞬間だけ動きをほぼ止めて、手応えを出す
  if (rules.hitStop > 0) { rules.setHitStop(rules.hitStop - dt); dt *= 0.1; }
  if (state.started) update(dt);
  view.renderFrame();
}

export function setBowGuide(v) { bowGuide = v; }
