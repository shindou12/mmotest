// Dedicated boss appearances. The simulation keeps the original archetype (t).
// Each entry owns its geometry and any gait required by that geometry.
import { buildGraz } from './bosses/graz-model.js';
import { GRAZ_MOTIONS } from './bosses/graz-motion.js';
import { buildYugdra, animateYugdra } from './bosses/yugdra-model.js';
import { YUGDRA_MOTIONS } from './bosses/yugdra-motion.js';
import { buildSkorpio, animateSkorpio } from './bosses/skorpio-model.js';
import { SKORPIO_MOTIONS } from './bosses/skorpio-motion.js';

export const BOSS_MODELS = {
  graz: { build: buildGraz, motions: GRAZ_MOTIONS }, // motions: 技ごとの動き（再生は models/boss-motion.js）
  yugdra: { build: buildYugdra, animate: animateYugdra, motions: YUGDRA_MOTIONS },
  skorpio: { build: buildSkorpio, animate: animateSkorpio, motions: SKORPIO_MOTIONS },
};
