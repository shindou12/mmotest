// 調整値（shared/balance.js）から決まる、精鋭・ネームド・スタンの定数
import { BALANCE } from '../balance.js';

export const ELITE = { hp: BALANCE.eliteHp, dmg: BALANCE.eliteDamage, xp: 2.5 };
export const NAMED = { hp: BALANCE.namedHp, dmg: BALANCE.namedDamage, xp: 8, respawn: 360 };
export const STUN_TIME = BALANCE.stunSeconds;
