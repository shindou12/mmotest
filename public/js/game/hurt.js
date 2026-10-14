import { BALANCE, REVIVE, reviveStep } from '../../shared/balance.js';
import * as THREE from 'three';
import { inShape } from '../../shared/data.js';
import { makeTelegraph } from '../fx.js';
import { angDiff, clamp, now, rnd } from './util.js';
import { banner, floatText, toast, ui } from './ui-bridge.js';
import { char, characterStore } from './save.js';
import { audio, fx, scene } from './render.js';
import { keys, me, mobs, others, teles } from './state.js';
import { S, addBuff, buffMod, hasBuff } from './stats.js';
import { GUARD, armCounter, guardDamage } from './input.js';
import { net } from './net-client.js';
import { heightAt } from './area.js';
import { addShake, stunValue, touch } from './combat.js';
import { wtCounter, wtDr, wtEye, wtOnGuard, wtOnHurt } from './tree-effects.js';
import { tf } from './variants.js';
import { combat, tryDodge } from './actions.js';
import { moveMe } from './loop.js';

// ======================================================================
// テレグラフ（予兆）と被弾判定
// ======================================================================
export function onTele(m) {
  const color = m.c || '#ff3030';
  const meshes = m.sh.map((s) => { const g = makeTelegraph(s, color, heightAt); scene.add(g); return g; });
  teles.push({ meshes, sh: m.sh, start: now(), dur: m.d / 1000, dmg: m.dmg, color, src: m.src, kd: !!m.kd });
  const near = m.sh.some((s) => Math.hypot(s.x - me.x, s.z - me.z) < 25);
  if (near) audio.sfx('telegraph');
}

export function updateTeles() {
  const t = now();
  for (let i = teles.length - 1; i >= 0; i--) {
    const te = teles[i];
    const k = clamp((t - te.start) / te.dur, 0, 1);
    te.meshes.forEach((g) => g.setProgress(k));
    if (k >= 1) {
      resolveTele(te);
      te.meshes.forEach((g) => fx.dispose(g));
      teles.splice(i, 1);
    }
  }
}

export function resolveTele(te) {
  const big = te.dmg > (S ? S.mhp * 0.12 : 20);
  for (const s of te.sh) {
    // 着弾演出
    const c = new THREE.Color(te.color);
    if (s.k === 'circle') { fx.ringWave(s.x, s.z, c, s.r, 0.35); fx.parts.burst(s.x, 0.3, s.z, Math.min(40, 6 + s.r * 4), { color: c, speed: 6, size: 0.5, life: 0.5, up: 2 }); }
    else if (s.k === 'ring') fx.ringWave(s.x, s.z, c, s.r1, 0.5);
    else {
      const len = s.len, n = Math.ceil(len / 2);
      for (let j = 0; j < n; j++) {
        const d = (j / n) * len;
        fx.parts.burst(s.x + Math.sin(s.a) * d, 0.3, s.z + Math.cos(s.a) * d, 4, { color: c, speed: 5, size: 0.5, life: 0.4 });
      }
    }
  }
  const nearSrc = te.sh.some((s) => Math.hypot(s.x - me.x, s.z - me.z) < 22);
  if (big && nearSrc) { audio.sfx('impact'); addShake(0.35); }
  if (me.dead || me.crawl) return;
  const hit = te.sh.some((s) => inShape(s, me.x, me.z));
  if (!hit) return;
  if (me.iframe > 0) { onJustDodge(); return; }
  if (wtCounter(mobs.get(te.src) || te.sh[0])) return; // 大剣カウンター: 強攻撃を押した直後に受けると受け流す
  if (te.src) net.send({ t: 'absorb', id: te.src }); // 狙われ役が攻撃を受けるとヘイトのリセットが少し延びる
  if (S.fx.has('aegis') && Math.random() < 0.25) {
    floatText(me.x, 2.4, me.z, '無効化!', 'info');
    audio.sfx('block');
    fx.ringWave(me.x, me.z, 0xffd84a, 2, 0.3, 1);
    return;
  }
  let raw = te.dmg;
  // 敵の正面で受けると苛烈、背後なら軽い
  const srcMob = mobs.get(te.src);
  if (srcMob) {
    const off = Math.abs(angDiff(Math.atan2(me.x - srcMob.x, me.z - srcMob.z), srcMob.a));
    if (off < THREE.MathUtils.degToRad(60)) raw *= tf('t_shell') ? 1 : 1.3; // 称号「甲殻の守り」は正面の割り増しなし
    else if (off > THREE.MathUtils.degToRad(120)) raw *= 0.7;
  }
  // 盾槍のガード（攻撃してきた方向が正面なら軽減）
  if (me.guarding && S.guard) {
    const src = mobs.get(te.src) || { x: te.sh[0].x, z: te.sh[0].z };
    const dirTo = Math.atan2(src.x - me.x, src.z - me.z);
    const centered = Math.hypot(src.x - me.x, src.z - me.z) < 0.5;
    if (centered || Math.abs(angDiff(dirTo, me.a)) < THREE.MathUtils.degToRad(80)) {
      if (te.src) net.send({ t: 'threat', id: te.src, n: Math.round(te.dmg * 3) });
      // ガードゲージが尽きたらガードブレイク（そのまま全部のダメージを受ける）
      if (guardDamage(raw, te.kd)) { takeDamage(raw, src, false, true); return; }
      raw *= S.flags.has('bulwark') ? 0 : 0.25;
      audio.sfx('block');
      fx.parts.burst(me.x + Math.sin(me.a) * 0.8, 1.2, me.z + Math.cos(me.a) * 0.8, 14, { color: 0xbfe0ff, speed: 5, size: 0.4, life: 0.35 });
      armCounter(); wtOnGuard(te.dmg, srcMob);
      // ガードで受けた: ひるみ・ダウンはせず、少し押し戻されるだけ（ガードとカウンター準備は続く）。鉄壁A「不動」は押し戻されない
      if (S.wt?.br('sp_iron') !== 'A') knockFrom(src, 0.8, 0.12);
      hitStop = 0.05;
      if (raw <= 0) { floatText(me.x, 2.4, me.z, '防御', 'info'); return; }
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
export const kbScale = () => ({ light: 1.3, medium: 1, heavy: 0.6 })[char.eq.armor?.armor] ?? 1.15;
export function knockFrom(src, dist, dur) {
  let dx = me.x - (src?.x ?? me.x), dz = me.z - (src?.z ?? me.z);
  let d = Math.hypot(dx, dz);
  if (d < 0.3) { dx = -Math.sin(me.a); dz = -Math.cos(me.a); d = 1; } // 真上からなら後ろへ
  const v = dist * kbScale() / dur;
  me.kbX = dx / d * v; me.kbZ = dz / d * v; me.kbT = dur;
  me.a = Math.atan2(-dx, -dz); // 攻撃してきた方を向いたまま飛ぶ
}
export function hitReaction(dmg, src, kd) {
  me.hurtT = 0.28;
  // 大剣の「剛体」: 溜め中はスーパーアーマー（破城の構えAの効果中も）。剛体Bは溜め中に吹き飛ばされない
  const armor = (me.charging && (S.wt?.lv('gt_armor') ?? 0) >= 1) || (S.wt?.br('gt_siege') === 'A' && hasBuff('gt_siege'));
  const canDown = now() >= (me.noDownT || 0) && !armor && !(me.charging && S.wt?.br('gt_armor') === 'B');
  if ((dmg >= S.mhp * REACT.down || kd) && canDown) {
    // ダウン（吹き飛び）
    hitStop = 0.09;
    knockFrom(src, 4, 0.32);
    me.downT = REACT.downT; me.downStart = now(); me.staggerT = 0;
    me.charging = false; me.guarding = false; me.queued = 0; me.swingT = 9; me.skillT = -1;
    me.noDownT = now() + REACT.downT + REACT.noDown;
    floatText(me.x, 2.8, me.z, 'ダウン!', 'info');
    fx.parts.burst(me.x, 0.4, me.z, 24, { color: 0xd8c8a8, speed: 5, size: 0.5, life: 0.5, gravity: 4 });
    addShake(0.5);
    return;
  }
  if (dmg >= S.mhp * (tf('t_relic') ? REACT.stagger * 2 : REACT.stagger) && me.hp > 0) {
    if (armor) { floatText(me.x, 2.8, me.z, 'スーパーアーマー', 'info'); return; }
    hitStop = 0.05;
    knockFrom(src, 1.4, 0.18);
    me.staggerT = 0.35; me.charging = false; me.guarding = false; me.queued = 0;
    return;
  }
  hitStop = Math.max(hitStop, 0.03);
}
// ダウン中に回避を押すと受け身（すぐ起き上がって転がる・無敵）
export function tryTech() {
  const k = now() - me.downStart;
  if (k < REACT.techFrom || k > REACT.techTo) return false;
  me.downT = 0; me.kbT = 0; me.dodgeCd = 0;
  floatText(me.x, 2.8, me.z, '受け身!', 'just');
  audio.sfx('perfect');
  fx.ringWave(me.x, me.z, 0x9affff, 2.5, 0.3);
  tryDodge();
  me.iframe = Math.max(me.iframe, 0.5);
  return true;
}
export function getUp() {
  me.downT = 0;
  me.iframe = Math.max(me.iframe, REACT.getupIframe);
  fx.parts.burst(me.x, 0.3, me.z, 10, { color: 0xd8c8a8, speed: 2, size: 0.4, life: 0.4, gravity: 2 });
}

// 被ダメージの共通処理（予兆・ボスの弾）。src: 攻撃してきた位置 / kd: 吹き飛ばす大技
export function takeDamage(raw, src = null, kd = false, guarded = false) {
  if (now() < (me.brokenT || 0)) raw *= GUARD.breakDmg; // ガードブレイク中は被ダメージ1.5倍
  if (S.wt?.ks2 === 'sw_berserk') raw *= 1 + 0.02 * me.mom; // 狂剣士: 勢いの分だけ被ダメージが増える
  if (S.wt?.ks2 === 'ax_reckless') raw *= 1.25; // 捨て身
  const backB = S.wt?.br('sw_tough') === 'B' && me.hp < S.mhp * 0.5 ? 15 : 0; // 不撓B「背水」
  const dr = clamp(buffMod('dr') + backB + wtDr() + (tf('t_relic') ? 8 : 0) + (tf('t_shell') ? 12 : 0) - (tf('t_berserk') ? 15 : 0), -100, 90);
  const dmg = Math.max(1, Math.round(raw * (1 - S.def / 100) * (1 - dr / 100) * rnd(0.9, 1.1)));
  me.hp -= dmg;
  me.lastHurt = now();
  floatText(me.x, 2.2, me.z, dmg, 'me');
  audio.sfx('hurt');
  addShake(0.3);
  ui.hurt();
  if (S.wt) wtOnHurt(guarded);
  // 被弾リアクション（のけぞり / ひるみ / ダウン）
  if (me.hp > 0 && !guarded) hitReaction(dmg, src, kd);
  if (me.hp <= 0 && S.flags.has('laststand') && now() - me.lastStandT > 90) {
    me.hp = 1; me.lastStandT = now(); me.iframe = 1.0;
    floatText(me.x, 2.8, me.z, '不屈!', 'just');
    audio.sfx('perfect');
    fx.beam(me.x, me.z, 0xffd84a, 8, 0.8, 0.8);
    return;
  }
  if (me.hp <= 0 && S.wt?.ks2 === 'ax_undying' && now() - (me.undyingT ?? -999) > 60) { // 不死身
    me.hp = 1; me.undyingT = now(); me.iframe = Math.max(me.iframe, 2);
    floatText(me.x, 2.8, me.z, '不死身!', 'just'); audio.sfx('perfect');
    fx.ringWave(me.x, me.z, 0xff3a3a, 3, 0.5); fx.flash(me.x, 1.5, me.z, 0xff3a3a, 50, 0.4);
    return;
  }
  if (me.hp <= 0) { fall(); return; }
}

export function onJustDodge() {
  floatText(me.x, 2.6, me.z, 'JUST回避!', 'just');
  audio.sfx('perfect');
  fx.ringWave(me.x, me.z, 0x9affff, 3, 0.3);
  if (S.justbuff > 0) addBuff('just', '見切り', 3, { dmgp: S.justbuff }, 0x9affff);
  if (S.wt?.br('sw_light') === 'A') { me.afterJust = true; floatText(me.x, 3.0, me.z, '後の先', 'just'); }
  if (S.wt?.br('dk_agile') === 'A') me.ambush = Math.max(me.ambush, 1); // 残影: 次の1撃は会心
  wtEye();
  if (S.counter > 0) {
    combat.circle(me.x, me.z, 5, S.counter / 100, { type: 'proc', noProc: true });
    fx.ringWave(me.x, me.z, 0xbff8ff, 5.5, 0.35);
  }
  if (S.fx.has('mirror')) {
    addBuff('mirror', '八咫の加護', 5, { dmgp: 50 }, 0xffffff);
    fx.ringWave(me.x, me.z, 0xffffff, 7, 0.5);
    fx.parts.burst(me.x, 1, me.z, 60, { color: 0xbff8ff, speed: 10, size: 0.6 });
    combat.circle(me.x, me.z, 6, 3.0, { type: 'proc', noProc: true });
  }
}

// HPが0 → 這いずり状態。仲間に攻撃（のスタン値）を当ててもらうと起き上がる。
// エリアの全員が倒れたら力尽きる（判定はサーバー。ひとりなら即座に力尽きる）
export function fall() {
  if (me.crawl || me.dead) return;
  // 称号「不死鳥」: その場で一度だけ復活
  if (tf('t_phoenix') && now() - (me.phoenixT ?? -1e9) > 300) {
    me.phoenixT = now();
    me.hp = Math.round(S.mhp * 0.3); me.iframe = 1.5; me.staggerT = 0;
    banner('不死鳥', '炎の中からよみがえった', '#ff9a4a', 3);
    fx.beam(me.x, me.z, 0xff8a30, 14, 1.0, 1.2);
    fx.parts.burst(me.x, 1, me.z, 120, { color: 0xff8a30, speed: 9, size: 0.6, life: 1.1, gravity: -3 });
    audio.sfx('phase');
    return;
  }
  // 最近倒れた回数ほど起こしにくい（ゲージ ×1 → ×2.5 → ×4。円は 1/3 → 2/3 → 1周に見せる）
  me.downs = Math.min(REVIVE.mult.length, me.downs + 1); me.downsAt = now();
  me.crawl = true; me.rv = REVIVE.disp[reviveStep(me.downs)]; me.hp = 0;
  me.charging = false; me.guarding = false; me.counter = false; me.buffs = []; me.queued = 0;
  me.downT = 0; me.kbT = 0; me.staggerT = 0; me.dodgeT = 0; me.dashT = 0; me.sweepT = 0; me.skillT = -1; me.swingT = 9;
  net.send({ t: 'down', n: me.downs });
  banner('這いずり状態', '仲間に攻撃を当ててもらうと起き上がれる', '#ff9a8a', 4);
  audio.sfx('hurt');
  fx.parts.burst(me.x, 0.5, me.z, 40, { color: 0xff9a8a, speed: 5, size: 0.45, life: 0.8 });
}
export function revived(by) {
  if (!me.crawl) return;
  me.crawl = false; me.rv = -1;
  me.hp = Math.round(S.mhp * REVIVE.hp); me.iframe = REVIVE.iframe; me.noDownT = now() + REVIVE.iframe;
  banner('復活', `${by} に起こしてもらった`, '#9affc8', 3);
  audio.sfx('levelup');
  fx.beam(me.x, me.z, 0x9affc8, 10, 0.9, 1.0);
  fx.ringWave(me.x, me.z, 0x9affc8, 4, 0.5);
}
// 倒れている仲間に攻撃が当たった → スタン値ぶんゲージを減らす（ダメージは関係なし）
export function reviveHit(o, opt) {
  if (me.crawl || me.dead || !(o.rv >= 0) || now() - (o.revHitT || 0) < 0.05) return;
  o.revHitT = now();
  const v = Math.min(REVIVE.perHit, stunValue(opt));
  if (v <= 0) return;
  net.send({ t: 'rev', id: o.id, v });
  floatText(o.x, 2.2, o.z, `起こす +${v}`, 'info');
  fx.parts.burst(o.x, 0.8, o.z, 12, { color: 0x9affc8, speed: 4, size: 0.4, life: 0.4 });
}
// 這いずり中: ゆっくり這って動けるだけ（攻撃・回避・ポーション・出口は使えない）
export function crawlTick(dt) {
  let dx = 0, dz = 0;
  if (keys.has('w') || keys.has('arrowup')) dz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dz += 1;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  if (Math.hypot(touch.stick.x, touch.stick.y) > 0.12) { dx = touch.stick.x; dz = touch.stick.y; }
  const l = Math.hypot(dx, dz);
  me.moving = l > 0;
  me.hp = 0;
  if (!l) return;
  moveMe(dx / l * REVIVE.crawl * dt, dz / l * REVIVE.crawl * dt);
  me.a = Math.atan2(dx, dz);
  me.walkT += dt * 0.5;
  if (Math.random() < 0.15) fx.parts.emit(me.x, 0.2, me.z, { color: 0xd8c8a8, size: 0.35, life: 0.4, speed: 0.6, gravity: 1 });
}
export const downedAllies = () => [...others.values()].filter((o) => o.rv >= 0);

export function die() {
  me.crawl = false; me.rv = -1;
  const removed = characterStore.discard();
  toast(removed ? '戦闘不能：このキャラクターのセーブデータを失いました' : 'キャラクターを失いました。ブラウザの保存データを削除できませんでした。', '#f99');
  me.hp = 0; me.dead = true; me.deadT = BALANCE.deathSeconds; me.deathAt = now() + BALANCE.deathSeconds; me.charging = false; me.guarding = false; me.buffs = []; me.downT = 0; me.kbT = 0;
  audio.sfx('death');
  fx.parts.burst(me.x, 1, me.z, 80, { color: 0x9ad8ff, speed: 8, size: 0.5, life: 1.2 });
}

export function setHitStop(v) { hitStop = v; }
