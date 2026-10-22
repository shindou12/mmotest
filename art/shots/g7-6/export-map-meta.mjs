// public/shared/areas.js のマップ表示用データを Godot パネルへ書き出す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = await import(pathToFileURL(path.join(root, 'public/shared/areas.js')));
const target = path.join(root, 'godot/worldart/scripts/game/map_panel.gd');
const meta = {};
for (const area of Object.values(source.AREAS)) {
  const town = area.layout === 'town' ? source.townLayout(area) : null;
  meta[area.id] = {
    mapPos: area.mapPos,
    type: area.type,
    gate: !!area.gate,
    gateData: area.gate || null,
    weather: area.weather || '',
    hazard: area.hazard?.kind || area.hazards?.[0]?.kind || '',
    unique: area.unique?.name || '',
    named: area.named?.name || '',
    box: !!area.box,
    boxData: area.box || null,
    npcCount: area.npcs?.length || 0,
    npcs: (area.npcs || []).map(({x, z, name}) => ({x, z, name})),
    kinds: area.kinds || [],
    bias: area.bias || [],
    town: town ? {square: town.square, streets: town.streets} : {},
  };
}
const compact = (value) => JSON.stringify(value);
const block = [
  `const AREA_TYPES: Dictionary = ${compact(Object.fromEntries(Object.entries(source.AREA_TYPES).map(([key, value]) => [key, {name: value.name, icon: value.icon, color: value.color}])))}`,
  `const WEATHERS: Dictionary = ${compact(Object.fromEntries(Object.entries(source.WEATHERS).map(([key, value]) => [key, {name: value.name, icon: value.icon}])))}`,
  `const HAZARDS: Dictionary = ${compact(Object.fromEntries(Object.entries(source.HAZARDS).map(([key, value]) => [key, {name: value.name}])))}`,
  `const MAP_META: Dictionary = ${compact(meta)}`,
  `const CLEAR_KILLS := ${source.CLEAR_KILLS}`,
].join('\n');
const current = fs.readFileSync(target, 'utf8');
const start = '# GENERATED_MAP_META_START';
const end = '# GENERATED_MAP_META_END';
const before = current.indexOf(start);
const after = current.indexOf(end);
if (before < 0 || after <= before) throw new Error('map metadata markers were not found');
const output = current.slice(0, before + start.length) + '\n' + block + '\n' + current.slice(after);
fs.writeFileSync(target, output, 'utf8');
console.log(`MAP_META ${Object.keys(meta).length} areas -> ${path.relative(root, target)}`);
