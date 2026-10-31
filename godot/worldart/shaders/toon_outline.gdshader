// トゥーンの輪郭線（public/js/toon.js の outlineMat）: 裏面だけを描く黒紫の殻を、法線の方向へ
// 0.0021 × 太さ × (カメラからの奥行き) だけ押し出す（画面でほぼ一定の太さ）。色は 0x17121f。
// 法線は three.js の hullGeo と同じ「位置で統合した滑らかな法線」を CUSTOM0 に入れてある（ToonLook.add_hull）。
// 面ごとに法線が分かれた形（立方体など）でも殻が割れない。toon.gdshader の next_pass に付ける。
shader_type spatial;
render_mode unshaded, cull_front;

uniform float width = 1.0;                // outline(root, w) の w
uniform vec4 outline_color : source_color = vec4(0.0902, 0.0706, 0.1216, 1.0);   // 0x17121f（既定値は線形に直されない。ToonLook が入れる）
uniform bool aces = true;                 // MeshBasicMaterial も toneMapped = true なので、殻の色も階調変換を通る
uniform float exposure = 1.0;

vec3 aces_filmic(vec3 color) {
	const mat3 in_m = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
	const mat3 out_m = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
	color *= exposure / 0.6;
	color = in_m * color;
	vec3 a = color * (color + 0.0245786) - 0.000090537;
	vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
	color = a / b;
	color = out_m * color;
	return clamp(color, 0.0, 1.0);
}

void vertex() {
	vec4 mv = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	vec3 n = normalize(MODELVIEW_NORMAL_MATRIX * CUSTOM0.xyz);
	mv.xyz += n * (0.0021 * width) * -mv.z;
	POSITION = PROJECTION_MATRIX * mv;
}

void fragment() {
	vec3 c = outline_color.rgb;
	if (aces) c = aces_filmic(c);
	ALBEDO = c;
}
