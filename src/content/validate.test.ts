// Proves the validator actually catches broken content (and doesn't hang on infinite loops).
import { describe, expect, it } from 'vitest';
import { validateUnits } from './validate.node';
import type { Unit } from './types';
import { Recorder } from '@/engine/recorder';

const code = `
def f(x):
    return x  #@ret
`;

function baseUnit(over: Partial<Unit> = {}): Unit {
  return {
    id: 'binary-search',
    hook: 'h',
    predict: { prompt: 'p', options: ['a', 'b'], answer: 0, explain: 'e' },
    viz: {
      id: 'v',
      title: 't',
      code,
      language: 'python',
      inputs: [{ key: 'x', label: 'x', kind: 'number', default: 2 }],
      run: ({ x }: { x: number }) => {
        const r = new Recorder(code);
        for (let i = 0; i < 3; i++) r.step('ret', `step ${i}`, [{ type: 'note', text: 'n' }]);
        return { frames: r.frames, result: x * 2 };
      },
      reference: ({ x }: { x: number }) => x * 2,
    },
    practice: {
      language: 'python',
      fnName: 'double',
      statement: 's',
      signature: 'def double(x):',
      solution: 'def double(x):\n    return @@x@@ * @@2@@',
      tests: [
        { args: [2], expected: 4 },
        { args: [5], expected: 10 },
      ],
    },
    debug: {
      language: 'python',
      fnName: 'double',
      statement: 's',
      buggy: 'def double(x):\n    return x + 2',
      fixed: 'def double(x):\n    return x * 2',
      tests: [
        { args: [2], expected: 4 },
        { args: [5], expected: 10 },
      ],
      bugType: 'b',
      hint: 'h',
      explanation: 'e',
    },
    boss: {
      title: 'b',
      statement: 's',
      language: 'javascript',
      fnName: 'triple',
      starter: 'function triple(x) {\n  // your code\n}',
      solution: 'function triple(x) {\n  return x * 3;\n}',
      tests: [
        { args: [1], expected: 3 },
        { args: [2], expected: 6 },
      ],
      hints: ['a', 'b'],
    },
    ...over,
  };
}

describe('validator', () => {
  it('accepts a correct unit', async () => {
    const r = await validateUnits([baseUnit()]);
    expect(r['binary-search']).toEqual({ id: 'binary-search', viz: [], drills: [], boss: [], other: [] });
  });

  it('flags a bug that passes, a wrong solution, and a viz that disagrees with its reference', async () => {
    const u = baseUnit();
    u.debug = { ...u.debug, buggy: u.debug.fixed + '\n' };
    u.boss = { ...u.boss, solution: 'function triple(x) { return x * 2; }' };
    u.viz = { ...u.viz, reference: ({ x }: { x: number }) => x * 3 };
    const r = (await validateUnits([u]))['binary-search'];
    expect(r.drills.join()).toMatch(/debug buggy should fail/);
    expect(r.boss.join()).toMatch(/boss solution should pass/);
    expect(r.viz.join()).toMatch(/!= reference/);
  });

  it('treats an infinite loop in buggy code as a failure instead of hanging', async () => {
    const u = baseUnit();
    u.debug = { ...u.debug, buggy: 'def double(x):\n    while True:\n        pass' };
    const r = (await validateUnits([u]))['binary-search'];
    expect(r.drills).toEqual([]);
  });

  it('runs React tasks in jsdom with the real sandbox harness', async () => {
    const counter = `function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>Count: {n}</button>;
}`;
    const u = baseUnit();
    u.boss = {
      ...u.boss,
      language: 'jsx',
      fnName: 'Counter',
      tests: undefined,
      reactTests: [
        { name: 'starts at 0', steps: [{ expectText: 'Count: 0' }] },
        { name: 'increments', steps: [{ click: 'button' }, { click: 'button' }, { expectText: 'Count: 2' }] },
      ],
      starter: 'function Counter() {\n  return <button>Count: ?</button>;\n}',
      solution: counter,
    };
    const r = (await validateUnits([u]))['binary-search'];
    expect(r.boss).toEqual([]);
  });
});
