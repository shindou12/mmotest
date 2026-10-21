class_name GameCombat
extends RefCounted
## ゲームの戦闘の流れ（G1-3b）。元は public/js/game/actions.js（canAct・startAttack・doSwing・doHeavy・tryWeaponSkill・tryTreeSkill・startSkill・skillCd）、
## input.js（pointerDown・pointerUp = 溜め）、loop.js（溜め・技の時間・バフ・クールタイムの毎フレームの更新）。
## 技そのものは移した技（scripts/game/skills/skills.gd の登録表）を、本物の文脈 GameCtx（skills/game_ctx.gd）に渡して呼ぶ。
## 当たりとダメージは game_ctx.gd → combat/damage.gd。試作の手写しの片手剣の技は消した（武器スキル・強攻撃は登録表から）。
## g は scripts/game/game.gd。式の順番・乱数を引く順は元の JavaScript と同じ。時刻は game.gd の t_now（JavaScript の now()）。
## まだ入れていないもの: 盾槍のガード（guarding は常に false）・ガードカウンター・弓の矢・のけぞり/ダウン（staggerT・downT は 0 のまま）・スキル変化。

const Skills = preload("res://scripts/game/skills/skills.gd")
const GameCtx = preload("res://scripts/game/skills/game_ctx.gd")
const Common = preload("res://scripts/game/skills/common.gd")
const Sword = preload("res://scripts/game/skills/sword.gd")
const Greatsword = preload("res://scripts/game/skills/greatsword.gd")
const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Dmg = preload("res://scripts/game/combat/damage.gd")
const FxSword = preload("res://scripts/game/combat/fx_sword.gd")
const FxGreatsword = preload("res://scripts/game/combat/fx_greatsword.gd")

var g
var ctx


func _init(game) -> void:
	g = game
	ctx = GameCtx.new(game)
	# 武器ごとの効果（片手剣・大剣）を登録する。短剣・盾槍・大斧・弓は呼ぶ順の番号だけ同じにする空の登録
	WFX.clear()
	FxSword.install(ctx)
	FxGreatsword.install(ctx)
	WFX.register_placeholders()


## game.gd が me・S を作り直したときに呼ぶ
func bind() -> void:
	ctx.bind()


## state.js CHARGE_MIN / CHARGE_MAX（表は data/game.json の consts）
static func charge_min() -> float:
	return float(GameRules.data()["consts"]["chargeMin"])


static func charge_max() -> float:
	return float(GameRules.data()["consts"]["chargeMax"])


# ---------------------------------------------------------------- 状態の読み書き（variants.js・actions.js）
func tf(id: String) -> bool:
	return Dmg.tf(ctx, id)


## variants.js desperate（称号「砂王を屠りし者」）
func desperate() -> bool:
	return tf("t_boss3") and float(g.me["hp"]) < float(g.S["mhp"]) * 0.5


## variants.js titleMove / titleAspd（天候の称号 t_storm は天候の表がないので未）
func title_move() -> float:
	return (15.0 if tf("t_delver") and Dmg.indoor_now(ctx) else 0.0) + (30.0 if tf("t_traveler") and g.t_now < float(g.me.get("travelT", 0.0)) else 0.0)


func title_aspd() -> float:
	return 0.0


## actions.js canAct
func can_act() -> bool:
	var me: Dictionary = g.me
	return not g.S.is_empty() and not me["dead"] and not me["crawl"] and me["dodgeT"] <= 0 and me["skillT"] < 0 and me["dashT"] <= 0 \
		and not me["guarding"] and me["staggerT"] <= 0 and me["downT"] <= 0 and not float(me.get("sweepT", 0.0)) > 0.0


## actions.js startAttack: 攻撃を始めるとき、盾槍のガードボーナスをこの攻撃に乗せる
func start_attack() -> void:
	var me: Dictionary = g.me
	me["motion"] = ""
	me["motionT"] = 0.0
	me["heavySwing"] = false
	me["atkBonus"] = me["nextAtkBonus"]
	me["atkBonusT"] = g.t_now + 0.7
	me["nextAtkBonus"] = 1


# ---------------------------------------------------------------- 通常攻撃（actions.js doSwing）
func do_swing() -> void:
	var me: Dictionary = g.me
	var S: Dictionary = g.S
	var W: Dictionary = S["W"]
	var now: float = g.t_now
	start_attack()
	me["combo"] = (int(me["combo"]) + 1) % 3 if now - float(me["lastSwing"]) < float(W["speed"]) * 2.2 else 0
	me["lastSwing"] = now
	me["swingT"] = 0.0
	me["act"] += 1
	var aspd: float = float(S["aspd"]) + ctx.buff_mod("aspd") + float(me["dStack"]) * float(S["dStackPer"]) + float(WFX.fx_reduce("swingAspd", 0.0)) + (15.0 if desperate() else 0.0) + title_aspd()
	me["swingDur"] = float(W["speed"]) * (1 - minf(75.0, aspd) / 100.0) * (1.25 if me["combo"] == 2 else 1.0)
	me["sw"] += 1
	me["a"] = g._aim_angle()
	var mult: float = float(W["mult"]) * [1.0, 1.1, 1.6][int(me["combo"])]
	var col: int = ctx.col()
	var a: float = me["a"]
	if W.get("ranged", false):
		if not WFX.fx_some("shoot", [a, mult]): ctx.arrow({"a": a, "mult": mult, "type": "normal"})   # 弓は未（矢の見た目と飛び方は弓を移すとき）
		return
	var rng: float = float(W["range"]) * float(WFX.fx_reduce("reach", 1.0, [true]))
	ctx.fx.slash(me["x"], me["z"], me["a"], rng, W["arc"], WFX.fx_reduce("swingColor", col), 1.0, int(me["combo"]) % 2 == 1)
	ctx.sfx("swing", {"heavy": W.get("twoHanded", false) or me["combo"] == 2})
	ctx.later(0.06, func(): ctx.arc(rng, W["arc"], mult, {"a": a, "type": "normal"}))
	WFX.fx_call("swingExtra", [a, rng, col])   # 連突き・一点突破 など
	var waved: bool = me["combo"] == 2 and S["fx"].has("wave")
	if waved: ctx.proj({"a": a, "mult": 1.4, "type": "normal"})
	WFX.fx_call("swingLate", [a, waved])   # 剣の心得A「閃光」・千本 など
	WFX.fx_call("swingLast", [a])   # 魔剣士 など


# ---------------------------------------------------------------- 溜め（input.js pointerDown / pointerUp）
## 左を押した: 溜めを始める（盾槍はここでガード。未）
func press() -> void:
	var me: Dictionary = g.me
	if not g.started: return
	if me["downT"] <= 0 and not me["crawl"]:
		me["charging"] = true
		me["chargeT"] = 0.0
		me["chargeLv"] = 0
		me["chargeStart"] = g.t_now
		Dmg.wt_charge_start(ctx)


## 左を離した: 短押しは通常攻撃（入力を少しの間覚えておく）、溜めたら強攻撃
func release() -> void:
	var me: Dictionary = g.me
	if not (me["charging"] and g.started): return
	me["releaseRange"] = 0   # 弓の離したときの射程（弓は未）
	me["charging"] = false
	if float(me["chargeT"]) < charge_min(): me["queued"] = g.t_now + 0.45   # 短押し → 通常攻撃
	elif WFX.fx_some("heavyNeedsFull") and int(me["chargeLv"]) < 2: me["queued"] = g.t_now + 0.45   # 短剣の瞬影は溜めきったときだけ
	else: do_heavy(int(me["chargeLv"]))


## actions.js doHeavy。lv は溜め段階 1〜2
func do_heavy(lv: int) -> void:
	if not can_act() or lv < 1: return
	var me: Dictionary = g.me
	var S: Dictionary = g.S
	start_attack()
	me["act"] += 1
	WFX.fx_call("beforeHeavy")   # 報復者 など
	Dmg.wt_heavy(ctx, lv)
	me["a"] = g._aim_angle()
	me["swingT"] = 0.0
	me["swingDur"] = 0.5
	me["combo"] = 2
	me["sw"] += 1
	me["heavySwing"] = true   # 強攻撃の振り（大剣は溜めの振りかぶりから振り下ろす）
	ctx.sfx("heavy")
	ctx.fx.flash(me["x"], 1.5, me["z"], ctx.col(), 30 if lv == 2 else 15, 0.3)
	if g.args.has("bot"): print("HEAVY lv=%d" % lv)
	# ガードカウンター（me.counterFire）は盾槍・守護騎士のガード待ち（ガードは未）
	if WFX.fx_some("heavyOverride", [lv]): return   # 竜騎士の跳躍・投斧 など
	WFX.fx_call("heavyStart", [lv])   # 武器ごとの強攻撃のモーション など
	var run: Callable = Skills.heavy(String(S["wk"]))
	if run.is_valid(): run.call(ctx, lv)
	else: push_warning("強攻撃が未移植の武器: " + String(S["wk"]))
	WFX.fx_call("heavyAfter", [lv])   # 影渡り など


# ---------------------------------------------------------------- 武器スキル・Q/E（actions.js tryWeaponSkill・tryTreeSkill・startSkill）
## 右クリック: 武器スキル。待ち時間は表の値（skills.js が ×1.2 した後）× (1 - cdr)
func try_weapon_skill() -> void:
	if not can_act(): return
	var me: Dictionary = g.me
	var S: Dictionary = g.S
	var sk: Dictionary = S["ws"]
	var id: String = S["skill"]
	if me["wsCd"] > 0:
		if Dmg.phantom_ready(ctx, "ws"):
			start_skill(sk, Skills.weapon_skill(id), null)
			Dmg.wt_after_cast(ctx, "ws", true)
		return
	me["wsCd"] = float(sk["cd"]) * (1 - float(S["cdr"]) / 100.0) * 1.0 * (0.8 if tf("t_star") else 1.0)
	start_skill(sk, Skills.weapon_skill(id), null)
	if g.args.has("bot"): print("SKILL ", id)
	Dmg.wt_after_cast(ctx, "ws")


## Q / E: ツリーのスキル（i = 0 / 1）。ch.slots のスロットに入れた技
func try_tree_skill(i: int) -> void:
	var S: Dictionary = g.S
	if S.is_empty(): return
	var slots: Array = g.ch.get("slots", [null, null])
	var id = slots[i] if i < slots.size() else null
	if id == null or String(id) == "":
		g._log("スロット%dは空です（Kでスキルツリー）" % (i + 1))
		return
	id = String(id)
	var sk: Dictionary = tree_skill_def(id)
	if not S["actives"].has(id):
		g._log("%sは今の武器では使えません" % String(sk.get("name", id)))
		return
	if not can_act(): return
	var me: Dictionary = g.me
	var run := tree_skill_run(id)
	if float(me["tcd"].get(id, 0.0)) > 0:
		if Dmg.phantom_ready(ctx, id):
			start_skill(sk, run, id)
			Dmg.wt_after_cast(ctx, id, true)
		return
	me["tcd"][id] = skill_cd(id)
	start_skill(sk, run, id)
	if g.args.has("bot"): print("TSKILL ", id)
	Dmg.wt_after_cast(ctx, id)


## skills.js TREE_SKILLS[id] の表の値（名前・kind・cd・motion・duration など。表は game.json の skills.tree）
func tree_skill_def(id: String) -> Dictionary:
	return GameRules.data()["skills"]["tree"].get(id, {"name": id})


## ツリースキルの run(c)。武器ツリーのスキル（WT_SKILLS）か、旧来のツリーのスキル
func tree_skill_run(id: String) -> Callable:
	var f: Callable = Skills.wt_skill(id)
	if f.is_valid(): return f
	return Skills.tree_skill(id)


## skills.js の cdOf / motionOf（武器ツリーのスキルだけ）。武器ごとのファイルの関数を呼ぶ
func _wt_mod(id: String):
	if not Skills.wt_skill(id).is_valid(): return null
	return Sword if id.begins_with("sw_") else Greatsword


## tree-effects.js skillCd
func skill_cd(id: String) -> float:
	var sk := tree_skill_def(id)
	var W = g.S.get("wt")
	var cd_of = null
	var mod = _wt_mod(id)
	if mod != null and W != null: cd_of = mod.cd_of(id, W)
	return (float(cd_of) if cd_of != null else float(sk["cd"])) * (1 - float(g.S["cdr"]) / 100.0)


## actions.js startSkill。sk は技の表（名前・motion・duration・spin）、run は技の関数 run(c)、id は武器ツリーの motionOf を引く名前（武器スキルは null）
func start_skill(sk: Dictionary, run: Callable, id) -> void:
	var me: Dictionary = g.me
	var S: Dictionary = g.S
	start_attack()
	me["act"] += 1
	var mo = sk.get("motion")   # 武器ツリーの分岐で動きが変わる技
	var mod = _wt_mod(String(id)) if id != null else null
	if mod != null and S.get("wt") != null:
		var m2 = mod.motion_of(String(id), S["wt"])
		if m2 != null: mo = m2
	me["motion"] = mo if mo != null else ""
	var md = GameRules.data()["motionDurations"].get(me["motion"], 0.0)
	me["skillDuration"] = float(md) if float(md) != 0.0 else (float(sk["duration"]) if sk.get("duration") != null and float(sk["duration"]) != 0.0 else 0.55)
	me["motionT"] = 0.0
	me["skillT"] = 0.0
	me["spin"] = bool(sk.get("spin", false))
	me["sk"] += 1
	me["a"] = g._aim_angle()
	# 回転系以外のスキルは、武器を振るモーションを出す。他のプレイヤーにも見える
	if not me["spin"]:
		me["swingT"] = 0.0
		me["swingDur"] = 0.45
		me["combo"] = 2
		me["sw"] += 1
	me["charging"] = false
	ctx.sfx("skill")
	ctx.float_text(me["x"], 3, me["z"], sk.get("name", "?"), "info")
	ctx.fx.flash(me["x"], 2, me["z"], ctx.col(), 25, 0.4)
	if run.is_valid(): run.call(ctx)
	else: push_warning("未移植の技: " + String(sk.get("name", "?")))


# ---------------------------------------------------------------- 毎フレーム（loop.js update のうち戦闘の分）
## 移動の前: 技の動き・待ち時間・バフの時間
func tick_timers(dt: float) -> void:
	var me: Dictionary = g.me
	if me["motion"] != "":
		me["motionT"] += dt
		if me["motionT"] > float(GameRules.data()["motionDurations"].get(me["motion"], 0.0)): me["motion"] = ""
	for k in ["dodgeCd", "wsCd", "potCd", "iframe", "bulletT", "staggerT", "hurtT", "dStackT"]: me[k] -= dt
	if me["dStackT"] <= 0: me["dStack"] = 0
	var cdt: float = WFX.fx_reduce("cooldownDt", dt)   # ブレイブハートB「速攻」 など
	me["wsCd"] -= cdt - dt
	for k in me["tcd"]: me["tcd"][k] -= cdt
	for b in me["buffs"]: b["t"] -= dt
	WFX.fx_call("tick")   # 剣聖の全会心が終わったら勢いは0 など
	Dmg.wt_aura(ctx, dt)
	var keep := []
	for b in me["buffs"]:
		if b["t"] > 0: keep.append(b)
	me["buffs"] = keep


## 移動のあと: 溜め・通常攻撃の予約・技の時間・飛ぶ斬撃
func tick_actions(dt: float, safe: bool) -> void:
	var me: Dictionary = g.me
	var S: Dictionary = g.S
	# 溜め
	if me["charging"]:
		me["chargeT"] += dt * (1 + ctx.buff_mod("chargeRate") / 100.0) * (2.0 if me["eyeCharge"] else 1.0)   # 集中・見切り眼Aで溜めが速くなる
		if me["chargeT"] >= charge_min():
			me["a"] = g._aim_angle()
			var lv := 2 if me["chargeT"] >= S["chargeMax"] else 1
			if lv != me["chargeLv"]:
				me["chargeLv"] = lv
				ctx.sfx("charged" if lv == 2 else "charge", {"lv": lv})
				if lv == 2:
					ctx.fx.ringWave(me["x"], me["z"], ctx.col(), 2.5, 0.3)
					ctx.fx.flash(me["x"], 1.5, me["z"], ctx.col(), 20, 0.3)
	# 通常攻撃（短押しの入力を少し保持してコンボをつなぐ）
	me["swingT"] += dt
	if me["queued"] > g.t_now and can_act() and me["swingT"] >= me["swingDur"] and not safe:
		me["queued"] = 0.0
		do_swing()
	if me["skillT"] >= 0:
		me["skillT"] += dt
		if me["skillT"] > (me["skillDuration"] if me["skillDuration"] != 0 else 0.55): me["skillT"] = -1.0
	ctx.update_projs(dt)
