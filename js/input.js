// Единый источник событий ввода.
// ВАЖНО: все подписки на клавиатуру, мышь и pointer lock живут только здесь.
// Остальные модули читают состояние через публичные методы класса Input.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'KeyR', 'KeyG', 'KeyE', 'KeyQ',
  'Digit1', 'Digit2', 'Digit3',
  'ShiftLeft', 'ShiftRight',
  'Space', 'Escape', 'Tab'
]);

export class Input {
  constructor(domElement) {
    this.domElement = domElement;

    // Клавиши: удерживаются / нажаты в этом кадре / отпущены в этом кадре.
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.keysReleased = new Set();

    // Кнопки мыши: 0 — ЛКМ, 2 — ПКМ.
    this.buttonsDown = new Set();
    this.buttonsPressed = new Set();
    this.buttonsReleased = new Set();

    // Накопленное движение мыши за кадр (до применения чувствительности).
    this.mouseDX = 0;
    this.mouseDY = 0;

    this.locked = false;
    this.sensitivity = 1;
    this.enabled = true;

    // Подписчики на события.
    this._keyHandlers = new Set();
    this._lockHandlers = new Set();
    this._firstInteractionHandlers = new Set();
    this._firstInteractionFired = false;

    this._bindEvents();
  }

  // -------------------------------------------------------------------------
  // Инициализация событий
  // -------------------------------------------------------------------------

  _bindEvents() {
    window.addEventListener('keydown', (event) => {
      if (GAME_KEYS.has(event.code)) event.preventDefault();
      this._fireFirstInteraction();

      if (event.repeat) return;
      if (!this.enabled) return;

      this.keysDown.add(event.code);
      this.keysPressed.add(event.code);

      for (const handler of this._keyHandlers) handler(event.code, event);
    }, { passive: false });

    window.addEventListener('keyup', (event) => {
      if (GAME_KEYS.has(event.code)) event.preventDefault();
      this.keysDown.delete(event.code);
      this.keysReleased.add(event.code);
    }, { passive: false });

    window.addEventListener('mousedown', (event) => {
      this._fireFirstInteraction();
      if (!this.enabled) return;
      if (event.button !== 0 && event.button !== 2) return;

      this.buttonsDown.add(event.button);
      this.buttonsPressed.add(event.button);
    });

    window.addEventListener('mouseup', (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      this.buttonsDown.delete(event.button);
      this.buttonsReleased.add(event.button);
    });

    // Движение мыши учитываем только в режиме захвата курсора.
    document.addEventListener('mousemove', (event) => {
      if (!this.locked || !this.enabled) return;
      this.mouseDX += event.movementX || 0;
      this.mouseDY += event.movementY || 0;
    });

    // Не показываем контекстное меню поверх игры.
    this.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

    window.addEventListener('pointerdown', () => {
      this._fireFirstInteraction();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.domElement;
      for (const handler of this._lockHandlers) handler(this.locked);
    });

    document.addEventListener('pointerlockerror', () => {
      // Браузер может запретить захват без жеста пользователя — это не ошибка игры.
      this.locked = false;
    });
  }

  _fireFirstInteraction() {
    if (this._firstInteractionFired) return;
    this._firstInteractionFired = true;
    for (const handler of this._firstInteractionHandlers) handler();
    this._firstInteractionHandlers.clear();
  }

  // -------------------------------------------------------------------------
  // Подписки
  // -------------------------------------------------------------------------

  // Вызывается при первом любом взаимодействии пользователя (клик или клавиша).
  // Нужен для «ленивой» инициализации AudioContext.
  onFirstInteraction(handler) {
    if (this._firstInteractionFired) {
      handler();
      return;
    }
    this._firstInteractionHandlers.add(handler);
  }

  // Подписка на нажатие клавиши. Возвращает функцию отписки.
  onKey(handler) {
    this._keyHandlers.add(handler);
    return () => this._keyHandlers.delete(handler);
  }

  // Подписка на изменение pointer lock.
  onPointerLockChange(handler) {
    this._lockHandlers.add(handler);
    return () => this._lockHandlers.delete(handler);
  }

  // -------------------------------------------------------------------------
  // Чтение состояния
  // -------------------------------------------------------------------------

  isDown(code) {
    return this.keysDown.has(code);
  }

  wasPressed(code) {
    return this.keysPressed.has(code);
  }

  wasReleased(code) {
    return this.keysReleased.has(code);
  }

  isMouseDown(button = 0) {
    return this.buttonsDown.has(button);
  }

  wasMousePressed(button = 0) {
    return this.buttonsPressed.has(button);
  }

  // Возвращает накопленное за кадр движение мыши и обнуляет его.
  consumeLook() {
    const look = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return look;
  }

  setSensitivity(value) {
    this.sensitivity = value;
  }

  // -------------------------------------------------------------------------
  // Pointer lock
  // -------------------------------------------------------------------------

  requestPointerLock() {
    if (document.pointerLockElement === this.domElement) return;
    try {
      const request = this.domElement.requestPointerLock();
      // В современных браузерах метод возвращает Promise.
      if (request && typeof request.catch === 'function') request.catch(() => {});
    } catch (_error) {
      // Захват недоступен — игра продолжит работать без него.
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock();
    }
  }

  // -------------------------------------------------------------------------
  // Завершение кадра
  // -------------------------------------------------------------------------

  // Вызывается в конце кадра, чтобы «нажато/отпущено» жили ровно один кадр.
  endFrame() {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.buttonsPressed.clear();
    this.buttonsReleased.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  // Сброс зажатых клавиш — используется при смене состояния (пауза, кат-сцена).
  reset() {
    this.keysDown.clear();
    this.buttonsDown.clear();
    this.endFrame();
  }
}
