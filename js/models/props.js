// Пропсы: деревья, ящики, аптечки, бочки, костры, орочьи тотемы.
// Каждый пропс — процедурный и слит в минимальное число мешей.

import * as THREE from 'three';
import {
  VertexColorBuilder,
  beveledBox
} from './utils.js';

const cyl = (rt, rb, h, seg = 16, hs = 1, open = false) =>
  new THREE.CylinderGeometry(rt, rb, h, seg, hs, open);
const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg);
const torus = (r, t, rs = 8, ts = 16, arc = Math.PI * 2) =>
  new THREE.TorusGeometry(r, t, rs, ts, arc);
const ico = (r, detail = 1) => new THREE.IcosahedronGeometry(r, detail);

const C = {
  bark: 0x3b2c1e,
  barkLight: 0x4d3a26,
  leaf1: 0x2f4a24,
  leaf2: 0x3d5c2b,
  leaf3: 0x4f6b32,
  root: 0x33251a,
  moss: 0x566b32,

  metalDark: 0x2a2a2e,
  metalLight: 0x6b6b70,
  rust: 0x5a3a28,
  brass: 0x9a7a3a,
  leather: 0x3a2e28,
  cloth: 0x4a4436,
  bone: 0xc9bea0,
  wood: 0x4a3826,

  armyGreen: 0x3e4a2c,
  armyGreenDark: 0x2f3922,
  medkitWhite: 0xc9c9c0,
  medkitRed: 0x9a2018,
  stone: 0x4a4740,
  stoneDark: 0x35332e
};

// ---------------------------------------------------------------------------
// Дерево (3 вариации)
// Минимум: ствол, 2–3 ветви, 2–4 «шапки» листвы, корни/наросты.
// ---------------------------------------------------------------------------

export function makeTree(variant = 0) {
  const v = ((variant % 3) + 3) % 3;
  const group = new THREE.Group();
  group.name = `tree-${v}`;

  const builder = new VertexColorBuilder(`tree-mesh-${v}`, { roughness: 0.95, metalness: 0.0 });

  const height = [4.6, 3.8, 5.4][v];
  const trunkRadius = [0.28, 0.36, 0.24][v];
  const lean = [0.05, -0.08, 0.11][v];
  const leafColors = [
    [C.leaf1, C.leaf2, C.leaf3],
    [C.leaf2, C.leaf1, C.moss],
    [C.leaf3, C.leaf2, C.leaf1]
  ][v];

  // Ствол (12 сегментов, 4 секции по высоте).
  builder.add(cyl(trunkRadius * 0.62, trunkRadius, height, 12, 4), C.bark, {
    position: [0, height / 2, 0],
    rotation: [0, 0, lean]
  });

  // Ветви.
  const branchCount = v === 1 ? 3 : 4;
  for (let i = 0; i < branchCount; i += 1) {
    const angle = (i / branchCount) * Math.PI * 2 + v * 0.7;
    const y = height * (0.48 + (i % 2) * 0.16);
    const length = height * (0.34 + (i % 3) * 0.05);
    builder.add(cyl(trunkRadius * 0.16, trunkRadius * 0.32, length, 10, 2), C.barkLight, {
      position: [Math.cos(angle) * length * 0.28, y + length * 0.22, Math.sin(angle) * length * 0.28],
      rotation: [Math.sin(angle) * 0.7, 0, -Math.cos(angle) * 0.7]
    });
  }

  // Корни-наросты.
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + 0.4;
    builder.add(cone(trunkRadius * 0.55, trunkRadius * 2.4, 10), C.root, {
      position: [Math.cos(angle) * trunkRadius * 0.9, 0.1, Math.sin(angle) * trunkRadius * 0.9],
      rotation: [Math.PI / 2 + 0.15, 0, -angle]
    });
  }

  // Наросты на стволе.
  for (let i = 0; i < 2; i += 1) {
    builder.add(sph(trunkRadius * (0.42 - i * 0.1), 10, 8), C.barkLight, {
      position: [trunkRadius * 0.75, height * (0.3 + i * 0.22), trunkRadius * 0.2]
    });
  }

  // Кроны: четыре икосаэдра detail 3 (по 1280 тр.) + две сферы.
  // Detail 3 держит бюджет дерева в целевом диапазоне 6–8 тыс. треугольников.
  const crownY = height * 0.86;
  const crownSpread = [1.5, 1.25, 1.9][v];
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + v * 0.5;
    const radius = i === 0 ? 1.25 : 0.85;
    builder.add(ico(radius, 3), leafColors[i % 3], {
      position: [
        Math.cos(angle) * (i === 0 ? 0 : crownSpread * 0.55),
        crownY + (i === 0 ? 0.3 : -0.25 + (i % 2) * 0.3),
        Math.sin(angle) * (i === 0 ? 0 : crownSpread * 0.55)
      ],
      scale: [1, 0.85 + (i % 2) * 0.15, 1]
    });
  }

  // Дополнительные низкополигональные «шапки» для силуэта.
  for (let i = 0; i < 2; i += 1) {
    builder.add(sph([0.95, 1.1, 1.35][v], 20, 14), leafColors[(i + 1) % 3], {
      position: [
        (i === 0 ? 1 : -1) * crownSpread * 0.5,
        crownY - 0.15 + i * 0.35,
        (i === 0 ? -1 : 1) * crownSpread * 0.25
      ],
      scale: [1, 0.8, 1]
    });
  }

  // Свисающие лианы.
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + 1.1;
    builder.add(cyl(0.018, 0.022, height * 0.22, 6, 1), C.moss, {
      position: [
        Math.cos(angle) * crownSpread * 0.75,
        crownY - height * 0.16,
        Math.sin(angle) * crownSpread * 0.75
      ],
      rotation: [0.08 * Math.sin(i), 0, 0.08 * Math.cos(i)]
    });
  }

  group.add(builder.build());
  group.userData.variant = v;
  group.userData.height = height;
  return group;
}

// ---------------------------------------------------------------------------
// Ящик с патронами
// ---------------------------------------------------------------------------

export function makeAmmoCrate() {
  const group = new THREE.Group();
  group.name = 'ammo-crate';

  const builder = new VertexColorBuilder('ammo-crate-mesh', { roughness: 0.72, metalness: 0.35 });

  // Корпус и крышка.
  builder.add(beveledBox(0.92, 0.58, 0.62, 0.02, 1), C.armyGreen, { position: [0, 0.3, 0] });
  builder.add(beveledBox(0.98, 0.14, 0.68, 0.02, 1), C.armyGreenDark, { position: [0, 0.63, 0] });

  // Металлические углы.
  for (let i = 0; i < 4; i += 1) {
    const x = i % 2 === 0 ? -0.43 : 0.43;
    const z = i < 2 ? -0.28 : 0.28;
    builder.add(beveledBox(0.08, 0.62, 0.08, 0.008), C.metalDark, { position: [x, 0.32, z] });
  }

  // Замки и ручка.
  for (const x of [-0.24, 0.24]) {
    builder.add(beveledBox(0.1, 0.12, 0.06, 0.006), C.metalLight, { position: [x, 0.52, 0.33] });
    builder.add(beveledBox(0.05, 0.07, 0.02, 0.003), C.brass, { position: [x, 0.52, 0.37] });
  }
  builder.add(torus(0.13, 0.018, 6, 18), C.leather, {
    position: [0, 0.72, 0],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 0.7, 1]
  });

  // Аквила и наклейки.
  builder.add(beveledBox(0.16, 0.16, 0.02, 0.004), C.brass, { position: [0, 0.34, 0.315] });
  builder.add(beveledBox(0.34, 0.05, 0.015, 0.003), C.medkitRed, { position: [0, 0.22, 0.315] });
  builder.add(beveledBox(0.3, 0.04, 0.015, 0.003), C.brass, { position: [0, 0.16, 0.315] });

  // Заклёпки.
  for (let i = 0; i < 6; i += 1) {
    builder.add(cyl(0.014, 0.014, 0.025, 8, 1), C.metalLight, {
      position: [-0.4 + (i % 3) * 0.4, 0.58, 0.34],
      rotation: [Math.PI / 2, 0, 0]
    });
  }

  // Патронная лента сверху.
  for (let i = 0; i < 5; i += 1) {
    builder.add(cyl(0.026, 0.026, 0.1, 10, 1), C.brass, {
      position: [-0.24 + i * 0.12, 0.75, 0.02],
      rotation: [0, 0, Math.PI / 2]
    });
  }

  group.add(builder.build());
  group.userData.kind = 'ammo';
  return group;
}

// ---------------------------------------------------------------------------
// Аптечка
// ---------------------------------------------------------------------------

export function makeMedkit() {
  const group = new THREE.Group();
  group.name = 'medkit';
  group.userData.kind = 'medkit';

  const builder = new VertexColorBuilder('medkit-mesh', { roughness: 0.6, metalness: 0.25 });

  builder.add(beveledBox(0.6, 0.32, 0.4, 0.018, 1), C.medkitWhite, { position: [0, 0.18, 0] });
  builder.add(beveledBox(0.62, 0.06, 0.42, 0.008), C.medkitRed, { position: [0, 0.36, 0] });

  // Красный крест.
  builder.add(beveledBox(0.26, 0.08, 0.012, 0.003), C.medkitRed, { position: [0, 0.18, 0.205] });
  builder.add(beveledBox(0.08, 0.26, 0.012, 0.003), C.medkitRed, { position: [0, 0.18, 0.205] });

  // Ручка.
  builder.add(torus(0.1, 0.016, 6, 16, Math.PI), C.metalDark, { position: [0, 0.4, 0] });
  builder.add(beveledBox(0.16, 0.04, 0.04, 0.004), C.metalLight, { position: [0, 0.4, 0] });

  // Замки.
  for (const x of [-0.2, 0.2]) {
    builder.add(beveledBox(0.08, 0.06, 0.04, 0.004), C.metalLight, { position: [x, 0.3, 0.21] });
  }

  // Уголки.
  for (let i = 0; i < 4; i += 1) {
    builder.add(beveledBox(0.05, 0.34, 0.05, 0.004), C.metalDark, {
      position: [i % 2 === 0 ? -0.28 : 0.28, 0.18, i < 2 ? -0.18 : 0.18]
    });
  }

  builder.add(cyl(0.05, 0.05, 0.03, 12, 1), C.brass, {
    position: [0.18, 0.39, 0.1],
    rotation: [Math.PI / 2, 0, 0]
  });

  group.add(builder.build());
  return group;
}

// ---------------------------------------------------------------------------
// Ржавая бочка
// ---------------------------------------------------------------------------

export function makeBarrel() {
  const group = new THREE.Group();
  group.name = 'barrel';

  const builder = new VertexColorBuilder('barrel-mesh', { roughness: 0.8, metalness: 0.45 });

  builder.add(cyl(0.34, 0.34, 0.94, 20, 2), C.rust, { position: [0, 0.47, 0] });
  builder.add(cyl(0.35, 0.35, 0.05, 20, 1), C.metalDark, { position: [0, 0.02, 0] });
  builder.add(cyl(0.35, 0.35, 0.05, 20, 1), C.metalDark, { position: [0, 0.92, 0] });

  // Обручи.
  for (let i = 0; i < 3; i += 1) {
    builder.add(torus(0.352, 0.018, 6, 22), C.metalDark, { position: [0, 0.2 + i * 0.28, 0] });
  }

  // Крышка с пробкой.
  builder.add(cyl(0.3, 0.3, 0.03, 20, 1), C.metalLight, { position: [0, 0.95, 0] });
  builder.add(cyl(0.07, 0.07, 0.06, 10, 1), C.brass, { position: [0.12, 0.99, 0.1] });

  // Пятна ржавчины/полосы.
  for (let i = 0; i < 4; i += 1) {
    builder.add(beveledBox(0.12, 0.3, 0.02, 0.003), C.metalDark, {
      position: [Math.cos(i * 1.6) * 0.32, 0.45, Math.sin(i * 1.6) * 0.32],
      rotation: [0, -i * 1.6, 0.1]
    });
  }

  group.add(builder.build());
  return group;
}

// ---------------------------------------------------------------------------
// Костёр (с опциональным мерцающим светом)
// ---------------------------------------------------------------------------

export function makeCampfire({ withLight = false } = {}) {
  const group = new THREE.Group();
  group.name = 'campfire';

  const builder = new VertexColorBuilder('campfire-mesh', { roughness: 0.9, metalness: 0.05 });

  // Камни вокруг.
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    builder.add(new THREE.DodecahedronGeometry(0.15 + (i % 3) * 0.04, 0), C.stone, {
      position: [Math.cos(angle) * 0.62, 0.12, Math.sin(angle) * 0.62],
      rotation: [i, i * 0.7, i * 0.3]
    });
  }

  // Поленья.
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    builder.add(cyl(0.055, 0.07, 0.9, 10, 2), C.wood, {
      position: [Math.cos(angle) * 0.11, 0.14, Math.sin(angle) * 0.11],
      rotation: [Math.PI / 2 - 0.35, angle, 0]
    });
  }

  // Угли и пламя — emissive, отдельными мешами.
  const coals = new THREE.Mesh(
    sph(0.26, 14, 10),
    new THREE.MeshStandardMaterial({
      color: 0xff6b2b,
      emissive: 0xff4a12,
      emissiveIntensity: 2.4,
      roughness: 0.8,
      metalness: 0
    })
  );
  coals.position.y = 0.16;
  coals.scale.y = 0.5;
  coals.castShadow = false;
  group.add(coals);

  const flameMaterial = new THREE.MeshStandardMaterial({
    color: 0xffb032,
    emissive: 0xff7a12,
    emissiveIntensity: 3.0,
    roughness: 0.6,
    metalness: 0,
    transparent: true,
    opacity: 0.9
  });
  for (let i = 0; i < 3; i += 1) {
    const flame = new THREE.Mesh(cone(0.1 - i * 0.02, 0.34 - i * 0.06, 10), flameMaterial);
    flame.position.set((i - 1) * 0.07, 0.34 + i * 0.03, (i % 2 === 0 ? 0.04 : -0.05));
    flame.rotation.z = (i - 1) * 0.16;
    flame.castShadow = false;
    group.add(flame);
  }

  group.add(builder.build());

  if (withLight) {
    const light = new THREE.PointLight(0xff7a22, 2.0, 12, 2);
    light.position.set(0, 0.9, 0);
    light.userData.flicker = true;
    light.userData.baseIntensity = 2.0;
    light.userData.phase = Math.random() * Math.PI * 2;
    group.add(light);
    group.userData.fireLight = light;
  }

  group.userData.kind = 'campfire';
  return group;
}

// ---------------------------------------------------------------------------
// Орочий тотем из костей и железа
// ---------------------------------------------------------------------------

export function makeOrkTotem() {
  const group = new THREE.Group();
  group.name = 'ork-totem';

  const builder = new VertexColorBuilder('ork-totem-mesh', { roughness: 0.68, metalness: 0.4 });

  // Шест.
  builder.add(cyl(0.09, 0.13, 3.6, 16, 3), C.wood, { position: [0, 1.8, 0] });
  builder.add(cone(0.14, 0.3, 12), C.rust, { position: [0, 3.72, 0] });

  // Основание из камней.
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    builder.add(new THREE.DodecahedronGeometry(0.2 + (i % 2) * 0.07, 0), C.stoneDark, {
      position: [Math.cos(angle) * 0.34, 0.15, Math.sin(angle) * 0.34],
      rotation: [i, i * 0.6, i * 0.2]
    });
  }

  // Три черепа.
  for (let i = 0; i < 3; i += 1) {
    const y = 1.5 + i * 0.7;
    builder.add(sph(0.19, 16, 12), C.bone, {
      position: [0, y, 0.13],
      rotation: [0, i * 0.8, 0]
    });
    builder.add(beveledBox(0.2, 0.11, 0.14, 0.008), C.bone, {
      position: [0, y - 0.14, 0.15]
    });
    // Рога.
    for (const side of [-1, 1]) {
      builder.add(cone(0.045, 0.28, 10), C.bone, {
        position: [side * 0.2, y + 0.08, 0.1],
        rotation: [0, 0, side * -1.1]
      });
    }
    // Глазницы.
    for (const side of [-1, 1]) {
      builder.add(sph(0.045, 8, 6), C.stoneDark, {
        position: [side * 0.07, y + 0.02, 0.28]
      });
    }
  }

  // Металлические пластины.
  for (let i = 0; i < 4; i += 1) {
    builder.add(beveledBox(0.34, 0.16, 0.05, 0.008, 1), C.metalDark, {
      position: [0.12 - (i % 2) * 0.24, 0.75 + i * 0.55, 0.02],
      rotation: [0, 0, (i % 2 === 0 ? 1 : -1) * 0.18]
    });
  }

  // Шипы.
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    builder.add(cone(0.04, 0.22, 8), C.metalLight, {
      position: [Math.cos(angle) * 0.16, 2.9 - i * 0.1, Math.sin(angle) * 0.16],
      rotation: [Math.cos(angle) * 0.8, 0, Math.sin(angle) * 0.8]
    });
  }

  // Цепи и кости.
  for (let i = 0; i < 4; i += 1) {
    builder.add(torus(0.07, 0.012, 6, 14), C.rust, {
      position: [0.18, 2.2 - i * 0.16, 0],
      rotation: [0, Math.PI / 2, i * 0.3]
    });
  }
  for (let i = 0; i < 3; i += 1) {
    builder.add(cyl(0.03, 0.04, 0.5, 8, 2), C.bone, {
      position: [-0.2 + i * 0.2, 0.55, 0.14],
      rotation: [0.3, 0, 0.9 - i * 0.7]
    });
  }

  // Лоскут ткани.
  builder.add(beveledBox(0.42, 0.6, 0.03, 0.006), C.medkitRed, {
    position: [0.3, 2.0, 0],
    rotation: [0, 0, 0.08]
  });

  group.add(builder.build());
  group.userData.kind = 'totem';
  return group;
}
