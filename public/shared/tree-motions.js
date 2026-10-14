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
});
