// Godot の技（godot/worldart/scripts/game/skills/）と元の JavaScript が同じ呼び出し列を作るかを照合するための「入力と期待値」を書く。
//   node tools/worldart/godot/golden_skills.mjs   → godot/worldart/data/skills_golden.json
// 元は test/golden/skill-trace.mjs（全スキルを「呼ばれた操作をすべて書き留める文脈」で動かし、ハッシュにして test/fixtures/golden-skills.json に記録している）。
// ここでは同じ回し方で、ハッシュにする前の記録 [時刻, 名前, clean した引数] の列をそのまま書く。
// 自己確認: 書く前に、各キーの生の記録を skill-trace.mjs と同じ h() でハッシュにして、fixtures の値と一致することを確かめる。1 つでも違えば止まる
// （= 書き出した記録が、元の計算と同じであることの保証）。
//
// 形: { keys: { <キー>: { suite, in: {入力}, ev | meta | eff } }, misc: { trees, nodeIndex, wtrees, wtnode, treeEffects } }
//   キーは skill-trace.mjs と同じ: heavy/<武器>/<lv>・ws/<id>・ts/<id>・wt/<id>/<段階>・wtmeta/<id>/<段階>・eff/<id>/<段階>（段階は 1・2・3A・3B）
//   ev: 呼び出し列、meta: スキルの表の値（wtmeta）、eff: 武器ツリーの効果（eff）。suite は Godot で照合する範囲（6 武器・wtree。空は照合しない）
// 照合する側は godot/worldart/scripts/tests/skills_golden.gd。
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { HEAVY, WEAPON_SKILLS, TREE_SKILLS, TREES, NODE_INDEX, treeEffects } from '../../../public/js/skills.js';
import { WTREES, WT_NODE, WT_SKILLS, wtEffects, wtLearn, wtChoose, profOf } from '../../../public/js/weapon-tree.js';
import { MOTION_DURATIONS } from '../../../public/shared/motion-catalog.js';

// ---- ここから下の h・round・clean・recorder は test/golden/skill-trace.mjs と同じ（あちらは recorder を export していないのでそのまま写した。
//      写しが元と同じであることは、下の自己確認（fixtures とのハッシュ照合）が保証する）----
const h = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);
const round = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const clean = (v, depth = 0) => {
  if (typeof v === 'function') return 'fn';
  if (v instanceof Set) return [...v].sort();
  if (Array.isArray(v)) return depth > 4 ? '…' : v.map((x) => clean(x, depth + 1));
  if (v && typeof v === 'object') { if (depth > 4) return '…'; const o = {}; for (const k of Object.keys(v).sort()) o[k] = clean(v[k], depth + 1); return o; }
  return round(v);
};

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

// Godot で照合する武器と範囲
const WK_SUITE = { sword: 'sword', greatsword: 'greatsword', dagger: 'dagger', axe: 'axe', spear: 'spear', bow: 'bow' };
// ts/ のうち6武器の分（旧来のツリースキルは武器の kind を持たないので、旧スロット名で分ける。技は kind が武器）
const TS_SUITE = (id, sk) => WK_SUITE[sk.kind] || ({ slant: 'sword', brave: 'sword', gslam: 'greatsword', fortress: 'greatsword', poison: 'dagger', smoke: 'dagger', warstomp: 'axe', bloodlust: 'axe', shieldbash: 'spear', taunt: 'spear', javelin: 'spear', whirl: 'spear', backshot: 'bow', focus: 'bow' }[id] || '');

const keys = {};
const hashes = {};   // 自己確認用: キー → 生の記録のハッシュ
const put = (key, suite, input, field, value) => { keys[key] = { suite, in: input, [field]: value }; hashes[key] = h(value); };

const random = Math.random; Math.random = () => 0.5;
try {
  // 旧来のスキル（強攻撃・武器スキル・ツリースキル・技）
  for (const [wk, sk] of Object.entries(HEAVY)) for (const lv of [1, 2]) {
    const k = recorder(null, wk); sk.run(k.c, lv); k.run();
    put(`heavy/${wk}/${lv}`, WK_SUITE[wk] || '', { kind: 'heavy', wk, lv }, 'ev', k.events);
  }
  for (const [id, sk] of Object.entries(WEAPON_SKILLS)) {
    const k = recorder(null, sk.kind); sk.run(k.c); k.run();
    put(`ws/${id}`, WK_SUITE[sk.kind] || '', { kind: 'ws', id, wk: sk.kind }, 'ev', k.events);
  }
  for (const [id, sk] of Object.entries(TREE_SKILLS)) {
    if (WT_SKILLS[id]) continue;
    const k = recorder(null, sk.kind); sk.run(k.c); k.run();
    put(`ts/${id}`, TS_SUITE(id, sk), { kind: 'ts', id, wk: sk.kind ?? null }, 'ev', k.events);
  }
  // 武器ツリーのスキル: lv1・lv2・lv3A・lv3B、マスターごと（スキルが読むのは自分の段階と分岐）
  for (const [id, sk] of Object.entries(WT_SKILLS)) {
    const n = WT_NODE[id];
    for (const [lv, br] of [[1], [2], [3, 'A'], [3, 'B']]) {
      const ch = { lv: 1, tree: {}, prof: {}, wt: {} }; profOf(ch, n.wk).lv = 20;
      for (let i = 0; i < lv; i++) wtLearn(ch, id); if (br) wtChoose(ch, id, br);
      const W = wtEffects(ch, n.wk), k = recorder(W, n.wk);
      sk.run(k.c); k.run();
      const step = `${lv}${br || ''}`, input = { kind: 'wt', id, wk: n.wk, lv, br: br || null };
      put(`wt/${id}/${step}`, WK_SUITE[n.wk] || '', input, 'ev', k.events);
      put(`wtmeta/${id}/${step}`, WK_SUITE[n.wk] ? 'wtree' : '', { ...input, kind: 'wtmeta' }, 'meta', [sk.name, sk.kind, sk.cd, sk.cdOf?.(W), sk.motion, sk.motionOf?.(W), sk.duration, MOTION_DURATIONS[sk.motionOf?.(W) || sk.motion]]);
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
      put(`eff/${n.id}/${lv}${br || ''}`, WK_SUITE[wk] ? 'wtree' : '', { kind: 'eff', id: n.id, wk, lv, br: br || null },
        'eff', { st: W.st, mods: W.mods, actives: [...W.actives].sort(), ks1: W.ks1, ks2: W.ks2, lv: W.lv(n.id), br: W.br(n.id), v: Object.keys(n).filter((k) => Array.isArray(n[k]) && k !== 'lv' && k !== 'tags' && typeof n[k][0] === 'number').map((k) => [k, W.v(n.id, k)]) });
    }
  }
  // 旧ツリー（ステータス・プレイスタイル）と、データとしての武器ツリー（Godot では照合しない。自己確認のためだけに持つ）
  const misc = { trees: clean(TREES), nodeIndex: clean(NODE_INDEX), wtrees: clean(WTREES), wtnode: clean(WT_NODE), treeEffects: clean(treeEffects({ lv: 30, tree: { st_str: 2, st_vit: 3, st_dex: 1 } }, 'sword')) };
  for (const [k, v] of Object.entries(misc)) hashes[k] = h(v);
  keys.__misc = misc;
} finally { Math.random = random; }

// ---- 自己確認: skill-trace.mjs が記録した fixtures のハッシュと全キーが一致すること ----
const fx = JSON.parse(fs.readFileSync(new URL('../../../test/fixtures/golden-skills.json', import.meta.url), 'utf8'));
const bad = [];
for (const k of new Set([...Object.keys(fx), ...Object.keys(hashes)])) if (fx[k] !== hashes[k]) bad.push(`${k}: fixtures=${fx[k]} 今回=${hashes[k]}`);
if (bad.length) { console.error(`自己確認 NG: ${bad.length} / ${Object.keys(fx).length} キーが fixtures と違う（書き出しを止める）`); console.error(bad.slice(0, 10).join('\n')); process.exit(1); }
console.log(`自己確認 OK: 全 ${Object.keys(fx).length} キーが test/fixtures/golden-skills.json のハッシュと一致`);

const misc = keys.__misc; delete keys.__misc;
const count = {}, tested = {};
for (const [k, e] of Object.entries(keys)) { const p = k.split('/')[0]; count[p] = (count[p] || 0) + 1; if (e.suite) tested[e.suite] = (tested[e.suite] || 0) + 1; }
console.log(Object.entries(count).map(([p, n]) => `${p}: ${n}`).join('  '), `  (+ misc ${Object.keys(misc).length})`);
console.log('Godot で照合する範囲:', Object.entries(tested).map(([s, n]) => `${s} ${n}`).join('  '));
fs.writeFileSync(new URL('../../../godot/worldart/data/skills_golden.json', import.meta.url), JSON.stringify({ keys, misc }));
console.log(`-> godot/worldart/data/skills_golden.json キー ${Object.keys(keys).length} 件 + misc`);
