// 武器の重さによる固さ: 重い武器ほど、レベルとともに被ダメージ軽減が伸びる
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_KINDS, weaponDef } from '../public/shared/data.js';

test('heavier weapons gain more damage reduction per level', () => {
  const at = (lv) => Object.fromEntries(WEAPON_KINDS.map((k) => [k, weaponDef(k, lv)]));
  const hi = at(30);
  assert.ok(hi.dagger < hi.bow && hi.bow < hi.sword && hi.sword < hi.spear && hi.spear < hi.greatsword && hi.greatsword < hi.axe);
  for (const k of WEAPON_KINDS) assert.ok(weaponDef(k, 30) > weaponDef(k, 10)); // レベルで伸びる
  assert.ok(hi.axe >= 4 && hi.axe <= 8 && hi.dagger <= 2); // 傾向をつけるだけで、固くしすぎない
});
