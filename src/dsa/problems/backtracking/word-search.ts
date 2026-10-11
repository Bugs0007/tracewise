import type { Tone } from '@/engine/types';
import { chipsView, gridView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './word-search.py?raw';
import cases from './word-search.cases.json';

const viz = vizOf<{ board: string[][]; word: string }>({
  id: 'word-search',
  title: 'Word Search',
  solution,
  inputs: [
    { key: 'board', label: 'board (one lowercase letter per cell, rows on separate lines)', kind: 'grid', default: [['a', 'b', 'c', 'e'], ['s', 'f', 'c', 's'], ['a', 'd', 'e', 'e']], maxItems: 16 },
    { key: 'word', label: 'word', kind: 'string', default: 'abcced', maxItems: 8 },
  ],
  presets: [
    { label: 'Found', input: { board: [['a', 'b', 'c', 'e'], ['s', 'f', 'c', 's'], ['a', 'd', 'e', 'e']], word: 'abcced' } },
    { label: 'Cell reuse not allowed', input: { board: [['a', 'b', 'c', 'e'], ['s', 'f', 'c', 's'], ['a', 'd', 'e', 'e']], word: 'abcb' } },
    { label: 'Snake', input: { board: [['a', 'b'], ['d', 'c']], word: 'abcd' } },
    { label: 'Single cell', input: { board: [['z']], word: 'z' } },
  ],
  validate: ({ board, word }) => (board.some((row) => row.some((c) => !/^[a-z]$/.test(String(c)))) ? 'Every cell must be one lowercase letter' : !/^[a-z]+$/.test(word) ? 'The word must be lowercase letters' : null),
  run({ board: input, word }) {
    const r = new TraceRecorder(solution);
    const board = input.map((row) => row.map(String));
    const rows = board.length;
    const cols = board[0].length;
    const path: [number, number][] = [];
    let at: [number, number] | null = null;
    let bad: [number, number] | null = null;
    const matched = () => word.slice(0, path.length);
    const view = () => {
      const tones: Record<string, Tone> = {};
      path.forEach(([a, b]) => (tones[`${a},${b}`] = 'visited'));
      if (at) tones[`${at[0]},${at[1]}`] = 'active';
      if (bad) tones[`${bad[0]},${bad[1]}`] = 'compare';
      return [gridView(board, { title: 'board ("#" marks cells on the current path)', tones, compact: false }), chipsView([...word], { title: 'word (green = matched so far)', tones: Object.fromEntries([...word].map((_, i) => [i, (i < path.length ? 'done' : i === path.length ? 'active' : 'default') as Tone])) })];
    };
    r.step('dims', `The board is ${rows} × ${cols}. Looking for "${word}".`, view(), {});
    let askedMark = false;
    let askedBad = false;
    let askedRestore = false;
    const dfs = (rr: number, cc: number, i: number): boolean => {
      r.op();
      bad = null;
      if (i === word.length) {
        r.step('doneRet', `All ${word.length} letters matched ("${matched()}"). Return True.`, view(), { i });
        return true;
      }
      const inside = rr >= 0 && rr < rows && cc >= 0 && cc < cols;
      if (!inside || board[rr][cc] !== word[i]) {
        if (inside) bad = [rr, cc];
        at = null;
        r.step('bad', !inside ? `(${rr}, ${cc}) is off the board: False.` : `(${rr}, ${cc}) holds "${board[rr][cc]}" but we need "${word[i]}": False.`, view(), { i });
        if (!askedBad && inside) {
          askedBad = true;
          r.predict('bad', `The cell holds "${board[rr][cc]}" and the next letter needed is "${word[i]}". What does this call return?`, ['False: backtrack', 'True', 'It continues to the neighbours'], 0, 'A mismatch means this path cannot spell the word, so the call fails and the caller tries another direction.');
        }
        bad = null;
        return false;
      }
      at = [rr, cc];
      r.step('mark', `(${rr}, ${cc}) = "${board[rr][cc]}" matches letter ${i + 1} of "${word}".`, view(), { i });
      const keep = board[rr][cc];
      board[rr][cc] = '#';
      path.push([rr, cc]);
      if (!askedMark) {
        askedMark = true;
        r.predict('mark', 'Before exploring the neighbours the cell is overwritten with "#". Why?', ['So this path cannot reuse the same cell', 'To make it faster', 'To record the answer'], 0, 'A cell may be used at most once per path; "#" never matches a letter, so revisits fail.');
      }
      r.step('mark', `Mark (${rr}, ${cc}) as used.`, view(), {});
      const found = dfs(rr + 1, cc, i + 1) || dfs(rr - 1, cc, i + 1) || dfs(rr, cc + 1, i + 1) || dfs(rr, cc - 1, i + 1);
      board[rr][cc] = keep;
      path.pop();
      at = [rr, cc];
      if (!askedRestore) {
        askedRestore = true;
        r.predict('restore', 'The four directions are finished. What must happen to the cell before returning?', ['Restore its letter', 'Leave it as "#"', 'Delete it'], 0, 'Other paths, starting elsewhere or going another way, still need to be able to use this letter.');
      }
      r.step('restore', found ? `Found. (The cell is restored on the way out.)` : `No direction worked from (${rr}, ${cc}). Restore "${keep}" and backtrack.`, view(), {});
      at = null;
      return found;
    };
    let result = false;
    outer: for (let rr = 0; rr < rows; rr++) {
      for (let cc = 0; cc < cols; cc++) {
        if (dfs(rr, cc, 0)) {
          result = true;
          break outer;
        }
      }
    }
    at = null;
    r.step('start', result ? `"${word}" is on the board.` : `"${word}" cannot be traced on this board.`, view(), { result });
    return { frames: r.frames, result };
  },
  reference({ board: input, word }) {
    const board = input.map((row) => row.map(String));
    const go = (r: number, c: number, i: number): boolean => {
      if (i === word.length) return true;
      if (r < 0 || c < 0 || r >= board.length || c >= board[0].length || board[r][c] !== word[i]) return false;
      const keep = board[r][c];
      board[r][c] = '#';
      const ok = go(r + 1, c, i + 1) || go(r - 1, c, i + 1) || go(r, c + 1, i + 1) || go(r, c - 1, i + 1);
      board[r][c] = keep;
      return ok;
    };
    for (let r = 0; r < board.length; r++) for (let c = 0; c < board[0].length; c++) if (go(r, c, 0)) return true;
    return false;
  },
});

export default problem({
  summary: 'You get a grid of letters and a word. Decide whether the word can be spelled by starting at any cell and repeatedly stepping to an adjacent cell (up, down, left or right), without using the same cell twice in the same word.',
  example: ['grid [[c, a], [t, s]], word "cast"', 'true', 'c → a → s → t visits four different cells, each next to the previous one.'],
  pattern: ['backtracking', ['backtracking', 'dfs', 'bfs', 'matrix'], 'You explore a path letter by letter and must undo the "visited" mark when you leave a cell so other paths can use it. That choose / explore / undo loop is backtracking on a grid.', {
    dfs: 'The traversal is DFS; what makes it backtracking is un-marking cells when returning.',
    bfs: 'BFS would need to keep separate visited sets per path.',
    matrix: 'Grid traversal is the setting; the technique is backtracking.',
  }],
  hints: [
    'Where can a path start, and how do you decide the next letter is right?',
    'How do you stop a path from stepping on the same cell twice without a separate visited set?',
    'dfs(r, c, i): false if out of bounds or the letter differs; mark the cell, try the four neighbours with i + 1, restore the cell, return whether any succeeded.',
  ],
  insight: 'Temporarily overwrite the current cell with a marker, explore, then put the letter back.',
  brute: 'Enumerate all paths of the right length and compare letters: the same search without early stopping.',
  optimal: 'Backtracking with early exit: O(cells · 3^L) because after the first step at most three directions are new.',
  walk: ['Try every cell as a start: dfs(r, c, 0).', 'dfs returns True if i equals len(word).', 'It returns False if the cell is off the board or its letter differs from word[i].', 'Mark the cell, try the four neighbours with i + 1 (stop at the first True), restore, and return the result.'],
  edge: ['Single-cell board.', 'Word longer than the number of cells.', 'The same letter appearing several times (cell reuse must not count).', 'Words that need a long snake-like path.'],
  works: ['Each call extends a valid path of i matching letters by one more adjacent cell.', 'Restoring the cell guarantees that failed paths leave no trace.'],
  time: ['O(cells · 3^L)', 'L = word length.'],
  space: ['O(L)', 'Recursion depth.'],
  solution,
  cases,
  sig: 'def exist(board, word):\n    # board is a list of rows of single letters; True if word can be traced without reusing a cell\n    pass\n',
  viz,
  fromArgs: ([board, word]) => ({ board, word }),
});
