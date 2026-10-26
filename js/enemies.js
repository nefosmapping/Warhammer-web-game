// Враги и ИИ: базовый Enemy со состояниями idle/alert/chase/attack/dead,
// подклассы OrkBoy, OrkShooter, OrkNob и менеджер EnemyManager.
// Обнаружение — прямая видимость (raycast по AABB стен) или шум выстрела.

import * as THREE from 'three';
import { CONFIG, clamp } from './config.js';
import { makeOrkBoy, makeOrkShooter, makeOrkNob } from './models/index.js';

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _start = new THREE.Vector3();
const _end = new THREE.Vector3();

export class Enemy {
  constructor({
    type,
    config,
    model,
    scene,
    player,
    colliders,
    audio,
    weapons,
    position = { x: 0, z: 0 },
    healthOverride = null
  }) {
    this.type = type;
    this.config = config;
    this.model = model;
    this.scene = scene;
    this.player = player;
    this.colliders = colliders;
    this.audio = audio;
    this.weapons = weapons;

    this.maxHealth = healthOverride ?? config.health;
    this.health = this.maxHealth;
    this.speed = config.speed;
    this.radius = model.userData.radius || 0.45;
    this.eyeHeight = (model.userData.height || 2.0) * 0.82;

    this.state = 'idle';
    this.dead = false;
    this.disposed = false;
    this.alerted = false;
    this.raged = false;

    this.alertTimer = 0;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.didHit = false;
    this.hurtTimer = 0;
    this.deathTimer = 0;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.moving = false;

    this.burstLeft = 0;
    this.burstTimer = 0;
    this.tracers = [];

    this.model.position.set(position.x, 0, position.z);
    this.scene.add(this.model);

    // Базовая поза для анимаций.
    const rig = this.model.userData;
    this.rig = rig;
    this.baseRotation = {
      leftArmX: rig.leftArm?.rotation.x ?? 0,
      rightArmX: rig.rightArm?.rotation.x ?? 0,
      leftArmZ: rig.leftArm?.rotation.z ?? 0,
      rightArmZ: rig.rightArm?.rotation.z ?? 0,
      leftLegX: rig.leftLeg?.rotation.x ?? 0,
      rightLegX: rig.rightLeg?.rotation.x ?? 0
    };

    // Сразу разворачиваем к игроку.
    this._facePlayer(1);

    // Регистрируем модель как цель для оружия.
    const self = this;
    this.model.userData.damageable = {
      health: this.health,
      maxHealth: this.maxHealth,
      takeDamage: (amount) => self.takeDamage(amount)
    };
    this.model.userData.enemy = this;
    this.weapons?.addTarget(this.model);

    this._updateMuzzleGlow(0);
    this._optimizeShadows();
  }

  // Тени от конечностей/оружия дороги при CSM. Оставляем один самый крупный
  // меш корпуса (органику) — силуэт читается, а shadow pass'ов в 3 раза меньше.
  _optimizeShadows() {
    const rig = this.rig;
    if (!rig) return;

    const bodyMeshes = [];
    rig.body?.traverse((child) => {
      if (child.isMesh) bodyMeshes.push(child);
    });

    let largest = null;
    let largestCount = -1;
    for (const mesh of bodyMeshes) {
      const geometry = mesh.geometry;
      const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
      if (count > largestCount) {
        largestCount = count;
        largest = mesh;
      }
    }

    for (const mesh of bodyMeshes) {
      mesh.castShadow = mesh === largest;
    }

    for (const group of [rig.leftArm, rig.rightArm, rig.leftLeg, rig.rightLeg, rig.weapon]) {
      group?.traverse((child) => {
        if (child.isMesh) child.castShadow = false;
      });
    }
  }

  // -------------------------------------------------------------------------
  // Основной апдейт
  // -------------------------------------------------------------------------

  update(dt) {
    if (this.disposed) return;

    this._updateTracers(dt);

    if (this.state === 'dead') {
      this._updateDeath(dt);
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);

    const dx = this.player.position.x - this.model.position.x;
    const dz = this.player.position.z - this.model.position.z;
    const distance = Math.hypot(dx, dz);

    switch (this.state) {
      case 'idle':
        this._animate(dt, false);
        if (distance <= this.config.detectRadius && this._hasLineOfSight()) {
          this._alert();
        }
        break;

      case 'alert':
        this._facePlayer(dt);
        this.alertTimer -= dt;
        this._animate(dt, false);
        if (this.alertTimer <= 0) {
          this.state = 'chase';
        }
        break;

      case 'chase':
        this._facePlayer(dt);
        this._updateChase(dt, dx, dz, distance);
        break;

      case 'attack':
        this._facePlayer(dt);
        this._updateAttack(dt, distance);
        break;

      default:
        break;
    }
  }

  _updateChase(dt, dx, dz, distance) {
    const dirLength = Math.hypot(dx, dz) || 1;
    const dirX = dx / dirLength;
    const dirZ = dz / dirLength;

    if (this.type === 'shooter') {
      // Держим дистанцию и стреляем очередями.
      if (distance > this.config.attackRange) {
        this._move(dirX, dirZ, dt);
      } else if (distance < this.config.keepDistance * 0.7) {
        this._move(-dirX, -dirZ, dt);
      } else {
        this.moving = false;
      }

      if (distance <= this.config.attackRange && this._hasLineOfSight()) {
        if (this.burstLeft <= 0 && this.attackCooldown <= 0) {
          this.burstLeft = this.config.burst;
          this.burstTimer = 0;
          this.attackCooldown = this.config.attackCooldown;
        }
      }

      this._updateBurst(dt);
      this._animate(dt, this.moving);
      return;
    }

    // Ближний бой.
    if (distance > this.config.attackRange + 0.2) {
      this._move(dirX, dirZ, dt);
      this._animate(dt, this.moving);
    } else if (this.attackCooldown <= 0) {
      this._startAttack();
    } else {
      this.moving = false;
      this._animate(dt, false);
    }
  }

  _updateAttack(dt, distance) {
    this.moving = false;
    this.attackTimer += dt;

    // Удар наносится в середине замаха.
    if (!this.didHit && this.attackTimer >= 0.34) {
      this.didHit = true;
      if (distance <= this.config.attackRange + 0.35 && this._hasLineOfSight()) {
        this.player.takeDamage(this.config.damage, `ork-${this.type}`);
        this.audio?.playHit();
      }
    }

    this._animate(dt, false, true);

    if (this.attackTimer >= 0.6) {
      this.state = 'chase';
      this.attackTimer = 0;
      this.didHit = false;
    }
  }

  _startAttack() {
    this.state = 'attack';
    this.attackTimer = 0;
    this.didHit = false;
    this.attackCooldown = this.config.attackCooldown;
    this.audio?.playOrkGrowl();
  }

  _updateBurst(dt) {
    if (this.burstLeft <= 0) return;

    this.burstTimer -= dt;
    if (this.burstTimer > 0) return;

    this.burstLeft -= 1;
    this.burstTimer = 0.12;
    this._fireShooterShot();
  }

  _fireShooterShot() {
    _start.copy(this.model.position);
    _start.y += this.eyeHeight * 0.95;

    _end.copy(this.player.position);
    _end.y = CONFIG.player.eyeHeight;

    this._spawnTracer(_start, _end);
    this._flashMuzzle();
    this.audio?.playShot();

    if (this._hasLineOfSight() && Math.random() < 0.8) {
      this.player.takeDamage(this.config.damage, 'ork-shooter');
    }
  }

  // -------------------------------------------------------------------------
  // Повреждения и смерть
  // -------------------------------------------------------------------------

  takeDamage(amount) {
    if (this.dead || this.disposed) return;

    this.health = Math.max(0, this.health - amount);
    if (this.model.userData.damageable) {
      this.model.userData.damageable.health = this.health;
    }

    this.hurtTimer = 0.2;
    this.alerted = true;

    if (Math.random() < 0.35) this.audio?.playOrkGrowl();

    if (this.type === 'nob' && !this.raged && this.health <= this.maxHealth * this.config.rageThreshold) {
      this.raged = true;
      this.audio?.playOrkGrowl();
    }

    if (this.health <= 0) {
      this._die();
      return;
    }

    if (this.state === 'idle') this._alert();
  }

  _die() {
    this.dead = true;
    this.state = 'dead';
    this.deathTimer = 0;
    this.moving = false;
    this.burstLeft = 0;
    this.weapons?.removeTarget(this.model);
    this.audio?.playOrkGrowl();
  }

  _updateDeath(dt) {
    this.deathTimer += dt;
    const fall = clamp(this.deathTimer / 0.5, 0, 1);
    this.model.rotation.x = -fall * Math.PI * 0.48;
    this.model.position.y = -fall * 0.06;

    if (this.deathTimer >= 5) {
      this.dispose();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.weapons?.removeTarget(this.model);
    this.scene.remove(this.model);

    // Геометрия уникальна для каждого орка — освобождаем её.
    // Материалы общие (кэш M.*), их трогать нельзя.
    this.model.traverse((child) => {
      if (child.isMesh && child.geometry) child.geometry.dispose();
    });

    this._clearTracers();
  }

  // -------------------------------------------------------------------------
  // Обнаружение
  // -------------------------------------------------------------------------

  _alert() {
    if (this.state !== 'idle') return;

    this.state = 'alert';
    this.alertTimer = 0.4;
    this.audio?.playOrkGrowl();
  }

  hearNoise(source, radius = this.config.noiseRadius) {
    if (this.dead || this.disposed) return;
    const distance = this.model.position.distanceTo(source);
    if (distance <= radius) {
      if (this.state === 'idle') this._alert();
      else this.alerted = true;
    }
  }

  _hasLineOfSight() {
    if (!this.colliders) return true;

    _from.copy(this.model.position);
    _from.y = this.eyeHeight;

    _to.copy(this.player.position);
    _to.y = CONFIG.player.eyeHeight;

    _dir.copy(_to).sub(_from);
    const distance = _dir.length();
    if (distance < 0.001) return true;
    _dir.normalize();

    const wall = this.colliders.raycast(_from, _dir, distance);
    return !wall || wall.distance >= distance - 0.25;
  }

  // -------------------------------------------------------------------------
  // Движение и повороты
  // -------------------------------------------------------------------------

  get _currentSpeed() {
    let speed = this.speed;
    if (this.hurtTimer > 0) speed *= 0.5;
    if (this.type === 'nob' && this.raged) speed *= this.config.rageSpeedMultiplier;
    return speed;
  }

  _move(dirX, dirZ, dt) {
    const speed = this._currentSpeed;
    const stepX = dirX * speed * dt;
    const stepZ = dirZ * speed * dt;

    if (this.colliders) {
      const moved = this.colliders.move(
        this.model.position.x,
        this.model.position.z,
        stepX,
        stepZ,
        this.radius
      );
      this.moving = Math.abs(moved.x - this.model.position.x) > 0.0001 ||
        Math.abs(moved.z - this.model.position.z) > 0.0001;
      this.model.position.x = moved.x;
      this.model.position.z = moved.z;
    } else {
      this.model.position.x += stepX;
      this.model.position.z += stepZ;
      this.moving = true;
    }
  }

  _facePlayer(dt) {
    const dx = this.player.position.x - this.model.position.x;
    const dz = this.player.position.z - this.model.position.z;

    const targetYaw = Math.atan2(dx, dz);
    const currentYaw = this.model.rotation.y;

    let delta = targetYaw - currentYaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    this.model.rotation.y = currentYaw + delta * Math.min(1, dt * 7);
  }

  // -------------------------------------------------------------------------
  // Анимация
  // -------------------------------------------------------------------------

  _animate(dt, moving, attacking = false) {
    const rig = this.rig;
    if (!rig) return;

    const speedFactor = this.type === 'nob' ? 0.75 : 1;
    this.walkPhase += dt * (moving ? 7.5 : 1.8) * speedFactor;

    const stride = moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    const idle = Math.sin(this.walkPhase) * 0.03;

    if (rig.leftLeg) rig.leftLeg.rotation.x = this.baseRotation.leftLegX + stride;
    if (rig.rightLeg) rig.rightLeg.rotation.x = this.baseRotation.rightLegX - stride;

    // Дыхание корпуса.
    if (rig.body) {
      const breath = Math.sin(this.walkPhase * 0.7) * 0.012;
      rig.body.scale.set(1 + breath * 0.4, 1 + breath, 1 + breath * 0.4);
      rig.body.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.035 : idle * 0.3;
    }

    // Руки.
    if (rig.rightArm && this.type !== 'shooter') {
      let angle = this.baseRotation.rightArmX + (moving ? -stride * 0.5 : idle);

      if (attacking) {
        const p = clamp(this.attackTimer / 0.6, 0, 1);
        const windup = p < 0.4 ? -(p / 0.4) * 0.9 : -0.9 + ((p - 0.4) / 0.6) * 2.0;
        angle = this.baseRotation.rightArmX + windup;
      }

      rig.rightArm.rotation.x = angle;
      rig.rightArm.rotation.z = this.baseRotation.rightArmZ;
    }

    if (rig.leftArm) {
      rig.leftArm.rotation.x = this.baseRotation.leftArmX + (moving ? stride * 0.35 : idle);
    }

    // Светящийся ствол шутты гаснет.
    if (this.type === 'shooter') this._updateMuzzleGlow(dt);
  }

  _flashMuzzle() {
    this.muzzleGlowTimer = 0.07;
    const weapon = this.rig?.weapon;
    const material = weapon?.userData?.glowMaterial;
    if (material) material.emissiveIntensity = 4.0;
  }

  _updateMuzzleGlow(dt) {
    if (this.muzzleGlowTimer > 0) {
      this.muzzleGlowTimer -= dt;
      if (this.muzzleGlowTimer <= 0) {
        const weapon = this.rig?.weapon;
        const material = weapon?.userData?.glowMaterial;
        if (material) material.emissiveIntensity = 0;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Трассеры
  // -------------------------------------------------------------------------

  _spawnTracer(start, end) {
    const geometry = new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]);
    const material = new THREE.LineBasicMaterial({
      color: 0xffdd66,
      transparent: true,
      opacity: 0.9
    });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    this.scene.add(line);
    this.tracers.push({ line, life: 0.08, maxLife: 0.08 });
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
        tracer.line.material.opacity = tracer.life / tracer.maxLife;
      }
    }
  }

  _clearTracers() {
    for (const tracer of this.tracers) {
      this.scene.remove(tracer.line);
      tracer.line.geometry.dispose();
      tracer.line.material.dispose();
    }
    this.tracers = [];
  }
}

// ---------------------------------------------------------------------------
// Подклассы
// ---------------------------------------------------------------------------

export class OrkBoy extends Enemy {
  constructor(options) {
    super({
      ...options,
      type: 'boy',
      config: CONFIG.enemies.boy,
      model: makeOrkBoy(),
      healthOverride: options.healthOverride ?? null
    });
  }
}

export class OrkShooter extends Enemy {
  constructor(options) {
    super({
      ...options,
      type: 'shooter',
      config: CONFIG.enemies.shooter,
      model: makeOrkShooter(),
      healthOverride: options.healthOverride ?? null
    });
  }
}

export class OrkNob extends Enemy {
  constructor(options) {
    super({
      ...options,
      type: 'nob',
      config: CONFIG.enemies.nob,
      model: makeOrkNob(),
      healthOverride: options.healthOverride ?? null
    });
  }
}

// ---------------------------------------------------------------------------
// Менеджер врагов
// ---------------------------------------------------------------------------

export class EnemyManager {
  constructor({ scene, player, colliders, audio, weapons, onModelAdded = null }) {
    this.scene = scene;
    this.player = player;
    this.colliders = colliders;
    this.audio = audio;
    this.weapons = weapons;
    this.onModelAdded = onModelAdded;

    this.enemies = [];
    this.active = true;
  }

  setActive(active) {
    this.active = active;
  }

  spawn(type, position, options = {}) {
    const alive = this.enemies.filter((enemy) => !enemy.disposed && !enemy.dead).length;
    if (alive >= CONFIG.enemies.maxAlive) return null;

    const deps = {
      scene: this.scene,
      player: this.player,
      colliders: this.colliders,
      audio: this.audio,
      weapons: this.weapons,
      position,
      healthOverride: options.health ?? null
    };

    let enemy = null;
    if (type === 'boy') enemy = new OrkBoy(deps);
    else if (type === 'shooter') enemy = new OrkShooter(deps);
    else if (type === 'nob') enemy = new OrkNob(deps);

    if (!enemy) {
      console.warn(`[EnemyManager] Неизвестный тип врага: ${type}`);
      return null;
    }

    this.enemies.push(enemy);
    this.onModelAdded?.(enemy.model);
    return enemy;
  }

  update(dt) {
    if (!this.active) return;

    for (const enemy of this.enemies) {
      enemy.update(dt);
    }

    if (this.enemies.some((enemy) => enemy.disposed)) {
      this.enemies = this.enemies.filter((enemy) => !enemy.disposed);
    }
  }

  hearNoise(position, radius = 15) {
    for (const enemy of this.enemies) {
      enemy.hearNoise(position, radius);
    }
  }

  clear() {
    for (const enemy of this.enemies) {
      enemy.dispose();
    }
    this.enemies = [];
  }

  get aliveCount() {
    return this.enemies.filter((enemy) => !enemy.dead && !enemy.disposed).length;
  }
}
