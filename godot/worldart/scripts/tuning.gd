extends RefCounted
## 調整値の正本。UI と起動引数は同じ値を読み書きする。

const DEFAULTS := {
	"vwarm": 0.0,
	"vcool": 0.0,
	"vdesat": 0.0,
	"vlift": 0.0,
	"diff": 0.0,
	"diffr": 0.012,
	"diffmask": "none",
	"diffd0": 0.0,
	"diffd1": 0.0,
	"diffe": 0.08,
	"diffdebug": false,
	"bake": 0.0,
	"srad": 2.0,
}
const MASKS := ["none", "depth", "edge", "lum", "veg", "soft"]

var _values: Dictionary = DEFAULTS.duplicate(true)
var _overrides: Dictionary = {}


func get_value(name: String, fallback: Variant = null) -> Variant:
	return _values.get(name, fallback)


func values() -> Dictionary:
	return _values.duplicate(true)


func has_override(name: String) -> bool:
	return _overrides.has(name)


func set_value(name: String, raw: Variant) -> bool:
	if not _values.has(name):
		return false
	_values[name] = _normalize(name, raw, _values[name])
	_overrides[name] = true
	return true


func set_map_default(name: String, raw: Variant) -> void:
	if _values.has(name) and not _overrides.has(name):
		_values[name] = _normalize(name, raw, _values[name])


func set_reference_distance(distance: float) -> void:
	if not _overrides.has("diffd0"):
		_values["diffd0"] = maxf(0.0, distance * 0.8)
	if not _overrides.has("diffd1"):
		_values["diffd1"] = maxf(0.0, distance * 1.6)


func _normalize(name: String, raw: Variant, fallback: Variant) -> Variant:
	if name == "diffmask":
		var mode := String(raw).to_lower()
		return mode if MASKS.has(mode) else "none"
	if name == "diffdebug":
		if raw is String:
			return raw != "0" and raw.to_lower() != "false" and raw != ""
		return bool(raw)
	var n: float = float(raw)
	if is_nan(n) or is_inf(n):
		n = float(fallback)
	match name:
		"vwarm", "vcool": return clampf(n, 0.0, 30.0)
		"vdesat", "vlift", "diff", "bake": return clampf(n, 0.0, 1.0)
		"diffr", "diffd0", "diffd1", "srad": return maxf(0.0, n)
		"diffe": return maxf(0.0001, n)
	return fallback
