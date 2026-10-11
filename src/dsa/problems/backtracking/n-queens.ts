import type { Tone } from '@/engine/types';
import { chipsView, gridView, hashSetView } from '@/dsa/viz/prims';
import { CallTree } from '@/dsa/viz/calltree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './n-queens.py?raw';
import cases from './n-queens.cases.json';

const row = (n: number, c: number) => '.'.repeat(c) + 'Q' + '.'.repeat(n - c - 1);

const viz = vizOf<{ n: number }>({
  id: 'n-queens',
  title: 'N-Queens',
  solution,
  inputs: [{ key: 'n', label: 'n (board size, 1 to 5)', kind: 'number', default: 4 }],
  presets: [
    { label: '4 queens', input: { n: 4 } },
    { label: '1 queen', input: { n: 1 } },
    { label: 'No solution (3)', input: { n: 3 } },
    { label: '5 queens', input: { n: 5 } },
  ],
  validate: ({ n }) => (Number.isInteger(n) && n >= 1 && n <= 5 ? null : 'Use a whole number from 1 to 5 (bigger boards make a very long trace)'),
  run({ n }) {
    const r = new TraceRecorder(solution);
    const queens: number[] = [];
    const cols = new Set<number>();
    const d1 = new Set<number>();
    const d2 = new Set<number>();
    const res: string[][] = [];
    const tree = new CallTree('start');
    let probe: [number, number] | null = null;
    let probeTone: Tone = 'active';
    const view = () => {
      const tones: Record<string, Tone> = {};
      queens.forEach((c, rr) => (tones[`${rr},${c}`] = 'found'));
      if (probe) tones[`${probe[0]},${probe[1]}`] = probeTone;
      return [
        gridView(Array.from({ length: n }, (_, rr) => Array.from({ length: n }, (_, c) => (queens[rr] === c ? 'Q' : ''))), { title: 'board', tones, compact: false }),
        hashSetView([...cols].sort((a, b) => a - b), { title: 'cols taken' }),
        hashSetView([...d1].sort((a, b) => a - b), { title: 'diagonals ↘ taken (row − col)' }),
        hashSetView([...d2].sort((a, b) => a - b), { title: 'diagonals ↙ taken (row + col)' }),
        tree.panel('each level places the queen of one row'),
        chipsView(res.map((b) => b.join('/')), { title: 'solutions' }),
      ];
    };
    r.step('init', `Place ${n} queens on an ${n}×${n} board so none attack each other: one per row, so we place row by row. Three sets remember the columns and the two diagonals already attacked.`, view(), {});
    let askedConflict = false;
    let askedRow = false;
    let askedUndo = false;
    const dfs = (rr: number, id: string) => {
      r.op();
      tree.tone(id, 'active');
      probe = null;
      r.step('def', `dfs(${rr}): place a queen in row ${rr}.`, view(), { row: rr });
      if (rr === n) {
        const board = queens.map((c) => row(n, c));
        res.push(board);
        tree.tone(id, 'found');
        r.step('record', `All ${n} rows have a queen: record the board.`, view(), {});
        return;
      }
      if (!askedRow) {
        askedRow = true;
        r.predict('row', `Why do we only need to loop over columns, not rows?`, ['Each row gets exactly one queen, so the recursion supplies the row', 'Queens may share a row', 'It is faster'], 0, 'Two queens in the same row attack each other, so every row holds exactly one.');
      }
      for (let c = 0; c < n; c++) {
        probe = [rr, c];
        const why = cols.has(c) ? `column ${c} is taken` : d1.has(rr - c) ? `diagonal ↘ ${rr - c} is taken` : d2.has(rr + c) ? `diagonal ↙ ${rr + c} is taken` : '';
        if (why) {
          probeTone = 'compare';
          r.step('conflict', `(${rr}, ${c}): ${why}. Skip.`, view(), {});
          if (!askedConflict) {
            askedConflict = true;
            r.predict('conflict', `Can a queen go on (${rr}, ${c})?`, ['No: it is attacked', 'Yes'], 0, `Attacked because ${why}.`);
          }
          continue;
        }
        probeTone = 'active';
        r.step('place', `(${rr}, ${c}) is safe: place a queen and mark column ${c}, diagonal ${rr - c} and diagonal ${rr + c}.`, view(), {});
        cols.add(c);
        d1.add(rr - c);
        d2.add(rr + c);
        queens.push(c);
        const child = tree.add(id, `[${queens.join(',')}]`, `r${rr}c${c}`);
        probe = null;
        r.step('explore', `Explore row ${rr + 1}.`, view(), {});
        dfs(rr + 1, child);
        queens.pop();
        cols.delete(c);
        d1.delete(rr - c);
        d2.delete(rr + c);
        tree.tone(id, 'active');
        probe = null;
        r.step('undo', `Undo the queen at (${rr}, ${c}): free the column and both diagonals.`, view(), {});
        if (!askedUndo) {
          askedUndo = true;
          r.predict('undo', 'After undoing, which things are freed?', ['The column and both diagonals', 'Only the column', 'Nothing'], 0, 'Everything that the queen blocked must be released so later placements can use those squares.');
        }
      }
      probe = null;
      if (tree.nodes[id].tone !== 'found') tree.tone(id, 'done');
    };
    dfs(0, tree.root);
    r.step('done', res.length ? `${res.length} solution${res.length > 1 ? 's' : ''} found.` : `No arrangement exists for n = ${n}.`, view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ n }) {
    const out: string[][] = [];
    const queens: number[] = [];
    const go = (r: number) => {
      if (r === n) return void out.push(queens.map((c) => row(n, c)));
      for (let c = 0; c < n; c++) {
        if (queens.some((qc, qr) => qc === c || Math.abs(qc - c) === r - qr)) continue;
        queens.push(c);
        go(r + 1);
        queens.pop();
      }
    };
    go(0);
    return out;
  },
});

export default problem({
  summary: 'Place n queens on an n × n chessboard so that no two queens attack each other (no two share a row, a column or a diagonal). Return every distinct arrangement as a list of board rows, using "Q" for a queen and "." for an empty square.',
  example: ['n = 4', '[[".Q..","...Q","Q...","..Q."], ["..Q.","Q...","...Q",".Q.."]]', 'There are exactly two ways to place four queens.'],
  pattern: ['backtracking', ['backtracking', 'dfs', 'dp-2d', 'matrix'], 'Place one queen per row, trying each column, and undo the placement if the rest cannot be completed. The sets of used columns and diagonals make each safety check O(1).', {
    dfs: 'DFS is the traversal; backtracking is the undo of each placement.',
    'dp-2d': 'There is no overlapping sub-problem to cache.',
    matrix: 'The board is a matrix, but the technique is backtracking.',
  }],
  hints: [
    'If every row must hold exactly one queen, what is the only choice you make per row?',
    'How can you test in O(1) whether a square is attacked?',
    'Keep sets for columns, row − col, and row + col. Queens on the same ↘ diagonal share row − col; on the same ↙ diagonal they share row + col.',
  ],
  insight: 'Two queens share a diagonal exactly when row − col or row + col is equal, so three sets are a complete safety check.',
  brute: 'Try every placement of n queens on n² squares and filter: astronomically many.',
  optimal: 'Row-by-row backtracking with column and diagonal sets: roughly O(n!) states, far fewer after pruning.',
  walk: ['Keep queens (the column of each placed row), cols, diag1 (row − col) and diag2 (row + col).', 'dfs(r): if r == n, build the board strings from queens and record it.', 'For c in 0 … n − 1: skip if c, r − c or r + c is already taken.', 'Otherwise add them, append c, dfs(r + 1), and remove them again.'],
  edge: ['n = 1 (one board).', 'n = 2 and n = 3 have no solutions.', 'Forgetting to remove the diagonals when undoing.', 'Building the board strings from queen columns.'],
  works: ['Because rows are filled in order and the sets contain exactly the lines attacked by placed queens, every queen placed is safe.', 'Trying every column in each row finds all solutions.'],
  time: ['O(n!)', 'Row r has at most n − r safe columns.'],
  space: ['O(n)', 'The sets, the queens list and the recursion.'],
  solution,
  cases,
  sig: 'def solve_n_queens(n):\n    # return all boards, each a list of n strings like ".Q.."\n    pass\n',
  viz,
  fromArgs: ([n]) => ({ n }),
});
