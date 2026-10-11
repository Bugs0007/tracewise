import type { Tone } from '@/engine/types';
import { gridView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './number-of-islands.py?raw';
import cases from './number-of-islands.cases.json';

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const viz = vizOf<{ grid: number[][] }>({
  id: 'number-of-islands',
  title: 'Number of Islands',
  solution,
  inputs: [{ key: 'grid', label: 'grid (1 = land, 0 = water; one row per line)', kind: 'grid', default: [[1, 1, 0, 0], [1, 0, 0, 1], [0, 0, 1, 1], [1, 0, 0, 0]], maxItems: 30 }],
  presets: [
    { label: 'Three islands', input: { grid: [[1, 1, 0, 0], [1, 0, 0, 1], [0, 0, 1, 1], [1, 0, 0, 0]] } },
    { label: 'Diagonal is not connected', input: { grid: [[1, 0], [0, 1]] } },
    { label: 'Ring around water', input: { grid: [[1, 1, 1], [1, 0, 1], [1, 1, 1]] } },
    { label: 'No land', input: { grid: [[0, 0, 0], [0, 0, 0]] } },
  ],
  validate: ({ grid }) => (grid.some((row) => row.some((v) => v !== 0 && v !== 1)) ? 'Every cell must be 0 or 1' : null),
  run({ grid }) {
    const r = new TraceRecorder(solution);
    const rows = grid.length;
    const cols = grid[0].length;
    const seen = new Set<string>();
    const tones: Record<string, Tone> = {};
    let count = 0;
    let askedNew = false;
    let askedSeen = false;
    const view = () => [gridView(grid, { title: 'grid (blue-green = visited land)', tones, compact: false }), hashMapView({ islands: count })];
    const total = (() => {
      const s = new Set<string>();
      let n = 0;
      const go = (a: number, b: number) => {
        if (a < 0 || b < 0 || a >= rows || b >= cols || !grid[a][b] || s.has(`${a},${b}`)) return;
        s.add(`${a},${b}`);
        DIRS.forEach(([x, y]) => go(a + x, b + y));
      };
      for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) if (grid[a][b] && !s.has(`${a},${b}`)) { go(a, b); n++; }
      return n;
    })();
    r.step('init', 'seen remembers which land cells we have already assigned to an island. count is the number of islands.', view(), {});
    r.predictChoice('total', 'How many islands does this grid have? (Land cells only join across the four sides, not diagonally.)', String(total), [String(total + 1), String(Math.max(0, total - 1)), String(grid.flat().filter(Boolean).length)], total, 'Each group of land cells connected by up / down / left / right is one island.');
    const dfs = (a: number, b: number) => {
      if (a < 0 || b < 0 || a >= rows || b >= cols || grid[a][b] === 0 || seen.has(`${a},${b}`)) return;
      r.op();
      seen.add(`${a},${b}`);
      tones[`${a},${b}`] = 'active';
      r.step('mark', `Visit land cell (${a}, ${b}) and add it to seen.`, view(), { cell: `${a},${b}` });
      tones[`${a},${b}`] = 'visited';
      for (const [x, y] of DIRS) dfs(a + x, b + y);
    };
    for (let a = 0; a < rows; a++) {
      for (let b = 0; b < cols; b++) {
        if (grid[a][b] === 1 && !seen.has(`${a},${b}`)) {
          r.step('new', `(${a}, ${b}) is land that is not in seen: a new island starts here.`, view(), { cell: `${a},${b}` });
          if (!askedNew) {
            askedNew = true;
            r.predict('new', `(${a}, ${b}) is unvisited land. What do we do?`, ['Flood-fill from it, then count one more island', 'Count it without exploring', 'Skip it'], 0, 'The flood fill marks every cell of the island, so none of them can start a second count.');
          }
          dfs(a, b);
          count++;
          r.step('inc', `The flood fill is done: island number ${count}.`, view(), { count });
        } else if (grid[a][b] === 1 && !askedSeen) {
          askedSeen = true;
          tones[`${a},${b}`] = 'compare';
          r.step('new', `(${a}, ${b}) is land, but it is already in seen: it belongs to an island we counted.`, view(), {});
          r.predict('seen', `(${a}, ${b}) is land that was already visited. Do we count another island?`, ['No', 'Yes'], 0, 'It was reached by an earlier flood fill, so it is part of an island we already counted.');
          tones[`${a},${b}`] = 'visited';
        }
      }
    }
    r.step('done', `Every cell has been checked: ${count} island${count === 1 ? '' : 's'}.`, view(), { result: count });
    return { frames: r.frames, result: count };
  },
  reference({ grid }) {
    const rows = grid.length;
    const cols = grid[0].length;
    const seen = new Set<string>();
    const go = (a: number, b: number) => {
      if (a < 0 || b < 0 || a >= rows || b >= cols || !grid[a][b] || seen.has(`${a},${b}`)) return;
      seen.add(`${a},${b}`);
      DIRS.forEach(([x, y]) => go(a + x, b + y));
    };
    let n = 0;
    for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) if (grid[a][b] && !seen.has(`${a},${b}`)) { go(a, b); n++; }
    return n;
  },
});

export default problem({
  summary: 'A grid of 1s (land) and 0s (water) is given. An island is a group of land cells connected through their four sides (up, down, left, right); diagonal neighbours are not connected. Count the islands.',
  example: ['[[1, 1, 0], [0, 0, 0], [0, 1, 1]]', '2', 'The two cells at the top form one island and the two at the bottom right form another.'],
  pattern: ['dfs', ['dfs', 'bfs', 'union-find', 'matrix'], 'Scan the grid; each time you meet land you have not visited, you have found a new island, so flood-fill it (DFS or BFS) to mark all of its cells and count once.', {
    bfs: 'BFS flood fill works equally well; the choice between DFS and BFS does not matter for counting.',
    'union-find': 'Union-find can count components too, but a flood fill is simpler here.',
    matrix: 'The grid is the setting; the technique is a flood fill.',
  }],
  hints: [
    'What should you do when you find a land cell? What stops you from counting the same island many times?',
    'Once you start on an island, can you visit every cell of it from that one cell?',
    'Loop over all cells. If a cell is land and not seen: dfs from it (mark neighbours that are land and unseen) and add 1 to the count.',
  ],
  insight: 'One flood fill per island: each unvisited land cell found by the scan starts exactly one new island.',
  brute: 'Union all neighbouring land cells in a union-find and count the roots: also O(cells).',
  optimal: 'Flood fill: O(rows × cols) time, O(rows × cols) space for the seen set and recursion.',
  walk: ['Keep a set seen and a counter.', 'Scan every cell. If it is land and not in seen, run dfs from it and add 1.', 'dfs returns at once for out-of-bounds, water, or seen cells.', 'Otherwise it adds the cell to seen and visits its four neighbours.'],
  edge: ['Empty or all-water grid.', 'Diagonal land cells (separate islands).', 'A single cell.', 'A very long snake (deep recursion).'],
  works: ['The flood fill visits exactly the cells connected to its start, so each island is processed once.', 'The seen set prevents a second count for any cell of a finished island.'],
  time: ['O(R · C)', 'Each cell is visited a constant number of times.'],
  space: ['O(R · C)', 'The seen set and recursion stack in the worst case.'],
  solution,
  cases,
  sig: 'def num_islands(grid):\n    # grid is a list of rows of 0 / 1; return the number of islands\n    pass\n',
  viz,
  fromArgs: ([grid]) => ({ grid }),
});
