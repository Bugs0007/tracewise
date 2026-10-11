import type { Tone } from '@/engine/types';
import { chipsView, gridView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './walls-and-gates.py?raw';
import cases from './walls-and-gates.cases.json';

const INF = 2147483647;
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
type Cell = number | string;
const fromCell = (c: Cell): number => (c === '.' ? INF : c === '#' ? -1 : Number(c));
const label = (v: number): Cell => (v === INF ? '∞' : v === -1 ? '#' : v);

const viz = vizOf<{ grid: Cell[][] }>({
  id: 'walls-and-gates',
  title: 'Walls and Gates',
  solution,
  inputs: [{ key: 'grid', label: 'rooms: . empty room, # wall, 0 gate (one row per line)', kind: 'grid', default: [['.', 0, '#'], ['.', '.', '.'], [0, '#', '.'], ['.', '.', '#']], maxItems: 25 }],
  presets: [
    { label: 'Two gates', input: { grid: [['.', 0, '#'], ['.', '.', '.'], [0, '#', '.'], ['.', '.', '#']] } },
    { label: 'Walled-off room', input: { grid: [[0, '#', '.']] } },
    { label: 'Corridor', input: { grid: [[0, '.', '.', '.', '.']] } },
    { label: 'Two gates meet', input: { grid: [[0, '.', '.', '.', 0]] } },
  ],
  validate: ({ grid }) => (grid.some((row) => row.some((c) => c !== '.' && c !== '#' && c !== 0)) ? 'Use only . (room), # (wall) and 0 (gate)' : null),
  run({ grid }) {
    const r = new TraceRecorder(solution);
    const rooms = grid.map((row) => row.map(fromCell));
    const rows = rooms.length;
    const cols = rooms[0].length;
    const tones: Record<string, Tone> = {};
    const queue: [number, number][] = [];
    let askedSet = false;
    const view = () => [gridView(rooms.map((row) => row.map(label)), { title: 'distance to the nearest gate (∞ = not reached yet, # = wall)', tones, compact: false }), chipsView(queue.map(([a, b]) => `(${a},${b})`), { title: 'queue', startLabel: 'front', endLabel: 'back' })];
    for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) if (rooms[a][b] === 0) { queue.push([a, b]); tones[`${a},${b}`] = 'frontier'; }
    r.step('seed', `Start with every gate in the queue (${queue.length}). All gates have distance 0, so a single BFS from all of them at once finds each room's nearest gate.`, view(), {});
    while (queue.length) {
      r.op();
      const [a, b] = queue.shift() as [number, number];
      tones[`${a},${b}`] = 'active';
      r.step('pop', `Pop (${a}, ${b}), distance ${rooms[a][b]}. Look at its four neighbours.`, view(), { cell: `${a},${b}` });
      for (const [x, y] of DIRS) {
        const na = a + x;
        const nb = b + y;
        if (na >= 0 && na < rows && nb >= 0 && nb < cols && rooms[na][nb] === INF) {
          if (!askedSet) {
            askedSet = true;
            r.predictChoice('set', `(${na}, ${nb}) is an unvisited room next to (${a}, ${b}), which has distance ${rooms[a][b]}. What distance does it get?`, String(rooms[a][b] + 1), [String(rooms[a][b]), String(rooms[a][b] + 2), '1'], rooms[a][b], 'One step farther than the cell we came from; BFS reaches it first by the shortest route.');
          }
          rooms[na][nb] = rooms[a][b] + 1;
          queue.push([na, nb]);
          tones[`${na},${nb}`] = 'frontier';
          r.step('set', `(${na}, ${nb}) gets distance ${rooms[na][nb]} and joins the queue.`, view(), {});
        }
      }
      tones[`${a},${b}`] = 'done';
    }
    const left = rooms.flat().filter((v) => v === INF).length;
    r.predictChoice('left', 'The queue is empty. How many rooms still show ∞?', String(left), [String(left + 1), String(Math.max(0, left - 1)), '0'], rows, 'Rooms that no gate can reach (cut off by walls, or no gate at all) are never touched by the BFS.');
    r.step('done', left ? `Done. ${left} room${left > 1 ? 's' : ''} cannot reach any gate and keep ∞.` : 'Done. Every room has a distance.', view(), { result: JSON.stringify(rooms) });
    return { frames: r.frames, result: rooms };
  },
  reference({ grid }) {
    const rooms = grid.map((row) => row.map(fromCell));
    const rows = rooms.length;
    const cols = rooms[0].length;
    const out = rooms.map((row) => [...row]);
    for (let a = 0; a < rows; a++) {
      for (let b = 0; b < cols; b++) {
        if (rooms[a][b] !== INF) continue;
        const seen = new Set([`${a},${b}`]);
        let layer: [number, number][] = [[a, b]];
        let d = 0;
        let best = INF;
        while (layer.length && best === INF) {
          const next: [number, number][] = [];
          for (const [x, y] of layer) {
            if (rooms[x][y] === 0) best = d;
            for (const [dx, dy] of DIRS) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < rows && ny >= 0 && ny < cols && rooms[nx][ny] !== -1 && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); next.push([nx, ny]); }
            }
          }
          layer = next;
          d++;
        }
        out[a][b] = best;
      }
    }
    return out;
  },
});

export default problem({
  summary: 'A grid of rooms has walls (impassable), gates, and empty rooms. For every empty room, find the number of steps (moving up, down, left or right, never through a wall) to the nearest gate. Rooms that no gate can reach keep a special "infinity" value.',
  example: ['[[gate, empty, empty, wall]]', '[[0, 1, 2, wall]]', 'The room next to the gate is 1 step away, the next 2 steps.'],
  pattern: ['bfs', ['bfs', 'dfs', 'dp-2d', 'dijkstra'], 'Shortest distance in an unweighted grid is breadth-first search. Starting from all gates at once (multi-source BFS) gives every room its nearest gate in one pass.', {
    dfs: 'DFS does not find shortest paths without re-exploring many times.',
    'dp-2d': 'A distance table is filled by BFS, not by a fixed formula.',
    dijkstra: 'Every step costs 1, so plain BFS is enough.',
  }],
  hints: [
    'Would it be easier to start from each room and look for a gate, or from the gates and spread outward?',
    'If you start BFS from every gate at the same time, what is the first time a room is reached?',
    'Put all gates in a queue. Pop a cell; for each neighbour that is still "infinity", set it to distance + 1 and push it.',
  ],
  insight: 'A BFS with many starting points visits cells in order of distance to the closest start.',
  brute: 'BFS from every empty room until it finds a gate: O((R·C)²).',
  optimal: 'Multi-source BFS: O(R · C).',
  walk: ['Queue all cells with value 0.', 'Pop a cell (r, c).', 'For each neighbour inside the grid whose value is still INF, set it to rooms[r][c] + 1 and push it.', 'When the queue empties, return the grid.'],
  edge: ['No gates (nothing changes).', 'A room walled off from every gate.', 'Two gates equally far from a room.', 'Single row or column.'],
  works: ['BFS pops cells in non-decreasing distance order, so the first assignment to a room is its true shortest distance.', 'Only INF cells are updated, so a distance is set exactly once.'],
  time: ['O(R · C)', 'Each cell enters the queue at most once.'],
  space: ['O(R · C)', 'The queue.'],
  solution,
  cases,
  sig: 'def walls_and_gates(rooms):\n    # -1 wall, 0 gate, 2147483647 empty room; fill each empty room with its distance to the nearest gate\n    # (leave unreachable rooms as 2147483647) and return the grid\n    pass\n',
  viz,
  fromArgs: ([rooms]) => ({ grid: (rooms as number[][]).map((row) => row.map((v) => (v === INF ? '.' : v === -1 ? '#' : v))) }),
});
