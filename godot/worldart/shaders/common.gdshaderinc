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
global uniform vec3 wa_shtint;
global uniform float wa_shpen;
global uniform vec3 wa_shpenc;
global uniform float wa_ramp;
global uniform float wa_rampt;
global uniform float wa_rampw;
global uniform float wa_gcomb;
global uniform float wa_gpatch;
global uniform float wa_gpatchc;

vec3 wa_desat(vec3 c, float s) { float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return mix(vec3(l), c, s); }
vec3 wa_hemi(vec3 albedo, vec3 n_world) {
	return albedo * mix(wa_hemi_ground, wa_hemi_sky, 0.5 + 0.5 * n_world.y) * wa_hemi_int / PI;
}

// world.js の lights_lambert_pars_fragment（明暗の段）と lights_fragment_begin（影色・半影色）を移植。
vec3 wa_lambert_sun(vec3 light_color, float shadow_factor, float dot_nl) {
	float sty_nl = dot_nl;
	if (wa_ramp > 0.5) {
		sty_nl = smoothstep(wa_rampt - wa_rampw, wa_rampt + wa_rampw, dot_nl);
	}
	float sty_s = clamp(shadow_factor, 0.0, 1.0);
	vec3 irradiance = mix(wa_shtint, vec3(1.0), sty_s);
	float shadow_band = wa_shpen * 4.0 * sty_s * (1.0 - sty_s);
	float nl = clamp(sty_nl, 0.0, 1.0);
	float nl_band = wa_shpen * 4.0 * nl * (1.0 - nl);
	irradiance *= mix(vec3(1.0), wa_shpenc, shadow_band);
	irradiance *= mix(vec3(1.0), wa_shpenc, nl_band);
	return light_color * irradiance * sty_nl / PI;
}

// 手前の物を点描で抜く（world.js の occChunk と同じ式）: カメラと注目点（人物）を結ぶ線の近く（半径 wa_occ_r）にある物を 4×4 のディザで消す。
// 影の描画（光のカメラ）では抜かない: いまのカメラの位置が wa_occ_cam と同じときだけ効かせる
global uniform vec3 wa_occ_cam;
global uniform vec3 wa_occ_tgt;
global uniform float wa_occ_r;
bool wa_occluded(vec3 w, vec2 fc, vec3 cam_now) {
	if (wa_occ_r <= 0.0 || distance(cam_now, wa_occ_cam) > 0.5) return false;
	vec3 ab = wa_occ_tgt - wa_occ_cam; float L = length(ab); vec3 d = ab / L;
	float t = dot(w - wa_occ_cam, d);
	if (t > 0.0 && t < L - 1.0) {
		float r = length(w - (wa_occ_cam + d * t));
		float k = 1.0 - smoothstep(wa_occ_r * 0.6, wa_occ_r, r);
		vec2 q = mod(floor(fc), 4.0);
		float bay = mod(q.x * 4.0 + q.y * 7.0 + q.x * q.y * 3.0, 16.0) / 16.0;
		return k * 1.2 > bay + 0.02;
	}
	return false;
}
