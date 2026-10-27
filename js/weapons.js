// Оружейная система: болтер, цепной меч, граната.
// Модели от первого лица привязаны к камере, анимации синхронизированы
// с логикой (перезарядка, отдача, замах, полёт гранаты).

import * as THREE from 'three';
import { CONFIG, clamp, easeInOut } from './config.js';
import {
  makeBolter,
  makeChainsword,
  makePlayerArms,
  makeGrenade,
  makeLauncher
} from './models/index.js';

export class WeaponSystem {
  constructor({ scene, camera, input, player, audio, hud, colliders, onExplosion = null }) {
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.player = player;
    this.audio = audio;
    this.hud = hud;
    this.colliders = colliders;
    this.onExplosion = onExplosion;
    // Колбэк шума: выстрелы и взрывы привлекают орков (Фаза 4).
    this.onNoise = null;

    this.targets = new Set();
    this.projectiles = [];
    this.raycaster = new THREE.Raycaster();

    this.active = false;
    this.time = 0;

    // Боезапас.
    this.slot = 'bolter';
    this.magazine = CONFIG.weapons.bolter.magSize;
    this.reserve = CONFIG.weapons.bolter.reserveMax;
    this.grenades = CONFIG.weapons.grenade.startAmmo;

    // Владение оружием (Фаза 7): туториал блокирует всё до подбора.
    // В обычной игре (Фазы 1–4 и ?play) оружие доступно сразу.
    this.hasBolter = true;
    this.hasChainsword = true;
    this.hasGrenades = true;

    // Колбэк попадания: (root, damage, source, point) — партиклы/туториал.
    this.onHit = null;
    // Колбэк выстрела: (muzzleWorldPosition) — дым из ствола.
    this.onShot = null;

    // Тайминги.
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.reloading = false;
    this.reloadAmmoGiven = false;
    this.meleeCooldown = 0;
    this.swinging = false;
    this.swingElapsed = 0;
    this.swingHitDone = false;
    this.tempMelee = false;
    this.grenadeCooldown = 0;
    this.grenadeViewTimer = 0;
    this.flashTimer = 0;
    this.chainOffset = 0;
    this.kick = 0;

    // Визуальные эффекты взрывов (сфера, свет, осколки).
    this.effects = [];

    // ПЗРК.
    this.hasLauncher = false;
    this.aiming = false;
    this.baseFov = CONFIG.render.fov;
    this.aimFov = 34;
    this.lockTarget = null;
    this.lockTimer = 0;
    this.locked = false;
    this.lockBeepTimer = 0;
    this.launcherCooldown = 0;
    this.missiles = [];

    this._tmpVec = new THREE.Vector3();
    this._tmpVec2 = new THREE.Vector3();
    this._tmpQuat = new THREE.Quaternion();

    this._buildViewmodel();
  }

  // -------------------------------------------------------------------------
  // Модели от первого лица
  // -------------------------------------------------------------------------

  _buildViewmodel() {
    this.viewRoot = new THREE.Group();
    this.viewRoot.name = 'weapon-viewmodel';
    this.camera.add(this.viewRoot);

    // Руки — общая база для всех видов оружия.
    this.arms = makePlayerArms();
    this.arms.position.set(0.02, 0.1, -0.08);
    this.arms.scale.setScalar(0.55);
    // Позы левой руки под каждый слот, чтобы она не «висела в воздухе».
    this.leftArm = this.arms.userData.leftArm;
    this.leftArmPoses = {
      bolter: {
        position: new THREE.Vector3(0.12, -0.45, -0.8),
        rotation: new THREE.Euler(-0.1, 0.12, -0.2)
      },
      chainsword: {
        position: new THREE.Vector3(0.2, -0.48, -0.42),
        rotation: new THREE.Euler(-0.42, 0.34, -0.34)
      },
      pzrk: {
        position: new THREE.Vector3(0.16, -0.5, -0.48),
        rotation: new THREE.Euler(-0.24, 0.2, -0.24)
      }
    };
    this.leftArm.position.copy(this.leftArmPoses.bolter.position);
    this.leftArm.rotation.copy(this.leftArmPoses.bolter.rotation);
    this.viewRoot.add(this.arms);

    // Болтер.
    this.bolter = makeBolter();
    this.bolter.scale.setScalar(0.55);
    this.bolter.position.set(0.2, -0.2, -0.65);
    this.bolter.rotation.set(0.02, -0.04, 0);
    this.viewRoot.add(this.bolter);

    // ВАЖНО: this.magazine — число патронов, магазин-меш называется отдельно.
    this.magazineMesh = this.bolter.userData.magazine;
    this.magazineBaseY = this.magazineMesh ? this.magazineMesh.position.y : 0;

    // Цепной меч.
    this.chainsword = makeChainsword();
    this.chainsword.scale.setScalar(0.6);
    this.chainsword.position.set(0.22, -0.22, -0.6);
    this.chainsword.rotation.set(0.1, -0.18, -0.12);
    this.chainsword.visible = false;
    this.viewRoot.add(this.chainsword);

    this.chainswordBasePosition = this.chainsword.position.clone();
    this.chainswordBaseRotation = this.chainsword.rotation.clone();

    this.chainLinks = this.chainsword.userData.chainLinks || [];
    this.chainBaseZ = this.chainLinks.map((link) => link.position.z);

    // Граната в левой руке на время броска.
    this.grenadeView = makeGrenade();
    this.grenadeView.scale.setScalar(0.9);
    this.grenadeView.position.set(-0.26, -0.24, -0.6);
    this.grenadeView.visible = false;
    this.viewRoot.add(this.grenadeView);

    // ПЗРК (скрыт до выдачи в админ-меню).
    this.launcher = makeLauncher();
    this.launcher.scale.setScalar(0.62);
    this.launcher.position.set(0.14, -0.22, -0.55);
    this.launcher.rotation.set(0.02, 0.03, -0.02);
    this.launcher.visible = false;
    this.viewRoot.add(this.launcher);

    // Вспышка выстрела.
    const muzzle = this.bolter.userData.muzzle;
    if (muzzle) {
      const flashMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd27a,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      this.muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), flashMaterial);
      this.muzzleFlash.visible = false;
      muzzle.add(this.muzzleFlash);

      this.muzzleLight = new THREE.PointLight(0xffb060, 0, 7, 2);
      this.muzzleLight.castShadow = false;
      muzzle.add(this.muzzleLight);
    }

    // Оружие от первого лица не участвует в карте теней.
    this.viewRoot.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    this._updateHud();
  }

  // -------------------------------------------------------------------------
  // Управление системой
  // -------------------------------------------------------------------------

  setActive(active) {
    this.active = active;
    this.viewRoot.visible = active;
    if (!active) {
      this.viewRoot.position.set(0, 0, 0);
      this.viewRoot.rotation.set(0, 0, 0);
      this._setAiming(false);
      this._cancelLock();
    }
  }

  // -------------------------------------------------------------------------
  // Владение оружием (туториал)
  // -------------------------------------------------------------------------

  lockAll() {
    this.hasBolter = false;
    this.hasChainsword = false;
    this.hasGrenades = false;
    // hasLauncher не сбрасываем: выдача из админ-меню должна сохраняться.

    this.magazine = 0;
    this.reserve = 0;
    this.grenades = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.swinging = false;
    this.tempMelee = false;
    this.slot = 'bolter';

    this._applyOwnership();
    this._updateHud();
  }

  unlock(kind) {
    if (kind === 'bolter') {
      this.hasBolter = true;
      this.magazine = CONFIG.weapons.bolter.magSize;
      this.reserve = CONFIG.weapons.bolter.reserveMax;
      this.slot = 'bolter';
    } else if (kind === 'chainsword') {
      this.hasChainsword = true;
    } else if (kind === 'grenades') {
      this.hasGrenades = true;
      this.grenades = CONFIG.weapons.grenade.startAmmo;
    } else if (kind === 'pzrk') {
      this.hasLauncher = true;
    }
    this._applyOwnership();
    this._updateHud();
  }

  // Синхронизирует видимость моделей с владением и выбранным слотом.
  // Старое оружие, его прицел и магазин скрываются вместе с группой.
  _applyOwnership() {
    const effectiveSlot = this.swinging && this.tempMelee ? 'chainsword' : this.slot;

    this.arms.visible = this.hasBolter || this.hasChainsword || this.hasLauncher;
    this.bolter.visible = this.hasBolter && effectiveSlot === 'bolter';
    this.chainsword.visible = this.hasChainsword && effectiveSlot === 'chainsword';
    this.launcher.visible = this.hasLauncher && effectiveSlot === 'pzrk';
    this.grenadeView.visible = false;

    this._applyLeftArmPose(effectiveSlot);
    this._applyWeaponPose(effectiveSlot);

    // Вспышка болтера не должна оставаться висеть после смены слота.
    if (!this.bolter.visible) {
      if (this.muzzleFlash) this.muzzleFlash.visible = false;
      if (this.muzzleLight) this.muzzleLight.intensity = 0;
    }
  }

  _applyLeftArmPose(slot) {
    if (!this.leftArm) return;
    const pose = this.leftArmPoses?.[slot] || this.leftArmPoses?.bolter;
    if (!pose) return;
    this.leftArm.position.copy(pose.position);
    this.leftArm.rotation.copy(pose.rotation);
  }

  _applyWeaponPose(slot) {
    // Гарантированно возвращаем меч/ПЗРК в исходную позу при переключении.
    if (slot !== 'chainsword') {
      this.chainsword.position.copy(this.chainswordBasePosition);
      this.chainsword.rotation.copy(this.chainswordBaseRotation);
    }
    if (this.launcher) {
      this.launcher.position.set(0.14, -0.22, -0.55);
      this.launcher.rotation.set(0.02, 0.03, -0.02);
    }
  }

  reset() {
    this.magazine = CONFIG.weapons.bolter.magSize;
    this.reserve = CONFIG.weapons.bolter.reserveMax;
    this.grenades = CONFIG.weapons.grenade.startAmmo;
    this.hasBolter = true;
    this.hasChainsword = true;
    this.hasGrenades = true;
    // hasLauncher намеренно сохраняется между уровнями: это админ-инструмент.

    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.reloading = false;
    this.reloadAmmoGiven = false;
    this.meleeCooldown = 0;
    this.swinging = false;
    this.swingElapsed = 0;
    this.tempMelee = false;
    this.grenadeCooldown = 0;
    this.grenadeViewTimer = 0;
    this.kick = 0;

    this._setAiming(false);
    this._cancelLock();
    this._clearProjectiles();
    this._clearMissiles();
    this.setSlot('bolter');
    this._applyOwnership();
    this._updateHud();
  }

  addTarget(object) {
    this.targets.add(object);
  }

  removeTarget(object) {
    this.targets.delete(object);
  }

  clearTargets() {
    this.targets.clear();
  }

  setSlot(slot) {
    if (slot !== 'bolter' && slot !== 'chainsword' && slot !== 'pzrk') return;
    if (slot === 'bolter' && !this.hasBolter) return;
    if (slot === 'chainsword' && !this.hasChainsword) return;
    if (slot === 'pzrk' && !this.hasLauncher) return;
    if (this.swinging && this.tempMelee) return;

    if (slot !== 'pzrk') this._setAiming(false);
    this._cancelLock();

    this.slot = slot;
    this._applyOwnership();
    this._updateHud();
    this.audio.playUiClick();
  }

  // Выдача ПЗРК из админ-меню.
  grantLauncher() {
    this.hasLauncher = true;
    this.setSlot('pzrk');
    this._updateHud();
    return this.hasLauncher;
  }

  // -------------------------------------------------------------------------
  // Обновление
  // -------------------------------------------------------------------------

  update(dt) {
    this.time += dt;

    this._updateTimers(dt);

    if (this.active) {
      this._handleInput();
    }

    this._updateAnimations(dt);
    this._updateFov(dt);
    this._updatePzrk(dt);
    this._updateMissiles(dt);
    this._updateEffects(dt);

    if (this.active) {
      this._updateProjectiles(dt);
    }
  }

  _updateTimers(dt) {
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    this.launcherCooldown = Math.max(0, this.launcherCooldown - dt);
    this.lockBeepTimer = Math.max(0, this.lockBeepTimer - dt);

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0 && this.muzzleFlash) {
        this.muzzleFlash.visible = false;
        this.muzzleLight.intensity = 0;
      }
    }

    if (this.reloading) {
      this.reloadTimer += dt;

      if (!this.reloadAmmoGiven && this.reloadTimer >= 1.0) {
        const needed = CONFIG.weapons.bolter.magSize - this.magazine;
        const taken = Math.min(needed, this.reserve);
        this.magazine += taken;
        this.reserve -= taken;
        this.reloadAmmoGiven = true;
        this._updateHud();
      }

      if (this.reloadTimer >= CONFIG.weapons.bolter.reloadTime) {
        this.reloading = false;
        this.reloadTimer = 0;
        this.reloadAmmoGiven = false;
      }
    }

    if (this.swinging) {
      this.swingElapsed += dt;

      if (!this.swingHitDone && this.swingElapsed >= 0.18) {
        this._hitscan(CONFIG.weapons.chainsword.damage, CONFIG.weapons.chainsword.range, 'melee');
        this.player.addShake(0.18, 0.16);
        this.swingHitDone = true;
      }

      if (this.swingElapsed >= CONFIG.weapons.chainsword.swingTime) {
        this.swinging = false;
        this.swingElapsed = 0;
        this.swingHitDone = false;

        if (this.tempMelee) {
          this.tempMelee = false;
          this._applyOwnership();
        }
      }
    }
  }

  _handleInput() {
    if (this.input.wasPressed('Digit1') && this.hasBolter) this.setSlot('bolter');
    if (this.input.wasPressed('Digit2') && this.hasChainsword) this.setSlot('chainsword');
    if (this.input.wasPressed('Digit4') && this.hasLauncher) this.setSlot('pzrk');

    if (this.input.wasPressed('KeyR')) this._startReload();
    if (this.input.wasPressed('KeyG')) this._throwGrenade();

    // ПКМ — замах мечом; в слоте ПЗРК ПКМ работает как прицеливание.
    if (this.input.wasMousePressed(2) && this.slot !== 'pzrk') this._startMelee();

    if (
      this.hasBolter &&
      this.slot === 'bolter' &&
      !this.reloading &&
      this.fireTimer <= 0 &&
      this.input.isMouseDown(0)
    ) {
      this._fireBolter();
    }
  }

  // -------------------------------------------------------------------------
  // Болтер
  // -------------------------------------------------------------------------

  _fireBolter() {
    if (!this.hasBolter) return;

    if (this.magazine <= 0) {
      this.fireTimer = 0.3;
      this.audio.playUiClick();
      this.hud.toast('Магазин пуст. Нажмите R для перезарядки.', 1600);
      return;
    }

    this.magazine -= 1;
    this.fireTimer = 60 / CONFIG.weapons.bolter.rpm;
    this.kick = Math.min(0.12, this.kick + 0.05);

    this.audio.playShot();
    this.player.addRecoil(CONFIG.weapons.bolter.recoil);
    this.player.addShake(0.1, 0.12);
    this._showMuzzleFlash();

    if (this.onShot) {
      const muzzle = this.bolter.userData.muzzle;
      if (muzzle) {
        this.camera.updateMatrixWorld(true);
        const worldPosition = new THREE.Vector3();
        muzzle.getWorldPosition(worldPosition);
        this.onShot(worldPosition);
      }
    }

    this._hitscan(CONFIG.weapons.bolter.damage, CONFIG.weapons.bolter.range, 'bolter');
    this._emitNoise(15);
    this._updateHud();
  }

  _startReload() {
    if (!this.hasBolter) return;
    if (this.reloading) return;
    if (this.magazine >= CONFIG.weapons.bolter.magSize) return;
    if (this.reserve <= 0) {
      this.hud.toast('Нет патронов в резерве.', 1600);
      return;
    }

    if (this.slot !== 'bolter') this.setSlot('bolter');

    this.reloading = true;
    this.reloadTimer = 0;
    this.reloadAmmoGiven = false;
    this.audio.playReload();
  }

  _showMuzzleFlash() {
    if (this.muzzleFlash) {
      this.muzzleFlash.visible = true;
      const scale = 0.8 + Math.random() * 0.6;
      this.muzzleFlash.scale.setScalar(scale);
      this.muzzleFlash.rotation.z = Math.random() * Math.PI;
    }
    if (this.muzzleLight) {
      this.muzzleLight.intensity = 3.0;
    }
    this.flashTimer = 0.06;
  }

  // -------------------------------------------------------------------------
  // Цепной меч
  // -------------------------------------------------------------------------

  _startMelee() {
    if (!this.hasChainsword) return;
    if (this.meleeCooldown > 0 || this.swinging) return;

    this.meleeCooldown = CONFIG.weapons.chainsword.cooldown;
    this.swinging = true;
    this.swingElapsed = 0;
    this.swingHitDone = false;

    this.tempMelee = this.slot !== 'chainsword';
    // Переводим руки и видимость оружия в боевую стойку меча целиком,
    // чтобы от болтера не оставалось «висящих» элементов.
    this._applyOwnership();

    this.audio.playMelee();
    this._emitNoise(8);
  }

  // -------------------------------------------------------------------------
  // Гранаты
  // -------------------------------------------------------------------------

  _throwGrenade() {
    if (!this.hasGrenades) return;
    if (this.grenadeCooldown > 0) return;

    if (this.grenades <= 0) {
      this.hud.toast('Гранат не осталось.', 1500);
      return;
    }

    this.grenades -= 1;
    this.grenadeCooldown = 0.7;
    this.grenadeViewTimer = 0.35;

    const origin = this.player.getEyePosition(new THREE.Vector3());
    const direction = this.player.getLookDirection(new THREE.Vector3());

    const mesh = makeGrenade();
    mesh.scale.setScalar(1.15);
    mesh.position.copy(origin).addScaledVector(direction, 0.55);
    this.scene.add(mesh);

    const velocity = direction.clone().multiplyScalar(CONFIG.weapons.grenade.throwSpeed);
    velocity.y += 4.2; // параболический бросок

    this.projectiles.push({
      mesh,
      velocity,
      fuse: CONFIG.weapons.grenade.fuse
    });

    this.audio.playGrenade();
    this._updateHud();
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.fuse -= dt;

      projectile.velocity.y -= CONFIG.weapons.grenade.gravity * dt;
      projectile.mesh.position.addScaledVector(projectile.velocity, dt);
      projectile.mesh.rotation.x += dt * 7;
      projectile.mesh.rotation.z += dt * 4;

      // Пол.
      if (projectile.mesh.position.y < 0.08) {
        projectile.mesh.position.y = 0.08;
        projectile.velocity.y = Math.abs(projectile.velocity.y) * 0.28;
        projectile.velocity.x *= 0.55;
        projectile.velocity.z *= 0.55;
      }

      // Стены: мягкий отскок.
      if (this.colliders && this.colliders.isBlocked(projectile.mesh.position.x, projectile.mesh.position.z, 0.08)) {
        projectile.velocity.x *= -0.35;
        projectile.velocity.z *= -0.35;
        projectile.mesh.position.x -= projectile.velocity.x * dt * 2;
        projectile.mesh.position.z -= projectile.velocity.z * dt * 2;
      }

      if (projectile.fuse <= 0) {
        this._explode(projectile.mesh.position.clone());
        this.scene.remove(projectile.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _explode(center) {
    const cfg = CONFIG.weapons.grenade;

    this.audio.playExplosion();
    this.player.addShake(0.8, 0.5);
    this._emitNoise(30, center);
    this._spawnExplosionVisual(center);

    const targetPosition = new THREE.Vector3();

    for (const target of this.targets) {
      if (!target.visible) continue;
      target.updateWorldMatrix(true, true);
      target.getWorldPosition(targetPosition);
      targetPosition.y += 1.0;

      const distance = targetPosition.distanceTo(center);
      if (distance > cfg.radius) continue;

      const damage = cfg.edgeDamage + (cfg.damage - cfg.edgeDamage) * (1 - distance / cfg.radius);
      target.userData.damageable?.takeDamage(damage, center, new THREE.Vector3(0, 1, 0));
    }

    // Дружественный огонь: граната ранит и игрока.
    const playerCenter = this.player.position.clone();
    playerCenter.y += 1.0;
    const playerDistance = playerCenter.distanceTo(center);

    if (playerDistance <= cfg.radius) {
      const damage = cfg.edgeDamage + (cfg.damage - cfg.edgeDamage) * (1 - playerDistance / cfg.radius);
      this.player.takeDamage(damage, 'grenade');
    }

    this.onExplosion?.(center);
  }

  // Визуал взрыва: сфера, свет и осколки. Живёт в списке effects,
  // обновляется и освобождается в _updateEffects().
  _spawnExplosionVisual(center) {
    const group = new THREE.Group();
    group.name = 'grenade-explosion';
    group.position.copy(center);
    this.scene.add(group);

    const sphereGeometry = new THREE.SphereGeometry(1, 16, 12);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb060,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.scale.setScalar(0.4);
    sphere.renderOrder = 6;
    group.add(sphere);

    const light = new THREE.PointLight(0xff8a2a, 9, 20, 2);
    light.position.set(0, 0.4, 0);
    light.castShadow = false;
    group.add(light);

    // Осколки/комья земли: маленькие тёмные сферы с разлётом.
    const debrisGeometry = new THREE.SphereGeometry(0.09, 6, 5);
    const debrisMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2622,
      roughness: 1.0,
      metalness: 0.05
    });

    const debris = [];
    const count = 12;
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(debrisGeometry, debrisMaterial);
      const angle = Math.random() * Math.PI * 2;
      const spread = 0.2 + Math.random() * 0.35;
      mesh.position.set(
        Math.cos(angle) * spread * 0.4,
        0.1 + Math.random() * 0.25,
        Math.sin(angle) * spread * 0.4
      );
      const baseScale = 0.6 + Math.random() * 1.1;
      mesh.scale.setScalar(baseScale);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      group.add(mesh);

      debris.push({
        mesh,
        baseScale,
        velocity: new THREE.Vector3(
          Math.cos(angle) * (2 + Math.random() * 4),
          3 + Math.random() * 5,
          Math.sin(angle) * (2 + Math.random() * 4)
        )
      });
    }

    this.effects.push({
      group,
      sphere,
      sphereGeometry,
      sphereMaterial,
      light,
      debris,
      debrisGeometry,
      debrisMaterial,
      age: 0,
      duration: 1.0,
      groundY: -center.y + 0.05
    });
  }

  _updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      effect.age += dt;

      if (effect.age <= 0.3) {
        const p = effect.age / 0.3;
        effect.sphere.visible = true;
        effect.sphere.scale.setScalar(0.4 + p * 6.0);
        effect.sphereMaterial.opacity = 0.9 * (1 - p);
      } else {
        effect.sphere.visible = false;
      }

      effect.light.intensity = Math.max(0, 9 * (1 - effect.age / 0.45));

      for (const item of effect.debris) {
        item.velocity.y -= 12 * dt;
        item.mesh.position.addScaledVector(item.velocity, dt);

        if (item.mesh.position.y < effect.groundY) {
          item.mesh.position.y = effect.groundY;
          item.velocity.y = Math.abs(item.velocity.y) * 0.32;
          item.velocity.x *= 0.68;
          item.velocity.z *= 0.68;
        }

        item.mesh.rotation.x += dt * 9;
        item.mesh.rotation.z += dt * 6;

        const shrink = Math.max(0, 1 - effect.age / effect.duration);
        item.mesh.scale.setScalar(Math.max(0.001, item.baseScale * shrink));
      }

      if (effect.age >= effect.duration) {
        this.scene.remove(effect.group);
        effect.sphereGeometry.dispose();
        effect.sphereMaterial.dispose();
        effect.debrisGeometry.dispose();
        effect.debrisMaterial.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  _clearEffects() {
    for (const effect of this.effects) {
      this.scene.remove(effect.group);
      effect.sphereGeometry.dispose();
      effect.sphereMaterial.dispose();
      effect.debrisGeometry.dispose();
      effect.debrisMaterial.dispose();
    }
    this.effects = [];
  }

  // -------------------------------------------------------------------------
  // ПЗРК: прицеливание, захват и ракета
  // -------------------------------------------------------------------------

  _setAiming(active) {
    const next = Boolean(active);
    if (this.aiming === next) {
      if (!next && Math.abs(this.camera.fov - this.baseFov) > 0.01) {
        this.camera.fov = this.baseFov;
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    this.aiming = next;
    if (!next) {
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
  }

  _updateFov(dt) {
    const target = this.aiming ? this.aimFov : this.baseFov;
    if (Math.abs(this.camera.fov - target) < 0.01) return;

    this.camera.fov += (target - this.camera.fov) * Math.min(1, dt * 12);
    this.camera.updateProjectionMatrix();
  }

  _cancelLock() {
    this.lockTarget = null;
    this.lockTimer = 0;
    this.locked = false;
    this.lockBeepTimer = 0;
    this.hud?.setLock(0, false);
  }

  _updatePzrk(dt) {
    if (!this.active || this.slot !== 'pzrk' || !this.hasLauncher) {
      if (this.aiming) this._setAiming(false);
      if (this.locked || this.lockTarget) this._cancelLock();
      return;
    }

    const aiming = this.input.isMouseDown(2);
    this._setAiming(aiming);

    if (!aiming) {
      if (this.locked || this.lockTarget) this._cancelLock();
      return;
    }

    // Уже захваченная цель: держим красный квадрат и ждём пуска.
    if (this.locked && this.lockTarget) {
      const health = this.lockTarget.userData?.damageable?.health ?? 0;
      if (!this.lockTarget.parent || health <= 0) {
        this._cancelLock();
        return;
      }

      this.hud?.setLock(1, true);
      if (this.launcherCooldown <= 0 && this.input.wasMousePressed(0)) {
        this._launchMissile();
      }
      return;
    }

    // Ищем истребитель в центре экрана.
    this.camera.updateMatrixWorld(true);
    for (const target of this.targets) target.updateWorldMatrix(true, true);

    const origin = this.player.getEyePosition(this._tmpVec);
    const direction = this.player.getLookDirection(this._tmpVec2);

    this.raycaster.set(origin, direction);
    this.raycaster.far = 400;

    const hits = this.raycaster.intersectObjects([...this.targets], true);
    const root = hits.length > 0 ? this._findDamageable(hits[0].object) : null;
    const isFighter =
      root &&
      root.userData?.kind === 'ork-fighter' &&
      (root.userData?.damageable?.health ?? 0) > 0;

    if (!isFighter) {
      this.lockTarget = null;
      this.lockTimer = 0;
      this.locked = false;
      this.hud?.setLock(0, false);
      return;
    }

    if (this.lockTarget !== root) {
      this.lockTarget = root;
      this.lockTimer = 0;
    }

    this.lockTimer += dt;

    if (this.lockBeepTimer <= 0) {
      this.audio.playLockBeep();
      this.lockBeepTimer = 0.16;
    }

    if (this.lockTimer >= 1.0) {
      this.locked = true;
      this.audio.playLockAcquired();
      this.hud?.setLock(1, true);
    } else {
      this.hud?.setLock(this.lockTimer, false);
    }
  }

  _createMissileMesh() {
    const group = new THREE.Group();
    group.name = 'pzrk-missile';

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b6b70,
      roughness: 0.45,
      metalness: 0.8
    });
    const noseMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3a1a,
      emissive: 0xff2a08,
      emissiveIntensity: 2.2,
      roughness: 0.4
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb060,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    // Корпус вдоль -Z.
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 12), bodyMaterial);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 12), noseMaterial);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -0.33;
    group.add(nose);

    // Сопло и выхлоп.
    const exhaust = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.3, 10), glowMaterial);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.z = 0.38;
    group.add(exhaust);

    const light = new THREE.PointLight(0xff7a2a, 3, 8, 2);
    light.position.z = 0.35;
    light.castShadow = false;
    group.add(light);

    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    return group;
  }

  _launchMissile() {
    if (!this.lockTarget || this.launcherCooldown > 0) return;

    this.launcherCooldown = 1.6;

    const origin = this.player.getEyePosition(new THREE.Vector3());
    const direction = this.player.getLookDirection(new THREE.Vector3());
    const start = origin.clone().addScaledVector(direction, 0.9);
    start.y -= 0.06;

    const mesh = this._createMissileMesh();
    mesh.position.copy(start);
    this.scene.add(mesh);

    const targetPos = new THREE.Vector3();
    this.lockTarget.getWorldPosition(targetPos);
    const initialDirection = targetPos.clone().sub(start).normalize();

    this.missiles.push({
      mesh,
      direction: initialDirection,
      speed: 55,
      life: 7,
      target: this.lockTarget
    });

    this.audio.playRocketLaunch();
    this._cancelLock();
  }

  _updateMissiles(dt) {
    for (let i = this.missiles.length - 1; i >= 0; i -= 1) {
      const missile = this.missiles[i];
      missile.life -= dt;

      let targetPos = null;
      const targetHealth = missile.target?.userData?.damageable?.health ?? 0;
      if (missile.target?.parent && targetHealth > 0) {
        targetPos = missile.target.getWorldPosition(this._tmpVec);
        const desired = this._tmpVec2.copy(targetPos).sub(missile.mesh.position).normalize();
        missile.direction.lerp(desired, Math.min(1, dt * 4.5)).normalize();
      }

      missile.mesh.position.addScaledVector(missile.direction, missile.speed * dt);
      // У модели ракеты нос смотрит в -Z, поэтому +Z lookAt направляем назад.
      missile.mesh.lookAt(
        missile.mesh.position.x - missile.direction.x,
        missile.mesh.position.y - missile.direction.y,
        missile.mesh.position.z - missile.direction.z
      );

      const distance = targetPos ? missile.mesh.position.distanceTo(targetPos) : Infinity;

      if (distance <= 2.4 || missile.life <= 0) {
        if (missile.target?.userData?.damageable && targetHealth > 0) {
          missile.target.userData.damageable.takeDamage(
            9999,
            missile.mesh.position.clone(),
            missile.direction
          );
        }

        this._spawnExplosionVisual(missile.mesh.position.clone());
        this.audio.playExplosion();
        this.scene.remove(missile.mesh);
        this._disposeMissile(missile.mesh);
        this.missiles.splice(i, 1);
      }
    }
  }

  _disposeMissile(mesh) {
    mesh.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material?.dispose?.();
    });
  }

  _clearMissiles() {
    for (const missile of this.missiles) {
      this.scene.remove(missile.mesh);
      this._disposeMissile(missile.mesh);
    }
    this.missiles = [];
  }

  // -------------------------------------------------------------------------
  // Хитскан
  // -------------------------------------------------------------------------

  // Источник шума для ИИ: позиция игрока (или центр взрыва).
  _emitNoise(radius = 15, position = null) {
    if (!this.onNoise) return;
    const source = position ? position.clone() : this.player.getEyePosition(new THREE.Vector3());
    this.onNoise(source, radius);
  }

  _hitscan(damage, range, source = 'bolter') {
    // Матрицы камеры и целей могли ещё не обновиться в текущем кадре
    // (первый выстрел сразу после телепорта/сброса состояния).
    this.camera.updateMatrixWorld(true);
    for (const target of this.targets) target.updateWorldMatrix(true, true);

    const origin = this.player.getEyePosition(new THREE.Vector3());
    const direction = this.player.getLookDirection(new THREE.Vector3());

    let maxDistance = range;
    if (this.colliders) {
      const wall = this.colliders.raycast(origin, direction, range);
      if (wall) maxDistance = Math.min(maxDistance, wall.distance);
    }

    this.raycaster.set(origin, direction);
    this.raycaster.far = maxDistance;

    const hits = this.raycaster.intersectObjects([...this.targets], true);
    if (hits.length === 0) return false;

    const hit = hits[0];
    const root = this._findDamageable(hit.object);
    if (!root) return false;

    console.log(
      `[Weapons] Hitscan (${source}): попал в "${hit.object.name || hit.object.type}", ` +
      `корень "${root.name || root.type}", урон ${damage}`
    );

    root.userData.damageable.takeDamage(damage, hit.point, direction);
    this.hud.showHitmarker();
    this.audio.playHit();
    // Колбэк попадания: цель, урон, тип оружия и точка попадания.
    this.onHit?.(root, damage, source, hit.point);
    return true;
  }

  _findDamageable(object) {
    let current = object;
    while (current) {
      if (current.userData?.damageable) return current;
      current = current.parent;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Анимации
  // -------------------------------------------------------------------------

  _updateAnimations(dt) {
    this.kick *= Math.exp(-14 * dt);

    // Покачивание оружия в такт движению игрока.
    const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    const speedFactor = Math.min(1, speed / CONFIG.player.walkSpeed);
    const bobY = Math.sin(this.time * 9) * 0.004 * speedFactor;
    const bobX = Math.cos(this.time * 4.5) * 0.005 * speedFactor;
    const idleY = Math.sin(this.time * 1.7) * 0.0022;
    const idleX = Math.cos(this.time * 1.3) * 0.003;

    // Анимация перезарядки: уход вниз / смена магазина / возврат.
    let reloadY = 0;
    let reloadPitch = 0;
    let magazineDrop = 0;

    if (this.reloading) {
      const t = this.reloadTimer;

      if (t < 0.5) {
        const k = easeInOut(t / 0.5);
        reloadY = -0.16 * k;
        reloadPitch = 0.32 * k;
      } else if (t < 1.5) {
        reloadY = -0.16;
        reloadPitch = 0.32;
        const p = t - 0.5;
        magazineDrop = -0.26 * Math.sin((p / 1.0) * Math.PI);
        if (this.magazineMesh) this.magazineMesh.visible = p < 0.3 || p > 0.62;
      } else {
        const k = easeInOut((t - 1.5) / 0.5);
        reloadY = -0.16 * (1 - k);
        reloadPitch = 0.32 * (1 - k);
        if (this.magazineMesh) this.magazineMesh.visible = true;
      }
    } else if (this.magazineMesh) {
      this.magazineMesh.visible = true;
    }

    if (this.magazineMesh) {
      this.magazineMesh.position.y = this.magazineBaseY + magazineDrop;
    }

    this.viewRoot.position.set(
      idleX + bobX,
      idleY + bobY + reloadY + this.kick * 0.08,
      this.kick * 0.32
    );
    this.viewRoot.rotation.set(reloadPitch + this.kick * 0.5, 0, 0);

    // Граната в руке.
    if (this.grenadeViewTimer > 0) {
      this.grenadeViewTimer -= dt;
      const p = 1 - this.grenadeViewTimer / 0.35;
      this.grenadeView.visible = true;
      this.grenadeView.position.set(-0.26 + p * 0.06, -0.28 + p * 0.2, -0.5 - p * 0.12);
      this.grenadeView.rotation.set(p * 1.4, p * 0.6, 0);
    } else {
      this.grenadeView.visible = false;
    }

    // Замах цепного меча.
    if (this.swinging) {
      const p = clamp(this.swingElapsed / CONFIG.weapons.chainsword.swingTime, 0, 1);
      const arc = Math.sin(p * Math.PI);

      this.chainsword.position.set(
        this.chainswordBasePosition.x - arc * 0.3,
        this.chainswordBasePosition.y + arc * 0.08,
        this.chainswordBasePosition.z - arc * 0.14
      );
      this.chainsword.rotation.set(
        this.chainswordBaseRotation.x,
        this.chainswordBaseRotation.y - arc * 0.45,
        this.chainswordBaseRotation.z + arc * 1.25
      );
    } else {
      this.chainsword.position.copy(this.chainswordBasePosition);
      this.chainsword.rotation.copy(this.chainswordBaseRotation);
    }

    // «Бегущая» цепь.
    if (this.chainsword.visible && this.chainLinks.length > 0) {
      const step = 0.036;
      const count = this.chainLinks.length;
      this.chainOffset = (this.chainOffset + dt * 0.45) % step;

      for (let i = 0; i < count; i += 1) {
        const link = this.chainLinks[i];
        let z = this.chainBaseZ[i] + this.chainOffset;
        const first = this.chainBaseZ[0];
        const last = this.chainBaseZ[count - 1];
        if (z > first) z -= Math.abs(first - last) + step;
        link.position.z = z;
      }
    }
  }

  // -------------------------------------------------------------------------
  // HUD и очистка
  // -------------------------------------------------------------------------

  _updateHud() {
    if (this.slot === 'pzrk') {
      this.hud.setAmmo('∞', '∞');
      this.hud.setWeapon('ПЗРК');
      this.hud.setGrenades(this.grenades);
      return;
    }

    this.hud.setAmmo(this.magazine, this.reserve);
    this.hud.setGrenades(this.grenades);
    this.hud.setWeapon(this.slot === 'bolter' ? 'Болтер' : 'Цепной меч');
  }

  _clearProjectiles() {
    for (const projectile of this.projectiles) {
      this.scene.remove(projectile.mesh);
    }
    this.projectiles = [];
    this._clearEffects();
  }
}
