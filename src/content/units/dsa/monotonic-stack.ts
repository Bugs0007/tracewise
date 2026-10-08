import { Recorder } from '@/engine/recorder';
import type { ListItem, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { requireInts } from '@/content/lib/lists-stacks';

const code = `
def daily_temperatures(temps):
    ans = [0] * len(temps)                  #@init
    stack = []                              #@stack
    for i, t in enumerate(temps):           #@loop
        while stack and temps[stack[-1]] < t:   #@while
            j = stack.pop()                 #@pop
            ans[j] = i - j                  #@set
        stack.append(i)                     #@push
    return ans                              #@done
`;

interface In {
  temps: number[];
}

const viz: VizDef<In> = {
  id: 'monotonic-stack',
  title: 'Monotonic stack: days until a warmer day',
  code,
  language: 'python',
  inputs: [{ key: 'temps', label: 'Daily temperatures', kind: 'numbers', default: [73, 74, 75, 71, 69, 72, 76, 73], maxItems: 10 }],
  presets: [
    { label: 'Only getting colder', input: { temps: [50, 40, 30, 20] } },
    { label: 'Only getting warmer', input: { temps: [10, 20, 30, 40] } },
    { label: 'Equal days', input: { temps: [3, 3, 3] } },
    { label: 'One day', input: { temps: [5] } },
  ],
  run({ temps }) {
    requireInts(temps, 'Temperatures');
    const n = temps.length;
    const r = new Recorder(code);
    const ans: number[] = Array(n).fill(0);
    const stack: number[] = [];
    const answered = new Set<number>();

    const panels = (i: number, tones: Record<number, Tone> = {}, ansTones: Record<number, Tone> = {}): Panel[] => {
      const t: Record<number, Tone> = {};
      for (const k of stack) t[k] = 'frontier';
      for (const k of answered) t[k] = 'done';
      if (i >= 0 && i < n) t[i] = 'active';
      Object.assign(t, tones);
      const items: ListItem[] = stack.map((k) => ({ id: `i${k}`, label: String(temps[k]), sub: `day ${k}`, tone: tones[k] ?? 'frontier' }));
      const at: Record<number, Tone> = {};
      for (const k of answered) at[k] = 'done';
      Object.assign(at, ansTones);
      return [
        { type: 'array', title: 'Temperatures', values: temps, tones: t, pointers: i >= 0 && i < n ? { i } : undefined },
        { type: 'list', title: 'Stack of days still waiting (temperatures only fall toward the top)', items, orientation: 'vertical', endLabel: 'top', emptyText: 'empty' },
        { type: 'array', title: 'ans: days to wait', values: ans, tones: at },
      ];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ stack: `[${stack.join(', ')}]`, ...extra });

    r.step('init', 'ans starts as all zeros: "no warmer day found yet"', panels(-1), vars());
    r.step('stack', 'The stack will hold the indices of days still waiting for a warmer day', panels(-1), vars());
    for (let i = 0; i < n; i++) {
      const t = temps[i];
      r.op();
      r.step('loop', `Day ${i} is ${t} degrees`, panels(i), vars({ i, t }));
      while (stack.length && temps[stack[stack.length - 1]] < t) {
        const top = stack[stack.length - 1];
        r.op();
        const j = stack.pop() as number;
        r.step('pop', `${t} > ${temps[j]}: day ${j} has found its warmer day, pop it`, panels(i, { [j]: 'swap' }), vars({ i, t, j }));
        ans[j] = i - j;
        answered.add(j);
        r.step('set', `ans[${j}] = ${i} - ${j} = ${i - j}`, panels(i, { [top]: 'done' }, { [j]: 'new' }), vars({ i, t, j }));
      }
      r.op();
      r.step('while', stack.length ? `Top is ${temps[stack[stack.length - 1]]}, not below ${t}: stop popping` : 'The stack is empty: nobody is waiting', panels(i), vars({ i, t }));
      stack.push(i);
      r.step('push', `Push day ${i}: it now waits for something warmer than ${t}`, panels(i, { [i]: 'new' }), vars({ i, t }));
    }
    r.step('done', stack.length ? `Days still on the stack never saw a warmer day, so their ans stays 0` : 'Every day found a warmer day', panels(-1), vars());
    return { frames: r.frames, result: ans };
  },
  reference({ temps }) {
    // brute force: scan forward for each day
    return temps.map((t, i) => {
      for (let j = i + 1; j < temps.length; j++) if (temps[j] > t) return j - i;
      return 0;
    });
  },
};

const tests = [
  { args: [[73, 74, 75, 71, 69, 72, 76, 73]], expected: [1, 1, 4, 2, 1, 1, 0, 0] },
  { args: [[30, 40, 50, 60]], expected: [1, 1, 1, 0], name: 'increasing' },
  { args: [[30, 60, 90]], expected: [1, 1, 0] },
  { args: [[5]], expected: [0], name: 'single day' },
  { args: [[]], expected: [], name: 'empty' },
  { args: [[3, 3, 3]], expected: [0, 0, 0], name: 'equal temperatures are not warmer' },
  { args: [[5, 4, 3]], expected: [0, 0, 0], name: 'decreasing' },
];

const unit: Unit = {
  id: 'monotonic-stack',
  hook: 'A monotonic stack answers "next greater element" style questions in O(n) instead of O(n²). Recognising when to reach for it (histograms, stock spans, trapping water) is a strong interview signal.',
  predict: {
    prompt: 'The solution has a `while` loop inside a `for` loop. What is its total running time?',
    options: ['O(n²), because of the nested loops', 'O(n log n)', 'O(n): every index is pushed once and popped at most once', 'O(n * k) where k is the largest temperature'],
    answer: 2,
    explain: 'The inner loop only pops, and each index can be popped once after being pushed once. Across the whole run there are at most n pops, so the nested loops cost O(n) in total (amortised).',
  },
  viz,
  deeper: {
    points: [
      'Keep a stack of indices whose answers are still unknown. Their temperatures never increase from bottom to top (that is the "monotonic" part).',
      'A new value pops every waiting day that it beats; for each popped day, the answer is the distance `i - j`.',
      'Whatever is left on the stack at the end never found a greater element: its answer stays 0 (or -1 in the next-greater-element variant).',
      'Pick strict `<` or non-strict `<=` deliberately: equal values are not "warmer", so they stay on the stack.',
      'Same template: next greater element, stock span, largest rectangle in a histogram, trapping rain water.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    pitfalls: ['Using `<=` so equal temperatures count as warmer', 'Pushing values instead of indices (you lose the distance)', 'Forgetting that leftover stack entries keep the default answer'],
  },
  practice: {
    language: 'python',
    fnName: 'daily_temperatures',
    statement: 'For each day, return how many days you must wait for a strictly warmer temperature (0 if there is none). Use a stack of indices; the solution must run in O(n).',
    signature: 'def daily_temperatures(temps):',
    solution: `def daily_temperatures(temps):
    ans = [0] * len(temps)
    stack = []
    for i, t in enumerate(temps):
        while stack and temps[@@stack[-1]@@] @@<@@ t:
            j = @@stack.pop()@@
            ans[j] = @@i - j@@
        @@stack.append(i)@@
    return ans`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'daily_temperatures',
    statement: 'Days with equal temperatures wrongly report a wait. Fix the comparison.',
    buggy: `def daily_temperatures(temps):
    ans = [0] * len(temps)
    stack = []
    for i, t in enumerate(temps):
        while stack and temps[stack[-1]] <= t:
            j = stack.pop()
            ans[j] = i - j
        stack.append(i)
    return ans`,
    fixed: `def daily_temperatures(temps):
    ans = [0] * len(temps)
    stack = []
    for i, t in enumerate(temps):
        while stack and temps[stack[-1]] < t:
            j = stack.pop()
            ans[j] = i - j
        stack.append(i)
    return ans`,
    tests,
    bugType: 'wrong comparison',
    hint: 'Is a day with the SAME temperature a warmer day?',
    explanation: 'The question asks for a strictly warmer day. `<=` pops equal temperatures too, so [3, 3, 3] reports waits of 1 and 1 instead of 0. Use `<`.',
  },
  boss: {
    title: 'Largest rectangle in a histogram',
    statement: 'Given the heights of bars of width 1 in a histogram, return the area of the largest rectangle that fits entirely inside it (bars must be contiguous). Aim for O(n) with a monotonic stack.',
    language: 'python',
    fnName: 'largest_rectangle',
    starter: `def largest_rectangle(heights):
    # your code here
    pass
`,
    solution: `def largest_rectangle(heights):
    stack = []
    best = 0
    for i, h in enumerate(heights + [0]):
        start = i
        while stack and stack[-1][1] >= h:
            idx, height = stack.pop()
            best = max(best, height * (i - idx))
            start = idx
        stack.append((start, h))
    return best`,
    tests: [
      { args: [[2, 1, 5, 6, 2, 3]], expected: 10 },
      { args: [[2, 4]], expected: 4 },
      { args: [[1]], expected: 1, name: 'single bar' },
      { args: [[]], expected: 0, name: 'no bars' },
      { args: [[2, 2, 2]], expected: 6, name: 'equal bars' },
      { args: [[6, 2, 5, 4, 5, 1, 6]], expected: 12 },
      { args: [[5, 4, 3, 2, 1]], expected: 9, name: 'descending' },
    ],
    hints: ['A bar can extend left and right until a shorter bar blocks it. Keep a stack of bars with increasing heights; a shorter bar arriving is the right blocker for every taller bar on the stack.', 'When a bar of height h arrives, pop every taller bar: its width runs from where it started to the current index. The new bar can start where the last popped bar started. Append a 0-height bar at the end to flush the stack.'],
    combines: ['monotonic-stack', 'stack-basics'],
  },
};

export default unit;
