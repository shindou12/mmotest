import { RARITIES, TITLES, floorLevel, migrateItem } from '../../shared/data.js';
import { AREAS } from '../../shared/areas.js';
import { Net } from '../net.js';
import { rnd } from './util.js';
import { addChat, banner, floatText, renderParty, toast, ui } from './ui-bridge.js';
import { char, characterStore, saveChar } from './save.js';
import { audio, fx } from './render.js';
import { bprojs, me, mobs, others, teles, world } from './state.js';
import { S } from './stats.js';
import { enterArea, env, heightAt } from './area.js';
import { onMobDie, onSnap, removeOther } from './snapshot.js';
import { die, onTele, revived } from './hurt.js';
import { addShake } from './combat.js';
import { tf } from './variants.js';
import { clearBossProjs, gainXp, heal, spawnBossProj } from './actions.js';
import { countClear, grantTitle, questEvent, rollTitleDrop } from './progress.js';
import { LOOT, spawnDrop, spawnGold } from './loot.js';
import { salvageTarget, spawnSalvaged } from './items.js';
import { aimLineMesh } from './meshes.js';
import { makeTelegraph } from '../fx.js';

// ======================================================================
// ネットワーク
// ======================================================================
export let roster = [];
export const net = new Net(onMsg);

export function onMsg(m) {
  if (characterStore.lost && !['snap', 'roster', 'chat', 'leave', 'disconnected'].includes(m.t)) return;
  switch (m.t) {
    case 'welcome':
      me.id = m.id; world.unlocked = m.unlocked;
      enterArea(m.area, m.x, m.z);
      break;
    case 'warped': enterArea(m.area, m.x, m.z); break;
    case 'snap': onSnap(m); break;
    case 'roster': roster = m.r; world.unlocked = m.unlocked; renderParty(); break;
    case 'tele': onTele(m); break;
    case 'die': onMobDie(m); break;
    case 'xp':
      gainXp(m.n);
      questEvent(m.boss ? { type: 'boss', floor: m.boss } : { type: 'kill', name: m.nm, area: m.ar });
      // 称号: 階層ボスの初討伐・ネームドの討伐
      if (m.boss && TITLES['t_boss' + m.boss]) grantTitle('t_boss' + m.boss);
      if (!m.boss && AREAS[m.ar]?.named?.name === m.nm && AREAS[m.ar].named.title) grantTitle(AREAS[m.ar].named.title);
      rollTitleDrop(m);
      // 踏破: 迷宮区はボス、秘境はネームド、ほかは敵を一定数倒す → マップに付きやすい特性が出る
      countClear(m.ar, m.boss ? 'boss' : AREAS[m.ar]?.named?.name === m.nm ? 'named' : 'kill');
      break;
    case 'loot':
      // 倒した敵・開けた宝箱から、1つずつポコポコ飛び出す
      m.items.forEach((d, i) => {
        const src = m.sx != null ? { x: m.sx, z: m.sz, y: m.src === 'chest' ? 0.8 : 1.2 } : null;
        // 自動分解の対象なら、その場で硬貨と強化の欠片になって出てくる
        if (salvageTarget(d.it)) spawnSalvaged(d.it, d.x, d.z, src, i * LOOT.stagger);
        else spawnDrop(d.it, d.x, d.z, src, i * LOOT.stagger);
      });
      if (m.src === 'chest') {
        char.chests = char.chests || {};
        char.chests[m.cid || m.ar] = Date.now();
        questEvent({ type: 'chest', area: m.ar });
        audio.sfx('clear');
        // 称号「宝探し」: 追加のゴールドと回復
        if (tf('t_treasure')) {
          spawnGold(Math.round(40 + floorLevel(world.floor) * 12), me.x + 1, me.z + 1, true);
          heal(S.mhp * 0.3, true);
        }
        saveChar();
      }
      break;
    case 'gold': spawnGold(m.n, m.x, m.z, !!m.bag); break;
    // 共有ボックス
    case 'box': (m.items || []).forEach(migrateItem); ui.boxItems(m.items, m.max); break;
    case 'boxPut': {
      const i = char.inv.findIndex((it) => it.id === m.ref);
      if (i >= 0) { const [it] = char.inv.splice(i, 1); toast(`「${it.name}」を共有ボックスに入れた`, '#9ae8ff'); }
      audio.sfx('equip'); saveChar(); ui.refresh();
      break;
    }
    case 'boxTake': {
      if (char.inv.length >= 60) { toast('インベントリがいっぱいです', '#f88'); net.send({ t: 'box', op: 'put', item: m.item }); break; }
      char.inv.unshift(migrateItem(m.item));
      toast(`「${m.item.name}」を共有ボックスから取り出した`, RARITIES[m.item.rarity].color);
      audio.sfx('pickup'); saveChar(); ui.refresh();
      break;
    }
    case 'door': if (m.open) { world.door = true; audio.sfx('impact'); addShake(0.4); } break;
    case 'chat': addChat(m.from, m.text, m.color); break;
    case 'leave': removeOther(m.id); break;
    // 這いずり: 仲間が倒れた / 起き上がった / 全員倒れて力尽きた
    case 'pdown': {
      if (m.id === me.id) break;
      const o = others.get(m.id);
      banner('仲間が倒れた', `${m.name} に攻撃を当てて起こそう`, '#ff9a8a', 3);
      toast(`⚠ ${m.name} が倒れた`, '#ff9a8a');
      audio.sfx('roar');
      if (o) { o.rv = Math.max(o.rv ?? -1, 0.01); fx.beam(o.x, o.z, 0xff6a5a, 10, 0.6, 1.2); }
      break;
    }
    case 'revived': revived(m.by); break;
    case 'prev': {
      const o = others.get(m.id);
      if (!o) break;
      o.rv = -1;
      toast(`${o.name} が起き上がった`, '#9affc8');
      fx.beam(o.x, o.z, 0x9affc8, 10, 0.9, 1.0);
      fx.ringWave(o.x, o.z, 0x9affc8, 4, 0.5);
      break;
    }
    case 'bleed': if (me.crawl) die(); break;
    case 'unlock': world.unlocked = m.unlocked; break;
    case 'bossStart': {
      banner(`第${m.n}層ボス`, m.name, '#ff6a6a', 3);
      audio.sfx('roar'); addShake(1.2);
      break;
    }
    case 'enrage': {
      const final = m.p === 3;
      audio.sfx(final ? 'phase' : 'enrage'); addShake(final ? 1.4 : 0.8);
      const b = mobs.get(m.id);
      if (b) {
        fx.parts.burst(b.x, 3, b.z, final ? 200 : 80, { color: final ? 0xff40c0 : 0xff3020, size: 0.8, speed: 14, life: 1.2 });
        fx.ringWave(b.x, b.z, final ? 0xff40c0 : 0xff3020, 18, 0.8);
      }
      break;
    }
    case 'bossClear': {
      banner(`第${m.n}層 攻略`, 'CONGRATULATIONS!', '#ffd84a', 3);
      audio.sfx('clear');
      const L = env?.lair || { x: 0, z: 0 };
      for (let i = 0; i < 6; i++) setTimeout(() => fx.parts.burst(L.x + rnd(-8, 8), rnd(4, 10), L.z + rnd(-8, 8), 80, { color: [0xffd84a, 0x6ad0ff, 0xff6ab0][i % 3], size: 0.6, speed: 10, life: 1.5, gravity: -4 }), i * 250);
      break;
    }
    case 'bossReset': toast('ボスが退却した…（全員が離脱）', '#aaa'); clearBossProjs(); break;
    case 'proj': spawnBossProj(m); break;
    case 'pgone': {
      const i = bprojs.findIndex((p) => p.id === m.id);
      if (i >= 0) { const p = bprojs[i]; fx.parts.burst(p.x, 1.2, p.z, 20, { color: 0xbfe0ff, speed: 6, size: 0.4, life: 0.35 }); fx.dispose(p.mesh); bprojs.splice(i, 1); }
      break;
    }
    case 'stun': {
      // スタン: そのボスが出していた攻撃はすべて取り消される
      for (let i = teles.length - 1; i >= 0; i--) if (teles[i].src === m.id) { teles[i].meshes.forEach((g) => fx.dispose(g)); teles.splice(i, 1); }
      clearBossProjs();
      const b = mobs.get(m.id);
      banner('', 'STUN!', '#ffd84a', 3);
      audio.sfx('impact'); audio.sfx('perfect'); addShake(0.8);
      if (b) { fx.ringWave(b.x, b.z, 0xffd84a, 8, 0.6); fx.parts.burst(b.x, 4, b.z, 80, { color: 0xffe080, speed: 10, size: 0.6, life: 1 }); }
      break;
    }
    case 'guardStop': {
      fx.ringWave(m.x, m.z, 0xbfe0ff, 5, 0.4);
      fx.parts.burst(m.x, 1.5, m.z, 40, { color: 0xbfe0ff, speed: 9, size: 0.5, life: 0.5 });
      audio.sfx('block'); audio.sfx('impact'); addShake(0.6);
      break;
    }
    case 'hateReset': {
      const b = mobs.get(m.id);
      if (b) fx.ringWave(b.x, b.z, 0xff9a8a, 6, 0.5);
      break;
    }
    // ---- ボスの共通部品（brain のあるボスが使う） ----
    case 'bossEv': {
      // HPバーが割れたときなどの出来事（文章は出さない。音と揺れと光だけ）
      if (m.sfx) audio.sfx(m.sfx);
      addShake(0.8);
      const b = mobs.get(m.id);
      if (b) fx.ringWave(b.x, b.z, parseInt(String(m.color).slice(1), 16), 16, 0.8);
      break;
    }
    case 'cast': {
      // 詠唱バー（技名）。need: 中断ゲージあり
      const b = mobs.get(m.id);
      if (b) b.cast = { name: m.name, start: performance.now(), dur: m.d, need: !!m.need, k: 0 };
      break;
    }
    case 'castP': { const b = mobs.get(m.id); if (b?.cast) b.cast.k = m.k; break; }
    case 'castEnd': {
      const b = mobs.get(m.id);
      if (b) b.cast = null;
      break;
    }
    case 'mark': {
      // 狙いを替えた（全ボス共通の「！」）
      const t = m.tid === me.id ? me : others.get(m.tid);
      if (t) { floatText(t.x, 3.2, t.z, '！', 'aggro'); fx.ringWave(t.x, t.z, 0xff3a2a, 3, 0.5); }
      if (m.tid === me.id) audio.sfx('telegraph');
      break;
    }
    case 'judge': {
      // 溜めながら向きを合わせる大技: 予兆と同じ太さの帯を、ボスの向きに合わせて回す（向きは snap で動く）
      const b = mobs.get(m.id);
      if (!b) break;
      const band = makeTelegraph({ k: 'line', x: 0, z: 0, a: 0, len: m.len, w: m.w }, '#ffb84a');
      fx.add(band, m.d / 1000, (o, k) => {
        o.position.set(b.x, heightAt(b.x, b.z), b.z); o.rotation.y = b.a;
        o.setProgress(k * 0.6);
      });
      break;
    }
    case 'aim': {
      // 遠距離攻撃の照準線（ボス → 狙われた人）
      const b = mobs.get(m.id);
      const tgt = () => (m.tid === me.id ? me : others.get(m.tid));
      if (!b || !tgt()) break;
      const line = aimLineMesh();
      fx.add(line, m.d / 1000, (o, k) => {
        const t = tgt();
        if (!t) return;
        const pos = o.geometry.attributes.position;
        pos.setXYZ(0, b.x, 1.6, b.z); pos.setXYZ(1, t.x, 1.0, t.z); pos.needsUpdate = true;
        o.material.opacity = 0.4 + 0.6 * Math.abs(Math.sin(k * 20));
      });
      if (m.tid === me.id) audio.sfx('telegraph');
      break;
    }
    case 'disconnected': addChat('', 'サーバーとの接続が切れました。ページを再読み込みしてください。', '#f66'); break;
  }
}
