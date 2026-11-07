// 地面と同じ色・光の式で描く、根元が地面へ溶ける草刃。
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, ambient_light_disabled, cull_disabled;
#include "ground_surface.gdshaderinc"

global uniform vec3 wa_splat_st;
uniform sampler2D t_splat : filter_linear, repeat_disable;
uniform sampler2D t_grass_edge : filter_linear, repeat_disable;
uniform vec3 grass_edge_st = vec3(0.0, 0.0, 1.0);
uniform float shell_edge_mottle = 0.8;
uniform float gedge = 0.0;
uniform float gwide = 0.0;
uniform float edge_w = 1.25;
uniform float blade_width = 0.05;
uniform float blade_height = 0.9;

varying vec2 v_root_xz;
varying float v_blade_h;
varying float v_visible_h;

void vertex() {
	vec3 root = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float local_h = VERTEX.y;
	float phase = INSTANCE_CUSTOM.z * TAU;
	vec2 lean = INSTANCE_CUSTOM.xy;
	float bend = blade_height * local_h * local_h * (0.13 + sin(TIME * 1.35 + phase) * 0.025);
	VERTEX.x += lean.x * bend / max(blade_width, 0.001);
	VERTEX.z += lean.y * bend;

	float edge_sd = wa_edge_sd(t_grass_edge, grass_edge_st, root.xz, shell_edge_mottle * 0.35);
	float edge_fade = smoothstep(-0.25, edge_w, edge_sd);
	float edge_keep = step(INSTANCE_CUSTOM.w, mix(0.16, 1.0, edge_fade));
	float patch_f = wa_ground_patch_field(root.xz);
	float patch_h = mix(1.0 - 0.45 * wa_gpatchc, 1.0 + 0.1 * wa_gpatchc, patch_f);
	float view_distance = distance(CAMERA_POSITION_WORLD, root);
	float thin_half = 1.0 - smoothstep(39.0, 48.0, view_distance) * step(0.5, INSTANCE_CUSTOM.w);
	float thin_far = 1.0 - smoothstep(53.0, 60.0, view_distance);
	float visible_h = patch_h * mix(0.22, 1.0, edge_fade) * edge_keep * thin_half * thin_far;
	VERTEX.y *= visible_h;
	v_root_xz = root.xz;
	v_blade_h = local_h;
	v_visible_h = visible_h;
	v_w = root;
	v_wn = vec3(0.0, 1.0, 0.0);
	NORMAL = normalize(mix(vec3(0.0, 1.0, 0.0), NORMAL, 0.3 * smoothstep(0.0, 0.35, local_h)));
}

void fragment() {
	if (v_visible_h < 0.035) discard;
	vec2 uv = (v_root_xz - wa_splat_st.xy) / wa_splat_st.z;
	vec4 splat = texture(t_splat, uv);
	float edge_sd = wa_edge_sd(t_grass_edge, grass_edge_st, v_root_xz, shell_edge_mottle * 0.35);
	float te = wa_ground_path_te(edge_sd, gedge, gwide);
	float gw;
	float shell_gw;
	vec3 grass_col;
	vec3 col = wa_ground_col2(splat, te, gw, grass_col, shell_gw);
	if (gw < 0.12 && te < 0.0) discard;
	float tip = smoothstep(0.0, 1.0, v_blade_h);
	col *= mix(vec3(0.93), vec3(1.10, 1.07, 0.82), tip) * COLOR.rgb;
	ALBEDO = wa_desat(col, wa_albedo_sat);
	EMISSION = wa_ground_emission(ALBEDO, vec3(0.0, 1.0, 0.0));
}

void light() {
	DIFFUSE_LIGHT += wa_lambert_sun(LIGHT_COLOR, ATTENUATION, clamp(dot(NORMAL, LIGHT), 0.0, 1.0));
}
