// 盾槍の武器ツリーの効果（竜騎士・間合い・騎士・盾の心得 など）と、盾槍のガードカウンター。差し込み口は game/weapon-fx.js
import { TREE_MOTIONS } from '../../../shared/tree-motions.js';
import { RARITIES } from '../../../shared/data.js';
import { now, rnd } from '../util.js';

// api: 武器の効果に渡す道具（game/weapon-api.js が役目ごとの小さな形で作る）。game/weapons/index.js が呼ぶ
export default function installSpear({ player, field, attack, tree, show, register }) {
  const { me, hasBuff, setHitStop } = player;
  const { aimAngle, aimPoint } = field;
  const { strikes, dealDamage, SWEEP, ATK_TYPES, later } = attack;
  const { quietBuff, wtEmit } = tree;
  const { fx, audio, floatText, addShake, bannerMesh, handTracker } = show;

  // 攻撃が槍の先端で当たったか（間合い）: 1 = 先端 / -1 = 近すぎ / 0 = それ以外・対象外
  function spTip(o) {
    if (player.S.wt?.ks1 !== 'sp_reach' || o.tip == null || !ATK_TYPES.includes(o.type)) return 0;
    return o.tip >= 0.7 ? 1 : o.tip < 0.4 ? -1 : 0;
  }
  // 突きの届く距離の倍率（槍の心得A「長柄」は通常攻撃だけ・騎士の雷は突き全部）
  const spReach = (normal) => (normal && player.S.wt?.br('sp_spear') === 'A' ? 1.2 : 1) * (hasBuff('sp_thunder') ? 1.5 : 1);
  // 騎士: 突きが雷をまとう
  function spThunder() {
    if (!hasBuff('sp_thunder')) { fx.lightning(me.x, me.z, 0x9ad8ff); audio.sfx('thunder'); }
    quietBuff('sp_thunder', '雷槍', 3, {}, 0x9ad8ff);
  }
  // 竜騎士の強攻撃: 高く跳んで狙った場所へ突き降りる（空中は無敵）
  const JUMP = { air: 0.55, mult: [0, 5.0, 7.5], range: [0, 5, 8], r: 2.5 };
  function spJump(lv, soared = false) {
    const p = aimPoint(), a = Math.atan2(p.x - me.x, p.z - me.z);
    const d = Math.min(JUMP.range[lv], Math.hypot(p.x - me.x, p.z - me.z));
    const M = TREE_MOTIONS.sp_jump;
    me.a = a; me.swingT = 9; me.motion = M.id; me.motionT = 0; me.skillT = 0; me.skillDuration = M.duration; me.act++;
    strikes.dash(a, Math.max(0.01, d), JUMP.air, JUMP.air + 0.15);
    fx.parts.burst(me.x, 0.3, me.z, 18, { color: 0xd8c8a8, speed: 4, size: 0.45, life: 0.4, up: 3 });
    audio.sfx('dodge');
    later(JUMP.air, () => {
      if (me.dead) return;
      strikes.circle(me.x, me.z, JUMP.r, JUMP.mult[lv], { type: 'heavy', stun: 10 });
      fx.ringWave(me.x, me.z, RARITIES[player.S.wr].color, JUMP.r + 0.6, 0.35); fx.flash(me.x, 1, me.z, 0xffffff, 40, 0.25);
      fx.parts.burst(me.x, 0.3, me.z, 40, { color: 0xc8b090, speed: 7, size: 0.5, life: 0.6, up: 2 });
      audio.sfx('heavy'); addShake(lv === 2 ? 0.5 : 0.3); setHitStop(0.06);
      if (player.S.wt?.ks2 === 'sp_fang') later(0.08, () => { // 竜の牙: 着地点から衝撃が広がる
        strikes.circle(me.x, me.z, 4.5, 3.0, { type: 'heavy', stun: 20 });
        fx.ringWave(me.x, me.z, 0xff8a4a, 5, 0.45); fx.parts.burst(me.x, 0.4, me.z, 50, { color: 0xff8a4a, speed: 9, size: 0.55, life: 0.6, up: 2 }); addShake(0.4);
      });
      if (player.S.wt?.ks2 === 'sp_soar' && !soared) { me.soarReady = now() + 1.5; fx.ringWave(me.x, me.z, 0x9affc8, 1.6, 0.3); }
    });
  }
  // 旗手: ガードカウンターした場所に旗を立てる
  function spBanner(x, z) {
    const old = me.banner && fx.items.find((it) => it.obj === me.banner.mesh);
    if (old) old.life = 0; // 前の旗は消す
    const { g, flag, ring } = bannerMesh();
    g.position.set(x, 0, z);
    fx.add(g, 8, (o, k) => { flag.rotation.y = Math.sin(k * 40) * 0.3; ring.material.opacity = 0.35 * (1 - k * 0.5); });
    me.banner = { x, z, until: now() + 8, mesh: g };
    fx.beam(x, z, 0x6ab0ff, 4, 0.5, 0.5);
  }
  // 一点突破: 溜めた次の突きが前方を貫く衝撃になる
  function spPierce(a) {
    if (!me.pierceReady) return;
    me.pierceReady = false;
    strikes.proj({ a, mult: 1.6, type: 'normal', speed: 30, life: 0.45, rad: 1.3, color: 0xfff0a0, wtNo: true });
    fx.flash(me.x, 1.3, me.z, 0xfff0a0, 30, 0.2);
  }
  const handPos = handTracker();

  // 第3引数: 呼ぶ順（小さいほど先。書いていない場面は登録した順で、順の付いたものより後）。倍率を掛ける順などを元と同じに保つ
  register('spear', {
    // 竜騎士はガードの代わりに跳ぶ
    stats(S, WT) { S.guard = S.guard && WT?.ks1 !== 'sp_dragoon'; },
    dmgMult(k, W, o, mb) {
      const tip = spTip(o);
      if (tip === 1) k *= 1.25; else if (tip === -1) k *= 0.8;
      if (hasBuff('sp_thunder') && (o.type === 'normal' || o.type === 'heavy')) k *= 1.2;
      if (W.br('sp_brk') === 'A' && mb?.stunT > 0) k *= 1.2;
      return k;
    },
    // 間合い: 槍の先端は必ず会心
    critAfter: (mb, o) => spTip(o) === 1,
    // 間合い支配: 先端で当てた雑魚を押し戻す
    hitTech: (tech, o, mb) => (player.S.wt?.ks2 === 'sp_hold' && spTip(o) === 1 && mb.kind !== 2 ? 'spear_press' : tech),
    // 範囲攻撃の当たり: 間合いのときは、届く距離のどのあたりで当たったか（tip）を付ける
    hitOpts: (o, frac) => (player.S.wt?.ks1 === 'sp_reach' ? { ...o, tip: frac } : o),
    reach: (k, normal) => (player.S.wk !== 'spear' ? k : k * spReach(normal)),
    swingColor: (col) => (hasBuff('sp_thunder') ? 0x9ad8ff : col),
    // 槍の心得B「連突き」と一点突破（通常攻撃）
    swingExtra(a, range, col) {
      const W = player.S.W;
      if (player.S.wt?.br('sp_spear') === 'B' && me.combo === 2) later(0.2, () => { strikes.arc(range, W.arc, 0.6, { a, type: 'normal' }); fx.slash(me.x, me.z, a, range, W.arc, col, 0.8); }); // 連突き
      spPierce(a);
    },
    // 先端の連続（一点突破）と雷槍
    onHit(mb, dmg, crit, o) {
      const W = player.S.wt;
      if (W.ks1 === 'sp_reach' && me.tipAct !== me.act && ATK_TYPES.includes(o.type)) {
        me.tipAct = me.act;
        me.tipRun = spTip(o) === 1 ? me.tipRun + 1 : 0;
        if (W.ks2 === 'sp_pierce' && me.tipRun >= 3 && !me.pierceReady) { me.pierceReady = true; me.tipRun = 0; floatText(me.x, 3.1, me.z, '一点突破', 'just'); fx.ringWave(me.x, me.z, 0xfff0a0, 1.8, 0.3); }
      }
      if (spTip(o) === 1) fx.flash(mb.x, 1.3, mb.z, 0xfff0a0, 14, 0.12);
      if (W.ks2 === 'sp_bolt' && hasBuff('sp_thunder') && (o.type === 'normal' || o.type === 'heavy') && now() - me.boltT > 0.3) {
        me.boltT = now();
        const x = mb.x, z = mb.z;
        later(0.06, () => { fx.lightning(x, z, 0x9ad8ff); strikes.circle(x, z, 2.5, 0.6, { type: 'proc', noProc: true }); audio.sfx('thunder'); });
      }
    },
    // 迎撃の構えA「雷の構え」: 構えている間に受けると雷をまとう
    onHurtFirst() { if (player.S.wt.br('sp_intercept') === 'A' && hasBuff('sp_intercept')) spThunder(); },
    onGuard(raw, src) {
      const W = player.S.wt;
      if (W.br('sp_intercept') === 'A' && hasBuff('sp_intercept')) spThunder();
      if (W.br('sp_shield') === 'B' && src?.hp > 0) dealDamage(src, 0.3, { type: 'proc', stun: 6, noProc: true }); // 盾の重み
    },
    // 鉄壁A「不動」: ガードで受けても押し戻されない
    steadyGuard: () => player.S.wt?.br('sp_iron') === 'A',
    // 盾の心得: ガードゲージの減りが少ない / 挑発A「威圧」: 効果中は減らない / 盾の心得A: 回復が2倍
    guardKeep: () => (player.S.wt?.br('sp_taunt') === 'A' && hasBuff('sp_taunt') ? 0 : 1 - (player.S.wt?.v('sp_shield', 'gauge') || 0) / 100),
    guardRegen: (k) => k * (player.S.wt?.br('sp_shield') === 'A' ? 2 : 1),
    // 竜翔: 溜めなしでもう一度跳ぶ
    chargeStart() {
      if (!(me.soarReady && now() < me.soarReady && !me.dead && me.downT <= 0 && me.staggerT <= 0)) return false;
      me.soarReady = 0; me.charging = false; me.skillT = -1;
      floatText(me.x, 3, me.z, '竜翔', 'just');
      spJump(2, true);
      return true;
    },
    // 竜騎士の強攻撃は跳躍
    heavyOverride(lv) { if (player.S.wt?.ks1 !== 'sp_dragoon') return false; spJump(lv); return true; },
    heavyStart() { if (player.S.wk === 'spear') { me.motion = 'heavy';me.motionT = 0; spPierce(me.a); } },
    // ガードカウンター: 騎士の雷・旗手・反撃の心得A/B と、回転なぎ払い（sweepTick）
    guardCounter() {
      if (player.S.wk !== 'spear') return false;
      const W = player.S.wt;
      if (W?.ks1 === 'sp_knight') spThunder();
      if (W?.ks2 === 'sp_banner') spBanner(me.x, me.z);
      if (W?.br('sp_ctr') === 'A') me.iframe = Math.max(me.iframe, SWEEP.dur);
      if (W?.br('sp_ctr') === 'B') later(SWEEP.dur, () => { if (!me.dead) { const a = aimAngle(); me.a = a; me.swingT = 0; me.swingDur = 0.4; me.combo = 2; me.sw++; strikes.line(6 * spReach(false), 2, 1.5, { type: 'heavy', a }); fx.slash(me.x, me.z, a, 6, 30, 0xbfe0ff, 1.2); audio.sfx('swing', { heavy: true }); } }); // 二段反撃
      me.swingT = 9; // 振りのモーションの代わりに回転なぎ払い
      me.sweepT = 1e-4; me.sweepHit = false;me.motion = 'counter';me.motionT = 0;
      audio.sfx('swing', { heavy: true });
      return true;
    },
    // 回転なぎ払いの威力（反撃の心得で強くなる。盾槍以外は半分）とスタン値（崩しの心得B）
    sweepPower: (k) => (player.S.wk === 'spear' ? 1 + (player.S.wt?.v('sp_ctr', 'ctr') || 0) / 100 : k),
    sweepStun: (k) => k * (player.S.wt?.br('sp_brk') === 'B' ? 2 : 1),
    // 竜騎士は盾を背負う（他のプレイヤーにも見せる）
    shieldBack: () => player.S.wt?.ks1 === 'sp_dragoon',
    aura(dt) {
      // 旗手: 旗のそばにいる間は守りと攻めが上がる
      if (me.banner) {
        if (now() > me.banner.until) me.banner = null;
        else if (Math.hypot(me.x - me.banner.x, me.z - me.banner.z) < 5) quietBuff('sp_banner', '旗手', 0.3, { dr: 20, atkp: 15 }, 0x6ab0ff);
      }
      // 騎士: 雷をまとう間、槍の穂先から火花
      if (hasBuff('sp_thunder')) {
        const hp = handPos(me.model);
        wtEmit('thunder', 30, dt, () => fx.parts.emit(hp.x + rnd(-0.4, 0.4), hp.y + rnd(0, 1.2), hp.z + rnd(-0.4, 0.4), { color: Math.random() < 0.5 ? 0xffffff : 0x9ad8ff, size: 0.28, life: 0.2, speed: 3, gravity: 0 }));
      }
      if (me.soarReady && now() < me.soarReady) wtEmit('soar', 20, dt, () => fx.parts.emit(me.x + rnd(-0.4, 0.4), 0.2, me.z + rnd(-0.4, 0.4), { color: 0x9affc8, size: 0.3, life: 0.5, speed: 1.5, gravity: -5 }));
    },
  }, { dmgMult: 3, onHit: 1, onHurtFirst: 0, onGuard: 0, heavyStart: 0, aura: 2 });
}
