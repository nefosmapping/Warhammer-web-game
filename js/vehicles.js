// Управляемая техника из админ-панели:
// — два варианта танка «Леман Русс» (DeepSeek / ChatGPT);
// — «Валькирия».
// Игрок садится/выходит по E, танк едет по WASD, башня наводится мышью,
// «Валькирия» летит по WASD/мыши, Shift — вверх, Ctrl — вниз, ЛКМ — огонь.

import * as THREE from 'three';
import { CONFIG, clamp } from './config.js';
import { makeLemanRuss, disposeLemanRuss } from './models/leman_russ.js';
import { makeValkyrie, disposeValkyrie } from './models/valkyrie.js';

const UP = new THREE.Vector3(0, 1, 0);
const WORLD_MIN = -92;
const WORLD_MAX = 92;
const VALKYRIE_MAX_ALTITUDE = 78;

function wrapAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function damp(current, target, speed, dt) {
  return current + (target - current) * Math.min(1, speed * dt);
}

export class VehicleManager {
  constructor({
    scene,
    camera,
    input,
    player,
    weapons,
    audio,
    hud,
    colliders,
    particles = null,
    getSensitivity = () => 1,
    onModelAdded = null
  }) {
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.player = player;
    this.weapons = weapons;
    this.audio = audio;
    this.hud = hud;
    this.colliders = colliders;
    this.particles = particles;
    this.getSensitivity = getSensitivity;
    this.onModelAdded = onModelAdded;

    this.vehicles = [];
    this.active = null;
    this.nearby = null;
    this.time = 0;

    this._tracers = [];
    this._raycaster = new THREE.Raycaster();
    this._savedFov = CONFIG.render.fov;

    this._tmpDir = new THREE.Vector3();
    this._tmpPos = new THREE.Vector3();
    this._tmpPoint = new THREE.Vector3();
    this._tmpTarget = new THREE.Vector3();
    this._tmpBehind = new THREE.Vector3();
    this._tmpRight = new THREE.Vector3();
    this._tmpQuat = new THREE.Quaternion();
    this._tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  get isPiloting() {
    return Boolean(this.active);
  }

  // -------------------------------------------------------------------------
  // Спавн
  // -------------------------------------------------------------------------

  spawnTank(variant = 'deepseek', spawn = {}) {
    const root = makeLemanRuss(variant);
    const x = Number.isFinite(spawn.x) ? spawn.x : this.player.position.x;
    const z = Number.isFinite(spawn.z) ? spawn.z : this.player.position.z;
    const yaw = Number.isFinite(spawn.yaw) ? spawn.yaw : this.player.yaw;

    root.position.set(x, 0, z);
    root.rotation.y = yaw;
    this.scene.add(root);
    this.onModelAdded?.(root);

    const turret = root.userData.turretGroup;
    const gun = root.userData.gunGroup;

    const vehicle = {
      kind: 'tank',
      variant,
      label: root.userData.label || 'Леман Русс',
      root,
      turret,
      gun,
      muzzle: root.userData.muzzle,
      muzzleFlash: root.userData.muzzleFlash,
      muzzleLight: root.userData.muzzleLight,
      trackTexture: root.userData.trackTexture,

      hullYaw: yaw,
      aimYaw: yaw,
      aimPitch: 0,
      speed: 0,

      baseGunZ: gun.position.z,
      recoil: 0,
      reloadTimer: 0,
      flashTimer: 0,

      enterRadius: 5.5
    };

    this.vehicles.push(vehicle);
    return vehicle;
  }

  spawnValkyrie(spawn = {}) {
    const root = makeValkyrie({ scale: 1.0 });
    const x = Number.isFinite(spawn.x) ? spawn.x : this.player.position.x;
    const y = Number.isFinite(spawn.y) ? spawn.y : 0;
    const z = Number.isFinite(spawn.z) ? spawn.z : this.player.position.z;
    const yaw = Number.isFinite(spawn.yaw) ? spawn.yaw : this.player.yaw;

    root.rotation.order = 'YXZ';
    root.position.set(x, y, z);
    root.rotation.set(0, yaw, 0);

    this.scene.add(root);
    this.onModelAdded?.(root);

    const vehicle = {
      kind: 'valkyrie',
      label: '«Валькирия»',
      root,
      gunLeft: root.getObjectByName('gunLeft') || root,
      gunRight: root.getObjectByName('gunRight') || root,

      yaw,
      pitch: 0,
      roll: 0,
      speed: 0,

      fireTimer: 0,
      fireSide: 0,
      enterRadius: 6.5
    };

    this.vehicles.push(vehicle);
    return vehicle;
  }

  // -------------------------------------------------------------------------
  // Обновление
  // -------------------------------------------------------------------------

  update(dt) {
    this.time += dt;
    this._updateTracers(dt);

    if (this.active) {
      this._updateActive(dt);
      return;
    }

    this._updateNearbyVehicle();
  }

  _updateNearbyVehicle() {
    let nearest = null;
    let bestDistance = Infinity;

    for (const vehicle of this.vehicles) {
      // В воздухе «Валькирию» не подобрать — сначала нужно сесть.
      if (vehicle.kind === 'valkyrie' && vehicle.root.position.y > 6) continue;

      const dx = this.player.position.x - vehicle.root.position.x;
      const dz = this.player.position.z - vehicle.root.position.z;
      const distance = Math.hypot(dx, dz);

      if (distance <= vehicle.enterRadius && distance < bestDistance) {
        bestDistance = distance;
        nearest = vehicle;
      }
    }

    this.nearby = nearest;

    if (nearest) {
      this._setPrompt(`[E] Сесть в ${nearest.label}`);
      if (this.input.wasPressed('KeyE')) {
        this._enter(nearest);
        this.input.keysPressed.delete('KeyE');
      }
      return;
    }

    this._setPrompt('');
  }

  // HUD-подсказка с запасным путём напрямую через DOM:
  // так посадка в технику не зависит от версии закэшированного hud.js.
  _setPrompt(text) {
    if (typeof this.hud?.setVehiclePrompt === 'function') {
      this.hud.setVehiclePrompt(text);
      return;
    }

    const element = document.getElementById('vehicle-prompt');
    if (!element) return;

    if (!text) {
      element.classList.add('hidden');
      element.textContent = '';
      return;
    }

    element.textContent = text;
    element.classList.remove('hidden');
  }

  _updateActive(dt) {
    const vehicle = this.active;
    if (!vehicle) return;

    if (this.input.wasPressed('KeyE')) {
      this._exit();
      return;
    }

    const look = this.input.consumeLook();
    const sensitivity = CONFIG.player.mouseSensitivity * this.getSensitivity();

    if (vehicle.kind === 'tank') {
      vehicle.aimYaw -= look.x * sensitivity;
      vehicle.aimPitch = clamp(
        vehicle.aimPitch - look.y * sensitivity * 0.7,
        -0.14,
        0.22
      );
      this._updateTank(vehicle, dt);
    } else {
      vehicle.yaw -= look.x * sensitivity;
      vehicle.pitch = clamp(vehicle.pitch - look.y * sensitivity, -1.1, 1.1);
      this._updateValkyrie(vehicle, dt);
    }

    // Уровневые триггеры/волны продолжают работать от позиции техники.
    this.player.position.set(vehicle.root.position.x, 0, vehicle.root.position.z);
  }

  // -------------------------------------------------------------------------
  // Танк
  // -------------------------------------------------------------------------

  _updateTank(vehicle, dt) {
    const forwardInput =
      (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0);
    const turnInput =
      (this.input.isDown('KeyA') ? 1 : 0) - (this.input.isDown('KeyD') ? 1 : 0);
    const running = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');

    vehicle.hullYaw += turnInput * 1.35 * dt;

    const targetSpeed = forwardInput * (running ? 12 : 8);
    vehicle.speed = damp(vehicle.speed, targetSpeed, 4.5, dt);

    const dx = -Math.sin(vehicle.hullYaw) * vehicle.speed * dt;
    const dz = -Math.cos(vehicle.hullYaw) * vehicle.speed * dt;

    const oldX = vehicle.root.position.x;
    const oldZ = vehicle.root.position.z;

    let nextX = oldX + dx;
    let nextZ = oldZ + dz;

    if (this.colliders) {
      const moved = this.colliders.move(oldX, oldZ, dx, dz, 2.35);
      nextX = moved.x;
      nextZ = moved.z;
      if (Math.abs(moved.x - (oldX + dx)) > 0.0001) vehicle.speed *= 0.2;
      if (Math.abs(moved.z - (oldZ + dz)) > 0.0001) vehicle.speed *= 0.2;
    }

    vehicle.root.position.set(
      clamp(nextX, WORLD_MIN, WORLD_MAX),
      0,
      clamp(nextZ, WORLD_MIN, WORLD_MAX)
    );
    vehicle.root.rotation.y = vehicle.hullYaw;

    // Башня плавно догоняет прицел относительно корпуса.
    const relativeYaw = wrapAngle(vehicle.aimYaw - vehicle.hullYaw);
    vehicle.turret.rotation.y = this._lerpAngle(
      vehicle.turret.rotation.y,
      relativeYaw,
      8,
      dt
    );
    vehicle.gun.rotation.x = vehicle.aimPitch;

    // Откат орудия.
    vehicle.recoil = Math.max(0, vehicle.recoil - dt * 2.2);
    vehicle.gun.position.z = vehicle.baseGunZ + vehicle.recoil;

    // Анимация гусениц.
    if (vehicle.trackTexture) {
      vehicle.trackTexture.offset.y -= vehicle.speed * dt * 0.2;
    }

    if (vehicle.reloadTimer > 0) {
      vehicle.reloadTimer = Math.max(0, vehicle.reloadTimer - dt);
    }

    if (vehicle.flashTimer > 0) {
      vehicle.flashTimer -= dt;
      if (vehicle.flashTimer <= 0) {
        if (vehicle.muzzleFlash) vehicle.muzzleFlash.visible = false;
        if (vehicle.muzzleLight) vehicle.muzzleLight.intensity = 0;
      }
    }

    const direction = this._getGunDirection(vehicle, this._tmpDir);
    vehicle.muzzle.getWorldPosition(this._tmpPos);

    const cameraOffset = this._tmpBehind
      .set(0, 7.4, 13)
      .applyAxisAngle(UP, vehicle.aimYaw);
    this.camera.position.copy(vehicle.root.position).add(cameraOffset);
    this.camera.lookAt(
      this._tmpTarget.copy(this._tmpPos).addScaledVector(direction, 28)
    );

    const reload = vehicle.reloadTimer > 0
      ? `перезарядка ${vehicle.reloadTimer.toFixed(1)} с`
      : 'ЛКМ — огонь';
    this._setPrompt(`«Леман Русс» · ${reload} · E — выйти`);

    if (this.input.wasMousePressed(0)) this._fireTank(vehicle);
  }

  _fireTank(vehicle) {
    if (vehicle.reloadTimer > 0) return;

    vehicle.reloadTimer = 2.2;
    vehicle.recoil = 0.42;
    vehicle.flashTimer = 0.12;

    if (vehicle.muzzleFlash) vehicle.muzzleFlash.visible = true;
    if (vehicle.muzzleLight) vehicle.muzzleLight.intensity = 24;

    const origin = vehicle.muzzle.getWorldPosition(new THREE.Vector3());
    const direction = this._getGunDirection(vehicle, new THREE.Vector3());
    const hit = this._raycast(origin, direction, 190);
    const end = hit.point;

    this._spawnTracer(origin, end, 0xffd06a, 0.18);

    if (hit.root?.userData?.damageable) {
      hit.root.userData.damageable.takeDamage(260, end, direction);
      this.hud.showHitmarker();
      this.audio?.playHit();
    }

    // Осколочный урон по технике/врагам рядом с точкой попадания.
    this._damageInRadius(end, 3.2, 70, hit.root);

    this.weapons?._spawnExplosionVisual?.(end);
    this.weapons?.onNoise?.(end, 40);
    this.audio?.playExplosion();
    this.particles?.spawnSmoke(end, 8);
  }

  _getGunDirection(vehicle, target) {
    vehicle.gun.updateWorldMatrix(true, true);
    vehicle.gun.getWorldQuaternion(this._tmpQuat);
    return target.set(0, 0, -1).applyQuaternion(this._tmpQuat).normalize();
  }

  // -------------------------------------------------------------------------
  // «Валькирия»
  // -------------------------------------------------------------------------

  _updateValkyrie(vehicle, dt) {
    const forwardInput =
      (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0);
    const strafeInput =
      (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0);
    const ascend = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const descend = this.input.isDown('ControlLeft') || this.input.isDown('ControlRight');
    const verticalInput = (ascend ? 1 : 0) - (descend ? 1 : 0);

    vehicle.speed = damp(vehicle.speed, forwardInput * 38, 2.6, dt);
    vehicle.roll = damp(vehicle.roll, -strafeInput * 0.32, 3.2, dt);

    const cosPitch = Math.cos(vehicle.pitch);
    const forward = this._tmpDir.set(
      -Math.sin(vehicle.yaw) * cosPitch,
      Math.sin(vehicle.pitch),
      -Math.cos(vehicle.yaw) * cosPitch
    );
    const right = this._tmpRight.set(
      Math.cos(vehicle.yaw),
      0,
      -Math.sin(vehicle.yaw)
    );

    vehicle.root.position.addScaledVector(forward, vehicle.speed * dt);
    vehicle.root.position.addScaledVector(right, strafeInput * 14 * dt);
    vehicle.root.position.y += verticalInput * 12 * dt;

    vehicle.root.position.x = clamp(vehicle.root.position.x, WORLD_MIN, WORLD_MAX);
    vehicle.root.position.z = clamp(vehicle.root.position.z, WORLD_MIN, WORLD_MAX);
    vehicle.root.position.y = clamp(vehicle.root.position.y, 0, VALKYRIE_MAX_ALTITUDE);

    vehicle.root.rotation.order = 'YXZ';
    vehicle.root.rotation.set(vehicle.pitch, vehicle.yaw, vehicle.roll);

    // Камера чуть позади и выше, с наклоном вслед за машиной.
    this._tmpEuler.set(vehicle.pitch * 0.45, vehicle.yaw, 0, 'YXZ');
    const cameraOffset = this._tmpBehind
      .set(0, 4.6, 16)
      .applyEuler(this._tmpEuler);
    this.camera.position.copy(vehicle.root.position).add(cameraOffset);
    this.camera.lookAt(
      this._tmpTarget.copy(vehicle.root.position).addScaledVector(forward, 30)
    );

    this._setPrompt(
      '«Валькирия» · WASD — полёт · Shift/Ctrl — высота · ЛКМ — огонь · E — выйти'
    );

    vehicle.fireTimer = Math.max(0, vehicle.fireTimer - dt);
    if (this.input.isMouseDown(0) && vehicle.fireTimer <= 0) {
      this._fireValkyrie(vehicle);
      vehicle.fireTimer = 0.11;
    }
  }

  _fireValkyrie(vehicle) {
    const marker = vehicle.fireSide === 0 ? vehicle.gunLeft : vehicle.gunRight;
    vehicle.fireSide = 1 - vehicle.fireSide;

    const origin = marker.getWorldPosition(new THREE.Vector3());
    const cosPitch = Math.cos(vehicle.pitch);
    const direction = new THREE.Vector3(
      -Math.sin(vehicle.yaw) * cosPitch,
      Math.sin(vehicle.pitch),
      -Math.cos(vehicle.yaw) * cosPitch
    ).normalize();

    const hit = this._raycast(origin, direction, 190);
    this._spawnTracer(origin, hit.point, 0x9fe6ff, 0.09);

    if (hit.root?.userData?.damageable) {
      hit.root.userData.damageable.takeDamage(18, hit.point, direction);
      this.hud.showHitmarker();
      this.audio?.playHit();
    }

    this.particles?.spawnSmoke(origin, 1);
    this.audio?.playShot();
  }

  // -------------------------------------------------------------------------
  // Вход/выход
  // -------------------------------------------------------------------------

  _enter(vehicle) {
    this.active = vehicle;
    this.nearby = null;

    this.player.setActive(false);
    this.weapons.setActive(false);
    this.player.velocity.set(0, 0, 0);

    this._savedFov = this.camera.fov;
    this.camera.fov = vehicle.kind === 'tank' ? 62 : 74;
    this.camera.updateProjectionMatrix();

    if (vehicle.kind === 'tank') {
      vehicle.aimYaw = vehicle.hullYaw;
      vehicle.aimPitch = 0;
      vehicle.speed = 0;
    } else {
      vehicle.yaw = vehicle.root.rotation.y;
      vehicle.pitch = 0;
      vehicle.roll = 0;
      vehicle.speed = 0;
    }

    this._setPrompt('');
    this.hud.toast(`Вы заняли ${vehicle.label}. E — покинуть технику.`, 2400);
    this.audio?.playUiClick();
    this.input.keysPressed.delete('KeyE');
  }

  _exit(options = {}) {
    const vehicle = this.active;
    if (!vehicle) return;

    const { silent = false, restorePlayer = true } = options;

    if (restorePlayer) {
      // Игрок выходит сбоку от машины, не внутри коллизии.
      const yaw = vehicle.kind === 'tank' ? vehicle.hullYaw : vehicle.yaw;
      const side = this._tmpPos.set(3.4, 0, 0).applyAxisAngle(UP, yaw);

      let x = vehicle.root.position.x + side.x;
      let z = vehicle.root.position.z + side.z;

      if (this.colliders?.isBlocked(x, z, CONFIG.player.radius)) {
        x = vehicle.root.position.x - side.x;
        z = vehicle.root.position.z - side.z;
      }

      this.player.position.set(x, 0, z);
      this.player.velocity.set(0, 0, 0);
      this.player.yaw = vehicle.kind === 'tank' ? vehicle.aimYaw : vehicle.yaw;
      this.player.pitch = 0;
      this.player.recoilPitch = 0;

      this.player.setActive(true);
      this.weapons.setActive(true);
      this.player._updateCamera(0.016);
    }

    this.camera.fov = this._savedFov || CONFIG.render.fov;
    this.camera.updateProjectionMatrix();

    this.active = null;
    this.nearby = null;
    this._setPrompt('');
    this.input.keysPressed.delete('KeyE');

    if (!silent) this.hud.toast('Вы покинули технику.', 1600);
  }

  forceExit() {
    if (this.active) this._exit({ silent: true, restorePlayer: false });
  }

  // -------------------------------------------------------------------------
  // Хитскан и трассеры
  // -------------------------------------------------------------------------

  _raycast(origin, direction, maxDistance) {
    let distance = maxDistance;

    if (this.colliders) {
      const wall = this.colliders.raycast(origin, direction, distance);
      if (wall) distance = Math.min(distance, wall.distance);
    }

    const targets = this.weapons?.targets ? [...this.weapons.targets] : [];
    for (const target of targets) target.updateWorldMatrix(true, true);

    this._raycaster.set(origin, direction);
    this._raycaster.far = distance;

    const hits = targets.length > 0
      ? this._raycaster.intersectObjects(targets, true)
      : [];

    if (hits.length === 0) {
      return {
        point: origin.clone().addScaledVector(direction, distance),
        root: null
      };
    }

    const hit = hits[0];
    return {
      point: hit.point.clone(),
      root: this._findDamageable(hit.object)
    };
  }

  _findDamageable(object) {
    let current = object;
    while (current) {
      if (current.userData?.damageable) return current;
      current = current.parent;
    }
    return null;
  }

  _damageInRadius(center, radius, damage, ignoreRoot = null) {
    if (!this.weapons?.targets) return;

    const position = this._tmpPoint;
    for (const target of this.weapons.targets) {
      if (target === ignoreRoot || target.visible === false) continue;
      if (!target.userData?.damageable) continue;

      target.updateWorldMatrix(true, true);
      target.getWorldPosition(position);
      position.y += 1;

      if (position.distanceTo(center) <= radius) {
        target.userData.damageable.takeDamage(damage, center, UP);
      }
    }
  }

  _spawnTracer(from, to, color = 0xffd06a, life = 0.14) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      from.clone(),
      to.clone()
    ]);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    line.renderOrder = 6;
    this.scene.add(line);

    this._tracers.push({ line, life, maxLife: life });
  }

  _updateTracers(dt) {
    for (let i = this._tracers.length - 1; i >= 0; i -= 1) {
      const tracer = this._tracers[i];
      tracer.life -= dt;

      if (tracer.life <= 0) {
        this.scene.remove(tracer.line);
        tracer.line.geometry.dispose();
        tracer.line.material.dispose();
        this._tracers.splice(i, 1);
      } else {
        tracer.line.material.opacity = (tracer.life / tracer.maxLife) * 0.95;
      }
    }
  }

  _clearTracers() {
    for (const tracer of this._tracers) {
      this.scene.remove(tracer.line);
      tracer.line.geometry.dispose();
      tracer.line.material.dispose();
    }
    this._tracers = [];
  }

  _lerpAngle(current, target, speed, dt) {
    const delta = wrapAngle(target - current);
    return wrapAngle(current + delta * Math.min(1, speed * dt));
  }

  // -------------------------------------------------------------------------
  // Очистка
  // -------------------------------------------------------------------------

  clear() {
    if (this.active) this._exit({ silent: true, restorePlayer: true });

    for (const vehicle of this.vehicles) {
      this.scene.remove(vehicle.root);
      if (vehicle.kind === 'tank') disposeLemanRuss(vehicle.root);
      else disposeValkyrie(vehicle.root);
    }

    this.vehicles = [];
    this.active = null;
    this.nearby = null;
    this._setPrompt('');
    this._clearTracers();
  }
}
