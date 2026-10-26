// Уровень 3 — «Последний рывок».
// Выжженное поле, воронки, обломки техники, укрепления и ворота штаба.
// Финал уровня — вход в ворота и финальная кат-сцена.

import * as THREE from 'three';
import { makeHQGate, makeSandbags, makeFlag } from '../models/environment.js';
import { makeBarrel } from '../models/props.js';
import { makeRng } from '../config.js';
import {
  StaticBatch,
  makeMaterial,
  addGround,
  addCollider,
  disposeLevelRoot
} from './common.js';

export function buildLevel3(scene, colliders, lighting) {
  void lighting;

  const root = new THREE.Group();
  root.name = 'level3';
  scene.add(root);

  const rng = makeRng(3303);

  addGround(root, 140, 0x3a2a22);

  const ash = makeMaterial(0x2c211b, { roughness: 0.98 });
  const scorched = makeMaterial(0x1d1714, { roughness: 1.0 });
  const metal = makeMaterial(0x3e3e40, { roughness: 0.55, metalness: 0.65 });
  const rust = makeMaterial(0x5a3a28, { roughness: 0.85, metalness: 0.4 });
  const sand = makeMaterial(0x6b5f42, { roughness: 0.97 });

  const statics = new StaticBatch('level3-statics');

  colliders.addBounds(-52, 52, -34, 34, 5);

  // Воронки от взрывов.
  for (let i = 0; i < 14; i += 1) {
    const x = -44 + rng() * 88;
    const z = -26 + rng() * 52;
    const radius = 1.6 + rng() * 2.6;
    statics.cylinder(radius * 0.7, radius, 0.35, 14, scorched, [x, 0.12, z]);
    statics.cylinder(radius * 0.95, radius * 0.95, 0.2, 14, ash, [x, 0.06, z]);
  }

  // Обломки бронетехники.
  for (let i = 0; i < 9; i += 1) {
    const x = -40 + rng() * 80;
    const z = -20 + rng() * 40;
    const w = 3 + rng() * 4;
    statics.box(w, 1.1, 2 + rng() * 2.4, metal, [x, 0.6, z], [0, rng() * Math.PI, 0]);
    statics.box(w * 0.4, 0.6, 1.2, rust, [x + (rng() - 0.5) * 3, 1.2, z], [0.2, rng() * Math.PI, 0.3]);
    addCollider(colliders, x, z, w, 2.6, 1.6);
  }

  // Окопы: невысокие стенки из мешков.
  for (let i = -5; i <= 5; i += 1) {
    const bags = makeSandbags();
    bags.position.set(i * 4.2, 0, -18);
    bags.rotation.y = 0.02;
    root.add(bags);
    addCollider(colliders, i * 4.2, -18, 3.6, 1.1, 1.2);
  }

  // Ворота штаба.
  const gate = makeHQGate();
  gate.position.set(0, 0, -30);
  root.add(gate);

  // Стены по бокам ворот, оставляем центральный проход.
  statics.box(14, 4.5, 1.2, sand, [-17, 2.25, -30]);
  statics.box(14, 4.5, 1.2, sand, [17, 2.25, -30]);
  addCollider(colliders, -17, -30, 14, 1.2, 4.5);
  addCollider(colliders, 17, -30, 14, 1.2, 4.5);

  // Флаги и прожекторные мачты у штаба.
  for (const side of [-1, 1]) {
    const flag = makeFlag();
    flag.position.set(side * 12, 0, -26);
    flag.rotation.y = side * 0.2;
    root.add(flag);

    statics.box(0.4, 7, 0.4, metal, [side * 10, 3.5, -27]);
  }

  // --- Укрепрайон за воротами: бункер, блоки, прожекторы, антенна ---
  const concrete = makeMaterial(0x6a6a62, { roughness: 0.95, metalness: 0.05 });
  const concreteDark = makeMaterial(0x4a4a44, { roughness: 0.97 });
  const lamp = new THREE.MeshStandardMaterial({
    color: 0xfff0c0,
    emissive: 0xffd089,
    emissiveIntensity: 2.4,
    roughness: 0.4
  });

  // Основной бетонный блок бункера и крыша.
  statics.box(34, 6.5, 10, concrete, [0, 3.25, -42]);
  statics.box(36, 0.9, 11, concreteDark, [0, 6.7, -42]);
  statics.box(10, 4.2, 6, concrete, [-20, 2.1, -38]);
  statics.box(10, 4.2, 6, concrete, [20, 2.1, -38]);

  // Входной портал.
  statics.box(6, 3.4, 1.6, concreteDark, [-5.5, 1.7, -36.6]);
  statics.box(6, 3.4, 1.6, concreteDark, [5.5, 1.7, -36.6]);
  statics.box(17, 0.9, 1.8, concreteDark, [0, 3.8, -36.6]);

  // Бетонные заграждения перед бункером.
  for (let i = -2; i <= 2; i += 1) {
    statics.box(2.4, 1.2, 1.2, concrete, [i * 3.6, 0.6, -34.5]);
  }

  // Прожекторы на мачтах у ворот.
  for (const side of [-1, 1]) {
    statics.box(0.35, 5.4, 0.35, metal, [side * 8, 2.7, -33]);
    statics.box(1.4, 0.5, 0.8, metal, [side * 8, 5.4, -33]);
    statics.box(1.0, 0.42, 0.1, lamp, [side * 8, 5.4, -32.5]);
  }

  // Мачта связи с антенной.
  statics.cylinder(0.16, 0.22, 14, 10, metal, [13, 7, -40]);
  for (let i = 0; i < 4; i += 1) {
    statics.box(3.2 - i * 0.5, 0.12, 0.12, metal, [13, 6 + i * 2, -40]);
  }
  statics.cylinder(0.5, 0.5, 0.4, 12, concreteDark, [13, 0.2, -40]);
  statics.box(0.12, 2.4, 0.12, metal, [13, 13.2, -40], [0, 0, Math.PI / 3]);

  // Бочки у ворот.
  for (let i = 0; i < 5; i += 1) {
    const barrel = makeBarrel();
    barrel.position.set(-6 + rng() * 12, 0, -24 + rng() * 3);
    barrel.rotation.y = rng() * Math.PI * 2;
    root.add(barrel);
  }

  root.add(statics.build());

  return {
    id: 'level3',
    title: 'ПОСЛЕДНИЙ РЫВОК',
    subtitle: 'Армагеддон-Прайм · подступы к штабу',
    theme: 'level3',
    spawn: { x: 0, z: 30, yaw: 0 },
    objective: 'Пробиться через поле к воротам штаба',

    waves: [
      {
        x: 0, z: 20, radius: 8,
        enemies: [
          { type: 'boy', x: -12, z: 10 },
          { type: 'boy', x: 0, z: 8 },
          { type: 'boy', x: 12, z: 10 }
        ]
      },
      {
        x: 0, z: 0, radius: 9,
        enemies: [
          { type: 'boy', x: -14, z: -8 },
          { type: 'boy', x: 0, z: -10 },
          { type: 'boy', x: 14, z: -8 },
          { type: 'shooter', x: -20, z: -4 },
          { type: 'shooter', x: 20, z: -4 }
        ]
      },
      {
        // Финальная волна появляется в поле и бежит к воротам.
        x: 0, z: -13, radius: 8,
        enemies: [
          { type: 'boy', x: -8, z: -8 },
          { type: 'boy', x: 0, z: -10 },
          { type: 'boy', x: 8, z: -8 }
        ]
      }
    ],

    triggers: [
      {
        x: 0, z: 22, radius: 6,
        speaker: '[Сержант Колл, вокс]',
        text: 'Комиссар, мы видим вас! Прикройте — мы откроем ворота!'
      },
      {
        x: 0, z: 0, radius: 7,
        speaker: '[Сержант Колл, вокс]',
        text: 'Держитесь, комиссар! Ещё немного — и вы у нас. Император защищает!',
        checkpoint: true
      },
      {
        x: 0, z: -10, radius: 6,
        speaker: '[Гарик Вондер]',
        text: 'Ворота близко. Последний рывок — и штаб наш.'
      }
    ],

    // Гвардейцы за баррикадами у ворот.
    allies: [
      { x: -6, z: -22, rotation: 0 },
      { x: 6, z: -22, rotation: 0 },
      { x: -12, z: -21, rotation: 0 },
      { x: 12, z: -21, rotation: 0 }
    ],

    pickups: [
      { kind: 'medkit', x: -12, z: 8 },
      { kind: 'medkit', x: 11, z: -4 },
      { kind: 'ammo', x: 0, z: -8 },
      { kind: 'grenade', x: 5, z: -8 }
    ],

    exit: {
      x: 0, z: -26, radius: 4,
      next: 'finale',
      label: 'Войти в ворота штаба'
    },

    dispose() {
      scene.remove(root);
      disposeLevelRoot(root);
    }
  };
}
