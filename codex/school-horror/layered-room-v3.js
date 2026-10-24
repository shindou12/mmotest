import * as THREE from "three";

// Joost van Dongenの室内の面との交点と家具レイヤーの構成を参考にする。
// 箱の模型は置かず、入口の画像面から仮想の各面と家具画像を別々に引く。
export function makeLayeredRoom(width, height, textures, options = {}) {
  const { wall, floor, ceiling, back, furniture } = textures;
  const material = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      wallMap: { value: wall }, floorMap: { value: floor }, ceilingMap: { value: ceiling },
      backMap: { value: back }, furnitureMap: { value: furniture },
      cameraLocal: { value: new THREE.Vector3() },
      openingSize: { value: new THREE.Vector2(width, height) },
      deskTransform: { value: new THREE.Vector4(furniture.repeat.x, furniture.repeat.y, furniture.offset.x, furniture.offset.y) },
      furnitureEnabled: { value: options.furniture === false ? 0 : 1 },
      frontRowDepth: { value: options.frontRowDepth ?? 1.25 },
      brightness: { value: options.brightness ?? 0.75 },
      tint: { value: new THREE.Color(options.tint ?? 0xbacde3) },
    }]),
    vertexShader: `
      varying vec2 portalUV;
      #include <fog_pars_vertex>
      void main() {
        portalUV = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform sampler2D wallMap, floorMap, ceilingMap, backMap, furnitureMap;
      uniform vec3 cameraLocal, tint;
      uniform vec2 openingSize;
      uniform vec4 deskTransform;
      uniform float furnitureEnabled, frontRowDepth, brightness;
      varying vec2 portalUV;
      #include <fog_pars_fragment>
      void main() {
        vec3 origin = vec3((portalUV - 0.5) * openingSize, 0.0);
        vec3 ray = normalize(origin - cameraLocal);
        // ドア中心は床から1.19m。室内は幅3.8m、高さ3.05m、奥行3.8m。
        float floorY = -1.19;
        float ceilingY = 1.86;
        float backZ = -3.8;
        float nearest = (backZ - origin.z) / min(ray.z, -0.00001);
        float surface = 0.0;
        if (abs(ray.x) > 0.00001) {
          float sideT = ((ray.x > 0.0 ? 1.9 : -1.9) - origin.x) / ray.x;
          if (sideT > 0.0 && sideT < nearest) { nearest = sideT; surface = 1.0; }
        }
        if (abs(ray.y) > 0.00001) {
          float verticalT = ((ray.y > 0.0 ? ceilingY : floorY) - origin.y) / ray.y;
          if (verticalT > 0.0 && verticalT < nearest) {
            nearest = verticalT; surface = ray.y > 0.0 ? 3.0 : 2.0;
          }
        }
        vec3 hit = origin + ray * nearest;
        vec3 color;
        if (surface < 0.5) color = texture2D(backMap, vec2(hit.x / 3.8 + 0.5, (hit.y - floorY) / 3.05)).rgb;
        else if (surface < 1.5) color = texture2D(wallMap, vec2(fract(-hit.z / 4.6), (hit.y - floorY) / 3.05)).rgb;
        else if (surface < 2.5) color = texture2D(floorMap, fract(vec2(hit.x, -hit.z) / 2.4)).rgb * 0.9;
        else color = texture2D(ceilingMap, fract(vec2(hit.x, -hit.z) / 1.2)).rgb * 0.7;
        float light = mix(0.85, 0.35, clamp(-hit.z / 3.8, 0.0, 1.0));
        color *= light;
        // 家具は背面の壁へ焼き込まず、別の距離で視線と交差させる。
        // 各層自体は平面のままなので、入口越しの限られた観察範囲で使う。
        for (int row = 0; row < 2; row++) {
          for (int column = 0; column < 3; column++) {
            float deskZ = -frontRowDepth - float(row) * 1.4;
            float deskX = (float(column) - 1.0) * 1.12 + float(row) * 0.10;
            float deskT = (deskZ - origin.z) / min(ray.z, -0.00001);
            vec3 deskHit = origin + ray * deskT;
            vec2 uv = (deskHit.xy - vec2(deskX, floorY + 0.385)) / vec2(0.66, 0.77) + 0.5;
            if (furnitureEnabled > 0.5 && deskT > 0.0 && deskT < nearest &&
              uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
              vec4 desk = texture2D(furnitureMap, uv * deskTransform.xy + deskTransform.zw);
              if (desk.a > 0.45) {
                color = desk.rgb * mix(1.0, 0.50, clamp(-deskZ / 3.8, 0.0, 1.0));
                nearest = deskT;
              }
            }
          }
        }
        gl_FragColor = vec4(color * tint * brightness, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.name = "面と家具画像を分けた教室";
  const localCamera = new THREE.Vector3();
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    camera.getWorldPosition(localCamera);
    mesh.worldToLocal(localCamera);
    material.uniforms.cameraLocal.value.copy(localCamera);
  };
  return mesh;
}
