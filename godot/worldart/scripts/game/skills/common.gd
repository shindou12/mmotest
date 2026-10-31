extends RefCounted
## 武器ツリーのスキルが共通で使う道具。元は public/js/weapons/common.js（at・slashAt・spOff・inFront・fwd）と、
## public/js/advanced-skills.js の cast（Q/E の「技」の共通の下ごしらえ）。
## 表（技の長さ・当たる時刻 hits など）は data/game.json から読む（export_gamedata.mjs が public/shared/ から書く）。手で写さない。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

static var G: Dictionary = {}


static func game() -> Dictionary:
	if G.is_empty():
		G = JSON.parse_string(FileAccess.get_file_as_string("res://data/game.json"))
	return G


## shared/techniques.js の TECHNIQUES[id]（T.sword_aircut など）
static func T(id: String) -> Dictionary:
	return game()["techniques"][id]


## shared/tree-motions.js の TREE_MOTIONS[id]
static func TM(id: String) -> Dictionary:
	return game()["treeMotions"][id]


## common.js at
static func at(c, sec: float, fn: Callable) -> void:
	c.later(sec, fn)


## common.js slashAt（JavaScript の { type: 'tskill', a, ...o } と同じ順で o が後から上書きする）
static func slash_at(c, a: float, r: float, deg: float, mult: float, o: Dictionary = {}) -> void:
	var opt := {"type": "tskill", "a": a}
	opt.merge(o, true)
	c.arc(r, deg, mult, opt)
	c.fx.slash(c.me["x"], c.me["z"], a, r, deg, c.col(), 1.6)
	c.sfx("swing", {"heavy": true})


## common.js spOff
static func sp_off(x: float, z: float, a: float, d: float) -> Dictionary:
	return {"x": x + sin(a) * d, "z": z + cos(a) * d}


## common.js inFront
static func in_front(c, t: Dictionary, a: float, deg: float) -> bool:
	var ang := atan2(t["x"] - c.me["x"], t["z"] - c.me["z"])
	return absf(atan2(sin(ang - a), cos(ang - a))) <= (deg * PI / 180.0) / 2.0


## common.js fwd: 向き a へ距離 d 進んだ [dx, dz]
static func fwd(a: float, d: float) -> Array:
	return [sin(a) * d, cos(a) * d]


## 辞書の合成（JavaScript の { ...a, ...b }。b が後から上書き）
static func spread(a: Dictionary, b: Dictionary = {}) -> Dictionary:
	var r := a.duplicate()
	r.merge(b, true)
	return r


## advanced-skills.js の cast の下ごしらえ（tag・schedule・slash・line・arrow・at・buff）。
## 技ごとの switch は、その武器のファイル（sword.gd・greatsword.gd の tech）に書く
class Cast extends RefCounted:
	var c
	var t: Dictionary
	var a: float
	var start: Dictionary
	var tag: Dictionary
	var area

	func _init(ctx, tech: Dictionary) -> void:
		c = ctx
		t = tech
		a = c.aim()
		start = {"x": c.me["x"], "z": c.me["z"]}
		tag = {"type": "tskill", "tech": t["id"]}
		area = c.area()

	static func _spread(x: Dictionary, y: Dictionary) -> Dictionary:
		var r := x.duplicate()
		r.merge(y, true)
		return r

	## schedule: 同じエリアにいるときだけ fn を呼ぶ
	func schedule(delay: float, fn: Callable) -> void:
		c.later(delay, func(): if c.area() == area: fn.call())

	## at: 技の i 番目の当たりの時刻に
	func at(i: int, fn: Callable) -> void:
		schedule(t["hits"][i], fn)

	## slash(mult, r=3.4, deg=140, angle=a, options={})
	func slash(mult: float, r: float = 3.4, deg: float = 140.0, angle = null, options: Dictionary = {}) -> void:
		var ang: float = a if angle == null else angle
		var opt := _spread(tag, {"a": ang})
		opt.merge(options, true)
		c.arc(r, deg, mult, opt)
		c.fx.slash(c.me["x"], c.me["z"], ang, r, deg, c.col(), 1.15)
		c.sfx("swing")

	## line(mult, len=5, w=1.8, angle=a, options={})
	func line(mult: float, length: float = 5.0, w: float = 1.8, angle = null, options: Dictionary = {}) -> void:
		var ang: float = a if angle == null else angle
		var opt := _spread(tag, {"a": ang})
		opt.merge(options, true)
		c.line(length, w, mult, opt)
		var d := 0.7
		while d < length:
			c.fx.parts.emit(c.me["x"] + sin(ang) * d, 1.2, c.me["z"] + cos(ang) * d, {"color": c.col(), "size": 0.42, "life": 0.25, "speed": 1.0, "gravity": 0.0})
			d += 0.5
		c.sfx("swing")

	## buff(seconds, mods)
	func buff(seconds: float, mods: Dictionary) -> void:
		c.buff(t["id"], t["name"], seconds, mods, c.col())
		c.fx.ringWave(c.me["x"], c.me["z"], c.col(), 2.6, 0.35)
