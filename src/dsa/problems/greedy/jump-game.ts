import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './jump-game.py?raw';
import cases from './jump-game.cases.json';

const viz = vizOf<{ nums: number[] }>({
  id: 'jump-game',
  title: 'Jump Game',
  solution,
  inputs: [{ key: 'nums', label: 'maximum jump length from each cell', kind: 'numbers', default: [2, 1, 0, 0, 4], maxItems: 10 }],
  presets: [
    { label: 'Stuck on zeros', input: { nums: [2, 1, 0, 0, 4] } },
    { label: 'Enough reach', input: { nums: [3, 0, 2, 0, 1] } },
    { label: 'Big first jump', input: { nums: [9, 0, 0, 0, 0] } },
    { label: 'Single cell', input: { nums: [0] } },
  ],
  validate: ({ nums }) => (!nums.length || nums.some((v) => v === null || !Number.isInteger(v) || v < 0) ? 'Use whole numbers ≥ 0' : null),
  run({ nums }) {
    const r = new TraceRecorder(solution);
    let reach = 0;
    let askedUpdate = false;
    let askedStuck = false;
    const view = (i: number) => [
      arrayView(nums, { title: 'cells (green = reachable so far)', pointers: { i, reach: Math.min(reach, nums.length - 1) }, tones: Object.fromEntries(nums.map((_, k) => [k, (k === i ? 'active' : k <= reach ? 'found' : 'default') as Tone])) }),
      hashMapView({ 'farthest reachable index': reach }),
    ];
    r.step('init', 'reach is the farthest index we know we can get to. At the start only index 0 is reachable.', view(0), {});
    for (let i = 0; i < nums.length; i++) {
      r.op();
      r.step('loop', `Standing at index ${i} (jump length ${nums[i]}). Is it reachable? reach = ${reach}.`, view(i), { i });
      if (i > reach) {
        if (!askedStuck) {
          askedStuck = true;
          r.predict('stuck', `Index ${i} is beyond reach = ${reach}. What does that mean?`, ['We can never arrive here: return False', 'We can jump to it anyway', 'Skip to the next index'], 0, 'No earlier cell can jump this far, and everything beyond is even farther.');
        }
        r.step('stuckRet', `Index ${i} > reach ${reach}: it cannot be reached, so neither can the end. Return False.`, view(i), { result: false });
        return { frames: r.frames, result: false };
      }
      const nr = Math.max(reach, i + nums[i]);
      if (!askedUpdate && nr > reach) {
        askedUpdate = true;
        r.predictChoice('update', `From index ${i} you can jump up to ${nums[i]}, and reach is ${reach}. What is the new reach?`, String(nr), [String(reach), String(i + nums[i] + 1), String(nums[i])], i, 'reach = max(reach, i + jump): the farthest of everything seen.');
      }
      const old = reach;
      reach = nr;
      r.step('update', `reach = max(${old}, ${i} + ${nums[i]}) = ${reach}.`, view(i), { reach });
    }
    r.step('done', 'Every index was reachable, including the last one. Return True.', view(nums.length - 1), { result: true });
    return { frames: r.frames, result: true };
  },
  reference({ nums }) {
    let reach = 0;
    for (let i = 0; i < nums.length; i++) {
      if (i > reach) return false;
      reach = Math.max(reach, i + nums[i]);
    }
    return true;
  },
});

export default problem({
  summary: 'You start on the first cell of a row. The number on each cell is the maximum jump length from it (you may jump any shorter distance too). Decide whether you can reach the last cell.',
  example: ['[1, 0, 1]', 'false', 'From index 0 you can only reach index 1, whose jump length is 0, so index 2 is out of reach.'],
  pattern: ['greedy', ['greedy', 'dp-1d', 'dfs', 'bfs'], 'You do not need to know which exact jumps to take, only how far you can get. Tracking the farthest reachable index is enough: if you ever stand beyond it, you are stuck.', {
    'dp-1d': 'A table of reachable cells works, but the farthest reach summarises it in one number.',
    dfs: 'Trying every jump is exponential without memory.',
    bfs: 'BFS over cells is O(n²) here; the greedy reach is O(n).',
  }],
  hints: [
    'Instead of which cells are reachable, can you describe them by one number?',
    'If index j is reachable, which cells before it are reachable?',
    'Keep reach = farthest index reachable. For each i: if i > reach return False, otherwise reach = max(reach, i + nums[i]).',
  ],
  insight: 'Reachable cells form a prefix of the row, so the farthest reach is all you need.',
  brute: 'DFS over every jump: exponential without memory, O(n²) with.',
  optimal: 'Greedy: O(n) time, O(1) space.',
  walk: ['reach = 0.', 'For each index i: if i > reach return False.', 'reach = max(reach, i + nums[i]).', 'After the loop return True.'],
  edge: ['A single cell.', 'A zero at the start.', 'A zero in the middle that can be jumped over.', 'A big first jump.'],
  works: ['If cell i is reachable then so is every cell before it up to i (shorter jumps are allowed), so the reachable set is always a prefix.', 'Extending it by i + nums[i] for each reachable i keeps it exact.'],
  time: ['O(n)', 'One pass.'],
  space: ['O(1)', 'One variable.'],
  solution,
  cases,
  sig: 'def can_jump(nums):\n    # True if the last index can be reached from index 0\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
