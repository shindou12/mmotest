// 組み立て役: 中心の処理のポート（ports.js）に、具体的なモジュールを差し込む。main.js が最初に読む
// 中心の処理に新しい道具を渡すときは、ここに1行足す（書き換わる値は getter にする）
import { makeTelegraph } from '../fx.js';
import { animateMob, animatePlayer, armorLook, setPlayerArmor, setPlayerWeapon, weaponStyle } from '../models.js';
import { OCC } from '../toon.js';
import { canAct, doSwing, heal, strikes, sweepAngle, sweepTick, tryDodge, updateBossProjs, updateProjs } from './actions.js';
import { env, heightAt, pinTick, waypointTick } from './area.js';
import { addShake, aimAngle, aimPoint, autoTarget, dealDamage, setShake, shake, stunValue, touch } from './combat.js';
import { REACT, crawlTick, fall, getUp, hitStop, setHitStop, updateTeles } from './hurt.js';
import { GUARD, armCounter, guardDamage, guardRegen, updateMouseWorld } from './input.js';
import { updateMobLabels } from './labels.js';
import { moveMe } from './loop.js';
import { lootWalk, updateCoins, updateDrops } from './loot.js';
import { toColor, touchGuideMesh } from './meshes.js';
import { net } from './net-client.js';
import { chestOpen, exploreTick } from './progress.js';
import { ambient, audio, cam, camera, fx, renderFrame, scene, sun, tmpV, weatherParts } from './render.js';
import { char, characterStore, saveChar, settings } from './save.js';
import { reviveRing } from './snapshot.js';
import { CAM_ZOOM, CHARGE_MAX, CHARGE_MIN, DODGE_CD, keys, me, mobs, mouse, npcs, others, pending, setStarted, started, teles, world } from './state.js';
import { S, addBuff, bowRange, buffMod, hasBuff } from './stats.js';
import { wtAura, wtCritAdd, wtDmgMult, wtDr, wtOnGuard, wtOnHit, wtOnHurt } from './tree-effects.js';
import { banner, floatText, toast, ui } from './ui-bridge.js';
import { desperate, indoorNow, onVariantHit, tf, titleDmg, titleMove } from './variants.js';
import { wirePorts } from './ports.js';

wirePorts({
  state: { CAM_ZOOM, CHARGE_MAX, CHARGE_MIN, DODGE_CD, get char() { return char; }, characterStore, keys, me, mobs, mouse, npcs, others, pending, saveChar, setStarted, settings, get started() { return started; }, teles, world },
  stats: { get S() { return S; }, addBuff, bowRange, buffMod, hasBuff },
  view: { OCC, ambient, animateMob, animatePlayer, armorLook, audio, cam, camera, fx, makeTelegraph, renderFrame, reviveRing, scene, setPlayerArmor, setPlayerWeapon, sun, tmpV, toColor, touchGuideMesh, updateMobLabels, weaponStyle, weatherParts },
  screen: { banner, floatText, toast, get ui() { return ui; } },
  link: { net },
  field: { get env() { return env; }, heightAt, pinTick, waypointTick },
  rules: { GUARD, REACT, addShake, aimAngle, aimPoint, armCounter, autoTarget, canAct, chestOpen, crawlTick, dealDamage, desperate, doSwing, exploreTick, fall, getUp, guardDamage, guardRegen, heal, get hitStop() { return hitStop; }, indoorNow, lootWalk, moveMe, onVariantHit, setHitStop, setShake, get shake() { return shake; }, strikes, stunValue, sweepAngle, sweepTick, tf, titleDmg, titleMove, touch, tryDodge, updateBossProjs, updateCoins, updateDrops, updateMouseWorld, updateProjs, updateTeles, wtAura, wtCritAdd, wtDmgMult, wtDr, wtOnGuard, wtOnHit, wtOnHurt },
});
