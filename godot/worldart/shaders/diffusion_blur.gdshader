shader_type canvas_item;

uniform sampler2D source_tex : filter_linear;
uniform vec2 source_size = vec2(1532.0, 869.0);
uniform vec2 axis = vec2(1.0, 0.0);
uniform float radius = 0.012;

vec3 to_srgb(vec3 c) {
	return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 to_lin(vec3 c) {
	return mix(c / 12.92, pow(max((c + 0.055) / 1.055, vec3(0.0)), vec3(2.4)), step(vec3(0.04045), c));
}

void fragment() {
	// DiffusionPass: 半分の高さで radius * height * 0.5 の sigma を使い、
	// sigma * 0.5 の間隔で 9 点を取る。source は線形保存なので sRGB に戻して混ぜる。
	float step_pixels = max(radius * source_size.y * 0.25, 0.001);
	vec2 step_uv = axis * vec2(step_pixels / source_size.x, step_pixels / source_size.y);
	vec3 sum = vec3(0.0);
	float total = 0.0;
	for (int i = -4; i <= 4; i++) {
		float x = float(i);
		float weight = exp(-0.125 * x * x);
		sum += to_srgb(texture(source_tex, UV + step_uv * x).rgb) * weight;
		total += weight;
	}
	COLOR = vec4(to_lin(sum / total), 1.0);
}
