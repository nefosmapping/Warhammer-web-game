// AABB-коллизии без физического движка.
// Игрок — окружность радиусом 0.4 в плоскости XZ с вертикальным отрезком.
// Стены/пропсы — статические Box3. Движение разрешается по осям отдельно,
// чтобы игрок скользил вдоль стен, а не залипал.

import * as THREE from 'three';
import { clamp } from './config.js';

export class ColliderWorld {
  constructor() {
    this.boxes = [];
    this._ray = new THREE.Ray();
    this._hitPoint = new THREE.Vector3();
  }

  clear() {
    this.boxes = [];
  }

  addBox(box3) {
    this.boxes.push(box3.clone());
    return box3;
  }

  // Создаёт AABB по объекту сцены.
  addMesh(object, expand = 0) {
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    if (expand !== 0) box.expandByScalar(expand);
    this.boxes.push(box);
    return box;
  }

  // Простая прямоугольная арена: четыре невидимые стены по периметру.
  addBounds(minX, maxX, minZ, maxZ, height = 5) {
    const t = 0.5;
    const boxes = [
      new THREE.Box3(new THREE.Vector3(minX - t, 0, minZ - t), new THREE.Vector3(maxX + t, height, minZ)),
      new THREE.Box3(new THREE.Vector3(minX - t, 0, maxZ), new THREE.Vector3(maxX + t, height, maxZ + t)),
      new THREE.Box3(new THREE.Vector3(minX - t, 0, minZ), new THREE.Vector3(minX, height, maxZ)),
      new THREE.Box3(new THREE.Vector3(maxX, 0, minZ), new THREE.Vector3(maxX + t, height, maxZ))
    ];
    for (const box of boxes) this.boxes.push(box);
    return boxes;
  }

  // Проверка занятости точки с учётом радиуса игрока.
  isBlocked(x, z, radius = 0.4, minY = 0.15, maxY = 1.8) {
    const r2 = radius * radius;
    for (const box of this.boxes) {
      // Коллизии учитываем только на высоте игрока.
      if (box.max.y < minY || box.min.y > maxY) continue;

      const closestX = clamp(x, box.min.x, box.max.x);
      const closestZ = clamp(z, box.min.z, box.max.z);
      const dx = x - closestX;
      const dz = z - closestZ;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }

  // Двигает точку (x,z) на (dx,dz), разрешая оси по отдельности.
  move(x, z, dx, dz, radius = 0.4) {
    let nextX = x + dx;
    if (this.isBlocked(nextX, z, radius)) nextX = x;

    let nextZ = z + dz;
    if (this.isBlocked(nextX, nextZ, radius)) nextZ = z;

    return { x: nextX, z: nextZ };
  }

  // Ближайшее попадание луча в AABB. Возвращает { distance, point, box } или null.
  raycast(origin, direction, maxDistance = 100) {
    this._ray.set(origin, direction);
    let best = null;

    for (const box of this.boxes) {
      const point = this._ray.intersectBox(box, this._hitPoint);
      if (!point) continue;

      const distance = origin.distanceTo(point);
      if (distance > maxDistance) continue;
      if (!best || distance < best.distance) {
        best = { distance, point: point.clone(), box };
      }
    }

    return best;
  }
}
