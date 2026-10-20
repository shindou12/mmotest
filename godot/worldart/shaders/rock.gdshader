// 岩（材質 rock_crack）: 割れ目の絵を世界座標の三方向から貼り（1.6m で 1 回）、上を向いた面に苔（草の絵）。頂点色は AO
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, ambient_light_disabled;
#include "common.gdshaderinc"
uniform sampler2D t_crack : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D t_moss : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
varying vec3 v_w;
varying vec3 v_wn;
void vertex() { v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; v_wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz); }
void fragment() {
	if (wa_occluded(v_w, FRAGCOORD.xy, CAMERA_POSITION_WORLD)) discard;
	vec3 n = normalize(v_wn);
	vec3 an = pow(abs(n), vec3(3.0)); an /= (an.x + an.y + an.z);
	vec3 rc = texture(t_crack, v_w.zy / 1.6).rgb * an.x + texture(t_crack, v_w.xy / 1.6).rgb * an.z + texture(t_crack, v_w.xz / 1.6).rgb * an.y;
	vec3 moss = texture(t_moss, v_w.xz / 5.0).rgb * vec3(1.05, 1.08, 0.85);
	float mk = smoothstep(0.55, 0.85, n.y + (texture(t_moss, v_w.xz / 2.3).g - 0.5) * 0.5);
	ALBEDO = wa_desat(COLOR.rgb * mix(rc, moss, mk), wa_albedo_sat);
	EMISSION = wa_hemi(ALBEDO, n);
}
void light() { DIFFUSE_LIGHT += LIGHT_COLOR * ATTENUATION * clamp(dot(NORMAL, LIGHT), 0.0, 1.0) / PI; }
