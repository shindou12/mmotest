// world.js の waterMaterialG2 と同じ深さ・波・泡の式。
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, ambient_light_disabled, cull_disabled;
#include "common.gdshaderinc"
uniform sampler2D t_wh : filter_linear, repeat_disable;
uniform sampler2D t_sand : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec4 u_wt;        // x0, z0, size, shoreMax
uniform vec3 u_whr;       // hmin, hmax, 水面の高さ
uniform vec3 u_wshallow;
uniform vec3 u_wdeep;
uniform vec3 u_wsky;
uniform float u_wshadow = 1.0;
varying vec3 v_w;
varying vec3 v_wn;

void vertex() {
	v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec2 huv = vec2((v_w.x - u_wt.x) / u_wt.z, (v_w.z - u_wt.y) / u_wt.z);
	float th = mix(u_whr.x, u_whr.y, texture(t_wh, huv).r);
	float depth = u_whr.z - th;
	float nz = texture(t_sand, v_w.xz / 9.0 + TIME * 0.01).r;
	vec3 wc = mix(u_wshallow, u_wdeep, smoothstep(0.1, 2.2, depth + (nz - 0.5) * 0.6));
	float band = smoothstep(0.32, 0.0, depth + (nz - 0.5) * 0.35);
	float wave = fract(depth * 1.6 - TIME * 0.25 + nz * 0.5);
	float line = smoothstep(0.12, 0.0, abs(wave - 0.5)) * smoothstep(1.4, 0.2, depth);
	float foam = clamp(band + line * step(0.55, nz), 0.0, 1.0);
	vec3 water = mix(wc, vec3(0.95, 0.97, 0.95), foam);
	float alpha = clamp(mix(0.62, 0.95, smoothstep(0.0, 1.2, depth)) + foam * 0.3, 0.0, 1.0);
	ALBEDO = water * alpha;
	EMISSION = wa_hemi(water, normalize(v_wn)) * alpha + u_wsky * (1.0 - alpha);
}

void light() {
	float att = u_wshadow > 0.5 ? ATTENUATION : 1.0;
	DIFFUSE_LIGHT += LIGHT_COLOR * att * clamp(dot(NORMAL, LIGHT), 0.0, 1.0) / PI;
}
