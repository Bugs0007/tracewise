import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { assertInt, assertIntList, dpGrid, tk, type Arrow, type DpCell } from '@/content/lib/dp';

const code = `
def knapsack(weights, values, cap):
    n = len(weights)
    dp = [[0] * (cap + 1) for _ in range(n + 1)]       #@init
    for i in range(1, n + 1):                          #@items
        w, v = weights[i - 1], values[i - 1]
        for c in range(cap + 1):                       #@caps
            dp[i][c] = dp[i - 1][c]                    #@skip
            if w <= c:                                 #@fits
                dp[i][c] = max(dp[i][c], dp[i - 1][c - w] + v)   #@take
    chosen = []
    c = cap                                            #@trace
    for i in range(n, 0, -1):                          #@tloop
        if dp[i][c] != dp[i - 1][c]:                   #@tcheck
            chosen.append(i)
            c -= weights[i - 1]                        #@tpick
    return dp[n][cap], chosen[::-1]                    #@done
`;

interface In {
  weights: number[];
  values: number[];
  cap: number;
}

const viz: VizDef<In> = {
  id: 'dp-knapsack',
  title: '0/1 knapsack',
  code,
  language: 'python',
  inputs: [
    { key: 'weights', label: 'Weights', kind: 'numbers', default: [1, 3, 4, 5], maxItems: 5, help: 'Whole numbers 1..8' },
    { key: 'values', label: 'Values (same length)', kind: 'numbers', default: [1, 4, 5, 7], maxItems: 5, help: 'Whole numbers 0..20' },
    { key: 'cap', label: 'Capacity', kind: 'number', default: 7, help: 'Whole number from 0 to 8' },
  ],
  presets: [
    { label: 'Classic', input: { weights: [1, 3, 4, 5], values: [1, 4, 5, 7], cap: 7 } },
    { label: 'Everything too heavy', input: { weights: [5, 6], values: [10, 12], cap: 4 } },
    { label: 'Capacity 0', input: { weights: [2, 3], values: [4, 5], cap: 0 } },
    { label: 'No items', input: { weights: [], values: [], cap: 5 } },
  ],
  run({ weights, values, cap }) {
    assertIntList('Weights', weights, { max: 5, lo: 1, hi: 8 });
    assertIntList('Values', values, { max: 5, lo: 0, hi: 20 });
    assertInt('Capacity', cap, 0, 8);
    if (weights.length !== values.length) throw new Error('Weights and values need the same number of items');
    const r = new Recorder(code);
    const n = weights.length;
    const dp: (number | null)[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: cap + 1 }, () => (i === 0 ? 0 : null)));
    const rowLabels = ['0', ...weights.map((_, i) => String(i + 1))];
    const colLabels = Array.from({ length: cap + 1 }, (_, c) => String(c));
    const T = 'dp[i][c] = best value using items 1..i with capacity c';
    const base = (): Record<string, Tone> => {
      const t: Record<string, Tone> = {};
      for (let c = 0; c <= cap; c++) t[tk(0, c)] = 'muted';
      return t;
    };
    const table = (tones: Record<string, Tone>, arrows: Arrow[] = [], title = T) => dpGrid(dp as DpCell[][], { title, tones, arrows, rowLabels, colLabels });
    const items = (cur?: number, taken: number[] = []) => {
      const tones: Record<number, Tone> = {};
      taken.forEach((i) => (tones[i - 1] = 'found'));
      if (cur !== undefined) tones[cur - 1] = 'active';
      return { type: 'array' as const, title: 'Items as weight/value (item 1, 2, ...)', values: weights.map((w, i) => `${w}/${values[i]}`), tones, hideIndex: true };
    };
    const filled = (upTo: number, upToC: number): Record<string, Tone> => {
      const t = base();
      for (let i = 1; i <= n; i++) for (let c = 0; c <= cap; c++) if (dp[i][c] !== null && (i < upTo || (i === upTo && c <= upToC))) t[tk(i, c)] = 'default';
      return t;
    };
    r.step('init', `Row 0 = no items yet, so every capacity is worth 0. Rows 1..${n} are filled item by item`, [table(base()), items()], { n, cap });
    for (let i = 1; i <= n; i++) {
      const w = weights[i - 1];
      const v = values[i - 1];
      for (let c = 0; c <= cap; c++) {
        r.op();
        const tones = filled(i, c - 1);
        tones[tk(i, c)] = 'active';
        tones[tk(i - 1, c)] = 'compare';
        const skip = dp[i - 1][c]!;
        if (w > c) {
          dp[i][c] = skip;
          r.step('fits', `Item ${i} (w=${w}) > capacity ${c}: can't take → dp[${i}][${c}] = ${skip}`, [table(tones, [{ from: [i - 1, c], to: [i, c] }]), items(i)], { i, c, w, v });
          continue;
        }
        const take = dp[i - 1][c - w]! + v;
        tones[tk(i - 1, c - w)] = 'compare';
        dp[i][c] = Math.max(skip, take);
        const takeWins = take > skip;
        r.step('take', `Item ${i}: skip = ${skip}, take = dp[${i - 1}][${c - w}] + ${v} = ${take} → ${takeWins ? 'take' : 'skip'} (${dp[i][c]})`, [table(tones, [{ from: [i - 1, c], to: [i, c], tone: takeWins ? 'muted' : 'found' }, { from: [i - 1, c - w], to: [i, c], tone: takeWins ? 'found' : 'muted' }]), items(i)], { i, c, w, v, skip, take });
      }
    }
    // trace back
    let c = cap;
    const chosen: number[] = [];
    const path: [number, number][] = [[n, c]];
    const T2 = 'Trace back: which items made the best value?';
    const trTones = (cur: [number, number]): Record<string, Tone> => {
      const t = filled(n + 1, cap);
      for (const [pi, pj] of path) t[tk(pi, pj)] = 'path';
      t[tk(cur[0], cur[1])] = 'active';
      return t;
    };
    const trArrows = (): Arrow[] => path.slice(1).map((p, k) => ({ from: path[k], to: p, tone: 'path' as Tone }));
    r.step('trace', `Best value is dp[${n}][${cap}] = ${dp[n][cap]}. Walk up from the bottom-right to see which items were taken`, [table(trTones([n, c]), [], T2), items()], { c });
    for (let i = n; i >= 1; i--) {
      r.op();
      if (dp[i][c] !== dp[i - 1][c]) {
        chosen.push(i);
        const next: [number, number] = [i - 1, c - weights[i - 1]];
        path.push(next);
        c -= weights[i - 1];
        r.step('tpick', `dp[${i}][${c + weights[i - 1]}] ≠ dp[${i - 1}][${c + weights[i - 1]}] → item ${i} was taken, capacity left ${c}`, [table(trTones(next), trArrows(), T2), items(i, chosen)], { i, c, chosen: `[${[...chosen].reverse().join(', ')}]` });
      } else {
        const next: [number, number] = [i - 1, c];
        path.push(next);
        r.step('tcheck', `dp[${i}][${c}] = dp[${i - 1}][${c}] → item ${i} was not needed`, [table(trTones(next), trArrows(), T2), items(i, chosen)], { i, c, chosen: `[${[...chosen].reverse().join(', ')}]` });
      }
    }
    chosen.reverse();
    r.step('done', chosen.length ? `Best value ${dp[n][cap]} by taking item${chosen.length > 1 ? 's' : ''} ${chosen.join(', ')}` : `Best value ${dp[n][cap]}: nothing is worth taking`, [table(trTones([0, c]), trArrows(), T2), items(undefined, chosen)], { best: dp[n][cap], chosen: `[${chosen.join(', ')}]` });
    return { frames: r.frames, result: dp[n][cap] };
  },
  reference({ weights, values, cap }) {
    // brute force over every subset
    let best = 0;
    for (let mask = 0; mask < 1 << weights.length; mask++) {
      let w = 0;
      let v = 0;
      for (let i = 0; i < weights.length; i++) if (mask & (1 << i)) [w, v] = [w + weights[i], v + values[i]];
      if (w <= cap) best = Math.max(best, v);
    }
    return best;
  },
};

const tests = [
  { args: [[1, 3, 4, 5], [1, 4, 5, 7], 7], expected: 9 },
  { args: [[2], [3], 6], expected: 3, name: 'single item, used once' },
  { args: [[], [], 10], expected: 0, name: 'no items' },
  { args: [[5], [10], 4], expected: 0, name: 'too heavy' },
  { args: [[5], [10], 5], expected: 10, name: 'exact fit' },
  { args: [[1, 2, 3], [6, 10, 12], 5], expected: 22 },
  { args: [[2, 3, 4, 5], [3, 4, 5, 6], 5], expected: 7 },
];

const unit: Unit = {
  id: 'dp-knapsack',
  hook: 'Knapsack is the parent of every "pick a subset under a budget" question: subset sum, partition, target sum. The take-or-skip table is worth memorising cold.',
  predict: {
    prompt: 'Weights [1, 3, 4, 5], values [1, 4, 5, 7], capacity 7. Each item can be used at most once. What is the best total value?',
    options: ['8', '9', '10', '12'],
    answer: 1,
    explain: 'Items 2 and 3 (weights 3+4 = 7) are worth 4+5 = 9. Items 1+2+... such as 1,3 and 5 would need weight 9. Taking the best value-per-weight item first (item 1) is not enough.',
  },
  viz,
  deeper: {
    points: [
      'State: `dp[i][c]` = best value using only the first i items with capacity c. Row 0 (no items) is all zeros.',
      'Skip: `dp[i-1][c]`. Take (only if w <= c): `dp[i-1][c-w] + v`. Both read the PREVIOUS row, which is why each item is used at most once.',
      'Order: rows top to bottom; within a row any column order works.',
      'Answer: `dp[n][cap]`. To list the items, walk up from the corner: if `dp[i][c] != dp[i-1][c]` item i was taken, subtract its weight.',
      'Space: a single 1-D array works if you iterate capacity DOWNWARD, so the cells you read still hold the previous row.',
    ],
    complexity: { time: 'O(n × cap)', space: 'O(n × cap), or O(cap) with one row' },
    pitfalls: ['1-D version iterating capacity upward (reuses an item: that is unbounded knapsack)', 'Forgetting the w <= c guard (negative index)', 'Table with cap columns instead of cap + 1'],
  },
  practice: {
    language: 'python',
    fnName: 'knapsack',
    statement: 'Given item `weights`, item `values` and a bag `cap`, return the maximum total value you can carry using each item at most once.',
    signature: 'def knapsack(weights, values, cap):',
    solution: `def knapsack(weights, values, cap):
    n = len(weights)
    dp = [[0] * (cap + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        w, v = weights[i - 1], values[i - 1]
        for c in range(cap + 1):
            dp[i][c] = @@dp[i - 1][c]@@
            if @@w <= c@@:
                dp[i][c] = max(dp[i][c], @@dp[i - 1][c - w] + v@@)
    return @@dp[n][cap]@@`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'knapsack',
    statement: 'This space-optimised knapsack counts some items more than once. Find the bug.',
    buggy: `def knapsack(weights, values, cap):
    dp = [0] * (cap + 1)
    for w, v in zip(weights, values):
        for c in range(w, cap + 1):
            dp[c] = max(dp[c], dp[c - w] + v)
    return dp[cap]`,
    fixed: `def knapsack(weights, values, cap):
    dp = [0] * (cap + 1)
    for w, v in zip(weights, values):
        for c in range(cap, w - 1, -1):
            dp[c] = max(dp[c], dp[c - w] + v)
    return dp[cap]`,
    tests,
    bugType: 'iteration direction (item reused)',
    hint: 'Use weights [2], values [3], capacity 6. How many times can the single item end up counted?',
    explanation: 'With one shared array, dp[c - w] must still hold the value from BEFORE this item was considered. Iterating capacity upward lets dp[c - w] already include the item, so it is added again and again (unbounded knapsack). Iterate downward from cap to w.',
  },
  boss: {
    title: 'Partition Equal Subset Sum',
    statement: 'Given a list of positive integers `nums`, return True if it can be split into two groups with exactly the same sum, otherwise False. Example: [1, 5, 11, 5] splits into [1, 5, 5] and [11].',
    language: 'python',
    fnName: 'can_partition',
    starter: `def can_partition(nums):
    # your code here
    pass
`,
    solution: `def can_partition(nums):
    total = sum(nums)
    if total % 2:
        return False
    target = total // 2
    dp = [True] + [False] * target
    for x in nums:
        for s in range(target, x - 1, -1):
            dp[s] = dp[s] or dp[s - x]
    return dp[target]`,
    tests: [
      { args: [[1, 5, 11, 5]], expected: true },
      { args: [[1, 2, 3, 5]], expected: false },
      { args: [[2, 2]], expected: true, name: 'two equal' },
      { args: [[1]], expected: false, name: 'single item' },
      { args: [[3, 3, 3, 3]], expected: true },
      { args: [[1, 2, 5]], expected: false, name: 'sum is even but no split' },
    ],
    hints: ['If the total is odd the answer is False. Otherwise: can some subset hit exactly total / 2? That is knapsack where weight = value and the question is yes/no.', 'dp[s] = True if some subset sums to s. For each number x, loop s from target DOWN to x: dp[s] = dp[s] or dp[s - x].'],
    combines: ['dp-knapsack', 'dp-coin-change'],
  },
  quiz: [
    {
      prompt: 'In 0/1 knapsack, which row does the "take" option read from?',
      options: ['The same row i', 'The previous row i - 1', 'Row i + 1', 'Row 0 only'],
      answer: 1,
      explain: 'Reading row i - 1 guarantees the item is not already counted. Reading the same row would allow the item twice.',
    },
  ],
};

export default unit;
