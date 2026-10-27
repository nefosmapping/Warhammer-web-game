// Детализированная процедурная «Валькирия» (Warhammer 40k).
// Модель перенесена из прототипа «валькирия 3d.html» и адаптирована под
// общие утилиты проекта: VertexColorBuilder, beveledBox, слияние геометрии.
// Используется в кат-сцене вступления и в фоновых воздушных боях.

import * as THREE from 'three';
import { VertexColorBuilder, beveledBox, addMarker } from './utils.js';

const cyl = (rt, rb, h, seg = 16, hs = 1, open = false) =>
  new THREE.CylinderGeometry(rt, rb, h, seg, hs, open);
const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg);
const torus = (r, t, rs = 8, ts = 16, arc = Math.PI * 2) =>
  new THREE.TorusGeometry(r, t, rs, ts, arc);

// Палитра корпуса. Сине-серый имперский транспорт с медью и латунью.
const C = {
  hullBlue: 0x2c3e50,
  hullDark: 0x1a252f,
  hullLight: 0x3d566e,
  metalDark: 0x111111,
  metalLight: 0x6b6b70,
  copper: 0x8a5a3a,
  gold: 0xc8a24a,
  bone: 0xc9bea0
};

export function makeValkyrie({ scale = 1 } = {}) {
  const root = new THREE.Group();
  root.name = 'valkyrie-flying';

  // Материалы уникальны для конкретного экземпляра: кат-сцена освобождает
  // их через disposeObject3D, фоновые самолёты — через dispose().
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x0a121a,
    roughness: 0.1,
    metalness: 0.9,
    transparent: true,
    opacity: 0.8
  });
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: 0xff6b2b,
    emissive: 0xff4a12,
    emissiveIntensity: 2.5,
    roughness: 0.5,
    metalness: 0.0
  });
  const glowBlueMaterial = new THREE.MeshStandardMaterial({
    color: 0x66ccff,
    emissive: 0x2288dd,
    emissiveIntensity: 3.0,
    roughness: 0.4,
    metalness: 0.0
  });

  const hull = new VertexColorBuilder('valkyrie-hull', { roughness: 0.55, metalness: 0.6 });
  const details = new VertexColorBuilder('valkyrie-details', { roughness: 0.7, metalness: 0.8 });
  const glassGroup = new THREE.Group();
  glassGroup.name = 'valkyrie-glass';

  // ---------------------------------------------------------------------
  // 1. Фюзеляж
  // ---------------------------------------------------------------------
  const bodyY = 3.5;

  hull.add(beveledBox(2.8, 2.4, 5.5, 0.15, 2), C.hullBlue, { position: [0, bodyY, -0.5] });

  const rearShape = new THREE.Shape();
  rearShape.moveTo(-1.4, -1.2);
  rearShape.lineTo(1.4, -1.2);
  rearShape.lineTo(0.8, 1.2);
  rearShape.lineTo(-0.8, 1.2);
  rearShape.closePath();
  const rearGeo = new THREE.ExtrudeGeometry(rearShape, {
    depth: 2.5,
    bevelEnabled: true,
    bevelSize: 0.1,
    bevelThickness: 0.1,
    bevelSegments: 2
  });
  rearGeo.rotateX(Math.PI / 2);
  hull.add(rearGeo, C.hullBlue, { position: [0, bodyY, 2.25] });

  const noseGeo = new THREE.CylinderGeometry(0.6, 1.3, 2.5, 8);
  noseGeo.rotateX(-Math.PI / 2);
  hull.add(noseGeo, C.hullBlue, { position: [0, bodyY - 0.2, -4.5], rotation: [0.1, 0, 0] });

  const ramGeo = cone(0.3, 1.0, 8);
  ramGeo.rotateX(-Math.PI / 2);
  hull.add(ramGeo, C.metalDark, { position: [0, bodyY - 0.4, -5.8] });

  hull.add(beveledBox(1.6, 0.8, 1.8, 0.1), C.hullDark, {
    position: [0, bodyY - 1.2, -3.8],
    rotation: [-0.2, 0, 0]
  });

  // ---------------------------------------------------------------------
  // 2. Кабина
  // ---------------------------------------------------------------------
  const glass = new THREE.Mesh(beveledBox(1.4, 0.8, 1.8, 0.05), glassMaterial);
  glass.position.set(0, bodyY + 1.0, -3.0);
  glass.rotation.x = -0.4;
  glassGroup.add(glass);

  hull.add(beveledBox(1.6, 0.2, 2.0, 0.05), C.hullDark, {
    position: [0, bodyY + 1.4, -3.0],
    rotation: [-0.4, 0, 0]
  });
  hull.add(beveledBox(1.6, 0.2, 0.6, 0.05), C.hullDark, {
    position: [0, bodyY + 0.6, -3.8],
    rotation: [-0.4, 0, 0]
  });
  hull.add(beveledBox(0.2, 0.8, 1.8, 0.05), C.hullDark, {
    position: [0, bodyY + 1.0, -3.0],
    rotation: [-0.4, 0, 0]
  });

  // ---------------------------------------------------------------------
  // 3. Двигатели (топ-маунт)
  // ---------------------------------------------------------------------
  const engineY = bodyY + 1.8;
  const engineZ = 0.5;

  for (const side of [-1, 1]) {
    const ex = side * 1.2;

    hull.add(beveledBox(1.2, 0.8, 3.2, 0.1), C.hullDark, {
      position: [ex, engineY - 0.6, engineZ]
    });

    details.add(cyl(0.75, 0.85, 3.4, 24, 3), C.metalDark, {
      position: [ex, engineY, engineZ],
      rotation: [Math.PI / 2, 0, 0]
    });

    for (let i = 0; i < 5; i += 1) {
      details.add(cyl(0.8, 0.8, 0.15, 24, 1), C.copper, {
        position: [ex, engineY, engineZ - 1.2 + i * 0.6],
        rotation: [Math.PI / 2, 0, 0]
      });
    }

    details.add(cyl(0.7, 0.7, 0.4, 24, 1), C.metalLight, {
      position: [ex, engineY, engineZ - 1.8],
      rotation: [Math.PI / 2, 0, 0]
    });
    details.add(cyl(0.6, 0.6, 0.1, 24, 1), C.metalDark, {
      position: [ex, engineY, engineZ - 2.0],
      rotation: [Math.PI / 2, 0, 0]
    });

    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      details.add(beveledBox(0.08, 0.55, 0.05, 0.01), C.bone, {
        position: [ex + Math.cos(angle) * 0.3, engineY + Math.sin(angle) * 0.3, engineZ - 1.9],
        rotation: [0, 0, angle]
      });
    }

    details.add(cyl(0.6, 0.8, 1.2, 24, 2), C.metalDark, {
      position: [ex, engineY, engineZ + 2.2],
      rotation: [Math.PI / 2, 0, 0]
    });
    details.add(torus(0.6, 0.1, 8, 24), C.metalLight, { position: [ex, engineY, engineZ + 2.8] });

    const engineGlow = new THREE.Mesh(cyl(0.5, 0.5, 0.1, 16), glowMaterial);
    engineGlow.position.set(ex, engineY, engineZ + 2.5);
    engineGlow.rotation.x = Math.PI / 2;
    glassGroup.add(engineGlow);
  }

  // ---------------------------------------------------------------------
  // 4. Крылья, гондолы и подкрыльевое оружие
  // ---------------------------------------------------------------------
  const podX = 6.5;

  for (const side of [-1, 1]) {
    const wingShape = new THREE.Shape();
    wingShape.moveTo(side * 1.4, -1.5);
    wingShape.lineTo(side * 6.5, -0.5);
    wingShape.lineTo(side * 6.5, 1.5);
    wingShape.lineTo(side * 1.4, 2.5);
    wingShape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.4,
      bevelEnabled: true,
      bevelSize: 0.08,
      bevelThickness: 0.08,
      bevelSegments: 2
    });
    wingGeo.rotateX(Math.PI / 2);
    hull.add(wingGeo, C.hullBlue, { position: [0, bodyY - 0.8, 0] });

    hull.add(beveledBox(4.5, 0.15, 0.6, 0.05), C.hullDark, {
      position: [side * 4.0, bodyY - 0.9, 2.2],
      rotation: [0, side * -0.2, 0]
    });

    const podY = bodyY - 0.8;
    const podZ = 0.5;

    hull.add(beveledBox(1.4, 1.6, 3.8, 0.15, 2), C.hullBlue, {
      position: [side * podX, podY, podZ]
    });
    hull.add(beveledBox(1.0, 0.4, 3.2, 0.1), C.hullDark, {
      position: [side * podX, podY + 1.0, podZ]
    });

    details.add(cyl(0.55, 0.55, 1.0, 24, 2), C.metalDark, {
      position: [side * podX, podY, podZ - 2.0],
      rotation: [Math.PI / 2, 0, 0]
    });
    details.add(cyl(0.5, 0.5, 0.1, 24), C.metalLight, {
      position: [side * podX, podY, podZ - 2.5],
      rotation: [Math.PI / 2, 0, 0]
    });

    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      details.add(beveledBox(0.06, 0.45, 0.05, 0.01), C.bone, {
        position: [
          side * podX + Math.cos(angle) * 0.25,
          podY + Math.sin(angle) * 0.25,
          podZ - 2.45
        ],
        rotation: [0, 0, angle]
      });
    }

    details.add(cyl(0.4, 0.5, 0.6, 16), C.metalDark, {
      position: [side * podX, podY, podZ + 2.2],
      rotation: [Math.PI / 2, 0, 0]
    });

    // Автопушки под гондолой.
    const gunY = podY - 1.2;
    const gunZ = podZ - 0.5;

    hull.add(beveledBox(0.4, 0.8, 1.2, 0.05), C.metalDark, {
      position: [side * podX, gunY + 0.5, gunZ]
    });
    hull.add(beveledBox(0.8, 0.6, 2.2, 0.08), C.hullDark, {
      position: [side * podX, gunY, gunZ]
    });

    for (let i = 0; i < 2; i += 1) {
      const bx = side * podX - 0.2 + i * 0.4;
      details.add(cyl(0.12, 0.12, 1.5, 12), C.metalDark, {
        position: [bx, gunY, gunZ - 1.6],
        rotation: [Math.PI / 2, 0, 0]
      });
      for (let j = 0; j < 4; j += 1) {
        details.add(torus(0.13, 0.02, 6, 12), C.metalLight, {
          position: [bx, gunY, gunZ - 1.2 - j * 0.25],
          rotation: [Math.PI / 2, 0, 0]
        });
      }
      details.add(cyl(0.18, 0.18, 0.4, 12), C.metalDark, {
        position: [bx, gunY, gunZ - 2.5],
        rotation: [Math.PI / 2, 0, 0]
      });
    }

    // Мягкое голубое свечение авионики на законцовке крыла.
    const navLight = new THREE.Mesh(sph(0.13, 10, 8), glowBlueMaterial);
    navLight.position.set(side * 6.9, bodyY - 0.7, 0.4);
    glassGroup.add(navLight);
  }

  // ---------------------------------------------------------------------
  // 5. Хвост
  // ---------------------------------------------------------------------
  const tailZ = 4.5;
  for (const side of [-1, 1]) {
    hull.add(beveledBox(0.4, 0.8, 4.5, 0.1), C.hullBlue, {
      position: [side * 1.8, bodyY - 0.2, tailZ]
    });
    hull.add(beveledBox(0.2, 1.8, 1.6, 0.05), C.hullLight, {
      position: [side * 1.8, bodyY + 1.0, tailZ + 1.0]
    });
  }
  hull.add(beveledBox(3.6, 0.15, 1.6, 0.05), C.hullBlue, {
    position: [0, bodyY + 0.2, tailZ + 1.0]
  });

  // ---------------------------------------------------------------------
  // 6. Шасси
  // ---------------------------------------------------------------------
  const buildGear = (x, yTop, z, length, width) => {
    details.add(cyl(0.12, 0.2, length, 12), C.metalLight, {
      position: [x, yTop - length / 2, z]
    });
    details.add(cyl(0.08, 0.08, length * 0.8, 8), C.metalDark, {
      position: [x + 0.15, yTop - length * 0.5, z]
    });
    details.add(sph(0.25, 12, 8), C.metalDark, { position: [x, yTop, z] });
    details.add(beveledBox(width, 0.15, 1.4, 0.05), C.metalDark, {
      position: [x, 0.075, z + 0.2]
    });
    details.add(beveledBox(width * 0.6, 0.1, 0.5, 0.02), C.metalLight, {
      position: [x, 0.05, z - 0.4]
    });
  };

  buildGear(0, bodyY - 1.4, -3.2, bodyY - 1.4, 1.0);
  const podBottomY = (bodyY - 0.8) - 0.8;
  buildGear(-podX, podBottomY, 0.5, podBottomY, 1.2);
  buildGear(podX, podBottomY, 0.5, podBottomY, 1.2);

  // ---------------------------------------------------------------------
  // 7. Декор: аквила, заклёпки, решётки
  // ---------------------------------------------------------------------
  details.add(beveledBox(0.5, 0.2, 0.1, 0.02), C.gold, {
    position: [0, bodyY - 0.6, -4.8],
    rotation: [0.1, 0, 0]
  });
  for (const side of [-1, 1]) {
    details.add(beveledBox(0.4, 0.1, 0.05, 0.01), C.gold, {
      position: [side * 0.4, bodyY - 0.5, -4.7],
      rotation: [0.1, 0, side * 0.4]
    });
  }

  for (let i = 0; i < 3; i += 1) {
    for (const side of [-1, 1]) {
      details.add(beveledBox(0.05, 0.6, 1.0, 0.02), C.metalDark, {
        position: [side * 1.41, bodyY - 0.2, -1.5 + i * 1.2]
      });
      for (let j = 0; j < 4; j += 1) {
        details.add(beveledBox(0.02, 0.4, 0.1, 0.005), C.metalLight, {
          position: [side * 1.42, bodyY - 0.2, -1.7 + j * 0.2 + i * 1.2]
        });
      }
    }
  }

  for (let i = 0; i < 24; i += 1) {
    const z = -2.5 + (i % 6) * 0.9;
    const y = bodyY - 1.0 + Math.floor(i / 6) * 0.6;
    for (const side of [-1, 1]) {
      details.add(cyl(0.04, 0.04, 0.05, 6), C.metalLight, {
        position: [side * 1.41, y, z],
        rotation: [0, 0, Math.PI / 2]
      });
    }
  }

  root.add(hull.build());
  root.add(details.build());
  root.add(glassGroup);

  // Точки привязки для трассеров фоновых боёв.
  addMarker(root, 'gunLeft', [-podX, bodyY - 2.0, -1.8]);
  addMarker(root, 'gunRight', [podX, bodyY - 2.0, -1.8]);

  root.scale.setScalar(scale);

  root.userData.kind = 'valkyrie';
  root.userData.meshRoot = root;
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return root;
}

// Освобождение уникальных материалов/геометрии фонового самолёта.
export function disposeValkyrie(object) {
  if (!object) return;
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material?.dispose?.();
  });
}
