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
// 各武器が登録のときに場面ごとの順（order）を書いている（倍率を掛ける順で、小数の端数まで同じ値になる）。
// 新しい武器は order を書かなければ、順の付いた武器のあとに呼ばれる（ほかのファイルを直す必要はない）。
const LIST = [];
const CACHE = new Map();

// order: { 場面: 順 } 小さいほど先に呼ぶ。書いていない場面は、登録した順で、順の付いたものより後
export function registerWeaponFx(wk, hooks, order = {}) {
  LIST.push({ wk, hooks, order });
  CACHE.clear();
}
function fns(name) {
  let f = CACHE.get(name);
  if (f) return f;
  const rank = (e) => e.order[name] ?? 1e3 + LIST.indexOf(e);
  f = LIST.filter((e) => typeof e.hooks[name] === 'function').sort((a, b) => rank(a) - rank(b)).map((e) => e.hooks[name]);
  CACHE.set(name, f);
  return f;
}
export function fxCall(name, ...args) { for (const f of fns(name)) f(...args); }
export function fxSome(name, ...args) { for (const f of fns(name)) if (f(...args)) return true; return false; }
export function fxReduce(name, acc, ...args) { for (const f of fns(name)) acc = f(acc, ...args); return acc; }
