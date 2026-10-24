// 仕上げ（world.js の OutputPass → grade → dof と同じ順）。画面全体を覆う板に貼る。
// Godot の Environment は「線形・露出 1.0」（何もしない）にしておき、ここで: 階調（線形: 露出 × 切り捨て / ACES: three r160 の ACESFilmic）→ sRGB
// → grade（彩度・コントラスト・lift・gain・周辺減光・上の暗がり）→ dof（上下のぼかし・奥のもや）。出力は線形に戻して書く（Godot が sRGB にする）
shader_type spatial;
render_mode unshaded, depth_test_disabled, depth_draw_never, skip_vertex_transform, cull_disabled, fog_disabled, shadows_disabled;
uniform sampler2D screen : hint_screen_texture, filter_linear;
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
uniform bool enabled = true;          // false: 仕上げをすべて切る（world.js post=0）。階調と sRGB だけ
uniform bool dof_on = true;
vec3 to_srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
vec3 to_lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
vec3 rrt_odt(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c) {   // three.js r160 ACESFilmicToneMapping（露出 / 0.6）
	const mat3 IN_M = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
	const mat3 OUT_M = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
	c *= exposure / 0.6;
	return clamp(OUT_M * rrt_odt(IN_M * c), 0.0, 1.0);
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
	c *= 1.0 - vignette * smoothstep(0.3, 0.85, length((uv - 0.5) * vec2(1.25, 1.0)));
	c *= 1.0 - top_dark * smoothstep(0.62, 1.0, 1.0 - uv.y);
	return clamp(c, 0.0, 1.0);
}
void vertex() { POSITION = vec4(VERTEX.xy, 0.5, 1.0); }
void fragment() {
	vec2 uv = SCREEN_UV;
	vec3 c = graded(uv);
	if (enabled && dof_on) {
		float y = uv.y;                         // 0 = 上、1 = 下（three の 1 - vUv.y）
		float k = smoothstep(dof_top, 0.0, y) + smoothstep(dof_bot, 1.0, y) * 0.8;
		float r = k * dof_amt * 4.0;
		if (r > 0.01) {
			vec2 px = 1.0 / VIEWPORT_SIZE;
			vec3 acc = vec3(0.0);
			for (int i = 0; i < 12; i++) {
				float a = float(i) * 2.39996; float s = sqrt(float(i) + 0.5) / 3.5;
				acc += graded(uv + vec2(cos(a), sin(a)) * s * r * px);
			}
			c = acc / 12.0;
		}
		c = mix(c, haze.rgb, haze.a * smoothstep(dof_top + 0.1, 0.0, y));   // 奥のもや
	}
	ALBEDO = to_lin(c);
}
