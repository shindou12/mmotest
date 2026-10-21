extends "res://scripts/game/skills/ctx.gd"
## 戦闘の実行環境。元は public/js/game/weapon-api.js が武器の効果に渡す道具（player・field・attack・tree・show・party）と、
## それが使う stats.js（addBuff・hasBuff・buffMod）・combat.js（later・addShake）・tree-effects.js（quietBuff・cutCds・wtEmit）・ports.js の入れ物。
## ダメージの式（damage.gd）と武器の効果（fx_sword.gd・fx_greatsword.gd）は、この環境 api を引数に受けて動く。
##
## 技の文脈（skills/ctx.gd）を土台にする: arc・line・circle・proj・dash・sfx・taunt・fx・fx.parts などは呼ばれた操作を _op に渡すだけ。
##   - 照合用の環境（tests/combat_golden.gd）: _op を上書きして書き留める
##   - ゲームの環境（G1-3b）: _op を実際の処理につなぐ
## ただし flash・lightning は JavaScript の引数の数が技の文脈より多い（flash は 6 つ）ので、fx を作り直している（Fx2）。
## 状態: me（自分）・st（stats.js の S = 計算済みの能力値）・mobs（id → 敵）・pending（later の待ち行列）。いずれも JavaScript の同名の値と同じ形の Dictionary。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const Common = preload("res://scripts/game/skills/common.gd")
const Ctx = preload("res://scripts/game/skills/ctx.gd")

## stats.js の S（Dictionary）。wt は武器ツリーの効果（wtree.gd の WtEff）、W は武器の表（game.json の weapons）
var st: Dictionary = {}
## 敵（id → Dictionary）。JavaScript の state.mobs（Map）と同じ順序
var mobs: Dictionary = {}
## later の待ち行列: [{ at, fn }]
var pending: Array = []
## 武器の効果が足した技の道具（extendCombat。parry・primeCharge など）: 名前 → Callable
var ext: Dictionary = {}
## エリアの形（"open"・"grid"）。屋内（grid）は称号「t_night」が働く
var shape := "open"
## セーブが失われている間はダメージを出さない（characterStore.lost）
var character_lost := false
## 画面の揺れ（combat.js shake）と設定。addShake はオンのときだけ
var shake_v := 0.0
var shake_on := true
## ヒットストップ（rules.hitStop）
var hit_stop := 0.0
## 時刻 ms（JavaScript の performance.now()）。now() = tms / 1000
var tms := 0.0
## 狙いの向き（rules.aimAngle）
var aim_v := 0.0
## 粒の蓄積（tree-effects.js wtAuraAcc）
var wt_aura_acc: Dictionary = {"mom": 0.0, "saint": 0.0, "rev": 0.0, "thunder": 0.0, "soar": 0.0, "bers": 0.0}


func _init() -> void:
	fx = Fx2.new(self)


# ---- 時刻・乱数 ----
func now() -> float: return tms / 1000.0

## Math.random()。ゲームでは randf()、照合では種固定の列
func random() -> float: return randf()

## util.js rnd
func rnd(a: float = 0.0, b: float = 1.0) -> float: return a + random() * (b - a)

func S() -> Dictionary: return st


# ---- 外への出力（サブクラスが書き留める／実際の処理につなぐ）----
## サーバーへの送信（link.net.send）
func net_send(_msg: Dictionary) -> void: pass

## 文字を出す（screen.floatText）
func float_text(x, y, z, text, cls = null): return _op("floatText", _args([x, y, z, text, cls]))

## 呼び出し側から見える「回復」（actions.heal(n, show)）。HP は max HP まで
func heal_player(n: float, show: bool) -> void:
	_op("heal", [n, show])
	me["hp"] = minf(float(st["mhp"]), float(me["hp"]) + n)

func set_hit_stop(v: float) -> void:
	_op("setHitStop", [v])
	hit_stop = v

## 武器スキルの変化が当たった（rules.onVariantHit）
func on_variant_hit(mb: Dictionary, dmg: float, o: Dictionary) -> void:
	_op("onVariantHit", [mb["id"], dmg, o["sv"]["key"]])

## 武器の手の位置（handTracker が作る関数）。ゲームではモデルから求める
func hand_pos(_model) -> Dictionary:
	return {"x": float(me["x"]), "y": 1.1, "z": float(me["z"])}


# ---- weapon-api.js: player ----
## RARITIES[S.wr].color
func weapon_color():
	return Common.game()["rarities"][int(st["wr"])]["color"]

## stats.js addBuff
func add_buff(id: String, label: String, sec: float, mods: Dictionary, color) -> void:
	var keep := []
	for b in me["buffs"]:
		if b["id"] != id: keep.append(b)
	me["buffs"] = keep
	me["buffs"].append({"id": id, "label": label, "t": sec, "max": sec, "mods": mods, "color": color})
	sfx("buff")
	fx.parts.burst(me["x"], 1, me["z"], 30, {"color": color, "speed": 4, "size": 0.4, "life": 0.8, "gravity": 3})
	fx.ringWave(me["x"], me["z"], color, 3, 0.4)

## stats.js hasBuff
func has_buff(id: String) -> bool:
	for b in me["buffs"]:
		if b["id"] == id: return true
	return false

## stats.js buffMod: バフの mods[k] の合計（先頭から順に足す）
func buff_mod(k) -> float:
	var a := 0.0
	if k == null: return a
	for b in me["buffs"]:
		a = a + float(b["mods"].get(k, 0.0))
	return a


# ---- weapon-api.js: field ----
func aim_angle() -> float: return aim_v


# ---- weapon-api.js: attack ----
## combat.js later: 待ち行列に入れる（待ち行列は run_pending で回す）
func later(sec: float, fn: Callable) -> void:
	pending.append({"at": now() + sec, "fn": fn})

## 武器の効果が技の文脈に足す道具（c.parry・c.primeCharge など）
func extend_combat(tools: Dictionary) -> void:
	ext.merge(tools, true)

## combat.js addShake
func add_shake(v: float) -> void:
	if shake_on: shake_v = maxf(shake_v, v)

## 待ち行列を 時刻 → 登録順 で回す（フレームでは使わない。照合・確認用）。run は回した印
func run_pending(limit: int = 500) -> void:
	var guard := 0
	while not pending.is_empty():
		var bi := 0
		for i in range(1, pending.size()):
			if float(pending[i]["at"]) < float(pending[bi]["at"]): bi = i
		var q: Dictionary = pending[bi]
		pending.remove_at(bi)
		tms = float(q["at"]) * 1000.0
		_op("run", [])
		q["fn"].call()
		guard += 1
		if guard > limit:
			push_error("api.gd: later が終わらない")
			return


# ---- weapon-api.js: tree（tree-effects.js） ----
## quietBuff: 音も粒も出さないバフ
func quiet_buff(id: String, label: String, sec: float, mods: Dictionary, color) -> void:
	var keep := []
	for b in me["buffs"]:
		if b["id"] != id: keep.append(b)
	me["buffs"] = keep
	me["buffs"].append({"id": id, "label": label, "t": sec, "max": sec, "mods": mods, "color": color})

## cutCds: スキルのクールタイムを sec 秒縮める
func cut_cds(sec: float) -> void:
	me["wsCd"] = float(me["wsCd"]) - sec
	for k in me["tcd"]: me["tcd"][k] = float(me["tcd"][k]) - sec

## wtEmit: 1 秒あたり rate 個の割合で粒を出す（フレームの速さに左右されない）
func wt_emit(key: String, rate: float, dt: float, fn: Callable) -> void:
	wt_aura_acc[key] = float(wt_aura_acc.get(key, 0.0)) + rate * dt
	while wt_aura_acc[key] >= 1.0:
		wt_aura_acc[key] = wt_aura_acc[key] - 1.0
		fn.call()


# ---- 技の文脈の読み取り（skills の c.parry・c.primeCharge は武器の効果が足したもの）----
func parry(sec = null, pct = null):
	if ext.has("parry"): return ext["parry"].call(sec, pct)
	return super.parry(sec, pct)

func primeCharge(v = null):
	if ext.has("primeCharge"): return ext["primeCharge"].call(v)
	return super.primeCharge(v)

func trap(p1 = null, p2 = null, p3 = null):
	if ext.has("trap"): return ext["trap"].call(p1, p2, p3)
	return super.trap(p1, p2, p3)


# ---- 狙った点・罠と旗の見た目（弓・盾槍の効果が使う。ゲームの環境が本物にする）----
## field.aimPoint: 狙った地面の点。照合では (0, 0)
func aim_point() -> Dictionary: return {"x": 0.0, "z": 0.0}

## 罠の見た目の部品を置いて返す（meshes.js trapMesh + fx.add。返したものが me.traps[].mesh に入る）。照合では置き物
func trap_visual(_x, _z, _o: Dictionary): return {"position": {"set": "fn"}}

## 罠の見た目を消す（fx.items.find して life = 0）
func trap_visual_free(_t: Dictionary) -> void: pass

## 旗の見た目の部品を置いて返す（meshes.js bannerMesh + fx.add。前の旗 old は消す）。照合では置き物
func banner_visual(_x, _z, _old): return {"position": {"set": "fn"}}


## c.fx。ctx.gd の Fx と同じだが、flash・lightning は JavaScript の引数の数が多い（flash は x, y, z, 色, 強さ, 秒の 6 つ）
class Fx2 extends Ctx.Fx:
	func lightning(x = null, z = null, p3 = null, p4 = null): return c._op("fx.lightning", c._args([x, z, p3, p4]))
	func flash(x = null, y = null, z = null, color = null, p5 = null, p6 = null): return c._op("fx.flash", c._args([x, y, z, color, p5, p6]))
	func beam(x = null, z = null, color = null, p4 = null, p5 = null, p6 = null): return c._op("fx.beam", c._args([x, z, color, p4, p5, p6]))
