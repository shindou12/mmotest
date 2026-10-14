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
  // 短剣・千本: 3段目でナイフを3本、手首で投げる
  dk_thousand: m('dk_thousand', 'dagger', 0.32, [0.1], 'throw3'),
  // 短剣・影渡り: すり抜けたあと、くるりと振り向く
  dk_step_turn: m('dk_step_turn', 'dagger', 0.3, [0.18], 'pivot'),
  // 大剣・光波: 振りかぶって前へ振り抜き、光波を飛ばす
  gt_wave: m('gt_wave', 'greatsword', 0.55, [0.12], 'lightwave'),
  // 盾槍・竜騎士（強攻撃）: 沈み込んで高く跳び、槍を真下へ向けて突き降りる
  sp_jump: m('sp_jump', 'spear', 0.85, [0.55], 'dive'),
  // 盾槍・シールドバッシュ: 盾を前へ叩きつける（A「連打」は2回・B「盾突進」は踏み込んでから）
  sp_bash: m('sp_bash', 'spear', 0.45, [0.08], 'bash'),
  sp_bash_twin: m('sp_bash_twin', 'spear', 0.65, [0.08, 0.36], 'bash'),
  sp_bash_rush: m('sp_bash_rush', 'spear', 0.5, [0.16], 'bashrush'),
  // 盾槍・挑発: 盾を槍で打ち鳴らして叫ぶ
  sp_taunt: m('sp_taunt', 'spear', 0.6, [0.2], 'clang'),
  // 盾槍・足払いA「大回し」: 低く一回転して薙ぐ
  sp_sweep_spin: m('sp_sweep_spin', 'spear', 0.75, [0.3], 'lowspin'),
  // 盾槍・扇突きA「竜爪」: 跳び上がってから三方へ突き降ろす
  sp_fan_leap: m('sp_fan_leap', 'spear', 0.75, [0.22, 0.31, 0.4], 'fanleap'),
  // 大斧・引き裂きB「叩き伏せ」: 引き寄せて叩いたあと、もう一度振り下ろす
  ax_hook_twin: m('ax_hook_twin', 'axe', 1.05, [0.22, 0.55, 0.85], 'hooktwin'),
  // 大斧・ウォーストンプ: 片足を高く上げて踏み下ろす
  ax_stomp: m('ax_stomp', 'axe', 0.6, [0.3], 'stomp'),
  // 大斧・ブラッドラスト: 斧を掲げて吼える
  ax_lust: m('ax_lust', 'axe', 0.6, [0.25], 'roar'),
  // 大斧・猛進断B「二段」: 叩き斬ってから、足元へもう一度叩きつける
  ax_rush_twin: m('ax_rush_twin', 'axe', 1.0, [0.32, 0.62], 'rushtwin'),
  // 大斧・投斧（強攻撃）: 振りかぶって斧を投げる
  ax_throw: m('ax_throw', 'axe', 0.5, [0.18], 'axethrow'),
  // 分岐で形が変わる技の動き
  // 大剣・横一文字A「大薙ぎ」: 体ごと大きくひねって、ほぼ一周を薙ぐ
  gt_broad_wide: m('gt_broad_wide', 'greatsword', 0.85, [0.32], 'broadwide'),
  // 短剣・影縫いA「三本縫い」: 腕を横に払いながら3本を扇に投げる
  dk_pin_fan: m('dk_pin_fan', 'dagger', 0.6, [0.18], 'pinfan'),
  // 盾槍・杭打ちB「三連杭」: 右・正面・左へ順に杭を打ち込む
  sp_stake_tri: m('sp_stake_tri', 'spear', 0.85, [0.28, 0.43, 0.58], 'staketri'),
  // 大斧・引き裂きA「大引き」: 一回転して周りを引っかけてから叩く
  ax_hook_spin: m('ax_hook_spin', 'axe', 0.9, [0.22, 0.55], 'hookspin'),
  // 大斧・返り刃A「双刃」: 腕を大きく横へ振って3本を放つ
  ax_return_tri: m('ax_return_tri', 'axe', 0.85, [0.23, 0.63], 'returntri'),
  // 大斧・処刑斬B「薙ぎ処刑」: 振り下ろさずに、前を大きく横へ薙ぐ
  ax_exec_sweep: m('ax_exec_sweep', 'axe', 1.0, [0.48], 'execsweep'),
});
