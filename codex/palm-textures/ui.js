// Viewは表示のみ。Rootから届いた操作はMediatorが比較状態へ反映する。
const root = document.querySelector('#root');
const frames = [root.querySelector('#current'), root.querySelector('#trial')];
const state = { phase: 'loading', ready: new Set(), message: '', view: 'B01', yaw: 0 };
const view = {
  render(model) {
    root.dataset.phase = model.phase;
    root.querySelector('#status').textContent = model.phase === 'error' ? model.message : model.phase === 'ready' ? '読み込み済み' : '読み込み中';
    root.querySelector('#view').value = model.view;
    root.querySelector('#yaw').value = model.yaw;
    root.querySelector('#yaw-value').textContent = `${Math.round(model.yaw)}°`;
  },
};
const mediator = {
  dispatch(action) {
    if (action.type === 'ready') {
      state.ready.add(action.source);
      if (state.ready.size === frames.length && state.phase !== 'error') state.phase = 'ready';
    } else if (action.type === 'error') { state.phase = 'error'; state.message = action.value; }
    else if (action.type === 'view') state.view = action.value;
    else if (action.type === 'yaw') state.yaw = Number(action.value);
    else if (action.type === 'orbit') state.yaw = ((state.yaw + Number(action.value) + 540) % 360) - 180;
    else return;
    view.render(state);
    frames.forEach(frame => frame.contentWindow.postMessage({ kind: 'leaf-state', state: { view: state.view, yaw: state.yaw, follow: 0 } }, location.origin));
  },
};
root.addEventListener('input', event => {
  const component = event.target.closest('[data-action]');
  if (component) mediator.dispatch({ type: component.dataset.action, value: component.value });
});
addEventListener('message', event => {
  if (event.origin !== location.origin || !frames.some(frame => frame.contentWindow === event.source)) return;
  if (event.data?.kind === 'leaf-ready') mediator.dispatch({ type: 'ready', source: event.source });
  if (event.data?.kind === 'leaf-error') mediator.dispatch({ type: 'error', value: event.data.message });
  if (event.data?.kind === 'leaf-orbit') mediator.dispatch({ type: 'orbit', value: event.data.delta });
});
view.render(state);
