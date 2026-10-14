// 戦闘の記録テストの場面: 武器ツリーのデータから、全クラス・全マスター・全スキル（lv1・A・B）・全パッシブ（lv2・A・B）を作る
import { WTREES, WT_NODE } from '../../public/js/weapon-tree.js';

export function combatScenarios() {
  const out = [];
  for (const [wk, tree] of Object.entries(WTREES)) {
    const rows = tree.rows;
    const nodes = (kind) => rows.filter((r) => r.kind === kind).flatMap((r) => r.nodes);
    out.push({ wk, name: `${wk}:base`, learn: [], act: 'full' });
    for (const n of nodes('ks1')) out.push({ wk, name: `${wk}:${n.id}`, learn: [[n.id, 1]], act: 'full' });
    for (const n of nodes('ks2')) out.push({ wk, name: `${wk}:${n.from}+${n.id}`, learn: [[n.from, 1], [n.id, 1]], act: 'full', hp: n.id === 'ax_undying' || n.from === 'ax_berserk' ? 0.4 : 1 });
    for (const n of nodes('skill')) {
      out.push({ wk, name: `${wk}:${n.id}:1`, learn: [[n.id, 1]], act: 'skill', slot: n.id });
      for (const b of ['A', 'B']) out.push({ wk, name: `${wk}:${n.id}:${b}`, learn: [[n.id, 3, b]], act: 'skill', slot: n.id });
    }
    for (const n of nodes('passive')) {
      out.push({ wk, name: `${wk}:${n.id}:2`, learn: [[n.id, 2]], act: 'full', hp: 0.45 });
      for (const b of ['A', 'B']) out.push({ wk, name: `${wk}:${n.id}:${b}`, learn: [[n.id, 3, b]], act: 'full', hp: 0.45 });
    }
  }
  for (const s of out) for (const [id] of s.learn) if (!WT_NODE[id]) throw new Error('unknown node ' + id);
  return out;
}

// ページの中で1つの場面を動かし、送ったメッセージと状態の記録を返す
export const RUN_SCENARIO = async (spec) => {
  const G = window.__game, me = G.me, A = G.api, c = G.char(), C = window.__clock, D = G.dbg;
  const log = [];
  if (!window.__sendWrapped) {
    window.__sendWrapped = true;
    const send = G.net.send.bind(G.net);
    G.net.send = (m) => { if (window.__rec) window.__rec.push([C.now(), JSON.parse(JSON.stringify(m))]); return send(m); };
  }
  // 準備: ツリーを振り直して覚え直す・状態をそろえる
  c.lv = 30; // 倒れて最初からにならないように、テスト用のキャラは丈夫にしておく
  c.gold = 1e9; c.prof = c.prof || {}; c.prof[spec.wk] = { lv: 20, xp: 0 }; c.profBest = 20;
  A.wtResetTree(spec.wk);
  for (const [id, n, br] of spec.learn) { for (let i = 0; i < n; i++) A.wtLearnNode(id); if (br) A.wtChooseBranch(id, br); }
  c.slots = [spec.slot || null, null];
  const learned = JSON.stringify(c.wt?.[spec.wk] || null);
  me.tcd = {}; me.wsCd = 0; me.dodgeCd = 0; me.iframe = 0;
  await C.step(200);
  const S = G.S();
  me.hp = Math.round(S.mhp * (spec.hp ?? 1));
  // 一番近い敵の 2.5m 手前に立ち、その敵を狙い続ける
  const alive = () => [...G.mobs.values()].filter((m) => m.hp > 0);
  const near = () => alive().sort((p, q) => Math.hypot(p.x - me.x, p.z - me.z) - Math.hypot(q.x - me.x, q.z - me.z) || p.id - q.id)[0];
  let tgt = near();
  if (tgt) { me.x = tgt.x; me.z = tgt.z - 2.5; me.a = 0; }
  const aim = () => {
    if (!tgt || tgt.hp <= 0 || !G.mobs.has(tgt.id)) tgt = near();
    // スマホの狙い（向きと距離）で、決まった敵を狙う（マウスは画面から毎フレーム計算し直されるため）
    if (!window.__touchOn) { A.input.setTouch(true); window.__touchOn = true; }
    if (tgt) { const d = Math.hypot(tgt.x - me.x, tgt.z - me.z); A.input.aim(Math.atan2(tgt.x - me.x, tgt.z - me.z), Math.min(1, Math.max(0, (d - 3) / 13))); }
    if (me.hp < S.mhp * 0.35) me.hp = Math.round(S.mhp * 0.7); // 倒れて最初からにならないように（決まった手順なので結果は毎回同じ）
  };
  const step = (ms) => C.step(ms, aim);
  window.__rec = log;
  const ready = async () => { for (let i = 0; i < 40 && !D.canAct(); i++) await step(50); };
  const tap = async () => { await ready(); D.press(true); await step(50); D.press(false); await step(450); };
  if (spec.act === 'full') {
    for (let i = 0; i < 3; i++) await tap();
    await ready(); D.press(true); await step(1500); D.press(false); await step(800);
    await ready(); D.ws(); await step(900);
    await ready(); D.dodge(); await step(600);
    await tap();
    await step(1200);
  } else {
    await ready(); D.tree(0); await step(1600);
    await ready(); D.tree(0); await step(1200);
  }
  window.__rec = null;
  // 状態の記録（数・文字・真偽だけ。小数は 1e-6 で丸める）
  const prim = (o) => {
    const r = {};
    for (const [k, v] of Object.entries(o || {})) {
      if (typeof v === 'number') r[k] = Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : String(v);
      else if (typeof v === 'string' || typeof v === 'boolean' || v === null) r[k] = v;
      else if (Array.isArray(v) && v.every((x) => typeof x === 'number')) r[k] = v.map((x) => Math.round(x * 1e6) / 1e6);
    }
    return r;
  };
  return {
    log, learned,
    S: prim(S), me: prim(me),
    buffs: me.buffs.map((b) => ({ id: b.id, label: b.label, t: Math.round(b.t * 1e4) / 1e4, mods: b.mods })),
    mobs: [...G.mobs.values()].map((m) => [m.id, Math.round(m.hp), Math.round(m.x * 100) / 100, Math.round(m.z * 100) / 100]).sort((a, b) => a[0] - b[0]),
  };
};
