// UI の土台
//
//   View      … MVP の Passive View。描画に関わるパラメータ（文字・表示/非表示・クラス・スタイル・属性…）を
//               set() で受け取って DOM に反映するだけ。判断はしない。
//               DOM のイベントは emit() で「UIイベント」に変え、親へバブリングさせる。
//   link()    … Chain of Responsibility の1つの輪。バブリング途中のイベントに文脈（どのパネルの、どの項目か）を
//               付け足す、または握りつぶす（true を返すと伝播を止める）。
//   Root      … 階層の頂点。届いたイベントを Mediator に渡す。
//   Mediator  … ステートマシン。今の状態とイベントの種類から、何をするか（ゲームへの操作・状態遷移）を裁定する。

export class View {
  constructor(el, name = '', parent = null) {
    this.el = typeof el === 'string' ? document.querySelector(el) : el;
    if (!this.el) throw new Error(`View: element not found (${name || el})`);
    this.name = name;
    this.parent = parent;
    this.children = new Map();
    this.links = [];
    this.data = undefined; // リスト項目などが持つ識別子（イベントの文脈に使う）
    this.last = {};
  }

  // ---- 階層 ----
  add(name, el, Cls = View) {
    const target = typeof el === 'string' ? (el.startsWith('#') ? document.querySelector(el) : this.el.querySelector(el)) : el;
    const v = new Cls(target, name, this);
    this.children.set(name, v);
    return v;
  }
  get(path) {
    let v = this;
    for (const n of path.split('.')) { v = v.children.get(n); if (!v) throw new Error(`View: no child "${path}"`); }
    return v;
  }

  // ---- Passive View: 描画パラメータだけを受け取る ----
  set(p) {
    const el = this.el, last = this.last;
    if ('text' in p && last.text !== p.text) { el.textContent = p.text ?? ''; last.text = p.text; last.html = undefined; }
    if ('html' in p && last.html !== p.html) { el.innerHTML = p.html ?? ''; last.html = p.html; last.text = undefined; }
    if ('visible' in p && last.visible !== p.visible) { el.classList.toggle('hidden', !p.visible); last.visible = p.visible; }
    if (p.cls) for (const [k, on] of Object.entries(p.cls)) { const key = 'c:' + k; if (last[key] !== !!on) { el.classList.toggle(k, !!on); last[key] = !!on; } }
    if (p.style) for (const [k, v] of Object.entries(p.style)) { const key = 's:' + k; if (last[key] !== v) { el.style.setProperty(k, v ?? ''); last[key] = v; } }
    if (p.attr) for (const [k, v] of Object.entries(p.attr)) { const key = 'a:' + k; if (last[key] !== v) { if (v == null || v === false) el.removeAttribute(k); else el.setAttribute(k, v === true ? '' : v); last[key] = v; } }
    if ('value' in p && el.value !== String(p.value)) el.value = p.value;
    if ('checked' in p) el.checked = !!p.checked;
    if ('disabled' in p) el.disabled = !!p.disabled;
    if ('focus' in p) { if (p.focus) el.focus(); else el.blur(); }
    return this;
  }

  // ---- イベント: DOM イベント → UI イベント（バブリング） ----
  on(domEvent, type, payload, opts) {
    this.el.addEventListener(domEvent, (e) => {
      const r = this.emit(type, payload ? payload(e) : {}, e);
      if (r?.preventDefault) e.preventDefault();
    }, opts);
    return this;
  }
  emit(type, payload = {}, dom = null) {
    const ev = { type, payload, ctx: {}, path: [], dom, preventDefault: false };
    this.bubble(ev);
    return ev;
  }
  // Chain of Responsibility の輪を追加
  link(fn) { this.links.push(fn); return this; }
  bubble(ev) {
    ev.path.unshift(this.name);
    for (const fn of this.links) if (fn(ev, this) === true) return;
    if (this.parent) this.parent.bubble(ev);
  }

  // 子をすべて作り直す（リスト表示用）。make(item) は { el または html, data, setup(view) } を返す
  list(items, make) {
    for (const c of this.children.values()) c.el.remove();
    this.children.clear();
    this.el.textContent = '';
    this.last = {};
    items.forEach((item, i) => {
      const spec = make(item, i);
      let el = spec.el;
      if (!el) { const t = document.createElement('template'); t.innerHTML = spec.html.trim(); el = t.content.firstElementChild; }
      this.el.appendChild(el);
      const v = new (spec.Cls || View)(el, spec.name || `item${i}`, this);
      v.data = spec.data;
      this.children.set(v.name, v);
      spec.setup?.(v);
    });
    return this;
  }
  remove() { this.el.remove(); this.parent?.children.delete(this.name); }
}

// 階層の頂点: 文脈が揃ったイベントを Mediator に裁定させる
export class Root extends View {
  constructor(el, mediator) { super(el, 'root', null); this.mediator = mediator; }
  bubble(ev) {
    ev.path.unshift(this.name);
    for (const fn of this.links) if (fn(ev, this) === true) return;
    this.mediator.handle(ev);
  }
}

// ステートマシンとして振る舞う Mediator
//   states: { name: { enter(data, from), exit(to), on: { eventType(ev) → 次の状態名 | [状態名, data] | undefined } } }
//   '*' は全状態で共通のハンドラ（各状態で処理されなかったときだけ使う）
export class Mediator {
  constructor(states, initial) {
    this.states = states;
    this.state = initial;
    this.data = null;
    this.log = [];
  }
  handle(ev) {
    const S = this.states[this.state];
    let h = S?.on?.[ev.type];
    if (!h) h = this.states['*']?.on?.[ev.type];
    if (!h) return;
    const next = h.call(this, ev, this.data);
    this.log.push(`${this.state}:${ev.type}${next ? '→' + (Array.isArray(next) ? next[0] : next) : ''}`);
    if (this.log.length > 50) this.log.shift();
    if (next) Array.isArray(next) ? this.go(next[0], next[1]) : this.go(next);
  }
  go(name, data = null) {
    if (!this.states[name]) throw new Error(`Mediator: unknown state ${name}`);
    const from = this.state;
    if (from === name && !data) { this.states[name].refresh?.call(this, this.data); return; }
    this.states[from]?.exit?.call(this, name);
    this.state = name;
    this.data = data;
    this.states[name].enter?.call(this, data, from);
  }
  is(...names) { return names.includes(this.state); }
}
