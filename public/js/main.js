import { FLOORS, migrateItem, starterWeapon } from '../shared/data.js';
import { AREAS } from '../shared/areas.js';
import { makePlayer } from './models.js';
import { OCC } from './toon.js';
import { spSpent, spTotal } from './skills.js';
import { QUEST_INDEX } from './quests.js';
import { createUI } from './ui/app.js';
import { now } from './game/util.js';
import { addChat, setUI, toast, ui } from './game/ui-bridge.js';
import { SAVE_KEY, char, characterStore, loadChar, params, saveChar, setChar, settings } from './game/save.js';
import { ambient, audio, camera, fx, hemi, scene, sun } from './game/render.js';
import { CHARGE_MAX, CHARGE_MIN, bprojs, cam, drops, me, mobs, mouse, npcs, others, projs, setStarted, started, teles, tmpV, world } from './game/state.js';
import { S, calcStats, itemPower } from './game/stats.js';
import { input } from './game/input.js';
import { net, roster } from './game/net-client.js';
import { buildEnv, env, setPin, waypointOk, waypointWarp } from './game/area.js';
import { takeDamage } from './game/hurt.js';
import { dealDamage } from './game/combat.js';
import { migrateWeaponTrees, skillCd, wtChooseBranch, wtLearnNode, wtResetTree } from './game/tree-effects.js';
import { canAct, doHeavy, doSwing, tryDodge, tryTreeSkill, tryWeaponSkill } from './game/actions.js';
import { acceptQuest, chestOpen, claimQuest, exploredOf, nearestInteract } from './game/progress.js';
import { coins, lootClick } from './game/loot.js';
import { equip, findItem, learn, resetTree, salvage, salvageCommon, setAutoSalvage, setSetting, setSlot, smithAffix, smithEnhance, smithLore, smithSkill, unequip } from './game/items.js';
import { bowGuide, hazardAt, loop, setBowGuide } from './game/loop.js';
import { makeBowGuide } from './game/meshes.js';
import './game/weapons/index.js';

 // 武器ごとの効果（武器ツリー）を登録する

// ======================================================================
// ログイン
// ======================================================================
async function startGame({ name, color, kind }) {
  audio.init();
  audio.setVolumes(settings);
  setChar(loadChar() || { name, color, lv: 1, xp: 0, inv: [], eq: { weapon: starterWeapon(kind), armor: null, acc: null } });
  char.name = name; char.color = color;
  char.tree = char.tree || {}; char.slots = char.slots || [null, null]; char.quests = char.quests || {};
  migrateWeaponTrees();
  // セーブデータの変換（特性のティア化・強化値・称号枠・素材と特性リスト）
  char.eq.title = char.eq.title || null;
  for (const it of [...char.inv, ...Object.values(char.eq)]) migrateItem(it);
  char.mats = char.mats || { shard: 0, gems: {} };
  char.codex = char.codex || {};
  char.titles = char.titles || {};
  saveChar();
  const wsUrl = params.get('server') || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const ok = params.has('solo') || window.ETERNA_SOLO || location.protocol === 'file:' ? false : await net.connect(wsUrl);
  if (!ok) await net.startSolo();
  me.model = makePlayer(char.color);
  scene.add(me.model);
  setBowGuide(makeBowGuide());
  scene.add(bowGuide.group);
  calcStats(); me.hp = S.mhp; me.potions = S.maxPot;
  setStarted(true);
  net.send({ t: 'hello', name: char.name, color: char.color, lv: char.lv });
  addChat('', ok ? 'サーバーに接続しました。友達を誘おう！' : 'ソロモードで起動しました（npm start でサーバーを立てるとマルチプレイ）', '#9fe');
  addChat('', '町の人に話しかけると（F）サブクエストを受けられます。町の共有ボックスで仲間と装備を受け渡しできます。', '#9fe');
  addChat('', '協力ハード：3〜5人推奨。敵のHPは3人基準／回復30%・再使用8秒／戦闘不能でキャラのセーブデータを失います。', '#ffb27a');
  if (spTotal(char.lv) - spSpent(char.tree) > 0) toast('未使用のスキルポイントがあります（Kでスキルツリー）', '#ffd84a');
  return ok;
}

// ======================================================================
// 画面（UI）に渡すゲームの窓口: 読み取り用の状態と、操作
// ======================================================================
const game = {
  get char() { return char; },
  get characterLost() { return characterStore.lost; },
  get S() { return S; },
  me, world, settings, others, mobs, npcs, drops, input,
  CHARGE_MIN, get CHARGE_MAX() { return S?.chargeMax || CHARGE_MAX; },
  env: () => env,
  roster: () => roster,
  boss: () => [...mobs.values()].find((m) => m.kind === 2),
  hazard: () => (started ? hazardAt(me.x, me.z) : null),
  project(x, y, z) {
    tmpV.set(x, y, z).project(camera);
    return { x: (tmpV.x + 1) / 2 * innerWidth, y: (1 - tmpV.y) / 2 * innerHeight, vis: tmpV.z < 1 };
  },
  nearestInteract, chestOpen, itemPower, findItem,
  explored: exploredOf,
  waypointOk, waypointWarp, setPin, lootClick,
  sfx: (n) => audio.sfx(n),
  loginInfo() { const c = loadChar(); return c && { name: c.name, color: c.color, lv: c.lv, kind: c.eq?.weapon?.kind || 'sword' }; },
  resetChar() {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem('eterna_coop_hard_solo_world_v1'); // ソロの階層解放状況・共有ボックスもリセット
    } catch { /* */ }
  },
  start: startGame,
  fullscreen() {
    try {
      document.documentElement.requestFullscreen?.()
        .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
        .catch(() => {});
    } catch { /* 対応していないブラウザ（iOS Safari など） */ }
  },
  interact(it) {
    if (it.kind === 'lever') { net.send({ t: 'interact', what: 'lever' }); audio.sfx('equip'); }
    if (it.kind === 'chest' && !chestOpen(it.chest)) net.send({ t: 'interact', what: 'chest', id: it.chest.id });
  },
  equip, unequip, salvage, salvageCommon, setAutoSalvage, learn, setSlot, resetTree, wtLearnNode, wtChooseBranch, wtResetTree, skillCd, setSetting, acceptQuest,
  smithEnhance, smithAffix, smithSkill, smithLore,
  claimQuest: (id) => claimQuest(QUEST_INDEX[id]),
  warp: (n) => net.send({ t: 'warp', floor: n }),
  chat: (text) => net.send({ t: 'chat', text }),
  boxOpen: () => net.send({ t: 'box', op: 'open' }),
  boxClose: () => net.send({ t: 'box', op: 'close' }),
  boxPut(id) {
    const it = char.inv.find((i) => i.id === id);
    if (it) net.send({ t: 'box', op: 'put', item: it, ref: it.id });
  },
  boxTake: (uid) => net.send({ t: 'box', op: 'take', uid }),
};
setUI(createUI(game));

// ログイン背景用に、はじまりの街を表示
enterPreview();
function enterPreview() {
  const def = AREAS.f1_town, fdef = FLOORS[0];
  world.def = def;
  buildEnv('f1_town');
  hemi.color.set(fdef.hemi[0]); hemi.groundColor.set(fdef.hemi[1]);
  sun.color.set(fdef.sun);
  sun.position.set(20, 40, 10);
  ambient.setKind(fdef.particles);
  const spin = () => {
    if (started) return;
    const t = now() * 0.05;
    camera.position.set(Math.sin(t) * 40, 16, Math.cos(t) * 40); camera.lookAt(0, 2, 0);
    OCC.uOccCam.value.copy(camera.position); OCC.uOccTgt.value.set(0, 2, 0);
    OCC.uOccNear.value = camera.position.length() * 0.35;
    ambient.update(0.016, 0, 0, now());
    env.update(now(), 0, 0);
    fx.update(0.016);
    requestAnimationFrame(spin);
  };
  spin();
}
loop();

window.__game = { me, others, mobs, drops, teles, npcs, bprojs, projs, char: () => char, world, fx, S: () => S, net, settings, env: () => env, ui: () => ui, cam, camera, coins, audio, api: game,
  // 自動テスト用の操作（通常攻撃・強攻撃・スキル）
  dbg: { canAct, hit: (mb, mult, o) => dealDamage(mb, mult, o), press: (on) => (on ? input.pointerDown(0) : input.pointerUp(0)), swing: () => { if (canAct() && me.swingT >= me.swingDur) doSwing(); }, heavy: doHeavy, tree: tryTreeSkill, ws: tryWeaponSkill, dodge: tryDodge, mouse, hurt: (raw, src, kd) => takeDamage(raw, src, kd) },
};
