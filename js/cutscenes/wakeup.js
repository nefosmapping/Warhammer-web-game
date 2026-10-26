// Кат-сцена 2: пробуждение в обломках «Валькирии».
// Камера лежит на земле, затем поднимается до уровня глаз.
// Здесь же — первый вокс-диалог с сержантом Коллом.

import * as THREE from 'three';
import { makeValkyrieWreck } from '../models/environment.js';
import { makeCampfire, makeTree, makeBarrel } from '../models/props.js';
import { disposeObject3D } from '../cutscene.js';
import { makeRng } from '../config.js';

export function createWakeup({ scene }) {
  const group = new THREE.Group();
  group.name = 'cutscene-wakeup';

  const rng = makeRng(777);

  // Земля.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: 0x323c28, roughness: 0.98, metalness: 0.02 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Обломки «Валькирии» перед игроком.
  const wreck = makeValkyrieWreck();
  wreck.position.set(-1.5, 0, -7);
  wreck.rotation.y = 0.35;
  wreck.rotation.z = 0.06;
  group.add(wreck);

  // Костры: модель + слабый источник света.
  const fireSpots = [
    [4.5, 0, -4.5],
    [-6.5, 0, -1.5]
  ];
  for (const [x, y, z] of fireSpots) {
    const fire = makeCampfire({ withLight: false });
    fire.position.set(x, y, z);
    group.add(fire);

    const light = new THREE.PointLight(0xff7a2a, 2.2, 9, 2);
    light.position.set(x, 1.0, z);
    light.castShadow = false;
    group.add(light);
  }

  // Разбросанные обломки и бочки.
  for (let i = 0; i < 8; i += 1) {
    const barrel = makeBarrel();
    barrel.position.set((rng() - 0.5) * 16, 0, -12 + rng() * 14);
    barrel.rotation.z = rng() < 0.3 ? Math.PI / 2 : 0;
    barrel.scale.setScalar(0.9 + rng() * 0.3);
    group.add(barrel);
  }

  // Деревья по периметру.
  for (let i = 0; i < 10; i += 1) {
    const tree = makeTree(i % 3);
    const angle = rng() * Math.PI * 2;
    const distance = 14 + rng() * 18;
    tree.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance - 6);
    tree.rotation.y = rng() * Math.PI * 2;
    group.add(tree);
  }

  // Дым над обломками: несколько полупрозрачных сфер.
  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: 0x2a2a26,
    transparent: true,
    opacity: 0.22,
    depthWrite: false
  });
  const smokePuffs = [];
  for (let i = 0; i < 6; i += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.8 + rng() * 0.7, 10, 8), smokeMaterial);
    puff.position.set(-1.5 + (rng() - 0.5) * 3, 1.2 + rng() * 2, -7 + (rng() - 0.5) * 3);
    group.add(puff);
    smokePuffs.push(puff);
  }

  return {
    duration: 15,
    startFade: 1,

    keyframes: [
      { t: 0, pos: [0.4, 0.35, 3.0], lookAt: [-1.5, 0.9, -7], fov: 75 },
      { t: 2, pos: [0.4, 0.4, 3.0], lookAt: [-1.5, 1.0, -7], fov: 74 },
      { t: 6.5, pos: [0.2, 1.0, 2.6], lookAt: [-1.0, 1.3, -7], fov: 72 },
      { t: 10, pos: [0, 1.7, 2.2], lookAt: [-0.5, 1.5, -7], fov: 75 },
      { t: 15, pos: [0, 1.7, 2.2], lookAt: [-0.5, 1.5, -7], fov: 75 }
    ],

    events: [
      { t: 0.2, type: 'fade', to: 0, duration: 2.4 },
      {
        t: 1.2,
        type: 'dialogue',
        speaker: '[Вокс-связь, помехи]',
        text:
          '...комиссар? Комиссар Вондер, вы меня слышите? Это сержант Колл. Мы удерживаем ' +
          'периметр у штаба, но орки идут со всех сторон... Если вы живы — пробирайтесь к нам. ' +
          'Координаты передаю. Не задерживайтесь, здесь ад.'
      },
      {
        t: 8.2,
        type: 'dialogue',
        speaker: '[Гарик Вондер]',
        text: 'Сержант, я вас слышу. «Валькирию» сбили. Я в джунглях, один. Держитесь — я иду.'
      },
      {
        t: 12,
        type: 'dialogue',
        speaker: '[Управление]',
        text: 'Осмотрите обломки: рядом лежат цепной меч, болтер и гранаты.'
      },
      { t: 13.2, type: 'fade', to: 1, duration: 1.6 }
    ],

    update(time) {
      // Дым медленно поднимается и вращается.
      for (let i = 0; i < smokePuffs.length; i += 1) {
        const puff = smokePuffs[i];
        const phase = i * 1.7;
        puff.position.y = 1.0 + ((time * 0.35 + phase) % 3.2);
        puff.position.x += Math.sin(time * 0.5 + phase) * 0.0015;
        puff.rotation.y += 0.002;
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
