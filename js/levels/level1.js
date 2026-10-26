// Уровень 1 — «Джунгли смерти».
// Обломки «Валькирии», мост, орочий лагерь; 5 бойзов и 2 стрелка.
// Статика слита через mergeGeometries, враги/триггеры/подборы — данные для main.js.

import * as THREE from 'three';
import { makeValkyrieWreck, makeSandbags } from '../models/environment.js';
import { makeCampfire, makeBarrel, makeOrkTotem } from '../models/props.js';
import { makeRng } from '../config.js';
import {
  StaticBatch,
  makeMaterial,
  addGround,
  addCollider,
  scatterTrees,
  disposeLevelRoot
} from './common.js';

export function buildLevel1(scene, colliders, lighting) {
  void lighting;

  const root = new THREE.Group();
  root.name = 'level1';
  scene.add(root);

  const rng = makeRng(1101);

  // Земля.
  addGround(root, 96, 0x33402a);

  // Материалы уровня.
  const wood = makeMaterial(0x3a2e22, { roughness: 0.95 });
  const plank = makeMaterial(0x4a3a28, { roughness: 0.92 });
  const metal = makeMaterial(0x4a4a46, { roughness: 0.6, metalness: 0.55 });
  const rust = makeMaterial(0x5a3a28, { roughness: 0.85, metalness: 0.4 });

  const statics = new StaticBatch('level1-statics');

  // Границы уровня.
  colliders.addBounds(-44, 44, -44, 44, 4);

  // Обломки «Валькирии» у точки высадки.
  const wreck = makeValkyrieWreck();
  wreck.position.set(7, 0, 26);
  wreck.rotation.y = -0.6;
  root.add(wreck);
  addCollider(colliders, 7, 26, 5, 3.4, 2.4);

  // Мост через овраг: настил + перила.
  for (let i = 0; i < 11; i += 1) {
    statics.box(1.5, 0.14, 14, plank, [-7 + i * 1.4, 0.08, -8]);
  }
  statics.box(0.22, 1.1, 14, wood, [-7.2, 0.65, -8]);
  statics.box(0.22, 1.1, 14, wood, [7.2, 0.65, -8]);

  // Опоры моста.
  for (const x of [-7, 7]) {
    for (const z of [-13, -3]) {
      statics.box(0.5, 2.4, 0.5, wood, [x, 1.0, z]);
    }
  }

  // Баррикады из мешков у моста.
  for (let i = 0; i < 3; i += 1) {
    const bags = makeSandbags();
    bags.position.set(-8 + i * 2.2, 0, 0.5);
    bags.rotation.y = 0.1;
    root.add(bags);
  }

  // Орочьи постройки в лагере.
  const totem = makeOrkTotem();
  totem.position.set(4, 0, -32);
  totem.rotation.y = 0.4;
  root.add(totem);

  const campfire = makeCampfire({ withLight: false });
  campfire.position.set(-2, 0, -30);
  root.add(campfire);

  for (let i = 0; i < 4; i += 1) {
    const barrel = makeBarrel();
    barrel.position.set(-5 + rng() * 10, 0, -34 + rng() * 4);
    barrel.rotation.z = i === 2 ? Math.PI / 2 : 0;
    root.add(barrel);
  }

  // Ржавые обломки вдоль тропы.
  for (let i = 0; i < 8; i += 1) {
    const x = (rng() < 0.5 ? -1 : 1) * (10 + rng() * 18);
    const z = -30 + rng() * 52;
    statics.box(1.2 + rng() * 2.2, 0.25, 0.8 + rng() * 1.6, rust, [x, 0.15, z], [0, rng() * Math.PI, 0]);
  }

  // Стойки орочьих вышек.
  for (const [x, z] of [[-14, -18], [14, -20]]) {
    statics.box(0.4, 4.5, 0.4, wood, [x, 2.25, z]);
    statics.box(0.4, 4.5, 0.4, wood, [x + 2, 2.25, z]);
    statics.box(2.6, 0.2, 2.2, metal, [x + 1, 4.4, z]);
    addCollider(colliders, x + 1, z, 2.6, 2.2, 4.4);
  }

  root.add(statics.build());

  // Деревья джунглей.
  scatterTrees(root, rng, 16, { minX: -42, maxX: 42, minZ: -42, maxZ: 40 });

  return {
    id: 'level1',
    title: 'ДЖУНГЛИ СМЕРТИ',
    subtitle: 'Армагеддон-Прайм · квадрат 7-Г',
    theme: 'level1',
    spawn: { x: 0, z: 32, yaw: 0 },
    objective: 'Пробиться через джунгли к орочьему лагерю',

    waves: [
      {
        x: 0, z: 14, radius: 7,
        enemies: [
          { type: 'boy', x: -5, z: 8 },
          { type: 'boy', x: 5, z: 8 }
        ]
      },
      {
        x: 0, z: -4, radius: 7,
        enemies: [
          { type: 'boy', x: -4, z: -15 },
          { type: 'boy', x: 4, z: -15 },
          { type: 'shooter', x: 0, z: -20 }
        ]
      },
      {
        x: 0, z: -22, radius: 7,
        enemies: [
          { type: 'boy', x: -4, z: -29 },
          { type: 'boy', x: 4, z: -29 },
          { type: 'shooter', x: 0, z: -34 }
        ]
      }
    ],

    triggers: [
      {
        x: 0, z: 27, radius: 6,
        speaker: '[Сержант Колл, вокс]',
        text: 'Комиссар, слышим стрельбу. Это вы? Держитесь, мы прикроем. Ищите мост — за ним наш передовой пост.'
      },
      {
        x: 0, z: 4, radius: 5,
        speaker: '[Сержант Колл, вокс]',
        text: 'Мост впереди. Орочья банда уже перебралась на нашу сторону — приготовьтесь.',
        checkpoint: true
      },
      {
        x: 0, z: -20, radius: 6,
        speaker: '[Сержант Колл, вокс]',
        text: 'Комиссар, вы близко! Но между вами и нами — орочья выработка. Они что-то копают. Будьте осторожны, там их много.'
      }
    ],

    pickups: [
      { kind: 'medkit', x: -7, z: 4 },
      { kind: 'ammo', x: 7, z: -2 },
      { kind: 'grenade', x: 8.5, z: -3 }
    ],

    exit: {
      x: 0, z: -38, radius: 4,
      next: 'level2',
      label: 'Идти к орочьей выработке'
    },

    dispose() {
      scene.remove(root);
      disposeLevelRoot(root);
    }
  };
}
