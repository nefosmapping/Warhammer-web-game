// Реестр уровней. Единая точка загрузки для main.js.

import { buildLevel1 } from './level1.js';
import { buildLevel2 } from './level2.js';
import { buildLevel3 } from './level3.js';

export const LEVEL_ORDER = ['level1', 'level2', 'level3'];

const BUILDERS = {
  level1: buildLevel1,
  level2: buildLevel2,
  level3: buildLevel3
};

export function hasLevel(id) {
  return Boolean(BUILDERS[id]);
}

// signature: build(scene, colliders, lighting) — как требует архитектура уровней.
export function buildLevel(id, scene, colliders, lighting) {
  const builder = BUILDERS[id];
  if (!builder) {
    console.warn(`[Levels] Неизвестный уровень: ${id}`);
    return null;
  }
  return builder(scene, colliders, lighting);
}
