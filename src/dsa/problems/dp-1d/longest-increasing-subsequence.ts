import type { Tone } from '@/engine/types';
import { arrayView, chipsView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './longest-increasing-subsequence.py?raw';
import cases from './longest-increasing-subsequence.cases.json';

const bisectLeft = (a: number[], x: number) => {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const viz = vizOf<{ nums: number[] }>({
  id: 'longest-increasing-subsequence',
  title: 'Longest Increasing Subsequence',
  solution,
  inputs: [{ key: 'nums', label: 'numbers', kind: 'numbers', default: [5, 1, 6, 2, 7, 3, 8], maxItems: 12 }],
  presets: [
    { label: 'Not contiguous', input: { nums: [5, 1, 6, 2, 7, 3, 8] } },
    { label: 'Decreasing', input: { nums: [9, 7, 5, 3] } },
    { label: 'Equal values', input: { nums: [2, 2, 2, 2] } },
    { label: 'Zigzag', input: { nums: [3, 1, 4, 1, 5, 9, 2, 6] } },
  ],
  validate: ({ nums }) => (nums.some((v) => v === null || !Number.isFinite(v)) ? 'Use plain numbers' : null),
  run({ nums }) {
    const r = new TraceRecorder(solution);
    const tails: number[] = [];
    let askedFind = false;
    let askedReplace = false;
    let askedAppend = false;
    const view = (i: number, pos = -1) => [
      arrayView(nums, { title: 'numbers', pointers: i >= 0 ? { x: i } : {}, tones: Object.fromEntries(nums.map((_, k) => [k, (k === i ? 'active' : k < i ? 'done' : 'default') as Tone])) }),
      arrayView(tails, { title: 'tails[k] = smallest possible last number of an increasing subsequence of length k + 1', tones: pos >= 0 ? { [pos]: 'active' } : {} }),
      chipsView([tails.length], { title: 'length so far' }),
    ];
    r.step('init', 'tails keeps, for each length, the smallest last value an increasing subsequence of that length can have. It is always sorted.', view(-1), {});
    for (let i = 0; i < nums.length; i++) {
      r.op();
      const x = nums[i];
      const pos = bisectLeft(tails, x);
      r.step('find', `x = ${x}: where does it fit in tails? bisect_left finds the first position whose value is ≥ ${x}: index ${pos}.`, view(i, pos < tails.length ? pos : -1), { x, pos });
      if (!askedFind) {
        askedFind = true;
        r.predictChoice('find', `tails = [${tails.join(', ')}] and x = ${x}. At which index does bisect_left put x?`, String(pos), [String(pos + 1), String(Math.max(0, pos - 1)), String(tails.length + 1)], i, 'bisect_left returns the first index whose value is not smaller than x (the length of tails if x is bigger than everything).');
      }
      if (pos === tails.length) {
        if (!askedAppend) {
          askedAppend = true;
          r.predict('end', `${x} is larger than everything in tails. What does that mean?`, ['It extends the longest increasing subsequence by one', 'It is ignored', 'It replaces the first element'], 0, 'Appending to the longest sequence makes a longer one, so the length grows.');
        }
        tails.push(x);
        r.step('append', `${x} is bigger than every tail: append it. The longest increasing subsequence is now ${tails.length} long.`, view(i, tails.length - 1), {});
      } else {
        if (!askedReplace) {
          askedReplace = true;
          r.predict('replace', `tails[${pos}] = ${tails[pos]} is ≥ ${x}. What happens?`, ['Replace it with the smaller x: same length, but easier to extend later', 'Append x', 'Remove tails[' + pos + ']'], 0, 'A smaller ending value gives a better chance to extend that length later; the length itself does not change.');
        }
        const old = tails[pos];
        tails[pos] = x;
        r.step('replace', `Replace ${old} by ${x} at index ${pos}: sequences of length ${pos + 1} can now end with the smaller ${x}.`, view(i, pos), {});
      }
    }
    r.step('done', `The longest increasing subsequence has length ${tails.length}. (tails itself is NOT the subsequence, only its length matters.)`, view(nums.length), { result: tails.length });
    return { frames: r.frames, result: tails.length };
  },
  reference({ nums }) {
    const best = nums.map(() => 1);
    for (let i = 0; i < nums.length; i++) for (let j = 0; j < i; j++) if (nums[j] < nums[i]) best[i] = Math.max(best[i], best[j] + 1);
    return Math.max(0, ...best);
  },
});

export default problem({
  summary: 'Find the length of the longest strictly increasing subsequence of a list: numbers picked in order (not necessarily neighbours) that keep getting larger.',
  example: ['[4, 10, 4, 11, 12]', '4', 'The subsequence 4, 10, 11, 12 is strictly increasing and has length 4.'],
  pattern: ['dp-1d', ['dp-1d', 'binary-search', 'greedy', 'sliding-window'], 'dp[i] = longest increasing subsequence ending at i is O(n²). Keeping the smallest possible tail for each length makes the tails sorted, so each number is placed with binary search: O(n log n).', {
    'binary-search': 'Binary search is the speed-up applied to the tails array of the DP idea.',
    greedy: 'The tails array uses a greedy exchange (smaller tails are always better) inside the DP idea.',
    'sliding-window': 'A subsequence is not contiguous.',
  }],
  hints: [
    'Let dp[i] be the best length of a subsequence that ends exactly at i. How do you compute it from earlier values?',
    'Is there a faster way? For each length, which ending value is the most useful?',
    'Keep tails sorted. For each x use bisect_left: if it is past the end, append; otherwise overwrite tails[i] with x. The answer is len(tails).',
  ],
  insight: 'For every length keep the smallest possible last value; that list stays sorted, so binary search finds where each number belongs.',
  brute: 'dp[i] = 1 + max(dp[j]) over j < i with nums[j] < nums[i]: O(n²).',
  optimal: 'Tails + binary search: O(n log n) time, O(n) space.',
  walk: ['tails = [].', 'For each x: i = bisect_left(tails, x).', 'If i == len(tails) append x, else set tails[i] = x.', 'Return len(tails).'],
  edge: ['Equal values (strictly increasing means they do not extend).', 'Strictly decreasing input (answer 1).', 'Empty list.', 'Negative numbers.'],
  works: ['Invariant: tails[k] is the smallest last value of any increasing subsequence of length k + 1 within the processed prefix.', 'Replacing keeps the invariant, and appending extends the maximum length.'],
  time: ['O(n log n)', 'One binary search per number.'],
  space: ['O(n)', 'The tails list.'],
  solution,
  cases,
  sig: 'def length_of_lis(nums):\n    # length of the longest strictly increasing subsequence\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
