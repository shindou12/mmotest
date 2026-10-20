class_name GameCombat
extends RefCounted
## 強攻撃・武器スキル・飛ぶ斬撃・踏み込み（L27 CP5）。元は public/js/game/actions.js（doHeavy・tryWeaponSkill・startSkill・strikes.proj・dash）と
## public/js/weapons/sword.js（heavy・weaponSkills）。片手剣だけ。ほかの近接武器も強攻撃は片手剣の形を使う（各武器の技は未）。
## g は scripts/game/game.gd（自分の状態 me・能力値 S・敵 mobs・当たりの関数）

const CHARGE_MIN := 0.22   # state.js
const CHARGE_MAX := 0.9

# sword.js weaponSkills（名前・待ち時間・説明。run は下の _ws_<名前>）
const WEAPON_SKILLS := {
	"retreat": {"name": "リトリート・スラッシュ", "cd": 7.0, "desc": "前方を威力200%で斬り、敵に向いたまま3.5m後退する（後退中0.22秒無敵）"},
	"vorpal": {"name": "ヴォーパル・ストライク", "cd": 5.0, "desc": "前方へ突進しながら貫く"},
	"square": {"name": "ホリゾンタル・スクエア", "cd": 6.0, "desc": "四方へ素早く斬り払う4連撃"},
	"leap": {"name": "ソニック・リープ", "cd": 6.0, "desc": "跳び込んで着地点を斬り伏せる"},
	"horizon": {"name": "ホリゾンタル・アーク", "cd": 5.0, "desc": "大きく弧を描く往復の二連撃"},
}

var g
var projs := []   # 飛ぶ斬撃 {node, x, z, a, t, speed, life, rad, mult, type, hit}


func _init(game) -> void:
	g = game


func can_act() -> bool:
	var me: Dictionary = g.me
	return not me.dead and not me.crawl and me.dodgeT <= 0 and me.skillT < 0 and me.dashT <= 0


## sword.js heavy「溜め斬り」: 前方 210° を大きく薙ぐ（溜め 1: 2.2 倍、最大溜め: 3.4 倍 + 斬撃波）
func do_heavy(lv: int) -> void:
	if not can_act() or lv < 1: return
	var me: Dictionary = g.me
	me.a = g._aim_angle()
	me.swingT = 0.0; me.swingDur = 0.5; me.combo = 2; me.sw += 1
	var a: float = me.a
	var m := 3.4 if lv == 2 else 2.2
	g._slash_fx(a, 3.8, deg_to_rad(210))
	later(0.05, func(): arc(3.8, 210, m, "heavy", a))
	if lv == 2: proj(a, 1.6, "heavy")
	g._float(Vector3(me.x, 3.0, me.z), "溜め斬り" + ("・最大" if lv == 2 else ""), Color(1, 0.9, 0.5))


## actions.js tryWeaponSkill / startSkill
func try_weapon_skill() -> void:
	if not can_act(): return
	var me: Dictionary = g.me
	if me.wsCd > 0: return
	var id: String = g.S.get("skill", "retreat")
	if not WEAPON_SKILLS.has(id): id = "retreat"
	var sk: Dictionary = WEAPON_SKILLS[id]
	me.wsCd = float(sk.cd) * (1 - float(g.S["cdr"]) / 100.0)
	me.skillT = 0.0; me.skillDuration = 0.55; me.sk += 1
	me.a = g._aim_angle()
	me.swingT = 0.0; me.swingDur = 0.45; me.combo = 2; me.sw += 1
	g._float(Vector3(me.x, 3.0, me.z), sk.name, Color(0.7, 0.9, 1))
	call("_ws_" + id)


func _ws_retreat() -> void:
	var a: float = g.me.a
	later(0.06, func():
		g._slash_fx(a, 3.4, deg_to_rad(180))
		arc(3.4, 180, 2.0, "wskill", a)
		dash(a + PI, 3.5, 0.22, 0.22)
		g.me.a = a)


func _ws_vorpal() -> void:
	var a: float = g.me.a; var sx: float = g.me.x; var sz: float = g.me.z
	dash(a, 8, 0.2, 0.25)
	later(0.12, func(): line(8.5, 2.6, 3.2, "wskill", a, sx, sz))


func _ws_square() -> void:
	var a: float = g.me.a
	for i in 4:
		var aa := a + i * PI / 2
		later(i * 0.1, func():
			arc(3.6, 120, 1.1, "wskill", aa)
			g._slash_fx(aa, 3.6, deg_to_rad(120)))


func _ws_leap() -> void:
	var a: float = g.me.a
	dash(a, 6, 0.28, 0.35)
	later(0.3, func(): circle(g.me.x, g.me.z, 3.2, 3.0, "wskill"))


func _ws_horizon() -> void:
	var a: float = g.me.a
	g._slash_fx(a, 3.8, deg_to_rad(220))
	later(0.05, func(): arc(3.8, 220, 1.4, "wskill", a))
	later(0.2, func():
		g._slash_fx(a, 3.8, deg_to_rad(220))
		arc(3.8, 220, 1.5, "wskill", a))


# ---------------------------------------------------------------- 当たりの形（actions.js strikes）
func later(sec: float, fn: Callable) -> void:
	g.pending.append({"at": g.t_now + sec, "fn": fn})


func arc(rng: float, deg: float, mult: float, type: String, a: float) -> void:
	var half := deg_to_rad(deg) / 2
	for id in g.mobs.keys():
		var mb: Dictionary = g.mobs[id]
		var dx: float = mb.x - g.me.x; var dz: float = mb.z - g.me.z; var d := sqrt(dx * dx + dz * dz)
		if d > rng + mb.rad: continue
		if absf(GameRules.ang_diff(atan2(dx, dz), a)) <= half + mb.rad / maxf(d, 0.5) or d < mb.rad + 0.6:
			g._deal_damage(id, mb, mult, type)


func line(L: float, w: float, mult: float, type: String, a: float, sx: float, sz: float) -> void:
	var fx := sin(a); var fz := cos(a)
	for id in g.mobs.keys():
		var mb: Dictionary = g.mobs[id]
		var dx: float = mb.x - sx; var dz: float = mb.z - sz
		var along := dx * fx + dz * fz; var side := absf(dx * fz - dz * fx)
		if along > -mb.rad and along < L + mb.rad and side < w / 2 + mb.rad: g._deal_damage(id, mb, mult, type)


func circle(x: float, z: float, r: float, mult: float, type: String) -> void:
	for id in g.mobs.keys():
		var mb: Dictionary = g.mobs[id]
		if Vector2(mb.x - x, mb.z - z).length() < r + mb.rad: g._deal_damage(id, mb, mult, type)


func dash(a: float, dist: float, dur: float, iframe: float) -> void:
	g.me.dashA = a; g.me.dashT = dur; g.me.dashSpeed = dist / dur; g.me.a = a
	if iframe > 0: g.me.iframe = maxf(g.me.iframe, iframe)


## strikes.proj: 飛ぶ斬撃（速さ 22m/s、0.7 秒、半径 1.8m。同じ敵には 1 回）
func proj(a: float, mult: float, type: String) -> void:
	var n := MeshInstance3D.new()
	n.mesh = GameVisuals.shape_mesh({"k": "cone", "len": 1.8, "arc": deg_to_rad(120), "a": a + PI}, 1.0)
	n.material_override = GameVisuals.mat(Color(0.75, 0.9, 1.0), true, 0.7)
	g.world.add_child(n)
	projs.append({"node": n, "x": g.me.x, "z": g.me.z, "a": a, "t": 0.0, "speed": 22.0, "life": 0.7, "rad": 1.8, "mult": mult, "type": type, "hit": {}})


func update(dt: float) -> void:
	for i in range(projs.size() - 1, -1, -1):
		var p: Dictionary = projs[i]
		p.t += dt
		p.x += sin(p.a) * p.speed * dt; p.z += cos(p.a) * p.speed * dt
		p.node.position = Vector3(p.x, g.world.ground_y(p.x, p.z) + 1.0, p.z)
		for id in g.mobs.keys():
			var mb: Dictionary = g.mobs[id]
			if p.hit.has(id): continue
			if Vector2(mb.x - p.x, mb.z - p.z).length() < p.rad + mb.rad:
				p.hit[id] = true
				g._deal_damage(id, mb, p.mult, p.type)
		if p.t > p.life:
			p.node.queue_free(); projs.remove_at(i)
