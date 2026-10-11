import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './find-minimum-in-rotated-sorted-array.py?raw';
import cases from './find-minimum-in-rotated-sorted-array.cases.json';

const viz = vizOf<{ nums: number[] }>({
  id: 'find-minimum-in-rotated-sorted-array',
  title: 'Find Minimum in Rotated Sorted Array',
  solution,
  inputs: [{ key: 'nums', label: 'rotated sorted array (no repeats)', kind: 'numbers', default: [15, 18, 22, 3, 6, 9, 12], maxItems: 14 }],
  presets: [
    { label: 'Rotated', input: { nums: [15, 18, 22, 3, 6, 9, 12] } },
    { label: 'Not rotated', input: { nums: [2, 4, 6, 8] } },
    { label: 'Min at the end', input: { nums: [4, 6, 8, 10, 2] } },
    { label: 'Two elements', input: { nums: [8, 3] } },
  ],
  validate: ({ nums }) => (nums.length < 1 ? 'Enter at least one number' : new Set(nums).size !== nums.length ? 'Numbers must be different from each other' : null),
  run({ nums }) {
    const r = new TraceRecorder(solution);
    let lo = 0;
    let hi = nums.length - 1;
    const view = (mid: number | null, hot: Tone | null = null) => {
      const tones: Record<number, Tone> = {};
      nums.forEach((_, i) => {
        if (i < lo || i > hi) tones[i] = 'muted';
      });
      if (mid !== null && hot) tones[mid] = hot;
      return [arrayView(nums, { title: 'rotated array', tones, pointers: { lo, hi, ...(mid !== null ? { mid } : {}) }, window: { from: lo, to: hi, label: 'minimum is in here', tone: 'active' } }), hashMapView({ lo, hi, ...(mid !== null ? { mid } : {}) }, {})];
    };
    r.step('init', 'The array is a sorted list that was rotated. The minimum is where the "drop" is. Search for it.', view(null), { lo, hi });
    while (lo < hi) {
      r.op();
      const mid = Math.floor((lo + hi) / 2);
      r.step('mid', `mid = ${mid}. Compare nums[mid] = ${nums[mid]} with the right end nums[hi] = ${nums[hi]}.`, view(mid, 'active'), { lo, hi, mid });
      const bigger = nums[mid] > nums[hi];
      r.predict(bigger ? 'drop' : 'sorted', `nums[mid] = ${nums[mid]}, nums[hi] = ${nums[hi]}. Where is the minimum?`, ['To the right of mid: the drop is in (mid, hi]', 'At mid or to its left: mid..hi is already in order'], bigger ? 0 : 1, bigger ? 'The middle is bigger than the right end, so the sorted order breaks somewhere after mid: the minimum is there.' : 'The right part is in order, so the minimum is mid itself or something to its left.');
      if (bigger) {
        lo = mid + 1;
        r.step('goRight', `${nums[mid]} > ${nums[hi]}: the minimum is right of mid. lo = ${lo}.`, view(null), { lo, hi });
      } else {
        hi = mid;
        r.step('goLeft', `${nums[mid]} < ${nums[hi]}: mid..hi is sorted, so the minimum is at mid or left. hi = ${hi}.`, view(null), { lo, hi });
      }
    }
    r.step('done', `lo = hi = ${lo}: the minimum is nums[${lo}] = ${nums[lo]}.`, view(null, null), { result: nums[lo] });
    return { frames: r.frames, result: nums[lo] };
  },
  reference({ nums }) {
    return Math.min(...nums);
  },
});

export default problem({
  summary: 'A sorted list of different numbers was rotated: some prefix was moved to the back, like turning [1, 2, 3, 4, 5] into [4, 5, 1, 2, 3]. Find the smallest value without scanning the whole list.',
  example: ['nums = [11, 14, 17, 2, 5, 8]', '2', 'The list was [2, 5, 8, 11, 14, 17] rotated; the smallest value sits right after the drop from 17 to 2.'],
  pattern: ['binary-search', ['binary-search', 'two-pointers', 'divide-conquer', 'sorting'], 'The rotation point splits the array into two sorted blocks. Comparing the middle with an end tells you which block the minimum is in, so you can discard half each step.', {
    'two-pointers': 'You do move lo and hi, but by jumping to the middle, which is binary search.',
    'divide-conquer': 'It is a halving search, which is exactly binary search.',
    sorting: 'The array is already almost sorted; re-sorting would cost O(n log n) for nothing.',
  }],
  hints: [
    'Scanning is O(n). The array is two sorted blocks glued together. Where is the minimum relative to the join?',
    'Compare nums[mid] with nums[hi]. If the middle is larger than the right end, what does that say about the order between them?',
    'If nums[mid] > nums[hi] the minimum is to the right of mid; otherwise it is at mid or to the left. Shrink the range accordingly.',
  ],
  insight: 'Compare the middle with the right end: if the middle is bigger the drop is on the right, otherwise the minimum is at mid or on its left.',
  brute: 'Scan the whole list for the minimum: O(n).',
  optimal: 'Binary search comparing nums[mid] with nums[hi]: O(log n) time, O(1) space.',
  walk: ['Set lo = 0, hi = n − 1.', 'While lo < hi, compute mid.', 'If nums[mid] > nums[hi], the minimum is strictly right of mid: lo = mid + 1.', 'Otherwise nums[mid..hi] is increasing, so the minimum is at mid or left: hi = mid. When lo == hi, nums[lo] is the minimum.'],
  edge: ['Array not rotated at all (the first element is the minimum).', 'A single element.', 'Two elements.', 'Minimum at the very last position.'],
  works: ['Invariant: the minimum is always within [lo, hi]. In the first case mid cannot be the minimum (something to its right is smaller), so dropping it is safe. In the second case mid may be the minimum, so it is kept.', 'Each step shrinks the range, so it ends with a single index.'],
  time: ['O(log n)', 'The range halves each step.'],
  space: ['O(1)', 'Three integers.'],
  solution,
  cases,
  sig: 'def find_min(nums):\n    # smallest value in a rotated sorted list of distinct numbers\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
