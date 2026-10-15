// 画面: スキルツリー・武器ツリー。Presenter（描画パラメータを計算して View に set する）を P に足す。createUI（ui/app.js）が呼ぶ
// ui: 画面の部品と Presenter の入れ物（app.js が作る）。ほかの画面と共有する値は ui.〜 で読み書きする
import { WEAPONS } from '../../../shared/data.js';
import { TREE_SKILLS, TREES, STYLE_COLS, spTotal, spSpent, treeSpent, canLearn } from '../../skills.js';
import { WTREES, WT_TAGS, ROW_REQ, PROF_MAX, hasWTree, profLevel, profOf, profNeed, wtOf, wtSpent, wtLeft, wtCanLearn, WT_RESET_COST, WEAPON_TABS } from '../../weapon-tree.js';
import { esc } from '../helpers.js';

export function installTree(ui) {
  const { game, P, TREE, passiveLines } = ui;
  ui.treeTab = null;
  P.tree = () => {
    const S = game.S, char = game.char, tree = char.tree;
    if (!ui.treeTab) ui.treeTab = S.wk;
    TREE.sp.set({ html: `残りスキルポイント <b>${spTotal(char.lv) - spSpent(tree)}</b>` });
    const tabs = [...WEAPON_TABS.map((k) => [k, WEAPONS[k].name]), ['stat', 'ステータス'], ['style', 'プレイスタイル']];
    TREE.tabs.list(tabs, ([id, nm], i) => ({
      html: `<button class="${ui.treeTab === id ? 'on' : ''} ${i === WEAPON_TABS.length ? 'gap' : ''}">${nm}<small>${id === S.wk ? '装備中・' : ''}${hasWTree(id) ? `熟練${profLevel(char, id)}` : `${treeSpent(tree, id)}pt`}</small></button>`,
      data: id, setup: (v) => v.on('click', 'tree:tab', () => ({ tab: id })),
    }));
    TREE.reset.set({ text: '振り直し' });
    if (hasWTree(ui.treeTab)) { weaponTree(ui.treeTab); return; }
    const T = TREES[ui.treeTab], spent = treeSpent(tree, ui.treeTab);
    const isWeapon = !['stat', 'style'].includes(ui.treeTab);
    const rows = [];
    // 武器ツリーの最上段: その武器を装備しているだけで効く武器パッシブ
    if (isWeapon) rows.push({ passive: passiveLines(ui.treeTab), on: ui.treeTab === S.wk });
    if (isWeapon && ui.treeTab !== S.wk) rows.push({ note: `このツリーの効果は「${T.name}」を装備しているときだけ有効です` });
    if (ui.treeTab === 'style') rows.push({ cols: true });
    for (let tier = 0; tier < 4; tier++) rows.push({ tier, need: tier * 2, open: spent >= tier * 2, nodes: T.nodes.filter((n) => n.tier === tier) });
    TREE.body.list(rows, (row, ri) => {
      if (row.passive) {
        return {
          html: `<div class="tree-passive ${row.on ? 'on' : ''}"><div class="tp-h"><span>武器パッシブ</span><small>${row.on ? '装備中・常に有効' : '装備すると有効'}</small></div>`
            + `<div class="tp-list">${row.passive.map((t) => `<div class="tp">◇ ${esc(t)}</div>`).join('')}</div></div>`,
        };
      }
      if (row.note) return { html: `<div class="tree-note">${esc(row.note)}</div>` };
      if (row.cols) return { html: `<div class="tree-cols">${STYLE_COLS.map((c) => `<div>${c}</div>`).join('')}</div>` };
      return {
        name: 'tier' + ri,
        html: `<div class="tier ${row.open ? '' : 'locked'}"><div class="tier-l">段階${row.tier + 1}<small>${row.need ? `${row.need}pt〜` : ''}</small></div><div class="tier-n ${ui.treeTab === 'style' ? 'cols3' : ''}"></div></div>`,
        setup: (tv) => {
          const nodesV = tv.add('nodes', '.tier-n');
          nodesV.list(row.nodes, (n) => {
            const r = tree[n.id] || 0;
            const pips = Array.from({ length: n.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('');
            const slotBtns = n.active && r > 0 ? `<div class="slotbtns">${[0, 1].map((i) => `<button data-slot="${i}" class="${char.slots?.[i] === n.active ? 'on' : ''}">${'QE'[i]}</button>`).join('')}</div>` : '';
            return {
              name: n.id, data: n.id,
              html: `<div class="node ${r ? 'have' : ''} ${canLearn(char, n.id) ? 'can' : ''} ${n.active ? 'active' : ''}">
                <div class="nn">${n.role ? `<small class="skill-role">${esc(n.role)}</small>` : ''}${n.active ? '◆ ' : ''}${esc(n.name)}</div><div class="pips">${pips}</div>
                <div class="nd">${esc(n.desc)}${n.active ? `<br><span class="dim">CT ${TREE_SKILLS[n.active].cd}秒</span>` : ''}</div>${slotBtns}</div>`,
              setup: (nv) => {
                nv.link((ev) => { ev.payload.node = n.id; ev.payload.skill = n.active; });
                for (const b of nv.el.querySelectorAll('.slotbtns button')) {
                  nv.add('slot' + b.dataset.slot, b).on('click', 'tree:slot', (e) => { e.stopPropagation(); return { slot: Number(b.dataset.slot) }; });
                }
                nv.on('click', 'tree:learn'); nv.on('contextmenu', 'tree:refund');
              },
            };
          });
        },
      };
    });
  };

  // 新しい武器ツリー（熟練度でポイント。スキル・パッシブは3lvで A/B に分岐、クラス・マスターは1つずつ）
  const WT_KIND_NAME = { skill: 'スキル', passive: 'パッシブ', ks1: 'クラス', ks2: 'マスター' };
  const weaponTree = (wk) => {
    const S = game.S, char = game.char, T = WTREES[wk], st = wtOf(char, wk);
    const pl = profLevel(char, wk), own = profOf(char, wk), left = wtLeft(char, wk), spent = wtSpent(st);
    TREE.sp.set({ html: `${esc(T.name)}の残りポイント <b>${left}</b>` });
    TREE.reset.set({ text: spent ? `振り直し（${WT_RESET_COST(spent)}G）` : '振り直し' });
    const tag = (t) => `<span class="wt-tag t-${t}">${WT_TAGS[t].icon} ${WT_TAGS[t].name}</span>`;
    const xpK = own.lv >= PROF_MAX || own.lv < pl ? 1 : own.xp / profNeed(own.lv);
    const rows = [{ head: true }];
    if (wk !== S.wk) rows.push({ note: `このツリーの効果は「${T.name}」を装備しているときだけ有効です` });
    T.rows.forEach((r, ri) => rows.push({ r, ri }));
    TREE.body.list(rows, (row) => {
      if (row.head) {
        return { html: `<div class="wt-head"><div class="wt-prof">熟練度 <b>${pl}</b><small>/ ${PROF_MAX}</small></div>
          <div class="wt-bar"><i style="width:${(xpK * 100).toFixed(1)}%"></i></div>
          <div class="dim">${own.lv < pl ? `ほかの武器の最大熟練度（${char.profBest}）の半分から始まっています。` : ''}この武器を装備して敵を倒すと上がる。熟練度1つで1ポイント</div></div>` };
      }
      if (row.note) return { html: `<div class="tree-note">${esc(row.note)}</div>` };
      const { r, ri } = row, req = ROW_REQ[ri], open = pl >= req;
      const isKs = r.kind === 'ks1' || r.kind === 'ks2';
      const nodes = r.kind === 'ks2' && st.ks1 ? r.nodes.filter((n) => n.from === st.ks1) : r.nodes;
      const kindName = WT_KIND_NAME[r.kind];
      const ksName = st.ks1 ? T.rows[2].nodes.find((q) => q.id === st.ks1).name : '';
      const excl = r.kind === 'ks1' ? '<div class="wt-excl">― クラスをひとつ選ぶ ―</div>' : r.kind === 'ks2' ? `<div class="wt-excl k2">― ${st.ks1 ? `${esc(ksName)}を極める：どちらかひとつ` : '選んだクラスごとに、ふたつの道'} ―</div>` : '';
      return {
        name: 'wtrow' + ri,
        html: `<div class="wt-row ${open ? '' : 'locked'}"><div class="wt-req"><b>${req}</b><small>${kindName}${open ? '' : ' 🔒'}</small></div><div class="wt-body">${excl}<div class="wt-nodes n${nodes.length}"></div></div></div>`,
        setup: (rv) => {
          rv.add('nodes', '.wt-nodes').list(nodes, (n) => {
            const can = wtCanLearn(char, n.id);
            if (isKs) {
              const sel = st[r.kind] === n.id, other = st[r.kind] && !sel;
              return {
                name: n.id, data: n.id,
                html: `<div class="wt-node ks ${r.kind === 'ks2' ? 'k2' : ''} ${sel ? 'have' : ''} ${other ? 'other' : ''} ${can ? 'can' : ''}">
                  <div class="wt-top"><span class="wt-ic"><span>${n.icon}</span></span><b class="wt-nm">${esc(n.name)}</b><small class="wt-kind k-${r.kind}">${kindName}</small></div>
                  <div class="wt-desc">${esc(n.desc)}</div><div class="wt-tags">${n.tags.map(tag).join('')}</div></div>`,
                setup: (nv) => { nv.link((ev) => { ev.payload.node = n.id; }); nv.on('click', 'wt:learn'); nv.on('contextmenu', 'wt:refund'); },
              };
            }
            const lv = st.lv[n.id] || 0, b = lv === 3 ? st.br[n.id] : null;
            const pips = [0, 1, 2].map((k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('');
            const tags = [...new Set([...(n.tags || []), ...(b ? n[b].tags || [] : [])])];
            const brCls = (k) => (b === k ? 'chosen' : b ? 'lost' : lv === 3 ? 'pick' : '');
            const slotBtns = n.id in TREE_SKILLS && lv > 0 ? `<div class="slotbtns">${[0, 1].map((k) => `<button data-slot="${k}" class="${char.slots?.[k] === n.id ? 'on' : ''}">${'QE'[k]}</button>`).join('')}</div>` : '';
            const val = lv ? n.lv[Math.min(1, lv - 1)] : n.lv[0];
            return {
              name: n.id, data: n.id,
              html: `<div class="wt-node ${r.kind} ${lv ? 'have' : ''} ${can ? 'can' : ''}">
                <div class="wt-top"><span class="wt-ic"><span>${n.icon}</span></span><b class="wt-nm">${esc(n.name)}</b><span class="pips">${pips}</span></div>
                <div class="wt-val"><small class="wt-kind k-${r.kind}">${r.kind === 'skill' ? 'スキル・Q/Eで使う' : 'パッシブ・常に効く'}</small> ${esc(n.base)}　<b>${esc(val)}</b>${r.kind === 'skill' ? `<span class="dim">　CT ${TREE_SKILLS[n.id].cd}秒</span>` : ''}</div>
                <div class="wt-tags">${tags.map(tag).join('')}</div>
                <div class="wt-br">${['A', 'B'].map((k) => `<div class="${brCls(k)}" data-br="${k}"><b>${k}：${esc(n[k].name)}</b>${esc(n[k].desc)}</div>`).join('')}</div>${slotBtns}</div>`,
              setup: (nv) => {
                nv.link((ev) => { ev.payload.node = n.id; ev.payload.skill = n.id; });
                for (const el of nv.el.querySelectorAll('[data-br]')) {
                  if (lv === 3 && !b) nv.add('br' + el.dataset.br, el).on('click', 'wt:choose', (e) => { e.stopPropagation(); return { b: el.dataset.br }; });
                }
                for (const el of nv.el.querySelectorAll('.slotbtns button')) {
                  nv.add('slot' + el.dataset.slot, el).on('click', 'tree:slot', (e) => { e.stopPropagation(); return { slot: Number(el.dataset.slot) }; });
                }
                nv.on('click', 'wt:learn'); nv.on('contextmenu', 'wt:refund');
              },
            };
          });
        },
      };
    });
  };
}
