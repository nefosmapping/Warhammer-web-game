// Союзники-гвардейцы: стоят на позиции, разворачиваются к ближайшему орку
// и ведут огонь трассерами, нанося урон. Без анимации ходьбы — по ТЗ Фазы 8.

import * as THREE from 'three';
import { makeGuardsman } from './models/allies.js';

const TRACER_LIFE = 0.08;

export class AllyManager {
  constructor({ scene, enemies }) {
    this.scene = scene;
    this.enemies = enemies;

    this.allies = [];
    this.tracers = [];
    this.active = true;

    this._start = new THREE.Vector3();
    this._end = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  setActive(active) {
    this.active = active;
  }

  clear() {
    for (const ally of this.allies) {
      this.scene.remove(ally.model);
      ally.model.traverse((child) => {
        if (child.isMesh) child.geometry?.dispose?.();
      });
    }
    this.allies = [];

    for (const tracer of this.tracers) this.scene.remove(tracer.line);
    this.tracers = [];
  }

  spawn({ x, z, rotation = 0 }) {
    const model = makeGuardsman();
    model.position.set(x, 0, z);
    model.rotation.y = rotation;
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    this.scene.add(model);

    this.allies.push({
      model,
      fireTimer: 0.6 + Math.random() * 1.2,
      target: null
    });
  }

  update(dt) {
    if (!this.active) return;

    for (const ally of this.allies) {
      const target = this._findTarget(ally);

      if (target) {
        ally.model.lookAt(target.model.position.x, ally.model.position.y, target.model.position.z);

        ally.fireTimer -= dt;
        if (ally.fireTimer <= 0) {
          this._fire(ally, target);
          ally.fireTimer = 0.9 + Math.random() * 0.7;
        }
      } else {
        ally.fireTimer = Math.min(ally.fireTimer, 0.8);
      }
    }

    this._updateTracers(dt);
  }

  _findTarget(ally) {
    let best = null;
    // Ближняя зона обороны: гвардейцы прикрывают подступы к воротам.
    let bestDistance = 24;

    for (const enemy of this.enemies.enemies) {
      if (enemy.dead || enemy.disposed) continue;

      const distance = ally.model.position.distanceTo(enemy.model.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = enemy;
      }
    }

    return best;
  }

  _fire(ally, enemy) {
    this._dir
      .set(
        enemy.model.position.x - ally.model.position.x,
        1.0,
        enemy.model.position.z - ally.model.position.z
      )
      .normalize();

    this._start.set(
      ally.model.position.x + this._dir.x * 0.75,
      1.12,
      ally.model.position.z + this._dir.z * 0.75
    );
    this._end.set(enemy.model.position.x, 1.0, enemy.model.position.z);

    const geometry = new THREE.BufferGeometry().setFromPoints([this._start.clone(), this._end.clone()]);
    const material = new THREE.LineBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    this.tracers.push({ line, life: TRACER_LIFE });

    enemy.takeDamage(8);
  }

  _updateTracers(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const tracer = this.tracers[i];
      tracer.life -= dt;

      if (tracer.life <= 0) {
        this.scene.remove(tracer.line);
        tracer.line.geometry.dispose();
        tracer.line.material.dispose();
        this.tracers.splice(i, 1);
      } else {
        tracer.line.material.opacity = tracer.life / TRACER_LIFE;
      }
    }
  }
}
