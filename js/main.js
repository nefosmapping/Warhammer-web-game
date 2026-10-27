// Точка входа: стейт-машина и связывание всех систем.
// Состояния: splash → menu → cutsceneIntro → cutsceneWakeup → tutorial →
// playing → paused → dead → cutsceneFinale → ending.
// Фазы 1–9 реализованы; финальный QA (10) — далее.

import * as THREE from 'three';
import { CONFIG, clamp } from './config.js';
import { World } from './world.js';
import { Input } from './input.js';
import { AudioSystem } from './audio.js';
import { ColliderWorld } from './colliders.js';
import { HUD } from './hud.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons.js';
import { EnemyManager } from './enemies.js';
import { LightingSystem } from './lighting.js';
import { PostProcessing } from './postprocessing.js';
import { Dialogue } from './dialogue.js';
import { Cutscene } from './cutscene.js';
import { createIntro } from './cutscenes/intro.js';
import { createWakeup } from './cutscenes/wakeup.js';
import { createFinale } from './cutscenes/finale.js';
import { TutorialManager } from './tutorial.js';
import {
  makeBolter,
  makeChainsword,
  makeGrenade,
  makeAmmoCrate,
  makeMedkit
} from './models/index.js';
import { buildLevel, hasLevel } from './levels/index.js';
import { AllyManager } from './allies.js';
import { ParticleSystem } from './particles.js';
import { AerialWar } from './aerial.js';
import { VehicleManager } from './vehicles.js';

class Game {
  constructor() {
    this.dom = this._collectDom();

    // Параметры адресной строки читаем ДО создания систем:
    // ?debug, ?skipSplash, ?play, ?nopost, ?nocsm, ?nossao, ?nobloom,
    // ?nofxaa, ?selftest, ?perftest, ?theme.
    const query = new URLSearchParams(window.location.search);
    this.debugEnabled = query.has('debug');
    // Скрытый дебаг-режим, включается паролем в главном меню (Shift + `).
    this.debugMode = false;
    this.adminPanelVisible = false;

    // Состояние админ-настроек графики.
    this.wireframeEnabled = false;
    this.shadowsEnabled = true;
    this.fogEnabled = true;
    this._wireframeMaterials = new Map();
    this._savedFog = null;

    this.skipSplash = query.has('skipSplash');
    this.autoPlay = query.has('play');
    this.noPost = query.has('nopost');
    this.noCsm = query.has('nocsm');
    this.noSSAO = query.has('nossao');
    this.noBloom = query.has('nobloom');
    this.noFxaa = query.has('nofxaa');
    this.themeOverride = query.get('theme');
    this.debugAccum = 0;
    this.debugFrames = 0;

    this.settings = this._loadSettings();
    this.audio = new AudioSystem();
    this.audio.setVolume(this.settings.volume / 100);

    this.world = new World(this.dom.canvas);

    // Честный подсчёт статистики: info сбрасывается вручную раз за кадр,
    // иначе композер обнуляет счётчики на каждом проходе.
    this.world.renderer.info.autoReset = false;

    // Тени CSM/PCF пересчитываем ровно один раз за кадр.
    // Без этого каждый renderer.render() (RenderPass + SSAOPass-нормали)
    // заново рендерит все shadow map'ы — двойная-четверная нагрузка.
    this.world.renderer.shadowMap.autoUpdate = false;

    this.input = new Input(this.dom.canvas);
    this.input.setSensitivity(this.settings.sensitivity);

    // Камера должна быть в сцене, иначе оружие от первого лица (её дочерние
    // объекты) не будет отрисовываться.
    this.world.scene.add(this.world.camera);

    this.hud = new HUD();
    this.colliders = new ColliderWorld();

    this.player = new Player({
      camera: this.world.camera,
      input: this.input,
      audio: this.audio,
      hud: this.hud,
      colliders: this.colliders,
      getSensitivity: () => this.settings.sensitivity,
      onDeath: () => this._onPlayerDeath()
    });

    this.weapons = new WeaponSystem({
      scene: this.world.scene,
      camera: this.world.camera,
      input: this.input,
      player: this.player,
      audio: this.audio,
      hud: this.hud,
      colliders: this.colliders
    });

    this.enemies = new EnemyManager({
      scene: this.world.scene,
      player: this.player,
      colliders: this.colliders,
      audio: this.audio,
      weapons: this.weapons,
      onModelAdded: (model) => {
        this.lighting?.refreshMaterials(model);
        this._applyWireframeTo(model);
      }
    });

    // Выстрелы и взрывы привлекают орков.
    this.weapons.onNoise = (position, radius) => this.enemies.hearNoise(position, radius);

    // Партиклы и союзники (Фазы 8–9).
    this.particles = new ParticleSystem(this.world.scene);
    this.allies = new AllyManager({
      scene: this.world.scene,
      enemies: this.enemies,
      colliders: this.colliders
    });

    // Фоновые воздушные бои высоко над полем боя (Валькирии/орочьи истребители).
    // weapons передаём, чтобы истребители можно было сбить болтером/ПЗРК.
    this.aerial = new AerialWar({
      scene: this.world.scene,
      weapons: this.weapons,
      onModelAdded: (model) => {
        this.lighting?.refreshMaterials(model);
        this._applyWireframeTo(model);
      }
    });

    // Кровь при попадании и дым из ствола.
    this.weapons.onHit = (root, damage, source, point) => {
      if (point) this.particles.spawnBlood(point, 7);
    };
    this.weapons.onShot = (position) => this.particles.spawnSmoke(position, 2);

    // Освещение: CSM-каскады вместо недоступной three-realtime-rt.
    this.lighting = new LightingSystem({
      scene: this.world.scene,
      camera: this.world.camera,
      world: this.world,
      renderer: this.world.renderer,
      disableCSM: this.noCsm
    });
    this._applyTheme(this.themeOverride || 'menu');
    this.lighting.refreshMaterials(this.world.scene);

    // Постобработка: SSAO + Bloom + OutputPass + FXAA.
    this.postProcessing = null;
    try {
      if (!this.noPost) {
        this.postProcessing = new PostProcessing({
          renderer: this.world.renderer,
          scene: this.world.scene,
          camera: this.world.camera,
          enableSSAO: !this.noSSAO,
          enableBloom: !this.noBloom,
          enableFXAA: !this.noFxaa
        });
      }
    } catch (error) {
      console.warn('[PostProcessing] Не удалось создать композер, используется прямой рендер:', error);
      this.postProcessing = null;
    }

    window.addEventListener('resize', () => {
      this.lighting?.handleResize();
      this.postProcessing?.setSize(window.innerWidth, window.innerHeight);
    });

    // Управляемая техника из админ-панели (танки и «Валькирия»).
    this.vehicles = new VehicleManager({
      scene: this.world.scene,
      camera: this.world.camera,
      input: this.input,
      player: this.player,
      weapons: this.weapons,
      audio: this.audio,
      hud: this.hud,
      colliders: this.colliders,
      particles: this.particles,
      getSensitivity: () => this.settings.sensitivity,
      onModelAdded: (model) => {
        this.lighting?.refreshMaterials(model);
        this._applyWireframeTo(model);
      }
    });

    // Диалоги и кат-сцены (Фаза 6).
    this.dialogue = new Dialogue({ dom: this.dom });
    this.cutscene = new Cutscene({
      camera: this.world.camera,
      dialogue: this.dialogue,
      audio: this.audio,
      dom: this.dom
    });

    // Туториал (Фаза 7).
    this.tutorialManager = new TutorialManager({
      player: this.player,
      weapons: this.weapons,
      enemies: this.enemies,
      hud: this.hud,
      input: this.input,
      audio: this.audio,
      dialogue: this.dialogue,
      onComplete: () => this._finishTutorial()
    });

    this.sessionStarted = false;
    this._arenaBuilt = false;
    this._arenaGroup = null;
    this._targets = [];
    this._tutorialObjects = [];

    // Фаза 8: уровни.
    this.level = null;
    this.levelRuntime = null;
    this.currentLevelId = null;
    this._levelObjects = [];
    this._levelCardTimer = null;
    this._objectiveCache = '';
    this._transitioning = false;
    this._exitMarker = null;

    this.stateName = null;
    this.state = null;
    this.states = this._createStates();

    this.splashDone = false;
    this.splashTimer = null;
    this.splashExitTimer = null;
    this.toastTimer = null;

    // Демо-переменные Фазы 1: обзор и позиция камеры.
    this.demoYaw = 0;
    this.demoPitch = 0;

    this._bindUi();
    this._bindInput();
    this._syncSettingsUi();
    this._syncAdminToggles();

    if (this.debugEnabled) this.dom.debug.classList.remove('hidden');

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);

    if (query.has('tutorial')) {
      // Быстрый запуск туториала без кат-сцен.
      this.enterState('tutorial');
    } else if (query.has('level') && hasLevel(query.get('level'))) {
      // Быстрая загрузка конкретного уровня: ?level=level2.
      this.enterState('playing', { fresh: true, level: query.get('level') });
    } else if (query.has('finale')) {
      // Быстрый переход к финальной кат-сцене для проверки.
      this.enterState('cutsceneFinale');
    } else if (query.has('intro')) {
      // Быстрый переход к вступлению, минуя заставку и меню.
      this.enterState('cutsceneIntro');
    } else if (this.autoPlay) {
      this.enterState('playing', { fresh: true });
    } else {
      this.enterState(this.skipSplash ? 'menu' : 'splash');
    }

    // Диагностика оружия: открывается по ?selftest, результаты — в консоль.
    if (query.has('selftest')) this._runSelfTest();

    // Замер draw call'ов и треугольников: ?perftest.
    if (query.has('perftest')) {
      window.setTimeout(() => this._runPerfTest(), 700);
    }
  }

  _runPerfTest() {
    const renderer = this.world.renderer;

    renderer.info.reset();
    renderer.shadowMap.needsUpdate = true;

    this.lighting.update();
    if (this.postProcessing) {
      this.postProcessing.render(0.016);
    } else {
      this.world.render();
    }

    const calls = renderer.info.render.calls;
    const triangles = renderer.info.render.triangles;

    const overBudget =
      calls > CONFIG.limits.maxDrawCalls || triangles > CONFIG.limits.maxTriangles;

    console.info(
      `PERFTEST | drawCalls=${calls}/${CONFIG.limits.maxDrawCalls} | ` +
      `triangles=${triangles}/${CONFIG.limits.maxTriangles} | ` +
      `CSM=${this.lighting.enabled} | SSAO=${Boolean(this.postProcessing?.useSSAO)} | ` +
      (overBudget ? 'ПРЕВЫШЕНИЕ БЮДЖЕТА' : 'OK')
    );
    this.hud.toast(`Perf: ${calls} draw calls, ${triangles} треугольников`, 8000);
  }

  // -------------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------------

  _collectDom() {
    return {
      canvas: document.getElementById('game-canvas'),

      splash: document.getElementById('splash'),
      menu: document.getElementById('menu'),
      settingsPanel: document.getElementById('settings-panel'),
      sensitivity: document.getElementById('sensitivity'),
      sensitivityValue: document.getElementById('sensitivity-value'),
      volume: document.getElementById('volume'),
      volumeValue: document.getElementById('volume-value'),

      hud: document.getElementById('hud'),
      pause: document.getElementById('pause'),
      death: document.getElementById('death'),
      ending: document.getElementById('ending'),

      toast: document.getElementById('toast'),
      fade: document.getElementById('fade-black'),
      levelCard: document.getElementById('level-card'),
      levelCardTitle: document.getElementById('level-card-title'),
      levelCardSubtitle: document.getElementById('level-card-subtitle'),

      dialogue: document.getElementById('dialogue'),
      dialogueSpeaker: document.getElementById('dialogue-speaker'),
      dialogueText: document.getElementById('dialogue-text'),
      letterbox: document.getElementById('letterbox'),
      damageFlash: document.getElementById('damage-flash'),

      tutorial: document.getElementById('tutorial-active'),
      tutorialText: document.getElementById('tutorial-text'),
      tutorialFill: document.getElementById('tutorial-fill'),
      objective: document.getElementById('objective'),

      hpValue: document.getElementById('hp-value'),
      hpFill: document.getElementById('hp-fill'),
      armorValue: document.getElementById('armor-value'),
      armorFill: document.getElementById('armor-fill'),
      ammoValue: document.getElementById('ammo-value'),
      grenadeValue: document.getElementById('grenade-value'),

      debug: document.getElementById('debug'),
      debugPanel: document.getElementById('debug-panel'),
      debugCoords: document.getElementById('debug-coords'),
      debugPixelRatio: document.getElementById('debug-pixel-ratio'),
      debugPixelRatioValue: document.getElementById('debug-pixel-ratio-value')
    };
  }

  // -------------------------------------------------------------------------
  // Стейт-машина
  // -------------------------------------------------------------------------

  _createStates() {
    return {
      splash: {
        enter: () => {
          this.dom.splash.classList.remove('hidden', 'is-out');
          this.world.setMenuMode(true);
          this.splashDone = false;
          this._clearSplashTimers();
          this.splashTimer = window.setTimeout(() => this._finishSplash(), CONFIG.timings.splash);
        },
        exit: () => {
          this._clearSplashTimers();
          this.dom.splash.classList.add('hidden');
        },
        update: () => {}
      },

      menu: {
        enter: () => {
          // Выход в меню выгружает текущий уровень.
          this._unloadLevel();

          this.player.setActive(false);
          this.weapons.setActive(false);
          this.enemies.setActive(false);
          this.dom.splash.classList.add('hidden');
          this.dom.menu.classList.remove('hidden');
          if (this.world.backdrop) this.world.backdrop.visible = true;
          this.dom.hud.classList.add('hidden');
          this.dom.pause.classList.add('hidden');
          this.dom.death.classList.add('hidden');
          this.dom.ending.classList.add('hidden');
          this.dom.settingsPanel.classList.add('hidden');
          this.world.setMenuMode(true);
          // Возврат к тёмной атмосфере меню после выхода с уровня.
          this._applyTheme(this.themeOverride || 'menu');

          // Перезапускаем анимацию появления меню.
          this.dom.menu.classList.remove('is-in');
          requestAnimationFrame(() => {
            if (this.stateName === 'menu') this.dom.menu.classList.add('is-in');
          });

          if (this.audio.ready) this.audio.playAmbient();
        },
        exit: () => {
          this.dom.menu.classList.remove('is-in');
          this.dom.menu.classList.add('hidden');
          this.dom.settingsPanel.classList.add('hidden');
        },
        update: () => {}
      },

      playing: {
        enter: (payload = {}) => {
          const fresh = Boolean(payload.fresh) || !this.sessionStarted;
          const levelId = payload.level || this.currentLevelId || 'level1';

          this.dom.splash.classList.add('hidden');
          this.dom.menu.classList.add('hidden');
          this.dom.pause.classList.add('hidden');
          this._clearFade();
          this.hud.setVisible(true);
          this.world.setMenuMode(false);

          // Если админ остался в технике и вернулся с паузы,
          // управление игроком/оружием остаётся отключённым.
          const piloting = Boolean(this.vehicles?.active);
          this.player.setActive(!piloting);
          this.weapons.setActive(!piloting);
          this.enemies.setActive(true);

          if (fresh || !this.level || payload.level) {
            this._startLevel(levelId, { fresh, checkpoint: payload.checkpoint || null });
          }

          this.input.requestPointerLock();

          if (fresh) {
            this.hud.toast(
              'WASD — движение, ЛКМ — болтер, ПКМ — меч, R — перезарядка, G — граната, 1/2 — слоты, E — взаимодействие.',
              6000
            );
          }

          if (this.audio.ready) this.audio.playAmbient();
        },
        exit: () => {
          this.player.setActive(false);
          this.weapons.setActive(false);
          this.input.exitPointerLock();
        },
        update: (dt) => {
          this.vehicles?.update(dt);

          if (!this.vehicles?.active) {
            this.player.update(dt);
            this.weapons.update(dt);
          }

          this.enemies.update(dt);
          this.allies.update(dt);
          this._updateLevel(dt);
        }
      },

      paused: {
        enter: () => {
          this.player.setActive(false);
          this.weapons.setActive(false);
          this.enemies.setActive(false);
          this.hud.setVehiclePrompt?.('');
          this.dom.pause.classList.remove('hidden');
          this.input.exitPointerLock();
        },
        exit: () => {
          this.dom.pause.classList.add('hidden');
        },
        update: () => {}
      },

      // Фаза 6: кат-сцены. Управление отключено, включён letterbox,
      // камера ведётся по ключевым кадрам, Пробел — досмотр/пропуск.
      cutsceneIntro: {
        enter: () => {
          this._enterCutscene('level1');
          const def = createIntro({ scene: this.world.scene });
          this.cutscene.play(def, () => this.enterState('cutsceneWakeup'));
          this.lighting.refreshMaterials(this.world.scene);
        },
        exit: () => this.cutscene.stop(),
        update: (dt) => this.cutscene.update(dt)
      },

      cutsceneWakeup: {
        enter: () => {
          this._enterCutscene('level1');
          const def = createWakeup({ scene: this.world.scene });
          this.cutscene.play(def, () => this.enterState('tutorial'));
          this.lighting.refreshMaterials(this.world.scene);
        },
        exit: () => this.cutscene.stop(),
        update: (dt) => this.cutscene.update(dt)
      },

      cutsceneFinale: {
        enter: () => {
          this._enterCutscene('level3');
          const def = createFinale({ scene: this.world.scene });
          this.cutscene.play(def, () => this.enterState('ending'));
          this.lighting.refreshMaterials(this.world.scene);
        },
        exit: () => this.cutscene.stop(),
        update: (dt) => this.cutscene.update(dt)
      },

      // Временная заглушка Фазы 7: снимаем затемнение и передаём управление
      // на полигон, чтобы поток «кат-сцены → игра» уже был проходим.
      tutorial: {
        enter: () => {
          this._clearFade();

          this.dom.splash.classList.add('hidden');
          this.dom.menu.classList.add('hidden');
          this.dom.pause.classList.add('hidden');
          this.dom.death.classList.add('hidden');
          this.dom.ending.classList.add('hidden');

          this.hud.setVisible(true);
          this.world.setMenuMode(false);

          this.player.setActive(true);
          this.weapons.setActive(true);
          this.enemies.setActive(true);

          // Сначала строим сессию/арену, только потом просим pointer lock:
          // отказ браузера в захвате курсора не должен мешать инициализации.
          this._startTutorialSession();

          if (!this.world.scene.getObjectByName('arena-ground')) {
            console.error('[Tutorial] Арена отсутствует после инициализации — аварийная сборка');
            this._arenaBuilt = false;
            this._targets = [];
            try {
              this._buildPracticeArena();
            } catch (error) {
              console.error('[Tutorial] Аварийная сборка не удалась:', error);
            }
          }

          this.input.requestPointerLock();
        },
        exit: () => {
          // Pointer lock не снимаем: при переходе в playing он останется,
          // иначе pointerlockchange успел бы поставить игру на паузу.
          this.tutorialManager.stop();
          this.player.setActive(false);
          this.weapons.setActive(false);
        },
        update: (dt) => {
          this.vehicles?.update(dt);

          if (!this.vehicles?.active) {
            this.player.update(dt);
            this.weapons.update(dt);
            this.tutorialManager.update(dt);
          }

          this.enemies.update(dt);
          this.allies.update(dt);
        }
      },

      // Фаза 9: экран смерти с респавном с чекпоинта.
      dead: {
        enter: () => {
          this._clearFade();
          this.dialogue.close();
          this.player.setActive(false);
          this.weapons.setActive(false);
          this.enemies.setActive(false);
          this.allies.setActive(false);
          this.hud.setVisible(false);

          this.dom.death.classList.remove('hidden');
          this.input.exitPointerLock();
        },
        exit: () => {
          this.dom.death.classList.add('hidden');
          this.hud.setVisible(true);
          this.allies.setActive(true);
        },
        update: () => {}
      },

      // Фаза 9: финальный экран после кат-сцены.
      ending: {
        enter: () => {
          this._clearFade();
          this.dialogue.close();
          this.player.setActive(false);
          this.weapons.setActive(false);
          this.enemies.setActive(false);
          this.allies.setActive(false);
          this.hud.setVisible(false);

          this.dom.menu.classList.add('hidden');
          this.dom.death.classList.add('hidden');
          this.dom.ending.classList.remove('hidden');
          this.input.exitPointerLock();
        },
        exit: () => {
          this.dom.ending.classList.add('hidden');
        },
        update: () => {}
      }
    };
  }

  // Общая подготовка состояния кат-сцены.
  _enterCutscene(theme) {
    // Кат-сцены строят собственные декорации: уровень убираем.
    this._unloadLevel();

    this.player.setActive(false);
    this.weapons.setActive(false);
    this.enemies.setActive(false);
    this.input.exitPointerLock();
    this.hud.setVisible(false);

    this.dom.splash.classList.add('hidden');
    this.dom.menu.classList.add('hidden');
    this.dom.pause.classList.add('hidden');
    this.dom.death.classList.add('hidden');
    this.dom.ending.classList.add('hidden');

    this.world.setMenuMode(false);
    if (this.world.backdrop) this.world.backdrop.visible = false;

    this._applyTheme(theme);
  }

  // -------------------------------------------------------------------------
  // Туториал (Фаза 7)
  // -------------------------------------------------------------------------

  _startTutorialSession() {
    console.info('[Tutorial] Session init start');

    // Арена строится ПЕРВОЙ: даже если дальше что-то упадёт,
    // игрок не окажется в пустоте.
    let context = null;
    try {
      context = this._buildTutorialArena();
      console.info('[Tutorial] Arena built, scene children:', this.world.scene.children.length);
    } catch (error) {
      console.error('[Tutorial] Ошибка построения арены:', error);
      // Аварийный вариант: хотя бы стены, пол и мишени полигона.
      try {
        this._arenaBuilt = false;
        this._buildPracticeArena();
        console.warn('[Tutorial] Использован аварийный полигон без предметов');
      } catch (fallbackError) {
        console.error('[Tutorial] Аварийный полигон тоже не построен:', fallbackError);
      }
    }

    try {
      this._applyTheme(this.themeOverride || 'level1');
      console.info('[Tutorial] Theme applied:', this.world.themeName);
    } catch (error) {
      console.error('[Tutorial] Ошибка применения темы:', error);
    }

    if (this.world.backdrop) this.world.backdrop.visible = false;

    try {
      this.player.reset({ x: 0, z: 8, yaw: 0 });
      this.enemies.clear();
      console.info('[Tutorial] Player reset, enemies cleared');
    } catch (error) {
      console.error('[Tutorial] Ошибка сброса игрока/врагов:', error);
    }

    try {
      // Оружие появляется только после подбора.
      this.weapons.reset();
      this.weapons.lockAll();
      console.info('[Tutorial] Weapons locked');
    } catch (error) {
      console.error('[Tutorial] Ошибка блокировки оружия:', error);

      // Прямая блокировка без методов системы: если что-то из API
      // недоступно (устаревший модуль), туториал всё равно начнётся без оружия.
      const w = this.weapons;
      w.hasBolter = false;
      w.hasChainsword = false;
      w.hasGrenades = false;
      w.magazine = 0;
      w.reserve = 0;
      w.grenades = 0;
      w.reloading = false;
      w.slot = 'bolter';
      if (w.arms) w.arms.visible = false;
      if (w.bolter) w.bolter.visible = false;
      if (w.chainsword) w.chainsword.visible = false;
      try {
        w._updateHud?.();
      } catch (hudError) {
        console.error('[Tutorial] HUD после аварийной блокировки:', hudError);
      }
    }

    try {
      this.lighting.refreshMaterials(this.world.scene);
      this._applyWireframeTo(this.world.scene);
    } catch (error) {
      console.error('[Tutorial] Ошибка обновления материалов:', error);
    }

    if (!context) {
      this.hud.toast('Не удалось построить арену туториала — смотрите консоль.', 6000);
      return;
    }

    try {
      this.tutorialManager.start(context);
      console.info('[Tutorial] Session started, steps:', this.tutorialManager.steps.length);
    } catch (error) {
      console.error('[Tutorial] Ошибка запуска шагов:', error);
      this.hud.toast('Ошибка запуска туториала — смотрите консоль.', 6000);
    }
  }

  // Полигон туториала: обломки, предметы подбора, мишень и площадка для удара.
  _buildTutorialArena() {
    this._buildPracticeArena();
    console.info('[Tutorial] Practice arena ready, targets:', this._targets.length);

    // Оставляем только центральную мишень для шага «выстрел из болтера».
    this._targets.forEach((target, index) => {
      target.visible = index === 1;
      if (target.userData.damageable) {
        target.userData.damageable.health = target.userData.damageable.maxHealth;
      }
    });

    // Убираем предметы предыдущего запуска туториала.
    for (const object of this._tutorialObjects) {
      object.parent?.remove(object);
      this.weapons.removeTarget?.(object);
    }
    this._tutorialObjects = [];

    const scene = this.world.scene;
    const pickups = {};

    const addPickup = (kind, model, x, z, prompt, rotationY = 0) => {
      model.position.set(x, 0.15, z);
      model.rotation.y = rotationY;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(model);
      this._tutorialObjects.push(model);
      pickups[kind] = {
        kind,
        group: model,
        position: new THREE.Vector3(x, 0.15, z),
        prompt,
        taken: false
      };
    };

    addPickup('chainsword', makeChainsword(), -2.6, 6.2, 'Подобрать цепной меч', 0.7);
    addPickup('bolter', makeBolter(), 2.6, 6.2, 'Подобрать болтер', -0.6);
    addPickup('grenade', makeGrenade(), 0.2, 6.8, 'Подобрать гранаты', 0);
    addPickup('ammo', makeAmmoCrate(), 4.8, 7.0, 'Подобрать ящик с патронами', 0.3);

    // Тренировочный обломок для удара мечом.
    // Высота 2.2 м: при взгляде прямо луч глаза (1.7 м) попадает в обломок.
    // Смещён вправо, чтобы не перекрывать линию огня по центральной мишени.
    const dummy = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 2.2, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x5a4a34, roughness: 0.85, metalness: 0.15 })
    );
    dummy.position.set(3.6, 1.1, 4.2);
    dummy.castShadow = true;
    dummy.receiveShadow = true;

    // Здоровье обломка должно реально уменьшаться: туториал проверяет
    // состояние цели, а не колбэки оружия.
    const dummyDamageable = {
      health: 9999,
      maxHealth: 9999,
      takeDamage: (amount) => {
        dummyDamageable.health = Math.max(0, dummyDamageable.health - amount);
        console.info('[Tutorial] HP обломка:', dummyDamageable.health);
      }
    };
    dummy.userData.damageable = dummyDamageable;

    scene.add(dummy);
    this._tutorialObjects.push(dummy);
    this.weapons.addTarget(dummy);

    const shootTarget = this._targets[1];

    console.info('[Tutorial] Pickups:', Object.keys(pickups).join(', '));
    console.info(
      '[Tutorial] Целей в weapons.targets:', this.weapons.targets.size,
      '| центральная мишень добавлена:', this.weapons.targets.has(shootTarget),
      '| обломок добавлен:', this.weapons.targets.has(dummy)
    );

    return {
      pickups,
      meleeDummy: dummy,
      shootTarget,
      spawnOrk: (position) =>
        this.enemies.spawn('boy', position, { health: CONFIG.enemies.tutorialHealth })
    };
  }

  _finishTutorial() {
    if (this.stateName !== 'tutorial') return;

    this.player.setActive(false);
    this.weapons.setActive(false);
    this.enemies.setActive(false);
    this.enemies.clear();

    // Убираем площадку туториала из сцены и из списка целей оружия.
    for (const object of this._tutorialObjects) {
      object.parent?.remove(object);
      this.weapons.removeTarget?.(object);
    }
    this._tutorialObjects = [];

    this.dialogue
      .show(
        '[Гарик Вондер]',
        'Оружие в порядке. Болтер не подведёт. Цепной меч... что ж, орки узнают, ' +
        'что значит гнев Императора. Пора двигаться к штабу.'
      )
      .then(() => {
        if (this.stateName === 'tutorial') {
          this.enterState('playing', { fresh: true, level: 'level1' });
        }
      });
  }

  // -------------------------------------------------------------------------
  // Уровни (Фаза 8)
  // -------------------------------------------------------------------------

  _startLevel(id, { fresh = false, checkpoint = null } = {}) {
    const levelId = hasLevel(id) ? id : 'level1';

    this._unloadLevel();

    if (this.world.backdrop) this.world.backdrop.visible = false;

    let level = null;
    try {
      level = buildLevel(levelId, this.world.scene, this.colliders, this.lighting);
    } catch (error) {
      console.error(`[Level] Ошибка построения ${levelId}:`, error);
    }

    if (!level) {
      this.hud.toast('Не удалось загрузить уровень — смотрите консоль.', 5000);
      return;
    }

    this.level = level;
    this.currentLevelId = levelId;
    this._applyTheme(level.theme || 'level1');

    // Спавн игрока внутри уровня.
    // Здоровье/броня переносятся между уровнями, при первом старте — полные.
    const keptHealth = fresh ? null : { health: this.player.health, armor: this.player.armor };

    this.player.reset(level.spawn || { x: 0, z: 0, yaw: 0 });

    if (fresh) {
      this.sessionStarted = true;
      this.player.health = CONFIG.player.maxHealth;
      this.player.armor = CONFIG.player.maxArmor;
      this.player._updateHud();
      this.weapons.reset();
    } else if (keptHealth) {
      this.player.health = keptHealth.health;
      this.player.armor = keptHealth.armor;
      this.player._updateHud();
    }

    // Восстановление параметров чекпоинта (здоровье, броня, боезапас).
    // Отсутствующие/битые поля игнорируются — остаются значения полного старта.
    if (checkpoint && checkpoint.level === levelId) {
      const weapons = this.weapons;

      const health = Number(checkpoint.health);
      const armor = Number(checkpoint.armor);
      const magazine = Number(checkpoint.magazine);
      const reserve = Number(checkpoint.reserve);
      const grenades = Number(checkpoint.grenades);

      if (Number.isFinite(health)) {
        this.player.health = clamp(health, 1, CONFIG.player.maxHealth);
      }
      if (Number.isFinite(armor)) {
        this.player.armor = clamp(armor, 0, CONFIG.player.maxArmor);
      }
      if (Number.isFinite(magazine)) {
        weapons.magazine = clamp(magazine, 0, CONFIG.weapons.bolter.magSize);
      }
      if (Number.isFinite(reserve)) {
        weapons.reserve = clamp(reserve, 0, CONFIG.weapons.bolter.reserveMax);
      }
      if (Number.isFinite(grenades)) {
        weapons.grenades = clamp(grenades, 0, CONFIG.weapons.grenade.maxAmmo);
      }

      this.player._updateHud();
      weapons._updateHud?.();
      console.info('[Checkpoint] Восстановлены параметры:', checkpoint.level);
    }

    // Рантайм-состояние уровня: волны, триггеры, подборы.
    this.levelRuntime = {
      waves: (level.waves || []).map((wave) => ({
        x: wave.x,
        z: wave.z,
        radius: wave.radius,
        spec: wave.enemies || [],
        enemies: [],
        spawned: false
      })),
      triggers: (level.triggers || []).map((trigger) => ({ ...trigger, done: false })),
      pickups: (level.pickups || []).map((pickup) => ({
        ...pickup,
        taken: false,
        model: this._createLevelPickup(pickup)
      })),
      exitDone: false,
      exitHold: 0
    };

    this._exitMarker = this._createExitMarker(level.exit);

    this.enemies.clear();
    this.enemies.setActive(true);

    // Союзники уровня (гвардейцы у ворот).
    this.allies.clear();
    for (const ally of level.allies || []) this.allies.spawn(ally);
    this.allies.setActive(true);

    this.lighting.refreshMaterials(this.world.scene);
    this._applyWireframeTo(this.world.scene);

    // Чекпоинт = начало текущего уровня.
    this._saveCheckpoint(levelId);

    this._objectiveCache = '';
    this.hud.setObjective(level.objective || '', 0);
    this.hud.setVisible(true);
    this._showLevelCard(level.title, level.subtitle);

    console.info(
      `[Level] Загружен ${levelId}: волн ${this.levelRuntime.waves.length}, ` +
      `триггеров ${this.levelRuntime.triggers.length}, подборов ${this.levelRuntime.pickups.length}`
    );
  }

  // Видимый маркер выхода: кольцо на земле + слабый световой столб.
  _createExitMarker(exit) {
    if (!exit) return null;

    const group = new THREE.Group();
    group.name = 'exit-marker';
    group.position.set(exit.x, 0, exit.z);

    const radius = Math.max(2.5, exit.radius || 4);
    const color = 0xd8b56a;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.9, 0.12, 8, 32),
      new THREE.MeshBasicMaterial({ color })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.85, radius * 0.85, 7, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    beam.position.y = 3.5;

    group.add(ring, beam);
    this.world.scene.add(group);
    this._levelObjects.push(group);
    return group;
  }

  _unloadLevel() {
    this._disposePracticeArena();
    this.vehicles?.clear();

    // Страховка от «двойного пола»: если группа арены потеряла ссылку,
    // находим её в сцене по имени и удаляем.
    const orphanArena = this.world.scene.getObjectByName('practice-arena');
    if (orphanArena) {
      orphanArena.parent?.remove(orphanArena);
      orphanArena.traverse((child) => {
        if (child.isMesh) child.geometry?.dispose?.();
      });
    }

    const orphanGround = this.world.scene.getObjectByName('arena-ground');
    if (orphanGround?.parent) {
      orphanGround.parent.remove(orphanGround);
      orphanGround.geometry?.dispose?.();
    }

    // Фон меню/кат-сцен не должен рендериться под уровнем.
    if (this.world.backdrop) this.world.backdrop.visible = false;

    if (this.level?.dispose) {
      try {
        this.level.dispose();
      } catch (error) {
        console.warn('[Level] Ошибка выгрузки уровня:', error);
      }
    }
    this.level = null;

    for (const object of this._levelObjects) object.parent?.remove(object);
    this._levelObjects = [];
    this._exitMarker = null;

    this.allies.clear();
    this.enemies.clear();
    this.weapons.clearTargets?.();
    this.colliders.clear();
    this.levelRuntime = null;
    this.currentLevelId = null;
  }

  // Удаляет полигон туториала (группа + регистрация мишеней).
  _disposePracticeArena() {
    if (this._arenaGroup) {
      this._arenaGroup.parent?.remove(this._arenaGroup);
      this._arenaGroup.traverse((child) => {
        if (child.isMesh) child.geometry?.dispose?.();
      });
      this._arenaGroup = null;
    }

    for (const target of this._targets) this.weapons.removeTarget?.(target);
    this._targets = [];
    this._arenaBuilt = false;
  }

  _createLevelPickup(pickup) {
    let model = null;
    if (pickup.kind === 'medkit') model = makeMedkit();
    else if (pickup.kind === 'ammo') model = makeAmmoCrate();
    else if (pickup.kind === 'grenade') model = makeGrenade();

    if (!model) return null;

    model.position.set(pickup.x, 0.15, pickup.z);
    model.rotation.y = ((pickup.x * 0.37 + pickup.z * 0.61) % (Math.PI * 2));
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    this.world.scene.add(model);
    this._levelObjects.push(model);
    return model;
  }

  _pickupPrompt(pickup) {
    if (pickup.kind === 'medkit') return 'Аптечка: [E] подобрать';
    if (pickup.kind === 'ammo') return 'Ящик с патронами: [E] подобрать';
    if (pickup.kind === 'grenade') return 'Гранаты: [E] подобрать';
    return 'Подобрать: [E]';
  }

  _collectLevelPickup(pickup) {
    pickup.taken = true;
    if (pickup.model) {
      pickup.model.parent?.remove(pickup.model);
      pickup.model = null;
    }

    if (pickup.kind === 'medkit') {
      this.player.heal(35);
      this.hud.toast('Аптечка: +35 HP', 1400);
    } else if (pickup.kind === 'ammo') {
      this.weapons.reserve = Math.min(
        CONFIG.weapons.bolter.reserveMax,
        this.weapons.reserve + CONFIG.weapons.bolter.reserveMax
      );
      this.hud.toast('Патроны пополнены.', 1400);
    } else if (pickup.kind === 'grenade') {
      this.weapons.grenades = Math.min(
        CONFIG.weapons.grenade.maxAmmo,
        this.weapons.grenades + 1
      );
      this.hud.toast('Граната получена.', 1400);
    }

    this.weapons._updateHud?.();
    this.audio.playPickup();
    this._objectiveCache = '';
  }

  _updateLevel(dt) {
    const level = this.level;
    const runtime = this.levelRuntime;
    if (!level || !runtime || this._transitioning) return;

    if (this._exitMarker) this._exitMarker.rotation.y += dt * 0.6;

    const px = this.player.position.x;
    const pz = this.player.position.z;

    // 1. Вокс-триггеры.
    for (const trigger of runtime.triggers) {
      if (trigger.done) continue;
      const distance = Math.hypot(px - trigger.x, pz - trigger.z);
      if (distance > (trigger.radius || 5)) continue;

      trigger.done = true;
      this.dialogue.show(trigger.speaker, trigger.text, { autoClose: 7 });
      if (trigger.objective) this.hud.setObjective(trigger.objective, 0);
      if (trigger.checkpoint) this._saveCheckpoint(this.currentLevelId);
    }

    // 2. Волны врагов.
    for (const wave of runtime.waves) {
      if (wave.spawned) continue;
      const distance = Math.hypot(px - wave.x, pz - wave.z);
      if (distance > (wave.radius || 7)) continue;

      wave.spawned = true;
      for (const spec of wave.spec) {
        const enemy = this.enemies.spawn(
          spec.type,
          { x: spec.x, z: spec.z },
          spec.health ? { health: spec.health } : {}
        );
        if (enemy) wave.enemies.push(enemy);
      }
      console.info(`[Level] Волна врагов: ${wave.enemies.length}`);
    }

    // В технике и рядом с ней E отдан управлению транспортом,
    // поэтому подборы и выход с уровня не перехватывают клавишу.
    if (this.vehicles?.active || this.vehicles?.nearby) return;

    // 3. Подбор предметов.
    let nearest = null;
    let nearestDistance = 2.4;
    for (const pickup of runtime.pickups) {
      if (pickup.taken) continue;
      const distance = Math.hypot(px - pickup.x, pz - pickup.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = pickup;
      }
    }

    if (nearest) {
      this._setObjective(this._pickupPrompt(nearest));
      if (this.input.wasPressed('KeyE')) this._collectLevelPickup(nearest);
      return;
    }

    // 4. Выход с уровня.
    const exit = level.exit;
    if (exit) {
      const distance = Math.hypot(px - exit.x, pz - exit.z);
      if (distance > (exit.radius || 5)) runtime.exitHold = 0;

      if (distance <= (exit.radius || 5)) {
        // Блокируют только враги рядом (30 м). Застрявшие в геометрии
        // или оставшиеся в другом конце карты не должны запирать игрока.
        let nearby = 0;
        for (const enemy of this.enemies.enemies) {
          if (enemy.dead || enemy.disposed) continue;
          const enemyDistance = Math.hypot(
            enemy.model.position.x - px,
            enemy.model.position.z - pz
          );
          if (enemyDistance < 30) nearby += 1;
        }

        if (nearby > 0) {
          // Анти-софтлок: если враг застрял в геометрии, через 6 секунд
          // штаб сам «подавляет» остатки сопротивления.
          runtime.exitHold += dt;
          if (runtime.exitHold >= 6) {
            console.warn(`[Level] Автозачистка застрявших врагов: ${this.enemies.aliveCount}`);
            this.enemies.clear();
            runtime.exitHold = 0;
          } else {
            this._setObjective(`Зачистите район: рядом врагов ${nearby}`);
            return;
          }
        }

        if (this.enemies.aliveCount > 0) {
          console.warn(`[Level] Убрано застрявших/далёких врагов: ${this.enemies.aliveCount}`);
          this.enemies.clear();
        }

        this._setObjective(`[E] ${exit.label || 'Дальше'}`);
        if (this.input.wasPressed('KeyE')) this._useLevelExit(exit);
        return;
      }
    }

    this._setObjective(level.objective || '');
  }

  _setObjective(text) {
    if (this._objectiveCache === text) return;
    this._objectiveCache = text;
    this.hud.setObjective(text, 0);
  }

  _useLevelExit(exit) {
    if (!exit) return;

    if (exit.next === 'finale') {
      this.enterState('cutsceneFinale');
      return;
    }

    this._goToLevel(exit.next);
  }

  _goToLevel(id) {
    if (this._transitioning || !hasLevel(id)) return;

    this._transitioning = true;
    this.player.setActive(false);
    this.weapons.setActive(false);
    this.enemies.setActive(false);
    this._fadeLevel(1, 0.4);

    window.setTimeout(() => {
      // Игрок мог выйти в меню/на паузу за время затемнения.
      if (this.stateName !== 'playing') {
        this._transitioning = false;
        return;
      }

      this._startLevel(id, { fresh: false });
      this._fadeLevel(0, 0.7);

      this.player.setActive(true);
      this.weapons.setActive(true);
      this.enemies.setActive(true);
      this._transitioning = false;
    }, 550);
  }

  _fadeLevel(target, seconds) {
    const el = this.dom.fade;
    if (!el) return;
    el.style.transition = `opacity ${Math.max(0.05, seconds)}s linear`;
    el.style.background = '#000000';
    el.style.opacity = String(Math.max(0, Math.min(1, target)));
  }

  _showLevelCard(title, subtitle) {
    const card = this.dom.levelCard;
    if (!card) return;

    if (this.dom.levelCardTitle) this.dom.levelCardTitle.textContent = title || '';
    if (this.dom.levelCardSubtitle) this.dom.levelCardSubtitle.textContent = subtitle || '';

    card.classList.remove('hidden');

    if (this._levelCardTimer) window.clearTimeout(this._levelCardTimer);
    this._levelCardTimer = window.setTimeout(() => {
      card.classList.add('hidden');
      this._levelCardTimer = null;
    }, CONFIG.timings.levelCard);
  }

  // Плавно убирает затемнение после кат-сцены.
  _clearFade() {
    const el = this.dom.fade;
    if (!el) return;
    el.style.transition = 'opacity 0.6s linear';
    el.style.background = '#000000';
    el.style.opacity = '0';
  }

  _makeStubState(message) {
    return {
      enter: () => {
        console.info(`[Game] ${message}`);
        this._toast(message, 3000);
      },
      exit: () => {},
      update: () => {}
    };
  }

  enterState(name, payload = {}) {
    const next = this.states[name];
    if (!next) {
      console.warn(`[Game] Неизвестное состояние: ${name}`);
      return;
    }
    if (this.stateName === name) return;

    console.info(`[Game] Состояние: ${this.stateName ?? '—'} → ${name}`);

    if (this.state) {
      try {
        this.state.exit?.(payload);
      } catch (error) {
        console.error(`[Game] Ошибка выхода из состояния "${this.stateName}":`, error);
      }
    }

    this.stateName = name;
    this.state = next;
    this.input.reset();

    // Ошибка в enter не должна ломать переход и главный цикл:
    // логируем и продолжаем, чтобы состояние можно было диагностировать.
    try {
      this.state.enter?.(payload);
    } catch (error) {
      console.error(`[Game] Ошибка входа в состояние "${name}":`, error);
      this._toast(`Ошибка состояния ${name}: ${error.message}`, 6000);
    }
  }

  // -------------------------------------------------------------------------
  // Заставка
  // -------------------------------------------------------------------------

  _finishSplash() {
    if (this.splashDone || this.stateName !== 'splash') return;
    this.splashDone = true;
    this._clearSplashTimers();

    this.dom.splash.classList.add('is-out');
    this.splashExitTimer = window.setTimeout(() => {
      if (this.stateName === 'splash') this.enterState('menu');
    }, CONFIG.timings.splashFade);
  }

  _clearSplashTimers() {
    if (this.splashTimer) {
      clearTimeout(this.splashTimer);
      this.splashTimer = null;
    }
    if (this.splashExitTimer) {
      clearTimeout(this.splashExitTimer);
      this.splashExitTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------

  _bindUi() {
    document.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => this._handleAction(button.dataset.action));
    });

    // Кнопки скрытого дебаг-режима: телепорт на уровень/финал.
    document.querySelectorAll('[data-debug-level]').forEach((button) => {
      button.addEventListener('click', () => {
        this._handleDebugLevel(button.dataset.debugLevel);
      });
    });

    // Админ-действия (выдача ПЗРК, спавн, здоровье, режим Бога и т.п.).
    document.querySelectorAll('[data-debug-action]').forEach((button) => {
      button.addEventListener('click', () => {
        this._handleDebugAction(button.dataset.debugAction);
      });
    });

    // Переключатели графики в админ-панели.
    document.querySelectorAll('[data-debug-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        this._toggleGraphicsSetting(button.dataset.debugToggle);
      });
    });

    // Разрешение рендера (pixel ratio) из админ-панели.
    this.dom.debugPixelRatio?.addEventListener('input', () => {
      const value = parseFloat(this.dom.debugPixelRatio.value);
      if (!Number.isFinite(value)) return;
      this.world.setPixelRatioCap(value);
      this.postProcessing?.setSize(window.innerWidth, window.innerHeight);
      this._syncAdminToggles();
    });

    // Ползунки настроек: перетаскивание — тоже жест пользователя.
    this.dom.sensitivity.addEventListener('input', () => {
      const value = parseFloat(this.dom.sensitivity.value);
      this.settings.sensitivity = clamp(
        Number.isFinite(value) ? value : CONFIG.settings.sensitivityDefault,
        CONFIG.settings.sensitivityMin,
        CONFIG.settings.sensitivityMax
      );
      this.input.setSensitivity(this.settings.sensitivity);
      this.dom.sensitivityValue.textContent = this.settings.sensitivity.toFixed(2);
      this._saveSettings();
    });

    this.dom.volume.addEventListener('input', () => {
      const value = parseFloat(this.dom.volume.value);
      this.settings.volume = clamp(
        Number.isFinite(value) ? value : CONFIG.settings.volumeDefault,
        0,
        100
      );
      this.audio.setVolume(this.settings.volume / 100);
      this.dom.volumeValue.textContent = `${Math.round(this.settings.volume)}%`;
      this._saveSettings();
    });
  }

  _handleAction(action) {
    switch (action) {
      case 'start':
        this.audio.init();
        this.audio.playUiClick();
        // Полный поток: вступление → пробуждение → туториал.
        this.enterState('cutsceneIntro');
        break;

      case 'settings':
        this.audio.init();
        this.audio.playUiClick();
        this.dom.settingsPanel.classList.toggle('hidden');
        break;

      case 'settings-close':
        this.audio.playUiClick();
        this.dom.settingsPanel.classList.add('hidden');
        break;

      case 'resume':
        this.audio.init();
        this.audio.playUiClick();
        this.enterState('playing');
        break;

      case 'menu':
        this.audio.init();
        this.audio.playUiClick();
        this.enterState('menu');
        break;

      case 'exit':
        this.audio.init();
        this.audio.playUiClick();
        this._toast('Выход недоступен в браузерной версии. Закройте вкладку.', 3500);
        break;

      case 'checkpoint': {
        this.audio.playUiClick();
        const checkpoint = this._loadCheckpoint();
        const levelId = checkpoint?.level || this.currentLevelId || 'level1';
        this.enterState('playing', { fresh: true, level: levelId, checkpoint });
        break;
      }

      case 'restart':
        this.audio.playUiClick();
        this.enterState('playing', { fresh: true, level: 'level1' });
        break;

      default:
        console.info(`[Game] Неизвестное действие UI: ${action}`);
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Скрытый дебаг-режим
  // -------------------------------------------------------------------------

  _enableDebugMode() {
    if (this.debugMode) {
      this.adminPanelVisible = true;
      this.dom.debugPanel?.classList.remove('hidden');
      this.dom.debugCoords?.classList.remove('hidden');
      this.dom.debug?.classList.remove('hidden');
      this._syncAdminToggles();
      return;
    }

    const password = window.prompt('Введите пароль дебаг-режима:');
    if (password === null) return;

    if (password !== 'admin2325') {
      this._toast('Доступ запрещён.', 1800);
      return;
    }

    this.debugMode = true;
    this.adminPanelVisible = true;
    this.dom.debugPanel?.classList.remove('hidden');
    this.dom.debugCoords?.classList.remove('hidden');
    this.dom.debug?.classList.remove('hidden');
    this._syncAdminToggles();
    this._toast('DEBUG MODE активирован. F1 — панель, H — здоровье, кнопка — режим Бога.', 4500);
    console.info('[Debug] Режим разработчика включён.');
  }

  _handleDebugLevel(level) {
    if (!this.debugMode) return;

    this.audio.init();
    this.audio.playUiClick();
    this.input.exitPointerLock();

    if (level === 'finale') {
      this.enterState('cutsceneFinale');
      return;
    }

    if (!hasLevel(level)) {
      this._toast(`Неизвестный уровень: ${level}`, 2500);
      return;
    }

    this.enterState('playing', { fresh: true, level });
  }

  _handleDebugAction(action) {
    if (!this.debugMode) return;

    this.audio.init();
    this.audio.playUiClick();

    if (action === 'pzrk') {
      const granted = this.weapons.grantLauncher();
      if (granted) {
        this._toast('ПЗРК выдан. Клавиша 4 — активировать, ПКМ — прицел.', 4000);
      }
      return;
    }

    if (action === 'spawn-ork') {
      this._spawnAdminOrk();
      return;
    }

    if (action === 'spawn-guard') {
      this._spawnAdminGuard();
      return;
    }

    if (action === 'heal') {
      this._adminRestoreHealth();
      return;
    }

    if (action === 'god') {
      this._toggleGodMode();
      return;
    }

    if (action === 'dogfight') {
      this._spawnAdminDogfight();
      return;
    }

    if (action === 'spawn-tank-deepseek') {
      this._spawnAdminTank('deepseek');
      return;
    }

    if (action === 'spawn-tank-chatgpt') {
      this._spawnAdminTank('chatgpt');
      return;
    }

    if (action === 'spawn-valkyrie') {
      this._spawnAdminValkyrie();
    }
  }

  _canAdminSpawn() {
    return (
      this.stateName === 'playing' ||
      this.stateName === 'tutorial' ||
      this.stateName === 'paused'
    );
  }

  // Точка впереди игрока (по горизонтали) для админ-спавна.
  _getAdminSpawnPoint(distance = 6, lateral = 0) {
    const forward = this.player.getLookDirection(new THREE.Vector3());
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
    forward.normalize();

    const rightX = forward.z;
    const rightZ = -forward.x;

    return {
      x: this.player.position.x + forward.x * distance + rightX * lateral,
      z: this.player.position.z + forward.z * distance + rightZ * lateral
    };
  }

  _spawnAdminOrk() {
    if (!this._canAdminSpawn()) {
      this._toast('Спавн доступен только в игре.', 2000);
      return;
    }

    const spot = this._getAdminSpawnPoint(6, (Math.random() - 0.5) * 3);
    const enemy = this.enemies.spawn('boy', { x: spot.x, z: spot.z });

    if (enemy) {
      this.enemies.setActive(true);
      this._toast('Орк заспавнен.', 1400);
    } else {
      this._toast('Лимит врагов достигнут.', 2000);
    }
  }

  _spawnAdminGuard() {
    if (!this._canAdminSpawn()) {
      this._toast('Спавн доступен только в игре.', 2000);
      return;
    }

    const spot = this._getAdminSpawnPoint(2.5, (Math.random() - 0.5) * 3);
    const ally = this.allies.spawn({
      x: spot.x,
      z: spot.z,
      rotation: this.player.yaw
    });

    if (ally) {
      this.allies.setActive(true);
      this.lighting.refreshMaterials(ally.model);
      this._applyWireframeTo(ally.model);
      this._toast('Гвардеец прибыл. Колёсико — указать точку.', 2200);
    }
  }

  // Приказ гвардейцам по точке под прицелом (средняя кнопка мыши).
  _handleAdminCommands() {
    if (!this.debugMode || !this.input.wasMousePressed(1)) return;
    if (this.stateName !== 'playing' && this.stateName !== 'tutorial') return;
    if (!this.allies || this.allies.allies.length === 0) return;

    const point = this._getGroundPointFromCrosshair();
    if (!point) return;

    this.allies.commandMove(point);
    this._toast('Гвардейцы: приказ на перемещение.', 1300);
  }

  _getGroundPointFromCrosshair() {
    const origin = this.player.getEyePosition(new THREE.Vector3());
    const direction = this.player.getLookDirection(new THREE.Vector3());

    let x;
    let z;

    if (direction.y < -0.08) {
      // Луч пересекает плоскость земли.
      const t = origin.y / -direction.y;
      x = origin.x + direction.x * t;
      z = origin.z + direction.z * t;
    } else {
      // Смотрим вдаль/вверх — берём точку перед игроком.
      const flat = new THREE.Vector3(direction.x, 0, direction.z);
      if (flat.lengthSq() < 0.0001) flat.set(0, 0, -1);
      flat.normalize();
      x = this.player.position.x + flat.x * 12;
      z = this.player.position.z + flat.z * 12;
    }

    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

    return {
      x: Math.max(-90, Math.min(90, x)),
      z: Math.max(-90, Math.min(90, z))
    };
  }

  _toggleNoclip() {
    if (!this.debugMode) return;
    const enabled = !this.player.noclip;
    this.player.setNoclip(enabled);
    this._toast(enabled ? 'Noclip: свободный полёт включён.' : 'Noclip выключен.', 1600);
  }

  // -------------------------------------------------------------------------
  // Админ-панель: игрок, догфайт и настройки графики
  // -------------------------------------------------------------------------

  _isAdminGameplayState() {
    return (
      this.stateName === 'playing' ||
      this.stateName === 'tutorial' ||
      this.stateName === 'paused'
    );
  }

  _adminRestoreHealth() {
    if (!this._isAdminGameplayState()) {
      this._toast('Восстановление здоровья доступно только в игре.', 2000);
      return;
    }

    if (this.player.dead) {
      this._toast('Игрок мёртв — используйте чекпоинт.', 2200);
      return;
    }

    this.player.health = CONFIG.player.maxHealth;
    this.player.armor = CONFIG.player.maxArmor;
    this.player._updateHud();
    this._toast(
      `Здоровье восстановлено: HP ${Math.round(this.player.health)}, AP ${Math.round(this.player.armor)}.`,
      2000
    );
  }

  _toggleGodMode() {
    if (!this._isAdminGameplayState()) {
      this._toast('Режим Бога доступен только в игре.', 2000);
      return;
    }

    const enabled = !this.player.godMode;
    this.player.setGodMode(enabled);
    this._toast(enabled ? 'Режим Бога: ВКЛ — урон игнорируется.' : 'Режим Бога: ВЫКЛ.', 1800);
    this._syncAdminToggles();
  }

  _spawnAdminDogfight() {
    if (!this._canAdminSpawn()) {
      this._toast('Догфайт доступен только в игре.', 2000);
      return;
    }

    // Центр боя — впереди игрока, высоко над полем боя.
    const forward = this.player.getLookDirection(new THREE.Vector3());
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
    forward.normalize();

    const center = new THREE.Vector3(
      this.player.position.x + forward.x * 26,
      44,
      this.player.position.z + forward.z * 26
    );

    const spawned = this.aerial.spawnDogfight({ center, radius: 18 });
    if (spawned) {
      this._toast('Догфайт в небе: «Валькирия» против орочьего истребителя.', 2600);
    } else {
      this._toast('Лимит воздушных целей достигнут.', 2200);
    }
  }

  _spawnAdminTank(variant) {
    if (!this._canAdminSpawn()) {
      this._toast('Спавн техники доступен только в игре.', 2000);
      return;
    }

    const spot = this._getAdminSpawnPoint(9, 0);
    const vehicle = this.vehicles.spawnTank(variant, {
      x: spot.x,
      z: spot.z,
      yaw: this.player.yaw
    });

    this.vehicles.nearby = null;
    this._toast(
      `${vehicle.label} заспавнен. Подойдите и нажмите E, чтобы сесть.`,
      3200
    );
  }

  _spawnAdminValkyrie() {
    if (!this._canAdminSpawn()) {
      this._toast('Спавн техники доступен только в игре.', 2000);
      return;
    }

    const spot = this._getAdminSpawnPoint(15, 0);
    this.vehicles.spawnValkyrie({
      x: spot.x,
      y: 0,
      z: spot.z,
      yaw: this.player.yaw
    });

    this.vehicles.nearby = null;
    this._toast(
      '«Валькирия» заспавнена. E — сесть, Shift/Ctrl — высота, ЛКМ — огонь.',
      3600
    );
  }

  _toggleDebugPanel() {
    if (!this.debugMode) return;
    this.adminPanelVisible = !this.adminPanelVisible;
    this.dom.debugPanel?.classList.toggle('hidden', !this.adminPanelVisible);
    this._toast(
      this.adminPanelVisible ? 'Админ-панель открыта.' : 'Админ-панель скрыта.',
      1200
    );
  }

  _toggleGraphicsSetting(key) {
    if (!this.debugMode) return;

    switch (key) {
      case 'wireframe':
        this._toggleWireframe();
        break;
      case 'post':
        this._togglePostProcessing();
        break;
      case 'ssao':
      case 'bloom':
      case 'fxaa':
        this._togglePostPass(key);
        break;
      case 'shadows':
        this._toggleShadows();
        break;
      case 'fog':
        this._toggleFog();
        break;
      default:
        break;
    }
  }

  _togglePostProcessing() {
    if (!this.postProcessing) {
      this._toast('Post-processing недоступен (запуск с ?nopost).', 2400);
      return;
    }

    const enabled = !this.postProcessing.enabled;
    this.postProcessing.setEnabled(enabled);
    this._toast(`Post-processing: ${enabled ? 'ВКЛ' : 'ВЫКЛ'}`, 1500);
    this._syncAdminToggles();
  }

  _togglePostPass(kind) {
    const post = this.postProcessing;
    if (!post) {
      this._toast('Post-processing недоступен (запуск с ?nopost).', 2400);
      return;
    }

    const entries = {
      ssao: { pass: post.ssaoPass, label: 'SSAO' },
      bloom: { pass: post.bloomPass, label: 'Bloom' },
      fxaa: { pass: post.fxaaPass, label: 'FXAA' }
    };

    const entry = entries[kind];
    if (!entry?.pass) {
      this._toast(`${entry?.label || kind}: пасс не создан.`, 2000);
      return;
    }

    entry.pass.enabled = !entry.pass.enabled;
    if (kind === 'ssao') post.useSSAO = entry.pass.enabled;
    if (kind === 'bloom') post.useBloom = entry.pass.enabled;
    if (kind === 'fxaa') post.useFXAA = entry.pass.enabled;

    this._toast(`${entry.label}: ${entry.pass.enabled ? 'ВКЛ' : 'ВЫКЛ'}`, 1400);
    this._syncAdminToggles();
  }

  _toggleWireframe() {
    if (!this.debugMode) return;

    this.wireframeEnabled = !this.wireframeEnabled;
    if (this.wireframeEnabled) {
      this._applyWireframeTo(this.world.scene);
    } else {
      this._restoreWireframe();
    }

    this._toast(`Wireframe: ${this.wireframeEnabled ? 'ВКЛ' : 'ВЫКЛ'}`, 1400);
    this._syncAdminToggles();
  }

  // Переводит все «плотные» материалы сцены в каркасный вид.
  _applyWireframeTo(root) {
    if (!this.wireframeEnabled || !root) return;

    root.traverse((child) => {
      if (!child.isMesh || this._isWireframeExempt(child)) return;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material) continue;
        if (material.isShaderMaterial || material.isSpriteMaterial) continue;
        if (!('wireframe' in material)) continue;
        // Пропускаем прозрачные эффекты (солнце, дым, трассеры).
        if (material.transparent && material.depthWrite === false) continue;

        if (!this._wireframeMaterials.has(material)) {
          this._wireframeMaterials.set(material, Boolean(material.wireframe));
        }
        material.wireframe = true;
        material.needsUpdate = true;
      }
    });
  }

  _restoreWireframe() {
    for (const [material, original] of this._wireframeMaterials) {
      material.wireframe = original;
      material.needsUpdate = true;
    }
    this._wireframeMaterials.clear();
  }

  _isWireframeExempt(object) {
    let node = object;
    while (node) {
      if (node.name === 'sky-dome' || node.name === 'sky-sun') return true;
      if (node.userData?.noWireframe) return true;
      node = node.parent;
    }
    return false;
  }

  _toggleShadows() {
    this.shadowsEnabled = !this.shadowsEnabled;

    const renderer = this.world.renderer;
    renderer.shadowMap.enabled = this.shadowsEnabled;

    if (this.lighting?.csm) {
      for (const light of this.lighting.csm.lights) {
        light.castShadow = this.shadowsEnabled;
      }
      // Штатное солнце в CSM-режиме тень не рисует.
      if (this.world.sun) this.world.sun.castShadow = false;
    } else if (this.world.sun) {
      this.world.sun.castShadow = this.shadowsEnabled;
    }

    renderer.shadowMap.needsUpdate = this.shadowsEnabled;
    this._toast(`Тени: ${this.shadowsEnabled ? 'ВКЛ' : 'ВЫКЛ'}`, 1400);
    this._syncAdminToggles();
  }

  _toggleFog() {
    this.fogEnabled = !this.fogEnabled;

    if (this.fogEnabled) {
      if (this._savedFog) this.world.scene.fog = this._savedFog;
    } else {
      this._savedFog = this.world.scene.fog;
      this.world.scene.fog = null;
    }

    this._toast(`Туман: ${this.fogEnabled ? 'ВКЛ' : 'ВЫКЛ'}`, 1400);
    this._syncAdminToggles();
  }

  _syncAdminToggles() {
    const post = this.postProcessing;

    const states = {
      wireframe: this.wireframeEnabled,
      post: Boolean(post?.enabled),
      ssao: Boolean(post?.ssaoPass?.enabled),
      bloom: Boolean(post?.bloomPass?.enabled),
      fxaa: Boolean(post?.fxaaPass?.enabled),
      shadows: this.shadowsEnabled,
      fog: this.fogEnabled
    };

    const availability = {
      post: Boolean(post),
      ssao: Boolean(post?.ssaoPass),
      bloom: Boolean(post?.bloomPass),
      fxaa: Boolean(post?.fxaaPass)
    };

    document.querySelectorAll('[data-debug-toggle]').forEach((button) => {
      const key = button.dataset.debugToggle;
      const available = availability[key] ?? true;
      const active = Boolean(states[key]) && available;

      button.classList.toggle('is-on', active);
      button.classList.toggle('is-disabled', !available);
      button.disabled = !available;
      button.setAttribute('aria-pressed', String(active));
    });

    const godButton = document.querySelector('[data-debug-action="god"]');
    if (godButton) {
      const enabled = Boolean(this.player?.godMode);
      godButton.classList.toggle('is-on', enabled);
      godButton.textContent = enabled ? 'Режим Бога: ВКЛ' : 'Режим Бога: ВЫКЛ';
    }

    if (this.dom.debugPixelRatio) {
      const ratio = this.world?.pixelRatioCap ?? CONFIG.render.maxPixelRatio;
      this.dom.debugPixelRatio.value = String(ratio);
      if (this.dom.debugPixelRatioValue) {
        this.dom.debugPixelRatioValue.textContent = `${ratio.toFixed(2)}x`;
      }
    }
  }

  _syncSettingsUi() {
    this.dom.sensitivity.value = String(this.settings.sensitivity);
    this.dom.sensitivityValue.textContent = this.settings.sensitivity.toFixed(2);
    this.dom.volume.value = String(Math.round(this.settings.volume));
    this.dom.volumeValue.textContent = `${Math.round(this.settings.volume)}%`;
  }

  // -------------------------------------------------------------------------
  // Ввод
  // -------------------------------------------------------------------------

  _bindInput() {
    // Первый жест: инициализируем звук и запускаем эмбиент в меню.
    this.input.onFirstInteraction(() => {
      this.audio.init();
      this.audio.setVolume(this.settings.volume / 100);
      if (this.stateName === 'menu') this.audio.playAmbient();
    });

    this.input.onKey((code, event) => {
      // Пропуск заставки любой клавишей.
      if (this.stateName === 'splash') {
        this._finishSplash();
      }

      // Скрытый дебаг-режим: Shift + ` (Ё / Backquote) в главном меню.
      if (code === 'Backquote' && event?.shiftKey) {
        this._enableDebugMode();
        return;
      }

      // Админ-панель и графика (работают только после ввода пароля).
      if (this.debugMode) {
        if (code === 'F1') {
          this._toggleDebugPanel();
          return;
        }

        if (code === 'F2') {
          this._toggleWireframe();
          return;
        }

        if (code === 'F3') {
          this._togglePostProcessing();
          return;
        }

        if (code === 'KeyH') {
          this._adminRestoreHealth();
          return;
        }

        // Режим Бога переключается только кнопкой в панели.
        // (ранее KeyG конфликтовал с броском гранаты)
      }

      // Noclip в дебаг-режиме.
      if (code === 'KeyY' && this.debugMode) {
        if (this.stateName === 'playing' || this.stateName === 'tutorial') {
          this._toggleNoclip();
        }
        return;
      }

      // Пробел в кат-сцене: досмотр реплики, затем закрытие, затем пропуск.
      if (code === 'Space' && this.cutscene?.active) {
        this.cutscene.handleSpace();
        return;
      }

      // Пробел в обычном диалоге (финал туториала и т.п.).
      if (code === 'Space' && this.dialogue?.active) {
        this.dialogue.handleSpace();
        return;
      }

      if (code === 'Escape' && this.stateName === 'playing') {
        this.enterState('paused');
      }
    });

    // Клик по канвасу в игре/туториале возвращает захват курсора:
    // при запуске по URL браузер не даёт pointer lock без жеста.
    this.dom.canvas.addEventListener('click', () => {
      if (this.stateName === 'playing' || this.stateName === 'tutorial') {
        this.input.requestPointerLock();
      }
    });

    // Потеря захвата курсора = автоматическая пауза.
    this.input.onPointerLockChange((locked) => {
      if (!locked && this.stateName === 'playing') {
        this.enterState('paused');
      }
    });
  }

  // -------------------------------------------------------------------------
  // Сессия и временный полигон Фазы 3 (заменяется уровнями в Фазе 8)
  // -------------------------------------------------------------------------

  // Единая точка смены темы: туман/фон — мир, каскады/свет — lighting.
  _applyTheme(name) {
    this.world.applyTheme(name);
    // Запоминаем «штатный» туман темы и соблюдаем админ-переключатель.
    this._savedFog = this.world.scene.fog;
    if (!this.fogEnabled) this.world.scene.fog = null;
    this.lighting?.applyTheme(name);
  }

  _startSession() {
    this.sessionStarted = true;

    // Полигон использует светлую «джунглевую» тему: фон, туман и свет
    // уровней вместо почти чёрной темы меню.
    this._applyTheme(this.themeOverride || 'level1');

    this._buildPracticeArena();

    // На полигоне убираем декоративный фон меню, чтобы не мешал обзору.
    if (this.world.backdrop) this.world.backdrop.visible = false;

    this.player.reset({ x: 0, z: 8, yaw: 0 });
    this.weapons.reset();

    // Враги пересоздаются при каждом новом старте.
    this.enemies.clear();
    this._spawnPracticeEnemies();

    // Новые материалы (мишени, враги) должны получить CSM-шейдер.
    this.lighting.refreshMaterials(this.world.scene);
    this._applyWireframeTo(this.world.scene);

    // Мишени восстанавливаются при каждом новом старте.
    for (const target of this._targets) {
      target.visible = true;
      target.userData.damageable.health = target.userData.damageable.maxHealth;
    }
  }

  _buildPracticeArena() {
    // Проверяем не только флаг, но и фактическое наличие арены в сцене:
    // если объекты были удалены, арена перестраивается.
    const arenaPresent = Boolean(this.world.scene.getObjectByName('arena-ground'));
    if (this._arenaBuilt && arenaPresent) {
      console.info('[Arena] Уже построена, повторная сборка пропущена');
      return;
    }

    if (this._arenaBuilt && !arenaPresent) {
      console.warn('[Arena] Флаг стоял, но арены в сцене нет — перестраиваем');
      this._targets = [];
      this._arenaGroup = null;
    }

    this._arenaBuilt = true;
    console.info('[Arena] Building practice arena');

    const scene = this.world.scene;

    // Вся арена туториала живёт в отдельной группе: при загрузке уровня
    // её можно удалить целиком, не задевая уровень.
    const arena = new THREE.Group();
    arena.name = 'practice-arena';
    scene.add(arena);
    this._arenaGroup = arena;

    // Пол полигона: без него сцена выглядела «чёрной дырой» —
    // декоративная земля меню скрывается вместе с backdrop.
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b4630,
      roughness: 0.95,
      metalness: 0.02
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    ground.name = 'arena-ground';
    scene.add(ground);

    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a5c50,
      roughness: 0.85,
      metalness: 0.25
    });
    const crateMaterial = new THREE.MeshStandardMaterial({
      color: 0x55643a,
      roughness: 0.8,
      metalness: 0.2
    });

    const addWall = (x, z, width, depth) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 3.2, depth), wallMaterial);
      mesh.position.set(x, 1.6, z);
      // Тени от стен не критичны, а каждый shadow caster дорог при CSM.
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      arena.add(mesh);
      this.colliders.addMesh(mesh);
    };

    // Периметр полигона.
    addWall(0, -22, 44, 0.6);
    addWall(0, 22, 44, 0.6);
    addWall(-22, 0, 0.6, 44);
    addWall(22, 0, 0.6, 44);

    // Укрытия.
    const covers = [
      [-6, -4, 2.4, 1.9, 2.4],
      [6, -4, 2.4, 1.9, 2.4],
      [-11, -12, 2.0, 1.4, 2.0],
      [11, -12, 2.0, 1.4, 2.0],
      [-13, 3, 1.6, 1.1, 1.6],
      [13, 3, 1.6, 1.1, 1.6]
    ];

    for (const [x, z, w, h, d] of covers) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crateMaterial);
      crate.position.set(x, h / 2, z);
      crate.castShadow = false;
      crate.receiveShadow = true;
      arena.add(crate);
      this.colliders.addMesh(crate);
    }

    // Тренировочные мишени.
    this._createTarget(-3.5, -9);
    this._createTarget(0, -12);
    this._createTarget(3.5, -9);

    this._applyWireframeTo(arena);

    console.info('[Arena] Done: walls/covers/ground added, targets:', this._targets.length);
  }

  _createTarget(x, z) {
    const group = new THREE.Group();
    group.name = 'training-target';
    group.position.set(x, 0, z);

    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2e28, roughness: 0.95 });
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b5f42,
      roughness: 0.85,
      metalness: 0.1
    });
    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x9a2018,
      roughness: 0.7,
      emissive: 0x220000,
      emissiveIntensity: 1.0
    });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.18, 16), postMaterial);
    base.position.y = 0.09;

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.25, 12), postMaterial);
    post.position.y = 0.75;

    const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.14), boardMaterial);
    board.position.y = 1.65;

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 8, 24), ringMaterial);
    ring.position.set(0, 1.65, 0.09);

    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 20), ringMaterial);
    innerRing.position.set(0, 1.65, 0.1);

    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.02), ringMaterial);
    crossH.position.set(0, 1.65, 0.09);

    const crossV = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.02), ringMaterial);
    crossV.position.set(0, 1.65, 0.09);

    group.add(base, post, board, ring, innerRing, crossH, crossV);
    group.traverse((child) => {
      if (child.isMesh) {
        // Мишени не отбрасывают тень — экономим shadow pass'ы CSM.
        child.castShadow = false;
        child.receiveShadow = true;
      }
    });

    const damageable = {
      health: 100,
      maxHealth: 100,
      _flash: null,
      _respawn: null,
      takeDamage: (amount) => {
        if (damageable.health <= 0) return;
        damageable.health -= amount;

        boardMaterial.emissive.setHex(0x663300);
        clearTimeout(damageable._flash);
        damageable._flash = window.setTimeout(() => boardMaterial.emissive.setHex(0x000000), 90);

        if (damageable.health <= 0) {
          group.visible = false;
          this.hud.toast('Мишень уничтожена. Восстановление...', 1200);
          clearTimeout(damageable._respawn);
          damageable._respawn = window.setTimeout(() => {
            damageable.health = damageable.maxHealth;
            group.visible = true;
          }, 1800);
        }
      }
    };

    group.userData.damageable = damageable;
    (this._arenaGroup || this.world.scene).add(group);
    this.weapons.addTarget(group);
    this._targets.push(group);
  }

  // Расстановка врагов на тренировочном полигоне.
  _spawnPracticeEnemies() {
    this.enemies.spawn('boy', { x: -6, z: -9 });
    this.enemies.spawn('boy', { x: 0, z: -15 });
    this.enemies.spawn('shooter', { x: 6, z: -9 });
    this.enemies.spawn('nob', { x: -12, z: -13 });
  }

  // Автоматическая проверка механик Фаз 3–4 (только по ?selftest).
  // Тайминги прокручиваются вручную фиксированным шагом, чтобы результат
  // не зависел от requestAnimationFrame и headless-браузера.
  _runSelfTest() {
    // Самотест использует тренировочный полигон, а не уровень.
    if (!this._arenaBuilt) this._buildPracticeArena();
    for (const target of this._targets) {
      target.visible = true;
      target.userData.damageable.health = target.userData.damageable.maxHealth;
    }

    const step = (seconds) => {
      const dt = 1 / 60;
      let left = seconds;
      while (left > 0) {
        const current = Math.min(dt, left);
        this.weapons.update(current);
        left -= current;
      }
    };

    const results = [];
    const target = this._targets[1];
    const damageable = target.userData.damageable;

    // 1. Выстрел болтера по центральной мишени.
    this.player.position.set(0, 0, 8);
    this.player.yaw = 0;
    this.player.pitch = 0;
    this.player._updateCamera(0.016);

    const hpBeforeShot = damageable.health;
    this.weapons._fireBolter();
    step(0.12);
    results.push(`болтер: ${hpBeforeShot - damageable.health} урона, патронов ${this.weapons.magazine}`);

    // 2. Перезарядка: 10 патронов + 90 в резерве -> 30 + 70 через 2 с.
    this.weapons.magazine = 10;
    this.weapons.reserve = 90;
    this.weapons._startReload();
    step(2.1);
    results.push(`перезарядка: ${this.weapons.magazine}/${this.weapons.reserve}`);

    // 3. Удар цепным мечом вплотную.
    this.player.position.set(0, 0, -10.1);
    this.player._updateCamera(0.016);
    const hpBeforeMelee = damageable.health;
    this.weapons._startMelee();
    step(0.5);
    results.push(`меч: ${hpBeforeMelee - damageable.health} урона`);

    // 4. Бросок гранаты: расход и срабатывание фитиля через 2 с.
    this.player.position.set(0, 0, 8);
    this.player._updateCamera(0.016);
    const grenadesBefore = this.weapons.grenades;
    this.weapons._throwGrenade();
    step(2.4);
    results.push(`граната: брошено ${grenadesBefore - this.weapons.grenades}, в полёте ${this.weapons.projectiles.length}`);

    // 5. Переключение слотов.
    this.weapons.setSlot('chainsword');
    step(0.1);
    results.push(`слот меча: виден ${this.weapons.chainsword.visible}, болтер ${this.weapons.bolter.visible}`);
    this.weapons.setSlot('bolter');

    // 6. Враги: урон, тревога, смерть, удаление.
    this.enemies.clear();
    this.player.position.set(2, 0, 8);
    this.player.yaw = 0;
    this.player.pitch = 0;
    this.player.recoilPitch = 0;
    this.player._updateCamera(0.016);

    const testBoy = this.enemies.spawn('boy', { x: 2, z: -13 });
    testBoy.model.updateWorldMatrix(true, true);

    const debugRay = new THREE.Raycaster();
    debugRay.set(
      this.player.getEyePosition(new THREE.Vector3()),
      this.player.getLookDirection(new THREE.Vector3())
    );
    debugRay.far = 120;
    const debugHits = debugRay.intersectObjects([...this.weapons.targets], true);
    results.push(
      `луч: целей ${this.weapons.targets.size}, попаданий ${debugHits.length}` +
      (debugHits[0] ? `, дистанция ${debugHits[0].distance.toFixed(1)}` : '')
    );

    const boyHealthBefore = testBoy.health;
    this.weapons.magazine = 30;
    this.weapons._fireBolter();
    step(0.15);
    results.push(`орк: урон ${boyHealthBefore - testBoy.health}, состояние ${testBoy.state}`);

    testBoy.takeDamage(1000);
    testBoy.update(0.3);
    results.push(`смерть орка: ${testBoy.dead ? 'да' : 'нет'}, наклон ${testBoy.model.rotation.x.toFixed(2)}`);

    for (let i = 0; i < 110; i += 1) testBoy.update(0.06);
    results.push(`удаление трупа: ${testBoy.disposed ? 'да' : 'нет'}`);

    // 7. Атака орка по игроку.
    const meleeBoy = this.enemies.spawn('boy', { x: 2, z: 7 });
    const healthBeforeAttack = this.player.health;
    meleeBoy.update(0.05);
    meleeBoy.update(0.45);
    meleeBoy.update(0.05);
    meleeBoy.update(0.4);
    results.push(
      `атака орка: игроку ${(healthBeforeAttack - this.player.health).toFixed(0)} урона ` +
      `(HP ${this.player.health.toFixed(0)}, AP ${this.player.armor.toFixed(0)})`
    );

    // 8. Наличие всех трёх типов.
    this.enemies.clear();
    const shooter = this.enemies.spawn('shooter', { x: 6, z: -14 });
    const nob = this.enemies.spawn('nob', { x: -6, z: -16 });
    results.push(`типы: стрелок HP=${shooter?.health}, ноб HP=${nob?.health}, масштаб ноба ${nob?.model.scale.x}`);

    // Восстанавливаем состояние после теста.
    this.enemies.clear();
    this.player.health = CONFIG.player.maxHealth;
    this.player.armor = CONFIG.player.maxArmor;
    this.player._updateHud();
    this.player.position.set(0, 0, 8);
    this.player._updateCamera(0.016);
    this._spawnPracticeEnemies();

    console.info(`SELFTEST | ${results.join(' | ')}`);
    this.hud.toast(`Self-test: ${results.join(' · ')}`, 9000);
  }

  // -------------------------------------------------------------------------
  // Чекпоинты (localStorage)
  // -------------------------------------------------------------------------

  _saveCheckpoint(levelId) {
    if (!levelId) return;
    try {
      const data = {
        level: levelId,
        health: this.player.health,
        armor: this.player.armor,
        magazine: this.weapons.magazine,
        reserve: this.weapons.reserve,
        grenades: this.weapons.grenades,
        at: Date.now()
      };
      localStorage.setItem(CONFIG.storageKeys.checkpoint, JSON.stringify(data));
      console.info(
        `[Checkpoint] Сохранён: ${levelId}, HP ${Math.round(data.health)}, ` +
        `AP ${Math.round(data.armor)}, ${data.magazine}/${data.reserve}, гранат ${data.grenades}`
      );
    } catch (_error) {
      // Приватный режим/нет доступа к localStorage — не критично.
    }
  }

  _loadCheckpoint() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKeys.checkpoint);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data && hasLevel(data.level)) return data;
    } catch (_error) {
      // Повреждённая запись — начинаем с первого уровня.
    }
    return null;
  }

  _onPlayerDeath() {
    this.hud.toast('Комиссар погиб. Император не прощает слабости.', CONFIG.timings.deathDelay);
    this.vehicles?.forceExit();
    this.weapons.setActive(false);

    window.setTimeout(() => {
      if (this.stateName === 'playing' || this.stateName === 'paused') {
        this.enterState('dead');
      }
    }, CONFIG.timings.deathDelay);
  }

  // -------------------------------------------------------------------------
  // Тосты
  // -------------------------------------------------------------------------

  _toast(text, duration = 3000) {
    const el = this.dom.toast;
    el.textContent = text;
    el.classList.add('is-visible');

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      el.classList.remove('is-visible');
    }, duration);
  }

  // -------------------------------------------------------------------------
  // Настройки в localStorage
  // -------------------------------------------------------------------------

  _loadSettings() {
    const defaults = {
      sensitivity: CONFIG.settings.sensitivityDefault,
      volume: CONFIG.settings.volumeDefault
    };

    try {
      const raw = localStorage.getItem(CONFIG.storageKeys.settings);
      if (!raw) return defaults;

      const data = JSON.parse(raw);
      const sensitivity = Number(data.sensitivity);
      const volume = Number(data.volume);

      return {
        sensitivity: Number.isFinite(sensitivity)
          ? clamp(sensitivity, CONFIG.settings.sensitivityMin, CONFIG.settings.sensitivityMax)
          : defaults.sensitivity,
        volume: Number.isFinite(volume)
          ? clamp(volume, 0, 100)
          : defaults.volume
      };
    } catch (_error) {
      return defaults;
    }
  }

  _saveSettings() {
    try {
      localStorage.setItem(CONFIG.storageKeys.settings, JSON.stringify(this.settings));
    } catch (_error) {
      // Приватный режим или переполнение — не критично.
    }
  }

  // -------------------------------------------------------------------------
  // Главный цикл
  // -------------------------------------------------------------------------

  _loop() {
    requestAnimationFrame(this._loop);

    const dt = Math.min(this.world.clock.getDelta(), 0.05);

    // Счётчики кадра обнуляем до любых отрисовок (тени, SSAO, сцена).
    this.world.renderer.info.reset();

    this.state?.update?.(dt);
    this._handleAdminCommands();
    this.dialogue.update(dt);
    this.particles.update(dt);
    this.aerial.update(dt);
    this.world.update(dt);

    this.lighting.update();

    // Разрешаем перерисовать shadow map'ы один раз за кадр:
    // все последующие renderer.render() в этом кадре используют готовые карты.
    this.world.renderer.shadowMap.needsUpdate = true;

    if (this.postProcessing) {
      this.postProcessing.render(dt);
    } else {
      this.world.render();
    }

    this._updateDebug(dt);
    this.input.endFrame();
  }

  _updateDebug(dt) {
    // Координаты игрока в левом верхнем углу (дебаг-режим по паролю).
    if (this.debugMode && this.dom.debugCoords) {
      const position = this.player.position;
      const displayY = this.player.noclip ? position.y : CONFIG.player.eyeHeight;
      this.dom.debugCoords.textContent =
        `X ${position.x.toFixed(1)} · Y ${displayY.toFixed(1)} · Z ${position.z.toFixed(1)}` +
        (this.player.noclip ? ' · NOCLIP' : '') +
        (this.player.godMode ? ' · GOD' : '');
    }

    if (!this.debugEnabled && !this.debugMode) return;

    this.debugAccum += dt;
    this.debugFrames += 1;

    if (this.debugAccum >= 0.4) {
      const fps = this.debugFrames / this.debugAccum;
      // renderer.info учитывает все проходы кадра: shadow map'ы, SSAO, сцену.
      const info = this.world.renderer.info.render;
      const postState = this.postProcessing
        ? (this.postProcessing.enabled ? 'on' : 'off')
        : 'off';
      this.dom.debug.textContent =
        `FPS ${fps.toFixed(0)} | calls ${info.calls} | tris ${info.triangles} | ` +
        `CSM ${this.lighting.enabled ? 'on' : 'off'} | ` +
        `post ${postState} | wire ${this.wireframeEnabled ? 'on' : 'off'} | ` +
        `shadows ${this.shadowsEnabled ? 'on' : 'off'}`;
      this.debugAccum = 0;
      this.debugFrames = 0;
    }
  }
}

// Модульные скрипты выполняются после парсинга DOM.
const game = new Game();
window.__game = game;
