import { describe, expect, it } from 'vitest';
import { freshSave, type SaveData } from '@/store/save';
import { mergeSaves, stable } from './merge';

const unit = (over: Partial<SaveData['units'][string]> = {}) => ({ steps: {}, ladder: 1 as const, ladderFails: 0, bestLevel: 0, hintsUsed: 0, ...over });

function save(over: Partial<SaveData>): SaveData {
  return { ...freshSave(), createdAt: '2026-01-01T00:00:00.000Z', ...over };
}

describe('mergeSaves', () => {
  it('never loses progress from either side', () => {
    const a = save({ xp: 300, units: { x: unit({ steps: { predict: true, watch: true } }) }, badges: ['a'] });
    const b = save({ xp: 500, units: { x: unit({ steps: { watch: true, type: true } }), y: unit({ steps: { predict: true } }) }, badges: ['b'] });
    const m = mergeSaves(a, b);
    expect(m.xp).toBe(500);
    expect(m.units.x.steps).toEqual({ predict: true, watch: true, type: true });
    expect(Object.keys(m.units).sort()).toEqual(['x', 'y']);
    expect(m.badges.sort()).toEqual(['a', 'b']);
  });

  it('is commutative and idempotent on progress fields', () => {
    const a = save({ xp: 10, daily: { '2026-10-01': 5 }, units: { x: unit({ bestLevel: 2, ladder: 3 }) }, streak: { count: 2, best: 4, lastDay: '2026-10-02' } });
    const b = save({ xp: 40, daily: { '2026-10-01': 9, '2026-10-02': 1 }, units: { x: unit({ bestLevel: 3, ladder: 3 }) }, streak: { count: 1, best: 6, lastDay: '2026-10-03' } });
    const ab = mergeSaves(a, b);
    const ba = mergeSaves(b, a);
    expect(stable(ab)).toBe(stable(ba));
    expect(stable(mergeSaves(ab, ab))).toBe(stable(ab));
    expect(ab.daily).toEqual({ '2026-10-01': 9, '2026-10-02': 1 });
    expect(ab.streak).toEqual({ count: 1, best: 6, lastDay: '2026-10-03' });
  });

  it('keeps the ladder state of whichever side got further, and the earliest completion', () => {
    const a = save({ units: { x: unit({ bestLevel: 1, ladder: 2, ladderFails: 1, completedAt: '2026-02-02T00:00:00.000Z' }) } });
    const b = save({ units: { x: unit({ bestLevel: 3, ladder: 4, ladderFails: 0, completedAt: '2026-01-05T00:00:00.000Z' }) } });
    const m = mergeSaves(a, b).units.x;
    expect(m.ladder).toBe(4);
    expect(m.ladderFails).toBe(0);
    expect(m.completedAt).toBe('2026-01-05T00:00:00.000Z');
  });

  it('dedupes interviews by timestamp and caps at 50', () => {
    const rec = (n: number) => ({ at: `2026-03-${String(n).padStart(2, '0')}T00:00:00.000Z`, modules: [], score: 1, total: 2, seconds: 3 });
    const a = save({ interviews: [rec(1), rec(2)] });
    const b = save({ interviews: [rec(2), rec(3)] });
    expect(mergeSaves(a, b).interviews.map((i) => i.at.slice(8, 10))).toEqual(['01', '02', '03']);
    const many = save({ interviews: Array.from({ length: 30 }, (_, i) => rec(i + 1)) });
    const other = save({ interviews: Array.from({ length: 30 }, (_, i) => ({ ...rec(i + 1), at: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` })) });
    expect(mergeSaves(many, other).interviews).toHaveLength(50);
  });

  it('keeps local settings, but a brand-new device adopts the cloud settings', () => {
    const cloud = save({ settings: { ...freshSave().settings, theme: 'dark', fontSize: 18 } });
    const fresh = save({});
    expect(mergeSaves(fresh, cloud).settings.theme).toBe('dark');
    const custom = save({ settings: { ...freshSave().settings, theme: 'light' } });
    expect(mergeSaves(custom, cloud).settings.theme).toBe('light');
  });

  it('does not mutate its inputs', () => {
    const a = save({ xp: 1, units: { x: unit() } });
    const b = save({ xp: 2, units: { x: unit({ hintsUsed: 3 }) } });
    const before = stable([a, b]);
    mergeSaves(a, b);
    expect(stable([a, b])).toBe(before);
  });
});
