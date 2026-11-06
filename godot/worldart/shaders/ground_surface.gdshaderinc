// 地面の色（world.js の groundMaterial と同じ式）。土台の ground.gdshader と草のシェル ground_shell.gdshader が共有する。
// 頂点色 R=土の道 G=砂/石畳 B=岩肌 A=岩肌を残す割合。
// 草の絵は三方向から 2 つの大きさ（7m・19m）、61m の大きなむら、28m の茂った緑の斑（lush）。境は草の絵の明るさで崩す。
// 岩肌は rockPix: 画素ごとの三角の面の向き（dFdx/dFdy）× 頂点色 A × 苔の斑（F23）
#include "common.gdshaderinc"
global uniform vec3 wa_grass_tint;
global uniform vec3 wa_dirt_tint;
global uniform vec3 wa_alt_tint;
global uniform vec3 wa_rock_tint;
global uniform vec3 wa_lush_tint;
global uniform float wa_lush_amt;
global uniform float wa_lush_bias;
global uniform float wa_alt_scale;
global uniform float wa_rock_scale;
global uniform float wa_rock_pix;
global uniform vec2 wa_water;   // 水面の高さ・水があるか（world.js uWater）
uniform sampler2D t_grass : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D t_dirt : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D t_alt : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D t_rock : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D t_noise : filter_linear_mipmap, repeat_enable;
uniform sampler2D t_skyvis : filter_linear, repeat_disable;
uniform vec2 skyvis_origin = vec2(0.0);
uniform float skyvis_size = 1.0;
uniform float bake = 0.0;
uniform bool skyvis_on = false;
varying vec3 v_w;
varying vec3 v_wn;

vec3 wa_water_adjust(vec3 col) {
	if (wa_water.y > 1.5) {   // 水の規則 w1: 水の上の水際だけ明るく、水の下の底は沈んで暗い
		float hw = v_w.y - wa_water.x;
		float wet = smoothstep(0.16, 0.0, hw) * smoothstep(-0.12, 0.02, hw);
		col = mix(col, col * 1.12 + vec3(0.06, 0.06, 0.04), wet * 0.7);
		col *= mix(1.0, 0.5, smoothstep(0.0, -0.7, hw));
	} else if (wa_water.y > 0.5) {   // 水際の濡れた地面（第 2 世代）
		float wet = smoothstep(0.55, 0.05, v_w.y - wa_water.x);
		col *= mix(vec3(1.0), vec3(0.72, 0.74, 0.76), wet);
	}
	return col;
}

// world.js の groundMaterial()（M-0179）と同じ二つの大きさのノイズで、草地の斑を作る。
float wa_ground_patch_field(vec2 wp) {
	if (wa_gpatch <= 0.0) return 0.5;
	vec3 pz = texture(t_noise, wp / wa_gpatch).rgb;
	vec3 pz2 = texture(t_noise, wp / (wa_gpatch * 2.7) + 0.31).rgb;
	return smoothstep(0.4, 0.6, pz.r * 0.6 + pz2.g * 0.4);
}

// 地面の色。gw は草が生える重み（土・砂・岩肌のどれでもない割合）。シェルが使う
vec3 wa_ground_col2(vec4 splat, out float gw, out vec3 grass_col) {
	vec2 wp = v_w.xz;
	vec3 an = abs(normalize(v_wn)); an = an * an; an /= (an.x + an.y + an.z);
	vec3 g1 = texture(t_grass, v_w.zy / 7.0).rgb * an.x + texture(t_grass, v_w.xy / 7.0).rgb * an.z + texture(t_grass, wp / 7.0).rgb * an.y;
	vec3 g2 = texture(t_grass, v_w.zy / 19.0 + 0.37).rgb * an.x + texture(t_grass, v_w.xy / 19.0 + 0.37).rgb * an.z + texture(t_grass, wp / 19.0 + 0.37).rgb * an.y;
	vec3 grass = mix(g1, g2, 0.35) * wa_grass_tint;
	float big = texture(t_grass, wp / 61.0).g;
	grass *= mix(0.86, 1.1, smoothstep(0.25, 0.6, big));
	vec3 nz3 = texture(t_noise, wp / 28.0).rgb;
	float lush = smoothstep(0.42 - wa_lush_bias, 0.6 - wa_lush_bias, nz3.r * 0.55 + nz3.g * 0.3 + nz3.b * 0.15);
	grass *= mix(vec3(1.0), wa_lush_tint, lush * wa_lush_amt);
	vec3 dirt = texture(t_dirt, wp / 6.0).rgb * wa_dirt_tint;
	vec3 alt = texture(t_alt, wp / wa_alt_scale).rgb * wa_alt_tint;
	vec3 rock = texture(t_rock, v_w.zy / wa_rock_scale).rgb * an.x + texture(t_rock, v_w.xy / wa_rock_scale).rgb * an.z + texture(t_rock, v_w.xz / wa_rock_scale).rgb * an.y;
	float n = dot(g1, vec3(0.33)) - 0.33;
	float wd = smoothstep(0.4, 0.6, splat.r + n * 0.9);
	float wa = smoothstep(0.4, 0.6, splat.g + n * 0.9);
	float rk = splat.b;
	if (wa_rock_pix > 0.5) {
		vec3 mz = texture(t_noise, v_w.zy / 3.5).rgb * an.x + texture(t_noise, v_w.xy / 3.5).rgb * an.z + texture(t_noise, wp / 3.5).rgb * an.y;
		vec3 gn = normalize(cross(dFdx(v_w), dFdy(v_w)));
		rk = smoothstep(0.9, 0.75, abs(gn.y)) * splat.a * (1.0 - smoothstep(0.56, 0.66, mz.r * 0.6 + mz.g * 0.4));
	}
	float wr = smoothstep(0.35, 0.65, rk + n * 0.6);
	gw = (1.0 - wd) * (1.0 - wa) * (1.0 - wr);
	float patch_f = wa_ground_patch_field(wp);
	vec3 patch_tint = mix(vec3(0.62, 0.8, 0.86), vec3(1.12, 1.08, 0.86), patch_f);
	vec3 col = mix(grass, dirt, wd);
	col = mix(col, alt, wa);
	col = mix(col, rock * wa_rock_tint, wr);
	if (wa_gpatch > 0.0 && wa_gpatchc > 0.0) {
		col = mix(col, col * patch_tint, gw * wa_gpatchc);
	}
	col = wa_water_adjust(col);
	grass_col = wa_water_adjust(grass * mix(vec3(1.0), patch_tint, wa_gpatchc));
	return col;
}

vec3 wa_ground_col(vec4 splat, out float gw) {
	vec3 g;
	return wa_ground_col2(splat, gw, g);
}

// 草の縁までの符号つき距離（m。草の内側が正）に、0.5〜1.5m のまだらを足したもの。g は CPU の絵の G（格子のノイズ）
float wa_edge_sd(sampler2D edge_tex, vec3 st, vec2 wp, float mottle) {
	vec2 ed = texture(edge_tex, (wp - st.xy) / st.z).rg;
	float n1 = mix(ed.g, texture(t_noise, wp / 1.3 + 0.31).r, 0.5);
	float n2 = texture(t_noise, wp / 0.6 + 0.77).r;
	return (ed.r - 0.5) * 6.0 + ((n1 - 0.5) * 1.3 + (n2 - 0.5) * 0.7) * mottle * 2.0;
}

// 空の光（半球光）。skyvis の焼きで弱める。n は世界の法線
vec3 wa_ground_emission(vec3 albedo, vec3 n) {
	vec3 e = wa_hemi(albedo, n);
	if (skyvis_on && bake > 0.0) {
		float sky_visibility = texture(t_skyvis, (v_w.xz - skyvis_origin) / skyvis_size).r;
		e *= mix(1.0, sky_visibility, bake);
	}
	return e;
}
