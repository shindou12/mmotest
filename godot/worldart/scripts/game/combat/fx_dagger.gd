extends RefCounted
## 短剣の武器ツリーの効果。元は public/js/weapons/dagger.js の effects（register('dagger', {...}) と extendCombat）。
## 場面ごとの関数 h_<名前> は、元の hooks の同名の関数（引数は呼び出し側 weapon-fx.js / tree-effects.js と同じ数）。
## 毒（vStack・poisonUntil）と出血（bleedN・bleedPow・bleedUntil）は敵の Dictionary に直接書く（元は mb の同名の値）。
## 数値の計算は 64 ビットの float だけで行う（Vector2 / Vector3 は 32 ビットなので使わない）。

const WFX = preload("res://scripts/game/combat/weapon_fx.gd")
const Common = preload("res://scripts/game/skills/common.gd")
const Dmg = preload("res://scripts/game/combat/damage.gd")
const R = preload("res://scripts/game/rules.gd")

## 武器の効果に渡す道具（combat/api.gd）
var api
## dagger.js KNIFE_COLOR
const KNIFE_COLOR := 0xcab4ff


## dagger.js effects(api): 効果を登録する
static func install(a) -> void:
	var s := new()
	s.api = a
	WFX.KEEP.append(s)
	# 第3引数: 呼ぶ順（小さいほど先。書いていない場面は登録した順で、順の付いたものより後）。倍率を掛ける順などを元と同じに保つ
	WFX.register("dagger", {
		"stats": s.h_stats, "dmgMult": s.h_dmg_mult, "critAfter": s.h_crit_after, "ambushMult": s.h_ambush_mult, "finisher": s.h_finisher,
		"onHit": s.h_on_hit, "poisonTick": s.h_poison_tick, "bleedMul": s.h_bleed_mul, "aura": s.h_aura, "swingLate": s.h_swing_late,
		"heavyNeedsFull": s.h_heavy_needs_full, "heavyStart": s.h_heavy_start, "heavyAfter": s.h_heavy_after, "justDodge": s.h_just_dodge,
	}, {"dmgMult": 0, "onHit": 2, "heavyStart": 1, "aura": 3, "justDodge": 1, "swingLate": 1})
	# スキルに渡す文脈に、毒・出血・奇襲を足す（c.poison / c.bleed / c.ambush）
	a.extend_combat({"poison": s.add_poison, "bleed": s.ext_bleed, "ambush": s.ext_ambush})


func _wt():
	return api.st.get("wt")


## 敵の背後にいるか（敵の向きから120度以上うしろ）
func wt_behind(mb) -> bool:
	if mb == null or mb.get("a") == null: return false
	var me: Dictionary = api.me
	return absf(R.ang_diff(atan2(me["x"] - mb["x"], me["z"] - mb["z"]), mb["a"])) > deg_to_rad(120)


## 毒の心得: 毒・出血の強さ
func wt_tox_mul() -> float:
	var W = _wt()
	var lv: int = W.lv("dk_toxin") if W != null else 0
	return 1.0 + (float(50 if lv >= 2 else 30) if lv != 0 else 0.0) / 100.0


## 長毒: 毒・出血の時間
func wt_tox_dur() -> float:
	var W = _wt()
	return 4.0 * (1.5 if W != null and W.br("dk_toxin") == "A" else 1.0)


## 毒を重ねる（最大5。1つにつき毎秒15%）。猛毒は5つで破裂。extendCombat の c.poison(mb, n)
func add_poison(mb, n = null) -> void:
	if mb == null or mb["hp"] <= 0 or not (n != null and n > 0): return
	var W = _wt()
	mb["vStack"] = minf(5.0, float(Dmg.or_(mb.get("vStack"), 0.0)) + n)
	mb["poisonUntil"] = api.now() + wt_tox_dur()
	if W != null and W.ks2 == "dk_burst" and mb["vStack"] >= 5:
		mb["vStack"] = 0
		mb["poisonUntil"] = 0
		api.later(0.05, func():
			if mb["hp"] <= 0: return
			Dmg.deal_damage(api, mb, 3.0, {"type": "proc", "noProc": true, "wtNo": true})
			api.fx.parts.burst(mb["x"], 1.2, mb["z"], 40, {"color": 0x8aff5a, "speed": 7, "size": 0.6, "life": 0.6, "gravity": 1})
			api.fx.ringWave(mb["x"], mb["z"], 0x8aff5a, 2.6, 0.35)
			api.sfx("hit", {"crit": true})
		)


## 毒の1回（0.5秒ごと）のダメージ。ポイズン・エッジA「致死毒」の効果中は2倍
func wt_poison_tick(mb) -> float:
	var W = _wt()
	return 0.075 * mb["vStack"] * wt_tox_mul() * (2.0 if W != null and W.br("dk_poison") == "A" and api.has_buff("dk_poison") else 1.0)


## 出血（毎秒 per_sec。stack なら最大3まで重なる）
func add_bleed(mb, per_sec: float, stack: bool = false, sec: float = 4.0) -> void:
	if mb == null or mb["hp"] <= 0: return
	var W = _wt()
	var t: float = api.now()
	mb["bleedN"] = minf(3.0, float(Dmg.or_(mb.get("bleedN"), 0.0)) + 1.0) if stack else 1
	var keep := 0.0
	if float(Dmg.or_(mb.get("bleedUntil"), 0.0)) > t and not stack: keep = float(Dmg.or_(mb.get("bleedPow"), 0.0))
	mb["bleedPow"] = maxf(per_sec * mb["bleedN"] if stack else per_sec, keep)
	mb["bleedUntil"] = t + sec * (1.5 if W != null and W.br("dk_toxin") == "A" else 1.0)


## extendCombat の c.bleed(mb, perSec, stack)
func ext_bleed(mb, per_sec = null, stack = null) -> void:
	add_bleed(mb, per_sec, WFX.truthy(stack))


## extendCombat の c.ambush(n): スモーク・ステップ。次の n 撃は必ず会心
func ext_ambush(n = null) -> void:
	var me: Dictionary = api.me
	me["ambush"] = maxf(me["ambush"], n)


# 連撃（当てるたびに攻撃の速さ）: 連撃の心得・連刃・疾風 / 身軽B
func h_stats(S: Dictionary, WT, _W = null) -> void:
	if WT != null and WT.br("dk_agile") == "B": S["dodgeDist"] = 1.3
	if S["wk"] == "dagger":
		if WT == null: S["dStackPer"] = 4
		elif WT.lv("dk_combo") != 0: S["dStackPer"] = WT.v("dk_combo", "per")
		elif WT.ks1 == "dk_blades": S["dStackPer"] = 4
		else: S["dStackPer"] = 0
	if WT != null and WT.ks1 == "dk_blades": S["dStackMax"] = 15
	S["dStackT"] = (5.0 if WT != null and WT.br("dk_combo") == "A" else 3.0) * (2.0 if WT != null and WT.ks2 == "dk_gale" else 1.0)


func h_dmg_mult(k0: float, W, o: Dictionary, mb = null, crit = null) -> float:
	var me: Dictionary = api.me
	var k := k0
	if W.ks2 == "dk_spread" and mb != null and WFX.truthy(mb.get("vStack")): k *= 1.0 + 0.04 * mb["vStack"]
	if W.br("dk_combo") == "B" and me["dStack"] >= api.st["dStackMax"]: k *= 1.06
	if W.ks1 == "dk_assassin" and o.get("type") != "proc" and wt_behind(mb):
		k *= 1.2 * (1.4 if W.ks2 == "dk_exec" and WFX.truthy(crit) and mb["kind"] == 2 else 1.0)
	return k


# 暗殺: 背後は必ず会心
func h_crit_after(mb, o: Dictionary) -> bool:
	var W = _wt()
	return W != null and wt_behind(mb) and W.ks1 == "dk_assassin" and o.get("type") != "dot" and o.get("type") != "proc"


# スモーク・ステップB「奇襲」: 奇襲の会心 +50%
func h_ambush_mult(k, ambushed = null):
	var W = _wt()
	return 1.5 if (WFX.truthy(ambushed) and W != null and W.br("dk_smoke") == "B") else k


# 必殺: 背後の会心で弱った雑魚はとどめ
func h_finisher(dmg, mb, crit, o: Dictionary):
	var W = _wt()
	var me: Dictionary = api.me
	if W != null and W.ks2 == "dk_exec" and WFX.truthy(crit) and mb["kind"] != 2 and mb["hp"] <= mb["mhp"] * 0.25 and wt_behind(mb) and o.get("type") != "dot" and dmg < mb["hp"]:
		dmg = mb["hp"]
		api.float_text(mb["x"], 3, mb["z"], "必殺", "just")
		api.fx.flash(mb["x"], 1.4, mb["z"], 0xcab4ff, 40, 0.3)
		api.fx.slash(mb["x"], mb["z"], me["a"], 2.2, 40, 0xffffff, 1.2)
		api.fx.parts.burst(mb["x"], 1.2, mb["z"], 30, {"color": 0xcab4ff, "speed": 7, "size": 0.45, "life": 0.5})
	return dmg


# 毒・出血を重ねる / 連刃の二重斬り
func h_on_hit(mb: Dictionary, _dmg = null, crit = null, o: Dictionary = {}, mult = null) -> void:
	var me: Dictionary = api.me
	var W = _wt()
	if WFX.truthy(o.get("poison")): add_poison(mb, o["poison"])
	if W.ks1 == "dk_venom": add_poison(mb, 1)
	if api.has_buff("dk_poison"): add_poison(mb, 1)
	if W.br("dk_toxin") == "B" and o.get("type") == "normal" and me["combo"] == 2: add_poison(mb, 1)
	if WFX.truthy(crit) and W.br("dk_vitalp") == "B": add_bleed(mb, 0.2, false, 3)
	if W.ks1 == "dk_blades" and me["dStack"] >= api.st["dStackMax"] and o.get("type") == "normal":
		api.later(0.07, func():
			if mb["hp"] > 0:
				Dmg.deal_damage(api, mb, mult * 0.4, {"type": "proc", "noProc": true, "wtNo": true})
				api.fx.slash(mb["x"], mb["z"], me["a"] + PI, 1.6, 120, 0xcab4ff, 0.6, true)
		)


# 毒・出血の1回（0.5秒ごと）
func h_poison_tick(_v, mb) -> float:
	return wt_poison_tick(mb)


func h_bleed_mul(k) -> float:
	return k * wt_tox_mul()


# 疾風: 連撃が最大の間は移動が速い
func h_aura(_dt, W) -> void:
	if W.ks2 == "dk_gale" and api.me["dStack"] >= api.st["dStackMax"]: api.quiet_buff("dk_gale", "疾風", 0.3, {"move": 25}, 0x9affc8)


# 千本: 3段目は手首でナイフを3本投げる
func h_swing_late(a, _waved = null) -> void:
	var me: Dictionary = api.me
	var W = _wt()
	if W != null and W.ks2 == "dk_thousand" and me["combo"] == 2 and me["dStack"] >= api.st["dStackMax"]:
		me["motion"] = "dk_thousand"
		me["motionT"] = 0
		api.later(Common.TM("dk_thousand")["hits"][0], func():
			for d in [-0.22, 0, 0.22]: api.arrow({"a": a + d, "mult": 0.35, "type": "proc", "noZone": true, "speed": 40, "color": KNIFE_COLOR})
		)


# 瞬影は溜めきったときだけ（途中で離したら通常攻撃）
func h_heavy_needs_full() -> bool:
	return api.st.get("wk") == "dagger"


func h_heavy_start(_lv = null) -> void:
	if api.st.get("wk") == "dagger":
		api.me["motion"] = "dk_blink"
		api.me["motionT"] = 0   # 瞬影: 低く駆け抜けながら斬る


# 影渡り: すり抜けたら敵のほうへ向き直る
func h_heavy_after(_lv = null) -> void:
	var W = _wt()
	if api.st.get("wk") == "dagger" and W != null and W.ks2 == "dk_step":
		var me: Dictionary = api.me
		api.later(0.24, func():
			me["a"] += PI
			me["afterJust"] = true
			me["motion"] = "dk_step_turn"
			me["motionT"] = 0
			api.float_text(me["x"], 3, me["z"], "影渡り", "just")
			api.fx.ringWave(me["x"], me["z"], 0xcab4ff, 2.2, 0.3)
		)


# 残影: JUST回避の次の1撃は会心
func h_just_dodge() -> void:
	var W = _wt()
	if W != null and W.br("dk_agile") == "A": api.me["ambush"] = maxf(api.me["ambush"], 1)
