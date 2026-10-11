import type { Tone } from '@/engine/types';
import { gridView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './max-area-of-island.py?raw';
import cases from './max-area-of-island.cases.json';

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const viz = vizOf<{ grid: number[][] }>({
  id: 'max-area-of-island',
  title: 'Max Area of Island',
  solution,
  inputs: [{ key: 'grid', label: 'grid (1 = land, 0 = water)', kind: 'grid', default: [[1, 1, 0, 0], [1, 0, 0, 1], [0, 0, 1, 1], [1, 0, 1, 1]], maxItems: 30 }],
  presets: [
    { label: 'Two sizes', input: { grid: [[1, 1, 0, 0], [1, 0, 0, 1], [0, 0, 1, 1], [1, 0, 1, 1]] } },
    { label: 'Snake', input: { grid: [[1, 1, 1], [0, 0, 1], [1, 1, 1]] } },
    { label: 'No land', input: { grid: [[0, 0]] } },
    { label: 'Whole grid', input: { grid: [[1, 1], [1, 1]] } },
  ],
  validate: ({ grid }) => (grid.some((row) => row.some((v) => v !== 0 && v !== 1)) ? 'Every cell must be 0 or 1' : null),
  run({ grid }) {
    const r = new TraceRecorder(solution);
    const rows = grid.length;
    const cols = grid[0].length;
    const seen = new Set<string>();
    const tones: Record<string, Tone> = {};
    let best = 0;
    let current = 0;
    let askedRet = false;
    let askedUpdate = false;
    const view = () => [gridView(grid, { title: 'grid', tones, compact: false }), hashMapView({ 'area of the island being measured': current, 'best area so far': best })];
    r.step('init', 'dfs(r, c) will return the area of the island containing (r, c) that is not yet counted: 0 for water or visited cells.', view(), {});
    const dfs = (a: number, b: number): number => {
      if (a < 0 || b < 0 || a >= rows || b >= cols || grid[a][b] === 0 || seen.has(`${a},${b}`)) return 0;
      r.op();
      seen.add(`${a},${b}`);
      tones[`${a},${b}`] = 'active';
      current++;
      r.step('mark', `Visit (${a}, ${b}): it counts as 1 cell of area.`, view(), { cell: `${a},${b}` });
      tones[`${a},${b}`] = 'visited';
      let area = 1;
      for (const [x, y] of DIRS) area += dfs(a + x, b + y);
      if (!askedRet) {
        askedRet = true;
        r.predictChoice('ret', `dfs(${a}, ${b}) has finished all four directions. What does it return?`, String(area), [String(area + 1), '1', String(Math.max(1, area - 1))], a + b, 'One for this cell plus the areas the four recursive calls returned.');
      }
      r.step('ret', `dfs(${a}, ${b}) returns 1 + the areas of its neighbours = ${area}.`, view(), { area });
      return area;
    };
    for (let a = 0; a < rows; a++) {
      for (let b = 0; b < cols; b++) {
        if (grid[a][b] === 1 && !seen.has(`${a},${b}`)) {
          current = 0;
          const area = dfs(a, b);
          if (!askedUpdate) {
            askedUpdate = true;
            r.predictChoice('update', `A whole island of area ${area} was measured and the best so far is ${best}. What is best afterwards?`, String(Math.max(best, area)), [String(best + area), String(Math.min(best, area)), String(area + 1)], area, 'best keeps the larger of its old value and the new island’s area.');
          }
          best = Math.max(best, area);
          r.step('update', `best = max(best, ${area}) = ${best}.`, view(), { best });
        }
      }
    }
    current = 0;
    r.step('done', `The largest island has area ${best}.`, view(), { result: best });
    return { frames: r.frames, result: best };
  },
  reference({ grid }) {
    const rows = grid.length;
    const cols = grid[0].length;
    const seen = new Set<string>();
    const go = (a: number, b: number): number => {
      if (a < 0 || b < 0 || a >= rows || b >= cols || !grid[a][b] || seen.has(`${a},${b}`)) return 0;
      seen.add(`${a},${b}`);
      return 1 + DIRS.reduce((s, [x, y]) => s + go(a + x, b + y), 0);
    };
    let best = 0;
    for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) best = Math.max(best, go(a, b));
    return best;
  },
});

export default problem({
  summary: 'In a grid of 1s (land) and 0s (water), an island is a group of land cells connected through their four sides. The area of an island is its number of cells. Return the largest area (0 if there is no land).',
  example: ['[[1, 1, 0], [0, 1, 0], [0, 0, 1]]', '3', 'The three connected cells at the top-left form the biggest island; the bottom-right cell is alone.'],
  pattern: ['dfs', ['dfs', 'bfs', 'union-find', 'matrix'], 'A flood fill from each unvisited land cell can return the size of what it fills: 1 for the cell plus the sizes returned by its neighbours.', {
    bfs: 'BFS can count cells with a queue, but the recursion returns the area directly.',
    'union-find': 'Union-find with component sizes works, but needs more machinery.',
    matrix: 'The grid is the setting; the technique is a flood fill.',
  }],
  hints: [
    'Counting islands used a flood fill. What if the fill reported how many cells it touched?',
    'What should the call return for water or an already visited cell?',
    'dfs returns 0 for such cells; otherwise it marks the cell and returns 1 + the sum of dfs on the four neighbours. Keep the maximum over all starting cells.',
  ],
  insight: 'The flood fill returns the area it covers, so the answer is the maximum over all fills.',
  brute: 'For each land cell, BFS to measure its island with a fresh seen set: O((R·C)²).',
  optimal: 'One shared seen set: O(R · C) time and space.',
  walk: ['Keep seen and best = 0.', 'dfs(r, c): return 0 for water, out-of-bounds or seen cells.', 'Otherwise mark seen, set area = 1, add dfs of the four neighbours, and return area.', 'For every cell, best = max(best, dfs(r, c)).'],
  edge: ['No land: 0.', 'One island that fills the whole grid.', 'Several islands of equal size.', 'A single land cell.'],
  works: ['Each cell is counted by exactly one fill, so the returned areas are exact.', 'Starting fills from every cell guarantees every island is measured once.'],
  time: ['O(R · C)', 'Each cell is visited at most once.'],
  space: ['O(R · C)', 'The seen set and recursion.'],
  solution,
  cases,
  sig: 'def max_area_of_island(grid):\n    # grid is a list of rows of 0 / 1; return the largest island area\n    pass\n',
  viz,
  fromArgs: ([grid]) => ({ grid }),
});
