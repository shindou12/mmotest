import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, exitsOf, obstaclesOf, insideOpen } from '../public/shared/areas.js';
import { valleyTerrain } from '../public/js/env/valley-terrain.js';

test('Dawnring routes stay gentle and continuous for planar movement and attack indicators', () => {
  const def = AREAS.f1_field,
    { heightAt } = valleyTerrain(def);
  for (const e of exitsOf(def)) {
    const len = Math.hypot(e.x, e.z);
    for (let t = 0; t <= len; t += 0.5) {
      const x = (e.x / len) * t,
        z = (e.z / len) * t;
      const dx = (heightAt(x + 0.1, z) - heightAt(x - 0.1, z)) / 0.2;
      const dz = (heightAt(x, z + 0.1) - heightAt(x, z - 0.1)) / 0.2;
      assert.ok(Math.hypot(dx, dz) < 0.3, `route to ${e.to} has steep ground at ${t}m`);
    }
  }
  for (let x = -70; x < 70; x += 2)
    for (let z = -44; z < 44; z += 2) {
      const y = heightAt(x, z);
      assert.ok(Number.isFinite(y));
      if (
        insideOpen(def, x, z, 4) &&
        !obstaclesOf(def).some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 2)
      ) {
        assert.ok(Math.abs(y - heightAt(x + 0.1, z)) < 0.12, 'no seams or cliffs in combat space');
      }
    }
});

test('valley generation is deterministic and keeps every exit on the same height field', () => {
  const a = valleyTerrain(AREAS.f1_field),
    b = valleyTerrain(AREAS.f1_field);
  for (const { x, z } of [...exitsOf(AREAS.f1_field), ...obstaclesOf(AREAS.f1_field)])
    assert.equal(a.heightAt(x, z), b.heightAt(x, z));
});
