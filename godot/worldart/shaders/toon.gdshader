// 人物・武器のトゥーン（three.js の MeshToonMaterial と同じ式。public/js/toon.js の toon() / glow()）。
// three.js の式（r160、物理的に正しい光）:
//   出力 = 地色 / π × ( 階調(N·L) × 太陽の色 × 強さ  +  mix(地面の色, 空の色, 0.5 N·上 + 0.5) × 強さ ) + 発光
//   階調 = gradientMap（4 画素 [70,150,215,255]/255、NearestFilter）を x = N·L × 0.5 + 0.5 で引く
//          → x < 0.25: 70 / < 0.5: 150 / < 0.75: 215 / 以上: 255。N·L は 0 で切らない（影側も 70 までしか落ちない）
//   glow()（MeshBasicMaterial）は光に関係なく色そのまま
//   仕上げ: ACES Filmic（three の ACESFilmicToneMapping、露出 1。1/0.6 の係数込み）→ sRGB（Godot の出力が行う）
// 光は unshaded のこの式の中で完結させる（Godot の光・環境光は使わない）。ToonLook.set_light() が値を入れる。
// 両面の材質（外套など）は ToonLook が cull_back を cull_disabled に置き換えた写しを使う。
shader_type spatial;
render_mode unshaded, cull_back;

uniform vec4 albedo : source_color = vec4(1.0);
uniform vec4 emission_col : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float color_scale = 1.0;          // 光る部品の色が 1 を超える分の倍率（ノード名の gm）
uniform bool unlit = false;               // glow()
uniform vec3 sun_dir = vec3(0.4264, 0.8528, 0.2132);   // 太陽の向き（光のほうへ）。ワールド座標
uniform vec3 sun_col = vec3(1.0);         // 線形の色 × 強さ
uniform vec3 hemi_sky = vec3(0.0);        // 線形の色 × 強さ
uniform vec3 hemi_ground = vec3(0.0);
uniform bool aces = true;
uniform float exposure = 1.0;

varying vec3 v_n;                         // 頂点の法線（ビュー空間。面の向きで反転しない）

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

float toon_step(float ndl) {
	float x = ndl * 0.5 + 0.5;
	if (x < 0.25) return 70.0 / 255.0;
	if (x < 0.5) return 150.0 / 255.0;
	if (x < 0.75) return 215.0 / 255.0;
	return 1.0;
}

void vertex() {
	v_n = normalize(MODELVIEW_NORMAL_MATRIX * NORMAL);
}

void fragment() {
	vec3 col;
	if (unlit) {
		col = albedo.rgb * color_scale;
	} else {
		vec3 nv = FRONT_FACING ? v_n : -v_n;   // three.js の faceDirection と同じ（裏から見える両面の材質は法線を反転）
		vec3 n = normalize((INV_VIEW_MATRIX * vec4(nv, 0.0)).xyz);
		vec3 irr = toon_step(dot(n, normalize(sun_dir))) * sun_col + mix(hemi_ground, hemi_sky, 0.5 * n.y + 0.5);
		col = albedo.rgb / PI * irr + emission_col.rgb;
	}
	if (aces) col = aces_filmic(col);
	ALBEDO = col;
}
