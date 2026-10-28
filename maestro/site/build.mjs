import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const out = path.join(root, 'maestro/dist');
const repoUrl = 'https://github.com/shindou12/mmotest';
const statusNames = { inbox: '思いつき', todo: 'やる', doing: '作業中', review: '確認待ち', hold: '保留', done: '済み' };
const statusOrder = ['inbox', 'todo', 'doing', 'review', 'hold', 'done'];
const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function branchName() {
  if (process.env.MAESTRO_BRANCH) return process.env.MAESTRO_BRANCH;
  if (process.env.BRANCH) return process.env.BRANCH;
  try { return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'claude/art-style-L29'; }
  catch (_) { return 'claude/art-style-L29'; }
}
const branch = branchName();
const branchUrl = encodeURIComponent(branch).replace(/%2F/g, '/');
const fileUrl = (file) => repoUrl + '/blob/' + branchUrl + '/' + String(file).split('/').map(encodeURIComponent).join('/');

function parseTicket(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const warnings = [];
  if (!match) return { warning: '先頭の --- で囲む項目がありません' };
  const fields = {};
  match[1].split('\n').forEach((line) => {
    const at = line.indexOf(':');
    if (at < 1) { warnings.push('項目行の形が不正です: ' + line); return; }
    fields[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  });
  const body = match[2].trim();
  const sections = {};
  let current = '';
  const bodyLines = body.split('\n');
  bodyLines.forEach((line) => {
    const heading = line.match(/^##\s+(.+?)\s*#*$/);
    if (heading) { current = heading[1].trim(); if (sections[current]) warnings.push('節が重複しています: ' + current); else sections[current] = []; }
    else if (current) sections[current].push(line);
  });
  ['id', 'title', 'status', 'priority', 'area'].forEach((key) => { if (!fields[key]) warnings.push('項目 ' + key + ' がありません'); });
  ['目的', '完了の条件', '小項目', '参照', '記録'].forEach((key) => { if (!sections[key]) warnings.push('節 ' + key + ' がありません'); });
  if (!/^M-\d+$/.test(fields.id || '')) warnings.push('id の形が不正です');
  if (statusOrder.indexOf(fields.status) < 0) warnings.push('status が不正です');
  if (warnings.length) return { warning: warnings.join(' / ') };
  const items = sections['小項目'].map((line) => line.match(/^\s*-\s+\[([ xX])\]\s+(.*)$/)).filter(Boolean).map((item) => ({ done: item[1].toLowerCase() === 'x', text: item[2] }));
  const record = sections['記録'].join('\n').trim();
  return { id: fields.id, title: fields.title, status: fields.status, priority: fields.priority, area: fields.area, parent: fields.parent || '', owner: fields.owner || '', agent: fields.agent || '', model: fields.model || '', session: fields.session || '', branch: fields.branch || '', created: fields.created || '', updated: fields.updated || '', sections: Object.fromEntries(Object.keys(sections).map((key) => [key, sections[key].join('\n').trim()])), items, itemCount: items.length, doneCount: items.filter((item) => item.done).length, record, file: 'maestro/tickets/' + path.basename(file) };
}

function inlineMarkdown(source) {
  const tokenPattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+|[^\s)]+)\)|(https?:\/\/[^\s<>]+)/g;
  let result = '';
  let last = 0;
  let match;
  while ((match = tokenPattern.exec(source))) {
    result += esc(source.slice(last, match.index));
    if (match[1] !== undefined) result += '<code>' + esc(match[1]) + '</code>';
    else if (match[2] !== undefined) result += '<strong>' + esc(match[2]) + '</strong>';
    else if (match[3] !== undefined) {
      const href = match[4];
      if (/^(https?:\/\/|\/|#)/i.test(href) || !/^[a-z][a-z0-9+.-]*:/i.test(href)) result += '<a href="' + esc(href) + '"' + (/^https?:\/\//i.test(href) ? ' rel="noopener noreferrer"' : '') + '>' + inlineMarkdown(match[3]) + '</a>';
      else result += inlineMarkdown(match[3]);
    } else result += '<a href="' + esc(match[5]) + '" rel="noopener noreferrer">' + esc(match[5]) + '</a>';
    last = tokenPattern.lastIndex;
  }
  result += esc(source.slice(last));
  return result;
}

function markdown(source) {
  const lines = String(source || '').split('\n');
  let html = '';
  let paragraph = [];
  let list = '';
  function flushParagraph() { if (paragraph.length) { html += '<p>' + paragraph.map(inlineMarkdown).join('<br>') + '</p>'; paragraph = []; } }
  function closeList() { if (list) { html += '</' + (list.indexOf('ol') === 0 ? 'ol' : 'ul') + '>'; list = ''; } }
  lines.forEach((line) => {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const checked = line.match(/^\s*-\s+\[([ xX])\]\s+(.*)$/);
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (!line.trim()) { flushParagraph(); closeList(); return; }
    if (heading) { flushParagraph(); closeList(); const level = Math.min(heading[1].length + 1, 4); html += '<h' + level + '>' + inlineMarkdown(heading[2]) + '</h' + level + '>'; return; }
    if (checked || bullet || numbered) {
      flushParagraph();
      const type = (numbered ? 'ol' : 'ul') + (checked ? ':check' : '');
      if (list !== type) { closeList(); html += '<' + (numbered ? 'ol' : 'ul') + (checked ? ' class="checklist"' : '') + '>'; list = type; }
      const content = checked ? '<span class="check ' + (checked[1].toLowerCase() === 'x' ? 'is-done' : '') + '" aria-hidden="true">' + (checked[1].toLowerCase() === 'x' ? '✓' : '') + '</span> ' + (checked[1].toLowerCase() === 'x' ? '<span class="check-text is-done">' + inlineMarkdown(checked[2]) + '</span>' : inlineMarkdown(checked[2])) : inlineMarkdown((bullet || numbered)[1]);
      html += '<li>' + content + '</li>'; return;
    }
    closeList(); paragraph.push(line);
  });
  flushParagraph(); closeList();
  return html;
}

function layout(title, content, script) {
  return '<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#17232c"><title>Maestro · ' + esc(title) + '</title><style>' + css + '</style></head><body><div class="root"><header class="site-head"><a class="brand" href="/index.html">Maestro</a><nav aria-label="メインナビ"><a href="/index.html">ボード</a><a href="/who.html">担当</a><a href="/rules.html">ルール</a><a href="/assets.html">アセット</a></nav><time>組み立て ' + esc(new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')) + '</time></header><main>' + content + '</main><footer>Maestro · <a href="' + esc(repoUrl) + '/tree/' + esc(branchUrl) + '">' + esc(branch) + '</a></footer></div>' + (script ? '<script>' + script + '</script>' : '') + '</body></html>\n';
}

const css = `:root{--paper:#f2f0e9;--surface:#faf9f5;--ink:#17232c;--muted:#69716f;--line:#d5d2c8;--brass:#8a7137;--brass-soft:#e7dfc9;--done:#3c6652;--danger:#8b493b;--code:#e9e7df;--status-inbox:#657b82;--status-todo:#8a7137;--status-doing:#a05d37;--status-review:#6b668e;--status-hold:#6f7779;--status-done:#3c6652}*{box-sizing:border-box}html{background:var(--paper);color:var(--ink);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px;font-variant-numeric:tabular-nums}body{margin:0}.root{max-width:1440px;margin:0 auto;padding:0 24px}.site-head{border-bottom:1px solid var(--line);min-height:72px;display:flex;align-items:center;flex-wrap:wrap;padding:12px 0}.brand{font-size:22px;font-weight:750;letter-spacing:.04em;color:var(--ink);text-decoration:none;margin-right:32px}.site-head nav{display:flex;flex-wrap:wrap}.site-head nav a{color:var(--muted);text-decoration:none;padding:8px 11px;margin-right:5px}.site-head nav a:hover,.site-head nav a:focus,a:hover{color:var(--brass)}.site-head time{margin-left:auto;color:var(--muted);font-size:12px}main{padding:28px 0 48px}h1{font-size:28px;line-height:1.2;margin:0 0 20px;letter-spacing:-.025em}h2{font-size:20px;margin:30px 0 14px}h3{font-size:17px;margin:0 0 10px}p{line-height:1.65;margin:0 0 12px}a{color:#465b62;overflow-wrap:anywhere}.toolbar{display:flex;flex-wrap:wrap;align-items:center;border:1px solid var(--line);background:var(--surface);padding:12px;margin-bottom:18px}.toolbar label{font-size:13px;color:var(--muted);margin:7px 8px 0 0}.toolbar input,.toolbar select,.copy-button{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--line);padding:9px 10px;min-height:40px;margin:3px 14px 3px 0}.toolbar input{min-width:150px}.board{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;align-items:start}.column{border-top:3px solid var(--brass);min-width:0}.column[data-status="inbox"]{border-color:var(--status-inbox)}.column[data-status="todo"]{border-color:var(--status-todo)}.column[data-status="doing"]{border-color:var(--status-doing)}.column[data-status="review"]{border-color:var(--status-review)}.column[data-status="hold"]{border-color:var(--status-hold)}.column[data-status="done"]{border-color:var(--status-done)}.column-head{display:flex;justify-content:space-between;align-items:baseline;padding:10px 2px;color:var(--muted);font-size:13px}.column-head strong{color:var(--ink);font-size:15px}.column-empty .column-head{white-space:nowrap}.cards{display:grid;gap:9px}.card{background:var(--surface);border:1px solid var(--line);padding:12px;min-width:0}.card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12px}.card-id{font-weight:700;letter-spacing:.04em}.priority{display:inline-block;border:1px solid var(--brass);color:var(--brass);padding:1px 5px;font-size:11px;font-weight:700}.priority-P1{color:var(--danger);border-color:var(--danger)}.card h3{font-size:15px;line-height:1.4}.card h3 a{color:var(--ink);text-decoration:none}.meta{display:flex;flex-wrap:wrap;color:var(--muted);font-size:12px}.meta span{margin:0 10px 4px 0}.progress-line{height:3px;background:var(--line);margin-top:9px}.progress-line span{display:block;height:100%;background:var(--brass)}.holder{border-left:2px solid var(--brass);padding:5px 7px;margin-top:9px;font-size:12px;line-height:1.5}.holder b{color:var(--brass)}.parent{font-size:12px;margin-top:8px}.empty{font-size:13px;color:var(--muted);padding:10px 2px}.done-rest{margin-top:10px}.done-rest summary{cursor:pointer;color:var(--muted);font-size:13px;padding:8px 0}.detail-head{border-bottom:1px solid var(--line);padding-bottom:16px;margin-bottom:16px}.detail-head .eyebrow{font-size:13px;color:var(--muted);margin-bottom:8px}.ticket-badges{display:flex;flex-wrap:wrap;margin-top:-9px}.badge{display:inline-block;border:1px solid var(--line);background:var(--surface);color:var(--muted);padding:4px 8px;font-size:12px;line-height:1.2;margin:0 6px 5px 0}.badge.status-inbox{border-color:var(--status-inbox);color:var(--status-inbox)}.badge.status-todo{border-color:var(--status-todo);color:var(--status-todo)}.badge.status-doing{border-color:var(--status-doing);color:var(--status-doing)}.badge.status-review{border-color:var(--status-review);color:var(--status-review)}.badge.status-hold{border-color:var(--status-hold);color:var(--status-hold)}.badge.status-done{border-color:var(--status-done);color:var(--status-done)}.fields{width:100%;border-collapse:collapse;background:var(--surface);margin:24px 0}.fields th,.fields td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}.fields th{width:150px;color:var(--muted);font-weight:500}.ticket-body{max-width:820px}.ticket-body h3{margin-top:26px}.ticket-body ul,.ticket-body ol{padding-left:24px;line-height:1.75}.ticket-body li{padding-left:2px;margin-bottom:3px}.ticket-body ul.checklist{list-style:none;padding-left:0}.ticket-body .check{display:inline-block;vertical-align:middle;width:14px;height:14px;border:1px solid var(--muted);margin-right:4px;color:var(--surface);font-size:11px;line-height:12px;text-align:center}.ticket-body .check.is-done{background:var(--done);border-color:var(--done)}.check-text.is-done{color:var(--muted);text-decoration:line-through}code{background:var(--code);padding:1px 4px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.92em}.ai-box{border:1px solid var(--brass);background:var(--brass-soft);padding:12px;margin:0 0 20px;max-width:820px}.ai-box h2{margin:0 0 9px}.ai-box textarea{display:block;width:100%;min-height:78px;resize:vertical;font:inherit;line-height:1.45;color:var(--ink);background:var(--surface);border:1px solid var(--line);padding:8px}.copy-button{margin-top:8px;cursor:pointer;background:var(--ink);color:var(--surface);border-color:var(--ink)}.rule-group{margin-bottom:30px}.rule-list{list-style:none;padding:0;margin:0;border-top:1px solid var(--line)}.rule-list li{display:grid;grid-template-columns:minmax(150px,1fr) 2fr;gap:14px;padding:12px 4px;border-bottom:1px solid var(--line)}.rule-list p{margin:0;color:var(--muted);font-size:14px}.table-wrap{overflow-x:auto}table.data{width:100%;border-collapse:collapse;background:var(--surface)}.data th,.data td{border-bottom:1px solid var(--line);padding:10px 12px;text-align:left;white-space:nowrap}.data th{background:var(--ink);color:var(--surface);font-size:13px}.data th button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}.data td.num{text-align:right}.people-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.person{border-top:2px solid var(--brass);background:var(--surface);padding:14px}.person h2{margin:0 0 7px}.person-meta{display:flex;flex-wrap:wrap;margin-bottom:10px}.person-meta span{border:1px solid var(--line);color:var(--muted);font-size:11px;padding:3px 6px;margin:0 5px 5px 0}.ticket-links{margin-top:12px}footer{border-top:1px solid var(--line);padding:16px 0 24px;color:var(--muted);font-size:12px}.mobile-counts{display:none}@media(max-width:700px){.root{padding:0 14px}.site-head{align-items:flex-start}.brand{width:100%;margin:0 0 4px}.site-head nav a{padding:8px 9px;margin-right:2px}.site-head time{margin:8px 0 0;width:100%}main{padding-top:18px}h1{font-size:25px}.mobile-counts{display:flex;overflow-x:auto;white-space:nowrap;border-bottom:1px solid var(--line);padding:0 0 8px;margin:0 0 12px}.mobile-counts a{display:block;flex:0 0 auto;border:1px solid var(--line);background:var(--surface);text-decoration:none;padding:7px 9px;font-size:12px;margin-right:6px}.mobile-counts a span{font-weight:bold;margin-left:4px}.board{display:grid;grid-template-columns:repeat(6,minmax(80vw,1fr));gap:10px;overflow-x:auto;padding-bottom:8px;scroll-behavior:smooth}.column{scroll-margin-top:8px}.column-empty .column-head{justify-content:flex-start}.column-empty .cards,.column-empty .done-rest{display:none}.fields th{width:105px}.people-grid{grid-template-columns:1fr}.rule-list li{grid-template-columns:1fr;gap:4px}.toolbar{align-items:stretch}.toolbar input,.toolbar select{width:100%;margin-right:0}.toolbar label{margin-top:7px}.data th,.data td{padding:9px 10px}}@media(prefers-color-scheme:dark){:root{--paper:#151c20;--surface:#1e282d;--ink:#e5e2d8;--muted:#a5aaa4;--line:#3b4649;--brass:#c1a660;--brass-soft:#302d23;--done:#83aa91;--danger:#d28c7b;--code:#2c3536;--status-inbox:#9bb2b8;--status-todo:#c1a660;--status-doing:#d18b64;--status-review:#aaa4d0;--status-hold:#a5aaa4;--status-done:#83aa91}.site-head nav a{color:var(--muted)}a{color:#b6c5c0}.card h3 a{color:var(--ink)}.copy-button{background:var(--brass);color:#151c20;border-color:var(--brass)}.data th{background:#0e1519;color:var(--ink)}}`;

fs.mkdirSync(out, { recursive: true });
const ticketDir = path.join(root, 'maestro/tickets');
const tickets = [];
fs.readdirSync(ticketDir).filter((name) => /^M-.*\.md$/.test(name)).sort().forEach((name) => {
  const parsed = parseTicket(path.join(ticketDir, name));
  if (parsed.warning) { console.warn('[maestro] ' + name + ' を読み飛ばしました: ' + parsed.warning); return; }
  tickets.push(parsed);
});
const ticketById = Object.fromEntries(tickets.map((ticket) => [ticket.id, ticket]));

function card(ticket) {
  const progress = ticket.itemCount ? Math.round(ticket.doneCount / ticket.itemCount * 100) : 0;
  const holder = ticket.status === 'doing' || ticket.status === 'review' ? '<div class="holder"><b>担当</b> ' + esc([ticket.owner, ticket.agent, ticket.model].filter(Boolean).join(' · ') || '未設定') + '</div>' : '';
  const parent = ticket.parent ? '<div class="parent">親: ' + (ticketById[ticket.parent] ? '<a href="/t/' + esc(ticket.parent) + '.html">' + esc(ticket.parent) + '</a>' : esc(ticket.parent)) + '</div>' : '';
  return '<article class="card" data-area="' + esc(ticket.area) + '" data-priority="' + esc(ticket.priority) + '" data-search="' + esc([ticket.id, ticket.title, ticket.area, ticket.priority, ticket.parent, ticket.owner, ticket.agent, ticket.model, ticket.sections['目的']].join(' ').toLowerCase()) + '"><div class="card-top"><a class="card-id" href="/t/' + esc(ticket.id) + '.html">' + esc(ticket.id) + '</a><span class="priority priority-' + esc(ticket.priority) + '">' + esc(ticket.priority) + '</span></div><h3><a href="/t/' + esc(ticket.id) + '.html">' + esc(ticket.title) + '</a></h3><div class="meta"><span>' + esc(ticket.area) + '</span><span>' + ticket.doneCount + '/' + ticket.itemCount + '</span></div><div class="progress-line" aria-label="進捗 ' + progress + '%"><span style="width:' + progress + '%"></span></div>' + holder + parent + '</article>';
}

const boardScript = `(function(){var root=document.querySelector('.root');var state={area:'',priority:'',query:''};function render(){var cards=root.querySelectorAll('.board .card');for(var i=0;i<cards.length;i++){var card=cards[i];var visible=(!state.area||card.getAttribute('data-area')===state.area)&&(!state.priority||card.getAttribute('data-priority')===state.priority)&&(!state.query||card.getAttribute('data-search').indexOf(state.query)>=0);card.style.display=visible?'':'none';}var columns=root.querySelectorAll('.column');for(var j=0;j<columns.length;j++){var column=columns[j];var shown=column.querySelectorAll('.cards .card');var count=0;for(var k=0;k<shown.length;k++){if(shown[k].style.display!=='none')count++;}column.className='column'+(count===0?' column-empty':'');var countNode=root.querySelector('[data-count="'+column.getAttribute('data-status')+'"]');if(countNode)countNode.textContent=count;}}function mediate(event){var node=event.target;if(node&&node.getAttribute){if(node.getAttribute('data-action')==='area')state.area=node.value;if(node.getAttribute('data-action')==='priority')state.priority=node.value;if(node.getAttribute('data-action')==='search')state.query=node.value.toLowerCase();render();}}root.addEventListener('change',mediate);root.addEventListener('input',mediate);}());`;
const areas = Array.from(new Set(tickets.map((ticket) => ticket.area))).sort();
let board = '<h1>ボード</h1><div class="toolbar"><label for="area-filter">分野</label><select id="area-filter" data-action="area"><option value="">すべて</option>' + areas.map((area) => '<option value="' + esc(area) + '">' + esc(area) + '</option>').join('') + '</select><label for="priority-filter">優先</label><select id="priority-filter" data-action="priority"><option value="">すべて</option><option>P1</option><option>P2</option><option>P3</option></select><label for="ticket-search">検索</label><input id="ticket-search" type="search" data-action="search" placeholder="番号・題・担当・目的"></div><nav class="mobile-counts" aria-label="状態の件数">' + statusOrder.map((status) => { const count = tickets.filter((ticket) => ticket.status === status).length; return '<a href="#col-' + status + '">' + esc(statusNames[status]) + '<span data-count="' + status + '">' + count + '</span></a>'; }).join('') + '</nav><div class="board">';
statusOrder.forEach((status) => {
  const found = tickets.filter((ticket) => ticket.status === status).sort((a, b) => status === 'done' ? (b.updated || b.created || '').localeCompare(a.updated || a.created || '') || b.id.localeCompare(a.id) : (a.priority || '').localeCompare(b.priority || '') || a.id.localeCompare(b.id));
  const shown = status === 'done' ? found.slice(0, 10) : found;
  board += '<section class="column' + (found.length ? '' : ' column-empty') + '" id="col-' + status + '" data-status="' + status + '" aria-label="' + esc(statusNames[status]) + '"><div class="column-head"><strong>' + esc(statusNames[status]) + '</strong><span data-count="' + status + '">' + found.length + '</span></div><div class="cards">' + (shown.length ? shown.map(card).join('') : '<div class="empty">—</div>') + '</div>';
  if (status === 'done' && found.length > 10) board += '<details class="done-rest"><summary>以前の済み ' + (found.length - 10) + ' 枚</summary><div class="cards">' + found.slice(10).map(card).join('') + '</div></details>';
  board += '</section>';
});
board += '</div>';
fs.writeFileSync(path.join(out, 'index.html'), layout('ボード', board, boardScript));

const detailScript = `(function(){var root=document.querySelector('.root');function mediate(event){var button=event.target;if(!button||button.getAttribute('data-action')!=='copy')return;var field=root.querySelector('#ai-prompt');field.focus();field.select();if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(field.value).then(function(){button.textContent='コピーしました';},function(){button.textContent='文を選択しました';});}else{button.textContent='文を選択しました';}}root.addEventListener('click',mediate);}());`;
for (const ticket of tickets) {
  const fieldNames = [['id', '番号'], ['status', '状態'], ['priority', '優先'], ['area', '分野'], ['parent', '親'], ['owner', '担当'], ['agent', 'AI'], ['model', 'モデル'], ['session', 'セッション'], ['branch', 'ブランチ'], ['created', '作成'], ['updated', '更新']];
  const fields = fieldNames.map(([key, label]) => {
    if (!ticket[key]) return '';
    const value = key === 'status' ? statusNames[ticket[key]] : key === 'parent' && ticketById[ticket.parent] ? '<a href="/t/' + esc(ticket.parent) + '.html">' + esc(ticket.parent) + ' · ' + esc(ticketById[ticket.parent].title) + '</a>' : esc(ticket[key]);
    return '<tr><th>' + esc(label) + '</th><td>' + value + '</td></tr>';
  }).join('');
  const childTickets = tickets.filter((child) => child.parent === ticket.id);
  const children = childTickets.length ? '<tr><th>子チケット</th><td>' + childTickets.map((child) => '<a href="/t/' + esc(child.id) + '.html">' + esc(child.id) + ' · ' + esc(child.title) + '</a>').join('<br>') + '</td></tr>' : '';
  const promptText = 'Maestro のチケット ' + ticket.id + ' を担当してください。最初に maestro/AGENT.md と maestro/tickets/' + ticket.id + '.md を読んでください。リポジトリ ' + repoUrl + '（ブランチ ' + branch + '）';
  const badges = '<div class="ticket-badges"><span class="badge status-' + esc(ticket.status) + '">' + esc(statusNames[ticket.status]) + '</span><span class="badge">' + esc(ticket.priority) + '</span><span class="badge">' + esc(ticket.area) + '</span><span class="badge">' + esc(ticket.owner || '未設定') + '</span></div>';
  const content = '<div class="detail-head"><div class="eyebrow"><a href="/index.html">ボード</a> / ' + esc(ticket.id) + '</div><h1>' + esc(ticket.title) + '</h1>' + badges + '</div><section class="ai-box"><h2>AI に渡す</h2><textarea id="ai-prompt" readonly>' + esc(promptText) + '</textarea><button class="copy-button" type="button" data-action="copy">文をコピー</button><p><a href="' + esc(fileUrl(ticket.file)) + '">GitHub でチケットを開く</a> · <a href="' + esc(fileUrl('maestro/AGENT.md')) + '">maestro/AGENT.md</a></p></section><article class="ticket-body">' + markdown(Object.keys(ticket.sections).map((key) => '## ' + key + '\n' + ticket.sections[key]).join('\n\n')) + '</article><table class="fields"><tbody>' + fields + children + '</tbody></table>';
  const dir = path.join(out, 't'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ticket.id + '.html'), layout(ticket.title, content, detailScript));
}

const rules = JSON.parse(fs.readFileSync(path.join(root, 'maestro/rules.json'), 'utf8'));
const byGroup = {};
rules.forEach((rule) => { if (!byGroup[rule.group]) byGroup[rule.group] = []; byGroup[rule.group].push(rule); });
let rulesHtml = '<h1>ルール</h1>';
Object.keys(byGroup).forEach((group) => { rulesHtml += '<section class="rule-group"><h2>' + esc(group) + '</h2><ul class="rule-list">' + byGroup[group].map((rule) => '<li><a href="' + esc(fileUrl(rule.path)) + '">' + esc(rule.title) + '</a><p>' + esc(rule.note) + '</p></li>').join('') + '</ul></section>'; });
fs.writeFileSync(path.join(out, 'rules.html'), layout('ルール', rulesHtml));

const assets = JSON.parse(fs.readFileSync(path.join(root, 'public/worldart/assets/assets_report.json'), 'utf8'));
const assetRows = assets.map((asset) => '<tr data-search="' + esc([asset.name, (asset.mats || []).join(' '), asset.tris, (asset.size || []).join(' ')].join(' ').toLowerCase()) + '"><td>' + esc(asset.name) + '</td><td class="num">' + esc(asset.tris) + '</td><td>' + esc((asset.size || []).map((v) => Number(v).toFixed(2)).join(' × ')) + '</td><td>' + esc((asset.mats || []).join(', ')) + '</td></tr>').join('');
const assetsScript = `(function(){var root=document.querySelector('.root');var state={query:'',column:-1,direction:1};function draw(){var body=root.querySelector('#asset-rows');var rows=[];var children=body.children;for(var i=0;i<children.length;i++)rows.push(children[i]);rows.sort(function(a,b){if(state.column<0)return 0;var av=a.children[state.column].textContent.toLowerCase();var bv=b.children[state.column].textContent.toLowerCase();var an=parseFloat(av);var bn=parseFloat(bv);if(!isNaN(an)&&!isNaN(bn)){av=an;bv=bn;}return (av<bv?-1:av>bv?1:0)*state.direction;});for(var j=0;j<rows.length;j++){body.appendChild(rows[j]);rows[j].style.display=(!state.query||rows[j].getAttribute('data-search').indexOf(state.query)>=0)?'':'none';}}function mediate(event){var target=event.target;if(target&&target.getAttribute){if(target.getAttribute('data-action')==='asset-search'){state.query=target.value.toLowerCase();draw();}if(target.getAttribute('data-sort')!==null){var column=parseInt(target.getAttribute('data-sort'),10);state.direction=state.column===column?-state.direction:1;state.column=column;draw();}}}root.addEventListener('input',mediate);root.addEventListener('click',mediate);}());`;
const assetsHtml = '<h1>アセット</h1><div class="toolbar"><label for="asset-search">検索</label><input id="asset-search" type="search" data-action="asset-search" placeholder="名前・材質"></div><div class="table-wrap"><table class="data"><thead><tr><th><button data-sort="0">名前 ↕</button></th><th><button data-sort="1">三角形 ↕</button></th><th><button data-sort="2">大きさ ↕</button></th><th><button data-sort="3">材質 ↕</button></th></tr></thead><tbody id="asset-rows">' + assetRows + '</tbody></table></div><p class="meta">' + assets.length + ' 件</p>';
fs.writeFileSync(path.join(out, 'assets.html'), layout('アセット', assetsHtml, assetsScript));

const active = tickets.filter((ticket) => ticket.status === 'doing' || ticket.status === 'review');
const people = {};
active.forEach((ticket) => { const key = ticket.owner || '未設定'; if (!people[key]) people[key] = []; people[key].push(ticket); });
let whoHtml = '<h1>担当</h1><h2>作業中・確認待ち</h2><div class="people-grid">';
Object.keys(people).sort().forEach((person) => { const owned = people[person]; const metadata = []; owned.forEach((ticket) => { [['AI', ticket.agent], ['モデル', ticket.model], ['セッション', ticket.session], ['ブランチ', ticket.branch]].forEach(([label, value]) => { if (value) { const tag = label + ': ' + value; if (metadata.indexOf(tag) < 0) metadata.push(tag); } }); }); whoHtml += '<section class="person"><h2>' + esc(person) + '</h2><div class="person-meta">' + metadata.map((tag) => '<span>' + esc(tag) + '</span>').join('') + '</div><div class="cards">' + owned.map(card).join('') + '</div></section>'; });
if (!active.length) whoHtml += '<p class="empty">作業中・確認待ちのチケットはありません。</p>';
whoHtml += '</div><h2>担当のない P1</h2><div class="ticket-links">' + tickets.filter((ticket) => ticket.priority === 'P1' && !ticket.owner && !ticket.agent && !ticket.model && ticket.status !== 'done').map((ticket) => '<a href="/t/' + esc(ticket.id) + '.html">' + esc(ticket.id) + ' · ' + esc(ticket.title) + ' · ' + esc(statusNames[ticket.status]) + '</a>').join('') + '</div>';
fs.writeFileSync(path.join(out, 'who.html'), layout('担当', whoHtml));
fs.writeFileSync(path.join(out, 'tickets.json'), JSON.stringify({ generatedAt: new Date().toISOString(), branch, tickets }, null, 2) + '\n');
console.log('[maestro] ' + tickets.length + ' tickets, ' + rules.length + ' rules, ' + assets.length + ' assets → maestro/dist');
