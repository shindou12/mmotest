// サーバー（World）の記録: 乱数と時刻を固定し、3人の決まった操作を流して、送られたメッセージの列を段階ごとにまとめる
import { createHash } from 'node:crypto';

export async function simTrace() {
  let s = 0x2545f491 >>> 0;
  const random = Math.random, dateNow = Date.now;
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let clock = 1700000000000; Date.now = () => clock;
  try {
    const { World } = await import('../../public/shared/sim.js');
    const saves = [];
    const w = new World({ unlocked: 3, box: [], onSave: (d) => saves.push(JSON.stringify(d)) });
    const inbox = { 1: [], 2: [], 3: [] };
    for (const id of [1, 2, 3]) w.addPlayer(id, (m) => inbox[id].push(JSON.parse(JSON.stringify(m))));
    const phases = {};
    let cut = 0;
    const phase = (name) => {
      const msgs = [1, 2, 3].map((id) => inbox[id].splice(0));
      const types = {}; for (const list of msgs) for (const m of list) types[m.t] = (types[m.t] || 0) + 1;
      phases[`${String(++cut).padStart(2, '0')} ${name}`] = { hash: createHash('sha256').update(JSON.stringify(msgs)).digest('hex').slice(0, 24), types };
    };
    const tick = (sec) => { for (let i = 0; i < Math.round(sec / 0.05); i++) { w.tick(0.05); clock += 50; } };
    const P = (id) => w.players.get(id);
    const area = (id) => w.area(P(id).area);
    const st = (id, x, z, extra = {}) => w.handle(id, { t: 'st', x, z, a: 0, hp: 100, mhp: 100, lv: 10, wk: ['spear', 'sword', 'bow'][id - 1], wr: 1, sw: 0, sk: 0, dg: 0, gd: 0, wst: 0, arm: 0, rc: 0, cl: 0, pm: '', pt: 0, ...extra });
    const nearMob = (id, kind) => [...area(id).mobs.values()].filter((m) => m.hp > 0 && (!kind || m.kind === kind)).sort((a, b) => Math.hypot(a.x - P(id).x, a.z - P(id).z) - Math.hypot(b.x - P(id).x, b.z - P(id).z) || a.id - b.id)[0];

    for (const id of [1, 2, 3]) w.handle(id, { t: 'hello', name: `P${id}`, color: '#4af', lv: 10 });
    tick(1); phase('hello');
    w.handle(1, { t: 'chat', text: 'こんにちは' });
    w.handle(1, { t: 'box', op: 'open' }); w.handle(1, { t: 'box', op: 'put', item: { id: 'x1', slot: 'weapon', kind: 'sword', rarity: 1, ilvl: 1, atk: 5, affixes: [] }, ref: 'x1' });
    tick(0.5); phase('town chat and box');
    for (const id of [1, 2, 3]) w.handle(id, { t: 'wp', to: 'f1_field' });
    tick(1); phase('to field');
    // フィールド: 近くの敵に寄って殴る（技の引き寄せ・押し戻し・足止め、挑発、ヘイト）
    for (let round = 0; round < 40; round++) {
      for (const id of [1, 2, 3]) {
        const mob = nearMob(id);
        if (!mob) continue;
        st(id, mob.x + (id - 2) * 1.2, mob.z - 2, { pm: round % 5 === 0 ? 'heavy' : '', pt: 0.1 });
        const tech = ['spear_sweep', 'axe_hook', 'bow_tether', 'axe_rush', ''][round % 5];
        w.handle(id, { t: 'hit', id: mob.id, dmg: 6 + id * 3, crit: round % 3 === 0, st: 2, tech });
        if (round % 7 === 0) w.handle(id, { t: 'threat', id: mob.id, n: 50 });
        if (round % 11 === 0 && id === 1) w.handle(id, { t: 'taunt', r: 12 });
        if (round % 4 === 0) w.handle(id, { t: 'absorb', id: mob.id });
      }
      tick(0.5);
    }
    phase('field fight');
    // 迷宮区のボス: 部屋へ入って殴り、スタンさせ、倒れて起こす
    for (const id of [1, 2, 3]) w.handle(id, { t: 'wp', to: 'f1_lab' });
    tick(1); phase('to labyrinth');
    w.handle(1, { t: 'interact', what: 'lever' }); tick(0.5); phase('lever');
    const A = area(1);
    if (A.lair) for (const id of [1, 2, 3]) st(id, A.lair.x + (id - 2) * 2, A.lair.z - 3);
    tick(3); phase('enter lair');
    for (let round = 0; round < 60; round++) {
      const boss = nearMob(1, 'boss');
      for (const id of [1, 2, 3]) {
        if (boss) { st(id, boss.x + (id - 2) * 2, boss.z - 3); w.handle(id, { t: 'hit', id: boss.id, dmg: 40, st: 12, crit: false }); }
        const pr = area(id).projs?.[0]; if (pr && round % 3 === 0) w.handle(id, { t: 'pblock', id: pr.id });
      }
      if (round === 20) w.handle(2, { t: 'down', n: 0 });
      if (round > 20 && round < 30) w.handle(1, { t: 'rev', id: 2, v: 6 });
      tick(0.5);
    }
    phase('boss fight');
    // 2・3層へ
    for (const n of [2, 3]) {
      for (const id of [1, 2, 3]) w.handle(id, { t: 'warp', floor: n });
      tick(1); phase(`warp floor ${n}`);
      const f = n === 2 ? 'f2_field' : 'f3_field';
      for (const id of [1, 2, 3]) w.handle(id, { t: 'wp', to: f });
      for (let round = 0; round < 20; round++) { for (const id of [1, 2, 3]) { const mob = nearMob(id); if (mob) { st(id, mob.x, mob.z - 2); w.handle(id, { t: 'hit', id: mob.id, dmg: 30, st: 1 }); } } tick(0.5); }
      phase(`floor ${n} field`);
    }
    // 全滅: 3人とも倒れる
    for (const id of [1, 2, 3]) w.handle(id, { t: 'down', n: 1 });
    tick(2); phase('wipe');
    w.removePlayer(3); tick(1); phase('leave');
    phases.saves = createHash('sha256').update(JSON.stringify(saves)).digest('hex').slice(0, 24);
    return phases;
  } finally { Math.random = random; Date.now = dateNow; }
}
