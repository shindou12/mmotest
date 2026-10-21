// 地面（world.js の groundMaterial と同じ式）: 頂点色 R=土の道 G=砂/石畳 B=岩肌 A=岩肌を残す割合。
// 草の絵は三方向から 2 つの大きさ（7m・19m）、61m の大きなむら、28m の茂った緑の斑（lush）。境は草の絵の明るさで崩す。
// 岩肌は rockPix: 画素ごとの三角の面の向き（dFdx/dFdy）× 頂点色 A × 苔の斑（F23）
shader_type spatial;
render_mode diffuse_lambert, specular_disabled, ambient_light_disabled;
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
#include "water_w1.gdshaderinc"
varying vec3 v_w;
varying vec3 v_wn;
void vertex() { v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; v_wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz); }
void fragment() {
	vec4 splat = COLOR;
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
	vec3 col = mix(grass, dirt, wd);
	col = mix(col, alt, wa);
	col = mix(col, rock * wa_rock_tint, wr);
	if (wa_water.y > 1.5) {   // 水の規則 w1: 水の上の水際だけ明るく、水の下の底は沈んで暗い
		float hw = v_w.y - wa_water.x;
		float wet = smoothstep(0.16, 0.0, hw) * smoothstep(-0.12, 0.02, hw);
		col = mix(col, col * 1.12 + vec3(0.06, 0.06, 0.04), wet * 0.7);
		col *= mix(1.0, 0.5, smoothstep(0.0, -0.7, hw));
	} else if (wa_water.y > 0.5) {   // 水際の濡れた地面（第 2 世代）
		float wet = smoothstep(0.55, 0.05, v_w.y - wa_water.x);
		col *= mix(vec3(1.0), vec3(0.72, 0.74, 0.76), wet);
	}
	ALBEDO = wa_desat(col, wa_albedo_sat);
	EMISSION = wa_hemi(ALBEDO, normalize(v_wn));
	if (wa_water.y > 1.5 && u_wt.z > 0.0 && v_w.y < wa_water.x) {   // 水の下: 水面（y = 水の高さ）の色を不透明度で重ねる（water_w1.gdshaderinc）
		vec3 cam = CAMERA_POSITION_WORLD;
		vec3 dv = v_w - cam;
		float tt = (wa_water.x - cam.y) / dv.y;
		if (tt > 0.0 && tt < 1.0) {
			vec3 wlit; float wal;
			wa_water_w1(cam + dv * tt, cam, u_wtime >= 0.0 ? u_wtime : TIME, wlit, wal);
			EMISSION = EMISSION * (1.0 - wal) + wlit * wal;
			ALBEDO *= 1.0 - wal;
		}
	}
}
void light() { DIFFUSE_LIGHT += LIGHT_COLOR * ATTENUATION * clamp(dot(NORMAL, LIGHT), 0.0, 1.0) / PI; }
