// 霧の大樹 ユグドラの技ごとの動き（データだけ）。再生は models/boss-motion.js、書き方は bosses/graz-motion.js と同じ
// 時刻は秒。サーバーの予兆（sim/bosses/yugdra.js・sim/boss-patterns.js）の発動時刻に、腕を叩きつける瞬間を合わせてある
const N = {
  'body.rotation.x': 0, 'body.rotation.y': 0, 'treeCrown.rotation.x': 0,
  'arms.0.rotation.x': 0, 'arms.1.rotation.x': 0, 'arms.0.rotation.z': 0, 'arms.1.rotation.z': 0,
};
// 両腕を振り上げる／地面へ叩きつける
const raise = { 'arms.0.rotation.x': -2.4, 'arms.1.rotation.x': -2.4, 'arms.0.rotation.z': -0.25, 'arms.1.rotation.z': 0.25, 'body.rotation.x': -0.18, 'treeCrown.rotation.x': -0.08 };
const slam = { 'arms.0.rotation.x': 0.55, 'arms.1.rotation.x': 0.55, 'arms.0.rotation.z': 0, 'arms.1.rotation.z': 0, 'body.rotation.x': 0.3, 'treeCrown.rotation.x': 0.1 };

export const YUGDRA_MOTIONS = {
  // 根の奔流（溜め 1.6 秒）: ゆっくり振り上げ、通路へ叩きつける
  torrent: { dur: 2.2, keys: [[0, N], [1.2, raise], [1.5, {}], [1.62, slam], [1.9, {}], [2.2, N]] },
  // 回る奔流（1.2 / 2.1 / 3.0 / 3.9 秒）: 叩きつけるたびに次の通路へ 90° 向きを変える。一周の続きの -2π で止める
  wheel: {
    dur: 4.7,
    keys: [[0, N], ...[0, 1, 2, 3].flatMap((k) => [
      [1.2 + k * 0.9 - 0.45, { ...raise, 'body.rotation.y': -k * Math.PI / 2 }],
      [1.2 + k * 0.9, { ...slam, 'body.rotation.y': -k * Math.PI / 2 }],
    ]), [4.4, { ...N, 'body.rotation.y': -Math.PI * 2 }], [4.7, { ...N, 'body.rotation.y': -Math.PI * 2 }]],
  },
  // 枝払い（1.5 秒）: 両腕を横に広げて溜め、外へ払う
  nova: {
    dur: 2.0, sp: true,
    keys: [[0, N], [1.1, { 'arms.0.rotation.z': 1.2, 'arms.1.rotation.z': -1.2, 'arms.0.rotation.x': -0.4, 'arms.1.rotation.x': -0.4, 'body.rotation.x': -0.1 }], [1.4, {}],
      [1.55, { 'arms.0.rotation.z': -1.4, 'arms.1.rotation.z': 1.4, 'arms.0.rotation.x': -1.2, 'arms.1.rotation.x': -1.2, 'body.rotation.x': 0.15 }], [1.8, {}], [2.0, N]],
  },
  // 樹冠の雨（1.2 秒）: 腕を掲げて樹冠を揺らし、雨を降らせる
  rain: {
    dur: 1.8, sp: true,
    keys: [[0, N], [0.6, { ...raise, 'arms.0.rotation.x': -2.0, 'arms.1.rotation.x': -2.0 }], [0.8, { 'treeCrown.rotation.x': 0.12 }], [1.0, { 'treeCrown.rotation.x': -0.12 }], [1.2, { 'treeCrown.rotation.x': 0.1 }], [1.5, {}], [1.8, N]],
  },
  // 根の波（0.6 秒に叩きつけ → 波が部屋を横切る）: 片腕を振りかぶって地面を叩き、波を送り出す
  ripple: {
    dur: 1.6,
    keys: [[0, N], [0.45, { 'arms.1.rotation.x': -2.6, 'arms.1.rotation.z': 0.3, 'body.rotation.x': -0.15, 'body.rotation.y': 0.25 }],
      [0.6, { 'arms.1.rotation.x': 0.7, 'arms.1.rotation.z': 0, 'body.rotation.x': 0.3, 'body.rotation.y': -0.15, 'treeCrown.rotation.x': 0.1 }], [1.2, {}], [1.6, N]],
  },
  // 胞子の野（大技）: 両腕を高く掲げて樹冠を大きく震わせ、胞子をまき散らす
  spores: {
    dur: 1.6,
    keys: [[0, N], [0.4, { ...raise, 'arms.0.rotation.x': -2.8, 'arms.1.rotation.x': -2.8, 'arms.0.rotation.z': -0.6, 'arms.1.rotation.z': 0.6, 'body.rotation.x': -0.25 }],
      [0.6, { 'treeCrown.rotation.x': 0.18 }], [0.8, { 'treeCrown.rotation.x': -0.18 }], [1.0, { 'treeCrown.rotation.x': 0.15 }], [1.2, { 'treeCrown.rotation.x': -0.1 }], [1.6, N]],
  },
  // 吸い上げ（根瘤が切られるまで）: 両腕を大きく広げたまま、樹冠を反らす
  drain: {
    dur: 1.0, hold: true,
    keys: [[0, N], [1.0, { 'arms.0.rotation.z': 1.1, 'arms.1.rotation.z': -1.1, 'arms.0.rotation.x': -0.9, 'arms.1.rotation.x': -0.9, 'body.rotation.x': -0.2, 'treeCrown.rotation.x': -0.15 }]],
  },
};
