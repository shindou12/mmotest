import * as THREE from 'three';

// 軸制限ビルボード。芯を動かさず、その周囲の断面だけを回す。
const deformation = `
attribute vec3 aFacingCenter, aFacingNormal, aFacingAxis, aRowPivot, aRowAxis;
attribute vec2 aRowResponse;
uniform vec3 uLeafCamera;
uniform float uLeafFollow;
vec3 leafPosition(vec3 point) {
  if (uLeafFollow <= 0.0 || aRowResponse.x <= 0.0) return point;
  mat4 leafModel = modelMatrix * instanceMatrix;
  vec3 toward = uLeafCamera - (leafModel * vec4(aFacingCenter, 1.0)).xyz;
  vec3 direction = normalize(vec3(
    dot(toward, normalize(leafModel[0].xyz)),
    dot(toward, normalize(leafModel[1].xyz)),
    dot(toward, normalize(leafModel[2].xyz))));
  // 両面の葉。裏側で180度裏返さず、連続する小さな補正だけを使う。
  // 軸方向から見たときも、射影を無理に正規化せず自然に補正を弱める。
  float sine = clamp(dot(cross(aFacingNormal, direction), aFacingAxis), -0.99999, 0.99999);
  float angle = clamp(asin(sine), -aRowResponse.y, aRowResponse.y)
    * uLeafFollow * aRowResponse.x;
  vec3 delta = point - aRowPivot;
  float sn = sin(angle), cs = cos(angle);
  return aRowPivot + delta * cs + cross(aRowAxis, delta) * sn
    + aRowAxis * dot(aRowAxis, delta) * (1.0 - cs);
}
`;

function deform(material, uniforms) {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${key}:palm-axial-v1`;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uLeafCamera = uniforms.camera;
    shader.uniforms.uLeafFollow = uniforms.follow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${deformation}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = leafPosition(position);');
  };
  material.needsUpdate = true;
}

export function installPartialFoliage(mesh, model, uniforms) {
  const geometry = mesh.geometry;
  const ids = geometry.getAttribute('_card_id');
  if (!ids) throw new Error('ヤシの断面IDがありません');
  const values = { aFacingCenter: [], aFacingNormal: [], aFacingAxis: [], aRowPivot: [], aRowAxis: [], aRowResponse: [] };
  for (let i = 0; i < ids.count; i++) {
    const row = model.cards[Math.round(ids.getX(i))];
    if (!row) throw new Error(`ヤシの断面IDが不正です: ${ids.getX(i)}`);
    values.aFacingCenter.push(...row.center);
    values.aFacingNormal.push(...row.normal);
    values.aFacingAxis.push(...row.facingAxis);
    values.aRowPivot.push(...row.pivot);
    values.aRowAxis.push(...row.axis);
    values.aRowResponse.push(row.weight, row.maxAngle);
  }
  for (const [name, data] of Object.entries(values)) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(data, name === 'aRowResponse' ? 2 : 3));
  }
  geometry.deleteAttribute('_card_id');
  deform(mesh.material, uniforms);
  if (!mesh.customDepthMaterial) throw new Error('ヤシの影用材質がありません');
  deform(mesh.customDepthMaterial, uniforms);
  mesh.frustumCulled = false;
}
