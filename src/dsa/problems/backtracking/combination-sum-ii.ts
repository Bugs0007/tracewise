import { chipsView } from '@/dsa/viz/prims';
import { CallTree } from '@/dsa/viz/calltree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './combination-sum-ii.py?raw';
import cases from './combination-sum-ii.cases.json';

const show = (p: readonly (number | string)[]) => `[${p.join(', ')}]`;

const viz = vizOf<{ candidates: number[]; target: number }>({
  id: 'combination-sum-ii',
  title: 'Combination Sum II',
  solution,
  inputs: [
    { key: 'candidates', label: 'positive numbers (repeats allowed in the list)', kind: 'numbers', default: [2, 1, 2, 3], maxItems: 5 },
    { key: 'target', label: 'target', kind: 'number', default: 5 },
  ],
  presets: [
    { label: 'Duplicates', input: { candidates: [2, 1, 2, 3], target: 5 } },
    { label: 'All equal', input: { candidates: [2, 2, 2, 2], target: 4 } },
    { label: 'No way', input: { candidates: [3, 4, 5], target: 2 } },
  ],
  validate: ({ candidates, target }) => (candidates.some((v) => v === null || !Number.isInteger(v) || v < 1) ? 'Candidates must be whole numbers of at least 1' : !Number.isInteger(target) || target < 1 || target > 15 ? 'Target must be a whole number from 1 to 15' : null),
  run({ candidates, target }) {
    const r = new TraceRecorder(solution);
    const nums = [...candidates].sort((a, b) => a - b);
    const tree = new CallTree('[]');
    tree.badge(tree.root, `${target} left`);
    const path: number[] = [];
    const res: number[][] = [];
    const view = () => [tree.panel('each branch uses one more number; the badge shows what is still needed'), chipsView(nums, { title: 'sorted candidates' }), chipsView(path, { title: 'path' }), chipsView(res.map(show), { title: 'combinations found' })];
    r.step('sort', `Sort: ${show(nums)}. Equal numbers are now neighbours, which makes duplicates easy to spot.`, view(), {});
    r.step('init', `Each number may be used at most once, and the result must not contain the same combination twice.`, view(), {});
    let askedDup = false;
    let askedOnce = false;
    const dfs = (start: number, remaining: number, id: string) => {
      r.op();
      tree.tone(id, 'active');
      r.step('def', `dfs(start=${start}, remaining=${remaining}). Path: ${show(path)}.`, view(), { start, remaining });
      if (remaining === 0) {
        res.push([...path]);
        tree.tone(id, 'found');
        r.step('record', `remaining is 0: record ${show(path)}.`, view(), {});
        return;
      }
      for (let i = start; i < nums.length; i++) {
        if (i > start && nums[i] === nums[i - 1]) {
          r.step('dup', `nums[${i}] = ${nums[i]} equals nums[${i - 1}] and ${i} > start (${start}): starting a branch with this value again would repeat an earlier branch.`, view(), { i });
          if (!askedDup) {
            askedDup = true;
            r.predict('dup', `Here ${nums[i]} equals the previous number, and it is not the first choice at this level. What do we do?`, ['Skip it (continue)', 'Use it again', 'Stop the loop'], 0, 'The earlier equal number already explored every combination that begins this way at this level, so repeating it only creates duplicates.');
          }
          r.step('skipDup', `Skip ${nums[i]}.`, view(), {});
          continue;
        }
        if (nums[i] > remaining) {
          r.step('prune', `${nums[i]} > ${remaining}: too big, and everything after it is bigger. Break.`, view(), {});
          break;
        }
        path.push(nums[i]);
        const child = tree.add(id, show(path), `+${nums[i]}`);
        tree.badge(child, `${remaining - nums[i]} left`);
        r.step('choose', `Choose ${nums[i]}: ${remaining - nums[i]} still needed.`, view(), {});
        if (!askedOnce) {
          askedOnce = true;
          r.predict('once', 'The recursive call is dfs(?, remaining − number). Which start index makes each element usable only once?', ['i + 1', 'i', '0'], 0, 'i + 1 moves past this element; passing i would let it be chosen again.');
        }
        dfs(i + 1, remaining - nums[i], child);
        path.pop();
        tree.tone(id, 'active');
        r.step('undo', `Undo ${nums[i]}.`, view(), {});
      }
      if (tree.nodes[id].tone !== 'found') tree.tone(id, 'done');
    };
    dfs(0, target, tree.root);
    r.step('done', res.length ? `Found ${res.map(show).join(' ')}.` : 'No combination adds up to the target.', view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ candidates, target }) {
    const nums = [...candidates].sort((a, b) => a - b);
    const out: number[][] = [];
    const path: number[] = [];
    const go = (start: number, rem: number) => {
      if (rem === 0) return void out.push([...path]);
      for (let i = start; i < nums.length; i++) {
        if (i > start && nums[i] === nums[i - 1]) continue;
        if (nums[i] > rem) break;
        path.push(nums[i]);
        go(i + 1, rem - nums[i]);
        path.pop();
      }
    };
    go(0, target);
    return out;
  },
});

export default problem({
  summary: 'Given a list of positive numbers that may contain repeats and a target, return every distinct combination whose numbers add up to the target. Each element of the list can be used at most once, and the result must not contain duplicate combinations.',
  example: ['numbers [1, 2, 2, 3], target 5', '[[1, 2, 2], [2, 3]]', 'The two 2s are different elements, but [1, 2, 2] is listed once and [2, 3] is listed once, not twice.'],
  pattern: ['backtracking', ['backtracking', 'dfs', 'dp-1d', 'sorting'], 'Choose numbers one at a time with a shrinking remaining target, undo, and try the next. Sorting plus skipping equal neighbours at the same level removes duplicate combinations.', {
    dfs: 'It is a DFS with explicit undo, which is backtracking.',
    'dp-1d': 'DP does not list the combinations.',
    sorting: 'Sorting is a helper step; the main technique is backtracking.',
  }],
  hints: [
    'Compared with Combination Sum, what changes about the recursive call?',
    'Two equal numbers can produce identical combinations. If you sort, where are the equal numbers?',
    'Sort. In the loop skip nums[i] when i > start and nums[i] == nums[i−1]. Recurse with i + 1.',
  ],
  insight: 'At each level of the recursion, try each distinct value only once.',
  brute: 'Generate all subsets, filter by sum, and deduplicate with a set: O(2ⁿ · n).',
  optimal: 'Sorted backtracking with duplicate skipping and pruning: still exponential in the worst case but avoids repeated work.',
  walk: ['Sort the candidates.', 'dfs(start, remaining): when remaining is 0, record the path.', 'Loop i from start; skip duplicates (i > start and equal to the previous); break when nums[i] exceeds remaining.', 'Choose nums[i], recurse with i + 1, then undo.'],
  edge: ['All numbers equal.', 'No valid combination.', 'The target equals a duplicated number.', 'A duplicate that can be used twice in one combination (it must still be allowed).'],
  works: ['Using i > start (not i > 0) lets a repeated value appear again deeper in the same path, but never twice as the first choice at one level.', 'That is exactly the condition under which two branches would be identical.'],
  time: ['O(2ⁿ)', 'Worst case explores every subset of the sorted list.'],
  space: ['O(n)', 'Path and recursion depth.'],
  solution,
  cases,
  sig: 'def combination_sum_2(candidates, target):\n    # each element at most once; no duplicate combinations\n    pass\n',
  viz,
  fromArgs: ([candidates, target]) => ({ candidates, target }),
});
