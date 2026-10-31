extends RefCounted
## 大剣の武器ツリーの効果。元は public/js/weapons/greatsword.js の effects（register('greatsword', {...}) と extendCombat）。
## 場面ごとの関数 h_<名前> は、元の hooks の同名の関数（引数は呼び出し側 weapon-fx.js / tree-effects.js と同じ数）。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Common = preload("res://scripts/game/skills/common.gd")
const Dmg = preload("res://scripts/game/combat/damage.gd")

## 武器の効果に渡す道具（combat/api.gd）
var api
## greatsword.js LIGHT_COLOR（光波の色）
const LIGHT_COLOR := 0xa8e4ff


## greatsword.js effects(api): 効果を登録する
static func install(a) -> void:
	var s := new()
	s.api = a
	WFX.KEEP.append(s)
	# 第3引数: 呼ぶ順（小さいほど先。書いていない場面は登録した順で、順の付いたものより後）。倍率を掛ける順などを元と同じに保つ
	WFX.register("greatsword", {
		"stats": s.h_stats, "dmgMult": s.h_dmg_mult, "critAdd": s.h_crit_add, "onHit": s.h_on_hit,
		"onHurtCharging": s.h_on_hurt_charging, "dr": s.h_dr, "superArmor": s.h_super_armor, "noKnockdown": s.h_no_knockdown,
		"heavy": s.h_heavy, "counter": s.h_counter, "justDodge": s.h_just_dodge,
	}, {"dmgMult": 4, "critAdd": 0, "onHit": 3, "heavy": 0, "justDodge": 2})
	# スキルに渡す文脈に、溜めた状態から始める道具を足す（c.primeCharge: グランド・スラムB「踏み込み溜め」）
	a.extend_combat({"primeCharge": s.ext_prime_charge})


func _wt():
	return api.st.get("wt")


## extendCombat の c.primeCharge(frac)
func ext_prime_charge(frac) -> void:
	api.me["primeCharge"] = frac


# 見切り眼: JUST回避・受け流しのあと3秒間ダメージアップ（6秒に1回まで）
func eye() -> void:
	var me: Dictionary = api.me
	var W = _wt()
	if W == null or W.lv("gt_eye") == 0 or api.now() - me["eyeT"] < 6: return
	me["eyeT"] = api.now()
	api.quiet_buff("gt_eye", "見切り眼", 3, {"dmgp": 25 if W.lv("gt_eye") >= 2 else 15}, 0x9affff)
	if W.br("gt_eye") == "A": me["eyeCharge"] = true
	if W.br("gt_eye") == "B": api.cut_cds(2)


# 一撃: 溜めは +25% 長い / 溜めの心得A: 溜めが速い
func h_stats(S: Dictionary, WT, _W = null) -> void:
	S["chargeMax"] = S["chargeMax"] * (1.25 if WT != null and WT.ks1 == "gt_blow" else 1.0) * (0.8 if WT != null and WT.br("gt_charge") == "A" else 1.0)


func h_dmg_mult(k0: float, W, o: Dictionary, mb = null, _crit = null) -> float:
	var me: Dictionary = api.me
	var k := k0
	var max_heavy: bool = o.get("type") == "heavy" and not WFX.truthy(o.get("wave")) and me["lastHeavyLv"] == 2 and api.now() - me["lastHeavyT"] < 0.8
	if W.ks1 == "gt_wave" and o.get("type") == "heavy" and not WFX.truthy(o.get("wave")): k *= 0.85
	if W.ks1 == "gt_blow" and max_heavy: k *= 1.4
	if W.br("gt_break") == "A" and mb != null and mb["stunT"] > 0: k *= 1.2
	if WFX.truthy(o.get("exec")) and mb != null and mb["hp"] < mb["mhp"] * 0.3: k *= o["exec"]   # 断頭落としA「処断」
	return k


# 断罪: 最大溜めの強攻撃の会心率 +35%
func h_crit_add(v: float, o: Dictionary) -> float:
	var W = _wt()
	var me: Dictionary = api.me
	return v + (35.0 if W != null and W.ks2 == "gt_judge" and o.get("type") == "heavy" and not WFX.truthy(o.get("wave")) and me["lastHeavyLv"] == 2 and api.now() - me["lastHeavyT"] < 0.8 else 0.0)


# 月蝕: 光波が最初に当たった敵のところで爆ぜる
func h_on_hit(mb: Dictionary, _dmg = null, _crit = null, o: Dictionary = {}, _mult = null) -> void:
	var proj = o.get("proj")
	if proj != null and WFX.truthy(proj.get("eclipse")) and not WFX.truthy(proj.get("boomed")):
		proj["boomed"] = true
		var x: float = mb["x"]
		var z: float = mb["z"]
		api.later(0.05, func():
			api.circle(x, z, 3, 1.5, {"type": "proc", "wtNo": true})
			api.fx.ringWave(x, z, LIGHT_COLOR, 3.4, 0.35)
			api.fx.flash(x, 1.2, z, LIGHT_COLOR, 30, 0.25)
			api.sfx("wave")
		)


# 溜め中に攻撃を受けた: 不屈（溜めが最大に）/ 剛体A（溜めが進む）
func h_on_hurt_charging() -> void:
	var W = _wt()
	var me: Dictionary = api.me
	if W.ks2 == "gt_unyield": me["chargeT"] = maxf(me["chargeT"], api.st["chargeMax"])
	elif W.br("gt_armor") == "A": me["chargeT"] += 0.3


# 溜め中の被ダメージ軽減（剛体lv2・剛体B・一撃）と破城の構えA
func h_dr(v: float) -> float:
	var W = _wt()
	var me: Dictionary = api.me
	if W == null: return v
	var dr := 0.0
	if WFX.truthy(me.get("charging")):
		if W.lv("gt_armor") >= 2: dr += 15
		if W.br("gt_armor") == "B": dr += 10
		if W.ks1 == "gt_blow": dr += 30
	if W.br("gt_siege") == "A" and api.has_buff("gt_siege"): dr += 20
	return v + dr


# 剛体: 溜め中はスーパーアーマー（破城の構えAの効果中も）。剛体Bは溜め中に吹き飛ばされない
func h_super_armor() -> bool:
	var W = _wt()
	var lv: int = W.lv("gt_armor") if W != null else 0
	return (WFX.truthy(api.me.get("charging")) and lv >= 1) or (W != null and W.br("gt_siege") == "A" and api.has_buff("gt_siege"))


func h_no_knockdown() -> bool:
	var W = _wt()
	return WFX.truthy(api.me.get("charging")) and W != null and W.br("gt_armor") == "B"


# 強攻撃を振ったとき: 光波・月の残滓・破城の構えB
func h_heavy(lv, a: float) -> void:
	var me: Dictionary = api.me
	var W = _wt()
	if W.ks1 == "gt_wave":
		me["motion"] = "gt_wave"
		me["motionT"] = 0   # 振り抜いて光波を飛ばす
		var big: bool = lv == 2
		var moon: bool = big and W.ks2 == "gt_fullmoon"
		api.proj({"a": a, "mult": (2.0 if big else 1.0) * (1.75 if moon else 1.0), "type": "heavy", "speed": 22 if big else 24, "life": 0.75 if big else 0.55,
			"rad": 3.4 if moon else (2.0 if big else 1.2), "color": LIGHT_COLOR, "stun": 6 if W.br("gt_break") == "B" else 1.5, "eclipse": W.ks2 == "gt_eclipse"})
		if big: api.fx.flash(me["x"], 1.5, me["z"], LIGHT_COLOR, 60 if moon else 35, 0.3)
	if W.lv("gt_moon") != 0:
		var n: int = 2 if W.br("gt_moon") == "A" else 1
		var m: float = 0.8 if W.lv("gt_moon") >= 2 else 0.5
		var stun: float = 4.0 if (W.br("gt_moon") == "B" or W.br("gt_break") == "B") else 0.5
		for i in n:
			var aa: float = a + ((0.12 if i != 0 else -0.12) if n > 1 else 0)
			api.later(0.12 + i * 0.12, func(): api.proj({"a": aa, "mult": m, "type": "proc", "speed": 24, "life": 0.5, "rad": 0.9, "color": LIGHT_COLOR, "wtNo": true, "stun": stun}))
	if W.br("gt_siege") == "B" and api.has_buff("gt_siege"):
		api.proj({"a": a, "mult": 1.2, "type": "heavy", "speed": 22, "life": 0.6, "rad": 1.6, "color": LIGHT_COLOR, "stun": 1.5})


# カウンター: 強攻撃を押した直後に攻撃を受けたら、無傷で受け流して反撃する
func h_counter(src = null) -> bool:
	var me: Dictionary = api.me
	var W = _wt()
	if W == null or W.ks1 != "gt_counter" or not WFX.truthy(me.get("charging")) or api.now() - me["chargeStart"] > 0.35 or api.now() < float(Dmg.or_(me.get("parryReadyT"), 0.0)): return false
	me["parryReadyT"] = api.now() + 1.5   # 受け流したあと1.5秒は次の受け流しが出ない
	me["charging"] = false
	me["chargeT"] = 0
	me["chargeLv"] = 0
	me["iframe"] = maxf(me["iframe"], 0.4)
	var a: float = atan2(src["x"] - me["x"], src["z"] - me["z"]) if src != null else me["a"]
	var M: Dictionary = Common.TM("gt_riposte")
	me["a"] = a
	me["swingT"] = 9
	me["motion"] = M["id"]
	me["motionT"] = 0
	me["skillT"] = 0
	me["skillDuration"] = M["duration"]
	me["act"] += 1
	api.float_text(me["x"], 3.1, me["z"], "見切り!", "just")
	api.sfx("perfect")
	api.sfx("block")
	api.fx.ringWave(me["x"], me["z"], 0xffffff, 3, 0.3)
	api.fx.flash(me["x"], 1.5, me["z"], 0xffffff, 40, 0.25)
	api.later(M["hits"][0], func():
		api.arc(4, 200, 3.5, {"type": "heavy", "a": a, "stun": 8})
		api.fx.slash(me["x"], me["z"], a, 4, 200, 0xffffff, 1.6, true)
		api.sfx("swing", {"heavy": true})
		api.add_shake(0.25)
	)
	if W.ks2 == "gt_iai": me["iaiReady"] = true
	if W.ks2 == "gt_mirror": api.add_buff("gt_mirror", "明鏡", 5, {"dmgp": 30}, 0xe0f0ff)
	eye()
	return true


func h_just_dodge() -> void:
	eye()
