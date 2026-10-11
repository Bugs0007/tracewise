import { circleLayout } from '@/engine/layout';
import type { Tone } from '@/engine/types';
import { arrayView, graphView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './find-the-duplicate-number.py?raw';
import cases from './find-the-duplicate-number.cases.json';

const viz = vizOf<{ nums: number[] }>({
  id: 'find-the-duplicate-number',
  title: 'Find the Duplicate Number',
  solution,
  inputs: [{ key: 'nums', label: 'nums (n + 1 values, each from 1 to n)', kind: 'numbers', default: [4, 1, 3, 4, 2], maxItems: 10 }],
  presets: [
    { label: 'Duplicate 4', input: { nums: [4, 1, 3, 4, 2] } },
    { label: 'Same value everywhere', input: { nums: [2, 2, 2, 2, 2] } },
    { label: 'Duplicate at the ends', input: { nums: [1, 3, 4, 2, 1] } },
  ],
  validate: ({ nums }) => {
    const n = nums.length - 1;
    if (n < 1) return 'Enter at least two numbers';
    if (nums.some((v) => !Number.isInteger(v) || v < 1 || v > n)) return `Every value must be a whole number from 1 to ${n}`;
    const dups = [...new Set(nums)].filter((v) => nums.filter((x) => x === v).length > 1);
    return dups.length === 1 ? null : 'Use exactly one repeated value (it may repeat many times)';
  },
  run({ nums }) {
    const r = new TraceRecorder(solution);
    const ids = nums.map((_, i) => String(i));
    const pos = circleLayout(ids, 420, 300);
    let slow = nums[0];
    let fast = nums[0];
    const view = (phase: string, tones: Record<string, Tone> = {}) => [
      graphView(ids, nums.map((to, from) => ({ from: String(from), to: String(to) })), { directed: true, pos, size: { width: 420, height: 300 }, title: `${phase}: node i points to nums[i]`, tones, tags: { [String(slow)]: ['slow'], ...(fast === slow ? { [String(slow)]: ['slow', 'fast'] } : { [String(fast)]: ['fast'] }) } }),
      arrayView(nums, { title: 'nums', tones: { [slow]: 'active', [fast]: 'compare' } }),
      hashMapView({ slow, fast }, {}),
    ];
    r.step('init', 'Treat each index as a node with one outgoing arrow, i → nums[i]. Two indices hold the duplicate value, so two arrows enter the same node, which creates a cycle. The cycle’s entry node is the duplicate.', view('Phase 1'), { slow, fast });
    let steps = 0;
    for (;;) {
      r.op();
      slow = nums[slow];
      fast = nums[nums[fast]];
      steps++;
      if (steps === 1) r.predictChoice('step', `slow moves one hop and fast moves two hops from index ${nums[0]}. Where is fast?`, String(fast), [String(slow), String(nums[fast]), String(nums[0]), String(fast + 1), String(Math.max(0, fast - 1))], steps, 'fast = nums[nums[fast]]: two arrows followed.');
      r.step('fast', `slow → ${slow}, fast → ${fast}.`, view('Phase 1', { [String(slow)]: 'active' }), { slow, fast });
      const met = slow === fast;
      r.predict(met ? 'meet' : 'apart', `slow = ${slow}, fast = ${fast}. Are they on the same node?`, ['Yes: they met inside the cycle', 'No: keep moving'], met ? 0 : 1, met ? 'The fast pointer lapped the slow one inside the cycle.' : 'Not yet; the gap shrinks by one each step.');
      if (met) {
        r.step('meet', `They meet at ${slow}. This is somewhere inside the cycle, not necessarily the entry.`, view('Phase 1', { [String(slow)]: 'found' }), { meet: slow });
        break;
      }
    }
    slow = nums[0];
    r.step('reset', `Phase 2: move slow back to the start (index ${slow}). Both pointers will now move one hop at a time.`, view('Phase 2', { [String(slow)]: 'active', [String(fast)]: 'compare' }), { slow, fast });
    let asked = false;
    while (slow !== fast) {
      slow = nums[slow];
      fast = nums[fast];
      r.step('fast2', `slow → ${slow}, fast → ${fast}.`, view('Phase 2', { [String(slow)]: 'active' }), { slow, fast });
      if (!asked && slow !== fast) {
        asked = true;
        r.predictChoice('entry', 'They keep moving one hop each. Where will they meet?', `at the duplicate: the node where the cycle begins`, ['at the start index', 'at the end of the array', 'they never meet'], 1, 'The distance from the start to the cycle entry equals the distance from the meeting point onward to the entry (mod the cycle length).');
      }
    }
    r.step('done', `They meet at ${slow}: the first node of the cycle, which is the duplicate value.`, view('Phase 2', { [String(slow)]: 'found' }), { result: slow });
    return { frames: r.frames, result: slow };
  },
  reference({ nums }) {
    return nums.find((v, i) => nums.indexOf(v) !== i)!;
  },
});

export default problem({
  summary: 'An array holds n + 1 whole numbers, each between 1 and n, so at least one value must repeat. Find the repeated value without changing the array and using only constant extra space.',
  example: ['nums = [3, 1, 2, 3]', '3', 'Four numbers drawn from 1 to 3 guarantee a repeat. Here 3 appears twice. Sorting or a hash set would find it, but both break the space or no-modification limits.'],
  pattern: ['fast-slow', ['fast-slow', 'hash-lookup', 'binary-search', 'sorting'], 'Read the array as a linked list where index i points to nums[i]. The repeated value is where two arrows meet, which is the entry of a cycle, found with fast and slow pointers.', {
    'hash-lookup': 'A set is the easy answer but uses O(n) memory, which this problem forbids.',
    'binary-search': 'You can binary search on the value range with counting (O(n log n)). The cycle method is O(n).',
    sorting: 'Sorting changes the array and costs O(n log n).',
  }],
  hints: [
    'There are n + 1 values from 1 to n, so values can be used as indices. What structure appears if each index i points to index nums[i]?',
    'Two different indices hold the duplicate value, so two arrows point at the same node. What does that make the graph contain?',
    'Use Floyd’s algorithm. Phase 1: slow moves one hop, fast two, until they meet. Phase 2: restart slow from the beginning and move both one hop until they meet again: that node is the duplicate.',
  ],
  insight: 'The array is a linked list with a cycle. The duplicate value is the node where the cycle starts, found with Floyd’s two phases.',
  brute: 'Sort and compare neighbours (modifies the array) or use a set (O(n) memory).',
  optimal: 'Floyd’s cycle detection: O(n) time, O(1) space, no modification.',
  walk: ['Phase 1: set slow = fast = nums[0]. Repeatedly do slow = nums[slow] and fast = nums[nums[fast]] until they are equal. That is a node inside the cycle.', 'Phase 2: reset slow to nums[0]. Move slow and fast one hop each (slow = nums[slow], fast = nums[fast]) until they are equal.', 'The node where they meet is the entrance of the cycle, which equals the duplicate value.', 'Return it.'],
  edge: ['The smallest case [1, 1].', 'The duplicate appears many times.', 'The duplicate is the first or last element.', 'Values equal to indices create self loops (still fine).'],
  works: ['Two indices pointing at the same node means the path from index 0 enters a cycle exactly at the duplicate value.', 'If the distance from the start to the entry is a and the meeting point is b steps past the entry, then a ≡ (cycle length − b) mod the cycle length, so moving one pointer from the start and one from the meeting point at equal speed makes them meet at the entry.'],
  time: ['O(n)', 'Both phases are linear.'],
  space: ['O(1)', 'Two integers.'],
  solution,
  cases,
  sig: 'def find_duplicate(nums):\n    # the one repeated value (do not modify nums; use O(1) extra space)\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
