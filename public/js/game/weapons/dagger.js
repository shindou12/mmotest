// 短剣の武器ツリーの効果（連撃・毒・出血・暗殺・必殺・連刃 など）と、短剣の強攻撃「瞬影」の決まり。差し込み口は game/weapon-fx.js
import { TREE_MOTIONS } from '../../../shared/tree-motions.js';
import { KNIFE_COLOR } from '../../weapon-tree.js';
import { angDiff, now, degToRad } from '../util.js';

// api: 武器の効果に渡す道具（game/weapon-api.js が役目ごとの小さな形で作る）。game/weapons/index.js が呼ぶ
export default function installDagger({ player, attack, tree, show, register }) {
  const { me, hasBuff } = player;
  const { strikes, dealDamage, extendCombat, later } = attack;
  const { quietBuff } = tree;
  const { fx, audio, floatText } = show;

  // 敵の背後にいるか（敵の向きから120度以上うしろ）
  function wtBehind(mb) {
    if (!mb || mb.a == null) return false;
    return Math.abs(angDiff(Math.atan2(me.x - mb.x, me.z - mb.z), mb.a)) > degToRad(120);
  }
  // 毒・出血の強さ（毒の心得）と時間（長毒）
  const wtToxMul = () => 1 + (player.S.wt?.lv('dk_toxin') ? (player.S.wt.lv('dk_toxin') >= 2 ? 50 : 30) : 0) / 100;
  const wtToxDur = () => 4 * (player.S.wt?.br('dk_toxin') === 'A' ? 1.5 : 1);
  // 毒を重ねる（最大5。1つにつき毎秒15%）。猛毒は5つで破裂
  function addPoison(mb, n) {
    if (!mb || mb.hp <= 0 || !(n > 0)) return;
    mb.vStack = Math.min(5, (mb.vStack || 0) + n);
    mb.poisonUntil = now() + wtToxDur();
    if (player.S.wt?.ks2 === 'dk_burst' && mb.vStack >= 5) {
      mb.vStack = 0; mb.poisonUntil = 0;
      later(0.05, () => {
        if (mb.hp <= 0) return;
        dealDamage(mb, 3.0, { type: 'proc', noProc: true, wtNo: true });
        fx.parts.burst(mb.x, 1.2, mb.z, 40, { color: 0x8aff5a, speed: 7, size: 0.6, life: 0.6, gravity: 1 });
        fx.ringWave(mb.x, mb.z, 0x8aff5a, 2.6, 0.35); audio.sfx('hit', { crit: true });
      });
    }
  }
  // 毒の1回（0.5秒ごと）のダメージ。ポイズン・エッジA「致死毒」の効果中は2倍
  const wtPoisonTick = (mb) => 0.075 * mb.vStack * wtToxMul() * (player.S.wt?.br('dk_poison') === 'A' && hasBuff('dk_poison') ? 2 : 1);
  // 出血（毎秒 perSec。stack なら最大3まで重なる）
  function addBleed(mb, perSec, stack = false, sec = 4) {
    if (!mb || mb.hp <= 0) return;
    mb.bleedN = stack ? Math.min(3, (mb.bleedN || 0) + 1) : 1;
    mb.bleedPow = Math.max(stack ? perSec * mb.bleedN : perSec, mb.bleedUntil > now() && !stack ? mb.bleedPow || 0 : 0);
    mb.bleedUntil = now() + sec * (player.S.wt?.br('dk_toxin') === 'A' ? 1.5 : 1);
  }

  // スキルに渡す文脈に、毒と出血を足す（c.poison / c.bleed）
  extendCombat({
    poison: (mb, n) => addPoison(mb, n),
    bleed: (mb, perSec, stack) => addBleed(mb, perSec, stack),
    ambush(n) { me.ambush = Math.max(me.ambush, n); }, // スモーク・ステップ: 次の n 撃は必ず会心
  });

  // 第3引数: 呼ぶ順（小さいほど先。書いていない場面は登録した順で、順の付いたものより後）。倍率を掛ける順などを元と同じに保つ
  register('dagger', {
    // 連撃（当てるたびに攻撃の速さ）: 連撃の心得・連刃・疾風 / 身軽B
    stats(S, WT) {
      if (WT?.br('dk_agile') === 'B') S.dodgeDist = 1.3;
      if (S.wk === 'dagger') S.dStackPer = !WT ? 4 : WT.lv('dk_combo') ? WT.v('dk_combo', 'per') : WT.ks1 === 'dk_blades' ? 4 : 0;
      if (WT?.ks1 === 'dk_blades') S.dStackMax = 15;
      S.dStackT = (WT?.br('dk_combo') === 'A' ? 5 : 3) * (WT?.ks2 === 'dk_gale' ? 2 : 1);
    },
    dmgMult(k, W, o, mb, crit) {
      if (W.ks2 === 'dk_spread' && mb?.vStack) k *= 1 + 0.04 * mb.vStack;
      if (W.br('dk_combo') === 'B' && me.dStack >= player.S.dStackMax) k *= 1.06;
      if (W.ks1 === 'dk_assassin' && o.type !== 'proc' && wtBehind(mb)) k *= 1.2 * (W.ks2 === 'dk_exec' && crit && mb.kind === 2 ? 1.4 : 1);
      return k;
    },
    // 暗殺: 背後は必ず会心
    critAfter: (mb, o) => !!player.S.wt && wtBehind(mb) && player.S.wt.ks1 === 'dk_assassin' && o.type !== 'dot' && o.type !== 'proc',
    // スモーク・ステップB「奇襲」: 奇襲の会心 +50%
    ambushMult: (k, ambushed) => (ambushed && player.S.wt?.br('dk_smoke') === 'B' ? 1.5 : k),
    // 必殺: 背後の会心で弱った雑魚はとどめ
    finisher(dmg, mb, crit, o) {
      if (player.S.wt?.ks2 === 'dk_exec' && crit && mb.kind !== 2 && mb.hp <= mb.mhp * 0.25 && wtBehind(mb) && o.type !== 'dot' && dmg < mb.hp) {
        dmg = mb.hp;
        floatText(mb.x, 3, mb.z, '必殺', 'just'); fx.flash(mb.x, 1.4, mb.z, 0xcab4ff, 40, 0.3);
        fx.slash(mb.x, mb.z, me.a, 2.2, 40, 0xffffff, 1.2); fx.parts.burst(mb.x, 1.2, mb.z, 30, { color: 0xcab4ff, speed: 7, size: 0.45, life: 0.5 });
      }
      return dmg;
    },
    // 毒・出血を重ねる / 連刃の二重斬り
    onHit(mb, dmg, crit, o, mult) {
      const W = player.S.wt;
      if (o.poison) addPoison(mb, o.poison);
      if (W.ks1 === 'dk_venom') addPoison(mb, 1);
      if (hasBuff('dk_poison')) addPoison(mb, 1);
      if (W.br('dk_toxin') === 'B' && o.type === 'normal' && me.combo === 2) addPoison(mb, 1);
      if (crit && W.br('dk_vitalp') === 'B') addBleed(mb, 0.2, false, 3);
      if (W.ks1 === 'dk_blades' && me.dStack >= player.S.dStackMax && o.type === 'normal') later(0.07, () => { if (mb.hp > 0) { dealDamage(mb, mult * 0.4, { type: 'proc', noProc: true, wtNo: true }); fx.slash(mb.x, mb.z, me.a + Math.PI, 1.6, 120, 0xcab4ff, 0.6, true); } });
    },
    // 毒・出血の1回（0.5秒ごと）
    poisonTick: (v, mb) => wtPoisonTick(mb),
    bleedMul: (k) => k * wtToxMul(),
    // 疾風: 連撃が最大の間は移動が速い
    aura(dt, W) { if (W.ks2 === 'dk_gale' && me.dStack >= player.S.dStackMax) quietBuff('dk_gale', '疾風', 0.3, { move: 25 }, 0x9affc8); },
    // 千本: 3段目は手首でナイフを3本投げる
    swingLate(a) {
      if (player.S.wt?.ks2 === 'dk_thousand' && me.combo === 2 && me.dStack >= player.S.dStackMax) {
        me.motion = 'dk_thousand'; me.motionT = 0;
        later(TREE_MOTIONS.dk_thousand.hits[0], () => { for (const d of [-0.22, 0, 0.22]) strikes.arrow({ a: a + d, mult: 0.35, type: 'proc', noZone: true, speed: 40, color: KNIFE_COLOR }); });
      }
    },
    // 瞬影は溜めきったときだけ（途中で離したら通常攻撃）
    heavyNeedsFull: () => player.S?.wk === 'dagger',
    heavyStart() { if (player.S.wk === 'dagger') { me.motion = 'dk_blink'; me.motionT = 0; } }, // 瞬影: 低く駆け抜けながら斬る
    // 影渡り: すり抜けたら敵のほうへ向き直る
    heavyAfter() { if (player.S.wk === 'dagger' && player.S.wt?.ks2 === 'dk_step') later(0.24, () => { me.a += Math.PI; me.afterJust = true; me.motion = 'dk_step_turn'; me.motionT = 0; floatText(me.x, 3, me.z, '影渡り', 'just'); fx.ringWave(me.x, me.z, 0xcab4ff, 2.2, 0.3); }); },
    // 残影: JUST回避の次の1撃は会心
    justDodge() { if (player.S.wt?.br('dk_agile') === 'A') me.ambush = Math.max(me.ambush, 1); },
  }, { dmgMult: 0, onHit: 2, heavyStart: 1, aura: 3, justDodge: 1, swingLate: 1 });
}
