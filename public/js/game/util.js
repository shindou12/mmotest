export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const now = () => performance.now() / 1000;
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
// 角度（度 → ラジアン）と線形補間。three.js の MathUtils と同じ式
export const degToRad = (d) => d * (Math.PI / 180);
export const lerp = (x, y, t) => (1 - t) * x + t * y;
