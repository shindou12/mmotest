// Dedicated boss appearances. The simulation keeps the original archetype (t).
// Each entry owns its geometry and any gait required by that geometry.
import { buildGraz } from './bosses/graz-model.js';
import { buildYugdra, animateYugdra } from './bosses/yugdra-model.js';
import { buildSkorpio, animateSkorpio } from './bosses/skorpio-model.js';

export const BOSS_MODELS = {
  graz: { build: buildGraz },
  yugdra: { build: buildYugdra, animate: animateYugdra },
  skorpio: { build: buildSkorpio, animate: animateSkorpio },
};
