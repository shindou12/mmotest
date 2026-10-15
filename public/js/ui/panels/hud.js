// 画面: HUD（クエスト・パーティ・自分の枠・ボス・ホットバー）。Presenter（描画パラメータを計算して View に set する）を P に足す。createUI（ui/app.js）が呼ぶ
// ui: 画面の部品と Presenter の入れ物（app.js が作る）。ほかの画面と共有する値は ui.〜 で読み書きする
import { MAX_LEVEL, xpToNext } from '../../../shared/data.js';
import { HAZARDS } from '../../../shared/areas.js';
import { HEAVY, TREE_SKILLS, spTotal, spSpent } from '../../skills.js';
import { hasWTree, wtLeft } from '../../weapon-tree.js';
import { QUESTS, questState } from '../../quests.js';
import { clamp, esc, hex, now } from '../helpers.js';

export function installHud(ui) {
  const { game, H, P, death, deathT } = ui;
  P.quests = () => {
    const char = game.char;
    const active = QUESTS.filter((q) => { const s = questState(char, q.id); return s && !s.claimed; });
    H.quests.set({
      visible: active.length > 0,
      html: '<div class="dim">クエスト</div>' + active.map((q) => {
        const s = questState(char, q.id);
        return `<div class="qi ${s.done ? 'done' : ''}"><b>${esc(q.name)}</b><span>${s.done ? '達成！報告しよう' : `${s.p} / ${q.n}`}</span><small>${esc(q.desc)}</small></div>`;
      }).join(''),
    });
  };

  P.party = () => {
    const roster = game.roster();
    H.party.set({
      visible: roster.length > 1, // ソロのときは出さない
      html: '<div class="dim" style="margin-bottom:6px">オンライン ' + roster.length + '人</div>' + roster.map(([id, name, lv, floor, hp, mhp, color, aname]) => `
      <div class="pm"><div class="nm"><span style="color:${esc(color)}">${esc(name)}${id === game.me.id ? ' (自分)' : ''}</span><span class="dim">Lv${lv}</span></div>
      <div class="dim" style="font-size:10px">${floor}層 ${esc(aname || '')}</div>
      <div class="bar hp"><div style="width:${clamp(hp / mhp * 100, 0, 100)}%"></div></div></div>`).join(''),
    });
  };

  let stamSeen = -9, lastGold = -1, goldPopT = 0;
  // クールタイムの影（--p: 残りの割合。丸いボタンは時計回りに減る扇形で表示）
  const setCd = (v, val, max) => {
    const p = clamp(max > 0 ? val / max * 100 : 0, 0, 100).toFixed(1) + '%';
    v.cd?.set({ style: { height: p, '--p': p } });
    v.set({ cls: { ready: val <= 0 } });
  };
  ui.setCd = setCd;
  P.hud = () => {
    const S = game.S, me = game.me, char = game.char, t = now();
    H.meName.set({ text: char.name });
    H.meLv.set({ text: 'Lv ' + char.lv });
    const hpPct = clamp(me.hp / S.mhp * 100, 0, 100);
    H.hp.set({ style: { width: hpPct + '%' } });
    H.hpBar.set({ cls: { low: hpPct < 30 } });
    H.hpT.set({ text: `${Math.ceil(me.hp)} / ${S.mhp}` });
    const need = xpToNext(char.lv);
    H.xp.set({ style: { width: (char.lv >= MAX_LEVEL ? 100 : char.xp / need * 100) + '%' } });
    H.xpT.set({ text: char.lv >= MAX_LEVEL ? 'MAX' : `${char.xp} / ${need}` });
    const def = game.world.def;
    H.floor.set({ text: def.name.startsWith('第') ? def.name : `第${def.floor}層 ${def.name}` });
    H.potN.set({ text: String(me.potions) });
    // 所持ゴールド: 増えたら少し弾む
    const gold = char.gold || 0;
    if (gold !== lastGold) {
      if (gold > lastGold && lastGold >= 0) { H.gold.set({ cls: { gain: true } }); clearTimeout(goldPopT); goldPopT = setTimeout(() => H.gold.set({ cls: { gain: false } }), 160); }
      lastGold = gold;
      H.goldN.set({ text: gold.toLocaleString() });
    }
    H.atkName.set({ text: HEAVY[S.wk].name });
    H.skillName.set({ text: S.ws.name });
    H.wsKey.set({ text: '右クリック' });
    H.slots.guard.set({ visible: !!S.guard, cls: { active: me.guarding } });
    setCd(H.slots.skill, me.wsCd, S.ws.cd * (1 - S.cdr / 100));
    for (let i = 0; i < 2; i++) {
      const id = char.slots?.[i], v = H.slots['t' + (i + 1)];
      const usable = id && S.actives.has(id);
      v.nm.set({ text: id ? TREE_SKILLS[id].name : '未設定' });
      v.set({ cls: { off: !usable } });
      setCd(v, usable ? (me.tcd[id] || 0) : 1, usable ? game.skillCd(id) : 1);
    }
    setCd(H.slots.dodge, me.dodgeCd, S.dodgeCd);
    H.dodgeW.set({ text: S.wc.name, style: { color: S.wc.color } });
    // 自キャラの横の輪: 回避の回復（原神のスタミナのように、減ったときだけ出る）
    const q = game.project(me.x, 1.4, me.z);
    // 盾槍でガード中・ガードゲージが減っている間は、同じ輪でガードゲージを見せる（青 → 黄 → 赤）
    const ggShow = S.guard && (me.guarding || me.gg < 100);
    const stam = ggShow ? clamp(me.gg / 100, 0, 1) : S.dodgeCd > 0 ? 1 - clamp(me.dodgeCd / S.dodgeCd, 0, 1) : 1;
    if (stam < 1 || ggShow) stamSeen = t;
    const ggCol = stam > 0.6 ? '#9ad8ff' : stam > 0.3 ? '#ffd84a' : '#ff4a3a';
    H.stamina.set({ visible: t - stamSeen < 0.6 && !me.dead, cls: { full: stam >= 1 && !ggShow, guard: ggShow }, style: { left: q.x + 44 + 'px', top: q.y - 52 + 'px' } });
    H.staminaFg.set({ attr: { 'stroke-dasharray': `${(stam * 100).toFixed(1)} 100` }, style: { stroke: ggShow ? ggCol : '' } });
    H.charge.set({ style: { left: q.x + 'px', top: q.y + 34 + 'px' } });
    setCd(H.slots.pot, me.potions > 0 ? me.potCd : 1, 1);
    const left = spTotal(char.lv) - spSpent(char.tree) + (hasWTree(S.wk) ? Math.max(0, wtLeft(char, S.wk)) : 0);
    H.spBadge.set({ text: left > 0 ? String(left) : '', visible: left > 0 });
    // 溜めゲージ
    const charging = me.charging && me.chargeT >= game.CHARGE_MIN;
    H.charge.set({ visible: charging, cls: { max: me.chargeLv === 2 } });
    if (charging) H.chargeFill.set({ style: { width: clamp((me.chargeT - game.CHARGE_MIN) / (game.CHARGE_MAX - game.CHARGE_MIN) * 100, 0, 100) + '%' } });
    // バフ
    const status = me.buffs.map((b) => `<span style="color:${hex(b.color)}">✦ ${esc(b.label)}${b.t > 1e6 ? '' : ` ${b.t.toFixed(1)}s`}</span>`);
    if (me.dStack > 0) status.push(`<span style="color:#9fe">⚡ 連撃 攻速+${me.dStack * (game.S.dStackPer || 0)}%</span>`);
    if (me.crawl) status.push('<span style="color:#ff9a8a">✚ 這いずり中（足元の円が仲間の攻撃で減り、なくなると起き上がる）</span>');
    if (me.guarding && me.counter) status.push('<span style="color:#bfe0ff">⛨ カウンター準備（離すとガードカウンター）</span>');
    const hz = game.hazard();
    if (hz) status.push(`<span style="color:${hz.kind === 'poison' ? '#c08aff' : '#e0c890'}">⚠ ${HAZARDS[hz.kind].name}</span>`);
    H.buffs.set({ html: status.join('　') });
    // ボス
    const boss = game.boss();
    H.boss.set({ visible: !!boss });
    if (boss) {
      const bars = boss.bars || 1;
      const left = bars > 1 ? `　×${Math.max(1, Math.ceil(boss.hp / boss.mhp * bars - 1e-6))}` : '';
      H.bossName.set({ text: `Lv${boss.lv} ${boss.name}${left}`, cls: { enraged: !!boss.enraged } });
      const pct = clamp(boss.hp / boss.mhp * 100, 0, 100) + '%';
      H.bossHp.set({ style: { width: pct } }); H.bossLag.set({ style: { width: pct } });
      // HPバー複数本: 区切り線と残り本数
      H.bossSeg.set({ visible: bars > 1, style: { '--bars': String(bars) } });
      // 詠唱バー（技名）と中断ゲージ
      const c = boss.cast && performance.now() - boss.cast.start < boss.cast.dur + 500 ? boss.cast : null; // 終わりの知らせが来なくても時間で消す
      H.bossCast.set({ visible: !!c });
      if (c) {
        H.bossCastName.set({ text: c.name });
        H.bossCastFill.set({ style: { width: clamp((performance.now() - c.start) / c.dur * 100, 0, 100) + '%' } });
        H.bossCutBar.set({ visible: !!c.need });
        H.bossCut.set({ style: { width: clamp((c.k || 0) * 100, 0, 100) + '%' } });
      }
      const tname = boss.target === me.id ? 'あなた' : game.others.get(boss.target)?.name;
      H.bossTarget.set({ text: (tname ? `ターゲット：${tname}` : '') + (boss.hateT != null ? `　ヘイトリセットまで ${Math.max(0, boss.hateT).toFixed(0)}秒` : ''), cls: { me: boss.target === me.id } });
      const stunned = boss.stunT > 0;
      H.bossStun.set({ style: { width: (stunned ? 100 : clamp(boss.stunPct || 0, 0, 100)) + '%' } });
      H.bossStunBar.set({ cls: { stunned } });
      H.bossStunT.set({ text: stunned ? `STUN ${boss.stunT.toFixed(1)}秒（被ダメ1.3倍）` : 'スタン' });
    }
    // 調べる・ボス部屋の案内
    const it = game.nearestInteract();
    const lair = game.env()?.lair, world = game.world;
    const nearLair = lair && !boss && world.bossState !== 'fight' && Math.hypot(me.x - lair.x, me.z - lair.z) < lair.r + 4;
    if (it) H.prompt.set({ visible: true, html: it.label });
    else if (nearLair && world.bossState === 'cleared') H.prompt.set({ visible: true, text: 'ボスは討伐済み。しばらくすると再挑戦できます' });
    else if (nearLair) H.prompt.set({ visible: true, text: '⚠ ボス部屋：魔法陣の中に入ると戦闘開始' });
    else H.prompt.set({ visible: false });
    // 死亡
    death.set({ visible: me.dead });
    if (me.dead) deathT.set({ text: `キャラクターデータ消失。${Math.max(0, me.deadT).toFixed(1)} 秒後に新規キャラ作成へ` });
  };
}
