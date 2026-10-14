import type { Panel } from '@/engine/types';
import { TraceRecorder } from '@/dsa/viz/trace';
import { chain, decisionView, roleArray, spanText, type Span } from '@/dsa/viz/decision';
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
  why: [
    'Rotating a sorted list leaves one drop. The minimum sits right after it, so the question each turn is only: is the drop to the right of mid, or not?',
    'Comparing nums[mid] with the right end answers that. If nums[mid] > nums[hi] the values cannot be in order between them, so the drop (and the minimum) is to the right of mid. If nums[mid] < nums[hi], mid..hi is in order and nothing to the right of mid can beat mid.',
    'So the side that gets thrown away is the one that is in order, and the side that gets kept is the one that holds the drop. In the second case mid itself stays (hi = mid) because mid might be the minimum.',
  ],
  run({ nums }) {
    const r = new TraceRecorder(solution);
    let lo = 0;
    let hi = nums.length - 1;
    const title = (extra = '') => `rotated array${extra}`;
    /** the plain search-space view used between decisions */
    const plain = (mid: number | null, found = false): Panel[] => {
      const arr = roleArray(nums, { title: title(), window: [lo, hi], pointers: { lo, hi, ...(mid !== null ? { mid } : {}) }, bracket: { span: [lo, hi], label: 'minimum is in here', tone: 'active' } });
      if (mid !== null) arr.tones = { ...arr.tones, [mid]: 'active' };
      if (found) arr.tones = { ...arr.tones, [lo]: 'found' };
      return [arr];
    };
    r.step('init', 'The array is a sorted list that was rotated. The minimum is where the "drop" is. Search for it.', plain(null), { lo, hi });
    while (lo < hi) {
      r.op();
      const mid = Math.floor((lo + hi) / 2);
      r.step('mid', `mid = ${mid}. Compare nums[mid] = ${nums[mid]} with the right end nums[hi] = ${nums[hi]}.`, plain(mid), { lo, hi, mid });

      // ── test: is nums[mid] > nums[hi]? ───────────────────────
      const bigger = nums[mid] > nums[hi];
      const m = nums[mid];
      const h = nums[hi];
      const ruler: Span = [mid, hi];
      const pointers = { lo, hi, mid };
      const test = {
        title: 'Is the stretch mid..hi still in order?',
        condition: 'nums[mid] > nums[hi]',
        expr: chain([m, h], ['>']),
        values: [
          { label: 'nums[mid]', value: m },
          { label: 'nums[hi]', value: h },
        ],
        result: bigger,
      };
      const testVerdict = bigger ? `${m} > ${h}: the order breaks somewhere after mid, so the drop (and the minimum) is to the right of mid.` : `${m} < ${h}: mid..hi is in order, so nothing to the right of mid can beat mid. The minimum is at mid or to its left.`;
      r.predict('gt', `nums[mid] = ${m}, nums[hi] = ${h}. Is nums[mid] > nums[hi]?`, ['Yes: the order breaks between mid and hi', 'No: mid..hi is in order'], bigger ? 0 : 1, bigger ? 'A middle bigger than the right end means the sorted order was broken somewhere between them.' : 'A middle smaller than the right end means mid..hi is in order.', bigger ? [undefined, `${m} is bigger than ${h}, so mid..hi cannot be in order: the drop is in there.`] : [`${m} is not bigger than ${h}: they are in order, so mid..hi has no drop in it.`, undefined]);
      r.step(
        'cmp',
        `Is ${m} > ${h}? ${bigger ? 'Yes' : 'No'}. ${testVerdict}`,
        [roleArray(nums, { title: title('  ·  dashed = the stretch being tested'), window: [lo, hi], ruler, compared: [mid, hi], pointers, bracket: { span: ruler, label: `mid..hi (${m} … ${h})`, tone: 'ruler' } }), decisionView({ ...test, answer: bigger ? 'yes: mid..hi is NOT in order' : 'no: mid..hi is in order', verdict: testVerdict })],
        { lo, hi, mid, midGtHi: bigger },
      );

      // ── apply: keep one side, discard the other ──────────────
      // mid is dropped only when it cannot be the minimum (mid > hi); otherwise it stays as a candidate
      const keep: Span = bigger ? [mid + 1, hi] : [lo, mid];
      const drop: Span = bigger ? [lo, mid] : [mid + 1, hi];
      r.predict(
        'keepMin',
        `${bigger ? 'The order breaks after mid.' : 'mid..hi is in order.'} Which side can still hold the minimum?`,
        [`Right of mid: ${spanText([mid + 1, hi], nums)}`, `Mid and everything left of it: ${spanText([lo, mid], nums)}`],
        bigger ? 0 : 1,
        bigger ? 'mid is bigger than hi, so mid is not the minimum and the drop is to its right.' : 'mid..hi is in order, so everything right of mid is bigger than mid. mid itself might be the minimum, so it stays.',
        bigger ? [undefined, `${m} is bigger than ${h}, so mid cannot be the minimum, and the drop is to its right. Keep the right side: it is the one holding the drop.`] : [`mid..hi is in order, so the values right of mid are all bigger than mid. They cannot be the minimum. Keep mid and the left.`, undefined],
      );
      const verdict = bigger ? `${m} > ${h}, so mid can't be the minimum and the drop is to its right. Discard lo..mid, keep the right: the side that holds the drop.` : `${m} < ${h}, so everything right of mid is bigger than mid. Discard it. Keep mid and the left: mid itself might be the minimum, so it stays.`;
      const moved = bigger ? `lo = ${mid + 1}` : `hi = ${mid}`;
      const decided: Span = [lo, hi];
      lo = keep[0];
      hi = keep[1];
      r.step(
        bigger ? 'goRight' : 'goLeft',
        `${bigger ? 'Keep the right, which holds the drop' : 'Keep mid and the left'}, discard the rest: ${moved}.`,
        [
          roleArray(nums, { title: title('  ·  solid = keep, faded = discard'), window: decided, keep, discard: drop, pointers: { lo, hi }, bracket: { span: keep, label: 'minimum is in here', tone: 'done' } }),
          decisionView({
            ...test,
            answer: bigger ? 'yes: mid..hi is NOT in order' : 'no: mid..hi is in order',
            keep: bigger ? `right of mid, ${spanText(keep, nums)} · holds the drop` : `mid and the left, ${spanText(keep, nums)} · mid might be the minimum`,
            discard: bigger ? `${spanText(drop, nums)}, mid included` : `${spanText(drop, nums)} · in order, and all bigger than mid`,
            verdict,
          }),
        ],
        { lo, hi, midGtHi: bigger },
      );
    }
    r.step('done', `lo = hi = ${lo}: the minimum is nums[${lo}] = ${nums[lo]}.`, plain(null, true), { result: nums[lo] });
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
