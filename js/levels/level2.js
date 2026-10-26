// Уровень 2 — «Орочья выработка».
// Туннели, площадка с генератором и арена с нобом.
// Статика слита через mergeGeometries.

import * as THREE from 'three';
import { makeGenerator } from '../models/environment.js';
import { makeBarrel, makeAmmoCrate } from '../models/props.js';
import { makeRng } from '../config.js';
import {
  StaticBatch,
  makeMaterial,
  addGround,
  addCollider,
  disposeLevelRoot
} from './common.js';

export function buildLevel2(scene, colliders, lighting) {
  void lighting;

  const root = new THREE.Group();
  root.name = 'level2';
  scene.add(root);

  const rng = makeRng(2202);

  addGround(root, 72, 0x2a1c14);

  const rock = makeMaterial(0x2e2620, { roughness: 0.97 });
  const rockDark = makeMaterial(0x1f1a16, { roughness: 0.98 });
  const metal = makeMaterial(0x3a3a3e, { roughness: 0.55, metalness: 0.7 });
  const rust = makeMaterial(0x5a3a28, { roughness: 0.85, metalness: 0.45 });
  const beam = makeMaterial(0x4a3826, { roughness: 0.9 });

  const statics = new StaticBatch('level2-statics');

  colliders.addBounds(-34, 34, -34, 34, 5);

  // Входной туннель: две стены и перекрытие.
  statics.box(1.2, 5, 26, rock, [-4.6, 2.5, 16]);
  statics.box(1.2, 5, 26, rock, [4.6, 2.5, 16]);
  statics.box(10.4, 0.8, 26, rockDark, [0, 5.6, 16]);
  addCollider(colliders, -4.6, 16, 1.2, 26, 5);
  addCollider(colliders, 4.6, 16, 1.2, 26, 5);

  // Развилка: боковые камеры.
  statics.box(1.2, 5, 12, rock, [-11, 2.5, 4]);
  statics.box(1.2, 5, 12, rock, [11, 2.5, 4]);
  statics.box(22, 0.8, 1.2, rockDark, [0, 5.4, -2]);
  addCollider(colliders, -11, 4, 1.2, 12, 5);
  addCollider(colliders, 11, 4, 1.2, 12, 5);

  // Площадка с генератором.
  const generator = makeGenerator();
  generator.position.set(0, 0, -6);
  generator.scale.setScalar(1.2);
  root.add(generator);
  addCollider(colliders, 0, -6, 5.5, 5.5, 4.5);

  // Ограждение площадки.
  for (let i = -4; i <= 4; i += 2) {
    statics.box(0.3, 1.1, 0.3, metal, [i * 2.2, 0.55, 2.5]);
    statics.box(0.3, 1.1, 0.3, metal, [i * 2.2, 0.55, -15]);
  }

  // Арена ноба: стены-тоннели по бокам.
  statics.box(1.4, 6, 18, rock, [-13, 3, -22]);
  statics.box(1.4, 6, 18, rock, [13, 3, -22]);
  statics.box(27, 0.8, 1.4, rockDark, [0, 6, -31]);
  addCollider(colliders, -13, -22, 1.4, 18, 6);
  addCollider(colliders, 13, -22, 1.4, 18, 6);

  // Балки и крепления.
  for (let i = 0; i < 6; i += 1) {
    const z = 24 - i * 8;
    statics.box(12, 0.3, 0.3, beam, [0, 5.2, z]);
  }
  for (let i = 0; i < 8; i += 1) {
    statics.box(0.6, 0.6, 0.6, rust, [(rng() - 0.5) * 22, 0.3, -28 + rng() * 54], [0, rng() * Math.PI, 0]);
  }

  // Вагонетки и бочки.
  for (let i = 0; i < 4; i += 1) {
    const barrel = makeBarrel();
    barrel.position.set(-9 + rng() * 18, 0, -12 + rng() * 10);
    weather(barrel, rng);
    root.add(barrel);
  }

  const crate = makeAmmoCrate();
  crate.position.set(9.5, 0, -1);
  crate.rotation.y = 0.4;
  root.add(crate);

  root.add(statics.build());

  return {
    id: 'level2',
    title: 'ОРОЧЬЯ ВЫРАБОТКА',
    subtitle: 'Армагеддон-Прайм · подземный ярус',
    theme: 'level2',
    spawn: { x: 0, z: 28, yaw: 0 },
    objective: 'Пройти через выработку и подняться на поверхность',

    waves: [
      {
        x: 0, z: 20, radius: 6,
        enemies: [
          { type: 'boy', x: -2, z: 10 },
          { type: 'boy', x: 2, z: 10 }
        ]
      },
      {
        x: 0, z: 0, radius: 7,
        enemies: [
          { type: 'shooter', x: -9, z: -3 },
          { type: 'shooter', x: 9, z: -3 }
        ]
      },
      {
        x: 0, z: -14, radius: 8,
        enemies: [
          { type: 'boy', x: -6, z: -22 },
          { type: 'boy', x: 6, z: -22 },
          { type: 'nob', x: 0, z: -27 }
        ]
      }
    ],

    triggers: [
      {
        x: 0, z: 22, radius: 5,
        speaker: '[Сержант Колл, вокс]',
        text: 'Вы вошли в выработку? Держитесь стен, комиссар. Они любят бить из-за угла.'
      },
      {
        x: 0, z: -2, radius: 6,
        speaker: '[Сержант Колл, вокс]',
        text: 'Слышим гудение генератора. Там их логово. Приготовьте гранаты.',
        checkpoint: true
      },
      {
        x: 0, z: -14, radius: 6,
        speaker: '[Гарик Вондер]',
        text: 'Крупный. Значит, вожак. Тем лучше — одним ударом решим судьбу выработки.'
      }
    ],

    pickups: [
      { kind: 'medkit', x: -7, z: 6 },
      { kind: 'ammo', x: 5, z: -12 },
      { kind: 'grenade', x: 7, z: -12 }
    ],

    exit: {
      x: 0, z: -31, radius: 4,
      next: 'level3',
      label: 'Подняться на поверхность'
    },

    dispose() {
      scene.remove(root);
      disposeLevelRoot(root);
    }
  };
}

// Небольшая вариация позы бочки, чтобы пропсы не выглядели копиями.
function weather(object, rng) {
  object.rotation.y = rng() * Math.PI * 2;
  if (rng() < 0.35) object.rotation.z = Math.PI / 2;
}
