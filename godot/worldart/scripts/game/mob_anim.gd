extends RefCounted
## public/js/models.js:306-357 の敵共通アニメーション。部品名は visuals.gd が割り当てる。

static func _part(root: Node3D, name: String) -> Node3D:
	return root.find_child("MobAnim_" + name, true, false) as Node3D


static func _parts(root: Node3D, name: String) -> Array[Node3D]:
	var result: Array[Node3D] = []
	var i := 0
	while true:
		var node := _part(root, "%s_%d" % [name, i])
		if node == null: break
		result.append(node)
		i += 1
	return result


static func _emission_intensity(material: ShaderMaterial) -> float:
	var albedo: Color = material.get_shader_parameter("albedo")
	var emission: Color = material.get_shader_parameter("emission_col")
	var base := albedo.srgb_to_linear()
	var glow := emission.srgb_to_linear()
	if base.r > 0.0001:
		var intensity := glow.r / base.r
		if intensity > 0.0 and absf(glow.g - base.g * intensity) < 0.01 and absf(glow.b - base.b * intensity) < 0.01:
			return intensity
	return 1.0


static func setup(root: Node3D) -> void:
	if root.has_meta("mob_anim_materials"): return
	var materials: Array[Dictionary] = []
	var body := _part(root, "body")
	if body != null:
		for child in body.find_children("*", "MeshInstance3D", true, false):
			var mesh_instance: MeshInstance3D = child
			if mesh_instance.mesh == null: continue
			for surface in mesh_instance.mesh.get_surface_count():
				var source: Material = mesh_instance.get_active_material(surface)
				if not source is ShaderMaterial: continue
				var source_material: ShaderMaterial = source
				if bool(source_material.get_shader_parameter("unlit")): continue
				var material := source_material.duplicate() as ShaderMaterial
				mesh_instance.set_surface_override_material(surface, material)
				materials.append({
					"material": material,
					"emission": material.get_shader_parameter("emission_col"),
					"intensity": _emission_intensity(material),
				})
	root.set_meta("mob_anim_materials", materials)


static func animate(root: Node3D, state: Dictionary) -> void:
	if not root.has_meta("mob_anim_materials"): setup(root)
	var t: float = float(state.get("t", 0.0))
	var moving := int(state.get("st", 0)) == 1
	var wind := int(state.get("st", 0)) == 2
	var attack := int(state.get("st", 0)) == 3
	var body := _part(root, "body")
	var squash := _part(root, "squash")
	if squash != null:
		var k: float = absf(sin(t * 8.0)) if moving else sin(t * 3.0) * 0.3 + 0.5
		var w: float = 0.25 if wind else 0.0
		squash.scale = Vector3(1.0 + (1.0 - k) * 0.18 + w, 0.75 + k * 0.25 - w, 1.0 + (1.0 - k) * 0.18 + w)
		squash.position.y = 0.55 + (k * 0.35 if moving else 0.0)
	var legs := _parts(root, "legs")
	if not legs.is_empty():
		var w: float = sin(t * 12.0) * 0.6 if moving else 0.0
		for i in legs.size(): legs[i].rotation.x = (1.0 if i % 2 == 0 else -1.0) * (w if i < 2 else -w)
	var legs2 := _parts(root, "legs2")
	if legs2.size() >= 2:
		var w: float = sin(t * 9.0) * 0.6 if moving else 0.0
		legs2[0].rotation.x = w
		legs2[1].rotation.x = -w
	var tail := _part(root, "tail")
	if tail != null:
		tail.rotation.y = sin(t * (10.0 if moving else 3.0)) * 0.4
		tail.rotation.x = -0.3
	var head := _part(root, "head")
	if head != null: head.rotation.x = -0.35 if wind else 0.3 if attack else sin(t * 2.0) * 0.05
	var wings := _parts(root, "wings")
	var flap := bool(root.get_meta("mob_anim_flap", false))
	var wing_frequency := (26.0 if wind else 16.0) if flap else (14.0 if wind else 4.0)
	var wing_amplitude := 0.7 if flap else 0.35
	for i in wings.size():
		wings[i].rotation.z = (1.0 if i == 0 else -1.0) * (0.2 + sin(t * wing_frequency) * wing_amplitude)
	var cap := _part(root, "cap")
	if cap != null:
		cap.scale = Vector3.ONE * (1.12 + sin(t * 20.0) * 0.05 if wind else 1.0 + sin(t * 2.0) * 0.03)
		cap.rotation.z = sin(t * 1.7) * 0.08
	var hover := bool(root.get_meta("mob_anim_hover", false))
	var floating := bool(root.get_meta("mob_anim_float", false))
	var shell := _part(root, "shell")
	if hover:
		if body != null: body.position.y = 0.15 + sin(t * 2.0) * 0.1
		if shell != null: shell.rotation.y = t * (6.0 if wind else 1.5)
	var arms := _parts(root, "arms")
	for i in arms.size(): arms[i].rotation.x = -2.2 if wind else 0.4 if attack else sin(t * 2.0 + i) * 0.15
	var arm := _part(root, "arm")
	if arm != null: arm.rotation.x = -2.4 if wind else 0.6 if attack else -0.3 + sin(t * 2.0) * 0.05
	var cape := _part(root, "cape")
	if cape != null: cape.rotation.x = -0.3 if moving else -0.08 + sin(t * 1.5) * 0.04
	if floating:
		if body != null: body.position.y = sin(t * 2.5) * 0.3
		if shell != null:
			shell.rotation.y = t * 2.0
			shell.rotation.x = sin(t) * 0.4
	var sigil := _part(root, "sigil")
	if sigil != null:
		sigil.rotation.z = t
		sigil.scale = Vector3.ONE * (2.2 + sin(t * 8.0) * 0.2 if bool(state.get("enraged", false)) else 1.8)
	if body != null: body.rotation.x = -0.2 if wind else 0.22 if attack else 0.0
	var stunned := bool(state.get("stun", false))
	var was_stunned := bool(root.get_meta("mob_anim_stun_pose", false))
	if stunned:
		if body != null:
			body.rotation.x = 0.35
			if not hover and not floating: body.position.y = -0.25
		if head != null: head.rotation.x = 0.45
		if arm != null: arm.rotation.x = 0.5
		var guard_arm := _part(root, "guardArm")
		if guard_arm != null: guard_arm.rotation.x = 0.3
		for node in arms: node.rotation.x = 0.4
	elif was_stunned and body != null:
		body.position.y = 0.0
	root.set_meta("mob_anim_stun_pose", stunned)
	var flash: float = float(state.get("flash", 0.0))
	var warn: float = sin(t * 30.0) * 0.5 + 0.5 if wind else 0.0
	var stun: float = sin(t * 7.0) * 0.5 + 0.5 if stunned else 0.0
	for entry in root.get_meta("mob_anim_materials", []):
		var material: ShaderMaterial = entry["material"]
		var color: Color
		var intensity: float
		if flash > 0.0:
			color = Color.WHITE
			intensity = flash * 1.5
		elif stunned:
			color = Color(1.0, 0.82, 0.15)
			intensity = 0.35 + stun * 0.55
		elif wind:
			color = Color(1.0, 0.15, 0.1)
			intensity = warn * 0.6 + float(entry["intensity"]) * 0.5
		else:
			material.set_shader_parameter("emission_col", entry["emission"])
			continue
		material.set_shader_parameter("emission_col", (color * intensity).linear_to_srgb())
	var aura := _part(root, "aura") as OmniLight3D
	if aura != null: aura.light_energy = 6.0 + sin(t * 10.0) * 2.0 if bool(state.get("enraged", false)) else 3.0


static func sample(root: Node3D) -> Dictionary:
	var result := {"parts": {}, "materials": []}
	var names := ["body", "squash", "head", "tail", "cap", "shell", "arm", "guardArm", "cape", "sigil", "aura"]
	for name in names:
		var node := _part(root, name)
		if node == null: continue
		result["parts"][name] = _sample_part(node)
		if name == "aura" and node is OmniLight3D: result["parts"][name]["intensity"] = (node as OmniLight3D).light_energy
	for name in ["legs", "legs2", "wings", "arms"]:
		var nodes := _parts(root, name)
		if nodes.is_empty(): continue
		var samples: Array = []
		for node in nodes: samples.append(_sample_part(node))
		result["parts"][name] = samples
	for entry in root.get_meta("mob_anim_materials", []):
		var color: Color = (entry["material"] as ShaderMaterial).get_shader_parameter("emission_col").srgb_to_linear()
		result["materials"].append([color.r, color.g, color.b])
	return result


static func _sample_part(node: Node3D) -> Dictionary:
	return {
		"position": [node.position.x, node.position.y, node.position.z],
		"rotation": [node.rotation.x, node.rotation.y, node.rotation.z],
		"scale": [node.scale.x, node.scale.y, node.scale.z],
	}
