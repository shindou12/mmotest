// 粘土のようになめらかな形を作る道具（符号付き距離 = SDF）。球・楕円体・カプセル・円すい台を「なめらかに足す／削る」で組み、
// 表面を網目（三角形）にする。色は部位ごとの色をなめらかに混ぜ、くぼみには陰（環境光の遮り）を焼き込む。
//   const S = sdf(); S.add(S.ellipsoid([0,1,0],[.5,.4,.4]), 0x986348, 0.12); ...; const geo = S.mesh(0.03);
// 表面の作り方は「サーフェスネッツ」（格子の各ますに1点を置き、隣のますどうしを四角形でつなぐ）
import * as THREE from 'three';

const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
// なめらかな最小（k が大きいほど広く溶け合う）
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

// 回転（オイラー角 XYZ）の逆を掛けて、形の中の座標へ直す関数を作る
function local(center, rot) {
  if (!rot) return (x, y, z) => [x - center[0], y - center[1], z - center[2]];
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)).invert().elements;
  return (x, y, z) => { const a = x - center[0], b = y - center[1], c = z - center[2]; return [m[0] * a + m[4] * b + m[8] * c, m[1] * a + m[5] * b + m[9] * c, m[2] * a + m[6] * b + m[10] * c]; };
}

export function sdf() {
  const items = []; // { d(x,y,z), color, k, sub, box }
  const S = {
    sphere: (c, r) => ({ d: (x, y, z) => len3(x - c[0], y - c[1], z - c[2]) - r, box: [c, r] }),
    // 楕円体（近似の距離）。rot で傾けられる
    ellipsoid: (c, r, rot) => {
      const L = local(c, rot), m = Math.max(...r);
      return { d: (x, y, z) => { const [a, b, e] = L(x, y, z); const k0 = len3(a / r[0], b / r[1], e / r[2]), k1 = len3(a / (r[0] * r[0]), b / (r[1] * r[1]), e / (r[2] * r[2])); return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -m; }, box: [c, m] };
    },
    // 円すい台（両端が球）: a から b へ、半径 ra → rb
    cone: (a, b, ra, rb = ra) => {
      const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], l2 = bx * bx + by * by + bz * bz;
      return {
        d: (x, y, z) => {
          const px = x - a[0], py = y - a[1], pz = z - a[2];
          const h = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / l2));
          return len3(px - bx * h, py - by * h, pz - bz * h) - (ra + (rb - ra) * h);
        },
        box: [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], Math.sqrt(l2) / 2 + Math.max(ra, rb)],
      };
    },
    // 足す（k: 溶け合う幅）／削る
    add: (shape, color, k = 0.08) => { items.push({ ...shape, color: new THREE.Color(color), k, sub: false }); return S; },
    cut: (shape, k = 0.03) => { items.push({ ...shape, k, sub: true }); return S; },
    dist(x, y, z) {
      let d = 1e9;
      for (const it of items) {
        if (it.sub) continue;
        const [c, r] = it.box, far = len3(x - c[0], y - c[1], z - c[2]) - r; // 遠い形は計算しない
        if (far > d + it.k) continue;
        d = smin(d, it.d(x, y, z), it.k);
      }
      for (const it of items) if (it.sub) d = smax(d, -it.d(x, y, z), it.k);
      return d;
    },
    // その点の色: 近い形ほど強く混ぜる
    color(x, y, z, out) {
      let w = 0, r = 0, g = 0, b = 0;
      for (const it of items) {
        if (it.sub) continue;
        const e = Math.exp(-Math.max(0, it.d(x, y, z)) * 60);
        w += e; r += it.color.r * e; g += it.color.g * e; b += it.color.b * e;
      }
      return out.setRGB(r / w, g / w, b / w);
    },
    // 表面を三角形の網目にする。cell: ますの大きさ（小さいほど細かい）
    mesh(cell = 0.03, ao = true) {
      let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (const it of items) if (!it.sub) { const [c, r] = it.box; for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c[i] - r - it.k); hi[i] = Math.max(hi[i], c[i] + r + it.k); } }
      lo = lo.map((v) => v - cell * 2); hi = hi.map((v) => v + cell * 2);
      const n = lo.map((v, i) => Math.ceil((hi[i] - v) / cell) + 1), [nx, ny, nz] = n;
      const at = (i, j, k) => i + nx * (j + ny * k);
      const D = new Float32Array(nx * ny * nz);
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) D[at(i, j, k)] = S.dist(lo[0] + i * cell, lo[1] + j * cell, lo[2] + k * cell);
      // 各ますに1点（ますの辺のうち、内外が変わる所の平均）
      const vid = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), pos = [];
      const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
      const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
      const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
      for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const v = C.map(([a, b, c]) => D[at(i + a, j + b, k + c)]);
        let inside = 0; for (const x of v) if (x < 0) inside++;
        if (inside === 0 || inside === 8) continue;
        let sx = 0, sy = 0, sz = 0, m = 0;
        for (const [a, b] of E) {
          if ((v[a] < 0) === (v[b] < 0)) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; m++;
        }
        vid[cid(i, j, k)] = pos.length / 3;
        pos.push(lo[0] + (i + sx / m) * cell, lo[1] + (j + sy / m) * cell, lo[2] + (k + sz / m) * cell);
      }
      // 内外が変わる格子の辺ごとに、その辺を囲む4つのますの点を四角形でつなぐ
      const idx = [];
      const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
      for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const d0 = D[at(i, j, k)] < 0;
        if (d0 !== (D[at(i + 1, j, k)] < 0) && i < nx - 1) quad(vid[cid(i, j - 1, k - 1)], vid[cid(i, j, k - 1)], vid[cid(i, j, k)], vid[cid(i, j - 1, k)], !d0);
        if (d0 !== (D[at(i, j + 1, k)] < 0) && j < ny - 1) quad(vid[cid(i - 1, j, k - 1)], vid[cid(i - 1, j, k)], vid[cid(i, j, k)], vid[cid(i, j, k - 1)], !d0);
        if (d0 !== (D[at(i, j, k + 1)] < 0) && k < nz - 1) quad(vid[cid(i - 1, j - 1, k)], vid[cid(i, j - 1, k)], vid[cid(i, j, k)], vid[cid(i - 1, j, k)], !d0);
      }
      // 法線は形の傾きから、色は部位の色＋くぼみの陰
      const N = pos.length / 3, nor = new Float32Array(N * 3), col = new Float32Array(N * 3), c = new THREE.Color(), h = cell * 0.5;
      for (let v = 0; v < N; v++) {
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        let gx = S.dist(x + h, y, z) - S.dist(x - h, y, z), gy = S.dist(x, y + h, z) - S.dist(x, y - h, z), gz = S.dist(x, y, z + h) - S.dist(x, y, z - h);
        const l = len3(gx, gy, gz) || 1; gx /= l; gy /= l; gz /= l;
        nor.set([gx, gy, gz], v * 3);
        S.color(x, y, z, c);
        let occ = 1;
        if (ao) { let s = 0; for (let q = 1; q <= 4; q++) { const t = q * 0.04; s += (t - S.dist(x + gx * t, y + gy * t, z + gz * t)) / (q * 0.8); } occ = Math.max(0.45, Math.min(1, 1 - s * 1.6)); }
        col.set([c.r * occ, c.g * occ, c.b * occ], v * 3);
      }
      // 三角形の表裏を、形の外向き（法線）にそろえる（輪郭線は裏側を描くので、表裏が逆だと体を覆ってしまう）
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, cc] = [idx[t], idx[t + 1], idx[t + 2]];
        const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
        const vx = pos[cc * 3] - pos[a * 3], vy = pos[cc * 3 + 1] - pos[a * 3 + 1], vz = pos[cc * 3 + 2] - pos[a * 3 + 2];
        const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
        if (fx * (nor[a * 3] + nor[b * 3] + nor[cc * 3]) + fy * (nor[a * 3 + 1] + nor[b * 3 + 1] + nor[cc * 3 + 1]) + fz * (nor[a * 3 + 2] + nor[b * 3 + 2] + nor[cc * 3 + 2]) < 0) { idx[t + 1] = cc; idx[t + 2] = b; }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(idx);
      return g;
    },
  };
  return S;
}
