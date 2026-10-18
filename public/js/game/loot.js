import { RARITIES, TITLES, displayName, isLegend, salvageMats, transcendCount } from '../../shared/data.js';
import { collide } from '../../shared/areas.js';
import { clamp, rnd } from './util.js';
import { SHARD_COLOR, harvest } from './items.js';
import { field, rules, screen, state, stats, view } from './ports.js';

// ======================================================================
// ドロップ
// ======================================================================
// 落ちた物は宙を舞って地面に落ち（flip）、着地すると名前の札が出る。札をクリックで拾う（遠ければ歩いて行く）
export const LOOT = { flip: 0.55, height: 2.4, toss: 1.6, pickR: 2.4, touch: 1.3, life: 150, stagger: 0.16 };
export const TRANS_COLOR = 0xff7ab0; // 超越の特性の色
export let dropSeq = 0;
// src: 飛び出す元（倒した敵・宝箱）。なければ近くから放り出す / delay: 何秒後に飛び出すか
export function spawnDrop(it, x, z, src = null, delay = 0) {
  const model = view.makeLootItem(it);
  const a = Math.random() * Math.PI * 2;
  const ox = src ? src.x : x - Math.sin(a) * LOOT.toss, oz = src ? src.z : z - Math.cos(a) * LOOT.toss, oy = src?.y ?? 1;
  model.position.set(ox, field.heightAt(ox, oz) + oy, oz);
  model.visible = false; // 飛び出す瞬間に見せて音を鳴らす
  view.scene.add(model);
  state.drops.push({ id: ++dropSeq, it, x, z, ox, oz, oy, model, beam: null, t: -delay, landed: false, spin: rnd(-1, 1) });
}
// 着地: 物の音＋レア度の合図。エピック以上は光の柱
export function landDrop(d) {
  d.landed = true;
  const r = d.it.rarity, col = RARITIES[r].color;
  d.model.position.set(d.x, field.heightAt(d.x, d.z), d.z);
  d.model.userData.item.rotation.set(0, d.spin * Math.PI, 0);
  const stars = transcendCount(d.it);
  if (Math.hypot(d.x - state.me.x, d.z - state.me.z) < 40) view.audio.sfx('drop', { rarity: r, slot: d.it.slot, stars });
  view.fx.parts.burst(d.x, 0.2, d.z, 6 + r * 4, { color: r >= 2 ? col : 0xd8c8a8, speed: 2 + r * 0.6, size: 0.35, life: 0.45, gravity: 2 });
  if (stars) {
    // 超越: 桃色の光の柱と、星が舞い上がる
    d.beam = view.fx.beam(d.x, d.z, TRANS_COLOR, 12 + stars * 4, 0.45 + stars * 0.1);
    view.fx.parts.burst(d.x, 0.5, d.z, 30 + stars * 20, { color: TRANS_COLOR, speed: 5, size: 0.5, life: 1.0, gravity: -3 });
    view.fx.ringWave(d.x, d.z, TRANS_COLOR, 4 + stars * 2, 0.6);
  } else if (r >= 4) d.beam = view.fx.beam(d.x, d.z, col, r === 4 ? 14 : 22, r === 4 ? 0.45 : 0.7); // 逸品以上は光の柱（傑作・伝説・神器は太く高い）
  if (r === 5) {
    // 傑作: 金の光がはじける
    view.fx.flash(d.x, 2, d.z, col, 60, 0.6, 20);
    view.fx.parts.burst(d.x, 0.5, d.z, 40, { color: col, speed: 6, size: 0.5, life: 0.9, gravity: -2 });
    view.fx.ringWave(d.x, d.z, col, 6, 0.6);
  }
  if (isLegend(r)) {
    view.fx.flash(d.x, 3, d.z, col, 120, 1.2, 40);
    view.fx.ringWave(d.x, d.z, col, 10, 1.0);
    if (r === 7) rules.addShake(1); // 画面の揺れは神器だけ
  }
}

export function disposeDrop(d) {
  view.fx.dispose(d.model);
  if (d.beam) view.fx.dispose(d.beam);
}

export function pickupDrop(d) {
  if (state.char.inv.length >= 60) { screen.toast('インベントリがいっぱい！（Iで分解）', '#f88'); return false; }
  state.char.inv.unshift(d.it);
  state.saveChar();
  view.audio.sfx('pickup');
  const it = d.it, r = it.rarity, col = RARITIES[r].color, stars = transcendCount(it), name = displayName(it);
  const cmp = stats.itemPower(it) > stats.itemPower(state.char.eq[it.slot]) ? '  ▲' : '';
  screen.toast(`${RARITIES[r].name}「${name}」を入手${cmp}`, col, r >= 5 || stars > 0);
  // レアな物の画面通知は、拾ったときに出す（落ちたときは札と音と光だけ）
  const what = it.slot === 'weapon' ? '武器' : it.slot === 'armor' ? '防具' : it.slot === 'title' ? '称号' : '装飾品';
  if (isLegend(r)) screen.banner(r === 7 ? '神器を入手' : '伝説の' + what + 'を入手', name, col, r + stars);
  else if (r === 5) screen.banner('傑作の' + what + 'を入手', name, col, 5 + stars);
  else if (stars) screen.banner('超越の' + what + 'を入手', name, '#ff7ab0', 4);
  else if (it.slot === 'title') screen.banner('称号を入手', name, col, 3);
  if (it.slot === 'title' && TITLES[it.title]) screen.toast(`${it.name}：${TITLES[it.title].desc}`, col);
  disposeDrop(d);
  state.drops.splice(state.drops.indexOf(d), 1);
  if (state.me.lootGo === d.id) state.me.lootGo = 0;
  screen.ui.refresh();
  return true;
}
// 体が触れると拾う。札をクリック: 近ければ拾い、遠ければそこまで歩いてから拾う（移動キーで取りやめ）
export function lootClick(id) {
  const d = state.drops.find((q) => q.id === id);
  if (!d || !d.landed || state.me.dead || state.me.crawl) return;
  if (Math.hypot(d.x - state.me.x, d.z - state.me.z) <= LOOT.pickR) pickupDrop(d);
  else state.me.lootGo = d.id;
}
export function lootWalk(dt) {
  const d = state.drops.find((q) => q.id === state.me.lootGo);
  if (!d) { state.me.lootGo = 0; return; }
  const dx = d.x - state.me.x, dz = d.z - state.me.z, l = Math.hypot(dx, dz);
  if (l <= LOOT.pickR * 0.8) { pickupDrop(d); return; }
  const sp = 7.2 * (1 + (stats.S.move + stats.buffMod('move') + rules.titleMove()) / 100);
  rules.moveMe(dx / l * sp * dt, dz / l * sp * dt);
  state.me.a = Math.atan2(dx, dz); state.me.moving = true; state.me.walkT += dt;
}

export function updateDrops(dt) {
  for (let i = state.drops.length - 1; i >= 0; i--) {
    const d = state.drops[i];
    d.t += dt;
    const item = d.model.userData.item;
    if (!d.landed) {
      if (d.t < 0) continue; // 順番待ち
      if (!d.model.visible) {
        d.model.visible = true;
        if (Math.hypot(d.ox - state.me.x, d.oz - state.me.z) < 40) view.audio.sfx('lootpop');
        view.fx.parts.burst(d.ox, d.oy, d.oz, 5, { color: RARITIES[d.it.rarity].color, speed: 3, size: 0.3, life: 0.3 });
      }
      // 宙を舞う: 放物線で飛びながら回る
      const k = Math.min(1, d.t / LOOT.flip);
      const x = d.ox + (d.x - d.ox) * k, z = d.oz + (d.z - d.oz) * k;
      d.model.position.set(x, field.heightAt(x, z) + LOOT.height * 4 * k * (1 - k) + d.oy * (1 - k), z);
      item.rotation.set(d.t * 14, d.t * 9 * d.spin, d.t * 6);
      if (k >= 1) landDrop(d);
      continue;
    }
    if (d.beam) d.beam.material.uniforms.uTime.value = d.t;
    if (d.model.userData.halo) d.model.userData.halo.material.opacity = (0.16 + d.it.rarity * 0.04) * (0.75 + 0.25 * Math.sin(d.t * 3));
    if (d.t > LOOT.life) { disposeDrop(d); state.drops.splice(i, 1); continue; }
    // 体が触れたら拾う（いっぱいのときは、たまに知らせるだけ）
    if (!state.me.dead && !state.me.crawl && Math.hypot(d.x - state.me.x, d.z - state.me.z) <= LOOT.touch) {
      if (state.char.inv.length < 60) pickupDrop(d);
      else if (fullWarnT <= 0) { pickupDrop(d); fullWarnT = 3; }
    }
  }
  fullWarnT -= dt;
}
export let fullWarnT = 0;

// ======================================================================
// ゴールド: 硬貨が飛び散って跳ね、近づくと吸い寄せられて拾える。大金は金貨袋
// ======================================================================
export const coins = [];
export const GOLD_MAGNET = 4.5;
export let goldGainBuf = 0, goldGainT = 0, coinSfxT = 0;
export function spawnGold(n, x, z, bag = false) {
  n = Math.max(1, Math.round(n));
  if (Math.hypot(x - state.me.x, z - state.me.z) < 30) view.audio.sfx(bag ? 'drop' : 'coins', { n: Math.min(10, Math.ceil(Math.sqrt(n))), rarity: 3 });
  if (bag) {
    const model = view.makeGoldBag();
    model.position.set(x, field.heightAt(x, z), z);
    view.scene.add(model);
    const a = Math.random() * Math.PI * 2;
    // 金貨袋の光の柱は袋といっしょに動き、拾ったら消える（以前は消えずに地面に残っていた）
    const beam = view.fx.beam(x, z, 0xffd84a, 8, 0.35);
    coins.push({ bag: true, model, beam, value: n, x, z, y: 1.2, vx: Math.sin(a) * 1.5, vz: Math.cos(a) * 1.5, vy: 7, t: 0, spin: 0 });
    view.fx.parts.burst(x, 1, z, 40, { color: 0xffd84a, speed: 6, size: 0.45, life: 0.9, gravity: 6 });
    return;
  }
  // 硬貨の枚数は金額の平方根くらい（3〜14枚）。端数は最初の1枚に
  const k = clamp(Math.round(Math.sqrt(n)), Math.min(3, n), 14);
  const each = Math.floor(n / k);
  for (let i = 0; i < k; i++) {
    const model = view.makeCoin();
    const a = Math.random() * Math.PI * 2, sp = rnd(1.5, 4.5);
    model.position.set(x, 1 + view.fx.ground(x, z), z);
    view.scene.add(model);
    coins.push({ model, value: each + (i === 0 ? n - each * k : 0), x, z, y: 1.0 + view.fx.ground(x, z), vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: rnd(5, 8.5), t: 0, spin: rnd(8, 16), bounces: 0 });
  }
}
export function addGold(n, bonus = true) {
  if (bonus && rules.tf('t_lake')) n = Math.round(n * 1.3);
  if (bonus && rules.tf('t_lucky')) n = Math.round(n * 1.15);
  state.char.gold = (state.char.gold || 0) + n;
  goldGainBuf += n; goldGainT = 0.35;
}
export function disposeCoin(c) { view.fx.dispose(c.model); if (c.beam) view.fx.dispose(c.beam); }
export function collectCoin(c) {
  if (c.mat) {
    // 強化の欠片（自動分解で出たもの）: 分解と同じ素材が手に入る
    harvest(c.mat);
    view.audio.sfx('shard');
    screen.floatText(state.me.x, 2.6, state.me.z, `強化の欠片 +${salvageMats(c.mat).shard}`, 'info');
    view.fx.parts.burst(state.me.x, 1.2, state.me.z, 8, { color: SHARD_COLOR, speed: 3, size: 0.3, life: 0.35, gravity: 0 });
    disposeCoin(c);
    state.saveChar(); screen.ui.refresh();
    return;
  }
  addGold(c.value);
  if (c.bag) {
    view.audio.sfx('bag');
    view.fx.parts.burst(c.x, 1, c.z, 50, { color: 0xffd84a, speed: 7, size: 0.5, life: 0.8, gravity: 4 });
    view.fx.ringWave(c.x, c.z, 0xffd84a, 3, 0.35);
  } else {
    // 連続で拾ったときは音を間引く（重なりすぎてうるさくならないように）
    if (coinSfxT <= 0) { view.audio.sfx('coin', { vol: 1 }); coinSfxT = 0.035; }
    view.fx.parts.burst(state.me.x, 1.2, state.me.z, 4, { color: 0xffe080, speed: 3, size: 0.3, life: 0.3, gravity: 0 });
  }
  disposeCoin(c);
}
export function updateCoins(dt) {
  coinSfxT -= dt;
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.t += dt;
    const ground = field.heightAt(c.x, c.z) + (c.bag ? 0 : 0.17);
    const dx = state.me.x - c.x, dz = state.me.z - c.z, d = Math.hypot(dx, dz);
    const settled = c.t > (c.bag ? 0.7 : 0.45);
    if (settled && !state.me.dead && d < (c.bag ? 2.6 : GOLD_MAGNET) * (rules.tf('t_lake') ? 2 : 1)) {
      // 吸い寄せ: 近いほど速く、少し浮き上がって飛んでくる
      const sp = (c.bag ? 9 : 14) + (GOLD_MAGNET - d) * 4;
      c.x += dx / (d || 1) * Math.min(d, sp * dt); c.z += dz / (d || 1) * Math.min(d, sp * dt);
      c.y += ((ground + 0.9) - c.y) * Math.min(1, dt * 8);
      if (d < 0.6) { collectCoin(c); coins.splice(i, 1); continue; }
    } else if (c.y > ground || c.vy > 0) {
      // 放物線で飛んで、地面で跳ねる
      c.vy -= 22 * dt;
      c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
      const col = collide(state.world.def, c.x, c.z, 0.2, state.world.door); c.x = col.x; c.z = col.z;
      if (c.y <= ground) {
        c.y = ground;
        if (Math.abs(c.vy) > 2.2) {
          c.vy = -c.vy * 0.38; c.vx *= 0.6; c.vz *= 0.6;
          if (!c.bag && c.bounces++ < 1 && coinSfxT <= 0 && d < 20) { view.audio.sfx('coin', { vol: 0.45 }); coinSfxT = 0.03; }
          if (c.bag) { rules.addShake(0.1); view.fx.parts.burst(c.x, 0.2, c.z, 10, { color: 0xd8c8a0, speed: 3, size: 0.4, life: 0.4, up: 1 }); }
        } else { c.vy = 0; c.vx = 0; c.vz = 0; }
      }
    }
    // 見た目: 硬貨は回転しながら、地面ではキラッと光る。袋は少し弾む
    if (c.bag) {
      c.model.position.set(c.x, c.y, c.z);
      c.model.userData.body.rotation.y += dt * 1.2;
      c.model.userData.halo.material.opacity = 0.35 + Math.sin(c.t * 4) * 0.2;
      if (c.beam) { c.beam.position.set(c.x, field.heightAt(c.x, c.z), c.z); c.beam.material.uniforms.uTime.value = c.t; }
      if (Math.random() < 0.15) view.fx.parts.emit(c.x + rnd(-0.4, 0.4), c.y + rnd(0.3, 1), c.z + rnd(-0.4, 0.4), { abs: true, color: 0xfff0a0, size: 0.3, life: 0.5, speed: 0.3, gravity: -1 });
    } else {
      c.model.position.set(c.x, c.y, c.z);
      const b = c.model.userData.body;
      b.rotation.y += c.spin * dt;
      if (c.vy === 0 && c.y <= ground + 0.01) { c.spin = Math.max(2.5, c.spin * (1 - dt * 2)); }
      if (Math.random() < 0.012) view.fx.parts.emit(c.x, c.y + 0.2, c.z, { abs: true, color: 0xffffff, size: 0.35, life: 0.25, speed: 0, gravity: 0 });
    }
    if (c.t > 90) { disposeCoin(c); coins.splice(i, 1); }
  }
  // 拾った金額はまとめて表示（チャリチャリ拾っている間は合算）
  if (goldGainBuf > 0) {
    goldGainT -= dt;
    if (goldGainT <= 0) { screen.floatText(state.me.x, 2.9, state.me.z, `+${goldGainBuf} G`, 'gold'); goldGainBuf = 0; state.saveChar(); screen.ui.refresh(); }
  }
}
// エリア移動などで残った硬貨は、そのまま所持金に入れる
export function flushCoins() {
  for (const c of coins.splice(0)) { if (c.mat) harvest(c.mat); else addGold(c.value); disposeCoin(c); }
}
