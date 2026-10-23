// world.js の waterMaterialW1 と同じ深さ・波・岸の泡・反射の式。
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, ambient_light_disabled, cull_disabled;
#include "common.gdshaderinc"
uniform sampler2D t_noise : filter_linear_mipmap, repeat_enable;
uniform float u_wshadow = 0.0;
varying vec3 v_w;
#include "water_w1.gdshaderinc"

void vertex() {
	v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 water;
	vec3 reflection;
	float alpha;
	wa_water_w1(v_w, CAMERA_POSITION_WORLD, TIME, water, reflection, alpha);
	alpha = clamp(alpha, 0.0, 1.0);
	ALBEDO = water * alpha;
	EMISSION = wa_hemi(water, vec3(0.0, 1.0, 0.0)) * alpha + reflection * alpha + u_wsky * (1.0 - alpha);
}

void light() {
	float att = u_wshadow > 0.5 ? ATTENUATION : 1.0;
	DIFFUSE_LIGHT += wa_sun_col * att * max(wa_sun_dir.y, 0.0) / PI;
}
