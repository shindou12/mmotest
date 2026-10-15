// Stable appearance IDs carried by the existing wst field. No rendering dependencies.
// 0–3 retain their historical meaning for every weapon kind.
export const SWORD_UNIQUE_STYLES=Object.freeze({amenomurakumo:4,durandal:5,laevateinn:6,oni_kiba:7,sosei:8});
const swordStyles=Object.values(SWORD_UNIQUE_STYLES);
export function uniqueWeaponStyle(kind,unique){
  return kind==='sword'&&typeof unique==='string'&&Object.hasOwn(SWORD_UNIQUE_STYLES,unique)?SWORD_UNIQUE_STYLES[unique]:null;
}
export function normalizeWeaponStyle(kind,style){
  return Number.isInteger(style)&&(style>=0&&style<=3||kind==='sword'&&swordStyles.includes(style))?style:0;
}
