// One timing source for authored spear motion, gameplay events and network playback.
// Hit times and recovery phases intentionally retain the existing values.
// thrust: 突きの動きの形（js/spear-motion.js の THRUST_CURVES）
//   stroke: hitAt で突き切って duration で戻す / dash: dashDuration の間は突き出したまま、recovery で戻す
//   repeat: interval ごとに count 回突く（最後以外は repeatScale の深さ、最後は finalRecovery で戻す）
//   pitchFollow: 突き出すほど槍を水平にする（引いているときの上向きの角度）
// sweep: 槍を横に倒して一回転なぎ払う動き（ガードカウンター）
// spin: 槍を振り回して一回転する動き（count 回まわる。ほかのプレイヤーからも回転して見える）
export const SPEAR_TIMINGS = Object.freeze(Object.fromEntries(Object.entries({
  lance: { duration: .45, hitAt: .12, thrust: 'stroke' },
  helix: { duration: .5, hitAt: .06, interval: .08, count: 5, finalRecovery: .18, thrust: 'repeat', repeatScale: .65 },
  piercer: { duration: .5, hitAt: .2, dashDuration: .22, recovery: .28, thrust: 'dash' },
  javelin: { duration: .5, hitAt: .18, thrust: 'stroke', pitchFollow: .18 },
  whirlspear: { duration: .55, hitAt: .08, interval: .16, count: 3, rotationDuration: .48, spin: true },
  whirl: { duration: .55, hitAt: .05, effectInterval: .06, effectCount: 3, rotationDuration: .32, spin: true },
  heavy: { duration: .5, hitAt: .1, dashDuration: .12, thrust: 'stroke' },
  counter: { duration: .95, wind: .45, windAng: 1.9, slash: .32, slashEnd: .77, rest: .18, sweep: true },
}).map(([id, timing]) => [id, Object.freeze(timing)])));
export const repeatHitAt = (timing, index) => timing.hitAt + index * timing.interval;
// 回転して見える動きか（spin の付いた動き）
export const isSpinMotion = (id) => !!(Object.hasOwn(SPEAR_TIMINGS, id ?? '') && SPEAR_TIMINGS[id].spin);
// なぎ払いの動きか（sweep の付いた動き）
export const isSweepMotion = (id) => !!(Object.hasOwn(SPEAR_TIMINGS, id ?? '') && SPEAR_TIMINGS[id].sweep);
