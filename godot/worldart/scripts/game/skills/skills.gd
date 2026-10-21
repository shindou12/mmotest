extends RefCounted
## 技の登録表（id → 関数）。元は public/js/weapons/index.js（WEAPON_DEFS）と public/js/skills.js（HEAVY・WEAPON_SKILLS・TREE_SKILLS）。
## 技の名前・kind・cd（skills.js が ×1.2 した後の値）・motion・duration は data/game.json の skills から読む（手で写さない）。
## 片手剣（sword.gd）・大剣（greatsword.gd）・短剣（dagger.gd）・大斧（axe.gd）の分を移してある。盾槍・弓は別の作業。
## 関数は run(c) の c（ctx.gd の文脈）を受ける。強攻撃だけ run(c, lv)。

const Common = preload("res://scripts/game/skills/common.gd")
const Sword = preload("res://scripts/game/skills/sword.gd")
const Greatsword = preload("res://scripts/game/skills/greatsword.gd")
const Dagger = preload("res://scripts/game/skills/dagger.gd")
const Axe = preload("res://scripts/game/skills/axe.gd")


## 武器 wk の強攻撃 run(c, lv)。移していない武器は無効な Callable
static func heavy(wk: String) -> Callable:
	match wk:
		"sword": return Sword.heavy
		"greatsword": return Greatsword.heavy
		"dagger": return Dagger.heavy
		"axe": return Axe.heavy
	return Callable()


## 武器スキル（WEAPON_SKILLS）の run(c)
static func weapon_skill(id: String) -> Callable:
	match id:
		"retreat": return Sword.ws_retreat
		"vorpal": return Sword.ws_vorpal
		"square": return Sword.ws_square
		"leap": return Sword.ws_leap
		"horizon": return Sword.ws_horizon
		"cyclone": return Greatsword.ws_cyclone
		"breaker": return Greatsword.ws_breaker
		"avalanche": return Greatsword.ws_avalanche
		"meteor": return Greatsword.ws_meteor
		"shadow": return Dagger.ws_shadow
		"phantom": return Dagger.ws_phantom
		"fan": return Dagger.ws_fan
		"venom": return Dagger.ws_venom
		"rampage": return Axe.ws_rampage
		"tomahawk": return Axe.ws_tomahawk
		"earthsplit": return Axe.ws_earthsplit
		"bloodaxe": return Axe.ws_bloodaxe
	return Callable()


## ツリースキル（TREE_SKILLS のうち、武器ツリーのスキル WT_SKILLS 以外）の run(c)。
## 技（sword_*・gs_*）は advanced-skills.js の run: c => cast(c, t)
static func tree_skill(id: String) -> Callable:
	match id:
		"slant": return slant
		"brave": return brave
		"gslam": return gslam
		"fortress": return fortress
		"poison": return Dagger.poison
		"smoke": return Dagger.smoke
		"warstomp": return Axe.warstomp
		"bloodlust": return Axe.bloodlust
		"sword_parry", "sword_aircut", "sword_sideturn", "sword_dance":
			return func(c): Sword.tech(c, Common.T(id))
		"gs_guillotine", "gs_rising", "gs_broad", "gs_recoil", "gs_siege":
			return func(c): Greatsword.tech(c, Common.T(id))
		"dagger_flank", "dagger_vital", "dagger_bleed", "dagger_pin", "dagger_quicken":
			return func(c): Dagger.tech(c, Common.T(id))
		"axe_hook", "axe_execute", "axe_return", "axe_blood", "axe_rush":
			return func(c): Axe.tech(c, Common.T(id))
	return Callable()


## 武器ツリーのスキル（WT_SKILLS）の run(c)
static func wt_skill(id: String) -> Callable:
	match id:
		"sw_aircut": return Sword.sw_aircut
		"sw_parry": return Sword.sw_parry
		"sw_slant": return Sword.sw_slant
		"sw_side": return Sword.sw_side
		"sw_dance": return Sword.sw_dance
		"sw_brave": return Sword.sw_brave
		"gt_rising": return Greatsword.gt_rising
		"gt_broad": return Greatsword.gt_broad
		"gt_recoil": return Greatsword.gt_recoil
		"gt_guillo": return Greatsword.gt_guillo
		"gt_slam": return Greatsword.gt_slam
		"gt_siege": return Greatsword.gt_siege
		"dk_flank": return Dagger.dk_flank
		"dk_vital": return Dagger.dk_vital
		"dk_bleed": return Dagger.dk_bleed
		"dk_poison": return Dagger.dk_poison
		"dk_smoke": return Dagger.dk_smoke
		"dk_pin": return Dagger.dk_pin
		"ax_hook": return Axe.ax_hook
		"ax_return": return Axe.ax_return
		"ax_stomp": return Axe.ax_stomp
		"ax_exec": return Axe.ax_exec
		"ax_lust": return Axe.ax_lust
		"ax_rush": return Axe.ax_rush
	return Callable()


## 武器ツリーのスキル id（頭の文字 sw_・gt_・dk_・ax_）が属する武器のスクリプト
static func wt_module(id: String):
	if id.begins_with("sw_"): return Sword
	if id.begins_with("dk_"): return Dagger
	if id.begins_with("ax_"): return Axe
	return Greatsword


## 武器ツリーのスキルの表示用の値（skill-trace.mjs の wtmeta と同じ並び）:
## [name, kind, cd, cdOf(W), motion, motionOf(W), duration, MOTION_DURATIONS[motionOf(W) || motion]]。なければ null
static func wt_meta(id: String, W) -> Array:
	var G := Common.game()
	var sk: Dictionary = G["skills"]["tree"][id]
	var mod = wt_module(id)
	var cd_of = mod.cd_of(id, W)
	var motion_of = mod.motion_of(id, W)
	var md = motion_of if motion_of != null else sk["motion"]
	return [sk["name"], sk["kind"], sk["cd"], cd_of, sk["motion"], motion_of, sk["duration"], G["motionDurations"][md]]


# ---------------------------------------------------------------------------
# 旧来のツリースキル（skills.js TREE_SKILLS）のうち、片手剣・大剣の旧スロットに対応するもの
# ---------------------------------------------------------------------------
static func slant(c) -> void:
	for i in 3:
		c.later(i * 0.2, func():
			var a: float = c.aim()
			c.dash(a, 3, 0.1, 0.15)
			c.later(0.08, func():
				c.arc(3.2, 140, 1.5, {"type": "tskill", "a": a})
				c.fx.slash(c.me["x"], c.me["z"], a, 3.2, 140, c.col(), 1.0, i % 2 == 1)
				c.sfx("swing")
			)
		)


static func brave(c) -> void:
	c.buff("brave", "ブレイブ・ハート", 8, {"atkp": 25, "crit": 15}, 0xffb040)


static func gslam(c) -> void:
	var a: float = c.aim()
	c.dash(a, 6, 0.35, 0.45)
	c.later(0.36, func():
		c.circle(c.me["x"], c.me["z"], 4.8, 4.0, {"type": "tskill"})
		c.fx.ringWave(c.me["x"], c.me["z"], c.col(), 6, 0.45)
		c.fx.parts.burst(c.me["x"], 0.3, c.me["z"], 60, {"color": 0xc8b090, "speed": 9, "size": 0.6, "life": 0.7, "up": 2})
		c.sfx("heavy")
		c.shake(0.6)
	)


static func fortress(c) -> void:
	c.buff("fortress", "鉄壁の構え", 4, {"dr": 60}, 0x9ad8ff)
	c.heal(0.1)
