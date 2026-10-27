// Две процедурные версии танка «Леман Русс» для админ-панели.
// — DeepSeek: более рубленый «классический» корпус и простая башня.
// — ChatGPT: наклонная лобовая броня, ромбовидная башня и более богатая детализация.
// Модели создаются без внешних ассетов и используют общие утилиты проекта.

import * as THREE from 'three';
import { VertexColorBuilder, beveledBox, addMarker } from './utils.js';

const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const torus = (r, t, rs = 8, ts = 16, arc = Math.PI * 2) =>
  new THREE.TorusGeometry(r, t, rs, ts, arc);

const VARIANTS = {
  deepseek: {
    label: 'Леман Русс (DeepSeek)',
    materials: { roughness: 0.62, metalness: 0.38 },
    palette: {
      hull: 0x4a5a3a,
      hullDark: 0x354228,
      hullLight: 0x60724a,
      metal: 0x1c1c1e,
      metalLight: 0x6b6b70,
      accent: 0xa8853b,
      glow: 0xff6b2b
    }
  },
  chatgpt: {
    label: 'Леман Русс (ChatGPT)',
    materials: { roughness: 0.82, metalness: 0.18 },
    palette: {
      hull: 0x596348,
      hullDark: 0x464f38,
      hullLight: 0x70745a,
      metal: 0x292b29,
      metalLight: 0x77766a,
      accent: 0x9d342d,
      glow: 0xffb52e
    }
  }
};

function makeTrackMaterial(variant) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = variant === 'chatgpt' ? '#3b3e39' : '#333333';
  for (let y = 0; y < 64; y += 16) {
    ctx.fillRect(0, y, 64, 10);
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, y + 10, 64, 3);
    ctx.fillStyle = variant === 'chatgpt' ? '#54574f' : '#3a3a3a';
    ctx.fillRect(0, y + 2, 64, 2);
    ctx.fillStyle = variant === 'chatgpt' ? '#3b3e39' : '#333333';
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 12);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0x9a9a92,
    roughness: 0.92,
    metalness: 0.16
  });

  return { material, texture };
}

// Полигональная башня с «срезанными» углами.
function clippedPrismGeometry(width, depth, height, cut = 0.28) {
  const w = width / 2;
  const d = depth / 2;
  const c = Math.min(cut, w * 0.45, d * 0.45);
  const plan = [
    [-w + c, -d], [w - c, -d], [w, -d + c], [w, d - c],
    [w - c, d], [-w + c, d], [-w, d - c], [-w, -d + c]
  ];

  const shape = new THREE.Shape();
  plan.forEach(([x, z], index) => {
    const y = -z;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.045,
    bevelThickness: 0.045,
    curveSegments: 1
  });
  geometry.translate(0, 0, -height / 2);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

// Наклонный профиль нижнего корпуса (для версии ChatGPT).
function sideProfileGeometry(width, profile) {
  const shape = new THREE.Shape();
  profile.forEach(([z, y], index) => {
    const x = -z;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.045,
    bevelThickness: 0.045,
    curveSegments: 1
  });
  geometry.translate(0, 0, -width / 2);
  geometry.rotateY(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function addMesh(parent, geometry, material, position, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildTrackAssembly(root, hull, variant, palette, trackMaterial) {
  const isDeepSeek = variant === 'deepseek';
  const sideX = isDeepSeek ? 2.55 : 2.34;
  const wheelRadius = isDeepSeek ? 0.36 : 0.41;
  const wheelZs = isDeepSeek
    ? [-2.55, -1.28, 0, 1.28, 2.55]
    : [-2.12, -1.42, -0.72, 0, 0.72, 1.42, 2.12];

  for (const side of [-1, 1]) {
    const trackGroup = new THREE.Group();
    trackGroup.position.set(side * sideX, 0.8, 0);
    root.add(trackGroup);

    const top = new THREE.Mesh(beveledBox(0.7, 0.18, 7.3, 0.035), trackMaterial);
    top.position.set(0, 0.76, 0);
    trackGroup.add(top);

    const bottom = new THREE.Mesh(beveledBox(0.7, 0.18, 7.3, 0.035), trackMaterial);
    bottom.position.set(0, -0.72, 0);
    trackGroup.add(bottom);

    const front = new THREE.Mesh(beveledBox(0.7, 0.18, 2.2, 0.035), trackMaterial);
    front.position.set(0, 0.08, -3.65);
    front.rotation.x = isDeepSeek ? -0.75 : -0.82;
    trackGroup.add(front);

    const rear = new THREE.Mesh(beveledBox(0.7, 0.18, 2.2, 0.035), trackMaterial);
    rear.position.set(0, 0.08, 3.65);
    rear.rotation.x = isDeepSeek ? 0.75 : 0.82;
    trackGroup.add(rear);

    for (const z of wheelZs) {
      hull.add(cyl(wheelRadius, wheelRadius, 0.62, 14), palette.metal, {
        position: [side * sideX, 0.22, z],
        rotation: [0, 0, Math.PI / 2]
      });
      hull.add(cyl(wheelRadius * 0.55, wheelRadius * 0.55, 0.08, 12), palette.accent, {
        position: [side * (sideX + 0.32), 0.22, z],
        rotation: [0, 0, Math.PI / 2]
      });
    }

    // Передний и задний катки-ленивцы.
    hull.add(cyl(0.44, 0.44, 0.7, 14), palette.metalLight, {
      position: [side * sideX, 0.22, isDeepSeek ? -3.55 : 2.62],
      rotation: [0, 0, Math.PI / 2]
    });

    // Опорные полки над гусеницами.
    hull.add(beveledBox(0.85, 0.16, isDeepSeek ? 5.2 : 5.65, 0.03), palette.hullDark, {
      position: [side * (sideX - 0.35), 1.92, 0]
    });
  }
}

function buildHull(root, variant, palette, materials) {
  const isDeepSeek = variant === 'deepseek';
  const hull = new VertexColorBuilder(`leman-${variant}-hull`, materials);

  if (isDeepSeek) {
    hull.add(beveledBox(4.5, 2.0, 7.0, 0.16), palette.hull, { position: [0, 1.1, 0] });
    hull.add(beveledBox(3.5, 1.5, 1.5, 0.14), palette.hull, {
      position: [0, 1.05, -3.5],
      rotation: [0.5, 0, 0]
    });
    hull.add(beveledBox(4.0, 1.0, 1.5, 0.1), palette.hullDark, {
      position: [0, 0.5, -3.8],
      rotation: [-0.3, 0, 0]
    });
    hull.add(beveledBox(4.0, 1.45, 2.0, 0.1), palette.hullDark, {
      position: [0, 1.22, 3.5]
    });
  } else {
    hull.add(sideProfileGeometry(4.2, [
      [-3.82, 0.48], [-3.62, 1.18], [-2.62, 1.92],
      [2.63, 1.92], [3.46, 1.42], [3.63, 0.52]
    ]), palette.hull);

    hull.add(beveledBox(3.78, 0.42, 4.95, 0.1), palette.hullDark, {
      position: [0, 1.84, 0.05]
    });
    hull.add(beveledBox(3.28, 0.38, 2.0, 0.09), palette.hullLight, {
      position: [0, 2.04, 2.42],
      rotation: [0.02, 0, 0]
    });
    hull.add(beveledBox(3.58, 0.22, 1.05, 0.05), palette.hull, {
      position: [0, 1.84, 3.0],
      rotation: [-0.08, 0, 0]
    });
  }

  // Надгусеничные полки и спонсоны.
  for (const side of [-1, 1]) {
    hull.add(beveledBox(isDeepSeek ? 1.2 : 0.72, isDeepSeek ? 0.4 : 0.16, 5.0, 0.05), palette.hull, {
      position: [side * (isDeepSeek ? 2.5 : 2.15), isDeepSeek ? 2.0 : 1.98, 0]
    });

    hull.add(beveledBox(isDeepSeek ? 1.0 : 0.92, 0.8, 1.5, 0.08), palette.hullDark, {
      position: [side * (isDeepSeek ? 2.6 : 2.35), isDeepSeek ? 1.8 : 1.28, -0.8]
    });
    hull.add(cyl(0.1, 0.1, 1.15, 10), palette.metal, {
      position: [side * (isDeepSeek ? 2.6 : 2.4), isDeepSeek ? 1.8 : 1.28, -1.75],
      rotation: [Math.PI / 2, 0, 0]
    });

    if (!isDeepSeek) {
      // Красно-белые полосы и небольшие бортовые детали.
      hull.add(beveledBox(0.045, 0.72, 0.075, 0.01), palette.accent, {
        position: [side * 2.145, 1.45, -0.165]
      });
      hull.add(beveledBox(0.048, 0.72, 0.075, 0.01), 0xd9d0b0, {
        position: [side * 2.15, 1.45, -0.08]
      });
      hull.add(beveledBox(0.05, 0.72, 0.075, 0.01), palette.accent, {
        position: [side * 2.155, 1.45, 0.005]
      });
    }

    // Выхлопные трубы и маркеры дыма.
    hull.add(cyl(0.2, 0.23, 0.62, 12), palette.metal, {
      position: [side * (isDeepSeek ? 1.5 : 1.62), isDeepSeek ? 2.5 : 2.35, 3.2]
    });
    hull.add(torus(0.22, 0.04, 6, 12), palette.metalLight, {
      position: [side * (isDeepSeek ? 1.5 : 1.62), isDeepSeek ? 2.82 : 2.66, 3.2],
      rotation: [Math.PI / 2, 0, 0]
    });
  }

  // Лобовая плита, фары и буксировочные скобы.
  if (isDeepSeek) {
    hull.add(beveledBox(3.4, 0.5, 0.22, 0.05), palette.hullDark, {
      position: [0, 0.72, -3.68],
      rotation: [-0.16, 0, 0]
    });
  } else {
    hull.add(beveledBox(3.58, 0.14, 1.38, 0.045), palette.hullLight, {
      position: [0, 1.63, -3.07],
      rotation: [-0.45, 0, 0]
    });
    hull.add(beveledBox(0.82, 0.66, 0.24, 0.06), palette.hullDark, {
      position: [0, 1.13, -3.71]
    });
    hull.add(cyl(0.12, 0.14, 0.6, 12), palette.metal, {
      position: [0, 1.13, -4.12],
      rotation: [Math.PI / 2, 0, 0]
    });
  }

  for (const side of [-1, 1]) {
    hull.add(cyl(0.15, 0.15, 0.1, 12), palette.metal, {
      position: [side * 1.42, 1.23, -3.55],
      rotation: [Math.PI / 2, 0, 0]
    });
    hull.add(cyl(0.105, 0.105, 0.04, 12), palette.accent, {
      position: [side * 1.42, 1.23, -3.62],
      rotation: [Math.PI / 2, 0, 0]
    });
  }

  // Заклёпки по бортам.
  const rivetRows = isDeepSeek ? 12 : 9;
  for (const side of [-1, 1]) {
    for (let i = 0; i < rivetRows; i += 1) {
      hull.add(cyl(0.04, 0.04, 0.05, 6), palette.metalLight, {
        position: [
          side * (isDeepSeek ? 2.27 : 2.12),
          0.6 + (i % 3) * 0.42,
          -3 + Math.floor(i / 3) * (isDeepSeek ? 1.5 : 1.3)
        ],
        rotation: [0, 0, Math.PI / 2]
      });
    }
  }

  root.add(hull.build());
}

function buildTurret(root, variant, palette, materials) {
  const isDeepSeek = variant === 'deepseek';
  const turretGroup = new THREE.Group();
  turretGroup.name = 'turret';
  turretGroup.position.set(0, isDeepSeek ? 2.2 : 2.0, isDeepSeek ? 0 : 0.18);
  root.add(turretGroup);

  const turret = new VertexColorBuilder(`leman-${variant}-turret`, materials);
  turret.add(cyl(isDeepSeek ? 1.15 : 1.47, isDeepSeek ? 1.15 : 1.47, 0.22, 12), palette.metal, {
    position: [0, 0.08, 0]
  });

  if (isDeepSeek) {
    turret.add(beveledBox(3.0, 1.2, 3.5, 0.2), palette.hull, { position: [0, 0.72, 0.5] });
    turret.add(beveledBox(1.5, 1.0, 0.8, 0.08), palette.hullDark, { position: [0, 0.72, -1.2] });
    turret.add(cyl(0.4, 0.4, 0.4, 12), palette.hullDark, { position: [-0.8, 1.42, 0.5] });
    turret.add(beveledBox(0.6, 0.3, 0.6, 0.04), palette.metal, { position: [-0.8, 1.62, 0.5] });
    turret.add(cyl(0.35, 0.35, 0.1, 12), palette.metal, { position: [0.8, 1.29, 0.5] });
    turret.add(cyl(0.02, 0.02, 2.0, 6), palette.metal, { position: [-1.2, 2.0, 1.5] });
    turret.add(beveledBox(1.1, 0.5, 0.7, 0.05), palette.hullDark, { position: [0.2, 1.48, 0.6] });
  } else {
    turret.add(clippedPrismGeometry(2.86, 2.62, 1.08, 0.36), palette.hullLight, {
      position: [0, 0.78, 0.08]
    });
    turret.add(beveledBox(2.16, 0.75, 0.38, 0.08), palette.hull, {
      position: [0, 0.82, -1.12],
      rotation: [-0.16, 0, 0]
    });
    turret.add(beveledBox(0.52, 0.78, 0.28, 0.06), palette.hullDark, {
      position: [-1.12, 0.76, -0.98],
      rotation: [-0.22, 0, -0.06]
    });
    turret.add(beveledBox(0.52, 0.78, 0.28, 0.06), palette.hull, {
      position: [1.12, 0.76, -0.98],
      rotation: [-0.22, 0, 0.06]
    });
    turret.add(beveledBox(1.06, 0.82, 0.48, 0.08), palette.hullDark, {
      position: [0, 0.69, -1.25],
      rotation: [-0.05, 0, 0]
    });
    turret.add(cyl(0.39, 0.43, 0.2, 16), palette.hull, {
      position: [0, 0.69, -1.6],
      rotation: [Math.PI / 2, 0, 0]
    });

    // Командирская башенка и люк.
    turret.add(cyl(0.42, 0.47, 0.3, 12), palette.hullDark, { position: [-0.68, 1.39, 0.16] });
    turret.add(cyl(0.37, 0.39, 0.09, 12), palette.hullLight, { position: [-0.68, 1.57, 0.16] });
    turret.add(beveledBox(0.72, 0.1, 0.52, 0.03), palette.hull, { position: [0.72, 1.37, 0.22] });
    turret.add(beveledBox(1.18, 0.42, 0.38, 0.04), palette.hullDark, { position: [0, 0.58, 1.34] });
  }

  turretGroup.add(turret.build());

  // Орудие.
  const gunGroup = new THREE.Group();
  gunGroup.name = 'gun';
  gunGroup.position.set(0, isDeepSeek ? 0.68 : 0.68, isDeepSeek ? -1.2 : -1.45);
  turretGroup.add(gunGroup);

  const gun = new VertexColorBuilder(`leman-${variant}-gun`, {
    roughness: 0.48,
    metalness: 0.76
  });

  if (isDeepSeek) {
    gun.add(cyl(0.25, 0.3, 1.5, 16), palette.metal, {
      position: [0, 0, -0.75],
      rotation: [Math.PI / 2, 0, 0]
    });
    gun.add(cyl(0.35, 0.35, 0.8, 16), palette.metal, {
      position: [0, 0, -1.8],
      rotation: [Math.PI / 2, 0, 0]
    });
    gun.add(cyl(0.28, 0.28, 0.6, 16), palette.metalLight, {
      position: [0, 0, -2.2],
      rotation: [Math.PI / 2, 0, 0]
    });
  } else {
    gun.add(cyl(0.225, 0.24, 1.55, 18), palette.metal, {
      position: [0, 0, -0.95],
      rotation: [Math.PI / 2, 0, 0]
    });
    gun.add(cyl(0.19, 0.225, 1.5, 18), palette.hullDark, {
      position: [0, 0, -2.35],
      rotation: [Math.PI / 2, 0, 0]
    });
    gun.add(cyl(0.21, 0.21, 0.14, 18), palette.metalLight, {
      position: [0, 0, -3.15],
      rotation: [Math.PI / 2, 0, 0]
    });
    gun.add(cyl(0.26, 0.23, 0.78, 16), palette.hull, {
      position: [0, 0, -3.58],
      rotation: [Math.PI / 2, 0, 0]
    });
    gun.add(cyl(0.295, 0.27, 0.28, 16), palette.metal, {
      position: [0, 0, -3.99],
      rotation: [Math.PI / 2, 0, 0]
    });
    gun.add(cyl(0.245, 0.26, 0.18, 16), palette.hullDark, {
      position: [0, 0, -4.22],
      rotation: [Math.PI / 2, 0, 0]
    });
  }

  gunGroup.add(gun.build());

  const muzzleZ = isDeepSeek ? -2.55 : -4.35;
  const muzzle = addMarker(gunGroup, 'muzzle', [0, 0, muzzleZ]);

  const flashMaterial = new THREE.MeshBasicMaterial({
    color: palette.glow,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const flash = new THREE.Mesh(sph(isDeepSeek ? 0.55 : 0.48), flashMaterial);
  flash.position.set(0, 0, muzzleZ - 0.2);
  flash.visible = false;
  flash.name = 'muzzleFlash';
  gunGroup.add(flash);

  const flashLight = new THREE.PointLight(palette.glow, 0, isDeepSeek ? 18 : 14, 2);
  flashLight.position.copy(flash.position);
  flashLight.name = 'muzzleLight';
  flashLight.castShadow = false;
  gunGroup.add(flashLight);

  // Декоративные кожухи/поручни на башне.
  const details = new VertexColorBuilder(`leman-${variant}-turret-details`, materials);
  for (const side of [-1, 1]) {
    details.add(beveledBox(0.12, 0.26, 0.9, 0.02), palette.metal, {
      position: [side * (isDeepSeek ? 1.52 : 1.44), 1.05, 0.2]
    });
    details.add(torus(0.13, 0.03, 6, 12), palette.metalLight, {
      position: [side * 0.95, isDeepSeek ? 1.55 : 1.35, 0.65],
      rotation: [Math.PI / 2, 0, 0]
    });
  }
  turretGroup.add(details.build());

  return { turretGroup, gunGroup, muzzle };
}

function buildVariant(variantKey) {
  const variant = VARIANTS[variantKey] ? variantKey : 'deepseek';
  const cfg = VARIANTS[variant];
  const palette = cfg.palette;
  const materials = { ...cfg.materials };

  const root = new THREE.Group();
  root.name = `leman-russ-${variant}`;

  const track = makeTrackMaterial(variant);
  const exhaustPoints = [];

  buildHull(root, variant, palette, materials);

  // Колёса и катки удобно собирать отдельным vertex-color builder'ом:
  // они используют ту же палитру, но не смешиваются с корпусом.
  const wheels = new VertexColorBuilder('leman-wheels', {
    roughness: 0.72,
    metalness: 0.42
  });
  buildTrackAssembly(root, wheels, variant, palette, track.material);
  root.add(wheels.build());

  const turretData = buildTurret(root, variant, palette, materials);

  for (const side of [-1, 1]) {
    exhaustPoints.push(addMarker(root, `exhaust-${side}`, [
      side * (variant === 'deepseek' ? 1.5 : 1.62),
      variant === 'deepseek' ? 2.95 : 2.72,
      variant === 'deepseek' ? 3.2 : 3.22
    ]));
  }

  root.userData.kind = 'tank';
  root.userData.variant = variant;
  root.userData.label = cfg.label;
  root.userData.turretGroup = turretData.turretGroup;
  root.userData.gunGroup = turretData.gunGroup;
  root.userData.muzzle = turretData.muzzle;
  root.userData.exhaustPoints = exhaustPoints;
  root.userData.trackTexture = track.texture;
  root.userData.muzzleFlash = turretData.gunGroup.getObjectByName('muzzleFlash');
  root.userData.muzzleLight = turretData.gunGroup.getObjectByName('muzzleLight');

  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });

  return root;
}

export function makeLemanRuss(variant = 'deepseek') {
  return buildVariant(variant);
}

export function disposeLemanRuss(object) {
  if (!object) return;

  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material?.map?.dispose?.();
      material?.dispose?.();
    }
  });
}
