// 旧エリア用トゥーン材質。toon.gdshader と同じ階調・ACES に、Godot の影の減衰を加える。
// 光の出典: public/js/toon.js の MeshToonMaterial と public/js/game/render.js の DirectionalLight。
// 強さ・色・半球光・霧は public/shared/data.js FLOORS / public/js/env.js buildArea から
// tools/worldart/godot/export_areas.mjs が data/legacy/index.json に書き出した値を使う。
// Godot 4.3 の light() の LIGHT_COLOR は色×energy×PI、ATTENUATION は影を含む（公式 spatial shader docs）。
shader_type spatial;
render_mode cull_back;

uniform vec4 albedo : source_color = vec4(1.0);
uniform vec4 emission_col : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float color_scale = 1.0;
uniform bool unlit = false;
uniform vec3 sun_dir = vec3(0.4264, 0.8528, 0.2132);
uniform vec3 sun_col = vec3(1.0);
uniform vec3 hemi_sky = vec3(0.0);
uniform vec3 hemi_ground = vec3(0.0);
uniform bool aces = true;
uniform float exposure = 1.0;

vec3 aces_filmic(vec3 color) {
	const mat3 in_m = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
	const mat3 out_m = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
	color *= exposure / 0.6;
	color = in_m * color;
	vec3 a = color * (color + 0.0245786) - 0.000090537;
	vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
	return clamp(out_m * (a / b), 0.0, 1.0);
}

float toon_step(float ndl) {
	float x = ndl * 0.5 + 0.5;
	if (x < 0.25) return 70.0 / 255.0;
	if (x < 0.5) return 150.0 / 255.0;
	if (x < 0.75) return 215.0 / 255.0;
	return 1.0;
}

void fragment() {
	vec3 col;
	if (unlit) {
		col = albedo.rgb * color_scale;
		if (aces) col = aces_filmic(col);
		ALBEDO = vec3(0.0);
		EMISSION = col;
	} else {
		if (!FRONT_FACING) NORMAL = -NORMAL;
		col = albedo.rgb;
		ALBEDO = col;
	}
	// GLB から来る加算光・半透明材質の ALPHA は ToonLook が必要な材質だけ挿入する。
	// legacy_transparent_alpha
}

void light() {
	if (!unlit && LIGHT_IS_DIRECTIONAL) {
		vec3 n = normalize(NORMAL);
		vec3 n_world = normalize((INV_VIEW_MATRIX * vec4(n, 0.0)).xyz);
		vec3 direct = toon_step(dot(n, normalize(LIGHT))) * LIGHT_COLOR * ATTENUATION;
		vec3 hemi = mix(hemi_ground, hemi_sky, 0.5 * n_world.y + 0.5);
		vec3 col = ALBEDO / PI * (direct + hemi) + emission_col.rgb;
		if (aces) col = aces_filmic(col);
		// Godot は DIFFUSE_LIGHT に ALBEDO を掛けて合成するため、元の toon 式の色を保つよう戻す。
		DIFFUSE_LIGHT += col / max(ALBEDO, vec3(0.0001));
	}
}
