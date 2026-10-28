import * as THREE from 'three';

// 支点まわりの剛体回転。既存カードは中心・係数1・上限なしとして扱う。
const rotation = `
attribute vec3 aCardCenter, aCardNormal, aCardRight, aCardPivot;
attribute vec2 aCardResponse;
uniform vec3 uLeafCamera;
uniform float uLeafFollow;
vec3 leafPosition(vec3 point) {
  if (uLeafFollow <= 0.0 || aCardResponse.x <= 0.0) return point;
  mat4 leafModel = modelMatrix * instanceMatrix;
  vec3 worldCenter = (leafModel * vec4(aCardCenter, 1.0)).xyz;
  vec3 toward = uLeafCamera - worldCenter;
  // worldartの配置は回転＋等方スケール。各軸の長さを外して局所方向へ戻す。
  vec3 direction = normalize(vec3(
    dot(toward, normalize(leafModel[0].xyz)),
    dot(toward, normalize(leafModel[1].xyz)),
    dot(toward, normalize(leafModel[2].xyz))));
  vec3 axis = cross(aCardNormal, direction);
  float axisLength = length(axis);
  axis = axisLength > 0.00001 ? axis / axisLength : normalize(aCardRight);
  float angle = min(acos(clamp(dot(aCardNormal, direction), -1.0, 1.0))
    * uLeafFollow * aCardResponse.x, aCardResponse.y);
  vec3 delta = point - aCardPivot;
  float sn = sin(angle), cs = cos(angle);
  return aCardPivot + delta * cs + cross(axis, delta) * sn
    + axis * dot(axis, delta) * (1.0 - cs);
}
`;

function deform(material, uniforms) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  const key = previousKey();
  material.customProgramCacheKey = () => `${key}:leaf-partial-v2`;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uLeafFollow = uniforms.follow;
    shader.uniforms.uLeafCamera = uniforms.camera;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${rotation}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = leafPosition(position);');
  };
  material.needsUpdate = true;
}

export function installPartialFoliage(mesh, model, uniforms) {
  const geometry = mesh.geometry;
  const ids = geometry.getAttribute('_card_id');
  if (!ids) throw new Error('GLBに_CARD_IDがありません。build.pyで専用アセットを生成してください。');
  const center = [], normal = [], right = [], pivot = [], response = [];
  for (let i = 0; i < ids.count; i++) {
    const card = model.cards[Math.round(ids.getX(i))];
    if (!card) throw new Error(`葉のカードIDが不正です: ${ids.getX(i)}`);
    center.push(...card.center); normal.push(...card.normal); right.push(...card.right);
    pivot.push(...(card.pivot || card.center));
    response.push(card.weight ?? 1, card.maxAngle ?? Math.PI);
  }
  geometry.setAttribute('aCardCenter', new THREE.Float32BufferAttribute(center, 3));
  geometry.setAttribute('aCardNormal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('aCardRight', new THREE.Float32BufferAttribute(right, 3));
  geometry.setAttribute('aCardPivot', new THREE.Float32BufferAttribute(pivot, 3));
  geometry.setAttribute('aCardResponse', new THREE.Float32BufferAttribute(response, 2));
  // 球状の照明法線は保持。カメラに合わせて房の明暗が回らないようにする。
  deform(mesh.material, uniforms);
  if (!mesh.customDepthMaterial) throw new Error('葉の影用材質がありません');
  // 影のパスでもライト視点へ向けず、主カメラと同じ形を描く。
  deform(mesh.customDepthMaterial, uniforms);
  mesh.frustumCulled = false;
}
