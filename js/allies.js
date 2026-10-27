// Союзники-гвардейцы: держат строй, перемещаются по приказу игрока
// (средняя кнопка мыши / команда из админ-меню), атакуют ближайших орков.
// Приказ распределяет гвардейцев вокруг указанной точки, сохраняя дистанцию.

import * as THREE from 'three';
import { makeGuardsman } from './models/allies.js';

const TRACER_LIFE = 0.08;
const DETECT_RADIUS = 24;
const ARRIVE_DISTANCE = 0.5;

const _tmpTarget = new THREE.Vector3();

export class AllyManager {
  constructor({ scene, enemies, colliders = null }) {
    this.scene = scene;
    this.enemies = enemies;
    this.colliders = colliders;

    this.allies = [];
    this.tracers = [];
    this.active = true;

    this._start = new THREE.Vector3();
    this._end = new THREE.Vector3();
    this._dir = new THREE.Vector3();

    this.commandMarker = null;
    this.commandTimer = 0;
  }

  setActive(active) {
    this.active = active;
  }

  // -------------------------------------------------------------------------
  // Спавн и очистка
  // -------------------------------------------------------------------------

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

    const ally = {
      model,
      fireTimer: 0.6 + Math.random() * 1.2,
      target: null,
      moveTarget: null,
      speed: 2.8 + Math.random() * 0.7,
      radius: 0.35,
      walkPhase: Math.random() * Math.PI * 2,
      flashTimer: null
    };

    this.allies.push(ally);
    return ally;
  }

  clear() {
    for (const ally of this.allies) {
      if (ally.flashTimer) clearTimeout(ally.flashTimer);
      this.scene.remove(ally.model);
      ally.model.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose?.();
        // Модель гвардейца собирается из уникальных материалов.
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) material?.dispose?.();
      });
    }
    this.allies = [];

    for (const tracer of this.tracers) this.scene.remove(tracer.line);
    this.tracers = [];

    this._disposeCommandMarker();
  }

  // -------------------------------------------------------------------------
  // Приказы на перемещение
  // -------------------------------------------------------------------------

  // point — {x, z} или Vector3. Возвращает true, если приказ принят.
  commandMove(point) {
    if (!point || this.allies.length === 0) return false;

    const centerX = point.x ?? 0;
    const centerZ = point.z ?? 0;
    const count = this.allies.length;
    const angle0 = Math.random() * Math.PI * 2;

    this.allies.forEach((ally, index) => {
      let tx = centerX;
      let tz = centerZ;

      if (count > 1) {
        // Кольцо вокруг точки: соседи не слипаются в одну стопку.
        const radius = 1.4 + count * 0.35;
        const angle = angle0 + (index / count) * Math.PI * 2;
        tx = centerX + Math.cos(angle) * radius;
        tz = centerZ + Math.sin(angle) * radius;
      }

      ally.moveTarget = new THREE.Vector3(tx, 0, tz);
    });

    this._showCommandMarker(centerX, centerZ);
    return true;
  }

  _showCommandMarker(x, z) {
    if (!this.commandMarker) {
      const geometry = new THREE.RingGeometry(0.95, 1.15, 32);
      const material = new THREE.MeshBasicMaterial({
        color: 0x9effa0,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.name = 'ally-command-marker';
      mesh.renderOrder = 4;
      this.scene.add(mesh);
      this.commandMarker = { mesh, geometry, material };
    }

    this.commandMarker.mesh.position.set(x, 0.08, z);
    this.commandMarker.material.opacity = 0.9;
    this.commandTimer = 1.2;
  }

  _updateCommandMarker(dt) {
    if (!this.commandMarker || this.commandTimer <= 0) return;

    this.commandTimer -= dt;
    this.commandMarker.material.opacity = Math.max(
      0,
      (this.commandTimer / 1.2) * 0.9
    );
    const pulse = 1 + (1 - this.commandTimer / 1.2) * 0.35;
    this.commandMarker.mesh.scale.setScalar(pulse);
  }

  _disposeCommandMarker() {
    if (!this.commandMarker) return;
    this.scene.remove(this.commandMarker.mesh);
    this.commandMarker.geometry.dispose();
    this.commandMarker.material.dispose();
    this.commandMarker = null;
    this.commandTimer = 0;
  }

  // -------------------------------------------------------------------------
  // Обновление
  // -------------------------------------------------------------------------

  update(dt) {
    if (!this.active) return;

    for (const ally of this.allies) {
      const target = this._findTarget(ally);
      ally.target = target;

      let moving = false;

      if (ally.moveTarget) {
        const dx = ally.moveTarget.x - ally.model.position.x;
        const dz = ally.moveTarget.z - ally.model.position.z;
        const distance = Math.hypot(dx, dz);

        if (distance <= ARRIVE_DISTANCE) {
          ally.moveTarget = null;
        } else {
          moving = this._moveAlly(ally, dx / distance, dz / distance, dt);
        }
      }

      if (target) {
        ally.model.lookAt(
          target.model.position.x,
          ally.model.position.y,
          target.model.position.z
        );

        ally.fireTimer -= dt;
        if (ally.fireTimer <= 0) {
          this._fire(ally, target);
          ally.fireTimer = 0.9 + Math.random() * 0.7;
        }
      } else if (moving) {
        // Без цели смотрим в сторону движения (локальный +Z модели).
        const dx = ally.moveTarget
          ? ally.moveTarget.x - ally.model.position.x
          : 0;
        const dz = ally.moveTarget
          ? ally.moveTarget.z - ally.model.position.z
          : 0;
        ally.model.rotation.y = Math.atan2(dx, dz);
      }

      this._animateAlly(ally, moving, dt);
    }

    this._updateCommandMarker(dt);
    this._updateTracers(dt);
  }

  _moveAlly(ally, dirX, dirZ, dt) {
    const stepX = dirX * ally.speed * dt;
    const stepZ = dirZ * ally.speed * dt;

    if (this.colliders) {
      const moved = this.colliders.move(
        ally.model.position.x,
        ally.model.position.z,
        stepX,
        stepZ,
        ally.radius
      );
      const movedDistance =
        Math.abs(moved.x - ally.model.position.x) +
        Math.abs(moved.z - ally.model.position.z);
      ally.model.position.x = moved.x;
      ally.model.position.z = moved.z;
      return movedDistance > 0.0001;
    }

    ally.model.position.x += stepX;
    ally.model.position.z += stepZ;
    return true;
  }

  _animateAlly(ally, moving, dt) {
    const rig = ally.model.userData;
    if (!rig) return;

    ally.walkPhase += dt * (moving ? 6.5 : 1.8);
    const swing = moving ? Math.sin(ally.walkPhase) * 0.55 : 0;

    if (rig.legL) rig.legL.rotation.x = swing;
    if (rig.legR) rig.legR.rotation.x = -swing;
    if (rig.calfL) rig.calfL.rotation.x = Math.max(0, -swing * 1.5);
    if (rig.calfR) rig.calfR.rotation.x = Math.max(0, swing * 1.5);

    // Небольшое покачивание корпуса при ходьбе.
    ally.model.position.y = moving
      ? Math.abs(Math.sin(ally.walkPhase)) * 0.035
      : 0;
  }

  _findTarget(ally) {
    let best = null;
    let bestDistance = DETECT_RADIUS;

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

  // -------------------------------------------------------------------------
  // Стрельба
  // -------------------------------------------------------------------------

  _fire(ally, enemy) {
    // Начало трассера — дульный маркер лазгана, если он есть.
    const muzzle = ally.model.userData?.muzzle;
    if (muzzle) {
      ally.model.updateMatrixWorld(true);
      muzzle.getWorldPosition(this._start);
    } else {
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
    }

    _tmpTarget.set(enemy.model.position.x, 1.0, enemy.model.position.z);

    const geometry = new THREE.BufferGeometry().setFromPoints([
      this._start.clone(),
      _tmpTarget.clone()
    ]);
    const material = new THREE.LineBasicMaterial({
      color: 0x9ed8ff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    this.tracers.push({ line, life: TRACER_LIFE });

    // Вспышка лазгана.
    const flash = ally.model.userData?.flash;
    if (flash) {
      flash.visible = true;
      if (ally.flashTimer) clearTimeout(ally.flashTimer);
      ally.flashTimer = window.setTimeout(() => {
        flash.visible = false;
      }, 70);
    }
    const light = ally.model.userData?.muzzleLight;
    if (light) {
      light.intensity = 5;
      if (ally.flashTimer) clearTimeout(ally.flashTimer);
      ally.flashTimer = window.setTimeout(() => {
        flash && (flash.visible = false);
        light.intensity = 0;
      }, 70);
    }

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
