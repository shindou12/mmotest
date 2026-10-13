import { SPEAR_TIMINGS } from './skill-timings.js';
import { TECHNIQUES } from './techniques.js';
export const MOTION_DURATIONS=Object.freeze(Object.fromEntries([
 ...Object.entries(SPEAR_TIMINGS).map(([id,t])=>[id,t.duration]),
 ...Object.entries(TECHNIQUES).map(([id,t])=>[id,t.duration]),
]));
