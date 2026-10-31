shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled;

uniform vec4 uColor : source_color = vec4(1.0, 0.18, 0.18, 1.0);
uniform float uProg = 0.0;
uniform float uPulse = 0.0;

void fragment() {
	float fill = step(UV.x, uProg);
	float front = (1.0 - smoothstep(0.0, 0.06, abs(UV.x - uProg))) * step(0.001, uProg);
	float a = 0.16 + uPulse * 0.08 + fill * 0.3 + front * 0.45;
	ALBEDO = uColor.rgb * (1.0 + front * 0.6);
	ALPHA = a * uColor.a;
}
