// 武器ツリー（weapon-tree.js）用のモーション。技（techniques.js）と同じ形で、長さと当たる時刻を持つ
// 姿勢は technique-motion.js が作る（style か、専用のキーフレーム）。サーバーはこの一覧で他プレイヤーへのモーション名を確かめる
const m = (id, kind, duration, hits, style) => Object.freeze({ id, kind, duration, hits: Object.freeze(hits), style });
export const TREE_MOTIONS = Object.freeze({
  // 片手剣・守護騎士: ガードで受けてから離すと、踏み込みながら大きく横に斬り払う
  sw_counter: m('sw_counter', 'sword', 0.62, [0.2], 'riposte'),
  // 大剣・カウンター: 見切った直後、下からすくい上げて斬り返す（すばやく）
  gt_riposte: m('gt_riposte', 'greatsword', 0.6, [0.14], 'gtriposte'),
  // 大剣・グランド・スラム: しゃがんで跳び、空中で振りかぶって叩きつける
  gt_slam: m('gt_slam', 'greatsword', 0.8, [0.36], 'slam'),
  // 片手剣・スラントラッシュ: 踏み込みながら左右交互に3回斬る（B「旋」は最後に一回転）
  sw_slant: m('sw_slant', 'sword', 0.62, [0.08, 0.28, 0.48], 'slant'),
  sw_slant_spin: m('sw_slant_spin', 'sword', 0.95, [0.08, 0.28, 0.48, 0.72], 'slantspin'),
  // 片手剣・ブレイブハート: 剣を高く掲げる
  sw_brave: m('sw_brave', 'sword', 0.6, [0.25], 'brave'),
  // 片手剣・空裂斬A「三日月」: 大きく横に振り抜いて3方向へ飛ばす
  sw_aircut_fan: m('sw_aircut_fan', 'sword', 0.62, [0.18], 'fan3'),
  // 片手剣・霞返しA「霞斬り」: 長く跳んで、低い姿勢から斬り返す
  sw_side_long: m('sw_side_long', 'sword', 0.8, [0.36], 'sidelong'),
  // 大剣・払い上げA「返し斬り」: 斬り上げたあと、そのまま振り下ろす
  gt_rising_twin: m('gt_rising_twin', 'greatsword', 0.9, [0.25, 0.55], 'risingtwin'),
  // 短剣・ポイズン・エッジ: 左手で刃に毒を塗って振り払う
  dk_poison: m('dk_poison', 'dagger', 0.6, [0.25], 'coat'),
  // 短剣・スモーク・ステップ: 煙玉を足元に叩きつけて後ろへ跳ぶ
  dk_smoke: m('dk_smoke', 'dagger', 0.55, [0.1], 'smoke'),
  // 短剣・抜け駆けA「返し抜け」: すり抜けて斬り、逆へもう一度抜けて斬る
  dk_flank_twin: m('dk_flank_twin', 'dagger', 0.85, [0.23, 0.63], 'flanktwin'),
  // 短剣・裂傷連舞B「血風」: 回りながら二度斬る
  dk_bleed_spin: m('dk_bleed_spin', 'dagger', 0.6, [0.15, 0.33], 'bleedspin'),
  // 短剣・瞬影（強攻撃）: 低く構えて駆け抜けながら斬る
  dk_blink: m('dk_blink', 'dagger', 0.45, [0.16], 'blink'),
  // 大剣・光波: 振りかぶって前へ振り抜き、光波を飛ばす
  gt_wave: m('gt_wave', 'greatsword', 0.55, [0.12], 'lightwave'),
});
