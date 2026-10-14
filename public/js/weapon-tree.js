// 武器ツリー（新）: 武器熟練度でポイントを得て、その武器を持っているときだけ効く
//
// - 熟練度は、その武器を装備して経験値を得ると上がる（最大20）。熟練度1つにつき1ポイント
// - ほかの武器も「過去の最大熟練度の半分」から始まる
// - 段は熟練度 1 / 3 / 6 / 9 / 12 / 16 で開く
// - スキル・パッシブは3lvまで。lv1 は「ある無しが大きい」、lv2 は「伸びが感じられる」、
//   lv3 は lv2 の数値のまま A/B どちらかの形に変わる
// - クラス（3つから1つ）・マスター（クラスごとに2つから1つ）は1ポイント。強化・分岐なし（コード上は ks1 / ks2）
// 今は片手剣・大剣・短剣・盾槍。ほかの武器は旧ツリー（skills.js の TREES）のまま
import { TECHNIQUES } from '../shared/techniques.js';
import { TREE_MOTIONS } from '../shared/tree-motions.js';
import { xpToNext } from '../shared/data.js';

export const PROF_MAX = 20;
export const ROW_REQ = [1, 3, 6, 9, 12, 16];
export const profNeed = (lv) => xpToNext(2 * lv + 1);
export const WT_RESET_COST = (spent) => 100 + spent * 20;

const L3 = 'lv2の効果のまま、A・Bどちらかの形に変わる';
// tags: 共通の要素（画面の絞り込み用）
export const WT_TAGS = {
  wave: { name: '斬撃波', icon: '〰' }, cd: { name: 'クールタイム', icon: '⟲' }, crit: { name: '会心', icon: '✦' },
  dodge: { name: '回避', icon: '➶' }, hurt: { name: '被弾', icon: '⛨' },
  charge: { name: '溜め', icon: '◎' }, light: { name: '光波', icon: '☾' }, recv: { name: '受け', icon: '⛉' },
  poison: { name: '毒', icon: '☠' }, move: { name: '機動', icon: '»' },
  shield: { name: '盾', icon: '⛉' }, thrust: { name: '突き', icon: '➹' }, break: { name: '崩し', icon: '✸' },
  blood: { name: '血', icon: '♥' }, throw: { name: '投擲', icon: '⟳' },
};

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
// 大剣: 「重い一撃」と「光波」と「受け」。クラスは 光波 / 一撃 / カウンター
const GREATSWORD = {
  name: '大剣',
  rows: [
    { kind: 'skill', nodes: [
      { id: 'gt_rising', icon: '⤒', name: '払い上げ', base: '下から斬り上げる。ボスを大きく崩す', lv: ['威力420%', '威力520%', L3], tags: [],
        A: { name: '返し斬り', desc: 'すぐにもう一度振り下ろす（200%）' }, B: { name: '崩し上げ', desc: '崩す力（スタン値）が2倍' } },
      { id: 'gt_broad', icon: '⟷', name: '横一文字', base: '前方を広く薙ぎ払う', lv: ['威力420%', '威力530%', L3], tags: [],
        A: { name: '大薙ぎ', desc: '届く範囲がもっと広くなる' }, B: { name: '光の一文字', desc: '光波も飛ぶ（150%）', tags: ['light'] } },
      { id: 'gt_recoil', icon: '☾', name: '退き兜割り', base: '少し退いて、光波を放つ', lv: ['威力500%', '威力640%', L3], tags: ['light'],
        A: { name: '双波', desc: '光波が2発になる（各70%）' }, B: { name: '大光波', desc: '大きく、遠くまで届く（+15%）' } },
    ] },
    { kind: 'passive', nodes: [
      { id: 'gt_charge', icon: '◎', name: '溜めの心得', base: '強攻撃のダメージ', lv: ['+15%', '+25%', L3], tags: ['charge'], mods: [{ heavyp: 15 }, { heavyp: 25 }],
        A: { name: '速溜め', desc: '溜めにかかる時間 -20%' }, B: { name: '振り抜き', desc: '最大まで溜めた強攻撃の範囲 +20%' } },
      { id: 'gt_armor', icon: '⛉', name: '剛体', base: '溜めている間の守り', lv: ['ひるまない', 'ひるまない・被ダメージ-15%', L3], tags: ['recv', 'charge'],
        A: { name: '鋼', desc: '溜めている間に攻撃を受けると、溜めが進む' }, B: { name: '踏ん張り', desc: '溜めている間は吹き飛ばされず、被ダメージがさらに -10%' } },
      { id: 'gt_moon', icon: '☽', name: '月の残滓', base: '強攻撃を振ると、小さな光波も飛ぶ', lv: ['威力50%', '威力80%', L3], tags: ['light'],
        A: { name: '双月', desc: '小さな光波が2発になる' }, B: { name: '残月', desc: 'この光波でもボスを崩せる' } },
    ] },
    { kind: 'ks1', nodes: [
      { id: 'gt_wave', icon: '☾', name: '光波', desc: '強攻撃を振ると光波も飛ぶ（溜め1段目は100%、最大まで溜めると200%の大きな光波）。その代わり、剣そのものの強攻撃は -15%', tags: ['light', 'charge'] },
      { id: 'gt_blow', icon: '⚒', name: '一撃', desc: '最大まで溜めた強攻撃 +40%、溜めている間は被ダメージ -30%。その代わり、溜めにかかる時間が +25%', tags: ['charge', 'recv'] },
      { id: 'gt_counter', icon: '⚔', name: 'カウンター', desc: '強攻撃を押した直後（0.35秒）に攻撃を受けると、無傷で受け流して反撃する（350%）', tags: ['recv'] },
    ] },
    { kind: 'passive', nodes: [
      { id: 'gt_break', icon: '✸', name: '崩しの極意', base: 'ボスを崩す力（スタン値）', lv: ['+20%', '+35%', L3], tags: [], mods: [{ stunp: 20 }, { stunp: 35 }],
        A: { name: '崩れ打ち', desc: 'スタン中の敵へのダメージがさらに +20%' }, B: { name: '崩しの波', desc: '光波でもボスを大きく崩せる', tags: ['light'] } },
      { id: 'gt_eye', icon: '◉', name: '見切り眼', base: 'JUST回避・受け流しのあと3秒間、ダメージアップ（6秒に1回まで）', lv: ['+15%', '+25%', L3], tags: ['recv'],
        A: { name: '研ぎ澄まし', desc: '次の強攻撃の溜めが2倍速', tags: ['charge'] }, B: { name: '返し刃', desc: '発動したとき、スキルのクールタイム -2秒' } },
    ] },
    { kind: 'skill', nodes: [
      { id: 'gt_guillo', icon: '⇓', name: '断頭落とし', base: '狭い前方へ振り下ろす。ボスを大きく崩す', lv: ['威力650%', '威力800%', L3], tags: [],
        A: { name: '処断', desc: 'HPが30%以下の敵には2倍' }, B: { name: '地走り', desc: '振り下ろしたあと、前へ衝撃が走る（200%）' } },
      { id: 'gt_slam', icon: '⤓', name: 'グランド・スラム', base: '跳んで叩きつける（広い範囲）', lv: ['威力520%', '威力650%', L3], tags: [],
        A: { name: '隕鉄', desc: '範囲 +50%' }, B: { name: '踏み込み溜め', desc: '着地したあとの強攻撃は、溜めが半分から始まる', tags: ['charge'] } },
      { id: 'gt_siege', icon: '♜', name: '破城の構え', base: 'ボスを崩す力 +80%・移動が少し遅くなる', lv: ['5秒間・強攻撃+30%', '7秒間・強攻撃+45%', L3], tags: ['charge'],
        A: { name: '不動の構え', desc: '効果中はひるまず、被ダメージ -20%', tags: ['recv'] }, B: { name: '月光の構え', desc: '効果中、強攻撃から光波も飛ぶ（120%）', tags: ['light'] } },
    ] },
    { kind: 'ks2', nodes: [
      { id: 'gt_fullmoon', from: 'gt_wave', icon: '○', name: '満月', desc: '最大まで溜めた光波が特大になる（×1.75）', tags: ['light'] },
      { id: 'gt_eclipse', from: 'gt_wave', icon: '●', name: '月蝕', desc: '光波が敵に当たると爆ぜて、周りも巻き込む（150%）', tags: ['light'] },
      { id: 'gt_judge', from: 'gt_blow', icon: '⚖', name: '断罪', desc: '最大まで溜めた強攻撃の会心率 +35%', tags: ['charge'] },
      { id: 'gt_unyield', from: 'gt_blow', icon: '⛰', name: '不屈', desc: '溜めている間に攻撃を受けると、溜めが一気に最大になる', tags: ['charge', 'recv'] },
      { id: 'gt_iai', from: 'gt_counter', icon: '⚡', name: '居合', desc: '反撃のあと、次の強攻撃は溜めなしで最大まで溜めた一撃になる', tags: ['charge', 'recv'] },
      { id: 'gt_mirror', from: 'gt_counter', icon: '◇', name: '明鏡', desc: '反撃に成功すると、5秒間ダメージ +30%', tags: ['recv'] },
    ] },
  ],
};
// 短剣: 「速さ」「急所」「毒」。クラスは 毒刃 / 暗殺 / 連刃
const DAGGER = {
  name: '短剣',
  rows: [
    { kind: 'skill', nodes: [
      { id: 'dk_flank', icon: '»', name: '抜け駆け', base: '横へすり抜けて斬る（移動中無敵）', lv: ['威力390%', '威力490%', L3], tags: ['move'],
        A: { name: '返し抜け', desc: 'すり抜けた先から、もう一度抜けて斬る（150%）' }, B: { name: '影抜け', desc: 'この斬撃は必ず会心になる', tags: ['crit'] } },
      { id: 'dk_vital', icon: '✕', name: '急所穿ち', base: '近くの敵を突く。HPが半分以下の敵には大ダメージ', lv: ['280%（半分以下は540%）', '360%（半分以下は680%）', L3], tags: ['crit'],
        A: { name: 'とどめ', desc: 'この突きで倒すと、クールタイムがすぐ戻る' }, B: { name: '抉り', desc: '突いた敵に出血（4秒・毎秒40%）', tags: ['poison'] } },
      { id: 'dk_bleed', icon: '≋', name: '裂傷連舞', base: '前を二度斬り、出血させる（4秒）', lv: ['各150%・出血 毎秒45%', '各190%・出血 毎秒60%', L3], tags: ['poison'],
        A: { name: '深裂', desc: '出血が重なる（最大3）' }, B: { name: '血風', desc: '周り全体を斬る' } },
    ] },
    { kind: 'passive', nodes: [
      { id: 'dk_combo', icon: '⚡', name: '連撃の心得', base: '攻撃を当てるたびに攻撃の速さが上がる（最大10・3秒）', lv: ['1つにつき+3%', '1つにつき+4%', L3], tags: ['move'], per: [3, 4],
        A: { name: '途切れぬ連撃', desc: '連撃が切れるまでの時間 5秒' }, B: { name: '連撃の刃', desc: '連撃が最大の間、ダメージ +6%' } },
      { id: 'dk_agile', icon: '➶', name: '身軽', base: '回避のクールタイム', lv: ['-15%', '-25%', L3], tags: ['move'], mods: [{ dodgecd: 15 }, { dodgecd: 25 }],
        A: { name: '残影', desc: 'JUST回避した後の1撃は必ず会心', tags: ['crit'] }, B: { name: '軽業', desc: '回避の距離 +30%・移動の速さ +10%' } },
      { id: 'dk_vitalp', icon: '✦', name: '急所の心得', base: '会心ダメージ', lv: ['+20%', '+35%', L3], tags: ['crit'], mods: [{ critd: 20 }, { critd: 35 }],
        A: { name: '急所見切り', desc: '会心率 +8%' }, B: { name: '深手', desc: '会心が出ると出血させる（3秒・毎秒20%）', tags: ['poison'] } },
    ] },
    { kind: 'ks1', nodes: [
      { id: 'dk_venom', icon: '☠', name: '毒刃', desc: '攻撃が当たると敵に毒が1つ重なる（最大5。1つにつき毎秒15%）', tags: ['poison'] },
      { id: 'dk_assassin', icon: '◣', name: '暗殺', desc: '敵の背後から当てた攻撃は必ず会心になり、ダメージ +20%', tags: ['crit'] },
      { id: 'dk_blades', icon: '⚡', name: '連刃', desc: '連撃の上限が15になり、最大のときは斬撃が二重に当たる（追撃40%）', tags: ['move'] },
    ] },
    { kind: 'passive', nodes: [
      { id: 'dk_toxin', icon: '⚗', name: '毒の心得', base: '毒・出血のダメージ', lv: ['+30%', '+50%', L3], tags: ['poison'],
        A: { name: '長毒', desc: '毒・出血の時間 +50%' }, B: { name: '毒の牙', desc: '通常攻撃の3段目で毒が1つ重なる' } },
      { id: 'dk_shadow', icon: '◌', name: '影歩き', base: '移動の速さ', lv: ['+8%', '+12%', L3], tags: ['move'], mods: [{ move: 8 }, { move: 12 }],
        A: { name: '影の衣', desc: '瞬影の距離 +30%・無敵 +0.2秒' }, B: { name: '影の刃', desc: '瞬影で通り抜けた敵に毒が2つ重なる', tags: ['poison'] } },
    ] },
    { kind: 'skill', nodes: [
      { id: 'dk_poison', icon: '☠', name: 'ポイズン・エッジ', base: '刃に毒を塗る。効果中は攻撃で毒が重なる', lv: ['8秒間', '10秒間', L3], tags: ['poison'],
        A: { name: '致死毒', desc: '効果中、毒のダメージ2倍' }, B: { name: '毒霧', desc: '使った瞬間、周りの敵に毒が3つ重なる' } },
      { id: 'dk_smoke', icon: '☁', name: 'スモーク・ステップ', base: '煙幕で後ろへ跳ぶ（1秒無敵）。次の攻撃が必ず会心', lv: ['次の3撃', '次の4撃', L3], tags: ['crit', 'move'],
        A: { name: '影走り', desc: '跳んだあと3秒間、移動の速さ +40%' }, B: { name: '奇襲', desc: 'この会心のダメージ +50%' } },
      { id: 'dk_pin', icon: '†', name: '影縫い', base: 'ナイフを投げ、ボス以外の敵の足を3秒止める', lv: ['威力260%', '威力340%', L3], tags: [],
        A: { name: '三本縫い', desc: '3本を扇状に投げる（各70%）' }, B: { name: '毒ナイフ', desc: '当たった敵に毒が3つ重なる', tags: ['poison'] } },
    ] },
    { kind: 'ks2', nodes: [
      { id: 'dk_burst', from: 'dk_venom', icon: '✺', name: '猛毒', desc: '毒が5つ重なると破裂して大きなダメージ（300%）。毒は消える', tags: ['poison'] },
      { id: 'dk_spread', from: 'dk_venom', icon: '❋', name: '蝕み', desc: '毒が重なっている敵へのダメージ +4%（重ね1つにつき）', tags: ['poison'] },
      { id: 'dk_step', from: 'dk_assassin', icon: '↶', name: '影渡り', desc: '瞬影ですり抜けたあと敵のほうへ向き直り、次の1撃 +50%', tags: ['move', 'crit'] },
      { id: 'dk_exec', from: 'dk_assassin', icon: '☩', name: '必殺', desc: '背後からの会心で、HPが25%以下の雑魚はとどめ。ボスにはダメージ +40%', tags: ['crit'] },
      { id: 'dk_thousand', from: 'dk_blades', icon: '⋔', name: '千本', desc: '連撃が最大の間、通常攻撃の3段目でナイフが3本飛ぶ（各35%）', tags: ['move'] },
      { id: 'dk_gale', from: 'dk_blades', icon: '≫', name: '疾風', desc: '連撃が切れるまでの時間が2倍。連撃が最大の間、移動の速さ +25%', tags: ['move'] },
    ] },
  ],
};
// 盾槍: 「盾」「突き」「崩し」。クラスは 竜騎士（槍メイン）/ 間合い / 騎士（受けて返す）
// 溜め中のガードと、受けてから離すガードカウンターは盾槍の基本の操作（竜騎士だけガードの代わりに跳躍）
const SPEAR = {
  name: '盾槍',
  rows: [
    { kind: 'skill', nodes: [
      { id: 'sp_fan', icon: '⋔', name: '扇突き', base: '正面と左右へ突く', lv: ['各130%', '各165%', L3], tags: ['thrust'],
        A: { name: '竜爪', desc: '跳び上がって突き降ろし、周りにも当たる（100%）' }, B: { name: '長扇', desc: '届く距離 +50%' } },
      { id: 'sp_sweep', icon: '⌒', name: '足払い', base: '前方を低く薙ぎ、ボス以外の敵の足を3秒遅くする', lv: ['威力240%', '威力300%', L3], tags: ['break'],
        A: { name: '大回し', desc: '周り全体を薙ぐ' }, B: { name: '崩し払い', desc: 'ボスを崩す力（スタン値）が2倍' } },
      { id: 'sp_bash', icon: '⛉', name: 'シールドバッシュ', base: '盾で前を殴る。ボスを大きく崩し、狙いを引きつける', lv: ['威力280%', '威力350%', L3], tags: ['shield', 'break'],
        A: { name: '連打', desc: 'もう一度殴る（150%）' }, B: { name: '盾突進', desc: '3m踏み込んで殴る（踏み込み中は無敵）' } },
    ] },
    { kind: 'passive', nodes: [
      { id: 'sp_iron', icon: '⛨', name: '鉄壁の心得', base: '被ダメージ', lv: ['-6%', '-10%', L3], tags: ['shield'], mods: [{ def: 6 }, { def: 10 }],
        A: { name: '不動', desc: 'ガードで受けても押し戻されない' }, B: { name: '頑健', desc: '最大HP +10%' } },
      { id: 'sp_shield', icon: '◈', name: '盾の心得', base: 'ガードで受けたときのガードゲージの減り', lv: ['-20%', '-35%', L3], tags: ['shield'], gauge: [20, 35],
        A: { name: '立て直し', desc: 'ガードゲージの回復が2倍速い' }, B: { name: '盾の重み', desc: 'ガードで受けると、その敵を崩す', tags: ['break'] } },
      { id: 'sp_spear', icon: '➹', name: '槍の心得', base: '通常攻撃・強攻撃のダメージ', lv: ['+10%', '+18%', L3], tags: ['thrust'], mods: [{ normp: 10, heavyp: 10 }, { normp: 18, heavyp: 18 }],
        A: { name: '長柄', desc: '通常攻撃の届く距離 +20%' }, B: { name: '連突き', desc: '通常攻撃の3段目でもう一度突く（60%）' } },
    ] },
    { kind: 'ks1', nodes: [
      { id: 'sp_dragoon', icon: '⇑', name: '竜騎士', desc: '盾を背負い、槍を両手で持つ。ガードはできないが攻撃の速さ +30%。強攻撃は高く跳んで、狙った場所へ突き降りる（空中は無敵・750%）', tags: ['thrust'] },
      { id: 'sp_reach', icon: '↦', name: '間合い', desc: '槍の先端（届くぎりぎりの距離）で当てた攻撃は必ず会心・ダメージ +25%。近すぎると -20%', tags: ['thrust'] },
      { id: 'sp_knight', icon: '♞', name: '騎士', desc: 'ガードカウンターのあと3秒間、突きが雷をまとう（ダメージ +20%・届く距離 +50%）', tags: ['shield', 'thrust'] },
    ] },
    { kind: 'passive', nodes: [
      { id: 'sp_brk', icon: '✸', name: '崩しの心得', base: 'ボスを崩す力（スタン値）', lv: ['+20%', '+35%', L3], tags: ['break'], mods: [{ stunp: 20 }, { stunp: 35 }],
        A: { name: '崩れ突き', desc: 'スタン中の敵へのダメージがさらに +20%' }, B: { name: '盾の一撃', desc: 'ガードカウンターでボスを崩す力が2倍', tags: ['shield'] } },
      { id: 'sp_ctr', icon: '↺', name: '反撃の心得', base: 'ガードカウンターの威力', lv: ['+20%', '+35%', L3], tags: ['shield'], ctr: [20, 35],
        A: { name: '反撃の守り', desc: 'ガードカウンターの間は無敵' }, B: { name: '二段反撃', desc: 'ガードカウンターのあと、もう一度突く（150%）', tags: ['thrust'] } },
    ] },
    { kind: 'skill', nodes: [
      { id: 'sp_stake', icon: '⚡', name: '杭打ち', base: '狙った地点（6m以内）に雷の杭を打つ', lv: ['威力380%', '威力480%', L3], tags: ['break'],
        A: { name: '雷杭', desc: '杭が3秒残り、雷を落とし続ける（0.5秒ごとに40%）' }, B: { name: '三連杭', desc: '杭を3本打つ（各60%）' } },
      { id: 'sp_intercept', icon: '⛊', name: '迎撃の構え', base: '3秒間守りを固めて敵を引きつけ、前へ2回突く', lv: ['被ダメージ-35%・各150%', '被ダメージ-35%・各190%', L3], tags: ['shield', 'thrust'],
        A: { name: '雷の構え', desc: '構えている間に攻撃を受けると、3秒間突きが雷をまとう' }, B: { name: '鉄の構え', desc: '構えている間の被ダメージ -60%' } },
      { id: 'sp_taunt', icon: '!', name: '挑発', base: '周りの敵の狙いを6秒間自分に向ける', lv: ['被ダメージ-30%', '被ダメージ-40%', L3], tags: ['shield'],
        A: { name: '威圧', desc: '効果中、ガードゲージが減らない' }, B: { name: '鼓舞', desc: '効果中、攻撃力 +20%' } },
    ] },
    { kind: 'ks2', nodes: [
      { id: 'sp_fang', from: 'sp_dragoon', icon: '✷', name: '竜の牙', desc: '突き降りた場所に衝撃が広がり（300%）、ボスを大きく崩す', tags: ['break'] },
      { id: 'sp_soar', from: 'sp_dragoon', icon: '⇈', name: '竜翔', desc: '突き降りてから1.5秒以内なら、溜めなしでもう一度跳べる（1回だけ）', tags: ['thrust'] },
      { id: 'sp_pierce', from: 'sp_reach', icon: '➶', name: '一点突破', desc: '先端で3回続けて当てると、次の突きが前方を貫く衝撃になる（160%）', tags: ['thrust'] },
      { id: 'sp_hold', from: 'sp_reach', icon: '⇤', name: '間合い支配', desc: '先端で当てたボス以外の敵を押し戻す', tags: ['thrust'] },
      { id: 'sp_banner', from: 'sp_knight', icon: '⚑', name: '旗手', desc: 'ガードカウンターした場所に旗が立つ（8秒）。そばにいる間は被ダメージ -20%・攻撃力 +15%', tags: ['shield'] },
      { id: 'sp_bolt', from: 'sp_knight', icon: '☇', name: '雷槍', desc: '雷をまとった突きが当たると、その周りに雷が落ちる（60%）', tags: ['thrust'] },
    ] },
  ],
};
// 大斧: 「重さ」「血」「崩し」。クラスは 狂戦士（HPが減るほど強い）/ 破砕（ボスを崩す）/ 投斧（強攻撃で斧を投げる）
const AXE = {
  name: '大斧',
  rows: [
    { kind: 'skill', nodes: [
      { id: 'ax_hook', icon: '⟲', name: '引き裂き', base: '前の敵（ボス以外）を引き寄せてから叩く', lv: ['威力280%', '威力360%', L3], tags: ['break'],
        A: { name: '大引き', desc: '周り全体の敵を引き寄せる' }, B: { name: '叩き伏せ', desc: 'もう一度叩く（150%）' } },
      { id: 'ax_return', icon: '⟳', name: '返り刃', base: '斧の分身を投げる。8m先まで飛んで戻り、往復とも当たる', lv: ['各150%', '各190%', L3], tags: ['throw'],
        A: { name: '双刃', desc: '左右にも1本ずつ飛ぶ（各50%）' }, B: { name: '旋回', desc: '飛んだ先で1.5秒回り続けてから戻る（0.3秒ごとに40%）' } },
      { id: 'ax_stomp', icon: '⊚', name: 'ウォーストンプ', base: '地面を踏み鳴らし、周りの敵を揺さぶる（ボスを大きく崩す）', lv: ['威力180%', '威力230%', L3], tags: ['break'],
        A: { name: '地鳴り', desc: '1秒後にもう一度揺れる（100%）' }, B: { name: '大踏み', desc: '範囲 +50%' } },
    ] },
    { kind: 'passive', nodes: [
      { id: 'ax_heavy', icon: '◎', name: '剛力の心得', base: '強攻撃のダメージ', lv: ['+15%', '+25%', L3], tags: ['charge'], mods: [{ heavyp: 15 }, { heavyp: 25 }],
        A: { name: '地割れ', desc: '最大まで溜めた強攻撃で、前へ地割れが走る（120%）' }, B: { name: '重圧', desc: '強攻撃でボスを崩す力（スタン値）+50%', tags: ['break'] } },
      { id: 'ax_blood', icon: '♥', name: '血の心得', base: '与えたダメージの一部を回復', lv: ['2%', '3%', L3], tags: ['blood'], mods: [{ vamp: 2 }, { vamp: 3 }],
        A: { name: '渇き', desc: 'HPが半分以下の間、回復が2倍', tags: ['hurt'] }, B: { name: '血気', desc: 'HPが満タンの間、攻撃力 +10%' } },
      { id: 'ax_swing', icon: '⌒', name: '斧の心得', base: '通常攻撃のダメージ', lv: ['+10%', '+18%', L3], tags: [], mods: [{ normp: 10 }, { normp: 18 }],
        A: { name: '大振り', desc: '通常攻撃の届く距離 +20%' }, B: { name: '三段斬り', desc: '通常攻撃の3段目のダメージ +30%' } },
    ] },
    { kind: 'ks1', nodes: [
      { id: 'ax_berserk', icon: '♨', name: '狂戦士', desc: '減ったHP10%ごとに、攻撃の速さとダメージ +3%（最大 +27%）', tags: ['hurt', 'blood'] },
      { id: 'ax_crush', icon: '✸', name: '破砕', desc: '強攻撃でボスを崩す力（スタン値）が2倍。ボスがスタンしたとき、周りに衝撃が走る（500%）', tags: ['break', 'charge'] },
      { id: 'ax_throw', icon: '⟳', name: '投斧', desc: '強攻撃で斧を投げる。斧は8m先まで飛んで戻り、往復とも当たる（最大溜めで各260%）', tags: ['throw', 'charge'] },
    ] },
    { kind: 'passive', nodes: [
      { id: 'ax_brk', icon: '✸', name: '崩しの心得', base: 'ボスを崩す力（スタン値）', lv: ['+20%', '+35%', L3], tags: ['break'], mods: [{ stunp: 20 }, { stunp: 35 }],
        A: { name: '砕き', desc: 'スタン中の敵へのダメージがさらに +20%' }, B: { name: '揺さぶり', desc: '通常攻撃の3段目でボスを崩す力が3倍' } },
      { id: 'ax_rage', icon: '♨', name: '怒りの心得', base: '攻撃を受けると5秒間、攻撃力アップ', lv: ['+4%', '+7%', L3], tags: ['hurt'], rage: [4, 7],
        A: { name: '逆上', desc: '効果中、攻撃の速さ +15%' }, B: { name: '我慢', desc: '効果中、被ダメージ -15%' } },
    ] },
    { kind: 'skill', nodes: [
      { id: 'ax_exec', icon: '☩', name: '処刑斬', base: '近くの敵へ一撃。HPが30%以下の敵には2倍', lv: ['威力340%', '威力420%', L3], tags: ['break'],
        A: { name: '断頭', desc: 'この一撃で倒すと、クールタイムがすぐ戻る' }, B: { name: '薙ぎ処刑', desc: '前の広い範囲の敵すべてに当たる（各70%）' } },
      { id: 'ax_lust', icon: '♥', name: 'ブラッドラスト', base: '8秒間、攻撃力アップ・与えたダメージの一部を回復', lv: ['攻撃力+15%・回復5%', '攻撃力+20%・回復8%', L3], tags: ['blood'],
        A: { name: '血の代償', desc: '使うときHPを15%払い、効果中は攻撃の速さ +20%', tags: ['hurt'] }, B: { name: '長い渇き', desc: '効果時間 12秒' } },
      { id: 'ax_rush', icon: '»', name: '猛進断', base: '5m突進して叩き斬る（突進中は被ダメージ -30%）。ボス以外は押し戻す', lv: ['威力320%', '威力400%', L3], tags: ['break'],
        A: { name: '轢き', desc: '突進中に触れた敵にも当たる（100%）' }, B: { name: '二段', desc: '叩いたあと、足元の周りを叩く（200%）' } },
    ] },
    { kind: 'ks2', nodes: [
      { id: 'ax_undying', from: 'ax_berserk', icon: '✚', name: '不死身', desc: 'HPが0になる攻撃を受けても1で耐え、2秒間無敵（60秒に1回）', tags: ['hurt'] },
      { id: 'ax_reckless', from: 'ax_berserk', icon: '☠', name: '捨て身', desc: '狂戦士の上乗せが1.5倍（最大 +40%）。そのかわり被ダメージ +25%', tags: ['hurt'] },
      { id: 'ax_quake', from: 'ax_crush', icon: '⚡', name: '地砕き', desc: '強攻撃で前へ大きな地割れが走る（200%）', tags: ['break', 'charge'] },
      { id: 'ax_shatter', from: 'ax_crush', icon: '✷', name: '砕骨', desc: 'スタン中のボスへの強攻撃は必ず会心・ダメージ +50%', tags: ['break', 'crit'] },
      { id: 'ax_storm', from: 'ax_throw', icon: '✺', name: '旋風', desc: '投げた斧が先で2秒回り続け、周りを切り刻む（0.25秒ごとに50%）', tags: ['throw'] },
      { id: 'ax_catch', from: 'ax_throw', icon: '✋', name: '受け止め', desc: '戻ってきた斧を受け止めると、3秒間 攻撃の速さ +25%', tags: ['throw'] },
    ] },
  ],
};
export const WTREES = { sword: SWORD, greatsword: GREATSWORD, dagger: DAGGER, spear: SPEAR, axe: AXE };
export const WT_NODE = {};
for (const [wk, T] of Object.entries(WTREES)) T.rows.forEach((r, ri) => r.nodes.forEach((n) => { WT_NODE[n.id] = { ...n, wk, row: ri, kind: r.kind, req: ROW_REQ[ri] }; }));
export const hasWTree = (wk) => !!WTREES[wk];

// ---- 熟練度 ----
export function profOf(char, wk) {
  char.prof = char.prof || {};
  return char.prof[wk] || (char.prof[wk] = { lv: 1, xp: 0 });
}
// 実際の熟練度: 自分の熟練度と「過去の最大熟練度の半分」の高いほう
export const profLevel = (char, wk) => Math.min(PROF_MAX, Math.max(profOf(char, wk).lv, Math.floor((char.profBest || 0) / 2), 1));
// 経験値を足す。上がった熟練度の配列を返す
export function gainProf(char, wk, n) {
  const p = profOf(char, wk), ups = [];
  if (p.lv < profLevel(char, wk)) p.lv = profLevel(char, wk); // 引き継ぎ分から積み上げる
  if (p.lv >= PROF_MAX) return ups;
  p.xp += n;
  while (p.lv < PROF_MAX && p.xp >= profNeed(p.lv)) { p.xp -= profNeed(p.lv); p.lv++; ups.push(p.lv); }
  if (p.lv >= PROF_MAX) p.xp = 0;
  char.profBest = Math.max(char.profBest || 0, p.lv);
  return ups;
}

// ---- 振り分け ----
export function wtOf(char, wk) {
  char.wt = char.wt || {};
  return char.wt[wk] || (char.wt[wk] = { lv: {}, br: {}, ks1: null, ks2: null });
}
export const wtSpent = (st) => Object.values(st.lv).reduce((a, b) => a + b, 0) + (st.ks1 ? 1 : 0) + (st.ks2 ? 1 : 0);
export const wtLeft = (char, wk) => profLevel(char, wk) - wtSpent(wtOf(char, wk));
export function wtCanLearn(char, id) {
  const n = WT_NODE[id];
  if (!n) return false;
  const st = wtOf(char, n.wk);
  if (profLevel(char, n.wk) < n.req || wtLeft(char, n.wk) <= 0) return false;
  if (n.kind === 'ks1') return !st.ks1;
  if (n.kind === 'ks2') return !st.ks2 && st.ks1 === n.from;
  return (st.lv[id] || 0) < 3;
}
export function wtLearn(char, id) {
  if (!wtCanLearn(char, id)) return false;
  const n = WT_NODE[id], st = wtOf(char, n.wk);
  if (n.kind === 'ks1' || n.kind === 'ks2') st[n.kind] = id;
  else st.lv[id] = (st.lv[id] || 0) + 1;
  return true;
}
export function wtChoose(char, id, b) {
  const n = WT_NODE[id];
  if (!n || (b !== 'A' && b !== 'B')) return false;
  const st = wtOf(char, n.wk);
  if (st.lv[id] !== 3 || st.br[id]) return false;
  st.br[id] = b;
  return true;
}
export function wtReset(char, wk) { char.wt[wk] = { lv: {}, br: {}, ks1: null, ks2: null }; }

// 今の武器のツリーの効果。武器ツリーがない武器は null
export function wtEffects(char, wk) {
  if (!hasWTree(wk)) return null;
  const st = wtOf(char, wk);
  const mods = {}, actives = new Set();
  const lv = (id) => st.lv[id] || 0, br = (id) => (st.lv[id] === 3 ? st.br[id] || null : null);
  const v = (id, k) => (lv(id) ? WT_NODE[id][k][Math.min(2, lv(id)) - 1] : 0);
  for (const id of Object.keys(st.lv)) {
    const n = WT_NODE[id];
    if (!n || !st.lv[id]) continue;
    if (n.kind === 'skill') actives.add(id);
    if (n.mods) for (const [k, x] of Object.entries(n.mods[Math.min(2, st.lv[id]) - 1])) mods[k] = (mods[k] || 0) + x;
  }
  if (st.ks1 === 'sw_mage') mods.normp = (mods.normp || 0) - 10;
  if (br('sw_light') === 'B') mods.dodgecd = (mods.dodgecd || 0) + 20;
  if (br('dk_agile') === 'B') mods.move = (mods.move || 0) + 10;
  if (br('dk_vitalp') === 'A') mods.crit = (mods.crit || 0) + 8;
  if (st.ks1 === 'sp_dragoon') mods.aspd = (mods.aspd || 0) + 30;
  if (br('sp_iron') === 'B') mods.hpp = (mods.hpp || 0) + 10;
  return { st, lv, br, v, ks1: st.ks1, ks2: st.ks2, mods, actives, has: (id) => st.ks1 === id || st.ks2 === id };
}

// ---- 片手剣のスキル（Q/E）。run(c) の c.wt() で振ったレベルと分岐を読む ----
const T = TECHNIQUES;
const at = (c, sec, fn) => c.later(sec, fn);
export const WT_SKILLS = {
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
// ---- 大剣のスキル（Q/E） ----
const slashAt = (c, a, r, deg, mult, o = {}) => { c.arc(r, deg, mult, { type: 'tskill', a, ...o }); c.fx.slash(c.me.x, c.me.z, a, r, deg, c.col(), 1.6); c.sfx('swing', { heavy: true }); };
export const LIGHT_COLOR = 0xa8e4ff;
Object.assign(WT_SKILLS, {
  gt_rising: {
    name: '払い上げ', kind: 'greatsword', cd: 10.8, motion: 'gs_rising', duration: T.gs_rising.duration,
    motionOf: (W) => (W.br('gt_rising') === 'A' ? 'gt_rising_twin' : 'gs_rising'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('gt_rising') >= 2 ? 5.2 : 4.2, b = W.br('gt_rising');
      at(c, T.gs_rising.hits[0], () => slashAt(c, a, 3.7, 100, m, { stun: b === 'B' ? 36 : 18 }));
      if (b === 'A') at(c, TREE_MOTIONS.gt_rising_twin.hits[1], () => { slashAt(c, a, 3.4, 80, 2.0, { stun: 5 }); c.shake(0.3); });
    },
  },
  gt_broad: {
    name: '横一文字', kind: 'greatsword', cd: 12, motion: 'gs_broad', duration: T.gs_broad.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('gt_broad') >= 2 ? 5.3 : 4.2, b = W.br('gt_broad');
      at(c, T.gs_broad.hits[0], () => {
        if (b === 'A') slashAt(c, a, 5.6, 300, m, { stun: 8 }); else slashAt(c, a, 4.7, 230, m, { stun: 8 });
        if (b === 'B') c.proj({ a, mult: 1.5, speed: 22, life: 0.6, rad: 1.6, type: 'tskill', color: LIGHT_COLOR });
      });
    },
  },
  gt_recoil: {
    name: '退き兜割り', kind: 'greatsword', cd: 13.2, motion: 'gs_recoil', duration: T.gs_recoil.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('gt_recoil') >= 2 ? 6.4 : 5.0, b = W.br('gt_recoil');
      c.dash(a + Math.PI, 2, 0.18, 0); c.me.a = a;
      at(c, T.gs_recoil.hits[0], () => {
        if (b === 'A') for (const d of [-0.18, 0.18]) c.proj({ a: a + d, mult: m * 0.7, speed: 21, life: 0.45, rad: 1.3, type: 'tskill', color: LIGHT_COLOR });
        else if (b === 'B') c.proj({ a, mult: m * 1.15, speed: 23, life: 0.65, rad: 2.1, type: 'tskill', color: LIGHT_COLOR });
        else c.proj({ a, mult: m, speed: 21, life: 0.42, rad: 1.3, type: 'tskill', color: LIGHT_COLOR });
        c.sfx('heavy');
      });
    },
  },
  gt_guillo: {
    name: '断頭落とし', kind: 'greatsword', cd: 14.4, motion: 'gs_guillotine', duration: T.gs_guillotine.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('gt_guillo') >= 2 ? 8.0 : 6.5, b = W.br('gt_guillo');
      at(c, T.gs_guillotine.hits[0], () => {
        c.line(4.5, 1.8, m, { type: 'tskill', a, stun: 22, exec: b === 'A' ? 2 : 0 });
        c.fx.slash(c.me.x, c.me.z, a, 4.5, 50, c.col(), 2.2); c.shake(0.5); c.sfx('impact');
        if (b === 'B') {
          const sx = c.me.x + Math.sin(a) * 4, sz = c.me.z + Math.cos(a) * 4;
          at(c, 0.15, () => {
            c.line(6, 2.2, 2.0, { type: 'tskill', a, sx, sz, stun: 4 });
            for (let d = 0; d < 6; d += 0.6) c.fx.parts.burst(sx + Math.sin(a) * d, 0.3, sz + Math.cos(a) * d, 6, { color: 0xc8b090, speed: 5, size: 0.5, life: 0.4, up: 2 });
          });
        }
      });
    },
  },
  gt_slam: {
    name: 'グランド・スラム', kind: 'greatsword', cd: 12, motion: 'gt_slam', duration: TREE_MOTIONS.gt_slam.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('gt_slam') >= 2 ? 6.5 : 5.2, b = W.br('gt_slam'), r = b === 'A' ? 7.2 : 4.8;
      c.dash(a, 6, 0.35, 0.45);
      at(c, TREE_MOTIONS.gt_slam.hits[0], () => {
        c.circle(c.me.x, c.me.z, r, m, { type: 'tskill', stun: 8 });
        c.fx.ringWave(c.me.x, c.me.z, c.col(), r + 1.2, 0.45);
        c.fx.parts.burst(c.me.x, 0.3, c.me.z, 60, { color: 0xc8b090, speed: 9, size: 0.6, life: 0.7, up: 2 });
        c.sfx('heavy'); c.shake(0.6);
        if (b === 'B') c.primeCharge(0.5);
      });
    },
  },
  gt_siege: {
    name: '破城の構え', kind: 'greatsword', cd: 22.8, motion: 'gs_siege', duration: T.gs_siege.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('gt_siege') >= 2;
      at(c, T.gs_siege.hits[0], () => { c.buff('gt_siege', '破城の構え', lv2 ? 7 : 5, { heavyp: lv2 ? 45 : 30, stunp: 80, move: -25 }, c.col()); c.fx.ringWave(c.me.x, c.me.z, c.col(), 2.6, 0.35); });
    },
  },
});
// ---- 短剣のスキル（Q/E）。毒・出血は c.poison / c.bleed で重ねる ----
export const KNIFE_COLOR = 0xcab4ff;
Object.assign(WT_SKILLS, {
  dk_flank: {
    name: '抜け駆け', kind: 'dagger', cd: 9.6, motion: 'dagger_flank', duration: T.dagger_flank.duration,
    motionOf: (W) => (W.br('dk_flank') === 'A' ? 'dk_flank_twin' : 'dagger_flank'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('dk_flank') >= 2 ? 4.9 : 3.9, b = W.br('dk_flank');
      c.dash(a + Math.PI / 2, 4, 0.18, 0.25); c.me.a = a;
      at(c, T.dagger_flank.hits[0], () => { c.arc(3.1, 100, m, { type: 'tskill', a, crit: b === 'B' || undefined }); c.fx.slash(c.me.x, c.me.z, a, 3.1, 100, c.col(), 1.15); c.sfx('swing'); });
      if (b === 'A') at(c, TREE_MOTIONS.dk_flank_twin.hits[1] - 0.16, () => { c.dash(a - Math.PI / 2, 4, 0.18, 0.25); c.me.a = a; at(c, 0.16, () => { c.arc(3.1, 100, 1.5, { type: 'tskill', a }); c.fx.slash(c.me.x, c.me.z, a, 3.1, 100, c.col(), 1.15, true); c.sfx('swing'); }); });
    },
  },
  dk_vital: {
    name: '急所穿ち', kind: 'dagger', cd: 10.8, motion: 'dagger_vital', duration: T.dagger_vital.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('dk_vital') >= 2, b = W.br('dk_vital'), a = c.aim();
      at(c, T.dagger_vital.hits[0], () => {
        const t = c.nearest(3.5);
        if (!t) return;
        c.hit(t, t.hp <= t.mhp * 0.5 ? (lv2 ? 6.8 : 5.4) : (lv2 ? 3.6 : 2.8), { type: 'tskill' });
        c.fx.slash(t.x, t.z, a, 1.4, 60, c.col(), 0.8);
        if (b === 'B') c.bleed(t, 0.4);
        if (b === 'A' && t.hp <= 0) c.resetCd('dk_vital');
      });
    },
  },
  dk_bleed: {
    name: '裂傷連舞', kind: 'dagger', cd: 13.2, motion: 'dagger_bleed', duration: T.dagger_bleed.duration,
    motionOf: (W) => (W.br('dk_bleed') === 'B' ? 'dk_bleed_spin' : 'dagger_bleed'),
    run(c) {
      const W = c.wt(), lv2 = W.lv('dk_bleed') >= 2, b = W.br('dk_bleed'), a = c.aim();
      T.dagger_bleed.hits.forEach((h, i) => at(c, h, () => {
        for (const t of c.targets(c.me.x, c.me.z, b === 'B' ? 3.2 : 2.8)) {
          const ang = Math.atan2(t.x - c.me.x, t.z - c.me.z);
          if (b !== 'B' && Math.abs(Math.atan2(Math.sin(ang - a), Math.cos(ang - a))) > 1.3) continue;
          c.hit(t, lv2 ? 1.9 : 1.5, { type: 'tskill' });
          if (i === 0) c.bleed(t, lv2 ? 0.6 : 0.45, b === 'A');
        }
        c.fx.slash(c.me.x, c.me.z, a + (i ? -0.3 : 0.3), b === 'B' ? 3.2 : 2.8, b === 'B' ? 360 : 150, 0xff7283, 0.9, i === 1); c.sfx('swing');
      }));
    },
  },
  dk_poison: {
    name: 'ポイズン・エッジ', kind: 'dagger', cd: 18, motion: 'dk_poison', duration: TREE_MOTIONS.dk_poison.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('dk_poison') >= 2;
      c.buff('dk_poison', 'ポイズン・エッジ', lv2 ? 10 : 8, {}, 0x8aff5a);
      if (W.br('dk_poison') === 'B') { for (const t of c.targets(c.me.x, c.me.z, 4.5)) c.poison(t, 3); c.fx.ringWave(c.me.x, c.me.z, 0x8aff5a, 4.5, 0.5); c.fx.parts.burst(c.me.x, 0.8, c.me.z, 50, { color: 0x8aff5a, speed: 5, size: 0.8, life: 0.9, gravity: 0.5 }); }
    },
  },
  dk_smoke: {
    name: 'スモーク・ステップ', kind: 'dagger', cd: 12, motion: 'dk_smoke', duration: TREE_MOTIONS.dk_smoke.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('dk_smoke') >= 2;
      c.fx.parts.burst(c.me.x, 0.8, c.me.z, 50, { color: 0x8a8a9a, speed: 4, size: 0.9, life: 1.0, gravity: 0.5 });
      c.dash(c.aim() + Math.PI, 5, 0.2, 1.0);
      c.ambush(lv2 ? 4 : 3);
      if (W.br('dk_smoke') === 'A') c.buff('dk_smokeA', '影走り', 3, { move: 40 }, 0x9a9aaa);
    },
  },
  dk_pin: {
    name: '影縫い', kind: 'dagger', cd: 12, motion: 'dagger_pin', duration: T.dagger_pin.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('dk_pin') >= 2 ? 3.4 : 2.6, b = W.br('dk_pin');
      at(c, T.dagger_pin.hits[0], () => {
        const spread = b === 'A' ? [-0.25, 0, 0.25] : [0];
        for (const d of spread) c.arrow({ a: a + d, mult: m * (b === 'A' ? 0.7 : 1), type: 'tskill', tech: 'dagger_pin', noZone: true, speed: 38, color: KNIFE_COLOR, poison: b === 'B' ? 3 : 0 });
      });
    },
  },
});
// ---- 盾槍のスキル（Q/E）。足払いは技と同じ足止め（tech: spear_sweep）をサーバーで使う ----
const spOff = (x, z, a, d) => ({ x: x + Math.sin(a) * d, z: z + Math.cos(a) * d });
Object.assign(WT_SKILLS, {
  sp_fan: {
    name: '扇突き', kind: 'spear', cd: 9.6, motion: 'spear_fan', duration: T.spear_fan.duration,
    motionOf: (W) => (W.br('sp_fan') === 'A' ? 'sp_fan_leap' : 'spear_fan'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('sp_fan') >= 2 ? 1.65 : 1.3, b = W.br('sp_fan'), len = b === 'B' ? 7.5 : 5;
      if (b === 'A') c.dash(a, 2.5, 0.2, 0.3);
      (b === 'A' ? TREE_MOTIONS.sp_fan_leap : T.spear_fan).hits.forEach((h, i) => at(c, h, () => {
        const ang = a + (i - 1) * 0.5;
        c.line(len, 1.5, m, { type: 'tskill', a: ang });
        for (let d = 0.7; d < len; d += 0.5) c.fx.parts.emit(c.me.x + Math.sin(ang) * d, 1.2, c.me.z + Math.cos(ang) * d, { color: c.col(), size: 0.42, life: 0.25, speed: 1, gravity: 0 });
        c.sfx('swing');
      }));
      if (b === 'A') at(c, TREE_MOTIONS.sp_fan_leap.hits[0], () => { c.circle(c.me.x, c.me.z, 3, 1.0, { type: 'tskill', stun: 4 }); c.fx.ringWave(c.me.x, c.me.z, c.col(), 3.4, 0.3); c.shake(0.25); });
    },
  },
  sp_sweep: {
    name: '足払い', kind: 'spear', cd: 12, motion: 'spear_sweep', duration: T.spear_sweep.duration,
    motionOf: (W) => (W.br('sp_sweep') === 'A' ? 'sp_sweep_spin' : 'spear_sweep'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('sp_sweep') >= 2 ? 3.0 : 2.4, b = W.br('sp_sweep'), deg = b === 'A' ? 360 : 180;
      at(c, b === 'A' ? TREE_MOTIONS.sp_sweep_spin.hits[0] : T.spear_sweep.hits[0], () => { c.arc(4, deg, m, { type: 'tskill', a, tech: 'spear_sweep', stun: b === 'B' ? 12 : 6 }); c.fx.slash(c.me.x, c.me.z, a, 4, deg, c.col(), 0.5); c.sfx('swing'); });
    },
  },
  sp_bash: {
    name: 'シールドバッシュ', kind: 'spear', cd: 8.4, motion: 'sp_bash', duration: TREE_MOTIONS.sp_bash.duration,
    motionOf: (W) => ({ A: 'sp_bash_twin', B: 'sp_bash_rush' })[W.br('sp_bash')] || 'sp_bash',
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('sp_bash') >= 2 ? 3.5 : 2.8, b = W.br('sp_bash');
      c.dash(a, b === 'B' ? 3 : 1.5, b === 'B' ? 0.16 : 0.1, b === 'B' ? 0.3 : 0);
      const bash = (mult, stun) => { c.arc(3.4, 110, mult, { type: 'tskill', a, threat: 4, stun }); c.fx.ringWave(c.me.x + Math.sin(a) * 2, c.me.z + Math.cos(a) * 2, 0xbfd8ff, 3, 0.3); c.sfx('block'); c.shake(0.3); };
      at(c, b === 'B' ? TREE_MOTIONS.sp_bash_rush.hits[0] : TREE_MOTIONS.sp_bash.hits[0], () => bash(m, 14));
      if (b === 'A') at(c, TREE_MOTIONS.sp_bash_twin.hits[1], () => bash(1.5, 8));
    },
  },
  sp_stake: {
    name: '杭打ち', kind: 'spear', cd: 13.2, motion: 'spear_stake', duration: T.spear_stake.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('sp_stake') >= 2 ? 4.8 : 3.8, b = W.br('sp_stake');
      const p = c.point(), d = Math.min(6, Math.hypot(p.x - c.me.x, p.z - c.me.z)), spot = spOff(c.me.x, c.me.z, a, d);
      const spots = b === 'B' ? [spot, spOff(spot.x, spot.z, a + 2.1, 1.8), spOff(spot.x, spot.z, a - 2.1, 1.8)] : [spot];
      for (const q of spots) c.fx.ringWave(q.x, q.z, c.col(), 1.8, 0.4);
      at(c, T.spear_stake.hits[0], () => {
        for (const q of spots) { c.circle(q.x, q.z, 1.8, m * (b === 'B' ? 0.6 : 1), { type: 'tskill', threat: 3, stun: b === 'B' ? 5 : 10 }); c.fx.lightning(q.x, q.z, c.col()); }
        c.sfx('thunder');
        if (b === 'A') for (let k = 1; k <= 6; k++) at(c, k * 0.5, () => { c.circle(spot.x, spot.z, 1.8, 0.4, { type: 'tskill', stun: 1 }); c.fx.lightning(spot.x, spot.z, 0xbfd8ff); });
      });
    },
  },
  sp_intercept: {
    name: '迎撃の構え', kind: 'spear', cd: 19.2, motion: 'spear_intercept', duration: T.spear_intercept.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('sp_intercept') >= 2 ? 1.9 : 1.5, b = W.br('sp_intercept');
      c.buff('sp_intercept', '迎撃の構え', 3, { dr: b === 'B' ? 60 : 35 }, 0xbfd8ff); c.taunt(8);
      T.spear_intercept.hits.forEach((h) => at(c, h, () => { c.line(5.5, 2, m, { type: 'tskill', a, threat: 3 }); c.sfx('swing'); }));
    },
  },
  sp_taunt: {
    name: '挑発', kind: 'spear', cd: 16.8, motion: 'sp_taunt', duration: TREE_MOTIONS.sp_taunt.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('sp_taunt') >= 2;
      c.taunt(14);
      c.buff('sp_taunt', '挑発', 6, { dr: lv2 ? 40 : 30, ...(W.br('sp_taunt') === 'B' ? { atkp: 20 } : {}) }, 0xff6a4a);
      c.fx.ringWave(c.me.x, c.me.z, 0xff6a4a, 14, 0.6);
      c.text('こっちだ！', 'info'); c.sfx('roar');
    },
  },
});
// ---- 大斧のスキル（Q/E）。引き寄せ・押し戻しは技と同じ（tech: axe_hook / axe_rush）をサーバーで使う ----
const inFront = (c, t, a, deg) => Math.abs(Math.atan2(Math.sin(Math.atan2(t.x - c.me.x, t.z - c.me.z) - a), Math.cos(Math.atan2(t.x - c.me.x, t.z - c.me.z) - a))) <= (deg * Math.PI / 180) / 2;
Object.assign(WT_SKILLS, {
  ax_hook: {
    name: '引き裂き', kind: 'axe', cd: 10.8, motion: 'axe_hook', duration: T.axe_hook.duration,
    motionOf: (W) => (W.br('ax_hook') === 'B' ? 'ax_hook_twin' : 'axe_hook'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('ax_hook') >= 2 ? 3.6 : 2.8, b = W.br('ax_hook'), deg = b === 'A' ? 360 : 110;
      at(c, T.axe_hook.hits[0], () => { c.arc(b === 'A' ? 6 : 4.6, deg, 1, { type: 'tskill', a, tech: 'axe_hook', stun: 2 }); c.fx.slash(c.me.x, c.me.z, a, b === 'A' ? 6 : 4.6, deg, c.col(), 1.0); c.sfx('swing'); });
      at(c, T.axe_hook.hits[1], () => { c.arc(3.5, 120, m, { type: 'tskill', a, stun: 9 }); c.fx.slash(c.me.x, c.me.z, a, 3.5, 120, c.col(), 1.6); c.sfx('impact'); c.shake(0.3); });
      if (b === 'B') at(c, TREE_MOTIONS.ax_hook_twin.hits[2], () => { c.arc(3.5, 120, 1.5, { type: 'tskill', a, stun: 5 }); c.fx.ringWave(c.me.x + Math.sin(a) * 2, c.me.z + Math.cos(a) * 2, c.col(), 2.6, 0.3); c.sfx('impact'); c.shake(0.35); });
    },
  },
  ax_return: {
    name: '返り刃', kind: 'axe', cd: 10.8, motion: 'axe_return', duration: T.axe_return.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('ax_return') >= 2 ? 1.9 : 1.5, b = W.br('ax_return'), sx = c.me.x, sz = c.me.z;
      const far = spOff(sx, sz, a, 8), wait = b === 'B' ? 1.5 : 0;
      at(c, T.axe_return.hits[0], () => {
        c.proj({ a, mult: m, speed: 20, life: 0.4, rad: 1.3, shape: 'axe', type: 'tskill' });
        if (b === 'A') for (const d of [-0.35, 0.35]) c.proj({ a: a + d, mult: m * 0.5, speed: 20, life: 0.4, rad: 1.1, shape: 'axe', type: 'tskill' });
      });
      if (b === 'B') for (let k = 0; k < 5; k++) at(c, T.axe_return.hits[0] + 0.4 + k * 0.3, () => { c.circle(far.x, far.z, 2.2, 0.4, { type: 'tskill', stun: 1 }); c.fx.slash(far.x, far.z, k * 1.3, 2.2, 200, c.col(), 0.7); });
      at(c, T.axe_return.hits[1] + wait, () => c.proj({ a: a + Math.PI, mult: m, speed: 20, life: 0.4, rad: 1.3, shape: 'axe', type: 'tskill', sx: far.x, sz: far.z }));
    },
  },
  ax_stomp: {
    name: 'ウォーストンプ', kind: 'axe', cd: 12, motion: 'ax_stomp', duration: TREE_MOTIONS.ax_stomp.duration,
    run(c) {
      const W = c.wt(), m = W.lv('ax_stomp') >= 2 ? 2.3 : 1.8, b = W.br('ax_stomp'), r = b === 'B' ? 7.5 : 5;
      const quake = (mult, stun, rr) => { c.circle(c.me.x, c.me.z, rr, mult, { type: 'tskill', stun }); c.fx.ringWave(c.me.x, c.me.z, 0xd8b080, rr + 1, 0.45); c.fx.parts.burst(c.me.x, 0.3, c.me.z, 60, { color: 0xb89870, speed: 8, size: 0.6, life: 0.7, up: 2 }); c.sfx('heavy'); c.shake(0.5); };
      at(c, TREE_MOTIONS.ax_stomp.hits[0], () => quake(m, 22, r));
      if (b === 'A') at(c, TREE_MOTIONS.ax_stomp.hits[0] + 1, () => quake(1.0, 8, r));
    },
  },
  ax_exec: {
    name: '処刑斬', kind: 'axe', cd: 13.2, motion: 'axe_execute', duration: T.axe_execute.duration,
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('ax_exec') >= 2 ? 4.2 : 3.4, b = W.br('ax_exec');
      at(c, T.axe_execute.hits[0], () => {
        const low = (t) => (t.hp <= t.mhp * 0.3 ? 2 : 1);
        if (b === 'B') { for (const t of c.targets(c.me.x, c.me.z, 4.5)) if (inFront(c, t, a, 150)) c.hit(t, m * 0.7 * low(t), { type: 'tskill', stun: 10 }); c.fx.slash(c.me.x, c.me.z, a, 4.5, 150, c.col(), 2); }
        else { const t = c.nearest(4.2); if (t) { c.hit(t, m * low(t), { type: 'tskill', stun: 16 }); c.fx.slash(c.me.x, c.me.z, a, 4, 75, c.col(), 2); if (b === 'A' && t.hp <= 0) c.resetCd('ax_exec'); } }
        c.sfx('impact'); c.shake(0.4);
      });
    },
  },
  ax_lust: {
    name: 'ブラッドラスト', kind: 'axe', cd: 21.6, motion: 'ax_lust', duration: TREE_MOTIONS.ax_lust.duration,
    run(c) {
      const W = c.wt(), lv2 = W.lv('ax_lust') >= 2, b = W.br('ax_lust');
      if (b === 'A') c.pay(0.15);
      c.buff('ax_lust', 'ブラッドラスト', b === 'B' ? 12 : 8, { atkp: lv2 ? 20 : 15, vamp: lv2 ? 8 : 5, ...(b === 'A' ? { aspd: 20 } : {}) }, 0xff3a3a);
      c.fx.ringWave(c.me.x, c.me.z, 0xff3a3a, 3, 0.4); c.fx.parts.burst(c.me.x, 1.2, c.me.z, 30, { color: 0xff3a3a, speed: 4, size: 0.5, life: 0.6, gravity: -2 });
      c.sfx('roar');
    },
  },
  ax_rush: {
    name: '猛進断', kind: 'axe', cd: 12, motion: 'axe_rush', duration: T.axe_rush.duration,
    motionOf: (W) => (W.br('ax_rush') === 'B' ? 'ax_rush_twin' : 'axe_rush'),
    run(c) {
      const W = c.wt(), a = c.aim(), m = W.lv('ax_rush') >= 2 ? 4.0 : 3.2, b = W.br('ax_rush'), sx = c.me.x, sz = c.me.z;
      c.buff('ax_rush', '猛進', 0.4, { dr: 30 }, 0xd8b080);
      c.dash(a, 5, 0.28, 0);
      if (b === 'A') at(c, 0.28, () => c.line(5, 2, 1.0, { type: 'tskill', a, sx, sz, stun: 2 }));
      at(c, T.axe_rush.hits[0], () => { c.arc(3.5, 120, m, { type: 'tskill', a, tech: 'axe_rush', stun: 10 }); c.fx.slash(c.me.x, c.me.z, a, 3.5, 120, c.col(), 2); c.sfx('impact'); c.shake(0.4); });
      if (b === 'B') at(c, TREE_MOTIONS.ax_rush_twin.hits[1], () => { c.circle(c.me.x, c.me.z, 3, 2.0, { type: 'tskill', stun: 6 }); c.fx.ringWave(c.me.x, c.me.z, 0xd8b080, 3.6, 0.35); c.fx.parts.burst(c.me.x, 0.3, c.me.z, 40, { color: 0xb89870, speed: 7, size: 0.5, life: 0.6, up: 2 }); c.sfx('heavy'); c.shake(0.45); });
    },
  },
});
for (const [id, s] of Object.entries(WT_SKILLS)) s.desc = WT_NODE[id].base;
