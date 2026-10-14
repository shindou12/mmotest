// NPC の見た目の登録表。エリア定義（shared/areas.js）の npcs[].model の名前ごとの関数（書いていなければ villager）
// NPC の見た目を足すときは、ここに関数を足して、エリアの npcs に model: '名前' を書く
import { makePlayer } from '../models.js';

export const NPC_MODELS = {
  // 町の人: プレイヤーと同じ体を、その NPC の色で（足元の輪は出さない）
  villager(d) {
    const model = makePlayer(d.color);
    model.userData.ring.visible = false;
    return model;
  },
};
export const makeNpc = (d) => (Object.hasOwn(NPC_MODELS, d.model ?? '') ? NPC_MODELS[d.model] : NPC_MODELS.villager)(d);
