// Контроллер игрока от первого лица: обзор мышью, WASD, бег, AABB-коллизии,
// покачивание камеры, здоровье/броня, отдача и тряска.

import * as THREE from 'three';
import { CONFIG, clamp } from './config.js';

export class Player {
  constructor({ camera, input, audio, hud, colliders, getSensitivity, onDeath = null }) {
    this.camera = camera;
    this.input = input;
    this.audio = audio;
    this.hud = hud;
    this.colliders = colliders;
    this.getSensitivity = getSensitivity || (() => 1);
    this.onDeath = onDeath;

    this.position = new THREE.Vector3(0, 0, 6);
    this.velocity = new THREE.Vector3();

    this.yaw = 0;
    this.pitch = 0;
    this.recoilPitch = 0;

    this.health = CONFIG.player.maxHealth;
    this.armor = CONFIG.player.maxArmor;
    this.dead = false;
    this.active = false;

    // Дебаг-режим: свободный полёт без гравитации и коллизий.
    this.noclip = false;
    // Админ-режим: полный иммунитет к урону.
    this.godMode = false;

    this.walkPhase = 0;
    this.bob = 0;
    this.bobSide = 0;

    this.shakeTime = 0;
    this.shakeDuration = 1;
    this.shakeIntensity = 0;

    this._tmpForward = new THREE.Vector3();
    this._tmpRight = new THREE.Vector3();
    this._tmpEye = new THREE.Vector3();
    this._tmpDir = new THREE.Vector3();

    this.camera.rotation.order = 'YXZ';
    this._updateHud();
  }

  reset(spawn = { x: 0, z: 6, yaw: 0 }) {
    // В noclip высота камеры хранится в position.y, иначе — 0 (ноги на земле).
    const startY = this.noclip ? CONFIG.player.eyeHeight : 0;
    this.position.set(spawn.x ?? 0, startY, spawn.z ?? 6);
    this.velocity.set(0, 0, 0);
    this.yaw = spawn.yaw ?? 0;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.health = CONFIG.player.maxHealth;
    this.armor = CONFIG.player.maxArmor;
    this.dead = false;
    this.walkPhase = 0;
    this.bob = 0;
    this.shakeTime = 0;

    this.active = true;
    this.camera.position.set(
      this.position.x,
      this.noclip ? this.position.y : CONFIG.player.eyeHeight,
      this.position.z
    );
    this.camera.rotation.set(0, this.yaw, 0);
    this._updateHud();
  }

  setActive(active) {
    this.active = active;
    if (!active) {
      this.velocity.set(0, 0, 0);
    }
  }

  setNoclip(enabled) {
    this.noclip = Boolean(enabled);
    if (this.noclip) {
      this.velocity.set(0, 0, 0);
      this.bob = 0;
      this.bobSide = 0;
      // Продолжаем с текущей высоты камеры, а не проваливаемся на землю.
      this.position.y = Math.max(CONFIG.player.eyeHeight, this.camera.position.y);
    } else {
      this.position.y = 0;
    }
  }

  setGodMode(enabled) {
    this.godMode = Boolean(enabled);
  }

  get eyeHeight() {
    return CONFIG.player.eyeHeight;
  }

  // -------------------------------------------------------------------------
  // Обновление
  // -------------------------------------------------------------------------

  update(dt) {
    if (!this.active || this.dead) return;

    this._updateLook(dt);

    if (this.noclip) {
      this._updateNoclip(dt);
      return;
    }

    this._updateMovement(dt);
    this._updateCamera(dt);
  }

  // Свободный полёт: WASD — вперёд/назад/в стороны относительно взгляда,
  // Space — вверх, Ctrl — вниз. Коллизии и «прилипание» к земле отключены.
  _updateNoclip(dt) {
    const forwardInput = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0);
    const strafeInput = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0);
    const upInput =
      (this.input.isDown('Space') ? 1 : 0) -
      (this.input.isDown('ControlLeft') || this.input.isDown('ControlRight') ? 1 : 0);
    const running = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const speed = running ? 24 : 12;

    // Направление взгляда с учётом тангажа — полёт «куда смотришь».
    const forward = this.camera.getWorldDirection(this._tmpForward);
    forward.normalize();

    const right = this._tmpRight.crossVectors(forward, this.camera.up).normalize();
    if (right.lengthSq() < 0.0001) right.set(1, 0, 0);

    this.position.addScaledVector(forward, forwardInput * speed * dt);
    this.position.addScaledVector(right, strafeInput * speed * dt);
    this.position.y += upInput * speed * dt;
    this.position.y = clamp(this.position.y, -25, 160);

    this.camera.position.copy(this.position);
    this.camera.rotation.set(this.pitch + this.recoilPitch, this.yaw, 0);
  }

  _updateLook(dt) {
    const look = this.input.consumeLook();
    const sensitivity = CONFIG.player.mouseSensitivity * this.getSensitivity();

    this.yaw -= look.x * sensitivity;
    this.pitch -= look.y * sensitivity;
    this.pitch = clamp(this.pitch, -1.45, 1.45);

    // Плавный возврат отдачи.
    this.recoilPitch *= Math.exp(-10 * dt);
    if (Math.abs(this.recoilPitch) < 0.0001) this.recoilPitch = 0;
  }

  _updateMovement(dt) {
    const forwardInput = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0);
    const strafeInput = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0);
    const running = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');

    const speed = running ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    // При yaw = 0 камера смотрит в -Z.
    let wishX = -sin * forwardInput + cos * strafeInput;
    let wishZ = -cos * forwardInput - sin * strafeInput;

    const wishLength = Math.hypot(wishX, wishZ);
    if (wishLength > 0) {
      wishX = (wishX / wishLength) * speed;
      wishZ = (wishZ / wishLength) * speed;
    }

    // Сглаживание ускорения/торможения.
    const smoothing = Math.min(1, dt * 12);
    this.velocity.x += (wishX - this.velocity.x) * smoothing;
    this.velocity.z += (wishZ - this.velocity.z) * smoothing;

    if (Math.abs(this.velocity.x) < 0.001) this.velocity.x = 0;
    if (Math.abs(this.velocity.z) < 0.001) this.velocity.z = 0;

    let nextX = this.position.x + this.velocity.x * dt;
    let nextZ = this.position.z + this.velocity.z * dt;

    if (this.colliders) {
      const moved = this.colliders.move(
        this.position.x,
        this.position.z,
        nextX - this.position.x,
        nextZ - this.position.z,
        CONFIG.player.radius
      );
      // Если упёрлись в стену — гасим скорость по этой оси.
      if (Math.abs(moved.x - nextX) > 0.0001) this.velocity.x = 0;
      if (Math.abs(moved.z - nextZ) > 0.0001) this.velocity.z = 0;
      nextX = moved.x;
      nextZ = moved.z;
    }

    this.position.x = nextX;
    this.position.z = nextZ;
    this.position.y = 0;

    // Покачивание при ходьбе.
    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const normalizedSpeed = Math.min(1, planarSpeed / CONFIG.player.walkSpeed);

    if (planarSpeed > 0.15) {
      this.walkPhase += dt * (CONFIG.player.bobFrequency + planarSpeed * 0.5);
    }

    this.bob = Math.sin(this.walkPhase * 2) * CONFIG.player.bobAmplitude * normalizedSpeed;
    this.bobSide = Math.cos(this.walkPhase) * CONFIG.player.bobAmplitude * 0.55 * normalizedSpeed;
  }

  _updateCamera(dt) {
    // Тряска.
    let shakeX = 0;
    let shakeY = 0;
    let shakeRoll = 0;

    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const strength = this.shakeIntensity * (this.shakeTime / this.shakeDuration);
      shakeX = (Math.random() - 0.5) * strength;
      shakeY = (Math.random() - 0.5) * strength;
      shakeRoll = (Math.random() - 0.5) * strength * 0.35;
    }

    this.camera.position.set(
      this.position.x + this.bobSide,
      CONFIG.player.eyeHeight + this.bob + shakeY,
      this.position.z
    );

    this.camera.rotation.set(
      this.pitch + this.recoilPitch + shakeX * 0.1,
      this.yaw + shakeX * 0.06,
      -this.bobSide * 0.6 + shakeRoll
    );
  }

  // -------------------------------------------------------------------------
  // Вспомогательные методы для оружия
  // -------------------------------------------------------------------------

  getEyePosition(target = new THREE.Vector3()) {
    return this.camera.getWorldPosition(target);
  }

  getLookDirection(target = new THREE.Vector3()) {
    return this.camera.getWorldDirection(target);
  }

  addRecoil(degrees) {
    this.recoilPitch += (degrees * Math.PI) / 180;
  }

  addShake(intensity = 0.3, duration = 0.35) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTime = Math.max(this.shakeTime, duration);
    this.shakeDuration = Math.max(duration, 0.001);
  }

  // -------------------------------------------------------------------------
  // Здоровье и броня
  // -------------------------------------------------------------------------

  takeDamage(amount, source = 'unknown') {
    // Режим Бога из админ-панели: урон полностью игнорируется.
    if (this.dead || this.godMode || amount <= 0) return;

    const absorbed = Math.min(this.armor, amount * CONFIG.player.armorAbsorb);
    this.armor -= absorbed;
    const healthDamage = amount - absorbed;
    this.health = Math.max(0, this.health - healthDamage);

    this.hud?.flashDamage();
    this.hud?.setHealth(this.health);
    this.hud?.setArmor(this.armor);

    if (healthDamage > 4) {
      this.addShake(Math.min(0.5, healthDamage * 0.015), 0.3);
    }

    if (this.health <= 0) {
      this.dead = true;
      this.active = false;
      this.onDeath?.(source);
    }
  }

  heal(amount) {
    this.health = Math.min(CONFIG.player.maxHealth, this.health + amount);
    this.hud?.setHealth(this.health);
  }

  addArmor(amount) {
    this.armor = Math.min(CONFIG.player.maxArmor, this.armor + amount);
    this.hud?.setArmor(this.armor);
  }

  _updateHud() {
    this.hud?.setHealth(this.health);
    this.hud?.setArmor(this.armor);
  }
}
