// モデルの形の記録: 武器（6種×レア度×形）・プレイヤー（防具の見た目・武器・盾）・敵（全種・ボス・精鋭）・落とし物を、
// メッシュの数・頂点数・境界ボックス・材質・各部の位置で書き留める
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { makeWeapon, makePlayer, setPlayerWeapon, setPlayerArmor, makeMob, animateMob, makeCoin, makeShard, makeGoldBag, makeLootItem, makeLootOrb, ARMOR_LOOK_NAMES } from '../../public/js/models.js';
import { FLOORS, RARITIES, starterWeapon } from '../../public/shared/data.js';

const r = (n) => Math.round(n * 1e6) / 1e6 + 0;
function shape(root) {
  root.updateMatrixWorld(true);
  let meshes = 0, verts = 0; const parts = [];
  root.traverse((o) => {
    const p = [o.type, o.name || '', o.visible, ...o.matrixWorld.elements.map(r)];
    if (o.isMesh || o.isLine || o.isPoints) {
      meshes++;
      const g = o.geometry, pos = g?.attributes?.position;
      verts += pos ? pos.count : 0;
      p.push(g?.type, pos ? pos.count : 0, g?.index ? g.index.count : 0);
      if (pos) { let s = 0; for (let i = 0; i < pos.array.length; i += 7) s += pos.array[i] * ((i % 13) + 1); p.push(r(s)); }
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) p.push(m?.type, m?.color?.getHex?.(), r(m?.opacity ?? 1), !!m?.transparent, m?.side, m?.blending, m?.emissive?.getHex?.());
      p.push(o.renderOrder, o.frustumCulled);
    }
    parts.push(p);
  });
  const box = new THREE.Box3().setFromObject(root);
  return { meshes, verts, box: [...box.min.toArray(), ...box.max.toArray()].map((n) => Math.round(n * 1e4) / 1e4 + 0), hash: createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24) };
}

export function modelTraces() {
  const random = Math.random; Math.random = () => 0.5;
  const out = {};
  try {
    for (const kind of ['sword', 'greatsword', 'spear', 'dagger', 'axe', 'bow']) for (let rarity = 0; rarity < RARITIES.length; rarity++) for (let style = 0; style < 4; style++) {
      out[`weapon/${kind}/${rarity}/${style}`] = shape(makeWeapon(kind, rarity, style));
    }
    for (let look = 0; look < ARMOR_LOOK_NAMES.length; look++) {
      const m = makePlayer('#448a9b'); setPlayerArmor(m, look); setPlayerWeapon(m, 'spear', 3, 1);
      out[`player/armor${look}`] = shape(m);
    }
    for (const kind of ['sword', 'greatsword', 'spear', 'dagger', 'axe', 'bow']) for (const rarity of [0, 3, 6, 7]) {
      const m = makePlayer('#c05050'); setPlayerWeapon(m, kind, rarity, rarity % 4); out[`player/${kind}/${rarity}`] = shape(m);
    }
    const seen = new Set();
    for (const f of FLOORS) {
      for (const md of f.mobs) for (const [tag, accent, sc] of [['n', null, 1], ['elite', 0xffb030, 1.3], ['named', 0xff60d0, 1.6]]) {
        const key = `mob/${md.t}/${md.color}/${tag}`; if (seen.has(key)) continue; seen.add(key);
        const m = makeMob(md.t, md.color, sc, accent); out[key] = shape(m);
        for (const [i, s] of [{ st: 0 }, { st: 1 }, { st: 2, enraged: true }, { st: 3, flash: 1 }].entries()) { animateMob(m, { t: 1.3 + i, ...s }); out[`${key}/anim${i}`] = shape(m); }
      }
      if (f.boss) { const m = makeMob(f.boss.t, f.boss.color, f.boss.scale, f.boss.accent, true); out[`boss/${f.boss.name}`] = shape(m); animateMob(m, { t: 2, st: 2, enraged: true }); out[`boss/${f.boss.name}/anim`] = shape(m); }
    }
    out.coin = shape(makeCoin()); out.shard = shape(makeShard()); out.goldbag = shape(makeGoldBag());
    for (let rarity = 0; rarity < RARITIES.length; rarity++) out[`orb/${rarity}`] = shape(makeLootOrb(rarity));
    for (const kind of ['sword', 'bow']) { const it = starterWeapon(kind); it.id = 'x'; out[`loot/${kind}`] = shape(makeLootItem(it)); }
    out['loot/armor'] = shape(makeLootItem({ id: 'a', slot: 'armor', armor: 'heavy', rarity: 3, affixes: [] }));
    out['loot/title'] = shape(makeLootItem({ id: 't', slot: 'title', rarity: 4, affixes: [] }));
  } finally { Math.random = random; }
  return out;
}
