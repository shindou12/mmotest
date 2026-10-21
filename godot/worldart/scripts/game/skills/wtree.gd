extends RefCounted
## 武器ツリー（新）の仕組みのうち、技が読む部分。元は public/js/weapon-tree.js（profOf・profLevel・wtOf・wtSpent・wtLeft・wtCanLearn・wtLearn・wtChoose・wtEffects）。
## 表（WTREES・WT_NODE・PROF_MAX）は data/game.json から読む（export_gamedata.mjs が書く）。手で写さない。
## キャラクター ch は Dictionary { lv, tree, prof, wt }（JavaScript の char と同じ形）。
## 武器ごとの「ツリーが足す能力値」（weapons/<武器>.js の mods）は sword.gd・greatsword.gd。片手剣と大剣の分だけ移してある。

const Common = preload("res://scripts/game/skills/common.gd")
const Sword = preload("res://scripts/game/skills/sword.gd")
const Greatsword = preload("res://scripts/game/skills/greatsword.gd")


static func wtrees() -> Dictionary:
	return Common.game()["wtrees"]


static func wtnode() -> Dictionary:
	return Common.game()["wtnode"]


static func prof_max() -> float:
	return Common.game()["wtConst"]["profMax"]


## weapon-tree.js hasWTree
static func has_wtree(wk: String) -> bool:
	return wtrees().has(wk)


## weapon-tree.js profOf
static func prof_of(ch: Dictionary, wk: String) -> Dictionary:
	if not ch.has("prof") or ch["prof"] == null: ch["prof"] = {}
	if not ch["prof"].has(wk): ch["prof"][wk] = {"lv": 1, "xp": 0}
	return ch["prof"][wk]


## weapon-tree.js profLevel
static func prof_level(ch: Dictionary, wk: String) -> float:
	var best: float = ch["profBest"] if ch.get("profBest") != null else 0.0
	return minf(prof_max(), maxf(maxf(prof_of(ch, wk)["lv"], floorf(best / 2.0)), 1.0))


## weapon-tree.js wtOf
static func wt_of(ch: Dictionary, wk: String) -> Dictionary:
	if not ch.has("wt") or ch["wt"] == null: ch["wt"] = {}
	if not ch["wt"].has(wk): ch["wt"][wk] = {"lv": {}, "br": {}, "ks1": null, "ks2": null}
	return ch["wt"][wk]


## weapon-tree.js wtSpent
static func wt_spent(st: Dictionary) -> float:
	var s := 0.0
	for k in st["lv"]: s += st["lv"][k]
	return s + (1.0 if st["ks1"] != null else 0.0) + (1.0 if st["ks2"] != null else 0.0)


## weapon-tree.js wtLeft
static func wt_left(ch: Dictionary, wk: String) -> float:
	return prof_level(ch, wk) - wt_spent(wt_of(ch, wk))


## weapon-tree.js wtCanLearn
static func wt_can_learn(ch: Dictionary, id: String) -> bool:
	if not wtnode().has(id): return false
	var n: Dictionary = wtnode()[id]
	var st := wt_of(ch, n["wk"])
	if prof_level(ch, n["wk"]) < n["req"] or wt_left(ch, n["wk"]) <= 0: return false
	if n["kind"] == "ks1": return st["ks1"] == null
	if n["kind"] == "ks2": return st["ks2"] == null and st["ks1"] == n.get("from")
	return st["lv"].get(id, 0) < 3


## weapon-tree.js wtLearn
static func wt_learn(ch: Dictionary, id: String) -> bool:
	if not wt_can_learn(ch, id): return false
	var n: Dictionary = wtnode()[id]
	var st := wt_of(ch, n["wk"])
	if n["kind"] == "ks1" or n["kind"] == "ks2": st[n["kind"]] = id
	else: st["lv"][id] = st["lv"].get(id, 0) + 1
	return true


## weapon-tree.js wtChoose（b は "A" か "B"）
static func wt_choose(ch: Dictionary, id: String, b: String) -> bool:
	if not wtnode().has(id) or (b != "A" and b != "B"): return false
	var n: Dictionary = wtnode()[id]
	var st := wt_of(ch, n["wk"])
	if st["lv"].get(id) != 3 or st["br"].get(id) != null: return false
	st["br"][id] = b
	return true


## weapon-tree.js wtEffects が返す W（lv・br・v・has と st・mods・actives・ks1・ks2）。技の c.wt() はこれ
class WtEff extends RefCounted:
	var st: Dictionary
	var mods: Dictionary = {}
	var actives: Dictionary = {}   # JavaScript の Set（キー = id）
	var ks1
	var ks2
	var nodes: Dictionary

	## W.lv(id): 振ったレベル（0〜3）
	func lv(id: String) -> int:
		return int(st["lv"].get(id, 0))

	## W.br(id): 段階 3 のときだけ選んだ分岐（"A"・"B"）。なければ null
	func br(id: String):
		return st["br"].get(id) if st["lv"].get(id) == 3 else null

	## W.v(id, k): ノードの配列 k の、いまの段階の値（段階 3 は 2 と同じ）
	func v(id: String, k: String) -> float:
		var l := lv(id)
		return nodes[id][k][mini(2, l) - 1] if l > 0 else 0.0

	func has(id: String) -> bool:
		return st["ks1"] == id or st["ks2"] == id


## weapon-tree.js wtEffects。武器ツリーがない武器は null
static func effects(ch: Dictionary, wk: String):
	if not has_wtree(wk): return null
	var st := wt_of(ch, wk)
	var w := WtEff.new()
	w.st = st
	w.nodes = wtnode()
	w.ks1 = st["ks1"]
	w.ks2 = st["ks2"]
	for id in st["lv"].keys():
		if not wtnode().has(id) or not st["lv"][id]: continue
		var n: Dictionary = wtnode()[id]
		if n["kind"] == "skill": w.actives[id] = true
		if n.has("mods"):
			var m: Dictionary = n["mods"][mini(2, int(st["lv"][id])) - 1]
			for k in m: w.mods[k] = w.mods.get(k, 0.0) + m[k]
	match wk:
		"sword": Sword.mods(st, w.br, w.mods)
		"greatsword": Greatsword.mods(st, w.br, w.mods)
		_: push_error("wtree.gd: %s のツリーの mods はまだ移していない" % wk)
	return w
