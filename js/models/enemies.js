// Модели орков: бойз, стрелок, ноб.
// Ключевая идея производительности: тело собрано из 3 мешей (органика,
// броня, глаза), каждая рука/нога — ОДИН меш с vertex colors, оружие — 1 меш.
// Итого 8–9 draw call'ов на орка вместо 40+.

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

// Оттенки из §2.4/§3.4 «графика.txt».
const C = {
  skinLight: 0x6b8b4a,
  skinMedium: 0x577a3e,
  skinDark: 0x42612f,
  metalDark: 0x2a2a2e,
  metalLight: 0x6b6b70,
  rust: 0x5a3a28,
  leather: 0x3a2e28,
  leatherDark: 0x241b16,
  cloth: 0x4a4436,
  wood: 0x4a3826,
  bone: 0xc9bea0,
  brass: 0x9a7a3a
};

// ---------------------------------------------------------------------------
// Топор
// ---------------------------------------------------------------------------

function buildAxe(isNob) {
  const group = new THREE.Group();
  group.name = 'ork-axe';

  const builder = new VertexColorBuilder('ork-axe-mesh', { roughness: 0.52, metalness: 0.68 });

  const handleLength = isNob ? 1.6 : 1.1;
  const bladeWidth = isNob ? 0.5 : 0.34;
  const bladeHeight = isNob ? 0.46 : 0.32;
  const bladeDepth = isNob ? 0.07 : 0.05;

  // Рукоять вдоль -Y от ладони.
  builder.add(cyl(0.033, 0.045, handleLength, 16, 2), C.wood, {
    position: [0, -handleLength / 2 + 0.18, 0]
  });

  // Обмотка рукояти.
  for (let i = 0; i < 3; i += 1) {
    builder.add(torus(0.048, 0.009, 6, 12), C.leather, {
      position: [0, 0.02 - i * 0.07, 0],
      rotation: [Math.PI / 2, 0, 0]
    });
  }

  // Навершие.
  builder.add(sph(0.055, 12, 8), C.metalLight, { position: [0, 0.19, 0] });

  // Клинок.
  const bladeY = -handleLength + 0.28;
  builder.add(beveledBox(bladeWidth, bladeHeight, bladeDepth, 0.012, 1), C.metalLight, {
    position: [bladeWidth * 0.45, bladeY, 0],
    rotation: [0, 0, 0.08]
  });
  builder.add(beveledBox(bladeWidth * 0.75, bladeHeight * 0.2, bladeDepth * 0.8, 0.006), C.rust, {
    position: [bladeWidth * 0.45, bladeY - bladeHeight * 0.4, 0],
    rotation: [0, 0, 0.08]
  });

  // Обух-шип с другой стороны.
  builder.add(cone(0.065, 0.26, 12), C.metalDark, {
    position: [-0.13, bladeY + 0.02, 0],
    rotation: [0, 0, Math.PI / 2]
  });

  // Кольца крепления.
  builder.add(torus(0.055, 0.012, 6, 14), C.metalLight, {
    position: [0, -0.35, 0],
    rotation: [Math.PI / 2, 0, 0]
  });
  builder.add(torus(0.058, 0.012, 6, 14), C.rust, {
    position: [0, bladeY + bladeHeight * 0.55, 0],
    rotation: [Math.PI / 2, 0, 0]
  });

  if (isNob) {
    // Цепь на обухе и дополнительные зубья.
    for (let i = 0; i < 10; i += 1) {
      builder.add(torus(0.028, 0.008, 6, 12), C.metalLight, {
        position: [-0.17 - (i % 2) * 0.02, bladeY + 0.25 - i * 0.055, 0],
        rotation: [0, Math.PI / 2, 0]
      });
    }
    for (let i = 0; i < 8; i += 1) {
      builder.add(beveledBox(0.045, 0.06, bladeDepth * 0.9, 0.004), C.metalLight, {
        position: [bladeWidth * 0.9, bladeY + bladeHeight * 0.36 - i * 0.055, 0]
      });
    }
    // Трофейный череп на рукояти.
    builder.add(sph(0.085, 16, 12), C.bone, { position: [0, -0.28, 0.09] });
    builder.add(beveledBox(0.1, 0.05, 0.08, 0.006), C.bone, { position: [0, -0.34, 0.11] });
  }

  group.add(builder.build());
  return group;
}

// ---------------------------------------------------------------------------
// «Шутта» стрелка
// Ствол направлен вдоль -Y: рука стрелка повёрнута вперёд, и оружие
// автоматически смотрит вперёд.
// ---------------------------------------------------------------------------

function buildShoota() {
  const group = new THREE.Group();
  group.name = 'ork-shoota';

  const builder = new VertexColorBuilder('ork-shoota-mesh', { roughness: 0.5, metalness: 0.72 });

  // Корпус.
  builder.add(beveledBox(0.15, 0.24, 0.18, 0.012), C.metalDark, { position: [0, -0.08, 0] });
  // Ствол.
  builder.add(cyl(0.055, 0.066, 0.62, 20, 2), C.metalLight, { position: [0, -0.48, 0] });
  // Кожух ствола.
  builder.add(cyl(0.078, 0.085, 0.26, 20, 1, true), C.rust, { position: [0, -0.32, 0] });
  // Раструб.
  builder.add(cyl(0.11, 0.075, 0.13, 20, 1, true), C.metalLight, { position: [0, -0.8, 0] });

  // Магазин.
  builder.add(beveledBox(0.095, 0.22, 0.12, 0.008), C.rust, {
    position: [0.07, -0.12, 0.07],
    rotation: [0, 0, -0.22]
  });

  // Приклад и рукоять.
  builder.add(beveledBox(0.1, 0.13, 0.26, 0.008), C.wood, { position: [0, 0.1, -0.2] });
  builder.add(beveledBox(0.07, 0.16, 0.09, 0.008), C.leather, {
    position: [0, -0.15, 0.16],
    rotation: [0.35, 0, 0]
  });

  // Прицел.
  builder.add(beveledBox(0.045, 0.09, 0.05, 0.006), C.metalLight, { position: [0, 0.1, 0.08] });
  builder.add(beveledBox(0.03, 0.02, 0.16, 0.004), C.metalDark, { position: [0, 0.17, 0.02] });

  // Ремень.
  builder.add(torus(0.13, 0.009, 6, 20), C.leather, {
    position: [0.11, -0.18, -0.02],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 0.65, 1]
  });

  // Крепёжные болты.
  for (let i = 0; i < 5; i += 1) {
    builder.add(cyl(0.012, 0.012, 0.025, 8, 1), C.brass, {
      position: [0.08, 0.02 - i * 0.06, 0.05],
      rotation: [0, 0, Math.PI / 2]
    });
  }

  group.add(builder.build());

  // Светящийся наконечник ствола: отдельный меш с уникальным материалом.
  const glowMaterial = M.uniqueGlow(0xffa32b);
  glowMaterial.emissiveIntensity = 0;
  const glow = new THREE.Mesh(cyl(0.062, 0.07, 0.12, 16, 1), glowMaterial);
  glow.position.set(0, -0.86, 0);
  glow.castShadow = false;
  glow.receiveShadow = false;
  group.add(glow);

  addMarker(group, 'muzzle', [0, -0.94, 0]);

  group.userData.glow = glow;
  group.userData.glowMaterial = glowMaterial;
  return group;
}

// ---------------------------------------------------------------------------
// Руки и ноги
// ---------------------------------------------------------------------------

function buildArm(side, isNob) {
  const group = new THREE.Group();
  group.name = side > 0 ? 'ork-right-arm' : 'ork-left-arm';

  const shoulderX = isNob ? 0.6 : 0.45;
  const shoulderY = isNob ? 1.54 : 1.43;
  group.position.set(side * shoulderX, shoulderY, 0);

  // Единый меш на руку: кожа + доспех + кожаные ремни.
  const builder = new VertexColorBuilder('ork-arm-mesh', { roughness: 0.76, metalness: 0.24 });

  // Плечевая пластина.
  builder.add(sph(1, isNob ? 24 : 20, isNob ? 18 : 14), C.metalDark, {
    position: [0, 0.02, 0],
    scale: [isNob ? 0.36 : 0.3, isNob ? 0.29 : 0.24, isNob ? 0.34 : 0.28]
  });
  builder.add(torus(isNob ? 0.33 : 0.27, 0.03, 8, 20), C.rust, {
    position: [0, -0.08, 0],
    rotation: [Math.PI / 2, 0, 0]
  });

  // Шипы на плече.
  const spikes = isNob ? 3 : 1;
  for (let i = 0; i < spikes; i += 1) {
    builder.add(cone(0.06, isNob ? 0.28 : 0.2, 12), C.metalLight, {
      position: [(i - (spikes - 1) / 2) * 0.13, isNob ? 0.3 : 0.24, 0],
      rotation: [0, 0, (i - (spikes - 1) / 2) * 0.35]
    });
  }

  // Плечо и бицепс.
  builder.add(sph(0.16, 16, 12), C.skinMedium, { position: [0, -0.16, 0] });
  builder.add(cyl(0.105, 0.13, 0.3, 18, 2), C.skinMedium, { position: [0, -0.34, 0] });

  // Локоть.
  builder.add(sph(0.115, 14, 10), C.skinDark, { position: [0, -0.52, 0] });

  // Предплечье и наруч.
  builder.add(cyl(0.09, 0.11, 0.3, 18, 2), C.skinLight, { position: [0, -0.68, 0] });
  builder.add(beveledBox(0.2, 0.1, 0.24, 0.01), C.metalLight, { position: [0, -0.68, 0.02] });
  builder.add(torus(0.1, 0.014, 6, 16), C.leather, {
    position: [0, -0.54, 0],
    rotation: [Math.PI / 2, 0, 0]
  });

  // Кисть и пальцы.
  builder.add(sph(0.1, 14, 10), C.skinLight, { position: [0, -0.87, 0.02] });
  for (let i = -1; i <= 1; i += 1) {
    builder.add(beveledBox(0.045, 0.07, 0.06, 0.006), C.skinDark, {
      position: [i * 0.045, -0.93, 0.06]
    });
  }
  builder.add(beveledBox(0.04, 0.06, 0.06, 0.006), C.skinDark, {
    position: [0.09, -0.88, 0.02],
    rotation: [0, 0, -0.4]
  });

  // Заклёпки на наплечнике.
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    builder.add(cyl(0.014, 0.014, 0.022, 8, 1), C.metalLight, {
      position: [Math.cos(angle) * 0.22, 0.02, Math.sin(angle) * 0.24],
      rotation: [Math.PI / 2, 0, 0]
    });
  }

  if (isNob) {
    // Цепь, обмотанная вокруг плеча.
    for (let i = 0; i < 6; i += 1) {
      builder.add(torus(0.035, 0.009, 6, 10), C.metalLight, {
        position: [side * 0.24, 0.02 - i * 0.05, Math.sin(i * 1.1) * 0.1],
        rotation: [Math.PI / 2, 0, i * 0.4]
      });
    }
  }

  group.add(builder.build());

  addMarker(group, 'hand', [0, -0.95, 0.06]);
  return group;
}

function buildLeg(side, isNob) {
  const group = new THREE.Group();
  group.name = side > 0 ? 'ork-right-leg' : 'ork-left-leg';

  group.position.set(side * (isNob ? 0.3 : 0.22), isNob ? 1.16 : 0.96, 0);

  const builder = new VertexColorBuilder('ork-leg-mesh', { roughness: 0.8, metalness: 0.2 });

  // Бедро (штаны).
  builder.add(cyl(0.13, 0.16, 0.36, 18, 2), C.leather, { position: [0, -0.18, 0] });
  builder.add(torus(0.14, 0.02, 6, 14), C.leatherDark, {
    position: [0, -0.03, 0],
    rotation: [Math.PI / 2, 0, 0]
  });

  // Колено и наколенник.
  builder.add(sph(0.13, 14, 10), C.skinDark, { position: [0, -0.4, 0] });
  builder.add(beveledBox(0.24, isNob ? 0.24 : 0.2, 0.08, 0.012), C.metalDark, {
    position: [0, -0.4, 0.11]
  });
  builder.add(cyl(0.018, 0.018, 0.03, 8, 1), C.metalLight, {
    position: [0, -0.4, 0.16],
    rotation: [Math.PI / 2, 0, 0]
  });

  // Голень.
  builder.add(cyl(0.1, 0.12, 0.34, 18, 2), C.skinMedium, { position: [0, -0.6, 0] });

  // Ботинок.
  builder.add(beveledBox(0.27, 0.2, 0.4, 0.014, 1), C.metalDark, {
    position: [0, -0.84, 0.06]
  });
  builder.add(beveledBox(0.28, 0.07, 0.13, 0.008), C.metalLight, {
    position: [0, -0.87, 0.24]
  });
  builder.add(beveledBox(0.22, 0.07, 0.1, 0.006), C.rust, {
    position: [0, -0.74, 0.18]
  });

  group.add(builder.build());
  return group;
}

// ---------------------------------------------------------------------------
// Тело
// ---------------------------------------------------------------------------

function buildBody(isNob) {
  const body = new THREE.Group();
  body.name = 'ork-body';

  const organic = new VertexColorBuilder('ork-body-organic', { roughness: 0.88, metalness: 0.0 });
  const armor = new VertexColorBuilder('ork-body-armor', { roughness: 0.5, metalness: 0.78 });
  const eyes = new ModelBuilder('ork-eyes');

  const seg = isNob ? 32 : 24;
  const rows = isNob ? 24 : 18;

  // Таз и торс.
  organic.add(beveledBox(isNob ? 0.6 : 0.5, isNob ? 0.38 : 0.32, isNob ? 0.42 : 0.34, 0.02), C.leather, {
    position: [0, 0.94, 0]
  });

  organic.add(sph(1, seg, rows), C.skinMedium, {
    position: [0, 1.24, 0],
    scale: [isNob ? 0.52 : 0.42, isNob ? 0.55 : 0.45, isNob ? 0.42 : 0.33]
  });

  // Живот (более тёмный оттенок).
  organic.add(sph(1, 16, 12), C.skinDark, {
    position: [0, 1.02, 0.17],
    scale: [0.32, 0.24, 0.2]
  });

  // Шея.
  organic.add(cyl(0.12, 0.16, 0.16, 16, 1), C.skinDark, { position: [0, 1.56, 0] });

  // Голова — светлее торса.
  organic.add(sph(1, seg, rows), C.skinLight, {
    position: [0, 1.74, 0.01],
    scale: [0.25, 0.26, 0.24]
  });

  // Нижняя челюсть.
  organic.add(beveledBox(0.27, 0.13, 0.21, 0.014), C.skinDark, { position: [0, 1.64, 0.12] });

  // Клыки.
  for (const x of [-0.075, 0.075]) {
    organic.add(cone(0.03, 0.14, 10), C.bone, {
      position: [x, 1.69, 0.22],
      rotation: [0.22, 0, 0]
    });
  }

  // Зубы нижней челюсти.
  for (let i = 0; i < 4; i += 1) {
    organic.add(cone(0.014, 0.04, 8), C.bone, {
      position: [-0.075 + i * 0.05, 1.69, 0.2],
      rotation: [Math.PI, 0, 0]
    });
  }

  // Надбровная дуга, нос, уши.
  organic.add(beveledBox(0.3, 0.05, 0.08, 0.006), C.skinDark, { position: [0, 1.8, 0.19] });
  organic.add(beveledBox(0.08, 0.09, 0.08, 0.008), C.skinDark, { position: [0, 1.72, 0.22] });
  for (const side of [-1, 1]) {
    organic.add(cone(0.055, 0.16, 8), C.skinDark, {
      position: [side * 0.24, 1.76, 0.0],
      rotation: [0, 0, side * -Math.PI / 2]
    });
  }

  // Глаза (emissive, отдельный меш).
  for (const x of [-0.085, 0.085]) {
    eyes.add(sph(0.034, isNob ? 20 : 16, isNob ? 16 : 12), M.orkEye(), {
      position: [x, 1.78, 0.2]
    });
  }

  // Нагрудная пластина.
  const plateDepth = isNob ? 0.1 : 0.08;
  armor.add(beveledBox(isNob ? 0.64 : 0.54, isNob ? 0.42 : 0.34, plateDepth, 0.016, isNob ? 2 : 1), C.metalDark, {
    position: [0, 1.3, 0.27],
    rotation: [-0.08, 0, 0]
  });
  armor.add(beveledBox(isNob ? 0.6 : 0.5, 0.05, plateDepth * 0.8, 0.006), C.metalLight, {
    position: [0, 1.16, 0.29],
    rotation: [-0.08, 0, 0]
  });

  // Спинная пластина.
  armor.add(beveledBox(isNob ? 0.6 : 0.5, isNob ? 0.46 : 0.38, 0.08, 0.014, isNob ? 2 : 1), C.metalDark, {
    position: [0, 1.3, -0.27],
    rotation: [0.08, 0, 0]
  });

  // Плечевые ремни.
  for (const side of [-1, 1]) {
    organic.add(beveledBox(0.09, 0.5, 0.05, 0.008), C.leather, {
      position: [side * 0.2, 1.38, 0.24],
      rotation: [0, 0, side * 0.08]
    });
  }

  // Пояс.
  organic.add(cyl(0.38, 0.4, 0.12, 20, 1), C.leather, { position: [0, 0.94, 0] });
  armor.add(beveledBox(0.22, 0.16, 0.07, 0.01), C.metalLight, { position: [0, 0.94, 0.39] });
  armor.add(torus(0.07, 0.016, 6, 14), C.brass, { position: [0, 0.94, 0.42] });

  // Набедренная повязка.
  organic.add(beveledBox(0.3, 0.34, 0.05, 0.008), C.cloth, {
    position: [0, 0.74, 0.24],
    rotation: [0.12, 0, 0]
  });

  // Заклёпки и шипы на броне.
  for (let i = 0; i < 12; i += 1) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    armor.add(cyl(0.014, 0.014, 0.026, 8, 1), C.metalLight, {
      position: [-0.18 + col * 0.12, 1.4 - row * 0.11, 0.32],
      rotation: [Math.PI / 2, 0, 0]
    });
  }

  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    armor.add(torus(0.022, 0.008, 6, 10), C.brass, {
      position: [Math.cos(angle) * 0.2, 1.27 + Math.sin(angle) * 0.12, 0.325],
      rotation: [0, 0, 0]
    });
  }

  // Костяное ожерелье.
  for (let i = 0; i < 6; i += 1) {
    organic.add(cone(0.025, 0.11, 8), C.bone, {
      position: [-0.15 + i * 0.06, 1.48 - Math.abs(i - 2.5) * 0.015, 0.23],
      rotation: [Math.PI, 0, 0]
    });
  }

  if (isNob) {
    // ----- Дополнительная броня ноба -----

    // Шлем.
    armor.add(sph(1, 32, 24), C.metalDark, {
      position: [0, 1.82, 0.0],
      scale: [0.29, 0.25, 0.29]
    });
    armor.add(torus(0.25, 0.03, 8, 24), C.metalLight, {
      position: [0, 1.72, 0],
      rotation: [Math.PI / 2, 0, 0]
    });

    // Рога шлема.
    for (const side of [-1, 1]) {
      armor.add(cone(0.06, 0.35, 16), C.bone, {
        position: [side * 0.23, 2.0, 0],
        rotation: [0, 0, side * -0.95]
      });
      armor.add(cyl(0.05, 0.06, 0.08, 12, 1), C.brass, {
        position: [side * 0.25, 1.92, 0]
      });
    }

    // Дополнительные пластины: бока, живот, спина, бёдра.
    for (const side of [-1, 1]) {
      armor.add(beveledBox(0.18, 0.36, 0.08, 0.016, 2), C.metalDark, {
        position: [side * 0.4, 1.32, 0.16],
        rotation: [0, side * 0.35, 0]
      });
      armor.add(beveledBox(0.2, 0.3, 0.08, 0.014, 2), C.metalLight, {
        position: [side * 0.34, 0.95, 0.2],
        rotation: [0, side * 0.3, 0]
      });
    }

    armor.add(beveledBox(0.5, 0.26, 0.09, 0.016, 2), C.metalDark, {
      position: [0, 1.02, 0.3],
      rotation: [-0.12, 0, 0]
    });
    armor.add(beveledBox(0.56, 0.3, 0.08, 0.016, 2), C.metalDark, {
      position: [0, 1.05, -0.3],
      rotation: [0.1, 0, 0]
    });

    // 20 дополнительных заклёпок.
    for (let i = 0; i < 20; i += 1) {
      const angle = (i / 20) * Math.PI * 2;
      armor.add(torus(0.02, 0.008, 6, 10), C.metalLight, {
        position: [Math.cos(angle) * 0.32, 1.12 + Math.sin(angle) * 0.2, 0.36]
      });
    }

    // Второй ряд заклёпок на брюшной плите (+12 × 144 тр.).
    for (let i = 0; i < 12; i += 1) {
      armor.add(torus(0.022, 0.009, 6, 12), C.brass, {
        position: [-0.2 + (i % 6) * 0.08, 1.02 + Math.floor(i / 6) * 0.09, 0.36]
      });
    }

    // Цепь, обёрнутая вокруг босспола (+16 × 168 тр.).
    for (let i = 0; i < 16; i += 1) {
      armor.add(torus(0.035, 0.01, 6, 14), C.rust, {
        position: [0.02, 0.55 + i * 0.12, -0.42],
        rotation: [Math.PI / 2, i * 0.6, 0]
      });
    }

    // Босспол (шест с черепами) за спиной.
    organic.add(cyl(0.035, 0.045, 2.2, 16, 2), C.wood, { position: [0.02, 1.5, -0.42] });
    for (let i = 0; i < 5; i += 1) {
      armor.add(sph(0.105, 16, 12), C.bone, {
        position: [0.02, 0.75 + i * 0.34, -0.42],
        rotation: [0, i * 0.7, 0]
      });
      armor.add(beveledBox(0.11, 0.055, 0.08, 0.006), C.bone, {
        position: [0.02, 0.69 + i * 0.34, -0.4]
      });
      armor.add(cone(0.022, 0.12, 8), C.bone, {
        position: [0.02, 0.62 + i * 0.34, -0.42],
        rotation: [0, 0, 0.2]
      });
    }
    for (let i = 0; i < 8; i += 1) {
      armor.add(cone(0.03, 0.14, 8), C.metalLight, {
        position: [0.02, 2.55 - i * 0.08, -0.42],
        rotation: [0, i * 0.8, i % 2 === 0 ? 0.7 : -0.7]
      });
    }
    for (let i = 0; i < 4; i += 1) {
      armor.add(torus(0.06, 0.012, 6, 12), C.rust, {
        position: [0.02, 1.9 - i * 0.3, -0.42],
        rotation: [Math.PI / 2, 0, 0]
      });
    }
  }

  body.add(organic.build());
  body.add(armor.build());
  body.add(eyes.build());
  return body;
}

// ---------------------------------------------------------------------------
// Сборка орка
// ---------------------------------------------------------------------------

function buildOrk(variant, weaponType) {
  const isNob = variant === 'nob';
  const root = new THREE.Group();
  root.name = isNob ? 'ork-nob' : (weaponType === 'shoota' ? 'ork-shooter' : 'ork-boy');

  const body = buildBody(isNob);
  root.add(body);

  const leftArm = buildArm(-1, isNob);
  const rightArm = buildArm(1, isNob);
  const leftLeg = buildLeg(-1, isNob);
  const rightLeg = buildLeg(1, isNob);

  root.add(leftArm, rightArm, leftLeg, rightLeg);

  let weapon = null;

  if (weaponType === 'axe') {
    weapon = buildAxe(isNob);
    weapon.position.set(0, -0.95, 0.06);
    weapon.rotation.z = -0.08;
    rightArm.add(weapon);
    rightArm.rotation.x = 0.34;
    rightArm.rotation.z = -0.12;
  } else if (weaponType === 'shoota') {
    weapon = buildShoota();
    weapon.position.set(0, -0.97, 0.02);
    rightArm.add(weapon);
    rightArm.rotation.x = 1.32;
    rightArm.rotation.z = -0.16;
  }

  leftArm.rotation.x = -0.08;
  leftArm.rotation.z = 0.12;

  if (isNob) {
    root.scale.setScalar(1.5);
  }

  root.userData = {
    variant,
    weaponType,
    body,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weapon,
    height: isNob ? 3.0 : 2.0,
    radius: isNob ? 0.7 : 0.45,
    eyeMaterial: M.orkEye()
  };

  return root;
}

export function makeOrkBoy() {
  return buildOrk('boy', 'axe');
}

export function makeOrkShooter() {
  return buildOrk('shooter', 'shoota');
}

export function makeOrkNob() {
  return buildOrk('nob', 'axe');
}

// Анимация простоя: дыхание торса. Походка и замах реализуются в enemies.js (Фаза 4).
export function animateOrkIdle(ork, time) {
  const body = ork.userData?.body;
  if (!body) return;
  const breathing = Math.sin(time * 2.1 + (ork.id || 0)) * 0.012;
  body.scale.set(1 + breathing * 0.4, 1 + breathing, 1 + breathing * 0.4);
}
