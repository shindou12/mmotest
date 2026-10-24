import * as THREE from "three";
import { glslCore } from "./vendor/interior-chunks.js";

// Three-Fenestra の imRoomBoxUV をそのまま使う。出典と MIT ライセンスは vendor/ に保存。
export function makeInterior(width, height, texture, options = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        roomMap: { value: texture },
        cameraLocal: { value: new THREE.Vector3() },
        depth: { value: options.depth ?? 0.9 },
        brightness: { value: options.brightness ?? 1.0 },
        tint: { value: new THREE.Color(options.tint ?? 0xffffff) },
        cropX: { value: 1.0 },
      },
    ]),
    vertexShader: `
      varying vec2 roomUV;
      #include <fog_pars_vertex>
      void main() {
        roomUV = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: glslCore + `
      uniform sampler2D roomMap;
      uniform vec3 cameraLocal;
      uniform vec3 tint;
      uniform float depth;
      uniform float brightness;
      uniform float cropX;
      varying vec2 roomUV;
      #include <fog_pars_fragment>
      void main() {
        vec2 sampleUV = depth > 0.001
          ? imRoomBoxUV(cameraLocal, roomUV - 0.5, depth, 0.72)
          : roomUV;
        sampleUV.x = (sampleUV.x - 0.5) * cropX + 0.5;
        vec3 room = texture2D(roomMap, clamp(sampleUV, 0.002, 0.998)).rgb;
        gl_FragColor = vec4(room * tint * brightness, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    fog: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  const localCamera = new THREE.Vector3();
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    camera.getWorldPosition(localCamera);
    mesh.worldToLocal(localCamera);
    material.uniforms.cameraLocal.value.set(
      localCamera.x / width,
      localCamera.y / height,
      localCamera.z / Math.max(width, height),
    );
  };
  return mesh;
}
