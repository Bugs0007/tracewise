import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, KVPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def two_sum(nums, target):
    seen = {}                          #@init
    for i, x in enumerate(nums):       #@loop
        need = target - x              #@need
        if need in seen:               #@check
            return [seen[need], i]     #@hit
        seen[x] = i                    #@store
    return []                          #@miss
`;

interface In {
  nums: number[];
  target: number;
}

const viz: VizDef<In> = {
  id: 'hash-set',
  title: 'Hash lookups: two-sum with a seen dict',
  code,
  language: 'python',
  inputs: [
    { key: 'nums', label: 'Numbers', kind: 'numbers', default: [8, 3, 11, 2, 7], maxItems: 12 },
    { key: 'target', label: 'Target sum', kind: 'number', default: 9 },
  ],
  presets: [
    { label: 'Pair found late', input: { nums: [8, 3, 11, 2, 7], target: 9 } },
    { label: 'Same value twice', input: { nums: [3, 3], target: 6 } },
    { label: 'Do not reuse an element', input: { nums: [3, 2, 4], target: 6 } },
    { label: 'No pair', input: { nums: [1, 2, 3], target: 10 } },
  ],
  run({ nums, target }) {
    if (!nums.length) throw new Error('Add at least one number');
    const r = new Recorder(code);
    const seen = new Map<number, number>();
    const view = (i?: number, tones: Record<number, Tone> = {}): [ArrayPanel, KVPanel] => {
      const t: Record<number, Tone> = {};
      nums.forEach((_, k) => {
        if (i !== undefined && k < i) t[k] = 'visited';
      });
      Object.assign(t, tones);
      return [
        { type: 'array', title: 'nums', values: nums, tones: t, pointers: i === undefined ? undefined : { i } },
        { type: 'kv', title: `seen (value: index), ${seen.size} stored`, entries: [...seen.entries()].map(([k, v]) => ({ k: String(k), v })) },
      ];
    };
    r.step('init', `Empty dict "seen" remembers every value passed so far; looking up target = ${target}`, view(), { target });
    for (let i = 0; i < nums.length; i++) {
      const x = nums[i];
      const need = target - x;
      r.step('need', `i = ${i}, x = ${x}: need = ${target} - ${x} = ${need}`, view(i, { [i]: 'active' }), { i, x, need });
      r.op();
      if (seen.has(need)) {
        const j = seen.get(need)!;
        r.step('check', `${need} is in seen (index ${j}): hit!`, view(i, { [i]: 'found', [j]: 'found' }), { i, x, need });
        r.step('hit', `nums[${j}] + nums[${i}] = ${need} + ${x} = ${target}: return [${j}, ${i}]`, view(i, { [i]: 'found', [j]: 'found' }), { result: `[${j}, ${i}]` });
        return { frames: r.frames, result: [j, i] };
      }
      r.step('check', `${need} is not in seen: no earlier partner`, view(i, { [i]: 'compare' }), { i, x, need });
      seen.set(x, i);
      r.op();
      r.step('store', `Remember ${x} at index ${i}. Checking BEFORE storing stops an element pairing with itself`, view(i, { [i]: 'new' }), { i, x });
    }
    r.step('miss', 'Ran out of numbers without a pair: return []', view(), { result: '[]' });
    return { frames: r.frames, result: [] };
  },
  reference({ nums, target }) {
    // brute force: for each i, find the most recent earlier j with nums[j] + nums[i] == target
    for (let i = 0; i < nums.length; i++) {
      for (let j = i - 1; j >= 0; j--) if (nums[j] + nums[i] === target) return [j, i];
    }
    return [];
  },
};

const tests = [
  { args: [[2, 7, 11, 15], 9], expected: [0, 1] },
  { args: [[3, 2, 4], 6], expected: [1, 2], name: 'do not use the same element twice' },
  { args: [[3, 3], 6], expected: [0, 1], name: 'duplicate values' },
  { args: [[1, 2, 3], 10], expected: [], name: 'no pair' },
  { args: [[], 5], expected: [], name: 'empty list' },
  { args: [[5], 10], expected: [], name: 'one element cannot pair with itself' },
  { args: [[-3, 4, 3, 90], 0], expected: [0, 2], name: 'negative numbers' },
];

const unit: Unit = {
  id: 'hash-set',
  hook: 'The first trick interviewers expect: trade O(n) memory for O(1) lookups. Two-sum and contains-duplicate are the same idea, and it is the fastest way to turn a nested loop into a single pass.',
  predict: {
    prompt: 'You test `x in collection` once for each of 1,000,000 values. Roughly how does the cost of one test compare between a set of 10 items and a set of 1,000,000 items?',
    options: ['About 100,000 times slower: it scans every item', 'About 20 times slower: it does a binary search', 'About the same: it hashes x and jumps straight to one bucket', 'It depends on whether x is present'],
    answer: 2,
    explain: 'Sets and dicts hash the value, jump to its bucket, and compare a few entries. The size of the table barely matters, so a lookup is O(1) on average. A list `in` would scan item by item (O(n)).',
  },
  viz,
  deeper: {
    points: [
      'Whenever you write "for each item, search the rest for X", ask whether a set or dict can answer "have I seen X?" in O(1).',
      'A set answers yes/no (contains-duplicate). A dict also remembers a payload such as an index (two-sum) or a count.',
      'In two-sum, check `need in seen` BEFORE storing the current value, so one element is never paired with itself.',
      'Keys must be hashable (numbers, strings, tuples). Lists and dicts cannot be set members or dict keys.',
    ],
    complexity: { time: 'O(n)', space: 'O(n)' },
    pitfalls: ['Storing the current value before checking (pairs an element with itself)', 'Using a list instead of a set for `seen` (silently O(n²))', 'Returning values instead of indices (or the reverse) when the question asks for the other one'],
  },
  practice: {
    language: 'python',
    fnName: 'two_sum',
    compare: 'unordered',
    statement: 'Return the indices of two different elements of `nums` that add up to `target`, or [] if there are none. Use one pass and a dict.',
    signature: 'def two_sum(nums, target):',
    solution: `def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        need = @@target - x@@
        if @@need in seen@@:
            return [@@seen[need]@@, i]
        @@seen[x] = i@@
    return []`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'two_sum',
    compare: 'unordered',
    statement: 'two_sum returns a wrong answer for some inputs, such as nums = [3, 2, 4] with target = 6. Find the bug.',
    buggy: `def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        seen[x] = i
        need = target - x
        if need in seen:
            return [seen[need], i]
    return []`,
    fixed: `def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        need = target - x
        if need in seen:
            return [seen[need], i]
        seen[x] = i
    return []`,
    tests,
    bugType: 'wrong order of check and store',
    hint: 'Trace [3, 2, 4] with target 6. What is in seen at the moment you look for 3?',
    explanation: 'Storing x first lets it find ITSELF: 3 needs 3, and 3 was just stored, giving [0, 0]. Look up the partner first, then store the current value for later elements.',
  },
  boss: {
    title: 'Longest Consecutive Sequence',
    statement: 'Given an unsorted list of integers, return the length of the longest run of consecutive values (such as 4, 5, 6, 7), regardless of their order in the list. Solve it in O(n), so sorting is not allowed.',
    language: 'python',
    fnName: 'longest_consecutive',
    starter: `def longest_consecutive(nums):
    # your code here
    pass
`,
    solution: `def longest_consecutive(nums):
    values = set(nums)
    best = 0
    for x in values:
        if x - 1 not in values:
            y = x
            while y + 1 in values:
                y += 1
            best = max(best, y - x + 1)
    return best`,
    tests: [
      { args: [[100, 4, 200, 1, 3, 2]], expected: 4 },
      { args: [[]], expected: 0, name: 'empty' },
      { args: [[0, 3, 7, 2, 5, 8, 4, 6, 0, 1]], expected: 9, name: 'duplicates' },
      { args: [[5]], expected: 1, name: 'single value' },
      { args: [[-2, -1, 0, 10, 11]], expected: 3, name: 'negative values' },
      { args: [[1, 2, 0, 1]], expected: 3 },
    ],
    hints: ['Put every number in a set. Then for a given x, "is x + 1 here?" costs O(1).', 'Only start counting at a number x where x - 1 is NOT in the set (the start of a run), then walk upward with while y + 1 in values. Each run is walked once, so total work is O(n).'],
    combines: ['hash-chaining', 'big-o'],
  },
  quiz: [
    {
      prompt: 'Which change makes `for x in nums: if x in seen_list: ...` linear?',
      options: ['Sort seen_list first', 'Make seen a set', 'Use while instead of for', 'Use range(len(nums))'],
      answer: 1,
      explain: '`x in list` scans the list; `x in set` is a hash lookup. Same code shape, O(1) instead of O(n) per check.',
    },
  ],
};

export default unit;
