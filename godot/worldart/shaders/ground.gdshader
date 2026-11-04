// 地面（world.js の groundMaterial と同じ式）。色の式は ground_surface.gdshaderinc（草のシェル ground_shell.gdshader と共有）
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, ambient_light_disabled;
#include "ground_surface.gdshaderinc"
void vertex() { v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; v_wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz); }
void fragment() {
	float gw;
	vec3 col = wa_ground_col(COLOR, gw);
	ALBEDO = wa_desat(col, wa_albedo_sat);
	EMISSION = wa_ground_emission(ALBEDO, normalize(v_wn));
}
void light() { DIFFUSE_LIGHT += LIGHT_COLOR * ATTENUATION * clamp(dot(NORMAL, LIGHT), 0.0, 1.0) / PI; }
