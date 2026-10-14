// 中心の処理（戦闘 combat・被弾 hurt・能力値 stats・毎フレーム loop）が使う外の道具の入れ物（ポート）
//
// 中心の処理は、具体的なモジュール（state・render・net-client など）を直接 import せず、ここの入れ物を通して使う。
// 中身は組み立て役（game/wiring.js）が起動のときに差し込む。差し替えれば、描画や通信なしで中心の処理だけを動かすこともできる。
// 入れ物は役目ごとに分けてある（必要なものだけを読む）:
//   state   ゲームの状態（自分・敵・仲間・入力・セーブ・設定）
//   stats   能力値（S は計算し直されるので、使うたびに stats.S を読む）とバフ
//   view    見た目（three.js の描画・カメラ・モデル・エフェクト・音・名札）
//   screen  画面への知らせ（トースト・文字・HUD）
//   link    サーバーとのやりとり
//   field   エリア（地面の高さ・地形・ワープ）
//   rules   ほかの中心の処理（攻撃・被弾・入力・武器ツリー・称号・アイテム）
export const state = {}, stats = {}, view = {}, screen = {}, link = {}, field = {}, rules = {};
const PORTS = { state, stats, view, screen, link, field, rules };
// impls: { 入れ物の名前: { 道具の名前: 中身 } }。getter（書き換わる値）はそのまま getter として差し込む
export function wirePorts(impls) {
  for (const [name, impl] of Object.entries(impls)) Object.defineProperties(PORTS[name], Object.getOwnPropertyDescriptors(impl));
}
