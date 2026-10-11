import type { Tone } from '@/engine/types';
import { gridView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './longest-increasing-path-in-a-matrix.py?raw';
import cases from './longest-increasing-path-in-a-matrix.cases.json';

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const viz = vizOf<{ matrix: number[][] }>({
  id: 'longest-increasing-path-in-a-matrix',
  title: 'Longest Increasing Path in a Matrix',
  solution,
  inputs: [{ key: 'matrix', label: 'matrix of numbers (rows on separate lines)', kind: 'grid', default: [[1, 2, 9], [6, 5, 8], [7, 4, 3]], maxItems: 16 }],
  presets: [
    { label: 'Spiral', input: { matrix: [[1, 2, 9], [6, 5, 8], [7, 4, 3]] } },
    { label: 'Snake', input: { matrix: [[1, 2, 3], [6, 5, 4], [7, 8, 9]] } },
    { label: 'All equal', input: { matrix: [[2, 2], [2, 2]] } },
    { label: 'One row', input: { matrix: [[1, 3, 2, 4]] } },
  ],
  validate: ({ matrix }) => (matrix.some((row) => row.some((v) => typeof v !== 'number')) ? 'Cells must be numbers' : null),
  run({ matrix }) {
    const r = new TraceRecorder(solution);
    const rows = matrix.length;
    const cols = matrix[0].length;
    const memo = new Map<string, number>();
    const tones: Record<string, Tone> = {};
    let current = 'none';
    let askedCached = false;
    let askedBest = false;
    let askedStore = false;
    const memoGrid = () => matrix.map((row, a) => row.map((_, b) => (memo.has(`${a},${b}`) ? (memo.get(`${a},${b}`) as number) : '·')));
    const view = () => [gridView(matrix, { title: 'matrix', tones, compact: false }), gridView(memoGrid(), { title: 'memo: longest path starting at each cell (· = not computed)', compact: false }), hashMapView({ 'current cell': current })];
    r.step('memo', 'memo remembers, for each cell, the length of the longest increasing path that STARTS there. Each cell is computed at most once.', view(), {});
    const dfs = (a: number, b: number): number => {
      const key = `${a},${b}`;
      r.op();
      current = `(${a}, ${b}) = ${matrix[a][b]}`;
      if (memo.has(key)) {
        tones[key] = 'compare';
        if (!askedCached) {
          askedCached = true;
          r.step('cached', `(${a}, ${b}) was already solved: its answer is ${memo.get(key)}.`, view(), {});
          r.predict('cached', `(${a}, ${b}) is reached again. What does dfs do?`, ['Return the stored answer at once', 'Recompute it', 'Skip the cell'], 0, 'That is the whole point of the memo: the work for this cell is never repeated.');
        } else {
          r.step('cachedRet', `(${a}, ${b}): use the stored ${memo.get(key)}.`, view(), {});
        }
        tones[key] = 'done';
        return memo.get(key) as number;
      }
      tones[key] = 'active';
      r.step('def', `dfs(${a}, ${b}): value ${matrix[a][b]}. Try every neighbour that is strictly larger.`, view(), {});
      let best = 1;
      for (const [x, y] of DIRS) {
        const na = a + x;
        const nb = b + y;
        if (na >= 0 && na < rows && nb >= 0 && nb < cols && matrix[na][nb] > matrix[a][b]) {
          const sub = dfs(na, nb);
          best = Math.max(best, 1 + sub);
          tones[key] = 'active';
          current = `(${a}, ${b}) = ${matrix[a][b]}`;
          if (!askedBest) {
            askedBest = true;
            r.step('recurse', `Via (${na}, ${nb}) (${matrix[na][nb]} > ${matrix[a][b]}) the path from here has length 1 + ${sub} = ${1 + sub}. best = ${best}.`, view(), {});
            r.predictChoice('best', `A neighbour's longest path is ${sub}. What is the longest path through it, starting at (${a}, ${b})?`, String(1 + sub), [String(sub), String(sub + 2), '1'], a + b, 'Count this cell plus the neighbour’s path.');
          } else {
            r.step('recurse', `Via (${na}, ${nb}): 1 + ${sub} = ${1 + sub}. best = ${best}.`, view(), {});
          }
        }
      }
      memo.set(key, best);
      tones[key] = 'done';
      if (!askedStore) {
        askedStore = true;
        r.step('store', `Store ${best} for (${a}, ${b}).`, view(), {});
      } else {
        r.step('store', `memo[(${a}, ${b})] = ${best}.`, view(), {});
      }
      return best;
    };
    let res = 0;
    for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) res = Math.max(res, dfs(a, b));
    current = 'none';
    r.step('done', `The longest increasing path has ${res} cell${res === 1 ? '' : 's'}.`, view(), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ matrix }) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const go = (a: number, b: number): number => {
      let best = 1;
      for (const [x, y] of DIRS) {
        const na = a + x;
        const nb = b + y;
        if (na >= 0 && na < rows && nb >= 0 && nb < cols && matrix[na][nb] > matrix[a][b]) best = Math.max(best, 1 + go(na, nb));
      }
      return best;
    };
    let res = 0;
    for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) res = Math.max(res, go(a, b));
    return res;
  },
});

export default problem({
  summary: 'In a grid of numbers you may move up, down, left or right, but only to a cell with a strictly larger value than the current one. Find the length (number of cells) of the longest such path, starting anywhere.',
  example: ['[[1, 2], [4, 3]]', '4', '1 → 2 → 3 → 4 follows the grid around the loop, always increasing.'],
  pattern: ['dfs', ['dfs', 'dp-2d', 'topo-sort', 'bfs'], 'The longest path from a cell is 1 plus the longest path from its best larger neighbour. Because moves only go up in value, there are no cycles, so each cell’s answer can be computed once and stored (DFS with a memo, i.e. DP over cells).', {
    'dp-2d': 'The memo is a 2-D table of answers; the order of filling comes from the DFS.',
    'topo-sort': 'Processing cells in order of value is an alternative with a topological sort.',
    bfs: 'BFS does not give longest paths.',
  }],
  hints: [
    'If you start at a cell, which neighbours can you move to?',
    'The same cell can be reached from many starting points. How can you avoid recomputing its best path?',
    'dfs(r, c) = 1 + max(dfs(neighbour)) over larger neighbours, memoised by (r, c). The answer is the max of dfs over all cells.',
  ],
  insight: 'Strictly increasing moves make the graph acyclic, so memoised DFS computes each cell once.',
  brute: 'DFS from every cell without memory: exponential.',
  optimal: 'Memoised DFS: O(R · C) time and space.',
  walk: ['memo = {}.', 'dfs(r, c): return memo[(r, c)] if present.', 'Otherwise best = 1; for each in-bounds neighbour with a larger value: best = max(best, 1 + dfs(neighbour)).', 'Store best in memo and return it. Answer = max over all cells.'],
  edge: ['All equal values (answer 1).', 'A single row or column.', 'A long spiral (deep recursion).'],
  works: ['dfs(r, c) is exactly the longest increasing path starting at (r, c); strictly increasing moves cannot loop, so the recursion terminates and each value is final once stored.'],
  time: ['O(R · C)', 'Each cell is computed once, with 4 neighbour checks.'],
  space: ['O(R · C)', 'Memo plus recursion depth.'],
  solution,
  cases,
  sig: 'def longest_increasing_path(matrix):\n    # matrix is a list of rows of numbers; return the number of cells in the longest strictly increasing path\n    pass\n',
  viz,
  fromArgs: ([matrix]) => ({ matrix }),
});
