import { chipsView } from '@/dsa/viz/prims';
import { CallTree } from '@/dsa/viz/calltree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './subsets.py?raw';
import cases from './subsets.cases.json';

const show = (p: readonly (number | string)[]) => `[${p.join(', ')}]`;

const viz = vizOf<{ nums: number[] }>({
  id: 'subsets',
  title: 'Subsets',
  solution,
  inputs: [{ key: 'nums', label: 'distinct numbers', kind: 'numbers', default: [1, 2, 3], maxItems: 4 }],
  presets: [
    { label: 'Three numbers', input: { nums: [1, 2, 3] } },
    { label: 'Two numbers', input: { nums: [4, 9] } },
    { label: 'Empty', input: { nums: [] } },
    { label: 'Four numbers', input: { nums: [1, 2, 3, 4] } },
  ],
  validate: ({ nums }) => (nums.some((v) => v === null) ? 'Use plain numbers' : new Set(nums).size !== nums.length ? 'Numbers must be distinct' : null),
  run({ nums }) {
    const r = new TraceRecorder(solution);
    const tree = new CallTree('[]');
    const path: number[] = [];
    const res: number[][] = [];
    const view = () => [tree.panel('decision tree: every level decides one number (take it or skip it)'), chipsView(path, { title: 'path: the subset being built' }), chipsView(res.map(show), { title: 'subsets recorded so far' })];
    r.step('init', `res collects every subset. For each of the ${nums.length} numbers we will choose "take" or "skip", so there will be 2^${nums.length} = ${2 ** nums.length} subsets.`, view(), {});
    r.predictChoice('count', `With ${nums.length} numbers, how many subsets (including the empty one) will be recorded?`, String(2 ** nums.length), [String(nums.length * 2), String(2 ** nums.length - 1), String(nums.length ** 2 + 1)], nums.length, 'Each number is independently taken or skipped: 2 × 2 × … × 2.');
    let askedLeaf = false;
    let askedUndo = false;
    const dfs = (i: number, id: string) => {
      r.op();
      tree.tone(id, 'active');
      r.step('def', `dfs(${i}): decide nums[${i}]${i < nums.length ? ` = ${nums[i]}` : ''}. Path so far: ${show(path)}.`, view(), { i });
      if (i === nums.length) {
        r.step('leaf', `i == ${nums.length}: every number has been decided.`, view(), { i });
        if (!askedLeaf) {
          askedLeaf = true;
          r.predictChoice('leaf', 'What is added to the result at this leaf?', show(path), [show([...path, 0]), show(nums), '[]'], path.length, 'The path holds exactly the numbers taken on the way down: that is one subset.');
        }
        res.push([...path]);
        tree.tone(id, 'found');
        r.step('record', `Record a copy of the path: ${show(path)}. (We copy it, because the path list keeps changing.)`, view(), { subset: show(path) });
        return;
      }
      path.push(nums[i]);
      const take = tree.add(id, show(path), `take ${nums[i]}`);
      r.step('take', `Take ${nums[i]}: append it to the path and explore with it included.`, view(), { path: show(path) });
      dfs(i + 1, take);
      path.pop();
      tree.tone(id, 'active');
      r.step('undo', `Back at dfs(${i}). Undo the choice with path.pop(): the path is ${show(path)} again.`, view(), { path: show(path) });
      if (!askedUndo) {
        askedUndo = true;
        r.predict('undo', 'The "take" branch is finished. Why must we pop the number before exploring the "skip" branch?', ['So the skip branch starts without that number', 'To free memory', 'To record the subset'], 0, 'The same path list is shared by every call, so each branch has to restore it before the next branch begins.');
      }
      const skip = tree.add(id, show(path), `skip ${nums[i]}`);
      r.step('skip', `Skip ${nums[i]}: explore without it.`, view(), {});
      dfs(i + 1, skip);
      tree.tone(id, 'done');
    };
    dfs(0, tree.root);
    r.step('done', `All ${res.length} subsets recorded.`, view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ nums }) {
    const out: number[][] = [];
    const path: number[] = [];
    const go = (i: number) => {
      if (i === nums.length) return void out.push([...path]);
      path.push(nums[i]);
      go(i + 1);
      path.pop();
      go(i + 1);
    };
    go(0);
    return out;
  },
});

export default problem({
  summary: 'Given a list of distinct numbers, return every possible subset (the power set), including the empty subset and the full list. The subsets can come in any order.',
  example: ['[4, 7]', '[[], [4], [7], [4, 7]]', 'Two numbers give 2² = 4 subsets.'],
  pattern: ['backtracking', ['backtracking', 'dfs', 'bfs', 'dp-1d'], 'Each number is either in the subset or not. Building a subset one decision at a time, recursing, then undoing the decision to try the other option is the backtracking template.', {
    dfs: 'The recursion is a depth-first walk over the decision tree. Backtracking names the "undo and try the other choice" step explicitly.',
    bfs: 'You can grow subsets level by level, but then you copy lists instead of undoing choices.',
    'dp-1d': 'Nothing is reused between sub-problems; every subset must be output.',
  }],
  hints: [
    'Think about a single number: how many options does it give each subset?',
    'Process the numbers in order. At position i you choose: include nums[i] or not. What do you do once every position is decided?',
    'dfs(i): if i == n, record a copy of the path. Otherwise append nums[i], recurse with i + 1, pop, then recurse with i + 1 again.',
  ],
  insight: 'A subset is a sequence of take / skip decisions, one per number, so the answers are the leaves of a binary decision tree.',
  brute: 'Enumerate every bitmask from 0 to 2ⁿ − 1 and build the subset from its set bits: same count of outputs.',
  optimal: 'Backtracking: O(n · 2ⁿ) time (each of the 2ⁿ subsets is copied once), O(n) extra space for the path.',
  walk: ['Keep a shared list path and a result list.', 'dfs(i): if i == len(nums), append a copy of path to the result and return.', 'Take: path.append(nums[i]); dfs(i + 1); path.pop() to undo.', 'Skip: dfs(i + 1) without the number.'],
  edge: ['Empty input: the answer is [[]].', 'A single number.', 'Negative numbers.', 'Recording path itself instead of a copy (a classic bug: every result would end up empty).'],
  works: ['The decision tree has one leaf per take / skip pattern, so every subset appears exactly once.', 'Popping after the first branch restores the path, so the second branch starts from the same state.'],
  time: ['O(n · 2ⁿ)', '2ⁿ leaves; each copies a path of up to n numbers.'],
  space: ['O(n)', 'The recursion stack and the path (not counting the output).'],
  solution,
  cases,
  sig: 'def subsets(nums):\n    # return every subset of nums (any order)\n    pass\n',
  viz,
  fromArgs: ([nums]) => ({ nums }),
});
