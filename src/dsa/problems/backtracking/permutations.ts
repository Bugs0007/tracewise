import type { Tone } from '@/engine/types';
import { arrayView, chipsView } from '@/dsa/viz/prims';
import { CallTree } from '@/dsa/viz/calltree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './permutations.py?raw';
import cases from './permutations.cases.json';

const show = (p: readonly (number | string)[]) => `[${p.join(', ')}]`;

const viz = vizOf<{ nums: number[] }>({
  id: 'permutations',
  title: 'Permutations',
  solution,
  inputs: [{ key: 'nums', label: 'distinct numbers', kind: 'numbers', default: [1, 2, 3], maxItems: 4 }],
  presets: [
    { label: 'Three numbers', input: { nums: [1, 2, 3] } },
    { label: 'Two numbers', input: { nums: [0, 1] } },
    { label: 'One number', input: { nums: [9] } },
    { label: 'Four numbers', input: { nums: [1, 2, 3, 4] } },
  ],
  validate: ({ nums }) => (!nums.length ? 'Enter at least one number' : nums.some((v) => v === null) ? 'Use plain numbers' : new Set(nums).size !== nums.length ? 'Numbers must be distinct' : null),
  run({ nums }) {
    const r = new TraceRecorder(solution);
    const tree = new CallTree('[]');
    const path: number[] = [];
    const used = nums.map(() => false);
    const res: number[][] = [];
    const view = (at = -1) => [
      tree.panel('each level picks the next unused number'),
      arrayView(nums, { title: 'numbers (green = already in the path)', tones: Object.fromEntries(nums.map((_, i) => [i, (i === at ? 'active' : used[i] ? 'done' : 'default') as Tone])) }),
      chipsView(path, { title: 'path' }),
      chipsView(res.map(show), { title: 'permutations recorded' }),
    ];
    const total = nums.reduce((a, _, i) => a * (i + 1), 1);
    r.step('init', `${nums.length} numbers can be arranged in ${nums.length}! = ${total} ways.`, view(), {});
    let askedSkip = false;
    let askedFull = false;
    let askedUnmark = false;
    const dfs = (id: string) => {
      r.op();
      tree.tone(id, 'active');
      r.step('def', `dfs(): the path ${show(path)} has ${path.length} of ${nums.length} numbers.`, view(), {});
      if (path.length === nums.length) {
        if (!askedFull) {
          askedFull = true;
          r.predict('full', 'The path now holds every number. What happens?', ['Record a copy and return', 'Keep looping', 'Pop the last number and stop everything'], 0, 'A full path is one complete permutation.');
        }
        res.push([...path]);
        tree.tone(id, 'found');
        r.step('record', `Record ${show(path)}.`, view(), {});
        return;
      }
      for (let i = 0; i < nums.length; i++) {
        if (used[i]) {
          r.step('skipUsed', `${nums[i]} is already in the path: skip it.`, view(i), {});
          if (!askedSkip) {
            askedSkip = true;
            r.predict('skip', `${nums[i]} is already used in this path. What does the loop do?`, ['Skip to the next number', 'Add it again', 'Return'], 0, 'A permutation uses each number exactly once.');
          }
          continue;
        }
        used[i] = true;
        path.push(nums[i]);
        const child = tree.add(id, show(path), `${nums[i]}`);
        r.step('choose', `Mark ${nums[i]} as used and append it.`, view(i), {});
        dfs(child);
        path.pop();
        used[i] = false;
        tree.tone(id, 'active');
        r.step('undo', `Undo: pop ${nums[i]} and mark it unused again.`, view(i), {});
        if (!askedUnmark) {
          askedUnmark = true;
          r.predict('unmark', `After exploring everything that starts ${show([...path, nums[i]])}, ${nums[i]} must become available again. Why?`, ['The next branch may need it in a different position', 'To save memory', 'It is not needed'], 0, 'Each branch builds its own arrangement, so every number has to be free again before the next branch.');
        }
      }
      if (tree.nodes[id].tone !== 'found') tree.tone(id, 'done');
    };
    dfs(tree.root);
    r.step('done', `All ${res.length} permutations recorded.`, view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ nums }) {
    const out: number[][] = [];
    const path: number[] = [];
    const used = nums.map(() => false);
    const go = () => {
      if (path.length === nums.length) return void out.push([...path]);
      nums.forEach((v, i) => {
        if (used[i]) return;
        used[i] = true;
        path.push(v);
        go();
        path.pop();
        used[i] = false;
      });
    };
    go();
    return out;
  },
});

export default problem({
  summary: 'Given a list of distinct numbers, return every possible ordering of them (every permutation), in any order.',
  example: ['[1, 2, 3]', '[[1,2,3], [1,3,2], [2,1,3], [2,3,1], [3,1,2], [3,2,1]]', 'Three numbers have 3! = 6 orderings.'],
  pattern: ['backtracking', ['backtracking', 'dfs', 'bfs', 'divide-conquer'], 'Build an ordering one position at a time, choosing any number not yet used, then undo the choice to try another. That is the backtracking template with a "used" marker.', {
    dfs: 'The recursion is DFS; backtracking is the name for the choose / undo discipline.',
    bfs: 'Level-by-level growth of partial permutations works but copies lists.',
    'divide-conquer': 'There is no independent sub-problem to merge.',
  }],
  hints: [
    'How many choices do you have for the first position? For the second?',
    'How do you remember which numbers are already in the current arrangement?',
    'Keep a path and a used[] flag per number. dfs(): if the path is full, record a copy; otherwise try every unused number: mark, append, recurse, pop, unmark.',
  ],
  insight: 'Each level of the recursion fills one position; the used[] array removes numbers that are already placed.',
  brute: 'itertools.permutations: the same n! results.',
  optimal: 'Backtracking: O(n · n!) time because each of the n! results is copied, O(n) extra space.',
  walk: ['Create path, used = [False] * n, and res.', 'dfs(): if len(path) == n, append a copy of path to res.', 'Otherwise loop over every index i; skip it if used[i].', 'Mark it, append the number, recurse, then undo both.'],
  edge: ['A single number (one permutation).', 'Negative numbers and zero.', 'Forgetting to unmark after the recursion.', 'Recording path instead of a copy.'],
  works: ['The decision tree has n choices at the first level, n − 1 at the next, and so on, so each ordering is a unique root-to-leaf path.', 'Unmarking restores the state so siblings are explored from identical conditions.'],
  time: ['O(n · n!)', 'n! leaves, each copied in O(n).'],
  space: ['O(n)', 'Path, used flags and recursion depth.'],
  solution,
  cases,
  sig: 'def permute(nums):\n    # return every ordering of nums\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
