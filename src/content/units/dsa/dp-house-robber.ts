import { Recorder } from '@/engine/recorder';
import type { Arrow } from '@/content/lib/dp';
import type { GridPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { assertIntList, dpGrid, type DpCell } from '@/content/lib/dp';

const code = `
def rob(nums):
    n = len(nums)                          #@len
    if n == 0:                             #@empty
        return 0                           #@zero
    if n == 1:                             #@single
        return nums[0]                     #@one
    dp = [0] * n                           #@init
    dp[0] = nums[0]                        #@base0
    dp[1] = max(nums[0], nums[1])          #@base1
    for i in range(2, n):                  #@loop
        skip = dp[i - 1]                   #@skip
        take = dp[i - 2] + nums[i]         #@take
        dp[i] = max(skip, take)            #@pick
    return dp[n - 1]                       #@done
`;

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'dp-house-robber',
  title: 'House robber (take or skip)',
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Money in each house', kind: 'numbers', default: [2, 7, 9, 3, 1], maxItems: 8, help: 'Whole numbers 0..99' }],
  presets: [
    { label: 'Greedy trap', input: { nums: [2, 1, 1, 2] } },
    { label: 'Take every other', input: { nums: [1, 2, 3, 1] } },
    { label: 'Empty street', input: { nums: [] } },
    { label: 'One house', input: { nums: [5] } },
    { label: 'Two houses', input: { nums: [4, 9] } },
  ],
  run({ nums }) {
    assertIntList('Houses', nums, { max: 8, lo: 0, hi: 99 });
    const r = new Recorder(code);
    const n = nums.length;
    const dp: (number | null)[] = Array(n).fill(null);
    const table = (tones: Record<string, Tone> = {}, arrows: Arrow[] = []): GridPanel =>
      dpGrid([nums, dp as DpCell[]], { title: 'val = money, dp[i] = best loot using houses 0..i', rowLabels: ['val', 'dp'], colLabels: nums.map((_, i) => String(i)), tones, arrows });
    const doneTones = (upTo: number): Record<string, Tone> => {
      const t: Record<string, Tone> = {};
      for (let i = 0; i < upTo; i++) t[`1,${i}`] = 'done';
      return t;
    };
    if (n === 0) {
      r.step('len', 'There are no houses: n = 0', [{ type: 'note', text: 'Empty street, nothing to rob.' }], { n });
      r.step('empty', 'n == 0 → nothing to rob', [{ type: 'note', text: 'Empty street, nothing to rob.' }], { n });
      r.step('zero', 'Return 0', [{ type: 'note', text: 'Best loot = 0', tone: 'found' }], { n, result: 0 });
      return { frames: r.frames, result: 0 };
    }
    r.step('len', `${n} house${n > 1 ? 's' : ''}: ${nums.join(', ')}`, [table()], { n });
    if (n === 1) {
      r.step('single', 'Only one house: rob it', [table({ '0,0': 'active' })], { n });
      r.step('one', `Return nums[0] = ${nums[0]}`, [table({ '0,0': 'found' })], { n, result: nums[0] });
      return { frames: r.frames, result: nums[0] };
    }
    r.step('init', 'dp[i] will hold the best loot using houses 0..i', [table()], { n });
    dp[0] = nums[0];
    r.op();
    r.step('base0', `dp[0] = nums[0] = ${nums[0]}: with one house, rob it`, [table({ '1,0': 'active', '0,0': 'compare' }, [{ from: [0, 0], to: [1, 0] }])], { n });
    dp[1] = Math.max(nums[0], nums[1]);
    r.op();
    r.step('base1', `dp[1] = max(${nums[0]}, ${nums[1]}) = ${dp[1]}: two neighbours, pick the richer one`, [table({ '1,1': 'active', '0,0': 'compare', '0,1': 'compare', ...doneTones(1) }, [{ from: [0, 0], to: [1, 1] }, { from: [0, 1], to: [1, 1] }])], { n });
    for (let i = 2; i < n; i++) {
      const skip = dp[i - 1]!;
      const take = dp[i - 2]! + nums[i];
      const tones = { ...doneTones(i), [`1,${i}`]: 'active' as Tone };
      const skipArrow: Arrow = { from: [1, i - 1], to: [1, i], tone: 'compare' };
      const takeArrows: Arrow[] = [
        { from: [1, i - 2], to: [1, i], tone: 'compare' },
        { from: [0, i], to: [1, i], tone: 'compare' },
      ];
      r.step('skip', `Skip house ${i}: keep dp[${i - 1}] = ${skip}`, [table({ ...tones, [`1,${i - 1}`]: 'compare' }, [skipArrow])], { i, skip });
      r.step('take', `Take house ${i}: dp[${i - 2}] + nums[${i}] = ${dp[i - 2]} + ${nums[i]} = ${take}`, [table({ ...tones, [`1,${i - 2}`]: 'compare', [`0,${i}`]: 'compare' }, takeArrows)], { i, skip, take });
      r.op();
      dp[i] = Math.max(skip, take);
      const takeWins = take > skip;
      const arrows: Arrow[] = takeWins ? [{ ...takeArrows[0], tone: 'found' }, { ...takeArrows[1], tone: 'found' }, { ...skipArrow, tone: 'muted' }] : [{ ...skipArrow, tone: 'found' }, { ...takeArrows[0], tone: 'muted' }, { ...takeArrows[1], tone: 'muted' }];
      r.step('pick', `max(skip ${skip}, take ${take}) = ${dp[i]} → ${takeWins ? 'take' : 'skip'} wins`, [table({ ...tones, [`1,${i}`]: 'swap' }, arrows)], { i, skip, take, 'dp[i]': dp[i] });
    }
    const t = doneTones(n);
    t[`1,${n - 1}`] = 'found';
    r.step('done', `Answer: dp[${n - 1}] = ${dp[n - 1]}`, [table(t)], { n, result: dp[n - 1] });
    return { frames: r.frames, result: dp[n - 1] };
  },
  reference({ nums }) {
    let prev = 0;
    let cur = 0;
    for (const x of nums) [prev, cur] = [cur, Math.max(cur, prev + x)];
    return cur;
  },
};

const tests = [
  { args: [[1, 2, 3, 1]], expected: 4 },
  { args: [[2, 7, 9, 3, 1]], expected: 12 },
  { args: [[2, 1, 1, 2]], expected: 4, name: 'greedy trap' },
  { args: [[]], expected: 0, name: 'empty' },
  { args: [[5]], expected: 5, name: 'single house' },
  { args: [[9, 1]], expected: 9, name: 'two houses' },
  { args: [[10, 1, 1, 10]], expected: 20 },
];

const unit: Unit = {
  id: 'dp-house-robber',
  hook: 'A neat DP where each cell is a choice: take this item (and give up its neighbour) or skip it. If you can explain "take vs skip" here, knapsack and subset problems are the same idea.',
  predict: {
    prompt: 'Houses hold [2, 1, 1, 2] and you cannot rob two adjacent houses. What is the most you can steal?',
    options: ['3', '4', '5', '6'],
    answer: 1,
    explain: 'Robbing the first and last house gives 2 + 2 = 4. Greedily grabbing the richest neighbour pair or alternating from house 1 only yields 3. The DP considers both choices at every house.',
  },
  viz,
  deeper: {
    points: [
      'State: `dp[i]` = best loot using only houses 0..i (not "must rob house i").',
      'Recurrence: skip house i → `dp[i-1]`; take it → `dp[i-2] + nums[i]`. Keep the larger.',
      'Base cases: `dp[0] = nums[0]`, `dp[1] = max(nums[0], nums[1])`. Handle n = 0 and n = 1 before indexing.',
      'Order: each cell depends on the two cells to its left, so fill left to right.',
      'Space: keep two rolling variables (`prev`, `cur`) instead of the table.',
    ],
    complexity: { time: 'O(n)', space: 'O(n), or O(1) with two variables' },
    pitfalls: ['dp[1] = nums[1] instead of the max of the first two', 'Indexing nums[1] when the list has fewer than two houses', 'Thinking dp[i] means "house i is robbed" and returning the last cell blindly'],
  },
  practice: {
    language: 'python',
    fnName: 'rob',
    statement: 'Each house holds some money, but robbing two adjacent houses triggers an alarm. Return the maximum you can rob from a street of houses `nums`.',
    signature: 'def rob(nums):',
    solution: `def rob(nums):
    n = len(nums)
    if n == 0:
        return 0
    if n == 1:
        return @@nums[0]@@
    dp = [0] * n
    dp[0] = nums[0]
    dp[1] = @@max(nums[0], nums[1])@@
    for i in range(2, n):
        dp[i] = @@max(dp[i - 1], dp[i - 2] + nums[i])@@
    return @@dp[n - 1]@@`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'rob',
    statement: 'This works on most streets but over- or under-counts when the first house is the richest. Find the bug.',
    buggy: `def rob(nums):
    n = len(nums)
    if n == 0:
        return 0
    if n == 1:
        return nums[0]
    dp = [0] * n
    dp[0] = nums[0]
    dp[1] = nums[1]
    for i in range(2, n):
        dp[i] = max(dp[i - 1], dp[i - 2] + nums[i])
    return dp[n - 1]`,
    fixed: `def rob(nums):
    n = len(nums)
    if n == 0:
        return 0
    if n == 1:
        return nums[0]
    dp = [0] * n
    dp[0] = nums[0]
    dp[1] = max(nums[0], nums[1])
    for i in range(2, n):
        dp[i] = max(dp[i - 1], dp[i - 2] + nums[i])
    return dp[n - 1]`,
    tests,
    bugType: 'wrong base case',
    hint: 'Try nums = [9, 1]. What should dp[1] be, and what does the code store?',
    explanation: 'dp[1] means the best loot from houses 0..1. You may rob either one, so it is max(nums[0], nums[1]). Writing dp[1] = nums[1] forgets that skipping house 1 is allowed, and that wrong value is copied into every later cell.',
  },
  boss: {
    title: 'House Robber II (circular street)',
    statement: 'The houses now stand in a circle, so the first and last houses are neighbours and cannot both be robbed. Given the list `nums`, return the maximum amount you can steal without robbing two adjacent houses.',
    language: 'python',
    fnName: 'rob_circle',
    starter: `def rob_circle(nums):
    # your code here
    pass
`,
    solution: `def rob_circle(nums):
    if not nums:
        return 0
    if len(nums) == 1:
        return nums[0]

    def line(houses):
        prev, cur = 0, 0
        for x in houses:
            prev, cur = cur, max(cur, prev + x)
        return cur

    return max(line(nums[1:]), line(nums[:-1]))`,
    tests: [
      { args: [[2, 3, 2]], expected: 3 },
      { args: [[1, 2, 3, 1]], expected: 4 },
      { args: [[1]], expected: 1, name: 'one house' },
      { args: [[1, 2]], expected: 2, name: 'two houses' },
      { args: [[5, 1, 1, 5]], expected: 6, name: 'ends are neighbours' },
      { args: [[]], expected: 0, name: 'empty' },
    ],
    hints: ['Because the ends touch, at least one of them is NOT robbed. That splits the problem into two ordinary lines.', 'Answer = max(rob a line without the first house, rob a line without the last house). Handle n == 1 separately.'],
    combines: ['dp-house-robber', 'dp-climbing-stairs'],
  },
  quiz: [
    {
      prompt: 'In the recurrence dp[i] = max(dp[i-1], dp[i-2] + nums[i]), what does dp[i-1] represent?',
      options: ['Robbing house i-1', 'Skipping house i', 'Taking both i and i-1', 'The average loot so far'],
      answer: 1,
      explain: 'If house i is skipped, the best you can do is whatever was best for houses 0..i-1.',
    },
  ],
};

export default unit;
