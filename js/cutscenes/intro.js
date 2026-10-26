// Кат-сцена 1: полёт «Валькирии», вид снаружи и изнутри, попадание ракеты.
// Длительность ~40 с. Все объекты процедурные, внешних ассетов нет.

import * as THREE from 'three';
import { makeTree } from '../models/props.js';
import { disposeObject3D } from '../cutscene.js';
import { makeRng } from '../config.js';

// ---------------------------------------------------------------------------
// Процедурная «Валькирия» (упрощённый транспорт для облёта)
// ---------------------------------------------------------------------------

function buildValkyrie() {
  const ship = new THREE.Group();
  ship.name = 'valkyrie-flying';

  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3d38, roughness: 0.55, metalness: 0.7 });
  const light = new THREE.MeshStandardMaterial({ color: 0x6b6b70, roughness: 0.4, metalness: 0.8 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x5a3a28, roughness: 0.8, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x223344,
    roughness: 0.15,
    metalness: 0.4,
    emissive: 0x0a1a22,
    emissiveIntensity: 0.6
  });
  const glow = new THREE.MeshStandardMaterial({
    color: 0xffd089,
    emissive: 0xff8a2a,
    emissiveIntensity: 3.0,
    roughness: 0.4
  });

  // Фюзеляж вдоль оси Z, нос — вперёд (−Z).
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 6.4, 20), dark);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0, 0.2);
  ship.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.9, 20), dark);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -3.9);
  ship.add(nose);

  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.85, 1.5), glass);
  cockpit.position.set(0, 0.55, -2.9);
  ship.add(cockpit);

  // Крылья.
  const wingLeft = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.7), dark);
  wingLeft.position.set(-2.4, 0.1, -0.6);
  wingLeft.rotation.z = 0.08;
  ship.add(wingLeft);

  const wingRight = wingLeft.clone();
  wingRight.position.x = 2.4;
  wingRight.rotation.z = -0.08;
  ship.add(wingRight);

  // Двигатели с соплами.
  for (const side of [-1, 1]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 2.6, 16), light);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(side * 2.7, 0.15, 0.4);
    ship.add(nacelle);

    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.5, 14), glow);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(side * 2.7, 0.15, 1.85);
    ship.add(exhaust);

    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.1), rust);
    pylon.position.set(side * 2.0, 0.1, -0.4);
    pylon.rotation.y = side * 0.25;
    ship.add(pylon);
  }

  // Хвостовое оперение.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 1.4), dark);
  tail.position.set(0, 1.0, 2.4);
  ship.add(tail);

  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 0.9), dark);
  tailWing.position.set(0, 0.25, 2.6);
  ship.add(tailWing);

  // Аквила на борту (упрощённо: две перекладины + «голова»).
  const aquilaMat = new THREE.MeshStandardMaterial({ color: 0x9a7a3a, roughness: 0.5, metalness: 0.8 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.06), aquilaMat);
  bar.position.set(0, 0.9, -1.2);
  ship.add(bar);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 8), aquilaMat);
  head.position.set(0, 1.05, -1.2);
  ship.add(head);

  ship.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return ship;
}

// ---------------------------------------------------------------------------
// Сцена кат-сцены
// ---------------------------------------------------------------------------

export function createIntro({ scene }) {
  const group = new THREE.Group();
  group.name = 'cutscene-intro';

  const rng = makeRng(4242);

  // Земля джунглей.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshStandardMaterial({ color: 0x2f3a26, roughness: 0.98, metalness: 0.02 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Лес: деревья разнесены от коридора полёта.
  // Тени от деревьев в кат-сцене отключены: 2 каскада × десятки моделей
  // дороже, чем визуальный выигрыш на облёте.
  for (let i = 0; i < 22; i += 1) {
    const tree = makeTree(i % 3);
    const angle = rng() * Math.PI * 2;
    const distance = 16 + rng() * 70;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    // Не ставим деревья прямо перед камерой/кораблём.
    if (Math.abs(x) < 8 && z > -30 && z < 40) continue;
    tree.position.set(x, 0, z);
    tree.rotation.y = rng() * Math.PI * 2;
    tree.scale.setScalar(0.85 + rng() * 0.5);
    tree.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = true;
      }
    });
    group.add(tree);
  }

  // Костры-ориентиры (без реального света, чтобы не плодить тени).
  const fireMat = new THREE.MeshStandardMaterial({
    color: 0xff8a2a,
    emissive: 0xff5a12,
    emissiveIntensity: 3.0,
    roughness: 0.7
  });
  for (let i = 0; i < 3; i += 1) {
    const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), fireMat);
    fire.position.set(-30 + i * 28, 0.8, -34 - i * 4);
    group.add(fire);
  }

  // Корабль.
  const ship = buildValkyrie();
  ship.position.set(0, 3.2, 30);
  group.add(ship);

  // Ракета.
  const rocket = new THREE.Group();
  const rocketBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 1.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x4a4a44, roughness: 0.6, metalness: 0.5 })
  );
  rocketBody.rotation.x = Math.PI / 2;
  rocket.add(rocketBody);

  const rocketFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.9, 10),
    new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.9, depthWrite: false })
  );
  rocketFlame.rotation.x = -Math.PI / 2;
  rocketFlame.position.z = 1.0;
  rocket.add(rocketFlame);
  rocket.visible = false;
  group.add(rocket);

  // Взрыв: сфера + свет.
  const fireballMat = new THREE.MeshBasicMaterial({
    color: 0xffb060,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fireballMat);
  fireball.visible = false;
  group.add(fireball);

  const blastLight = new THREE.PointLight(0xff7a2a, 0, 60, 2);
  group.add(blastLight);

  // Состояние анимации.
  const state = {
    rocketFlying: false,
    explosionTime: -1,
    shipVisible: true
  };

  function startRocket() {
    state.rocketFlying = true;
    rocket.visible = true;
    rocket.position.set(16, 0.6, 18);
  }

  function explode(cutscene) {
    state.rocketFlying = false;
    rocket.visible = false;

    if (state.shipVisible) {
      state.shipVisible = false;
      ship.visible = false;
    }

    state.explosionTime = cutscene.time ?? 28;
    fireball.visible = true;
    fireball.position.copy(ship.position);
    fireball.scale.setScalar(0.5);
    fireballMat.opacity = 1;
    blastLight.position.copy(ship.position);
    blastLight.intensity = 18;
  }

  return {
    duration: 42,
    startFade: 0,

    keyframes: [
      { t: 0, pos: [0, 32, 58], lookAt: [0, 4, 0], fov: 60 },
      { t: 8, pos: [14, 15, 34], lookAt: [0, 5, 8], fov: 55 },
      { t: 15, pos: [18, 8, 20], lookAt: [0, 4, 4], fov: 50 },
      { t: 18, cut: true, pos: [0.2, 2.3, 9.5], lookAt: [0, 2.4, 4], fov: 68 },
      { t: 26, pos: [0, 2.5, 9.0], lookAt: [0.3, 2.4, 4], fov: 68 },
      { t: 28, cut: true, pos: [16, 7, 14], lookAt: [0, 3, 4], fov: 55 },
      { t: 34, pos: [20, 8, 18], lookAt: [0, 4, 2], fov: 50 },
      { t: 42, pos: [20, 8, 18], lookAt: [0, 4, 2], fov: 50 }
    ],

    events: [
      {
        t: 0.5,
        type: 'dialogue',
        speaker: '[Повествование]',
        text:
          'Планета Армагеддон-Прайм. Сектор Готик. Третий день орочьего вторжения. ' +
          'Транспорт «Валькирия-7» доставляет подкрепление к линии фронта. На борту — ' +
          'комиссар Имперской Гвардии Гарик Вондер. Его задача — поддержать боевой дух ' +
          'гарнизона и лично возглавить контратаку. Император защищает.'
      },
      {
        t: 7.5,
        type: 'dialogue',
        speaker: '[Гарик Вондер]',
        text:
          'Солдаты Императора держатся из последних сил. Орочья зараза расползлась по ' +
          'материку, как гниль. Я здесь, чтобы напомнить им, за что они сражаются. И за что умирают.'
      },
      {
        t: 14,
        type: 'dialogue',
        speaker: '[Пилот, по внутренней связи]',
        text: 'Комиссар, подходим к зоне высадки. Вижу дым — похоже, парни уже вступили в контакт. Держитесь, сейчас будет тряхнуть.'
      },
      { t: 20, type: 'shake', amp: 0.05, duration: 6 },
      { t: 26.2, type: 'sound', name: 'playGrenade' },
      { t: 26.4, type: 'callback', fn: startRocket },
      { t: 28.1, type: 'sound', name: 'playExplosion' },
      { t: 28.1, type: 'flash', color: '#ff2a00', duration: 0.6, opacity: 1 },
      { t: 28.15, type: 'shake', amp: 0.9, duration: 1.8 },
      { t: 28.2, type: 'callback', fn: (cutscene) => explode(cutscene) },
      {
        t: 31.5,
        type: 'dialogue',
        speaker: '[Пилот, обрывками]',
        text: '...майский день... падаем... комиссар, держитесь...'
      },
      { t: 35.5, type: 'fade', to: 1, duration: 3.6 },
      {
        t: 36.5,
        type: 'dialogue',
        speaker: '[Крушение]',
        text: 'Место: джунгли Армагеддон-Прайм, квадрат 7-Г. Статус: связь потеряна. Выжившие: неизвестно.'
      },
      { t: 41.9, type: 'callback', fn: (cutscene) => cutscene.dialogue.close() }
    ],

    update(time, dt) {
      // Полёт корабля: от z=30 к z=4, с покачиванием.
      if (state.shipVisible) {
        const flight = Math.min(time, 18) / 18;
        ship.position.z = 30 - flight * 26;
        ship.position.y = 3.2 + Math.sin(time * 0.9) * 0.35;
        ship.rotation.z = Math.sin(time * 0.7) * 0.06;
        ship.rotation.x = Math.sin(time * 0.55) * 0.03;
      }

      // Ракета летит к кораблю.
      if (state.rocketFlying) {
        const from = new THREE.Vector3(16, 0.6, 18);
        const to = ship.position.clone();
        const travel = Math.min(1, (time - 26.4) / 1.7);
        rocket.position.lerpVectors(from, to, travel);
        rocket.lookAt(to);
      }

      // Взрыв: расширяющаяся сфера и затухающий свет.
      if (state.explosionTime >= 0) {
        const age = time - state.explosionTime;
        if (age >= 0) {
          const scale = 1 + age * 6;
          fireball.scale.setScalar(scale);
          fireballMat.opacity = Math.max(0, 1 - age / 2.6);
          blastLight.intensity = Math.max(0, 18 - age * 12);
          if (age > 3) fireball.visible = false;
        }
      }
    },

    onStart() {
      scene.add(group);
    },

    onEnd() {
      scene.remove(group);
      disposeObject3D(group);
    }
  };
}
