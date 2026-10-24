// public/js/models.js の animateMob(306-357 行)へ同じ状態を渡し、部品のローカル値と発光を保存する。
//   node tools/worldart/godot/golden_mobs.mjs → godot/worldart/data/mobs_golden.json
// 照合は godot/worldart/scripts/tests/mobs_golden.gd が行う。数値は丸めず、比較許容差は 1e-4。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FLOORS, TREASURE_DEF } from '../../../public/shared/data.js';
import { animateMob, makeMob } from '../../../public/js/models.js';

const OUT = new URL('../../../godot/worldart/data/mobs_golden.json', import.meta.url);
const TYPES = ['slime', 'beast', 'golem', 'wisp', 'bat', 'mushroom', 'scorpion', 'lizard', 'rootknot', 'mage', 'knight'];
const names = ['body', 'squash', 'legs', 'legs2', 'tail', 'head', 'wings', 'cap', 'shell', 'arms', 'arm', 'guardArm', 'cape', 'sigil', 'aura'];
const states = (t) => [
  ...[0, 1, 2, 3].flatMap((st) => [{ t, st }, { t: t + 0.76, st }]),
  { t: 0.43, st: 0, stun: true },
  { t: 0.61, st: 0, flash: 0.75 },
  { t: 0.77, st: 0, enraged: true },
  { t: 0.23, st: 2, stun: true },
  { t: 0.89, st: 2, stun: true, flash: 0.75 },
];

const mobExamples = new Map();
FLOORS.forEach((floor, floorIndex) => {
  for (const [group, rows] of [['mobs', floor.mobs || []], ['elites', floor.elites || []], ['boss.minions', floor.boss?.minions || []]]) {
    for (const mob of rows) if (!mobExamples.has(mob.t)) mobExamples.set(mob.t, { mob, source: `FLOORS[${floorIndex}].${group}` });
  }
});
if (!mobExamples.has(TREASURE_DEF.t)) mobExamples.set(TREASURE_DEF.t, { mob: TREASURE_DEF, source: 'TREASURE_DEF' });

const hex = (value) => `#${Number(value).toString(16).padStart(6, '0').slice(-6)}`;
function samplePart(node) {
  const result = { position: node.position.toArray(), rotation: [node.rotation.x, node.rotation.y, node.rotation.z], scale: node.scale.toArray() };
  if (node.isLight) result.intensity = node.intensity;
  return result;
}
function sample(model) {
  const u = model.userData, parts = {};
  for (const name of names) {
    const value = u[name];
    if (!value) continue;
    if (Array.isArray(value)) parts[name] = value.map(samplePart);
    else parts[name] = samplePart(value);
  }
  return {
    parts,
    // THREE.Color は線形 RGB。Godot 側もシェーダーに届く線形 RGB にして比べる。
		materials: u.mats.map(({ m }) => [m.emissive.r * m.emissiveIntensity, m.emissive.g * m.emissiveIntensity, m.emissive.b * m.emissiveIntensity]),
  };
}
function makeCase(type, source, inputStates) {
  const example = mobExamples.get(type);
  if (!example) throw new Error(`mob data not found: ${type}`);
  const color = hex(example.mob.color);
  const accent = hex(example.mob.accent ?? 0xff4030);
  const model = makeMob(type, color, 1, accent, false);
  const expect = [];
  for (const state of inputStates) {
    animateMob(model, state);
    expect.push(sample(model));
  }
  model.clear();
  return { type, source, color, accent, states: inputStates, expect };
}

const cases = [];
for (const type of TYPES) {
  const inputStates = states(0.37);
  // 最後のケースはスタン解除の履歴も含め、stunPose の復帰を照合する。
  inputStates.push({ t: 0.4, st: 2, stun: true }, { t: 0.5, st: 0, stun: false });
  cases.push(makeCase(type, mobExamples.get(type)?.source || '', inputStates));
}
fs.mkdirSync(new URL('.', OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ tolerance: 1e-4, cases }, null, 1) + '\n');
console.log(`11 形・${cases.reduce((n, c) => n + c.states.length, 0)} 件 → ${fileURLToPath(OUT)}`);
