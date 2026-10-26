// Центральные константы игры: тюнинг, цвета, размеры, лимиты.
// Все числа, которые могут понадобиться в разных системах, собраны здесь.

export const CONFIG = {
  render: {
    fov: 75,
    near: 0.1,
    far: 200,
    maxPixelRatio: 1.5,
    // ACES при 1.05 давал «чёрную дыру»: поднимаем экспозицию до читаемой.
    exposure: 1.35,

    // Штатная тень мира: используется как fallback (без CSM).
    shadowMapSize: 2048,
    shadowBias: -0.0006,
    shadowNormalBias: 0.03,

    // Каскадные тени (CSM). maxFar ограничен дальностью тумана:
    // за этой дистанцией тени не нужны, зато разрешение вблизи выше.
    csm: {
      cascades: 2,
      maxFar: 120,
      shadowMapSize: 1024,
      lightNear: 1,
      lightFar: 160,
      lightMargin: 45,
      // normalBias увеличен против shadow acne на больших плоскостях.
      bias: 0.0002,
      normalBias: 0.05,
      mode: 'practical'
    },

    // Запасной вариант без CSM: один DirectionalLight с PCFSoftShadowMap.
    // extent — половина стороны ортографической shadow-камеры (метры).
    fallbackShadow: {
      mapSize: 2048,
      extent: 55,
      near: 0.5,
      far: 160,
      bias: -0.0004,
      normalBias: 0.05
    },

    // SSAO. minDistance/maxDistance — в нормализованной глубине [0..1],
    // то есть 0.0025 при far=200 ≈ 0.5 м. Значения подобраны под метрическую
    // шкалу уровней: контактные тени у ящиков и под ногами орков, без «клякс».
    ssao: {
      kernelRadius: 0.5,
      minDistance: 0.0002,
      maxDistance: 0.0015
    },

    // Сдержанный bloom: только яркие эмиссивные участки.
    bloom: {
      strength: 0.7,
      radius: 0.55,
      threshold: 0.82
    },

    // FXAA включён по умолчанию; отключается через ?nofxaa.
    fxaa: true
  },

  player: {
    maxHealth: 100,
    maxArmor: 50,
    armorAbsorb: 0.5,
    walkSpeed: 5,
    runSpeed: 8,
    eyeHeight: 1.7,
    radius: 0.4,
    mouseSensitivity: 0.0022,
    bobFrequency: 9.0,
    bobAmplitude: 0.035
  },

  weapons: {
    bolter: {
      damage: 25,
      rpm: 600,
      magSize: 30,
      reserveMax: 90,
      reloadTime: 2.0,
      recoil: 2.0,
      range: 120
    },
    chainsword: {
      damage: 60,
      range: 2.0,
      cooldown: 0.8,
      swingTime: 0.4,
      parryWindow: 0.3,
      parryChance: 0.5
    },
    grenade: {
      damage: 120,
      edgeDamage: 40,
      radius: 4.0,
      fuse: 2.0,
      startAmmo: 2,
      maxAmmo: 4,
      throwSpeed: 16,
      gravity: 18
    }
  },

  enemies: {
    boy: {
      health: 60,
      damage: 15,
      speed: 4.0,
      attackRange: 1.5,
      attackCooldown: 1.2,
      detectRadius: 20,
      noiseRadius: 15
    },
    shooter: {
      health: 40,
      damage: 10,
      speed: 3.0,
      attackRange: 15,
      attackCooldown: 1.5,
      burst: 3,
      detectRadius: 24,
      noiseRadius: 18,
      keepDistance: 9
    },
    nob: {
      health: 300,
      damage: 30,
      speed: 3.5,
      attackRange: 2.5,
      attackCooldown: 1.8,
      detectRadius: 24,
      noiseRadius: 20,
      rageThreshold: 0.5,
      rageSpeedMultiplier: 1.3
    },
    tutorialHealth: 25,
    maxAlive: 20
  },

  settings: {
    sensitivityMin: 0.5,
    sensitivityMax: 2.0,
    sensitivityDefault: 1.0,
    volumeDefault: 70
  },

  storageKeys: {
    settings: 'wonder.settings.v1',
    checkpoint: 'wonder.checkpoint.v1'
  },

  // Тайминги интерфейса и переходов.
  timings: {
    splash: 3800,
    splashFade: 420,
    levelCard: 2800,
    fade: 500,
    deathDelay: 2000
  },

  // Лимиты производительности из ТЗ.
  limits: {
    maxDrawCalls: 200,
    maxTriangles: 800000,
    maxEnemies: 20
  }
};

// Схема освещения и тумана по уровням (§3.3 и §6.1 «графика.txt»).
// menu — техническая тема для фона главного меню и демо-сцены Фазы 1.
export const LEVEL_THEMES = {
  menu: {
    background: 0x080a09,
    fog: { color: 0x141c14, density: 0.018 },
    sun: { color: 0xd9cfa0, intensity: 1.15, position: [18, 26, 12] },
    hemi: { sky: 0x6a7a54, ground: 0x1a1712, intensity: 0.8 },
    points: [
      { color: 0xff7b2b, intensity: 2.0, distance: 16, position: [6, 1.6, 2], flicker: true },
      { color: 0xffd089, intensity: 1.1, distance: 14, position: [-7, 2.4, -4], flicker: true }
    ]
  },

  level1: {
    background: 0x2c3524,
    fog: { color: 0x4a5533, density: 0.012 },
    sun: { color: 0xd8d08a, intensity: 1.35, position: [24, 34, -18] },
    hemi: { sky: 0x93a05e, ground: 0x25251a, intensity: 0.95 },
    points: [
      { color: 0xff7a22, intensity: 2.0, distance: 12, position: [-14, 1.8, 18], flicker: true },
      { color: 0xffa13c, intensity: 1.6, distance: 10, position: [16, 1.6, -12], flicker: true },
      { color: 0xff5a1e, intensity: 1.4, distance: 9, position: [-4, 1.2, -26], flicker: true }
    ]
  },

  level2: {
    background: 0x1e0d08,
    fog: { color: 0x3a1a10, density: 0.019 },
    sun: { color: 0xff7a3c, intensity: 0.85, position: [-16, 22, 10] },
    hemi: { sky: 0x7a3a26, ground: 0x1a100a, intensity: 0.8 },
    points: [
      { color: 0xff5a1e, intensity: 2.2, distance: 12, position: [-8, 2.2, -6], flicker: true },
      { color: 0xffb066, intensity: 1.8, distance: 10, position: [10, 3.0, 4], flicker: false },
      { color: 0xff2e12, intensity: 1.6, distance: 14, position: [0, 2.0, -18], flicker: true }
    ]
  },

  level3: {
    background: 0x2a1210,
    fog: { color: 0x4a1e1a, density: 0.010 },
    sun: { color: 0xd0533c, intensity: 1.1, position: [-30, 20, -24] },
    hemi: { sky: 0x8a4438, ground: 0x1e100c, intensity: 0.85 },
    points: [
      { color: 0xffe0b0, intensity: 2.4, distance: 18, position: [0, 8, -40], flicker: false },
      { color: 0xff9a4a, intensity: 1.6, distance: 12, position: [-20, 1.4, 6], flicker: true },
      { color: 0xff6a2a, intensity: 1.4, distance: 11, position: [22, 1.4, -6], flicker: true }
    ]
  }
};

// Параметры PBR-материалов из §3.4 «графика.txt».
// Используются как база для моделей; каждая модель делает свои вариации.
export const MATERIALS = {
  darkMetal: { color: 0x2a2a2e, roughness: 0.5, metalness: 0.8 },
  lightMetal: { color: 0x6b6b70, roughness: 0.4, metalness: 0.8 },
  leather: { color: 0x3a2e28, roughness: 0.95, metalness: 0.0 },
  orkSkinLight: { color: 0x6b8b4a, roughness: 0.85, metalness: 0.0 },
  orkSkinDark: { color: 0x4a6b3a, roughness: 0.85, metalness: 0.0 },
  rustMetal: { color: 0x5a3a28, roughness: 0.8, metalness: 0.5 },
  glowOrange: { color: 0xff6b2b, emissive: 0xff6b2b, emissiveIntensity: 2.0 },
  glowYellow: { color: 0xffdd44, emissive: 0xffdd44, emissiveIntensity: 1.8 }
};

// Небольшие утилиты, общие для всех модулей.
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value) {
  return clamp(value, 0, 1);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Плавная интерполяция для камеры и анимаций: easeInOutCubic.
export function easeInOut(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// Детерминированный псевдослучайный генератор — чтобы уровни собирались одинаково.
export function makeRng(seed = 1337) {
  let s = seed >>> 0;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
