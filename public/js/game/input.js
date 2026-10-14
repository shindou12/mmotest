import * as THREE from 'three';
import { clamp, now } from './util.js';
import { floatText } from './ui-bridge.js';
import { audio, camera, fx } from './render.js';
import { CAM_ZOOM, CHARGE_MIN, cam, keys, me, mouse, started } from './state.js';
import { S, bowRange, hasBuff } from './stats.js';
import { setHitStop } from './hurt.js';
import { addShake, touch } from './combat.js';
import { wtChargeStart } from './tree-effects.js';
import { doHeavy, tryDodge, tryTreeSkill, tryWeaponSkill, usePotion } from './actions.js';

// ======================================================================
// 入力
// ======================================================================
// 盾槍のガード（強攻撃の溜め中に自動で構える。スマホはガードボタンでも。ダウン中はできない）
// ガードカウンター: ガードで攻撃を受けてから離すと、強攻撃の代わりに回転なぎ払い（sweepTick）
export function startGuard() {
  if (!S?.guard || me.dead || me.crawl || me.downT > 0 || me.guarding || me.gg <= 0 || me.staggerT > 0) return;
  me.guarding = true; me.guardStart = now(); me.charging = false; me.counter = false; audio.sfx('equip');
}
// ガードゲージ: ガードで受けるたびに減り（受ける前のダメージに比例）、尽きるとガードブレイクで大きな隙。
// ガードしていない間、少したつと回復する。数値は最大HPに対する割合で決める（雑魚は何度か受けられ、ボスの大技は2〜3回で割れる）
export const GUARD = { max: 100, perHp: 120, kdExtra: 20, regenDelay: 1.0, regen: 34, breakT: 1.5, breakDmg: 1.5 };
me.gg = GUARD.max;
export function guardDamage(rawBefore, kd) {
  // 盾の心得: 減りが少ない / 挑発A「威圧」: 効果中は減らない
  const keep = S.wt?.br('sp_taunt') === 'A' && hasBuff('sp_taunt') ? 0 : 1 - (S.wt?.v('sp_shield', 'gauge') || 0) / 100;
  me.gg -= (rawBefore / S.mhp * GUARD.perHp + (kd ? GUARD.kdExtra : 0)) * keep;
  me.ggHitT = now();
  if (me.gg <= 0) { guardBreak(); return true; }
  if (me.gg < GUARD.max * 0.3) { audio.sfx('impact'); floatText(me.x, 2.4, me.z, '盾がきしむ…', 'info'); }
  return false;
}
export function guardBreak() {
  me.gg = 0;
  me.guarding = false; me.charging = false; me.counter = false; me.queued = 0;
  me.staggerT = GUARD.breakT; me.brokenT = now() + GUARD.breakT;
  floatText(me.x, 3, me.z, 'ガードブレイク!', 'info');
  audio.sfx('impact'); audio.sfx('block');
  fx.parts.burst(me.x + Math.sin(me.a) * 0.6, 1.2, me.z + Math.cos(me.a) * 0.6, 40, { color: 0xbfe0ff, speed: 7, size: 0.5, life: 0.6, gravity: 8 });
  fx.flash(me.x, 1.5, me.z, 0xff6a5a, 40, 0.3);
  addShake(0.5); setHitStop(0.1);
}
export function guardRegen(dt) {
  if (me.guarding || me.gg >= GUARD.max || now() - (me.ggHitT || 0) < GUARD.regenDelay || me.staggerT > 0) return;
  me.gg = Math.min(GUARD.max, me.gg + GUARD.regen * dt * (S.wt?.br('sp_shield') === 'A' ? 2 : 1));
}
// ガードで攻撃を受けた → カウンター準備
export function armCounter() {
  if (me.counter) return;
  me.counter = true;
  floatText(me.x, 2.8, me.z, 'カウンター準備!', 'just');
  audio.sfx('perfect');
  fx.ringWave(me.x, me.z, 0xbfe0ff, 2.2, 0.3);
}
// fire: スマホのガードボタンを離したとき（溜めていないので、ここでカウンターを出す）
export function endGuard(fire = false) {
  const counter = me.guarding && me.counter;
  me.guarding = false; me.counter = false;
  if (!counter) return;
  me.counterFire = true;
  if (fire) doHeavy(2);
}

// DOM のイベントは UI（ui/app.js）の Root 配下で受け、Mediator が裁定してからここを呼ぶ
export const input = {
  keyDown(k) {
    audio.init();
    if (!started) return;
    keys.add(k);
    // 操作: 左クリック 攻撃（長押しで強攻撃。盾槍はガード）/ 右クリック 武器スキル / Q・E スキル / Space 回避 / R 回復
    if (k === ' ') tryDodge();
    if (k === 'r') usePotion();
    if (k === 'q') tryTreeSkill(0);
    if (k === 'e') tryTreeSkill(1);
  },
  keyUp(k) { keys.delete(k); },
  blur() { keys.clear(); mouse.l = mouse.r = false; me.charging = false; me.guarding = false; },
  pointerMove(x, y) { mouse.x = x; mouse.y = y; },
  pointerDown(button) {
    audio.init();
    if (!started) return;
    // 長押しで強攻撃の溜め（盾槍は溜めている間ガードを構える）
    if (button === 0) { mouse.l = true; me.lootGo = 0; if (me.downT <= 0 && !me.crawl) { me.charging = true; me.chargeT = 0; me.chargeLv = 0; me.chargeStart = now(); wtChargeStart(); } }
    if (button === 2) { mouse.r = true; tryWeaponSkill(); }
  },
  pointerUp(button) {
    if (button === 0) {
      mouse.l = false;
      if (me.charging && started) {
        me.releaseRange = S?.W.ranged ? bowRange() : 0;
        me.charging = false;
        endGuard(); // 盾槍: 離したらガードを解いて強攻撃（ガードで受けていればガードカウンター）
        if (me.chargeT < CHARGE_MIN) me.queued = now() + 0.45; // 短押し → 通常攻撃（入力を少しの間覚えておく）
        else if (S?.wk === 'dagger' && me.chargeLv < 2) me.queued = now() + 0.45; // 短剣の瞬影は溜めきったときだけ（途中で離したら通常攻撃）
        else doHeavy(me.chargeLv);
      }
    }
    if (button === 2) mouse.r = false;
  },
  // ホイール1段で一定の比率だけ寄る/引く（どの距離でも同じ手触り）
  wheel(dy) { cam.zoomT = clamp(cam.zoomT * Math.exp(clamp(dy, -120, 120) * 0.0012), CAM_ZOOM[0], CAM_ZOOM[1]); },
  // ---- スマホ ----
  zoomBy(f) { cam.zoomT = clamp(cam.zoomT * f, CAM_ZOOM[0], CAM_ZOOM[1]); },
  setTouch(on) {
    if (touch.on === on) return;
    touch.on = on;
    if (on) cam.zoom = cam.zoomT = 1.12; // 画面が小さいので少し引く
  },
  stick(x, y) { touch.stick.x = x; touch.stick.y = y; },
  // ボタンを引っぱって狙う（len: 0〜1）。null で自動ターゲットに戻す
  aim(a, len = 0) { touch.aim = a; touch.aimLen = len; },
  // 右側のボタン
  button(act, down) {
    audio.init();
    if (!started) return;
    if (act === 'atk') return down ? input.pointerDown(0) : input.pointerUp(0);
    if (act === 'guard') return down ? startGuard() : endGuard(true);
    if (!down) return;
    if (act === 'skill') tryWeaponSkill();
    if (act === 't1') tryTreeSkill(0);
    if (act === 't2') tryTreeSkill(1);
    if (act === 'dodge') tryDodge();
    if (act === 'pot') usePotion();
  },
};

export const raycaster = new THREE.Raycaster();
export const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
export function updateMouseWorld() {
  const v = new THREE.Vector2((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(v, camera);
  groundPlane.constant = -1;
  raycaster.ray.intersectPlane(groundPlane, mouse.world);
}
