// 技の動き（モーション）のデータ。形（style）ごとの姿勢を登録する。動きの計算は technique-motion.js
//
// 姿勢は「腕・体の少数のつまみ」で表す（BASE が基本の姿勢。書かないつまみは BASE のまま）
//   yaw/pitch: 武器の向き / bodyYaw: 体のひねり / lean: 前のめり / x,y,z: 右手の位置 / guard: 左手の構え
//   lift: 体の浮き / leg: 足の開き / draw: 弓の引き具合
//
// 新しい動きを足すとき
//   STYLES[形] = { pose: [振りかぶり, 当たり] }        どの当たりも同じ姿勢
//   STYLES[形] = { hits: [[振りかぶり, 当たり], ...] }  当たりごとの姿勢（1回目・2回目…。足りないときは最後のものを使う）
//     技（shared/techniques.js・shared/tree-motions.js）の hits の各時刻で、この2つの姿勢を通る
//   KEYFRAMES[形] = [{ at: 秒, ...つまみ }, ...]   時刻と姿勢を自分で並べる（STYLES より優先）
export const BASE={yaw:0,pitch:.25,bodyYaw:0,lean:0,x:.3,y:1.24,z:.28,guard:0,lift:0,leg:0,draw:0};
// Distinct authored silhouettes built from a small set of continuous rig parameters.（データだけ。計算は technique-motion.js）
export const STYLES={
 parry:{pose:[{pitch:1.25,z:.2,guard:1},{pitch:.05,z:.56,bodyYaw:.12,leg:.2}]},
 aircut:{pose:[{yaw:-.9,pitch:.8,bodyYaw:-.3},{yaw:.55,pitch:.05,bodyYaw:.2,z:.5}]},
 sideturn:{pose:[{yaw:1.2,pitch:.15,lean:-.08},{yaw:-.8,pitch:.1,bodyYaw:-.45,leg:.2}]},
 dance:{pose:[{pitch:.3,guard:.4},{pitch:1.4,y:1.5,z:.18,bodyYaw:.15,guard:1}]},
 guillotine:{pose:[{pitch:1.55,y:1.72,z:.18,lean:-.12},{pitch:-.45,y:1.13,z:.5,lean:.22,leg:.35}]},
 rising:{pose:[{pitch:-.6,y:1,z:.4,lean:.16},{pitch:1.2,y:1.64,z:.28,lean:-.06,leg:.25}]},
 broad:{pose:[{yaw:-1.3,pitch:.05,bodyYaw:-.5},{yaw:1.3,pitch:.05,bodyYaw:.6,z:.45,leg:.2}]},
 recoil:{pose:[{pitch:1.4,y:1.65,z:.12,lean:-.1},{pitch:-.1,y:1.16,z:.52,lean:.15}]},
 siege:{pose:[{pitch:.4,y:1.35,guard:.4},{pitch:.9,y:1.52,z:.18,lean:.1,guard:1,leg:.3}]},
 fanthrust:{hits:[[{yaw:-.5,z:.22},{yaw:-.5,pitch:0,z:.56,bodyYaw:-.2,leg:.12}],[{yaw:0,z:.22},{yaw:0,pitch:0,z:.56,bodyYaw:0,leg:.12}],[{yaw:.5,z:.22},{yaw:.5,pitch:0,z:.56,bodyYaw:.2,leg:.12}]]},
 lowsweep:{pose:[{yaw:-1.2,pitch:-.35,y:1.08},{yaw:1.1,pitch:-.35,y:.98,x:.5,z:.18,bodyYaw:.65,lean:.2}]},
 shieldpress:{pose:[{pitch:0,z:.18,guard:1,lean:.12},{pitch:0,z:.48,guard:1,lean:.23,leg:.3}]},
 stake:{pose:[{pitch:1.3,y:1.6,z:.14},{pitch:-.65,y:1.08,z:.5,lean:.22,guard:.4}]},
 intercept:{pose:[{pitch:0,z:.22,guard:1},{pitch:0,z:.55,guard:1,leg:.15}]},
 flank:{pose:[{yaw:1.4,pitch:.2,bodyYaw:.35,y:1.15},{yaw:-.85,pitch:0,z:.47,bodyYaw:-.35,lean:.13}]},
 vital:{pose:[{pitch:0,z:.12,y:1.08,lean:.1},{pitch:0,z:.57,y:1.08,lean:.22,leg:.22}]},
 bleed:{hits:[[{yaw:-1,pitch:.5,y:1.16},{yaw:.85,pitch:-.25,bodyYaw:.3,z:.46}],[{yaw:1,pitch:-.5,y:1.16},{yaw:-.85,pitch:.25,bodyYaw:-.3,z:.46}]]},
 pin:{pose:[{pitch:1.1,z:.18,y:1.55},{pitch:.05,z:.54,y:1.4,bodyYaw:.25,guard:.3}]},
 quicken:{pose:[{yaw:.3,pitch:.2,z:.18},{yaw:-.6,pitch:.4,guard:.8,lean:.12,leg:.35}]},
 hook:{hits:[[{yaw:.75,pitch:-.1,z:.48},{yaw:-.85,pitch:-.1,z:.15,bodyYaw:-.3}],[{pitch:1.2,y:1.65,z:.16},{pitch:-.3,z:.51,lean:.2,leg:.2}]]},
 execute:{pose:[{pitch:1.65,y:1.75,z:.16,bodyYaw:-.2},{pitch:-.5,z:.51,y:1.12,lean:.25,leg:.3}]},
 return:{hits:[[{yaw:-.6,pitch:1,y:1.6},{yaw:.2,pitch:.15,z:.53,bodyYaw:.3}],[{pitch:.05,z:.53},{pitch:.8,z:.23,bodyYaw:-.15}]]},
 blood:{pose:[{yaw:-1.5,pitch:.15,bodyYaw:-.6},{yaw:1.25,pitch:.15,bodyYaw:.5,z:.48,guard:.3}]},
 rush:{pose:[{pitch:.1,z:.3,lean:.2},{pitch:-.35,z:.55,lean:.28,leg:.4}]},
 double:{hits:[[{draw:1,bodyYaw:0},{draw:0,bodyYaw:0}],[{draw:1,bodyYaw:.08},{draw:0,bodyYaw:-.1}],[{draw:1,bodyYaw:.08},{draw:0,bodyYaw:-.1}]]},
 tether:{pose:[{draw:1,lean:.03},{draw:0,lean:-.05}]},
 sideshot:{hits:[[{draw:1,lift:.1,leg:.3},{draw:0,lift:.12,bodyYaw:-.1}],[{draw:1,lift:.1,leg:.3},{draw:0,lift:.12,bodyYaw:.18}],[{draw:1,lift:.1,leg:.3},{draw:0,lift:.12,bodyYaw:.18}]]},
 trap:{pose:[{draw:.8,lean:.18,lift:-.1},{draw:0,lean:.25,lift:-.16,guard:.2}]},
 slant:{hits:[[{yaw:-1.1,pitch:.2,bodyYaw:-.35,lean:.1},{yaw:1,pitch:.05,bodyYaw:.4,z:.5,lean:.18,leg:.3}],[{yaw:1.1,pitch:.2,bodyYaw:.35,lean:.1},{yaw:-1,pitch:.05,bodyYaw:-.4,z:.5,lean:.18,leg:.3}],[{yaw:-1.1,pitch:.2,bodyYaw:-.35,lean:.1},{yaw:1,pitch:.05,bodyYaw:.4,z:.5,lean:.18,leg:.3}]]},
 slantspin:{hits:[[{yaw:-1.1,pitch:.2,bodyYaw:-.35,lean:.1},{yaw:1,pitch:.05,bodyYaw:.4,z:.5,lean:.18,leg:.3}],[{yaw:1.1,pitch:.2,bodyYaw:.35,lean:.1},{yaw:-1,pitch:.05,bodyYaw:-.4,z:.5,lean:.18,leg:.3}],[{yaw:-1.1,pitch:.2,bodyYaw:-.35,lean:.1},{yaw:1,pitch:.05,bodyYaw:.4,z:.5,lean:.18,leg:.3}],[{yaw:-1.2,pitch:.1,bodyYaw:-.6,guard:.3,lean:.05},{yaw:1.1,pitch:.1,bodyYaw:5.883185307179586,z:.5,lean:.15,leg:.3}]]},
 risingtwin:{hits:[[{pitch:-.6,y:1,z:.4,lean:.16},{pitch:1.2,y:1.64,z:.28,lean:-.06,leg:.25}],[{pitch:1.5,y:1.74,z:.16,lean:-.14,leg:.2},{pitch:-.45,y:1.12,z:.5,lean:.24,leg:.35}]]},
 coat:{pose:[{pitch:.95,y:1.32,z:.32,guard:1,bodyYaw:-.1},{yaw:.7,pitch:.15,bodyYaw:.3,z:.48,guard:.2,lean:.08}]},
 flanktwin:{hits:[[{yaw:1.4,pitch:.2,bodyYaw:.35,y:1.15},{yaw:-.85,pitch:0,z:.47,bodyYaw:-.35,lean:.13}],[{yaw:-1.4,pitch:.2,bodyYaw:-.35,y:1.15},{yaw:.85,pitch:0,z:.47,bodyYaw:.35,lean:.13}]]},
 bleedspin:{hits:[[{yaw:-1,pitch:.3,bodyYaw:-.4,y:1.16},{yaw:.9,pitch:-.2,bodyYaw:3.141592653589793,z:.46,lean:.1}],[{yaw:-.9,pitch:.25,bodyYaw:3.541592653589793,y:1.16},{yaw:.9,pitch:-.2,bodyYaw:5.983185307179586,z:.46,lean:.1,leg:.3}]]},
 blink:{pose:[{yaw:-1.25,pitch:.2,bodyYaw:-.3,lean:.35,y:1.05,leg:.4},{yaw:1.3,pitch:.05,bodyYaw:.5,lean:.3,z:.5,leg:.4}]},
 throw3:{pose:[{yaw:-.5,pitch:1,y:1.5,z:.12,bodyYaw:-.3},{yaw:.35,pitch:.05,y:1.3,z:.56,bodyYaw:.25,lean:.12}]},
 brave:{pose:[{pitch:.4,y:1.3,z:.3,guard:.3},{pitch:1.55,y:1.78,z:.12,lean:-.12,guard:1}]},
 fan3:{pose:[{yaw:-1.45,pitch:.15,bodyYaw:-.6,z:.25},{yaw:1.45,pitch:.15,bodyYaw:.65,z:.52,lean:.12,leg:.25}]},
 sidelong:{pose:[{yaw:1.3,pitch:.15,lean:-.12,bodyYaw:.3,leg:.35},{yaw:-.95,pitch:.1,bodyYaw:-.55,z:.5,lean:.2,leg:.3}]},
 lightwave:{pose:[{pitch:1.5,y:1.72,z:.16,lean:-.15},{pitch:-.05,y:1.3,z:.6,lean:.28,leg:.4}]},
 riposte:{pose:[{yaw:-1.35,pitch:.05,bodyYaw:-.55,y:1.12,z:.2,guard:.6,lean:-.04},{yaw:1.45,pitch:.12,bodyYaw:.75,z:.52,lean:.18,leg:.38}]},
 gtriposte:{pose:[{yaw:-.95,pitch:-.55,y:1,z:.34,bodyYaw:-.45,lean:.12},{yaw:.75,pitch:1.15,y:1.62,z:.3,bodyYaw:.5,lean:-.1,leg:.35}]},
 bash:{pose:[{pitch:.2,z:.18,guard:1,lean:-.1,bodyYaw:-.5},{pitch:.1,z:.3,guard:1,lean:.35,bodyYaw:.35,leg:.5}]},
 bashrush:{pose:[{pitch:.15,z:.15,guard:1,lean:.3,leg:.45,y:1.1},{pitch:.1,z:.32,guard:1,lean:.38,bodyYaw:.15,leg:.5}]},
 clang:{pose:[{pitch:1.2,y:1.6,z:.2,guard:1,lean:-.12},{pitch:.3,y:1.35,z:.35,guard:1,lean:.05,leg:.2}]},
 lowspin:{pose:[{yaw:-1.2,pitch:-.35,y:1.08,bodyYaw:-.4},{yaw:1.1,pitch:-.35,y:.98,x:.5,z:.18,bodyYaw:5.983185307179586,lean:.2,leg:.3}]},
 hooktwin:{hits:[[{yaw:.75,pitch:-.1,z:.48},{yaw:-.85,pitch:-.1,z:.15,bodyYaw:-.3}],[{pitch:1.2,y:1.65,z:.16},{pitch:-.3,z:.51,lean:.2,leg:.2}],[{pitch:1.6,y:1.78,z:.12,lean:-.15,bodyYaw:.2},{pitch:-.55,y:1.08,z:.52,lean:.3,leg:.4}]]},
 roar:{pose:[{pitch:.6,y:1.4,z:.25,lean:.1},{pitch:1.5,y:1.8,z:.1,lean:-.25,guard:1,leg:.25}]},
 rushtwin:{hits:[[{pitch:.1,z:.3,lean:.2},{pitch:-.35,z:.55,lean:.28,leg:.4}],[{pitch:1.4,y:1.7,z:.14,lean:-.1,bodyYaw:-.25},{pitch:-.6,y:1.05,z:.48,lean:.32,leg:.45,bodyYaw:.15}]]},
 axethrow:{pose:[{yaw:.4,pitch:1.5,y:1.75,z:.05,lean:-.2,bodyYaw:-.35},{yaw:-.1,pitch:.1,y:1.35,z:.6,lean:.25,bodyYaw:.3,leg:.35}]},
 broadwide:{pose:[{yaw:-1.6,pitch:.05,bodyYaw:-1,lean:-.05,leg:.2},{yaw:1.6,pitch:.05,bodyYaw:1.15,z:.48,lean:.15,leg:.4}]},
 pinfan:{pose:[{yaw:-1.2,pitch:.35,y:1.35,z:.2,bodyYaw:-.45},{yaw:1,pitch:.1,y:1.3,z:.56,bodyYaw:.4,lean:.12,leg:.2}]},
 staketri:{hits:[[{yaw:.4,pitch:.35,y:1.38,z:.3,bodyYaw:.2,lean:.1},{yaw:.4,pitch:-.45,y:1.15,z:.48,bodyYaw:.2,lean:.22,leg:.2}],[{yaw:0,pitch:.35,y:1.38,z:.3,bodyYaw:0,lean:.1},{yaw:0,pitch:-.45,y:1.15,z:.48,bodyYaw:0,lean:.22,leg:.2}],[{yaw:-.4,pitch:.35,y:1.38,z:.3,bodyYaw:-.2,lean:.1},{yaw:-.4,pitch:-.45,y:1.15,z:.48,bodyYaw:-.2,lean:.22,leg:.2}]]},
 hookspin:{hits:[[{yaw:.9,pitch:-.05,z:.45,bodyYaw:-.5},{yaw:-.6,pitch:-.05,z:.4,bodyYaw:5.883185307179586,lean:.1,leg:.25}],[{pitch:1.2,y:1.65,z:.16,bodyYaw:6.283185307179586},{pitch:-.3,z:.51,lean:.2,leg:.2,bodyYaw:6.283185307179586}]]},
 returntri:{hits:[[{yaw:-1.3,pitch:.5,y:1.45,bodyYaw:-.6},{yaw:1.2,pitch:.1,z:.55,bodyYaw:.55,lean:.1}],[{pitch:.05,z:.53},{pitch:.8,z:.23,bodyYaw:-.15}]]},
 execsweep:{pose:[{yaw:-1.5,pitch:.15,y:1.25,bodyYaw:-.8,lean:-.05},{yaw:1.4,pitch:0,y:1.15,z:.5,bodyYaw:.85,lean:.2,leg:.4}]},
 backshot:{pose:[{draw:1,lean:-.18,lift:.18,bodyYaw:-.1},{draw:0,lean:-.24,lift:.26,bodyYaw:.08}]},
 chime:{pose:[{draw:.3,guard:1},{draw:0,bodyYaw:-.2,lean:-.1,guard:1}]},
};
export const DEFAULT_STYLE={pose:[{},{z:.5}]};
// 一回転で終わる動き（旋）は、最後の向きを一周ぶんにして巻き戻らないようにする
export const FULL_TURN=new Set(['slantspin','bleedspin','lowspin','hookspin']);
// 時刻と姿勢を並べた動き。跳んで叩きつける（グランド・スラム）: しゃがむ → 跳び上がって振りかぶる → 着地と同時に叩きつけ → 残心
export const KEYFRAMES={
 pivot:[{at:0,bodyYaw:Math.PI,yaw:-.8,pitch:.2,lean:.1},{at:.18,bodyYaw:.3,yaw:.5,pitch:.1,z:.45,lean:.15,leg:.3},{at:.3}],
 smoke:[{at:0},{at:.08,pitch:-.35,y:1.0,z:.32,lean:.22,lift:-.1,leg:.3},{at:.22,pitch:.6,y:1.45,z:.2,lean:-.35,lift:.55,leg:-.3,guard:.6},{at:.4,pitch:.3,y:1.25,lean:-.1,lift:.08,leg:.2},{at:.55}],
 dive:[{at:0},{at:.1,pitch:.4,y:1.3,z:.22,lift:-.18,lean:.2,leg:.4},{at:.28,pitch:1.3,y:1.72,z:.16,lift:1.35,lean:-.22,leg:-.3},{at:.44,pitch:-1.2,y:1.5,z:.42,lift:1.0,lean:.35,leg:-.1},{at:.55,pitch:-1.3,y:1.1,z:.5,lift:0,lean:.32,leg:.45},{at:.7,pitch:-1.2,y:1.12,z:.48,lift:-.08,lean:.25,leg:.35},{at:.85}],
 fanleap:[{at:0},{at:.08,pitch:.3,z:.2,lift:-.12,leg:.35},{at:.2,pitch:.6,y:1.5,z:.2,lift:.9,lean:-.1,leg:-.2},{at:.24,yaw:-.5,pitch:-.6,z:.55,lift:.5,lean:.3},{at:.32,yaw:0,pitch:-.6,z:.58,lift:.2,lean:.3},{at:.4,yaw:.5,pitch:-.6,z:.55,lift:0,lean:.3,leg:.35},{at:.75}],
 stomp:[{at:0},{at:.12,pitch:.5,y:1.4,z:.25,lean:-.12,lift:.12,leg:-.6},{at:.24,pitch:.7,y:1.45,z:.22,lean:-.18,lift:.2,leg:-.75},{at:.3,pitch:.2,y:1.2,z:.35,lean:.2,lift:-.12,leg:.5},{at:.45,pitch:.2,y:1.22,z:.33,lean:.15,lift:-.08,leg:.4},{at:.6}],
 fullshot:[{at:0,draw:1,lean:.04},{at:.04,draw:0,lean:-.2,bodyYaw:.18,lift:.04},{at:.18,draw:0,lean:-.1,bodyYaw:.1},{at:.4}],
 chimeleap:[{at:0},{at:.1,draw:.3,guard:1},{at:.2,draw:0,bodyYaw:-.2,lean:-.1,guard:1},{at:.4,draw:0,lean:-.3,lift:.35,guard:.5},{at:.6,lean:-.1,lift:.05},{at:.75}],
 slam:[{at:0},{at:.09,pitch:.9,y:1.32,z:.2,lift:-.16,lean:.18,leg:.35},{at:.22,pitch:1.55,y:1.74,z:.16,lift:1.15,lean:-.18,leg:-.25},{at:.36,pitch:-.5,y:1.1,z:.52,lift:0,lean:.26,leg:.4},{at:.52,pitch:-.45,y:1.1,z:.5,lift:-.06,lean:.22,leg:.35},{at:.8}],
};
