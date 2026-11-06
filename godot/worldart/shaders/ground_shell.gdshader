// 草のシェル（world.js の groundMaterial の shell 版、rulebook 8.3 / review-L29 8）。地面を層ごとに法線方向へ持ち上げて重ねる。
// 層 i（0 始まりのインスタンス番号）の h = (i+1)/層数。色は土台と同じ式で、高さテクスチャで刃を抜く。
// 頂点は区画の中心からの位置で持つ（world.gd が焼く）。MODEL_MATRIX は区画の中心への平行移動だけ
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, ambient_light_disabled;
#include "ground_surface.gdshaderinc"
uniform float shell_layers = 16.0;
uniform float shell_height = 0.18;   // 草の高さ（m）
uniform float shell_spacing = 0.045;   // 草 1 本の間隔（m）
uniform sampler2D t_grass_strokes : filter_linear_mipmap, repeat_enable;
uniform sampler2D t_grass_edge : filter_linear, repeat_disable;   // R=ぼかした草の重み（1 草 0 土・砂）G=まだらの種
uniform vec3 grass_edge_st = vec3(0.0, 0.0, 1.0);   // x0, z0, 一辺
uniform float shell_edge_mottle = 0.8;
uniform float edge_w = 1.25;   // 草が短くなる幅（m）
uniform float gedge = 0.0;
uniform float gwide = 0.0;
varying flat float v_h;
// 0.65m の値ノイズで草の房を作り、端だけ刃ごとの揺れを足す
float shellEdgeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float shellEdgeClump(vec2 p) {
	vec2 cell = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = shellEdgeHash(cell), b = shellEdgeHash(cell + vec2(1.0, 0.0));
	float c = shellEdgeHash(cell + vec2(0.0, 1.0)), d = shellEdgeHash(cell + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void vertex() {
	v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;   // 色は持ち上げる前の位置で引く（土台と同じ絵になる）
	v_wn = normalize(NORMAL);
	v_h = float(INSTANCE_ID + 1) / shell_layers;
	VERTEX += NORMAL * shell_height * v_h;
	if (wa_gcomb > 0.0) {
		vec2 comb_dir = textureLod(t_noise, v_w.xz / 11.0, 0.0).rg * 2.0 - 1.0 + vec2(0.55, 0.35);
		VERTEX.xz += normalize(comb_dir) * wa_gcomb * v_h * v_h;   // M-0179: 上の層ほど横へずらし、色は v_w の元位置から取る
	}
	NORMAL = vec3(0.0, 1.0, 0.0);   // 光は上向きの法線で
}
void fragment() {
	vec2 wp = v_w.xz;
	vec2 cell = floor(wp / shell_spacing);
	float seed = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
	float seed2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453);
	float patch_f = wa_ground_patch_field(wp);
	float patch_height = mix(1.0 - 0.45 * wa_gpatchc, 1.0 + 0.1 * wa_gpatchc, patch_f);
	float height_var = mix(0.5, 1.0, texture(t_noise, wp / 2.0).r) * patch_height;
	vec2 comb_dir = normalize(texture(t_noise, wp / 11.0).rg * 2.0 - 1.0 + vec2(0.55, 0.35));
	vec2 comb_across = vec2(-comb_dir.y, comb_dir.x);
	vec2 stroke_uv = vec2(dot(wp, comb_across), dot(wp, comb_dir)) / 1.8;
	stroke_uv += (texture(t_noise, wp / 3.7).rg * 2.0 - 1.0) * 0.045;
	float stroke_height = max(texture(t_grass_strokes, stroke_uv).r,
		texture(t_grass_strokes, stroke_uv * 0.73 + vec2(0.37, 0.61)).r * 0.55);
	if (stroke_height * height_var < v_h) discard;   // Acerola の shell texturing と同じ高さマップの閾値化
	// 草と土の境: 縁までの符号つき距離 sd（m。草の内側が正）で、草を縁へ向けて edge_w かけて短くし、まだらに崩す
	float edge_mottle = shell_edge_mottle * (gedge > 0.0 && gwide > 0.0 ? 0.35 : 1.0);
	float sd = wa_edge_sd(t_grass_edge, grass_edge_st, wp, edge_mottle);
	float te = wa_ground_path_te(sd, gedge, gwide);
	float ek = smoothstep(-0.25, edge_w, sd);
	float edge = 1.0 - ek;
	if (te < 0.0 && (ek < v_h || fract(seed * 57.3 + seed2 * 91.7) > mix(0.35, 1.0, ek))) discard;   // gedge 無効時は M-0006 の縁を保つ
	float gw;
	vec3 grass;
	float shell_gw;
	vec3 col = wa_ground_col2(COLOR, te, gw, grass, shell_gw);
	if (te >= 0.0) {
		float seed3 = fract(seed * 57.3 + seed2 * 91.7);
		float keep_threshold = 1.0 - pow(1.0 - te, 1.4) * 1.08;
		float clump_jitter = (seed3 - 0.5) * 0.15 * (1.0 - smoothstep(0.85, 1.0, te));
		if (shellEdgeClump(wp / 0.65) < keep_threshold + clump_jitter) discard;   // 房の縁だけ刃ごとに少し崩す
		float edge_height = mix(1.0, 0.25, te);
		if (shell_gw * edge_height * height_var < v_h) discard;
		vec3 edge_grass = grass * mix(vec3(1.0), vec3(1.12, 1.0, 0.68), smoothstep(0.0, 0.7, te));
		col = mix(edge_grass, col, smoothstep(0.0, 1.0, te));   // 刃の色を足元の黄ばんだ草・土へ寄せる
		col *= mix(mix(0.85, 1.0, v_h), mix(0.95, 1.0, v_h), te);   // 根元の暗さを弱め、道の側はさらに浅くする
	} else {
		if (gw * height_var < v_h && ek >= 1.0) discard;   // 内側は今まで通り
		col = mix(grass, col, smoothstep(0.0, 1.0, gw));   // 土の上へかぶさる縁は草の色
		col *= mix(mix(0.85, 1.0, v_h), 1.0, smoothstep(0.0, 0.6, edge));   // 縁は根元を暗くしない
	}
	col = mix(col, col * vec3(1.04, 1.02, 0.95), smoothstep(0.6, 1.0, v_h));
	if (te < 0.0) col = mix(col, col * vec3(1.14, 0.98, 0.52), edge);   // gedge 無効時は M-0006 の黄・オリーブ寄りを保つ
	ALBEDO = wa_desat(col, wa_albedo_sat);
	EMISSION = wa_ground_emission(ALBEDO, vec3(0.0, 1.0, 0.0));
}
void light() { DIFFUSE_LIGHT += wa_lambert_sun(LIGHT_COLOR, ATTENUATION, clamp(dot(NORMAL, LIGHT), 0.0, 1.0)); }
