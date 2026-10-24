import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const ICON_DIR = path.join(ROOT, 'godot/worldart/assets/icons');

const [weaponModule, treeModule, dataModule, areaModule] = await Promise.all([
  import(pathToFileURL(path.join(ROOT, 'public/js/weapons/index.js'))),
  import(pathToFileURL(path.join(ROOT, 'public/js/weapon-tree.js'))),
  import(pathToFileURL(path.join(ROOT, 'public/shared/data.js'))),
  import(pathToFileURL(path.join(ROOT, 'public/shared/areas.js'))),
]);

const weaponAccents = {
  sword: '#5598e8',
  greatsword: '#e65c58',
  dagger: '#a979dd',
  axe: '#ed9b43',
  spear: '#63bb76',
  bow: '#e8c14f',
};
const buffAccents = {
  sv_twin: '#73b8ff',
  sv_giant: '#b38cff',
  sv_rapid: '#ffe16b',
  sv_blaze: '#ff7b3e',
  sv_storm: '#ffe040',
  sv_drain: '#c060ff',
  sv_blink: '#9affff',
  sv_quake: '#d8b080',
  sv_frost: '#80d8ff',
  sv_gale: '#8affb0',
  sv_heavy: '#ff5040',
  sv_holy: '#fff0a0',
  sv_venom: '#8aff5a',
  sv_meteor: '#ffa060',
  sv_haste: '#9affc8',
  sv_ward: '#bfe0ff',
};

function nodeDescription(node) {
  const parts = [];
  if (node.base) parts.push(node.base);
  if (node.desc) parts.push(node.desc);
  if (Array.isArray(node.lv)) {
    if (node.lv[0]) parts.push(`強化1: ${node.lv[0]}`);
    if (node.lv[1]) parts.push(`強化2: ${node.lv[1]}`);
  }
  for (const branch of ['A', 'B']) {
    const choice = node[branch];
    if (choice) parts.push(`分岐${branch}「${choice.name}」: ${choice.desc}`);
  }
  return parts.join('。');
}

const icons = [];
for (const weapon of weaponModule.WEAPON_DEFS) {
  const weaponName = weapon.stats.name;
  for (const row of weapon.tree.rows) {
    for (const node of row.nodes) {
      if (!node.icon) continue;
      const type = row.kind === 'skill' ? 'skill' : 'tree';
      icons.push({
        key: node.id,
        name: node.name,
        symbol: node.icon,
        type,
        description: nodeDescription(node),
        weapon: weapon.wk,
        weapon_name: weaponName,
        accent: weaponAccents[weapon.wk] || '#c8a0ff',
        base_shape: type === 'skill' ? 'round' : 'hexagonal',
        source: `public/js/weapons/${weapon.wk}.js`,
      });
    }
  }
}

for (const [key, tag] of Object.entries(treeModule.WT_TAGS)) {
  if (!tag.icon) continue;
  icons.push({
    key: `tag_${key}`,
    name: tag.name,
    symbol: tag.icon,
    type: 'tree',
    description: `武器ツリーの分類タグ「${tag.name}」`,
    base_shape: 'hexagonal',
    source: 'public/js/weapon-tree.js',
  });
}

for (const [key, variant] of Object.entries(dataModule.SKILL_VARIANTS)) {
  if (!variant.icon) continue;
  icons.push({
    key,
    name: variant.name,
    symbol: variant.icon,
    type: 'buff',
    description: typeof variant.desc === 'function' ? variant.desc(5) : (variant.desc || ''),
    accent: buffAccents[key] || '#c8a0ff',
    base_shape: 'square',
    source: 'public/shared/data.js',
  });
}

for (const [key, area] of Object.entries(areaModule.AREA_TYPES)) {
  if (!area.icon) continue;
  icons.push({
    key: `area_${key}`,
    name: area.name,
    symbol: area.icon,
    type: 'area',
    description: `エリア種別「${area.name}」`,
    accent: area.color,
    base_shape: 'octagonal',
    source: 'public/shared/areas.js',
  });
}

for (const [key, weather] of Object.entries(areaModule.WEATHERS)) {
  if (!weather.icon) continue;
  icons.push({
    key: `weather_${key}`,
    name: weather.name,
    symbol: weather.icon,
    type: 'area',
    description: `天候「${weather.name}」`,
    accent: '#a9c7da',
    base_shape: 'octagonal',
    source: 'public/shared/areas.js',
  });
}

const keys = new Set();
for (const icon of icons) {
  if (keys.has(icon.key)) throw new Error(`重複したアイコンキー: ${icon.key}`);
  keys.add(icon.key);
  if (!icon.name || !icon.symbol || !icon.type) throw new Error(`必須項目がありません: ${icon.key}`);
}

fs.mkdirSync(ICON_DIR, { recursive: true });
fs.writeFileSync(path.join(ICON_DIR, 'list.json'), `${JSON.stringify(icons, null, 2)}\n`, 'utf8');

const counts = Object.fromEntries(['skill', 'tree', 'buff', 'item', 'area'].map((type) => [
  type,
  icons.filter((icon) => icon.type === type).length,
]));
const symbols = new Set(icons.map((icon) => icon.symbol));
console.log(`技: ${counts.skill}`);
console.log(`ツリー: ${counts.tree}`);
console.log(`バフ: ${counts.buff}`);
console.log(`持ち物: ${counts.item}`);
console.log(`エリア: ${counts.area}`);
console.log(`合計: ${icons.length}`);
console.log(`記号の種類: ${symbols.size}`);
