extends RefCounted
## 弓の武器ツリーの効果。元は public/js/weapons/bow.js の effects（register('bow', {...}) と extendCombat）。
## 場面ごとの関数 h_<名前> は、元の hooks の同名の関数（引数は呼び出し側 weapon-fx.js / tree-effects.js / actions.js と同じ数）。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const WFX = preload("res://scripts/game/combat/weapon_fx.gd")

## 武器の効果に渡す道具（combat/api.gd）
var api


## bow.js effects(api): 効果を登録する
static func install(a) -> void:
	var s := new()
	s.api = a
	WFX.KEEP.append(s)
	# 第3引数: 呼ぶ順（小さいほど先。書いていない場面は登録した順で、順の付いたものより後）。倍率を掛ける順などを元と同じに保つ
	WFX.register("bow", {
		"stats": s.h_stats, "treeReset": s.h_tree_reset, "critAdd": s.h_crit_add, "dmgMult": s.h_dmg_mult, "stun": s.h_stun,
		"afterCast": s.h_after_cast, "onDodge": s.h_on_dodge, "shoot": s.h_shoot, "heavyStart": s.h_heavy_start, "iaiLabel": s.h_iai_label,
		"arrowTick": s.h_arrow_tick, "arrowEdge": s.h_arrow_edge, "arrowHit": s.h_arrow_hit, "arrowGone": s.h_arrow_gone, "aura": s.h_aura,
	}, {"dmgMult": 1, "critAdd": 1, "heavyStart": 2, "aura": 0, "afterCast": 1})
	# スキルに渡す文脈に、罠を置く道具を足す（c.trap）
	a.extend_combat({"trap": s.ext_trap})


func _wt():
	return api.st.get("wt")


# 最大まで引いた矢（狙撃手）が当たった / 外れた: 鷹の目・狙い澄まし
func bw_snipe(hit: bool) -> void:
	var me: Dictionary = api.me
	var W = _wt()
	if W != null and W.ks2 == "bw_hawk" and hit and api.now() - me["hawkT"] > 8:
		me["hawkT"] = api.now()
		me["iaiReady"] = true
		api.fx.ringWave(me["x"], me["z"], 0xffd84a, 2, 0.3)
	if W != null and W.ks2 == "bw_aim":
		me["aimN"] = minf(3, me["aimN"] + 1) if hit else 0
		var keep := []
		for b in me["buffs"]:
			if b["id"] != "bw_aim": keep.append(b)
		me["buffs"] = keep
		if me["aimN"] > 0: me["buffs"].append({"id": "bw_aim", "label": "狙い澄まし +%d%%" % int(me["aimN"] * 10), "t": 1e9, "max": 1e9, "mods": {}, "color": 0xffd84a})


# 矢嵐: 狙った場所に矢の雨
func bw_rain(p: Dictionary) -> void:
	for i in 5:
		api.later(0.12 + i * 0.07, func():
			var x: float = p["x"] + api.rnd(-1.6, 1.6)
			var z: float = p["z"] + api.rnd(-1.6, 1.6)
			api.fx.parts.burst(x, 6, z, 6, {"color": 0xbfe8ff, "speed": 2, "size": 0.35, "life": 0.3, "gravity": 40})
			api.later(0.15, func():
				api.circle(x, z, 1.5, 0.5, {"type": "proc", "noProc": true})
				api.fx.ringWave(x, z, 0xbfe8ff, 1.6, 0.2)
			)
		)


# 罠（罠師の回避・置き矢）: 踏まれると発動。dodge: 罠師の罠（数に上限がある）
func bw_trap(x: float, z: float, o: Dictionary) -> Dictionary:
	var me: Dictionary = api.me
	var g = api.trap_visual(x, z, o)   # 罠の見た目の部品（trapMesh。fx.add で場面に置く）
	var col = o.get("color") if o.get("color") != null else 0xffc860
	var arm = o.get("arm") if o.get("arm") != null else 0.5
	var t := {"x": x, "z": z}
	t.merge(o, true)
	t["armAt"] = api.now() + arm
	t["until"] = api.now() + o["life"]
	t["area"] = api.area()
	t["mesh"] = g
	if WFX.truthy(o.get("dodge")):
		var mine := []
		for q in me["traps"]:
			if WFX.truthy(q.get("dodge")): mine.append(q)
		var W = _wt()
		if mine.size() >= (4 if (W != null and W.ks2 == "bw_lure") else 2): bw_trap_gone(mine[0])
	me["traps"].append(t)
	api.fx.parts.burst(x, 0.3, z, 10, {"color": col, "speed": 2, "size": 0.3, "life": 0.3})
	return t


func bw_trap_gone(t: Dictionary) -> void:
	var keep := []
	for q in api.me["traps"]:
		if not is_same(q, t): keep.append(q)
	api.me["traps"] = keep
	api.trap_visual_free(t)


func bw_trap_tick() -> void:
	var me: Dictionary = api.me
	for t in me["traps"].duplicate():
		if t["area"] != api.area() or api.now() > t["until"]:
			bw_trap_gone(t)
			continue
		if api.now() < t["armAt"]: continue
		var stepped := false
		for mb in api.mobs.values():
			if mb["hp"] > 0 and sqrt(pow(mb["x"] - t["x"], 2) + pow(mb["z"] - t["z"], 2)) < t["r"] + mb["rad"] * 0.5:
				stepped = true
				break
		if not stepped: continue
		bw_trap_gone(t)
		var o := {"type": "proc" if WFX.truthy(t.get("dodge")) else "tskill", "tech": "bow_trap", "stun": t["stun"]}
		if t.get("dodge") != null: o["noProc"] = t["dodge"]
		api.circle(t["x"], t["z"], t["r"], t["mult"], o)
		var col = t.get("color") if t.get("color") != null else 0xffc860
		api.fx.parts.burst(t["x"], 0.4, t["z"], 30, {"color": col, "speed": 6, "size": 0.4, "life": 0.4, "up": 3})
		api.fx.ringWave(t["x"], t["z"], col, t["r"] + 0.4, 0.3)
		api.sfx("hit")


# 射抜き: 罠を矢で撃ち抜いて大爆発
func bw_blast(t: Dictionary) -> void:
	bw_trap_gone(t)
	api.circle(t["x"], t["z"], 3.5, 3.5, {"type": "proc", "noProc": true, "stun": 6})
	api.fx.ringWave(t["x"], t["z"], 0xff9a4a, 4, 0.4)
	api.fx.flash(t["x"], 1.2, t["z"], 0xff9a4a, 50, 0.3)
	api.fx.parts.burst(t["x"], 0.6, t["z"], 50, {"color": 0xffb060, "speed": 9, "size": 0.55, "life": 0.5, "up": 3})
	api.float_text(t["x"], 2.6, t["z"], "射抜き!", "just")
	api.sfx("impact")
	api.add_shake(0.35)


## extendCombat の c.trap(x, z, o)
func ext_trap(x, z, o) -> Dictionary:
	return bw_trap(x, z, o)


# 弓: 引かずに撃つ射程（張り弦 +4m）・最大射程（遠見の心得）・弓を引く速さ（速引き +30%）。最大射程まで引いたら最大の溜め
func h_stats(S: Dictionary, WT, W = null) -> void:
	S["chargeMax"] = S["chargeMax"] * (0.8 if (WT != null and WT.br("bw_draw") == "A") else 1.0)
	S["iframeBonus"] = S["iframeBonus"] + (0.1 if (WT != null and WT.br("bw_roll") == "B") else 0.0)
	S["bowBase"] = S["bowBase"] + (4.0 if (WT != null and WT.br("bw_zone") == "A") else 0.0)
	S["bowMax"] = S["bowMax"] + (WT.v("bw_zone", "rng") if WT != null else 0.0)
	S["bowDraw"] = S["bowDraw"] * (1.3 if (WT != null and WT.br("bw_draw") == "A") else 1.0)
	if W != null and WFX.truthy(W.get("ranged")): S["chargeMax"] = maxf(0.3, (S["bowMax"] - S["bowBase"]) / S["bowDraw"])   # 弓: 最大射程まで引いたら最大の溜め


func h_tree_reset() -> void:
	api.me["aimN"] = 0


# 急所射ち・鋭矢
func h_crit_add(v: float, o: Dictionary) -> float:
	var W = _wt()
	return v + (15.0 if (W != null and W.br("bw_crit") == "A" and WFX.truthy(o.get("full"))) else 0.0) \
		+ (15.0 if (W != null and W.br("bw_quiver") == "A" and o.get("type") == "tskill" and api.st["wk"] == "bow") else 0.0)


# 狙い澄まし
func h_dmg_mult(k: float, W, o: Dictionary, _mb = null, _crit = null) -> float:
	return k * (1 + 0.1 * api.me["aimN"]) if (W.ks2 == "bw_aim" and WFX.truthy(o.get("snipe"))) else k


# 重矢
func h_stun(st: float, o: Dictionary) -> float:
	var W = _wt()
	return st * 1.5 if (W != null and W.br("bw_draw") == "B" and o.get("type") == "heavy") else st


func h_after_cast(_id = null, _free = null) -> void:
	var W = _wt()
	if W != null and W.br("bw_quiver") == "B": api.quiet_buff("bw_quiverB", "余勢", 2, {"aspd": 25}, 0x9affc8)


# 回避した（受け身引き・速射・罠師）
func h_on_dodge() -> void:
	var me: Dictionary = api.me
	var W = _wt()
	if W == null: return
	if W.br("bw_roll") == "A": api.quiet_buff("bw_rollA", "受け身引き", 1.4, {"chargeRate": 100}, 0x9ae8ff)
	if W.ks2 == "bw_quick": api.quiet_buff("bw_quick", "速射", 1.5 + 0.38, {"aspd": 40}, 0x9affc8)
	if W.ks1 == "bw_trapper" and api.now() - me["trapT"] >= 2:
		me["trapT"] = api.now()
		var lure: bool = W.ks2 == "bw_lure"
		bw_trap(me["x"], me["z"], {"mult": 2.0 * (1.3 if lure else 1.0), "r": 1.8, "stun": 15 if lure else 3, "life": 15, "arm": 0.5, "dodge": true})


# 連射: 通常攻撃で2本ずつ（矢嵐: 5回ごとに矢の雨）
func h_shoot(a: float, mult: float) -> bool:
	var me: Dictionary = api.me
	var W = _wt()
	if W == null or W.ks1 != "bw_rapid": return false
	for d in [-0.04, 0.04]: api.arrow({"a": a + d, "mult": mult * 0.75, "type": "normal"})
	if W.ks2 == "bw_storm":
		me["stormN"] += 1
		if int(me["stormN"]) % 5 == 0: bw_rain(api.aim_point())
	return true


# 最大まで引いた矢: 反動と、射程いっぱいの輪
func h_heavy_start(lv) -> void:
	var me: Dictionary = api.me
	if api.st["wk"] == "bow" and lv == 2:
		me["motion"] = "bw_full"
		me["motionT"] = 0
		api.fx.ringWave(me["x"], me["z"], 0xffd84a, api.st["bowMax"], 0.35)


func h_iai_label(label):
	return "鷹の目" if api.st["wk"] == "bow" else label


# 射抜き: 自分の罠を矢で射抜くと大爆発
func h_arrow_tick(w: Dictionary) -> void:
	var W = _wt()
	if W != null and W.ks2 == "bw_shot" and not WFX.truthy(w.get("trapShot")):
		var tr = null
		for q in api.me["traps"]:
			if WFX.truthy(q.get("dodge")) and sqrt(pow(q["x"] - w["x"], 2) + pow(q["z"] - w["z"], 2)) < 1.3:
				tr = q
				break
		if tr != null:
			w["trapShot"] = true
			bw_blast(tr)


# 遠矢: 射程の端（8割より先）で当たると +20%
func h_arrow_edge(w: Dictionary, d: float) -> bool:
	var W = _wt()
	return W != null and W.br("bw_zone") == "B" and d >= w["range"] * 0.8


func h_arrow_hit(w: Dictionary, _mb = null) -> void:
	if WFX.truthy(w.get("snipe")) and not WFX.truthy(w.get("snipeDone")):
		w["snipeDone"] = true
		bw_snipe(true)


func h_arrow_gone(w: Dictionary) -> void:
	if WFX.truthy(w.get("snipe")) and not WFX.truthy(w.get("snipeDone")): bw_snipe(false)


func h_aura(_dt = null, _W = null) -> void:
	bw_trap_tick()
