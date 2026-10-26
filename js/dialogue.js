// Диалоговая система: HTML-оверлей с посимвольной печатью.
// Первое нажатие Пробела — досмотреть текст, второе — закрыть окно.
// Модуль не подписывается на ввод сам: владелец (кат-сцена/туториал)
// вызывает handleSpace() и решает, кто обрабатывает нажатие.

export class Dialogue {
  constructor({ dom }) {
    this.el = dom.dialogue;
    this.speakerEl = dom.dialogueSpeaker;
    this.textEl = dom.dialogueText;
    this.hintEl = this.el ? this.el.querySelector('.dialogue-hint') : null;

    this.active = false;
    this.typing = false;
    this.speaker = '';
    this.text = '';
    this.visibleChars = 0;

    // 30 мс на символ из «механики.txt».
    this.charInterval = 0.03;
    this.charTimer = 0;

    // Автозакрытие необязательных реплик (секунды после конца печати).
    this.autoCloseDelay = 0;
    this.holdTimer = 0;

    this._resolve = null;
  }

  // Показать реплику. Возвращает Promise, который резолвится при закрытии.
  show(speaker, text, { autoClose = 0 } = {}) {
    // Предыдущая реплика заменяется новой.
    if (this.active) this._finish(false);

    this.active = true;
    this.typing = true;
    this.speaker = speaker || '';
    this.text = text || '';
    this.visibleChars = 0;
    this.charTimer = 0;
    this.autoCloseDelay = autoClose > 0 ? autoClose : 0;
    this.holdTimer = 0;

    if (this.speakerEl) this.speakerEl.textContent = this.speaker;
    if (this.textEl) this.textEl.textContent = '';
    if (this.hintEl) this.hintEl.textContent = 'ПРОБЕЛ — ДАЛЬШЕ';
    this.el?.classList.remove('hidden');

    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  update(dt) {
    if (!this.active) return;

    if (this.typing) {
      this.charTimer += dt;
      let changed = false;
      while (this.charTimer >= this.charInterval && this.visibleChars < this.text.length) {
        this.charTimer -= this.charInterval;
        this.visibleChars += 1;
        changed = true;
      }
      if (changed && this.textEl) {
        this.textEl.textContent = this.text.slice(0, this.visibleChars);
      }
      if (this.visibleChars >= this.text.length) {
        this.typing = false;
        this.holdTimer = 0;
        if (this.hintEl) this.hintEl.textContent = 'ПРОБЕЛ — ЗАКРЫТЬ';
      }
      return;
    }

    if (this.autoCloseDelay > 0) {
      this.holdTimer += dt;
      if (this.holdTimer >= this.autoCloseDelay) this._finish(true);
    }
  }

  // Возвращает true, если нажатие обработано диалогом.
  handleSpace() {
    if (!this.active) return false;

    if (this.typing) {
      // Досматриваем текст мгновенно.
      this.visibleChars = this.text.length;
      this.typing = false;
      this.holdTimer = 0;
      if (this.textEl) this.textEl.textContent = this.text;
      if (this.hintEl) this.hintEl.textContent = 'ПРОБЕЛ — ЗАКРЫТЬ';
      return true;
    }

    this._finish(true);
    return true;
  }

  close() {
    if (!this.active) return;
    this._finish(false);
  }

  _finish(skipped) {
    this.active = false;
    this.typing = false;
    this.el?.classList.add('hidden');

    const resolve = this._resolve;
    this._resolve = null;
    if (resolve) resolve({ skipped });
  }
}
