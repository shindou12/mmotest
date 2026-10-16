// Procedural materials and an original generated birch cutout; no asset CDN.
import * as THREE from 'three';
import { seeded } from './kit.js';
import { OCC } from '../toon.js';

export function valleyMaterials() {
  const R = seeded(0xa17e4),
    textures = [];
  let disposed = false;
  const texture = (size, paint, repeat = 1) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    paint(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    textures.push(t);
    return t;
  };
  const stone = texture(512, (g, n) => {
    g.fillStyle = '#a3a393';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 26000; i++) {
      const v = 70 + R() * 120;
      g.fillStyle = `rgba(${v},${v},${v * 0.91},${0.05 + R() * 0.17})`;
      g.fillRect(R() * n, R() * n, 1 + R() * 6, 1 + R() * 3);
    }
    for (let i = 0; i < 30; i++) {
      g.strokeStyle = 'rgba(46,53,46,.12)';
      g.lineWidth = 0.5 + R();
      let x = R() * n,
        y = R() * n;
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        x += (R() - 0.5) * 40;
        y += R() * 20;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
  const ground = texture(
    512,
    (g, n) => {
      g.fillStyle = '#dedbc8';
      g.fillRect(0, 0, n, n);
      for (let i = 0; i < 40000; i++) {
        const v = 40 + R() * 160;
        g.fillStyle = `rgba(${v},${v},${v * 0.85},.075)`;
        g.fillRect(R() * n, R() * n, 1 + R() * 4, 1 + R() * 3);
      }
      for (let i = 0; i < 800; i++) {
        g.fillStyle = R() < 0.5 ? '#c5c0aa' : '#7c8170';
        g.beginPath();
        g.ellipse(R() * n, R() * n, 1 + R() * 2, 0.5 + R(), R() * 3, 0, 6.3);
        g.fill();
      }
    },
    90,
  );
  const bark = texture(256, (g, n) => {
    g.fillStyle = '#8b8270';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 800; i++) {
      g.strokeStyle = R() < 0.6 ? `rgba(40,36,31,${R() * 0.45})` : 'rgba(220,211,183,.2)';
      g.lineWidth = 1 + R() * 3;
      const x = R() * n,
        y = R() * n;
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x + 4, y + 20, x - 8, y + 45, x, y + 95);
      g.stroke();
    }
  });
  const leaf = texture(256, (g, n) => {
    for (let i = 0; i < 160; i++) {
      const x = 24 + R() * 208,
        y = 20 + R() * 215,
        a = R() * 6.28;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      const v = 140 + R() * 100;
      g.fillStyle = `rgb(${v * 0.92},${v},${v * 0.65})`;
      g.beginPath();
      g.moveTo(0, -13);
      g.bezierCurveTo(15, -4, 9, 8, 0, 13);
      g.bezierCurveTo(-9, 6, -12, -5, 0, -13);
      g.fill();
      g.strokeStyle = 'rgba(235,240,180,.3)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(0, -11);
      g.lineTo(0, 11);
      g.stroke();
      g.restore();
    }
  });
  const U = { time: { value: 0 }, player: { value: new THREE.Vector2(1e5, 1e5) } };
  // Wind stays attached to the roots. Occlusion keeps the original combat camera readable.
  const wind = (mat, amount, grass = false) => {
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { valleyTime: U.time, valleyPlayer: U.player, ...OCC });
      s.vertexShader =
        'uniform float valleyTime; uniform vec2 valleyPlayer; varying vec3 valleyWorld;\n' +
        s.vertexShader;
      s.vertexShader = s.vertexShader
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        vec4 root = vec4(0.,0.,0.,1.);
        #ifdef USE_INSTANCING
          root = instanceMatrix * root;
        #endif
        float bend = ${grass ? 'position.y * position.y' : 'uv.y'};
        transformed.x += sin(valleyTime * 1.35 + root.x * .23 + root.z * .17) * bend * ${amount.toFixed(3)};
        transformed.z += cos(valleyTime * .85 + root.x * .19) * bend * ${(amount * 0.5).toFixed(3)};
        ${grass ? 'vec2 away = root.xz - valleyPlayer; float d = length(away); transformed.xz += away / max(d, .1) * (1. - smoothstep(.2, 1.7, d)) * position.y * .65;' : ''}
      `,
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
        vec4 vw = vec4(transformed,1.);
        #ifdef USE_INSTANCING
          vw = instanceMatrix * vw;
        #endif
        valleyWorld = (modelMatrix * vw).xyz;
      `,
        );
      s.fragmentShader =
        `varying vec3 valleyWorld; uniform vec3 uOccCam; uniform vec3 uOccTgt; uniform float uOccR;\n` +
        s.fragmentShader;
      s.fragmentShader = s.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
        vec3 ray = uOccTgt - uOccCam;
        float along = clamp(dot(valleyWorld - uOccCam, ray) / max(dot(ray,ray), .001), 0., 1.);
        float d = length(valleyWorld - (uOccCam + along * ray));
        if (uOccR > 0. && along < .9 && d < uOccR && mod(gl_FragCoord.x + gl_FragCoord.y * 2., 4.) > 0.) discard;
        ${grass ? 'diffuseColor.rgb *= mix(.42, 1.15, vUv.y);' : ''}
      `,
      );
    };
    mat.customProgramCacheKey = () => `valley-wind-${amount}-${grass}`;
    return mat;
  };
  const materials = {
    ground: new THREE.MeshStandardMaterial({ map: ground, vertexColors: true, roughness: 0.97 }),
    stone: new THREE.MeshStandardMaterial({
      map: stone,
      color: 0xaea895,
      roughness: 0.96,
      bumpMap: stone,
      bumpScale: 0.12,
    }),
    darkStone: new THREE.MeshStandardMaterial({ map: stone, color: 0x686d60, roughness: 1 }),
    rock: new THREE.MeshStandardMaterial({
      map: stone,
      vertexColors: true,
      roughness: 1,
      bumpMap: stone,
      bumpScale: 0.14,
      flatShading: true,
    }),
    bark: new THREE.MeshStandardMaterial({
      map: bark,
      color: 0x918673,
      roughness: 1,
      bumpMap: bark,
      bumpScale: 0.12,
    }),
    leaf: wind(
      new THREE.MeshStandardMaterial({
        map: leaf,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
        roughness: 0.9,
        emissive: 0x6e8250,
        emissiveIntensity: 0.28,
      }),
      0.12,
    ),
    grass: wind(
      new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1 }),
      0.16,
      true,
    ),
    gold: new THREE.MeshStandardMaterial({ color: 0xb29553, metalness: 0.65, roughness: 0.5 }),
    glow: new THREE.MeshStandardMaterial({
      color: 0xb9e4dc,
      emissive: 0x69b8af,
      emissiveIntensity: 1.4,
      roughness: 0.4,
    }),
  };
  const ready = new Promise((resolve) => {
    const generated = new THREE.TextureLoader().load(
      '/assets/valley/birch-foliage.webp',
      () => {
        if (disposed) {
          generated.dispose();
          resolve();
          return;
        }
        generated.colorSpace = THREE.SRGBColorSpace;
        generated.anisotropy = 4;
        materials.leaf.map = generated;
        materials.leaf.needsUpdate = true;
        resolve();
      },
      undefined,
      () => resolve(),
    );
    textures.push(generated);
  });
  return {
    ...materials,
    U,
    ready,
    dispose() {
      disposed = true;
      for (const t of textures) t.dispose();
    },
  };
}
