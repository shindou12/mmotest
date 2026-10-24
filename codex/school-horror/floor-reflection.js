import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

// Three.js r160 の Reflector が反射カメラとクリッピングを担当する。
// ここでは反射画像の混ぜ方だけを、木床の弱い反射に合わせる。
export function makeFloorReflection(width, length, detailMap, strength = 1) {
  const reflector = new Reflector(new THREE.PlaneGeometry(width, length), {
    textureWidth: 768,
    textureHeight: 768,
    multisample: 0,
    clipBias: 0.003,
    color: 0xffffff,
    shader: {
      uniforms: {
        ...Reflector.ReflectorShader.uniforms,
        detailMap: { value: detailMap },
        strength: { value: strength },
        tileCount: { value: new THREE.Vector2(width / 2.4, length / 2.4) },
      },
      vertexShader: `
        uniform mat4 textureMatrix;
        varying vec4 reflectionUV;
        varying vec2 floorUV;
        varying vec3 worldPosition;
        void main() {
          reflectionUV = textureMatrix * vec4(position, 1.0);
          floorUV = uv;
          worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D detailMap;
        uniform vec2 tileCount;
        uniform float strength;
        varying vec4 reflectionUV;
        varying vec2 floorUV;
        varying vec3 worldPosition;
        void main() {
          vec3 detail = texture2D(detailMap, floorUV * tileCount).rgb;
          vec2 uv = reflectionUV.xy / reflectionUV.w;
          uv += (detail.rg - 0.1) * vec2(0.0025, 0.0008);
          vec2 blur = vec2(0.0015, 0.0010);
          vec3 reflection = texture2D(tDiffuse, uv).rgb * 0.4;
          reflection += texture2D(tDiffuse, uv + blur).rgb * 0.15;
          reflection += texture2D(tDiffuse, uv - blur).rgb * 0.15;
          reflection += texture2D(tDiffuse, uv + vec2(blur.x, -blur.y)).rgb * 0.15;
          reflection += texture2D(tDiffuse, uv + vec2(-blur.x, blur.y)).rgb * 0.15;
          vec3 viewDirection = normalize(cameraPosition - worldPosition);
          float fresnel = pow(1.0 - clamp(viewDirection.y, 0.0, 1.0), 3.0);
          float varnish = mix(0.55, 1.0, smoothstep(0.025, 0.18, detail.r));
          gl_FragColor = vec4(reflection, strength * (0.035 + 0.19 * fresnel) * varnish);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    },
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set(0, 0.024, -length / 2);
  reflector.material.transparent = true;
  reflector.material.depthWrite = false;
  reflector.renderOrder = 2;
  return reflector;
}
