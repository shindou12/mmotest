// 画面の部品が共通で使う道具（文字の書き出し・色・パネルの一覧・装備の字・図形を描く View）
import { View } from './core.js';
import { WEAPON_GLYPH } from '../weapon-tree.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const hex = (n) => '#' + n.toString(16).padStart(6, '0');
export const now = () => performance.now() / 1000;
export const PANELS = ['inv', 'tree', 'settings', 'map', 'dialog', 'gate', 'box', 'smith'];
export const GLYPH = { ...WEAPON_GLYPH, light: '衣', medium: '鎧', heavy: '甲', acc: '飾', title: '銘' };

// ミニマップ: 図形の一覧を受け取って描くだけの View
// 図形の一覧を描くだけの Passive View（round: 円形に切り抜く＝ミニマップ）
export class CanvasView extends View {
  draw(shapes) {
    const g = this.el.getContext('2d'), W = this.el.width, H = this.el.height;
    g.clearRect(0, 0, W, H);
    g.save();
    if (this.round !== false) { g.beginPath(); g.arc(W / 2, H / 2, Math.min(W, H) / 2, 0, Math.PI * 2); g.clip(); }
    for (const s of shapes) {
      g.fillStyle = s.fill || 'transparent'; g.strokeStyle = s.stroke || 'transparent'; g.lineWidth = s.lw || 1;
      g.beginPath();
      if (s.t === 'bg') { g.fillRect(0, 0, W, H); continue; }
      if (s.t === 'text') {
        g.font = `bold ${s.size || 12}px sans-serif`; g.textAlign = s.align || 'center'; g.textBaseline = 'middle';
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(s.text, s.x, s.y); g.fillText(s.text, s.x, s.y);
        continue;
      }
      if (s.t === 'rect') { g.fillRect(s.x, s.y, s.w, s.h); continue; }
      if (s.t === 'circle') g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      if (s.t === 'poly') s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (s.t === 'arrow') {
        g.save(); g.translate(s.x, s.y); g.rotate(s.a);
        g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(-4, 5); g.closePath(); g.fill(); g.restore(); continue;
      }
      if (s.close) g.closePath();
      if (s.fill) g.fill();
      if (s.stroke) g.stroke();
    }
    g.restore();
  }
}
