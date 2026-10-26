// Пошаговый туториал (Фаза 7).
//
// 11 шагов с жёстким гейтингом: пока не выполнено условие текущего шага,
// следующий не показывается, а взаимодействия вне шага игнорируются.
// Видимые объекты (меч, болтер, гранаты, патроны, мишени, орк) создаёт
// main.js в _buildTutorialArena() и передаёт сюда как context.

import { CONFIG } from './config.js';

export class TutorialManager {
  constructor({ player, weapons, enemies, hud, input, audio, dialogue, onComplete }) {
    this.player = player;
    this.weapons = weapons;
    this.enemies = enemies;
    this.hud = hud;
    this.input = input;
    this.audio = audio;
    this.dialogue = dialogue;
    this.onComplete = onComplete;

    this.active = false;
    this.context = null;
    this.steps = this._createSteps();

    this.index = -1;
    this.state = {};

    this.prevYaw = 0;
    this.lastX = 0;
    this.lastZ = 0;
    this.moveAccum = 0;
    this.yawAccum = 0;
    this._promptText = '';
  }

  // -------------------------------------------------------------------------
  // Шаги
  // -------------------------------------------------------------------------

  _createSteps() {
    return [
      {
        // 1. Движение на 3 метра.
        text: 'Движение: [W][A][S][D], бег — [Shift]. Пройдите 3 метра.',
        onEnter: () => {
          this.moveAccum = 0;
        },
        check: () => this.moveAccum >= 3
      },
      {
        // 2. Поворот камеры на 90°.
        text: 'Осмотритесь: поверните мышь на 90°.',
        onEnter: () => {
          this.yawAccum = 0;
        },
        check: () => this.yawAccum >= Math.PI / 2
      },
      {
        // 3. Подбор цепного меча (сначала нужно опустить взгляд).
        text: 'Взгляните вниз и подберите цепной меч: [E].',
        pickup: 'chainsword',
        lookDown: true,
        check: () => this.context.pickups.chainsword.taken
      },
      {
        // 4. Подбор болтера.
        text: 'Подберите болтер: [E].',
        pickup: 'bolter',
        check: () => this.context.pickups.bolter.taken
      },
      {
        // 5. Подбор гранат.
        text: 'Подберите гранаты: [E].',
        pickup: 'grenade',
        check: () => this.context.pickups.grenade.taken
      },
      {
        // 6. Выстрел по центральной мишени.
        // Проверяем не событие выстрела, а фактическое здоровье цели.
        text: 'Огонь из болтера: [ЛКМ] — попадите в центральную мишень.',
        onEnter: () => {
          const damageable = this.context.shootTarget?.userData?.damageable;
          this.state.targetHp = damageable ? damageable.health : null;
          console.info('[Tutorial] Шаг 6: начальное HP мишени =', this.state.targetHp);
        },
        check: () => {
          const damageable = this.context.shootTarget?.userData?.damageable;
          if (!damageable || this.state.targetHp === null) return false;
          return damageable.health < this.state.targetHp;
        }
      },
      {
        // 7. Перезарядка.
        text: 'Перезарядка: [R].',
        onEnter: () => {
          const weapons = this.weapons;
          weapons.magazine = Math.min(weapons.magazine, 5);
          weapons.reloading = false;
          weapons.reloadTimer = 0;
          weapons._updateHud();
          this.state.magBefore = weapons.magazine;
        },
        check: () => {
          const weapons = this.weapons;
          return !weapons.reloading && weapons.magazine > this.state.magBefore;
        }
      },
      {
        // 8. Удар мечом по обломку.
        // Также проверяем здоровье обломка, а не колбэк оружия.
        text: 'Удар цепным мечом: [ПКМ] — ударьте обломок перед собой.',
        onEnter: () => {
          const damageable = this.context.meleeDummy?.userData?.damageable;
          this.state.dummyHp = damageable ? damageable.health : null;
          console.info('[Tutorial] Шаг 8: начальное HP обломка =', this.state.dummyHp);
        },
        check: () => {
          const damageable = this.context.meleeDummy?.userData?.damageable;
          if (!damageable || this.state.dummyHp === null) return false;
          return damageable.health < this.state.dummyHp;
        }
      },
      {
        // 9. Бросок гранаты.
        text: 'Бросок гранаты: [G].',
        onEnter: () => {
          const weapons = this.weapons;
          if (weapons.grenades <= 0) {
            weapons.hasGrenades = true;
            weapons.grenades = CONFIG.weapons.grenade.startAmmo;
            weapons._updateHud();
          }
          this.state.grenadesBefore = weapons.grenades;
        },
        check: () => this.weapons.grenades < this.state.grenadesBefore
      },
      {
        // 10. Подбор ящика с патронами.
        text: 'Подберите ящик с патронами: [E].',
        pickup: 'ammo',
        check: () => this.context.pickups.ammo.taken
      },
      {
        // 11. Убийство первого орка.
        text: 'Первый орк: [ЛКМ] — откройте огонь. Не дайте ему приблизиться.',
        onEnter: () => {
          this.state.ork = this.context.spawnOrk({ x: 0, z: -2 });
        },
        check: () => !this.state.ork || this.state.ork.dead
      }
    ];
  }

  // -------------------------------------------------------------------------
  // Запуск / остановка
  // -------------------------------------------------------------------------

  start(context) {
    this.context = context;
    this.active = true;
    this.index = -1;
    this.state = {};
    this.moveAccum = 0;
    this.yawAccum = 0;

    this.prevYaw = this.player.yaw;
    this.lastX = this.player.position.x;
    this.lastZ = this.player.position.z;

    this._nextStep();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.hud.hideTutorial();
  }

  // -------------------------------------------------------------------------
  // Обновление
  // -------------------------------------------------------------------------

  update(dt) {
    if (!this.active) return;

    const step = this.steps[this.index];
    if (!step) return;

    this._trackProgress();

    this._updatePrompt(step);

    if (step.check && step.check()) {
      this._nextStep();
    }
  }

  _trackProgress() {
    const player = this.player;

    const dx = player.position.x - this.lastX;
    const dz = player.position.z - this.lastZ;
    this.lastX = player.position.x;
    this.lastZ = player.position.z;
    this.moveAccum += Math.hypot(dx, dz);

    let dYaw = player.yaw - this.prevYaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    this.yawAccum += Math.abs(dYaw);
    this.prevYaw = player.yaw;
  }

  _updatePrompt(step) {
    if (!step.pickup) {
      this._setPrompt(step.text);
      return;
    }

    const item = this.context.pickups[step.pickup];
    if (!item || item.taken) {
      this._setPrompt(step.text);
      return;
    }

    const distance = Math.hypot(
      this.player.position.x - item.position.x,
      this.player.position.z - item.position.z
    );

    if (distance > 2.4) {
      this._setPrompt(`${item.prompt}: подойдите ближе`);
      return;
    }

    // Меч лежит на земле — сначала нужно действительно опустить взгляд.
    if (step.lookDown && this.player.pitch > -0.3) {
      this._setPrompt('Опустите взгляд на цепной меч (мышь).');
      return;
    }

    this._setPrompt(`${item.prompt} — [E]`);
    if (this.input.wasPressed('KeyE')) this._pickup(step.pickup, item);
  }

  _setPrompt(text) {
    if (this._promptText === text) return;
    this._promptText = text;
    this.hud.setObjective(text, 0);
  }

  // -------------------------------------------------------------------------
  // Шаги и подбор
  // -------------------------------------------------------------------------

  _nextStep() {
    this.index += 1;
    this._promptText = '';

    const total = this.steps.length;

    if (this.index >= total) {
      this._complete();
      return;
    }

    const step = this.steps[this.index];
    step.onEnter?.();

    this.hud.setTutorial(step.text, this.index / total);

    // Сбрасываем накопленные метрики шага (движение/мышь уже сброшены onEnter).
    this.lastX = this.player.position.x;
    this.lastZ = this.player.position.z;
    this.prevYaw = this.player.yaw;
  }

  _complete() {
    this.active = false;
    this.hud.hideTutorial();
    this.onComplete?.();
  }

  _pickup(kind, item) {
    item.taken = true;
    item.group.parent?.remove(item.group);

    const weapons = this.weapons;

    switch (kind) {
      case 'chainsword':
        this._unlockWeapon('chainsword');
        this.hud.toast('Цепной меч получен.', 1500);
        break;

      case 'bolter':
        this._unlockWeapon('bolter');
        this.hud.toast('Болтер получен. 30 патронов в магазине.', 1800);
        break;

      case 'grenade':
        this._unlockWeapon('grenades');
        this.hud.toast('Гранаты получены (2 шт.).', 1500);
        break;

      case 'ammo':
        weapons.reserve = Math.min(
          CONFIG.weapons.bolter.reserveMax,
          weapons.reserve + CONFIG.weapons.bolter.reserveMax
        );
        weapons._updateHud?.();
        this.hud.toast('Патроны пополнены.', 1500);
        break;

      default:
        break;
    }

    this.audio.playPickup();
  }

  // Разблокировка оружия с запасным вариантом на случай, если API системы
  // не совпадает (например, браузер отдал устаревший модуль из кеша).
  _unlockWeapon(kind) {
    const weapons = this.weapons;

    if (typeof weapons.unlock === 'function') {
      weapons.unlock(kind);
      return;
    }

    console.warn('[Tutorial] weapons.unlock отсутствует, прямое разблокирование:', kind);

    if (kind === 'bolter') {
      weapons.hasBolter = true;
      weapons.magazine = CONFIG.weapons.bolter.magSize;
      weapons.reserve = CONFIG.weapons.bolter.reserveMax;
      weapons.slot = 'bolter';
    } else if (kind === 'chainsword') {
      weapons.hasChainsword = true;
    } else if (kind === 'grenades') {
      weapons.hasGrenades = true;
      weapons.grenades = CONFIG.weapons.grenade.startAmmo;
    }

    weapons._applyOwnership?.();
    weapons._updateHud?.();
  }

}
