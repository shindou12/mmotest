import * as THREE from 'three';
import { clamp } from './util.js';
import { me, mobs } from './state.js';

// ======================================================================
// 3D 空間のラベル（DOM の UI は ui/app.js）
// ======================================================================
// 敵の名前とHPバーは、モデルの子として3D空間に置く（画面上でずれない）
export function makeMobLabel(mb) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xdddddd, depthTest: false, depthWrite: false, transparent: true, fog: false }));
  sp.renderOrder = 999;
  sp.geometry.userData.shared = true; // Sprite のジオメトリは three.js 内で共有されている
  const s = mb.model.scale.x;
  sp.scale.set(3.2 / s, 0.8 / s, 1);
  sp.position.y = (2.75 + (mb.model.userData.float ? 0.6 : 0)) / s * (mb.elite ? 1.1 : 1);
  sp.userData.cv = cv;
  mb.model.add(sp);
  mb.label = sp;
  drawMobLabel(mb, 100);
  return sp;
}
export function drawMobLabel(mb, pct) {
  const aggro = mb.target === me.id;
  mb.labelPct = pct; mb.labelLv = mb.lv; mb.labelAggro = aggro;
  const cv = mb.label.userData.cv, g = cv.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.font = 'bold 22px "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.85)';
  const txt = `${aggro ? '! ' : ''}Lv${mb.lv} ${mb.name}`;
  g.strokeText(txt, 128, 20); g.fillStyle = aggro ? '#ff6a5a' : mb.elite === 3 ? '#ff8ae0' : mb.elite ? '#ffc04a' : '#ffffff'; g.fillText(txt, 128, 20);
  g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(48, 40, 160, 12);
  g.fillStyle = pct > 30 ? '#e8443a' : '#ff9a3a'; g.fillRect(50, 42, 156 * pct / 100, 8);
  mb.label.material.map.needsUpdate = true;
}

export function updateMobLabels() {
  for (const mb of mobs.values()) {
    if (!mb.label) continue;
    mb.label.visible = Math.hypot(mb.x - me.x, mb.z - me.z) < 30;
    const pct = Math.round(clamp(mb.hp / mb.mhp, 0, 1) * 100);
    if (pct !== mb.labelPct || mb.lv !== mb.labelLv || (mb.target === me.id) !== mb.labelAggro) drawMobLabel(mb, pct);
  }
}
