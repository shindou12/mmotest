export const CHARACTER_KEY = 'eterna_coop_hard_char_v1';
export const DEBUG_CHARACTER_KEY = 'eterna_coop_hard_debug_char_v1'; // デバッグ部屋（?debug）のキャラ。本番のキャラとは別

// Once a character is lost, no delayed reward/autosave can recreate it in this session.
export class CharacterStore {
  constructor(storage, key = CHARACTER_KEY) {
    this.key = key;
    this.storage = storage || {
      getItem: key => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: key => localStorage.removeItem(key),
    };
    this.lost = false;
  }
  load() {
    if (this.lost) return null;
    try { return JSON.parse(this.storage.getItem(this.key)); } catch { return null; }
  }
  save(character) {
    if (this.lost || !character) return;
    try { this.storage.setItem(this.key, JSON.stringify(character)); } catch { }
  }
  discard() {
    this.lost = true;
    try { this.storage.removeItem(this.key); return true; }
    catch {
      try { this.storage.setItem(this.key, 'null'); return true; } catch { return false; }
    }
  }
}
