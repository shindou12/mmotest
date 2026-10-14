import { BALANCE, REVIVE, reviveStep } from '../../shared/balance.js';
import { inShape } from '../../shared/data.js';
import { angDiff, clamp, now, rnd, degToRad } from './util.js';
import { fxCall, fxReduce, fxSome } from './weapon-fx.js';
import { field, link, rules, screen, state, stats, view } from './ports.js';

// ======================================================================
// テレグラフ（予兆）と被弾判定
// ======================================================================
export function onTele(m) {
  const color = m.c || '#ff3030';
  const meshes = m.sh.map((s) => { const g = view.makeTelegraph(s, color, field.heightAt); view.scene.add(g); return g; });
  state.teles.push({ meshes, sh: m.sh, start: now(), dur: m.d / 1000, dmg: m.dmg, color, src: m.src, kd: !!m.kd });
  const near = m.sh.some((s) => Math.hypot(s.x - state.me.x, s.z - state.me.z) < 25);
  if (near) view.audio.sfx('telegraph');
}

export function updateTeles() {
  const t = now();
  for (let i = state.teles.length - 1; i >= 0; i--) {
    const te = state.teles[i];
    const k = clamp((t - te.start) / te.dur, 0, 1);
    te.meshes.forEach((g) => g.setProgress(k));
    if (k >= 1) {
      resolveTele(te);
      te.meshes.forEach((g) => view.fx.dispose(g));
      state.teles.splice(i, 1);
    }
  }
}

export function resolveTele(te) {
  const big = te.dmg > (stats.S ? stats.S.mhp * 0.12 : 20);
  for (const s of te.sh) {
    // 着弾演出
    const c = view.toColor(te.color);
    if (s.k === 'circle') { view.fx.ringWave(s.x, s.z, c, s.r, 0.35); view.fx.parts.burst(s.x, 0.3, s.z, Math.min(40, 6 + s.r * 4), { color: c, speed: 6, size: 0.5, life: 0.5, up: 2 }); }
    else if (s.k === 'ring') view.fx.ringWave(s.x, s.z, c, s.r1, 0.5);
    else {
      const len = s.len, n = Math.ceil(len / 2);
      for (let j = 0; j < n; j++) {
        const d = (j / n) * len;
        view.fx.parts.burst(s.x + Math.sin(s.a) * d, 0.3, s.z + Math.cos(s.a) * d, 4, { color: c, speed: 5, size: 0.5, life: 0.4 });
      }
    }
  }
  const nearSrc = te.sh.some((s) => Math.hypot(s.x - state.me.x, s.z - state.me.z) < 22);
  if (big && nearSrc) { view.audio.sfx('impact'); rules.addShake(0.35); }
  if (state.me.dead || state.me.crawl) return;
  const hit = te.sh.some((s) => inShape(s, state.me.x, state.me.z));
  if (!hit) return;
  if (state.me.iframe > 0) { onJustDodge(); return; }
  if (fxSome('counter', state.mobs.get(te.src) || te.sh[0])) return; // 大剣カウンター: 強攻撃を押した直後に受けると受け流す
  if (te.src) link.net.send({ t: 'absorb', id: te.src }); // 狙われ役が攻撃を受けるとヘイトのリセットが少し延びる
  if (stats.S.fx.has('aegis') && Math.random() < 0.25) {
    screen.floatText(state.me.x, 2.4, state.me.z, '無効化!', 'info');
    view.audio.sfx('block');
    view.fx.ringWave(state.me.x, state.me.z, 0xffd84a, 2, 0.3, 1);
    return;
  }
  let raw = te.dmg;
  // 敵の正面で受けると苛烈、背後なら軽い
  const srcMob = state.mobs.get(te.src);
  if (srcMob) {
    const off = Math.abs(angDiff(Math.atan2(state.me.x - srcMob.x, state.me.z - srcMob.z), srcMob.a));
    if (off < degToRad(60)) raw *= rules.tf('t_shell') ? 1 : 1.3; // 称号「甲殻の守り」は正面の割り増しなし
    else if (off > degToRad(120)) raw *= 0.7;
  }
  // 盾槍のガード（攻撃してきた方向が正面なら軽減）
  if (state.me.guarding && stats.S.guard) {
    const src = state.mobs.get(te.src) || { x: te.sh[0].x, z: te.sh[0].z };
    const dirTo = Math.atan2(src.x - state.me.x, src.z - state.me.z);
    const centered = Math.hypot(src.x - state.me.x, src.z - state.me.z) < 0.5;
    if (centered || Math.abs(angDiff(dirTo, state.me.a)) < degToRad(80)) {
      if (te.src) link.net.send({ t: 'threat', id: te.src, n: Math.round(te.dmg * 3) });
      // ガードゲージが尽きたらガードブレイク（そのまま全部のダメージを受ける）
      if (rules.guardDamage(raw, te.kd)) { takeDamage(raw, src, false, true); return; }
      raw *= stats.S.flags.has('bulwark') ? 0 : 0.25;
      view.audio.sfx('block');
      view.fx.parts.burst(state.me.x + Math.sin(state.me.a) * 0.8, 1.2, state.me.z + Math.cos(state.me.a) * 0.8, 14, { color: 0xbfe0ff, speed: 5, size: 0.4, life: 0.35 });
      rules.armCounter(); rules.wtOnGuard(te.dmg, srcMob);
      // ガードで受けた: ひるみ・ダウンはせず、少し押し戻されるだけ（ガードとカウンター準備は続く）。鉄壁A「不動」は押し戻されない
      if (!fxSome('steadyGuard')) knockFrom(src, 0.8, 0.12);
      hitStop = 0.05;
      if (raw <= 0) { screen.floatText(state.me.x, 2.4, state.me.z, '防御', 'info'); return; }
      takeDamage(raw, src, false, true);
      return;
    }
  }
  const from = srcMob || te.sh[0];
  takeDamage(raw, { x: from.x, z: from.z }, te.kd);
}

// ---- 被弾リアクション ----
//   軽: のけぞるだけ（動ける）/ 中: 最大HPの10%以上 → 押し戻されてひるむ
//   大: 最大HPの25%以上、または大技（kd）→ 吹き飛んでダウン。倒れた直後に回避で「受け身」
export const REACT = { stagger: 0.1, down: 0.25, downT: 1.1, techFrom: 0.1, techTo: 0.8, getupIframe: 0.6, noDown: 1.2 };
export let hitStop = 0;
// 防具の重さで飛ばされやすさが変わる（軽装は飛ぶ・重装は踏ん張る）
export const kbScale = () => ({ light: 1.3, medium: 1, heavy: 0.6 })[state.char.eq.armor?.armor] ?? 1.15;
export function knockFrom(src, dist, dur) {
  let dx = state.me.x - (src?.x ?? state.me.x), dz = state.me.z - (src?.z ?? state.me.z);
  let d = Math.hypot(dx, dz);
  if (d < 0.3) { dx = -Math.sin(state.me.a); dz = -Math.cos(state.me.a); d = 1; } // 真上からなら後ろへ
  const v = dist * kbScale() / dur;
  state.me.kbX = dx / d * v; state.me.kbZ = dz / d * v; state.me.kbT = dur;
  state.me.a = Math.atan2(-dx, -dz); // 攻撃してきた方を向いたまま飛ぶ
}
export function hitReaction(dmg, src, kd) {
  state.me.hurtT = 0.28;
  // 大剣の「剛体」: 溜め中はスーパーアーマー（破城の構えAの効果中も）。剛体Bは溜め中に吹き飛ばされない
  const armor = fxSome('superArmor');
  const canDown = now() >= (state.me.noDownT || 0) && !armor && !fxSome('noKnockdown');
  if ((dmg >= stats.S.mhp * REACT.down || kd) && canDown) {
    // ダウン（吹き飛び）
    hitStop = 0.09;
    knockFrom(src, 4, 0.32);
    state.me.downT = REACT.downT; state.me.downStart = now(); state.me.staggerT = 0;
    state.me.charging = false; state.me.guarding = false; state.me.queued = 0; state.me.swingT = 9; state.me.skillT = -1;
    state.me.noDownT = now() + REACT.downT + REACT.noDown;
    screen.floatText(state.me.x, 2.8, state.me.z, 'ダウン!', 'info');
    view.fx.parts.burst(state.me.x, 0.4, state.me.z, 24, { color: 0xd8c8a8, speed: 5, size: 0.5, life: 0.5, gravity: 4 });
    rules.addShake(0.5);
    return;
  }
  if (dmg >= stats.S.mhp * (rules.tf('t_relic') ? REACT.stagger * 2 : REACT.stagger) && state.me.hp > 0) {
    if (armor) { screen.floatText(state.me.x, 2.8, state.me.z, 'スーパーアーマー', 'info'); return; }
    hitStop = 0.05;
    knockFrom(src, 1.4, 0.18);
    state.me.staggerT = 0.35; state.me.charging = false; state.me.guarding = false; state.me.queued = 0;
    return;
  }
  hitStop = Math.max(hitStop, 0.03);
}
// ダウン中に回避を押すと受け身（すぐ起き上がって転がる・無敵）
export function tryTech() {
  const k = now() - state.me.downStart;
  if (k < REACT.techFrom || k > REACT.techTo) return false;
  state.me.downT = 0; state.me.kbT = 0; state.me.dodgeCd = 0;
  screen.floatText(state.me.x, 2.8, state.me.z, '受け身!', 'just');
  view.audio.sfx('perfect');
  view.fx.ringWave(state.me.x, state.me.z, 0x9affff, 2.5, 0.3);
  rules.tryDodge();
  state.me.iframe = Math.max(state.me.iframe, 0.5);
  return true;
}
export function getUp() {
  state.me.downT = 0;
  state.me.iframe = Math.max(state.me.iframe, REACT.getupIframe);
  view.fx.parts.burst(state.me.x, 0.3, state.me.z, 10, { color: 0xd8c8a8, speed: 2, size: 0.4, life: 0.4, gravity: 2 });
}

// 被ダメージの共通処理（予兆・ボスの弾）。src: 攻撃してきた位置 / kd: 吹き飛ばす大技
export function takeDamage(raw, src = null, kd = false, guarded = false) {
  if (now() < (state.me.brokenT || 0)) raw *= rules.GUARD.breakDmg; // ガードブレイク中は被ダメージ1.5倍
  raw = fxReduce('incoming', raw); // 狂剣士・捨て身 など
  const backB = fxReduce('drLowHp', 0); // 不撓B「背水」
  const dr = clamp(stats.buffMod('dr') + backB + rules.wtDr() + (rules.tf('t_relic') ? 8 : 0) + (rules.tf('t_shell') ? 12 : 0) - (rules.tf('t_berserk') ? 15 : 0), -100, 90);
  const dmg = Math.max(1, Math.round(raw * (1 - stats.S.def / 100) * (1 - dr / 100) * rnd(0.9, 1.1)));
  state.me.hp -= dmg;
  state.me.lastHurt = now();
  screen.floatText(state.me.x, 2.2, state.me.z, dmg, 'me');
  view.audio.sfx('hurt');
  rules.addShake(0.3);
  screen.ui.hurt();
  if (stats.S.wt) rules.wtOnHurt(guarded);
  // 被弾リアクション（のけぞり / ひるみ / ダウン）
  if (state.me.hp > 0 && !guarded) hitReaction(dmg, src, kd);
  if (state.me.hp <= 0 && stats.S.flags.has('laststand') && now() - state.me.lastStandT > 90) {
    state.me.hp = 1; state.me.lastStandT = now(); state.me.iframe = 1.0;
    screen.floatText(state.me.x, 2.8, state.me.z, '不屈!', 'just');
    view.audio.sfx('perfect');
    view.fx.beam(state.me.x, state.me.z, 0xffd84a, 8, 0.8, 0.8);
    return;
  }
  if (state.me.hp <= 0 && fxSome('cheatDeath')) return; // 不死身 など
  if (state.me.hp <= 0) { fall(); return; }
}

export function onJustDodge() {
  screen.floatText(state.me.x, 2.6, state.me.z, 'JUST回避!', 'just');
  view.audio.sfx('perfect');
  view.fx.ringWave(state.me.x, state.me.z, 0x9affff, 3, 0.3);
  if (stats.S.justbuff > 0) stats.addBuff('just', '見切り', 3, { dmgp: stats.S.justbuff }, 0x9affff);
  fxCall('justDodge'); // 後の先・残影・見切り眼 など
  if (stats.S.counter > 0) {
    rules.strikes.circle(state.me.x, state.me.z, 5, stats.S.counter / 100, { type: 'proc', noProc: true });
    view.fx.ringWave(state.me.x, state.me.z, 0xbff8ff, 5.5, 0.35);
  }
  if (stats.S.fx.has('mirror')) {
    stats.addBuff('mirror', '八咫の加護', 5, { dmgp: 50 }, 0xffffff);
    view.fx.ringWave(state.me.x, state.me.z, 0xffffff, 7, 0.5);
    view.fx.parts.burst(state.me.x, 1, state.me.z, 60, { color: 0xbff8ff, speed: 10, size: 0.6 });
    rules.strikes.circle(state.me.x, state.me.z, 6, 3.0, { type: 'proc', noProc: true });
  }
}

// HPが0 → 這いずり状態。仲間に攻撃（のスタン値）を当ててもらうと起き上がる。
// エリアの全員が倒れたら力尽きる（判定はサーバー。ひとりなら即座に力尽きる）
export function fall() {
  if (state.me.crawl || state.me.dead) return;
  // 称号「不死鳥」: その場で一度だけ復活
  if (rules.tf('t_phoenix') && now() - (state.me.phoenixT ?? -1e9) > 300) {
    state.me.phoenixT = now();
    state.me.hp = Math.round(stats.S.mhp * 0.3); state.me.iframe = 1.5; state.me.staggerT = 0;
    screen.banner('不死鳥', '炎の中からよみがえった', '#ff9a4a', 3);
    view.fx.beam(state.me.x, state.me.z, 0xff8a30, 14, 1.0, 1.2);
    view.fx.parts.burst(state.me.x, 1, state.me.z, 120, { color: 0xff8a30, speed: 9, size: 0.6, life: 1.1, gravity: -3 });
    view.audio.sfx('phase');
    return;
  }
  // 最近倒れた回数ほど起こしにくい（ゲージ ×1 → ×2.5 → ×4。円は 1/3 → 2/3 → 1周に見せる）
  state.me.downs = Math.min(REVIVE.mult.length, state.me.downs + 1); state.me.downsAt = now();
  state.me.crawl = true; state.me.rv = REVIVE.disp[reviveStep(state.me.downs)]; state.me.hp = 0;
  state.me.charging = false; state.me.guarding = false; state.me.counter = false; state.me.buffs = []; state.me.queued = 0;
  state.me.downT = 0; state.me.kbT = 0; state.me.staggerT = 0; state.me.dodgeT = 0; state.me.dashT = 0; state.me.sweepT = 0; state.me.skillT = -1; state.me.swingT = 9;
  link.net.send({ t: 'down', n: state.me.downs });
  screen.banner('這いずり状態', '仲間に攻撃を当ててもらうと起き上がれる', '#ff9a8a', 4);
  view.audio.sfx('hurt');
  view.fx.parts.burst(state.me.x, 0.5, state.me.z, 40, { color: 0xff9a8a, speed: 5, size: 0.45, life: 0.8 });
}
export function revived(by) {
  if (!state.me.crawl) return;
  state.me.crawl = false; state.me.rv = -1;
  state.me.hp = Math.round(stats.S.mhp * REVIVE.hp); state.me.iframe = REVIVE.iframe; state.me.noDownT = now() + REVIVE.iframe;
  screen.banner('復活', `${by} に起こしてもらった`, '#9affc8', 3);
  view.audio.sfx('levelup');
  view.fx.beam(state.me.x, state.me.z, 0x9affc8, 10, 0.9, 1.0);
  view.fx.ringWave(state.me.x, state.me.z, 0x9affc8, 4, 0.5);
}
// 倒れている仲間に攻撃が当たった → スタン値ぶんゲージを減らす（ダメージは関係なし）
export function reviveHit(o, opt) {
  if (state.me.crawl || state.me.dead || !(o.rv >= 0) || now() - (o.revHitT || 0) < 0.05) return;
  o.revHitT = now();
  const v = Math.min(REVIVE.perHit, rules.stunValue(opt));
  if (v <= 0) return;
  link.net.send({ t: 'rev', id: o.id, v });
  screen.floatText(o.x, 2.2, o.z, `起こす +${v}`, 'info');
  view.fx.parts.burst(o.x, 0.8, o.z, 12, { color: 0x9affc8, speed: 4, size: 0.4, life: 0.4 });
}
// 這いずり中: ゆっくり這って動けるだけ（攻撃・回避・ポーション・出口は使えない）
export function crawlTick(dt) {
  let dx = 0, dz = 0;
  if (state.keys.has('w') || state.keys.has('arrowup')) dz -= 1;
  if (state.keys.has('s') || state.keys.has('arrowdown')) dz += 1;
  if (state.keys.has('a') || state.keys.has('arrowleft')) dx -= 1;
  if (state.keys.has('d') || state.keys.has('arrowright')) dx += 1;
  if (Math.hypot(rules.touch.stick.x, rules.touch.stick.y) > 0.12) { dx = rules.touch.stick.x; dz = rules.touch.stick.y; }
  const l = Math.hypot(dx, dz);
  state.me.moving = l > 0;
  state.me.hp = 0;
  if (!l) return;
  rules.moveMe(dx / l * REVIVE.crawl * dt, dz / l * REVIVE.crawl * dt);
  state.me.a = Math.atan2(dx, dz);
  state.me.walkT += dt * 0.5;
  if (Math.random() < 0.15) view.fx.parts.emit(state.me.x, 0.2, state.me.z, { color: 0xd8c8a8, size: 0.35, life: 0.4, speed: 0.6, gravity: 1 });
}
export const downedAllies = () => [...state.others.values()].filter((o) => o.rv >= 0);

export function die() {
  state.me.crawl = false; state.me.rv = -1;
  const removed = state.characterStore.discard();
  screen.toast(removed ? '戦闘不能：このキャラクターのセーブデータを失いました' : 'キャラクターを失いました。ブラウザの保存データを削除できませんでした。', '#f99');
  state.me.hp = 0; state.me.dead = true; state.me.deadT = BALANCE.deathSeconds; state.me.deathAt = now() + BALANCE.deathSeconds; state.me.charging = false; state.me.guarding = false; state.me.buffs = []; state.me.downT = 0; state.me.kbT = 0;
  view.audio.sfx('death');
  view.fx.parts.burst(state.me.x, 1, state.me.z, 80, { color: 0x9ad8ff, speed: 8, size: 0.5, life: 1.2 });
}

export function setHitStop(v) { hitStop = v; }
