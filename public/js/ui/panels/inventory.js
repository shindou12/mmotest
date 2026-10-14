// 画面: インベントリ（装備・持ち物）。Presenter（描画パラメータを計算して View に set する）を P に足す。createUI（ui/app.js）が呼ぶ
// ui: 画面の部品と Presenter の入れ物（app.js が作る）。ほかの画面と共有する値は ui.〜 で読み書きする
import { RARITIES, UNIQUE_FX, SKILL_VARIANTS, tierLabel } from '../../../shared/data.js';
import { clamp, esc } from '../helpers.js';

export function installInventory(ui) {
  const { game, INV, P, cellSetup } = ui;
  P.inv = () => {
    const S = game.S, char = game.char;
    for (const [slot, v] of Object.entries(INV.eq)) {
      const it = char.eq[slot];
      v.data = it?.id;
      v.set({ html: it ? P.itemCell(it, { eq: true }).replace(/^<div[^>]*>|<\/div>$/g, '') : 'なし', style: { 'border-color': it ? RARITIES[it.rarity].color : '', color: it ? RARITIES[it.rarity].color : '#666' } });
    }
    // 分解の対象（このレア度以下）: 自動分解と一括分解で共通
    const lim = char.autoSalvage ?? -1, limName = lim < 0 ? '' : RARITIES[lim].name;
    INV.auto.set({ value: lim });
    INV.autoLbl.set({ text: lim < 0 ? 'なし' : lim === 0 ? '粗悪だけ' : `${limName}以下`, style: { color: lim < 0 ? '' : RARITIES[lim].color } });
    INV.salvage.set({ text: lim < 0 ? '一括分解' : `${limName}以下を一括分解`, disabled: lim < 0 });
    if (char.inv.length) INV.grid.list(char.inv, (it) => ({ html: P.itemCell(it, { showUp: true }), data: it.id, setup: cellSetup }));
    else INV.grid.list([], () => ({})).set({ html: '<div class="dim">アイテムなし。モンスターを倒そう！</div>' });
    const st = [
      ['攻撃力', Math.round(S.atk)], ['最大HP', S.mhp], ['会心率', S.crit.toFixed(1) + '%'], ['会心ダメージ', S.critd.toFixed(0) + '%'],
      ['攻撃速度', '+' + S.aspd.toFixed(1) + '%'], ['移動速度', '+' + S.move.toFixed(1) + '%'], ['被ダメ軽減', S.def.toFixed(1) + '%'],
      ['HP吸収', S.vamp.toFixed(1) + '%'], ['スキル短縮', S.cdr.toFixed(0) + '%'],
    ];
    if (S.W.ranged) st.push(['射程', `${S.bowBase}m（最大射程 ${S.bowMax}m）`], ['弓を引く速さ', `毎秒${+S.bowDraw.toFixed(1)}m（最大まで${S.chargeMax.toFixed(2)}秒）`]);
    INV.stats.set({
      html: `<b>Lv${char.lv} ${esc(char.name)}</b> <span class="dim">${S.W.name}</span>`
        + `<div><span class="dim">所持ゴールド</span><span style="color:#ffd86a">${(char.gold || 0).toLocaleString()} G</span></div>`
        + `<div class="wrow"><span class="dim">装備重量</span><span><b style="color:${S.wc.color}">${S.weight.toFixed(1)}（${S.wc.name}）</b></span></div>`
        + `<div class="wbar"><i style="width:${clamp(S.weight / 22 * 100, 0, 100)}%;background:${S.wc.color}"></i></div>`
        + `<div><span class="dim">回避のクールタイム</span><span>${S.dodgeCd.toFixed(2)}秒</span></div>`
        + st.map(([k, v]) => `<div><span class="dim">${k}</span><span>${v}</span></div>`).join('')
        + `<div><span class="dim">強化の欠片</span><span>${char.mats.shard || 0}</span></div>`
        + (S.sv ? `<div class="dim" style="margin-top:4px">スキル変化</div><div style="color:#c8a0ff;font-size:11px">${SKILL_VARIANTS[S.sv.key].icon} ${SKILL_VARIANTS[S.sv.key].name}（${tierLabel(S.sv.t)}）</div>` : '')
        + (S.title ? `<div class="dim" style="margin-top:4px">称号</div><div style="font-size:11px;color:${S.titleOn ? '#ffe7a0' : '#888'}">${esc(S.title.name)}${S.titleOn ? '' : '（今の武器では無効）'}</div>` : '')
        + [...S.fx].filter((f) => UNIQUE_FX[f]).map((f) => `<div style="color:#ffd27a;font-size:11px">✦ ${UNIQUE_FX[f]}</div>`).join('')
        + '<div class="dim" style="margin-top:6px;font-size:10px">武器パッシブはスキルツリー（K）の武器タブ最上段に表示されます</div>',
    });
  };
}
