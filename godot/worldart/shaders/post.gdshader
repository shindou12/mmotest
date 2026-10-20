// 仕上げ（world.js の OutputPass → grade → dof と同じ順）。画面全体を覆う板に貼る。
// Godot の Environment は「線形・露出 1.0」（何もしない）にしておき、ここで: 露出 × 線形の切り捨て → sRGB → 彩度 → 上下のぼかし。
// 出力は線形に戻して書く（Godot が sRGB にする）
shader_type spatial;
render_mode unshaded, depth_test_disabled, depth_draw_never, skip_vertex_transform, cull_disabled, fog_disabled, shadows_disabled;
uniform sampler2D screen : hint_screen_texture, filter_linear;
uniform float exposure = 1.25;
uniform float sat = 0.92;
uniform float dof_amt = 1.0;
uniform float dof_top = 0.30;
uniform float dof_bot = 0.80;
uniform bool enabled = true;
vec3 to_srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
vec3 to_lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
vec3 graded(vec2 uv) {
	vec3 c = to_srgb(clamp(texture(screen, uv).rgb * exposure, 0.0, 1.0));
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	return clamp(mix(vec3(l), c, sat), 0.0, 1.0);
}
void vertex() { POSITION = vec4(VERTEX.xy, 0.5, 1.0); }
void fragment() {
	vec2 uv = SCREEN_UV;
	vec3 c = graded(uv);
	if (enabled) {
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
	}
	ALBEDO = to_lin(c);
}
