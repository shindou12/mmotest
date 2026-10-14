// 盾の形の登録表。形の名前（shared/data.js の WEAPONS[kind].shield）ごとの関数。盾の形を足すときは、ここに関数を足す
// k: { rarityIn（レア度）, rc（レア度の色）, rarity（飾りの段階） }。戻り値の userData.gauge はガード中に光る縁の材質
import * as THREE from 'three';
import { mesh, extrude, finish } from './kit.js';
import { toon, glow } from '../toon.js';

export const SHIELD_MODELS = {
  // 盾槍の盾: 五角形の盾と、ガード中に光る縁
  kite({ rc, rarity }) {
    const g = new THREE.Group();
    const face = toon(rarity >= 3 ? new THREE.Color(0x5a6a8a).lerp(rc, 0.3) : 0x5a6a8a);
    const rim = toon(rarity >= 3 ? 0xf2c14e : 0xb8c0cc);
    g.add(mesh(extrude([[-0.42, 0.55], [0.42, 0.55], [0.42, -0.1], [0, -0.62], [-0.42, -0.1]], 0.08), face));
    g.add(mesh(extrude([[-0.12, 0.25], [0.12, 0.25], [0.12, -0.05], [0, -0.3], [-0.12, -0.05]], 0.03, 0), rarity >= 2 ? glow(rc.clone().multiplyScalar(1.2)) : rim, [0, 0, 0.06]));
    g.add(mesh(new THREE.TorusGeometry(0.5, 0.035, 5, 20, Math.PI), rim, [0, 0.05, 0.02], [0, 0, 0], [0.85, 1, 1]));
    finish(g, 0.9);
    // ガード中だけ光る縁（ガードゲージの残りで 青 → 黄 → 赤）。この盾だけの材質にする
    const gm = new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const gl = new THREE.Mesh(extrude([[-0.48, 0.61], [0.48, 0.61], [0.48, -0.13], [0, -0.7], [-0.48, -0.13]], 0.02, 0), gm);
    gl.position.z = 0.1; gl.renderOrder = 2;
    g.add(gl);
    g.userData.gauge = gm;
    return g;
  },
};
