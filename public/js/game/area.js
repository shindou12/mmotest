import { FLOORS } from '../../shared/data.js';
import { AREAS, AREA_TYPES, WEATHERS } from '../../shared/areas.js';
import { buildArea, textSprite } from '../env.js';
import { QUESTS, questAvailable, questState } from '../quests.js';
import { now } from './util.js';
import { banner, toast, ui } from './ui-bridge.js';
import { GRASS_BY_Q, char, saveChar, settings } from './save.js';
import { ambient, audio, fx, hemi, scene, sun, weatherParts, setFog, tintSun, cam } from './render.js';
import { drops, me, mobs, npcs, others, teles, world } from './state.js';
import { S } from './stats.js';
import { net } from './net-client.js';
import { removeMob, removeOther } from './snapshot.js';
import { tf } from './variants.js';
import { clearBossProjs } from './actions.js';
import { questEvent } from './progress.js';
import { disposeDrop, flushCoins } from './loot.js';
import { makeNpc } from '../models/npc-models.js';

// ======================================================================
// エリア
// ======================================================================
export let env = null;
export const heightAt = (x, z) => (env ? env.heightAt(x, z) : 0);
export function buildEnv(id) {
  if (env) fx.dispose(env.group);
  const def = AREAS[id];
  env = buildArea(def, FLOORS[def.floor - 1], { grass: GRASS_BY_Q[settings.quality] ?? 1, weather: WEATHERS[def.weather] });
  scene.add(env.group);
  const L = env.light;
  setFog(L.fog, L.fogNear, L.fogFar);
  hemi.intensity = L.hemi; sun.intensity = L.sun;
}

export function enterArea(id, x, z) {
  const def = AREAS[id];
  const prev = world.area;
  world.area = id; world.def = def; world.floor = def.floor;
  world.door = false; world.plates = []; world.bossState = 'idle';
  const fdef = FLOORS[def.floor - 1];
  buildEnv(id);
  hemi.color.set(fdef.hemi[0]); hemi.groundColor.set(fdef.hemi[1]);
  const indoor = def.shape === 'grid';
  const W = indoor ? null : WEATHERS[def.weather];
  sun.color.set(fdef.sun);
  if (W) tintSun(W.tint, W.mix * 0.5);
  ambient.setKind(indoor ? 'dust' : fdef.particles);
  weatherParts.setKind(W ? W.particles : null);
  weatherParts.points.geometry.setDrawRange(0, W ? W.count : 0);
  weatherParts.lines.geometry.setDrawRange(0, W ? W.count * 2 : 0);
  audio.setWeather(W ? W.amb : null);
  for (const mid of [...mobs.keys()]) removeMob(mid);
  for (const oid of [...others.keys()]) removeOther(oid);
  for (const t of teles.splice(0)) t.meshes.forEach((mm) => fx.dispose(mm));
  for (const d of drops.splice(0)) disposeDrop(d);
  if (char) flushCoins();
  clearBossProjs();
  buildNpcs(def);
  me.x = x; me.z = z; me.a = Math.PI; me.transit = false;
  if (prev !== id && tf('t_traveler')) me.travelT = now() + 10; // 称号「旅人」
  for (const p of env.portals) p.armed = Math.hypot(p.x - x, p.z - z) > p.r + 1.5;
  if (S && (def.type === 'town' || def.type === 'camp')) me.potions = S.maxPot;
  audio.setMusic(fdef.music, false);
  audio.setAmbient(indoor ? 'cave' : fdef.amb);
  const T = AREA_TYPES[def.type];
  banner(`第${def.floor}層 ・ ${T.name}`, def.name, T.color);
  if (def.named) toast(`この地には主「${def.named.name}」が棲むという…`, '#ffb27a');
  if (W) toast(`${W.icon} 天候：${W.name}`, '#cfe0ff');
  audio.sfx('warp');
  fx.beam(me.x, me.z, 0x6ad0ff, 12, 1.2, 1.2);
  cam.focus.set(x, 1.2, z); cam.back = null;
  if (prev !== id) questEvent({ type: 'visit', area: id });
  env.waypoint?.setOn(!!char?.waypoints?.[id]);
  refreshPin();
  ui.close();
}

// ---- マップのピン（目的地の印）----
// エリアマップをクリックして1つだけ立てられる。そのエリアでは光の柱が立ち、着くと消える
export let pinBeam = null;
export function setPin(p) {
  char.pin = p; saveChar(); refreshPin();
  audio.sfx('ui');
  if (p) toast(`📍 ピンを立てた（${AREAS[p.area].name}）`, '#ffd84a');
}
export function refreshPin() {
  if (pinBeam) { fx.dispose(pinBeam); pinBeam = null; }
  const p = char?.pin;
  if (p && p.area === world.area) pinBeam = fx.beam(p.x, p.z, 0xffd84a, 30, 0.35);
}
export function pinTick() {
  const p = char?.pin;
  if (!p || p.area !== world.area || Math.hypot(me.x - p.x, me.z - p.z) > 3.5) return;
  setPin(null);
  toast('📍 目的地に着いた', '#ffd84a');
}

// ---- ワープポイント ----
// 近づくと解放。マップ（M の階層タブ）から、解放済みの所と町・野営地へ飛べる
export function waypointTick() {
  const w = env?.waypoint;
  if (!w || !char || char.waypoints?.[world.area] || Math.hypot(me.x - w.x, me.z - w.z) > 3) return;
  char.waypoints = { ...(char.waypoints || {}), [world.area]: true };
  w.setOn(true);
  saveChar();
  audio.sfx('levelup');
  fx.beam(w.x, w.z, 0x6ad8ff, 10, 1.4, 1.2);
  fx.ringWave(w.x, w.z, 0x6ad8ff, 5, 0.6);
  toast(`◇ ワープポイントを解放した（${world.def.name}）`, '#9ae8ff');
  ui.refresh();
}
export function waypointOk(id) { const d = AREAS[id]; return !!d && (!!d.gate || !!char?.waypoints?.[id]); }
export function waypointWarp(id) {
  if (!waypointOk(id) || AREAS[id].floor > (world.unlocked || 1)) { toast('まだ解放されていないワープポイントだ', '#ff9a8a'); return false; }
  if (me.dead || me.crawl) return false;
  const lair = env?.lair;
  if (world.bossState === 'fight' && lair && Math.hypot(me.x - lair.x, me.z - lair.z) < lair.r + 2) { toast('ボス戦の最中はワープできない', '#ff9a8a'); return false; }
  if (id === world.area) return false;
  me.transit = true;
  fx.beam(me.x, me.z, 0x6ad8ff, 12, 1.2, 0.8);
  net.send({ t: 'wp', to: id });
  return true;
}

// ---- NPC ----
export function buildNpcs(def) {
  for (const n of npcs.splice(0)) fx.dispose(n.model);
  for (const d of def.npcs || []) {
    const model = makeNpc(d);
    model.position.set(d.x, heightAt(d.x, d.z), d.z);
    scene.add(model);
    const n = { ...d, model, label: null, mark: '' };
    npcs.push(n);
  }
  refreshNpcMarks();
}
export function npcMark(id) {
  const qs = QUESTS.filter((q) => q.npc === id);
  if (qs.some((q) => questState(char, q.id)?.done && !questState(char, q.id)?.claimed)) return '？ 報告できる';
  if (qs.some((q) => questAvailable(char, q))) return '！ 依頼あり';
  return '';
}
export function refreshNpcMarks() {
  if (!char) return;
  for (const n of npcs) {
    const mark = npcMark(n.id);
    if (n.label && mark === n.mark) continue;
    if (n.label) { n.model.remove(n.label); n.label.material.map.dispose(); }
    n.mark = mark;
    n.label = textSprite(n.name, mark ? '#ffd84a' : '#ffffff', 4, mark);
    n.label.position.y = 3.1;
    n.model.add(n.label);
  }
}
