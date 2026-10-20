// 葉・草でない物（幹・木の板・石・宝箱など）: 絵 × 頂点色（AO）、地色の彩度。three の MeshLambertMaterial と同じ
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, ambient_light_disabled;
#include "common.gdshaderinc"
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
varying vec3 v_wn;
void vertex() { v_wn = (MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz; }
void fragment() {
	vec3 c = texture(albedo_tex, UV).rgb * COLOR.rgb;
	ALBEDO = wa_desat(c, wa_albedo_sat);
	EMISSION = wa_hemi(ALBEDO, normalize(v_wn));
}
void light() { DIFFUSE_LIGHT += LIGHT_COLOR * ATTENUATION * clamp(dot(NORMAL, LIGHT), 0.0, 1.0) / PI; }
