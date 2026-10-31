// デバッグ部屋（URL に ?debug を付けて開く）: レベル最大・敵のいる部屋・装備やユニークを自由に出せる・ボス部屋へすぐ飛べる。
//   本番とは別のキャラ（DEBUG_CHARACTER_KEY）と別のソロのワールドで動く。サーバーにはつながない（協力ワールドに影響しない）
//   倒れてもセーブは消えず、その場で全回復する（hurt.js の fall）
// 部屋は AREAS に足す（ソロのワールドとブラウザは同じ areas.js を読むので、両方に見える）。サーバーの AREAS には足さない
import { AREAS, FLOOR_HUB, lairOf, spawnPoint } from '../../shared/areas.js';
import { MAX_LEVEL, RARITIES, TITLES, UNIQUES, WEAPONS, WEAPON_KINDS, makeItem, makeTitle, mobHp } from '../../shared/data.js';
import { PROF_MAX } from '../weapon-tree.js';
import { DEBUG, char, saveChar } from './save.js';
import { me } from './state.js';
import { S, calcStats } from './stats.js';
import { HIT_SOUNDS, SYNTH_HITS, VOICE_DEFAULTS } from '../sample-sfx.js';
import { audio } from './render.js';
import { toast, ui } from './ui-bridge.js';

const INV_MAX = 60;
const LEVELS = [1, 10, 25, 50]; // 部屋の敵のレベル
const BOSS_LEVELS = [0, 25, 50]; // ボスのレベル（0: 本来のレベル）
let enemyLv = 50, bossLv = 0;

// 階層ごとの部屋（その階層の見た目と敵）。転移門で町・野営地へも行ける
const ROOMS = [1, 2, 3].map((n) => `dbg_${n}`);
if (DEBUG) {
  for (const [i, id] of ROOMS.entries()) {
    const n = i + 1;
    AREAS[id] = {
      id, floor: n, type: 'field', name: `デバッグ部屋（第${n}層の敵）`, shape: 'open', R: 34, wob: 0, gate: { x: 0, z: 12 }, mapPos: [88, 92],
      exits: [], weather: null, bias: [], kinds: [],
      mobs: { count: 12, perPlayer: 0, lv: [enemyLv - 3, enemyLv - 1], pool: [0, 1, 2, 3], respawn: 0.4 },
    };
  }
}

// デバッグ用のキャラ: レベル・全武器の熟練度を最大に。ワープポイントは全部、お金と素材はたっぷり
export function prepareDebugChar() {
  char.lv = MAX_LEVEL; char.xp = 0;
  char.prof = char.prof || {};
  for (const wk of WEAPON_KINDS) char.prof[wk] = { lv: PROF_MAX, xp: 0 };
  char.profBest = PROF_MAX;
  char.waypoints = Object.fromEntries(Object.keys(AREAS).map((id) => [id, true]));
  char.gold = Math.max(char.gold || 0, 999999);
  char.mats.shard = Math.max(char.mats.shard || 0, 9999);
}

// ログインのあと: 部屋へ飛んで、操作パネルを出す
export function startDebug(net) {
  // ボスのレベルを選べるように: 出たボスのレベルを変え、体力もそのレベルの分にする（攻撃力はレベルから決まる）
  const spawnBoss = net.world.spawnBoss;
  net.world.spawnBoss = function (A) {
    const b = spawnBoss.call(this, A);
    if (bossLv) { b.hp = b.mhp = Math.round(b.mhp * mobHp(bossLv) / mobHp(b.lv)); b.lv = bossLv; }
    return b;
  };
  warp(net, ROOMS[0]);
  setupHitSound();
  buildPanel(net);
}

// ---- ヒット音の比較: 音声ファイルの候補に切り替え、音量・頭出し・ランダムの揺れ幅を変える ----
//   設定はこのブラウザに保存する（デバッグ部屋でだけ使う。通常のゲームは合成音のまま）
const HIT_KEY = 'eterna_debug_hit_sound_v1';
function setupHitSound() {
  const per = Object.fromEntries(HIT_SOUNDS.map(({ id, gain, trim, lowCut, drive, click }) => [id, { gain, trim, lowCut, drive, click }]));
  const h = { pick: 'synth', pitch: 0.05, vol: 0.05, voice: { ...VOICE_DEFAULTS }, per };
  try {
    const saved = JSON.parse(localStorage.getItem(HIT_KEY));
    if (saved) {
      // 項目が増えても、保存にない項目は初期値のまま
      Object.assign(h, saved, { voice: { ...h.voice, ...saved.voice }, per });
      for (const id in per) Object.assign(per[id], saved.per?.[id]);
    }
  } catch { /* 保存なし */ }
  if (!HIT_SOUNDS.some((x) => x.id === h.pick)) h.pick = 'synth';
  audio.hitSound = h;
  for (const x of HIT_SOUNDS) x.synth ? audio.samples?.render(x.id, SYNTH_HITS[x.synth]) : audio.samples?.load(x.id, x.url);
}
const saveHitSound = () => { try { localStorage.setItem(HIT_KEY, JSON.stringify(audio.hitSound)); } catch { /* 保存できない */ } };


function warp(net, id, pos) {
  const p = net.world?.players.get(1);
  if (!p || me.dead) return;
  net.world.movePlayer(p, id, pos || spawnPoint(AREAS[id]));
}
// ボス部屋の中（ボスが出る位置の手前）へ飛ぶ。入るとボス戦が始まる
function warpBoss(net, n) {
  const id = `f${n}_lab`, L = lairOf(AREAS[id]);
  warp(net, id, L.box ? { x: L.x, z: Math.min(L.box.z1 - 4, L.z + 9) } : { x: L.x, z: L.z + 9 });
}
// 部屋の敵のレベルを変える（今いる敵は消えて、新しいレベルで湧き直す）
function setEnemyLv(net, lv) {
  enemyLv = lv;
  for (const id of ROOMS) AREAS[id].mobs.lv = [Math.max(0, lv - 3), Math.max(0, lv - 1)];
  for (const A of net.world?.areas.values() || []) if (ROOMS.includes(A.id)) for (const m of [...A.mobs.values()]) if (m.kind === 'mob') A.mobs.delete(m.id);
}

function addItem(it) {
  if (char.inv.length >= INV_MAX) { toast('インベントリがいっぱいです（Iで分解）', '#f88'); return; }
  char.inv.unshift(it);
  saveChar(); ui.refresh();
  toast(`「${it.name}」を持ち物に入れた`, RARITIES[it.rarity].color);
}

// ---- 操作パネル（F2 / 右上の DEBUG ボタンで開閉） ----
const CSS = `
#dbg-toggle{position:fixed;top:8px;left:200px;z-index:60;background:#5a1f2e;color:#ffd8e0;border:1px solid #ff8aa8;border-radius:6px;padding:3px 10px;font:12px system-ui,sans-serif;cursor:pointer}
#dbg{position:fixed;top:40px;left:200px;z-index:60;width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 60px);overflow-y:auto;background:rgba(16,18,26,.94);color:#e8edf5;border:1px solid #ff8aa8;border-radius:10px;padding:10px 12px;font:12px/1.5 system-ui,sans-serif;box-sizing:border-box}
#dbg.hidden{display:none}#dbg h3{margin:10px 0 4px;font-size:12px;color:#ff9ab4}#dbg h3:first-child{margin-top:0}
#dbg .row{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
#dbg button,#dbg select{background:#232a38;color:#e8edf5;border:1px solid #4a5468;border-radius:5px;padding:3px 7px;font:inherit;cursor:pointer}
#dbg button:hover{border-color:#ff9ab4}#dbg button.on{background:#5a1f2e;border-color:#ff8aa8}
`;
function el(tag, props = {}, kids = []) {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) e.append(k);
  return e;
}
// 押したらフォーカスを外す（Space・Enter でもう一度押されたり、ゲームのキー操作を奪ったりしないように）
const btn = (text, onclick, style = '') => el('button', { textContent: text, onclick: (e) => { e.currentTarget.blur(); onclick(); }, style });
// 押したボタンだけ on にする選択肢の並び
function choice(values, label, pick, current) {
  const bs = values.map((v) => btn(label(v), () => { pick(v); bs.forEach((b, i) => b.classList.toggle('on', values[i] === v)); }));
  bs[values.indexOf(current)].classList.add('on');
  return bs;
}
const row = (...kids) => el('div', { className: 'row' }, kids);
const select = (options) => el('select', {}, options.map(([value, text]) => el('option', { value, textContent: text })));
// 目盛り（つまみを離したらフォーカスを外して、ゲームのキー操作を奪わない）
function slider(label, min, max, step, get, set, fmt) {
  const out = el('span', { style: 'min-width:4.5em;font-variant-numeric:tabular-nums' });
  const input = el('input', { type: 'range', min, max, step, style: 'width:150px' });
  const sync = () => { input.value = get(); out.textContent = fmt(+input.value); };
  input.oninput = () => { set(+input.value); out.textContent = fmt(+input.value); };
  input.onchange = () => input.blur();
  sync();
  return { row: row(el('span', { textContent: label, style: 'min-width:8em' }), input, out), input, sync };
}

function buildPanel(net) {
  document.head.append(el('style', { textContent: CSS }));
  const panel = el('div', { id: 'dbg', className: 'hidden' });
  const toggle = el('button', { id: 'dbg-toggle', textContent: 'DEBUG（F2）', onclick: () => panel.classList.toggle('hidden') });
  addEventListener('keydown', (e) => { if (e.key === 'F2') { e.preventDefault(); panel.classList.toggle('hidden'); } }, true);
  // パネルのクリックがゲームの攻撃にならないように
  for (const k of ['pointerdown', 'mousedown']) panel.addEventListener(k, (e) => e.stopPropagation());

  const lvBtns = choice(LEVELS, (lv) => `Lv${lv}`, (lv) => { setEnemyLv(net, lv); toast(`部屋の敵を Lv${lv} 前後にした`, '#9fe'); }, enemyLv);
  const bossBtns = choice(BOSS_LEVELS, (lv) => (lv ? `Lv${lv}` : '本来'), (lv) => { bossLv = lv; toast(`次に出るボスを${lv ? ` Lv${lv}` : '本来のレベル'}にする`, '#9fe'); }, bossLv);

  const kind = select(WEAPON_KINDS.map((k) => [k, WEAPONS[k].name]));
  const grade = select([[0, '特性なし'], [1, '特性1つ'], [2, '特性2つ'], [3, '特性3つ']]);
  grade.value = 3;
  const make = (slot) => addItem(makeItem(MAX_LEVEL, +grade.value, { slot, kind: slot === 'weapon' ? kind.value : null }));

  const title = select(Object.entries(TITLES).map(([id, t]) => [id, t.name]));
  const H = audio.hitSound, cur = () => H.per[H.pick];
  const set = (fn) => (v) => { fn(v); saveHitSound(); };
  const hitGain = slider('音量', 0, 200, 5, () => (cur() ? cur().gain * 100 : 100), set((v) => { if (cur()) cur().gain = v / 100; }), (v) => `${v}%`);
  const hitTrim = slider('頭出し', 0, 120, 5, () => (cur() ? cur().trim * 1000 : 0), set((v) => { if (cur()) cur().trim = v / 1000; }), (v) => `${v}ms`);
  const hitPitch = slider('ピッチの揺れ', 0, 25, 1, () => H.pitch * 100, set((v) => { H.pitch = v / 100; }), (v) => `±${v}%`);
  const hitVol = slider('音量の揺れ', 0, 40, 1, () => H.vol * 100, set((v) => { H.vol = v / 100; }), (v) => `±${v}%`);
  // 聞き取りやすさ（音ごと）: 超低音を削る・倍音を足す・合成音のアタックを重ねる
  const perSlider = (label, min, max, step, key, toUi, fromUi, fmt) =>
    slider(label, min, max, step, () => (cur() ? toUi(cur()[key]) : min), set((v) => { if (cur()) cur()[key] = fromUi(v); }), fmt);
  const hitLowCut = perSlider('低音カット', 0, 200, 10, 'lowCut', (x) => x, (v) => v, (v) => (v ? `${v}Hz以下` : 'なし'));
  const hitDrive = perSlider('倍音（歪み）', 0, 100, 5, 'drive', (x) => x * 100, (v) => v / 100, (v) => `${v}%`);
  const hitClick = perSlider('アタックを重ねる', 0, 100, 5, 'click', (x) => x * 100, (v) => v / 100, (v) => `${v}%`);
  // 連打・同時ヒット（全部の音で共通）
  const V = H.voice;
  const hitMerge = slider('同時ヒットをまとめる', 0, 80, 5, () => V.merge * 1000, set((v) => { V.merge = v / 1000; }), (v) => (v ? `${v}ms以内` : 'しない'));
  const hitRepeat = slider('続けて当てた音量', 20, 100, 5, () => V.repeatGain * 100, set((v) => { V.repeatGain = v / 100; }), (v) => `${v}%ずつ`);
  const hitWindow = slider('「続けて」の間隔', 50, 400, 10, () => V.window * 1000, set((v) => { V.window = v / 1000; }), (v) => `${v}ms以内`);
  const hitMax = slider('同時に鳴る数', 1, 8, 1, () => V.max, set((v) => { V.max = v; }), (v) => `${v}つまで`);
  // 音ごとの項目は音を切り替えたら読み直す。合成音のときは触れない
  const syncPer = () => { for (const s of [hitGain, hitTrim, hitLowCut, hitDrive, hitClick]) { s.input.disabled = H.pick === 'synth'; s.sync(); } };
  const hitBtns = choice(['synth', ...HIT_SOUNDS.map((x) => x.id)], (id) => (id === 'synth' ? '今の合成音' : HIT_SOUNDS.find((x) => x.id === id).name),
    (id) => { H.pick = id; saveHitSound(); syncPer(); audio.sfx('hit'); }, H.pick);
  syncPer();
  const god = btn('無敵: OFF', () => { me.god = !me.god; god.textContent = `無敵: ${me.god ? 'ON' : 'OFF'}`; god.classList.toggle('on', me.god); });

  panel.append(
    el('h3', { textContent: '移動' }),
    row(...ROOMS.map((id, i) => btn(`部屋（第${i + 1}層の敵）`, () => warp(net, id)))),
    row(...[1, 2, 3].map((n) => btn(`第${n}層ボス`, () => warpBoss(net, n))), btn('はじまりの街', () => warp(net, FLOOR_HUB[1]))),
    el('h3', { textContent: '部屋の敵のレベル' }),
    row(...lvBtns),
    el('h3', { textContent: 'ボスのレベル（次に出るボスから）' }),
    row(...bossBtns),
    el('h3', { textContent: `装備を出す（Lv${MAX_LEVEL}）` }),
    row(kind, grade, btn('武器', () => make('weapon')), btn('防具', () => make('armor')), btn('装飾品', () => make('acc'))),
    el('h3', { textContent: 'ユニーク' }),
    row(...UNIQUES.map((u) => btn(u.name, () => addItem(makeItem(MAX_LEVEL, u.rarity === 7 ? 5 : 4, { unique: u })), `color:${RARITIES[u.rarity].color}`))),
    el('h3', { textContent: '称号' }),
    row(title, btn('出す', () => addItem(makeTitle(title.value)))),
    el('h3', { textContent: 'ヒット音（敵に当てたとき）' }),
    row(...hitBtns),
    hitGain.row, hitTrim.row, hitPitch.row, hitVol.row,
    el('div', { textContent: '聞き取りやすさ（この音だけ）', style: 'margin-top:4px;color:#b8c0d0' }),
    hitLowCut.row, hitDrive.row, hitClick.row,
    el('div', { textContent: '連打・複数ヒット（全部の音）', style: 'margin-top:4px;color:#b8c0d0' }),
    hitMerge.row, hitRepeat.row, hitWindow.row, hitMax.row,
    row(
      btn('試し鳴らし', () => audio.sfx('hit')),
      btn('8連打（0.12秒おき）', () => { for (let i = 0; i < 8; i++) setTimeout(() => audio.sfx('hit'), i * 120); }),
      btn('3体同時', () => { for (let i = 0; i < 3; i++) audio.sfx('hit'); }),
      btn('クリティカル', () => audio.sfx('hit', { crit: true })),
    ),
    el('h3', { textContent: 'そのほか' }),
    row(
      btn('全回復', () => { calcStats(); me.hp = S.mhp; me.potions = S.maxPot; }),
      god,
      btn('クールタイムを戻す', () => { for (const k in me.tcd) me.tcd[k] = 0; me.wsCd = 0; me.dodgeCd = 0; me.potCd = 0; }),
      btn('持ち物を空にする', () => { char.inv = []; saveChar(); ui.refresh(); toast('持ち物を空にした（装備中の物は残る）', '#9fe'); }),
    ),
  );
  document.body.append(toggle, panel);
}
