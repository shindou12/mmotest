// 画面: 鍛冶屋（強化・付与・スキル・分解）。Presenter（描画パラメータを計算して View に set する）を P に足す。createUI（ui/app.js）が呼ぶ
// ui: 画面の部品と Presenter の入れ物（app.js が作る）。ほかの画面と共有する値は ui.〜 で読み書きする
import { RARITIES, AFFIXES, UNIQUE_FX, WEAPON_SKILL_POOL, SKILL_VARIANTS, isVariant, displayName, tierLabel, tierColor, enhMult, TITLE_REQ, ENH_MAX, ENH_RATE, enhCost, affixCost, skillCost, loreCost, CRAFT_MAX_TIER, affixName, FX_REQ } from '../../../shared/data.js';
import { WEAPON_SKILLS } from '../../skills.js';
import { esc } from '../helpers.js';

export function installSmith(ui) {
  const { game, P, SM, affixRow, cellSetup, enhTag, glyphOf, panels } = ui;
  // ---- 鍛冶屋（原神の武器強化・FF14の禁断/マテリア画面ふう: 左にタブ、中央に装備一覧、右に詳細と実行ボタン） ----
  const sm = { tab: 'enh', id: null, slot: null, key: null, skill: null, msg: '', ok: null, npc: '鍛冶屋' };
  ui.sm = sm;
  const SMITH_FILTER = {
    enh: (it) => it.slot !== 'title',
    affix: (it) => it.slot !== 'title' && it.affixes.length > 0,
    skill: (it) => it.slot === 'weapon',
    lore: (it) => it.rarity >= 6 && it.fx?.length && it.slot !== 'title',
    codex: () => false,
  };
  const smithItems = () => {
    const c = game.char;
    const worn = ['weapon', 'armor', 'acc'].map((s) => c.eq[s]).filter(Boolean);
    return [...worn, ...c.inv].filter(SMITH_FILTER[sm.tab]);
  };
  // 費用の表示（足りないものは赤）
  const costRow = (cost) => {
    const c = game.char, chips = [];
    if (cost.gold) chips.push([`◎ ${cost.gold.toLocaleString()} G`, (c.gold || 0) >= cost.gold, `所持 ${(c.gold || 0).toLocaleString()}`]);
    if (cost.shard) chips.push([`◆ 強化の欠片 ×${cost.shard}`, (c.mats.shard || 0) >= cost.shard, `所持 ${c.mats.shard || 0}`]);
    if (cost.gemKey) chips.push([`◇ ${affixName(cost.gemKey)}の宝石 ×${cost.gem}`, (c.mats.gems[cost.gemKey] || 0) >= cost.gem, `所持 ${c.mats.gems[cost.gemKey] || 0}`]);
    return `<div class="cost">${chips.map(([t, ok, have]) => `<span class="chip ${ok ? '' : 'short'}">${t}<small>${have}</small></span>`).join('')}</div>`;
  };
  const canPay = (cost) => {
    const c = game.char;
    return (c.gold || 0) >= (cost.gold || 0) && (c.mats.shard || 0) >= (cost.shard || 0) && (!cost.gemKey || (c.mats.gems[cost.gemKey] || 0) >= (cost.gem || 0));
  };
  const head = (it) => `<div class="sd-head" style="--rc:${RARITIES[it.rarity].color}"><span class="gi">${glyphOf(it)}</span><div><b>${esc(displayName(it))}${enhTag(it)}</b><small>${RARITIES[it.rarity].name}・iLv${it.ilvl}${game.char.inv.includes(it) ? '' : '・装備中'}</small></div></div>`;
  const doBtn = (label, enabled) => ({ html: `<button class="sd-do" ${enabled ? '' : 'disabled'}>${label}</button>`, setup: (v) => v.on('click', 'smith:do') });
  const msgBlock = () => (sm.msg ? [{ html: `<div class="sd-msg ${sm.ok ? 'ok' : 'ng'}">${esc(sm.msg)}</div>` }] : []);

  P.smith = () => {
    const c = game.char;
    SM.title.set({ text: sm.npc });
    SM.mats.set({ html: `<span>◎ ${(c.gold || 0).toLocaleString()} G</span><span>◆ 強化の欠片 ${c.mats.shard || 0}</span>` });
    for (const [k, v] of SM.tabs.children) v.set({ cls: { on: k === sm.tab } });
    panels.smith.set({ cls: { codex: sm.tab === 'codex' } });
    const items = smithItems();
    if (!items.some((i) => i.id === sm.id)) sm.id = items[0]?.id ?? null;
    SM.list.list(items, (it) => ({ html: P.itemCell(it, { sel: it.id === sm.id }).replace('class="cell', `class="cell${c.inv.includes(it) ? '' : ' worn'}`), data: it.id, setup: cellSetup }));
    if (!items.length && sm.tab !== 'codex') SM.list.set({ html: `<div class="dim">${{ enh: '強化できる装備がありません', affix: '特性の付いた装備がありません', skill: '武器がありません', lore: '伝説・神器の装備がありません' }[sm.tab]}</div>` });
    const it = items.find((i) => i.id === sm.id);
    const blocks = [];
    if (sm.tab === 'codex') {
      // 特性リスト: 分解で解放した特性と、付与できる最高ティア
      blocks.push({ html: '<div class="sd-h">特性リスト<small>装備を分解すると、付いていた特性とティアがここに追加されます。鍛冶屋で付けられるのは T5 まで（超越はドロップのみ）</small></div>' });
      const keys = [...Object.keys(AFFIXES), ...Object.keys(SKILL_VARIANTS)];
      blocks.push({
        html: `<div class="codex">${keys.map((k) => {
          const t = c.codex[k] || 0, gems = c.mats.gems[k] || 0, sv = isVariant(k);
          const pips = Array.from({ length: CRAFT_MAX_TIER }, (_, i) => `<i class="${i < t ? 'on' : ''}" style="--tc:${tierColor(i + 1)}"></i>`).join('');
          return `<div class="cx ${t ? '' : 'locked'} ${sv ? 'sv' : ''}"><span class="cx-n">${t ? (sv ? `${SKILL_VARIANTS[k].icon} ${SKILL_VARIANTS[k].name}` : AFFIXES[k].name) : '？？？'}</span><span class="pips">${pips}</span><span class="cx-g">◇ ${gems}</span>${sv && t ? `<small>${esc(SKILL_VARIANTS[k].desc(t))}</small>` : ''}</div>`;
        }).join('')}</div>`,
      });
    } else if (!it) {
      blocks.push({ html: '<div class="dim sd-empty">左の一覧から装備を選んでください</div>' });
    } else if (sm.tab === 'enh') {
      const e = it.enh || 0, max = e >= ENH_MAX, cost = enhCost(it), rate = ENH_RATE[e] ?? 0;
      const pips = Array.from({ length: ENH_MAX }, (_, i) => `<i class="${i < e ? 'on' : ''} ${i >= 5 ? 'hi' : ''}"></i>`).join('');
      const m0 = enhMult(it), m1 = enhMult({ enh: e + 1 });
      const stat = (label, v, unit = '') => (v ? `<div class="sd-stat"><span>${label}</span><b>${Math.round(v * m0 * 10) / 10}${unit}</b>${max ? '' : `<span class="arrow">→</span><b class="up">${Math.round(v * m1 * 10) / 10}${unit}</b>`}</div>` : '');
      blocks.push({ html: head(it) });
      blocks.push({ html: `<div class="enh-pips">${pips}<span>+${e} / +${ENH_MAX}</span></div>` });
      blocks.push({ html: `<div class="sd-stats">${stat('攻撃力', it.atk)}${stat('HP', it.hp)}${stat('被ダメ軽減', it.def, '%')}</div>` });
      if (!max) {
        blocks.push({ html: `<div class="sd-rate ${rate < 1 ? 'risk' : ''}">成功率 <b>${Math.round(rate * 100)}%</b>${rate < 1 ? '<small>失敗しても強化値は下がりません（素材とゴールドは消費）</small>' : '<small>+5 までは必ず成功します</small>'}</div>` });
        blocks.push({ html: costRow(cost) });
      }
      blocks.push(doBtn(max ? '最大まで強化済み' : `強化する（+${e} → +${e + 1}）`, !max && canPay(cost)));
    } else if (sm.tab === 'affix') {
      blocks.push({ html: head(it) });
      blocks.push({ html: '<div class="sd-h">付け替える特性<small>置き換える枠を選びます</small></div>' });
      it.affixes.forEach((a, idx) => blocks.push({
        html: `<div class="slotrow ${sm.slot === idx ? 'sel' : ''}">${affixRow(a)}</div>`,
        setup: (v) => v.on('click', 'smith:slot', () => ({ idx })),
      }));
      const keys = [...Object.keys(AFFIXES), ...(it.slot === 'weapon' ? Object.keys(SKILL_VARIANTS) : [])];
      blocks.push({ html: '<div class="sd-h">付ける特性<small>特性リストで解放したものだけ。ティアはランダム（低いほど出やすい）</small></div>' });
      blocks.push({
        html: `<div class="keys">${keys.map((k) => {
          const t = c.codex[k] || 0, gems = c.mats.gems[k] || 0;
          const dup = it.affixes.some((a, i) => i !== sm.slot && a[0] === k) || (isVariant(k) && it.affixes.some((a, i) => i !== sm.slot && isVariant(a[0])));
          const off = !t || !gems || dup;
          return `<button class="key ${sm.key === k ? 'sel' : ''} ${isVariant(k) ? 'sv' : ''}" data-k="${k}" ${off ? 'disabled' : ''}>${t ? affixName(k).replace('スキル変化', '') : '？？？'}<small>${t ? `T1〜T${t}・◇${gems}` : '未解放'}${dup ? '・重複' : ''}</small></button>`;
        }).join('')}</div>`,
        setup: (v) => { for (const b of v.el.querySelectorAll('button.key')) v.add('k_' + b.dataset.k, b).on('click', 'smith:key', () => ({ key: b.dataset.k })); },
      });
      const cur = it.affixes[sm.slot];
      if (cur && cur[1] >= 6) blocks.push({ html: `<div class="sd-warn">⚠ ${tierLabel(cur[1])} の特性が消えます（超越は鍛冶屋では付け直せません）</div>` });
      const cost = { ...affixCost(it), gemKey: sm.key };
      if (sm.key) blocks.push({ html: costRow(cost) });
      blocks.push(doBtn('特性を付け替える', sm.slot != null && !!sm.key && canPay(cost)));
    } else if (sm.tab === 'skill') {
      blocks.push({ html: head(it) });
      blocks.push({ html: '<div class="sd-h">武器スキル<small>この武器種のスキルから選べます</small></div>' });
      for (const id of WEAPON_SKILL_POOL[it.kind]) {
        const s = WEAPON_SKILLS[id], curr = it.skill === id;
        blocks.push({
          html: `<div class="skrow ${sm.skill === id ? 'sel' : ''} ${curr ? 'cur' : ''}"><b>${s.name}</b>${curr ? '<i>現在</i>' : ''}<small>${esc(s.desc)}（CT ${s.cd}秒）</small></div>`,
          setup: (v) => { if (!curr) v.on('click', 'smith:skill', () => ({ id })); },
        });
      }
      const cost = skillCost(it);
      blocks.push({ html: costRow(cost) });
      blocks.push(doBtn('スキルを変更する', !!sm.skill && canPay(cost)));
    } else if (sm.tab === 'lore') {
      const req = (it.fx || []).map((f) => FX_REQ[f]).find(Boolean);
      blocks.push({ html: head(it) });
      blocks.push({
        html: `<div class="lore-prev"><div class="lp-arrow">▼ 伝承化</div><div class="lp-t" style="color:${RARITIES[it.rarity].color}">「${esc(it.name)}」の伝承</div><div class="dim">称号（4つ目の装備枠・ステータスなし）</div>`
          + `${(it.fx || []).map((f) => `<div class="fx">✦ ${UNIQUE_FX[f]}</div>`).join('')}${req ? `<div class="req">${TITLE_REQ[req]}</div>` : ''}</div>`,
      });
      blocks.push({ html: '<div class="sd-warn">⚠ 元の装備はなくなります（ステータスと特性は失われ、固有効果だけが称号として残ります）</div>' });
      const cost = loreCost(it);
      blocks.push({ html: costRow(cost) });
      blocks.push(doBtn('伝承化する', canPay(cost)));
    }
    SM.detail.list([...blocks, ...msgBlock()], (b, i) => ({ html: `<div class="sd-b">${b.html}</div>`, name: 'b' + i, setup: b.setup }));
  };
}
