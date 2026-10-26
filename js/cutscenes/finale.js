// Финальная кат-сцена: штаб Имперской Гвардии.
// От первого лица у ворот → внутрь → общий план укреплений.

import * as THREE from 'three';
import { makeHQGate, makeSandbags, makeFlag } from '../models/environment.js';
import { makeBarrel, makeCampfire, makeAmmoCrate } from '../models/props.js';
import { makeGuardsman } from '../models/allies.js';
import { disposeObject3D } from '../cutscene.js';
import { makeRng } from '../config.js';

export function createFinale({ scene }) {
  const group = new THREE.Group();
  group.name = 'cutscene-finale';

  const rng = makeRng(1234);

  // Выжженная земля.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.97, metalness: 0.03 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Ворота штаба.
  const gate = makeHQGate();
  gate.position.set(0, 0, -8);
  group.add(gate);

  // Мешки с песком по флангам.
  for (let i = 0; i < 4; i += 1) {
    const left = makeSandbags();
    left.position.set(-8 - i * 1.8, 0, -2 + i * 0.6);
    left.rotation.y = 0.15;
    group.add(left);

    const right = makeSandbags();
    right.position.set(8 + i * 1.8, 0, -2 + i * 0.6);
    right.rotation.y = -0.15;
    group.add(right);
  }

  // Флаги на флангах.
  for (const side of [-1, 1]) {
    const flag = makeFlag();
    flag.position.set(side * 12, 0, -6);
    flag.rotation.y = side * 0.2;
    group.add(flag);
  }

  // Бочки, ящик с патронами — быт обороны.
  for (let i = 0; i < 6; i += 1) {
    const barrel = makeBarrel();
    barrel.position.set(-4 + rng() * 8, 0, -3 + rng() * 5);
    group.add(barrel);
  }
  const crate = makeAmmoCrate();
  crate.position.set(3.2, 0, -1.5);
  crate.rotation.y = -0.4;
  group.add(crate);

  // Костры у ворот.
  for (const [x, z] of [[-6, -1], [6, -1]]) {
    const fire = makeCampfire({ withLight: false });
    fire.position.set(x, 0, z);
    group.add(fire);

    const light = new THREE.PointLight(0xff8a3a, 2.4, 12, 2);
    light.position.set(x, 1.2, z);
    light.castShadow = false;
    group.add(light);
  }

  // Внутренний свет штаба за воротами.
  const interior = new THREE.PointLight(0xffd8a8, 3.0, 20, 2);
  interior.position.set(0, 2.6, -12);
  interior.castShadow = false;
  group.add(interior);

  // -------------------------------------------------------------------------
  // Штаб: бетонный бункер, окна, прожекторы, мачта связи
  // -------------------------------------------------------------------------
  const concrete = new THREE.MeshStandardMaterial({ color: 0x6a6a62, roughness: 0.95, metalness: 0.05 });
  const concreteDark = new THREE.MeshStandardMaterial({ color: 0x4a4a44, roughness: 0.97 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.55, metalness: 0.7 });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff0c0,
    emissive: 0xffc266,
    emissiveIntensity: 2.6,
    roughness: 0.4
  });
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff0c0,
    emissive: 0xffd089,
    emissiveIntensity: 3.0,
    roughness: 0.3
  });

  const addBox = (w, h, d, material, x, y, z, rotationY = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Основной бункер за воротами.
  addBox(32, 7, 9, concrete, 0, 3.5, -18);
  addBox(34, 0.9, 10, concreteDark, 0, 7.3, -18);
  addBox(9, 4.5, 6, concrete, -19, 2.25, -15);
  addBox(9, 4.5, 6, concrete, 19, 2.25, -15);

  // Входной портал и дверной проём.
  addBox(5.5, 3.6, 1.4, concreteDark, -5, 1.8, -13.2);
  addBox(5.5, 3.6, 1.4, concreteDark, 5, 1.8, -13.2);
  addBox(15.5, 1.0, 1.6, concreteDark, 0, 4.1, -13.2);

  // Окна штаба (светятся).
  for (let i = -2; i <= 2; i += 1) {
    addBox(1.6, 1.1, 0.12, windowMaterial, i * 4.2, 5.2, -13.4);
  }

  // Прожекторные мачты.
  for (const side of [-1, 1]) {
    addBox(0.4, 6, 0.4, metal, side * 10, 3, -11);
    addBox(1.5, 0.5, 0.9, metal, side * 10, 6, -11);
    addBox(1.1, 0.42, 0.12, lampMaterial, side * 10, 6, -10.4);

    const light = new THREE.PointLight(0xffe0b0, 2.2, 20, 2);
    light.position.set(side * 10, 6, -10.5);
    light.castShadow = false;
    group.add(light);
  }

  // Мачта связи с антенной.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 15, 10), metal);
  mast.position.set(12, 7.5, -19);
  mast.castShadow = true;
  group.add(mast);

  for (let i = 0; i < 4; i += 1) {
    addBox(3.2 - i * 0.5, 0.12, 0.12, metal, 12, 6 + i * 2.2, -19);
  }

  // Бетонные заграждения перед бункером.
  for (let i = -2; i <= 2; i += 1) {
    addBox(2.4, 1.2, 1.2, concrete, i * 3.6, 0.6, -11.5);
  }

  // Союзные гвардейцы у ворот и на позициях.
  const guardSpots = [
    { x: -5, z: -4.5, rotation: 0 },
    { x: 5, z: -4.5, rotation: 0 },
    { x: -11, z: -4, rotation: 0 },
    { x: 11, z: -4, rotation: 0 }
  ];

  for (const spot of guardSpots) {
    const guard = makeGuardsman();
    guard.position.set(spot.x, 0, spot.z);
    guard.rotation.y = spot.rotation;
    guard.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    group.add(guard);
  }

  return {
    duration: 30,
    startFade: 1,

    keyframes: [
      { t: 0, pos: [0, 1.7, 4], lookAt: [0, 1.9, -8], fov: 75 },
      { t: 7, pos: [0, 1.7, 0], lookAt: [0, 1.8, -8], fov: 72 },
      { t: 13, pos: [0, 1.7, -2.5], lookAt: [0, 1.7, -10], fov: 70 },
      { t: 15, cut: true, pos: [0, 4.5, 14], lookAt: [0, 2, -8], fov: 58 },
      { t: 24, pos: [0, 7, 26], lookAt: [0, 2.4, -8], fov: 52 },
      { t: 30, pos: [0, 7, 26], lookAt: [0, 2.4, -8], fov: 52 }
    ],

    events: [
      { t: 0.2, type: 'fade', to: 0, duration: 1.4 },
      {
        t: 3,
        type: 'dialogue',
        speaker: '[Сержант Колл]',
        text:
          'Комиссар Вондер. Мы уже не надеялись. Докладываю: гарнизон держится, но орки ' +
          'давят со всех сторон. Ваше прибытие — это... это многое значит для парней.'
      },
      {
        t: 12,
        type: 'dialogue',
        speaker: '[Гарик Вондер]',
        text:
          'Сержант. Я потерпел крушение, но не потерял веру. И вы не потеряете. Мы удержим ' +
          'этот штаб. Мы выжжем орочью заразу с этой планеты. Во имя Императора.'
      },
      { t: 20, type: 'dialogue', speaker: '[Повествование]', text: 'Гарнизон получил командира. Оборона продолжается.' },
      { t: 26, type: 'fade', to: 1, duration: 3.5 }
    ],

    onStart() {
      scene.add(group);
    },

    onEnd() {
      scene.remove(group);
      disposeObject3D(group);
    }
  };
}
