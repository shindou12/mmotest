extends RefCounted
## 技の文脈（基底クラス）。元は public/js/game/actions.js の buildCombat が技に渡す戦闘文脈 c。
## 技（強攻撃・武器スキル・ツリースキル）は「文脈のメソッドを呼ぶ関数」で、メソッドの名前と引数は JavaScript と同じ。
## オプションは JavaScript と同じキーの Dictionary で渡す。
## この基底クラスは、呼ばれた操作を _op(名前, 引数の配列) に集めるだけで何もしない。
##   - 照合用の文脈: tests/skills_golden.gd が _op を上書きして書き留める（元の test/golden/skill-trace.mjs の recorder と同じ）
##   - ゲームの文脈: 次の作業で _op を実際の処理につなぐ
## JavaScript の可変個の引数は、GDScript では末尾の省略できる引数（null）で受け、_args が末尾の null を落として配列にする
## （JavaScript 側で「渡さなかった」引数と同じ長さの列にするため。途中の null は残る）。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

## 自分（プレイヤー）: x・z・a（向き）・hp・iframe など。技が c.me.a = a のように直接書き換えることがある
var me: Dictionary = {"x": 0.0, "z": 0.0, "a": 0.0, "hp": 80.0, "iframe": 0.0}
## c.fx（slash・ringWave・lightning・flash など。parts は fx.parts）
var fx: Fx


func _init() -> void:
	fx = Fx.new(self)


## 呼ばれた操作を受ける。サブクラスが上書きする（name は "arc"・"fx.slash"・"parts.burst" のような JavaScript の呼び名）
func _op(_name: String, _args: Array):
	return null


## 末尾の null を落とした引数の配列（JavaScript で渡さなかった引数を除く）
static func _args(a: Array) -> Array:
	var r := a.duplicate()
	while not r.is_empty() and r[r.size() - 1] == null:
		r.pop_back()
	return r


# ---- 読み取り（値を返す） ----
func aim() -> float: return 0.0
func col() -> int: return 0xcfd3da
## 武器ツリーの効果 W（wtree.gd の WtEff）。ツリーのないスキルでは null
func wt(): return null
## 状態 S: { wt, wk, flags（Array）, mhp }
func S() -> Dictionary: return {"wt": wt(), "wk": null, "flags": [], "mhp": 100.0}
func point() -> Dictionary: return {"x": 0.0, "z": 0.0}
func targets(_x = null, _z = null, _r = null) -> Array: return []
func nearest(_r = null): return null
func area() -> String: return ""
func range(): return 12.0
func zone() -> Array: return [6.0, 10.0]
func reach(_normal = null): return 1.0
## 時刻（JavaScript の now() = performance.now() / 1000）と乱数（Math.random の代わり）
func now() -> float: return 0.0
func rnd(a: float = 0.0, b: float = 1.0) -> float: return a + 0.5 * (b - a)


## sec 秒後に fn を呼ぶ
func later(sec: float, fn: Callable) -> void:
	_op("later", [sec])
	fn.call()   # 基底クラスはすぐ呼ぶ（待ち行列は照合用の文脈が持つ）


# ---- 攻撃の形（当たり判定） ----
func arc(r, deg, mult, o = null): return _op("arc", _args([r, deg, mult, o]))
func line(len, w, mult, o = null): return _op("line", _args([len, w, mult, o]))
func circle(x, z, r, mult, o = null): return _op("circle", _args([x, z, r, mult, o]))
func proj(o = null): return _op("proj", _args([o]))
func arrow(o = null): return _op("arrow", _args([o]))
func dash(a, dist, dur, iframe = null): return _op("dash", _args([a, dist, dur, iframe]))
func hit(t, mult, o = null): return _op("hit", _args([t, mult, o]))

# ---- 見た目・音・状態 ----
func sfx(name, opt = null): return _op("sfx", _args([name, opt]))
func text(str, cls = null): return _op("text", _args([str, cls]))
func shake(v): return _op("shake", _args([v]))
func buff(id, label, sec, mods, color): return _op("buff", _args([id, label, sec, mods, color]))
func heal(frac): return _op("heal", _args([frac]))
func resetCd(p1 = null, p2 = null): return _op("resetCd", _args([p1, p2]))
func taunt(r = null): return _op("taunt", _args([r]))

# ---- 武器だけの道具 ----
func primeCharge(v = null): return _op("primeCharge", _args([v]))
func parry(sec = null, pct = null): return _op("parry", _args([sec, pct]))
func poison(p1 = null, p2 = null): return _op("poison", _args([p1, p2]))
func bleed(p1 = null, p2 = null, p3 = null): return _op("bleed", _args([p1, p2, p3]))
func ambush(p1 = null): return _op("ambush", _args([p1]))
func pay(p1 = null, p2 = null): return _op("pay", _args([p1, p2]))
func trap(p1 = null, p2 = null, p3 = null): return _op("trap", _args([p1, p2, p3]))


## c.fx と c.fx.parts（呼び名は "fx.slash"・"parts.burst" のように _op に渡る）
class Fx extends RefCounted:
	var c
	var parts: Parts

	func _init(ctx) -> void:
		c = ctx
		parts = Parts.new(ctx)

	func slash(x, z, a, r, deg, color, w = null, flip = null): return c._op("fx.slash", c._args([x, z, a, r, deg, color, w, flip]))
	func ringWave(x, z, color, r, t, p6 = null, p7 = null): return c._op("fx.ringWave", c._args([x, z, color, r, t, p6, p7]))
	func lightning(x, z, color, p4 = null): return c._op("fx.lightning", c._args([x, z, color, p4]))
	func flash(p1 = null, p2 = null, p3 = null, p4 = null): return c._op("fx.flash", c._args([p1, p2, p3, p4]))


class Parts extends RefCounted:
	var c

	func _init(ctx) -> void:
		c = ctx

	func burst(x, y, z, n, o = null): return c._op("parts.burst", c._args([x, y, z, n, o]))
	func emit(x, y, z, o = null): return c._op("parts.emit", c._args([x, y, z, o]))
