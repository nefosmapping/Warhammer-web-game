// Фоновые воздушные бои высоко над полем боя.
// — Одиночные «Валькирии» occasionally пролетают по прямой (y 40–60).
// — С шансом 10% разыгрывается догфайт: «Валькирия» гонится за орочьим
//   истребителем, оба летят по кругу и стреляют друг в друга трассерами.
// Никаких внешних ассетов: всё процедурное, на кубах и примитивах.

import * as THREE from 'three';
import { makeValkyrie, disposeValkyrie } from './models/valkyrie.js';

const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();

function buildOrkFighter() {
  const group = new THREE.Group();
  group.name = 'ork-fighter';

  const materials = {
    hull: new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.75, metalness: 0.55 }),
    plate: new THREE.MeshStandardMaterial({ color: 0x9e2a24, roughness: 0.7, metalness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6, metalness: 0.7 }),
    glow: new THREE.MeshStandardMaterial({
      color: 0xff6b2b,
      emissive: 0xff3a08,
      emissiveIntensity: 3.0,
      roughness: 0.4
    })
  };

  const addBox = (w, h, d, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    group.add(mesh);
    return mesh;
  };

  // Корпус и нос (нос смотрит в -Z, как у «Валькирии»).
  addBox(1.5, 1.0, 4.4, materials.hull, 0, 0, 0);
  addBox(0.7, 0.6, 1.4, materials.dark, 0, 0, -2.6);
  addBox(0.5, 0.4, 0.8, materials.plate, 0, 0.35, -2.1);

  // Крылья и законцовки.
  addBox(5.2, 0.18, 1.3, materials.hull, 0, 0, -0.2);
  for (const side of [-1, 1]) {
    addBox(1.2, 0.5, 1.1, materials.plate, side * 2.5, 0.05, -0.2);
    // Грубые орочьи «зубы» на законцовках.
    for (let i = 0; i < 3; i += 1) {
      addBox(0.12, 0.5, 0.12, materials.dark, side * (2.0 + i * 0.3), 0.35, 0.3, 0, 0, side * 0.35);
    }
    // Двигатель.
    addBox(0.6, 0.6, 1.8, materials.dark, side * 1.0, -0.25, 1.2);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.18), materials.glow);
    glow.position.set(side * 1.0, -0.25, 2.1);
    group.add(glow);
  }

  // Хвост.
  addBox(2.2, 0.14, 0.9, materials.hull, 0, 0.1, 2.0);
  addBox(0.16, 0.9, 0.8, materials.plate, 0, 0.6, 2.2);
  addBox(0.12, 0.5, 0.5, materials.dark, 0.7, 0.35, 2.2);

  // Кабина-«морда» и клыки.
  addBox(0.8, 0.55, 1.0, materials.dark, 0, 0.45, -1.4);
  addBox(0.12, 0.3, 0.12, materials.plate, -0.3, 0.8, -1.5, 0, 0, 0.4);
  addBox(0.12, 0.3, 0.12, materials.plate, 0.3, 0.8, -1.5, 0, 0, -0.4);

  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });

  return { group, materials };
}

export class AerialWar {
  constructor({ scene, weapons = null }) {
    this.scene = scene;
    this.weapons = weapons;
    this.time = 0;
    this.spawnTimer = 4 + Math.random() * 5;
    this.maxAircraft = 8;

    this.aircraft = [];
    this.tracers = [];
    // Дым от падающих истребителей.
    this.smokePuffs = [];

    this.rng = Math.random;
  }

  // -------------------------------------------------------------------------
  // Спавн
  // -------------------------------------------------------------------------

  // Фоновые самолёты не участвуют в карте теней: они высоко и далеко,
  // а каждый shadow caster при CSM стоит лишнего прохода.
  _prepareAirModel(model) {
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });
  }

  spawnFlyby() {
    if (this.aircraft.length >= this.maxAircraft) return;

    const model = makeValkyrie({ scale: 0.55 });
    this._prepareAirModel(model);
    // Летим с одной стороны карты в другую, высоко над полем боя.
    const direction = new THREE.Vector3(
      (this.rng() < 0.5 ? -1 : 1),
      (this.rng() - 0.5) * 0.06,
      (this.rng() - 0.5) * 0.8
    ).normalize();

    const altitude = 40 + this.rng() * 20;
    const start = new THREE.Vector3(
      -direction.x * (70 + this.rng() * 30),
      altitude,
      (this.rng() - 0.5) * 70
    );

    model.position.copy(start);
    model.rotation.y = Math.atan2(-direction.x, -direction.z);
    model.rotation.z = (this.rng() - 0.5) * 0.18;
    this.scene.add(model);

    this.aircraft.push({
      kind: 'flyby',
      model,
      direction,
      speed: 22 + this.rng() * 10,
      phase: this.rng() * Math.PI * 2,
      bank: model.rotation.z,
      travel: 0
    });

    // Дымный след двигателей: пара точек позади.
    this._spawnTrail(model, 0x6a6a66, 3);
  }

  spawnDogfight() {
    if (this.aircraft.length + 2 > this.maxAircraft) return;

    const center = new THREE.Vector3(
      (this.rng() - 0.5) * 70,
      44 + this.rng() * 14,
      (this.rng() - 0.5) * 70
    );
    const radius = 18 + this.rng() * 12;
    const angle = this.rng() * Math.PI * 2;
    const angularSpeed = 0.46 + this.rng() * 0.22;
    const direction = this.rng() < 0.5 ? 1 : -1;

    const valkyrie = makeValkyrie({ scale: 0.52 });
    this._prepareAirModel(valkyrie);
    valkyrie.position.copy(center);
    this.scene.add(valkyrie);

    const fighterData = buildOrkFighter();
    fighterData.group.position.copy(center);
    this.scene.add(fighterData.group);

    const pair = {
      kind: 'dogfight',
      center,
      radius,
      baseAngle: angle,
      angle,
      angularSpeed: angularSpeed * direction,
      direction,
      valkyrie,
      fighter: fighterData.group,
      fighterMaterials: fighterData.materials,
      fireTimer: 0.4,
      fireSide: 0,
      // Догфайт разыгрывается ограниченное время, затем улетает прочь.
      lifetime: 24 + this.rng() * 18,

      // Сбиваемый истребитель: ~полтора магазина болтера.
      fighterHealth: 1200,
      fighterMaxHealth: 1200,
      fighterDead: false,
      fighterLight: null,
      smokeTimer: 0,
      fallVelocity: new THREE.Vector3(),
      escaping: false,
      escapeDir: new THREE.Vector3(),
      escapeSpeed: 0
    };

    // Регистрируем истребитель как цель для стрельбы игрока.
    fighterData.group.userData.kind = 'ork-fighter';
    fighterData.group.userData.damageable = {
      health: pair.fighterHealth,
      maxHealth: pair.fighterMaxHealth,
      takeDamage: (amount) => this._damageFighter(pair, amount)
    };
    this.weapons?.addTarget(fighterData.group);

    // Обе машины — разные записи, чтобы общий апдейт был единообразным.
    this.aircraft.push(
      { kind: 'dogfight-member', pair, role: 'valkyrie', model: valkyrie },
      { kind: 'dogfight-member', pair, role: 'fighter', model: fighterData.group }
    );
  }

  _damageFighter(pair, amount) {
    if (!pair || pair.fighterDead) return;

    pair.fighterHealth = Math.max(0, pair.fighterHealth - amount);
    if (pair.fighter.userData.damageable) {
      pair.fighter.userData.damageable.health = pair.fighterHealth;
    }

    if (pair.fighterHealth <= 0) this._destroyFighter(pair);
  }

  _destroyFighter(pair) {
    pair.fighterDead = true;
    pair.lifetime = Math.max(pair.lifetime, 7);
    this.weapons?.removeTarget(pair.fighter);

    // Оранжевый пожар на борту.
    const light = new THREE.PointLight(0xff6a1a, 7, 26, 2);
    light.position.set(0, 0.2, 0);
    light.castShadow = false;
    pair.fighter.add(light);
    pair.fighterLight = light;

    // Резкая потеря высоты и кувыркание.
    pair.fallVelocity.set(
      (this.rng() - 0.5) * 5,
      -3,
      (this.rng() - 0.5) * 5
    );

    // «Валькирия» выравнивается и уходит вдаль.
    pair.escaping = true;
    pair.escapeDir.set(
      this.rng() * 2 - 1,
      0.12 + this.rng() * 0.1,
      this.rng() * 2 - 1
    ).normalize();
    pair.escapeSpeed = 38;
    pair.smokeTimer = 0;
  }

  // -------------------------------------------------------------------------
  // Трассеры и следы
  // -------------------------------------------------------------------------

  _spawnTracer(from, to, color = 0xffd266) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      from.clone(),
      to.clone()
    ]);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    line.renderOrder = 5;
    this.scene.add(line);

    this.tracers.push({ line, life: 0.14, maxLife: 0.14 });
  }

  _spawnTrail(model, color, count) {
    // Короткая серия точек позади двигателей, быстро гаснущая.
    for (let i = 0; i < count; i += 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        model.position.clone(),
        model.position.clone().add(new THREE.Vector3(0, 0, 1.2))
      ]);
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        depthWrite: false
      });
      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0.5 + i * 0.1, maxLife: 0.5 + i * 0.1 });
    }
  }

  // Позиция дульного маркера самолёта в мире.
  _getGunPosition(model, markerName, fallback) {
    const marker = model.getObjectByName(markerName);
    if (marker) {
      model.updateMatrixWorld(true);
      marker.getWorldPosition(_tmpA);
      return _tmpA.clone();
    }
    return model.localToWorld(fallback.clone());
  }

  // -------------------------------------------------------------------------
  // Обновление
  // -------------------------------------------------------------------------

  update(dt) {
    this.time += dt;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      if (this.rng() < 0.1) this.spawnDogfight();
      else this.spawnFlyby();
      this.spawnTimer = 8 + this.rng() * 12;
    }

    this._ensureTargets();
    this._updateFlybys(dt);
    this._updateDogfights(dt);
    this._updateSmoke(dt);
    this._updateTracers(dt);
  }

  // После clearTargets() на смене уровня возвращаем живые истребители
  // в список целей оружия игрока.
  _ensureTargets() {
    if (!this.weapons) return;

    for (const craft of this.aircraft) {
      if (craft.kind !== 'dogfight-member' || craft.role !== 'fighter') continue;
      const pair = craft.pair;
      if (pair.fighterDead) continue;
      if ((pair.fighterHealth ?? 0) <= 0) continue;
      if (!this.weapons.targets.has(pair.fighter)) {
        this.weapons.addTarget(pair.fighter);
      }
    }
  }

  _updateFlybys(dt) {
    for (let i = this.aircraft.length - 1; i >= 0; i -= 1) {
      const craft = this.aircraft[i];
      if (craft.kind !== 'flyby') continue;

      craft.travel += craft.speed * dt;
      craft.model.position.addScaledVector(craft.direction, craft.speed * dt);

      // Лёгкое покачивание и крен.
      craft.model.rotation.z = craft.bank + Math.sin(this.time * 0.8 + craft.phase) * 0.06;
      craft.model.rotation.x = Math.sin(this.time * 0.6 + craft.phase) * 0.03;

      // Дымный след раз в ~0.4 с.
      if (Math.random() < dt * 2.2) this._spawnTrail(craft.model, 0x5a5a56, 1);

      if (craft.travel > 220) {
        this.scene.remove(craft.model);
        disposeValkyrie(craft.model);
        this.aircraft.splice(i, 1);
      }
    }
  }

  _updateDogfights(dt) {
    const handled = new Set();
    const expired = new Set();

    for (const craft of this.aircraft) {
      if (craft.kind !== 'dogfight-member') continue;

      const pair = craft.pair;
      if (handled.has(pair)) continue;
      handled.add(pair);

      // Сбитый истребитель падает, «Валькирия» уходит вдаль.
      if (pair.fighterDead) {
        if (this._updateFallingFighter(pair, dt)) expired.add(pair);
        continue;
      }

      pair.lifetime -= dt;
      if (pair.lifetime <= 0) {
        expired.add(pair);
        continue;
      }

      pair.angle += pair.angularSpeed * dt;

      // «Валькирия» идёт по внешнему кругу, орочий истребитель — чуть впереди.
      const valkyrieAngle = pair.angle;
      const fighterAngle = pair.angle + pair.direction * 0.42;

      const valkyriePosition = _tmpA.set(
        pair.center.x + Math.cos(valkyrieAngle) * pair.radius,
        pair.center.y + Math.sin(this.time * 0.7) * 1.6,
        pair.center.z + Math.sin(valkyrieAngle) * pair.radius
      );
      pair.valkyrie.position.copy(valkyriePosition);

      const fighterPosition = _tmpB.set(
        pair.center.x + Math.cos(fighterAngle) * pair.radius * 0.82,
        pair.center.y + Math.sin(this.time * 0.9 + 1.0) * 1.2,
        pair.center.z + Math.sin(fighterAngle) * pair.radius * 0.82
      );
      pair.fighter.position.copy(fighterPosition);

      // Тангаж по касательной к окружности.
      const valkyrieHeading = Math.atan2(
        Math.sin(valkyrieAngle) * pair.direction,
        -Math.cos(valkyrieAngle) * pair.direction
      );
      pair.valkyrie.rotation.y = valkyrieHeading;
      pair.valkyrie.rotation.z = pair.direction * 0.35;

      const fighterHeading = Math.atan2(
        Math.sin(fighterAngle) * pair.direction,
        -Math.cos(fighterAngle) * pair.direction
      );
      pair.fighter.rotation.y = fighterHeading;
      pair.fighter.rotation.z = pair.direction * 0.45;

      // Перестрелка: поочерёдно «Валькирия» → истребитель и обратно.
      pair.fireTimer -= dt;
      if (pair.fireTimer <= 0) {
        if (pair.fireSide === 0) {
          const muzzle = this._getGunPosition(
            pair.valkyrie,
            'gunLeft',
            new THREE.Vector3(-3.2, -1.5, -2)
          );
          this._spawnTracer(muzzle, pair.fighter.position, 0xffe08a);
        } else {
          // Орочий истребитель стреляет «навстречу» из носа.
          pair.fighter.updateMatrixWorld(true);
          const muzzle = pair.fighter.localToWorld(new THREE.Vector3(0, 0, -2.8));
          this._spawnTracer(muzzle, pair.valkyrie.position, 0xff7a2a);
        }

        pair.fireSide = 1 - pair.fireSide;
        pair.fireTimer = 0.12 + Math.random() * 0.18;
      }

      // Орочий двигатель слегка пульсирует.
      const glow = pair.fighterMaterials?.glow;
      if (glow) glow.emissiveIntensity = 2.4 + Math.sin(this.time * 9) * 0.7;
    }

    if (expired.size > 0) this._removePairs(expired);
  }

  // Падение сбитого истребителя и отход «Валькирии».
  _updateFallingFighter(pair, dt) {
    pair.fallVelocity.y -= 9.8 * dt;
    pair.fighter.position.addScaledVector(pair.fallVelocity, dt);

    // Кувыркание.
    pair.fighter.rotation.x += dt * 2.6;
    pair.fighter.rotation.z += dt * 1.7;
    pair.fighter.rotation.y += dt * 0.8;

    if (pair.fighterLight) {
      pair.fighterLight.intensity = 5 + Math.random() * 5;
    }

    // Шлейф чёрного дыма.
    pair.smokeTimer -= dt;
    if (pair.smokeTimer <= 0) {
      this._spawnSmokePuff(pair.fighter.position);
      pair.smokeTimer = 0.045 + this.rng() * 0.05;
    }

    // «Валькирия» выравнивается и улетает по прямой.
    if (pair.escaping) {
      pair.valkyrie.position.addScaledVector(pair.escapeDir, pair.escapeSpeed * dt);
      pair.valkyrie.rotation.y = Math.atan2(-pair.escapeDir.x, -pair.escapeDir.z);
      pair.valkyrie.rotation.x = -0.04;
      pair.valkyrie.rotation.z = 0;
    }

    const fighterDown = pair.fighter.position.y < -30;
    const valkyrieAway = pair.valkyrie.position.length() > 220;
    return fighterDown && valkyrieAway;
  }

  _spawnSmokePuff(position) {
    const geometry = new THREE.SphereGeometry(0.35 + this.rng() * 0.25, 8, 6);
    const material = new THREE.MeshBasicMaterial({
      color: 0x1c1a18,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      position.x + (this.rng() - 0.5) * 1.2,
      position.y + 0.4 + this.rng() * 0.6,
      position.z + (this.rng() - 0.5) * 1.2
    );
    this.scene.add(mesh);

    this.smokePuffs.push({
      mesh,
      geometry,
      material,
      life: 1.2 + this.rng() * 0.9,
      maxLife: 2.1,
      velocity: new THREE.Vector3(
        (this.rng() - 0.5) * 1.6,
        1.4 + this.rng() * 1.6,
        (this.rng() - 0.5) * 1.6
      )
    });
  }

  _updateSmoke(dt) {
    for (let i = this.smokePuffs.length - 1; i >= 0; i -= 1) {
      const puff = this.smokePuffs[i];
      puff.life -= dt;
      puff.mesh.position.addScaledVector(puff.velocity, dt);
      puff.velocity.y += 0.5 * dt;

      const progress = 1 - puff.life / puff.maxLife;
      puff.mesh.scale.setScalar(0.7 + progress * 2.6);
      puff.material.opacity = Math.max(0, (puff.life / puff.maxLife) * 0.6);

      if (puff.life <= 0) {
        this.scene.remove(puff.mesh);
        puff.geometry.dispose();
        puff.material.dispose();
        this.smokePuffs.splice(i, 1);
      }
    }
  }

  _clearSmoke() {
    for (const puff of this.smokePuffs) {
      this.scene.remove(puff.mesh);
      puff.geometry.dispose();
      puff.material.dispose();
    }
    this.smokePuffs = [];
  }

  _removePairs(pairs) {
    for (const pair of pairs) {
      if (!pair.fighterDead) this.weapons?.removeTarget(pair.fighter);
      this.scene.remove(pair.valkyrie);
      disposeValkyrie(pair.valkyrie);
      this.scene.remove(pair.fighter);
      this._disposeGroup(pair.fighter);
    }

    this.aircraft = this.aircraft.filter(
      (craft) => !(craft.kind === 'dogfight-member' && pairs.has(craft.pair))
    );
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
        tracer.line.material.opacity = (tracer.life / tracer.maxLife) * 0.9;
      }
    }
  }

  clear() {
    for (const craft of this.aircraft) {
      if (craft.kind === 'dogfight-member') continue;
      this.scene.remove(craft.model);
      if (craft.kind === 'flyby') disposeValkyrie(craft.model);
    }

    // Убираем уникальные догфайт-модели (пары).
    const pairs = new Set();
    for (const craft of this.aircraft) {
      if (craft.kind === 'dogfight-member') pairs.add(craft.pair);
    }
    for (const pair of pairs) {
      if (!pair.fighterDead) this.weapons?.removeTarget(pair.fighter);
      this.scene.remove(pair.valkyrie);
      disposeValkyrie(pair.valkyrie);
      this.scene.remove(pair.fighter);
      this._disposeGroup(pair.fighter);
    }

    this.aircraft = [];
    this._clearTracers();
    this._clearSmoke();
  }

  _disposeGroup(group) {
    group.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material?.dispose?.();
    });
  }

  _clearTracers() {
    for (const tracer of this.tracers) {
      this.scene.remove(tracer.line);
      tracer.line.geometry.dispose();
      tracer.line.material.dispose();
    }
    this.tracers = [];
  }

  dispose() {
    this.clear();
  }
}
