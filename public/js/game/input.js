import { clamp, now } from './util.js';
import { fxReduce, fxSome } from './weapon-fx.js';
import { rules, screen, state, stats, view } from './ports.js';

// ======================================================================
// 入力
// ======================================================================
// 盾槍のガード（強攻撃の溜め中に自動で構える。スマホはガードボタンでも。ダウン中はできない）
// ガードカウンター: ガードで攻撃を受けてから離すと、強攻撃の代わりに回転なぎ払い（sweepTick）
export function startGuard() {
  if (!stats.S?.guard || state.me.dead || state.me.crawl || state.me.downT > 0 || state.me.guarding || state.me.gg <= 0 || state.me.staggerT > 0) return;
  state.me.guarding = true; state.me.guardStart = now(); state.me.charging = false; state.me.counter = false; view.audio.sfx('equip');
}
// ガードゲージ: ガードで受けるたびに減り（受ける前のダメージに比例）、尽きるとガードブレイクで大きな隙。
// ガードしていない間、少したつと回復する。数値は最大HPに対する割合で決める（雑魚は何度か受けられ、ボスの大技は2〜3回で割れる）
export const GUARD = { max: 100, perHp: 120, kdExtra: 20, regenDelay: 1.0, regen: 34, breakT: 1.5, breakDmg: 1.5 };
// ガードゲージを満タンにしておく（組み立て役 wiring.js が起動のときに呼ぶ）
export function initGuard() { state.me.gg = GUARD.max; }
export function guardDamage(rawBefore, kd) {
  // 盾の心得: 減りが少ない / 挑発A「威圧」: 効果中は減らない（盾槍のファイル）
  const keep = fxReduce('guardKeep', 1);
  state.me.gg -= (rawBefore / stats.S.mhp * GUARD.perHp + (kd ? GUARD.kdExtra : 0)) * keep;
  state.me.ggHitT = now();
  if (state.me.gg <= 0) { guardBreak(); return true; }
  if (state.me.gg < GUARD.max * 0.3) { view.audio.sfx('impact'); screen.floatText(state.me.x, 2.4, state.me.z, '盾がきしむ…', 'info'); }
  return false;
}
export function guardBreak() {
  state.me.gg = 0;
  state.me.guarding = false; state.me.charging = false; state.me.counter = false; state.me.queued = 0;
  state.me.staggerT = GUARD.breakT; state.me.brokenT = now() + GUARD.breakT;
  screen.floatText(state.me.x, 3, state.me.z, 'ガードブレイク!', 'info');
  view.audio.sfx('impact'); view.audio.sfx('block');
  view.fx.parts.burst(state.me.x + Math.sin(state.me.a) * 0.6, 1.2, state.me.z + Math.cos(state.me.a) * 0.6, 40, { color: 0xbfe0ff, speed: 7, size: 0.5, life: 0.6, gravity: 8 });
  view.fx.flash(state.me.x, 1.5, state.me.z, 0xff6a5a, 40, 0.3);
  rules.addShake(0.5); rules.setHitStop(0.1);
}
export function guardRegen(dt) {
  if (state.me.guarding || state.me.gg >= GUARD.max || now() - (state.me.ggHitT || 0) < GUARD.regenDelay || state.me.staggerT > 0) return;
  state.me.gg = Math.min(GUARD.max, state.me.gg + GUARD.regen * dt * fxReduce('guardRegen', 1));
}
// ガードで攻撃を受けた → カウンター準備
export function armCounter() {
  if (state.me.counter) return;
  state.me.counter = true;
  screen.floatText(state.me.x, 2.8, state.me.z, 'カウンター準備!', 'just');
  view.audio.sfx('perfect');
  view.fx.ringWave(state.me.x, state.me.z, 0xbfe0ff, 2.2, 0.3);
}
// fire: スマホのガードボタンを離したとき（溜めていないので、ここでカウンターを出す）
export function endGuard(fire = false) {
  const counter = state.me.guarding && state.me.counter;
  state.me.guarding = false; state.me.counter = false;
  if (!counter) return;
  state.me.counterFire = true;
  if (fire) rules.doHeavy(2);
}

// DOM のイベントは UI（ui/app.js）の Root 配下で受け、Mediator が裁定してからここを呼ぶ
export const input = {
  keyDown(k) {
    view.audio.init();
    if (!state.started) return;
    state.keys.add(k);
    // 操作: 左クリック 攻撃（長押しで強攻撃。盾槍はガード）/ 右クリック 武器スキル / Q・E スキル / Space 回避 / R 回復
    if (k === ' ') rules.tryDodge();
    if (k === 'r') rules.usePotion();
    if (k === 'q') rules.tryTreeSkill(0);
    if (k === 'e') rules.tryTreeSkill(1);
  },
  keyUp(k) { state.keys.delete(k); },
  blur() { state.keys.clear(); state.mouse.l = state.mouse.r = false; state.me.charging = false; state.me.guarding = false; },
  pointerMove(x, y) { state.mouse.x = x; state.mouse.y = y; },
  pointerDown(button) {
    view.audio.init();
    if (!state.started) return;
    // 長押しで強攻撃の溜め（盾槍は溜めている間ガードを構える）
    if (button === 0) { state.mouse.l = true; state.me.lootGo = 0; if (state.me.downT <= 0 && !state.me.crawl) { state.me.charging = true; state.me.chargeT = 0; state.me.chargeLv = 0; state.me.chargeStart = now(); rules.wtChargeStart(); } }
    if (button === 2) { state.mouse.r = true; rules.tryWeaponSkill(); }
  },
  pointerUp(button) {
    if (button === 0) {
      state.mouse.l = false;
      if (state.me.charging && state.started) {
        state.me.releaseRange = stats.S?.W.ranged ? stats.bowRange() : 0;
        state.me.charging = false;
        endGuard(); // 盾槍: 離したらガードを解いて強攻撃（ガードで受けていればガードカウンター）
        if (state.me.chargeT < state.CHARGE_MIN) state.me.queued = now() + 0.45; // 短押し → 通常攻撃（入力を少しの間覚えておく）
        else if (fxSome('heavyNeedsFull') && state.me.chargeLv < 2) state.me.queued = now() + 0.45; // 短剣の瞬影は溜めきったときだけ（途中で離したら通常攻撃）
        else rules.doHeavy(state.me.chargeLv);
      }
    }
    if (button === 2) state.mouse.r = false;
  },
  // ホイール1段で一定の比率だけ寄る/引く（どの距離でも同じ手触り）
  wheel(dy) { view.cam.zoomT = clamp(view.cam.zoomT * Math.exp(clamp(dy, -120, 120) * 0.0012), state.CAM_ZOOM[0], state.CAM_ZOOM[1]); },
  // ---- スマホ ----
  zoomBy(f) { view.cam.zoomT = clamp(view.cam.zoomT * f, state.CAM_ZOOM[0], state.CAM_ZOOM[1]); },
  setTouch(on) {
    if (rules.touch.on === on) return;
    rules.touch.on = on;
    if (on) view.cam.zoom = view.cam.zoomT = 1.12; // 画面が小さいので少し引く
  },
  stick(x, y) { rules.touch.stick.x = x; rules.touch.stick.y = y; },
  // ボタンを引っぱって狙う（len: 0〜1）。null で自動ターゲットに戻す
  aim(a, len = 0) { rules.touch.aim = a; rules.touch.aimLen = len; },
  // 右側のボタン
  button(act, down) {
    view.audio.init();
    if (!state.started) return;
    if (act === 'atk') return down ? input.pointerDown(0) : input.pointerUp(0);
    if (act === 'guard') return down ? startGuard() : endGuard(true);
    if (!down) return;
    if (act === 'skill') rules.tryWeaponSkill();
    if (act === 't1') rules.tryTreeSkill(0);
    if (act === 't2') rules.tryTreeSkill(1);
    if (act === 'dodge') rules.tryDodge();
    if (act === 'pot') rules.usePotion();
  },
};

// マウスの指す地面（高さ1）の点
export function updateMouseWorld() { view.screenToGround(state.mouse.x, state.mouse.y, 1, state.mouse.world); }
