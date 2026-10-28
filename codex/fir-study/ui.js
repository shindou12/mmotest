// Rootが操作を受け取り、版・視点・方位を1か所で管理する。
const root = document.querySelector('#root');
const frames = [...root.querySelectorAll('iframe')];
const versionSelect = root.querySelector('#version');
const queryVersion = new URLSearchParams(location.search).get('version');
const version = ['v1', 'v2', 'v3', 'v4', 'v5'].includes(queryVersion) ? queryVersion : 'v5';
let state = { view: root.dataset.kind === 'world' ? 'wide' : 'standard', yaw: 0, version };
versionSelect.value = version;
const trial = root.querySelector('iframe[data-trial]');
const loadVersion = () => {
  trial.src = root.dataset.kind === 'world'
    ? `./world-frame.html?map=south_coast_g3&palms=trial&occR=0&fir=${state.version}`
    : `./frame.html?model=fir_soft_${state.version}`;
};
const render = () => {
  for (const button of root.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
  for (const frame of frames) frame.contentWindow?.postMessage({ kind: root.dataset.kind === 'world' ? 'coast-state' : 'tree-state', state }, location.origin);
};
root.addEventListener('click', event => {
  const button = event.target.closest('button[data-view]');
  if (!button) return;
  state = { ...state, view: button.dataset.view, yaw: 0 }; render();
});
root.addEventListener('change', event => {
  if (event.target !== versionSelect) return;
  state = { ...state, version: versionSelect.value }; loadVersion();
});
addEventListener('message', event => {
  if (event.origin !== location.origin || !frames.some(frame => frame.contentWindow === event.source)) return;
  if (['tree-ready', 'coast-ready'].includes(event.data?.kind)) render();
  if (['tree-orbit', 'coast-orbit'].includes(event.data?.kind) && Number.isFinite(event.data.delta)) {
    state = { ...state, yaw: ((state.yaw + event.data.delta + 180) % 360 + 360) % 360 - 180 }; render();
  }
});
loadVersion();
