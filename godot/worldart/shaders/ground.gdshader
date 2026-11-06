// 地面（world.js の groundMaterial と同じ式）。色の式は ground_surface.gdshaderinc（草のシェル ground_shell.gdshader と共有）
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, ambient_light_disabled;
#include "ground_surface.gdshaderinc"
uniform sampler2D t_grass_edge : filter_linear, repeat_disable;   // 草のシェルがあるときだけ world.gd が渡す（R=ぼかした草の重み）
uniform vec3 grass_edge_st = vec3(0.0, 0.0, 1.0);
uniform float edge_tint = 0.0;
uniform float edge_w = 1.25;
uniform float shell_edge_mottle = 0.8;   // 0 なら従来と同じ
uniform float gedge = 0.0;
uniform float gwide = 0.0;
void vertex() { v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; v_wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz); }
void fragment() {
	float gw;
	float te = -1.0;
	if (gedge > 0.0 && gwide > 0.0) {
		float sd = wa_edge_sd(t_grass_edge, grass_edge_st, v_w.xz, shell_edge_mottle * 0.35);
		te = wa_ground_path_te(sd, gedge, gwide);
	}
	vec3 col = wa_ground_col(COLOR, te, gw);
	if (edge_tint > 0.0 && te < 0.0) {   // gedge 無効時は M-0006 の黄・オリーブ寄りを保つ
		float sd = wa_edge_sd(t_grass_edge, grass_edge_st, v_w.xz, shell_edge_mottle);
		float ek = smoothstep(-0.25, edge_w, sd);
		col = mix(col, col * vec3(1.0, 0.86, 0.46), (1.0 - ek) * gw);   // 黄・オリーブ寄りに、シェルの草の平均の明るさへ寄せる
	}
	ALBEDO = wa_desat(col, wa_albedo_sat);
	EMISSION = wa_ground_emission(ALBEDO, normalize(v_wn));
}
void light() { DIFFUSE_LIGHT += wa_lambert_sun(LIGHT_COLOR, ATTENUATION, clamp(dot(NORMAL, LIGHT), 0.0, 1.0)); }
