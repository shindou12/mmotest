extends RefCounted
## 大斧の武器ツリーの効果。元は public/js/weapons/axe.js の effects（register('axe', {...}) と extendCombat）。
## 場面ごとの関数 h_<名前> は、元の hooks の同名の関数（引数は呼び出し側 weapon-fx.js / tree-effects.js と同じ数）。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Common = preload("res://scripts/game/skills/common.gd")
const Dmg = preload("res://scripts/game/combat/damage.gd")

## 武器の効果に渡す道具（combat/api.gd）
var api


## axe.js effects(api): 効果を登録する
static func install(a) -> void:
	var s := new()
	s.api = a
	WFX.KEEP.append(s)
	# 第3引数: 呼ぶ順（小さいほど先。書いていない場面は登録した順で、順の付いたものより後）。倍率を掛ける順などを元と同じに保つ
	WFX.register("axe", {
		"dmgMult": s.h_dmg_mult, "critAfter": s.h_crit_after, "stun": s.h_stun, "onHurt": s.h_on_hurt, "incoming": s.h_incoming,
		"cheatDeath": s.h_cheat_death, "heavy": s.h_heavy, "heavyOverride": s.h_heavy_override, "swingAspd": s.h_swing_aspd,
		"reach": s.h_reach, "aura": s.h_aura,
	}, {"dmgMult": 2, "onHurt": 0, "heavy": 1, "aura": 1, "incoming": 1})
	# スキルに渡す文脈に、HPを払う道具を足す（c.pay: ブラッドラストA「血の代償」。0にはならない）
	a.extend_combat({"pay": s.ext_pay})


func _wt():
	return api.st.get("wt")


## 狂戦士: 減ったHP10%ごとに +3%（捨て身は1.5倍）
func ax_bers() -> float:
	var W = _wt()
	var S: Dictionary = api.st
	if W == null or W.ks1 != "ax_berserk" or not (S["mhp"] > 0): return 0.0
	var n: float = floorf(clampf(1.0 - api.me["hp"] / S["mhp"], 0.0, 0.999) * 10.0) * 3.0
	return minf(40.0, n * 1.5) if W.ks2 == "ax_reckless" else n


## 地割れ: 前へ一直線に地面が裂ける
func ax_crack(a: float, ln: float, mult: float, stun: float) -> void:
	var me: Dictionary = api.me
	var sx: float = me["x"]
	var sz: float = me["z"]
	api.line(ln, 2.2, mult, {"type": "heavy", "a": a, "sx": sx, "sz": sz, "stun": stun, "wtNo": true})
	var d := 1.0
	while d < ln:
		var dd := d
		api.later(dd * 0.02, func(): api.fx.parts.burst(sx + sin(a) * dd, 0.2, sz + cos(a) * dd, 6, {"color": 0xb89870, "speed": 5, "size": 0.5, "life": 0.5, "up": 3}))
		d += 0.6
	api.fx.slash(sx, sz, a, ln, 12, 0xd8b080, 1.2)


## 投斧（強攻撃）: 斧を投げる。8m先まで飛んで戻り、往復とも当たる
func ax_throw(lv: int) -> void:
	var me: Dictionary = api.me
	var a: float = api.aim_angle()
	var M: Dictionary = Common.TM("ax_throw")
	var m := 2.6 if lv == 2 else 1.6
	var W = _wt()
	var col = api.weapon_color()
	me["a"] = a
	me["swingT"] = 9
	me["motion"] = M["id"]
	me["motionT"] = 0
	me["skillT"] = 0
	me["skillDuration"] = M["duration"]
	var far := {"x": me["x"] + sin(a) * 8, "z": me["z"] + cos(a) * 8}
	var rad := 1.6 if lv == 2 else 1.2
	var h0: float = M["hits"][0]
	api.later(h0, func(): api.proj({"a": a, "mult": m, "type": "heavy", "speed": 20, "life": 0.4, "rad": rad, "shape": "axe", "stun": 6}))
	var spin := 2 if W.ks2 == "ax_storm" else 0
	for k in spin * 4:
		api.later(h0 + 0.4 + k * 0.25, func():
			api.circle(far["x"], far["z"], 2.4, 0.5, {"type": "proc", "stun": 1, "wtNo": true})
			api.fx.slash(far["x"], far["z"], k * 1.4, 2.4, 220, col, 0.8)
		)
	api.later(h0 + 0.4 + spin, func():
		var ra: float = atan2(me["x"] - far["x"], me["z"] - far["z"])
		var t: float = maxf(0.1, sqrt(pow(me["x"] - far["x"], 2) + pow(me["z"] - far["z"], 2)) / 20.0)
		api.proj({"a": ra, "mult": m, "type": "heavy", "speed": 20, "life": t, "rad": rad, "shape": "axe", "sx": far["x"], "sz": far["z"], "stun": 6})
		if W.ks2 == "ax_catch":
			api.later(t, func():
				if WFX.truthy(me.get("dead")): return
				api.quiet_buff("ax_catch", "受け止め", 3, {"aspd": 25}, 0xffb040)
				api.float_text(me["x"], 3, me["z"], "受け止め", "just")
				api.fx.ringWave(me["x"], me["z"], 0xffb040, 2, 0.3)
				api.sfx("block")
			)
	)


## extendCombat の c.pay(frac): HPを払う
func ext_pay(frac = null, _p2 = null) -> void:
	var me: Dictionary = api.me
	var d: float = minf(me["hp"] - 1, roundf(api.st["mhp"] * frac))
	if d > 0:
		me["hp"] -= d
		api.float_text(me["x"], 2.2, me["z"], d, "me")


func h_dmg_mult(k0: float, W, o: Dictionary, mb = null, _crit = null) -> float:
	var me: Dictionary = api.me
	var k := k0
	if o.get("type") != "proc": k *= 1.0 + ax_bers() / 100.0
	if W.br("ax_swing") == "B" and o.get("type") == "normal" and me["combo"] == 2: k *= 1.3
	if W.br("ax_brk") == "A" and mb != null and mb["stunT"] > 0: k *= 1.2
	if W.ks2 == "ax_shatter" and o.get("type") == "heavy" and mb != null and mb["kind"] == 2 and mb["stunT"] > 0: k *= 1.5
	return k


# 砕骨: スタン中のボスへの強攻撃は必ず会心
func h_crit_after(mb, o: Dictionary) -> bool:
	var W = _wt()
	return W != null and W.ks2 == "ax_shatter" and o.get("type") == "heavy" and mb["kind"] == 2 and mb["stunT"] > 0


# スタン値: 破砕・重圧（強攻撃）/ 揺さぶり（通常攻撃の3段目）
func h_stun(st0: float, o: Dictionary) -> float:
	var W = _wt()
	var me: Dictionary = api.me
	var st := st0
	if W != null and o.get("type") == "heavy":
		st *= (2.0 if W.ks1 == "ax_crush" else 1.0) * (1.5 if W.br("ax_heavy") == "B" else 1.0)   # 破砕・重圧
	if W != null and W.br("ax_brk") == "B" and o.get("type") == "normal" and me["combo"] == 2: st *= 3.0   # 揺さぶり
	return st


# 怒りの心得: 攻撃を受けると攻撃力アップ
func h_on_hurt() -> void:
	var W = _wt()
	if W.lv("ax_rage") != 0:
		var m := {"atkp": W.v("ax_rage", "rage")}
		if W.br("ax_rage") == "A": m["aspd"] = 15
		if W.br("ax_rage") == "B": m["dr"] = 15
		api.quiet_buff("ax_rage", "怒り", 5, m, 0xff6a3a)


# 捨て身
func h_incoming(raw: float) -> float:
	var W = _wt()
	return raw * 1.25 if (W != null and W.ks2 == "ax_reckless") else raw


# 不死身: HPが0になる攻撃を1で耐える（60秒に1回）
func h_cheat_death() -> bool:
	var W = _wt()
	var me: Dictionary = api.me
	if not (W != null and W.ks2 == "ax_undying" and api.now() - float(me["undyingT"] if me.get("undyingT") != null else -999) > 60): return false
	me["hp"] = 1
	me["undyingT"] = api.now()
	me["iframe"] = maxf(me["iframe"], 2)
	api.float_text(me["x"], 2.8, me["z"], "不死身!", "just")
	api.sfx("perfect")
	api.fx.ringWave(me["x"], me["z"], 0xff3a3a, 3, 0.5)
	api.fx.flash(me["x"], 1.5, me["z"], 0xff3a3a, 50, 0.4)
	return true


# 地砕き・剛力の心得A「地割れ」
func h_heavy(lv, a: float) -> void:
	var W = _wt()
	if api.st.get("wk") == "axe" and W != null and W.ks1 != "ax_throw":
		if W.ks2 == "ax_quake": api.later(0.16, func(): ax_crack(a, 9, 2.0, 6))
		elif lv == 2 and W.br("ax_heavy") == "A": api.later(0.16, func(): ax_crack(a, 7, 1.2, 3))


func h_heavy_override(lv) -> bool:
	var W = _wt()
	if W == null or W.ks1 != "ax_throw": return false
	ax_throw(int(lv))
	return true


func h_swing_aspd(v: float) -> float:
	return v + ax_bers()


func h_reach(k: float, normal = null) -> float:
	var W = _wt()
	if api.st.get("wk") != "axe": return k
	return k * (1.2 if (WFX.truthy(normal) and W != null and W.br("ax_swing") == "A") else 1.0)


func h_aura(dt: float, W) -> void:
	var me: Dictionary = api.me
	var S: Dictionary = api.st
	# 血の心得（渇き・血気）
	if W.br("ax_blood") == "A" and me["hp"] < S["mhp"] * 0.5: api.quiet_buff("ax_thirst", "渇き", 0.3, {"vamp": 3 if W.lv("ax_blood") >= 2 else 2}, 0xff3a3a)
	if W.br("ax_blood") == "B" and me["hp"] >= S["mhp"]: api.quiet_buff("ax_full", "血気", 0.3, {"atkp": 10}, 0xff9a9a)
	# 破砕: ボスがスタンしたとき、周りに衝撃が走る
	if W.ks1 == "ax_crush":
		for mb in api.mobs.values():
			if mb["kind"] != 2: continue
			if not (mb["stunT"] > 0):
				mb["axBoom"] = false
				continue
			if WFX.truthy(mb.get("axBoom")) or api.now() - float(Dmg.or_(mb.get("localT"), 0.0)) > 3: continue
			mb["axBoom"] = true
			var x: float = mb["x"]
			var z: float = mb["z"]
			api.circle(x, z, 4 + mb["rad"], 5.0, {"type": "proc", "noProc": true})
			api.fx.ringWave(x, z, 0xffb040, 5 + mb["rad"], 0.45)
			api.fx.flash(x, 1.5, z, 0xffb040, 60, 0.35)
			api.fx.parts.burst(x, 0.4, z, 60, {"color": 0xc8a070, "speed": 9, "size": 0.6, "life": 0.7, "up": 3})
			api.float_text(x, 4, z, "破砕!", "just")
			api.sfx("impact")
			api.add_shake(0.5)
	# 狂戦士: HPが減るほど、体から赤い湯気が立つ
	if ax_bers() > 0:
		api.wt_emit("bers", ax_bers() * 1.2, dt, func():
			var x2: float = me["x"] + api.rnd(-0.5, 0.5)
			var y2: float = api.rnd(0.2, 1.6)
			var z2: float = me["z"] + api.rnd(-0.5, 0.5)
			api.fx.parts.emit(x2, y2, z2, {"color": 0xff2a1a if ax_bers() >= 20 else 0xff6a4a, "size": 0.3, "life": 0.6, "speed": 1.2, "gravity": -4})
		)
