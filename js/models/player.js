// Модели от первого лица: болтер, цепной меч, руки комиссара, граната.
// Всё собрано из примитивов; статичные детали слиты по материалам.

import * as THREE from 'three';
import {
  M,
  ModelBuilder,
  beveledBox,
  addMarker
} from './utils.js';

// Базовые геометрические шорткаты.
const cyl = (rt, rb, h, seg = 16, hs = 1, open = false) =>
  new THREE.CylinderGeometry(rt, rb, h, seg, hs, open);
const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg);
const torus = (r, t, rs = 8, ts = 16, arc = Math.PI * 2) =>
  new THREE.TorusGeometry(r, t, rs, ts, arc);

// ---------------------------------------------------------------------------
// Болтер
// Оружие ориентировано стволом в -Z (как и камера игрока).
// Минимум по §2.4: ствол, дульный тормоз, ресивер, магазин, рукоять, приклад,
// прицел, цевьё, порт выброса, рукоятка взведения, болты, ремень.
// ---------------------------------------------------------------------------

export function makeBolter() {
  const group = new THREE.Group();
  group.name = 'bolter';

  const dark = M.darkMetal();
  const light = M.lightMetal();
  const gunmetal = M.gunmetal();
  const leather = M.leather();
  const brass = M.brass();
  const glow = M.glowOrange();

  const body = new ModelBuilder('bolter-body');

  // 1. Ресивер — фаскованный корпус.
  body.add(beveledBox(0.15, 0.17, 0.46, 0.012, 1), dark, { position: [0, 0, 0.02] });

  // Верхняя крышка и планка прицела.
  body.add(beveledBox(0.11, 0.035, 0.4, 0.006), gunmetal, { position: [0, 0.1, 0] });
  body.add(beveledBox(0.055, 0.012, 0.3, 0.003), light, { position: [0, 0.125, -0.02] });

  // 2. Ствол (20 сегментов) и внутренний канал.
  body.add(cyl(0.025, 0.03, 0.56, 20, 2), light, {
    position: [0, 0.02, -0.5],
    rotation: [Math.PI / 2, 0, 0]
  });
  body.add(cyl(0.014, 0.014, 0.6, 16, 1, true), gunmetal, {
    position: [0, 0.02, -0.52],
    rotation: [Math.PI / 2, 0, 0]
  });

  // Кожух ствола.
  body.add(cyl(0.046, 0.05, 0.32, 20, 1, true), dark, {
    position: [0, 0.02, -0.3],
    rotation: [Math.PI / 2, 0, 0]
  });

  // Охлаждающие кольца.
  for (let i = 0; i < 4; i += 1) {
    body.add(torus(0.049, 0.007, 8, 20), gunmetal, {
      position: [0, 0.02, -0.2 - i * 0.08]
    });
  }

  // 3. Дульный тормоз: тор и кольцо.
  body.add(torus(0.043, 0.014, 12, 28), gunmetal, { position: [0, 0.02, -0.755] });
  body.add(cyl(0.052, 0.046, 0.055, 20, 1, true), light, {
    position: [0, 0.02, -0.77],
    rotation: [Math.PI / 2, 0, 0]
  });

  // Цевьё снизу.
  body.add(beveledBox(0.1, 0.06, 0.28, 0.008), dark, { position: [0, -0.075, -0.28] });
  body.add(beveledBox(0.07, 0.02, 0.26, 0.004), light, { position: [0, -0.11, -0.28] });

  // 4. Приклад и затыльник.
  body.add(beveledBox(0.12, 0.115, 0.3, 0.012), dark, { position: [0, -0.01, 0.33] });
  body.add(beveledBox(0.14, 0.16, 0.045, 0.008), gunmetal, { position: [0, -0.01, 0.5] });
  body.add(beveledBox(0.09, 0.03, 0.16, 0.006), leather, { position: [0, 0.055, 0.36] });

  // 5. Рукоять под углом и спусковая скоба.
  body.add(beveledBox(0.07, 0.19, 0.1, 0.01), leather, {
    position: [0, -0.16, 0.15],
    rotation: [0.36, 0, 0]
  });
  body.add(beveledBox(0.022, 0.03, 0.03, 0.004), brass, {
    position: [0, -0.08, 0.115]
  });
  body.add(torus(0.047, 0.007, 8, 18), gunmetal, {
    position: [0, -0.115, 0.09],
    rotation: [0, Math.PI / 2, 0]
  });

  // 6. Прицел: корпус, объектив, окуляр, кронштейны.
  body.add(cyl(0.032, 0.032, 0.22, 20, 1, true), dark, {
    position: [0, 0.165, -0.02],
    rotation: [Math.PI / 2, 0, 0]
  });
  body.add(cyl(0.038, 0.038, 0.04, 20, 1, true), gunmetal, {
    position: [0, 0.165, -0.14],
    rotation: [Math.PI / 2, 0, 0]
  });
  body.add(cyl(0.034, 0.034, 0.035, 20, 1, true), gunmetal, {
    position: [0, 0.165, 0.09],
    rotation: [Math.PI / 2, 0, 0]
  });
  body.add(torus(0.036, 0.005, 8, 20), brass, { position: [0, 0.165, -0.155] });
  body.add(torus(0.032, 0.005, 8, 20), brass, { position: [0, 0.165, 0.105] });
  body.add(beveledBox(0.03, 0.05, 0.03, 0.004), light, { position: [0, 0.14, -0.1] });
  body.add(beveledBox(0.03, 0.05, 0.03, 0.004), light, { position: [0, 0.14, 0.04] });

  // Линза объектива.
  body.add(cyl(0.03, 0.03, 0.006, 20), M.glowBlue(), {
    position: [0, 0.165, -0.157],
    rotation: [Math.PI / 2, 0, 0]
  });

  // 7. Порт выброса гильз и рукоятка взведения.
  body.add(beveledBox(0.018, 0.05, 0.12, 0.004), gunmetal, { position: [0.077, 0.03, 0.02] });
  body.add(beveledBox(0.012, 0.03, 0.09, 0.003), leather, { position: [0.084, 0.03, 0.02] });
  body.add(cyl(0.012, 0.012, 0.08, 10, 1), light, {
    position: [-0.095, 0.055, 0.14],
    rotation: [0, 0, Math.PI / 2]
  });
  body.add(sph(0.022, 12, 8), gunmetal, { position: [-0.14, 0.055, 0.14] });

  // 8. Крепёжные болты по бокам ресивера.
  for (let i = 0; i < 6; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const z = -0.12 + Math.floor(i / 2) * 0.13;
    body.add(cyl(0.009, 0.009, 0.022, 8, 1), brass, {
      position: [side * 0.078, -0.02, z],
      rotation: [0, 0, Math.PI / 2]
    });
  }

  // 9. Ремень: плоские кожаные ленты вдоль левого бока (без огромного тора,
  // который на первом плане перекрывал обзор).
  body.add(beveledBox(0.025, 0.09, 0.36, 0.004), leather, {
    position: [-0.085, -0.14, 0.2],
    rotation: [0.15, 0, 0.08]
  });
  body.add(beveledBox(0.035, 0.06, 0.1, 0.004), leather, {
    position: [-0.085, -0.09, 0.02]
  });

  // 10. Аквила на ресивере (декоративная пластина + два «крыла»).
  body.add(beveledBox(0.03, 0.03, 0.05, 0.004), brass, { position: [-0.078, 0.0, 0.1] });
  for (let i = 0; i < 2; i += 1) {
    body.add(beveledBox(0.018, 0.008, 0.06, 0.002), brass, {
      position: [-0.082, 0.01, 0.12 + i * 0.027],
      rotation: [0, 0, (i === 0 ? 1 : -1) * 0.35]
    });
  }

  group.add(body.build());

  // Магазин — отдельная группа для анимации перезарядки.
  const magazine = new ModelBuilder('bolter-magazine');
  magazine.add(beveledBox(0.085, 0.23, 0.13, 0.01), dark, { position: [0, -0.115, 0] });
  magazine.add(beveledBox(0.09, 0.035, 0.14, 0.006), light, { position: [0, -0.235, 0] });
  magazine.add(beveledBox(0.08, 0.02, 0.11, 0.004), brass, { position: [0, 0.006, 0] });
  magazine.add(beveledBox(0.09, 0.012, 0.135, 0.003), gunmetal, { position: [0, -0.07, 0] });
  const magazineGroup = magazine.build();
  magazineGroup.position.set(0, -0.135, -0.03);
  magazineGroup.rotation.x = -0.12;
  group.add(magazineGroup);

  // Светящаяся точка на прицеле (для читаемости в темноте).
  body.addMesh(group, sph(0.006, 8, 6), glow, { position: [0, 0.195, 0.02] }, { castShadow: false });

  // Маркеры: дуло и выброс гильз.
  addMarker(group, 'muzzle', [0, 0.02, -0.81]);
  addMarker(group, 'eject', [0.09, 0.04, 0.02]);
  addMarker(group, 'grip', [0, -0.17, 0.15]);

  group.userData.magazine = magazineGroup;
  group.userData.weaponType = 'bolter';
  group.userData.restPosition = new THREE.Vector3(0.27, -0.26, -0.52);
  group.userData.restRotation = new THREE.Euler(0.02, -0.06, 0);

  return group;
}

// ---------------------------------------------------------------------------
// Цепной меч
// Минимум: рукоять с обмоткой, гарда, корпус мотора, рёбра, основание клинка,
// клинок, зубья, видимая цепь, крепление к руке.
// ---------------------------------------------------------------------------

export function makeChainsword() {
  const group = new THREE.Group();
  group.name = 'chainsword';

  const dark = M.darkMetal();
  const light = M.lightMetal();
  const gunmetal = M.gunmetal();
  const leather = M.leather();
  const brass = M.brass();
  const rust = M.rustMetal();

  const body = new ModelBuilder('chainsword-body');

  // 1. Рукоять.
  body.add(cyl(0.026, 0.03, 0.24, 16, 1), leather, {
    position: [0, 0, 0.12],
    rotation: [Math.PI / 2, 0, 0]
  });
  body.add(cyl(0.032, 0.032, 0.03, 16, 1), gunmetal, {
    position: [0, 0, 0.24],
    rotation: [Math.PI / 2, 0, 0]
  });

  // 2. Обмотка рукояти — четыре тора.
  for (let i = 0; i < 4; i += 1) {
    body.add(torus(0.032, 0.006, 8, 20), leather, { position: [0, 0, 0.04 + i * 0.055] });
  }

  // 3. Навершие.
  body.add(sph(0.04, 16, 12), brass, { position: [0, 0, 0.275] });

  // 4. Гарда.
  body.add(beveledBox(0.2, 0.14, 0.04, 0.008), gunmetal, { position: [0, 0, -0.015] });
  body.add(beveledBox(0.23, 0.03, 0.05, 0.006), brass, { position: [0, 0, -0.02] });

  // 5. Корпус мотора.
  body.add(beveledBox(0.13, 0.16, 0.22, 0.012), dark, { position: [0, 0, -0.16] });
  body.add(beveledBox(0.1, 0.03, 0.16, 0.006), gunmetal, { position: [0, 0.075, -0.16] });

  // 6. Вентиляционные рёбра сбоку.
  for (let i = 0; i < 5; i += 1) {
    body.add(beveledBox(0.014, 0.095, 0.022, 0.003), light, {
      position: [0.07, 0, -0.08 - i * 0.045]
    });
  }

  // 7. Выхлопные трубы мотора.
  for (let i = 0; i < 3; i += 1) {
    body.add(cyl(0.012, 0.016, 0.12, 10, 1), rust, {
      position: [-0.05 + i * 0.05, -0.1, -0.1],
      rotation: [0.4, 0, 0]
    });
  }

  // 8. Основание клинка.
  body.add(beveledBox(0.085, 0.16, 0.12, 0.008), gunmetal, { position: [0, 0, -0.33] });

  // 9. Клинок со скосом (фаскованный бокс).
  body.add(beveledBox(0.05, 0.15, 0.52, 0.008), light, { position: [0, 0, -0.64] });
  body.add(beveledBox(0.035, 0.06, 0.46, 0.006), gunmetal, { position: [0, 0.05, -0.64] });

  // 10. Зубья по правому краю.
  const teeth = new THREE.Group();
  teeth.name = 'chain-teeth';
  for (let i = 0; i < 12; i += 1) {
    body.add(beveledBox(0.03, 0.045, 0.032, 0.003), light, {
      position: [0.036, 0.0, -0.43 - i * 0.042]
    });
  }
  group.add(teeth);

  // 11. Видимая цепь: звенья-торы в плоскости YZ.
  const chain = new THREE.Group();
  chain.name = 'chain-links';
  const chainLinks = [];
  for (let i = 0; i < 14; i += 1) {
    const link = new THREE.Mesh(torus(0.021, 0.006, 6, 10), gunmetal);
    link.position.set(0.038, 0, -0.4 - i * 0.036);
    link.rotation.y = Math.PI / 2;
    link.castShadow = true;
    chain.add(link);
    chainLinks.push(link);
  }
  group.add(chain);

  // 12. Наконечник клинка.
  body.add(cone(0.032, 0.1, 10), light, {
    position: [0, 0, -0.94],
    rotation: [-Math.PI / 2, 0, 0]
  });

  // 13. Крепление к руке и болты.
  body.add(beveledBox(0.06, 0.11, 0.08, 0.006), leather, { position: [0, -0.02, 0.02] });
  for (let i = 0; i < 4; i += 1) {
    body.add(cyl(0.01, 0.01, 0.026, 8, 1), brass, {
      position: [-0.075, -0.03 + i * 0.04, -0.12],
      rotation: [0, 0, Math.PI / 2]
    });
  }

  // 14. Декоративный череп на гарде.
  body.add(sph(0.03, 14, 10), M.bone(), { position: [0, 0.09, -0.02] });
  body.add(beveledBox(0.045, 0.02, 0.03, 0.004), M.bone(), { position: [0, 0.065, -0.02] });

  group.add(body.build());

  group.userData.chain = chain;
  group.userData.chainLinks = chainLinks;
  group.userData.teeth = teeth;
  group.userData.weaponType = 'chainsword';
  group.userData.restPosition = new THREE.Vector3(0.3, -0.3, -0.5);
  group.userData.restRotation = new THREE.Euler(0.1, -0.18, -0.12);

  addMarker(group, 'bladeTip', [0, 0, -1.0]);
  addMarker(group, 'grip', [0, 0, 0.12]);

  return group;
}

// ---------------------------------------------------------------------------
// Руки игрока (вид от первого лица)
// ---------------------------------------------------------------------------

export function makePlayerArms() {
  const group = new THREE.Group();
  group.name = 'player-arms';

  const leather = M.leather();
  const leatherDark = M.leatherDark();
  const dark = M.darkMetal();
  const brass = M.brass();
  const skin = M.skin();

  const buildArm = (side) => {
    const armGroup = new THREE.Group();
    armGroup.name = side > 0 ? 'right-arm' : 'left-arm';

    const builder = new ModelBuilder(`${armGroup.name}-parts`);

    // Манжета.
    builder.add(torus(0.058, 0.016, 8, 22), leatherDark, { position: [0, 0, 0.05] });
    builder.add(cyl(0.062, 0.058, 0.035, 18, 1), dark, {
      position: [0, 0, 0.02],
      rotation: [Math.PI / 2, 0, 0]
    });

    // Предплечье в тёмной перчатке — чтобы руки не спорили с оружием.
    builder.add(cyl(0.052, 0.058, 0.3, 18, 2), leather, {
      position: [0, 0, -0.15],
      rotation: [Math.PI / 2, 0, 0]
    });

    // Наручная броня.
    builder.add(beveledBox(0.1, 0.08, 0.16, 0.008), dark, { position: [0, 0.035, -0.13] });
    builder.add(beveledBox(0.095, 0.012, 0.05, 0.003), brass, { position: [0, 0.077, -0.1] });

    // Кисть.
    builder.add(sph(0.055, 14, 10), leatherDark, { position: [0, 0, -0.32], scale: [1, 0.9, 1.1] });
    builder.add(beveledBox(0.095, 0.075, 0.12, 0.008), leather, { position: [0, 0, -0.39] });

    // Пальцы (3 бокса).
    for (let i = 0; i < 3; i += 1) {
      builder.add(beveledBox(0.024, 0.032, 0.095, 0.004), leatherDark, {
        position: [-0.028 + i * 0.028, -0.012, -0.48],
        rotation: [0.25, 0, 0]
      });
    }

    // Большой палец.
    builder.add(beveledBox(0.028, 0.034, 0.075, 0.004), leatherDark, {
      position: [0.05, 0.015, -0.4],
      rotation: [0.3, 0, -0.5]
    });

    // Застёжка перчатки.
    builder.add(beveledBox(0.04, 0.014, 0.03, 0.003), brass, { position: [0, 0.04, -0.39] });

    armGroup.add(builder.build());

    const hand = addMarker(armGroup, 'hand', [0, 0, -0.46]);
    armGroup.userData.hand = hand;
    return armGroup;
  };

  const rightArm = buildArm(1);
  const leftArm = buildArm(-1);

  // Правая рука — на рукояти, левая — поддержка цевья.
  rightArm.position.set(0.26, -0.3, -0.42);
  rightArm.rotation.set(-0.18, -0.08, 0.05);

  leftArm.position.set(-0.1, -0.34, -0.5);
  leftArm.rotation.set(-0.28, 0.38, -0.16);

  group.add(rightArm);
  group.add(leftArm);

  group.userData.rightArm = rightArm;
  group.userData.leftArm = leftArm;

  return group;
}

// ---------------------------------------------------------------------------
// ПЗРК (переносной зенитный ракетный комплекс)
// Труба направлена стволом в -Z, как и остальное оружие от первого лица.
// ---------------------------------------------------------------------------

export function makeLauncher() {
  const group = new THREE.Group();
  group.name = 'pzrk-launcher';

  const body = new ModelBuilder('pzrk-body');

  const dark = M.darkMetal();
  const light = M.lightMetal();
  const green = M.armyGreen();
  const brass = M.brass();
  const glow = M.glowRed();

  // Основная труба.
  body.add(cyl(0.115, 0.125, 1.45, 20, 3), green, {
    position: [0, 0, -0.2],
    rotation: [Math.PI / 2, 0, 0]
  });

  // Усилительные кольца.
  for (const z of [-0.75, -0.3, 0.15, 0.48]) {
    body.add(cyl(0.135, 0.135, 0.06, 20, 1), dark, {
      position: [0, 0, z],
      rotation: [Math.PI / 2, 0, 0]
    });
  }

  // Задний раструб.
  body.add(cyl(0.17, 0.13, 0.26, 20, 1, true), dark, {
    position: [0, 0, 0.65],
    rotation: [Math.PI / 2, 0, 0]
  });

  // Передняя крышка и ракета в трубе.
  body.add(cyl(0.13, 0.13, 0.08, 20, 1), light, {
    position: [0, 0, -0.95],
    rotation: [Math.PI / 2, 0, 0]
  });
  body.add(cone(0.08, 0.28, 16), glow, {
    position: [0, 0, -1.06],
    rotation: [-Math.PI / 2, 0, 0]
  });

  // Прицел сверху.
  body.add(beveledBox(0.09, 0.11, 0.3, 0.01), dark, { position: [0, 0.17, -0.25] });
  body.add(beveledBox(0.06, 0.06, 0.05, 0.008), light, { position: [0, 0.2, -0.4] });
  body.add(cyl(0.03, 0.03, 0.16, 12, 1), dark, {
    position: [0, 0.18, 0.0],
    rotation: [Math.PI / 2, 0, 0]
  });

  // Рукоять и спусковая скоба.
  body.add(beveledBox(0.07, 0.2, 0.09, 0.012), dark, {
    position: [0, -0.17, 0.02],
    rotation: [0.18, 0, 0]
  });
  body.add(torus(0.06, 0.012, 8, 16, Math.PI), brass, {
    position: [0, -0.1, 0.07],
    rotation: [0, 0, Math.PI]
  });

  // Плечевой упор.
  body.add(beveledBox(0.26, 0.16, 0.22, 0.02), dark, {
    position: [0, -0.12, 0.48],
    rotation: [-0.15, 0, 0]
  });

  // Ремень и крепления.
  body.add(torus(0.16, 0.012, 6, 20, Math.PI), brass, {
    position: [0.02, -0.06, 0.48],
    rotation: [Math.PI / 2, 0, 0]
  });
  for (let i = 0; i < 4; i += 1) {
    body.add(cyl(0.012, 0.012, 0.03, 8, 1), light, {
      position: [0.12, 0.02, -0.6 + i * 0.34],
      rotation: [0, 0, Math.PI / 2]
    });
  }

  group.add(body.build());
  addMarker(group, 'muzzle', [0, 0, -1.16]);

  group.userData.weaponType = 'pzrk';
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });
  return group;
}

// ---------------------------------------------------------------------------
// Граната
// ---------------------------------------------------------------------------

export function makeGrenade() {
  const group = new THREE.Group();
  group.name = 'grenade';

  const body = new ModelBuilder('grenade-body');
  const dark = M.darkMetal();
  const light = M.lightMetal();
  const brass = M.brass();
  const glow = M.glowRed();

  // Корпус.
  body.add(sph(0.055, 20, 14), dark, { scale: [1, 1.18, 1] });

  // 10 шипов по поверхности.
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    const y = -0.035 + (i % 3) * 0.035;
    body.add(sph(0.013, 8, 6), light, {
      position: [Math.cos(angle) * 0.052, y, Math.sin(angle) * 0.052]
    });
  }

  // Кольцо и чека.
  body.add(torus(0.026, 0.006, 8, 18), brass, {
    position: [0, 0.072, 0],
    rotation: [Math.PI / 2, 0, 0]
  });
  body.add(cyl(0.017, 0.017, 0.03, 12, 1), light, { position: [0, 0.07, 0] });

  // Рычаг.
  body.add(beveledBox(0.022, 0.014, 0.09, 0.003), light, {
    position: [0.025, 0.058, -0.02],
    rotation: [0.2, 0, -0.15]
  });

  // Светящийся индикатор.
  body.add(sph(0.008, 8, 6), glow, { position: [0.04, 0.03, 0.035] }, { castShadow: false });

  group.add(body.build());
  group.userData.weaponType = 'grenade';
  return group;
}
