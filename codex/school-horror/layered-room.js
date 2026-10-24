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
      torchPosition: { value: new THREE.Vector3() },
      torchDirection: { value: new THREE.Vector3(0, 0, -1) },
      torchColor: { value: new THREE.Color() },
      torchPower: { value: 0 }, torchDistance: { value: 14 },
      torchCone: { value: new THREE.Vector2() },
      sharedAmbient: { value: options.ambient ? 1 : 0 },
      skyIrradiance: { value: new THREE.Color() },
      groundIrradiance: { value: new THREE.Color() },
      fillIrradiance: { value: new THREE.Color() },
      roomShadows: { value: options.shadows === false ? 0 : 1 },
      roomToDoor: { value: new THREE.Matrix4() },
      doorSize: { value: new THREE.Vector2() },
      doorMap: { value: options.door?.material.map ?? furniture },
      doorTransform: { value: new THREE.Vector4() },
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
      uniform vec3 torchPosition, torchDirection, torchColor;
      uniform vec2 torchCone, doorSize;
      uniform float torchPower, torchDistance, roomShadows;
      uniform float sharedAmbient;
      uniform vec3 skyIrradiance, groundIrradiance, fillIrradiance;
      uniform mat4 roomToDoor;
      uniform sampler2D doorMap;
      uniform vec4 doorTransform;
      varying vec2 portalUV;
      #include <fog_pars_fragment>
      vec4 deskPixel(vec3 p, int row, int column) {
        float deskX = (float(column) - 1.0) * 1.12 + float(row) * 0.10;
        vec2 uv = (p.xy - vec2(deskX, -1.19 + 0.385)) / vec2(0.66, 0.77) + 0.5;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
        return texture2D(furnitureMap, uv * deskTransform.xy + deskTransform.zw);
      }
      float visibility(vec3 p) {
        vec3 toLight = torchPosition - p;
        if (torchPosition.z <= 0.0 || toLight.z <= 0.0) return 0.0;
        // Gotowの開口へ戻る光線。位置を持つ光源に置き換えている。
        vec2 entry = (p + toLight * (-p.z / toLight.z)).xy;
        vec2 margin = openingSize * 0.5 - abs(entry);
        float visible = smoothstep(0.0, 0.018, min(margin.x, margin.y));
        if (roomShadows < 0.5) return visible;
        // 実際に表示しているドア画像の面と透過部分で遮光する。
        vec3 a = (roomToDoor * vec4(p, 1.0)).xyz;
        vec3 b = (roomToDoor * vec4(torchPosition, 1.0)).xyz;
        if (doorSize.x > 0.0 && abs(b.z - a.z) > 0.00001) {
          float doorT = -a.z / (b.z - a.z);
          vec2 doorUV = (a + (b - a) * doorT).xy / doorSize + 0.5;
          if (doorT > 0.001 && doorT < 1.0 &&
            doorUV.x >= 0.0 && doorUV.x <= 1.0 && doorUV.y >= 0.0 && doorUV.y <= 1.0) {
            if (texture2D(doorMap, doorUV * doorTransform.xy + doorTransform.zw).a > 0.18) return 0.0;
          }
        }
        if (furnitureEnabled > 0.5) {
          for (int row = 0; row < 2; row++) {
            float deskZ = -frontRowDepth - float(row) * 1.4;
            float t = (deskZ - p.z) / toLight.z;
            if (t > 0.001 && t < 1.0) {
              for (int column = 0; column < 3; column++) {
                if (deskPixel(p + toLight * t, row, column).a > 0.45) return 0.0;
              }
            }
          }
        }
        return visible;
      }
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
        vec3 normal = surface < 0.5 ? vec3(0, 0, 1) :
          surface < 1.5 ? vec3(-sign(ray.x), 0, 0) :
          surface < 2.5 ? vec3(0, 1, 0) : vec3(0, -1, 0);
        vec3 color;
        if (surface < 0.5) color = texture2D(backMap, vec2(hit.x / 3.8 + 0.5, (hit.y - floorY) / 3.05)).rgb;
        else if (surface < 1.5) color = texture2D(wallMap, vec2(fract(-hit.z / 4.6), (hit.y - floorY) / 3.05)).rgb;
        else if (surface < 2.5) color = texture2D(floorMap, fract(vec2(hit.x, -hit.z) / 2.4)).rgb * 0.9;
        else color = texture2D(ceilingMap, fract(vec2(hit.x, -hit.z) / 1.2)).rgb * 0.7;
        float ambient = mix(0.85, 0.35, clamp(-hit.z / 3.8, 0.0, 1.0));
        // 家具は背面の壁へ焼き込まず、別の距離で視線と交差させる。
        // 各層自体は平面のままなので、入口越しの限られた観察範囲で使う。
        for (int row = 0; row < 2; row++) {
          for (int column = 0; column < 3; column++) {
            float deskZ = -frontRowDepth - float(row) * 1.4;
            float deskT = (deskZ - origin.z) / min(ray.z, -0.00001);
            vec3 deskHit = origin + ray * deskT;
            if (furnitureEnabled > 0.5 && deskT > 0.0 && deskT < nearest) {
              vec4 desk = deskPixel(deskHit, row, column);
              if (desk.a > 0.45) {
                color = desk.rgb;
                ambient = mix(1.0, 0.50, clamp(-deskZ / 3.8, 0.0, 1.0));
                hit = deskHit; normal = vec3(0, 0, 1);
                nearest = deskT;
              }
            }
          }
        }
        vec3 lit = color * tint * brightness * ambient;
        // 廊下のHemisphereLightとAmbientLightを共有する。
        // Three.js r160の半球光の補間とLambertの拡散項を参考にする。
        if (sharedAmbient > 0.5) {
          vec3 irradiance = mix(groundIrradiance, skyIrradiance, normal.y * 0.5 + 0.5) + fillIrradiance;
          lit = color * irradiance * ambient / 3.14159265;
        }
        if (torchPower > 0.0) {
          vec3 delta = torchPosition - hit;
          float distanceToLight = length(delta);
          vec3 lightDir = delta / max(distanceToLight, 0.001);
          float cone = smoothstep(torchCone.x, torchCone.y, dot(-lightDir, torchDirection));
          float falloff = pow(clamp(1.0 - pow(distanceToLight / torchDistance, 4.0), 0.0, 1.0), 2.0);
          float irradiance = torchPower * cone * falloff / max(distanceToLight * distanceToLight, 0.01);
          lit += color * torchColor * max(dot(normal, lightDir), 0.0) * irradiance * visibility(hit) / 3.14159265;
        }
        gl_FragColor = vec4(lit, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.name = "面と家具画像を分けた教室";
  const localCamera = new THREE.Vector3();
  const localLight = new THREE.Vector3(), localTarget = new THREE.Vector3();
  const inverseDoor = new THREE.Matrix4();
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    camera.getWorldPosition(localCamera);
    mesh.worldToLocal(localCamera);
    material.uniforms.cameraLocal.value.copy(localCamera);
    const light = mesh.userData.flashlight;
    const uniforms = material.uniforms;
    if (options.ambient) {
      const { sky, fill } = options.ambient;
      uniforms.skyIrradiance.value.copy(sky.color).multiplyScalar(sky.intensity);
      uniforms.groundIrradiance.value.copy(sky.groundColor).multiplyScalar(sky.intensity);
      uniforms.fillIrradiance.value.copy(fill.color).multiplyScalar(fill.intensity);
    }
    uniforms.torchPower.value = light && options.lighting !== false ? light.intensity : 0;
    if (light) {
      // 反射の描画カメラとは独立した、実際のSpotLightを唯一の情報源にする。
      light.getWorldPosition(localLight); light.target.getWorldPosition(localTarget);
      mesh.worldToLocal(localLight); mesh.worldToLocal(localTarget);
      uniforms.torchPosition.value.copy(localLight);
      uniforms.torchDirection.value.copy(localTarget).sub(localLight).normalize();
      uniforms.torchColor.value.copy(light.color);
      uniforms.torchDistance.value = light.distance;
      uniforms.torchCone.value.set(Math.cos(light.angle), Math.cos(light.angle * (1 - light.penumbra)));
    }
    if (options.door) {
      options.door.updateWorldMatrix(true, false);
      inverseDoor.copy(options.door.matrixWorld).invert();
      uniforms.roomToDoor.value.multiplyMatrices(inverseDoor, mesh.matrixWorld);
      const { width: doorWidth, height: doorHeight } = options.door.geometry.parameters;
      uniforms.doorSize.value.set(doorWidth, doorHeight);
      const map = options.door.material.map;
      uniforms.doorTransform.value.set(map.repeat.x, map.repeat.y, map.offset.x, map.offset.y);
    }
  };
  return mesh;
}
