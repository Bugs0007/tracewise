import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, ChartPanel, KVPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, BIG_HARNESS } from '@/content/lib/hashing-bits';

const code = `
def has_dup_slow(nums):
    for i in range(len(nums)):               #@sOuter
        for j in range(i + 1, len(nums)):    #@sInner
            if nums[i] == nums[j]:           #@sCmp
                return True                  #@sHit
    return False                             #@sMiss

def has_dup_fast(nums):
    seen = set()                             #@fInit
    for x in nums:                           #@fLoop
        if x in seen:                        #@fCheck
            return True                      #@fHit
        seen.add(x)                          #@fAdd
    return False                             #@fMiss
`;

interface In {
  nums: number[];
}

const log2 = (x: number) => Math.log2(Math.max(1, x));

const viz: VizDef<In> = {
  id: 'big-o',
  title: 'Big-O growth and operation counts',
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Input list (n = its length)', kind: 'numbers', default: [3, 9, 14, 1, 8, 20, 5, 11, 17, 2, 7, 6], maxItems: 24, help: 'Both functions run on this same list and count their elementary steps.' }],
  presets: [
    { label: 'No duplicate, n = 12', input: { nums: [3, 9, 14, 1, 8, 20, 5, 11, 17, 2, 7, 6] } },
    { label: 'Duplicate at the end', input: { nums: [4, 8, 15, 16, 23, 42, 9, 12, 4] } },
    { label: 'Bigger input, n = 24', input: { nums: Array.from({ length: 24 }, (_, i) => i * 3 + 1) } },
    { label: 'Tiny input', input: { nums: [5, 7] } },
  ],
  run({ nums }) {
    const n = nums.length;
    if (n < 1) throw new Error('Add at least one number');
    const r = new Recorder(code);
    let slow = 0;
    let fast = 0;

    const growth = (): ChartPanel => {
      const xs = Array.from({ length: Math.max(2, n) }, (_, i) => i + 1);
      return {
        type: 'chart',
        title: `operations as the input grows to n = ${n}`,
        xLabel: 'input size n',
        yLabel: 'operations',
        marker: n,
        series: [
          { label: 'O(1)', points: xs.map((x) => [x, 1]), tone: 'found' },
          { label: 'O(log n)', points: xs.map((x) => [x, log2(x)]), tone: 'done' },
          { label: 'O(n)', points: xs.map((x) => [x, x]), tone: 'active' },
          { label: 'O(n log n)', points: xs.map((x) => [x, x * log2(x)]), tone: 'swap' },
          { label: 'O(n²)', points: xs.map((x) => [x, x * x]), tone: 'error' },
        ],
      };
    };
    const counters = (): ChartPanel => ({
      type: 'chart',
      kind: 'bar',
      title: 'steps counted so far',
      xLabel: 'left: nested loops, right: hash set',
      yLabel: 'steps',
      series: [
        { label: `nested loops: ${slow}`, points: [[1, slow]], tone: 'error' },
        { label: `hash set: ${fast}`, points: [[2, fast]], tone: 'done' },
      ],
    });
    const arr = (tones: Record<number, Tone>, ptr?: Record<string, number>): ArrayPanel => ({ type: 'array', title: `nums (n = ${n})`, values: nums, tones, pointers: ptr });
    const vars = (extra: Record<string, unknown> = {}) => ({ n, slow_ops: slow, fast_ops: fast, ...extra });

    r.step('sOuter', `n = ${n}. Plot every common growth rate up to n, then count real steps on this list`, [growth(), arr({})], vars());

    // Phase 1: nested loops
    let dup = false;
    for (let i = 0; i < n; i++) {
      let j = -1;
      for (let k = i + 1; k < n; k++)
        if (nums[k] === nums[i]) {
          j = k;
          break;
        }
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < i; k++) tones[k] = 'visited';
      tones[i] = 'active';
      if (j >= 0) {
        slow += j - i;
        r.op(j - i);
        tones[j] = 'found';
        r.step('sCmp', cap(`i = ${i}: nums[${i}] == nums[${j}] after ${j - i} comparisons. Duplicate!`), [arr(tones, { i, j }), counters()], vars({ i, j }));
        r.step('sHit', `Nested loops stop here with ${slow} comparisons`, [arr(tones, { i, j }), counters()], vars({ result: 'True' }));
        dup = true;
        break;
      }
      const c = n - 1 - i;
      slow += c;
      r.op(c);
      r.step('sInner', cap(`i = ${i}: compare nums[${i}] with ${c} later item${c === 1 ? '' : 's'} (${slow} comparisons so far)`), [arr(tones, { i }), counters()], vars({ i }));
    }
    if (!dup) r.step('sMiss', `No duplicate: the nested loops needed ${slow} comparisons for n = ${n}`, [arr(Object.fromEntries(nums.map((_, k) => [k, 'visited'])) as Record<number, Tone>), counters()], vars({ result: 'False' }));

    // Phase 2: hash set
    const seen: number[] = [];
    const seenPanel = (): KVPanel => ({ type: 'kv', title: `seen set (${seen.length} items)`, entries: seen.map((x) => ({ k: String(x), v: 'in set' })) });
    r.step('fInit', 'Now the same input with a set: one pass, one lookup per item', [arr({}), seenPanel(), counters()], vars());
    let found = false;
    for (let i = 0; i < n; i++) {
      const x = nums[i];
      fast++;
      r.op();
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < i; k++) tones[k] = 'visited';
      if (seen.includes(x)) {
        tones[i] = 'found';
        const j = nums.indexOf(x);
        tones[j] = 'found';
        r.step('fCheck', cap(`x = ${x} is already in seen: one lookup, duplicate found (${fast} lookups total)`), [arr(tones, { i }), seenPanel(), counters()], vars({ i, x }));
        r.step('fHit', 'Set version stops here', [arr(tones, { i }), seenPanel(), counters()], vars({ result: 'True' }));
        found = true;
        break;
      }
      seen.push(x);
      tones[i] = 'new';
      r.step('fAdd', cap(`x = ${x}: not in seen (1 lookup), add it. ${fast} lookup${fast === 1 ? '' : 's'} so far`), [arr(tones, { i }), seenPanel(), counters()], vars({ i, x }));
    }
    if (!found) r.step('fMiss', `No duplicate: the set version used ${fast} lookups`, [arr(Object.fromEntries(nums.map((_, k) => [k, 'visited'])) as Record<number, Tone>), seenPanel(), counters()], vars({ result: 'False' }));

    const ratio = Math.round((slow / Math.max(1, fast)) * 10) / 10;
    const finalPanels: Panel[] = [growth(), counters()];
    r.step('fMiss', cap(`Same answer, ${slow} vs ${fast} steps (${ratio}x). Slow grows like n², fast like n`), finalPanels, vars({ ratio }));
    return { frames: r.frames, result: { hasDuplicate: dup, slow, fast } };
  },
  reference({ nums }) {
    const n = nums.length;
    // total pair comparisons until the first duplicate pair is reached in row-major order
    let slow = 0;
    let dup = false;
    outer: for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        slow++;
        if (nums[i] === nums[j]) {
          dup = true;
          break outer;
        }
      }
    }
    const firstRepeat = nums.findIndex((x, i) => nums.indexOf(x) !== i);
    return { hasDuplicate: dup, slow, fast: firstRepeat === -1 ? n : firstRepeat + 1 };
  },
};

const tests = [
  { args: [[1, 2, 3, 1]], expected: true },
  { args: [[1, 2, 3, 4]], expected: false },
  { args: [[]], expected: false, name: 'empty list' },
  { args: [[7]], expected: false, name: 'single value' },
  { args: [[0, 0]], expected: true, name: 'two equal values' },
  { args: [[], 40000, -1], expected: false, name: 'large input, no duplicate' },
  { args: [[], 40000, 12345], expected: true, name: 'large input, duplicate at the end' },
];

const unit: Unit = {
  id: 'big-o',
  hook: 'Every interview ends with "what is the time complexity, and can you do better?" Knowing how fast each shape grows lets you answer in one sentence, and spot the hidden O(n) inside an innocent-looking `in`.',
  predict: {
    prompt: 'A nested loop compares every pair of items once: for i in range(n): for j in range(i + 1, n). About how many comparisons for n = 1,000?',
    options: ['1,000', '10,000', 'about 500,000', 'about 1,000,000,000'],
    answer: 2,
    explain: 'There are n(n - 1) / 2 = 499,500 pairs. Doubling n quadruples that, which is what O(n²) means. A hash set needs just 1,000 lookups for the same job.',
  },
  viz,
  deeper: {
    points: [
      'Big-O describes how the number of steps grows with input size n, ignoring constant factors: O(1) < O(log n) < O(n) < O(n log n) < O(n²).',
      'Nested loops over the input multiply (n × n). Sequential loops add (n + n is still O(n)). Halving the problem each step gives log n.',
      'A hash set or dict trades O(n) extra space for O(1) average lookups, turning "search the rest" from O(n) into O(1).',
      'Watch hidden loops: `x in some_list`, `list.pop(0)`, `list.insert(0, x)`, slicing, `sorted(...)` and string `+=` each cost O(n) or more.',
    ],
    complexity: { time: 'Nested loops O(n²); set version O(n)', space: 'Nested loops O(1); set version O(n)' },
    pitfalls: ['`if x in seen_list` inside a loop is O(n²) even though it looks like one loop', 'Quoting only the time and forgetting the extra space of the faster approach', 'Calling O(1) lookups "free": the hash must be computed and collisions are possible (worst case O(n))'],
  },
  practice: {
    language: 'python',
    fnName: 'contains_duplicate',
    harness: BIG_HARNESS,
    adapter: 'run_dup',
    statement: 'Return True if any value in `nums` appears at least twice. Some tests have tens of thousands of numbers, so a nested loop or `x in some_list` inside a loop is too slow: use a set.',
    signature: 'def contains_duplicate(nums):',
    solution: `def contains_duplicate(nums):
    seen = set()
    for x in nums:
        if @@x in seen@@:
            return @@True@@
        seen.@@add@@(x)
    return @@False@@`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'contains_duplicate',
    harness: BIG_HARNESS,
    adapter: 'run_dup',
    statement: 'This function gives the right answer, but it times out on large inputs. Find the line that quietly makes it O(n²) and fix it.',
    buggy: `def contains_duplicate(nums):
    seen = []
    for x in nums:
        if x in seen:
            return True
        seen.append(x)
    return False`,
    fixed: `def contains_duplicate(nums):
    seen = set()
    for x in nums:
        if x in seen:
            return True
        seen.add(x)
    return False`,
    tests,
    bugType: 'hidden O(n) lookup',
    hint: 'There is only one loop, yet the work grows quadratically. What does `x in seen` do when seen is a list?',
    explanation: '`x in seen` on a list scans it from the start, so each iteration costs O(n) and the whole function O(n²). Using a set (hash lookups) keeps each check O(1) on average and the function O(n). The result is identical, only the speed changes.',
  },
  boss: {
    title: 'Intersection of Two Arrays',
    statement: 'Given two lists of integers, return the sorted list of distinct values that appear in both. Large inputs are tested, so aim for O(n + m) lookups plus the final sort.',
    language: 'python',
    fnName: 'intersect',
    harness: BIG_HARNESS,
    adapter: 'run_pair',
    starter: `def intersect(a, b):
    # your code here
    pass
`,
    solution: `def intersect(a, b):
    in_b = set(b)
    return sorted({x for x in a if x in in_b})`,
    tests: [
      { args: [[1, 2, 2, 1], [2, 2]], expected: [2] },
      { args: [[4, 9, 5], [9, 4, 9, 8, 4]], expected: [4, 9] },
      { args: [[], [1, 2]], expected: [], name: 'one list is empty' },
      { args: [[1, 2, 3], [4, 5, 6]], expected: [], name: 'nothing in common' },
      { args: [[-1, 0, 3], [3, -1, 7]], expected: [-1, 3], name: 'negative values' },
      { args: [[], [], 30000], expected: 10000, name: 'large lists (count of common values)' },
    ],
    hints: ['Checking each item of a against the whole of b is a hidden nested loop. Which container answers "is x in b?" in O(1)?', 'Build set(b) once, then keep the x from a that are in it. Collect them in a set to drop duplicates and sort at the end.'],
    combines: ['hash-set', 'hash-chaining'],
  },
  quiz: [
    {
      prompt: 'A function has two separate for-loops over the same list, one after the other. Its time complexity is:',
      options: ['O(n²)', 'O(n)', 'O(2^n)', 'O(log n)'],
      answer: 1,
      explain: 'Sequential loops add: n + n = 2n, which is O(n). Only nested loops multiply.',
    },
  ],
};

export default unit;
