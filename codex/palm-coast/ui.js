// Viewは表示だけを持ち、Rootへ届いた操作はMediatorの状態へまとめる。
const root = document.querySelector('#root');
const frames = [...root.querySelectorAll('iframe')];
let state = { view: 'wide', yaw: 0 };
const render = () => {
  for (const button of root.querySelectorAll('button[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
  for (const frame of frames) frame.contentWindow?.postMessage({ kind: 'coast-state', state }, location.origin);
};
root.addEventListener('click', event => {
  const button = event.target.closest('button[data-view]');
  if (!button) return;
  state = { view: button.dataset.view, yaw: 0 };
  render();
});
addEventListener('message', event => {
  if (event.origin !== location.origin || !frames.some(frame => frame.contentWindow === event.source)) return;
  if (event.data?.kind === 'coast-ready') render();
  if (event.data?.kind === 'coast-orbit' && Number.isFinite(event.data.delta)) {
    state = { ...state, yaw: ((state.yaw + event.data.delta + 180) % 360 + 360) % 360 - 180 };
    render();
  }
});
