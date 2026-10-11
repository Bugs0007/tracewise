import { chipsView } from '@/dsa/viz/prims';
import { CallTree } from '@/dsa/viz/calltree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './subsets-ii.py?raw';
import cases from './subsets-ii.cases.json';

const show = (p: readonly (number | string)[]) => `[${p.join(', ')}]`;

const viz = vizOf<{ nums: number[] }>({
  id: 'subsets-ii',
  title: 'Subsets II',
  solution,
  inputs: [{ key: 'nums', label: 'numbers (repeats allowed)', kind: 'numbers', default: [2, 1, 2], maxItems: 5 }],
  presets: [
    { label: 'One duplicate', input: { nums: [2, 1, 2] } },
    { label: 'All equal', input: { nums: [3, 3, 3] } },
    { label: 'No duplicates', input: { nums: [1, 2, 3] } },
    { label: 'Two pairs', input: { nums: [1, 1, 2, 2] } },
  ],
  validate: ({ nums }) => (nums.some((v) => v === null) ? 'Use plain numbers' : null),
  run({ nums: input }) {
    const r = new TraceRecorder(solution);
    const nums = [...input].sort((a, b) => a - b);
    const tree = new CallTree('[]');
    const path: number[] = [];
    const res: number[][] = [];
    const view = () => [tree.panel('every node is a subset; children add one more number'), chipsView(nums, { title: 'sorted numbers' }), chipsView(path, { title: 'path' }), chipsView(res.map(show), { title: 'subsets recorded' })];
    r.step('sort', `Sort: ${show(nums)}. Equal numbers become neighbours.`, view(), {});
    let askedDup = false;
    let askedRecord = false;
    const dfs = (start: number, id: string) => {
      r.op();
      tree.tone(id, 'active');
      r.step('def', `dfs(start=${start}): the current path ${show(path)} is itself a subset.`, view(), { start });
      if (!askedRecord) {
        askedRecord = true;
        r.predict('record', 'Unlike Subsets, we record at the start of every call, not only at the end. Why?', ['Every path is already a valid subset', 'Only full paths are valid', 'To count the calls'], 0, 'A subset can stop at any size, so each node of the tree is an answer.');
      }
      res.push([...path]);
      tree.tone(id, 'found');
      r.step('record', `Record ${show(path)}.`, view(), {});
      for (let i = start; i < nums.length; i++) {
        if (i > start && nums[i] === nums[i - 1]) {
          r.step('dup', `nums[${i}] = ${nums[i]} equals nums[${i - 1}] and i > start: a branch starting with ${nums[i]} was already explored at this level.`, view(), {});
          if (!askedDup) {
            askedDup = true;
            r.predict('dup', `Equal to the previous number and not the first choice here. What do we do with ${nums[i]}?`, ['Skip it', 'Use it', 'Stop the loop'], 0, 'Using it would build exactly the same subsets as the earlier equal number did.');
          }
          r.step('skipDup', `Skip ${nums[i]}.`, view(), {});
          continue;
        }
        path.push(nums[i]);
        const child = tree.add(id, show(path), `+${nums[i]}`);
        r.step('choose', `Add ${nums[i]} to the path.`, view(), {});
        dfs(i + 1, child);
        path.pop();
        r.step('undo', `Undo: remove ${nums[i]}.`, view(), {});
      }
    };
    dfs(0, tree.root);
    r.step('done', `${res.length} distinct subsets recorded.`, view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ nums: input }) {
    const nums = [...input].sort((a, b) => a - b);
    const out: number[][] = [];
    const path: number[] = [];
    const go = (start: number) => {
      out.push([...path]);
      for (let i = start; i < nums.length; i++) {
        if (i > start && nums[i] === nums[i - 1]) continue;
        path.push(nums[i]);
        go(i + 1);
        path.pop();
      }
    };
    go(0);
    return out;
  },
});

export default problem({
  summary: 'Given a list of numbers that may contain repeats, return all possible subsets without listing the same subset twice. Subsets can be in any order.',
  example: ['[2, 2, 5]', '[[], [2], [2, 2], [2, 2, 5], [2, 5], [5]]', 'The two 2s are interchangeable, so [2] appears once, not twice.'],
  pattern: ['backtracking', ['backtracking', 'dfs', 'hash-lookup', 'sorting'], 'Build subsets by choosing the next element at or after the current index. Sorting first and skipping a value that equals its previous neighbour at the same level prevents duplicate subsets.', {
    dfs: 'The search is a DFS with explicit undo: backtracking.',
    'hash-lookup': 'You could deduplicate with a set of tuples, but skipping at the source is cleaner and faster.',
    sorting: 'Sorting is a preparation step for the duplicate rule.',
  }],
  hints: [
    'What goes wrong if you reuse the plain Subsets solution on [2, 2]?',
    'If equal numbers sit next to each other, when is choosing the second 2 a repeat of choosing the first?',
    'Sort. dfs(start): record the path; for i from start, skip when i > start and nums[i] == nums[i−1]; otherwise push, recurse with i + 1, pop.',
  ],
  insight: 'Within one level of the tree, never start two branches with the same value.',
  brute: 'Generate all 2ⁿ subsets, sort each, and deduplicate through a set.',
  optimal: 'Sorted backtracking with duplicate skipping: O(n · 2ⁿ).',
  walk: ['Sort the numbers.', 'dfs(start): append a copy of the path to the result.', 'For i from start to the end: if i > start and nums[i] equals nums[i−1], continue.', 'Append nums[i], dfs(i + 1), pop.'],
  edge: ['Empty list.', 'All numbers equal.', 'Duplicates that are not adjacent in the input (sorting fixes it).', 'No duplicates at all.'],
  works: ['Choosing elements in increasing index order generates each combination of positions once.', 'Skipping equal neighbours at the same level collapses identical value-multisets into one.'],
  time: ['O(n · 2ⁿ)', 'At most 2ⁿ subsets, each copied.'],
  space: ['O(n)', 'Path and recursion depth.'],
  solution,
  cases,
  sig: 'def subsets_with_dup(nums):\n    # all distinct subsets; nums may contain repeats\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
