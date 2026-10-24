// 水面 w1（world.js の waterMaterialW1 と同じ式。docs/world-art/rules/water-w1.md）。
// 沖は砂より暗い青、浅瀬は明るい水色。岸の泡: 岸からの距離場の線が 12.5 秒で寄せ、線と岸の間に細胞のレース。水面は影を受けない。
// きらめき（glint）と大きな波の明るみは既定 0 のため移していない。空の映り（フレネル 0.12）だけ足す。
//
// なぜ地面の材質に入れるか: 仕上げの板（post.gdshader）は hint_screen_texture で画面を読む。Godot はその写しを不透明の描画のあと、
// 半透明の描画の前に 1 回だけ取るので、半透明の水面の板は仕上げに入らない（板に上書きされて見えない）。
// そこで水の下の地面の画素に、three と同じ「水面の色 × 不透明度 + 底の色 × (1 - 不透明度)」を計算して描く（水面は y = 水の高さの平面。
// カメラから地面の画素への線が平面と交わる点で水の式を引く）。
// 使う側（ground.gdshader）が先に宣言するもの: t_noise（noise_soft）と、下の uniform
uniform sampler2D t_wh : filter_linear, repeat_disable;   // height.png: R=高さ G=岸からの距離
uniform vec4 u_wt;        // x0, z0, size, shoreMax
uniform vec3 u_whr;       // hmin, hmax, 水面の高さ
uniform vec3 u_wshallow;  // 線形
uniform vec3 u_wdeep;
uniform vec4 u_wwd = vec4(2.6, 1.6, 0.28, 0.0);   // deepAt, causticAt（泡の届く距離）, bandAt, glint
uniform vec3 u_wsky;
uniform float u_wrefl = 1.0;
uniform vec2 u_wsg = vec2(0.32, 2.0);
uniform float u_wtime = -1.0;   // 0 以上なら時間を固定（撮影・比較用）
global uniform vec3 wa_sun_col;   // 太陽の色 × 強さ（three の値、線形）
global uniform vec3 wa_sun_dir;   // 太陽の方へ

float wWave(vec2 p, float t) {
	p *= vec2(0.8, 1.15);
	return texture(t_noise, p * 0.13 + t * vec2(0.012, 0.006)).r + 0.6 * texture(t_noise, mat2(vec2(0.8, -0.6), vec2(0.6, 0.8)) * p * 0.29 - t * vec2(0.007, 0.016)).r;
}
vec2 wHash(vec2 p) {
	p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
	return fract(sin(p) * 43758.5453);
}
float wCell(vec2 p, float t) {
	vec2 i = floor(p), f = fract(p);
	float d1 = 8.0, d2 = 8.0;
	for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
		vec2 g = vec2(float(x), float(y));
		vec2 o = wHash(i + g);
		o = 0.5 + 0.38 * sin(t + 6.2831 * o);
		float d = length(g + o - f);
		if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
	}
	return d2 - d1;
}
// 水面の点 P（y = 水の高さ）の水。lit = 水面の見た目の光（太陽 + 空 + 空の映り）、alpha = 不透明度
void wa_water_w1(vec3 P, vec3 cam, float uTime, out vec3 lit, out float alpha) {
	vec2 huv = vec2((P.x - u_wt.x) / u_wt.z, (P.z - u_wt.y) / u_wt.z);   // 画像の上の行が z0（three は flipY で 1 - ...）
	vec4 hs = texture(t_wh, huv);
	float th = mix(u_whr.x, u_whr.y, hs.r);
	float depth = u_whr.z - th;
	float sdist = hs.g * u_wt.w;
	float nz = texture(t_noise, P.xz / 11.0 + uTime * 0.008).r;
	float nz2 = texture(t_noise, P.xz * vec2(0.09, 0.22) - uTime * vec2(0.004, 0.012)).r;
	float dd = depth + (nz - 0.5) * 0.5;
	vec3 wc = mix(u_wshallow, u_wdeep, max(smoothstep(u_wwd.y * 0.5, u_wwd.x, dd), smoothstep(2.5, 7.0, sdist + (nz - 0.5) * 1.5)));
	vec2 sq = P.xz * vec2(1.0, 1.05) * u_wsg.x;
	float surf = texture(t_noise, sq + uTime * vec2(0.010, 0.004)).r * 0.6 + texture(t_noise, mat2(vec2(0.87, -0.5), vec2(0.5, 0.87)) * sq * 1.7 - uTime * vec2(0.006, 0.011)).r * 0.4;
	float deepish = smoothstep(0.6, 2.5, max(dd, sdist * 0.6));
	wc *= 1.0 + (surf - 0.5) * u_wsg.y * 0.45 * deepish;
	float crest = smoothstep(0.60, 0.78, texture(t_noise, sq * vec2(1.6, 2.6) + vec2(uTime * 0.02, 0.0)).r * 0.55 + surf * 0.45);
	wc += vec3(0.20, 0.27, 0.28) * crest * deepish;
	float reach = u_wwd.y;
	float ph = fract(uTime * 0.08);
	float front = reach * (0.3 + 0.7 * (1.0 - ph));
	float fd = sdist + (nz2 - 0.5) * 0.5;
	float line = smoothstep(0.16, 0.0, abs(fd - front)) * smoothstep(0.0, 0.15, ph) * (0.6 + 0.4 * nz);
	float front2 = front * 0.45;
	line = max(line, 0.6 * smoothstep(0.12, 0.0, abs(fd - front2)) * (1.0 - ph));
	vec2 cp = P.xz * 2.0 + (vec2(nz, nz2) - 0.5) * 1.6;
	float cw = wCell(cp, uTime * 0.3);
	float inside = smoothstep(front + 0.1, front - 0.3, fd);
	float lace = smoothstep(0.06, 0.012, cw) * inside * smoothstep(reach * 0.85, 0.0, fd) * (0.5 + 0.5 * smoothstep(0.3, 0.6, nz2));
	float band = smoothstep(u_wwd.z, 0.0, sdist) * (0.6 + 0.4 * smoothstep(0.2, 0.05, cw));
	float edge = clamp(max(max(line * 0.6, lace * 0.45), band * 0.7), 0.0, 1.0);
	wc = mix(wc, vec3(0.82, 0.90, 0.80), edge * 0.75);
	// 空の映り（フレネル、弱い 0.12）
	vec2 e = vec2(0.12, 0.0);
	float hx = wWave(P.xz + e.xy, uTime) - wWave(P.xz - e.xy, uTime);
	float hz = wWave(P.xz + e.yx, uTime) - wWave(P.xz - e.yx, uTime);
	vec3 wn = normalize(vec3(-hx * 3.2, 1.0, -hz * 3.2));
	vec3 wv = normalize(cam - P);
	float open = smoothstep(0.4, 2.0, max(dd, sdist * 0.5)) * (1.0 - edge);
	float fres = pow(1.0 - max(dot(wn, wv), 0.0), 4.0) * open;
	// three の Lambert（上向きの法線、影なし）: 太陽 + 半球の空の光 + 反射
	vec3 sun = wc * wa_sun_col * max(wa_sun_dir.y, 0.0) / PI;
	lit = sun + wa_hemi(wc, vec3(0.0, 1.0, 0.0)) + u_wsky * fres * 0.12 * u_wrefl;
	alpha = clamp(mix(0.62, 0.97, max(smoothstep(0.05, 1.4, depth), smoothstep(1.0, 5.0, sdist))) + edge * 0.25, 0.0, 1.0);
}
