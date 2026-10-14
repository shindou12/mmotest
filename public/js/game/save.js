import { CHARACTER_KEY, CharacterStore } from '../character-store.js';

// ======================================================================
// セーブデータ / 設定
// ======================================================================
export const SAVE_KEY = CHARACTER_KEY;
export const characterStore = new CharacterStore();
export const SET_KEY = 'eterna_settings_v1';
export let char = null;
export function loadChar() { return characterStore.load(); }
export function saveChar() { characterStore.save(char); }

export const params = new URLSearchParams(location.search);
export const settings = {
  master: 1, music: 1, sfx: 1, amb: 1, quality: params.has('low') ? 'low' : 'high', shake: true, dmgnum: true, occlusion: true,
};
try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY)) || {}); } catch { /* */ }
export function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch { /* */ } }
export const GRASS_BY_Q = { high: 1, mid: 0.5, low: 0.25 };

export function setChar(v) { char = v; }
