// Крупные объекты окружения: обломки «Валькирии», генератор выработки,
// мешки с песком, ворота штаба и имперский флаг.

import * as THREE from 'three';
import {
  M,
  ModelBuilder,
  VertexColorBuilder,
  beveledBox,
  addMarker
} from './utils.js';

const cyl = (rt, rb, h, seg = 16, hs = 1, open = false) =>
  new THREE.CylinderGeometry(rt, rb, h, seg, hs, open);
const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg);
const torus = (r, t, rs = 8, ts = 16, arc = Math.PI * 2) =>
  new THREE.TorusGeometry(r, t, rs, ts, arc);

const C = {
  metalDark: 0x2a2a2e,
  metalLight: 0x6b6b70,
  rust: 0x5a3a28,
  brass: 0x9a7a3a,
  leather: 0x3a2e28,
  cloth: 0x4a4436,
  armyGreen: 0x3e4a2c,
  armyGreenDark: 0x2f3922,
  sandbag: 0x6b5f42,
  sandbagDark: 0x574c34,
  bone: 0xc9bea0
};

// ---------------------------------------------------------------------------
// Обломки «Валькирии»
// Минимум: 2–3 секции фюзеляжа, крыло, хвост, 2 двигателя, кабина,
// шасси, оторванные панели, провода, источник света внутри.
// ---------------------------------------------------------------------------

export function makeValkyrieWreck() {
  const group = new THREE.Group();
  group.name = 'valkyrie-wreck';

  const builder = new ModelBuilder('valkyrie-static');

  const dark = M.darkMetal();
  const light = M.lightMetal();
  const rust = M.rustMetal();
  const glass = M.glass();
  const brass = M.brass();
  const glow = M.glowOrange();
  const leather = M.leather();

  // ---- Фюзеляж: три секции разного радиуса ----
  builder.add(cyl(0.95, 1.0, 3.2, 24, 3), dark, {
    position: [0, 1.0, -0.4],
    rotation: [Math.PI / 2, 0, 0]
  });
  builder.add(cyl(0.68, 0.92, 1.9, 24, 3), light, {
    position: [0, 0.95, -2.5],
    rotation: [Math.PI / 2, 0, 0]
  });
  builder.add(cyl(0.52, 0.9, 2.5, 24, 3), dark, {
    position: [0, 1.02, 2.0],
    rotation: [Math.PI / 2, 0, 0]
  });

  // Носовой обтекатель.
  builder.add(cone(0.66, 1.3, 20), rust, {
    position: [0, 0.95, -3.75],
    rotation: [-Math.PI / 2, 0, 0]
  });

  // Разломы: тёмные кольца и рваные пластины.
  for (let i = 0; i < 5; i += 1) {
    builder.add(torus(0.88 - i * 0.05, 0.05, 8, 22), rust, {
      position: [0, 0.95 + (i % 2) * 0.1, -1.3 + i * 0.7]
    });
  }

  // ---- Крыло и обломки законцовок ----
  builder.add(beveledBox(7.4, 0.22, 2.7, 0.02, 2), dark, {
    position: [0, 1.05, 0.15],
    rotation: [0, 0, 0.05]
  });
  for (const side of [-1, 1]) {
    builder.add(beveledBox(1.5, 0.2, 2.2, 0.02, 1), rust, {
      position: [side * 4.1, 0.95, 0.5],
      rotation: [0.12, side * 0.35, side * 0.22]
    });
    builder.add(beveledBox(0.5, 0.06, 1.1, 0.01), light, {
      position: [side * 3.6, 1.25, 0.3],
      rotation: [0, side * 0.2, 0]
    });
  }

  // ---- Хвостовое оперение ----
  builder.add(beveledBox(0.14, 1.5, 1.3, 0.02, 1), dark, {
    position: [0, 2.15, 3.0],
    rotation: [-0.32, 0, 0]
  });
  builder.add(beveledBox(2.7, 0.12, 0.75, 0.015, 1), rust, {
    position: [0, 1.45, 3.15],
    rotation: [0, 0, -0.08]
  });
  builder.add(beveledBox(0.4, 0.55, 0.8, 0.012), light, {
    position: [0, 2.75, 3.4],
    rotation: [-0.3, 0, 0]
  });

  // ---- Двигатели ----
  for (const side of [-1, 1]) {
    const ex = side * 2.75;

    builder.add(cyl(0.44, 0.5, 1.7, 24, 2), dark, {
      position: [ex, 1.0, -0.15],
      rotation: [Math.PI / 2, 0, 0]
    });
    // Входное кольцо.
    builder.add(torus(0.45, 0.08, 12, 28), rust, {
      position: [ex, 1.0, -1.02]
    });
    // Вентилятор: ступица + 12 лопастей.
    builder.add(sph(0.16, 12, 8), light, { position: [ex, 1.0, -1.02] });
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      builder.add(beveledBox(0.07, 0.62, 0.025, 0.004), light, {
        position: [ex + Math.cos(angle) * 0.23, 1.0 + Math.sin(angle) * 0.23, -1.03],
        rotation: [0, 0, angle]
      });
    }
    // Сопло.
    builder.add(cone(0.42, 0.7, 24), rust, {
      position: [ex, 1.0, 1.05],
      rotation: [Math.PI / 2, 0, 0]
    });
    // Пилон.
    builder.add(beveledBox(0.35, 0.5, 1.2, 0.015), light, {
      position: [ex, 0.75, -0.1]
    });
    // Обломок лопасти.
    builder.add(beveledBox(0.9, 0.05, 0.22, 0.006), light, {
      position: [ex + side * 0.6, 1.55, 0.1],
      rotation: [0.2, side * 0.6, 0.3]
    });
  }

  // ---- Кабина и «стекло» ----
  builder.add(beveledBox(1.5, 0.95, 1.5, 0.02, 2), dark, {
    position: [0, 1.2, -2.2]
  });
  builder.add(sph(1, 24, 18), glass, {
    position: [0, 1.35, -2.95],
    scale: [0.72, 0.5, 0.42]
  });
  for (const side of [-1, 1]) {
    builder.add(beveledBox(0.08, 0.7, 0.1, 0.006), light, {
      position: [side * 0.6, 1.4, -2.85],
      rotation: [0, side * 0.2, 0]
    });
  }
  builder.add(beveledBox(1.2, 0.08, 0.1, 0.006), light, {
    position: [0, 1.72, -2.9]
  });

  // ---- Шасси ----
  for (const side of [-1, 1]) {
    builder.add(cyl(0.07, 0.09, 0.85, 10, 1), light, {
      position: [side * 1.35, 0.45, 0.9],
      rotation: [0.2, 0, side * 0.25]
    });
    builder.add(torus(0.28, 0.1, 8, 20), leather, {
      position: [side * 1.55, 0.14, 1.05],
      rotation: [0, Math.PI / 2, 0]
    });
    builder.add(cyl(0.11, 0.11, 0.18, 12, 1), light, {
      position: [side * 1.55, 0.14, 1.05],
      rotation: [0, 0, Math.PI / 2]
    });
  }
  // Передняя стойка.
  builder.add(cyl(0.06, 0.08, 0.7, 10, 1), light, {
    position: [0, 0.4, -2.4],
    rotation: [0.15, 0, 0]
  });

  // ---- Оторванные панели ----
  const panelSpots = [
    [-3.4, 0.12, 3.2, 0.3, 1.1],
    [3.0, 0.1, 3.8, -0.4, 0.8],
    [-4.6, 0.08, -1.8, 0.7, 1.4],
    [4.4, 0.14, -2.4, -0.9, 1.0],
    [1.6, 0.09, 4.6, 1.3, 0.7]
  ];
  for (const [x, y, z, ry, size] of panelSpots) {
    builder.add(beveledBox(size, 0.06, size * 0.6, 0.008, 1), rust, {
      position: [x, y, z],
      rotation: [0.05, ry, 0.04]
    });
    builder.add(beveledBox(size * 0.55, 0.04, size * 0.3, 0.006), light, {
      position: [x + 0.1, y + 0.06, z + 0.1],
      rotation: [0.05, ry + 0.2, 0.04]
    });
  }

  // ---- Провода ----
  const wireSpecs = [
    [-1.2, 1.6, -1.4, 0.6, 0.4, 0.3, 1.1],
    [1.4, 1.2, -1.1, -0.5, 0.8, -0.2, 0.9],
    [-0.8, 0.7, 2.6, 0.3, -0.8, 0.5, 1.2],
    [1.1, 0.9, 2.9, -0.4, 0.6, 0.4, 0.8],
    [2.2, 1.3, 0.6, 0.9, 0.2, -0.6, 0.7],
    [-2.4, 1.2, 0.4, -0.7, -0.3, 0.5, 0.9]
  ];
  for (const [x, y, z, rx, ry, rz, len] of wireSpecs) {
    builder.add(cyl(0.012, 0.012, len, 6, 1), brass, {
      position: [x, y, z],
      rotation: [rx, ry, rz]
    });
  }

  // ---- Заклёпки ----
  for (let i = 0; i < 24; i += 1) {
    const z = -3.0 + (i % 12) * 0.55;
    const side = i < 12 ? -1 : 1;
    builder.add(cyl(0.022, 0.022, 0.03, 8, 1), rust, {
      position: [side * 0.93, 1.15, z],
      rotation: [0, 0, Math.PI / 2]
    });
  }

  // ---- Внутренние шпангоуты и кресла ----
  for (let i = 0; i < 5; i += 1) {
    builder.add(torus(0.82, 0.045, 8, 22), rust, {
      position: [0, 1.0, -0.9 + i * 0.75]
    });
  }
  for (const side of [-1, 1]) {
    builder.add(beveledBox(0.55, 0.12, 0.55, 0.01), leather, {
      position: [side * 0.38, 1.25, 0.2]
    });
    builder.add(beveledBox(0.55, 0.55, 0.12, 0.01), leather, {
      position: [side * 0.38, 1.55, 0.45],
      rotation: [-0.15, 0, 0]
    });
    builder.add(beveledBox(0.5, 0.06, 0.04, 0.005), light, {
      position: [side * 0.38, 0.9, -0.6]
    });
  }

  // ---- Антенна и мелкие детали ----
  builder.add(cyl(0.02, 0.03, 1.4, 8, 1), light, {
    position: [0.7, 2.0, 2.4],
    rotation: [0.2, 0, 0.3]
  });
  builder.add(sph(0.05, 8, 6), glow, { position: [0.85, 2.65, 2.55] });

  group.add(builder.build());

  // Тусклый оранжевый свет внутри обломков.
  const interiorLight = new THREE.PointLight(0xff6a22, 1.2, 9, 2);
  interiorLight.position.set(0, 1.05, -0.2);
  interiorLight.userData.flicker = true;
  interiorLight.userData.baseIntensity = 1.2;
  interiorLight.userData.phase = Math.random() * Math.PI * 2;
  group.add(interiorLight);

  addMarker(group, 'lightSource', [0, 1.05, -0.2]);
  addMarker(group, 'smokeOrigin', [0, 1.8, -0.8]);

  group.userData.light = interiorLight;
  group.userData.kind = 'wreck';
  return group;
}

// ---------------------------------------------------------------------------
// Генератор орочьей выработки
// ---------------------------------------------------------------------------

export function makeGenerator() {
  const group = new THREE.Group();
  group.name = 'ork-generator';

  const builder = new ModelBuilder('generator-static');

  const dark = M.darkMetal();
  const light = M.lightMetal();
  const rust = M.rustMetal();
  const brass = M.brass();
  const glow = M.glowBlue();
  const glowRed = M.glowRed();

  // Основание.
  builder.add(beveledBox(2.6, 0.4, 1.9, 0.03, 2), dark, { position: [0, 0.2, 0] });
  builder.add(beveledBox(2.2, 0.2, 1.6, 0.02), rust, { position: [0, 0.48, 0] });

  // Основной корпус-цилиндр.
  builder.add(cyl(0.95, 1.05, 2.4, 24, 3), dark, { position: [0, 1.75, 0] });
  for (const y of [0.85, 2.35]) {
    builder.add(torus(1.0, 0.09, 12, 28), rust, {
      position: [0, y, 0],
      rotation: [Math.PI / 2, 0, 0]
    });
  }

  // Крышка и верхний вентиль.
  builder.add(cyl(0.7, 0.95, 0.25, 24, 1), light, { position: [0, 3.05, 0] });
  builder.add(cyl(0.18, 0.24, 0.4, 16, 1), brass, { position: [0, 3.3, 0] });

  // Боковая панель управления.
  builder.add(beveledBox(0.8, 1.35, 0.55, 0.02, 2), light, {
    position: [1.25, 1.35, 0.35],
    rotation: [0, -0.15, 0]
  });
  builder.add(beveledBox(0.65, 0.5, 0.06, 0.008), dark, {
    position: [1.62, 1.6, 0.55],
    rotation: [0, -0.15, 0]
  });
  for (let i = 0; i < 4; i += 1) {
    builder.add(cyl(0.07, 0.07, 0.04, 14, 1), i % 2 === 0 ? glow : glowRed, {
      position: [1.46 + (i % 2) * 0.16, 1.72 - Math.floor(i / 2) * 0.18, 0.59],
      rotation: [Math.PI / 2, 0, -0.15]
    });
  }
  // Рычаги.
  for (let i = 0; i < 3; i += 1) {
    builder.add(cyl(0.025, 0.03, 0.3, 8, 1), brass, {
      position: [1.4 + i * 0.1, 1.05, 0.52],
      rotation: [0.5, 0, (i - 1) * 0.2]
    });
  }

  // Трубы.
  const pipes = [
    [0.0, 2.6, -1.0, 1.2, 0, 0, 0.12],
    [0.0, 2.2, -1.1, 1.0, 0.4, 0, 0.1],
    [0.0, 1.6, -1.15, 0.8, -0.4, 0, 0.1],
    [0.0, 1.0, -1.1, 0.7, 0.8, 0, 0.11],
    [-1.2, 2.2, 0.2, 0.9, 0, 1.1, 0.09],
    [-1.25, 1.5, 0.2, 0.7, 0, -0.8, 0.09]
  ];
  for (const [x, y, z, len, rx, rz, radius] of pipes) {
    builder.add(cyl(radius, radius, len, 16, 2), rust, {
      position: [x, y, z],
      rotation: [rx, 0, rz]
    });
    builder.add(cyl(radius * 1.4, radius * 1.4, 0.08, 16, 1), light, {
      position: [x, y, z],
      rotation: [rx, 0, rz]
    });
  }

  // Вентиляционные решётки.
  for (let i = 0; i < 6; i += 1) {
    builder.add(beveledBox(0.5, 0.06, 0.1, 0.006), rust, {
      position: [-0.9, 1.0 + i * 0.24, 0.8],
      rotation: [0, 0.1, 0]
    });
  }

  // Выхлопные трубы.
  for (const side of [-1, 1]) {
    builder.add(cyl(0.16, 0.2, 1.6, 20, 2), dark, {
      position: [side * 0.95, 3.6, -0.4]
    });
    builder.add(cyl(0.24, 0.2, 0.2, 20, 1), rust, {
      position: [side * 0.95, 4.45, -0.4]
    });
  }

  // Кабели.
  builder.add(cyl(0.045, 0.045, 2.2, 8, 3), brass, {
    position: [1.05, 0.3, -0.9],
    rotation: [0, 0.4, 1.35]
  });
  builder.add(cyl(0.035, 0.035, 1.8, 8, 3), brass, {
    position: [-1.1, 0.3, -0.8],
    rotation: [0, -0.5, 1.25]
  });

  // Лестница.
  for (const side of [-1, 1]) {
    builder.add(beveledBox(0.06, 2.2, 0.06, 0.006), rust, {
      position: [1.55 + side * 0.18, 1.4, -0.6]
    });
  }
  for (let i = 0; i < 6; i += 1) {
    builder.add(beveledBox(0.42, 0.045, 0.06, 0.004), rust, {
      position: [1.55, 0.55 + i * 0.34, -0.6]
    });
  }

  // Предупреждающая полоса.
  builder.add(beveledBox(0.9, 0.08, 0.02, 0.003), M.glowYellow(), {
    position: [0, 0.62, 0.96]
  });

  group.add(builder.build());
  group.userData.kind = 'generator';
  return group;
}

// ---------------------------------------------------------------------------
// Мешки с песком
// ---------------------------------------------------------------------------

export function makeSandbags() {
  const group = new THREE.Group();
  group.name = 'sandbags';

  const builder = new VertexColorBuilder('sandbags-mesh', { roughness: 0.98, metalness: 0.0 });

  const rows = 3;
  const perRow = 5;

  for (let row = 0; row < rows; row += 1) {
    for (let i = 0; i < perRow; i += 1) {
      const offset = row % 2 === 0 ? 0 : 0.28;
      const x = (i - (perRow - 1) / 2) * 0.58 + offset;
      const y = 0.18 + row * 0.3;
      builder.add(sph(1, 10, 8), (row + i) % 2 === 0 ? C.sandbag : C.sandbagDark, {
        position: [x, y, 0],
        scale: [0.32, 0.17, 0.23],
        rotation: [0, (i % 2 === 0 ? 1 : -1) * 0.08, 0.02]
      });
    }
  }

  // Колышки и перевязки.
  for (const side of [-1, 1]) {
    builder.add(cyl(0.04, 0.05, 0.9, 8, 1), C.armyGreenDark, {
      position: [side * 1.5, 0.4, 0.2],
      rotation: [0.1, 0, side * 0.15]
    });
  }
  for (let i = 0; i < 4; i += 1) {
    builder.add(beveledBox(0.08, 0.1, 0.06, 0.004), C.armyGreenDark, {
      position: [-1.2 + i * 0.8, 0.2, 0.24]
    });
  }

  group.add(builder.build());
  group.userData.kind = 'cover';
  group.userData.coverHeight = 0.9;
  return group;
}

// ---------------------------------------------------------------------------
// Ворота штаба (со створками для анимации открытия)
// ---------------------------------------------------------------------------

export function makeHQGate() {
  const group = new THREE.Group();
  group.name = 'hq-gate';

  const builder = new ModelBuilder('hq-gate-static');

  const dark = M.darkMetal();
  const light = M.lightMetal();
  const rust = M.rustMetal();
  const brass = M.brass();
  const gold = M.gold();
  const army = M.armyGreen();
  const glow = M.glowYellow();

  // Столбы.
  for (const side of [-1, 1]) {
    builder.add(beveledBox(1.2, 0.5, 1.2, 0.03, 2), rust, {
      position: [side * 2.9, 0.25, 0]
    });
    builder.add(beveledBox(0.9, 4.2, 0.9, 0.03, 2), dark, {
      position: [side * 2.9, 2.35, 0]
    });
    builder.add(beveledBox(1.1, 0.25, 1.1, 0.02), light, {
      position: [side * 2.9, 4.5, 0]
    });
    // Заклёпки на столбе.
    for (let i = 0; i < 6; i += 1) {
      builder.add(cyl(0.03, 0.03, 0.04, 8, 1), brass, {
        position: [side * 2.9, 0.8 + i * 0.6, 0.46],
        rotation: [Math.PI / 2, 0, 0]
      });
    }
    // Прожектор.
    builder.add(beveledBox(0.35, 0.3, 0.35, 0.012), light, {
      position: [side * 2.9, 4.75, 0.3]
    });
    builder.add(cyl(0.16, 0.2, 0.45, 20, 1), light, {
      position: [side * 2.9, 4.95, 0.55],
      rotation: [Math.PI / 2 - 0.3, 0, 0]
    });
    builder.add(cyl(0.17, 0.17, 0.04, 20, 1), glow, {
      position: [side * 2.9, 5.1, 0.73],
      rotation: [Math.PI / 2 - 0.3, 0, 0]
    });
  }

  // Перекладина.
  builder.add(beveledBox(6.5, 0.55, 0.65, 0.03, 2), dark, { position: [0, 4.35, 0] });
  builder.add(beveledBox(6.8, 0.12, 0.72, 0.02), light, { position: [0, 4.7, 0] });

  // Аквила над воротами.
  builder.add(sph(0.28, 16, 12), gold, { position: [0, 5.05, 0.05] });
  builder.add(beveledBox(0.22, 0.2, 0.14, 0.008), gold, { position: [0, 4.85, 0.08] });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      builder.add(beveledBox(0.55 - i * 0.1, 0.09, 0.08, 0.006), gold, {
        position: [side * (0.45 + i * 0.42), 5.15 + i * 0.1, 0.04],
        rotation: [0, 0, side * (0.22 + i * 0.12)]
      });
    }
  }
  builder.add(beveledBox(0.12, 0.7, 0.08, 0.006), gold, { position: [0, 4.6, 0.04] });

  // Армейская эмблема на перекладине.
  builder.add(beveledBox(1.2, 0.12, 0.02, 0.003), army, { position: [0, 4.12, 0.34] });

  // Колючая проволока.
  for (let i = 0; i < 3; i += 1) {
    builder.add(torus(0.35, 0.02, 6, 16, Math.PI * 1.4), rust, {
      position: [-1.8 + i * 1.8, 4.0, 0.4],
      rotation: [0, 0, i * 0.5]
    });
  }
  for (let i = 0; i < 10; i += 1) {
    builder.add(cone(0.03, 0.14, 6), light, {
      position: [-2.4 + i * 0.55, 4.05, 0.42],
      rotation: [0, 0, i % 2 === 0 ? 0.8 : -0.8]
    });
  }

  // Лестницы вдоль столбов.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i += 1) {
      builder.add(beveledBox(0.05, 2.8, 0.05, 0.004), light, {
        position: [side * 2.9 - 0.35 + i * 0.7, 1.8, 0.52]
      });
    }
    for (let i = 0; i < 7; i += 1) {
      builder.add(beveledBox(0.65, 0.04, 0.05, 0.003), light, {
        position: [side * 2.9, 0.65 + i * 0.4, 0.52]
      });
    }
  }

  // Флагшток на перекладине (сам флаг — отдельная модель).
  builder.add(cyl(0.035, 0.045, 2.6, 12, 1), light, { position: [-1.8, 5.3, 0] });

  // Декоративные заклёпки-розетки на столбах:
  // добивают ворота до бюджета 5000+ треугольников.
  for (let i = 0; i < 20; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    builder.add(torus(0.035, 0.012, 6, 8), brass, {
      position: [side * 2.9, 1.0 + row * 0.42, 0.46]
    });
  }

  group.add(builder.build());

  // ---- Створки ворот (отдельные группы для анимации) ----
  const buildDoor = (name) => {
    const doorBuilder = new ModelBuilder(name);
    doorBuilder.add(beveledBox(2.45, 3.2, 0.14, 0.02, 2), rust, { position: [0, 1.65, 0] });
    // Вертикальные рёбра.
    for (let i = 0; i < 4; i += 1) {
      doorBuilder.add(beveledBox(0.06, 3.1, 0.18, 0.006), dark, {
        position: [-1.0 + i * 0.67, 1.65, 0.03]
      });
    }
    for (let i = 0; i < 3; i += 1) {
      doorBuilder.add(beveledBox(2.35, 0.06, 0.18, 0.006), dark, {
        position: [0, 0.5 + i * 1.2, 0.03]
      });
    }
    // Заклёпки.
    for (let i = 0; i < 6; i += 1) {
      doorBuilder.add(cyl(0.025, 0.025, 0.03, 8, 1), brass, {
        position: [-0.9 + (i % 3) * 0.9, 1.0 + Math.floor(i / 3) * 1.2, 0.09],
        rotation: [Math.PI / 2, 0, 0]
      });
    }
    return doorBuilder.build();
  };

  const leftDoor = buildDoor('hq-gate-left-door');
  const rightDoor = buildDoor('hq-gate-right-door');

  leftDoor.position.set(-2.55, 0, 0.05);
  rightDoor.position.set(2.55, 0, 0.05);

  group.add(leftDoor, rightDoor);

  group.userData.kind = 'gate';
  group.userData.leftDoor = leftDoor;
  group.userData.rightDoor = rightDoor;
  group.userData.flagMount = [-1.8, 5.3, 0];

  addMarker(group, 'entry', [0, 0, 1.5]);
  return group;
}

// ---------------------------------------------------------------------------
// Имперский флаг
// ---------------------------------------------------------------------------

export function makeFlag() {
  const group = new THREE.Group();
  group.name = 'imperial-flag';

  const builder = new ModelBuilder('flag-static');
  const light = M.lightMetal();
  const gold = M.gold();
  const cloth = M.clothRed();

  builder.add(cyl(0.035, 0.045, 3.0, 16, 2), light, { position: [0, 1.5, 0] });
  builder.add(sph(0.09, 12, 8), gold, { position: [0, 3.05, 0] });
  builder.add(beveledBox(0.06, 0.06, 0.06, 0.004), gold, { position: [0, 2.9, 0] });

  // Полотнище.
  builder.add(beveledBox(1.7, 1.0, 0.025, 0.004), cloth, { position: [0.9, 2.35, 0] });
  // Аквила на полотнище.
  builder.add(sph(0.11, 12, 8), gold, { position: [0.9, 2.45, 0.03] });
  for (const side of [-1, 1]) {
    builder.add(beveledBox(0.5, 0.06, 0.02, 0.002), gold, {
      position: [0.9 + side * 0.32, 2.45, 0.03],
      rotation: [0, 0, side * 0.3]
    });
  }
  builder.add(beveledBox(0.55, 0.18, 0.02, 0.003), gold, { position: [0.9, 2.15, 0.03] });

  // Крепления.
  for (let i = 0; i < 3; i += 1) {
    builder.add(torus(0.05, 0.01, 6, 12), light, {
      position: [0.04, 2.7 - i * 0.35, 0],
      rotation: [0, Math.PI / 2, 0]
    });
  }

  group.add(builder.build());
  group.userData.kind = 'flag';
  return group;
}
