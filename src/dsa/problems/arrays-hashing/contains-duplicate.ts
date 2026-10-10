import type { Tone, VizDef } from '@/engine/types';
import type { ProblemContent } from '@/dsa/types';
import { arrayView, hashSetView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { taskFrom } from '../helpers';
import solution from './contains-duplicate.py?raw';
import cases from './contains-duplicate.cases.json';

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'contains-duplicate',
  title: 'Contains Duplicate',
  code: solution,
  language: 'python',
  inputs: [{ key: 'nums', label: 'nums', kind: 'numbers', default: [4, 9, 2, 7, 9, 5], maxItems: 16 }],
  presets: [
    { label: 'Duplicate', input: { nums: [4, 9, 2, 7, 9, 5] } },
    { label: 'All distinct', input: { nums: [3, 1, 8, 5, 2] } },
    { label: 'Negatives', input: { nums: [-2, 6, -7, 0, -2] } },
    { label: 'Empty', input: { nums: [] } },
  ],
  run({ nums }) {
    const r = new TraceRecorder(solution);
    const seen = new Set<number>();
    const view = (i: number, hot: Tone | null, setTones: Record<string, Tone> = {}) => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < i; k++) tones[k] = 'visited';
      if (hot && i < nums.length) tones[i] = hot;
      return [
        arrayView(nums, { title: 'nums', tones, pointers: i < nums.length ? { x: i } : undefined }),
        hashSetView(seen, { title: 'seen', tones: setTones }),
      ];
    };
    r.step('init', 'Start with an empty set. It will hold every value we have already passed.', view(0, null), { seen: [] });
    let answer = false;
    for (let i = 0; i < nums.length; i++) {
      const x = nums[i];
      r.op();
      r.step('loop', `Next value: x = ${x}`, view(i, 'active'), { i, x, seen: [...seen] });
      const dup = seen.has(x);
      r.step('check', `Is ${x} already in seen?`, view(i, 'compare', { [String(x)]: dup ? 'compare' : 'default' }), { i, x, seen: [...seen] });
      // the first time a value is new, and the first time it is not, are the two key moments
      if (dup || seen.size >= 2) r.predict(dup ? 'hit' : 'miss', `Is ${x} already in the set?`, ['Yes, we have seen it', 'No, it is new'], dup ? 0 : 1, dup ? `${x} was added earlier, so this is the repeat we are looking for.` : `${x} has not appeared yet, so it gets added.`);
      if (dup) {
        r.step('dup', `Yes: ${x} appeared before, so the answer is True.`, view(i, 'found', { [String(x)]: 'found' }), { i, x, result: true });
        answer = true;
        break;
      }
      seen.add(x);
      r.step('add', `No: remember ${x} by adding it to the set.`, view(i + 1, null, { [String(x)]: 'new' }), { i, x, seen: [...seen] });
    }
    if (!answer) {
      r.predict('end', 'The loop ends with no repeat found. What is returned?', ['True', 'False'], 1, 'Every value was new when we reached it, so nothing repeated.');
      r.step('done', 'Every value was new, so the answer is False.', view(nums.length, null), { seen: [...seen], result: false });
    }
    return { frames: r.frames, result: answer };
  },
  reference({ nums }) {
    for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i] === nums[j]) return true;
    return false;
  },
};

const content: ProblemContent = {
  summary: 'You get a list of integers. Say whether some value shows up more than once. Order does not matter, only repetition.',
  example: { input: 'nums = [4, 9, 2, 9]', output: 'true', note: '9 appears twice. For [4, 9, 2, 5] the answer would be false.' },
  pattern: {
    answer: 'hash-lookup',
    options: ['hash-lookup', 'two-pointers', 'binary-search', 'sliding-window'],
    why: 'For each number the only question is "have I seen this exact value before?". A hash set answers that in constant time, so one pass is enough.',
    notes: {
      'two-pointers': 'Two pointers need the data in an order that lets you discard candidates, such as a sorted array. Nothing here is ordered.',
      'binary-search': 'Binary search needs sorted input and a target to hunt for. There is no target here, only a question about repeats.',
      'sliding-window': 'A window looks at a contiguous stretch. A repeat can be anywhere in the list, so there is no useful window.',
    },
  },
  hints: [
    'Checking every pair works, but how many pairs are there when the list has n numbers?',
    'While scanning, the only thing you need to know about earlier numbers is whether one of them equals the current number.',
    'Which structure tells you "is x in here?" in constant time on average, and lets you add to it as you go?',
  ],
  explanation: {
    insight: 'Remember every value you pass. The moment you meet one you already remember, you are done.',
    brute: 'Brute force: compare every pair. O(n²) time, O(1) space.',
    optimal: 'One pass with a set: O(n) time, O(n) space. Trade memory for speed.',
    walkthrough: [
      'Create an empty set called seen. Then walk the list from left to right.',
      'For each number x, ask whether x is already in seen. If it is, two equal values exist and you can return True immediately, without reading the rest.',
      'If x is not in seen, this is the first time you meet it, so add it and move on. If you reach the end without ever hitting the first case, no value repeated and you return False.',
      'Another route is to sort the list and compare neighbours: equal values end up side by side. That costs O(n log n) time but needs no extra set, which is worth mentioning in an interview as the memory-light alternative.',
    ],
    edgeCases: ['Empty list: no pairs exist, so the answer is False.', 'One element: also False.', 'The repeat is at the very end, so you scan everything before finding it.', 'Negatives and zero are ordinary values; sets treat them like any other.'],
    whyItWorks: [
      'Invariant: before looking at index i, seen contains exactly the distinct values from indices 0 to i-1. If nums[i] is in seen, an earlier index holds the same value, which is a repeat. If it is not, adding it keeps the invariant true for the next step.',
      'The check runs once per element and each check or insert is O(1) on average, which is where the O(n) comes from.',
    ],
  },
  complexity: {
    time: { big: 'O(n)', why: 'Each element costs one set lookup and at most one insert, and both are O(1) on average.' },
    space: { big: 'O(n)', why: 'With no repeats the set ends up holding every element.' },
  },
  solution,
  task: taskFrom(cases, 'def contains_duplicate(nums):\n    # return True if any value appears more than once\n    pass\n'),
  viz: viz as VizDef,
  fromArgs: ([nums]) => ({ nums }),
};

export default content;
