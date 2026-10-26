// Процедурная модель Имперского Гвардейца (союзник).
// Человек в бронежилете и каске, с болтером в руках. Модель смотрит вперёд
// по локальной оси +Z — это нужно для корректной работы lookAt в AllyManager.

import * as THREE from 'three';
import { VertexColorBuilder } from './utils.js';

const C = {
  armor: 0x4a5a35,
  armorDark: 0x2f3922,
  cloth: 0x3a3a30,
  skin: 0xb08a6a,
  metal: 0x3a3a3e,
  metalLight: 0x6b6b70,
  visor: 0x1c2a1e,
  gold: 0x9a7a3a,
  black: 0x14140f
};

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);

export function makeGuardsman() {
  const builder = new VertexColorBuilder('guardsman-mesh', {
    roughness: 0.85,
    metalness: 0.12
  });

  // Ноги и ботинки.
  builder.add(box(0.24, 0.8, 0.26), C.cloth, { position: [-0.14, 0.42, 0] });
  builder.add(box(0.24, 0.8, 0.26), C.cloth, { position: [0.14, 0.42, 0] });
  builder.add(box(0.28, 0.16, 0.4), C.black, { position: [-0.14, 0.08, 0.05] });
  builder.add(box(0.28, 0.16, 0.4), C.black, { position: [0.14, 0.08, 0.05] });

  // Пояс и бёдра.
  builder.add(box(0.56, 0.16, 0.34), C.armorDark, { position: [0, 0.84, 0] });

  // Торс и бронежилет.
  builder.add(box(0.62, 0.72, 0.36), C.armor, { position: [0, 1.26, 0] });
  builder.add(box(0.5, 0.34, 0.42), C.armorDark, { position: [0, 1.4, 0.02] });
  builder.add(box(0.12, 0.5, 0.4), C.armorDark, { position: [-0.34, 1.28, 0] });
  builder.add(box(0.12, 0.5, 0.4), C.armorDark, { position: [0.34, 1.28, 0] });

  // Наплечники.
  builder.add(box(0.2, 0.22, 0.34), C.armorDark, { position: [-0.38, 1.56, 0] });
  builder.add(box(0.2, 0.22, 0.34), C.armorDark, { position: [0.38, 1.56, 0] });

  // Руки: плечи, предплечья, кисти.
  builder.add(box(0.16, 0.36, 0.16), C.cloth, { position: [-0.34, 1.28, 0.06] });
  builder.add(box(0.16, 0.36, 0.16), C.cloth, { position: [0.34, 1.28, 0.06] });
  builder.add(box(0.14, 0.32, 0.14), C.armor, { position: [-0.3, 1.02, 0.3], rotation: [0.9, 0, 0] });
  builder.add(box(0.14, 0.32, 0.14), C.armor, { position: [0.3, 1.02, 0.3], rotation: [0.9, 0, 0] });
  builder.add(box(0.14, 0.12, 0.16), C.skin, { position: [-0.3, 1.02, 0.48] });
  builder.add(box(0.14, 0.12, 0.16), C.skin, { position: [0.3, 1.02, 0.48] });

  // Голова, каска, визор.
  builder.add(sph(0.15), C.skin, { position: [0, 1.68, 0] });
  builder.add(sph(0.19, 14, 8), C.armor, { position: [0, 1.73, 0], scale: [1, 0.8, 1] });
  builder.add(box(0.28, 0.08, 0.1), C.armorDark, { position: [0, 1.66, 0.16] });
  builder.add(box(0.3, 0.06, 0.06), C.visor, { position: [0, 1.7, 0.14] });

  // Аквила на груди.
  builder.add(box(0.16, 0.04, 0.03), C.gold, { position: [0, 1.38, 0.21] });
  builder.add(box(0.05, 0.12, 0.03), C.gold, { position: [0, 1.3, 0.21] });

  // Болтер (упрощённый): корпус, ствол, магазин, приклад.
  builder.add(box(0.16, 0.18, 0.62), C.metal, { position: [0.12, 1.12, 0.62] });
  builder.add(cyl(0.045, 0.05, 0.42, 12), C.metalLight, {
    position: [0.12, 1.13, 0.98],
    rotation: [Math.PI / 2, 0, 0]
  });
  builder.add(box(0.12, 0.24, 0.16), C.armorDark, { position: [0.12, 0.96, 0.6] });
  builder.add(box(0.14, 0.12, 0.2), C.metal, { position: [0.12, 1.14, 0.26] });
  builder.add(box(0.07, 0.07, 0.18), C.black, { position: [0.12, 1.24, 0.66] });

  // Ранец.
  builder.add(box(0.4, 0.44, 0.2), C.armorDark, { position: [0, 1.3, -0.26] });
  builder.add(cyl(0.05, 0.05, 0.3, 8), C.metal, { position: [-0.14, 1.48, -0.28] });

  const group = builder.build();
  group.name = 'guardsman';
  group.userData.height = 1.9;
  group.userData.kind = 'ally';
  return group;
}
