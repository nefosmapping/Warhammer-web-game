// Модели орков: скелетная иерархия hips → spine → chest → neck → head,
// руки (arm → forearm → hand) и ноги (leg → calf → foot) как в прототипе
// «орки 3d.html». Оружие цепляется к правой кисти, у стрелков есть
// muzzle-маркер и светящийся материал для вспышки выстрела.
//
// Для производительности каждая часть тела собрана ОДНИМ мешем
// с vertex colors: тело, две руки, две ноги, оружие.

import * as THREE from 'three';
import {
  M,
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

// Палитра из §2.4/§3.4 «графика.txt».
const C = {
  skin: 0x5d7a3b,
  skinDark: 0x3d5226,
  skinLight: 0x7a9e4d,
  armorRed: 0x9e2a24,
  armorRedDark: 0x6a1a16,
  leather: 0x4a3525,
  leatherDark: 0x2b1e14,
  metalDark: 0x1c1c1e,
  metalLight: 0x6b6b70,
  rust: 0x6a3a28,
  brass: 0xa8853b,
  bone: 0xd6cba4,
  eyeRed: 0xff1100,
  teeth: 0xe0d4b0,
  mouthDark: 0x1a0a0a
};

// ---------------------------------------------------------------------------
// Оружие
// ---------------------------------------------------------------------------

function buildChoppa(isNob = false) {
  const group = new THREE.Group();
  group.name = 'ork-choppa';

  const b = new VertexColorBuilder('choppa-mesh', { roughness: 0.5, metalness: 0.8 });
  const scale = isNob ? 1.35 : 1;

  // Рукоять (вниз по -Y).
  b.add(cyl(0.06, 0.07, 0.8 * scale, 12), C.leatherDark, { position: [0, -0.3 * scale, 0] });
  for (let i = 0; i < 4; i += 1) {
    b.add(torus(0.08 * scale, 0.02, 8, 12), C.leather, {
      position: [0, (-0.1 - i * 0.15) * scale, 0],
      rotation: [Math.PI / 2, 0, 0]
    });
  }

  // Гарда и череп.
  b.add(beveledBox(0.5 * scale, 0.15, 0.2, 0.03), C.brass, {
    position: [0, 0.1 * scale, 0]
  });
  b.add(sph(0.12 * scale, 12, 8), C.bone, { position: [0, 0.1 * scale, 0.15] });

  // Лезвие (вверх по +Y).
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.1, 0);
  bladeShape.lineTo(0.1, 0);
  bladeShape.lineTo(0.3, 0.6);
  bladeShape.lineTo(0.5, 1.2);
  bladeShape.lineTo(0.1, 1.0);
  bladeShape.lineTo(-0.15, 0.5);
  bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: 0.03,
    bevelSegments: 1
  });
  bladeGeo.translate(0, 0.15, -0.04);
  b.add(bladeGeo, C.armorRed, {
    position: [0, 0, 0],
    rotation: [0, 0, 0.1],
    scale: [scale, scale, scale]
  });

  // Зубья.
  for (let i = 0; i < 4; i += 1) {
    b.add(cone(0.08, 0.25, 6), C.metalLight, {
      position: [-0.2 * scale, (0.3 + i * 0.25) * scale, 0],
      rotation: [0, 0, Math.PI / 2]
    });
  }

  group.add(b.build());
  group.userData.kind = 'choppa';
  return group;
}

function addMuzzleEffects(group, flashColor, lightColor, position, flashSize = 0.3) {
  const flashMat = new THREE.MeshBasicMaterial({
    color: flashColor,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const flash = new THREE.Mesh(cone(flashSize, flashSize * 2.8, 8), flashMat);
  flash.rotation.x = -Math.PI / 2;
  flash.position.set(position[0], position[1], position[2]);
  flash.visible = false;
  flash.name = 'muzzleFlash';
  group.add(flash);

  const light = new THREE.PointLight(lightColor, 0, 7, 2);
  light.position.set(position[0], position[1], position[2] + 0.2);
  light.name = 'muzzleLight';
  light.castShadow = false;
  group.add(light);

  // Светящийся наконечник ствола: отдельный меш с уникальным материалом.
  // Enemy._flashMuzzle() поднимает emissiveIntensity, а _updateMuzzleGlow()
  // плавно гасит его — это и есть userData.glowMaterial.
  const glowMaterial = M.uniqueGlow(flashColor);
  glowMaterial.emissiveIntensity = 0;
  const glow = new THREE.Mesh(cyl(0.07, 0.08, 0.13, 14, 1), glowMaterial);
  glow.position.set(position[0], position[1], position[2] + 0.25);
  glow.rotation.x = Math.PI / 2;
  glow.castShadow = false;
  glow.receiveShadow = false;
  group.add(glow);

  addMarker(group, 'muzzle', [position[0], position[1], position[2] - 0.15]);

  group.userData.glowMaterial = glowMaterial;
  group.userData.glowMesh = glow;
  group.userData.flash = flash;
  group.userData.muzzleLight = light;
  return group;
}

function buildShoota1() {
  const group = new THREE.Group();
  group.name = 'ork-shoota';

  const b = new VertexColorBuilder('shoota1-mesh', { roughness: 0.6, metalness: 0.7 });

  // Ствол вдоль -Z.
  b.add(beveledBox(0.3, 0.35, 1.0, 0.05), C.metalDark, { position: [0, 0, 0] });
  b.add(beveledBox(0.25, 0.25, 0.6, 0.03), C.armorRed, { position: [0, 0.2, -0.1] });
  b.add(cyl(0.08, 0.08, 1.5, 16), C.metalLight, {
    position: [0, 0.05, -1.2],
    rotation: [Math.PI / 2, 0, 0]
  });
  b.add(cyl(0.12, 0.12, 0.8, 16), C.metalDark, {
    position: [0, 0.05, -0.9],
    rotation: [Math.PI / 2, 0, 0]
  });
  b.add(cyl(0.2, 0.2, 0.4, 16), C.metalDark, {
    position: [0, 0.05, -2.0],
    rotation: [Math.PI / 2, 0, 0]
  });
  b.add(cyl(0.35, 0.35, 0.25, 16), C.rust, {
    position: [0, -0.4, 0.1],
    rotation: [Math.PI / 2, 0, 0]
  });
  b.add(beveledBox(0.1, 0.3, 0.12, 0.02), C.leather, {
    position: [0, -0.3, 0.4],
    rotation: [0.3, 0, 0]
  });
  b.add(beveledBox(0.15, 0.25, 0.4, 0.02), C.metalDark, { position: [0, 0, 0.6] });

  group.add(b.build());
  addMuzzleEffects(group, 0xffdd44, 0xffaa00, [0, 0.05, -2.15], 0.3);
  group.userData.kind = 'shoota';
  return group;
}

function buildShoota2() {
  const group = new THREE.Group();
  group.name = 'ork-blasta';

  const b = new VertexColorBuilder('shoota2-mesh', { roughness: 0.5, metalness: 0.8 });

  b.add(beveledBox(0.4, 0.45, 1.4, 0.05), C.metalDark, { position: [0, 0, 0] });
  for (let i = 0; i < 4; i += 1) {
    b.add(beveledBox(0.42, 0.15, 0.2, 0.02), C.armorRed, {
      position: [0, 0, -0.4 + i * 0.25]
    });
    b.add(beveledBox(0.42, 0.05, 0.1, 0.01), C.metalDark, {
      position: [0, 0, -0.3 + i * 0.25]
    });
  }
  b.add(cyl(0.3, 0.35, 1.0, 16), C.metalDark, {
    position: [0, 0, -1.2],
    rotation: [Math.PI / 2, 0, 0]
  });
  b.add(cyl(0.2, 0.2, 0.4, 16), C.metalLight, {
    position: [0, 0, -1.6],
    rotation: [Math.PI / 2, 0, 0]
  });
  b.add(beveledBox(0.2, 0.5, 0.3, 0.03), C.metalDark, {
    position: [0, -0.4, 0.3],
    rotation: [0.3, 0, 0]
  });
  b.add(beveledBox(0.1, 0.25, 0.15, 0.02), C.leather, { position: [0, -0.3, 0.4] });

  group.add(b.build());
  addMuzzleEffects(group, 0xff3300, 0xff3300, [0, 0, -1.8], 0.4);
  group.userData.kind = 'blasta';
  return group;
}

// ---------------------------------------------------------------------------
// Сборка орка
// ---------------------------------------------------------------------------

function buildHead(bHead, type) {
  bHead.add(sph(0.4, 16, 12), C.skin, { scale: [1, 0.85, 1.1] });
  bHead.add(beveledBox(0.65, 0.15, 0.3, 0.05), C.skinDark, {
    position: [0, 0.1, 0.25],
    rotation: [-0.2, 0, 0]
  });
  bHead.add(beveledBox(0.15, 0.1, 0.15, 0.02), C.skinDark, { position: [0, -0.05, 0.4] });
  bHead.add(beveledBox(0.4, 0.15, 0.3, 0.05), C.skin, { position: [0, -0.15, 0.3] });
  bHead.add(beveledBox(0.45, 0.2, 0.45, 0.05), C.skinDark, {
    position: [0, -0.3, 0.35],
    rotation: [0.1, 0, 0]
  });
  bHead.add(beveledBox(0.3, 0.1, 0.2, 0.01), C.mouthDark, { position: [0, -0.22, 0.4] });

  for (const side of [-1, 1]) {
    bHead.add(cone(0.08, 0.3, 6), C.teeth, {
      position: [side * 0.15, -0.2, 0.45],
      rotation: [0.2, 0, side * 0.1]
    });
    for (let i = 0; i < 2; i += 1) {
      bHead.add(cone(0.03, 0.1, 5), C.teeth, {
        position: [side * (0.05 + i * 0.05), -0.22, 0.45],
        rotation: [0.2, 0, 0]
      });
    }
    bHead.add(cone(0.06, 0.25, 6), C.skin, {
      position: [side * 0.35, 0.0, 0],
      rotation: [0, 0, side * 1.2]
    });
  }

  if (type === 'melee') {
    bHead.add(beveledBox(0.5, 0.25, 0.3, 0.05), C.metalDark, { position: [0, -0.32, 0.4] });
    bHead.add(cone(0.05, 0.15, 6), C.metalLight, {
      position: [-0.15, -0.35, 0.5],
      rotation: [Math.PI / 2, 0, 0]
    });
    bHead.add(cone(0.05, 0.15, 6), C.metalLight, {
      position: [0.15, -0.35, 0.5],
      rotation: [Math.PI / 2, 0, 0]
    });
    bHead.add(sph(0.45, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.8), C.metalDark, {
      position: [0, 0.15, 0]
    });
    bHead.add(cone(0.08, 0.35, 8), C.metalLight, { position: [0, 0.6, 0] });
  } else if (type === 'shoota') {
    bHead.add(beveledBox(0.6, 0.15, 0.2, 0.02), C.leather, { position: [0, 0.15, 0.3] });
    for (const side of [-1, 1]) {
      bHead.add(cyl(0.12, 0.12, 0.1, 12), C.metalDark, {
        position: [side * 0.15, 0.1, 0.4],
        rotation: [Math.PI / 2, 0, 0]
      });
    }
  } else if (type === 'blasta') {
    bHead.add(sph(0.48, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.6), C.metalDark, {
      position: [0, 0.15, 0]
    });
    bHead.add(torus(0.45, 0.05, 6, 16), C.metalLight, {
      position: [0, 0.15, 0],
      rotation: [Math.PI / 2, 0, 0]
    });
  }
}

function buildOrk(type) {
  const root = new THREE.Group();
  root.name = type === 'melee' ? 'ork-boy' : type === 'shoota' ? 'ork-shooter' : 'ork-blasta';

  // --- СКЕЛЕТ ---
  const hips = new THREE.Group();
  hips.position.y = 1.2;
  root.add(hips);

  const spine = new THREE.Group();
  spine.position.y = 0.2;
  spine.rotation.x = 0.15;
  hips.add(spine);

  const chest = new THREE.Group();
  chest.position.y = 0.4;
  chest.rotation.x = 0.25;
  spine.add(chest);

  const neck = new THREE.Group();
  neck.position.set(0, 0.6, 0.15);
  neck.rotation.x = -0.4;
  chest.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.35, 0.1);
  neck.add(head);

  // Руки.
  const armL = new THREE.Group();
  armL.position.set(-0.95, 0.4, 0);
  chest.add(armL);
  const forearmL = new THREE.Group();
  forearmL.position.set(0, -0.55, 0);
  armL.add(forearmL);
  const handL = new THREE.Group();
  handL.position.set(0, -0.55, 0);
  forearmL.add(handL);

  const armR = new THREE.Group();
  armR.position.set(0.95, 0.4, 0);
  chest.add(armR);
  const forearmR = new THREE.Group();
  forearmR.position.set(0, -0.55, 0);
  armR.add(forearmR);
  const handR = new THREE.Group();
  handR.position.set(0, -0.55, 0);
  forearmR.add(handR);

  // Ноги.
  const legL = new THREE.Group();
  legL.position.set(-0.45, 0, 0);
  hips.add(legL);
  const calfL = new THREE.Group();
  calfL.position.set(0, -0.55, 0);
  legL.add(calfL);
  const footL = new THREE.Group();
  footL.position.set(0, -0.55, 0);
  calfL.add(footL);

  const legR = new THREE.Group();
  legR.position.set(0.45, 0, 0);
  hips.add(legR);
  const calfR = new THREE.Group();
  calfR.position.set(0, -0.55, 0);
  legR.add(calfR);
  const footR = new THREE.Group();
  footR.position.set(0, -0.55, 0);
  calfR.add(footR);

  // --- МЕШИ ---
  // 1. Таз.
  const bHips = new VertexColorBuilder('ork-hips', { roughness: 0.8, metalness: 0.15 });
  bHips.add(sph(0.5, 16, 12), C.leather, { scale: [1, 0.8, 0.9] });
  bHips.add(beveledBox(0.9, 0.2, 0.8, 0.05), C.leatherDark);
  hips.add(bHips.build());

  // 2. Торс.
  const bTorso = new VertexColorBuilder('ork-torso', { roughness: 0.82, metalness: 0.2 });
  bTorso.add(sph(0.55, 16, 12), C.skin, {
    position: [0, 0.3, 0],
    scale: [1.1, 0.8, 0.9]
  });
  bTorso.add(sph(0.5, 16, 12), C.skinDark, {
    position: [0, 0.0, 0],
    scale: [1.0, 0.8, 0.8]
  });
  bTorso.add(beveledBox(1.2, 0.8, 1.0, 0.1), C.leather, { position: [0, 0.2, 0] });
  bTorso.add(beveledBox(0.2, 0.8, 0.1, 0.02), C.brass, { position: [0, 0.2, 0.55] });

  for (const side of [-1, 1]) {
    bTorso.add(sph(0.4, 16, 12), C.armorRed, {
      position: [side * 0.95, 0.5, 0],
      scale: [1.2, 1, 1.2]
    });
    bTorso.add(cone(0.08, 0.3, 6), C.metalLight, {
      position: [side * 0.95, 0.8, 0],
      rotation: [0, 0, side * 0.2]
    });
  }
  chest.add(bTorso.build());

  // 3. Голова.
  const bHead = new VertexColorBuilder('ork-head', { roughness: 0.84, metalness: 0.12 });
  buildHead(bHead, type);
  head.add(bHead.build());

  // Глаза отдельными emissive-мешами.
  if (type !== 'blasta') {
    const eyeMat = new THREE.MeshBasicMaterial({ color: C.eyeRed });
    for (const x of [-0.15, 0.15]) {
      const eye = new THREE.Mesh(sph(0.04, 6, 6), eyeMat);
      eye.position.set(x, 0.05, 0.35);
      head.add(eye);
    }
  } else {
    const bionicEye = new THREE.Mesh(
      cyl(0.08, 0.08, 0.15, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa00 })
    );
    bionicEye.rotation.x = Math.PI / 2;
    bionicEye.position.set(-0.15, 0.05, 0.35);
    head.add(bionicEye);

    const eyeR = new THREE.Mesh(sph(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: C.eyeRed }));
    eyeR.position.set(0.15, 0.05, 0.35);
    head.add(eyeR);
  }

  // 4. Руки.
  const buildArmSegment = (bicepGroup, forearmGroup, handGroup) => {
    const bBicep = new VertexColorBuilder('ork-bicep', { roughness: 0.8, metalness: 0.15 });
    bBicep.add(cyl(0.25, 0.2, 0.55, 12), C.skin);
    bBicep.add(sph(0.2, 12, 8), C.skinDark, { position: [0, -0.25, 0] });
    bicepGroup.add(bBicep.build());

    const bForearm = new VertexColorBuilder('ork-forearm', { roughness: 0.78, metalness: 0.2 });
    bForearm.add(cyl(0.2, 0.15, 0.55, 12), C.skin, { position: [0, -0.25, 0] });
    bForearm.add(cyl(0.22, 0.22, 0.3, 12), C.metalDark, { position: [0, -0.25, 0] });
    forearmGroup.add(bForearm.build());

    const bHand = new VertexColorBuilder('ork-hand', { roughness: 0.8, metalness: 0.1 });
    bHand.add(beveledBox(0.25, 0.25, 0.25, 0.05), C.skinLight);
    bHand.add(beveledBox(0.15, 0.15, 0.2, 0.02), C.skin, { position: [0, 0, 0.15] });
    handGroup.add(bHand.build());
  };

  buildArmSegment(armL, forearmL, handL);
  buildArmSegment(armR, forearmR, handR);

  // 5. Ноги.
  const buildLegSegment = (thighGroup, calfGroup, footGroup) => {
    const bThigh = new VertexColorBuilder('ork-thigh', { roughness: 0.82, metalness: 0.15 });
    bThigh.add(cyl(0.3, 0.25, 0.55, 12), C.leather);
    bThigh.add(sph(0.25, 12, 8), C.skinDark, { position: [0, -0.25, 0] });
    bThigh.add(beveledBox(0.3, 0.3, 0.15, 0.02), C.armorRed, {
      position: [0, -0.25, 0.15]
    });
    thighGroup.add(bThigh.build());

    const bCalf = new VertexColorBuilder('ork-calf', { roughness: 0.84, metalness: 0.12 });
    bCalf.add(cyl(0.22, 0.25, 0.45, 12), C.leatherDark, { position: [0, -0.2, 0] });
    calfGroup.add(bCalf.build());

    const bFoot = new VertexColorBuilder('ork-foot', { roughness: 0.7, metalness: 0.3 });
    bFoot.add(beveledBox(0.35, 0.2, 0.5, 0.05), C.metalDark, { position: [0, -0.1, 0.1] });
    bFoot.add(beveledBox(0.4, 0.1, 0.2, 0.02), C.metalLight, { position: [0, -0.1, 0.3] });
    footGroup.add(bFoot.build());
  };

  buildLegSegment(legL, calfL, footL);
  buildLegSegment(legR, calfR, footR);

  // --- ОРУЖИЕ ---
  let weapon = null;
  if (type === 'melee') {
    weapon = buildChoppa();
    // Разворачиваем топор, чтобы лезвие смотрело вперёд при ударе.
    weapon.rotation.set(Math.PI, 0, 0);
    weapon.position.set(0, -0.2, 0.1);
    handR.add(weapon);
  } else if (type === 'shoota') {
    weapon = buildShoota1();
    weapon.position.set(0, -0.2, 0.1);
    weapon.rotation.set(-Math.PI / 2, 0, 0);
    handR.add(weapon);
  } else if (type === 'blasta') {
    weapon = buildShoota2();
    weapon.position.set(0, -0.2, 0.1);
    weapon.rotation.set(-Math.PI / 2, 0, 0);
    handR.add(weapon);
  }

  // Стартовая поза: стрелки держат оружие на уровне груди.
  if (type !== 'melee') {
    armR.rotation.x = -1.35;
    forearmR.rotation.x = -0.25;
    armL.rotation.x = -1.05;
    forearmL.rotation.x = -0.35;
    chest.rotation.x = 0.18;
  } else {
    armR.rotation.x = 0.1;
    armL.rotation.x = -0.1;
  }

  if (type !== 'melee') root.scale.setScalar(1.0);

  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const isBlasta = type === 'blasta';
  root.userData = {
    variant: type,
    weaponType: type === 'melee' ? 'axe' : isBlasta ? 'blasta' : 'shoota',
    // Новый скелет доступен и по «старым» именам, которые использует Enemy.
    body: chest,
    hips,
    spine,
    chest,
    neck,
    head,
    armL,
    forearmL,
    handL,
    armR,
    forearmR,
    handR,
    legL,
    calfL,
    footL,
    legR,
    calfR,
    footR,
    // Алиасы для обратной совместимости.
    leftArm: armL,
    rightArm: armR,
    leftLeg: legL,
    rightLeg: legR,
    weapon,
    muzzle: weapon?.getObjectByName('muzzle') || null,
    // Прямые ссылки для стрельбы и эффектов (совместимость с прототипом).
    glowMaterial: weapon?.userData?.glowMaterial || null,
    muzzleLight: weapon?.userData?.muzzleLight || null,
    height: 2.0,
    radius: 0.45,
    eyeMaterial: M.orkEye()
  };

  return root;
}

export function makeOrkBoy() {
  return buildOrk('melee');
}

export function makeOrkShooter() {
  return buildOrk('shoota');
}

export function makeOrkBlasta() {
  return buildOrk('blasta');
}

export function makeOrkNob() {
  const root = buildOrk('melee');
  root.name = 'ork-nob';
  root.scale.setScalar(1.45);
  root.userData.variant = 'nob';
  root.userData.height = 2.9;
  root.userData.radius = 0.7;
  // У ноба оружие крупнее.
  return root;
}

// Анимация простоя: дыхание торса (используется QA-утилитами).
export function animateOrkIdle(ork, time) {
  const chest = ork.userData?.chest;
  if (!chest) return;
  const breathing = Math.sin(time * 2.1 + (ork.id || 0)) * 0.02;
  chest.rotation.x = 0.25 + breathing;
}
