// NPC の見た目の記録: 全エリアの NPC を、メッシュの数・頂点数・境界ボックス・材質・各部の位置で書き留める
// 期待値は整理の前のコード（NPC はプレイヤーの体を NPC の色で作り、足元の輪を消していた）で作った
import { AREAS } from '../../public/shared/areas.js';
import { shapeOf } from './model-trace.mjs';

export async function npcTraces() {
  const random = Math.random; Math.random = () => 0.5;
  const out = {};
  try {
    let build;
    try { ({ makeNpc: build } = await import('../../public/js/models/npc-models.js')); } catch {
      const { makePlayer } = await import('../../public/js/models.js');
      build = (d) => { const m = makePlayer(d.color); m.userData.ring.visible = false; return m; };
    }
    for (const [id, def] of Object.entries(AREAS)) (def.npcs || []).forEach((d, i) => { out[`npc/${id}/${i}/${d.id}`] = shapeOf(build(d)); });
  } finally { Math.random = random; }
  return out;
}
