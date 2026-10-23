// 仕上げ（world.js の OutputPass → grade → DiffusionPass → dof と同じ順）。
// 画面全体を覆う板に貼る。diffusion source の板は source_only で grade だけを出す。
shader_type spatial;
render_mode unshaded, depth_test_disabled, depth_draw_never, skip_vertex_transform, cull_disabled, fog_disabled, shadows_disabled;
uniform sampler2D screen : hint_screen_texture, filter_linear;
uniform sampler2D depth_texture : hint_depth_texture, filter_nearest;
uniform sampler2D t_blur : filter_linear;
uniform sampler2D t_mask : filter_linear;
uniform int tone = 0;                 // 0 = linear、1 = aces
uniform float exposure = 1.25;
uniform float sat = 0.92;
uniform float contrast = 1.0;
uniform vec3 lift = vec3(0.0);
uniform vec3 gain = vec3(1.0);
uniform float vignette = 0.0;
uniform float top_dark = 0.0;
uniform float dof_amt = 1.0;
uniform float dof_top = 0.30;
uniform float dof_bot = 0.80;
uniform vec4 haze = vec4(0.8, 0.86, 0.9, 0.0);
uniform bool enabled = true;
uniform bool dof_on = true;
uniform bool source_only = false;
uniform float vwarm = 0.0;
uniform float vcool = 0.0;
uniform float vdesat = 0.0;
uniform float vlift = 0.0;
uniform float diff_amt = 0.0;
uniform int diff_mask_mode = 0;       // none, depth, edge, veg, soft, lum
uniform float diffd0 = 1.0;
uniform float diffd1 = 2.0;
uniform float diffe = 0.08;
uniform bool diff_debug = false;
uniform float camera_near = 0.3;
uniform float camera_far = 600.0;
uniform float camera_tan_half_fov = 0.4142;
uniform vec2 viewport_size = vec2(1532.0, 869.0);

vec3 to_srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
vec3 to_lin(vec3 c) { return mix(c / 12.92, pow(max((c + 0.055) / 1.055, vec3(0.0)), vec3(2.4)), step(vec3(0.04045), c)); }
vec3 rrt_odt(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c) {   // three.js r160 ACESFilmicToneMapping（露出 / 0.6）
	const mat3 IN_M = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
	const mat3 OUT_M = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
	c *= exposure / 0.6;
	return clamp(OUT_M * rrt_odt(IN_M * c), 0.0, 1.0);
}
vec3 rgb_to_hsv(vec3 c) {
	vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
	vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
	vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
	float d = q.x - min(q.w, q.y);
	return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv_to_rgb(vec3 c) {
	vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
	return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec3 graded(vec2 uv) {
	vec3 h = texture(screen, uv).rgb;
	vec3 c = to_srgb(tone == 1 ? aces(h) : clamp(h * exposure, 0.0, 1.0));
	if (!enabled) return c;
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	c = mix(vec3(l), c, sat);
	c = (c - 0.5) * contrast + 0.5;
	c += lift * (1.0 - l);
	c *= mix(vec3(1.0), gain, smoothstep(0.2, 0.8, l));
	if (vwarm != 0.0 || vdesat != 0.0 || vlift != 0.0 || vcool != 0.0) {
		float warm = smoothstep(0.22, 0.50, l);
		float light = smoothstep(0.55, 0.82, l);
		vec3 hsv = rgb_to_hsv(c);
		float hue = hsv.x * 360.0;
		float green_yellow = smoothstep(34.0, 46.0, hue) * (1.0 - smoothstep(100.0, 112.0, hue)) * smoothstep(0.18, 0.36, hsv.y);
		hsv.x = fract(hsv.x + (vcool * (1.0 - warm) - vwarm * warm) * green_yellow / 360.0);
		hsv.y *= 1.0 - vdesat * light;
		hsv.z = 1.0 - (1.0 - hsv.z) * exp(-1.2 * vlift * light);
		c = hsv_to_rgb(hsv);
	}
	c *= 1.0 - vignette * smoothstep(0.3, 0.85, length((uv - 0.5) * vec2(1.25, 1.0)));
	c *= 1.0 - top_dark * smoothstep(0.62, 1.0, 1.0 - uv.y);
	return clamp(c, 0.0, 1.0);
}

float depth_blend(vec2 uv) {
	float raw = texture(depth_texture, uv).r;
	if (raw <= 0.000001) return 1.0; // reverse-Z の空は far
	float axial_depth = camera_near * camera_far / (raw * (camera_far - camera_near) + camera_near);
	vec2 ndc = uv * 2.0 - 1.0;
	float aspect = viewport_size.x / viewport_size.y;
	float ray_length = length(vec3(ndc.x * aspect * camera_tan_half_fov, ndc.y * camera_tan_half_fov, 1.0));
	return smoothstep(diffd0, max(diffd0 + 0.001, diffd1), axial_depth * ray_length);
}
float luminance_at(vec2 uv) {
	return dot(graded(uv), vec3(0.2126, 0.7152, 0.0722));
}
float raw_mask(vec2 uv) {
	if (diff_mask_mode == 1) return depth_blend(uv);
	if (diff_mask_mode == 2) {
		vec2 px = 1.0 / viewport_size;
		float gx = abs(luminance_at(uv + vec2(px.x, 0.0)) - luminance_at(uv - vec2(px.x, 0.0))) * 0.5;
		float gy = abs(luminance_at(uv + vec2(0.0, px.y)) - luminance_at(uv - vec2(0.0, px.y))) * 0.5;
		return 1.0 - smoothstep(diffe, diffe * 2.0, length(vec2(gx, gy)));
	}
	if (diff_mask_mode == 3) return texture(t_mask, uv).r;
	if (diff_mask_mode == 4) return depth_blend(uv) * texture(t_mask, uv).r;
	if (diff_mask_mode == 5) {
		float l = luminance_at(uv);
		return smoothstep(0.14, 0.32, l) * (1.0 - smoothstep(0.68, 0.9, l));
	}
	return 1.0;
}
float softened_mask(vec2 uv) {
	vec2 px = 1.0 / viewport_size;
	return raw_mask(uv) * 0.5
		+ (raw_mask(uv + vec2(px.x, 0.0)) + raw_mask(uv - vec2(px.x, 0.0))
		+ raw_mask(uv + vec2(0.0, px.y)) + raw_mask(uv - vec2(0.0, px.y))) * 0.125;
}
vec3 after_diffusion(vec2 uv) {
	vec3 c = graded(uv);
	if (enabled && diff_amt > 0.0) {
		float amount = diff_amt * softened_mask(uv);
		c = mix(c, to_srgb(texture(t_blur, uv).rgb), amount);
	}
	return c;
}

void vertex() { POSITION = vec4(VERTEX.xy, 0.5, 1.0); }
void fragment() {
	vec2 uv = SCREEN_UV;
	vec3 c = graded(uv);
	if (source_only) {
		ALBEDO = to_lin(c);
	} else if (enabled && diff_debug) {
		ALBEDO = to_lin(vec3(softened_mask(uv)));
	} else {
		c = after_diffusion(uv);
		if (enabled && dof_on) {
			float y = uv.y;
			float k = smoothstep(dof_top, 0.0, y) + smoothstep(dof_bot, 1.0, y) * 0.8;
			float r = k * dof_amt * 4.0;
			if (r > 0.01) {
				vec2 px = 1.0 / viewport_size;
				vec3 acc = vec3(0.0);
				for (int i = 0; i < 12; i++) {
					float a = float(i) * 2.39996; float s = sqrt(float(i) + 0.5) / 3.5;
					acc += after_diffusion(uv + vec2(cos(a), sin(a)) * s * r * px);
				}
				c = acc / 12.0;
			}
			c = mix(c, haze.rgb, haze.a * smoothstep(dof_top + 0.1, 0.0, y));
		}
		ALBEDO = to_lin(c);
	}
}
