export const CHARACTER_KEY = 'eterna_coop_hard_char_v1';

// Once a character is lost, no delayed reward/autosave can recreate it in this session.
export class CharacterStore {
  constructor(storage) {
    this.storage = storage || {
      getItem: key => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: key => localStorage.removeItem(key),
    };
    this.lost = false;
  }
  load() {
    if (this.lost) return null;
    try { return JSON.parse(this.storage.getItem(CHARACTER_KEY)); } catch { return null; }
  }
  save(character) {
    if (this.lost || !character) return;
    try { this.storage.setItem(CHARACTER_KEY, JSON.stringify(character)); } catch { }
  }
  discard() {
    this.lost = true;
    try { this.storage.removeItem(CHARACTER_KEY); return true; }
    catch {
      try { this.storage.setItem(CHARACTER_KEY, 'null'); return true; } catch { return false; }
    }
  }
}
