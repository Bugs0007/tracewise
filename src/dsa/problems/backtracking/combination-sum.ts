import { chipsView } from '@/dsa/viz/prims';
import { CallTree } from '@/dsa/viz/calltree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './combination-sum.py?raw';
import cases from './combination-sum.cases.json';

const show = (p: readonly (number | string)[]) => `[${p.join(', ')}]`;

const viz = vizOf<{ candidates: number[]; target: number }>({
  id: 'combination-sum',
  title: 'Combination Sum',
  solution,
  inputs: [
    { key: 'candidates', label: 'distinct positive numbers', kind: 'numbers', default: [2, 3, 6], maxItems: 4 },
    { key: 'target', label: 'target', kind: 'number', default: 7 },
  ],
  presets: [
    { label: 'Classic', input: { candidates: [2, 3, 6], target: 7 } },
    { label: 'Several ways', input: { candidates: [2, 3, 5], target: 6 } },
    { label: 'No way', input: { candidates: [3, 5], target: 2 } },
    { label: 'Reuse one number', input: { candidates: [4], target: 8 } },
  ],
  validate: ({ candidates, target }) => {
    if (candidates.some((v) => v === null || !Number.isInteger(v) || v < 1)) return 'Candidates must be whole numbers of at least 1';
    if (new Set(candidates).size !== candidates.length) return 'Candidates must be distinct';
    return Number.isInteger(target) && target >= 1 && target <= 12 ? null : 'Target must be a whole number from 1 to 12';
  },
  run({ candidates, target }) {
    const r = new TraceRecorder(solution);
    const nums = [...candidates].sort((a, b) => a - b);
    const tree = new CallTree('[]');
    tree.badge(tree.root, `${target} left`);
    const path: number[] = [];
    const res: number[][] = [];
    const view = () => [tree.panel(`each branch adds one number; the badge shows what is still needed`), chipsView(path, { title: 'path (numbers chosen so far)' }), chipsView(res.map(show), { title: 'combinations found' })];
    r.step('sort', `Sort the candidates: ${show(nums)}. Sorted order lets us stop the loop as soon as a number is too big.`, view(), {});
    r.step('init', `We need combinations that sum to ${target}. The same number may be reused.`, view(), {});
    let askedReuse = false;
    let askedPrune = false;
    let askedHit = false;
    const dfs = (start: number, remaining: number, id: string) => {
      r.op();
      tree.tone(id, 'active');
      r.step('def', `dfs(start=${start}, remaining=${remaining}). Path: ${show(path)}.`, view(), { start, remaining });
      if (remaining === 0) {
        r.step('hit', `remaining is 0: the path ${show(path)} adds up to ${target}.`, view(), {});
        if (!askedHit) {
          askedHit = true;
          r.predict('hit', 'remaining reached exactly 0. What do we do?', ['Record a copy of the path and return', 'Keep adding numbers', 'Discard the path'], 0, 'The path is a valid combination. Adding more numbers could only overshoot the target.');
        }
        res.push([...path]);
        tree.tone(id, 'found');
        r.step('record', `Record ${show(path)}.`, view(), {});
        return;
      }
      for (let i = start; i < nums.length; i++) {
        if (nums[i] > remaining) {
          r.step('prune', `${nums[i]} > ${remaining}: too big. Because the list is sorted, every later number is too big as well, so break.`, view(), { n: nums[i] });
          if (!askedPrune) {
            askedPrune = true;
            r.predict('prune', `${nums[i]} is larger than the ${remaining} still needed. What happens?`, ['Stop the loop: later numbers are even bigger', 'Skip only this number and keep trying', 'Subtract it anyway'], 0, 'Sorted ascending, so nothing after this number can fit either.');
          }
          break;
        }
        path.push(nums[i]);
        const child = tree.add(id, show(path), `+${nums[i]}`);
        tree.badge(child, `${remaining - nums[i]} left`);
        r.step('choose', `Choose ${nums[i]}: ${remaining} − ${nums[i]} = ${remaining - nums[i]} still needed.`, view(), { n: nums[i] });
        if (!askedReuse) {
          askedReuse = true;
          r.predict('reuse', 'The recursive call goes dfs(?, remaining − number). Which start index is passed so the same number can be used again?', ['i (the same position)', 'i + 1 (the next position)', '0 (start over)'], 0, 'Passing i keeps nums[i] available again; i + 1 would forbid reuse.');
        }
        dfs(i, remaining - nums[i], child);
        path.pop();
        tree.tone(id, 'active');
        r.step('undo', `Undo: remove ${nums[i]} from the path and try the next candidate.`, view(), {});
      }
      tree.tone(id, tree.nodes[id].tone === 'found' ? 'found' : 'done');
    };
    dfs(0, target, tree.root);
    r.step('done', res.length ? `Found ${res.length} combination${res.length > 1 ? 's' : ''}: ${res.map(show).join(' ')}.` : 'No combination adds up to the target: the result is empty.', view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ candidates, target }) {
    const nums = [...candidates].sort((a, b) => a - b);
    const out: number[][] = [];
    const path: number[] = [];
    const go = (start: number, rem: number) => {
      if (rem === 0) return void out.push([...path]);
      for (let i = start; i < nums.length && nums[i] <= rem; i++) {
        path.push(nums[i]);
        go(i, rem - nums[i]);
        path.pop();
      }
    };
    go(0, target);
    return out;
  },
});

export default problem({
  summary: 'Given a list of distinct positive numbers and a target, return every distinct combination of those numbers that adds up to the target. A number may be used any number of times. Combinations that differ only in order count as the same.',
  example: ['numbers [2, 3, 5], target 5', '[[2, 3], [5]]', '2 + 3 and 5 both reach 5. (2 + 2 + 1 is not possible: 1 is not in the list.)'],
  pattern: ['backtracking', ['backtracking', 'dp-1d', 'dfs', 'greedy'], 'We must list all combinations, not just count them, so we build candidates one number at a time and undo choices. Passing the start index prevents the same combination appearing in different orders.', {
    'dp-1d': 'DP counts ways to reach a sum but would not list the combinations themselves.',
    dfs: 'The search is depth-first; backtracking adds the choose / explore / undo discipline.',
    greedy: 'Taking the biggest number first fails to find all solutions.',
  }],
  hints: [
    'How do you avoid listing [2, 3] and [3, 2] as different answers?',
    'If you always choose numbers in non-decreasing order of position, each combination appears once. What do you pass to the recursive call to enforce that?',
    'dfs(start, remaining): if remaining == 0 record the path. Loop i from start; stop when nums[i] > remaining (sorted); choose nums[i], call dfs(i, remaining − nums[i]) so it can repeat, then undo.',
  ],
  insight: 'Pass the current index (not index + 1) to allow reuse, and never go backwards to avoid permutations of the same combination.',
  brute: 'Try every multiset of numbers with total up to the target and filter by sum: exponential and wasteful.',
  optimal: 'Backtracking with sorting and pruning: roughly O(N^(T/M)) in the worst case (T = target, M = smallest number).',
  walk: ['Sort the candidates so pruning with break is safe.', 'dfs(start, remaining): if remaining is 0, record the path.', 'For i from start: if nums[i] > remaining, break.', 'Append nums[i], call dfs(i, remaining − nums[i]), then pop.'],
  edge: ['No combination exists.', 'The target equals a single candidate.', 'A candidate that divides the target many times (long paths).', 'Candidates given unsorted.'],
  works: ['Each combination is generated exactly once, in non-decreasing order of candidate index.', 'Pruning only removes branches where the sum would overshoot, which cannot lead to a solution.'],
  time: ['O(N^(T/M))', 'Exponential: depth at most T / M with up to N choices per level.'],
  space: ['O(T / M)', 'Recursion depth and the path.'],
  solution,
  cases,
  sig: 'def combination_sum(candidates, target):\n    # return all distinct combinations that sum to target (numbers may repeat)\n    pass\n',
  viz,
  fromArgs: ([candidates, target]) => ({ candidates, target }),
});
