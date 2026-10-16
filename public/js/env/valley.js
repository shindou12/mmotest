// The Dawnring Vale: an original procedural environment, shared by the game and the art preview.
import * as THREE from 'three';
import {
  AREAS,
  exitsOf,
  obstaclesOf,
  chestsOf,
  insideOpen,
  boundR,
  angOf,
} from '../../shared/areas.js';
import { seeded, local, I, textSprite } from './kit.js';
import { makeChest } from './obstacles.js';
import { valleyMaterials } from './valley-materials.js';
import { valleyTerrain, landNoise, ease } from './valley-terrain.js';

export const VALLEY_VIEWS = [
  { name: '巡礼の古道', subtitle: 'THE PILGRIM’S WAY', eye: [1, 5.8, 13], target: [-5, 17, -108] },
  { name: '水鏡の岸', subtitle: 'THE STILLWATER SHORE', eye: [-72, 6, 22], target: [-94, 1, -48] },
  { name: '暁の環', subtitle: 'THE DAWNRING', eye: [9, 8, -17], target: [-6, 20, -112] },
  { name: '谷の全景', subtitle: 'THE WAKING VALLEY', eye: [76, 54, 90], target: [-9, 8, -31] },
];

export function buildValley(def, opts = {}) {
  const group = new THREE.Group();
  group.name = 'Dawnring Vale';
  const R = seeded(0xda7a11),
    M = valleyMaterials(),
    anims = [];
  const { heightAt, roadDist } = valleyTerrain(def);
  const low = (opts.grass ?? 1) < 0.7;
  const obs = obstaclesOf(def),
    exits = exitsOf(def),
    chestDefs = chestsOf(def);
  const pending = new Map(),
    geometries = new Set();
  const geometry = (g) => {
    geometries.add(g);
    return g;
  };
  const boxGeo = geometry(new THREE.BoxGeometry(1, 1, 1));
  const trunkGeo = geometry(new THREE.CylinderGeometry(0.6, 1, 1, 7, 2));
  const leafGeo = geometry(new THREE.PlaneGeometry(1, 1));
  const rockGeo = geometry(new THREE.IcosahedronGeometry(1, 2));
  const rp = rockGeo.attributes.position,
    rc = [];
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i),
      y = rp.getY(i),
      z = rp.getZ(i);
    const warp = 1 + 0.12 * Math.sin(x * 9 + z * 5) + 0.08 * Math.sin(y * 12 - x * 6);
    rp.setXYZ(i, x * warp, Math.min(0.85, y * warp), z * warp);
    const moss = ease(0.2, 0.9, y) * (0.5 + 0.5 * Math.sin(x * 8 + z * 13));
    rc.push(0.88 - moss * 0.25, 0.88 - moss * 0.16, 0.81 - moss * 0.29);
  }
  rockGeo.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
  rockGeo.computeVertexNormals();
  // One instanced draw per geometry/material, including masonry and tree branches.
  const put = (geo, mat, matrix, color = null) => {
    const key = geo.uuid + mat.uuid;
    if (!pending.has(key)) pending.set(key, { geo, mat, entries: [] });
    pending.get(key).entries.push({ matrix, color });
  };
  const block = (mat, x, y, z, sx, sy, sz, ry = 0, rz = 0) =>
    put(boxGeo, mat, local(I, x, y, z, 0, ry, rz, sx, sy, sz));
  const attach = (geo, mat, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry(geo), mat);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const color = new THREE.Color();

  // Continuous, vertex-colored terrain. Fine mineral texture is generated in valley-materials.
  const terrain = new THREE.PlaneGeometry(660, 660, low ? 190 : 290, low ? 190 : 290);
  terrain.rotateX(-Math.PI / 2);
  const p = terrain.attributes.position,
    colors = new Float32Array(p.count * 3);
  const meadow = new THREE.Color(0x697c45),
    sage = new THREE.Color(0x90945c),
    earth = new THREE.Color(0xb6a280),
    cliff = new THREE.Color(0x797e73);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      h = heightAt(x, z),
      edge = Math.hypot(x, z) - boundR(def, angOf(x, z));
    p.setY(i, h);
    color.copy(meadow).lerp(sage, 0.5 + landNoise(x * 1.6, z * 1.6) * 0.28);
    color.lerp(earth, (1 - ease(1.1, 3.8, roadDist(x, z))) * 0.93);
    color.lerp(cliff, ease(5, 20, edge) * 0.85);
    if (h < -1) color.lerp(earth, 0.8);
    for (const o of obs) if (Math.hypot(x - o.x, z - o.z) < o.r + 1) color.lerp(earth, 0.4);
    color.multiplyScalar(0.93 + 0.07 * Math.sin(x * 1.73 + z * 2.93));
    color.toArray(colors, i * 3);
  }
  terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrain.computeVertexNormals();
  attach(terrain, M.ground);

  // Rock instances share a subtly weathered surface with per-instance lichen colors.
  const rock = (x, z, s = 1, tall = 1, y = heightAt(x, z)) => {
    color.setHSL(0.15 + R() * 0.025, 0.04 + R() * 0.05, 0.48 + R() * 0.16);
    put(
      rockGeo,
      M.rock,
      local(I, x, y + s * 0.25, z, R() * 0.5, R() * 6.28, R() * 0.3, s * 1.25, s * tall, s),
      color.clone(),
    );
  };
  const branch = (a, b, radius) => {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b),
      dir = to.clone().sub(from);
    const matrix = new THREE.Matrix4().compose(
      from.add(to).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize(),
      ),
      new THREE.Vector3(radius, dir.length(), radius),
    );
    put(trunkGeo, M.bark, matrix);
  };
  const tree = (x, z, s = 1, golden = false) => {
    const y = heightAt(x, z),
      h = (7 + R() * 3.5) * s,
      lean = (R() - 0.5) * s;
    branch([x, y - 0.2, z], [x + lean, y + h * 0.84, z + 0.3 * s], 0.38 * s);
    for (let j = 0; j < 5; j++) {
      const a = j * 2.4 + R(),
        reach = (1.5 + R() * 1.7) * s;
      const bx = x + Math.sin(a) * reach,
        bz = z + Math.cos(a) * reach,
        by = y + h * (0.64 + R() * 0.25);
      branch([x, y + h * 0.4, z], [bx, by, bz], 0.14 * s);
      const leaves = low ? 5 : 10;
      for (let k = 0; k < leaves; k++) {
        const px = bx + (R() - 0.5) * 3.5 * s,
          py = by + (R() - 0.3) * 2.8 * s,
          pz = bz + (R() - 0.5) * 3.5 * s;
        color.setRGB(
          0.73 + R() * 0.26,
          golden ? 0.76 + R() * 0.2 : 0.86 + R() * 0.14,
          golden ? 0.48 + R() * 0.2 : 0.72 + R() * 0.2,
        );
        put(
          leafGeo,
          M.leaf,
          local(I, px, py, pz, (R() - 0.5) * 2.5, R() * 6.28, R(), (2.8 + R() * 1.3) * s),
          color.clone(),
        );
      }
    }
    for (let j = 0; j < 4; j++) {
      const a = j * 1.57 + 0.3;
      branch(
        [x + Math.sin(a) * 0.9 * s, y + 0.02, z + Math.cos(a) * 0.9 * s],
        [x, y + 0.7 * s, z],
        0.15 * s,
      );
    }
  };

  // Collision silhouettes come directly from the server's seeded obstacle definitions.
  for (const o of obs) {
    if (o.kind === 'tree') tree(o.x, o.z, o.r * 0.77, o.x > 15);
    if (o.kind === 'rock') rock(o.x, o.z, o.r * 0.83, 0.8);
  }
  // Forests grow beyond the playable edge, leaving the central encounters and routes open.
  for (let i = 0; i < (low ? 150 : 260); i++) {
    const a = R() * 6.28,
      d = boundR(def, a) + 3 + R() * 37;
    const x = Math.sin(a) * d,
      z = -Math.cos(a) * d;
    if (
      x < -68 ||
      (Math.abs(x + 6) < 24 && z < -35) ||
      roadDist(x, z) < 6 ||
      exits.some((e) => Math.hypot(x - e.x, z - e.z) < 9)
    )
      continue;
    tree(x, z, 0.7 + R() * 0.75, x > 20 && R() < 0.28);
  }
  for (let i = 0; i < 240; i++) {
    const a = R() * 6.28,
      d = boundR(def, a) + 8 + R() * 30;
    const x = Math.sin(a) * d,
      z = -Math.cos(a) * d;
    if (x < -72 || exits.some((e) => Math.hypot(x - e.x, z - e.z) < 9)) continue;
    rock(x, z, 1.1 + R() * 4, 0.6 + R());
  }

  // Hand-shaped procedural masonry: voussoirs, capstones, buttresses and an incomplete ring.
  const arch = (x, z, radius, spring, depth, angle = 0, broken = false, base = heightAt(x, z)) => {
    const root = local(I, x, base, z, 0, angle);
    const stone = (px, py, pz, sx, sy, sz, rz = 0, mat = M.stone) =>
      put(boxGeo, mat, local(root, px, py, pz, 0, 0, rz, sx, sy, sz));
    for (const sign of [-1, 1]) {
      for (let h = 0.45; h < spring; h += 0.86)
        stone(sign * (radius + 0.55), h, 0, 1.1, 0.82, depth);
      stone(sign * (radius + 0.55), 0.2, 0, 1.65, 0.4, depth + 0.7, 0, M.darkStone);
      stone(sign * (radius + 0.55), spring - 0.15, 0, 1.65, 0.36, depth + 0.35);
    }
    const count = Math.ceil(radius * 5);
    for (let i = 0; i < count; i++) {
      if (broken && i > count * 0.52 && i < count * 0.72) continue;
      const a = ((i + 0.5) / count) * Math.PI;
      stone(
        Math.cos(a) * (radius + 0.55),
        spring + Math.sin(a) * (radius + 0.55),
        0,
        1.1,
        (((radius + 0.55) * Math.PI) / count) * 0.96,
        depth,
        a,
      );
    }
  };
  // The distant crown is deliberately aligned with the northward route.
  const heroX = -9,
    heroZ = -116,
    heroY = heightAt(heroX, heroZ) + 12;
  for (let i = 0; i < 10; i++)
    rock(heroX + (R() - 0.5) * 34, heroZ + (R() - 0.5) * 14, 6 + R() * 5, 1.4, heroY - 10);
  block(M.darkStone, heroX, heroY - 8, heroZ, 43, 16, 19);
  for (let i = 0; i < 8; i++)
    block(M.stone, heroX + (i - 3.5) * 5.2, heroY - 8, heroZ + 9.7, 1.1, 16, 1.1);
  arch(heroX, heroZ, 15, 9, 4.2, -0.07, true, heroY);
  arch(heroX, heroZ - 2.8, 13.8, 9, 1.1, -0.07, true, heroY);
  for (const s of [-1, 1]) {
    const x = heroX + s * 20;
    block(M.stone, x, heroY + 10, heroZ, 4.4, 20, 7);
    block(M.darkStone, x, heroY + 20, heroZ, 5.4, 0.8, 8);
    for (let i = 0; i < 4; i++)
      block(
        M.stone,
        x + (i % 2 ? 1.6 : -1.6),
        heroY + 21.2,
        heroZ + (i < 2 ? -2.8 : 2.8),
        0.9,
        2.3,
        0.9,
      );
    for (let h = 2; h < 19; h += 3.3)
      block(M.darkStone, x, heroY + h, heroZ + 3.55, 4.5, 0.22, 0.25);
    block(M.gold, x, heroY + 12, heroZ + 3.6, 0.16, 7, 0.16);
  }
  const beacon = attach(new THREE.OctahedronGeometry(1.2), M.glow, heroX, heroY + 15, heroZ);
  beacon.scale.set(0.7, 2, 0.7);
  anims.push((t) => {
    beacon.rotation.y = t * 0.15;
  });
  // A ruined aqueduct cuts diagonally across the background, never across walkable space.
  for (let i = 0; i < 7; i++) {
    const x = 25 + i * 12.2,
      z = -81 - i * 1.5,
      y = heightAt(x, z);
    arch(x, z, 4.4, 12, 3, 0.12, i === 4, y - 5);
    if (i !== 4) {
      block(M.stone, x, y + 12.6, z, 12.4, 1, 3.5, 0.12);
      block(M.darkStone, x, y + 13.3, z, 12.4, 0.25, 3.8, 0.12);
    }
  }
  // Routes get distinct silhouettes; labels retain the game's actual destinations.
  const portals = exits.map((e, i) => {
    const y = heightAt(e.x, e.z),
      a = Math.atan2(e.x, e.z);
    arch(e.x, e.z, 2.7, 2.2, 1.0, a, i === 2, y);
    const obj = new THREE.Group();
    obj.position.set(e.x, y, e.z);
    const label = textSprite(AREAS[e.to].name, '#e3ddbd', 3.5);
    label.position.y = 6.5;
    obj.add(label);
    const light = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), M.glow);
    light.position.y = 5.7;
    obj.add(light);
    group.add(obj);
    return { ...e, obj };
  });
  // Old road fragments are flat and follow the height field, so nothing blocks players.
  for (const e of exits) {
    const l = Math.hypot(e.x, e.z),
      ux = e.x / l,
      uz = e.z / l;
    for (let d = 5; d < l - 4; d += 1.5)
      for (const s of [-1, 0, 1]) {
        if (R() < 0.3) continue;
        const side = s * 0.7 - Math.sin(d * 0.075) * 1.3 + (R() - 0.5) * 0.3;
        const x = ux * d + uz * side,
          z = uz * d - ux * side;
        put(
          rockGeo,
          M.rock,
          local(
            I,
            x,
            heightAt(x, z) - 0.045,
            z,
            0,
            R() * 6,
            0,
            0.36 + R() * 0.16,
            0.065,
            0.4 + R() * 0.15,
          ),
          new THREE.Color(0xa5a18b),
        );
      }
    for (let d = 10; d < l - 5; d += 13) {
      const x = ux * d + uz * 3.7,
        z = uz * d - ux * 3.7,
        y = heightAt(x, z);
      block(M.darkStone, x, y + 0.18, z, 0.7, 0.36, 0.7);
      block(M.stone, x, y + 0.7, z, 0.3, 0.8, 0.3);
      block(M.gold, x, y + 1.22, z, 0.5, 0.22, 0.5);
      block(M.glow, x, y + 1.4, z, 0.22, 0.22, 0.22);
    }
  }

  // Water uses world-space ripples and Fresnel color, with a soft, broken shoreline.
  const waterU = { time: M.U.time };
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: waterU,
    vertexShader: `varying vec3 wp; varying vec2 vuv; uniform float time;
      void main(){ vec3 p=position; p.z += sin(p.x*.4+time*.7)*.025; vec4 w=modelMatrix*vec4(p,1.);wp=w.xyz;vuv=uv;gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `varying vec3 wp;varying vec2 vuv;uniform float time;
      void main(){vec3 eye=normalize(cameraPosition-wp);float fres=pow(1.-max(eye.y,0.),3.);
      float a=wp.x*.65+wp.z*.4+sin(wp.z*.15)*1.8+time*.5;
      float b=wp.x*1.13-wp.z*.72+sin(wp.x*.23)*.7-time*.8;
      vec3 normal=normalize(vec3(-.045*cos(a)-.025*cos(b),1.,-.03*cos(a)+.02*cos(b)));
      vec3 halfVector=normalize(eye+normalize(vec3(-.6,.48,-.5)));
      float glint=pow(max(0.,dot(normal,halfVector)),120.);
      float shore=1.-smoothstep(.38,.5,length(vuv-.5));
      vec3 c=mix(vec3(.035,.17,.16),vec3(.40,.59,.58),fres);
      c+=(sin(a)+sin(b))*.008+glint*vec3(.6,.48,.28);
      gl_FragColor=vec4(c,.86*shore);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const water = (x, z, rx, rz, y) => {
    const w = attach(new THREE.PlaneGeometry(rx * 2, rz * 2, 24, 24), waterMat, x, y, z);
    w.rotation.x = -Math.PI / 2;
  };
  water(-98, -6, 35, 66, -4.9);
  for (const o of obs) if (o.kind === 'pond') water(o.x, o.z, o.r + 0.8, o.r + 0.8, -0.36);
  // Two translucent, animated ribbons descend from a cleft beyond the basin.
  const fallMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: waterU,
    vertexShader:
      'varying vec2 vuv;void main(){vuv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vuv;uniform float time;void main(){float n=sin(vuv.x*73.+sin(vuv.y*22.+time*3.))*sin(vuv.y*14.+time*6.);float a=sin(vuv.x*3.14159)*(.35+n*.15);gl_FragColor=vec4(.72,.86,.81,a);}`,
  });
  for (let i = 0; i < 2; i++) {
    const x = -102 + i * 3.4,
      z = -55 - i * 0.5,
      top = 18 - i * 2;
    const f = attach(new THREE.PlaneGeometry(3.7 - i, top + 5), fallMat, x, (top - 5) / 2, z);
    f.rotation.y = 0.25;
  }
  rock(-113, -62, 5, 3.6, 2);
  rock(-90, -62, 5, 4, 2);
  rock(-102, -69, 8, 2.5, 2);

  // Grass blades: one instanced mesh; bent silhouettes, clustered colors, clear combat floors.
  const blade = new THREE.BufferGeometry();
  blade.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.045, 0, 0, 0.045, 0, 0, -0.025, 0.38, 0.04, 0.025, 0.38, 0.04, 0.025, 0.78, 0.17],
      3,
    ),
  );
  blade.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 0.5, 1, 0.5, 0.5, 1], 2),
  );
  blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  blade.computeVertexNormals();
  geometry(blade);
  M.grass.defines = { USE_UV: '' };
  const clear = (x, z, pad = 0) =>
    !insideOpen(def, x, z, 1) ||
    roadDist(x, z) < 2.1 ||
    obs.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad) ||
    chestDefs.some((c) => Math.hypot(x - c.x, z - c.z) < 1.8) ||
    Math.hypot(x, z) < 2.5;
  const count = low ? 24000 : 110000;
  for (let i = 0; i < count; i++) {
    const x = (R() - 0.5) * 142,
      z = (R() - 0.5) * 92;
    if (clear(x, z, 0.3)) continue;
    const patch = 0.5 + 0.5 * landNoise(x * 2, z * 2);
    if (R() > 0.48 + patch * 0.4) continue;
    color.setHSL(0.19 + R() * 0.035, 0.24 + R() * 0.15, 0.33 + R() * 0.2);
    const h = 0.45 + R() * 0.65 + patch * 0.3;
    put(
      blade,
      M.grass,
      local(I, x, heightAt(x, z) - 0.02, z, 0, R() * 6.28, 0, 1.2 + R(), h, 0.8),
      color.clone(),
    );
  }
  // Small field flowers form patches, rather than a uniform confetti layer.
  const flowerGeo = geometry(new THREE.SphereGeometry(1, 5, 3));
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  for (let i = 0; i < (low ? 450 : 1500); i++) {
    const x = (R() - 0.5) * 130,
      z = (R() - 0.5) * 85;
    if (clear(x, z, 0.5) || Math.sin(x * 0.22) * Math.cos(z * 0.19) < 0.34) continue;
    const y = heightAt(x, z),
      h = 0.22 + R() * 0.28;
    put(trunkGeo, M.bark, local(I, x, y + h * 0.5, z, 0, 0, 0, 0.012, h, 0.012));
    put(
      flowerGeo,
      petalMat,
      local(I, x, y + h, z, 0, R() * 6, 0, 0.1, 0.045, 0.1),
      new THREE.Color(R() < 0.72 ? 0xe2d8b3 : 0x9384b5),
    );
  }
  // Fine pebbles anchor the larger forms without introducing invisible collision.
  for (let i = 0; i < 450; i++) {
    const x = (R() - 0.5) * 134,
      z = (R() - 0.5) * 84;
    if (
      !insideOpen(def, x, z, 2) ||
      obs.some((o) => o.kind === 'pond' && Math.hypot(x - o.x, z - o.z) < o.r + 1)
    )
      continue;
    rock(x, z, 0.07 + R() * 0.16, 0.6);
  }

  // A high, luminous sky and layered mist establish depth without a downloaded panorama.
  const sky = attach(
    new THREE.SphereGeometry(480, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader:
        'varying vec3 vpos;void main(){vpos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 vpos;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){vec3 d=normalize(vpos);float h=max(0.,d.y);vec3 c=mix(vec3(.79,.84,.78),vec3(.20,.42,.57),pow(h,.4));
      vec2 p=d.xz/max(.12,d.y)*2.7;float n=noise(p)*.55+noise(p*2.1)*.27+noise(p*4.3)*.13+noise(p*8.1)*.05;
      float cloud=smoothstep(.48,.73,n)*smoothstep(.03,.2,d.y);c=mix(c,vec3(.92,.92,.82),cloud*.8);
      float sun=pow(max(0.,dot(d,normalize(vec3(-.6,.48,-.5)))),180.);c+=vec3(1.,.79,.43)*sun*.8;gl_FragColor=vec4(c,1.);}`,
    }),
  );
  sky.renderOrder = -10;
  const mistMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader:
      'varying vec2 vuv;void main(){vuv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:
      'varying vec2 vuv;void main(){float a=sin(vuv.y*3.14159)*sin(vuv.x*3.14159)*.045;gl_FragColor=vec4(.80,.86,.79,a);}',
  });
  for (let i = 0; i < 9; i++) {
    const mist = attach(
      new THREE.PlaneGeometry(220, 6 + i * 1.3),
      mistMat,
      0,
      4 + i * 0.5,
      -65 - i * 17,
    );
    anims.push((t) => {
      mist.position.x = Math.sin(t * 0.025 + i) * 6;
    });
  }
  // Sparse floating pollen, with no extra lights or thousands of animated objects.
  const pollenPos = new Float32Array(180 * 3);
  for (let i = 0; i < 180; i++) {
    pollenPos[i * 3] = (R() - 0.5) * 110;
    pollenPos[i * 3 + 1] = 1 + R() * 9;
    pollenPos[i * 3 + 2] = (R() - 0.5) * 70;
  }
  const pollenGeo = geometry(new THREE.BufferGeometry());
  pollenGeo.setAttribute('position', new THREE.BufferAttribute(pollenPos, 3));
  const pollen = new THREE.Points(
    pollenGeo,
    new THREE.PointsMaterial({
      color: 0xffecc0,
      size: 0.055,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    }),
  );
  group.add(pollen);
  anims.push((t) => {
    pollen.position.x = Math.sin(t * 0.06) * 2;
    pollen.position.y = Math.sin(t * 0.1) * 0.4;
  });

  for (const { geo, mat, entries } of pending.values()) {
    const mesh = new THREE.InstancedMesh(geo, mat, entries.length);
    entries.forEach((e, i) => {
      mesh.setMatrixAt(i, e.matrix);
      if (e.color) mesh.setColorAt(i, e.color);
    });
    mesh.castShadow = mat !== M.grass && mat !== petalMat;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  const chests = chestDefs.map((c) => {
    const obj = makeChest(false);
    obj.position.set(c.x, heightAt(c.x, c.z), c.z);
    group.add(obj);
    anims.push(obj.userData.anim);
    return { ...c, obj };
  });
  return {
    group,
    ready: M.ready,
    heightAt,
    portals,
    chests,
    gate: null,
    box: null,
    lair: null,
    ringMats: [],
    atmosphere: { sky: 0xc9d5cd, ground: 0x6c7054, sun: 0xffe0a8, sunOffset: [-35, 55, -28] },
    light: { hemi: 1.7, sun: 2.7, fog: 0xc7d1c5, fogNear: 65, fogFar: 330 },
    update(t, px = 1e5, pz = 1e5) {
      M.U.time.value = t;
      M.U.player.value.set(px, pz);
      for (const f of anims) f(t);
    },
    dispose() {
      M.dispose();
      group.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
      });
    },
  };
}
