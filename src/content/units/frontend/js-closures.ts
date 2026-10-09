import { Recorder } from '@/engine/recorder';
import { nTreePanel, type NTreeNode } from '@/engine/layout';
import type { Panel, Scalar, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { sourcePanel } from '@/content/lib/frontend-js';

const code = `
function makeFunction(body, env) {
  return { body, env };                              //@closure
}
function call(fn) {
  return { vars: {}, parent: fn.env };               //@env
}
function lookup(name, env) {
  while (env !== null) {                             //@loop
    if (name in env.vars) return env.vars[name];     //@found
    env = env.parent;                                //@up
  }
  throw new ReferenceError(name + ' is not defined');
}
`;

type Scenario = 'counter' | 'var in loop' | 'let in loop' | 'adder';

interface In {
  scenario: Scenario;
  n: number;
}

interface Env {
  id: string;
  label: string;
  vars: Record<string, Scalar>;
  parent: string | null;
}
interface Fn {
  id: string;
  label: string;
  env: string;
}

const SCENARIOS: Scenario[] = ['counter', 'var in loop', 'let in loop', 'adder'];

function sourceFor(s: Scenario, n: number): string[] {
  switch (s) {
    case 'counter':
      return ['function makeCounter() {', '  let count = 0;', '  return () => ++count;', '}', 'const a = makeCounter();', 'const b = makeCounter();', `a() x ${n}; b();`];
    case 'var in loop':
    case 'let in loop': {
      const kw = s === 'var in loop' ? 'var' : 'let';
      return ['const fns = [];', `for (${kw} i = 0; i < ${n}; i++) {`, '  fns.push(() => i);', '}', 'fns.map((f) => f());'];
    }
    case 'adder':
      return ['const makeAdder = (x) => (y) => x + y;', 'const add2 = makeAdder(2);', 'const add10 = makeAdder(10);', 'add2(5); add10(5);'];
  }
}

const viz: VizDef<In> = {
  id: 'js-closures',
  title: 'Closures and the scope chain',
  code,
  language: 'javascript',
  inputs: [
    { key: 'scenario', label: 'Scenario', kind: 'select', default: 'counter', options: SCENARIOS },
    { key: 'n', label: 'Loop count / calls', kind: 'number', default: 3, help: 'Whole number from 1 to 4' },
  ],
  presets: [
    { label: 'Counter (private state)', input: { scenario: 'counter', n: 2 } },
    { label: 'var in a loop', input: { scenario: 'var in loop', n: 3 } },
    { label: 'let in a loop', input: { scenario: 'let in loop', n: 3 } },
    { label: 'Adder factory', input: { scenario: 'adder', n: 1 } },
  ],
  run({ scenario, n }) {
    if (!SCENARIOS.includes(scenario)) throw new Error('Unknown scenario');
    if (!Number.isInteger(n) || n < 1 || n > 4) throw new Error('Choose a whole number from 1 to 4');
    const r = new Recorder(code);
    const src = sourceFor(scenario, n);
    const envs: Env[] = [];
    const fns: Fn[] = [];
    const results: Scalar[] = [];
    const done = new Set<number>();
    let ids = 0;
    const envOf = (id: string) => envs.find((e) => e.id === id)!;
    const show = (v: Scalar) => (v === undefined ? 'undefined' : String(v));

    const panels = (tones: Record<string, Tone>, line: number): Panel[] => {
      const nodes: Record<string, NTreeNode> = {};
      for (const e of envs) {
        nodes[e.id] = {
          id: e.id,
          label: e.label,
          tone: tones[e.id],
          badge: Object.entries(e.vars)
            .map(([k, v]) => `${k}=${show(v)}`)
            .join(' ') || '{}',
          children: [...envs.filter((c) => c.parent === e.id).map((c) => c.id), ...fns.filter((f) => f.env === e.id).map((f) => f.id)],
        };
      }
      for (const f of fns) nodes[f.id] = { id: f.id, label: f.label, children: [], tone: tones[f.id] ?? 'path' };
      const tree = nTreePanel(nodes, 'G', { title: 'Scope chain (arrow = outer scope / captured scope)', gapX: 118, gapY: 82 });
      tree.directed = true;
      tree.edges = tree.edges.map((e) => ({ from: e.to, to: e.from, directed: true, dashed: e.to.startsWith('fn'), tone: tones[e.to] === 'compare' || tones[e.to] === 'found' ? 'active' : undefined }));
      tree.height += 20;
      return [
        tree,
        sourcePanel(src, line, done, 'Program'),
        { type: 'log', title: 'Results', lines: results.map((v) => ({ text: show(v), tone: 'found' as Tone })) },
      ];
    };
    const step = (anchor: string, caption: string, line: number, tones: Record<string, Tone> = {}) => {
      if (line >= 0) done.add(line);
      r.step(anchor, caption, panels(tones, line), { results: `[${results.map(show).join(', ')}]` });
    };
    const addEnv = (label: string, parent: string | null, vars: Record<string, Scalar>, id = `E${++ids}`) => {
      envs.push({ id, label, vars, parent });
      return id;
    };
    const addFn = (label: string, env: string, line: number, caption: string) => {
      const id = `fn${++ids}`;
      fns.push({ id, label, env });
      step('closure', caption, line, { [id]: 'new' });
      return id;
    };
    const lookup = (from: string, name: string, line: number): Scalar => {
      let id: string | null = from;
      const seen: Record<string, Tone> = {};
      while (id !== null) {
        const e = envOf(id);
        step('loop', `Look for "${name}" in ${e.label}`, line, { ...seen, [id]: 'compare' });
        if (name in e.vars) {
          step('found', `Found ${name} = ${show(e.vars[name])} in ${e.label}`, line, { ...seen, [id]: 'found' });
          return e.vars[name];
        }
        seen[id] = 'muted';
        id = e.parent;
        if (id !== null) step('up', `Not here: move to the outer scope (${envOf(id).label})`, line, seen);
      }
      throw new ReferenceError(`${name} is not defined`);
    };
    // call a function: new environment whose parent is the function's captured env
    const invoke = (fnId: string, vars: Record<string, Scalar>, line: number, label: string) => {
      const f = fns.find((x) => x.id === fnId)!;
      const id = addEnv(label, f.env, vars, `C${++ids}`);
      step('env', `Call ${label}: new environment, parent = captured ${envOf(f.env).label}`, line, { [id]: 'new' });
      return id;
    };
    const finish = (id: string) => envs.splice(envs.findIndex((e) => e.id === id), 1);

    addEnv('global', null, {}, 'G');
    if (scenario === 'counter') {
      addFn('makeCounter', 'G', 0, 'makeCounter is created in global: it captures the global scope');
      const make = fns[0].id;
      const named: Record<string, string> = {};
      for (const [name, line] of [['a', 4], ['b', 5]] as const) {
        const e = invoke(make, { count: 0 }, line, `makeCounter#${name}`);
        const f = addFn(name, e, line, `The returned arrow captures makeCounter#${name}'s scope (count lives on)`);
        named[name] = f;
        envOf('G').vars[name] = 'fn';
      }
      const call = (name: string) => {
        const c = invoke(named[name], {}, 6, `${name}()`);
        const v = lookup(c, 'count', 2) as number;
        const target = envOf(envOf(c).parent!);
        target.vars.count = v + 1;
        results.push(v + 1);
        step('found', `++count writes ${v + 1} into the captured scope, not into ${name}()`, 6, { [target.id]: 'swap' });
        finish(c);
      };
      for (let i = 0; i < n; i++) call('a');
      call('b');
    } else if (scenario === 'var in loop' || scenario === 'let in loop') {
      const isVar = scenario === 'var in loop';
      const G = envOf('G');
      G.vars.fns = '[]';
      const handles: string[] = [];
      if (isVar) G.vars.i = undefined as unknown as Scalar;
      step('env', isVar ? 'var i is ONE variable shared by the whole loop' : 'let i gets a fresh binding for every iteration', 1);
      for (let k = 0; k < n; k++) {
        let scope = 'G';
        if (isVar) G.vars.i = k;
        else scope = addEnv(`iteration ${k}`, 'G', { i: k }, `L${k}`);
        step('env', isVar ? `Iteration ${k}: i = ${k} (shared)` : `Iteration ${k}: new scope with its own i = ${k}`, 1, { [scope]: 'new' });
        handles.push(addFn(`fns[${k}]`, scope, 2, `fns[${k}] captures ${isVar ? 'the shared scope' : `iteration ${k}'s scope`}`));
      }
      if (isVar) {
        G.vars.i = n;
        step('found', `Loop ends with i = ${n}: the single shared i`, 1);
      }
      handles.forEach((h, k) => {
        const c = invoke(h, {}, 4, `fns[${k}]()`);
        const v = lookup(c, 'i', 2);
        results.push(v);
        step('found', `fns[${k}]() returns ${show(v)}`, 4);
        finish(c);
      });
    } else {
      addFn('makeAdder', 'G', 0, 'makeAdder is created in global');
      const make = fns[0].id;
      const named: Record<string, string> = {};
      for (const [name, x, line] of [['add2', 2, 1], ['add10', 10, 2]] as const) {
        const e = invoke(make, { x }, line, `makeAdder(${x})`);
        named[name] = addFn(name, e, line, `${name} remembers x = ${x} from its parent call`);
      }
      for (const [name, line] of [['add2', 3], ['add10', 3]] as const) {
        const c = invoke(named[name], { y: 5 }, line, `${name}(5)`);
        const y = lookup(c, 'y', 0) as number;
        const x = lookup(c, 'x', 0) as number;
        results.push(x + y);
        step('found', `${name}(5) = ${x} + ${y} = ${x + y}`, line);
        finish(c);
      }
    }
    return { frames: r.frames, result: results };
  },
  reference({ scenario, n }) {
    if (scenario === 'counter') return [...Array.from({ length: n }, (_, i) => i + 1), 1];
    if (scenario === 'var in loop') return Array(n).fill(n);
    if (scenario === 'let in loop') return Array.from({ length: n }, (_, i) => i);
    return [7, 15];
  },
};

const unit: Unit = {
  id: 'js-closures',
  hook: 'A closure is a function plus the scope it was created in. Interviewers use it to probe private state, factories, memoization and the famous `var` in a loop bug.',
  predict: {
    prompt: 'What does this print?',
    code: `var fns = [];
for (var i = 0; i < 3; i++) {
  fns.push(() => i);
}
console.log(fns.map((f) => f()));`,
    codeLang: 'javascript',
    options: ['[0, 1, 2]', '[3, 3, 3]', '[2, 2, 2]', '[undefined, undefined, undefined]'],
    answer: 1,
    explain: 'There is a single `var i` for the whole loop. All three arrows close over that same variable, and by the time they run the loop has ended with i = 3. With `let`, each iteration has its own i and you would get [0, 1, 2].',
  },
  viz,
  deeper: {
    points: [
      'A function remembers the scope where it was defined (lexical scoping), not where it is called.',
      'Name lookup walks the scope chain outward: own scope, parent, ... global. The first match wins (shadowing).',
      'A scope survives as long as any function can still reach it, which is how a counter keeps its private `count`.',
      'A closure captures variables, not values: if the variable changes later, the closure sees the new value.',
      '`let`/`const` in a `for` loop create a fresh binding per iteration; `var` is function-scoped and shared.',
    ],
    pitfalls: ['Loop callbacks that all see the final value of a `var` counter', 'Holding large objects alive by accident through a long-lived closure', 'Thinking a closure copies the value at creation time'],
  },
  practice: {
    language: 'javascript',
    fnName: 'makeCounter',
    statement: 'Return an object `{ inc, dec, value }` whose methods change and read a private count that starts at `start` and moves by `step`. Two counters must not share state.',
    signature: 'function makeCounter(start, step) {',
    solution: `function makeCounter(start, step) {
  let count = @@start@@;
  return {
    inc: () => (count @@+=@@ step),
    dec: () => (count @@-=@@ step),
    value: () => @@count@@,
  };
}`,
    harness: `function runCounter(make, start, step, ops) {
  const c = { a: make(start, step), b: make(0, 1) };
  return ops.map(function (op) {
    const parts = op.split('.');
    return c[parts[0]][parts[1]]();
  });
}`,
    adapter: 'runCounter',
    tests: [
      { args: [10, 5, ['a.inc', 'a.inc', 'a.value']], expected: [15, 20, 20], name: 'increments by step' },
      { args: [10, 5, ['a.dec', 'a.value']], expected: [5, 5], name: 'decrements' },
      { args: [0, 2, ['a.inc', 'b.inc', 'a.inc', 'b.value']], expected: [2, 1, 4, 1], name: 'counters are independent' },
      { args: [3, 1, ['a.value']], expected: [3], name: 'starts at start' },
    ],
  },
  debug: {
    language: 'javascript',
    fnName: 'makeGetters',
    statement: '`makeGetters(items)` should return one function per item; calling the k-th function must return `items[k]`. Right now they all return the same wrong thing.',
    buggy: `function makeGetters(items) {
  var getters = [];
  for (var i = 0; i < items.length; i++) {
    getters.push(function () {
      return items[i];
    });
  }
  return getters;
}`,
    fixed: `function makeGetters(items) {
  var getters = [];
  for (let i = 0; i < items.length; i++) {
    getters.push(function () {
      return items[i];
    });
  }
  return getters;
}`,
    harness: `function callAll(fn, items) {
  return fn(items).map(function (g) { return g(); });
}`,
    adapter: 'callAll',
    tests: [
      { args: [['a', 'b', 'c']], expected: ['a', 'b', 'c'] },
      { args: [[10, 20]], expected: [10, 20] },
      { args: [['only']], expected: ['only'] },
      { args: [[]], expected: [] },
    ],
    bugType: 'stale closure over a shared var',
    hint: 'When the getters finally run, what is the value of `i`, and how many `i` variables exist?',
    explanation: 'Every getter closes over the same function-scoped `var i`. After the loop it equals items.length, so each getter reads items[items.length] (undefined). Declaring the index with `let` gives each iteration its own binding.',
  },
  boss: {
    title: 'Memoize',
    language: 'javascript',
    fnName: 'memoize',
    statement: 'Implement `memoize(fn)`: return a function that caches results by its arguments and calls `fn` only once per distinct argument list. Each memoized function needs its own private cache.',
    starter: `function memoize(fn) {
  // your code here
}
`,
    solution: `function memoize(fn) {
  const cache = new Map();
  return function (...args) {
    const key = JSON.stringify(args);
    if (!cache.has(key)) cache.set(key, fn(...args));
    return cache.get(key);
  };
}`,
    harness: `function runMemo(memoize, argsList) {
  let calls = 0;
  const slow = function (a, b) { calls++; return a * 10 + b; };
  const neg = function (a, b) { calls++; return -(a * 10 + b); };
  const f = memoize(slow);
  const g = memoize(neg);
  const results = argsList.map(function (args) { return [f.apply(null, args), g.apply(null, args)]; });
  return { results: results, calls: calls };
}`,
    adapter: 'runMemo',
    tests: [
      { args: [[[1, 2], [1, 2], [2, 1], [1, 2]]], expected: { results: [[12, -12], [12, -12], [21, -21], [12, -12]], calls: 4 }, name: 'repeat calls hit the cache' },
      { args: [[[3, 3]]], expected: { results: [[33, -33]], calls: 2 }, name: 'single call' },
      { args: [[[0, 0], [0, 0]]], expected: { results: [[0, -0], [0, -0]], calls: 2 }, name: 'falsy results are cached too' },
      { args: [[[1, 2], [2, 1]]], expected: { results: [[12, -12], [21, -21]], calls: 4 }, name: 'different args, different keys' },
      { args: [[]], expected: { results: [], calls: 0 }, name: 'no calls' },
    ],
    hints: ['The cache must live in the scope of memoize, so each memoized function gets its own. The returned function reads and writes it.', 'Build a key from all arguments (JSON.stringify(args)), check `cache.has(key)` rather than truthiness, and only call fn on a miss.'],
    combines: ['js-closures'],
  },
};

export default unit;
