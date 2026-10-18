// 片手剣のすべて（ここ1ファイルで1つの武器）: 武器ツリー（段・ノード・Q/Eスキル・能力値）・強攻撃・武器スキル・形・構え・武器ツリーの効果。
// 登録は weapons/index.js に1行だけ。サーバーと共通の数値（射程・速さ・重さ・握る位置・スキルの候補など）もここの stats（サーバーも読むので three.js は直接 import しない）
import { L3, T, at } from './common.js';
import { TREE_MOTIONS } from '../../shared/tree-motions.js';
import { SWORD_UNIQUE_STYLES } from '../../shared/weapon-appearances.js';
import { BALANCE } from '../../shared/balance.js';
import { clamp, now, rnd } from '../game/util.js';

const SWORD = {
  name: '片手剣',
  rows: [
    { kind: 'skill', nodes: [
      { id: 'sw_aircut', icon: '〰', name: '空裂斬', base: '斬撃波を前へ飛ばす', lv: ['威力280%', '威力360%・CT-15%', L3], tags: ['wave'],
        A: { name: '三日月', desc: '3方向に飛ぶ（各70%）' }, B: { name: '断空', desc: '大きく、遠くまで飛ぶ' } },
      { id: 'sw_parry', icon: '⛨', name: '受け流し', base: '構えている間に受けた攻撃を軽減し、前へ突く', lv: ['0.4秒・軽減70%・突き220%', '0.55秒・軽減80%・突き300%', L3], tags: ['hurt'],
        A: { name: '巡り返し', desc: '受け流せたら、スキルのクールタイムが全部 -3秒', tags: ['cd'] }, B: { name: '奮い立ち', desc: '受け流せたら、5秒間攻撃力 +25%' } },
      { id: 'sw_slant', icon: '⟫', name: 'スラントラッシュ', base: '3回踏み込んで斬る', lv: ['各200%', '各260%', L3], tags: [],
        A: { name: '疾風', desc: '踏み込むたびに斬撃波も飛ぶ（各60%）', tags: ['wave'] }, B: { name: '旋', desc: '最後に周りをまとめて斬る（200%）' } },
    ] },
    { kind: 'passive', nodes: [
      { id: 'sw_norm', icon: '⚔', name: '剣の心得', base: '通常攻撃のダメージ', lv: ['+12%', '+20%', L3], tags: [], mods: [{ normp: 12 }, { normp: 20 }],
        A: { name: '閃光', desc: '3段目が斬撃波になって飛ぶ（120%）', tags: ['wave'] }, B: { name: '血振り', desc: '通常攻撃が当たるたびにHPを0.5%回復（1振り2回まで）' } },
      { id: 'sw_light', icon: '➶', name: '軽身', base: '回避の無敵時間', lv: ['+0.12秒', '+0.2秒', L3], tags: ['dodge'], iframe: [0.12, 0.2],
        A: { name: '後の先', desc: 'JUST回避した後の1撃目のダメージ +50%' }, B: { name: '早足', desc: '回避のクールタイム -20%・回避の距離 +30%' } },
      { id: 'sw_cycle', icon: '⟲', name: '技の巡り', base: '攻撃を当てるとスキルのクールタイムが縮む（1回の攻撃で1回まで）', lv: ['-0.1秒', '-0.15秒', L3], tags: ['cd'], cut: [0.1, 0.15],
        A: { name: '冴え巡り', desc: '会心のときは縮み方が2倍', tags: ['crit'] }, B: { name: '余勢', desc: 'スキルを使った後2秒間、攻撃の速さ +12%' } },
    ] },
    { kind: 'ks1', nodes: [
      { id: 'sw_mage', icon: '✧', name: '魔剣士', desc: 'スキルを使うと、3秒間は通常攻撃から斬撃波（80%）も飛ぶ。その代わり通常攻撃 -10%', tags: ['wave', 'cd'] },
      { id: 'sw_glad', icon: '♨', name: '剣闘士', desc: '攻撃を当てるたびに「勢い」が1つ溜まる（最大10）。1つにつきダメージ +3%・攻撃の速さ +2%。攻撃を受けるとなくなる', tags: ['hurt'] },
      { id: 'sw_guard', icon: '⛉', name: '守護騎士', desc: '強攻撃を溜めている間は剣で身を守る。守ったあとに離すと、周りをなぎ払う反撃（ガードカウンター）', tags: ['hurt'] },
    ] },
    { kind: 'passive', nodes: [
      { id: 'sw_edge', icon: '✦', name: '剣の冴え', base: '会心率', lv: ['+6%', '+10%', L3], tags: ['crit'], mods: [{ crit: 6 }, { crit: 10 }],
        A: { name: '残光', desc: '会心のときに小さな斬撃波が出る（50%・0.5秒に1回まで）', tags: ['wave'] }, B: { name: '吸精', desc: '会心のときにHPを1%回復' } },
      { id: 'sw_tough', icon: '⛨', name: '不撓', base: '被ダメージ', lv: ['-6%', '-10%', L3], tags: ['hurt'], mods: [{ def: 6 }, { def: 10 }],
        A: { name: '転じ', desc: '攻撃を受けるたびに、スキルのクールタイム -1秒', tags: ['cd'] }, B: { name: '背水', desc: 'HPが50%以下の間は、被ダメージ -15%・ダメージ +15%' } },
    ] },
    { kind: 'skill', nodes: [
      { id: 'sw_side', icon: '↷', name: '霞返し', base: '横へ跳んで斬り返す（移動中無敵）', lv: ['威力340%', '威力440%', L3], tags: ['dodge'],
        A: { name: '霞斬り', desc: '跳ぶ距離が2倍になり、通り抜けた敵も斬る（120%）' }, B: { name: '霞飛ばし', desc: '斬り返しが斬撃波になって飛ぶ', tags: ['wave'] } },
      { id: 'sw_dance', icon: '♪', name: '連撃の構え', base: '攻撃の速さ +15%', lv: ['5秒間・通常攻撃+30%', '7秒間・通常攻撃+40%', L3], tags: [],
        A: { name: '途切れず', desc: '効果中、通常攻撃を当てるたびに効果時間 +0.2秒（最大+4秒）' }, B: { name: '波の構え', desc: '効果中、斬撃波のダメージ +50%', tags: ['wave'] } },
      { id: 'sw_brave', icon: '♥', name: 'ブレイブハート', base: '会心率 +15%', lv: ['8秒間・攻撃力+20%', '10秒間・攻撃力+28%', L3], tags: ['crit'],
        A: { name: '猛り', desc: '効果中に敵を倒すと、効果時間 +2秒' }, B: { name: '速攻', desc: '効果中、スキルのクールタイムの戻りが速い（-30%）', tags: ['cd'] } },
    ] },
    { kind: 'ks2', nodes: [
      { id: 'sw_heaven', from: 'sw_mage', icon: '☼', name: '天剣', desc: '斬撃波が当たるたびに、スキルのクールタイム -0.15秒（1発につき1回）', tags: ['wave', 'cd'] },
      { id: 'sw_phantom', from: 'sw_mage', icon: '◐', name: '幻剣', desc: 'スキルを使った後3秒以内なら、同じスキルをもう1回だけ威力70%・クールタイムなしで使える', tags: ['cd'] },
      { id: 'sw_saint', from: 'sw_glad', icon: '✪', name: '剣聖', desc: '勢いが10になると、3秒間すべての攻撃が会心になる。終わると勢いは0に戻る', tags: ['crit'] },
      { id: 'sw_berserk', from: 'sw_glad', icon: '☠', name: '狂剣士', desc: '攻撃を受けても勢いが減らない。その代わり勢い1つにつき被ダメージ +2%・与えたダメージの1%を回復', tags: ['hurt'] },
      { id: 'sw_paladin', from: 'sw_guard', icon: '✚', name: '聖騎士', desc: 'ガードで受けると、HPを5%回復して周りの敵を引きつける', tags: ['hurt'] },
      { id: 'sw_avenger', from: 'sw_guard', icon: '⚡', name: '報復者', desc: 'ガードで受けたダメージを溜めておき、次の強攻撃・ガードカウンターに上乗せする', tags: ['hurt'] },
    ] },
  ],
};

// ---- 片手剣のスキル（Q/E）。run(c) の c.wt() で振ったレベルと分岐を読む ----
const skills = {
  sw_aircut: {
    name: '空裂斬', kind: 'sword', cd: 9.6, motion: 'sword_aircut', duration: T.sword_aircut.duration,
    motionOf: (W) => (W.br('sw_aircut') === 'A' ? 'sw_aircut_fan' : 'sword_aircut'),
    cdOf: (W) => (W.lv('sw_aircut') >= 2 ? 9.6 * 0.85 : 9.6),
    run(c) {
      const W = c.wt(), a = c.aim(), p = W.lv('sw_aircut') >= 2 ? 3.6 : 2.8, b = W.br('sw_aircut');
      at(c, b === 'A' ? TREE_MOTIONS.sw_aircut_fan.hits[0] : T.sword_aircut.hits[0], () => {
        if (b === 'A') for (const d of [-0.32, 0, 0.32]) c.proj({ a: a + d, mult: p * 0.7, speed: 24, life: 0.55, rad: 1, type: 'tskill' });
        else if (b === 'B') c.proj({ a, mult: p, speed: 26, life: 0.85, rad: 1.6, type: 'tskill' });
        else c.proj({ a, mult: p, speed: 24, life: 0.55, rad: 1, type: 'tskill' });
        c.fx.slash(c.me.x, c.me.z, a, 3, 100, c.col(), 0.9);
      });
    },
  },
  sw_parry: {
    name: '受け流し', kind: 'sword', cd: 12, motion: 'sword_parry', duration: T.sword_parry.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('sw_parry') >= 2, a = c.aim();
      c.parry(lv2 ? 0.55 : 0.4, lv2 ? 80 : 70);
      at(c, T.sword_parry.hits[0] + (lv2 ? 0.1 : 0), () => {
        c.line(4.3, 1.8, lv2 ? 3.0 : 2.2, { type: 'tskill', a });
        for (let d = 0.7; d < 4.3; d += 0.5) c.fx.parts.emit(c.me.x + Math.sin(a) * d, 1.2, c.me.z + Math.cos(a) * d, { color: c.col(), size: 0.42, life: 0.25, speed: 1, gravity: 0 });
        c.sfx('swing');
      });
    },
  },
  sw_slant: {
    name: 'スラントラッシュ', kind: 'sword', cd: 10.8, motion: 'sw_slant', duration: TREE_MOTIONS.sw_slant.duration,
    motionOf: (W) => (W.br('sw_slant') === 'B' ? 'sw_slant_spin' : 'sw_slant'),
    run(c) {
      const W = c.wt(), each = W.lv('sw_slant') >= 2 ? 2.6 : 2.0, b = W.br('sw_slant');
      for (let i = 0; i < 3; i++) {
        at(c, i * 0.2, () => {
          const a = c.aim();
          c.dash(a, 3, 0.1, 0.15);
          at(c, 0.08, () => {
            c.arc(3.2, 140, each, { type: 'tskill', a }); c.fx.slash(c.me.x, c.me.z, a, 3.2, 140, c.col(), 1.0, i % 2 === 1); c.sfx('swing');
            if (b === 'A') c.proj({ a, mult: 0.6, speed: 24, life: 0.45, rad: 0.9, type: 'tskill' });
          });
        });
      }
      if (b === 'B') at(c, TREE_MOTIONS.sw_slant_spin.hits[3], () => { c.circle(c.me.x, c.me.z, 3.6, 2.0, { type: 'tskill' }); c.fx.ringWave(c.me.x, c.me.z, c.col(), 3.8, 0.35); c.sfx('wave'); });
    },
  },
  sw_side: {
    name: '霞返し', kind: 'sword', cd: 10.8, motion: 'sword_sideturn', duration: T.sword_sideturn.duration,
    motionOf: (W) => (W.br('sw_side') === 'A' ? 'sw_side_long' : 'sword_sideturn'),
    run(c) {
      const W = c.wt(), a = c.aim(), p = W.lv('sw_side') >= 2 ? 4.4 : 3.4, b = W.br('sw_side');
      const sx = c.me.x, sz = c.me.z, side = a + Math.PI / 2, dist = b === 'A' ? 6 : 3;
      c.dash(side, dist, b === 'A' ? 0.3 : 0.22, b === 'A' ? 0.35 : 0.25); c.me.a = a;
      if (b === 'A') at(c, 0.15, () => c.line(dist, 1.8, 1.2, { type: 'tskill', a: side, sx, sz }));
      at(c, b === 'A' ? TREE_MOTIONS.sw_side_long.hits[0] : T.sword_sideturn.hits[0], () => {
        if (b === 'B') c.proj({ a, mult: p, speed: 24, life: 0.55, rad: 1.2, type: 'tskill' });
        else c.arc(3.7, 150, p, { type: 'tskill', a });
        c.fx.slash(c.me.x, c.me.z, a, 3.7, 150, c.col(), 1.15); c.sfx('swing');
      });
    },
  },
  sw_dance: {
    name: '連撃の構え', kind: 'sword', cd: 20.4, motion: 'sword_dance', duration: T.sword_dance.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('sw_dance') >= 2;
      at(c, T.sword_dance.hits[0], () => { c.buff('sw_dance', '連撃の構え', lv2 ? 7 : 5, { normp: lv2 ? 40 : 30, aspd: 15 }, c.col()); c.fx.ringWave(c.me.x, c.me.z, c.col(), 2.6, 0.35); });
    },
  },
  sw_brave: {
    name: 'ブレイブハート', kind: 'sword', cd: 21.6, motion: 'sw_brave', duration: TREE_MOTIONS.sw_brave.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('sw_brave') >= 2;
      at(c, TREE_MOTIONS.sw_brave.hits[0], () => c.buff('sw_brave', 'ブレイブハート', lv2 ? 10 : 8, { atkp: lv2 ? 28 : 20, crit: 15 }, 0xffb040));
    },
  },
};

// ツリーが足す能力値（ノードの mods 以外）
function mods(st, br, mods) {
  if (st.ks1 === 'sw_mage') mods.normp = (mods.normp || 0) - 10;
  if (br('sw_light') === 'B') mods.dodgecd = (mods.dodgecd || 0) + 20;
}

// 旧ツリー（スキルツリーの武器の枝）からの移行: ポイントを返すノードの頭の文字と、スロットから外す旧スキル
const legacy = { prefixes: ['sword_'], slots: ['slant', 'brave', 'sword_parry', 'sword_aircut', 'sword_sideturn', 'sword_dance'] };

// ---------------------------------------------------------------------------
// サーバーと共通の数値（shared/data.js の WEAPONS に集まる。サーバーもこのファイルを読む）
// weight: 装備重量（回避のクールタイムに影響） / stun: ボスのスタン値の溜まりやすさ / passive: 装備しているだけで効く武器パッシブ / melee: 近接武器（生存本能を持つ）
// ---------------------------------------------------------------------------
const stats = {
  name: '片手剣', skillPool: ['vorpal', 'square', 'leap', 'horizon', 'retreat'], grip: -0.15, range: 2.8, arc: 110, speed: 0.4, mult: 1.0, weight: 4, stun: 1.0, melee: true,
  passive: [], // 片手剣は武器ツリー（熟練度）で決める
  skill: { name: 'ヴォーパル・ストライク', cd: 5, desc: '前方へ突進しながら貫く', mult: 3.2 },
};

// ---------------------------------------------------------------------------
// 強攻撃（左クリック長押し → 離す）。lv は溜め段階 1〜2
// ---------------------------------------------------------------------------
const heavy = {
    name: '溜め斬り', desc: '前方を大きく薙ぎ払う。最大溜めで斬撃波が飛ぶ',
    run(c, lv) {
      const a = c.aim(), m = lv === 2 ? 3.4 : 2.2;
      c.fx.slash(c.me.x, c.me.z, a, 3.8, 210, c.col(), 1.0);
      c.later(0.05, () => c.arc(3.8, 210, m, { type: 'heavy', a }));
      if (lv === 2) c.proj({ a, mult: 1.6, type: 'heavy' });
    },
  };

// ---------------------------------------------------------------------------
// 武器スキル（武器に付くスキル。鍛冶屋で付け替えられる）
// ---------------------------------------------------------------------------
const weaponSkills = {
  retreat: {
    name: 'リトリート・スラッシュ', kind: 'sword', cd: 7,
    desc: '前方を威力200%で斬り、敵に向いたまま3.5m後退する（後退中0.22秒無敵）',
    run(c) {
      const a = c.aim();
      c.later(0.06, () => {
        c.fx.slash(c.me.x, c.me.z, a, 3.4, 180, c.col(), 1.1);
        c.arc(3.4, 180, 2.0, { type: 'wskill', a });
        c.sfx('swing');
        c.dash(a + Math.PI, 3.5, 0.22, 0.22);
        c.me.a = a;
        c.fx.parts.burst(c.me.x, 0.3, c.me.z, 16, { color: c.col(), speed: 3, size: 0.35, life: 0.3, up: 1 });
      });
    },
  },
  vorpal: {
    name: 'ヴォーパル・ストライク', kind: 'sword', cd: 5, desc: '前方へ突進しながら貫く',
    run(c) {
      const a = c.aim(), sx = c.me.x, sz = c.me.z;
      c.dash(a, 8, 0.2, 0.25);
      c.later(0.12, () => {
        c.line(8.5, 2.6, 3.2, { type: 'wskill', a, sx, sz });
        for (let d = 0; d < 9; d += 0.5) c.fx.parts.emit(sx + Math.sin(a) * d, 1.1, sz + Math.cos(a) * d, { color: c.col(), size: 0.6, life: 0.5, speed: 1.5, gravity: 0 });
      });
    },
  },
  square: {
    name: 'ホリゾンタル・スクエア', kind: 'sword', cd: 6, desc: '四方へ素早く斬り払う4連撃',
    run(c) {
      const a = c.aim();
      for (let i = 0; i < 4; i++) {
        c.later(i * 0.1, () => {
          const aa = a + i * Math.PI / 2;
          c.arc(3.6, 120, 1.1, { type: 'wskill', a: aa });
          c.fx.slash(c.me.x, c.me.z, aa, 3.6, 120, c.col(), 1.0, i % 2 === 1);
          c.sfx('swing');
        });
      }
    },
  },
  leap: {
    name: 'ソニック・リープ', kind: 'sword', cd: 6, desc: '跳び込んで着地点を斬り伏せる',
    run(c) {
      const a = c.aim();
      c.dash(a, 6, 0.28, 0.35);
      c.later(0.3, () => {
        c.circle(c.me.x, c.me.z, 3.2, 3.0, { type: 'wskill' });
        c.fx.ringWave(c.me.x, c.me.z, c.col(), 4, 0.35);
        c.shake(0.3);
      });
    },
  },
  horizon: {
    name: 'ホリゾンタル・アーク', kind: 'sword', cd: 5, desc: '大きく弧を描く往復の二連撃',
    run(c) {
      const a = c.aim();
      c.fx.slash(c.me.x, c.me.z, a, 3.8, 220, c.col(), 1.2);
      c.later(0.05, () => c.arc(3.8, 220, 1.4, { type: 'wskill', a }));
      c.later(0.2, () => {
        c.fx.slash(c.me.x, c.me.z, a, 3.8, 220, c.col(), 1.2, true);
        c.arc(3.8, 220, 1.5, { type: 'wskill', a });
        c.sfx('swing');
      });
      c.sfx('swing');
    },
  },
};

// ---------------------------------------------------------------------------
// 形（models.js の makeWeapon が使う）。base が基本の形、styles が形違い
// ---------------------------------------------------------------------------
// kit: 形の道具（THREE・mesh・sphere・cone・cyl・lathe・extrude・bowString・toon）。models/weapon-models.js が渡す
const model = (kit) => {
  const { THREE, mesh, sphere, cyl, extrude, toon } = kit;
  const model = {
    gripHand: kit.makeSwordHand,
    base(k) {
      const {g,steel,gold,grip,gem,rarity,edge}=k;
      const width=.079,length=1.30,shoulder=1.04,depth=.028;
      const cross=(y,w,d)=>[[-w,y,0],[0,y,-d],[w,y,0],[0,y,d]];
      const low=cross(.12,width,depth),high=cross(.12+shoulder,width*.76,depth*.78),tip=[0,.12+length,0],faces=[[],[],[]];
      const tri=(a,b,c,index)=>{
        const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),C=new THREE.Vector3(...c);
        const n=B.clone().sub(A).cross(C.clone().sub(A)),center=A.clone().add(B).add(C);
        if(n.x*center.x+n.z*center.z<0)[b,c]=[c,b];faces[index].push(...a,...b,...c);
      };
      for(let i=0;i<4;i++){
        const j=(i+1)%4,index=[0,1,1,2][i];
        tri(low[i],low[j],high[j],index);tri(low[i],high[j],high[i],index);tri(high[i],high[j],tip,index);
      }
      faces[0].push(...low[0],...low[1],...low[2],...low[0],...low[2],...low[3]);
      const neutral=new THREE.Color(0xdfe7f0),palette=[0xdfe7f0,0xeaf0f6,0xb6c3d2].map(hex=>{
        const color=new THREE.Color(hex);color.r*=steel.color.r/neutral.r;color.g*=steel.color.g/neutral.g;color.b*=steel.color.b/neutral.b;return color;
      }),colors=[];
      faces.forEach((vertices,index)=>{for(let i=0;i<vertices.length/3;i++)colors.push(...palette[index].toArray());});
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(faces.flat(),3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
      g.add(mesh(geometry,toon(0xffffff,{vertexColors:true,emissive:steel.emissive,emissiveIntensity:steel.emissiveIntensity})));
      edge([[-width,.12],[width,.12],[width*.76,.12+shoulder],[0,.12+length],[-width*.76,.12+shoulder]],.028);
      const half=.47/2;
      g.add(mesh(extrude([[-half,.13],[-half+.016,.063],[-.10,.08],[0,.095],[.10,.08],[half-.016,.063],[half,.13],[.10,.139],[0,.15],[-.10,.139]],.062,.004),gold));
      g.add(mesh(cyl(.039*.85,.039*.95,.09,8),gold,[0,.085,0]));
      g.add(mesh(cyl(.039,.039*1.08,.38,8),grip,[0,-.14,0]));
      const wrap=toon(0x553a26);
      for(let i=0;i<3;i++)g.add(mesh(new THREE.TorusGeometry(.039*1.04,.007,4,10),wrap,[0,-.06-i*.09,0],[Math.PI/2,0,0]));
      for(const y of [.038,-.332])g.add(mesh(cyl(.039*1.25,.039*1.25,.025,8),gold,[0,y,0]));
      g.add(mesh(sphere(.064,8,6),gold,[0,-.382,0]));
      if(rarity>=2)g.add(mesh(sphere(.027,8,6),gem,[0,.095,.043]));
      g.userData.appearance='refined-straight-sword';
    },
    styles: {
      [SWORD_UNIQUE_STYLES.amenomurakumo]: kit.uniqueSwords.amenomurakumo,
      [SWORD_UNIQUE_STYLES.durandal]: kit.uniqueSwords.durandal,
      [SWORD_UNIQUE_STYLES.laevateinn]: kit.uniqueSwords.laevateinn,
      [SWORD_UNIQUE_STYLES.oni_kiba]: kit.uniqueSwords.oni_kiba,
      [SWORD_UNIQUE_STYLES.sosei]: kit.uniqueSwords.sosei,
      1: kit.swordForms.katana,
      2: kit.swordForms.leaf,
      3: (k) => { // 専用: 光の結晶の刃と翼の鍔
        const { g, steel, gold, gem, handle, glowM, blade } = k;
        const pts = [[-0.07, 0], [0.07, 0], [0.09, 0.8], [0.04, 1.3], [0, 1.5], [-0.04, 1.3], [-0.09, 0.8]];
        blade(pts, 0.03, 0.12, glowM(1.3));
        g.add(mesh(extrude(pts.map(([x, y]) => [x * 0.55, y * 0.96]), 0.045), steel, [0, 0.14, 0]));
        for (const s of [-1, 1]) g.add(mesh(extrude([[0, 0], [0.42, 0.18], [0.36, 0.05], [0.5, -0.02], [0.2, -0.06]].map(([x, y]) => [x * s, y]), 0.03), gold, [0, 0.08, 0]));
        g.add(mesh(new THREE.OctahedronGeometry(0.08), gem, [0, 0.1, 0.03]));
        handle(0.42);
      },
    },
  };
  return model;
};

// ---------------------------------------------------------------------------
// 構え・振り（motions/index.js が近接の動きに上書きする）
// ---------------------------------------------------------------------------
// rig: 構えの道具（THREE・aimHand・orientWeapon・ease・applyMeleePose・spearPose）。motions/index.js が渡す
const motion = (rig) => {
  const { THREE, aimHand, orientWeapon, applyMeleePose } = rig;
  // 片手剣の構え: 片手の握りを保ち、通常斬りの軌道と技のタイミングを引き継ぐ
  function applySwordPose(u, s) {
    if (s.guard) {
      // 片手剣のガード（守護騎士）: 剣を横に倒して胸の前で受ける。左手は刃の腹に添える
      const yaw = -1.38, pitch = .22;
      u.armR.position.z = 0;
      const grip = aimHand(u.armR, u.elbowR, new THREE.Vector3(.22, 1.26, .46), new THREE.Vector3(1, -.6, -.3));
      const axis = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      aimHand(u.armL, u.elbowL, grip.clone().addScaledVector(axis, .5), new THREE.Vector3(-1, -.6, -.2));
      orientWeapon(u, yaw, pitch);
      return;
    }
    if (s.charging && !(s.down>0) && !(s.dodge>0) && !(s.hurt>0)) {
      u.armR.position.z=0;
      aimHand(u.armR,u.elbowR,new THREE.Vector3(.49,1.15,.23),new THREE.Vector3(1,-.3,-.35));
      orientWeapon(u,.85,1.10);
      return;
    }
    if (s.swing>=0 && !(s.down>0) && !(s.dodge>0) && !(s.hurt>0)) {
      // Keep the existing slash path and timing; a slightly bent elbow makes the wrist readable.
      const goal=new THREE.Vector3(0,-.54,0).applyQuaternion(u.armR.quaternion).add(u.armR.position);
      aimHand(u.armR,u.elbowR,goal,new THREE.Vector3(1,-.3,-.4));
      applyMeleePose(u,s);
      return;
    }
    if (!(s.down>0) && !(s.dodge>0) && !(s.hurt>0) && !(s.spin>=0) && !(s.sweep>=0)) {
      const walk=s.moving?Math.sin(s.walkT*10):0;
      u.armR.position.z=0;
      aimHand(u.armR,u.elbowR,new THREE.Vector3(.38,1.04+walk*.025,.30),new THREE.Vector3(1,-.5,-.25));
      orientWeapon(u,-.18,s.moving?.62:.80);
      return;
    }
    applyMeleePose(u, s);
  }
  return { pose: applySwordPose };
};

// ---------------------------------------------------------------------------
// 武器ツリーの効果。api: 武器の効果に渡す道具（game/weapon-api.js が役目ごとの小さな形で作る）。game/weapons/index.js が呼ぶ
function effects({ player, attack, tree, show, party, register }) {
  const { me, addBuff, hasBuff, heal } = player;
  const { strikes, extendCombat, SWEEP, later } = attack;
  const { quietBuff, cutCds, wtEmit } = tree;
  const { fx, audio, floatText, addShake, handTracker } = show;
  const { taunt } = party;

  // 剣闘士の「勢い」（バフ欄に数を出す）
  function setMom(n) {
    n = clamp(n, 0, 10);
    if (n === me.mom) return;
    const up = n > me.mom;
    me.mom = n;
    if (up && n === 10 && me.model) { fx.ringWave(me.x, me.z, 0xffb040, 3, 0.35); fx.flash(me.x, 1.4, me.z, 0xffb040, 25, 0.25); } // 勢いが最大になった合図
    me.buffs = me.buffs.filter((b) => b.id !== 'sw_mom');
    if (n > 0) me.buffs.push({ id: 'sw_mom', label: `勢い ${n}`, t: 1e9, max: 1e9, mods: {}, color: 0xff9a2e });
  }
  // 片手剣のガードカウンター（守護騎士）: 踏み込みながら大きく横に斬り払う。威力は盾槍の回転なぎ払いの半分
  function swordCounter() {
    const M = TREE_MOTIONS.sw_counter, a = me.a;
    me.swingT = 9; me.motion = M.id; me.motionT = 0; me.skillT = 0; me.skillDuration = M.duration;
    strikes.dash(a, 1.4, 0.16, 0.3);
    audio.sfx('swing', { heavy: true });
    later(M.hits[0], () => {
      strikes.arc(4.2, 300, SWEEP.mult * 0.5, { type: 'heavy', stun: SWEEP.stun, a });
      fx.slash(me.x, me.z, a, 4.2, 300, 0xbfe0ff, 1.4);
      fx.ringWave(me.x, me.z, 0xbfe0ff, 4.6, 0.35);
      audio.sfx('heavy'); addShake(0.35);
    });
  }
  const handPos = handTracker();

  // スキルに渡す文脈に、受け流しの構えを足す（c.parry）
  extendCombat({
    parry(sec, dr) { addBuff('sw_parry', '受け流し', sec, { dr }, 0xbfe0ff); me.parryUntil = now() + sec; me.parryDone = false; },
  });

  // 第3引数: 呼ぶ順（小さいほど先。書いていない場面は登録した順で、順の付いたものより後）。倍率を掛ける順などを元と同じに保つ
  register('sword', {
    // 能力値: 守護騎士はガードできる・軽身（回避の距離と無敵）
    stats(S, WT) {
      S.guard = S.guard || WT?.ks1 === 'sw_guard';
      if (WT?.br('sw_light') === 'B') S.dodgeDist = 1.3;
      S.iframeBonus = S.iframeBonus + (WT ? WT.v('sw_light', 'iframe') : 0);
    },
    afterStats() { if (player.S.wt?.ks1 !== 'sw_glad' && me.mom) setMom(0); },
    treeReset() { setMom(0); me.revenge = 0; },
    // 剣聖: 全会心
    critAlways: (o) => hasBuff('sw_saint') && o.type !== 'dot',
    dmgMult(k, W, o) {
      if (W.ks1 === 'sw_glad') k *= 1 + me.mom * 0.03;
      if (W.br('sw_tough') === 'B' && me.hp < player.S.mhp * 0.5) k *= 1.15;
      if (o.wave && W.br('sw_dance') === 'B' && hasBuff('sw_dance')) k *= 1.5;
      return k;
    },
    // 幻剣で出したもう1回は威力 -30%（後の先の +50% のあと）
    dmgMultLast: (k, W, o) => ((o.type === 'tskill' || o.type === 'wskill') && now() < me.phantomUntil ? k * 0.7 : k),
    onHit(mb, dmg, crit, o) {
      const W = player.S.wt;
      // 技の巡り: 1回の攻撃で1回まで
      if (W.lv('sw_cycle') && me.cycleAct !== me.act) { me.cycleAct = me.act; cutCds(W.v('sw_cycle', 'cut') * (crit && W.br('sw_cycle') === 'A' ? 2 : 1)); }
      if (W.ks1 === 'sw_glad') {
        setMom(me.mom + 1);
        if (W.ks2 === 'sw_saint' && me.mom >= 10 && !me.saintOn) {
          me.saintOn = true;
          addBuff('sw_saint', '剣聖・全会心', 3, {}, 0xffd84a);
          floatText(me.x, 3.2, me.z, '剣聖!', 'just');
        }
      }
      // 狂剣士の吸収も、ふつうの吸収と同じく間隔に1回（継続ダメージは対象外）
      if (W.ks2 === 'sw_berserk' && me.mom > 0 && o.type !== 'dot' && now() - (me.berserkVampT || -1e9) >= BALANCE.lifestealGap) { me.berserkVampT = now(); heal(dmg * me.mom / 100 * BALANCE.lifestealEfficiency, false); }
      if (crit && W.br('sw_edge') === 'A' && now() - me.edgeT > 0.5) {
        me.edgeT = now();
        strikes.proj({ a: Math.atan2(mb.x - me.x, mb.z - me.z), mult: 0.5, type: 'proc', speed: 26, life: 0.45, rad: 0.9, wtNo: true });
      }
      if (crit && W.br('sw_edge') === 'B' && now() - me.edgeHealT > 0.15) { me.edgeHealT = now(); heal(player.S.mhp * 0.01, false); }
      if (o.type === 'normal' && W.br('sw_norm') === 'B') {
        if (me.normHealAct !== me.act) { me.normHealAct = me.act; me.normHeals = 0; }
        if (me.normHeals < 2) { me.normHeals++; heal(player.S.mhp * 0.005, false); }
      }
      if (o.type === 'normal' && W.br('sw_dance') === 'A' && me.danceAct !== me.act && me.danceExt < 4) {
        const b = me.buffs.find((q) => q.id === 'sw_dance');
        if (b) { me.danceAct = me.act; me.danceExt += 0.2; b.t += 0.2; b.max = Math.max(b.max, b.t); }
      }
      // 天剣: 斬撃波1発につき1回
      if (o.wave && W.ks2 === 'sw_heaven' && o.proj && !o.proj.heaven) {
        o.proj.heaven = true; cutCds(0.15);
        // 天剣: 当たった所から光の粒が持ち主へ戻ってくる（クールタイムが縮んだ合図）
        const dx = me.x - mb.x, dz = me.z - mb.z, d = Math.hypot(dx, dz) || 1;
        for (let i = 0; i < 6; i++) fx.parts.emit(mb.x, 1.3, mb.z, { color: 0xfff0a0, size: 0.32, life: Math.min(0.6, d / 14), dir: [dx / d, 0.05, dz / d], speed: 14, spread: 0.15, gravity: 0, drag: 0 });
        fx.parts.burst(me.x, 1.3, me.z, 6, { color: 0xfff0a0, speed: 2.5, size: 0.3, life: 0.35 });
      }
    },
    // スキルを使った後（free: 幻剣のもう1回）
    afterCast(id, free) {
      const W = player.S.wt;
      if (W.ks1 === 'sw_mage') me.mageT = now() + 3;
      if (W.br('sw_cycle') === 'B') quietBuff('sw_cycleB', '余勢', 2, { aspd: 12 }, 0x9affc8);
    },
    afterCastLate(id, free) {
      const W = player.S.wt;
      if (id === 'sw_dance') me.danceExt = 0;
      if (free) {
        me.phantom = null; me.phantomUntil = now() + 1.2;
        floatText(me.x, 3.4, me.z, '幻剣', 'just');
        fx.ringWave(me.x, me.z, 0xb86cff, 2.6, 0.35);
      } else if (W.ks2 === 'sw_phantom') me.phantom = { id, until: now() + 3 };
    },
    phantomReady: (id) => player.S.wt?.ks2 === 'sw_phantom' && me.phantom?.id === id && now() < me.phantom.until,
    // 受け流し（構えている間に受けた）: ほかの被弾の効果は起きない
    parry() {
      const W = player.S.wt;
      if (!(now() < me.parryUntil && !me.parryDone)) return false;
      me.parryDone = true;
      floatText(me.x, 3, me.z, '受け流し!', 'just');
      audio.sfx('block');
      fx.ringWave(me.x, me.z, 0xbfe0ff, 2.4, 0.3);
      if (W.br('sw_parry') === 'A') cutCds(3);
      if (W.br('sw_parry') === 'B') addBuff('sw_parryB', '奮い立ち', 5, { atkp: 25 }, 0xffb040);
      return true;
    },
    // 攻撃を受けた（不撓A・勢いのリセット）
    onHurt() {
      const W = player.S.wt;
      if (W.br('sw_tough') === 'A') cutCds(1);
      if (W.ks1 === 'sw_glad' && W.ks2 !== 'sw_berserk') setMom(0);
    },
    // ガードで受けた（守護騎士・報復者）
    onGuard(raw) {
      const W = player.S.wt;
      if (W.ks2 === 'sw_paladin' && now() - me.paladinT > 1.5) {
        me.paladinT = now();
        heal(player.S.mhp * 0.05, true);
        taunt(8);
        fx.ringWave(me.x, me.z, 0xfff0a0, 4, 0.4);
      }
      if (W.ks2 === 'sw_avenger') { me.revenge = Math.min(player.S.mhp, me.revenge + raw); fx.ringWave(me.x, me.z, 0xff4a3a, 1.6 + Math.min(1, me.revenge / (player.S.mhp * 0.5)) * 1.6, 0.3); }
    },
    // 報復者: 溜めたダメージを次の強攻撃（ガードカウンター）に上乗せ
    beforeHeavy() {
      if (!(me.revenge > 0) || player.S.wt?.ks2 !== 'sw_avenger') return;
      const mult = me.revenge / player.S.atk;
      me.revenge = 0;
      later(0.15, () => {
        strikes.circle(me.x, me.z, 3.6, mult, { type: 'heavy' });
        fx.ringWave(me.x, me.z, 0xff6a5a, 4, 0.4); fx.flash(me.x, 1.5, me.z, 0xff6a5a, 40, 0.3);
        floatText(me.x, 3.2, me.z, '報復!', 'just'); addShake(0.3);
      });
    },
    // 守護騎士のガードカウンター（盾槍以外）
    guardCounter() { if (player.S.wk === 'spear') return false; swordCounter(); return true; },
    // 不撓B「背水」
    drLowHp: (dr) => dr + (player.S.wt?.br('sw_tough') === 'B' && me.hp < player.S.mhp * 0.5 ? 15 : 0),
    // 狂剣士: 勢いの分だけ被ダメージが増える
    incoming: (raw) => (player.S.wt?.ks2 === 'sw_berserk' ? raw * (1 + 0.02 * me.mom) : raw),
    swingAspd: (v) => v + (player.S.wt?.ks1 === 'sw_glad' ? me.mom * 2 : 0),
    // 3段目: 剣の心得A「閃光」（斬撃波の特性がないとき）/ 魔剣士の光波
    swingLate(a, waved) {
      if (!waved && me.combo === 2 && player.S.wt?.br('sw_norm') === 'A') strikes.proj({ a, mult: 1.2, type: 'normal' }); // 剣の心得A「閃光」
    },
    swingLast(a) {
      if (player.S.wt?.ks1 === 'sw_mage' && now() < me.mageT) strikes.proj({ a, mult: 0.8, type: 'normal', speed: 26, life: 0.5, rad: 1.1 }); // 魔剣士
    },
    justDodge() { if (player.S.wt?.br('sw_light') === 'A') { me.afterJust = true; floatText(me.x, 3.0, me.z, '後の先', 'just'); } },
    // ブレイブハートB「速攻」: 効果中はクールタイムが早く戻る
    cooldownDt: (dt) => (player.S?.wt?.br('sw_brave') === 'B' && hasBuff('sw_brave') ? dt / 0.7 : dt),
    tick() { if (me.saintOn && !hasBuff('sw_saint')) { me.saintOn = false; setMom(0); } }, // 剣聖の全会心が終わったら勢いは0
    // とどめを刺した（直前に当てた）: ブレイブハートA「猛り」
    onKill(mb) { if (mb && player.S?.wt?.br('sw_brave') === 'A' && now() - mb.localT < 1.2) { const b = me.buffs.find((q) => q.id === 'sw_brave'); if (b) { b.t += 2; b.max = Math.max(b.max, b.t); } } },
    aura(dt, W) {
      // 剣闘士: 勢いが溜まるほど、橙の火の粉が体から立ちのぼる（最大で足元に炎の輪）
      if (W.ks1 === 'sw_glad' && me.mom > 0) {
        wtEmit('mom', me.mom * 7, dt, () => fx.parts.emit(me.x + rnd(-0.55, 0.55), rnd(0.1, 1.5), me.z + rnd(-0.55, 0.55), { color: me.mom >= 10 ? 0xffc040 : 0xff7a2a, size: 0.3 + me.mom * 0.03, life: 0.7, speed: 1.4, gravity: -4 }));
        if (me.mom >= 10 && now() - (me.momFxT || 0) > 0.7) { me.momFxT = now(); fx.ringWave(me.x, me.z, 0xff9a2e, 1.8, 0.45); }
      }
      // 剣聖: 全会心の間は、剣から金の光がこぼれ、足元に金の輪
      if (hasBuff('sw_saint')) {
        const hp = handPos(me.model);
        wtEmit('saint', 45, dt, () => fx.parts.emit(hp.x + rnd(-0.35, 0.35), hp.y + rnd(-0.2, 0.7), hp.z + rnd(-0.35, 0.35), { abs: true, color: 0xffe070, size: 0.34, life: 0.45, speed: 0.6, gravity: -2 }));
        if (now() - (me.saintFxT || 0) > 0.5) { me.saintFxT = now(); fx.ringWave(me.x, me.z, 0xffd84a, 2.2, 0.4); }
      }
      // 報復者: 溜めたダメージが多いほど、赤い揺らめきが濃くなり、足元の赤い輪が脈打つ
      if (W.ks2 === 'sw_avenger' && me.revenge > 0) {
        const k = Math.min(1, me.revenge / (player.S.mhp * 0.5));
        wtEmit('rev', 12 + 45 * k, dt, () => fx.parts.emit(me.x + rnd(-0.5, 0.5), rnd(0.1, 1.3), me.z + rnd(-0.5, 0.5), { color: k > 0.7 ? 0xff2a2a : 0xff6a5a, size: 0.28 + 0.28 * k, life: 0.6, speed: 0.9, gravity: -2.5 }));
        if (now() - (me.revFxT || 0) > 1.1 - 0.6 * k) { me.revFxT = now(); fx.ringWave(me.x, me.z, 0xff4a3a, 1.4 + k, 0.4); }
      }
    },
  }, { dmgMult: 5, onHit: 0, onHurt: 1, onGuard: 1, aura: 4, justDodge: 0, incoming: 0, swingLate: 0, afterCast: 0 });
}

// 武器の登録（weapons/index.js が集める）
//   kindOrder・stats: サーバーと共通の数値（WEAPONS の並び順と中身） / tab・glyph: 武器ツリー画面のタブの並び・装備アイコンの文字 / tree・skills・mods・legacy: 武器ツリー
//   heavy: 強攻撃 / weaponSkills: 武器スキル / model: 形 / motion: 構え（なければ近接） / effects: 武器ツリーの効果（install(api)）
export default { wk: 'sword', kindOrder: 0, stats, tab: 1, glyph: '剣', tree: SWORD, skills, mods, legacy, heavy, weaponSkills, model, motion, effects };
