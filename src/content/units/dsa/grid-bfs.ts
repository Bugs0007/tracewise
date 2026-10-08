import { Recorder } from '@/engine/recorder';
import type { Panel, Scalar, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
from collections import deque

def shortest_path(grid):
    rows, cols = len(grid), len(grid[0])                       #@size
    if grid[0][0] == 1 or grid[rows - 1][cols - 1] == 1:       #@blocked
        return -1                                              #@blockedRet
    dist = {(0, 0): 0}                                         #@init
    queue = deque([(0, 0)])                                    #@queue
    while queue:                                               #@loop
        r, c = queue.popleft()                                 #@pop
        if (r, c) == (rows - 1, cols - 1):                     #@goal
            return dist[(r, c)]                                #@found
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):      #@dirs
            nr, nc = r + dr, c + dc                            #@next
            if (0 <= nr < rows and 0 <= nc < cols
                    and grid[nr][nc] == 0 and (nr, nc) not in dist):   #@check
                dist[(nr, nc)] = dist[(r, c)] + 1              #@mark
                queue.append((nr, nc))                         #@push
    return -1                                                  #@none
`;

interface In {
  grid: number[][];
}

const DEFAULT = [
  [0, 0, 1, 0, 0],
  [1, 0, 1, 0, 1],
  [0, 0, 0, 0, 0],
  [0, 1, 1, 1, 0],
  [0, 0, 0, 1, 0],
];

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const viz: VizDef<In> = {
  id: 'grid-bfs',
  title: 'BFS on a grid',
  code,
  language: 'python',
  inputs: [{ key: 'grid', label: 'Maze (0 = open, 1 = wall). Start top-left, goal bottom-right', kind: 'grid', default: DEFAULT, maxItems: 36 }],
  presets: [
    { label: 'Winding maze', input: { grid: DEFAULT } },
    { label: 'Open room', input: { grid: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] } },
    { label: 'No route', input: { grid: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] } },
    { label: 'Goal is a wall', input: { grid: [[0, 0], [0, 1]] } },
    { label: 'One cell', input: { grid: [[0]] } },
  ],
  run({ grid }) {
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    if (!rows || !cols) throw new Error('The maze needs at least one cell');
    for (const row of grid) for (const v of row) if (v !== 0 && v !== 1) throw new Error('Use only 0 (open) and 1 (wall) in the maze');
    const r = new Recorder(code);
    const key = (a: number, b: number) => `${a},${b}`;
    const dist = new Map<string, number>();
    const queue: [number, number][] = [];
    const done = new Set<string>();
    const rl = grid.map((_, i) => String(i));
    const cl = grid[0].map((_, i) => String(i));

    const view = (cur?: [number, number], extra: Record<string, Tone> = {}, showQueue = true): Panel[] => {
      const cells: Scalar[][] = grid.map((row, i) => row.map((v, j) => (v === 1 ? '#' : dist.has(key(i, j)) ? dist.get(key(i, j))! : '')));
      const tones: Record<string, Tone> = {};
      grid.forEach((row, i) =>
        row.forEach((v, j) => {
          const k = key(i, j);
          tones[k] = v === 1 ? 'error' : done.has(k) ? 'visited' : dist.has(k) ? 'frontier' : 'default';
        }),
      );
      if (cur) tones[key(cur[0], cur[1])] = 'active';
      Object.assign(tones, extra);
      const panels: Panel[] = [{ type: 'grid', title: 'Maze  (number = steps from start, # = wall)', cells, tones, rowLabels: rl, colLabels: cl }];
      if (showQueue) panels.push({ type: 'list', title: 'Queue', orientation: 'horizontal', startLabel: 'front', endLabel: 'back', emptyText: 'empty', items: queue.map(([a, b]) => ({ id: key(a, b), label: `(${a},${b})`, sub: `d=${dist.get(key(a, b))}`, tone: 'frontier' as Tone })) });
      return panels;
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ queue: queue.length, seen: dist.size, ...extra });

    r.step('size', `${rows} × ${cols} maze: start (0,0), goal (${rows - 1},${cols - 1})`, view(undefined, {}, false), vars({ rows, cols }));
    const blocked = grid[0][0] === 1 || grid[rows - 1][cols - 1] === 1;
    r.step('blocked', blocked ? 'The start or the goal is a wall — no path can exist' : 'Start and goal are both open — safe to search', view(undefined, blocked ? { [key(0, 0)]: 'compare', [key(rows - 1, cols - 1)]: 'compare' } : {}, false), vars());
    if (blocked) {
      r.step('blockedRet', 'Return -1 immediately', view(undefined, {}, false), vars({ result: -1 }));
      return { frames: r.frames, result: -1 };
    }
    dist.set(key(0, 0), 0);
    r.step('init', 'dist records the start at 0 steps (it doubles as the visited set)', view(), vars());
    queue.push([0, 0]);
    r.step('queue', 'Queue the start cell', view(), vars());
    while (true) {
      r.op();
      if (!queue.length) {
        r.step('loop', 'Queue is empty and the goal was never reached', view(), vars());
        r.step('none', 'No route → return -1', view(), vars({ result: -1 }));
        return { frames: r.frames, result: -1 };
      }
      const [cr, cc] = queue.shift()!;
      const d = dist.get(key(cr, cc))!;
      r.step('pop', `Pop (${cr},${cc}) at distance ${d}`, view([cr, cc]), vars({ r: cr, c: cc, d }));
      if (cr === rows - 1 && cc === cols - 1) {
        // walk back down the distances to draw one shortest path
        const path: string[] = [key(cr, cc)];
        let [pr, pc] = [cr, cc];
        for (let step = d; step > 0; step--) {
          for (const [dr, dc] of DIRS) {
            const nr = pr + dr;
            const nc = pc + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && dist.get(key(nr, nc)) === step - 1) {
              [pr, pc] = [nr, nc];
              path.push(key(pr, pc));
              break;
            }
          }
        }
        const pt: Record<string, Tone> = Object.fromEntries(path.map((k) => [k, 'path' as Tone]));
        pt[key(cr, cc)] = 'found';
        r.step('goal', `(${cr},${cc}) is the goal`, view([cr, cc], { [key(cr, cc)]: 'found' }), vars({ r: cr, c: cc, d }));
        r.step('found', `Reached the goal in ${d} step${d === 1 ? '' : 's'} (one shortest path highlighted)`, view(undefined, pt, false), vars({ result: d }));
        return { frames: r.frames, result: d };
      }
      let added = 0;
      for (const [dr, dc] of DIRS) {
        const nr = cr + dr;
        const nc = cc + dc;
        r.op();
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || grid[nr][nc] === 1 || dist.has(key(nr, nc))) continue;
        dist.set(key(nr, nc), d + 1);
        queue.push([nr, nc]);
        added++;
        r.step('mark', `(${nr},${nc}) is open and new → distance ${d + 1}, enqueue`, view([cr, cc], { [key(nr, nc)]: 'compare' }), vars({ r: cr, c: cc, nr, nc, d: d + 1 }));
      }
      done.add(key(cr, cc));
      if (!added) r.step('dirs', `(${cr},${cc}) is a dead end: every neighbour is a wall, off the grid or seen`, view([cr, cc]), vars({ r: cr, c: cc }));
    }
  },
  reference({ grid }) {
    const rows = grid.length;
    const cols = grid[0].length;
    if (grid[0][0] === 1 || grid[rows - 1][cols - 1] === 1) return -1;
    const d = grid.map((row) => row.map(() => -1));
    d[0][0] = 0;
    const q = [[0, 0]];
    for (let h = 0; h < q.length; h++) {
      const [a, b] = q[h];
      for (const [da, db] of DIRS) {
        const x = a + da;
        const y = b + db;
        if (x >= 0 && y >= 0 && x < rows && y < cols && grid[x][y] === 0 && d[x][y] < 0) {
          d[x][y] = d[a][b] + 1;
          q.push([x, y]);
        }
      }
    }
    return d[rows - 1][cols - 1];
  },
};

const tests = [
  { args: [DEFAULT], expected: 8, name: 'winding maze' },
  { args: [[[0, 0, 0], [1, 1, 0], [0, 0, 0]]], expected: 4 },
  { args: [[[0]]], expected: 0, name: 'one cell' },
  { args: [[[0, 1], [1, 0]]], expected: -1, name: 'walled off' },
  { args: [[[1, 0], [0, 0]]], expected: -1, name: 'start is a wall' },
  { args: [[[0, 0], [0, 1]]], expected: -1, name: 'goal is a wall' },
  { args: [[[0, 0, 0], [0, 0, 0], [0, 0, 0]]], expected: 4, name: 'open room' },
];

const unit: Unit = {
  id: 'grid-bfs',
  hook: 'Half of the "graph" questions in interviews are secretly grids: mazes, islands, rotting oranges, walls and gates. The trick is seeing each cell as a node whose neighbours are up, down, left and right.',
  predict: {
    prompt: 'In a 4-direction maze, BFS pops the start (distance 0) first. What distances are on the queue after the start\'s neighbours are added, and what comes next?',
    options: ['All distance-1 cells, then all distance-2 cells', 'One distance-1 cell, then its whole branch down to the wall', 'Distance 1 and distance 2 mixed together', 'The cell closest to the goal first'],
    answer: 0,
    explain: 'The queue is FIFO, so all cells at distance 1 sit ahead of anything at distance 2. BFS therefore expands in rings, and the first time it reaches a cell is by a shortest route.',
  },
  viz,
  deeper: {
    points: [
      'A cell (r, c) has up to four neighbours: (r±1, c) and (r, c±1). Keep them in a tuple of (dr, dc) steps so the loop body stays short.',
      'The dist dict does two jobs: it is the visited set and it stores the shortest distance. A cell enters it the moment it is enqueued.',
      'Order of the guard matters: bounds first, then the wall check, then visited. Reading grid[nr][nc] before the bounds check crashes (or silently wraps for -1 in Python).',
      'Multi-source BFS: put every starting cell in the queue at distance 0 (rotting oranges, walls and gates). The rings spread from all sources at once.',
      'If the walls are weighted differently, plain BFS no longer works — that is Dijkstra territory.',
    ],
    complexity: { time: 'O(rows × cols)', space: 'O(rows × cols)' },
    pitfalls: ['Bounds check after indexing the grid', 'Marking visited when popping instead of when pushing', 'Forgetting that the start or the goal can itself be a wall', 'Swapping rows and cols when the grid is not square'],
  },
  practice: {
    language: 'python',
    fnName: 'shortest_path_grid',
    statement: 'The grid holds 0 (open) and 1 (wall). Starting at the top-left cell, move up/down/left/right through open cells. Return the fewest steps needed to reach the bottom-right cell, or -1 if that is impossible.',
    signature: 'def shortest_path_grid(grid):',
    solution: `from collections import deque

def shortest_path_grid(grid):
    rows, cols = len(grid), len(grid[0])
    if grid[0][0] == 1 or grid[rows - 1][cols - 1] == 1:
        return -1
    dist = {(0, 0): 0}
    queue = deque([(0, 0)])
    while queue:
        r, c = queue.popleft()
        if (r, c) == (rows - 1, cols - 1):
            return dist[(r, c)]
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if @@0 <= nr < rows and 0 <= nc < cols@@ and @@grid[nr][nc] == 0@@ and @@(nr, nc) not in dist@@:
                dist[(nr, nc)] = @@dist[(r, c)] + 1@@
                queue.append((nr, nc))
    return -1`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'shortest_path_grid',
    statement: 'The search crashes with an IndexError on mazes where the route touches the border. Find and fix the bug.',
    buggy: `from collections import deque

def shortest_path_grid(grid):
    rows, cols = len(grid), len(grid[0])
    if grid[0][0] == 1 or grid[rows - 1][cols - 1] == 1:
        return -1
    dist = {(0, 0): 0}
    queue = deque([(0, 0)])
    while queue:
        r, c = queue.popleft()
        if (r, c) == (rows - 1, cols - 1):
            return dist[(r, c)]
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if grid[nr][nc] == 0 and 0 <= nr < rows and 0 <= nc < cols and (nr, nc) not in dist:
                dist[(nr, nc)] = dist[(r, c)] + 1
                queue.append((nr, nc))
    return -1`,
    fixed: `from collections import deque

def shortest_path_grid(grid):
    rows, cols = len(grid), len(grid[0])
    if grid[0][0] == 1 or grid[rows - 1][cols - 1] == 1:
        return -1
    dist = {(0, 0): 0}
    queue = deque([(0, 0)])
    while queue:
        r, c = queue.popleft()
        if (r, c) == (rows - 1, cols - 1):
            return dist[(r, c)]
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 0 and (nr, nc) not in dist:
                dist[(nr, nc)] = dist[(r, c)] + 1
                queue.append((nr, nc))
    return -1`,
    tests,
    bugType: 'bounds checked after indexing',
    hint: 'Which condition runs first for the neighbour (rows, c)? What does grid[rows] do?',
    explanation: 'The condition reads grid[nr][nc] before proving nr and nc are inside the grid. Past the end that raises IndexError, and for -1 Python silently wraps to the last row. Put the bounds test first so "and" short-circuits.',
  },
  boss: {
    title: 'Rotting oranges',
    statement: 'Each grid cell is 0 (empty), 1 (fresh orange) or 2 (rotten orange). Every minute, each fresh orange that touches (up/down/left/right) a rotten one becomes rotten. Return the number of minutes until no fresh orange is left, or -1 if some fresh orange can never rot. Return 0 if there are no fresh oranges at the start.',
    language: 'python',
    fnName: 'minutes_to_rot',
    starter: `def minutes_to_rot(grid):
    # your code here
    pass
`,
    solution: `from collections import deque

def minutes_to_rot(grid):
    rows, cols = len(grid), len(grid[0])
    queue = deque()
    fresh = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 2:
                queue.append((r, c, 0))
            elif grid[r][c] == 1:
                fresh += 1
    minutes = 0
    seen = set((r, c) for r, c, _ in queue)
    while queue:
        r, c, t = queue.popleft()
        minutes = max(minutes, t)
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1 and (nr, nc) not in seen:
                seen.add((nr, nc))
                fresh -= 1
                queue.append((nr, nc, t + 1))
    return minutes if fresh == 0 else -1`,
    tests: [
      { args: [[[2, 1, 1], [1, 1, 0], [0, 1, 1]]], expected: 4 },
      { args: [[[2, 1, 1], [0, 1, 1], [1, 0, 1]]], expected: -1, name: 'bottom-left is cut off' },
      { args: [[[0, 2]]], expected: 0, name: 'nothing fresh' },
      { args: [[[1]]], expected: -1, name: 'fresh with no rotten source' },
      { args: [[[2, 1, 1, 1, 1]]], expected: 4, name: 'one row' },
      { args: [[[2, 1, 1], [1, 1, 1], [1, 1, 2]]], expected: 2, name: 'two sources spread at once' },
    ],
    hints: ['Think of all rotten oranges as BFS sources at the same time — put every one of them in the queue before you start.', 'Store (row, col, minute) in the queue. Count the fresh oranges first; every time one rots, subtract 1. If any are left at the end, answer -1; otherwise answer the largest minute you saw.'],
    combines: ['grid-bfs', 'bfs', 'queue-basics'],
  },
};

export default unit;
