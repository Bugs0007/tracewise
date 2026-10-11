import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './target-sum.py?raw';
import cases from './target-sum.cases.json';

const show = (m: Map<number, number>) => Object.fromEntries([...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k >= 0 ? `+${k}` : `${k}`, `${v} way${v === 1 ? '' : 's'}`]));

const viz = vizOf<{ nums: number[]; target: number }>({
  id: 'target-sum',
  title: 'Target Sum',
  solution,
  inputs: [
    { key: 'nums', label: 'numbers (≥ 0)', kind: 'numbers', default: [2, 1, 3, 2], maxItems: 6 },
    { key: 'target', label: 'target', kind: 'number', default: 2 },
  ],
  presets: [
    { label: 'Several ways', input: { nums: [2, 1, 3, 2], target: 2 } },
    { label: 'Zeros double it', input: { nums: [0, 0, 3], target: 3 } },
    { label: 'Unreachable', input: { nums: [1, 1], target: 5 } },
    { label: 'Balanced', input: { nums: [3, 3], target: 0 } },
  ],
  validate: ({ nums, target }) => (!nums.length || nums.some((v) => v === null || !Number.isInteger(v) || v < 0) ? 'Use whole numbers ≥ 0' : !Number.isInteger(target) ? 'The target must be a whole number' : null),
  run({ nums, target }) {
    const r = new TraceRecorder(solution);
    let ways = new Map<number, number>([[0, 1]]);
    let askedFirst = false;
    let askedSum = false;
    let askedDone = false;
    const view = (i = -1, nxt?: Map<number, number>) => [
      arrayView(nums, { title: 'numbers (each gets a + or a − sign)', pointers: i >= 0 ? { x: i } : {} }),
      hashMapView(show(ways), { title: 'ways[total] = sign choices so far that give this total' }),
      ...(nxt ? [hashMapView(show(nxt), { title: 'nxt: totals after this number' })] : []),
    ];
    r.step('init', 'ways maps each possible running total to the number of sign choices that produce it. Before any number: total 0 in one way (choose nothing).', view(), {});
    for (let i = 0; i < nums.length; i++) {
      r.op();
      const x = nums[i];
      const nxt = new Map<number, number>();
      r.step('loop', `Number ${x}: every existing total can go to total + ${x} or total − ${x}.`, view(i), { x });
      if (!askedFirst) {
        askedFirst = true;
        const outs = new Set([...ways.keys()].flatMap((t) => [t + x, t - x]));
        r.predictChoice('plus', `Current totals: ${[...ways.keys()].sort((a, b) => a - b).join(', ')}. After using ${x}, how many different totals can exist?`, String(outs.size), [String(outs.size + 1), String(ways.size), String(ways.size * 2 + 1)], i, 'Each total splits into total + x and total − x; some of those can coincide.');
      }
      for (const [total, count] of ways) {
        nxt.set(total + x, (nxt.get(total + x) ?? 0) + count);
        nxt.set(total - x, (nxt.get(total - x) ?? 0) + count);
      }
      r.step('plus', `New totals: ${Object.entries(show(nxt)).map(([k, v]) => `${k} (${v})`).join(', ')}.`, view(i, nxt), {});
      if (!askedSum && [...nxt.values()].some((v) => v > 1)) {
        askedSum = true;
        r.predict('swap', 'A total appears from two different earlier totals. What happens to its count in nxt?', ['The two counts add up', 'The larger one is kept', 'It is counted once'], 0, 'Different sign choices that reach the same total are different ways, so their counts are added.');
      }
      ways = nxt;
      r.step('swap', `ways = nxt: ${nxt.size} possible total${nxt.size === 1 ? '' : 's'} after ${i + 1} number${i === 0 ? '' : 's'}.`, view(i), {});
    }
    const res = ways.get(target) ?? 0;
    if (!askedDone) {
      askedDone = true;
      r.predictChoice('done', `Look at the final table. How many ways give the target ${target}?`, String(res), [String(res + 1), String(ways.size), res === 0 ? '1' : '0'], nums.length, 'Read the count stored for the target (0 if the target does not appear).');
    }
    r.step('done', res ? `${res} way${res === 1 ? '' : 's'} give ${target}.` : `The target ${target} is never reached: 0 ways.`, view(), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ nums, target }) {
    let c = 0;
    for (let mask = 0; mask < 1 << nums.length; mask++) if (nums.reduce((s, x, i) => s + (mask >> i & 1 ? -x : x), 0) === target) c++;
    return c;
  },
});

export default problem({
  summary: 'Given a list of non-negative numbers and a target, put a + or a − in front of every number and add them up. Count how many different sign assignments give exactly the target.',
  example: ['nums [1, 1], target 0', '2', '+1 −1 and −1 +1 both give 0.'],
  pattern: ['dp-2d', ['dp-2d', 'backtracking', 'dp-1d', 'dfs'], 'The state is (how many numbers are used, current total). Instead of trying 2ⁿ sign choices, keep a table of how many ways reach each total after each number.', {
    backtracking: 'Trying all 2ⁿ sign choices works for tiny inputs but repeats totals.',
    'dp-1d': 'The state really has two coordinates (position and total); the dictionary per position is the table.',
    dfs: 'Recursion over (index, total) is exponential unless memoised, which is this table.',
  }],
  hints: [
    'After using the first i numbers, what do you need to remember about the signs chosen?',
    'Different sign choices can lead to the same total. How should you handle that?',
    'ways = {0: 1}. For each x build nxt: for each (total, count), add count to nxt[total + x] and to nxt[total − x]. Answer ways.get(target, 0).',
  ],
  insight: 'Only the running total matters; merge all sign choices that reach the same total by adding their counts.',
  brute: 'Try all 2ⁿ sign assignments.',
  optimal: 'Dictionary DP: O(n · distinct totals) time and space.',
  walk: ['ways = {0: 1}.', 'For each x: nxt = {}; for each (total, count) add count to nxt[total + x] and nxt[total − x].', 'ways = nxt.', 'Return ways.get(target, 0).'],
  edge: ['Zeros (each doubles the count).', 'Target out of reach.', 'Negative target.', 'A single number.'],
  works: ['By induction, ways[t] after i numbers equals the number of sign choices for the first i numbers with sum t.', 'Adding the next number branches every choice in two.'],
  time: ['O(n · S)', 'S = number of distinct totals (at most 2 · sum + 1).'],
  space: ['O(S)', 'The dictionaries.'],
  solution,
  cases,
  sig: 'def find_target_sum_ways(nums, target):\n    # number of ways to assign + / − to every number so that the total is target\n    pass\n',
  viz,
  fromArgs: ([nums, target]) => ({ nums, target }),
});
