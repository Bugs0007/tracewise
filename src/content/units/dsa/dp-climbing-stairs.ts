import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { arrowsTo, assertInt, dpRow, type DpCell } from '@/content/lib/dp';

const code = `
def climb_stairs(n):
    dp = [0] * (n + 1)                 #@init
    dp[0] = 1                          #@base0
    if n >= 1:
        dp[1] = 1                      #@base1
    for i in range(2, n + 1):          #@loop
        dp[i] = dp[i - 1] + dp[i - 2]  #@fill
    return dp[n]                       #@done
`;

interface In {
  n: number;
}

const viz: VizDef<In> = {
  id: 'dp-climbing-stairs',
  title: 'Climbing stairs (1D DP)',
  code,
  language: 'python',
  inputs: [{ key: 'n', label: 'Stairs (n)', kind: 'number', default: 7, help: 'Whole number from 0 to 12' }],
  presets: [
    { label: 'n = 5', input: { n: 5 } },
    { label: 'n = 1', input: { n: 1 } },
    { label: 'n = 0', input: { n: 0 } },
    { label: 'n = 10', input: { n: 10 } },
  ],
  run({ n }) {
    assertInt('n', n, 0, 12);
    const r = new Recorder(code);
    const dp: number[] = Array(n + 1).fill(0);
    const filled = new Set<number>();
    const view = (cur?: number, deps: number[] = [], extra: Record<number, Tone> = {}) => {
      const tones: Record<number, Tone> = {};
      for (const i of filled) tones[i] = 'done';
      for (const d of deps) tones[d] = 'compare';
      if (cur !== undefined) tones[cur] = 'active';
      Object.assign(tones, extra);
      const arrows = cur === undefined ? [] : arrowsTo([0, cur], deps.map((d) => [0, d] as [number, number]));
      return dpRow(dp as DpCell[], { title: 'ways[i] = number of ways to reach step i', tones: tones as Record<string, Tone>, arrows, rowLabels: ['ways'] });
    };
    r.step('init', `Make a table with ${n + 1} cells, one per step 0..${n}`, [view()], { n });
    dp[0] = 1;
    filled.add(0);
    r.op();
    r.step('base0', 'ways(0) = 1: standing on the ground is one way (do nothing)', [view(0)], { n });
    if (n >= 1) {
      dp[1] = 1;
      filled.add(1);
      r.op();
      r.step('base1', 'ways(1) = 1: only a single step reaches stair 1', [view(1)], { n });
    }
    for (let i = 2; i <= n; i++) {
      dp[i] = dp[i - 1] + dp[i - 2];
      r.op();
      r.step('fill', `ways(${i}) = ways(${i - 1}) + ways(${i - 2}) = ${dp[i - 1]} + ${dp[i - 2]} = ${dp[i]}`, [view(i, [i - 1, i - 2])], { n, i, 'dp[i-1]': dp[i - 1], 'dp[i-2]': dp[i - 2] });
      filled.add(i);
    }
    r.step('done', `Answer: dp[${n}] = ${dp[n]} distinct ways`, [view(n, [], { [n]: 'found' })], { n, result: dp[n] });
    return { frames: r.frames, result: dp[n] };
  },
  reference({ n }) {
    let a = 1;
    let b = 1;
    for (let i = 0; i < n; i++) [a, b] = [b, a + b];
    return a;
  },
};

const tests = [
  { args: [1], expected: 1 },
  { args: [2], expected: 2 },
  { args: [3], expected: 3 },
  { args: [5], expected: 8 },
  { args: [0], expected: 1, name: 'zero stairs' },
  { args: [10], expected: 89, name: 'larger n' },
];

const unit: Unit = {
  id: 'dp-climbing-stairs',
  hook: 'The friendliest dynamic-programming question: it is Fibonacci in disguise. Interviewers use it to see whether you can name the state, write the recurrence and set the base cases without being told.',
  predict: {
    prompt: 'You climb a staircase taking 1 or 2 steps at a time. In how many distinct orders can you climb exactly **5** stairs?',
    options: ['5', '8', '10', '13'],
    answer: 1,
    explain: 'The last move was a 1-step from stair 4 or a 2-step from stair 3, so ways(5) = ways(4) + ways(3). Counting up: 1, 1, 2, 3, 5, 8. Not 5 or 10: the number of orders explodes faster than n.',
  },
  viz,
  deeper: {
    points: [
      'State: `dp[i]` = number of ways to stand on step i. Say that sentence out loud before writing code.',
      'Recurrence: your last move was a 1-step from i-1 or a 2-step from i-2, so `dp[i] = dp[i-1] + dp[i-2]`.',
      'Base cases: `dp[0] = 1` (one way to do nothing) and `dp[1] = 1`. Setting `dp[0] = 0` breaks every later cell.',
      'Order: each cell needs only the two cells to its left, so a left-to-right loop works.',
      'Space: only the last two values matter, so two variables replace the table (O(1) memory).',
    ],
    complexity: { time: 'O(n)', space: 'O(n), or O(1) with two rolling variables' },
    pitfalls: ['Table of size n instead of n+1 (no cell for step n)', 'dp[0] = 0, so everything stays 0', 'Writing dp[1] when n == 0 (index out of range)'],
  },
  practice: {
    language: 'python',
    fnName: 'climb_stairs',
    statement: 'You can climb 1 or 2 stairs at a time. Return the number of distinct ways to reach the top of a staircase with `n` stairs.',
    signature: 'def climb_stairs(n):',
    solution: `def climb_stairs(n):
    dp = [0] * @@(n + 1)@@
    dp[0] = @@1@@
    if n >= 1:
        dp[1] = @@1@@
    for i in range(2, @@n + 1@@):
        dp[i] = @@dp[i - 1] + dp[i - 2]@@
    return @@dp[n]@@`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'climb_stairs',
    statement: 'This returns 0 for every n >= 2. Find the bug.',
    buggy: `def climb_stairs(n):
    dp = [0] * (n + 1)
    dp[0] = 0
    if n >= 1:
        dp[1] = 1
    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]
    return dp[n]`,
    fixed: `def climb_stairs(n):
    dp = [0] * (n + 1)
    dp[0] = 1
    if n >= 1:
        dp[1] = 1
    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]
    return dp[n]`,
    tests,
    bugType: 'wrong base case',
    hint: 'Compute dp[2] by hand: it should be 2 (1+1 and 2). Which base value makes that come out?',
    explanation: 'dp[2] = dp[1] + dp[0]. Reaching stair 2 with one 2-step is a valid way, so dp[0] must be 1: there is exactly one way to be on the ground (take no steps). With dp[0] = 0 that way is lost and the counts are one Fibonacci step too small.',
  },
  boss: {
    title: 'Decode Ways',
    statement: 'A message of digits is decoded with A=1, B=2, ..., Z=26. Given a digit string `s`, return how many different ways it can be decoded. A leading "0" cannot be decoded on its own ("06" is invalid), but "10" and "20" decode as J and T. Return 0 if no decoding exists.',
    language: 'python',
    fnName: 'num_decodings',
    starter: `def num_decodings(s):
    # your code here
    pass
`,
    solution: `def num_decodings(s):
    n = len(s)
    if n == 0:
        return 0
    dp = [0] * (n + 1)
    dp[0] = 1
    dp[1] = 0 if s[0] == '0' else 1
    for i in range(2, n + 1):
        if s[i - 1] != '0':
            dp[i] += dp[i - 1]
        if 10 <= int(s[i - 2:i]) <= 26:
            dp[i] += dp[i - 2]
    return dp[n]`,
    tests: [
      { args: ['12'], expected: 2 },
      { args: ['226'], expected: 3 },
      { args: ['06'], expected: 0, name: 'leading zero' },
      { args: ['10'], expected: 1, name: 'only "10" works' },
      { args: ['2101'], expected: 1, name: 'zeros force pairs' },
      { args: ['11106'], expected: 2 },
    ],
    hints: ['Same shape as climbing stairs: dp[i] counts decodings of the first i characters, and the last piece is 1 or 2 characters long.', 'Add dp[i-1] only if the last digit is not "0"; add dp[i-2] only if the last two digits form a number from 10 to 26.'],
    combines: ['dp-climbing-stairs'],
  },
  quiz: [
    {
      prompt: 'Why is dp[0] = 1 and not 0?',
      options: ['Python lists start at 1', 'There is exactly one way to be at the start: take no steps', 'Zero would make the table too small', 'It is only a convention for even n'],
      answer: 1,
      explain: 'Counting problems need a multiplicative-style identity: the empty plan counts as one way, which lets dp[2] = dp[1] + dp[0] include the single 2-step.',
    },
  ],
};

export default unit;
