// Stable appearance IDs carried by the existing wst field. No rendering dependencies.
// 0–3 retain their historical meaning for every weapon kind.
export const SWORD_UNIQUE_STYLES=Object.freeze({amenomurakumo:4,durandal:5,laevateinn:6,oni_kiba:7,sosei:8});
export const GREATSWORD_UNIQUE_STYLES=Object.freeze({excalibur:6,dainsleif:7});
const swordStyles=Object.values(SWORD_UNIQUE_STYLES);
const greatswordStyles=[4,5,...Object.values(GREATSWORD_UNIQUE_STYLES)];
export function uniqueWeaponStyle(kind,unique){
  if(typeof unique!=='string')return null;
  if(kind==='sword'&&Object.hasOwn(SWORD_UNIQUE_STYLES,unique))return SWORD_UNIQUE_STYLES[unique];
  if(kind==='greatsword'&&Object.hasOwn(GREATSWORD_UNIQUE_STYLES,unique))return GREATSWORD_UNIQUE_STYLES[unique];
  return null;
}
export function normalizeWeaponStyle(kind,style){
  return Number.isInteger(style)&&(style>=0&&style<=3||kind==='sword'&&swordStyles.includes(style)||kind==='greatsword'&&greatswordStyles.includes(style))?style:0;
}
