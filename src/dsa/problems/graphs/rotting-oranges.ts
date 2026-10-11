import type { Tone } from '@/engine/types';
import { chipsView, gridView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './rotting-oranges.py?raw';
import cases from './rotting-oranges.cases.json';

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const viz = vizOf<{ grid: number[][] }>({
  id: 'rotting-oranges',
  title: 'Rotting Oranges',
  solution,
  inputs: [{ key: 'grid', label: 'grid: 0 empty, 1 fresh, 2 rotten', kind: 'grid', default: [[2, 1, 0, 1], [1, 1, 1, 0], [0, 1, 1, 1]], maxItems: 25 }],
  presets: [
    { label: 'Spreads to all', input: { grid: [[2, 1, 0, 1], [1, 1, 1, 0], [0, 1, 1, 1]] } },
    { label: 'Cut off', input: { grid: [[2, 1, 0], [0, 0, 1], [1, 1, 1]] } },
    { label: 'Two sources', input: { grid: [[2, 1, 1, 1, 2]] } },
    { label: 'Nothing fresh', input: { grid: [[0, 2]] } },
  ],
  validate: ({ grid }) => (grid.some((row) => row.some((v) => v !== 0 && v !== 1 && v !== 2)) ? 'Cells must be 0, 1 or 2' : null),
  run({ grid: input }) {
    const r = new TraceRecorder(solution);
    const grid = input.map((row) => [...row]);
    const rows = grid.length;
    const cols = grid[0].length;
    const queue: [number, number][] = [];
    let fresh = 0;
    let minutes = 0;
    const recent = new Set<string>();
    let askedMinute = false;
    let askedEnd = false;
    const view = () => {
      const tones: Record<string, Tone> = {};
      for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) tones[`${a},${b}`] = grid[a][b] === 2 ? (recent.has(`${a},${b}`) ? 'active' : 'compare') : grid[a][b] === 1 ? 'found' : 'default';
      return [gridView(grid, { title: 'grid (red = rotten, green = fresh, bright red = just rotted)', tones, compact: false }), chipsView(queue.map(([a, b]) => `(${a},${b})`), { title: 'queue of rotten oranges' }), hashMapView({ minutes, fresh })];
    };
    for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) { if (grid[a][b] === 2) queue.push([a, b]); else if (grid[a][b] === 1) fresh++; }
    r.step('seed', `${queue.length} rotten orange${queue.length === 1 ? '' : 's'} start in the queue; ${fresh} fresh orange${fresh === 1 ? '' : 's'} to go.`, view(), {});
    while (queue.length && fresh) {
      r.op();
      minutes++;
      recent.clear();
      const size = queue.length;
      r.step('minute', `Minute ${minutes}: every orange that is rotten right now (${size}) rots its fresh neighbours.`, view(), { minutes });
      if (!askedMinute) {
        askedMinute = true;
        let willRot = 0;
        const peek = new Set<string>();
        for (const [a, b] of queue) for (const [x, y] of DIRS) if (a + x >= 0 && a + x < rows && b + y >= 0 && b + y < cols && grid[a + x][b + y] === 1) peek.add(`${a + x},${b + y}`);
        willRot = peek.size;
        r.predictChoice('minute', 'How many fresh oranges will rot during this minute?', String(willRot), [String(willRot + 1), String(Math.max(0, willRot - 1)), String(fresh)], size, 'Count the distinct fresh oranges that touch a currently rotten one on a side.');
      }
      for (let i = 0; i < size; i++) {
        const [a, b] = queue.shift() as [number, number];
        for (const [x, y] of DIRS) {
          const na = a + x;
          const nb = b + y;
          if (na >= 0 && na < rows && nb >= 0 && nb < cols && grid[na][nb] === 1) {
            grid[na][nb] = 2;
            fresh--;
            queue.push([na, nb]);
            recent.add(`${na},${nb}`);
            r.step('rot', `(${a}, ${b}) rots its neighbour (${na}, ${nb}). Fresh left: ${fresh}.`, view(), {});
          }
        }
      }
    }
    recent.clear();
    const res = fresh === 0 ? minutes : -1;
    if (!askedEnd) {
      askedEnd = true;
      r.predictChoice('end', fresh ? 'The queue is empty but fresh oranges remain. What is returned?' : 'No fresh oranges remain. What is returned?', String(res), [String(res + 1), fresh ? String(minutes) : '-1', '0'], rows, fresh ? 'Some fresh orange can never be touched, so the answer is -1.' : 'The number of minutes that were needed.');
    }
    r.step('done', fresh ? `${fresh} fresh orange${fresh > 1 ? 's' : ''} could never be reached: return -1.` : `Every orange rotted after ${minutes} minute${minutes === 1 ? '' : 's'}.`, view(), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ grid: input }) {
    let g = input.map((row) => [...row]);
    let minutes = 0;
    for (;;) {
      const next = g.map((row) => [...row]);
      let changed = false;
      g.forEach((row, a) => row.forEach((v, b) => {
        if (v === 1 && DIRS.some(([x, y]) => g[a + x]?.[b + y] === 2)) { next[a][b] = 2; changed = true; }
      }));
      if (!changed) break;
      g = next;
      minutes++;
    }
    return g.some((row) => row.includes(1)) ? -1 : minutes;
  },
});

export default problem({
  summary: 'A grid holds empty cells (0), fresh oranges (1) and rotten oranges (2). Every minute, each fresh orange that touches a rotten one on a side (up, down, left, right) becomes rotten. Return the number of minutes until no fresh orange is left, or -1 if some fresh orange can never rot.',
  example: ['[[2, 1, 1]]', '2', 'Minute 1 rots the middle orange, minute 2 rots the last one.'],
  pattern: ['bfs', ['bfs', 'dfs', 'simulation', 'dp-2d'], 'Rot spreads outward at the same speed from every rotten orange, minute by minute. That is a multi-source BFS where each BFS level equals one minute.', {
    dfs: 'DFS does not respect the minute-by-minute spreading order.',
    simulation: 'Scanning the whole grid every minute is a valid simulation but does more work than needed.',
    'dp-2d': 'There is no recurrence; the spread is a traversal.',
  }],
  hints: [
    'Which oranges can rot new ones in a given minute?',
    'If you process all currently rotten oranges together, how do you know where one minute ends and the next begins?',
    'BFS with a queue of rotten oranges. Count fresh ones. Each round (len(queue) items) is one minute; stop when fresh is 0 or the queue is empty.',
  ],
  insight: 'Level-by-level BFS from all rotten oranges: each level is one minute.',
  brute: 'Re-scan the entire grid each minute until nothing changes: O((R·C)²).',
  optimal: 'Multi-source BFS: O(R · C).',
  walk: ['Queue every rotten orange and count the fresh ones.', 'While the queue is non-empty and fresh > 0: minutes += 1 and process exactly len(queue) oranges.', 'For each neighbour that is fresh, make it rotten, decrement fresh and queue it.', 'Return minutes if fresh == 0, else −1.'],
  edge: ['No fresh oranges (0 minutes).', 'Fresh oranges but no rotten ones (−1).', 'A fresh orange isolated by empty cells (−1).', 'Several rotten sources reaching the same orange.'],
  works: ['Cells are processed in the order they become rotten, so level k contains oranges that rot at minute k.', 'An orange left fresh is unreachable from any rotten orange through fresh ones.'],
  time: ['O(R · C)', 'Each orange is queued at most once.'],
  space: ['O(R · C)', 'The queue.'],
  solution,
  cases,
  sig: 'def oranges_rotting(grid):\n    # 0 empty, 1 fresh, 2 rotten; return the minutes until nothing is fresh, or -1\n    pass\n',
  viz,
  fromArgs: ([grid]) => ({ grid }),
});
