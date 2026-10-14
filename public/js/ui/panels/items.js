// 画面: 装備・アイテムの表示（アイコン・詳細の吹き出し）。Presenter（描画パラメータを計算して View に set する）を P に足す。createUI（ui/app.js）が呼ぶ
// ui: 画面の部品と Presenter の入れ物（app.js が作る）。ほかの画面と共有する値は ui.〜 で読み書きする
import { WEAPONS, RARITIES, AFFIXES, UNIQUE_FX, ARMOR_CLASSES, ARMOR_TYPES, INSTINCT, WEAPON_SKILL_POOL, itemWeight, weightClass, salvageValue, SKILL_VARIANTS, isVariant, displayName, affixText, tierLabel, tierColor, enhMult, TITLES, TITLE_REQ, titleReqOk } from '../../../shared/data.js';
import { WEAPON_SKILLS } from '../../skills.js';
import { esc, GLYPH } from '../helpers.js';

export function installItems(ui) {
  const { game, P, tooltip } = ui;
  const glyphOf = (it) => GLYPH[it.slot === 'title' ? 'title' : it.slot === 'armor' ? (it.armor || 'medium') : it.slot === 'acc' ? 'acc' : it.kind];
  ui.glyphOf = glyphOf;
  const enhTag = (it) => (it.enh ? `<span class="enh">+${it.enh}</span>` : '');
  ui.enhTag = enhTag;
  P.itemCell = (it, { showUp = false, eq = false, sel = false } = {}) => {
    const c = RARITIES[it.rarity].color;
    const up = showUp && it.slot !== 'title' && game.itemPower(it) > game.itemPower(game.char.eq[it.slot]) ? '<span class="up">▲</span>' : '';
    const sv = it.affixes.some(([k]) => isVariant(k)) ? '<span class="svb" title="スキル変化">✧</span>' : '';
    const tr = it.affixes.some(([, t]) => t >= 6) ? ' trans' : '';
    if (eq) return `<div class="cell r${it.rarity}${tr}" style="border-color:${c};color:${c}"><span class="gi">${glyphOf(it)}</span><span>${esc(displayName(it))}${enhTag(it)}<br><small class="dim">${it.slot === 'title' ? '称号' : `iLv${it.ilvl}・重さ${itemWeight(it)}`}</small></span></div>`;
    return `<div class="cell r${it.rarity}${tr}${sel ? ' sel' : ''}" style="border-color:${c};color:${c}">${up}${sv}<span class="lv">${it.slot === 'title' ? '' : it.ilvl}</span><span class="gi">${glyphOf(it)}</span><span style="font-size:9px;max-width:58px;overflow:hidden;white-space:nowrap">${esc(displayName(it))}</span>${enhTag(it)}${it.by ? `<span class="by">${esc(it.by)}</span>` : ''}</div>`;
  };
  // 特性の1行（ティアのバッジ付き）
  const affixRow = (a) => {
    const [k, t] = a;
    const sv = isVariant(k);
    return `<div class="afx${sv ? ' sv' : ''}${t >= 6 ? ' trans' : ''}"><span class="tier" style="--tc:${tierColor(t)}">${tierLabel(t)}</span><span>${sv ? `<b>${SKILL_VARIANTS[k].icon} スキル変化「${SKILL_VARIANTS[k].name}」</b><br>${esc(SKILL_VARIANTS[k].desc(t))}` : esc(affixText(a))}</span></div>`;
  };
  ui.affixRow = affixRow;
  // 称号の効果（説明と条件）
  const titleInfo = (it) => {
    const lines = it.title ? [TITLES[it.title].desc] : (it.fx || []).map((f) => UNIQUE_FX[f]);
    const ok = titleReqOk(it.req, game.S?.wk);
    return `<div class="ttl-fx">${lines.map((l) => `<div>✦ ${esc(l)}</div>`).join('')}</div>`
      + (it.req ? `<div class="req${ok ? '' : ' ng'}">${TITLE_REQ[it.req]}${ok ? '' : '（今の武器では効かない）'}</div>` : '')
      + (it.title ? `<div class="dim">入手：${esc(TITLES[it.title].src)}</div>` : it.from ? `<div class="dim">${esc(it.from)}を伝承化したもの</div>` : '');
  };
  // 項目のセル（Passive View）。どの項目かは data に持たせ、親へ伝わる途中で文脈として付く
  const cellSetup = (v) => {
    v.link((ev) => { ev.payload.id = v.data; });
    v.on('click', 'item:click', (e) => ({ x: e.clientX, y: e.clientY })).on('contextmenu', 'item:context').on('mouseenter', 'item:hover', (e) => ({ x: e.clientX, y: e.clientY }))
      .on('mousemove', 'item:move', (e) => ({ x: e.clientX, y: e.clientY })).on('mouseleave', 'item:leave');
    v.link((ev) => { if (ev.type === 'item:context') ev.preventDefault = true; });
  };
  ui.cellSetup = cellSetup;

  const passiveLines = (kind) => [...WEAPONS[kind].passive, ...(WEAPONS[kind].melee ? [`生存本能：常に被ダメージ-${INSTINCT.dr}%`] : [])];
  ui.passiveLines = passiveLines;
  P.itemTip = (it, compare) => {
    const S = game.S, char = game.char;
    const r = RARITIES[it.rarity];
    const atype = it.slot === 'armor' ? ARMOR_TYPES.find((t) => t.id === it.atype) : null;
    if (it.slot === 'title') {
      return `<div class="tn" style="color:${r.color}">${esc(it.name)}</div><div class="dim">${r.name} 称号（ステータスなし）</div>${titleInfo(it)}`
        + (it.lore ? `<div class="lore">${esc(it.lore)}</div>` : '');
    }
    const type = it.slot === 'weapon' ? WEAPONS[it.kind].name : it.slot === 'armor' ? `防具（${ARMOR_CLASSES[it.armor || 'medium'].name}${atype ? '・' + atype.name : ''}）` : '装飾品';
    let h = `<div class="tn" style="color:${r.color}">${esc(displayName(it))}${enhTag(it)}</div><div class="dim">${r.name} ${type} ・ iLv${it.ilvl} ・ 重さ ${itemWeight(it)}</div>`;    const e = enhMult(it), ev = (v) => Math.round(v * e * 10) / 10;
    h += '<div class="base">';
    if (it.atk) h += `<div>攻撃力 <b>+${ev(it.atk)}</b></div>`;
    if (it.hp) h += `<div>HP <b>+${ev(it.hp)}</b></div>`;
    if (it.def) h += `<div>被ダメ軽減 <b>+${ev(it.def)}%</b></div>`;
    h += '</div>';
    if (it.base) h += `<div class="basefx">基本効果：${AFFIXES[it.base[0]].name} +${it.base[1]}${AFFIXES[it.base[0]].unit}</div>`;
    if (it.affixes.length) h += `<div class="afxs">${it.affixes.map(affixRow).join('')}</div>`;
    if (it.fx) for (const f of it.fx) h += `<div class="fx">✦ ${UNIQUE_FX[f]}</div>`;
    if (it.slot === 'weapon') {
      const sid = it.skill && WEAPON_SKILLS[it.skill]?.kind === it.kind ? it.skill : WEAPON_SKILL_POOL[it.kind][0];
      const ws = WEAPON_SKILLS[sid];
      h += `<div class="wsk">武器スキル「${ws.name}」<br><span class="dim">${ws.desc}（CT ${ws.cd}秒）</span></div>`;
      if (WEAPONS[it.kind].guard) h += '<div class="dim">強攻撃を溜めている間はガード（離すと強攻撃）</div>';
    }
    if (it.lore) h += `<div class="lore">${esc(it.lore)}</div>`;
    if (it.by) h += `<div class="dim">入れた人：${esc(it.by)}</div>`;
    h += `<div style="color:#ffd86a">分解すると ${salvageValue(it).toLocaleString()} G</div>`;
    const cur = char.eq[it.slot];
    if (compare && cur && cur.id !== it.id) {
      const d = game.itemPower(it) - game.itemPower(cur);
      h += `<div class="cmp" style="color:${d >= 0 ? '#6f6' : '#f77'}">装備中と比較: 戦力 ${d >= 0 ? '+' : ''}${d}</div>`;
      const dw = itemWeight(it) - itemWeight(cur);
      if (dw) h += `<div class="cmp" style="color:${dw < 0 ? '#6f6' : '#fc8'}">重さ ${dw > 0 ? '+' : ''}${dw.toFixed(1)} → ${weightClass(S.weight + dw).name}</div>`;
    }
    return h;
  };
  P.tip = (html, x, y) => {
    if (html != null) tooltip.set({ html, visible: true });
    const w = tooltip.el.offsetWidth, h = tooltip.el.offsetHeight;
    tooltip.set({ style: { left: Math.min(x + 16, innerWidth - w - 8) + 'px', top: Math.min(y + 10, innerHeight - h - 10) + 'px' } });
  };
  P.hideTip = () => { tooltip.set({ visible: false }); };
}
