// 武器ツリーのスキルが共通で使う道具
import { TECHNIQUES } from '../../shared/techniques.js';

export const L3 = 'lv2の効果のまま、A・Bどちらかの形に変わる';
export const T = TECHNIQUES;
export const at = (c, sec, fn) => c.later(sec, fn);
export const slashAt = (c, a, r, deg, mult, o = {}) => { c.arc(r, deg, mult, { type: 'tskill', a, ...o }); c.fx.slash(c.me.x, c.me.z, a, r, deg, c.col(), 1.6); c.sfx('swing', { heavy: true }); };
export const spOff = (x, z, a, d) => ({ x: x + Math.sin(a) * d, z: z + Math.cos(a) * d });
export const inFront = (c, t, a, deg) => Math.abs(Math.atan2(Math.sin(Math.atan2(t.x - c.me.x, t.z - c.me.z) - a), Math.cos(Math.atan2(t.x - c.me.x, t.z - c.me.z) - a))) <= (deg * Math.PI / 180) / 2;
