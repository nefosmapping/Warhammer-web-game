// Базовый мир: рендерер, камера, сцена, свет, туман, смена темы уровня.
// В Фазе 1 здесь также собирается атмосферный фон для меню и демо-сцены.
// Позже levels/*.js будут наполнять сцену через этот же объект.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG, LEVEL_THEMES, makeRng } from './config.js';

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.elapsed = 0;

    this.themeName = 'menu';
    this.menuMode = true;
    this.menuAngle = 0.35;

    this.pointLights = [];
    this.backdrop = null;
    this.dust = null;

    this._initRenderer();
    this._initScene();
    this._initEnvironment();
    this._initLights();
    this.applyTheme('menu');
    this._buildBackdrop();
    this._initDust();
    this._bindResize();
  }

  // -------------------------------------------------------------------------
  // Инициализация
  // -------------------------------------------------------------------------

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CONFIG.render.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initScene() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.render.fov,
      window.innerWidth / Math.max(1, window.innerHeight),
      CONFIG.render.near,
      CONFIG.render.far
    );
    // Порядок YXZ нужен для корректного FPS-обзора (yaw + pitch без крена).
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, CONFIG.player.eyeHeight, 10);
  }

  // Процедурная IBL-среда без внешних ассетов: без неё металлические
  // PBR-материалы выглядят почти чёрными, так как им нечего отражать.
  _initEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    this.scene.environment = target.texture;
    room.dispose?.();
    pmrem.dispose();
  }

  _initLights() {
    // Основной «солнечный» свет с тенями.
    this.sun = new THREE.DirectionalLight(0xfff0c0, 1.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(CONFIG.render.shadowMapSize, CONFIG.render.shadowMapSize);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 120;
    this.sun.shadow.camera.left = -36;
    this.sun.shadow.camera.right = 36;
    this.sun.shadow.camera.top = 36;
    this.sun.shadow.camera.bottom = -36;
    this.sun.shadow.bias = CONFIG.render.shadowBias;
    this.sun.shadow.normalBias = CONFIG.render.shadowNormalBias;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.sun);
    // Цель света — центр арены.
    this.sun.target.position.set(0, 0, 0);
    this.scene.add(this.sun.target);

    // Небесная подсветка, чтобы тени не были абсолютно чёрными.
    this.hemi = new THREE.HemisphereLight(0x667744, 0x141008, 0.8);
    this.scene.add(this.hemi);

    // Общий AmbientLight: раньше 0.18 давал «чёрную дыру» в тенях.
    this.ambient = new THREE.AmbientLight(0x565650, 0.4);
    this.scene.add(this.ambient);
  }

  // -------------------------------------------------------------------------
  // Тема уровня
  // -------------------------------------------------------------------------

  applyTheme(name) {
    const theme = LEVEL_THEMES[name] || LEVEL_THEMES.menu;
    this.themeName = name;

    this.scene.background = new THREE.Color(theme.background);
    this.scene.fog = new THREE.FogExp2(theme.fog.color, theme.fog.density);

    this.sun.color.setHex(theme.sun.color);
    this.sun.intensity = theme.sun.intensity;
    this.sun.position.set(theme.sun.position[0], theme.sun.position[1], theme.sun.position[2]);

    this.hemi.color.setHex(theme.hemi.sky);
    this.hemi.groundColor.setHex(theme.hemi.ground);
    this.hemi.intensity = theme.hemi.intensity;

    // Убираем точечные источники предыдущей темы.
    for (const light of this.pointLights) {
      this.scene.remove(light);
      light.dispose?.();
    }
    this.pointLights = [];

    for (const spec of theme.points) {
      const light = new THREE.PointLight(spec.color, spec.intensity, spec.distance, 2);
      light.position.set(spec.position[0], spec.position[1], spec.position[2]);
      light.castShadow = false;
      light.userData.baseIntensity = spec.intensity;
      light.userData.flicker = Boolean(spec.flicker);
      light.userData.phase = Math.random() * Math.PI * 2;
      this.scene.add(light);
      this.pointLights.push(light);
    }
  }

  // -------------------------------------------------------------------------
  // Фон меню: обломки, камни, мёртвые деревья, костёр
  // -------------------------------------------------------------------------

  _buildBackdrop() {
    const group = new THREE.Group();
    group.name = 'menu-backdrop';
    const rng = makeRng(2077);

    const groundMat = new THREE.MeshStandardMaterial({ color: 0x20261b, roughness: 0.97, metalness: 0.02 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220, 1, 1), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3a34, roughness: 0.9, metalness: 0.1 });
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x5a3a28, roughness: 0.85, metalness: 0.45 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x33281e, roughness: 0.95, metalness: 0.0 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f4224, roughness: 0.95, metalness: 0.0 });

    // Камни и ржавые обломки.
    for (let i = 0; i < 16; i += 1) {
      const radius = 0.35 + rng() * 1.2;
      const mesh = new THREE.Mesh(
        new THREE.DodecahedronGeometry(radius, 0),
        i % 4 === 0 ? rustMat : rockMat
      );
      const angle = rng() * Math.PI * 2;
      const distance = 5 + rng() * 22;
      mesh.position.set(Math.cos(angle) * distance, radius * 0.55, Math.sin(angle) * distance);
      mesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // Мёртвые деревья: ствол + наклонные ветви.
    for (let i = 0; i < 7; i += 1) {
      const tree = new THREE.Group();
      const height = 3.5 + rng() * 3;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12 + rng() * 0.08, 0.24 + rng() * 0.1, height, 8),
        woodMat
      );
      trunk.position.y = height / 2;
      trunk.castShadow = true;
      tree.add(trunk);

      for (let b = 0; b < 2; b += 1) {
        const branch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.1, height * 0.45, 6),
          woodMat
        );
        branch.position.set(0.25, height * (0.55 + b * 0.15), 0);
        branch.rotation.z = -0.9 - rng() * 0.4;
        branch.rotation.y = rng() * Math.PI;
        branch.castShadow = true;
        tree.add(branch);
      }

      // Редкая выжившая листва.
      if (i % 3 === 0) {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + rng() * 0.5, 0), leafMat);
        crown.position.y = height + 0.3;
        crown.castShadow = true;
        tree.add(crown);
      }

      const angle = rng() * Math.PI * 2;
      const distance = 8 + rng() * 20;
      tree.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
      tree.rotation.y = rng() * Math.PI * 2;
      group.add(tree);
    }

    // Пара ящиков у костра.
    for (let i = 0; i < 3; i += 1) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), woodMat);
      crate.position.set(4.6 + i * 1.1, 0.4, 1.6 - i * 0.4);
      crate.rotation.y = i * 0.4;
      crate.castShadow = true;
      crate.receiveShadow = true;
      group.add(crate);
    }

    // Костёр: угли + камни вокруг.
    const fireGlow = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.35, 1),
      new THREE.MeshStandardMaterial({
        color: 0xff7a22,
        emissive: 0xff5a12,
        emissiveIntensity: 2.6,
        roughness: 0.7,
        metalness: 0
      })
    );
    fireGlow.position.set(6, 0.35, 2);
    group.add(fireGlow);

    for (let i = 0; i < 7; i += 1) {
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + rng() * 0.1, 0), rockMat);
      const a = (i / 7) * Math.PI * 2;
      stone.position.set(6 + Math.cos(a) * 0.65, 0.15, 2 + Math.sin(a) * 0.65);
      stone.castShadow = true;
      group.add(stone);
    }

    // Обломки «Валькирии» — тёмные панели, разбросанные рядом.
    for (let i = 0; i < 5; i += 1) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(1.2 + rng() * 2.2, 0.08, 0.8 + rng() * 1.4),
        rustMat
      );
      panel.position.set(-7 + rng() * 6, 0.15 + rng() * 0.5, -4 + rng() * 7);
      panel.rotation.set(rng() * 0.9, rng() * Math.PI, rng() * 0.9);
      panel.castShadow = true;
      panel.receiveShadow = true;
      group.add(panel);
    }

    this.backdrop = group;
    this.scene.add(group);
  }

  // Пыль в воздухе — дешёвые Points.
  _initDust() {
    const count = 420;
    const positions = new Float32Array(count * 3);
    const rng = makeRng(99);

    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (rng() - 0.5) * 70;
      positions[i * 3 + 1] = rng() * 9;
      positions[i * 3 + 2] = (rng() - 0.5) * 70;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xc9b98a,
      size: 0.075,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      sizeAttenuation: true
    });

    this.dust = new THREE.Points(geometry, material);
    this.scene.add(this.dust);
  }

  // -------------------------------------------------------------------------
  // Обновление и рендер
  // -------------------------------------------------------------------------

  setMenuMode(enabled) {
    this.menuMode = enabled;
  }

  updateMenuCamera(dt) {
    this.menuAngle += dt * 0.11;
    const radius = 12.5;
    this.camera.position.set(
      Math.cos(this.menuAngle) * radius,
      3.3 + Math.sin(this.menuAngle * 0.7) * 0.45,
      Math.sin(this.menuAngle) * radius
    );
    this.camera.lookAt(0, 1.5, 0);
  }

  update(dt) {
    this.elapsed += dt;

    // Мерцание костров: синус + шум.
    for (const light of this.pointLights) {
      if (!light.userData.flicker) continue;
      const t = this.elapsed * 7.3 + light.userData.phase;
      const flicker = 0.82 + Math.sin(t) * 0.08 + Math.sin(t * 2.7) * 0.06 + (Math.random() - 0.5) * 0.05;
      light.intensity = light.userData.baseIntensity * flicker;
    }

    if (this.dust) {
      this.dust.rotation.y += dt * 0.015;
      this.dust.position.y = Math.sin(this.elapsed * 0.2) * 0.25;
    }

    if (this.menuMode) {
      this.updateMenuCamera(dt);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  getDrawCalls() {
    return this.renderer.info.render.calls;
  }

  getTriangles() {
    return this.renderer.info.render.triangles;
  }

  // -------------------------------------------------------------------------
  // Resize
  // -------------------------------------------------------------------------

  _bindResize() {
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio));
    this.renderer.setSize(width, height, false);
  }
}
