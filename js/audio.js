// Синтез всех звуков через Web Audio API.
// AudioContext создаётся лениво — только после первого жеста пользователя,
// иначе браузер блокирует звук. Внешних аудиофайлов нет.

import { clamp01 } from './config.js';

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.volume = 0.7;
    this.ambient = null;
    this._distortionCurve = null;
  }

  // Ленивая инициализация. Возвращает true, если контекст готов.
  init() {
    if (!this.ctx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return false;

      this.ctx = new AudioCtor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this._makeNoiseBuffer(2.0);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return true;
  }

  get ready() {
    return Boolean(this.ctx && this.master);
  }

  setVolume(value01) {
    this.volume = clamp01(value01);
    if (this.master) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  // -------------------------------------------------------------------------
  // Базовые строительные блоки
  // -------------------------------------------------------------------------

  _makeNoiseBuffer(seconds) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  _makeDistortion(amount = 24) {
    if (this._distortionCurve) return this._distortionCurve;
    const samples = 441;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i += 1) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + amount) * x * 20 * Math.PI / 180) / (Math.PI + amount * Math.abs(x));
    }
    this._distortionCurve = curve;
    return curve;
  }

  _tone({
    type = 'sine',
    freq = 100,
    freqTo = null,
    duration = 0.25,
    gain = 0.2,
    attack = 0.005,
    when = null,
    filterFreq = null,
    filterType = 'lowpass',
    detune = 0
  }) {
    const t = when ?? this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t);
    if (freqTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t + duration);
    }

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(g);

    if (filterFreq !== null) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = filterFreq;
      g.connect(filter);
      filter.connect(this.master);
    } else {
      g.connect(this.master);
    }

    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  _noise({
    duration = 0.2,
    filterType = 'bandpass',
    frequency = 900,
    sweepTo = null,
    q = 0.8,
    gain = 0.3,
    attack = 0.004,
    when = null
  }) {
    const t = when ?? this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, t);
    if (sweepTo !== null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + duration);
    }
    filter.Q.value = q;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);

    const maxOffset = Math.max(0, this.noiseBuffer.duration - duration - 0.05);
    src.start(t, Math.random() * maxOffset, duration);
    src.stop(t + duration + 0.03);
  }

  // -------------------------------------------------------------------------
  // Публичные звуки
  // -------------------------------------------------------------------------

  // Выстрел болтера: низкий «THUMP» + металлический щелчок.
  playShot() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._tone({ type: 'sine', freq: 115, freqTo: 44, duration: 0.16, gain: 0.5, attack: 0.002, when: t });
    this._noise({ duration: 0.11, frequency: 950, sweepTo: 420, q: 0.9, gain: 0.32, when: t });
    this._tone({ type: 'square', freq: 1400, freqTo: 600, duration: 0.04, gain: 0.06, when: t + 0.01 });
  }

  // Удар цепного меча: ревущая пила + металлический скрежет.
  playMelee() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.linearRampToValueAtTime(160, t + 0.08);
    osc.frequency.linearRampToValueAtTime(90, t + 0.32);

    const lfo = this.ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 26;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 22;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.master);

    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.42);
    lfo.stop(t + 0.42);

    this._noise({ duration: 0.18, filterType: 'highpass', frequency: 1800, q: 0.7, gain: 0.12, when: t });
  }

  // Бросок гранаты: короткий свист.
  playGrenade() {
    if (!this.ready) return;
    this._noise({ duration: 0.3, frequency: 500, sweepTo: 1600, q: 1.4, gain: 0.16 });
    this._tone({ type: 'triangle', freq: 900, freqTo: 1400, duration: 0.18, gain: 0.05 });
  }

  // Взрыв: широкий шумовой удар + суб-бас.
  playExplosion() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._noise({ duration: 0.85, filterType: 'lowpass', frequency: 1200, sweepTo: 120, q: 0.6, gain: 0.75, when: t });
    this._tone({ type: 'sine', freq: 78, freqTo: 24, duration: 0.7, gain: 0.55, attack: 0.003, when: t });
    this._noise({ duration: 0.2, filterType: 'highpass', frequency: 2500, q: 0.5, gain: 0.18, when: t });
  }

  // Рычание орка: искажённый низкий тон с вибрато.
  playOrkGrowl() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(72, t);
    osc.frequency.linearRampToValueAtTime(58, t + 0.55);

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 7.5;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 9;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._makeDistortion(30);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);

    osc.connect(shaper);
    shaper.connect(filter);
    filter.connect(g);
    g.connect(this.master);

    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.8);
    lfo.stop(t + 0.8);
  }

  // Попадание по врагу.
  playHit() {
    if (!this.ready) return;
    this._noise({ duration: 0.09, frequency: 420, sweepTo: 160, q: 1.2, gain: 0.22 });
    this._tone({ type: 'square', freq: 220, freqTo: 90, duration: 0.07, gain: 0.08 });
  }

  // Подбор предмета: два коротких тона.
  playPickup() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._tone({ type: 'triangle', freq: 660, duration: 0.09, gain: 0.1, when: t });
    this._tone({ type: 'triangle', freq: 990, duration: 0.12, gain: 0.09, when: t + 0.08 });
  }

  // Клик по интерфейсу.
  playUiClick() {
    if (!this.ready) return;
    this._tone({ type: 'square', freq: 1100, freqTo: 900, duration: 0.05, gain: 0.035, attack: 0.002 });
  }

  // Перезарядка: металлические щелчки (используется в Фазе 3).
  playReload() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._noise({ duration: 0.08, filterType: 'highpass', frequency: 1400, q: 0.9, gain: 0.1, when: t });
    this._noise({ duration: 0.1, filterType: 'bandpass', frequency: 700, q: 1.2, gain: 0.12, when: t + 0.95 });
  }

  // Мрачный эмбиент: низкий гул + фильтрованный ветер. Идемпотентен.
  playAmbient() {
    if (!this.ready || this.ambient) return;
    const t = this.ctx.currentTime;

    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 260;
    windFilter.Q.value = 0.4;

    const windGain = this.ctx.createGain();
    windGain.gain.value = 0.07;

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain);
    lfoGain.connect(windFilter.frequency);

    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.master);

    const drone = this.ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 48;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.035;
    drone.connect(droneGain);
    droneGain.connect(this.master);

    wind.start(t);
    lfo.start(t);
    drone.start(t);

    this.ambient = { wind, lfo, drone, windGain, droneGain };
  }

  stopAmbient() {
    if (!this.ambient) return;
    const t = this.ctx.currentTime;
    const { wind, lfo, drone, windGain, droneGain } = this.ambient;
    windGain.gain.setTargetAtTime(0.0001, t, 0.2);
    droneGain.gain.setTargetAtTime(0.0001, t, 0.2);
    window.setTimeout(() => {
      try {
        wind.stop();
        lfo.stop();
        drone.stop();
      } catch (_error) {
        // уже остановлены
      }
    }, 600);
    this.ambient = null;
  }
}
