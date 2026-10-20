// three.js（public/worldart/world.js）と同じ光の式。光の値は scripts/world.gd が地図の JSON から入れる。
// - 太陽: Lambert。Godot の LIGHT_COLOR は「色 × 強さ × π」なので、太陽の強さは three の強さ / π にして、ここで π で割る
//   （three: 地色 / π × 照度。照度 = 色 × 強さ × cosθ）
// - 空の光（three の HemisphereLight）: 地色 × mix(地面の色, 空の色, 0.5 + 0.5 × 法線の上向き) × 強さ / π。EMISSION に足す
//   （環境光は 0 にしている。scenes/main.tscn の Environment）
// - 回り込む光 wrap（葉と草の房だけ、rulebook 4.4）
global uniform vec3 wa_hemi_sky;
global uniform vec3 wa_hemi_ground;
global uniform float wa_hemi_int;
global uniform float wa_albedo_sat;

vec3 wa_desat(vec3 c, float s) { float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return mix(vec3(l), c, s); }
vec3 wa_hemi(vec3 albedo, vec3 n_world) {
	return albedo * mix(wa_hemi_ground, wa_hemi_sky, 0.5 + 0.5 * n_world.y) * wa_hemi_int / PI;
}
