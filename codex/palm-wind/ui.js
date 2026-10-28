// Rootで受けたイベントをMediatorが裁定し、Viewは表示だけを行う。
const root = document.querySelector('#root');
const frames = [root.querySelector('#current'), root.querySelector('#trial')];
const state = { phase: 'loading', ready: new Set(), message: '', view: 'B01', yaw: 0, wind: .55, playing: true, time: 0 };
const view = {
  render(model) {
    root.dataset.phase = model.phase;
    root.querySelector('#status').textContent = model.phase === 'error' ? model.message : model.phase === 'ready' ? '読み込み済み' : '読み込み中';
    root.querySelector('#view').value = model.view;
    root.querySelector('#yaw').value = model.yaw;
    root.querySelector('#yaw-value').textContent = `${Math.round(model.yaw)}°`;
    root.querySelector('#play').textContent = model.playing ? '停止' : '再生';
    root.querySelector('#play').setAttribute('aria-pressed', model.playing);
    root.querySelector('#time').value = model.time;
    root.querySelector('#time-value').textContent = `${model.time.toFixed(2)}秒`;
    root.querySelector('#trial-label').textContent = `新案・${model.wind === 0 ? '無風' : model.wind < 1 ? '弱い風' : '中程度の風'}`;
    root.querySelectorAll('[data-action=wind]').forEach(button => button.setAttribute('aria-pressed', Number(button.dataset.value) === model.wind));
  },
};
function sendState() {
  frames.forEach((frame, i) => frame.contentWindow.postMessage({ kind: 'leaf-state', state: { view: state.view, yaw: state.yaw, follow: 0, wind: i ? state.wind : 0 } }, location.origin));
}
function sendClock() {
  frames.forEach(frame => frame.contentWindow.postMessage({ kind: 'wind-clock', time: state.time }, location.origin));
}
const mediator = {
  dispatch(action) {
    if (action.type === 'ready') {
      state.ready.add(action.source);
      if (state.ready.size === frames.length && state.phase !== 'error') state.phase = 'ready';
    } else if (action.type === 'error') {
      state.phase = 'error'; state.message = action.value; state.playing = false;
    } else if (action.type === 'view') state.view = action.value;
    else if (action.type === 'yaw') state.yaw = Number(action.value);
    else if (action.type === 'orbit') state.yaw = ((state.yaw + Number(action.value) + 540) % 360) - 180;
    else if (action.type === 'wind') state.wind = Math.max(0, Math.min(1, Number(action.value)));
    else if (action.type === 'time') { state.time = Math.max(0, Math.min(20, Number(action.value))); state.playing = false; }
    else if (action.type === 'play') { if (state.time >= 20) state.time = 0; state.playing = !state.playing; }
    else if (action.type === 'reset') { state.time = 0; state.playing = true; }
    else if (action.type === 'tick') {
      if (!state.playing || state.phase !== 'ready') return;
      state.time = Math.min(20, state.time + action.delta);
      if (state.time >= 20) state.playing = false;
      view.render(state); sendClock(); return;
    } else return;
    view.render(state); sendState(); sendClock();
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
  if (event.data?.kind === 'leaf-error') mediator.dispatch({ type: 'error', value: event.data.message });
  if (event.data?.kind === 'leaf-orbit') mediator.dispatch({ type: 'orbit', value: event.data.delta });
});
let previous = performance.now();
function tick(now) {
  mediator.dispatch({ type: 'tick', delta: Math.min((now - previous) / 1000, .1) });
  previous = now; requestAnimationFrame(tick);
}
view.render(state);
requestAnimationFrame(tick);
