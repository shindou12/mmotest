// 画面: トースト・バナー・チャット・被弾の演出。Presenter（描画パラメータを計算して View に set する）を P に足す。createUI（ui/app.js）が呼ぶ
// ui: 画面の部品と Presenter の入れ物（app.js が作る）。ほかの画面と共有する値は ui.〜 で読み書きする
import { View } from '../core.js';
import { esc, now } from '../helpers.js';

export function installMessages(ui) {
  const { H, P, vignette } = ui;
  // ---- 通知 ----
  P.toast = (text, color = '#fff', big = false) => {
    const el = document.createElement('div');
    H.toasts.el.appendChild(el);
    const v = new View(el, 'toast', H.toasts);
    v.set({ cls: { toast: true, big }, style: { 'border-color': color, color }, text });
    setTimeout(() => v.remove(), 6000);
    while (H.toasts.el.children.length > 5) H.toasts.el.firstChild.remove();
  };
  let bannerUntil = 0, bannerPrio = 0;
  P.banner = (top, main, color, prio = 0) => {
    if (now() < bannerUntil && prio < bannerPrio) return;
    bannerUntil = now() + 4.5; bannerPrio = prio;
    H.banner.set({ html: `<div class="b1">${esc(top)}</div><div class="b2" style="color:${color}">${esc(main)}</div>`, cls: { show: false } });
    void H.banner.el.offsetWidth;
    H.banner.set({ cls: { show: true } });
  };
  P.chat = (from, text, color) => {
    const el = document.createElement('div');
    H.chatLog.el.appendChild(el);
    const v = new View(el, 'line', H.chatLog);
    if (from) v.set({ html: `<b style="color:${esc(color)}">${esc(from)}</b>: ${esc(text)}` });
    else v.set({ text, style: { color } });
    while (H.chatLog.el.children.length > 60) H.chatLog.el.firstChild.remove();
    H.chatLog.el.scrollTop = H.chatLog.el.scrollHeight;
  };
  P.hurt = () => {
    vignette.set({ style: { 'box-shadow': 'inset 0 0 160px rgba(255,0,0,.55)' } });
    setTimeout(() => vignette.set({ style: { 'box-shadow': 'inset 0 0 120px rgba(255,0,0,0)' } }), 180);
  };
}
