extends RefCounted
## ダメージの式。元は public/js/game/combat.js（dealDamage・stunValue・jolt・TYPE_MOD・番兵の盾 GUARD_ARC / GUARD_PASS）と、
## それが呼ぶ game/tree-effects.js の入口（wtDmgMult・wtOnHit・wtCritAdd・wtAfterCast・phantomReady・wtOnHurt・wtOnGuard・wtDr・wtChargeStart・wtHeavy・wtAura）、
## game/variants.js の称号（tf・indoorNow・titleDmg）、stats.js の buffMod。
## 関数は元の名前を snake_case にしたもの。式・順番・乱数を引く順は JavaScript と同じ。api は combat/api.gd の環境（state・stats・rules・view の窓口を兼ねる）。
## JavaScript の真偽（undefined・null・0・false が偽、空のオブジェクトは真）は、Dictionary の値を != null で、数を truthy() で調べて合わせる。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Common = preload("res://scripts/game/skills/common.gd")
const R = preload("res://scripts/game/rules.gd")

## combat.js TYPE_MOD: 攻撃の種類 → 能力値の名前
const TYPE_MOD := {"normal": "normp", "heavy": "heavyp", "wskill": "wskillp"}
## combat.js GUARD_ARC・GUARD_PASS: 番兵の盾は正面 ±57° からの攻撃を 3 割に
const GUARD_ARC := 1.0
const GUARD_PASS := 0.3
## tree-effects.js ATK_TYPES
const ATK_TYPES := ["normal", "heavy", "wskill", "tskill"]


## 値が null か 0 か false なら d（JavaScript の x || d）
static func or_(x, d):
	return x if WFX.truthy(x) else d


## variants.js tf: 称号の効果が有効か
static func tf(api, id: String) -> bool:
	return api.st.get("tfx", {}).has(id)


## variants.js indoorNow
static func indoor_now(api) -> bool:
	return api.shape == "grid"


## variants.js titleDmg: 称号による与ダメージ倍率（敵に応じて）
static func title_dmg(api, mb: Dictionary) -> float:
	var k := 1.0
	if tf(api, "t_reaper") and mb["hp"] < mb["mhp"] * 0.3: k *= 1.25
	if tf(api, "t_berserk"): k *= 1.2
	if tf(api, "t_hunter") and mb["kind"] != 2 and not WFX.truthy(mb.get("elite")): k *= 1.15
	if tf(api, "t_breaker") and mb["stunT"] > 0: k *= 1.15
	return k


# ---------------------------------------------------------------------------
# tree-effects.js の入口（中身は武器ごとの効果）
# ---------------------------------------------------------------------------
## wtDmgMult
static func wt_dmg_mult(api, o: Dictionary, mb: Dictionary, crit: bool) -> float:
	var W = api.st.get("wt")
	if W == null or o.get("type") == "dot": return 1.0
	var k: float = WFX.fx_reduce("dmgMult", 1.0, [W, o, mb, crit])
	if WFX.truthy(api.me.get("afterJust")) and ATK_TYPES.has(o.get("type")):
		api.me["afterJust"] = false
		k *= 1.5   # 後の先・影渡り: 次の1撃 +50%
	return WFX.fx_reduce("dmgMultLast", k, [W, o, mb, crit])


## wtOnHit
static func wt_on_hit(api, mb: Dictionary, dmg: float, crit: bool, o: Dictionary, mult: float) -> void:
	if o.get("type") == "dot" or o.get("type") == "proc" or WFX.truthy(o.get("wtNo")): return
	WFX.fx_call("onHit", [mb, dmg, crit, o, mult])


## wtAfterCast（free: 幻剣のもう1回）
static func wt_after_cast(api, id: String, free: bool = false) -> void:
	if api.st.get("wt") == null: return
	WFX.fx_call("afterCast", [id, free])
	WFX.fx_call("afterCastLate", [id, free])


## phantomReady
static func phantom_ready(api, id: String) -> bool:
	return WFX.fx_some("phantomReady", [id])


## wtOnHurt: 攻撃を受けた（受け流し・溜め中の効果・被弾の効果）。受け流せたら、ほかの効果は起きない
static func wt_on_hurt(api, guarded: bool) -> void:
	WFX.fx_call("onHurtFirst")
	if WFX.fx_some("parry"): return
	if WFX.truthy(api.me.get("charging")): WFX.fx_call("onHurtCharging")
	if guarded: return
	WFX.fx_call("onHurt")


## wtOnGuard: ガードで受けた
static func wt_on_guard(api, raw: float, src) -> void:
	if api.st.get("wt") == null: return
	WFX.fx_call("onGuard", [raw, src])


## wtDr: 被ダメージ軽減（武器ツリーの分）
static func wt_dr(api) -> float:
	return WFX.fx_reduce("dr", 0.0)


## wtCritAdd: 会心率の上乗せ（武器ツリーの分）
static func wt_crit_add(api, o: Dictionary) -> float:
	return WFX.fx_reduce("critAdd", 0.0, [o])


## wtChargeStart: 強攻撃の押し始め。居合・踏み込み溜めで、溜めた状態から始める
static func wt_charge_start(api) -> void:
	if api.st.get("wt") == null: return
	if WFX.fx_some("chargeStart"): return   # 竜翔: 溜めなしでもう一度跳ぶ など
	var me: Dictionary = api.me
	if WFX.truthy(me.get("iaiReady")):
		me["iaiReady"] = false
		me["chargeT"] = api.st["chargeMax"]
		api.float_text(me["x"], 3, me["z"], WFX.fx_reduce("iaiLabel", "居合"), "just")
	elif me.get("primeCharge") != null and me["primeCharge"] > 0:
		me["chargeT"] = api.st["chargeMax"] * me["primeCharge"]
		me["primeCharge"] = 0


## wtHeavy: 強攻撃を振ったとき（光波・地割れ など）。向きは api.aim_angle()
static func wt_heavy(api, lv) -> void:
	var W = api.st.get("wt")
	api.me["lastHeavyLv"] = lv
	api.me["lastHeavyT"] = api.now()
	api.me["eyeCharge"] = false
	if W == null: return
	WFX.fx_call("heavy", [lv, api.aim_angle()])


## wtAura: 武器ツリーの状態を、体と武器のまわりの光で見せる
static func wt_aura(api, dt: float) -> void:
	var W = api.st.get("wt")
	var me: Dictionary = api.me
	if W == null or WFX.truthy(me.get("dead")) or WFX.truthy(me.get("crawl")) or not WFX.truthy(me.get("model")): return
	WFX.fx_call("aura", [dt, W])


# ---------------------------------------------------------------------------
# combat.js
# ---------------------------------------------------------------------------
## combat.js stunValue: 攻撃のスタン値（ボスのスタンと、倒れた仲間を起こす量の両方に使う）
static func stun_value(api, o: Dictionary) -> float:
	var base := {"normal": 1.2, "heavy": 6.0, "wskill": 3.0, "tskill": 3.0}
	var st: float
	if o.get("stun") != null: st = o["stun"]
	elif base.has(o.get("type")): st = base[o["type"]]
	else: st = 0.0
	var W: Dictionary = api.st["W"]
	var melee_mult := 1.0
	if WFX.truthy(W.get("melee")): melee_mult = 1.0 + (api.st["stunp"] + api.buff_mod("stunp")) / 100.0
	st = st * (W["stun"] * melee_mult)
	st = WFX.fx_reduce("stun", st, [o])   # 武器ツリー（破砕・重圧・揺さぶり・重矢 など）
	var sv = o.get("sv")
	if sv != null and sv.get("key") == "sv_quake": st = st * float(Common.game()["sv"]["quake"][int(sv["t"])])
	if tf(api, "t_breaker"): st = st * 1.3
	return roundf(st * 10.0) / 10.0


## combat.js jolt: 敵をビクッと揺らす（sec 秒で収まる。amp はずれの大きさ m）
static func jolt(mb: Dictionary, sec: float, amp: float) -> void:
	if mb.get("jolt", 0.0) > 0 and mb.get("joltAmp", 0.0) > amp: return   # 大きい揺れの最中は上書きしない
	mb["jolt"] = sec
	mb["joltMax"] = sec
	mb["joltAmp"] = amp


## combat.js dealDamage。mb: 敵、mult: 威力、o: 技が渡すオプション
static func deal_damage(api, mb, mult: float, o: Dictionary = {}) -> void:
	if api.character_lost: return
	if mb == null or mb["hp"] <= 0: return
	var S: Dictionary = api.st
	var me: Dictionary = api.me
	var act = mb.get("act")
	if act != null and act.get("p") == "burrow" and act["age"] > 0.45 and act["age"] < float(or_(act.get("d"), 0.0)) - 0.7: return   # 砂に潜っている間は当たらない
	var type = o.get("type")
	var skill: bool = type == "wskill" or type == "tskill"
	var tough: bool = mb["kind"] == 2 or WFX.truthy(mb.get("elite"))
	var sv = o.get("sv")
	# 会心: 前の項が真なら後ろは評価しない（乱数を引くのは Math.random を評価したときだけ）
	var crit := false
	if WFX.truthy(o.get("crit")): crit = true
	elif S.get("wt") != null and WFX.fx_some("critAlways", [o]): crit = true
	elif sv != null and sv.get("key") == "sv_heavy": crit = true
	else:
		var r100: float = api.random() * 100.0
		var lim: float = S["crit"] + api.buff_mod("crit") + wt_crit_add(api, o) + (15.0 if tough and tf(api, "t_shark") else 0.0) + (10.0 if tf(api, "t_night") and indoor_now(api) else 0.0) + (8.0 if tf(api, "t_lucky") else 0.0)
		if r100 < lim: crit = true
		elif skill and S["fx"].has("skillcrit"): crit = true
	var ambushed := false
	if not crit and me["ambush"] > 0 and not WFX.truthy(o.get("noProc")):
		crit = true
		me["ambush"] -= 1
		ambushed = true
	if not crit and WFX.fx_some("critAfter", [mb, o]): crit = true   # 武器ツリー: 間合いの先端・砕骨・暗殺の背後 など
	var tkey = TYPE_MOD.get(type)
	var type_mult := 1.0
	if tkey == null: type_mult = 1.0 + (0.0 + 0.0) / 100.0
	else: type_mult = 1.0 + (float(or_(S.get(tkey), 0.0)) + api.buff_mod(tkey)) / 100.0
	var back := 1.0
	if me["hp"] < S["mhp"] * 0.5: back = 1.0 + S["backwater"] / 100.0
	var stunned := 1.3 if mb["stunT"] > 0 else 1.0
	var exec_ := 1.5 if S["flags"].has("execute") and mb["hp"] < mb["mhp"] * 0.3 else 1.0
	var guard_bonus: float = me["atkBonus"] if api.now() < me["atkBonusT"] else 1.0
	var boss_t := 1.15 if mb["kind"] == 2 and tf(api, "t_boss1") else 1.0
	# ダメージ: 左から順に掛ける（JavaScript の評価順と丸めを同じにする。乱数と副作用のある関数もこの順）
	var dmg: float = S["atk"] * (1.0 + api.buff_mod("atkp") / 100.0)
	dmg = dmg * mult
	dmg = dmg * type_mult
	dmg = dmg * back
	dmg = dmg * stunned
	dmg = dmg * exec_
	dmg = dmg * guard_bonus
	dmg = dmg * boss_t
	dmg = dmg * title_dmg(api, mb)
	dmg = dmg * (1.0 + api.buff_mod("dmgp") / 100.0)
	dmg = dmg * (o["falloff"] if o.get("falloff") != null else 1.0)
	dmg = dmg * api.rnd(0.92, 1.08)
	dmg = dmg * (S["critd"] / 100.0 if crit else 1.0)
	dmg = dmg * wt_dmg_mult(api, o, mb, crit)
	dmg = dmg * float(WFX.fx_reduce("ambushMult", 1.0, [ambushed]))
	dmg = maxf(1.0, roundf(dmg))
	dmg = WFX.fx_reduce("finisher", dmg, [mb, crit, o])   # 必殺 など
	# 番兵の盾: 正面からの攻撃は 3 割しか通らない（攻撃の後の隙と背後は盾が効かない）
	var blocked: bool = WFX.truthy(mb.get("guard")) and type != "dot" and absf(R.ang_diff(atan2(me["x"] - mb["x"], me["z"] - mb["z"]), mb["a"])) < GUARD_ARC
	if blocked: dmg = maxf(1.0, roundf(dmg * GUARD_PASS))
	mb["hp"] -= dmg
	mb["localT"] = api.now()
	mb["flash"] = 1
	# スタン値: 強攻撃で大きく溜まる。近接武器ほど溜めやすい
	var stv := 0.0
	if mb["kind"] == 2 and not (mb["stunT"] > 0): stv = stun_value(api, o)
	var msg := {"t": "hit", "id": mb["id"], "dmg": dmg, "crit": crit, "st": stv}
	var tech = o.get("tech")
	if not WFX.truthy(tech): tech = WFX.fx_reduce("hitTech", null, [o, mb])   # 間合い支配: 先端で当てた雑魚を押し戻す など
	if tech != null: msg["tech"] = tech
	api.net_send(msg)
	if WFX.truthy(o.get("healOnHit")): api.heal_player(dmg * o["healOnHit"], true)
	if o.get("threat") != null and o["threat"] > 1:
		api.net_send({"t": "threat", "id": mb["id"], "n": roundf(dmg * (o["threat"] - 1))})
	# 武器パッシブ（攻撃が当たったとき）
	if ATK_TYPES.has(type):
		if S["dStackPer"] > 0:
			me["dStack"] = minf(S["dStackMax"], me["dStack"] + 1)
			me["dStackT"] = S["dStackT"]
	if S.get("wt") != null: wt_on_hit(api, mb, dmg, crit, o, mult)
	api.float_text(mb["x"], 2.2 * (2.5 if mb["kind"] == 2 else 1.0), mb["z"], dmg, "poison" if type == "dot" else ("crit" if crit else ""))
	if type != "dot":
		var wc = api.weapon_color()
		api.fx.parts.burst(mb["x"], 1.2, mb["z"], 18 if crit else 8, {"color": 0xffd84a if crit else wc, "speed": 9 if crit else 6, "size": 0.5 if crit else 0.35, "life": 0.4})
		api.sfx("block" if blocked else "hit", {"crit": crit})
		if blocked:
			api.fx.parts.burst(mb["x"] + sin(mb["a"]) * 0.9, 1.6, mb["z"] + cos(mb["a"]) * 0.9, 16, {"color": 0xbfe0ff, "speed": 9, "size": 0.35, "life": 0.3})
			api.sfx("impact")
		# 被弾の揺れ（小さく短く）。スタン中のボスは重い音・黄色い火花・ほんの一瞬の止めで「今が攻め時」の手応え
		jolt(mb, 0.12 if stunned > 1 else 0.08, 0.22 if stunned > 1 else (0.1 if crit else 0.06))
		if stunned > 1:
			api.sfx("stunHit")
			api.fx.parts.burst(mb["x"], 2.2, mb["z"], 14, {"color": 0xffe060, "speed": 11, "size": 0.55, "life": 0.35})
			api.set_hit_stop(maxf(api.hit_stop, 0.035))
	var vamp: float = S["vamp"] + api.buff_mod("vamp")
	var bal: Dictionary = Common.game()["balance"]
	# HP吸収は一定の間隔に1回だけ、その一撃のダメージから（重い一撃ほど大きく戻り、手数では増えない）。継続ダメージは対象外
	if vamp > 0 and type != "dot" and api.now() - float(or_(me.get("vampT"), -1e9)) >= bal["lifestealGap"]:
		me["vampT"] = api.now()
		api.heal_player(dmg * vamp / 100.0 * bal["lifestealEfficiency"], false)
	if sv != null: api.on_variant_hit(mb, dmg, o)
	# 称号「流星」: 武器スキルが当たると流れ星が降る（0.6秒に1回）
	if type == "wskill" and tf(api, "t_star") and not WFX.truthy(o.get("noProc")) and api.now() - float(or_(me.get("starT"), 0.0)) > 0.6:
		me["starT"] = api.now()
		var x: float = mb["x"]
		var z: float = mb["z"]
		api.fx.parts.burst(x, 7, z, 20, {"color": 0xfff0a0, "speed": 3, "size": 0.5, "life": 0.4, "gravity": 30})
		api.later(0.25, func():
			api.fx.flash(x, 1, z, 0xfff0a0, 30, 0.25)
			api.fx.ringWave(x, z, 0xfff0a0, 2.6, 0.3)
			api.circle(x, z, 2.4, 0.35, {"type": "proc", "noProc": true})
		)
	if WFX.truthy(o.get("noProc")): return
	if api.has_buff("poison"): mb["poisonUntil"] = api.now() + 4
	if crit and S["fx"].has("thunder"):
		api.later(0.08, func():
			api.fx.lightning(mb["x"], mb["z"])
			api.sfx("thunder")
			api.add_shake(0.2)
			api.circle(mb["x"], mb["z"], 3.5, 1.5, {"noProc": true})
		)
	if S["fx"].has("flame") and api.random() < 0.35:
		api.fx.parts.burst(mb["x"], 0.8, mb["z"], 25, {"color": 0xff6a20, "speed": 4, "size": 0.6, "life": 0.7, "gravity": 3})
		api.sfx("flame")
		for m2 in api.mobs.values():
			if not is_same(m2, mb):
				var dx: float = m2["x"] - mb["x"]
				var dz: float = m2["z"] - mb["z"]
				if sqrt(dx * dx + dz * dz) < 2.8 + m2["rad"]: deal_damage(api, m2, 0.6, {"noProc": true})
