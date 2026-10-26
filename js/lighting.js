// Освещение и тени. Приоритет — трассированные тени three-realtime-rt,
// но библиотеки с таким API в публичных CDN нет, поэтому используется
// согласованный fallback: Cascaded Shadow Maps (CSM) + SSAO в постобработке.
// CSM даёт высокое разрешение теней у камеры и мягкое затухание вдали.
//
// Все параметры теней вынесены в CONFIG.render.csm и CONFIG.render.fallbackShadow,
// чтобы их можно было крутить без правки кода.

import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { CONFIG, LEVEL_THEMES } from './config.js';

export class LightingSystem {
  constructor({ scene, camera, world, renderer, disableCSM = false }) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.renderer = renderer;

    this.csmConfig = CONFIG.render.csm;
    this.fallbackConfig = CONFIG.render.fallbackShadow;

    this.csm = null;
    this.enabled = false;
    this.themeName = 'menu';
    // WeakSet: материалы кат-сцен и уровней удаляются вместе со сценой,
    // и не держатся здесь после dispose().
    this.patchedMaterials = new WeakSet();

    if (disableCSM) {
      this._fallback(null);
      return;
    }

    try {
      this._initCSM();
    } catch (error) {
      this._fallback(error);
    }
  }

  // -------------------------------------------------------------------------
  // CSM
  // -------------------------------------------------------------------------

  _initCSM() {
    const config = this.csmConfig;
    const theme = LEVEL_THEMES.menu;
    const direction = this._directionFromTheme(theme);

    this.csm = new CSM({
      maxFar: config.maxFar,
      // Два каскада — компромисс между качеством контактных теней
      // и бюджетом draw call'ов (каждый каскад — отдельный shadow pass).
      cascades: config.cascades,
      mode: config.mode,
      parent: this.scene,
      shadowMapSize: config.shadowMapSize,
      lightDirection: direction,
      camera: this.camera,
      lightIntensity: theme.sun.intensity,
      lightNear: config.lightNear,
      lightFar: config.lightFar,
      lightMargin: config.lightMargin,
      shadowBias: config.bias
    });

    // fade требует, чтобы материалы были пропатчены ПОСЛЕ включения fade,
    // поэтому выставляем его до refreshMaterials() (вызывается из main.js).
    this.csm.fade = true;
    this._applyShadowSettings();

    // У штатного солнца мира отключаем тень, чтобы не рендерить её дважды.
    if (this.world?.sun) this.world.sun.castShadow = false;

    this.enabled = true;
  }

  _directionFromTheme(theme) {
    // Направление света — от источника к сцене (обратное позиции «солнца»).
    return new THREE.Vector3(
      -theme.sun.position[0],
      -theme.sun.position[1],
      -theme.sun.position[2]
    ).normalize();
  }

  // Единая точка применения параметров теней.
  // ВАЖНО: CSM читает shadowBias только при создании каскадов, поэтому
  // менять csm.shadowBias постфактум бесполезно — правим сами lights.
  _applyShadowSettings() {
    if (!this.csm) return;

    const config = this.csmConfig;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    for (const light of this.csm.lights) {
      light.castShadow = true;
      light.shadow.mapSize.set(config.shadowMapSize, config.shadowMapSize);
      light.shadow.bias = config.bias;
      light.shadow.normalBias = config.normalBias;
      light.shadow.camera.near = config.lightNear;
      light.shadow.camera.far = config.lightFar;
      light.shadow.camera.updateProjectionMatrix();
    }
  }

  // -------------------------------------------------------------------------
  // Fallback: один обычный DirectionalLight с PCFSoftShadowMap
  // -------------------------------------------------------------------------

  _fallback(error) {
    this.enabled = false;
    this.csm = null;

    if (error) {
      console.warn('[Lighting] CSM недоступен, используется PCFSoftShadowMap:', error);
    }

    const sun = this.world?.sun;
    const renderer = this.world?.renderer;
    if (!sun || !renderer) return;

    const config = this.fallbackConfig;

    sun.castShadow = true;
    sun.shadow.mapSize.set(config.mapSize, config.mapSize);
    sun.shadow.camera.near = config.near;
    sun.shadow.camera.far = config.far;
    sun.shadow.camera.left = -config.extent;
    sun.shadow.camera.right = config.extent;
    sun.shadow.camera.top = config.extent;
    sun.shadow.camera.bottom = -config.extent;
    sun.shadow.bias = config.bias;
    sun.shadow.normalBias = config.normalBias;
    sun.shadow.camera.updateProjectionMatrix();

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // -------------------------------------------------------------------------
  // Материалы под каскадные тени
  // -------------------------------------------------------------------------

  // Патч материала под каскадные тени. Вызывать до первого рендера
  // (или с needsUpdate, который делает метод).
  refreshMaterials(root = this.scene) {
    if (!this.csm) return;

    root.traverse((child) => {
      if (!child.isMesh) return;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material) continue;
        // Basic/Line/Points не участвуют в освещении — их не трогаем.
        if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) continue;
        if (this.patchedMaterials.has(material)) continue;

        this.csm.setupMaterial(material);
        material.needsUpdate = true;
        this.patchedMaterials.add(material);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Тема уровня
  // -------------------------------------------------------------------------

  applyTheme(name) {
    this.themeName = name;
    const theme = LEVEL_THEMES[name] || LEVEL_THEMES.menu;

    // Позиция/цвет «солнца» мира обновляются в обоих режимах:
    // в CSM оно даёт «дешёвую» часть интенсивности без теней.
    const sun = this.world?.sun;
    if (sun) {
      sun.color.setHex(theme.sun.color);
      sun.position.set(theme.sun.position[0], theme.sun.position[1], theme.sun.position[2]);
      sun.target.position.set(0, 0, 0);
      sun.target.updateMatrixWorld();
    }

    if (!this.csm) {
      // Fallback: штатный DirectionalLight уже настроен world.applyTheme().
      if (sun) {
        sun.intensity = theme.sun.intensity;
        // Ортографическая shadow-камера не пересчитывается автоматически
        // при смене темы/позиции солнца — делаем это явно.
        sun.shadow.camera.updateProjectionMatrix();
      }
      return;
    }

    this.csm.lightDirection.copy(this._directionFromTheme(theme));

    // Часть интенсивности отдаём CSM, часть — штатному солнцу без тени,
    // чтобы суммарно получить интенсивность темы.
    for (const light of this.csm.lights) {
      light.color.setHex(theme.sun.color);
      light.intensity = theme.sun.intensity * 0.65;
    }

    if (sun) {
      sun.intensity = theme.sun.intensity * 0.35;
      sun.visible = true;
      sun.castShadow = false;
    }

    // Пересчёт разбиения каскадов и uniform'ов в шейдерах материалов.
    this.csm.maxFar = this.csmConfig.maxFar;
    this._applyShadowSettings();
    this.csm.updateFrustums();
  }

  update() {
    if (!this.csm) return;
    // CSM строит каскады по camera.matrixWorld: обновляем его до расчёта,
    // иначе тени отстают от камеры на кадр при быстром повороте.
    this.camera.updateMatrixWorld();
    this.csm.update();
  }

  // Смена размера окна меняет aspect камеры, а значит и разбиение каскадов.
  handleResize() {
    if (this.csm) this.csm.updateFrustums();
  }

  dispose() {
    this.patchedMaterials = new WeakSet();

    if (!this.csm) {
      if (this.world?.sun) this.world.sun.castShadow = false;
      return;
    }

    // CSM.dispose() снимает defines/onBeforeCompile с пропатченных материалов.
    this.csm.dispose();
    this.csm.remove();
    this.csm = null;
    this.enabled = false;
  }
}
