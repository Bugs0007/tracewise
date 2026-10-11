import type { Tone } from '@/engine/types';
import { dpTable2D } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './unique-paths.py?raw';
import cases from './unique-paths.cases.json';

const viz = vizOf<{ m: number; n: number }>({
  id: 'unique-paths',
  title: 'Unique Paths',
  solution,
  inputs: [
    { key: 'm', label: 'rows', kind: 'number', default: 3 },
    { key: 'n', label: 'columns', kind: 'number', default: 4 },
  ],
  presets: [
    { label: '3 × 4', input: { m: 3, n: 4 } },
    { label: 'One row', input: { m: 1, n: 5 } },
    { label: '5 × 5', input: { m: 5, n: 5 } },
    { label: 'Single cell', input: { m: 1, n: 1 } },
  ],
  validate: ({ m, n }) => (Number.isInteger(m) && Number.isInteger(n) && m >= 1 && n >= 1 && m <= 7 && n <= 7 ? null : 'Use whole numbers from 1 to 7'),
  run({ m, n }) {
    const r = new TraceRecorder(solution);
    const dp = Array.from({ length: m }, () => Array(n).fill(1) as number[]);
    const done = new Set<string>();
    for (let c = 0; c < n; c++) done.add(`0,${c}`);
    for (let a = 0; a < m; a++) done.add(`${a},0`);
    const tones = () => Object.fromEntries([...done].map((k) => [k, 'done' as Tone]));
    r.step('init', `dp[r][c] = number of ways to reach cell (r, c) moving only right or down. Every cell in the first row and first column can be reached in exactly 1 way (straight along the edge).`, [dpTable2D(dp, { title: 'dp', tones: tones() })], {});
    r.predict('init', 'Why is every cell of the first row and first column equal to 1?', ['There is only one way to get there: keep going straight', 'They are blocked', 'It is arbitrary'], 0, 'To reach the first row you can only move right; to reach the first column you can only move down.');
    let askedFill = false;
    for (let a = 1; a < m; a++) {
      for (let c = 1; c < n; c++) {
        r.op();
        r.step('rows', `Cell (${a}, ${c}): you arrive from above (${a - 1}, ${c}) or from the left (${a}, ${c - 1}).`, [dpTable2D(dp, { title: 'dp', filling: [a, c], deps: [[a - 1, c], [a, c - 1]], tones: tones() })], {});
        if (!askedFill) {
          askedFill = true;
          r.predictChoice('fill', `Above it is ${dp[a - 1][c]} and left of it is ${dp[a][c - 1]}. What goes in (${a}, ${c})?`, String(dp[a - 1][c] + dp[a][c - 1]), [String(dp[a - 1][c]), String(dp[a - 1][c] * dp[a][c - 1]), String(dp[a - 1][c] + dp[a][c - 1] + 1)], a + c, 'Every path arrives from exactly one of the two neighbours, so add their counts.');
        }
        dp[a][c] = dp[a - 1][c] + dp[a][c - 1];
        done.add(`${a},${c}`);
        r.step('fill', `dp[${a}][${c}] = ${dp[a - 1][c]} + ${dp[a][c - 1]} = ${dp[a][c]}.`, [dpTable2D(dp, { title: 'dp', tones: tones() })], { value: dp[a][c] });
      }
    }
    r.step('done', `${dp[m - 1][n - 1]} different paths from the top-left to the bottom-right.`, [dpTable2D(dp, { title: 'dp', tones: { ...tones(), [`${m - 1},${n - 1}`]: 'found' } })], { result: dp[m - 1][n - 1] });
    return { frames: r.frames, result: dp[m - 1][n - 1] };
  },
  reference({ m, n }) {
    const dp = Array.from({ length: m }, () => Array(n).fill(1) as number[]);
    for (let a = 1; a < m; a++) for (let c = 1; c < n; c++) dp[a][c] = dp[a - 1][c] + dp[a][c - 1];
    return dp[m - 1][n - 1];
  },
});

export default problem({
  summary: 'A robot stands in the top-left corner of a grid with m rows and n columns. It can only move one step right or one step down. How many different paths lead to the bottom-right corner?',
  example: ['2 rows, 3 columns', '3', 'Right-right-down, right-down-right and down-right-right.'],
  pattern: ['dp-2d', ['dp-2d', 'dfs', 'math', 'bfs'], 'Each cell can only be entered from above or from the left, so its path count is the sum of those two cells. The table indexed by (row, column) holds the answers.', {
    dfs: 'Plain recursion recomputes the same cells exponentially often.',
    math: 'A binomial coefficient gives the count directly, but the DP is the technique being taught.',
    bfs: 'Counting paths is not a shortest-path question.',
  }],
  hints: [
    'How can the robot arrive at a cell that is not on the top row or left column?',
    'If you knew the number of ways to reach the cell above and the cell to the left, what is the count for this cell?',
    'Fill the first row and column with 1. Then dp[r][c] = dp[r − 1][c] + dp[r][c − 1].',
  ],
  insight: 'Paths into a cell = paths into the cell above + paths into the cell to its left.',
  brute: 'Recursive path enumeration: exponential.',
  optimal: 'DP table: O(m · n) time and space (O(n) with one row).',
  walk: ['dp = m × n table of 1s.', 'For every cell with r ≥ 1 and c ≥ 1: dp[r][c] = dp[r − 1][c] + dp[r][c − 1].', 'Return dp[m − 1][n − 1].'],
  edge: ['One row or one column (only 1 path).', 'A single cell.', 'Large grids give very large counts.'],
  works: ['Paths to (r, c) split into those whose last step was down and those whose last step was right, and the two groups are disjoint.', 'Cells are filled so both neighbours are ready.'],
  time: ['O(m · n)', 'One visit per cell.'],
  space: ['O(m · n)', 'The table (O(n) with a rolling row).'],
  solution,
  cases,
  sig: 'def unique_paths(m, n):\n    # number of right / down paths from the top-left to the bottom-right of an m × n grid\n    pass\n',
  viz,
  fromArgs: ([m, n]) => ({ m, n }),
});
