import type { Tone } from '@/engine/types';
import { chipsView, gridView, hashMapView } from '@/dsa/viz/prims';
import { MinHeap } from '@/dsa/viz/heap';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './swim-in-rising-water.py?raw';
import cases from './swim-in-rising-water.cases.json';

type Entry = [number, number, number];
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const viz = vizOf<{ grid: number[][] }>({
  id: 'swim-in-rising-water',
  title: 'Swim in Rising Water',
  solution,
  inputs: [{ key: 'grid', label: 'square grid of heights (water level rises over time)', kind: 'grid', default: [[2, 6, 3], [0, 7, 4], [1, 8, 5]], maxItems: 16 }],
  presets: [
    { label: 'Go round the wall', input: { grid: [[2, 6, 3], [0, 7, 4], [1, 8, 5]] } },
    { label: 'Snake', input: { grid: [[0, 1, 2, 3], [11, 10, 9, 4], [12, 13, 8, 5], [15, 14, 7, 6]] } },
    { label: 'Two by two', input: { grid: [[0, 1], [2, 3]] } },
    { label: 'Single cell', input: { grid: [[0]] } },
  ],
  validate: ({ grid }) => (grid.length !== grid[0].length ? 'The grid must be square (same number of rows and columns)' : grid.some((row) => row.some((v) => typeof v !== 'number' || v < 0 || !Number.isInteger(v))) ? 'Heights must be whole numbers ≥ 0' : null),
  run({ grid }) {
    const r = new TraceRecorder(solution);
    const n = grid.length;
    const heap = new MinHeap<Entry>([]);
    const seen = new Set<string>(['0,0']);
    const done = new Set<string>();
    let level = 0;
    let askedPop = false;
    let pops = 0;
    let askedPush = false;
    const view = (hot: string | null = null) => {
      const tones: Record<string, Tone> = {};
      seen.forEach((k) => (tones[k] = 'frontier'));
      done.forEach((k) => (tones[k] = 'done'));
      if (hot) tones[hot] = 'active';
      return [gridView(grid, { title: 'heights (teal = settled, blue = waiting in the heap)', tones, compact: false }), chipsView(heap.items.map(([t, a, b]) => `t=${t} @(${a},${b})`), { title: 'heap: (time needed to stand there, cell)' }), hashMapView({ 'time so far': level })];
    };
    heap.push([grid[0][0], 0, 0]);
    r.step('heap', `You start at (0, 0), which is already under water at time ${grid[0][0]}. The heap holds (time, row, col).`, view(), {});
    while (heap.size) {
      r.op();
      const [t, a, b] = heap.pop();
      level = t;
      done.add(`${a},${b}`);
      r.step('pop', `Pop (${t}, ${a}, ${b}): the cheapest-to-reach cell in the heap. You can be standing at it at time ${t}.`, view(`${a},${b}`), { t });
      pops++;
      if (pops === 2 && !askedPop) {
        askedPop = true;
        r.predict('pop', 'The heap pops the cell with the smallest "time needed". Why can we trust that time as final?', ['Any other route would have to pass through a heap entry that is not smaller', 'Because heights are sorted', 'It cannot be trusted'], 0, 'Times only increase along a route (we take a maximum), so the smallest candidate cannot be improved by a later one.');
      }
      if (a === n - 1 && b === n - 1) {
        r.step('goalRet', `Reached the bottom-right corner at time ${t}.`, view(`${a},${b}`), { result: t });
        return { frames: r.frames, result: t };
      }
      for (const [x, y] of DIRS) {
        const na = a + x;
        const nb = b + y;
        if (na >= 0 && na < n && nb >= 0 && nb < n && !seen.has(`${na},${nb}`)) {
          const need = Math.max(t, grid[na][nb]);
          if (!askedPush) {
            askedPush = true;
            r.predictChoice('push', `Neighbour (${na}, ${nb}) has height ${grid[na][nb]} and you are there at time ${t}. At what time can you be on it?`, String(need), [String(grid[na][nb] + t), String(Math.min(t, grid[na][nb])), String(need + 1)], t, 'You may have to wait for the water to reach the neighbour, or you are already past it: the later of the two.');
          }
          seen.add(`${na},${nb}`);
          heap.push([need, na, nb]);
          r.step('push', `(${na}, ${nb}): height ${grid[na][nb]}. The earliest time to stand there is max(${t}, ${grid[na][nb]}) = ${need}. Push it.`, view(`${a},${b}`), {});
        }
      }
    }
    r.step('none', 'No route.', view(), { result: -1 });
    return { frames: r.frames, result: -1 };
  },
  reference({ grid }) {
    const n = grid.length;
    const ok = (t: number) => {
      if (grid[0][0] > t) return false;
      const seen = new Set(['0,0']);
      const stack: [number, number][] = [[0, 0]];
      while (stack.length) {
        const [a, b] = stack.pop() as [number, number];
        if (a === n - 1 && b === n - 1) return true;
        for (const [x, y] of DIRS) {
          const na = a + x;
          const nb = b + y;
          if (na >= 0 && na < n && nb >= 0 && nb < n && !seen.has(`${na},${nb}`) && grid[na][nb] <= t) { seen.add(`${na},${nb}`); stack.push([na, nb]); }
        }
      }
      return false;
    };
    let t = 0;
    while (!ok(t)) t++;
    return t;
  },
});

export default problem({
  summary: 'A square grid holds the height of each cell. At time t, the water level is t everywhere, and you may stand on any cell whose height is at most t. You can swim instantly between side-adjacent cells that are both under water. Starting at the top-left cell at time 0, find the smallest time at which you can reach the bottom-right cell.',
  example: ['[[0, 2], [1, 3]]', '3', 'The bottom-right cell has height 3, so you cannot be there before time 3, and the path through the 1 is fine by then.'],
  pattern: ['dijkstra', ['dijkstra', 'binary-search-answer', 'bfs', 'union-find'], 'The cost of a route is the highest cell on it, not a sum. Dijkstra works with a max instead of a plus: always expand the cell that can be reached at the smallest time, using a heap.', {
    'binary-search-answer': 'Binary search on the time with a flood-fill check also works (check if a route exists below time t).',
    bfs: 'Plain BFS cannot minimise the highest cell on the route.',
    'union-find': 'Adding cells in height order with union-find also works; the heap version is shorter.',
  }],
  hints: [
    'What is the "cost" of a path? Is it a sum?',
    'If you reached a cell at time t, when can you be on a neighbour?',
    'Dijkstra with key max(t, neighbour height): pop the smallest, push neighbours with max(t, height), stop at the bottom-right.',
  ],
  insight: 'Replace the sum in Dijkstra with a max: the time to reach a cell is the largest height seen on the best route.',
  brute: 'Try times t = 0, 1, 2, … and flood-fill for each: O(n² · maxHeight).',
  optimal: 'Dijkstra with a heap: O(n² log n).',
  walk: ['heap = [(grid[0][0], 0, 0)]; seen = {(0, 0)}.', 'Pop (t, r, c). If this is the bottom-right cell return t.', 'For each unseen neighbour mark it seen and push (max(t, its height), nr, nc).', 'The first time the target is popped, its t is the answer.'],
  edge: ['A single cell.', 'The start is the highest cell on the best route.', 'A tall wall that must be crossed anyway.', 'Equal heights.'],
  works: ['Along any route the time needed is the maximum height seen. The heap always expands the cell with the smallest such maximum.', 'When the target is popped, no other route has a smaller maximum.'],
  time: ['O(n² log n)', 'Each cell is pushed once.'],
  space: ['O(n²)', 'Seen set and heap.'],
  solution,
  cases,
  sig: 'def swim_in_water(grid):\n    # grid is a square list of rows of heights; return the earliest time you can reach the bottom-right cell\n    pass\n',
  viz,
  fromArgs: ([grid]) => ({ grid }),
});
