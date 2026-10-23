shader_type spatial;
render_mode unshaded, depth_draw_opaque, cull_disabled, fog_disabled, shadows_disabled;

uniform sampler2D alpha_tex : source_color, filter_linear;
uniform bool use_alpha = false;
uniform float alpha_cut = 0.5;
uniform float mask_value = 0.0;

void fragment() {
	if (use_alpha && texture(alpha_tex, UV).a < alpha_cut) {
		discard;
	}
	ALBEDO = vec3(mask_value);
}
