// 画面: NPC との会話・転移門・共有ボックス。Presenter（描画パラメータを計算して View に set する）を P に足す。createUI（ui/app.js）が呼ぶ
// ui: 画面の部品と Presenter の入れ物（app.js が作る）。ほかの画面と共有する値は ui.〜 で読み書きする
import { FLOORS, MAX_FLOOR, TITLES } from '../../../shared/data.js';
import { QUESTS, questState, questAvailable } from '../../quests.js';
import { esc } from '../helpers.js';

export function installNpc(ui) {
  const { game, BOX, DLG, GATE, P, cellSetup } = ui;
  P.dialog = (npc) => {
    const char = game.char;
    const qs = QUESTS.filter((q) => q.npc === npc.id).filter((q) => questState(char, q.id) || questAvailable(char, q));
    DLG.title.set({ text: npc.name });
    DLG.line.set({ text: `「${npc.line}」` });
    if (!qs.length) { DLG.list.list([], () => ({})).set({ html: '<div class="dim">今はお願いしたいことはないよ。</div>' }); return; }
    DLG.list.list(qs, (q) => {
      const s = questState(char, q.id);
      const rw = [`経験値 ${q.reward.xp}`, q.reward.rarity != null ? `${q.reward.rarity >= 4 ? '伝説の' : `特性${q.reward.rarity}つ付きの`}${q.reward.slot ? { weapon: '武器', armor: '防具', acc: '装飾品' }[q.reward.slot] : '装備'}` : '', q.reward.potion ? `ポーション所持数 +${q.reward.potion}` : '', q.reward.title ? `称号「${TITLES[q.reward.title].name}」（${TITLES[q.reward.title].desc}）` : ''].filter(Boolean).join('・');
      let btn;
      if (!s) btn = '<button data-act="accept">受ける</button>';
      else if (s.claimed) btn = '<span class="dim">完了</span>';
      else if (s.done) btn = '<button class="claim" data-act="claim">報告する</button>';
      else btn = `<span class="dim">${s.p} / ${q.n}</span>`;
      return {
        data: q.id,
        html: `<div class="quest ${s?.claimed ? 'claimed' : ''}"><div><b>${esc(q.name)}</b><div class="dim">${esc(q.desc)}</div><div class="rw">報酬：${rw}</div></div>${btn}</div>`,
        setup: (v) => {
          v.link((ev) => { ev.payload.quest = q.id; });
          const b = v.el.querySelector('button[data-act]');
          if (b) v.add('btn', b).on('click', b.dataset.act === 'accept' ? 'quest:accept' : 'quest:claim');
        },
      };
    });
  };

  P.gate = () => {
    const world = game.world;
    GATE.list.list(FLOORS.slice(0, MAX_FLOOR), (f) => ({
      data: f.n,
      html: `<button class="${f.n === world.floor ? 'cur' : ''}"><b>第${f.n}層</b> ${f.n <= world.unlocked ? f.name : '？？？'} <span class="dim" style="float:right">推奨Lv${1 + (f.n - 1) * 5}〜</span></button>`,
      setup: (v) => { v.set({ disabled: f.n > world.unlocked }); v.on('click', 'gate:warp', () => ({ floor: f.n })); },
    }));
  };

  P.box = () => {
    const char = game.char;
    BOX.count.set({ text: `${ui.boxItems.length} / ${ui.boxMax}` });
    BOX.mine.list(char.inv, (it) => ({ html: P.itemCell(it), data: it.id, setup: cellSetup }));
    if (!char.inv.length) BOX.mine.set({ html: '<div class="dim">インベントリは空です</div>' });
    BOX.shared.list(ui.boxItems, (it) => ({ html: P.itemCell(it), data: it.uid, setup: cellSetup }));
    if (!ui.boxItems.length) BOX.shared.set({ html: '<div class="dim">共有ボックスは空です。装備をクリックして入れよう</div>' });
  };
}
