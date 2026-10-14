// World のメソッド: レバー・扉・宝箱・共有ボックス。sim.js が World.prototype に足す
import { RARITIES, floorLevel, makeItem, rollRarity } from '../data.js';
import { grid, chestsOf } from '../areas.js';

import { rnd, dist, r2, CHEST_COOLDOWN, SMALL_CHEST_COOLDOWN, BOX_MAX, BOX_RANGE } from './common.js';

export const InteractMethods = {
  interact(A, p, what, id) {
    const g = A.def.shape === 'grid' ? grid(A.def) : null;
    if (what === 'lever' && A.def.gimmick === 'lever' && !A.door) {
      const L = g.pts.L?.[0];
      if (!L || dist(L, p) > 4) return;
      this.openDoor(A, `${p.name} がレバーを引いた。重い扉が開いていく…`);
    }
    if (what === 'chest') {
      const list = chestsOf(A.def);
      const C = list.find((c) => c.id === id) || (!id && list[0]);
      if (!C || dist(C, p) > 4) return;
      const cd = C.big ? CHEST_COOLDOWN : SMALL_CHEST_COOLDOWN;
      const key = `${C.id}:${p.name}`;
      const last = A.chests.get(key) ?? -1e9;
      if (this.time - last < cd) {
        this.send(p, { t: 'chat', from: '', text: `宝箱は空っぽだ。（あと${Math.ceil(cd - (this.time - last))}秒で中身が戻る）`, color: '#aab' });
        return;
      }
      A.chests.set(key, this.time);
      const ilvl = floorLevel(A.n) + (C.big ? 5 : 3);
      let items;
      if (C.big && A.def.unique) {
        const t = Math.random();
        const rar = t < 0.05 ? 5 : t < 0.3 ? 4 : 3;
        const B = { bias: A.def.bias, kinds: A.def.kinds };
        items = [makeItem(ilvl, rar, { uniqueDef: A.def.unique, ...B }), makeItem(ilvl, rollRarity(1, 2, ilvl), B)];
      } else {
        // 小さな宝箱: アンコモン以上を1つ（上のレア度はアイテムレベルで出やすくなる）
        items = [makeItem(ilvl, rollRarity(0.6, 1, ilvl), { bias: A.def.bias, kinds: A.def.kinds })];
      }
      this.send(p, { t: 'gold', n: Math.round((C.big ? 80 + ilvl * 12 : 20 + ilvl * 4) * rnd(0.85, 1.15)), x: r2(C.x), z: r2(C.z + 1.2), bag: C.big });
      this.send(p, { t: 'loot', src: 'chest', ar: A.id, cid: C.id, sx: r2(C.x), sz: r2(C.z), items: items.map((it) => ({ it, x: r2(C.x + rnd(-1, 1)), z: r2(C.z + rnd(0.5, 1.5)) })) });
      for (const it of items) if (it.rarity >= 5) this.sys(`★ ${p.name} が${RARITIES[it.rarity].name}「${it.name}」を手に入れた！`, RARITIES[it.rarity].color);
    }
  },

  // 共有ボックス: open（中身を見る）/ put（入れる）/ take（取り出す）
  boxOp(A, p, m) {
    const op = String(m.op || '');
    if (op === 'close') { p.boxOpen = false; return; }
    const B = A.def.box;
    if (!B || dist(B, p) > BOX_RANGE) return;
    if (op === 'put') {
      const it = m.item;
      if (!it || typeof it !== 'object' || typeof it.name !== 'string' || typeof it.slot !== 'string') return;
      if (this.box.length >= BOX_MAX) { this.send(p, { t: 'chat', from: '', text: '共有ボックスがいっぱいだ。', color: '#f88' }); return; }
      const json = JSON.stringify(it);
      if (json.length > 4000) return;
      const item = JSON.parse(json);
      item.uid = this.seq++;
      item.by = p.name;
      this.box.push(item);
      this.send(p, { t: 'boxPut', ok: true, ref: m.ref });
      this.save();
      if (item.rarity >= 4) this.sys(`${p.name} が共有ボックスに「${item.name}」を入れた`, '#cfe');
    } else if (op === 'take') {
      const i = this.box.findIndex((it) => it.uid === m.uid);
      if (i < 0) { this.send(p, { t: 'chat', from: '', text: 'その装備はもう誰かが取り出したようだ。', color: '#aab' }); }
      else {
        const [item] = this.box.splice(i, 1);
        delete item.by;
        this.send(p, { t: 'boxTake', item });
        this.save();
      }
    } else if (op !== 'open') return;
    // 開いている人全員に最新の中身を送る
    for (const q of this.players.values()) {
      if (q.joined && (q === p || q.boxOpen)) this.send(q, { t: 'box', items: this.box, max: BOX_MAX });
    }
    p.boxOpen = op === 'open' || p.boxOpen;
  },

  openDoor(A, text) {
    if (A.door) return;
    A.door = true;
    this.sysArea(A.id, text, '#7fffd4');
    this.broadcastArea(A.id, { t: 'door', open: true });
  },
};
