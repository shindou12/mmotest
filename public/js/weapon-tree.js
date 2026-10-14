// 武器ツリー（新）: 武器熟練度でポイントを得て、その武器を持っているときだけ効く
//
// - 熟練度は、その武器を装備して経験値を得ると上がる（最大20）。熟練度1つにつき1ポイント
// - ほかの武器も「過去の最大熟練度の半分」から始まる
// - 段は熟練度 1 / 3 / 6 / 9 / 12 / 16 で開く
// - スキル・パッシブは3lvまで。lv1 は「ある無しが大きい」、lv2 は「伸びが感じられる」、
//   lv3 は lv2 の数値のまま A/B どちらかの形に変わる
// - クラス（3つから1つ）・マスター（クラスごとに2つから1つ）は1ポイント。強化・分岐なし（コード上は ks1 / ks2）
// 今は片手剣・大剣・短剣。ほかの武器は旧ツリー（skills.js の TREES）のまま
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
export const WTREES = { sword: SWORD, greatsword: GREATSWORD, dagger: DAGGER };
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
for (const [id, s] of Object.entries(WT_SKILLS)) s.desc = WT_NODE[id].base;
