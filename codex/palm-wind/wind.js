import * as THREE from 'three';

// 旧foliage.jsの2波合成を、葉の芯の区間回転へ適用する。
// GPU Gems 3 第6章の枝の階層回転を参考に、ヤシの8区間へ限定した。
export function prepareWindGeometry(geometry, model) {
  const ids = geometry.getAttribute('_card_id');
  if (!ids) throw new Error('風を準備する前に断面IDが削除されています');
  const groups = new Map();
  for (const row of model.cards) {
    if (!groups.has(row.frond)) groups.set(row.frond, []);
    groups.get(row.frond).push(row);
  }
  const rows = new Map();
  for (const group of groups.values()) {
    if (group.length !== 9) throw new Error('W1は9断面のヤシ専用です');
    const root = group[0].pivot, tip = group[8].pivot, mid = group[4].pivot;
    const length = Math.hypot(tip[0] - root[0], tip[2] - root[2]);
    const direction = [(tip[0] - root[0]) / length, 0, (tip[2] - root[2]) / length];
    const endHeight = (tip[1] - root[1]) / length;
    const midHeight = (mid[1] - root[1]) / length;
    const droop = 4 * midHeight - 2 * endHeight;
    const rise = endHeight + droop;
    const curve = [
      mid[0] - root[0] - direction[0] * length * .5,
      mid[1] - root[1] - length * (rise * .5 - droop * .25),
      mid[2] - root[2] - direction[2] * length * .5,
    ];
    group.forEach((row, i) => rows.set(row, { root, curve, shape: [length, rise, droop, i / 8] }));
  }
  const origins = [], curves = [], shapes = [];
  for (let i = 0; i < ids.count; i++) {
    const data = rows.get(model.cards[Math.round(ids.getX(i))]);
    if (!data) throw new Error('風の断面とGLBが一致しません');
    origins.push(...data.root); curves.push(...data.curve); shapes.push(...data.shape);
  }
  geometry.setAttribute('aWindRoot', new THREE.Float32BufferAttribute(origins, 3));
  geometry.setAttribute('aWindCurve', new THREE.Float32BufferAttribute(curves, 3));
  geometry.setAttribute('aWindShape', new THREE.Float32BufferAttribute(shapes, 4));
}

function shaderSource(config) {
  const number = value => Number(value).toFixed(9);
  return `
attribute vec3 aWindRoot;
attribute vec3 aWindCurve;
attribute vec4 aWindShape;
uniform float uWindTime, uWindStrength;
vec3 windRotate(vec3 delta, vec3 axis, float angle) {
  float sn = sin(angle), cs = cos(angle);
  return delta * cs + cross(axis, delta) * sn + axis * dot(axis, delta) * (1.0 - cs);
}
vec3 windCenterline(float t, vec3 outDirection) {
  return outDirection * (aWindShape.x * t)
    + vec3(0.0, aWindShape.x * (aWindShape.y * t - aWindShape.z * t * t), 0.0)
    + aWindCurve * (4.0 * t * (1.0 - t));
}
vec3 windPosition(vec3 point) {
  if (uWindStrength <= 0.0 || aWindShape.w <= 0.0) return point;
  mat4 windModel = modelMatrix * instanceMatrix;
  vec3 worldWind = vec3(${config.direction.map(number).join(',')});
  vec3 localWind = normalize(vec3(
    dot(worldWind, normalize(windModel[0].xyz)),
    0.0, dot(worldWind, normalize(windModel[2].xyz))));
  vec3 bendAxis = normalize(cross(vec3(0.0, 1.0, 0.0), localWind));
  vec3 outDirection = normalize(vec3(aFacingAxis.x, 0.0, aFacingAxis.z));
  float phase = dot(outDirection.xz, vec2(${config.phaseDirection.map(number).join(',')}));
  float time = uWindTime * ${number(Math.PI * 2 / config.period)};
  float wave = sin(time + phase) * ${number(config.primaryWeight)}
    + sin(time * ${number(config.secondaryFrequency)} + phase * ${number(config.secondaryPhase)}) * ${number(config.secondaryWeight)};
  float stiffness = aWindShape.y > 1.0 ? ${number(config.newLeafStiffness)} : 1.0;
  float bend = wave * ${number(config.bendRadians)} * uWindStrength * stiffness;
  vec3 center = aWindRoot;
  for (int i = 0; i < 8; i++) {
    float t0 = float(i) / 8.0;
    if (t0 >= aWindShape.w - 0.001) break;
    float t1 = t0 + 0.125;
    vec3 segment = windCenterline(t1, outDirection) - windCenterline(t0, outDirection);
    center += windRotate(segment, bendAxis, bend * (t0 + t1) * 0.5);
  }
  return center + windRotate(point - aRowPivot, bendAxis, bend * aWindShape.w);
}
`;
}

export function installWind(mesh, uniforms, config) {
  const code = shaderSource(config);
  for (const material of [mesh.material, mesh.customDepthMaterial]) {
    if (!material) throw new Error('風の影用材質がありません');
    const previous = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.customProgramCacheKey = () => `${key}:palm-w1-v2`;
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      const position = 'vec3 transformed = leafPosition(position);';
      if (!shader.vertexShader.includes(position)) throw new Error('ヤシの追従処理が見つかりません');
      const functionStart = 'vec3 leafPosition(vec3 point) {';
      if (!shader.vertexShader.includes(functionStart)) throw new Error('葉の属性を宣言する位置が見つかりません');
      shader.uniforms.uWindTime = uniforms.time;
      shader.uniforms.uWindStrength = uniforms.strength;
      shader.vertexShader = shader.vertexShader
        // 風はaFacingAxis・aRowPivotを読む。葉の属性宣言より後へ入れる。
        .replace(functionStart, `${code}\n${functionStart}`)
        .replace(position, 'vec3 transformed = windPosition(leafPosition(position));');
    };
    material.needsUpdate = true;
  }
}
