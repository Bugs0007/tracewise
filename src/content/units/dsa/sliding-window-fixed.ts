import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def max_window_sum(nums, k):
    window = sum(nums[:k])                     #@init
    best = window                              #@best
    for i in range(k, len(nums)):              #@loop
        window += nums[i] - nums[i - k]        #@slide
        best = max(best, window)               #@update
    return best                                #@done
`;

interface In {
  nums: number[];
  k: number;
}

const viz: VizDef<In> = {
  id: 'sliding-window-fixed',
  title: 'Fixed-size sliding window',
  code,
  language: 'python',
  inputs: [
    { key: 'nums', label: 'Array', kind: 'numbers', default: [2, 1, 5, 1, 3, 2, 8, 1], maxItems: 10 },
    { key: 'k', label: 'Window size k', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'k = 3', input: { nums: [2, 1, 5, 1, 3, 2, 8, 1], k: 3 } },
    { label: 'All negative', input: { nums: [-4, -2, -7, -1, -5], k: 2 } },
    { label: 'k = n', input: { nums: [4, 2, 6], k: 3 } },
    { label: 'k = 1', input: { nums: [3, 9, 4, 7], k: 1 } },
  ],
  run({ nums, k }) {
    if (!Array.isArray(nums) || nums.length === 0) throw new Error('Enter at least one number');
    if (!Number.isInteger(k) || k < 1 || k > nums.length) throw new Error(`k must be a whole number from 1 to ${nums.length}`);
    const r = new Recorder(code);
    let bestStart = 0;
    const view = (from: number, to: number, label: string, hot: Record<number, Tone> = {}): ArrayPanel => {
      const tones: Record<number, Tone> = {};
      for (let i = bestStart; i < bestStart + k; i++) tones[i] = 'done';
      Object.assign(tones, hot);
      return { type: 'array', title: 'nums  (green = best window so far)', values: nums, tones, range: { from, to, tone: 'active', label } };
    };

    let window = 0;
    for (let i = 0; i < k; i++) window += nums[i];
    r.op(k);
    r.step('init', `First window nums[0..${k - 1}] = ${nums.slice(0, k).join(' + ')} = ${window}`, [view(0, k - 1, `sum = ${window}`)], { window });
    let best = window;
    r.step('best', `Nothing to beat yet → best = ${best}`, [view(0, k - 1, `sum = ${window}`)], { window, best });
    for (let i = k; i < nums.length; i++) {
      const out = nums[i - k];
      const inn = nums[i];
      r.step('loop', `Slide right: nums[${i}] = ${inn} enters, nums[${i - k}] = ${out} leaves`, [view(i - k, i - 1, `sum = ${window}`, { [i]: 'new', [i - k]: 'swap' })], { i, window, best });
      window += inn - out;
      r.op(2);
      r.step('slide', `window = ${window - inn + out} + ${inn} − ${out} = ${window}  (O(1), not ${k} additions)`, [view(i - k + 1, i, `sum = ${window}`, { [i]: 'new' })], { i, window, best });
      r.op();
      if (window > best) {
        best = window;
        bestStart = i - k + 1;
        r.step('update', `${window} beats the old best → best = ${best}`, [view(i - k + 1, i, `sum = ${window}`)], { i, window, best });
      } else {
        r.step('update', `${window} ≤ ${best} → best stays ${best}`, [view(i - k + 1, i, `sum = ${window}`)], { i, window, best });
      }
    }
    r.step('done', `Largest sum of ${k} consecutive items: ${best}`, [view(bestStart, bestStart + k - 1, `best = ${best}`)], { best });
    return { frames: r.frames, result: best };
  },
  reference({ nums, k }) {
    let best = -Infinity;
    for (let s = 0; s + k <= nums.length; s++) best = Math.max(best, nums.slice(s, s + k).reduce((a, b) => a + b, 0));
    return best;
  },
};

const tests = [
  { args: [[2, 1, 5, 1, 3, 2], 3], expected: 9 },
  { args: [[1, 4, 2, 10, 2, 3, 1, 0, 20], 4], expected: 24 },
  { args: [[5], 1], expected: 5, name: 'single element' },
  { args: [[-4, -2, -7, -1, -5], 2], expected: -6, name: 'all negative' },
  { args: [[1, 2, 3], 3], expected: 6, name: 'window is the whole array' },
  { args: [[3, -1, 4, -1, 5], 1], expected: 5, name: 'k = 1' },
  { args: [[0, 0, 0, 0], 2], expected: 0, name: 'zeros' },
];

const unit: Unit = {
  id: 'sliding-window-fixed',
  hook: 'Recomputing every k-item sum costs O(n·k). Sliding the window - add the item that enters, subtract the one that leaves - makes it O(n). The same slide-and-update loop sits under averages, anagram checks and "best k consecutive" questions.',
  predict: {
    prompt: 'nums = [2, 1, 5, 1, 3, 2], k = 3. The window [2, 1, 5] sums to 8. The window slides one step right. What is the new sum without re-adding all three items?',
    options: ['8 + 1', '8 + 1 - 2', '8 + 1 - 5', '8 - 2'],
    answer: 1,
    explain: 'The entering item is nums[3] = 1 and the leaving item is nums[0] = 2, so 8 + 1 - 2 = 7, which equals 1 + 5 + 1.',
  },
  viz,
  deeper: {
    points: [
      'The window always covers nums[i-k+1..i]; sliding changes exactly two items, so the update is one add and one subtract.',
      'Compute the first window directly, then loop i from k to n-1: leaving index is i - k, entering index is i.',
      'Track the best window start too if the question asks for the window, not just its value.',
      'Same pattern for max average (divide by k at the end), counting vowels in every k-substring, or comparing letter counts for anagrams.',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
    pitfalls: ['Initialising best to 0 (wrong for all-negative arrays)', 'Dropping nums[i - k - 1] or nums[i - k + 1] instead of nums[i - k]', 'Forgetting to handle k larger than the array'],
  },
  practice: {
    language: 'python',
    fnName: 'max_window_sum',
    statement: 'Return the largest sum of any `k` consecutive items of `nums` (1 <= k <= len(nums)). Slide a window instead of re-summing.',
    signature: 'def max_window_sum(nums, k):',
    solution: `def max_window_sum(nums, k):
    window = @@sum(nums[:k])@@
    best = @@window@@
    for i in range(@@k@@, len(nums)):
        window += @@nums[i] - nums[i - k]@@
        best = @@max(best, window)@@
    return best`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'max_window_sum',
    statement: 'This works on normal data but returns a wrong answer when every number is negative. Find the bug.',
    buggy: `def max_window_sum(nums, k):
    window = sum(nums[:k])
    best = 0
    for i in range(k, len(nums)):
        window += nums[i] - nums[i - k]
        best = max(best, window)
    return best`,
    fixed: `def max_window_sum(nums, k):
    window = sum(nums[:k])
    best = window
    for i in range(k, len(nums)):
        window += nums[i] - nums[i - k]
        best = max(best, window)
    return best`,
    tests,
    bugType: 'wrong initial value',
    hint: 'What would the function return for [-5, -3] with k = 1?',
    explanation: 'best = 0 pretends an empty window with sum 0 exists. When every window is negative, 0 beats all of them. Start from the first real window: best = window.',
  },
  boss: {
    title: 'Find all anagrams',
    statement: 'Given strings `s` and `p`, return every start index in `s` where a substring of length len(p) is an anagram of `p` (same letters, same counts). Indices in increasing order.',
    language: 'python',
    fnName: 'find_anagrams',
    starter: `def find_anagrams(s, p):
    # your code here
    pass
`,
    solution: `def find_anagrams(s, p):
    k = len(p)
    if k > len(s):
        return []
    need = {}
    for ch in p:
        need[ch] = need.get(ch, 0) + 1
    have = {}
    out = []
    for i, ch in enumerate(s):
        have[ch] = have.get(ch, 0) + 1
        if i >= k:
            left = s[i - k]
            have[left] -= 1
            if have[left] == 0:
                del have[left]
        if have == need:
            out.append(i - k + 1)
    return out`,
    tests: [
      { args: ['cbaebabacd', 'abc'], expected: [0, 6] },
      { args: ['abab', 'ab'], expected: [0, 1, 2] },
      { args: ['a', 'ab'], expected: [], name: 'pattern longer than text' },
      { args: ['', 'a'], expected: [], name: 'empty text' },
      { args: ['aaaa', 'aa'], expected: [0, 1, 2], name: 'overlapping matches' },
      { args: ['baa', 'aa'], expected: [1] },
    ],
    hints: ['The window has fixed length len(p). What do you need to compare each time it slides?', 'Keep letter counts for p and for the window. Each step add the entering letter, remove the leaving one (delete zero counts), and compare the two dicts.'],
    combines: ['sliding-window-fixed', 'hash-set'],
  },
};

export default unit;
