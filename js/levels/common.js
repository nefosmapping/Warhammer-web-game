// Общие утилиты для уровней: слияние статической геометрии, земля,
// коллизии и расстановка деревьев. Никаких внешних ассетов.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeTree } from '../models/props.js';

export function makeMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.05,
    ...options
  });
}

// Собирает примитивы по материалам и сливает их в один меш на материал.
export class StaticBatch {
  constructor(name = 'static') {
    this.name = name;
    this.batches = new Map();
  }

  add(geometry, material, { position = [0, 0, 0], rotation = [0, 0, 0] } = {}) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(position[0], position[1], position[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2])),
      new THREE.Vector3(1, 1, 1)
    );

    const clone = geometry.clone();
    geometry.dispose();
    clone.applyMatrix4(matrix);

    let list = this.batches.get(material);
    if (!list) {
      list = [];
      this.batches.set(material, list);
    }
    list.push(clone);
  }

  box(width, height, depth, material, position, rotation = [0, 0, 0]) {
    this.add(new THREE.BoxGeometry(width, height, depth), material, { position, rotation });
  }

  cylinder(radiusTop, radiusBottom, height, segments, material, position, rotation = [0, 0, 0]) {
    this.add(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
      material,
      { position, rotation }
    );
  }

  build() {
    const group = new THREE.Group();
    group.name = this.name;

    for (const [material, geometries] of this.batches) {
      const merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) geometry.dispose();
      if (!merged) continue;

      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    this.batches.clear();
    return group;
  }
}

export function addGround(parent, size, color) {
  // Сетка 32x32: у PlaneGeometry по умолчанию 2 полигона, из-за чего
  // на больших плоскостях появляется рябь/артефакты теней.
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size, 32, 32),
    makeMaterial(color, { roughness: 0.98, metalness: 0.02 })
  );
  mesh.rotation.x = -Math.PI / 2;
  // Микро-подъём гарантирует приоритет над любыми «фоновыми» плоскостями.
  mesh.position.y = 0.02;
  mesh.receiveShadow = true;
  mesh.name = 'level-ground';
  parent.add(mesh);
  return mesh;
}

// Прямоугольный AABB-коллайдер (стены, мосты, ворота).
export function addCollider(colliders, x, z, width, depth, height = 4, y = 0) {
  colliders.addBox(
    new THREE.Box3(
      new THREE.Vector3(x - width / 2, y, z - depth / 2),
      new THREE.Vector3(x + width / 2, y + height, z + depth / 2)
    )
  );
}

// Деревья по периметру/обочинам. Тени от них отключены ради бюджета CSM.
export function scatterTrees(parent, rng, count, {
  minX = -35,
  maxX = 35,
  minZ = -35,
  maxZ = 35,
  corridorHalfWidth = 9,
  minScale = 0.85,
  maxScale = 1.4
} = {}) {
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < count * 8) {
    attempts += 1;

    const x = minX + rng() * (maxX - minX);
    const z = minZ + rng() * (maxZ - minZ);

    // Не засоряем коридор вдоль оси Z, по которому идёт игрок.
    if (Math.abs(x) < corridorHalfWidth) continue;

    const tree = makeTree(placed % 3);
    tree.position.set(x, 0, z);
    tree.rotation.y = rng() * Math.PI * 2;
    tree.scale.setScalar(minScale + rng() * (maxScale - minScale));
    tree.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = true;
      }
    });
    parent.add(tree);
    placed += 1;
  }

  return placed;
}

// Освобождение геометрии уровня. Материалы не трогаем: часть из них
// приходит из общего кэша моделей (M.*) и используется другими объектами.
export function disposeLevelRoot(root) {
  if (!root) return;

  root.traverse((child) => {
    if (child.isMesh) child.geometry?.dispose?.();
  });
}
