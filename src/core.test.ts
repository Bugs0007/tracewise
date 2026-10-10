import { describe, expect, it } from 'vitest';
import { matches, toPlain } from '@/runner/compare';
import { blankMatches, cleanSolution, deriveSkeleton, fillBlanks, levelStarter, nextLadderState, parseBlanks } from '@/content/ladder';
import { addDays, freshSave, importSave, exportSave, levelInfo, migrate, scheduleReview, SCHEMA_VERSION, xpForLevel } from '@/store/save';
import { parseInput, formatInput } from '@/engine/inputs';
import { parseAnchors, Recorder } from '@/engine/recorder';
import { addLoopGuards } from '@/runner/loopGuard';
import { buildQuiz } from '@/player/Player';
import { runJsTests } from '@/runner/js-core';
import { buildTree, treeToLevel } from '@/engine/layout';
import type { PracticeTask } from '@/content/types';

describe('compare', () => {
  it('handles modes', () => {
    expect(matches([1, 2], [1, 2])).toBe(true);
    expect(matches([2, 1], [1, 2])).toBe(false);
    expect(matches([2, 1], [1, 2], 'unordered')).toBe(true);
    expect(matches([[2, 1], [3]], [[3], [1, 2]], 'nested')).toBe(true);
    expect(matches(0.1 + 0.2, 0.3, 'float')).toBe(true);
    expect(matches({ a: 1, b: [1] }, { b: [1], a: 1 })).toBe(true);
  });
  it('normalises JS values', () => {
    expect(toPlain(new Set([3, 1]))).toEqual([1, 3]);
    expect(toPlain(Infinity)).toBe('Infinity');
    expect(toPlain(undefined)).toBe(null);
  });
});

describe('ladder', () => {
  const task: PracticeTask = { language: 'python', fnName: 'f', statement: '', signature: 'def f(a):', solution: 'def f(a):\n    x = @@a + 1@@\n    if x:\n        y = @@x@@\n        z = @@y@@\n    return @@z@@' };
  it('parses and refills blanks', () => {
    const segs = parseBlanks(task.solution);
    const answers = segs.flatMap((s) => (s.kind === 'blank' ? [s.answer] : []));
    expect(answers).toEqual(['a + 1', 'x', 'y', 'z']);
    expect(fillBlanks(segs, answers)).toBe(cleanSolution(task.solution));
    expect(blankMatches('a + 1', 'a+1')).toBe(true);
  });
  it('derives a skeleton that keeps block structure', () => {
    expect(deriveSkeleton(task)).toBe('def f(a):\n    # TODO\n    if x:\n        # TODO\n    # TODO');
    expect(levelStarter(task, 3)).toContain('def f(a):\n    # your code here');
  });
  it('promotes and demotes', () => {
    expect(nextLadderState(1, 0, true)).toEqual({ level: 2, fails: 0, changed: 'up' });
    expect(nextLadderState(2, 2, false)).toEqual({ level: 1, fails: 0, changed: 'down' });
    expect(nextLadderState(1, 5, false).level).toBe(1);
    expect(nextLadderState(4, 0, true)).toEqual({ level: 4, fails: 0, changed: null });
  });
});

describe('save', () => {
  it('round-trips export/import', () => {
    const s = { ...freshSave(), xp: 123 };
    const back = importSave(exportSave(s));
    expect(back.xp).toBe(123);
    expect(back.schema).toBe(SCHEMA_VERSION);
  });
  it('migrates v0 and sanitises junk', () => {
    const m = migrate({ xp: '40', progress: { a: { steps: {} } } });
    expect(m.xp).toBe(40);
    expect(m.units.a).toBeDefined();
    const j = migrate({ schema: 1, xp: -5, settings: { theme: 'light' }, badges: [1, 'x'] });
    expect(j.xp).toBe(0);
    expect(j.settings.theme).toBe('light');
    expect(j.settings.sound).toBe(false);
    expect(j.badges).toEqual(['x']);
  });
  it('migrates a v1 save to v2 with empty track progress, and keeps what is there', () => {
    const v1 = migrate({ schema: 1, xp: 90, units: { a: { steps: { predict: true } } } });
    expect(v1.schema).toBe(2);
    expect(v1.dsa).toEqual({ problems: {}, bosses: {} });
    expect(v1.units.a).toBeDefined();
    const v2 = migrate({ schema: 2, dsa: { problems: { 'two-sum': { status: 'solved', hints: 1, predictRight: 2, predictTotal: 3 } }, bosses: 'junk' } });
    expect(v2.dsa.problems['two-sum'].status).toBe('solved');
    expect(v2.dsa.bosses).toEqual({});
    // hand-edited junk is coerced, not trusted
    const junk = migrate({ schema: 2, dsa: { problems: { a: { status: 'banana', hints: -4, predictTotal: 'x', typed: 'yes' }, b: 7 }, bosses: { t: { quizBest: -1, solvedAt: 5 } } } });
    expect(junk.dsa.problems.a).toEqual({ hints: 0, predictRight: 0, predictTotal: 0 });
    expect(junk.dsa.problems.b).toBeUndefined();
    expect(junk.dsa.bosses.t).toEqual({});
  });
  it('rejects newer schemas and non-objects', () => {
    expect(() => migrate({ schema: 999 })).toThrow(/newer/);
    expect(() => importSave('[]')).toThrow();
    expect(() => importSave('not json')).toThrow(/JSON/);
  });
  it('levels and reviews', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    const r1 = scheduleReview(undefined, 'u', 'debug', false, '2026-01-01');
    expect(r1.due).toBe('2026-01-02');
    const r2 = scheduleReview(r1, 'u', 'debug', true, '2026-01-02');
    expect(r2.box).toBe(1);
    expect(r2.due).toBe('2026-01-03');
  });
});

describe('inputs', () => {
  it('parses numbers, edges and grids', () => {
    const nums = { key: 'n', label: '', kind: 'numbers' as const, default: [] };
    expect(parseInput(nums, '[1, 2, null, 4]')).toEqual([1, 2, null, 4]);
    expect(() => parseInput(nums, '1, x')).toThrow();
    const edges = { key: 'e', label: '', kind: 'edges' as const, default: [] };
    expect(parseInput(edges, 'A-B:4, B->C')).toEqual([{ from: 'A', to: 'B', w: 4 }, { from: 'B', to: 'C' }]);
    expect(formatInput(edges, [{ from: 'A', to: 'B', w: 4 }])).toBe('A-B:4');
    const grid = { key: 'g', label: '', kind: 'grid' as const, default: [] };
    expect(parseInput(grid, '0 1\n1 0')).toEqual([[0, 1], [1, 0]]);
    expect(() => parseInput(grid, '0 1\n1')).toThrow();
  });
});

describe('engine', () => {
  it('resolves anchors and strips markers', () => {
    const { clean, anchors } = parseAnchors('\ndef f():\n    x = 1  #@a\n    return x //@b\n');
    expect(clean).toBe('def f():\n    x = 1\n    return x');
    expect(anchors).toEqual({ a: 2, b: 3 });
    const r = new Recorder('x = 1  #@a');
    const arr = [1, 2];
    r.step('a', 'c', [{ type: 'array', values: arr }]);
    arr.push(3);
    expect((r.frames[0].panels[0] as any).values).toEqual([1, 2]);
    expect(() => r.step('nope', 'c', [])).toThrow(/anchor/);
  });
  it('builds trees from level order', () => {
    expect(treeToLevel(buildTree([1, 2, 3, null, 4]))).toEqual([1, 2, 3, null, 4]);
  });
  it('builds predict-next quizzes with the true next caption', () => {
    const f = (c: string) => ({ line: 1, caption: c, panels: [], vars: {} });
    const frames = ['a', 'b', 'c', 'd', 'e', 'f'].map(f);
    const q = buildQuiz(frames, 2)!;
    expect(q.options[q.answer]).toBe('d');
    expect(new Set(q.options).size).toBe(q.options.length);
  });
});

describe('runners', () => {
  it('loop guard instruments every loop form', () => {
    const out = addLoopGuards('for(;;) x++; while(a){b()} do { c() } while(d); for (const k of o) f(k);');
    expect(out.match(/__guard\(\)/g)!.length).toBe(4);
  });
  it('runs JS tests, async functions and reports errors', async () => {
    const r = await runJsTests('function add(a, b) { return a + b; }', 'add', [{ args: [1, 2] }]);
    expect(r.results[0]).toEqual({ ok: true, value: 3 });
    const a = await runJsTests('async function f() { return 7; }', 'f', [{ args: [] }]);
    expect(a.results[0].value).toBe(7);
    const e = await runJsTests('function f() { throw new TypeError("boom"); }', 'f', [{ args: [] }]);
    expect(e.results[0].error).toMatch(/TypeError: boom/);
    const m = await runJsTests('const x = 1;', 'missing', [{ args: [] }]);
    expect(m.error).toMatch(/define `missing`/);
  });
});
