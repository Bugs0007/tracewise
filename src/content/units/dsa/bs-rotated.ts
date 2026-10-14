import { Recorder } from '@/engine/recorder';
import type { Panel, VizDef } from '@/engine/types';
import { chain, decisionView, isEmpty, roleArray, spanText, valueRangeView, type Span } from '@/dsa/viz/decision';
import type { Unit } from '@/content/types';

const code = `
def search_rotated(nums, target):
    lo, hi = 0, len(nums) - 1                  #@init
    while lo <= hi:                            #@loop
        mid = (lo + hi) // 2                   #@mid
        if nums[mid] == target:                #@check
            return mid                         #@found
        if nums[lo] <= nums[mid]:              #@sortedLeft
            if nums[lo] <= target < nums[mid]: #@inLeft
                hi = mid - 1                   #@goLeft
            else:
                lo = mid + 1                   #@goRight
        else:
            if nums[mid] < target <= nums[hi]: #@inRight
                lo = mid + 1                   #@goRight2
            else:
                hi = mid - 1                   #@goLeft2
    return -1                                  #@missing
`;

interface In {
  nums: number[];
  target: number;
}

function validateRotated(nums: number[]) {
  if (!Array.isArray(nums) || nums.length === 0) throw new Error('Enter at least one number');
  if (new Set(nums).size !== nums.length) throw new Error('Values must be distinct for this version of the search');
  let drops = 0;
  for (let i = 1; i < nums.length; i++) if (nums[i] < nums[i - 1]) drops++;
  if (drops > 1 || (drops === 1 && nums[nums.length - 1] > nums[0])) throw new Error('The array must be a sorted array rotated by some amount, e.g. 4, 5, 6, 7, 0, 1, 2');
}

const viz: VizDef<In> = {
  id: 'bs-rotated',
  title: 'Search in a rotated sorted array',
  code,
  language: 'python',
  inputs: [
    { key: 'nums', label: 'Rotated sorted array (distinct)', kind: 'numbers', default: [4, 5, 6, 7, 0, 1, 2], maxItems: 12 },
    { key: 'target', label: 'Target', kind: 'number', default: 0 },
  ],
  presets: [
    { label: 'Found right of pivot', input: { nums: [4, 5, 6, 7, 0, 1, 2], target: 0 } },
    { label: 'Missing', input: { nums: [4, 5, 6, 7, 0, 1, 2], target: 3 } },
    { label: 'Found left of pivot', input: { nums: [6, 7, 8, 1, 2, 3, 4], target: 7 } },
    { label: 'Not rotated', input: { nums: [1, 3, 5, 7, 9], target: 9 } },
    { label: 'Two items', input: { nums: [3, 1], target: 1 } },
  ],
  why: [
    'Rotating a sorted list creates exactly one drop. Around any mid that drop sits in at most one half, so at least one half is always in perfect order.',
    'A sorted half is a ruler: its two end values bound everything inside it, so two comparisons say for certain whether the target could be in it. The other half cannot be tested that way.',
    'So the sorted half is a test, not a choice. If the target fits inside it, keep that half. If not, keep the other half, even though it is the messy one.',
  ],
  run({ nums, target }) {
    validateRotated(nums);
    const r = new Recorder(code);
    let lo = 0;
    let hi = nums.length - 1;
    const title = (extra = '') => `Rotated array — looking for ${target}${extra}`;
    /** the plain search-space view used between decisions */
    const plain = (mid?: number, found = false): Panel[] => {
      const arr = roleArray(nums, { title: title(), window: [lo, hi], pointers: { lo, hi, ...(mid !== undefined ? { mid } : {}) }, bracket: { span: [lo, hi], label: 'search space', tone: 'active' } });
      if (mid !== undefined) arr.tones = { ...arr.tones, [mid]: found ? 'found' : 'compare' };
      return [arr];
    };
    r.step('init', `Search space is the whole array: ${lo}..${hi}`, plain(), { lo, hi, target });
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      r.op();
      r.step('mid', `mid = (${lo} + ${hi}) // 2 = ${mid}, nums[${mid}] = ${nums[mid]}`, plain(mid), { lo, hi, mid, target });
      if (nums[mid] === target) {
        r.step('check', `nums[${mid}] equals ${target}`, plain(mid, true), { lo, hi, mid, target });
        r.step('found', `Found ${target} at index ${mid}`, plain(mid, true), { mid, result: mid });
        return { frames: r.frames, result: mid };
      }
      r.op();

      // ── A: which half is sorted? ──────────────────────────────
      const leftSorted = nums[lo] <= nums[mid];
      const ruler: Span = leftSorted ? [lo, mid] : [mid, hi];
      const rulerName = leftSorted ? 'left' : 'right';
      const [a, b] = [nums[ruler[0]], nums[ruler[1]]];
      const rangeText = `${a} and ${b}`;
      const sortedKeep: Span = leftSorted ? [lo, mid - 1] : [mid + 1, hi];
      const otherKeep: Span = leftSorted ? [mid + 1, hi] : [lo, mid - 1];
      const pointers = { lo, hi, mid };
      const bracket = { span: ruler, label: `sorted half = the ruler (${a} … ${b})`, tone: 'ruler' as const };
      r.step(
        'sortedLeft',
        leftSorted ? `Which half is sorted? nums[${lo}]=${nums[lo]} ≤ nums[${mid}]=${nums[mid]}, so the left half ${lo}..${mid} is sorted. It is only the ruler for the next test.` : `Which half is sorted? nums[${lo}]=${nums[lo]} > nums[${mid}]=${nums[mid]}: the pivot is on the left, so the right half ${mid}..${hi} is sorted. It is only the ruler for the next test.`,
        [
          roleArray(nums, { title: title('  ·  dashed = the sorted half, used as a ruler'), window: [lo, hi], ruler, compared: [lo, mid], pointers, bracket }),
          decisionView({
            title: 'Step 1 · Which half is sorted?',
            condition: 'nums[lo] <= nums[mid]',
            expr: chain([nums[lo], nums[mid]], ['≤']),
            values: [
              { label: 'nums[lo]', value: nums[lo] },
              { label: 'nums[mid]', value: nums[mid] },
            ],
            result: leftSorted,
            answer: leftSorted ? `the left half (indices ${lo}..${mid}) is sorted` : `the pivot is on the left, so the right half (indices ${mid}..${hi}) is sorted`,
            verdict: `${nums[lo]} ${leftSorted ? '≤' : '>'} ${nums[mid]}: ${leftSorted ? 'nothing drops between lo and mid, so the left half is in order' : 'the drop is somewhere in lo..mid, so the right half is the one in order'}. That makes it a usable ruler. It is not chosen yet.`,
          }),
        ],
        { lo, hi, mid, target, leftSorted },
      );

      // ── B: is the target inside the sorted half's range? ──────
      const inside = leftSorted ? nums[lo] <= target && target < nums[mid] : nums[mid] < target && target <= nums[hi];
      const test = {
        title: "Step 2 · Is the target inside the sorted half's range?",
        condition: leftSorted ? 'nums[lo] <= target < nums[mid]' : 'nums[mid] < target <= nums[hi]',
        expr: leftSorted ? chain([a, target, b], ['≤', '<']) : chain([a, target, b], ['<', '≤']),
        values: [
          { label: leftSorted ? 'nums[lo]' : 'nums[mid]', value: a },
          { label: 'target', value: target },
          { label: leftSorted ? 'nums[mid]' : 'nums[hi]', value: b },
        ],
        result: inside,
        answer: inside ? `yes: ${target} fits in ${a}..${b}` : `no: ${target} is outside ${a}..${b}`,
      };
      const verdictTest = inside ? `${target} is between ${rangeText}, so if it is in the array at all it is in the sorted ${rulerName} half.` : `${target} is not between ${rangeText}, so it cannot be in the sorted ${rulerName} half.`;
      r.step(
        leftSorted ? 'inLeft' : 'inRight',
        `Is ${target} inside the sorted half's range ${a}..${b}? ${inside ? 'Yes' : 'No'}. ${verdictTest}`,
        [
          roleArray(nums, { title: title('  ·  the ruler is being used as a test'), window: [lo, hi], ruler, compared: [ruler[0], ruler[1]], pointers, bracket }),
          valueRangeView({ range: [a, b], target, inside, also: nums.slice(lo, hi + 1) }),
          decisionView({ ...test, verdict: verdictTest }),
        ],
        { lo, hi, mid, target, leftSorted, targetInSortedRange: inside },
      );

      // ── C: keep one side, discard the other ───────────────────
      const keepLeft = leftSorted === inside;
      const keep: Span = inside ? sortedKeep : otherKeep;
      const drop: Span = keepLeft ? [mid, hi] : [lo, mid];
      const keepName = keepLeft ? 'left' : 'right';
      const dropName = keepLeft ? 'right' : 'left';
      const verdict = inside ? `${target} is between ${rangeText}, so it can only be in the sorted ${rulerName} half. Keep it, discard the ${dropName}.` : `${target} is not between ${rangeText}, so it can't be in the sorted half. Discard it, keep the ${keepName} (the unsorted side, kept by default).`;
      const anchor = leftSorted ? (inside ? 'goLeft' : 'goRight') : inside ? 'goRight2' : 'goLeft2';
      const moved = keepLeft ? `hi = ${mid - 1}` : `lo = ${mid + 1}`;
      const decided: Span = [lo, hi];
      lo = keep[0];
      hi = keep[1];
      r.step(
        anchor,
        `Keep the ${inside ? 'sorted' : 'unsorted'} half (${keepName}), discard the ${dropName}: ${moved}.${isEmpty(keep) ? ' Nothing is left on that side.' : ''}`,
        [
          roleArray(nums, { title: title('  ·  solid = keep, faded = discard'), window: decided, keep, discard: drop, pointers: { lo, hi }, bracket: { span: keep, label: 'next search space', tone: 'done' } }),
          decisionView({
            ...test,
            keep: `${keepName} side, ${spanText(keep, nums)}${inside ? ' · sorted, and it passed the test' : ' · unsorted, kept by default'}`,
            discard: `${dropName} side, ${spanText(drop, nums)}, mid included`,
            verdict,
          }),
        ],
        { lo, hi, target, leftSorted, targetInSortedRange: inside },
      );
    }
    r.step('missing', `Search space empty → ${target} is not in the array, return -1`, plain(), { lo, hi, result: -1 });
    return { frames: r.frames, result: -1 };
  },
  reference({ nums, target }) {
    return nums.indexOf(target);
  },
};

const tests = [
  { args: [[4, 5, 6, 7, 0, 1, 2], 0], expected: 4 },
  { args: [[4, 5, 6, 7, 0, 1, 2], 3], expected: -1, name: 'missing' },
  { args: [[1], 0], expected: -1, name: 'single, missing' },
  { args: [[1], 1], expected: 0, name: 'single, present' },
  { args: [[3, 1], 1], expected: 1, name: 'two elements, pivot between' },
  { args: [[1, 3], 3], expected: 1, name: 'not rotated, two elements' },
  { args: [[5, 1, 3], 5], expected: 0 },
  { args: [[], 4], expected: -1, name: 'empty' },
  { args: [[6, 7, 1, 2, 3, 4, 5], 6], expected: 0 },
  { args: [[6, 7, 1, 2, 3, 4, 5], 5], expected: 6, name: 'last element' },
];

const unit: Unit = {
  id: 'bs-rotated',
  hook: 'A rotated sorted array is no longer globally sorted, yet binary search still works: at every step at least one half is sorted, and a sorted half lets you decide whether the target is inside it.',
  predict: {
    prompt: 'nums = [4, 5, 6, 7, 0, 1, 2], lo = 0, hi = 6, mid = 3 (value 7). Which half is sorted, and is target 0 inside it?',
    options: ['Left half 4..7 is sorted; 0 is not inside, go right', 'Right half 7..2 is sorted; 0 is inside, go right', 'Left half is sorted; 0 is inside, go left', 'Neither half is sorted'],
    answer: 0,
    explain: 'nums[lo] = 4 ≤ nums[mid] = 7, so indices 0..3 are in order. 0 is not between 4 and 7, so it cannot be there: discard the left half (lo = 4).',
  },
  viz,
  deeper: {
    points: [
      'One half around mid is always sorted, because the single "drop" in the array (the pivot) can only be on one side.',
      'Test which half: nums[lo] <= nums[mid] means the left half is sorted (use <= so the one-element half lo == mid counts as sorted).',
      'Then ask whether the target lies between that half’s ends; if yes keep that half, otherwise keep the other.',
      'With duplicate values the test can be ambiguous (nums[lo] == nums[mid] == nums[hi]), which forces an O(n) worst case.',
    ],
    complexity: { time: 'O(log n)', space: 'O(1)' },
    pitfalls: ['Using `<` instead of `<=` in the sorted-half test (breaks two-element ranges)', 'Making the target range checks inclusive on the wrong side (mid was already compared)', 'Searching for the pivot first when one pass is enough'],
  },
  practice: {
    language: 'python',
    fnName: 'search_rotated',
    statement: 'The list `nums` (distinct values) was sorted ascending and then rotated. Return the index of `target`, or -1. Do it in O(log n).',
    signature: 'def search_rotated(nums, target):',
    solution: `def search_rotated(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if @@nums[lo] <= nums[mid]@@:
            if @@nums[lo] <= target < nums[mid]@@:
                hi = @@mid - 1@@
            else:
                lo = mid + 1
        else:
            if @@nums[mid] < target <= nums[hi]@@:
                lo = @@mid + 1@@
            else:
                hi = mid - 1
    return -1`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'search_rotated',
    statement: 'This rotated search misses targets in tiny ranges such as [3, 1]. Find the bug.',
    buggy: `def search_rotated(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] < nums[mid]:
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return -1`,
    fixed: `def search_rotated(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] <= nums[mid]:
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return -1`,
    tests,
    bugType: 'wrong comparison',
    hint: 'When lo == mid (a one-element left half), is that half sorted? What does the code decide?',
    explanation: 'For [3, 1] mid equals lo, so nums[lo] == nums[mid]. A single element is trivially sorted, but `<` calls it unsorted and searches the right half by the wrong rule, discarding the answer. Use `<=`.',
  },
  boss: {
    title: 'Rotated search with duplicates',
    statement: 'The list `nums` was sorted ascending (duplicates allowed) and then rotated. Return True if `target` is present, else False. When nums[lo], nums[mid] and nums[hi] are all equal you cannot tell which half is sorted.',
    language: 'python',
    fnName: 'search_dups',
    starter: `def search_dups(nums, target):
    # your code here
    pass
`,
    solution: `def search_dups(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return True
        if nums[lo] == nums[mid] == nums[hi]:
            lo += 1
            hi -= 1
        elif nums[lo] <= nums[mid]:
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return False`,
    tests: [
      { args: [[2, 5, 6, 0, 0, 1, 2], 0], expected: true },
      { args: [[2, 5, 6, 0, 0, 1, 2], 3], expected: false },
      { args: [[1, 0, 1, 1, 1], 0], expected: true, name: 'ends equal, pivot hidden' },
      { args: [[1, 1, 1, 1, 1, 1], 2], expected: false, name: 'all equal' },
      { args: [[1, 3, 1, 1, 1], 3], expected: true },
      { args: [[], 1], expected: false, name: 'empty' },
      { args: [[3, 1], 1], expected: true },
    ],
    hints: ['The sorted-half test fails only when nums[lo] == nums[mid] == nums[hi]. What can you safely discard then?', 'In that case shrink both ends (lo += 1, hi -= 1) since mid was already checked and the end values equal mid. Otherwise use the normal sorted-half logic.'],
    combines: ['bs-rotated', 'binary-search'],
  },
};

export default unit;
