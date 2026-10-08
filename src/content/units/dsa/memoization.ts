import { Recorder } from '@/engine/recorder';
import type { KVPanel, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { CallTree, callTreePanel, type NodeView } from '@/content/lib/recursion-greedy';

const code = `
def fib(n, memo=None):
    if memo is None:                       #@init
        memo = {}
    if n < 2:                              #@base
        return n                           #@ret_base
    if n in memo:                          #@check
        return memo[n]                     #@hit
    memo[n] = fib(n - 1, memo) + fib(n - 2, memo)   #@compute
    return memo[n]
`;

interface In {
  n: number;
}

/** Number of calls the naive (cache-free) recursion would make, counted independently of the viz. */
function naiveCalls(n: number): number {
  const c = [1, 1];
  for (let k = 2; k <= n; k++) c[k] = 1 + c[k - 1] + c[k - 2];
  return c[n];
}

const viz: VizDef<In> = {
  id: 'memoization',
  title: 'Memoization (cache hits)',
  code,
  language: 'python',
  inputs: [{ key: 'n', label: 'n (fib(n))', kind: 'number', default: 6, help: 'Integer from 0 to 9' }],
  presets: [
    { label: 'fib(2) tiny', input: { n: 2 } },
    { label: 'fib(5)', input: { n: 5 } },
    { label: 'fib(8) big win', input: { n: 8 } },
    { label: 'fib(1) base', input: { n: 1 } },
  ],
  run({ n }) {
    if (!Number.isInteger(n) || n < 0 || n > 9) throw new Error('Choose an integer n between 0 and 9');
    const tree = new CallTree();
    let result = 0;
    const naive = naiveCalls(n);

    const exec = (r: Recorder | null) => {
      if (r) tree.replay();
      const view: Record<string, NodeView> = {};
      const memo = new Map<number, number>();
      const memoTone = new Map<number, 'new' | 'found'>();
      let calls = 0;
      let hits = 0;
      const memoPanel = (): KVPanel => ({
        type: 'kv',
        title: 'memo = {n: fib(n)}',
        entries: [...memo.entries()].map(([k, v]) => ({ k: String(k), v, tone: memoTone.get(k) })),
      });
      const emit = (at: string, caption: string, vars: Record<string, unknown>) => {
        if (r) r.step(at, caption, [callTreePanel(tree, view, { title: 'Call tree' }), memoPanel()], { ...vars, calls, hits, 'naive calls': naive, 'memo size': memo.size });
      };
      const fib = (k: number, parent?: string): number => {
        const id = tree.add(`fib(${k})`, parent);
        calls++;
        r?.op();
        memoTone.clear();
        if (parent) view[parent] = { tone: 'frontier', badge: 'waiting' };
        view[id] = { tone: 'active' };
        if (parent === undefined) emit('init', `Call fib(${k}) with no memo → create memo = {} once, shared by every call`, { n: k });
        else emit('base', `Call fib(${k}) → push a frame`, { n: k });
        if (k < 2) {
          view[id] = { tone: 'done', badge: `=${k}` };
          emit('ret_base', `fib(${k}) is a base case: returns ${k}`, { n: k, returned: k });
          return k;
        }
        if (memo.has(k)) {
          hits++;
          memoTone.set(k, 'found');
          view[id] = { tone: 'found', badge: 'cache hit' };
          emit('hit', `${k} is in memo → return ${memo.get(k)} instantly, no recursion`, { n: k, returned: memo.get(k) });
          return memo.get(k)!;
        }
        emit('check', `${k} is not in memo yet → compute fib(${k - 1}) + fib(${k - 2})`, { n: k });
        const a = fib(k - 1, id);
        view[id] = { tone: 'active' };
        const b = fib(k - 2, id);
        memo.set(k, a + b);
        memoTone.clear();
        memoTone.set(k, 'new');
        view[id] = { tone: 'done', badge: `=${a + b}` };
        emit('compute', `memo[${k}] = ${a} + ${b} = ${a + b} → stored, return`, { n: k, returned: a + b });
        return a + b;
      };
      result = fib(n);
      memoTone.clear();
      emit(n < 2 ? 'ret_base' : 'compute', `fib(${n}) = ${result}: ${calls} calls with memo vs ${naive} without`, { n, returned: result });
    };
    exec(null);
    const r = new Recorder(code);
    exec(r);
    return { frames: r.frames, result };
  },
  reference({ n }) {
    let a = 0;
    let b = 1;
    for (let i = 0; i < n; i++) [a, b] = [b, a + b];
    return a;
  },
};

const tests = [
  { args: [0], expected: 0 },
  { args: [1], expected: 1 },
  { args: [10], expected: 55 },
  { args: [30], expected: 832040 },
  { args: [50], expected: 12586269025, name: 'fib(50) (too slow without a cache)' },
  { args: [70], expected: 190392490709135, name: 'fib(70)' },
];

const unit: Unit = {
  id: 'memoization',
  hook: 'Memoization is the one-line upgrade that turns exponential recursion into linear time. It is the bridge from "I can write recursion" to "I can do dynamic programming", and interviewers probe it constantly.',
  predict: {
    prompt: 'Naive `fib(6)` makes 25 calls. If we add a `memo` dict (check it before recursing, store each result), how many calls does `fib(6)` make now?',
    options: ['25', '18', '11', '6'],
    answer: 2,
    explain: 'The first path fib(6) → 5 → 4 → 3 → 2 → 1/0 computes everything once. After that, each right-hand sibling is a cache hit (fib(2), fib(3), fib(4)) or a trivial base case. Total: 11 calls, about 2n - 1.',
  },
  viz,
  deeper: {
    points: [
      'Memoization = recursion + a cache keyed by the arguments. Same code shape, but each distinct sub-problem is solved once; repeats return in O(1).',
      'In the tree, only the left spine does real work. Every right child is either a base case or a cache hit, so the exponential tree collapses to a line of about 2n calls.',
      'The cache key must contain every argument that changes the answer. Missing one gives wrong results; tuples work as dict keys for several arguments.',
      'This is top-down dynamic programming. Bottom-up (a loop filling a table) does the same work without recursion, so it avoids the stack limit.',
    ],
    complexity: { time: 'O(n) — n distinct sub-problems, O(1) each', space: 'O(n) — memo dict plus recursion depth' },
    pitfalls: ['Mutable default `memo={}` is shared by every call and leaks old answers into new ones — use `memo=None`', 'Cache key missing a parameter that affects the result', 'Checking the cache after recursing instead of before'],
  },
  practice: {
    language: 'python',
    fnName: 'fib',
    statement: 'Return the n-th Fibonacci number (fib(0) = 0, fib(1) = 1) using recursion with a memo dict, so fib(70) is instant.',
    signature: 'def fib(n, memo=None):',
    solution: `def fib(n, memo=None):
    if memo is None:
        memo = {}
    if n < 2:
        return n
    if @@n in memo@@:
        return @@memo[n]@@
    memo[n] = @@fib(n - 1, memo) + fib(n - 2, memo)@@
    return memo[n]`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'count_ways',
    statement: 'count_ways(n, steps) counts the ordered ways to climb n stairs taking jumps from `steps`. The first call is right, but later calls with other steps return stale answers. Fix it.',
    buggy: `def count_ways(n, steps, memo={}):
    if n == 0:
        return 1
    if n < 0:
        return 0
    if n in memo:
        return memo[n]
    memo[n] = sum(count_ways(n - s, steps, memo) for s in steps)
    return memo[n]`,
    fixed: `def count_ways(n, steps, memo=None):
    if memo is None:
        memo = {}
    if n == 0:
        return 1
    if n < 0:
        return 0
    if n in memo:
        return memo[n]
    memo[n] = sum(count_ways(n - s, steps, memo) for s in steps)
    return memo[n]`,
    tests: [
      { args: [4, [1, 2]], expected: 5 },
      { args: [4, [1, 2, 3]], expected: 7, name: 'same n, different steps' },
      { args: [6, [1, 2, 3]], expected: 24 },
      { args: [3, [2]], expected: 0, name: 'unreachable' },
      { args: [0, [1]], expected: 1, name: 'zero stairs' },
    ],
    bugType: 'mutable default argument',
    hint: 'Call the function twice in a row with the same n but different steps. Where does the second call get the first call\'s numbers from?',
    explanation: 'A default value like `memo={}` is created once, when `def` runs, and shared by every call. The answers cached for steps [1, 2] were reused for [1, 2, 3]. Use `memo=None` and create a fresh dict inside the function.',
  },
  boss: {
    title: 'Decode ways',
    statement: 'A message of letters was encoded as digits using A=1, B=2, ..., Z=26. Given a digit string `s`, return how many different letter messages it could decode to. "0" cannot stand alone, and a two-digit chunk must be between 10 and 26. Use memoized recursion on the start index.',
    language: 'python',
    fnName: 'num_decodings',
    starter: `def num_decodings(s):
    # your code here
    pass
`,
    solution: `def num_decodings(s):
    memo = {}

    def go(i):
        if i == len(s):
            return 1
        if s[i] == '0':
            return 0
        if i in memo:
            return memo[i]
        total = go(i + 1)
        if i + 1 < len(s) and int(s[i:i + 2]) <= 26:
            total += go(i + 2)
        memo[i] = total
        return total

    return go(0)`,
    tests: [
      { args: ['12'], expected: 2 },
      { args: ['226'], expected: 3 },
      { args: ['06'], expected: 0, name: 'leading zero' },
      { args: ['10'], expected: 1, name: 'zero must pair' },
      { args: ['11106'], expected: 2 },
      { args: ['27'], expected: 1, name: 'above 26' },
      { args: ['1111111111'], expected: 89, name: 'many overlaps' },
    ],
    hints: ['Let go(i) be the number of ways to decode s[i:]. At each i you may take one digit (if it is not "0") or two digits (if they form 10..26).', 'Base case: i == len(s) → 1 way. If s[i] == "0" → 0. Cache go(i) in a dict keyed by i so each suffix is solved once.'],
    combines: ['recursion-call-stack', 'memoization'],
  },
  quiz: [
    {
      prompt: 'Which statement about `memo[n]` in top-down fib is true?',
      options: ['It must be checked after the recursive calls', 'It must be checked before recursing and written after computing', 'It removes the need for a base case', 'It makes the recursion depth O(1)'],
      answer: 1,
      explain: 'Look up first (cache hit returns immediately), compute on a miss, then store. Base cases are still needed and depth is still O(n).',
    },
  ],
};

export default unit;
