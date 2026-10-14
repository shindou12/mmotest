// 画面: ダメージ数字・名札・落とし物の札。Presenter（描画パラメータを計算して View に set する）を P に足す。createUI（ui/app.js）が呼ぶ
// ui: 画面の部品と Presenter の入れ物（app.js が作る）。ほかの画面と共有する値は ui.〜 で読み書きする
import { RARITIES, transcendCount } from '../../../shared/data.js';
import { View } from '../core.js';
import { clamp, esc } from '../helpers.js';

export function installFloats(ui) {
  const { game, P, floatLayer } = ui;
  // ---- 浮かぶ文字・仲間の名札（ゲーム空間の位置 → 画面の位置） ----
  const floats = [];
  const plates = new Map();
  let floatSeq = 0;
  P.floatText = (x, y, z, text, cls) => {
    const s = game.settings;
    if (!s.dmgnum && (cls === '' || cls === 'crit' || cls === 'poison' || cls === undefined)) return;
    const el = document.createElement('div');
    floatLayer.el.appendChild(el);
    const v = new View(el, 'f' + floatSeq++, floatLayer);
    v.set({ cls: { dmg: true, [cls || 'n']: true }, text: String(text) });
    floats.push({ v, x: x + (Math.random() - 0.5) * 0.8, y, z, t: 0 });
  };
  P.floats = (dt) => {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t += dt;
      const q = game.project(f.x, f.y + f.t * 1.5, f.z);
      f.v.set({ style: { left: q.x + 'px', top: q.y + 'px', opacity: String(1 - Math.max(0, f.t - 0.6) / 0.4) } });
      if (f.t > 1) { f.v.remove(); floats.splice(i, 1); }
    }
    for (const [id, v] of plates) if (!game.others.has(id)) { v.remove(); plates.delete(id); }
    for (const o of game.others.values()) {
      let v = plates.get(o.id);
      if (!v) {
        const el = document.createElement('div');
        el.className = 'plate player';
        el.innerHTML = '<div class="pn"></div><div class="pb"><div></div></div>';
        floatLayer.el.appendChild(el);
        v = new View(el, 'plate' + o.id, floatLayer);
        v.add('name', '.pn'); v.add('hp', '.pb > div');
        plates.set(o.id, v);
      }
      const q = game.project(o.x, 2.6, o.z);
      v.set({ style: { display: q.vis && !o.dead ? '' : 'none', left: q.x + 'px', top: q.y + 'px' } });
      v.get('name').set({ text: `Lv${o.lv} ${o.name}` });
      v.get('hp').set({ style: { width: clamp(o.hp / o.mhp * 100, 0, 100) + '%' } });
    }
    lootLabels();
  };

  // ---- 落とし物の名札（レア度で色分け。重なったら上へ積む。クリックで拾う） ----
  const loot = new Map();
  const lootLabels = () => {
    const live = new Set();
    const list = [];
    for (const d of game.drops) {
      if (!d.landed) continue;
      live.add(d.id);
      let v = loot.get(d.id);
      if (!v) {
        const el = document.createElement('div');
        floatLayer.el.appendChild(el);
        v = new View(el, 'loot' + d.id, floatLayer);
        const stars = transcendCount(d.it);
        v.set({ cls: { loot: true, ['r' + d.it.rarity]: true, tx: stars > 0 }, attr: { title: `${RARITIES[d.it.rarity].name}${stars ? `・超越の特性 ${stars}つ` : ''}（クリックで拾う）` } });
        v.set({ html: (stars ? `<span class="stars">${'★'.repeat(stars)}</span>` : '') + esc(d.it.name) });
        v.on('click', 'loot:pick', () => ({ id: d.id }));
        v.size = { w: el.offsetWidth, h: el.offsetHeight };
        loot.set(d.id, v);
      }
      const q = game.project(d.x, 0.3, d.z);
      if (q.vis) list.push({ v, q });
      else v.set({ style: { display: 'none' } });
    }
    for (const [id, v] of loot) if (!live.has(id)) { v.remove(); loot.delete(id); }
    // 手前（画面の下）の札から置き、重なる札はその上へずらす
    list.sort((a, b) => b.q.y - a.q.y);
    const placed = [];
    for (const { v, q } of list) {
      const { w, h } = v.size;
      const x = q.x - w / 2;
      let y = q.y - h - 4;
      for (let n = 0; n < 30; n++) {
        const hit = placed.find((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h + 2 && y + h + 2 > p.y);
        if (!hit) break;
        y = hit.y - h - 2;
      }
      placed.push({ x, y, w, h });
      v.set({ style: { display: '', left: x + 'px', top: y + 'px' } });
    }
  };
}
