// Dedicated boss appearances. The simulation keeps the original archetype (t).
// Each entry owns its geometry and any gait required by that geometry.
import { buildGraz } from './bosses/graz-model.js';
import { GRAZ_MOTIONS } from './bosses/graz-motion.js';
import { buildGraz3, buildGraz4, animateGraz3 } from './bosses/graz-fx.js';
import { buildYugdra, animateYugdra } from './bosses/yugdra-model.js';
import { YUGDRA_MOTIONS } from './bosses/yugdra-motion.js';
import { buildSkorpio, animateSkorpio } from './bosses/skorpio-model.js';
import { SKORPIO_MOTIONS } from './bosses/skorpio-motion.js';
import { buildCrystalos, buildCrystalos2, buildCrystalos3, animateCrystalos } from './bosses/crystalos-model.js';

export const BOSS_MODELS = {
  graz: { build: buildGraz, motions: GRAZ_MOTIONS }, // motions: 技ごとの動き（再生は models/boss-motion.js）
  graz3: { build: buildGraz3, animate: animateGraz3, motions: GRAZ_MOTIONS }, // 作り込みの段階 3（比較用。部位と支点は graz と同じ）
  graz4: { build: buildGraz4, animate: animateGraz3, motions: GRAZ_MOTIONS }, // 作り込みの段階 4（試作: 毛皮の体を粘土のようななめらかな形で作る）
  yugdra: { build: buildYugdra, animate: animateYugdra, motions: YUGDRA_MOTIONS },
  skorpio: { build: buildSkorpio, animate: animateSkorpio, motions: SKORPIO_MOTIONS },
  crystalos: { build: buildCrystalos, animate: animateCrystalos }, // 4層（まだ遊べない層）のボス
  // 作り込みの段階の比較用（2: 中 / 3: 高）。data.js の appearance をこちらにすると使われる
  crystalos2: { build: buildCrystalos2, animate: animateCrystalos },
  crystalos3: { build: buildCrystalos3, animate: animateCrystalos },
};
