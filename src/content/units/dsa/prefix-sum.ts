import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, LogPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def build_prefix(nums):
    prefix = [0] * (len(nums) + 1)                  #@init
    for i in range(len(nums)):
        prefix[i + 1] = prefix[i] + nums[i]         #@build
    return prefix                                   #@built

def range_sum(prefix, left, right):
    return prefix[right + 1] - prefix[left]         #@query
`;

interface In {
  nums: number[];
  queries: number[][];
}

const viz: VizDef<In> = {
  id: 'prefix-sum',
  title: 'Prefix sums and O(1) range queries',
  code,
  language: 'python',
  inputs: [
    { key: 'nums', label: 'Array', kind: 'numbers', default: [2, 4, 1, 3, 5, 2], maxItems: 9 },
    { key: 'queries', label: 'Queries [left, right] (inclusive)', kind: 'json', default: [[1, 3], [2, 5]], help: 'Example: [[1,3],[0,5]]' },
  ],
  presets: [
    { label: 'Whole array', input: { nums: [2, 4, 1, 3, 5, 2], queries: [[0, 5]] } },
    { label: 'Single cell', input: { nums: [2, 4, 1, 3, 5, 2], queries: [[3, 3]] } },
    { label: 'With negatives', input: { nums: [3, -2, 5, -1, 4], queries: [[1, 3], [0, 4]] } },
  ],
  run({ nums, queries }) {
    if (!Array.isArray(nums) || nums.length === 0) throw new Error('Enter at least one number');
    if (!Array.isArray(queries) || queries.length === 0) throw new Error('Enter at least one query such as [[1,3]]');
    for (const q of queries) {
      if (!Array.isArray(q) || q.length !== 2 || !Number.isInteger(q[0]) || !Number.isInteger(q[1])) throw new Error('Each query must look like [left, right]');
      if (q[0] < 0 || q[1] >= nums.length || q[0] > q[1]) throw new Error(`Query [${q[0]}, ${q[1]}] must satisfy 0 <= left <= right < ${nums.length}`);
    }
    const r = new Recorder(code);
    const n = nums.length;
    const prefix: number[] = new Array(n + 1).fill(0);
    const answers: number[] = [];

    const panels = (built: number, numsTones: Record<number, Tone> = {}, prefTones: Record<number, Tone> = {}, ptrs: Record<string, number> = {}, range?: { from: number; to: number }): (ArrayPanel | LogPanel)[] => {
      const pt: Record<number, Tone> = {};
      for (let i = 0; i <= n; i++) pt[i] = i <= built ? 'visited' : 'muted';
      const out: (ArrayPanel | LogPanel)[] = [
        { type: 'array', title: 'nums', values: nums, tones: numsTones, range: range ? { ...range, tone: 'found', label: 'query range' } : undefined },
        { type: 'array', title: 'prefix  (prefix[i] = sum of the first i items)', values: [...prefix], tones: { ...pt, ...prefTones }, pointers: ptrs },
      ];
      if (answers.length) out.push({ type: 'log', title: 'Answers', lines: answers.map((a, i) => ({ text: `sum(${queries[i][0]}..${queries[i][1]}) = ${a}`, tone: 'found' as Tone })) });
      return out;
    };

    r.step('init', 'prefix starts as n+1 zeros; prefix[0] = 0 means "the sum of nothing"', panels(0, {}, { 0: 'new' }), { n });
    for (let i = 0; i < n; i++) {
      const before = prefix[i];
      prefix[i + 1] = prefix[i] + nums[i];
      r.op();
      r.step('build', `prefix[${i + 1}] = prefix[${i}] + nums[${i}] = ${before} + ${nums[i]} = ${prefix[i + 1]}`, panels(i + 1, { [i]: 'compare' }, { [i]: 'compare', [i + 1]: 'new' }, { read: i, write: i + 1 }), { i, 'prefix[i+1]': prefix[i + 1] });
    }
    r.step('built', `Built in one pass: ${n} additions. Every query is now O(1)`, panels(n), { prefix: `[${prefix.join(', ')}]` });

    for (const [left, right] of queries) {
      const hi = prefix[right + 1];
      const lo = prefix[left];
      const nt: Record<number, Tone> = {};
      for (let i = left; i <= right; i++) nt[i] = 'found';
      const pt: Record<number, Tone> = { [right + 1]: 'active', [left]: 'swap' };
      const ptrs = { [`right+1=${right + 1}`]: right + 1, [`left=${left}`]: left };
      r.step('query', `Sum of nums[${left}..${right}]: subtract prefix[${left}] from prefix[${right + 1}]`, panels(n, nt, pt, ptrs, { from: left, to: right }), { left, right });
      r.op();
      answers.push(hi - lo);
      r.step('query', `prefix[${right + 1}] − prefix[${left}] = ${hi} − ${lo} = ${hi - lo}`, panels(n, nt, pt, ptrs, { from: left, to: right }), { left, right, answer: hi - lo });
    }
    r.step('query', `Answered ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'} without re-adding any element`, panels(n), { answers: `[${answers.join(', ')}]` });
    return { frames: r.frames, result: answers };
  },
  reference({ nums, queries }) {
    return queries.map(([l, r]) => nums.slice(l, r + 1).reduce((a, b) => a + b, 0));
  },
};

const tests = [
  { args: [[2, 4, 1, 3, 5, 2], [[1, 3], [0, 5], [2, 2]]], expected: [8, 17, 1] },
  { args: [[5], [[0, 0]]], expected: [5], name: 'single element' },
  { args: [[3, -2, 5, -1, 4], [[1, 3], [0, 4], [3, 4]]], expected: [2, 9, 3], name: 'negatives' },
  { args: [[1, 2, 3], []], expected: [], name: 'no queries' },
  { args: [[0, 0, 0, 0], [[0, 3], [1, 2]]], expected: [0, 0], name: 'all zeros' },
  { args: [[10, -10, 10], [[0, 1], [1, 2], [0, 2]]], expected: [0, 0, 10] },
];

const unit: Unit = {
  id: 'prefix-sum',
  hook: 'Pay O(n) once, answer every "sum of items i..j" question in O(1). Prefix sums are the first move for any range-sum problem, and the idea (store running totals, then subtract) powers the "subarray sums to k" family.',
  predict: {
    prompt: 'nums = [2, 4, 1, 3, 5, 2] gives prefix = [0, 2, 6, 7, 10, 15, 17]. Which expression equals the sum of nums[2..4] (1 + 3 + 5)?',
    options: ['prefix[4] - prefix[2]', 'prefix[5] - prefix[2]', 'prefix[5] - prefix[3]', 'prefix[4] - prefix[1]'],
    answer: 1,
    explain: 'prefix[5] = 15 is the sum of nums[0..4]; prefix[2] = 6 is the sum of nums[0..1]. 15 - 6 = 9 = 1 + 3 + 5. In general sum(l..r) = prefix[r+1] - prefix[l].',
  },
  viz,
  deeper: {
    points: [
      'prefix has n + 1 cells: prefix[0] = 0 is the "empty prefix", which lets a range starting at index 0 use the same formula.',
      'sum(left..right) = prefix[right + 1] - prefix[left]: everything up to right, minus everything before left.',
      'Build once in O(n), then each query is two lookups. Without it, q queries cost O(q * n).',
      'Negative numbers are fine, which is why prefix sums + a hash map beat a sliding window for "subarray sum equals k".',
    ],
    complexity: { time: 'O(n) to build, O(1) per query', space: 'O(n)' },
    pitfalls: ['Using prefix[right] - prefix[left] (drops nums[right])', 'Making prefix the same length as nums and special-casing left = 0', 'Re-building the prefix array inside every query'],
  },
  practice: {
    language: 'python',
    fnName: 'range_sums',
    statement: 'Given `nums` and a list of inclusive `[left, right]` queries, return the sum of each range. Build a prefix array once so every query is O(1).',
    signature: 'def range_sums(nums, queries):',
    solution: `def range_sums(nums, queries):
    prefix = [0] * @@(len(nums) + 1)@@
    for i in range(len(nums)):
        prefix[i + 1] = @@prefix[i] + nums[i]@@
    answers = []
    for left, right in queries:
        answers.append(prefix[@@right + 1@@] - prefix[@@left@@])
    return answers`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'range_sums',
    statement: 'Every range sum is missing its last element. Find the bug.',
    buggy: `def range_sums(nums, queries):
    prefix = [0] * (len(nums) + 1)
    for i in range(len(nums)):
        prefix[i + 1] = prefix[i] + nums[i]
    answers = []
    for left, right in queries:
        answers.append(prefix[right] - prefix[left])
    return answers`,
    fixed: `def range_sums(nums, queries):
    prefix = [0] * (len(nums) + 1)
    for i in range(len(nums)):
        prefix[i + 1] = prefix[i] + nums[i]
    answers = []
    for left, right in queries:
        answers.append(prefix[right + 1] - prefix[left])
    return answers`,
    tests,
    bugType: 'off-by-one',
    hint: 'prefix[k] holds the sum of the first k items, so which prefix cell already includes nums[right]?',
    explanation: 'prefix is shifted by one: prefix[right + 1] is the sum through nums[right]. Using prefix[right] stops one element short.',
  },
  boss: {
    title: 'Subarrays that sum to k',
    statement: 'Given a list of integers (possibly negative) and a target k, count the contiguous subarrays whose sum equals k.',
    language: 'python',
    fnName: 'subarray_sum',
    starter: `def subarray_sum(nums, k):
    # your code here
    pass
`,
    solution: `def subarray_sum(nums, k):
    seen = {0: 1}
    total = 0
    count = 0
    for x in nums:
        total += x
        count += seen.get(total - k, 0)
        seen[total] = seen.get(total, 0) + 1
    return count`,
    tests: [
      { args: [[1, 1, 1], 2], expected: 2 },
      { args: [[1, 2, 3], 3], expected: 2 },
      { args: [[1, -1, 0], 0], expected: 3, name: 'negatives and zeros' },
      { args: [[], 0], expected: 0, name: 'empty' },
      { args: [[3, 4, 7, 2, -3, 1, 4, 2], 7], expected: 4 },
      { args: [[5], 5], expected: 1, name: 'single element' },
      { args: [[-1, -1, 1], 0], expected: 1 },
    ],
    hints: ['A subarray (i..j) sums to k exactly when prefix[j+1] - prefix[i] = k. Fix the right end: which earlier prefix value do you need?', 'Keep a dict of how many times each running total has occurred (start with {0: 1}). At each step add seen[total - k] to the answer, then record total.'],
    combines: ['prefix-sum', 'hash-set'],
  },
};

export default unit;
