// 葉と草の房（材質名に leaf・frond・grass）: アルファで抜いた両面の板。
// - 法線は Blender で入れた房の中心から外向きの法線（アイデア04）。裏面でも反転させない（three: normal = normalize(vNormal)）
// - 回り込む光 wrap（アイデア05）、MSAA の alpha to coverage（アイデア10）
// - 葉: 葉の色味 wa_leaf_tint と葉の地色の彩度。草の房（is_grass）: 地面と同じ色むら（lush）と房の色味、根元に地面の色（アイデア01）
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, ambient_light_disabled, cull_disabled, alpha_to_coverage;
#include "common.gdshaderinc"
global uniform float wa_wrap;
global uniform float wa_leaf_sat;
global uniform vec3 wa_leaf_tint;
global uniform vec3 wa_tuft_tint;
global uniform vec3 wa_lush_tint;
global uniform float wa_lush_amt;
global uniform float wa_lush_bias;
global uniform vec3 wa_grass_tint;
global uniform vec3 wa_dirt_tint;
global uniform vec3 wa_alt_tint;
global uniform float wa_alt_scale;
global uniform float wa_gb_amt;
global uniform float wa_gb_h;
global uniform float wa_gb_on;
global uniform vec3 wa_splat_st;
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform bool is_grass = false;
uniform sampler2D t_noise : filter_linear_mipmap, repeat_enable;
uniform sampler2D t_grass : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D t_dirt : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D t_alt : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D t_splat : filter_linear, repeat_disable;
varying vec3 v_vn;
varying vec3 v_wn;
varying vec2 v_root;
varying float v_h;
varying vec3 v_w;
void vertex() {
	v_vn = (MODELVIEW_MATRIX * vec4(NORMAL, 0.0)).xyz;
	v_wn = (MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz;
	vec3 root = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	v_root = root.xz;
	v_h = (MODEL_MATRIX * vec4(VERTEX, 1.0)).y - root.y;
	v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}
void fragment() {
	if (!is_grass && wa_occluded(v_w, FRAGCOORD.xy, CAMERA_POSITION_WORLD)) discard;   // 草は抜かない（three と同じ）
	vec4 t = texture(albedo_tex, UV);
	vec3 c = t.rgb * COLOR.rgb;
	if (is_grass) {
		// three の順（world.js の onBeforeCompile の差し込み順）: 根元の地面の色 → 色むらと房の色味 → 地色の彩度
		vec3 nz = texture(t_noise, v_root / 28.0).rgb;
		float lush = smoothstep(0.42 - wa_lush_bias, 0.6 - wa_lush_bias, nz.r * 0.55 + nz.g * 0.3 + nz.b * 0.15);
		if (wa_gb_on > 0.5) {   // アイデア01: 根元の地面の地色（地面の材質と同じ式。岩は除く）
			vec2 wp = v_root; vec4 sp = texture(t_splat, (wp - wa_splat_st.xy) / wa_splat_st.z);
			vec3 g1 = texture(t_grass, wp / 7.0).rgb, g2 = texture(t_grass, wp / 19.0 + 0.37).rgb;
			vec3 gr = mix(g1, g2, 0.35) * wa_grass_tint;
			gr *= mix(0.86, 1.1, smoothstep(0.25, 0.6, texture(t_grass, wp / 61.0).g));
			gr *= mix(vec3(1.0), wa_lush_tint, lush * wa_lush_amt);
			float n = dot(g1, vec3(0.33)) - 0.33;
			vec3 gcol = mix(gr, texture(t_dirt, wp / 6.0).rgb * wa_dirt_tint, smoothstep(0.4, 0.6, sp.r + n * 0.9));
			gcol = mix(gcol, texture(t_alt, wp / wa_alt_scale).rgb * wa_alt_tint, smoothstep(0.4, 0.6, sp.g + n * 0.9));
			c = mix(c, gcol, wa_gb_amt * (1.0 - smoothstep(0.0, wa_gb_h, v_h)));
		}
		c *= wa_tuft_tint * mix(vec3(1.0), wa_lush_tint, lush * wa_lush_amt);
		ALBEDO = wa_desat(c, wa_albedo_sat);
	} else {
		ALBEDO = wa_desat(c * wa_leaf_tint, wa_leaf_sat);   // three: 葉の色味 → 彩度の順
	}
	ALPHA = t.a;
	ALPHA_SCISSOR_THRESHOLD = 0.25;
	NORMAL = normalize(v_vn);
	EMISSION = wa_hemi(ALBEDO, normalize(v_wn));
}
void light() {
	float d = clamp((dot(NORMAL, LIGHT) + wa_wrap) / (1.0 + wa_wrap), 0.0, 1.0);
	DIFFUSE_LIGHT += LIGHT_COLOR * ATTENUATION * d / PI;
}
