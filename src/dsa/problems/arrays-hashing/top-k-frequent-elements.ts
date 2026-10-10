import type { Panel, Tone, VizDef } from '@/engine/types';
import type { ProblemContent } from '@/dsa/types';
import { arrayView, bucketsView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { taskFrom } from '../helpers';
import solution from './top-k-frequent-elements.py?raw';
import cases from './top-k-frequent-elements.cases.json';

interface In {
  nums: number[];
  k: number;
}

const viz: VizDef<In> = {
  id: 'top-k-frequent-elements',
  title: 'Top K Frequent Elements',
  code: solution,
  language: 'python',
  inputs: [
    { key: 'nums', label: 'nums', kind: 'numbers', default: [1, 4, 1, 2, 4, 4, 2, 3, 4, 1], maxItems: 14 },
    { key: 'k', label: 'k', kind: 'number', default: 2 },
  ],
  presets: [
    { label: 'k = 2', input: { nums: [1, 4, 1, 2, 4, 4, 2, 3, 4, 1], k: 2 } },
    { label: 'k = 1', input: { nums: [5, 5, 7, 7, 7, 9], k: 1 } },
    { label: 'Take everything', input: { nums: [1, 2, 2, 3], k: 3 } },
  ],
  run({ nums, k }) {
    if (!Number.isInteger(k) || k < 1) throw new Error('k must be a whole number of at least 1');
    const distinct = new Set(nums).size;
    if (k > distinct) throw new Error(`k can be at most the number of distinct values (${distinct})`);
    const r = new TraceRecorder(solution);
    const count = new Map<number, number>();
    const buckets: number[][] = Array.from({ length: nums.length + 1 }, () => []);
    const result: number[] = [];
    let maxShown = 0;
    // buckets above the highest count stay empty, so the panel only shows 0..maxShown
    const view = (i: number, hot: Tone | null, o: { showBuckets?: boolean; bucketTone?: Record<number, Tone>; itemTone?: Record<string, Tone>; mapTone?: Record<string, Tone> } = {}) => {
      const tones: Record<number, Tone> = {};
      for (let q = 0; q < i; q++) tones[q] = 'visited';
      if (hot && i < nums.length) tones[i] = hot;
      const panels: Panel[] = [arrayView(nums, { title: 'nums', tones, pointers: i < nums.length ? { i } : undefined }), hashMapView(count, { title: 'count (value → times seen)', tones: o.mapTone })];
      if (o.showBuckets) panels.push(bucketsView(buckets.slice(0, maxShown + 1), { title: 'buckets (index = how many times)', tones: o.bucketTone, itemTones: o.itemTone }));
      if (result.length || o.showBuckets) panels.push(arrayView(result, { title: `result (want ${k})`, tones: Object.fromEntries(result.map((_, q) => [q, 'found' as Tone])) }));
      return panels;
    };
    r.step('init', 'First count how often each value occurs.', view(0, null), { count: '{}' });
    for (let i = 0; i < nums.length; i++) {
      const x = nums[i];
      count.set(x, (count.get(x) ?? 0) + 1);
      r.op();
      r.step('count', `Read ${x}: count[${x}] is now ${count.get(x)}.`, view(i + 1, null, { mapTone: { [String(x)]: 'new' } }), { x, [`count[${x}]`]: count.get(x)! });
    }
    maxShown = Math.max(...count.values());
    r.step('buckets', `Counts can be at most ${nums.length}. Make a bucket for every possible count (showing 0 to ${maxShown}, the rest stay empty).`, view(nums.length, null, { showBuckets: true }), { buckets: nums.length + 1 });
    let seed = 0;
    for (const [x, c] of count) {
      seed++;
      r.step('fillLoop', `Take the pair (${x}, ${c}): ${x} occurs ${c} time${c === 1 ? '' : 's'}.`, view(nums.length, null, { showBuckets: true, mapTone: { [String(x)]: 'active' } }), { x, c });
      r.predictChoice('fill', `${x} occurs ${c} time${c === 1 ? '' : 's'}. Which bucket does it go into?`, `bucket ${c}`, [`bucket ${c + 1}`, `bucket ${Math.max(0, c - 1)}`, `bucket ${nums.length}`], seed, 'The bucket index is the count, so values with the same frequency end up together.');
      buckets[c].push(x);
      r.step('fill', `Put ${x} into bucket ${c}.`, view(nums.length, null, { showBuckets: true, bucketTone: { [c]: 'active' }, itemTone: { [`${c}:${buckets[c].length - 1}`]: 'new' }, mapTone: { [String(x)]: 'done' } }), { x, c });
    }
    r.step('result', 'Now read the buckets from the highest count down. The first values we meet are the most frequent.', view(nums.length, null, { showBuckets: true }), { result: '[]' });
    r.predictChoice('scan', 'Which bucket do we read first?', `bucket ${maxShown} (the most frequent)`, ['bucket 1 (the rarest)', 'bucket 0', `bucket ${Math.max(1, maxShown - 1)}`], 1);
    for (let c = maxShown; c >= 1 && result.length < k; c--) {
      r.step('scan', `Look in bucket ${c}${buckets[c].length ? '' : ': it is empty, so move down'}.`, view(nums.length, null, { showBuckets: true, bucketTone: { [c]: 'compare' } }), { c });
      for (let j = 0; j < buckets[c].length; j++) {
        const x = buckets[c][j];
        r.step('take', `Take ${x} (it occurs ${c} times).`, view(nums.length, null, { showBuckets: true, bucketTone: { [c]: 'compare' }, itemTone: { [`${c}:${j}`]: 'active' } }), { c, x });
        result.push(x);
        r.step('append', `Add ${x} to the result.`, view(nums.length, null, { showBuckets: true, bucketTone: { [c]: 'compare' }, itemTone: { [`${c}:${j}`]: 'done' } }), { result: `[${result.join(', ')}]` });
        r.step('enough', `Do we have k = ${k} values yet? We have ${result.length}.`, view(nums.length, null, { showBuckets: true, bucketTone: { [c]: 'compare' }, itemTone: { [`${c}:${j}`]: 'done' } }), { found: result.length, k });
        if (result.length === k) {
          r.predict('enough', `result has ${result.length} value${result.length === 1 ? '' : 's'} and k = ${k}. Do we stop?`, ['Yes: return the result', 'No: keep reading'], 0, 'We only need the k most frequent values, so we stop as soon as we have k.');
          r.step('return', `That is k = ${k} values: return ${JSON.stringify(result)}.`, view(nums.length, null, { showBuckets: true }), { result: `[${result.join(', ')}]` });
          return { frames: r.frames, result: [...result] };
        }
      }
    }
    r.step('end', 'Buckets exhausted.', view(nums.length, null, { showBuckets: true }), { result: `[${result.join(', ')}]` });
    return { frames: r.frames, result: [...result] };
  },
  reference({ nums, k }) {
    const c = new Map<number, number>();
    for (const x of nums) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([x]) => x);
  },
};

const content: ProblemContent = {
  summary: 'Given a list of integers and a number k, return the k values that occur most often. The answer is guaranteed to be unambiguous, and you may return the values in any order.',
  example: { input: 'nums = [7, 7, 7, 3, 3, 9], k = 2', output: '[7, 3]', note: '7 occurs three times and 3 occurs twice, so they are the two most frequent. 9 occurs once.' },
  pattern: {
    answer: 'bucket-sort',
    options: ['bucket-sort', 'sorting', 'two-pointers', 'binary-search'],
    why: 'After counting, every frequency is a whole number between 1 and n. Instead of sorting the counts, use the count as an index into an array of buckets and read from the top. That is bucket sort.',
    notes: {
      sorting: 'Sorting the counts works and costs O(n log n). Because counts are small whole numbers that never exceed n, buckets avoid the log factor entirely.',
      'two-pointers': 'There is no sorted structure to squeeze from both ends.',
      'binary-search': 'Nothing here is searched for; we rank by frequency.',
    },
  },
  hints: [
    'Before ranking anything you need each value\'s frequency. What structure gives you that in one pass?',
    'You could sort the (value, count) pairs, or keep a heap of size k. Both cost a log factor. Can you exploit that every count is between 1 and n?',
    'Make an array where index c holds the list of values that occur exactly c times. Then read it from the highest index downward until you have k values.',
  ],
  explanation: {
    insight: 'Count, then file every value under its count. The most frequent values sit in the highest buckets, so read from the top.',
    brute: 'Count, sort all distinct values by count, take the first k: O(n log n) time.',
    optimal: 'Count, bucket by frequency, read from the top: O(n) time, O(n) space. (A min-heap of size k is a good O(n log k) alternative.)',
    walkthrough: [
      'Count occurrences with a hash map: one pass, O(n).',
      'Create n + 1 empty buckets. A value that occurs c times can only be in bucket c, and c never exceeds n, so n + 1 buckets always suffice.',
      'For every (value, count) pair, append the value to buckets[count].',
      'Scan the buckets from the highest index to the lowest, appending every value you find to the result, and stop once the result has k values. Highest buckets hold the most frequent values, so the first k collected are the answer.',
    ],
    edgeCases: ['A single element with k = 1.', 'k equal to the number of distinct values: you return everything.', 'All elements equal: one bucket holds one value.', 'Negative numbers and zero are just keys; no special handling.'],
    whyItWorks: [
      'A value is in bucket c if and only if it occurs c times, so reading buckets in decreasing index order lists values in non-increasing frequency order. The first k values read are therefore k of the most frequent ones.',
      'There are n + 1 buckets and each distinct value is placed once, so the filling and scanning together are O(n).',
    ],
  },
  complexity: {
    time: { big: 'O(n)', why: 'Counting, filling the buckets and scanning them each touch every element or bucket at most once.' },
    space: { big: 'O(n)', why: 'The count map has up to n entries and there are n + 1 buckets in total.' },
  },
  solution,
  task: taskFrom(cases, 'def top_k_frequent(nums, k):\n    # return the k most frequent values (any order)\n    pass\n'),
  viz: viz as VizDef,
  fromArgs: ([nums, k]) => ({ nums, k }),
};

export default content;
