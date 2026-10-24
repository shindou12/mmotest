// Viewは表示だけを担当し、Rootへ届く操作をMediatorが裁定する。
class EntryView {
  constructor(root) {
    this.element = root.querySelector("#entry");
    this.instruction = this.element.querySelector(".instruction");
  }
  render(state, preview) {
    this.element.hidden = preview || state === "playing";
    this.instruction.textContent = state === "loading" ? "読み込み中…" :
      state === "error" ? "素材を読み込めませんでした" : "クリックして歩き出す";
  }
}

export function createInterface(root, { preview, start }) {
  const view = new EntryView(root);
  let state = "loading";
  const transition = next => { state = next; view.render(state, preview); };
  const mediator = {
    get active() { return state === "playing" || state === "preview"; },
    ready() { transition(preview ? "preview" : "intro"); },
    fail() { transition("error"); },
    activate() { if (state !== "loading" && state !== "error") transition(preview ? "preview" : "playing"); },
    unlock() { transition(preview ? "preview" : "intro"); },
    start() {
      if (state === "loading" || state === "error") return;
      transition("playing"); start();
    },
  };
  // 内側の操作から順に処理し、未処理のものだけ次の担当へ渡す。
  const handlers = [
    event => { if (!event.target.closest("#entry")) return false; mediator.start(); return true; },
    event => Boolean(event.target.closest("#nav")),
  ];
  root.addEventListener("click", event => {
    for (const handle of handlers) if (handle(event)) break;
  });
  transition("loading");
  return mediator;
}
