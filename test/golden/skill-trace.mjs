// スキルと武器ツリーの記録: 全スキル（強攻撃・武器スキル・ツリースキル・技、武器ツリーの lv1〜3・A/B）を、
// 呼ばれた操作をすべて書き留める文脈で動かす。武器ツリーの効果（wtEffects）も全ノード・全段階で書き留める
import { createHash } from 'node:crypto';
import { HEAVY, WEAPON_SKILLS, TREE_SKILLS, TREES, NODE_INDEX, treeEffects } from '../../public/js/skills.js';
import { WTREES, WT_NODE, WT_SKILLS, wtEffects, wtLearn, wtChoose, profOf } from '../../public/js/weapon-tree.js';
import { MOTION_DURATIONS } from '../../public/shared/motion-catalog.js';

const h = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);
const round = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const clean = (v, depth = 0) => {
  if (typeof v === 'function') return 'fn';
  if (v instanceof Set) return [...v].sort();
  if (Array.isArray(v)) return depth > 4 ? '…' : v.map((x) => clean(x, depth + 1));
  if (v && typeof v === 'object') { if (depth > 4) return '…'; const o = {}; for (const k of Object.keys(v).sort()) o[k] = clean(v[k], depth + 1); return o; }
  return round(v);
};

// 呼ばれたものをすべて書き留める文脈（知らない名前も記録用の関数を返す）
function recorder(W, wk) {
  const events = [], queue = []; let time = 0;
  const mob = { id: 7, x: 0.5, z: 3, hp: 25, mhp: 100, rad: 0.8, a: Math.PI, kind: 0 };
  const log = (name) => (...args) => { events.push([round(time), name, clean(args)]); return undefined; };
  const proxy = (base, prefix) => new Proxy(base, { get(t, k) { if (k in t) return t[k]; if (typeof k === 'symbol') return undefined; return log(prefix + String(k)); } });
  const me = { x: 0, z: 0, a: 0, hp: 80, iframe: 0 };
  const base = {
    me, aim: () => 0, col: () => 0xcfd3da, wt: () => W, S: () => ({ wt: W, wk, flags: new Set(), mhp: 100 }),
    later: (sec, fn) => { events.push([round(time), 'later', [round(sec)]]); queue.push({ at: time + sec, fn, seq: queue.length + events.length }); },
    point: () => ({ x: 2, z: 7 }), targets: () => [mob], nearest: () => mob, area: () => 'f1_field',
    range: () => 12, zone: () => [6, 10], reach: () => 1,
    fx: proxy({ parts: proxy({}, 'parts.') }, 'fx.'),
  };
  const c = proxy(base, '');
  const run = () => { while (queue.length) { queue.sort((a, b) => a.at - b.at || a.seq - b.seq); const q = queue.shift(); time = q.at; q.fn(); } };
  return { c, events, run, mob };
}

export function skillTraces() {
  const random = Math.random; Math.random = () => 0.5;
  const out = {};
  try {
    // 旧来のスキル（強攻撃・武器スキル・ツリースキル・技）
    for (const [wk, sk] of Object.entries(HEAVY)) for (const lv of [1, 2]) {
      const k = recorder(null, wk); sk.run(k.c, lv); k.run(); out[`heavy/${wk}/${lv}`] = h(k.events);
    }
    for (const [id, sk] of Object.entries(WEAPON_SKILLS)) { const k = recorder(null, sk.kind); sk.run(k.c); k.run(); out[`ws/${id}`] = h(k.events); }
    for (const [id, sk] of Object.entries(TREE_SKILLS)) {
      if (WT_SKILLS[id]) continue;
      const k = recorder(null, sk.kind); sk.run(k.c); k.run(); out[`ts/${id}`] = h(k.events);
    }
    // 武器ツリーのスキル: lv1・lv2・lv3A・lv3B、マスターごと（スキルが読むのは自分の段階と分岐）
    for (const [id, sk] of Object.entries(WT_SKILLS)) {
      const n = WT_NODE[id];
      for (const [lv, br] of [[1], [2], [3, 'A'], [3, 'B']]) {
        const ch = { lv: 1, tree: {}, prof: {}, wt: {} }; profOf(ch, n.wk).lv = 20;
        for (let i = 0; i < lv; i++) wtLearn(ch, id); if (br) wtChoose(ch, id, br);
        const W = wtEffects(ch, n.wk), k = recorder(W, n.wk);
        sk.run(k.c); k.run();
        out[`wt/${id}/${lv}${br || ''}`] = h(k.events);
        out[`wtmeta/${id}/${lv}${br || ''}`] = h([sk.name, sk.kind, sk.cd, sk.cdOf?.(W), sk.motion, sk.motionOf?.(W), sk.duration, MOTION_DURATIONS[sk.motionOf?.(W) || sk.motion]]);
      }
    }
    // 武器ツリーの効果: 全ノードの全段階
    for (const [wk, tree] of Object.entries(WTREES)) for (const row of tree.rows) for (const n of row.nodes) {
      const steps = n.kind === 'skill' || n.kind === 'passive' ? [[1], [2], [3, 'A'], [3, 'B']] : [[1]];
      for (const [lv, br] of steps) {
        const ch = { lv: 1, tree: {}, prof: {}, wt: {} }; profOf(ch, wk).lv = 20;
        if (n.from) wtLearn(ch, n.from);
        for (let i = 0; i < lv; i++) wtLearn(ch, n.id); if (br) wtChoose(ch, n.id, br);
        const W = wtEffects(ch, wk);
        out[`eff/${n.id}/${lv}${br || ''}`] = h({ st: W.st, mods: W.mods, actives: [...W.actives].sort(), ks1: W.ks1, ks2: W.ks2, lv: W.lv(n.id), br: W.br(n.id), v: Object.keys(n).filter((k) => Array.isArray(n[k]) && k !== 'lv' && k !== 'tags' && typeof n[k][0] === 'number').map((k) => [k, W.v(n.id, k)]) });
      }
    }
    // 旧ツリー（ステータス・プレイスタイル）と、データとしての武器ツリー
    out.trees = h(clean(TREES)); out.nodeIndex = h(clean(NODE_INDEX)); out.wtrees = h(clean(WTREES)); out.wtnode = h(clean(WT_NODE));
    out.treeEffects = h(clean(treeEffects({ lv: 30, tree: { st_str: 2, st_vit: 3, st_dex: 1 } }, 'sword')));
  } finally { Math.random = random; }
  return out;
}
