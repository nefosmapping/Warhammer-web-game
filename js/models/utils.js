// Общие утилиты процедурных моделей:
// кэш PBR-материалов, фаскованные боксы, сборка и слияние геометрии,
// подсчёт мешей и треугольников.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Материалы (§3.4 «графика.txt»)
// ---------------------------------------------------------------------------

const materialCache = new Map();

export function getMaterial(key, params) {
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshStandardMaterial(params));
  }
  return materialCache.get(key);
}

// Палитра. Функции, чтобы материал создавался только при первом использовании.
export const M = {
  darkMetal: () => getMaterial('darkMetal', { color: 0x2a2a2e, roughness: 0.52, metalness: 0.85 }),
  lightMetal: () => getMaterial('lightMetal', { color: 0x6b6b70, roughness: 0.4, metalness: 0.8 }),
  gunmetal: () => getMaterial('gunmetal', { color: 0x3d3d42, roughness: 0.45, metalness: 0.9 }),
  rustMetal: () => getMaterial('rustMetal', { color: 0x5a3a28, roughness: 0.82, metalness: 0.45 }),
  brass: () => getMaterial('brass', { color: 0x9a7a3a, roughness: 0.42, metalness: 0.85 }),
  gold: () => getMaterial('gold', { color: 0xc8a24a, roughness: 0.35, metalness: 0.9 }),
  leather: () => getMaterial('leather', { color: 0x3a2e28, roughness: 0.95, metalness: 0.0 }),
  leatherDark: () => getMaterial('leatherDark', { color: 0x241b16, roughness: 0.96, metalness: 0.0 }),
  cloth: () => getMaterial('cloth', { color: 0x4a4436, roughness: 0.98, metalness: 0.0 }),
  clothRed: () => getMaterial('clothRed', { color: 0x6d1f1a, roughness: 0.96, metalness: 0.0 }),
  wood: () => getMaterial('wood', { color: 0x4a3826, roughness: 0.94, metalness: 0.0 }),
  bone: () => getMaterial('bone', { color: 0xc9bea0, roughness: 0.85, metalness: 0.0 }),
  glass: () => getMaterial('glass', {
    color: 0x7fa8b8,
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide
  }),

  // Зелёная кожа орка: три оттенка для разных частей тела.
  orkSkinLight: () => getMaterial('orkSkinLight', { color: 0x6b8b4a, roughness: 0.86, metalness: 0.0 }),
  orkSkinMedium: () => getMaterial('orkSkinMedium', { color: 0x577a3e, roughness: 0.88, metalness: 0.0 }),
  orkSkinDark: () => getMaterial('orkSkinDark', { color: 0x42612f, roughness: 0.9, metalness: 0.0 }),

  orkEye: () => getMaterial('orkEye', {
    color: 0xffdd44,
    emissive: 0xffb020,
    emissiveIntensity: 2.4,
    roughness: 0.4,
    metalness: 0.0
  }),

  glowOrange: () => getMaterial('glowOrange', {
    color: 0xff6b2b,
    emissive: 0xff5a12,
    emissiveIntensity: 2.2,
    roughness: 0.6,
    metalness: 0.0
  }),
  glowYellow: () => getMaterial('glowYellow', {
    color: 0xffdd44,
    emissive: 0xffbb22,
    emissiveIntensity: 2.0,
    roughness: 0.5,
    metalness: 0.0
  }),
  glowRed: () => getMaterial('glowRed', {
    color: 0xff2e12,
    emissive: 0xff1a08,
    emissiveIntensity: 2.4,
    roughness: 0.6,
    metalness: 0.0
  }),
  glowBlue: () => getMaterial('glowBlue', {
    color: 0x66ccff,
    emissive: 0x2288dd,
    emissiveIntensity: 1.6,
    roughness: 0.4,
    metalness: 0.0
  }),

  medkitWhite: () => getMaterial('medkitWhite', { color: 0xc9c9c0, roughness: 0.7, metalness: 0.1 }),
  medkitRed: () => getMaterial('medkitRed', { color: 0x9a2018, roughness: 0.65, metalness: 0.1 }),
  armyGreen: () => getMaterial('armyGreen', { color: 0x3e4a2c, roughness: 0.85, metalness: 0.15 }),
  sandbag: () => getMaterial('sandbag', { color: 0x6b5f42, roughness: 0.98, metalness: 0.0 }),
  sandbagDark: () => getMaterial('sandbagDark', { color: 0x574c34, roughness: 0.98, metalness: 0.0 }),
  skin: () => getMaterial('skin', { color: 0x8a6a4e, roughness: 0.8, metalness: 0.0 }),

  // Уникальный материал (не кэшируется) — для светящихся стволов врагов.
  uniqueGlow(color = 0xffa32b) {
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.8,
      roughness: 0.5,
      metalness: 0.1
    });
  }
};

// ---------------------------------------------------------------------------
// Геометрия
// ---------------------------------------------------------------------------

// Бокс с фаской через ExtrudeGeometry.
// Итоговые габариты соответствуют width/height/depth, фаска не «съедает» размер.
export function beveledBox(width, height, depth, bevel = 0.01, bevelSegments = 1) {
  const b = Math.min(bevel, width * 0.2, height * 0.2, depth * 0.2);
  const w = Math.max(0.001, width - b * 2);
  const h = Math.max(0.001, height - b * 2);
  const innerDepth = Math.max(0.001, depth - b * 2);

  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -h / 2);
  shape.lineTo(w / 2, -h / 2);
  shape.lineTo(w / 2, h / 2);
  shape.lineTo(-w / 2, h / 2);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: innerDepth,
    bevelEnabled: true,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments,
    curveSegments: 1,
    steps: 1
  });

  // Центрируем по Z.
  geometry.translate(0, 0, b - depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

export function applyTransform(geometry, transform = {}) {
  const position = transform.position || [0, 0, 0];
  const rotation = transform.rotation || [0, 0, 0];
  const scale = transform.scale || [1, 1, 1];

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation[0], rotation[1], rotation[2])
  );
  matrix.compose(
    new THREE.Vector3(position[0], position[1], position[2]),
    quaternion,
    new THREE.Vector3(scale[0], scale[1], scale[2])
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}

// ---------------------------------------------------------------------------
// Сборщик моделей: статичные части сливаются по материалам.
// Динамические конечности собираются отдельными ModelBuilder'ами.
// ---------------------------------------------------------------------------

export class ModelBuilder {
  constructor(name = 'model') {
    this.name = name;
    this.parts = [];
    this.group = new THREE.Group();
    this.group.name = name;
  }

  // Добавить деталь в общий (сливаемый) список.
  add(geometry, material, transform = {}) {
    const prepared = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    applyTransform(prepared, transform);
    this.parts.push({ geometry: prepared, material });
    return this;
  }

  // Добавить отдельный меш, который должен остаться самостоятельным
  // (ствол врага, светящийся элемент, маркер и т.п.).
  addMesh(parent, geometry, material, transform = {}, options = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    if (transform.position) mesh.position.set(...transform.position);
    if (transform.rotation) mesh.rotation.set(...transform.rotation);
    if (transform.scale) mesh.scale.set(...transform.scale);
    mesh.castShadow = options.castShadow !== false;
    mesh.receiveShadow = options.receiveShadow !== false;
    parent.add(mesh);
    return mesh;
  }

  build(options = {}) {
    const byMaterial = new Map();

    for (const part of this.parts) {
      if (!byMaterial.has(part.material)) byMaterial.set(part.material, []);
      byMaterial.get(part.material).push(part.geometry);
    }

    for (const [material, geometries] of byMaterial) {
      const merged = mergeGeometries(geometries, false);
      if (!merged) {
        // Страховка: если слияние не удалось, добавляем детали по отдельности.
        for (const geometry of geometries) {
          const mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = options.castShadow !== false;
          mesh.receiveShadow = options.receiveShadow !== false;
          this.group.add(mesh);
        }
        continue;
      }

      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = options.castShadow !== false;
      mesh.receiveShadow = options.receiveShadow !== false;
      this.group.add(mesh);
    }

    this.parts = [];
    return this.group;
  }
}

// ---------------------------------------------------------------------------
// Сборщик с vertex colors: сливает детали с разными цветами в ОДИН меш
// и один материал. Это критично для draw call'ов: конечность орка или
// целая рука с топором занимают 1 вызов отрисовки вместо 5–8.
// ---------------------------------------------------------------------------

export class VertexColorBuilder {
  constructor(name = 'colored', materialParams = {}) {
    this.name = name;
    this.parts = [];
    this.group = new THREE.Group();
    this.group.name = name;
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.1,
      ...materialParams
    });
    this._color = new THREE.Color();
  }

  // color — hex-число. Трансформации те же, что у ModelBuilder.
  add(geometry, color, transform = {}) {
    const prepared = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    applyTransform(prepared, transform);

    this._color.set(color);
    const count = prepared.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = this._color.r;
      colors[i * 3 + 1] = this._color.g;
      colors[i * 3 + 2] = this._color.b;
    }
    prepared.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.parts.push(prepared);
    return this;
  }

  build(options = {}) {
    if (this.parts.length === 0) return this.group;

    const merged = mergeGeometries(this.parts, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, this.material);
      mesh.castShadow = options.castShadow !== false;
      mesh.receiveShadow = options.receiveShadow !== false;
      this.group.add(mesh);
    } else {
      for (const geometry of this.parts) {
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    }

    this.parts = [];
    return this.group;
  }
}

// ---------------------------------------------------------------------------
// Маркеры и подсчёт
// ---------------------------------------------------------------------------

// Невидимая точка привязки (дуло, ладонь, место вспышки).
export function addMarker(parent, name, position) {
  const marker = new THREE.Object3D();
  marker.name = name;
  marker.position.set(position[0], position[1], position[2]);
  parent.add(marker);
  return marker;
}

export function countTriangles(object) {
  let total = 0;
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const geometry = child.geometry;
    const triangles = geometry.index
      ? geometry.index.count / 3
      : geometry.attributes.position.count / 3;
    total += triangles * (child.isInstancedMesh ? child.count : 1);
  });
  return Math.round(total);
}

export function countMeshes(object) {
  let total = 0;
  object.traverse((child) => {
    if (child.isMesh) total += 1;
  });
  return total;
}

export function describeModel(name, object) {
  return {
    name,
    meshes: countMeshes(object),
    triangles: countTriangles(object)
  };
}

// Освобождение геометрии/материалов при выгрузке уровня.
export function disposeObject(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((mat) => mat.dispose());
    } else {
      child.material?.dispose();
    }
  });
}
