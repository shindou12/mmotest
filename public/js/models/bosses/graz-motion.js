// コボルド王 グラズの技ごとの動き（データだけ）。再生は models/boss-motion.js
// 時刻は秒。サーバーの予兆（sim/bosses/graz.js・sim/boss-patterns.js）の発動時刻に振り下ろしが合うようにしてある。
//   keys: [時刻, { '部位.rotation.x': 値, 'aim.pitch': 刃の上下, 'aim.yaw': 刃の左右, ... }]
//         書いていない値は直前のキーを引き継ぐ。最初と最後は構え（N）
//   sp: true … 段階で速くなる技（暴走中は 0.9 倍の時間）
//   hide: [[開始, 終了, '部位'], ...] … その間だけ消す（大剣投げで手から剣が離れる）
const N = {
  'body.rotation.x': 0, 'body.rotation.y': 0, 'body.position.y': 0, 'head.rotation.x': 0,
  'arm.rotation.x': -0.3, 'arm.rotation.z': 0, 'guardArm.rotation.x': 0, 'guardArm.rotation.z': 0,
  'aim.pitch': 1.27, 'aim.yaw': 0, // 構えの刃の向き（前へ、少し上向き）
};
// 振りかぶり（刃は頭の後ろ）と振り下ろし（刃は前の地面へ）
const up = { 'arm.rotation.x': -2.9, 'arm.rotation.z': 0.15, 'body.rotation.x': -0.25, 'head.rotation.x': -0.3, 'guardArm.rotation.x': -0.4, 'aim.pitch': -0.5, 'aim.yaw': 0 };
const down = { 'arm.rotation.x': 0.5, 'arm.rotation.z': 0, 'body.rotation.x': 0.4, 'body.position.y': -0.15, 'head.rotation.x': 0.2, 'aim.pitch': 2.2, 'aim.yaw': 0 };
const AIM = { node: 'weaponModel', grip: 'grip', ref: 'body' };
const m = (o) => ({ aim: AIM, ...o });

export const GRAZ_MOTIONS = {
  // 登場の大剣投げ（予兆 1.3 秒）
  throw: m({
    dur: 1.8, hide: [[1.12, 1.75, 'weaponModel']],
    keys: [[0, N], [0.8, { 'body.rotation.y': 0.7, 'body.rotation.x': -0.15, 'arm.rotation.x': -2.9, 'arm.rotation.z': 0.5, 'guardArm.rotation.x': -0.6, 'head.rotation.x': -0.1, 'aim.pitch': -0.6, 'aim.yaw': 0.4 }],
      [1.02, {}], [1.18, { 'body.rotation.y': -0.5, 'body.rotation.x': 0.3, 'arm.rotation.x': 0.5, 'arm.rotation.z': 0.2, 'aim.pitch': 1.6 }], [1.6, { 'body.rotation.x': 0.15, 'arm.rotation.x': 0.2 }], [1.8, N]],
  }),
  // 叩きつけ（1.1 秒）
  slam: m({ dur: 1.45, sp: true, keys: [[0, N], [0.75, up], [1.0, {}], [1.12, down], [1.3, {}], [1.45, N]] }),
  // 薙ぎ払い（0.95 秒）: 剣の側の後ろから、正面を通って盾の側へ水平に
  cone: m({
    dur: 1.4, sp: true,
    keys: [[0, N], [0.7, { 'body.rotation.y': 0.9, 'arm.rotation.x': -1.2, 'arm.rotation.z': 0.9, 'aim.pitch': 1.6, 'aim.yaw': 2.3 }], [0.88, {}],
      [1.0, { 'body.rotation.y': -0.9, 'arm.rotation.x': -1.3, 'arm.rotation.z': 0.4, 'aim.pitch': 1.6, 'aim.yaw': -1.0 }], [1.15, {}], [1.4, N]],
  }),
  // 突進（予兆 1.0 秒 → 0.25 秒で駆け抜ける）: 盾を前に構えて低く、剣は脇に
  charge: m({
    dur: 1.45, sp: true,
    keys: [[0, N], [0.8, { 'body.rotation.x': 0.35, 'body.position.y': -0.2, 'guardArm.rotation.x': -1.3, 'guardArm.rotation.z': -0.3, 'arm.rotation.x': -0.4, 'aim.pitch': 2.0, 'aim.yaw': 1.2 }],
      [1.0, {}], [1.05, { 'body.rotation.x': 0.5 }], [1.25, {}], [1.45, N]],
  }),
  // 3連斬り（0.75 / 1.17 / 1.59 秒）
  combo: m({
    dur: 1.9, sp: true,
    keys: [[0, N], [0.55, { ...up, 'body.rotation.y': 0.2 }], [0.78, { ...down, 'body.rotation.y': -0.3 }],
      [0.97, { ...up, 'body.rotation.y': 0.3, 'body.position.y': 0 }], [1.2, { ...down, 'body.rotation.y': 0.3 }],
      [1.39, { ...up, 'body.rotation.y': -0.2, 'body.position.y': 0 }], [1.62, { ...down, 'body.rotation.x': 0.45, 'body.rotation.y': 0 }], [1.9, N]],
  }),
  // ブレス（照準 1.0 秒 → 弾）: 大きく息を吸って、前へ吐き出す
  breath: m({
    dur: 1.6, sp: true,
    keys: [[0, N], [0.8, { 'body.rotation.x': -0.35, 'head.rotation.x': -0.6, 'arm.rotation.x': -0.6, 'guardArm.rotation.x': -0.3, 'aim.pitch': 1.9, 'aim.yaw': 0.8 }], [0.95, {}],
      [1.05, { 'body.rotation.x': 0.35, 'head.rotation.x': 0.4 }], [1.4, {}], [1.6, N]],
  }),
  // 王の裁き（向きを合わせる 2.0 秒 + 固定 0.75 秒 → 発動 → 通り道から横へ亀裂が順に弾ける）:
  // 大剣を天へ掲げて溜め、一気に振り下ろし、刺した剣をさらに押し込む
  judge: m({
    dur: 4.25,
    keys: [[0, N], [0.6, { 'arm.rotation.x': -3.1, 'arm.rotation.z': 0.2, 'body.rotation.x': -0.3, 'head.rotation.x': -0.45, 'guardArm.rotation.x': -0.8, 'guardArm.rotation.z': -0.4, 'aim.pitch': 0.05, 'aim.yaw': 0 }],
      [2.6, { 'body.rotation.x': -0.38 }], [2.8, { ...down, 'arm.rotation.x': 0.8, 'body.rotation.x': 0.5, 'body.position.y': -0.25, 'guardArm.rotation.x': 0, 'guardArm.rotation.z': 0, 'aim.pitch': 2.3 }],
      [3.1, { 'body.position.y': -0.18, 'body.rotation.x': 0.4 }], [3.35, { 'body.position.y': -0.35, 'body.rotation.x': 0.6, 'head.rotation.x': 0.45, 'aim.pitch': 2.5 }],
      [3.9, {}], [4.25, N]],
  }),
  // 暴走・回転斬り（1.1 秒）→ 大きな隙（剣先を地面に落としてうなだれる）。一周して終わるので体の向きは -2π で止める
  spin: m({
    dur: 3.3,
    keys: [[0, N], [0.85, { 'body.rotation.y': 1.4, 'arm.rotation.x': -0.5, 'arm.rotation.z': 1.3, 'body.rotation.x': -0.1, 'body.position.y': -0.1, 'aim.pitch': 1.6, 'aim.yaw': 1.6 }], [1.0, {}],
      [1.25, { 'body.rotation.y': 1.4 - Math.PI * 2 }],
      [1.5, { 'body.rotation.y': -Math.PI * 2, 'arm.rotation.x': 0.5, 'arm.rotation.z': 0.2, 'body.rotation.x': 0.55, 'body.position.y': -0.25, 'head.rotation.x': 0.4, 'aim.pitch': 2.6, 'aim.yaw': 0.4 }],
      [2.9, {}], [3.3, { ...N, 'body.rotation.y': -Math.PI * 2 }]],
  }),
  // 暴走・叩き斬り（1.0 秒）→ 大きな隙（剣が地面に刺さったまま）
  cleave: m({
    dur: 3.0,
    keys: [[0, N], [0.75, { ...up, 'arm.rotation.x': -3.0, 'body.rotation.x': -0.35, 'body.rotation.y': 0.2 }], [0.92, {}],
      [1.04, { ...down, 'arm.rotation.x': 0.9, 'body.rotation.x': 0.65, 'body.position.y': -0.3, 'head.rotation.x': 0.3, 'body.rotation.y': -0.1, 'aim.pitch': 2.6 }],
      [2.6, {}], [3.0, N]],
  }),
  // 詠唱（近衛兵召集 4 秒）: 大剣を天へ掲げ、盾を横へ開く
  cast: m({
    dur: 4.0,
    keys: [[0, N], [0.6, { 'arm.rotation.x': -3.0, 'arm.rotation.z': -0.2, 'head.rotation.x': -0.5, 'body.rotation.x': -0.15, 'guardArm.rotation.z': -0.6, 'aim.pitch': 0, 'aim.yaw': 0 }],
      [3.7, {}], [4.0, N]],
  }),
};
