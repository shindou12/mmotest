import { CHARACTER_KEY, DEBUG_CHARACTER_KEY, CharacterStore } from '../character-store.js';

// ======================================================================
// セーブデータ / 設定
// ======================================================================
export const params = new URLSearchParams(location.search);
// デバッグ部屋（URL に ?debug）: 本番とは別のキャラ・別のソロのワールドで遊ぶ。倒れてもセーブは消えない（game/debug.js）
export const DEBUG = params.has('debug');
export const SAVE_KEY = DEBUG ? DEBUG_CHARACTER_KEY : CHARACTER_KEY;
export const SOLO_WORLD_KEY = DEBUG ? 'eterna_coop_hard_debug_world_v1' : 'eterna_coop_hard_solo_world_v1';
export const characterStore = new CharacterStore(undefined, SAVE_KEY);
export const SET_KEY = 'eterna_settings_v1';
export let char = null;
export function loadChar() { return characterStore.load(); }
export function saveChar() { characterStore.save(char); }

export const settings = {
  master: 1, music: 1, sfx: 1, amb: 1, quality: params.has('low') ? 'low' : 'high', shake: true, dmgnum: true, occlusion: true,
};
try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY)) || {}); } catch { /* */ }
export function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch { /* */ } }
export const GRASS_BY_Q = { high: 1, mid: 0.5, low: 0.25 };

export function setChar(v) { char = v; }
