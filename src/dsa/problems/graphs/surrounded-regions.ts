import type { Tone } from '@/engine/types';
import { gridView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './surrounded-regions.py?raw';
import cases from './surrounded-regions.cases.json';

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const viz = vizOf<{ board: string[][] }>({
  id: 'surrounded-regions',
  title: 'Surrounded Regions',
  solution,
  inputs: [{ key: 'board', label: 'board of X and O (one row per line)', kind: 'grid', default: [['X', 'X', 'X', 'X'], ['X', 'O', 'O', 'X'], ['X', 'X', 'O', 'X'], ['X', 'O', 'X', 'X']], maxItems: 30 }],
  presets: [
    { label: 'Inner region', input: { board: [['X', 'X', 'X', 'X'], ['X', 'O', 'O', 'X'], ['X', 'X', 'O', 'X'], ['X', 'O', 'X', 'X']] } },
    { label: 'Border saves a region', input: { board: [['O', 'O', 'O'], ['O', 'X', 'O'], ['O', 'O', 'O']] } },
    { label: 'Two inner regions', input: { board: [['X', 'X', 'X', 'X', 'X'], ['X', 'O', 'X', 'O', 'X'], ['X', 'X', 'X', 'X', 'X']] } },
    { label: 'Single O', input: { board: [['O']] } },
  ],
  validate: ({ board }) => (board.some((row) => row.some((c) => c !== 'X' && c !== 'O')) ? 'Use only the capital letters X and O' : null),
  run({ board }) {
    const r = new TraceRecorder(solution);
    const rows = board.length;
    const cols = board[0].length;
    const safe = new Set<string>();
    const tones: Record<string, Tone> = {};
    let flipped = false;
    let askedBorder = false;
    let askedFlip = false;
    const view = () => {
      const shown = board.map((row, a) => row.map((c, b) => (flipped ? (safe.has(`${a},${b}`) ? 'O' : 'X') : c)));
      return [gridView(shown, { title: flipped ? 'result' : 'board (green = O connected to the border, so it is safe)', tones, compact: false })];
    };
    r.step('init', 'An O is safe if it touches the border directly or through a chain of neighbouring Os. We find the safe cells first, then flip every other O.', view(), {});
    const dfs = (a: number, b: number) => {
      if (a < 0 || b < 0 || a >= rows || b >= cols || board[a][b] !== 'O' || safe.has(`${a},${b}`)) return;
      r.op();
      safe.add(`${a},${b}`);
      tones[`${a},${b}`] = 'found';
      if (!askedBorder) {
        askedBorder = true;
        r.step('mark', `(${a}, ${b}) is an O on the border: it can never be surrounded. Mark it safe and spread through neighbouring Os.`, view(), { cell: `${a},${b}` });
        r.predict('border', 'Which Os are safe from being captured?', ['Os on the border, and Os connected to them', 'Only the Os on the border', 'Os with at least one X neighbour'], 0, 'A region touching the border cannot be surrounded, and any O joined to it shares that safety.');
      } else {
        r.step('mark', `(${a}, ${b}) is an O connected to a safe cell: safe too.`, view(), { cell: `${a},${b}` });
      }
      for (const [x, y] of DIRS) dfs(a + x, b + y);
    };
    for (let a = 0; a < rows; a++) {
      dfs(a, 0);
      dfs(a, cols - 1);
    }
    for (let b = 0; b < cols; b++) {
      dfs(0, b);
      dfs(rows - 1, b);
    }
    const captured = board.flat().filter((c) => c === 'O').length - safe.size;
    r.step('border', `The border search is finished: ${safe.size} safe O${safe.size === 1 ? '' : 's'}.`, view(), {});
    if (!askedFlip) {
      askedFlip = true;
      r.predictChoice('flip', 'How many Os will be flipped to X?', String(captured), [String(captured + 1), String(safe.size), String(Math.max(0, captured - 1))], rows, 'Every O that is not safe is surrounded, so it flips.');
    }
    flipped = true;
    const res = board.map((row, a) => row.map((_, b) => (safe.has(`${a},${b}`) ? 'O' : 'X')));
    r.step('flip', `Every O not in the safe set becomes X (${captured} flipped).`, view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ board }) {
    const rows = board.length;
    const cols = board[0].length;
    const safe = new Set<string>();
    const go = (a: number, b: number) => {
      if (a < 0 || b < 0 || a >= rows || b >= cols || board[a][b] !== 'O' || safe.has(`${a},${b}`)) return;
      safe.add(`${a},${b}`);
      DIRS.forEach(([x, y]) => go(a + x, b + y));
    };
    for (let a = 0; a < rows; a++) { go(a, 0); go(a, cols - 1); }
    for (let b = 0; b < cols; b++) { go(0, b); go(rows - 1, b); }
    return board.map((row, a) => row.map((_, b) => (safe.has(`${a},${b}`) ? 'O' : 'X')));
  },
});

export default problem({
  summary: 'A board holds the letters X and O. A group of Os connected through their four sides is "surrounded" if none of its cells is on the board’s edge and every neighbour outside the group is an X. Turn every surrounded O into an X and return the board.',
  example: ['[[X, X, X], [X, O, X], [X, X, X]]', '[[X, X, X], [X, X, X], [X, X, X]]', 'The centre O has Xs on all four sides and is not on the border.'],
  pattern: ['dfs', ['dfs', 'bfs', 'union-find', 'matrix'], 'Instead of testing each region for being surrounded, find the Os that can never be: those connected to the border. Flood-fill from the border Os, and everything else flips.', {
    bfs: 'BFS from the border works equally well.',
    'union-find': 'Union-find with a border node also works, but the flood fill is simpler.',
    matrix: 'The board is the setting; the technique is a flood fill.',
  }],
  hints: [
    'Testing each region would need a search per region. Is there a simpler way to recognise the regions that stay?',
    'Which Os are definitely not captured?',
    'Run dfs from every border O to mark the safe Os. Then every other O becomes X.',
  ],
  insight: 'Reverse the question: mark what is safe (connected to the border), flip the rest.',
  brute: 'For each region, BFS and check whether it touches the border: O(R·C) as well, with more bookkeeping.',
  optimal: 'Border flood fill: O(R · C).',
  walk: ['Create safe = set().', 'dfs(r, c) marks Os that are in bounds, unvisited, and connected to the start.', 'Call dfs for every cell on the four edges.', 'Build the new board: O if (r, c) is safe, X otherwise.'],
  edge: ['Single row or column (all cells are border cells).', 'No Os.', 'All Os.', 'An inner region touching a border region only diagonally.'],
  works: ['A cell is safe exactly if a chain of Os leads from it to the border.', 'The flood fill from all border Os finds precisely those chains.'],
  time: ['O(R · C)', 'Each cell is visited once.'],
  space: ['O(R · C)', 'The safe set and recursion.'],
  solution,
  cases,
  sig: 'def solve(board):\n    # board is a list of rows of "X" / "O"; return the board with surrounded Os turned into X\n    pass\n',
  viz,
  fromArgs: ([board]) => ({ board }),
});
