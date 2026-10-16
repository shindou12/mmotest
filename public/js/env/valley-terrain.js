import { boundR, angOf, exitsOf, obstaclesOf } from '../../shared/areas.js';

export const ease = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const landNoise = (x, z) =>
  Math.sin(x * 0.067 + Math.sin(z * 0.04)) * Math.cos(z * 0.082) +
  Math.sin(x * 0.19 - z * 0.13) * 0.22 +
  Math.cos(x * 0.41 + z * 0.35) * 0.07;

export function valleyTerrain(def) {
  const exits = exitsOf(def),
    ponds = obstaclesOf(def).filter((o) => o.kind === 'pond');
  const roads = exits.map((e) => {
    const l = Math.hypot(e.x, e.z);
    return { x: e.x / l, z: e.z / l, l };
  });
  const roadDist = (x, z) => {
    let d = Math.hypot(x, z);
    for (const e of roads) {
      const t = x * e.x + z * e.z;
      if (t < 0 || t > e.l + 6) continue;
      d = Math.min(d, Math.abs(x * e.z - z * e.x + Math.sin(t * 0.075) * 1.3));
    }
    return d;
  };
  const heightAt = (x, z) => {
    const r = Math.hypot(x, z),
      edge = r - boundR(def, angOf(x, z));
    let h = landNoise(x, z) * 0.6;
    // Gentle shoulders beside the playable combat routes; large relief lives outside them.
    h += 2.8 * Math.exp(-((x - 32) ** 2 + (z - 10) ** 2) / 280);
    h += 2.0 * Math.exp(-((x + 38) ** 2 + (z + 15) ** 2) / 220);
    h *= 0.18 + 0.82 * ease(2, 9, roadDist(x, z));
    if (edge > -3) {
      const a = angOf(x, z);
      const ridge =
        5 + 7 * (0.5 + 0.5 * Math.sin(a * 5 + 0.4)) + 8 * (0.5 + 0.5 * Math.sin(a * 9 - 1.1));
      const opening = exits.reduce((k, e) => k * ease(4, 14, Math.hypot(x - e.x, z - e.z)), 1);
      h += ease(-3, 30, edge) * ridge * opening;
      h += ease(20, 95, edge) * (12 + 15 * landNoise(x * 0.65, z * 0.65));
      const peaks = Math.abs(Math.sin(a * 6 + 0.7)) + 0.18 * Math.sin(a * 17);
      h += ease(70, 150, edge) * (12 + peaks * 28 + 5 * landNoise(x * 1.5, z * 1.5));
    }
    // Beyond the western boundary, an inaccessible turquoise glacial basin.
    const basin = ease(-67, -85, x) * (1 - ease(55, 85, Math.abs(z + 5)));
    h = h * (1 - basin) + (-7 + landNoise(x, z) * 0.35) * basin;
    for (const o of ponds) {
      const k = 1 - ease(o.r - 0.5, o.r + 2.2, Math.hypot(x - o.x, z - o.z));
      h = h * (1 - k) - 0.9 * k;
    }
    return h;
  };
  return { heightAt, roadDist };
}
