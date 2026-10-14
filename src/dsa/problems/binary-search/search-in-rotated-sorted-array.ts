import type { Panel } from '@/engine/types';
import { TraceRecorder } from '@/dsa/viz/trace';
import { chain, decisionView, isEmpty, roleArray, spanText, valueRangeView, type Span } from '@/dsa/viz/decision';
import { problem, vizOf } from '../helpers';
import solution from './search-in-rotated-sorted-array.py?raw';
import cases from './search-in-rotated-sorted-array.cases.json';

// Each loop turn is four frames: [mid] -> [A: which half is sorted?] -> [B: is the target inside it?] -> [C: keep / discard].
// The sorted half is only a ruler for the test in B. Whether it is KEPT is decided in C, and when the test
// fails the kept side is the unsorted one. The two roles never share a look (see the Colour key).
const viz = vizOf<{ nums: number[]; target: number }>({
  id: 'search-in-rotated-sorted-array',
  title: 'Search in Rotated Sorted Array',
  solution,
  inputs: [
    { key: 'nums', label: 'rotated sorted array (no repeats)', kind: 'numbers', default: [15, 18, 22, 3, 6, 9, 12], maxItems: 14 },
    { key: 'target', label: 'target', kind: 'number', default: 6 },
  ],
  presets: [
    { label: 'Right block', input: { nums: [15, 18, 22, 3, 6, 9, 12], target: 6 } },
    { label: 'Left block', input: { nums: [15, 18, 22, 3, 6, 9, 12], target: 18 } },
    { label: 'In the sorted half', input: { nums: [15, 18, 22, 3, 6, 9, 12], target: 9 } },
    { label: 'Missing', input: { nums: [15, 18, 22, 3, 6, 9, 12], target: 10 } },
    { label: 'Not rotated', input: { nums: [2, 4, 6, 8, 10], target: 8 } },
  ],
  why: [
    'Rotating a sorted list creates exactly one drop, a big value followed by a small one. Around any mid, that drop can sit in at most one half, so at least one half is always in perfect order.',
    'A sorted half is a ruler: its two end values bound everything inside it, so two comparisons (the low end is below the target, the target is below the high end) say for certain whether the target could be in it. The other half cannot be tested that way, because its values wrap around the drop.',
    'That is why the sorted half is a test, not a choice. If the target fits inside it, keep that half. If it does not, the target is in the other half or not there at all, so keep the other half, even though it is the messy one. Either way at least half of the indices go away each turn, which gives O(log n).',
  ],
  validate: ({ nums }) => (new Set(nums).size !== nums.length ? 'Numbers must be different from each other' : null),
  run({ nums, target }) {
    const r = new TraceRecorder(solution);
    let lo = 0;
    let hi = nums.length - 1;
    const title = (extra = '') => `rotated array (looking for ${target})${extra}`;
    /** the plain search-space view used between decisions */
    const plain = (mid: number | null, found = false): Panel[] => {
      const arr = roleArray(nums, { title: title(), window: [lo, hi], pointers: { lo, hi, ...(mid !== null ? { mid } : {}) }, bracket: { span: [lo, hi], label: 'search space', tone: 'active' } });
      if (mid !== null) arr.tones = { ...arr.tones, [mid]: found ? 'found' : 'active' };
      return [arr];
    };
    r.step('init', 'The array is two sorted blocks. At every step one half around mid is sorted. A sorted half is only a ruler: we use it to test whether the target can be inside it.', plain(null), { lo, hi });
    while (lo <= hi) {
      r.op();
      const mid = Math.floor((lo + hi) / 2);
      r.step('mid', `mid = ${mid}: nums[mid] = ${nums[mid]}.`, plain(mid), { lo, hi, mid });
      if (nums[mid] === target) {
        r.step('found', `${nums[mid]} is the target: found at index ${mid}.`, plain(mid, true), { result: mid });
        return { frames: r.frames, result: mid };
      }

      // ── A: which half is sorted? ──────────────────────────────
      const leftSorted = nums[lo] <= nums[mid];
      const ruler: Span = leftSorted ? [lo, mid] : [mid, hi];
      const rulerName = leftSorted ? 'left' : 'right';
      const [a, b] = [nums[ruler[0]], nums[ruler[1]]];
      const rangeText = `${a} and ${b}`;
      // mid has just been checked, so it is never kept: each side excludes it
      const sortedKeep: Span = leftSorted ? [lo, mid - 1] : [mid + 1, hi];
      const otherKeep: Span = leftSorted ? [mid + 1, hi] : [lo, mid - 1];
      const pointers = { lo, hi, mid };
      const bracket = { span: ruler, label: `sorted half = the ruler (${a} … ${b})`, tone: 'ruler' as const };
      r.predict('half', `nums[lo] = ${nums[lo]}, nums[mid] = ${nums[mid]}. Which half is sorted?`, ['The left half (lo..mid)', 'The right half (mid..hi)'], leftSorted ? 0 : 1, leftSorted ? 'nums[lo] ≤ nums[mid] means no drop between lo and mid, so that half is in order.' : 'The left half contains the drop, so the right half must be the sorted one.');
      r.step(
        'leftSorted',
        leftSorted ? `Which half is sorted? ${nums[lo]} ≤ ${nums[mid]}, so the left half (indices ${lo}..${mid}) is sorted. It is only the ruler for the next test.` : `Which half is sorted? ${nums[lo]} > ${nums[mid]}: the drop is on the left, so the right half (indices ${mid}..${hi}) is sorted. It is only the ruler for the next test.`,
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
            answer: leftSorted ? `the left half (indices ${lo}..${mid}) is sorted` : `the drop is on the left, so the right half (indices ${mid}..${hi}) is sorted`,
            verdict: leftSorted ? `${nums[lo]} ≤ ${nums[mid]}: nothing drops between lo and mid, so the left half is in order. That makes it a usable ruler. It is not chosen yet.` : `${nums[lo]} > ${nums[mid]}: the drop is somewhere in lo..mid, so the right half is the one in order. That makes it a usable ruler. It is not chosen yet.`,
          }),
        ],
        { lo, hi, mid, leftSorted },
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
      const tail = ' The sorted half is only a test: when the target passes it, that half is kept.';
      const failTail = ' Failing the test does not drop the unsorted side: the unsorted side is kept by default whenever the sorted side fails.';
      r.predict('inRange', `The sorted half (the ruler) spans ${a}..${b}. Is the target ${target} inside that range?`, ['Yes: it fits inside the ruler', 'No: it falls outside the ruler'], inside ? 0 : 1, inside ? `${target} fits between ${rangeText}, so the target can only be in the sorted half.` : `${target} is outside ${a}..${b}, so the sorted half cannot hold it.`, inside ? [undefined, `${target} does fit between ${rangeText}.${tail}`] : [`${target} is not between ${rangeText}, so it fails the test.${failTail}`, undefined]);
      r.step(
        leftSorted ? 'inLeft' : 'inRight',
        `Is ${target} inside the sorted half's range ${a}..${b}? ${inside ? 'Yes' : 'No'}. ${verdictTest}`,
        [
          roleArray(nums, { title: title('  ·  the ruler is being used as a test'), window: [lo, hi], ruler, compared: [ruler[0], ruler[1]], pointers, bracket }),
          valueRangeView({ range: [a, b], target, inside, also: nums.slice(lo, hi + 1) }),
          decisionView({ ...test, verdict: verdictTest }),
        ],
        { lo, hi, mid, leftSorted, targetInSortedRange: inside },
      );

      // ── C: keep one side, discard the other ───────────────────
      const keepLeft = leftSorted === inside;
      const keep: Span = inside ? sortedKeep : otherKeep;
      const drop: Span = keepLeft ? [mid, hi] : [lo, mid];
      const keepName = keepLeft ? 'left' : 'right';
      const dropName = keepLeft ? 'right' : 'left';
      r.predict(
        'keep',
        `The test ${inside ? 'passed' : 'failed'}. Which side do we keep?`,
        [`The sorted side: ${spanText(sortedKeep, nums)}`, `The unsorted side: ${spanText(otherKeep, nums)}`],
        inside ? 0 : 1,
        inside ? 'The target passed the range test, so it can only be in the sorted half: keep it.' : 'The sorted half failed the test and is discarded. The unsorted side is kept by default: the target is there or nowhere.',
        inside ? [undefined, 'The target is inside the sorted range, so it cannot be in the other half. Keep the sorted side.'] : ['The sorted half failed the range test, so the target cannot be in it. Discard it and keep the other side, even though it is the messy one.', undefined],
      );
      const verdict = inside ? `${target} is between ${rangeText}, so it can only be in the sorted ${rulerName} half. Keep it, discard the ${dropName}.` : `${target} is not between ${rangeText}, so it can't be in the sorted half. Discard it, keep the ${keepName} (the unsorted side, kept by default).`;
      const anchor = leftSorted ? (inside ? 'leftGoLeft' : 'leftGoRight') : inside ? 'rightGoRight' : 'rightGoLeft';
      const moved = keepLeft ? `hi = ${mid - 1}` : `lo = ${mid + 1}`;
      const decided: Span = [lo, hi];
      lo = keep[0];
      hi = keep[1];
      // pointers show where the code just moved them; cells still show the roles inside the window being decided
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
        { lo, hi, leftSorted, targetInSortedRange: inside },
      );
    }
    r.step('miss', 'The search space is empty: return −1.', plain(null), { lo, hi, result: -1 });
    return { frames: r.frames, result: -1 };
  },
  reference({ nums, target }) {
    return nums.indexOf(target);
  },
});

export default problem({
  summary: 'A sorted list of different numbers was rotated at an unknown position. Find the index of a target value, or −1 if it is absent, in logarithmic time.',
  example: ['nums = [11, 14, 17, 2, 5, 8], target = 5', '4', 'The list is [2, 5, 8, 11, 14, 17] rotated; 5 is now at index 4. Target 3 would give −1.'],
  pattern: ['binary-search', ['binary-search', 'two-pointers', 'hash-lookup', 'divide-conquer'], 'After comparing the middle with an end you know which half is sorted, and a sorted half can be tested for the target with a simple range check. Keep the half that can hold it.', {
    'two-pointers': 'The indices lo and hi move by halving, which is binary search.',
    'hash-lookup': 'A hash map is O(n) space and does not use the sorted structure.',
    'divide-conquer': 'It is halving, which is the binary-search pattern.',
  }],
  hints: [
    'If the array were not rotated you would binary search. What stays true about the array after rotation?',
    'Around any mid, at least one of the two halves is perfectly sorted. How can you tell which?',
    'Find the sorted half (compare nums[lo] with nums[mid]). If the target lies in its range, keep that half; otherwise keep the other.',
  ],
  insight: 'One half around mid is always sorted. Test whether the target lies inside that sorted half, and keep the half that can contain it.',
  brute: 'Scan the list: O(n).',
  optimal: 'Modified binary search: O(log n) time, O(1) space.',
  walk: ['Compute mid. If nums[mid] is the target, return mid.', 'If nums[lo] ≤ nums[mid], the left half is sorted. If nums[lo] ≤ target < nums[mid], search left (hi = mid − 1), else search right (lo = mid + 1).', 'Otherwise the right half is sorted. If nums[mid] < target ≤ nums[hi], search right, else left.', 'If the range empties, return −1.'],
  edge: ['Empty list.', 'A single element.', 'Not rotated at all.', 'The target is the rotation pivot (the minimum).'],
  works: ['The sorted half has a known range, so the range test answers exactly whether the target can be inside it. If not, the target can only be in the other half.', 'Each step discards at least half the indices.'],
  time: ['O(log n)', 'The range halves every iteration.'],
  space: ['O(1)', 'A few integers.'],
  solution,
  cases,
  sig: 'def search_rotated(nums, target):\n    # index of target in a rotated sorted list of distinct numbers, or -1\n    pass\n',
  viz,
  fromArgs: ([nums, target]) => ({ nums, target }),
});
