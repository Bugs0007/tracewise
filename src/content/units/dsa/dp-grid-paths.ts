import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { dpGrid, tk, type Arrow, type DpCell } from '@/content/lib/dp';

const code = `
def unique_paths(grid):
    # grid[r][c] == 1 is an obstacle; you may only move right or down
    rows, cols = len(grid), len(grid[0])
    dp = [[0] * cols for _ in range(rows)]            #@init
    for r in range(rows):                             #@rows
        for c in range(cols):                         #@cols
            if grid[r][c] == 1:                       #@wall
                dp[r][c] = 0
            elif r == 0 and c == 0:                   #@start
                dp[r][c] = 1
            else:
                up = dp[r - 1][c] if r > 0 else 0         #@up
                left = dp[r][c - 1] if c > 0 else 0       #@left
                dp[r][c] = up + left                      #@sum
    return dp[rows - 1][cols - 1]                     #@done
`;

interface In {
  grid: number[][];
}

const viz: VizDef<In> = {
  id: 'dp-grid-paths',
  title: 'Unique paths with obstacles',
  code,
  language: 'python',
  inputs: [{ key: 'grid', label: 'Grid (0 = open, 1 = wall)', kind: 'grid', default: [[0, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1], [1, 0, 0, 0]], maxItems: 20, help: 'Up to 5 × 5 cells' }],
  presets: [
    { label: 'No obstacles', input: { grid: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] } },
    { label: 'Wall in the middle', input: { grid: [[0, 0, 0], [0, 1, 0], [0, 0, 0]] } },
    { label: 'Blocked start', input: { grid: [[1, 0], [0, 0]] } },
    { label: 'Single cell', input: { grid: [[0]] } },
    { label: 'Sealed off', input: { grid: [[0, 1, 0], [1, 0, 0], [0, 0, 0]] } },
  ],
  run({ grid }) {
    if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0]) || !grid[0].length) throw new Error('Grid needs at least one cell');
    const rows = grid.length;
    const cols = grid[0].length;
    if (rows > 5 || cols > 5) throw new Error('Use at most 5 rows and 5 columns');
    if (grid.some((row) => row.length !== cols || row.some((v) => v !== 0 && v !== 1))) throw new Error('Use a rectangular grid of 0 (open) and 1 (wall)');
    const r = new Recorder(code);
    const dp: (number | null)[][] = grid.map((row) => row.map(() => null));
    const rowLabels = grid.map((_, i) => String(i));
    const colLabels = grid[0].map((_, j) => String(j));
    const table = (cur?: [number, number], deps: [number, number][] = [], arrows: Arrow[] = []) => {
      const tones: Record<string, Tone> = {};
      grid.forEach((row, i) => row.forEach((v, j) => (tones[tk(i, j)] = v === 1 ? 'error' : dp[i][j] !== null ? 'default' : 'muted')));
      for (const d of deps) if (grid[d[0]][d[1]] === 0) tones[tk(d[0], d[1])] = 'compare';
      if (cur) tones[tk(cur[0], cur[1])] = grid[cur[0]][cur[1]] === 1 ? 'error' : 'active';
      const cells: DpCell[][] = dp.map((row, i) => row.map((v, j) => (grid[i][j] === 1 && v !== null ? '#' : v)));
      return dpGrid(cells, { title: 'dp[r][c] = number of paths from the top-left to (r, c)', tones, arrows, rowLabels, colLabels });
    };
    r.step('init', `Empty ${rows} × ${cols} table. Red cells are walls; you move only right or down`, [table()], { rows, cols });
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        r.op();
        if (grid[i][j] === 1) {
          dp[i][j] = 0;
          r.step('wall', `(${i},${j}) is a wall → 0 paths go through it`, [table([i, j])], { r: i, c: j });
        } else if (i === 0 && j === 0) {
          dp[i][j] = 1;
          r.step('start', 'Start cell: 1 way (you are already there)', [table([i, j])], { r: i, c: j });
        } else {
          const up = i > 0 ? dp[i - 1][j]! : 0;
          const left = j > 0 ? dp[i][j - 1]! : 0;
          dp[i][j] = up + left;
          const deps: [number, number][] = [];
          if (i > 0) deps.push([i - 1, j]);
          if (j > 0) deps.push([i, j - 1]);
          const upText = i > 0 ? String(up) : 'none → 0';
          const leftText = j > 0 ? String(left) : 'none → 0';
          r.step('sum', `paths(${i},${j}) = up ${upText} + left ${leftText} = ${dp[i][j]}`, [table([i, j], deps, deps.map((from) => ({ from, to: [i, j] as [number, number] })))], { r: i, c: j, up, left });
        }
      }
    }
    const result = dp[rows - 1][cols - 1]!;
    r.step('done', result ? `${result} unique path${result > 1 ? 's' : ''} reach the bottom-right corner` : 'No path reaches the bottom-right corner → 0', [table([rows - 1, cols - 1])], { result });
    return { frames: r.frames, result };
  },
  reference({ grid }) {
    // brute-force recursion over every route (grids are tiny)
    const rows = grid.length;
    const cols = grid[0].length;
    const go = (i: number, j: number): number => {
      if (i >= rows || j >= cols || grid[i][j] === 1) return 0;
      if (i === rows - 1 && j === cols - 1) return 1;
      return go(i + 1, j) + go(i, j + 1);
    };
    return go(0, 0);
  },
};

const tests = [
  { args: [[[0, 0, 0], [0, 1, 0], [0, 0, 0]]], expected: 2 },
  { args: [[[0, 1], [0, 0]]], expected: 1 },
  { args: [[[0, 0], [0, 0]]], expected: 2 },
  { args: [[[0, 0, 0], [0, 0, 0], [0, 0, 0]]], expected: 6, name: 'open 3x3' },
  { args: [[[1, 0]]], expected: 0, name: 'blocked start' },
  { args: [[[0, 1]]], expected: 0, name: 'blocked finish' },
  { args: [[[0]]], expected: 1, name: 'single cell' },
  { args: [[[0, 0], [1, 1]]], expected: 0, name: 'sealed' },
];

const unit: Unit = {
  id: 'dp-grid-paths',
  hook: 'Grid DP is the 2-D warm-up: each cell is the sum of two neighbours. Interviewers add obstacles or costs to see if you handle blocked cells and the first row / column cleanly.',
  predict: {
    prompt: 'On a 3 × 3 grid with a wall in the centre cell, moving only right or down from the top-left to the bottom-right, how many paths exist?',
    options: ['1', '2', '4', '6'],
    answer: 1,
    explain: 'An open 3 × 3 grid has 6 paths. The centre lies on 4 of them (2 ways in × 2 ways out), leaving 2: right-right-down-down and down-down-right-right.',
  },
  viz,
  deeper: {
    points: [
      'State: `dp[r][c]` = number of ways to reach cell (r, c) moving only right or down.',
      'Recurrence: `dp[r][c] = dp[r-1][c] + dp[r][c-1]` (arrive from above or from the left).',
      'Obstacle: `dp[r][c] = 0` for a wall, so nothing flows through it. Check this before anything else.',
      'Start cell: 1 if open, 0 if it is a wall. Top row and left column have only one neighbour; treat the missing one as 0.',
      'Order: row by row. Space: one row is enough because you only look at the row above and the cell to the left.',
    ],
    complexity: { time: 'O(rows × cols)', space: 'O(rows × cols), or O(cols) with one rolling row' },
    pitfalls: ['Setting dp[0][0] = 1 even when the start is a wall', 'Filling the first row/column with 1s and ignoring walls inside them', 'Index -1 wrapping around in Python when r or c is 0'],
  },
  practice: {
    language: 'python',
    fnName: 'unique_paths',
    statement: 'A robot starts at the top-left of `grid` and may move only right or down. Cells with 1 are walls. Return the number of distinct paths to the bottom-right cell.',
    signature: 'def unique_paths(grid):',
    solution: `def unique_paths(grid):
    rows, cols = len(grid), len(grid[0])
    dp = [[0] * cols for _ in range(rows)]
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 1:
                dp[r][c] = @@0@@
            elif r == 0 and c == 0:
                dp[r][c] = @@1@@
            else:
                up = dp[r - 1][c] if @@r > 0@@ else 0
                left = dp[r][c - 1] if c > 0 else 0
                dp[r][c] = @@up + left@@
    return @@dp[rows - 1][cols - 1]@@`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'unique_paths',
    statement: 'This handles walls in the middle but is wrong for some grids. Find the bug.',
    buggy: `def unique_paths(grid):
    rows, cols = len(grid), len(grid[0])
    dp = [[0] * cols for _ in range(rows)]
    dp[0][0] = 1
    for r in range(rows):
        for c in range(cols):
            if r == 0 and c == 0:
                continue
            if grid[r][c] == 1:
                dp[r][c] = 0
            else:
                up = dp[r - 1][c] if r > 0 else 0
                left = dp[r][c - 1] if c > 0 else 0
                dp[r][c] = up + left
    return dp[rows - 1][cols - 1]`,
    fixed: `def unique_paths(grid):
    rows, cols = len(grid), len(grid[0])
    dp = [[0] * cols for _ in range(rows)]
    dp[0][0] = 1 if grid[0][0] == 0 else 0
    for r in range(rows):
        for c in range(cols):
            if r == 0 and c == 0:
                continue
            if grid[r][c] == 1:
                dp[r][c] = 0
            else:
                up = dp[r - 1][c] if r > 0 else 0
                left = dp[r][c - 1] if c > 0 else 0
                dp[r][c] = up + left
    return dp[rows - 1][cols - 1]`,
    tests,
    bugType: 'unchecked start cell',
    hint: 'What does the code return for grid = [[1, 0]]? Who checks the start cell?',
    explanation: 'The loop skips (0, 0) with `continue`, so the wall check never runs there, and dp[0][0] was set to 1 unconditionally. A blocked start still seeds one path. Seed it with 1 only when the cell is open.',
  },
  boss: {
    title: 'Minimum Path Sum',
    statement: 'Every cell of `grid` holds a non-negative cost. Starting at the top-left and moving only right or down, return the smallest possible sum of costs along a path to the bottom-right cell (both ends included).',
    language: 'python',
    fnName: 'min_path_sum',
    starter: `def min_path_sum(grid):
    # your code here
    pass
`,
    solution: `def min_path_sum(grid):
    rows, cols = len(grid), len(grid[0])
    dp = [[0] * cols for _ in range(rows)]
    for r in range(rows):
        for c in range(cols):
            if r == 0 and c == 0:
                dp[r][c] = grid[r][c]
            elif r == 0:
                dp[r][c] = dp[r][c - 1] + grid[r][c]
            elif c == 0:
                dp[r][c] = dp[r - 1][c] + grid[r][c]
            else:
                dp[r][c] = min(dp[r - 1][c], dp[r][c - 1]) + grid[r][c]
    return dp[rows - 1][cols - 1]`,
    tests: [
      { args: [[[1, 3, 1], [1, 5, 1], [4, 2, 1]]], expected: 7 },
      { args: [[[1, 2, 3], [4, 5, 6]]], expected: 12 },
      { args: [[[5]]], expected: 5, name: 'single cell' },
      { args: [[[1, 2], [1, 1]]], expected: 3 },
      { args: [[[0, 0], [0, 0]]], expected: 0, name: 'all zero' },
      { args: [[[7, 1, 1, 1]]], expected: 10, name: 'single row' },
    ],
    hints: ['Same table as unique paths, but each cell stores a minimum cost instead of a count. The top row and left column have only one way in.', 'dp[r][c] = grid[r][c] + min(dp[r-1][c], dp[r][c-1]); on the edges use the only neighbour that exists.'],
    combines: ['dp-grid-paths', 'dp-coin-change'],
  },
  quiz: [
    {
      prompt: 'Why is dp[r][c] set to 0 for a wall instead of being skipped?',
      options: ['To save memory', 'So later cells that read it add 0 paths coming through the wall', 'Python requires every cell to be assigned', 'Walls are counted as one path'],
      answer: 1,
      explain: 'Cells below and to the right read the wall cell; a value of 0 means no path flows through it.',
    },
  ],
};

export default unit;
