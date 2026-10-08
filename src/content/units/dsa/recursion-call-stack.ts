import { Recorder } from '@/engine/recorder';
import type { VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { CallTree, callTreePanel, stackPanel, type NodeView } from '@/content/lib/recursion-greedy';

const code = `
def fib(n):
    if n < 2:                    #@base
        return n                 #@ret_base
    left = fib(n - 1)            #@left
    right = fib(n - 2)           #@right
    return left + right          #@ret
`;

interface In {
  n: number;
}

function fibRef(n: number): number {
  let a = 0;
  let b = 1;
  for (let i = 0; i < n; i++) [a, b] = [b, a + b];
  return a;
}

const viz: VizDef<In> = {
  id: 'recursion-call-stack',
  title: 'Recursion: call tree & call stack',
  code,
  language: 'python',
  inputs: [{ key: 'n', label: 'n (fib(n))', kind: 'number', default: 5, help: 'Integer from 0 to 6 — the tree explodes quickly' }],
  presets: [
    { label: 'fib(1) base case', input: { n: 1 } },
    { label: 'fib(3)', input: { n: 3 } },
    { label: 'fib(6) explosion', input: { n: 6 } },
  ],
  run({ n }) {
    if (!Number.isInteger(n) || n < 0 || n > 6) throw new Error('Choose an integer n between 0 and 6 (the call tree grows too large after that)');
    const tree = new CallTree();
    let result = 0;

    // Run the real recursion twice: a dry run to learn the tree shape (stable layout), then the recording run.
    const exec = (r: Recorder | null) => {
      if (r) tree.replay();
      const view: Record<string, NodeView> = {};
      const stack: string[] = [];
      let calls = 0;
      const emit = (at: string, caption: string, vars: Record<string, unknown>) => {
        if (r) r.step(at, caption, [callTreePanel(tree, view, { title: 'Call tree' }), stackPanel(stack)], { ...vars, depth: stack.length, calls });
      };
      const fib = (k: number, parent?: string): number => {
        const id = tree.add(`fib(${k})`, parent);
        calls++;
        r?.op();
        if (parent) view[parent] = { tone: 'frontier', badge: 'waiting' };
        view[id] = { tone: 'active' };
        stack.push(`fib(${k})`);
        emit('base', `Call fib(${k}) → push a frame (stack depth ${stack.length})`, { n: k });
        if (k < 2) {
          stack.pop();
          view[id] = { tone: 'done', badge: `=${k}` };
          emit('ret_base', `fib(${k}) is a base case: returns ${k} → pop`, { n: k, returned: k });
          return k;
        }
        const left = fib(k - 1, id);
        view[id] = { tone: 'active' };
        emit('left', `fib(${k - 1}) returned ${left} → left = ${left}; next: fib(${k - 2})`, { n: k, left });
        const right = fib(k - 2, id);
        view[id] = { tone: 'active' };
        emit('right', `fib(${k - 2}) returned ${right} → right = ${right}`, { n: k, left, right });
        stack.pop();
        view[id] = { tone: 'done', badge: `=${left + right}` };
        emit('ret', `fib(${k}) = ${left} + ${right} = ${left + right} → pop`, { n: k, left, right, returned: left + right });
        return left + right;
      };
      result = fib(n);
      emit('ret', `Stack is empty: fib(${n}) = ${result}, computed with ${calls} calls`, { n, returned: result });
    };
    exec(null);
    const r = new Recorder(code);
    exec(r);
    return { frames: r.frames, result };
  },
  reference({ n }) {
    return fibRef(n);
  },
};

const tests = [
  { args: [0], expected: 0, name: 'fib(0)' },
  { args: [1], expected: 1, name: 'fib(1)' },
  { args: [2], expected: 1 },
  { args: [5], expected: 5 },
  { args: [10], expected: 55 },
  { args: [15], expected: 610 },
];

const unit: Unit = {
  id: 'recursion-call-stack',
  hook: 'Recursion questions are really "can you trace what the computer does?" questions. Seeing the call tree and the call stack side by side makes base cases, stack overflows and wasted work obvious.',
  predict: {
    prompt: 'The naive `fib(n) = fib(n-1) + fib(n-2)` has base cases fib(0) = 0 and fib(1) = 1. How many function calls does `fib(5)` make in total, counting the first one?',
    options: ['5', '9', '15', '25'],
    answer: 2,
    explain: 'Calls follow calls(n) = 1 + calls(n-1) + calls(n-2) with calls(0) = calls(1) = 1: 1, 1, 3, 5, 9, 15. fib(3) alone is computed twice, fib(2) three times.',
  },
  viz,
  deeper: {
    points: [
      'Every call gets its own stack frame holding its own n, left and right. Frames are pushed on call and popped on return, so the last call made is the first to finish (LIFO).',
      'The call tree is the shape of all calls; the call stack is just the path from the root to the call running right now. Stack height is the tree depth, not the number of nodes.',
      'A base case must (1) stop without recursing and (2) be reachable: every recursive call has to make the input smaller. fib needs two base cases because n - 2 skips a level.',
      'Look at the tree: fib(3) and fib(2) appear many times. The same sub-problem is solved again and again, which is why this version is exponential and why memoization (next unit) exists.',
    ],
    complexity: { time: 'O(2^n) — each call spawns two more', space: 'O(n) — only the stack depth, not the tree size' },
    pitfalls: ['Missing or unreachable base case → RecursionError / stack overflow', 'Thinking space is the number of calls (it is the maximum depth)', 'Python stops at about 1000 frames, so deep recursion on a long list needs a loop or an explicit stack'],
  },
  practice: {
    language: 'python',
    fnName: 'fib',
    statement: 'Return the n-th Fibonacci number recursively, with fib(0) = 0 and fib(1) = 1.',
    signature: 'def fib(n):',
    solution: `def fib(n):
    if @@n < 2@@:
        return @@n@@
    left = @@fib(n - 1)@@
    right = @@fib(n - 2)@@
    return @@left + right@@`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'fib',
    statement: 'fib(0) works but fib(1) crashes with a RecursionError. Find and fix the bug.',
    buggy: `def fib(n):
    if n == 0:
        return 0
    return fib(n - 1) + fib(n - 2)`,
    fixed: `def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)`,
    tests,
    bugType: 'missing base case',
    hint: 'Trace fib(1) by hand: which two calls does it make, and does either of them hit the base case?',
    explanation: 'fib(1) calls fib(0) (fine) and fib(-1), which calls fib(-2), and so on forever because n never reaches 0 from below. fib(n - 2) can skip over 0, so n == 1 needs its own base case. `n < 2` covers both.',
  },
  boss: {
    title: 'Fast power',
    statement: 'Implement `fast_pow(x, n)` returning x raised to the integer power n (n may be negative or zero). It must use recursion depth O(log n): x^n is (x^(n/2))^2, times x when n is odd.',
    language: 'python',
    fnName: 'fast_pow',
    compare: 'float',
    starter: `def fast_pow(x, n):
    # your code here
    pass
`,
    solution: `def fast_pow(x, n):
    if n < 0:
        return 1 / fast_pow(x, -n)
    if n == 0:
        return 1
    half = fast_pow(x, n // 2)
    if n % 2 == 0:
        return half * half
    return half * half * x`,
    tests: [
      { args: [2, 10], expected: 1024 },
      { args: [3, 5], expected: 243, name: 'odd exponent' },
      { args: [2, -2], expected: 0.25, name: 'negative exponent' },
      { args: [5, 0], expected: 1, name: 'zero exponent' },
      { args: [-2, 3], expected: -8, name: 'negative base' },
      { args: [1, 100000], expected: 1, name: 'deep n (needs O(log n) depth)' },
    ],
    hints: ['Halve the problem: x^n = (x^(n // 2)) * (x^(n // 2)), with one extra factor of x when n is odd. Compute the half only once.', 'Base case n == 0 returns 1. For n < 0 return 1 / fast_pow(x, -n). Store `half = fast_pow(x, n // 2)` so you do not recurse twice.'],
    combines: ['recursion-call-stack'],
  },
  quiz: [
    {
      prompt: 'In the naive recursive `fib(5)`, what is the maximum number of frames on the call stack at any one moment?',
      options: ['5', '8', '15', '3'],
      answer: 0,
      explain: 'The deepest chain is fib(5) → fib(4) → fib(3) → fib(2) → fib(1): five frames. Stack space is the depth of the tree, O(n), even though there are 15 calls overall.',
    },
  ],
};

export default unit;
