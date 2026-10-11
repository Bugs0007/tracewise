import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './jump-game-ii.py?raw';
import cases from './jump-game-ii.cases.json';

const reachable = (nums: number[]) => {
  let reach = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i > reach) return false;
    reach = Math.max(reach, i + nums[i]);
  }
  return true;
};

const viz = vizOf<{ nums: number[] }>({
  id: 'jump-game-ii',
  title: 'Jump Game II',
  solution,
  inputs: [{ key: 'nums', label: 'maximum jump length from each cell (the last cell must be reachable)', kind: 'numbers', default: [2, 3, 1, 1, 2, 1, 1], maxItems: 10 }],
  presets: [
    { label: 'Two or three jumps', input: { nums: [2, 3, 1, 1, 2, 1, 1] } },
    { label: 'Each step is one', input: { nums: [1, 1, 1, 1] } },
    { label: 'One jump', input: { nums: [5, 0, 0] } },
    { label: 'Single cell', input: { nums: [0] } },
  ],
  validate: ({ nums }) => (!nums.length || nums.some((v) => v === null || !Number.isInteger(v) || v < 0) ? 'Use whole numbers ≥ 0' : !reachable(nums) ? 'The last cell must be reachable' : null),
  run({ nums }) {
    const r = new TraceRecorder(solution);
    let jumps = 0;
    let end = 0;
    let farthest = 0;
    let askedEdge = false;
    let askedFar = false;
    const view = (i: number) => [
      arrayView(nums, { title: 'cells (teal = what the current jump count can reach)', pointers: { i, end: Math.min(end, nums.length - 1), farthest: Math.min(farthest, nums.length - 1) }, tones: Object.fromEntries(nums.map((_, k) => [k, (k === i ? 'active' : k <= end ? 'found' : k <= farthest ? 'frontier' : 'default') as Tone])) }),
      hashMapView({ jumps, 'end of the current jump': end, 'farthest seen': farthest }),
    ];
    r.step('init', 'jumps counts the jumps used; end is the farthest cell the current number of jumps can reach; farthest is the farthest cell any cell scanned so far can jump to.', view(0), {});
    for (let i = 0; i < nums.length - 1; i++) {
      r.op();
      const old = farthest;
      farthest = Math.max(farthest, i + nums[i]);
      r.step('far', `Cell ${i} can reach up to ${i} + ${nums[i]} = ${i + nums[i]}. farthest = max(${old}, ${i + nums[i]}) = ${farthest}.`, view(i), { i });
      if (!askedFar && farthest > old && i > 0) {
        askedFar = true;
        r.predict('far', `farthest is ${farthest}. Does the jump count change yet?`, i === end ? ['Yes: this is the end of the current jump, so we must jump now', 'No'] : ['No: we are still inside the cells the current jump reaches', 'Yes'], 0, i === end ? 'Reaching the end of the current jump\'s range forces the next jump.' : 'We only count a new jump when we pass the end of the current range.');
      }
      if (i === end) {
        if (!askedEdge) {
          askedEdge = true;
          r.step('edge', `Index ${i} is the end of the current jump range: we must jump again.`, view(i), {});
          r.predictChoice('edge', `We take another jump. How far can the new jump range reach (end becomes)?`, String(farthest), [String(i + 1), String(farthest + 1), String(end)], i, 'Among all cells passed so far we jump from the one that reaches farthest.');
        }
        jumps++;
        end = farthest;
        r.step('move', `Jump #${jumps}: the new range ends at ${end}.`, view(i), { jumps, end });
      }
    }
    r.step('done', `The last cell needs ${jumps} jump${jumps === 1 ? '' : 's'}.`, view(nums.length - 1), { result: jumps });
    return { frames: r.frames, result: jumps };
  },
  reference({ nums }) {
    let jumps = 0;
    let end = 0;
    let far = 0;
    for (let i = 0; i < nums.length - 1; i++) {
      far = Math.max(far, i + nums[i]);
      if (i === end) {
        jumps++;
        end = far;
      }
    }
    return jumps;
  },
});

export default problem({
  summary: 'As in Jump Game, each cell tells the longest jump you may make from it, and you start on the first cell. The last cell is guaranteed to be reachable. Find the minimum number of jumps needed to reach it.',
  example: ['[2, 1, 3, 0, 1]', '2', 'Jump from index 0 to index 2 (length 2), then from index 2 to the end (length 3 reaches index 4, jump 2).'],
  pattern: ['greedy', ['greedy', 'dp-1d', 'bfs', 'dfs'], 'Think of it as BFS on levels: all cells reachable in k jumps form a range. Scan the row once, keep the end of the current range and the farthest anything in it can reach; passing the end means one more jump.', {
    'dp-1d': 'A table of minimum jumps per cell is O(n²); the range idea is O(n).',
    bfs: 'The solution is an implicit BFS where each level is a contiguous range, which lets us avoid the queue.',
    dfs: 'Plain recursion is exponential without memory.',
  }],
  hints: [
    'After one jump, which cells can you be on? After two?',
    'Those sets are contiguous ranges. How do you get the end of the next range?',
    'Track end (of the current range) and farthest (reached from any cell so far). When i == end, count a jump and set end = farthest.',
  ],
  insight: 'Each jump count corresponds to a range of cells; the next range ends at the farthest reach from the current one.',
  brute: 'BFS or DP over positions: O(n²).',
  optimal: 'Greedy range scan: O(n) time, O(1) space.',
  walk: ['jumps = end = farthest = 0.', 'For i in 0 … n − 2: farthest = max(farthest, i + nums[i]).', 'If i == end: jumps += 1 and end = farthest.', 'Return jumps.'],
  edge: ['A single cell (0 jumps).', 'The first jump reaches the end.', 'All jumps of length 1.', 'A zero cell inside a range that is jumped over.'],
  works: ['The cells reachable with k jumps are exactly indices ≤ end_k; end_(k+1) is the maximum of i + nums[i] over i ≤ end_k, which is what farthest accumulates by the time i reaches end_k.'],
  time: ['O(n)', 'One pass.'],
  space: ['O(1)', 'Three variables.'],
  solution,
  cases,
  sig: 'def jump(nums):\n    # minimum number of jumps to reach the last index (it is reachable)\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
