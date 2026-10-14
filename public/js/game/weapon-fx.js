// 武器ごとの効果の差し込み口（フック）
//
// 武器ツリーのクラス・マスター・パッシブの効果は、武器ごとのファイル（game/weapons/*.js）が
// registerWeaponFx で「どの場面で何をするか」を登録する。戦闘・被弾・能力値などの処理は、
// ここを通して登録された効果を順に呼ぶだけで、武器の名前やノードの id を知らない。
//
// 効果は全武器のものを呼ぶ（各効果は、自分のクラス・ノードが有効なときだけ働く）。
// こうしておくと、武器を持ち替えた直後に残っているバフや設置物（旗・罠など）も、これまでどおり働く。
//
// 呼び方（場面ごとに決まっている）
//   fxCall(name, ...args)          全部呼ぶ
//   fxSome(name, ...args)          どれかが true を返したらそこで止めて true（横取り・打ち消し）
//   fxReduce(name, acc, ...args)   acc を順に受け渡して変える（倍率・加算・置き換え）
//
// 呼ぶ順番: 基本は登録した順（weapons/index.js の並び）。もとの処理の順を保つために、
// 場面によっては ORDER で武器の順を決めている（倍率を掛ける順で、小数の端数まで同じ値になる）。
const LIST = [];
const CACHE = new Map();
const ORDER = {
  dmgMult: ['dagger', 'bow', 'axe', 'spear', 'greatsword', 'sword'],
  critAdd: ['greatsword', 'bow'],
  onHit: ['sword', 'spear', 'dagger', 'greatsword'],
  onHurtFirst: ['spear'],
  onHurt: ['axe', 'sword'],
  onGuard: ['spear', 'sword'],
  heavy: ['greatsword', 'axe'],
  heavyStart: ['spear', 'dagger', 'bow'],
  aura: ['bow', 'axe', 'spear', 'dagger', 'sword'],
  justDodge: ['sword', 'dagger', 'greatsword'],
  incoming: ['sword', 'axe'],
  swingLate: ['sword', 'dagger'],
  afterCast: ['sword', 'bow'],
};

export function registerWeaponFx(wk, hooks) {
  LIST.push({ wk, hooks });
  CACHE.clear();
}
function fns(name) {
  let f = CACHE.get(name);
  if (f) return f;
  const order = ORDER[name];
  const rank = (wk) => { const i = order ? order.indexOf(wk) : -1; return i < 0 ? 1e3 + LIST.findIndex((e) => e.wk === wk) : i; };
  f = LIST.filter((e) => typeof e.hooks[name] === 'function').sort((a, b) => rank(a.wk) - rank(b.wk)).map((e) => e.hooks[name]);
  CACHE.set(name, f);
  return f;
}
export function fxCall(name, ...args) { for (const f of fns(name)) f(...args); }
export function fxSome(name, ...args) { for (const f of fns(name)) if (f(...args)) return true; return false; }
export function fxReduce(name, acc, ...args) { for (const f of fns(name)) acc = f(acc, ...args); return acc; }
