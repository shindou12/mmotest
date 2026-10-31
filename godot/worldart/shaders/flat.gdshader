// 単色の物（試作の人物・敵の仮の形）: three の Lambert と同じ光（太陽 + 空の光）。点描で抜かない
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, ambient_light_disabled;
#include "common.gdshaderinc"
uniform vec4 base_color : source_color = vec4(1.0);
varying vec3 v_wn;
void vertex() { v_wn = (MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz; }
void fragment() {
	ALBEDO = base_color.rgb;
	EMISSION = wa_hemi(ALBEDO, normalize(v_wn));
}
void light() { DIFFUSE_LIGHT += LIGHT_COLOR * ATTENUATION * clamp(dot(NORMAL, LIGHT), 0.0, 1.0) / PI; }
