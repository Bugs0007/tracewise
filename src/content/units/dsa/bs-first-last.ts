import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def find_edge(nums, target, first):
    lo, hi = 0, len(nums) - 1             #@init
    edge = -1                             #@edge
    while lo <= hi:                       #@loop
        mid = (lo + hi) // 2              #@mid
        if nums[mid] < target:            #@less
            lo = mid + 1                  #@moveLo
        elif nums[mid] > target:          #@greater
            hi = mid - 1                  #@moveHi
        else:
            edge = mid                    #@hit
            if first:
                hi = mid - 1              #@keepLeft
            else:
                lo = mid + 1              #@keepRight
    return edge                           #@done

def search_range(nums, target):
    return [find_edge(nums, target, True), find_edge(nums, target, False)]   #@both
`;

interface In {
  nums: number[];
  target: number;
}

const viz: VizDef<In> = {
  id: 'bs-first-last',
  title: 'First and last occurrence with two binary searches',
  code,
  language: 'python',
  inputs: [
    { key: 'nums', label: 'Sorted array (duplicates allowed)', kind: 'numbers', default: [1, 3, 5, 5, 5, 5, 8, 9], maxItems: 14 },
    { key: 'target', label: 'Target', kind: 'number', default: 5 },
  ],
  presets: [
    { label: 'Run of 5s', input: { nums: [1, 3, 5, 5, 5, 5, 8, 9], target: 5 } },
    { label: 'Missing', input: { nums: [1, 3, 5, 5, 8, 9], target: 4 } },
    { label: 'Single match', input: { nums: [1, 3, 5, 7, 9], target: 7 } },
    { label: 'All equal', input: { nums: [2, 2, 2, 2, 2], target: 2 } },
  ],
  run({ nums: raw, target }) {
    if (!Array.isArray(raw) || raw.length === 0) throw new Error('Enter at least one number');
    const r = new Recorder(code);
    const nums = [...raw].sort((a, b) => a - b);
    const sortedNote = nums.some((v, i) => v !== raw[i]) ? ' (input sorted first)' : '';
    const settled: Record<number, Tone> = {};

    const view = (title: string, lo: number, hi: number, edge: number, mid?: number, hot: Record<number, Tone> = {}): ArrayPanel => {
      const tones: Record<number, Tone> = { ...settled };
      nums.forEach((_, i) => {
        if (i < lo || i > hi) tones[i] = settled[i] ?? 'muted';
      });
      if (edge >= 0) tones[edge] = 'found';
      if (mid !== undefined) tones[mid] = 'compare';
      Object.assign(tones, hot);
      const pointers: Record<string, number> = { lo, hi };
      if (mid !== undefined) pointers.mid = mid;
      if (edge >= 0) pointers.edge = edge;
      return { type: 'array', title, values: nums, tones, pointers, range: lo <= hi ? { from: lo, to: hi, label: 'search space' } : undefined };
    };

    const findEdge = (first: boolean): number => {
      const title = first ? 'Search 1 — FIRST occurrence' : 'Search 2 — LAST occurrence';
      let lo = 0;
      let hi = nums.length - 1;
      let edge = -1;
      r.step('init', `${first ? 'Search 1: first' : 'Search 2: last'} occurrence of ${target}. Search space 0..${hi}${first ? sortedNote : ''}`, [view(title, lo, hi, edge)], { lo, hi, target, edge });
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        r.op();
        r.step('mid', `mid = (${lo} + ${hi}) // 2 = ${mid}, nums[${mid}] = ${nums[mid]}`, [view(title, lo, hi, edge, mid)], { lo, hi, mid, edge });
        if (nums[mid] < target) {
          r.step('less', `${nums[mid]} < ${target}: target can only be to the right`, [view(title, lo, hi, edge, mid)], { lo, hi, mid, edge });
          lo = mid + 1;
          r.step('moveLo', `lo = ${lo}`, [view(title, lo, hi, edge)], { lo, hi, edge });
        } else if (nums[mid] > target) {
          r.step('greater', `${nums[mid]} > ${target}: target can only be to the left`, [view(title, lo, hi, edge, mid)], { lo, hi, mid, edge });
          hi = mid - 1;
          r.step('moveHi', `hi = ${hi}`, [view(title, lo, hi, edge)], { lo, hi, edge });
        } else {
          edge = mid;
          r.step('hit', `nums[${mid}] = ${target}: remember edge = ${edge}, but keep looking ${first ? 'left' : 'right'} for a better one`, [view(title, lo, hi, edge, mid, { [mid]: 'found' })], { lo, hi, mid, edge });
          if (first) {
            hi = mid - 1;
            r.step('keepLeft', `Discard mid and everything right of it → hi = ${hi}`, [view(title, lo, hi, edge)], { lo, hi, edge });
          } else {
            lo = mid + 1;
            r.step('keepRight', `Discard mid and everything left of it → lo = ${lo}`, [view(title, lo, hi, edge)], { lo, hi, edge });
          }
        }
      }
      r.step('done', edge < 0 ? `Search space empty, ${target} is absent → ${edge}` : `Search space empty → the ${first ? 'first' : 'last'} ${target} is at index ${edge}`, [view(title, lo, hi, edge)], { lo, hi, edge });
      if (edge >= 0) settled[edge] = 'done';
      return edge;
    };

    const firstIdx = findEdge(true);
    const lastIdx = findEdge(false);
    r.step('both', firstIdx < 0 ? `${target} does not occur → [-1, -1]` : `${target} occupies indices ${firstIdx}..${lastIdx} (${lastIdx - firstIdx + 1} copies)`, [view('Result', 1, 0, -1, undefined, firstIdx >= 0 ? { [firstIdx]: 'found', [lastIdx]: 'found' } : {})], { first: firstIdx, last: lastIdx });
    return { frames: r.frames, result: [firstIdx, lastIdx] };
  },
  reference({ nums, target }) {
    const s = [...nums].sort((a, b) => a - b);
    return [s.indexOf(target), s.lastIndexOf(target)];
  },
};

const tests = [
  { args: [[5, 7, 7, 8, 8, 10], 8], expected: [3, 4] },
  { args: [[5, 7, 7, 8, 8, 10], 6], expected: [-1, -1], name: 'missing' },
  { args: [[], 0], expected: [-1, -1], name: 'empty' },
  { args: [[1], 1], expected: [0, 0], name: 'single match' },
  { args: [[2, 2, 2, 2], 2], expected: [0, 3], name: 'all equal' },
  { args: [[1, 2, 3], 2], expected: [1, 1], name: 'one copy' },
  { args: [[1, 3, 5], 5], expected: [2, 2], name: 'at the end' },
  { args: [[1, 1, 3, 5], 1], expected: [0, 1], name: 'at the start' },
];

const unit: Unit = {
  id: 'bs-first-last',
  hook: 'Plain binary search returns whichever match it happens to land on. Real questions ask for the first or last one - or how many there are - and the fix (keep searching after a hit) is a favourite follow-up.',
  predict: {
    prompt: 'nums = [1, 3, 5, 5, 5, 5, 8, 9], target 5. A normal binary search stops the moment nums[mid] == 5. Which index does it return?',
    options: ['2 (the first 5)', '3 (the first probe, mid = 3)', '5 (the last 5)', 'It cannot say - any of the 5s is possible by design'],
    answer: 1,
    explain: 'mid = (0 + 7) // 2 = 3 and nums[3] = 5, so it returns 3 immediately. That is neither the first (2) nor the last (5) copy, which is why boundary searches keep going after a hit.',
  },
  viz,
  deeper: {
    points: [
      'On a hit, record the index as a candidate edge and keep shrinking toward the side you care about: hi = mid - 1 for the first copy, lo = mid + 1 for the last.',
      'When the loop ends, the last candidate recorded is the boundary (or -1 if there was never a hit).',
      'Count of a value = last - first + 1; "insert position" and bisect_left / bisect_right are the same idea.',
      'Two O(log n) searches beat a linear scan for the matching run, which could be the entire array.',
    ],
    complexity: { time: 'O(log n)', space: 'O(1)' },
    pitfalls: ['Returning at the first hit', 'Using the same shrink direction for both searches', 'Forgetting to store the candidate before moving a pointer'],
  },
  practice: {
    language: 'python',
    fnName: 'search_range',
    statement: 'In the sorted list `nums` (duplicates allowed) return `[first, last]`, the first and last index of `target`, or `[-1, -1]` if it is absent. Use two binary searches.',
    signature: 'def search_range(nums, target):',
    solution: `def find_edge(nums, target, first):
    lo, hi = 0, @@len(nums) - 1@@
    edge = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] < target:
            lo = mid + 1
        elif @@nums[mid] > target@@:
            hi = mid - 1
        else:
            edge = @@mid@@
            if @@first@@:
                hi = @@mid - 1@@
            else:
                lo = @@mid + 1@@
    return edge

def search_range(nums, target):
    return [find_edge(nums, target, True), find_edge(nums, target, False)]`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'search_range',
    statement: 'The first index is right but the last index always equals it when there are duplicates. Find the bug.',
    buggy: `def find_edge(nums, target, first):
    lo, hi = 0, len(nums) - 1
    edge = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] < target:
            lo = mid + 1
        elif nums[mid] > target:
            hi = mid - 1
        else:
            edge = mid
            if first:
                hi = mid - 1
            else:
                hi = mid - 1
    return edge

def search_range(nums, target):
    return [find_edge(nums, target, True), find_edge(nums, target, False)]`,
    fixed: `def find_edge(nums, target, first):
    lo, hi = 0, len(nums) - 1
    edge = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] < target:
            lo = mid + 1
        elif nums[mid] > target:
            hi = mid - 1
        else:
            edge = mid
            if first:
                hi = mid - 1
            else:
                lo = mid + 1
    return edge

def search_range(nums, target):
    return [find_edge(nums, target, True), find_edge(nums, target, False)]`,
    tests,
    bugType: 'wrong boundary update',
    hint: 'To find the LAST copy, which side of mid still holds candidates after a hit?',
    explanation: 'Both branches discard the right half, so the "last" search behaves exactly like the "first" one. After a hit, the last copy can only be at mid or to its right: move lo = mid + 1 (edge already remembers mid).',
  },
  boss: {
    title: 'Count values in a range',
    statement: 'Given a sorted list of integers, count how many items x satisfy low <= x <= high (low <= high, duplicates allowed). It must run in O(log n), so use binary search instead of scanning.',
    language: 'python',
    fnName: 'count_in_range',
    starter: `def count_in_range(nums, low, high):
    # your code here
    pass
`,
    solution: `def count_in_range(nums, low, high):
    def first_at_least(x):
        lo, hi = 0, len(nums)
        while lo < hi:
            mid = (lo + hi) // 2
            if nums[mid] < x:
                lo = mid + 1
            else:
                hi = mid
        return lo

    return first_at_least(high + 1) - first_at_least(low)`,
    tests: [
      { args: [[1, 2, 2, 3, 5, 8], 2, 5], expected: 4 },
      { args: [[], 1, 2], expected: 0, name: 'empty' },
      { args: [[1, 1, 1], 1, 1], expected: 3, name: 'all equal' },
      { args: [[1, 3, 5], 6, 9], expected: 0, name: 'range above everything' },
      { args: [[1, 3, 5], -5, 0], expected: 0, name: 'range below everything' },
      { args: [[1, 3, 5], 0, 10], expected: 3, name: 'range covers everything' },
      { args: [[1, 3, 5], 4, 4], expected: 0, name: 'gap between values' },
    ],
    hints: ['Count = (index of the first value > high) - (index of the first value >= low). Each one is a boundary search.', 'Write first_at_least(x) with lo, hi = 0, len(nums) and hi = mid on nums[mid] >= x. Then use first_at_least(high + 1) - first_at_least(low).'],
    combines: ['bs-first-last', 'binary-search'],
  },
};

export default unit;
