// Процедурная модель Имперского Гвардейца (союзник).
// Детализированная версия из прототипа «гвардеец 3d.html»: скелет
// hips → spine → chest → neck → head, руки и ноги с сегментами,
// лазган с дульным маркером и вспышкой. Модель смотрит вперёд по +Z.

import * as THREE from 'three';
import { VertexColorBuilder, beveledBox, addMarker } from './utils.js';

const cyl = (rt, rb, h, seg = 12, hs = 1, open = false) =>
  new THREE.CylinderGeometry(rt, rb, h, seg, hs, open);
const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg);
const torus = (r, t, rs = 8, ts = 16, arc = Math.PI * 2) =>
  new THREE.TorusGeometry(r, t, rs, ts, arc);

const C = {
  armorGreen: 0x4a5a3a,
  armorGreenDark: 0x354228,
  pantsKhaki: 0x8a7d5c,
  pantsKhakiDark: 0x6b5f42,
  leather: 0x1c1c1c,
  leatherDark: 0x111111,
  skin: 0xc99e7a,
  metalDark: 0x2a2a2e,
  metalLight: 0x6b6b70,
  gunGreen: 0x5a7a4a,
  silver: 0xcccccc,
  eyeRed: 0xff1100
};

// ---------------------------------------------------------------------------
// Лазган (ствол направлен в +Z)
// ---------------------------------------------------------------------------

function buildLasgun() {
  const group = new THREE.Group();
  group.name = 'lasgun';

  const b = new VertexColorBuilder('lasgun-mesh', { roughness: 0.5, metalness: 0.7 });

  // Ресивер.
  b.add(beveledBox(0.12, 0.16, 0.5, 0.02), C.gunGreen, { position: [0, 0.05, 0] });
  b.add(beveledBox(0.13, 0.02, 0.5, 0.005), C.silver, { position: [0, 0.14, 0] });
  b.add(beveledBox(0.13, 0.02, 0.5, 0.005), C.silver, { position: [0, -0.04, 0] });

  // Ствол.
  b.add(cyl(0.025, 0.025, 0.7, 12), C.metalDark, {
    position: [0, 0.08, 0.6],
    rotation: [Math.PI / 2, 0, 0]
  });
  b.add(beveledBox(0.06, 0.06, 0.4, 0.01), C.gunGreen, { position: [0, 0.08, 0.45] });
  for (let i = 0; i < 3; i += 1) {
    b.add(torus(0.04, 0.01, 6, 12), C.metalLight, {
      position: [0, 0.08, 0.35 + i * 0.1],
      rotation: [Math.PI / 2, 0, 0]
    });
  }
  b.add(cyl(0.04, 0.04, 0.1, 12), C.metalLight, {
    position: [0, 0.08, 0.95],
    rotation: [Math.PI / 2, 0, 0]
  });

  // Приклад.
  b.add(beveledBox(0.08, 0.12, 0.3, 0.02), C.metalDark, { position: [0, 0.05, -0.4] });
  b.add(beveledBox(0.1, 0.16, 0.1, 0.02), C.metalDark, { position: [0, 0.02, -0.6] });

  // Магазин.
  b.add(beveledBox(0.08, 0.2, 0.12, 0.02), C.metalDark, {
    position: [0, -0.15, 0.1],
    rotation: [0.2, 0, 0]
  });
  b.add(beveledBox(0.06, 0.04, 0.1, 0.01), C.silver, {
    position: [0, -0.25, 0.08],
    rotation: [0.2, 0, 0]
  });

  // Рукоять.
  b.add(beveledBox(0.06, 0.18, 0.1, 0.02), C.leather, {
    position: [0, -0.12, -0.12],
    rotation: [-0.3, 0, 0]
  });
  b.add(torus(0.04, 0.01, 6, 12), C.metalDark, {
    position: [0, -0.08, -0.04],
    rotation: [0, Math.PI / 2, 0]
  });
  b.add(beveledBox(0.01, 0.04, 0.01, 0.002), C.metalLight, { position: [0, -0.08, -0.04] });

  // Прицел.
  b.add(beveledBox(0.03, 0.05, 0.06, 0.01), C.metalDark, { position: [0, 0.16, -0.05] });
  b.add(beveledBox(0.015, 0.03, 0.015, 0.005), C.metalLight, { position: [0, 0.19, -0.05] });
  b.add(beveledBox(0.025, 0.04, 0.02, 0.005), C.metalLight, { position: [0, 0.14, 0.7] });

  // Аквила.
  b.add(beveledBox(0.12, 0.04, 0.04, 0.01), C.silver, { position: [0, 0.08, 0.1] });
  for (const side of [-1, 1]) {
    b.add(beveledBox(0.1, 0.015, 0.015, 0.005), C.silver, {
      position: [side * 0.06, 0.1, 0.1],
      rotation: [0, 0, side * 0.2]
    });
    b.add(beveledBox(0.08, 0.015, 0.015, 0.005), C.silver, {
      position: [side * 0.05, 0.07, 0.1],
      rotation: [0, 0, side * 0.1]
    });
    b.add(beveledBox(0.05, 0.015, 0.015, 0.005), C.silver, {
      position: [side * 0.03, 0.05, 0.1]
    });
  }

  group.add(b.build());

  // Вспышка лазгана.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const flash = new THREE.Mesh(cone(0.12, 0.4, 8), flashMat);
  flash.rotation.x = Math.PI / 2;
  flash.position.set(0, 0.08, 1.1);
  flash.visible = false;
  flash.name = 'muzzleFlash';
  group.add(flash);

  const light = new THREE.PointLight(0x88ccff, 0, 5, 2);
  light.position.set(0, 0.08, 1.0);
  light.name = 'muzzleLight';
  light.castShadow = false;
  group.add(light);

  addMarker(group, 'muzzle', [0, 0.08, 1.05]);

  group.userData.weaponType = 'lasgun';
  group.userData.flash = flash;
  group.userData.muzzleLight = light;
  return group;
}

// ---------------------------------------------------------------------------
// Имперский гвардеец
// ---------------------------------------------------------------------------

export function makeGuardsman() {
  const root = new THREE.Group();
  root.name = 'guardsman';

  // Скелет.
  const hips = new THREE.Group();
  hips.position.y = 1.1;
  root.add(hips);

  const spine = new THREE.Group();
  spine.position.y = 0.1;
  hips.add(spine);

  const chest = new THREE.Group();
  chest.position.y = 0.25;
  spine.add(chest);

  const neck = new THREE.Group();
  neck.position.set(0, 0.3, 0);
  chest.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.15, 0);
  neck.add(head);

  const armL = new THREE.Group();
  armL.position.set(-0.25, 0.25, 0);
  chest.add(armL);
  const forearmL = new THREE.Group();
  forearmL.position.set(0, -0.4, 0);
  armL.add(forearmL);
  const handL = new THREE.Group();
  handL.position.set(0, -0.4, 0);
  forearmL.add(handL);

  const armR = new THREE.Group();
  armR.position.set(0.25, 0.25, 0);
  chest.add(armR);
  const forearmR = new THREE.Group();
  forearmR.position.set(0, -0.4, 0);
  armR.add(forearmR);
  const handR = new THREE.Group();
  handR.position.set(0, -0.4, 0);
  forearmR.add(handR);

  const legL = new THREE.Group();
  legL.position.set(-0.15, 0, 0);
  hips.add(legL);
  const calfL = new THREE.Group();
  calfL.position.set(0, -0.5, 0);
  legL.add(calfL);
  const footL = new THREE.Group();
  footL.position.set(0, -0.5, 0);
  calfL.add(footL);

  const legR = new THREE.Group();
  legR.position.set(0.15, 0, 0);
  hips.add(legR);
  const calfR = new THREE.Group();
  calfR.position.set(0, -0.5, 0);
  legR.add(calfR);
  const footR = new THREE.Group();
  footR.position.set(0, -0.5, 0);
  calfR.add(footR);

  // Таз.
  const bHips = new VertexColorBuilder('guard-hips', { roughness: 0.85, metalness: 0.1 });
  bHips.add(beveledBox(0.35, 0.25, 0.25, 0.05), C.pantsKhaki);
  bHips.add(beveledBox(0.37, 0.08, 0.27, 0.02), C.leather);
  bHips.add(beveledBox(0.08, 0.1, 0.05, 0.01), C.metalLight, { position: [0, 0, 0.15] });
  hips.add(bHips.build());

  // Торс.
  const bTorso = new VertexColorBuilder('guard-torso', { roughness: 0.84, metalness: 0.16 });
  bTorso.add(beveledBox(0.45, 0.5, 0.3, 0.05), C.pantsKhaki, { position: [0, 0.05, 0] });
  bTorso.add(beveledBox(0.5, 0.35, 0.35, 0.05), C.armorGreen, { position: [0, 0.1, 0] });
  for (const side of [-1, 1]) {
    bTorso.add(sph(0.18, 12, 10), C.armorGreen, {
      position: [side * 0.28, 0.25, 0],
      scale: [1.2, 0.8, 1.2]
    });
  }
  chest.add(bTorso.build());

  // Шея.
  const bNeck = new VertexColorBuilder('guard-neck', { roughness: 0.9, metalness: 0.0 });
  bNeck.add(cyl(0.08, 0.1, 0.2, 12), C.skin, { position: [0, 0.1, 0] });
  neck.add(bNeck.build());

  // Голова.
  const bHead = new VertexColorBuilder('guard-head', { roughness: 0.86, metalness: 0.12 });
  bHead.add(sph(0.15, 16, 12), C.skin, { scale: [1, 1.1, 1] });
  // Каска-полусфера: оставляем лицо открытым.
  bHead.add(
    new THREE.SphereGeometry(0.18, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.8),
    C.armorGreen,
    { position: [0, 0.05, 0] }
  );
  bHead.add(beveledBox(0.25, 0.04, 0.3, 0.02), C.armorGreenDark, {
    position: [0, 0.02, 0.05]
  });
  bHead.add(beveledBox(0.16, 0.12, 0.12, 0.03), C.metalDark, {
    position: [0, -0.08, 0.1]
  });
  bHead.add(cyl(0.04, 0.04, 0.08, 8), C.metalLight, {
    position: [0, -0.12, 0.16],
    rotation: [Math.PI / 2, 0, 0]
  });
  bHead.add(beveledBox(0.16, 0.05, 0.05, 0.01), C.metalDark, {
    position: [0, 0.02, 0.13]
  });
  head.add(bHead.build());

  const eyeMat = new THREE.MeshBasicMaterial({ color: C.eyeRed });
  for (const x of [-0.05, 0.05]) {
    const eye = new THREE.Mesh(sph(0.02, 8, 8), eyeMat);
    eye.position.set(x, 0.02, 0.15);
    head.add(eye);
  }

  // Руки.
  const buildArmSegment = (bicepGroup, forearmGroup, handGroup) => {
    const bBicep = new VertexColorBuilder('guard-bicep', { roughness: 0.88, metalness: 0.05 });
    bBicep.add(sph(0.1, 12, 10), C.pantsKhaki);
    bBicep.add(cyl(0.1, 0.08, 0.4, 12), C.pantsKhaki, { position: [0, -0.2, 0] });
    bicepGroup.add(bBicep.build());

    const bForearm = new VertexColorBuilder('guard-forearm', { roughness: 0.88, metalness: 0.05 });
    bForearm.add(sph(0.08, 12, 10), C.pantsKhaki);
    bForearm.add(cyl(0.08, 0.07, 0.4, 12), C.pantsKhaki, { position: [0, -0.2, 0] });
    bForearm.add(cyl(0.085, 0.085, 0.08, 12), C.leather, { position: [0, -0.35, 0] });
    forearmGroup.add(bForearm.build());

    const bHand = new VertexColorBuilder('guard-hand', { roughness: 0.9, metalness: 0.0 });
    bHand.add(beveledBox(0.08, 0.1, 0.08, 0.02), C.skin, { position: [0, -0.05, 0] });
    handGroup.add(bHand.build());
  };

  buildArmSegment(armL, forearmL, handL);
  buildArmSegment(armR, forearmR, handR);

  // Ноги.
  const buildLegSegment = (thighGroup, calfGroup, footGroup) => {
    const bThigh = new VertexColorBuilder('guard-thigh', { roughness: 0.88, metalness: 0.05 });
    bThigh.add(sph(0.12, 12, 10), C.pantsKhaki);
    bThigh.add(cyl(0.12, 0.1, 0.5, 12), C.pantsKhaki, { position: [0, -0.25, 0] });
    thighGroup.add(bThigh.build());

    const bCalf = new VertexColorBuilder('guard-calf', { roughness: 0.88, metalness: 0.05 });
    bCalf.add(sph(0.1, 12, 10), C.pantsKhaki);
    bCalf.add(cyl(0.1, 0.08, 0.5, 12), C.pantsKhaki, { position: [0, -0.25, 0] });
    calfGroup.add(bCalf.build());

    const bFoot = new VertexColorBuilder('guard-foot', { roughness: 0.9, metalness: 0.08 });
    bFoot.add(beveledBox(0.14, 0.2, 0.25, 0.03), C.leather, { position: [0, -0.1, 0.05] });
    footGroup.add(bFoot.build());
  };

  buildLegSegment(legL, calfL, footL);
  buildLegSegment(legR, calfR, footR);

  // Оружие в правой руке.
  const weapon = buildLasgun();
  weapon.position.set(0, 0.1, -0.05);
  weapon.rotation.set(Math.PI / 2, 0, 0);
  handR.add(weapon);

  // Стартовая стойка: лазган у груди.
  armR.rotation.x = -1.2;
  forearmR.rotation.x = -0.3;
  armL.rotation.x = -1.2;
  forearmL.rotation.x = -0.8;
  armL.rotation.y = 0.3;
  armL.rotation.z = 0.2;

  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  root.userData = {
    kind: 'ally',
    height: 2.0,
    radius: 0.35,
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
    // Алиасы для возможных внешних анимаций.
    leftArm: armL,
    rightArm: armR,
    leftLeg: legL,
    rightLeg: legR,
    weapon,
    muzzle: weapon.getObjectByName('muzzle'),
    flash: weapon.userData.flash,
    muzzleLight: weapon.userData.muzzleLight
  };

  return root;
}
