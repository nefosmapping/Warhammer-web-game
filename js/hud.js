// HUD: здоровье, броня, боезапас, гранаты, прицел, хитмаркер, вспышка урона,
// цель, подсказки и прогресс туториала. Никаких подписок на ввод здесь нет.

import { CONFIG } from './config.js';

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.hpValue = document.getElementById('hp-value');
    this.hpFill = document.getElementById('hp-fill');
    this.armorValue = document.getElementById('armor-value');
    this.armorFill = document.getElementById('armor-fill');
    this.ammoValue = document.getElementById('ammo-value');
    this.weaponLabel = document.getElementById('weapon-label');
    this.grenadeValue = document.getElementById('grenade-value');
    this.damageFlash = document.getElementById('damage-flash');
    this.hitmarker = document.getElementById('hitmarker');
    this.lockIndicator = document.getElementById('lock-indicator');
    this.lockFrame = this.lockIndicator?.querySelector('.lock-frame') || null;
    this.lockLabel = this.lockIndicator?.querySelector('.lock-label') || null;
    this.objective = document.getElementById('objective');
    this.toastEl = document.getElementById('toast');
    this.tutorial = document.getElementById('tutorial-active');
    this.tutorialText = document.getElementById('tutorial-text');
    this.tutorialFill = document.getElementById('tutorial-fill');

    this._damageTimer = null;
    this._hitTimer = null;
    this._objectiveTimer = null;
    this._toastTimer = null;
  }

  setVisible(visible) {
    this.root.classList.toggle('hidden', !visible);
  }

  setHealth(value, max = CONFIG.player.maxHealth) {
    const hp = Math.max(0, Math.round(value));
    this.hpValue.textContent = String(hp);
    if (this.hpFill) {
      this.hpFill.style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
    }
  }

  setArmor(value, max = CONFIG.player.maxArmor) {
    const ap = Math.max(0, Math.round(value));
    this.armorValue.textContent = String(ap);
    if (this.armorFill) {
      this.armorFill.style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
    }
  }

  setAmmo(magazine, reserve) {
    this.ammoValue.textContent = `${magazine} / ${reserve}`;
  }

  setWeapon(label) {
    if (this.weaponLabel) this.weaponLabel.textContent = label;
  }

  setGrenades(count) {
    this.grenadeValue.textContent = String(count);
  }

  // Красная вспышка при получении урона.
  flashDamage() {
    if (!this.damageFlash) return;
    this.damageFlash.classList.add('is-active');
    if (this._damageTimer) clearTimeout(this._damageTimer);
    this._damageTimer = window.setTimeout(() => {
      this.damageFlash.classList.remove('is-active');
    }, 140);
  }

  // Индикатор захвата ПЗРК. progress 0..1 — наведение, locked — цель взята.
  setLock(progress = 0, locked = false) {
    if (!this.lockIndicator) return;

    if (progress <= 0 && !locked) {
      this.lockIndicator.classList.add('hidden');
      this.lockIndicator.classList.remove('is-locked');
      return;
    }

    this.lockIndicator.classList.remove('hidden');
    this.lockIndicator.classList.toggle('is-locked', locked);

    if (this.lockLabel) {
      const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
      this.lockLabel.textContent = locked ? 'ЗАХВАТ' : `НАВЕДЕНИЕ ${percent}%`;
    }

    if (this.lockFrame) {
      // Квадрат сужается по мере захвата.
      const scale = locked ? 1 : 1.45 - Math.min(1, Math.max(0, progress)) * 0.45;
      this.lockFrame.style.transform = `scale(${scale})`;
    }
  }

  // Белый хитмаркер в центре.
  showHitmarker() {
    if (!this.hitmarker) return;
    this.hitmarker.classList.add('is-active');
    if (this._hitTimer) clearTimeout(this._hitTimer);
    this._hitTimer = window.setTimeout(() => {
      this.hitmarker.classList.remove('is-active');
    }, 120);
  }

  setObjective(text, duration = 0) {
    if (!this.objective) return;
    this.objective.textContent = text;
    this.objective.classList.remove('hidden');

    if (this._objectiveTimer) {
      clearTimeout(this._objectiveTimer);
      this._objectiveTimer = null;
    }
    if (duration > 0) {
      this._objectiveTimer = window.setTimeout(() => {
        this.objective.classList.add('hidden');
      }, duration);
    }
  }

  toast(text, duration = 2500) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.classList.add('is-visible');

    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('is-visible');
    }, duration);
  }

  // Прогресс туториала (используется в Фазе 7).
  setTutorial(text, progress01) {
    if (!this.tutorial) return;
    this.tutorial.classList.remove('hidden');
    if (text !== null && text !== undefined) this.tutorialText.textContent = text;
    if (this.tutorialFill) {
      this.tutorialFill.style.width = `${Math.max(0, Math.min(100, progress01 * 100))}%`;
    }
  }

  hideTutorial() {
    this.tutorial?.classList.add('hidden');
  }
}
