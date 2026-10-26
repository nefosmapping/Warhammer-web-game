// Дешёвые партиклы из пула: кровь при попадании и дым из ствола.
// Один Points на систему, позиции обновляются вручную, без new Mesh на выстрел.

import * as THREE from 'three';

const MAX_BLOOD = 120;
const MAX_SMOKE = 80;

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;

    this.blood = this._createPool({
      count: MAX_BLOOD,
      color: 0x9a1212,
      size: 0.09,
      opacity: 0.9,
      gravity: -9.5,
      life: [0.25, 0.55],
      speed: [1.5, 4.5],
      rise: 0
    });

    this.smoke = this._createPool({
      count: MAX_SMOKE,
      color: 0x8a8a7a,
      size: 0.22,
      opacity: 0.35,
      additive: true,
      gravity: 0.4,
      life: [0.5, 1.1],
      speed: [0.15, 0.6],
      rise: 0.9
    });
  }

  _createPool({ count, color, size, opacity, additive = false, gravity, life, speed, rise }) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) positions[i * 3 + 1] = -999;

    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(positions, 3);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', attribute);

    const material = new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity,
      depthWrite: false,
      sizeAttenuation: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.scene.add(points);

    const particles = [];
    for (let i = 0; i < count; i += 1) {
      particles.push({ life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0 });
    }

    return {
      geometry,
      attribute,
      positions,
      particles,
      cursor: 0,
      gravity,
      lifeRange: life,
      speedRange: speed,
      rise
    };
  }

  spawnBlood(position, count = 8) {
    this._burst(this.blood, position, count, true);
  }

  spawnSmoke(position, count = 3) {
    this._burst(this.smoke, position, count, false);
  }

  _burst(pool, position, count, spherical) {
    if (!position) return;

    for (let i = 0; i < count; i += 1) {
      const index = pool.cursor;
      pool.cursor = (pool.cursor + 1) % pool.particles.length;

      const particle = pool.particles[index];
      const speed = this._range(pool.speedRange);

      // Кровь — во все стороны, дым — вверх с небольшим разбросом.
      const dx = spherical ? Math.random() * 2 - 1 : (Math.random() - 0.5) * 0.5;
      const dz = spherical ? Math.random() * 2 - 1 : (Math.random() - 0.5) * 0.5;
      const dy = spherical ? Math.random() * 0.8 : 0.4;

      particle.vx = dx * speed;
      particle.vy = dy * speed + pool.rise;
      particle.vz = dz * speed;
      particle.maxLife = this._range(pool.lifeRange);
      particle.life = particle.maxLife;

      pool.positions[index * 3] = position.x + (Math.random() - 0.5) * 0.15;
      pool.positions[index * 3 + 1] = position.y + (Math.random() - 0.5) * 0.15;
      pool.positions[index * 3 + 2] = position.z + (Math.random() - 0.5) * 0.15;
    }

    pool.attribute.needsUpdate = true;
  }

  _range([min, max]) {
    return min + Math.random() * (max - min);
  }

  update(dt) {
    this._updatePool(this.blood, dt);
    this._updatePool(this.smoke, dt);
  }

  _updatePool(pool, dt) {
    const positions = pool.positions;
    let changed = false;

    for (let i = 0; i < pool.particles.length; i += 1) {
      const particle = pool.particles[i];
      if (particle.life <= 0) continue;

      particle.life -= dt;
      if (particle.life <= 0) {
        positions[i * 3 + 1] = -999;
        changed = true;
        continue;
      }

      particle.vy += pool.gravity * dt;

      positions[i * 3] += particle.vx * dt;
      positions[i * 3 + 1] += particle.vy * dt;
      positions[i * 3 + 2] += particle.vz * dt;

      // Гасим горизонтальную скорость, чтобы кровь не улетала слишком далеко.
      particle.vx *= 1 - Math.min(0.9, dt * 3);
      particle.vz *= 1 - Math.min(0.9, dt * 3);

      if (positions[i * 3 + 1] < 0.02) {
        positions[i * 3 + 1] = 0.02;
        particle.vy = 0;
      }

      changed = true;
    }

    if (changed) pool.attribute.needsUpdate = true;
  }
}
