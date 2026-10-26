// Система кат-сцен: ключевые кадры камеры + таймлайн событий.
//
// Формат описания сцены (объект, который возвращают js/cutscenes/*.js):
// {
//   duration: 40,                       // секунды
//   startFade: 0,                       // начальная непрозрачность затемнения (0..1)
//   keyframes: [{ t, pos:[x,y,z], lookAt:[x,y,z], fov, cut }],
//   events:    [{ t, type, ... }],
//   onStart(cutscene), onEnd(cutscene), update(time, dt, cutscene)
// }
//
// Типы событий: dialogue, shake, flash, fade, callback, sound, letterbox.

import * as THREE from 'three';
import { easeInOut, clamp01, lerp } from './config.js';

const DEFAULT_FOV = 75;

export class Cutscene {
  constructor({ camera, dialogue, audio, dom }) {
    this.camera = camera;
    this.dialogue = dialogue;
    this.audio = audio;
    this.dom = dom;

    this.active = false;
    this.def = null;
    this.time = 0;
    this.eventIndex = 0;
    this.onComplete = null;

    this.baseFov = camera.fov;

    this.shakeAmp = 0;
    this.shakeDuration = 0;
    this.shakeTime = 0;

    this._lookTarget = new THREE.Vector3();
    this._flashTimer = null;
  }

  // -------------------------------------------------------------------------
  // Запуск / остановка
  // -------------------------------------------------------------------------

  play(def, onComplete = null) {
    if (this.active) this.stop();

    this.def = def;
    this.onComplete = onComplete;
    this.active = true;
    this.time = 0;
    this.eventIndex = 0;
    this.shakeAmp = 0;
    this.shakeTime = 0;
    this.baseFov = this.camera.fov || DEFAULT_FOV;

    this._resetFade();
    this.dom.letterbox?.classList.remove('hidden');

    try {
      def.onStart?.(this);
    } catch (error) {
      console.warn('[Cutscene] Ошибка onStart:', error);
    }

    this._applyCamera(0);
    this._runEvents();
  }

  // Прерывание без вызова onComplete (переход в меню, пауза и т.п.).
  stop() {
    if (!this.active) return;

    this.active = false;
    this.dialogue.close();

    try {
      this.def?.onEnd?.(this);
    } catch (error) {
      console.warn('[Cutscene] Ошибка onEnd:', error);
    }

    this.def = null;
    this.onComplete = null;
    this.dom.letterbox?.classList.add('hidden');
    this._restoreCamera();
    this.fadeTo(0, 0.3);
  }

  finish() {
    if (!this.active) return;

    const def = this.def;
    const done = this.onComplete;

    this.active = false;
    this.onComplete = null;
    this.dialogue.close();

    try {
      def?.onEnd?.(this);
    } catch (error) {
      console.warn('[Cutscene] Ошибка onEnd:', error);
    }

    this.def = null;
    this.dom.letterbox?.classList.add('hidden');
    this._restoreCamera();

    done?.();
  }

  // -------------------------------------------------------------------------
  // Обновление
  // -------------------------------------------------------------------------

  update(dt) {
    if (!this.active) return;

    this.time += dt;

    try {
      this.def.update?.(this.time, dt, this);
    } catch (error) {
      console.warn('[Cutscene] Ошибка update:', error);
    }

    this._applyCamera(this.time);
    this._runEvents();
    this._applyShake(dt);

    if (this.time >= this.def.duration) this.finish();
  }

  // Пробел: сначала обслуживаем открытый диалог, затем пропускаем сцену.
  handleSpace() {
    if (!this.active) return false;
    if (this.dialogue.active) {
      this.dialogue.handleSpace();
      return true;
    }
    this.finish();
    return true;
  }

  // -------------------------------------------------------------------------
  // Камера
  // -------------------------------------------------------------------------

  _applyCamera(time) {
    const frames = this.def?.keyframes;
    if (!frames || frames.length === 0) return;

    let index = 0;
    for (let i = 0; i < frames.length; i += 1) {
      if (frames[i].t <= time) index = i;
      else break;
    }

    const current = frames[index];
    const next = frames[index + 1];

    let posX = current.pos[0];
    let posY = current.pos[1];
    let posZ = current.pos[2];
    let lookX = current.lookAt[0];
    let lookY = current.lookAt[1];
    let lookZ = current.lookAt[2];
    let fov = current.fov ?? this.baseFov;

    // Переход к следующему кадру. Если следующий кадр помечен cut —
    // держим текущий до его времени, затем резко переключаемся.
    if (next && !next.cut) {
      const span = Math.max(0.0001, next.t - current.t);
      const u = easeInOut(clamp01((time - current.t) / span));

      posX = lerp(current.pos[0], next.pos[0], u);
      posY = lerp(current.pos[1], next.pos[1], u);
      posZ = lerp(current.pos[2], next.pos[2], u);
      lookX = lerp(current.lookAt[0], next.lookAt[0], u);
      lookY = lerp(current.lookAt[1], next.lookAt[1], u);
      lookZ = lerp(current.lookAt[2], next.lookAt[2], u);
      fov = lerp(current.fov ?? this.baseFov, next.fov ?? this.baseFov, u);
    }

    this.camera.position.set(posX, posY, posZ);
    this._lookTarget.set(lookX, lookY, lookZ);
    this.camera.lookAt(this._lookTarget);

    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  _applyShake(dt) {
    if (this.shakeTime <= 0) return;

    this.shakeTime = Math.max(0, this.shakeTime - dt);
    const falloff = this.shakeDuration > 0 ? this.shakeTime / this.shakeDuration : 0;
    const amp = this.shakeAmp * falloff;

    this.camera.position.x += (Math.random() - 0.5) * amp;
    this.camera.position.y += (Math.random() - 0.5) * amp;
    this.camera.position.z += (Math.random() - 0.5) * amp * 0.5;
    this.camera.rotation.z += (Math.random() - 0.5) * amp * 0.08;
  }

  _restoreCamera() {
    this.camera.fov = this.baseFov || DEFAULT_FOV;
    this.camera.rotation.z = 0;
    this.camera.updateProjectionMatrix();
  }

  // -------------------------------------------------------------------------
  // События таймлайна
  // -------------------------------------------------------------------------

  _runEvents() {
    const events = this.def?.events;
    if (!events) return;

    while (this.eventIndex < events.length && events[this.eventIndex].t <= this.time) {
      this._runEvent(events[this.eventIndex]);
      this.eventIndex += 1;
    }
  }

  _runEvent(event) {
    switch (event.type) {
      case 'dialogue':
        this.dialogue.show(event.speaker, event.text, { autoClose: event.autoClose ?? 0 });
        break;

      case 'shake':
        this.shake(this, event.amp ?? 0.25, event.duration ?? 0.6);
        break;

      case 'flash':
        this.flash(event.color || '#ffffff', event.duration ?? 0.3, event.opacity ?? 1);
        break;

      case 'fade':
        this.fadeTo(event.to ?? 1, event.duration ?? 0.8, event.color);
        break;

      case 'callback':
        try {
          event.fn?.(this);
        } catch (error) {
          console.warn('[Cutscene] Ошибка события callback:', error);
        }
        break;

      case 'sound':
        if (event.name && typeof this.audio?.[event.name] === 'function') {
          this.audio[event.name]();
        }
        break;

      case 'letterbox':
        this.dom.letterbox?.classList.toggle('hidden', !event.show);
        break;

      default:
        console.info(`[Cutscene] Неизвестное событие: ${event.type}`);
        break;
    }
  }

  // Тряска камеры: амплитуда в метрах, затухает за duration секунд.
  shake(cutscene, amp = 0.25, duration = 0.6) {
    this.shakeAmp = amp;
    this.shakeDuration = duration;
    this.shakeTime = duration;
  }

  // Затемнение через #fade-black. to = 1 — в чёрное, 0 — из чёрного.
  fadeTo(to, duration = 0.8, color = null) {
    const el = this.dom.fade;
    if (!el) return;

    if (color) el.style.background = color;
    el.style.transition = `opacity ${Math.max(0.01, duration)}s linear`;
    el.style.opacity = String(clamp01(to));
  }

  // Короткая вспышка (взрыв, попадание ракеты).
  flash(color = '#ffffff', duration = 0.3, opacity = 1) {
    const el = this.dom.fade;
    if (!el) return;

    if (this._flashTimer) {
      window.clearTimeout(this._flashTimer);
      this._flashTimer = null;
    }

    el.style.transition = 'none';
    el.style.background = color;
    el.style.opacity = String(clamp01(opacity));

    this._flashTimer = window.setTimeout(() => {
      el.style.transition = `opacity ${Math.max(0.05, duration)}s linear`;
      el.style.opacity = '0';
      el.style.background = '#000000';
      this._flashTimer = null;
    }, 16);
  }

  _resetFade() {
    const el = this.dom.fade;
    if (!el) return;

    if (this._flashTimer) {
      window.clearTimeout(this._flashTimer);
      this._flashTimer = null;
    }

    el.style.transition = 'none';
    el.style.background = '#000000';
    el.style.opacity = String(clamp01(this.def?.startFade ?? 0));
  }
}

// Рекурсивное освобождение ресурсов сцены кат-сцены.
export function disposeObject3D(root) {
  if (!root) return;

  root.traverse((child) => {
    if (!child.isMesh) return;

    child.geometry?.dispose?.();

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      material.dispose?.();
    }
  });
}
