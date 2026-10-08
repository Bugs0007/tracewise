import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { bars, numbersInput, show, sortedCopy } from '@/content/lib/sorting';

const code = `
def counting_sort(nums):
    if not nums:
        return []
    counts = [0] * (max(nums) + 1)                      #@alloc
    for x in nums:                                      #@countLoop
        counts[x] += 1                                  #@count
    for v in range(1, len(counts)):                     #@prefixLoop
        counts[v] += counts[v - 1]                      #@prefix
    out = [0] * len(nums)                               #@out
    for x in reversed(nums):                            #@placeLoop
        counts[x] -= 1                                  #@dec
        out[counts[x]] = x                              #@place
    return out                                          #@done
`;

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'counting-sort',
  title: 'Counting sort (stable)',
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Non-negative integers (0 to 15)', kind: 'numbers', default: [4, 2, 2, 8, 3, 3, 1], maxItems: 10 }],
  presets: [
    { label: 'Already sorted', input: { nums: [1, 2, 3, 4, 5, 6] } },
    { label: 'Reversed', input: { nums: [6, 5, 4, 3, 2, 1] } },
    { label: 'Many duplicates', input: { nums: [2, 0, 2, 1, 0, 2, 1] } },
    { label: 'Gap in values', input: { nums: [9, 1, 9, 1, 5] } },
  ],
  run({ nums: raw }) {
    const nums = numbersInput(raw, { nonNegative: true, maxValue: 15, max: 10 });
    const r = new Recorder(code);
    const n = nums.length;
    if (n === 0) {
      r.step('done', 'Empty list: nothing to sort', [bars([], { title: 'nums' })], {});
      return { frames: r.frames, result: [] };
    }
    const size = Math.max(...nums) + 1;
    const counts: number[] = new Array(size).fill(0);
    const out: (number | null)[] = new Array(n).fill(null);
    const outId: (number | null)[] = new Array(n).fill(null);
    const labels = Array.from({ length: size }, (_, v) => String(v));

    const input = (cur: number | null, doneFrom: 'start' | 'end' | 'none'): Panel => {
      const tones: Record<number, Tone> = {};
      if (doneFrom === 'start') for (let k = 0; cur !== null && k < cur; k++) tones[k] = 'visited';
      if (doneFrom === 'end') for (let k = n - 1; cur !== null && k > cur; k--) tones[k] = 'visited';
      if (cur !== null) tones[cur] = 'active';
      return bars(
        nums.map((v, i) => ({ v, id: i })),
        { title: 'nums (input)', tones, pointers: cur !== null ? { x: cur } : undefined },
      );
    };
    const countsPanel = (hot: Record<number, Tone> = {}, title = 'counts (index = value)'): Panel => ({ type: 'array', title, values: [...counts], tones: hot, indexLabels: labels });
    const outPanel = (justPlaced: number | null): Panel => {
      const tones: Record<number, Tone> = {};
      out.forEach((v, k) => {
        if (v !== null) tones[k] = 'done';
      });
      if (justPlaced !== null) tones[justPlaced] = 'swap';
      return bars(
        out.map((v, k) => ({ v, id: outId[k] === null ? `empty${k}` : outId[k]! })),
        { title: 'out', tones },
      );
    };

    r.step('alloc', `max = ${size - 1}, so counts has ${size} slots (one per value 0..${size - 1})`, [input(null, 'none'), countsPanel()], { max: size - 1 });
    for (let i = 0; i < n; i++) {
      const x = nums[i];
      counts[x]++;
      r.op();
      r.step('count', `Read ${x} → counts[${x}] = ${counts[x]} (seen ${counts[x]} time${counts[x] === 1 ? '' : 's'})`, [input(i, 'start'), countsPanel({ [x]: 'swap' })], { x, [`counts[${x}]`]: counts[x] });
    }
    r.step('prefixLoop', 'Prefix sums: counts[v] will mean "how many items are ≤ v"', [input(null, 'none'), countsPanel(Object.fromEntries(counts.map((_, v) => [v, 'frontier' as Tone])))], {});
    for (let v = 1; v < size; v++) {
      const before = counts[v];
      counts[v] += counts[v - 1];
      r.op();
      r.step('prefix', `counts[${v}] = ${before} + ${counts[v - 1]} = ${counts[v]}: ${counts[v]} item${counts[v] === 1 ? ' is' : 's are'} ≤ ${v}`, [input(null, 'none'), countsPanel({ [v]: 'swap', [v - 1]: 'compare' })], { v, [`counts[${v}]`]: counts[v] });
    }
    r.step('out', `Allocate out with ${n} empty slots; counts[v] = one past the last slot of value v`, [input(null, 'none'), countsPanel(), outPanel(null)], { n });
    for (let i = n - 1; i >= 0; i--) {
      const x = nums[i];
      counts[x]--;
      r.op();
      r.step('dec', `x = ${x}: counts[${x}] -= 1 → next free slot for ${x} is ${counts[x]}`, [input(i, 'end'), countsPanel({ [x]: 'compare' }), outPanel(null)], { x, slot: counts[x] });
      out[counts[x]] = x;
      outId[counts[x]] = i;
      r.op();
      r.step('place', `out[${counts[x]}] = ${x} (scanning from the right keeps equal items in order)`, [input(i, 'end'), countsPanel({ [x]: 'compare' }), outPanel(counts[x])], { x, slot: counts[x] });
    }
    r.step('done', `Sorted without comparing items: ${show(out)}`, [input(null, 'none'), countsPanel(), outPanel(null)], {});
    return { frames: r.frames, result: out as number[] };
  },
  reference: ({ nums }) => sortedCopy(nums),
};

const tests = [
  { args: [[4, 2, 2, 8, 3, 3, 1]], expected: [1, 2, 2, 3, 3, 4, 8] },
  { args: [[1, 0]], expected: [0, 1], name: 'two items' },
  { args: [[1, 2, 3, 4]], expected: [1, 2, 3, 4], name: 'already sorted' },
  { args: [[5, 4, 3, 2, 1, 0]], expected: [0, 1, 2, 3, 4, 5], name: 'reversed with zero' },
  { args: [[2, 2, 2, 1, 1]], expected: [1, 1, 2, 2, 2], name: 'duplicates' },
  { args: [[9, 0, 9, 0]], expected: [0, 0, 9, 9], name: 'gap in values' },
  { args: [[7]], expected: [7], name: 'single element' },
  { args: [[]], expected: [], name: 'empty' },
];

const unit: Unit = {
  id: 'counting-sort',
  hook: 'Counting sort beats the O(n log n) comparison-sort limit by never comparing items, and its prefix-sum + backwards-fill trick is the core of radix sort. Interviewers ask when it applies and why the output pass must go right to left.',
  predict: {
    prompt: 'Counting sort runs on [3, 1, 3, 0]. After the prefix-sum phase, what is the counts array (index = value)?',
    options: ['[1, 1, 0, 2]', '[1, 2, 2, 4]', '[1, 2, 3, 5]', '[0, 1, 2, 2]'],
    answer: 1,
    explain: 'Raw counts are [1, 1, 0, 2] (one 0, one 1, no 2, two 3s). Running sums give [1, 2, 2, 4]: counts[3] = 4 means all 4 items are ≤ 3, so the last 3 belongs at output index 3.',
  },
  viz,
  deeper: {
    points: [
      'Three passes: count each value, turn the counts into prefix sums (counts[v] = number of items ≤ v), then place items into the output.',
      'The prefix sum tells each value where its block ENDS. Decrementing before writing puts items from the back of their block forward.',
      'Walking the input right to left makes the sort stable: the last equal item goes to the last slot. Stability matters when counting sort is a step in radix sort or sorts records by a key.',
      'Only valid when keys are small non-negative integers (or can be mapped to them). With k = max + 1 slots, the cost is O(n + k): great for ages or scores, terrible for 10^9-sized values.',
    ],
    complexity: { time: 'O(n + k) where k = max value + 1', space: 'O(n + k)' },
    pitfalls: ['counts of size `max(nums)` instead of `max(nums) + 1` (index error on the largest value)', 'Using it on negatives or huge ranges without an offset or a different algorithm', 'Filling the output left to right, which silently loses stability for records'],
  },
  practice: {
    language: 'python',
    fnName: 'counting_sort',
    statement: 'Sort a list of non-negative integers with a stable counting sort: count each value, convert the counts into prefix sums, then fill an output list. Return the new sorted list (an empty input returns an empty list).',
    signature: 'def counting_sort(nums):',
    solution: `def counting_sort(nums):
    if not nums:
        return []
    counts = [0] * (@@max(nums) + 1@@)
    for x in nums:
        counts[x] @@+= 1@@
    for v in range(1, len(counts)):
        counts[v] @@+=@@ counts[v - 1]
    out = [0] * len(nums)
    for x in @@reversed(nums)@@:
        counts[x] @@-= 1@@
        out[@@counts[x]@@] = x
    return out`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'counting_sort',
    statement: 'This counting sort crashes with an IndexError. Find and fix the bug.',
    buggy: `def counting_sort(nums):
    if not nums:
        return []
    counts = [0] * max(nums)
    for x in nums:
        counts[x] += 1
    for v in range(1, len(counts)):
        counts[v] += counts[v - 1]
    out = [0] * len(nums)
    for x in reversed(nums):
        counts[x] -= 1
        out[counts[x]] = x
    return out`,
    fixed: `def counting_sort(nums):
    if not nums:
        return []
    counts = [0] * (max(nums) + 1)
    for x in nums:
        counts[x] += 1
    for v in range(1, len(counts)):
        counts[v] += counts[v - 1]
    out = [0] * len(nums)
    for x in reversed(nums):
        counts[x] -= 1
        out[counts[x]] = x
    return out`,
    tests,
    bugType: 'off-by-one',
    hint: 'The counts array is indexed BY VALUE. Which index does the largest value need, and how many slots does that require?',
    explanation: 'Values 0..max need max + 1 slots. With only `max` slots, counts[max] is out of range, so the largest value crashes the first counting loop. Allocate `max(nums) + 1`.',
  },
  boss: {
    title: 'H-index',
    statement: 'A researcher has papers with the given citation counts. Their h-index is the largest h such that at least h papers have at least h citations each. Return it in O(n) time using a counting approach (no sorting).',
    language: 'python',
    fnName: 'h_index',
    starter: `def h_index(citations):
    # your code here
    pass
`,
    solution: `def h_index(citations):
    n = len(citations)
    counts = [0] * (n + 1)
    for c in citations:
        counts[min(c, n)] += 1
    total = 0
    for h in range(n, -1, -1):
        total += counts[h]
        if total >= h:
            return h
    return 0`,
    tests: [
      { args: [[3, 0, 6, 1, 5]], expected: 3 },
      { args: [[1, 3, 1]], expected: 1 },
      { args: [[0, 0]], expected: 0, name: 'no citations' },
      { args: [[10]], expected: 1, name: 'one big paper' },
      { args: [[4, 4, 4, 4]], expected: 4, name: 'all equal to n' },
      { args: [[]], expected: 0, name: 'no papers' },
    ],
    hints: ['The answer can never exceed the number of papers n, so a citation count above n is as good as n. Bucket the counts into indices 0..n.', 'Scan h from n down to 0, adding counts[h] to a running total of papers with at least h citations. The first h where total >= h is the answer.'],
    combines: ['prefix-sum'],
  },
  quiz: [
    {
      prompt: 'You must sort 1,000 integers that range from 0 to 1,000,000,000. Is counting sort a good choice?',
      options: ['Yes, it is always O(n)', 'No, the counts array would need a billion slots', 'Yes, but only if the numbers are sorted already', 'No, because it cannot handle duplicates'],
      answer: 1,
      explain: 'Counting sort costs O(n + k) with k = max + 1. A huge range makes k enormous, so a comparison sort is far better here.',
    },
  ],
};

export default unit;
