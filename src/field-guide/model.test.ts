// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { CHAPTERS, LESSONS, MOCK_CASES, SOURCES } from './curriculum';
import { confusion, cosine, distribution, dueLessons, emptyProgress, nucleus, readProgress, reviewed, STORAGE_KEY, tokenCost } from './model';

beforeEach(() => localStorage.clear());

describe('interview curriculum integrity', () => {
  it('has complete independent learning loops and valid navigation/references', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    expect(LESSONS).toHaveLength(44);
    for (const ch of CHAPTERS) expect(LESSONS.filter((l) => l.chapter === ch.id)).toHaveLength(4);
    for (const l of LESSONS) {
      expect(CHAPTERS.some((c) => c.id === l.chapter)).toBe(true);
      expect(l.beats).toHaveLength(3);
      expect(new Set(l.beats.map((b) => b.title)).size).toBe(3);
      for (const beat of l.beats) { expect(beat.flow).toHaveLength(3); expect(beat.text.length).toBeGreaterThan(45); }
      expect(l.check.correct).toBeGreaterThanOrEqual(0);
      expect(l.check.correct).toBeLessThan(l.check.options.length);
      expect(l.check.why.every((why) => why.length > 20)).toBe(true);
      expect(l.interview.points).toHaveLength(3);
      for (const s of l.sources) expect(SOURCES[s]?.url).toMatch(/^https:\/\//);
    }
    for (const c of MOCK_CASES) expect(LESSONS.some((l) => l.id === c.lesson)).toBe(true);
    expect(new Set(LESSONS.flatMap((l) => l.lab ? [l.lab] : [])).size).toBe(10);
  });
});

describe('experiments calculate the concepts they show', () => {
  it('normalizes probabilities stably and sharpens lower temperatures', () => {
    const low = distribution([1003, 1002, 1001], 0.1);
    const high = distribution([1003, 1002, 1001], 2);
    expect(low.reduce((s, p) => s + p, 0)).toBeCloseTo(1);
    expect(low[0]).toBeGreaterThan(high[0]);
    expect(distribution([3, 2, 1], 0)).toEqual([1, 0, 0]);
  });
  it('keeps the smallest probability nucleus crossing the requested mass', () => {
    const result = nucleus([0.6, 0.3, 0.1], 0.8);
    expect(result[0]).toBeCloseTo(2 / 3);
    expect(result[1]).toBeCloseTo(1 / 3);
    expect(result[2]).toBe(0);
    expect(nucleus([0.6, 0.3, 0.1], 0.5)).toEqual([1, 0, 0]);
  });
  it('distinguishes direction from magnitude in vector similarity', () => {
    expect(cosine([1, 0], [2, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1, 0], [-2, 0])).toBe(-1);
  });
  it('reports undefined precision with no predicted positives and uses inclusive thresholds', () => {
    const cases = [{ score: 0.7, positive: true }, { score: 0.5, positive: false }, { score: 0.3, positive: true }];
    expect(confusion(0.5, cases)).toMatchObject({ tp: 1, fp: 1, fn: 1, tn: 0, precision: 0.5, recall: 0.5 });
    expect(confusion(1, cases)).toMatchObject({ tp: 0, fp: 0, fn: 2, tn: 1, precision: null, recall: 0 });
  });
  it('converts per-million rates and counts all calls', () => {
    expect(tokenCost(2000, 500, 1, 4)).toBeCloseTo(0.004);
    expect(tokenCost(2000, 500, 1, 4, 3)).toBeCloseTo(0.012);
  });
});

describe('local recall records', () => {
  it('does not treat opening or notes as completed practice', () => {
    const progress = emptyProgress();
    progress.lessons['ai-map'] = { note: 'I read the story.' };
    expect(dueLessons(progress)).toEqual([]);
  });
  it('schedules immediate, one-day and three-day self-assessed reviews', () => {
    const now = new Date('2026-10-15T10:00:00Z');
    const p = emptyProgress();
    p.lessons['ai-map'] = reviewed({ note: 'Keep me' }, 'steady', now);
    expect(p.lessons['ai-map'].note).toBe('Keep me');
    expect(dueLessons(p, now.getTime())).toHaveLength(0);
    expect(dueLessons(p, now.getTime() + 86_400_000)).toHaveLength(1);
    expect(reviewed({}, 'revisit', now).due).toBe(now.toISOString());
    expect(reviewed({}, 'strong', now).due).toBe('2026-10-18T10:00:00.000Z');
  });
  it('recovers from corrupted storage and ignores invalid records and unknown lessons', () => {
    localStorage.setItem(STORAGE_KEY, '{');
    expect(readProgress()).toEqual(emptyProgress());
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ path: 'invalid', lessons: { 'ai-map': { note: 'Hello', practiced: 123, due: 'bad-date', confidence: 'invented' }, unknown: { practiced: '2026-10-15' } } }));
    expect(readProgress()).toMatchObject({ path: 'full', lessons: { 'ai-map': { note: 'Hello', practiced: undefined, due: undefined, confidence: undefined } } });
    expect(Object.keys(readProgress().lessons)).toEqual(['ai-map']);
  });
});
