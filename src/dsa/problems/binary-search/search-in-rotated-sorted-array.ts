import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './search-in-rotated-sorted-array.py?raw';
import cases from './search-in-rotated-sorted-array.cases.json';

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
    { label: 'Missing', input: { nums: [15, 18, 22, 3, 6, 9, 12], target: 10 } },
    { label: 'Not rotated', input: { nums: [2, 4, 6, 8, 10], target: 8 } },
  ],
  validate: ({ nums }) => (new Set(nums).size !== nums.length ? 'Numbers must be different from each other' : null),
  run({ nums, target }) {
    const r = new TraceRecorder(solution);
    let lo = 0;
    let hi = nums.length - 1;
    const view = (mid: number | null, hot: Tone | null = null, sorted?: [number, number]) => {
      const tones: Record<number, Tone> = {};
      nums.forEach((_, i) => {
        if (i < lo || i > hi) tones[i] = 'muted';
      });
      if (sorted) for (let i = sorted[0]; i <= sorted[1]; i++) tones[i] = 'frontier';
      if (mid !== null && hot) tones[mid] = hot;
      return [arrayView(nums, { title: `rotated array (looking for ${target})`, tones, pointers: { lo, hi, ...(mid !== null ? { mid } : {}) }, window: lo <= hi ? { from: lo, to: hi, label: 'search space', tone: 'active' } : undefined }), hashMapView({ lo, hi, ...(mid !== null ? { mid } : {}) }, {})];
    };
    r.step('init', 'The array is two sorted blocks. At every step at least one half around mid is sorted, and sorted halves can be checked with a simple range test.', view(null), { lo, hi });
    while (lo <= hi) {
      r.op();
      const mid = Math.floor((lo + hi) / 2);
      r.step('mid', `mid = ${mid}: nums[mid] = ${nums[mid]}.`, view(mid, 'active'), { lo, hi, mid });
      if (nums[mid] === target) {
        r.step('found', `${nums[mid]} is the target: found at index ${mid}.`, view(mid, 'found'), { result: mid });
        return { frames: r.frames, result: mid };
      }
      const leftSorted = nums[lo] <= nums[mid];
      const half: [number, number] = leftSorted ? [lo, mid] : [mid, hi];
      r.predict('half', `nums[lo] = ${nums[lo]}, nums[mid] = ${nums[mid]}. Which half is sorted?`, ['The left half (lo..mid)', 'The right half (mid..hi)'], leftSorted ? 0 : 1, leftSorted ? 'nums[lo] ≤ nums[mid] means no drop between lo and mid, so that half is in order.' : 'The left half contains the drop, so the right half must be the sorted one.');
      r.step('leftSorted', leftSorted ? `${nums[lo]} ≤ ${nums[mid]}: the left half lo..mid is sorted.` : `${nums[lo]} > ${nums[mid]}: the drop is on the left, so the right half mid..hi is sorted.`, view(mid, 'active', half), { leftSorted });
      if (leftSorted) {
        const inside = nums[lo] <= target && target < nums[mid];
        r.predict(inside ? 'inside' : 'outside', `The sorted half spans ${nums[lo]}..${nums[mid]}. Is the target ${target} inside it?`, ['Yes: keep that half', 'No: search the other half'], inside ? 0 : 1, inside ? 'The range test passes, so the target can only be in this sorted half.' : 'It falls outside the sorted half, so it must be in the other one (if anywhere).');
        if (inside) {
          hi = mid - 1;
          r.step('leftGoLeft', `${nums[lo]} ≤ ${target} < ${nums[mid]}: the target is in the sorted left half. hi = ${hi}.`, view(null), { lo, hi });
        } else {
          lo = mid + 1;
          r.step('leftGoRight', `${target} is not in ${nums[lo]}..${nums[mid]}: search the right half. lo = ${lo}.`, view(null), { lo, hi });
        }
      } else {
        const inside = nums[mid] < target && target <= nums[hi];
        r.predict(inside ? 'inside' : 'outside', `The sorted half spans ${nums[mid]}..${nums[hi]}. Is the target ${target} inside it?`, ['Yes: keep that half', 'No: search the other half'], inside ? 0 : 1, inside ? 'The range test passes: the target is in the sorted right half.' : 'Outside the sorted half, so look in the other half.');
        if (inside) {
          lo = mid + 1;
          r.step('rightGoRight', `${nums[mid]} < ${target} ≤ ${nums[hi]}: the target is in the sorted right half. lo = ${lo}.`, view(null), { lo, hi });
        } else {
          hi = mid - 1;
          r.step('rightGoLeft', `${target} is not in ${nums[mid]}..${nums[hi + 1]}: search the left half. hi = ${hi}.`, view(null), { lo, hi });
        }
      }
    }
    r.step('miss', 'The search space is empty: return −1.', view(null), { result: -1 });
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
