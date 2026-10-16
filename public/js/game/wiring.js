// 組み立て役: 中心の処理のポート（ports.js）に、具体的なモジュールを差し込む。main.js が最初に読む
// 中心の処理に新しい道具を渡すときは、ここに1行足す（書き換わる値は getter にする）
import { makeTelegraph } from '../fx.js';
import { animateMob, animatePlayer, armorLook, makeCoin, makeGoldBag, makeLootItem, makeShard, setPlayerArmor, setPlayerWeapon, weaponStyle } from '../models.js';
import { OCC } from '../toon.js';
import { canAct, combat, doHeavy, doSwing, gainXp, heal, strikes, sweepAngle, sweepTick, tryDodge, tryTreeSkill, tryWeaponSkill, updateBossProjs, updateProjs, usePotion, buildCombat } from './actions.js';
import { buildEnv, env, heightAt, pinTick, refreshNpcMarks, waypointTick } from './area.js';
import { addShake, aimAngle, aimPoint, autoTarget, dealDamage, later, setShake, shake, stunValue, touch } from './combat.js';
import { REACT, crawlTick, downedAllies, fall, getUp, hitStop, onJustDodge, reviveHit, setHitStop, takeDamage, tryTech, updateTeles } from './hurt.js';
import { GUARD, armCounter, canGuard, guardDamage, guardProfile, guardRegen, guardUp, updateMouseWorld, initGuard } from './input.js';
import { updateMobLabels } from './labels.js';
import { moveMe } from './loop.js';
import { addGold, coins, lootWalk, spawnDrop, spawnGold, updateCoins, updateDrops } from './loot.js';
import { arrowMesh, bossProjMesh, projShape, toColor, touchGuideMesh } from './meshes.js';
import { net } from './net-client.js';
import { chestOpen, exploreTick } from './progress.js';
import { ambient, applyQuality, audio, cam, camera, fx, renderFrame, scene, screenToGround, sun, tmpV, weatherParts } from './render.js';
import { char, characterStore, params, saveChar, saveSettings, settings } from './save.js';
import { reviveRing } from './snapshot.js';
import { CAM_ZOOM, CHARGE_MAX, CHARGE_MIN, DODGE_CD, bprojs, drops, keys, me, mobs, mouse, npcs, others, pending, projs, setStarted, started, teles, world } from './state.js';
import { S, addBuff, bowRange, buffMod, calcStats, hasBuff, itemPower } from './stats.js';
import { gainWeaponProf, phantomReady, skillCd, wtAfterCast, wtAura, wtChargeStart, wtCritAdd, wtDmgMult, wtDr, wtHeavy, wtOnGuard, wtOnHit, wtOnHurt } from './tree-effects.js';
import { banner, floatText, renderQuests, toast, ui } from './ui-bridge.js';
import { castWeaponSkill, desperate, indoorNow, onVariantHit, tf, titleAspd, titleDmg, titleMove, variantParams } from './variants.js';
import { wirePorts } from './ports.js';

wirePorts({
  state: { CAM_ZOOM, CHARGE_MAX, CHARGE_MIN, DODGE_CD, bprojs, get char() { return char; }, characterStore, drops, keys, me, mobs, mouse, npcs, others, params, pending, projs, saveChar, saveSettings, setStarted, settings, get started() { return started; }, teles, world },
  stats: { get S() { return S; }, addBuff, bowRange, buffMod, calcStats, hasBuff, itemPower },
  view: { OCC, ambient, animateMob, animatePlayer, applyQuality, armorLook, arrowMesh, audio, bossProjMesh, cam, camera, fx, makeCoin, makeGoldBag, makeLootItem, makeShard, makeTelegraph, projShape, renderFrame, reviveRing, scene, screenToGround, setPlayerArmor, setPlayerWeapon, sun, tmpV, toColor, touchGuideMesh, updateMobLabels, weaponStyle, weatherParts },
  screen: { banner, floatText, renderQuests, toast, get ui() { return ui; } },
  link: { net },
  field: { buildEnv, get env() { return env; }, heightAt, pinTick, refreshNpcMarks, waypointTick },
  rules: { GUARD, REACT, addGold, addShake, aimAngle, aimPoint, armCounter, autoTarget, canAct, canGuard, guardProfile, guardUp, castWeaponSkill, chestOpen, coins, combat, crawlTick, dealDamage, desperate, doHeavy, doSwing, downedAllies, exploreTick, fall, gainWeaponProf, gainXp, getUp, guardDamage, guardRegen, heal, get hitStop() { return hitStop; }, indoorNow, later, lootWalk, moveMe, onJustDodge, onVariantHit, phantomReady, reviveHit, setHitStop, setShake, get shake() { return shake; }, skillCd, spawnDrop, spawnGold, strikes, stunValue, sweepAngle, sweepTick, takeDamage, tf, titleAspd, titleDmg, titleMove, touch, tryDodge, tryTech, tryTreeSkill, tryWeaponSkill, updateBossProjs, updateCoins, updateDrops, updateMouseWorld, updateProjs, updateTeles, usePotion, variantParams, wtAfterCast, wtAura, wtChargeStart, wtCritAdd, wtDmgMult, wtDr, wtHeavy, wtOnGuard, wtOnHit, wtOnHurt },
});
// ポートが埋まったあとに作るもの: スキルに渡す道具（actions.js）と、ガードゲージの初期値（input.js）
buildCombat();
initGuard();
