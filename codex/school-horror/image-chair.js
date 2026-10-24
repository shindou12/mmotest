import * as THREE from "three";

// 元画像は変更せず、アトラスの一領域内の不透明部分をUVで切り出す。
export function cropAtlasPart(texture, column, row, columns = 2, rows = 2) {
  const image = texture.image;
  const xStart = Math.floor(image.width * column / columns);
  const xEnd = Math.floor(image.width * (column + 1) / columns);
  const yStart = Math.floor(image.height * row / rows);
  const yEnd = Math.floor(image.height * (row + 1) / rows);
  const canvas = document.createElement("canvas");
  canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height).data;
  let minX = xEnd, minY = yEnd, maxX = xStart, maxY = yStart;
  for (let y = yStart; y < yEnd; y++) for (let x = xStart; x < xEnd; x++) {
    if (data[(y * image.width + x) * 4 + 3] < 180) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + 1); maxY = Math.max(maxY, y + 1);
  }
  if (maxX <= minX || maxY <= minY) throw new Error("画像部品が空です");
  const part = texture.clone();
  part.repeat.set((maxX - minX) / image.width, (maxY - minY) / image.height);
  part.offset.set(minX / image.width, 1 - maxY / image.height);
  part.needsUpdate = true;
  return part;
}

// Billboard Cloudsの面を分ける考え方を、手で指定した2D部品に応用する。
// 自動的なモデル簡略化や、3Dモデルの読み込みは行わない。
export function makeImageChair(atlas, options = {}) {
  const chair = new THREE.Group();
  chair.name = "画像部品の固定された椅子";
  const material = map => new THREE.MeshStandardMaterial({ map, alphaTest: 0.2,
    roughness: 0.8, metalness: 0.04, side: THREE.DoubleSide });
  const seatMaterial = material(cropAtlasPart(atlas, 0, 0));
  const undersideMaterial = material(cropAtlasPart(atlas, 1, 1));
  const backMaterial = material(cropAtlasPart(atlas, 1, 0));
  const tubeMaterial = material(cropAtlasPart(atlas, 0, 1));
  tubeMaterial.metalness = 0.2; tubeMaterial.roughness = 0.62;
  const addCard = (width, height, mat, parent = chair) => {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    card.castShadow = card.receiveShadow = true; parent.add(card); return card;
  };
  const seat = addCard(0.41, 0.39, seatMaterial);
  seat.material.side = THREE.FrontSide;
  seat.rotation.x = -Math.PI / 2; seat.position.set(0, 0.435, 0);
  const underside = addCard(0.41, 0.39, undersideMaterial);
  underside.material.side = THREE.FrontSide;
  underside.rotation.x = Math.PI / 2; underside.position.set(0, 0.423, 0);
  const edgeMap = seatMaterial.map.clone();
  edgeMap.offset.y += edgeMap.repeat.y * 0.48; edgeMap.repeat.y *= 0.035;
  edgeMap.needsUpdate = true;
  const edgeMaterial = material(edgeMap);
  // 板の小口も細い画像面。角を空け、元画像の丸い輪郭を隠さない。
  for (const side of [-1, 1]) {
    const frontEdge = addCard(0.34, 0.012, edgeMaterial);
    frontEdge.position.set(0, 0.429, side * 0.185);
    const sideEdge = addCard(0.32, 0.012, edgeMaterial);
    sideEdge.rotation.y = Math.PI / 2;
    sideEdge.position.set(side * 0.197, 0.429, 0);
  }
  const back = addCard(0.40, 0.19, backMaterial);
  back.position.set(0, 0.745, 0.185); back.rotation.x = -0.08;
  const backAssembly = new THREE.Group();
  backAssembly.position.copy(back.position); backAssembly.rotation.copy(back.rotation);
  chair.add(backAssembly); back.position.set(0, 0, 0); back.rotation.set(0, 0, 0); backAssembly.add(back);
  back.material.side = THREE.FrontSide;
  const reverseBack = addCard(0.40, 0.19, backMaterial.clone(), backAssembly);
  reverseBack.material.color.setHex(0xaaa08d); reverseBack.rotation.y = Math.PI;
  reverseBack.position.z = -0.012;
  for (const side of [-1, 1]) {
    const topEdge = addCard(0.34, 0.012, edgeMaterial, backAssembly);
    topEdge.rotation.x = Math.PI / 2; topEdge.position.set(0, side * 0.086, -0.006);
    const sideEdge = addCard(0.012, 0.13, edgeMaterial, backAssembly);
    sideEdge.rotation.y = Math.PI / 2; sideEdge.position.set(side * 0.188, 0, -0.006);
  }
  function support(start, end, width = 0.027) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const joint = new THREE.Group();
    joint.position.copy(a).add(b).multiplyScalar(0.5);
    joint.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    chair.add(joint);
    // 細い支持材は直交する2枚の透過画像。カメラから独立した向きのまま。
    for (const angle of [0, Math.PI / 2]) {
      const card = addCard(width, direction.length(), tubeMaterial, joint);
      card.rotation.y = angle;
      // 面の位置を変えず、法線だけを支持材の丸みに合わせる。
      if (options.roundNormals !== false) {
        card.geometry.dispose();
        card.geometry = new THREE.PlaneGeometry(width, direction.length(), 8, 1);
        const uv = card.geometry.attributes.uv, normals = card.geometry.attributes.normal;
        for (let i = 0; i < normals.count; i++) {
          const x = (uv.getX(i) * 2 - 1) * 0.85;
          normals.setXYZ(i, x, 0, Math.sqrt(1 - x * x));
        }
      }
    }
  }
  for (const x of [-0.165, 0.165]) {
    support([x, 0.012, -0.18], [x, 0.43, -0.15]);
    support([x, 0.012, 0.20], [x, 0.43, 0.15]);
    support([x, 0.39, 0.15], [x, 0.82, 0.20]);
    support([x, 0.40, -0.16], [x, 0.40, 0.18]);
  }
  support([-0.18, 0.40, -0.15], [0.18, 0.40, -0.15]);
  support([-0.18, 0.40, 0.15], [0.18, 0.40, 0.15]);
  chair.rotation.order = "YXZ";
  chair.rotation.set(0, 1.2, Math.PI / 2);
  chair.position.set(-0.8, 0.205, -4.85);
  chair.userData.cards = chair.children.reduce((n, child) => n + (child.isMesh ? 1 : child.children.length), 0);
  return chair;
}
