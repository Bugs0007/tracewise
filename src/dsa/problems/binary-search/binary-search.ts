import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './binary-search.py?raw';
import cases from './binary-search.cases.json';

const viz = vizOf<{ nums: number[]; target: number }>({
  id: 'binary-search',
  title: 'Binary Search',
  solution,
  inputs: [
    { key: 'nums', label: 'nums (sorted, no repeats)', kind: 'numbers', default: [-8, -3, 2, 7, 12, 19, 25, 31], maxItems: 16 },
    { key: 'target', label: 'target', kind: 'number', default: 19 },
  ],
  presets: [
    { label: 'Found', input: { nums: [-8, -3, 2, 7, 12, 19, 25, 31], target: 19 } },
    { label: 'Missing', input: { nums: [-8, -3, 2, 7, 12, 19, 25, 31], target: 5 } },
    { label: 'First element', input: { nums: [4, 9, 15], target: 4 } },
    { label: 'Empty', input: { nums: [], target: 3 } },
  ],
  validate: ({ nums }) => (nums.some((v, i) => i && v <= nums[i - 1]) ? 'Numbers must be strictly increasing (sorted, no repeats)' : null),
  run({ nums, target }) {
    const r = new TraceRecorder(solution);
    let lo = 0;
    let hi = nums.length - 1;
    const view = (mid: number | null, hot: Tone | null = null) => {
      const tones: Record<number, Tone> = {};
      nums.forEach((_, i) => {
        if (i < lo || i > hi) tones[i] = 'muted';
      });
      if (mid !== null && hot) tones[mid] = hot;
      const pointers: Record<string, number> = { lo, hi };
      if (mid !== null) pointers.mid = mid;
      return [arrayView(nums, { title: `nums (looking for ${target})`, tones, pointers, window: lo <= hi ? { from: lo, to: hi, label: 'search space', tone: 'active' } : undefined }), hashMapView({ lo, hi, ...(mid !== null ? { mid } : {}) }, {})];
    };
    r.step('init', `The whole array is the search space: lo = ${lo}, hi = ${hi}.`, view(null), { lo, hi });
    while (lo <= hi) {
      r.op();
      const mid = Math.floor((lo + hi) / 2);
      r.step('mid', `mid = (${lo} + ${hi}) // 2 = ${mid}. Look at nums[${mid}] = ${nums[mid]}.`, view(mid, 'active'), { lo, hi, mid });
      const kind = nums[mid] === target ? 'hit' : nums[mid] < target ? 'right' : 'left';
      r.predict(kind, `nums[mid] = ${nums[mid]} and the target is ${target}. What happens?`, ['Found it: return mid', `${nums[mid]} is too small: search the right half`, `${nums[mid]} is too big: search the left half`], kind === 'hit' ? 0 : kind === 'right' ? 1 : 2, kind === 'right' ? 'The array is sorted, so everything at or left of mid is smaller still. Discard it.' : kind === 'left' ? 'Everything at or right of mid is bigger still. Discard it.' : 'An exact match.');
      if (nums[mid] === target) {
        r.step('found', `${nums[mid]} equals the target: found at index ${mid}.`, view(mid, 'found'), { result: mid });
        return { frames: r.frames, result: mid };
      }
      if (nums[mid] < target) {
        lo = mid + 1;
        r.step('goRight', `${nums[mid]} < ${target}: discard indices up to ${mid}. lo = ${lo}.`, view(null), { lo, hi });
      } else {
        hi = mid - 1;
        r.step('goLeft', `${nums[mid]} > ${target}: discard indices from ${mid}. hi = ${hi}.`, view(null), { lo, hi });
      }
    }
    r.step('miss', `lo (${lo}) passed hi (${hi}): the search space is empty, so the target is not there. Return −1.`, view(null), { lo, hi, result: -1 });
    return { frames: r.frames, result: -1 };
  },
  reference({ nums, target }) {
    return nums.indexOf(target);
  },
});

export default problem({
  summary: 'A list of different numbers is sorted from smallest to largest. Find the position of a target value, or report −1 if it is not there. It should take far fewer steps than looking at every element.',
  example: ['nums = [3, 8, 14, 21, 30], target = 21', '3', '21 sits at index 3. For target 10 the answer would be −1.'],
  pattern: ['binary-search', ['binary-search', 'two-pointers', 'hash-lookup', 'divide-conquer'], 'Sorted input means one comparison with the middle element rules out half of what is left. Repeating that halves the search space each step.', {
    'two-pointers': 'Two pointers do exist (lo and hi), but they jump to the middle each time rather than stepping inward.',
    'hash-lookup': 'A hash set would be O(1) but needs O(n) extra memory and gives no index of a sorted position; binary search uses the order.',
    'divide-conquer': 'It is divide and conquer in spirit, but binary search is the specific named pattern.',
  }],
  hints: [
    'Scanning from the left takes up to n steps. What does the sorted order let you conclude from a single comparison?',
    'Compare the target with the middle element. If it is smaller, which part of the array can you throw away?',
    'Keep lo and hi around the part that could still contain the target. Look at mid = (lo + hi) // 2, then move lo past mid or hi before mid.',
  ],
  insight: 'Look at the middle. The target can only be in the half that is on its side of the middle value, so throw the other half away.',
  brute: 'Check every element: O(n).',
  optimal: 'Halve the search space each step: O(log n) time, O(1) space.',
  walk: ['Set lo = 0 and hi = len(nums) − 1.', 'While lo ≤ hi, compute mid = (lo + hi) // 2.', 'If nums[mid] is the target, return mid. If it is smaller, set lo = mid + 1; if bigger, set hi = mid − 1.', 'When lo passes hi the search space is empty: return −1.'],
  edge: ['Empty array.', 'A single element, hit and miss.', 'Target smaller than everything or larger than everything.', 'Target at the first or last index.'],
  works: ['Invariant: if the target is present, it lies in nums[lo..hi]. Each step keeps that true while removing mid and one whole side that cannot contain the target.', 'The space shrinks by at least half each time, so the loop ends after about log₂ n steps.'],
  time: ['O(log n)', 'Every iteration halves the number of candidates.'],
  space: ['O(1)', 'Three integers: lo, hi and mid.'],
  solution,
  cases,
  sig: 'def search(nums, target):\n    # index of target in the sorted list, or -1\n    pass\n',
  viz,
  fromArgs: ([nums, target]) => ({ nums, target }),
});
