// Реэкспорт всех процедурных моделей и каталог для проверки бюджетов полигонов.

export * from './player.js';
export * from './enemies.js';
export * from './props.js';
export * from './environment.js';
export * from './valkyrie.js';

export {
  describeModel,
  countTriangles,
  countMeshes,
  ModelBuilder,
  VertexColorBuilder,
  beveledBox
} from './utils.js';

import { makeBolter, makeChainsword, makePlayerArms, makeGrenade, makeLauncher } from './player.js';
import { makeOrkBoy, makeOrkShooter, makeOrkNob } from './enemies.js';
import { makeValkyrie } from './valkyrie.js';
import {
  makeTree,
  makeAmmoCrate,
  makeMedkit,
  makeBarrel,
  makeCampfire,
  makeOrkTotem
} from './props.js';
import {
  makeValkyrieWreck,
  makeGenerator,
  makeSandbags,
  makeHQGate,
  makeFlag
} from './environment.js';
import { describeModel } from './utils.js';

// minTriangles — требования из §2.2/§2.4 «графика.txt» и чек-листа задания.
export const MODEL_CATALOG = [
  { name: 'Болтер', category: 'Оружие игрока', create: makeBolter, minTriangles: 4000 },
  { name: 'Цепной меч', category: 'Оружие игрока', create: makeChainsword, minTriangles: 4000 },
  { name: 'Руки игрока', category: 'Оружие игрока', create: makePlayerArms, minTriangles: 2000 },
  { name: 'Граната', category: 'Оружие игрока', create: makeGrenade, minTriangles: 0 },
  { name: 'ПЗРК', category: 'Оружие игрока', create: makeLauncher, minTriangles: 0 },

  { name: 'Орк-бойз', category: 'Враги', create: makeOrkBoy, minTriangles: 8000 },
  { name: 'Орк-стрелок', category: 'Враги', create: makeOrkShooter, minTriangles: 8000 },
  { name: 'Орочий ноб', category: 'Враги', create: makeOrkNob, minTriangles: 30000 },

  { name: '«Валькирия» (полная)', category: 'Техника', create: makeValkyrie, minTriangles: 20000 },

  { name: 'Дерево (вариация 1)', category: 'Пропсы', create: () => makeTree(0), minTriangles: 3000 },
  { name: 'Дерево (вариация 2)', category: 'Пропсы', create: () => makeTree(1), minTriangles: 3000 },
  { name: 'Дерево (вариация 3)', category: 'Пропсы', create: () => makeTree(2), minTriangles: 3000 },
  { name: 'Ящик с патронами', category: 'Пропсы', create: makeAmmoCrate, minTriangles: 500 },
  { name: 'Аптечка', category: 'Пропсы', create: makeMedkit, minTriangles: 500 },
  { name: 'Бочка', category: 'Пропсы', create: makeBarrel, minTriangles: 500 },
  { name: 'Костёр', category: 'Пропсы', create: () => makeCampfire({ withLight: false }), minTriangles: 0 },
  { name: 'Орочий тотем', category: 'Пропсы', create: makeOrkTotem, minTriangles: 0 },

  { name: 'Обломки «Валькирии»', category: 'Окружение', create: makeValkyrieWreck, minTriangles: 10000 },
  { name: 'Генератор', category: 'Окружение', create: makeGenerator, minTriangles: 1500 },
  { name: 'Мешки с песком', category: 'Окружение', create: makeSandbags, minTriangles: 500 },
  { name: 'Ворота штаба', category: 'Окружение', create: makeHQGate, minTriangles: 5000 },
  { name: 'Имперский флаг', category: 'Окружение', create: makeFlag, minTriangles: 300 }
];

// Собирает каждую модель, считает меши и треугольники.
// Возвращает массив строк для таблицы/консоли.
export function auditModels() {
  const rows = MODEL_CATALOG.map((entry) => {
    const model = entry.create();
    const stats = describeModel(entry.name, model);
    return {
      name: entry.name,
      category: entry.category,
      meshes: stats.meshes,
      triangles: stats.triangles,
      minTriangles: entry.minTriangles,
      passed: stats.triangles >= entry.minTriangles
    };
  });

  const totalTriangles = rows.reduce((sum, row) => sum + row.triangles, 0);
  const totalMeshes = rows.reduce((sum, row) => sum + row.meshes, 0);

  return { rows, totalTriangles, totalMeshes };
}

// Печать отчёта в консоль (используется в QA-фазе).
export function reportModelStats(logger = console.info) {
  const { rows, totalTriangles, totalMeshes } = auditModels();
  logger('--- Бюджеты моделей ---');
  for (const row of rows) {
    logger(
      `${row.passed ? 'OK ' : 'FAIL'} ${row.name}: ${row.meshes} меш., ` +
      `${row.triangles} тр. (минимум ${row.minTriangles})`
    );
  }
  logger(`Итого: ${totalMeshes} мешей, ${totalTriangles} треугольников`);
  return { rows, totalTriangles, totalMeshes };
}
