extends RefCounted
## 武器ごとの効果の差し込み口（フック）。元は public/js/game/weapon-fx.js（registerWeaponFx・fxCall・fxSome・fxReduce と order）。
##
## 武器のクラス・マスター・パッシブの効果は、武器ごとのファイル（combat/fx_sword.gd・fx_greatsword.gd）が register で
## 「どの場面で何をするか」を登録する。戦闘・被弾・能力値などの処理は、ここを通して登録された効果を順に呼ぶだけ。
## 効果は全武器のものを呼ぶ（各効果は、自分のクラス・ノードが有効なときだけ働く）。
##
## 呼び方（場面ごとに決まっている。JavaScript の可変個の引数は、GDScript では引数の配列 args で渡す）
##   fx_call(name, args)          全部呼ぶ
##   fx_some(name, args)          どれかが true（JavaScript の真偽。null・false・0 は偽）を返したらそこで止めて true
##   fx_reduce(name, acc, args)   acc を順に受け渡して変える（倍率・加算・置き換え）
## 呼ぶ順: 基本は登録した順（weapons/index.js の並び = 片手剣・大剣・短剣・盾槍・大斧・弓）。場面ごとの順（order）を書いた武器はそれが先。
## order が書いていない場面は、登録した順で、順の付いたものより後（1000 + 登録の番号）。同じ順どうしは登録した順のまま（安定）。
## 効果をまだ移していない武器は、登録の番号（順）だけ同じにするため空の登録をする（register_placeholders）。
## 効果（Callable）は register の hooks に「場面の名前 → Callable」の辞書で渡す。引数の数は呼び出し側（JavaScript の呼び出し）と同じにそろえる。

## 登録の一覧: [{ wk, hooks: {名前: Callable}, order: {名前: 順} }]
static var LIST: Array = []
## 名前 → 呼ぶ Callable の並び（順に並べ替えたもの）
static var CACHE: Dictionary = {}
## 効果の持ち主（Callable は持ち主を数えないので、ここで生かしておく）
static var KEEP: Array = []

const WEAPON_ORDER := ["sword", "greatsword", "dagger", "spear", "axe", "bow"]


static func clear() -> void:
	LIST.clear()
	CACHE.clear()
	KEEP.clear()


## weapon-fx.js registerWeaponFx。order: { 場面: 順 } 小さいほど先に呼ぶ
static func register(wk: String, hooks: Dictionary, order: Dictionary = {}) -> void:
	LIST.append({"wk": wk, "hooks": hooks, "order": order})
	CACHE.clear()


## 効果を移していない武器の空の登録（呼ぶ順の番号を元と同じにする）。登録済みの武器は飛ばす。
## 登録の並びは WEAPON_ORDER（weapons/index.js の並び）にそろえる（武器の install を呼ぶ順に関わらず、順の番号は元と同じ）
static func register_placeholders() -> void:
	for wk in WEAPON_ORDER:
		var found := false
		for e in LIST:
			if e["wk"] == wk: found = true
		if not found: register(wk, {})
	# 安定な挿入ソート（WEAPON_ORDER の順）
	for i in range(1, LIST.size()):
		var x = LIST[i]
		var j := i - 1
		while j >= 0 and WEAPON_ORDER.find(LIST[j]["wk"]) > WEAPON_ORDER.find(x["wk"]):
			LIST[j + 1] = LIST[j]
			j -= 1
		LIST[j + 1] = x
	CACHE.clear()


## weapon-fx.js fns: name の効果を呼ぶ順に並べたもの
static func _fns(name: String) -> Array:
	if CACHE.has(name): return CACHE[name]
	var items := []
	for i in LIST.size():
		var e: Dictionary = LIST[i]
		if e["hooks"].has(name) and e["hooks"][name] is Callable:
			var rank: float = float(e["order"][name]) if e["order"].has(name) else 1000.0 + i
			items.append({"rank": rank, "fn": e["hooks"][name]})
	# 安定な挿入ソート（JavaScript の sort は安定）
	for i in range(1, items.size()):
		var x = items[i]
		var j := i - 1
		while j >= 0 and items[j]["rank"] > x["rank"]:
			items[j + 1] = items[j]
			j -= 1
		items[j + 1] = x
	var fns := []
	for it in items: fns.append(it["fn"])
	CACHE[name] = fns
	return fns


## JavaScript の真偽（null・false・0・"" は偽。空の配列・辞書は真）
static func truthy(v) -> bool:
	if v == null: return false
	if v is bool: return v
	if v is int or v is float: return v != 0 and not is_nan(float(v))
	if v is String: return v != ""
	return true


## weapon-fx.js fxCall
static func fx_call(name: String, args: Array = []) -> void:
	for f in _fns(name): f.callv(args)


## weapon-fx.js fxSome
static func fx_some(name: String, args: Array = []) -> bool:
	for f in _fns(name):
		if truthy(f.callv(args)): return true
	return false


## weapon-fx.js fxReduce
static func fx_reduce(name: String, acc, args: Array = []):
	for f in _fns(name): acc = f.callv([acc] + args)
	return acc
