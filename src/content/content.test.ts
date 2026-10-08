import { describe, expect, it } from 'vitest';
import type { Unit } from './types';
import { validateUnits, type UnitReport } from './validate.node';
import { CATALOG_BY_ID } from './catalog';

const mods = import.meta.glob<{ default: Unit }>('./units/*/*.ts', { eager: true });
const only = (process.env.UNITS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const entries = Object.entries(mods)
  .map(([path, m]) => ({ path, unit: m.default, file: path.match(/\/([\w-]+)\.ts$/)![1], dir: path.split('/')[2] }))
  .filter((e) => !only.length || only.includes(e.file));

describe('content', () => {
  let reports: Record<string, UnitReport> = {};

  it('validates every unit (visualizer, drills, boss)', async () => {
    reports = await validateUnits(entries.map((e) => e.unit));
    const problems = Object.values(reports).flatMap((r) => [...r.viz, ...r.drills, ...r.boss, ...r.other].map((p) => `${r.id}: ${p}`));
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('file names, ids and module folders agree with the catalog', () => {
    for (const e of entries) {
      expect(e.unit.id, e.path).toBe(e.file);
      expect(CATALOG_BY_ID[e.file]?.module, e.path).toBe(e.dir);
    }
  });
});
