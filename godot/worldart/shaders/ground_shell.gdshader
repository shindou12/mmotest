// 草のシェル（world.js の groundMaterial の shell 版、rulebook 8.3 / review-L29 8）。地面を層ごとに法線方向へ持ち上げて重ねる。
// 層 i（0 始まりのインスタンス番号）の h = (i+1)/層数。色は土台と同じ式で、草の重みと小さな円で抜く。
// 頂点は区画の中心からの位置で持つ（world.gd が焼く）。MODEL_MATRIX は区画の中心への平行移動だけ
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, ambient_light_disabled;
#include "ground_surface.gdshaderinc"
uniform float shell_layers = 16.0;
uniform float shell_height = 0.18;   // 草の高さ（m）
uniform float shell_spacing = 0.045;   // 草 1 本の間隔（m）
varying flat float v_h;
void vertex() {
	v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;   // 色は持ち上げる前の位置で引く（土台と同じ絵になる）
	v_wn = normalize(NORMAL);
	v_h = float(INSTANCE_ID + 1) / shell_layers;
	VERTEX += NORMAL * shell_height * v_h;
	NORMAL = vec3(0.0, 1.0, 0.0);   // 光は上向きの法線で
}
void fragment() {
	vec2 wp = v_w.xz;
	vec2 cell = floor(wp / shell_spacing);
	vec2 local = fract(wp / shell_spacing);
	float seed = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
	float seed2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453);
	vec2 center = vec2(0.18 + seed * 0.64, 0.18 + seed2 * 0.64);
	float radius = 0.46 * (1.0 - 0.78 * v_h);
	float height_var = mix(0.5, 1.0, texture(t_noise, wp / 2.0).r);
	if (distance(local, center) > radius || height_var < v_h) discard;   // gw <= 1 なので、重い色の式の前に先に抜く
	float gw;
	vec3 col = wa_ground_col(COLOR, gw);
	if (gw * height_var < v_h) discard;
	col *= mix(0.72, 1.0, v_h);
	col = mix(col, col * vec3(1.08, 1.06, 0.85), smoothstep(0.6, 1.0, v_h));
	ALBEDO = wa_desat(col, wa_albedo_sat);
	EMISSION = wa_ground_emission(ALBEDO, vec3(0.0, 1.0, 0.0));
}
void light() { DIFFUSE_LIGHT += LIGHT_COLOR * ATTENUATION * clamp(dot(NORMAL, LIGHT), 0.0, 1.0) / PI; }
