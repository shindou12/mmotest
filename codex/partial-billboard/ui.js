// Rootを経由してイベントを渡す。Viewは状態の表示だけを担当する。
const root = document.querySelector('#root');
const frames = [root.querySelector('#current'), root.querySelector('#trial')];
const state = { phase: 'loading', ready: new Set(), view: 'B01', yaw: 0, follow: Number(root.dataset.defaultFollow ?? 0.5), message: '' };
const view = {
  render(model) {
    root.dataset.phase = model.phase;
    root.querySelector('#status').textContent = model.phase === 'error' ? model.message : model.phase === 'ready' ? '読み込み済み' : '読み込み中';
    root.querySelector('#view').value = model.view;
    root.querySelector('#yaw').value = model.yaw;
    root.querySelector('#yaw-value').textContent = `${Math.round(model.yaw)}°`;
    root.querySelector('#follow').value = model.follow;
    root.querySelector('#follow-value').textContent = model.follow.toFixed(2);
    root.querySelector('#trial-label').textContent = `追従 ${model.follow.toFixed(2)}`;
    root.querySelectorAll('[data-action=preset]').forEach(button => button.setAttribute('aria-pressed', Number(button.dataset.value) === model.follow));
  },
};
const mediator = {
  dispatch(action) {
    if (action.type === 'ready') {
      state.ready.add(action.source);
      if (state.ready.size === frames.length && state.phase !== 'error') state.phase = 'ready';
    } else if (action.type === 'error') {
      state.phase = 'error'; state.message = action.value;
    } else if (action.type === 'view') state.view = action.value;
    else if (action.type === 'yaw') state.yaw = Number(action.value);
    else if (action.type === 'orbit') state.yaw = ((state.yaw + Number(action.value) + 540) % 360) - 180;
    else if (action.type === 'follow' || action.type === 'preset') state.follow = Math.max(0, Math.min(1, Number(action.value)));
    else return;
    view.render(state);
    frames.forEach((frame, index) => frame.contentWindow.postMessage({ kind: 'leaf-state', state: { view: state.view, yaw: state.yaw, follow: index ? state.follow : Number(root.dataset.currentFollow ?? 0) } }, location.origin));
  },
};
root.addEventListener('input', event => {
  const component = event.target.closest('[data-action]');
  if (component) mediator.dispatch({ type: component.dataset.action, value: component.value });
});
root.addEventListener('click', event => {
  const component = event.target.closest('button[data-action]');
  if (component) mediator.dispatch({ type: component.dataset.action, value: component.dataset.value });
});
addEventListener('message', event => {
  if (event.origin !== location.origin || !frames.some(frame => frame.contentWindow === event.source)) return;
  if (event.data?.kind === 'leaf-ready') mediator.dispatch({ type: 'ready', source: event.source });
  if (event.data?.kind === 'leaf-orbit') mediator.dispatch({ type: 'orbit', value: event.data.delta });
  if (event.data?.kind === 'leaf-error') mediator.dispatch({ type: 'error', value: event.data.message });
});
view.render(state);
