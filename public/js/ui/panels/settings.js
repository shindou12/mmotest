// 画面: 設定。Presenter（描画パラメータを計算して View に set する）を P に足す。createUI（ui/app.js）が呼ぶ
// ui: 画面の部品と Presenter の入れ物（app.js が作る）。ほかの画面と共有する値は ui.〜 で読み書きする

export function installSettings(ui) {
  const { game, P, SET } = ui;
  P.settings = () => {
    const s = game.settings;
    for (const k of ['master', 'music', 'sfx', 'amb']) { SET[k].set({ value: Math.round(s[k] * 100) }); SET[k].out.set({ text: String(Math.round(s[k] * 100)) }); }
    SET.quality.set({ value: s.quality }); SET.fx.set({ value: s.fx });
    SET.shake.set({ checked: s.shake }); SET.dmgnum.set({ checked: s.dmgnum }); SET.occlusion.set({ checked: s.occlusion !== false });
  };
}
