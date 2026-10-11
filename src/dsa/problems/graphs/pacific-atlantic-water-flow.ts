import type { Tone } from '@/engine/types';
import { gridView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './pacific-atlantic-water-flow.py?raw';
import cases from './pacific-atlantic-water-flow.cases.json';

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const viz = vizOf<{ heights: number[][] }>({
  id: 'pacific-atlantic-water-flow',
  title: 'Pacific Atlantic Water Flow',
  solution,
  inputs: [{ key: 'heights', label: 'heights (top and left edges touch the Pacific, bottom and right edges the Atlantic)', kind: 'grid', default: [[3, 3, 2, 1], [3, 1, 4, 4], [2, 5, 5, 1], [1, 2, 3, 3]], maxItems: 25 }],
  presets: [
    { label: 'Hills', input: { heights: [[3, 3, 2, 1], [3, 1, 4, 4], [2, 5, 5, 1], [1, 2, 3, 3]] } },
    { label: 'Bowl', input: { heights: [[5, 5, 5], [5, 1, 5], [5, 5, 5]] } },
    { label: 'Slope', input: { heights: [[1, 2, 3], [2, 3, 4], [3, 4, 5]] } },
    { label: 'Single cell', input: { heights: [[7]] } },
  ],
  validate: ({ heights }) => (heights.some((row) => row.some((v) => typeof v !== 'number')) ? 'Heights must be numbers' : null),
  run({ heights }) {
    const r = new TraceRecorder(solution);
    const rows = heights.length;
    const cols = heights[0].length;
    const pac = new Set<string>();
    const atl = new Set<string>();
    let phase: 'pacific' | 'atlantic' | 'both' = 'pacific';
    let current: string | null = null;
    let askedCheck = false;
    let askedIntersect = false;
    const view = () => {
      const tones: Record<string, Tone> = {};
      for (const k of pac) tones[k] = 'frontier';
      for (const k of atl) tones[k] = pac.has(k) ? 'found' : 'visited';
      if (phase === 'both') for (const k of pac) if (atl.has(k)) tones[k] = 'found';
      if (current) tones[current] = 'active';
      return [gridView(heights, { title: phase === 'pacific' ? 'cells that can flow to the Pacific (blue)' : phase === 'atlantic' ? 'Atlantic cells (teal); green = reaches both' : 'green: water can reach both oceans', tones, compact: false })];
    };
    const flood = (starts: [number, number][], seen: Set<string>, name: string, anchors: { seed: string; pop: string }) => {
      const stack: [number, number][] = [...starts];
      starts.forEach(([a, b]) => seen.add(`${a},${b}`));
      r.step(anchors.seed, `Start from the ${name} edge cells (${starts.length}). Water at these cells reaches the ${name}. Now walk uphill (to equal or higher cells): water from there flows down to where we came from.`, view(), {});
      while (stack.length) {
        r.op();
        const [a, b] = stack.pop() as [number, number];
        current = `${a},${b}`;
        r.step(anchors.pop, `Pop (${a}, ${b}), height ${heights[a][b]}. Which neighbours are at least this high?`, view(), { cell: current });
        for (const [x, y] of DIRS) {
          const na = a + x;
          const nb = b + y;
          if (na >= 0 && na < rows && nb >= 0 && nb < cols && !seen.has(`${na},${nb}`) && heights[na][nb] >= heights[a][b]) {
            if (!askedCheck) {
              askedCheck = true;
              r.predict('check', `(${na}, ${nb}) has height ${heights[na][nb]} and we are at height ${heights[a][b]}. Do we include it?`, ['Yes: it is at least as high, so its water flows down to here', 'No: it is higher'], 0, 'We search in reverse: if a neighbour is not lower, water can run from it to the current cell.');
            }
            seen.add(`${na},${nb}`);
            stack.push([na, nb]);
            r.step('add', `(${na}, ${nb}) has height ${heights[na][nb]} ≥ ${heights[a][b]}: water there can flow down to (${a}, ${b}). Add it.`, view(), {});
          }
        }
        current = null;
      }
    };
    flood([...Array.from({ length: cols }, (_, c) => [0, c] as [number, number]), ...Array.from({ length: rows }, (_, a) => [a, 0] as [number, number])], pac, 'Pacific', { seed: 'pac', pop: 'pop' });
    phase = 'atlantic';
    r.step('ret', `${pac.size} cells can reach the Pacific. Now repeat from the bottom and right edges.`, view(), {});
    flood([...Array.from({ length: cols }, (_, c) => [rows - 1, c] as [number, number]), ...Array.from({ length: rows }, (_, a) => [a, cols - 1] as [number, number])], atl, 'Atlantic', { seed: 'atl', pop: 'pop' });
    phase = 'both';
    const both = [...pac].filter((k) => atl.has(k)).map((k) => k.split(',').map(Number) as [number, number]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    if (!askedIntersect) {
      askedIntersect = true;
      r.predictChoice('both', 'Which cells belong in the answer?', 'Cells in BOTH sets (they reach both oceans)', ['Cells in either set', 'Only cells in the Pacific set', 'Only edge cells'], rows, 'Water must be able to reach both oceans, so the answer is the intersection.');
    }
    r.step('done', `${both.length} cell${both.length === 1 ? '' : 's'} can reach both oceans: ${both.map(([a, b]) => `(${a},${b})`).join(' ')}.`, view(), { result: JSON.stringify(both) });
    return { frames: r.frames, result: both };
  },
  reference({ heights }) {
    const rows = heights.length;
    const cols = heights[0].length;
    const out: number[][] = [];
    const reaches = (a0: number, b0: number) => {
      const seen = new Set([`${a0},${b0}`]);
      const stack: [number, number][] = [[a0, b0]];
      let p = false;
      let at = false;
      while (stack.length) {
        const [a, b] = stack.pop() as [number, number];
        if (a === 0 || b === 0) p = true;
        if (a === rows - 1 || b === cols - 1) at = true;
        for (const [x, y] of DIRS) {
          const na = a + x;
          const nb = b + y;
          if (na >= 0 && na < rows && nb >= 0 && nb < cols && !seen.has(`${na},${nb}`) && heights[na][nb] <= heights[a][b]) { seen.add(`${na},${nb}`); stack.push([na, nb]); }
        }
      }
      return p && at;
    };
    for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) if (reaches(a, b)) out.push([a, b]);
    return out;
  },
});

export default problem({
  summary: 'A rectangular island is described by a grid of heights. The Pacific ocean touches its top and left edges; the Atlantic touches its bottom and right edges. Rain falls on every cell and flows to neighbouring cells (up, down, left, right) that are equal or lower. Return all cells from which water can reach both oceans.',
  example: ['[[1, 2], [2, 1]]', '[[0, 1], [1, 0]]', 'The two 2s touch both oceans. The top-left 1 touches only the Pacific and cannot flow anywhere (both neighbours are higher); the bottom-right 1 touches only the Atlantic.'],
  pattern: ['dfs', ['dfs', 'bfs', 'dp-2d', 'union-find'], 'Instead of simulating water from every cell, start at each ocean’s edge and walk uphill. Cells reached from both oceans are the answer. Two flood fills, one per ocean.', {
    bfs: 'Either traversal works for the flood fill.',
    'dp-2d': 'Reachability is not a table recurrence here.',
    'union-find': 'Directed uphill flow does not fit undirected union-find.',
  }],
  hints: [
    'Simulating water from every cell is expensive. Can you reverse the direction?',
    'Start at the cells that touch the Pacific and move to neighbours that are not lower. What does being reached mean?',
    'Flood from the Pacific edges and from the Atlantic edges with the rule "neighbour height ≥ current". Return the cells in both sets.',
  ],
  insight: 'Reverse the flow: climb from each ocean and intersect the two reachable sets.',
  brute: 'From every cell run a search downhill to see if it reaches both oceans: O((R·C)²).',
  optimal: 'Two flood fills: O(R · C).',
  walk: ['flood(starts) returns the set of cells reachable from the starts by moving to equal-or-higher neighbours.', 'Pacific starts: top row and left column. Atlantic starts: bottom row and right column.', 'Return the cells present in both sets.'],
  edge: ['A single cell touches both oceans.', 'A flat grid (everything flows everywhere).', 'One row or one column.', 'A deep bowl in the middle (the middle cell may not qualify).'],
  works: ['A cell can drain to an ocean exactly if there is a non-increasing path to it, i.e. a non-decreasing path from the ocean edge to the cell.', 'The intersection therefore contains precisely the cells that drain to both.'],
  time: ['O(R · C)', 'Each cell is added to each set at most once.'],
  space: ['O(R · C)', 'The two sets and the stack.'],
  solution,
  cases,
  sig: 'def pacific_atlantic(heights):\n    # heights is a grid of numbers; return a list of [row, col] cells that can reach both oceans\n    pass\n',
  viz,
  fromArgs: ([heights]) => ({ heights }),
});
