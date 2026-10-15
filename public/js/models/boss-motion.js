// ボスの技ごとの動きの再生（どのボスでも共通）。動きのデータは BOSS_MODELS[外観].motions（例: bosses/graz-motion.js）
// act: { p: 技の名前, age: 始まってからの秒数, sp: 速さの倍率（sp の付いた技だけ時間を縮める）, d: 長さ（stretch の技だけ） }
// キー 'aim.pitch' / 'aim.yaw' は武器の向き（体から見た刃の向き。pitch: 0=真上 π/2=水平 π=真下、yaw: 0=正面 +π/2=剣の腕の側）。
//   motion.aim = { node: 武器, grip: 握り, ref: 体 } の部位名で指定する
import * as THREE from 'three';
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const BLEND_IN = 0.12; // 始まりは、その時点の姿勢から滑らかにつなぐ

// 'arm.rotation.x' → [部位, 'rotation', 'x']
const pathCache = new Map();
const parse = (path) => { let p = pathCache.get(path); if (!p) { p = path.split('.'); pathCache.set(path, p); } return p; };
const target = (u, path) => { const [part, a, b] = parse(path); const o = u[part]?.[a]; return o && b in o ? [o, b] : null; };

// キーの値を時刻で補間（書いていない値は直前のキーを引き継ぐ）
function sample(keys, t) {
  const pose = {};
  let prev = null;
  for (const [at, vals] of keys) {
    const full = { ...(prev?.full || {}), ...vals };
    if (t <= at) {
      if (!prev) return full;
      const k = smooth((t - prev.at) / Math.max(1e-6, at - prev.at));
      for (const key of Object.keys(full)) { const a = prev.full[key] ?? full[key]; pose[key] = a + (full[key] - a) * k; }
      return pose;
    }
    prev = { at, full };
  }
  return prev.full;
}

// 動きを当てる。終わっていたら false
export function applyBossMotion(u, motion, act) {
  if (!motion) return false;
  const scale = motion.stretch && act.d ? act.d / motion.dur : motion.sp ? act.sp || 1 : 1;
  const t = act.age / scale;
  if (!(t >= 0) || t > motion.dur) return false;
  const pose = sample(motion.keys, t);
  const w = smooth(t / BLEND_IN);
  for (const [path, v] of Object.entries(pose)) {
    const tg = target(u, path);
    if (tg) tg[0][tg[1]] = w >= 1 ? v : tg[0][tg[1]] + (v - tg[0][tg[1]]) * w;
  }
  if (motion.aim && pose['aim.pitch'] != null) aimWeapon(u, motion.aim, pose['aim.pitch'], pose['aim.yaw'] || 0, w);
  for (const [a, b, part] of motion.hide || []) if (u[part]) u[part].visible = !(t >= a && t < b);
  return true;
}

// 武器の刃（ローカル +Y）を、体から見た向き (pitch, yaw) に向ける
const Y = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion();
function aimWeapon(u, aim, pitch, yaw, w) {
  const wp = u[aim.node], grip = u[aim.grip], ref = u[aim.ref];
  if (!wp || !grip || !ref) return;
  if (!u.aimRest) u.aimRest = wp.quaternion.clone();
  dir.set(Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), Math.sin(pitch) * Math.cos(yaw));
  qa.setFromUnitVectors(Y, dir);
  ref.updateWorldMatrix(true, false); grip.updateWorldMatrix(true, false);
  ref.getWorldQuaternion(qb); grip.getWorldQuaternion(qc);
  qc.premultiply(qb.invert()); // 体から見た握りの向き
  qa.premultiply(qc.invert()); // 握りから見た目標の向き
  if (w >= 1) wp.quaternion.copy(qa); else wp.quaternion.slerp(qa, w);
}

// 動きが終わったとき: 動きが触った値を構え（最初のキー）に戻し、消した部位を戻す（普段の動きが触らない値が残らないように）
export function endBossMotion(u, motion) {
  if (!motion) return;
  for (const [path, v] of Object.entries(motion.keys[0][1])) { const tg = target(u, path); if (tg) tg[0][tg[1]] = v; }
  for (const [, , part] of motion.hide || []) if (u[part]) u[part].visible = true;
  if (motion.aim && u.aimRest) u[motion.aim.node]?.quaternion.copy(u.aimRest);
}
