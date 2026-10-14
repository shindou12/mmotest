// 画面（ui/app.js）への窓口。DOM には直接さわらない
export let ui = null;
export const toast = (...a) => ui?.toast(...a);
export const banner = (...a) => ui?.banner(...a);
export const addChat = (...a) => ui?.chat(...a);
export const floatText = (...a) => ui?.floatText(...a);
export const renderParty = () => ui?.party();
export const renderQuests = () => ui?.quests();

export function setUI(v) { ui = v; }
