// 砂塵の大蠍 スコルピオの技ごとの動き（データだけ）。再生は models/boss-motion.js、書き方は bosses/graz-motion.js と同じ
// 時刻は秒。サーバーの予兆（sim/bosses/skorpio.js）の発動時刻に、尾を突き出す・鋏を閉じる瞬間を合わせてある。
// 鋏は 0 が左・1 が右。arm.rotation.y で開く（左は −・右は +）／閉じる。尾は根元（scorpionTail.rotation.x）で振る（+ で頭の上から前へ突き出す、− で後ろへ引く）
const N = {
  'body.position.y': 0, 'body.rotation.x': 0, 'scorpionTail.rotation.x': 0,
  'scorpionClaws.0.arm.rotation.y': 0, 'scorpionClaws.1.arm.rotation.y': 0, 'scorpionClaws.0.arm.rotation.x': 0, 'scorpionClaws.1.arm.rotation.x': 0,
};
const open = { 'scorpionClaws.0.arm.rotation.y': -0.5, 'scorpionClaws.1.arm.rotation.y': 0.5, 'scorpionClaws.0.arm.rotation.x': -0.25, 'scorpionClaws.1.arm.rotation.x': -0.25 };
const shut = { 'scorpionClaws.0.arm.rotation.y': 0.25, 'scorpionClaws.1.arm.rotation.y': -0.25, 'scorpionClaws.0.arm.rotation.x': 0.12, 'scorpionClaws.1.arm.rotation.x': 0.12 };
const tailBack = { 'scorpionTail.rotation.x': -0.5, 'body.rotation.x': -0.08 }; // 尾を後ろへ引く
const tailStab = { 'scorpionTail.rotation.x': 0.65, 'body.rotation.x': 0.1 }; // 尾を前へ突き出す
const SUNK = -1.7; // 潜ったときの深さ（体の大きさの倍率がかかる前の値）

export const SKORPIO_MOTIONS = {
  // 尾の一突き（0.85 秒で突く）
  sting: { dur: 1.2, keys: [[0, N], [0.62, tailBack], [0.85, tailStab], [1.0, {}], [1.2, N]] },
  // 尾の三連突き（0.85 / 1.3 / 1.75 秒）
  sting3: {
    dur: 2.1,
    keys: [[0, N], ...[0, 1, 2].flatMap((k) => [[0.62 + k * 0.45, tailBack], [0.85 + k * 0.45, tailStab]]), [1.9, {}], [2.1, N]],
  },
  // 鋏の挟み撃ち（1.0 秒）: 開いて、閉じながら前へ
  pincer: { dur: 1.4, keys: [[0, N], [0.75, { ...open, 'body.rotation.x': -0.06 }], [1.0, { ...shut, 'body.rotation.x': 0.12 }], [1.2, {}], [1.4, N]] },
  // 突進（1.25 秒の溜め → 走る）: 身を低くして鋏を前へ
  charge: { dur: 1.9, keys: [[0, N], [1.0, { ...open, 'body.rotation.x': 0.14, 'scorpionTail.rotation.x': 0.25 }], [1.25, { ...shut, 'body.rotation.x': 0.2 }], [1.7, {}], [1.9, N]] },
  // 砂の雨（共通の技）: 尾を振り上げて揺らす
  rain: { dur: 1.3, keys: [[0, N], [0.4, { 'scorpionTail.rotation.x': -0.45 }], [0.6, { 'scorpionTail.rotation.x': -0.2 }], [0.8, { 'scorpionTail.rotation.x': -0.45 }], [1.1, {}], [1.3, N]] },
  // 毒針の刻印: 尾を高く掲げ、狙った人へ毒針を向ける
  stack: { dur: 1.2, keys: [[0, N], [0.45, { 'scorpionTail.rotation.x': -0.45, 'body.rotation.x': -0.12 }], [0.7, { 'scorpionTail.rotation.x': 0.3, 'body.rotation.x': 0 }], [1.0, {}], [1.2, N]] },
  // 潜行（長さはサーバーが決める: 沈む 0.5 秒 → 追う 4 秒 → 飛び出す 0.9 秒 → 立て直す 0.7 秒）
  burrow: {
    dur: 6.1, stretch: true, hide: [[0.45, 5.4, 'sigil'], [0.45, 5.4, 'aura']],
    keys: [[0, N], [0.5, { ...shut, 'body.position.y': SUNK, 'body.rotation.x': 0.2 }], [5.3, {}],
      [5.45, { ...open, 'body.position.y': 0.25, 'body.rotation.x': -0.3, 'scorpionTail.rotation.x': -0.4 }], [5.8, { 'body.position.y': 0, 'body.rotation.x': 0 }], [6.1, N]],
  },
  // 大砂嵐（詠唱）: 身を丸め、尾を高く掲げて震わせる。詠唱が終わるか止められるまで続ける
  storm: {
    dur: 2.0, hold: true,
    keys: [[0, N], [0.6, { ...shut, 'body.rotation.x': 0.15, 'scorpionTail.rotation.x': -0.55 }], [0.8, { 'scorpionTail.rotation.x': -0.45 }], [1.0, { 'scorpionTail.rotation.x': -0.58 }],
      [1.2, { 'scorpionTail.rotation.x': -0.45 }], [1.4, { 'scorpionTail.rotation.x': -0.58 }], [1.6, { 'scorpionTail.rotation.x': -0.47 }], [2.0, { 'scorpionTail.rotation.x': -0.55 }]],
  },
};
