// 組み立て役: 中心の処理のポート（ports.js）に、具体的なモジュールを差し込む。main.js が最初に読む
// 中心の処理に新しい道具を渡すときは、ここに1行足す（書き換わる値は getter にする）
import { makeTelegraph } from '../fx.js';
import { animateMob, animatePlayer, armorLook, makeCoin, makeGoldBag, makeLootItem, makeShard, setPlayerArmor, setPlayerWeapon, weaponStyle } from '../models.js';
import { OCC } from '../toon.js';
import { canAct, combat, doSwing, gainXp, heal, strikes, sweepAngle, sweepTick, tryDodge, updateBossProjs, updateProjs } from './actions.js';
import { buildEnv, env, heightAt, pinTick, refreshNpcMarks, waypointTick } from './area.js';
import { addShake, aimAngle, aimPoint, autoTarget, dealDamage, later, setShake, shake, stunValue, touch } from './combat.js';
import { REACT, crawlTick, fall, getUp, hitStop, setHitStop, updateTeles } from './hurt.js';
import { GUARD, armCounter, guardDamage, guardRegen, updateMouseWorld } from './input.js';
import { updateMobLabels } from './labels.js';
import { moveMe } from './loop.js';
import { addGold, coins, lootWalk, spawnDrop, spawnGold, updateCoins, updateDrops } from './loot.js';
import { toColor, touchGuideMesh } from './meshes.js';
import { net } from './net-client.js';
import { chestOpen, exploreTick } from './progress.js';
import { ambient, applyQuality, audio, cam, camera, fx, renderFrame, scene, sun, tmpV, weatherParts } from './render.js';
import { char, characterStore, params, saveChar, saveSettings, settings } from './save.js';
import { reviveRing } from './snapshot.js';
import { CAM_ZOOM, CHARGE_MAX, CHARGE_MIN, DODGE_CD, drops, keys, me, mobs, mouse, npcs, others, pending, setStarted, started, teles, world } from './state.js';
import { S, addBuff, bowRange, buffMod, calcStats, hasBuff, itemPower } from './stats.js';
import { wtAura, wtCritAdd, wtDmgMult, wtDr, wtOnGuard, wtOnHit, wtOnHurt } from './tree-effects.js';
import { banner, floatText, renderQuests, toast, ui } from './ui-bridge.js';
import { desperate, indoorNow, onVariantHit, tf, titleDmg, titleMove } from './variants.js';
import { wirePorts } from './ports.js';

wirePorts({
  state: { CAM_ZOOM, CHARGE_MAX, CHARGE_MIN, DODGE_CD, get char() { return char; }, characterStore, drops, keys, me, mobs, mouse, npcs, others, params, pending, saveChar, saveSettings, setStarted, settings, get started() { return started; }, teles, world },
  stats: { get S() { return S; }, addBuff, bowRange, buffMod, calcStats, hasBuff, itemPower },
  view: { OCC, ambient, animateMob, animatePlayer, applyQuality, armorLook, audio, cam, camera, fx, makeCoin, makeGoldBag, makeLootItem, makeShard, makeTelegraph, renderFrame, reviveRing, scene, setPlayerArmor, setPlayerWeapon, sun, tmpV, toColor, touchGuideMesh, updateMobLabels, weaponStyle, weatherParts },
  screen: { banner, floatText, renderQuests, toast, get ui() { return ui; } },
  link: { net },
  field: { buildEnv, get env() { return env; }, heightAt, pinTick, refreshNpcMarks, waypointTick },
  rules: { GUARD, REACT, addGold, addShake, aimAngle, aimPoint, armCounter, autoTarget, canAct, chestOpen, coins, combat, crawlTick, dealDamage, desperate, doSwing, exploreTick, fall, gainXp, getUp, guardDamage, guardRegen, heal, get hitStop() { return hitStop; }, indoorNow, later, lootWalk, moveMe, onVariantHit, setHitStop, setShake, get shake() { return shake; }, spawnDrop, spawnGold, strikes, stunValue, sweepAngle, sweepTick, tf, titleDmg, titleMove, touch, tryDodge, updateBossProjs, updateCoins, updateDrops, updateMouseWorld, updateProjs, updateTeles, wtAura, wtCritAdd, wtDmgMult, wtDr, wtOnGuard, wtOnHit, wtOnHurt },
});
