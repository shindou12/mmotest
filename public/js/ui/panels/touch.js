// 画面: スマホ操作（スティック・ボタン）。Presenter（描画パラメータを計算して View に set する）を P に足す。createUI（ui/app.js）が呼ぶ
// ui: 画面の部品と Presenter の入れ物（app.js が作る）。ほかの画面と共有する値は ui.〜 で読み書きする
import { HEAVY, TREE_SKILLS, spTotal, spSpent } from '../../skills.js';
import { hasWTree, wtLeft } from '../../weapon-tree.js';

export function installTouch(ui) {
  const { game, P, T, mediator, root, setCd } = ui;
  // ---- スマホの操作ボタン ----
  const tc = { on: false, stick: null, btn: {}, pinch: 0 };
  ui.tc = tc;
  const STICK_R = 60;
  ui.STICK_R = STICK_R;
  P.stick = (dx = 0, dy = 0) => {
    const zr = T.zone.el.getBoundingClientRect();
    const o = tc.stick || { ox: zr.left + 100, oy: zr.bottom - 96 };
    T.stick.set({ cls: { active: !!tc.stick }, style: { left: (o.ox - zr.left) + 'px', top: (o.oy - zr.top) + 'px' } });
    T.knob.set({ style: { transform: `translate(${dx}px, ${dy}px)` } });
  };
  const USE_LABEL = { gate: '転移門', npc: '話す', box: 'ボックス', lever: 'レバー', chest: '宝箱', smith: '鍛冶屋' };
  P.touch = () => {
    root.set({ cls: { touch: tc.on, playing: !mediator.is('login'), chatting: mediator.is('chat') } });
    if (!tc.on) return;
    T.layer.set({ visible: mediator.is('play') });
    if (!mediator.is('play')) return;
    const S = game.S, me = game.me, char = game.char, B = T.btn;
    B.atk.nm.set({ text: `${S.W.name}・長押し${HEAVY[S.wk].name}` });
    B.atk.set({ cls: { charging: me.charging && me.chargeT >= game.CHARGE_MIN } });
    B.skill.nm.set({ text: S.ws.name });
    setCd(B.skill, me.wsCd, S.ws.cd * (1 - S.cdr / 100));
    for (let i = 0; i < 2; i++) {
      const id = char.slots?.[i], v = B['t' + (i + 1)];
      const usable = id && S.actives.has(id);
      v.nm.set({ text: id ? TREE_SKILLS[id].name : '未設定' });
      v.set({ cls: { off: !usable } });
      setCd(v, usable ? (me.tcd[id] || 0) : 1, usable ? game.skillCd(id) : 1);
    }
    setCd(B.dodge, me.dodgeCd, S.dodgeCd);
    B.guard.set({ visible: !!S.guard, cls: { pressed: me.guarding } });
    B.pot.num.set({ text: String(me.potions) });
    setCd(B.pot, me.potions > 0 ? me.potCd : 1, 1);
    const it = game.nearestInteract();
    B.use.set({ visible: !!it });
    if (it) B.use.nm.set({ text: USE_LABEL[it.kind] || '調べる' });
    const left = spTotal(char.lv) - spSpent(char.tree) + (hasWTree(S.wk) ? Math.max(0, wtLeft(char, S.wk)) : 0);
    T.sp.set({ text: left > 0 ? String(left) : '' });
  };
}
