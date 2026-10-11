import type { Tone } from '@/engine/types';
import { arrayView, gridView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './search-a-2d-matrix.py?raw';
import cases from './search-a-2d-matrix.cases.json';

const viz = vizOf<{ matrix: number[][]; target: number }>({
  id: 'search-a-2d-matrix',
  title: 'Search a 2D Matrix',
  solution,
  inputs: [
    { key: 'matrix', label: 'matrix (rows, each sorted; each row starts above the last row ends)', kind: 'grid', default: [[2, 5, 8], [12, 15, 19], [24, 27, 33], [41, 46, 52]], maxItems: 20 },
    { key: 'target', label: 'target', kind: 'number', default: 27 },
  ],
  presets: [
    { label: 'Found', input: { matrix: [[2, 5, 8], [12, 15, 19], [24, 27, 33], [41, 46, 52]], target: 27 } },
    { label: 'Missing', input: { matrix: [[2, 5, 8], [12, 15, 19], [24, 27, 33], [41, 46, 52]], target: 20 } },
    { label: 'One row', input: { matrix: [[1, 4, 9, 16, 25]], target: 16 } },
  ],
  validate: ({ matrix }) => {
    const flat = matrix.flat();
    return flat.some((v, i) => i && v <= flat[i - 1]) ? 'Read left to right, top to bottom, the numbers must strictly increase' : null;
  },
  run({ matrix, target }) {
    const r = new TraceRecorder(solution);
    if (!matrix.length || !matrix[0].length) {
      r.step('guard', 'The matrix is empty, so there is nothing to search.', [gridView([], { title: 'matrix' })], {});
      r.step('guardRet', 'Return False.', [gridView([], { title: 'matrix' })], { result: false });
      return { frames: r.frames, result: false };
    }
    const rows = matrix.length;
    const cols = matrix[0].length;
    const flat = matrix.flat();
    let lo = 0;
    let hi = rows * cols - 1;
    const view = (mid: number | null, hot: Tone | null = null) => {
      const tones: Record<string, Tone> = {};
      const ftones: Record<number, Tone> = {};
      flat.forEach((_, i) => {
        if (i < lo || i > hi) {
          tones[`${Math.floor(i / cols)},${i % cols}`] = 'muted';
          ftones[i] = 'muted';
        }
      });
      if (mid !== null && hot) {
        tones[`${Math.floor(mid / cols)},${mid % cols}`] = hot;
        ftones[mid] = hot;
      }
      return [
        gridView(matrix, { title: `matrix (target ${target})`, tones }),
        arrayView(flat, { title: 'the same cells as one sorted list (index = row × cols + col)', tones: ftones, pointers: { lo, hi, ...(mid !== null ? { mid } : {}) }, window: lo <= hi ? { from: lo, to: hi, label: 'search space', tone: 'active' } : undefined }),
        hashMapView({ lo, hi, ...(mid !== null ? { mid, row: Math.floor(mid / cols), col: mid % cols } : {}) }, {}),
      ];
    };
    r.step('guard', `A ${rows}×${cols} matrix whose rows continue one another is a single sorted list of ${rows * cols} numbers.`, view(null), {});
    r.step('dims', `rows = ${rows}, cols = ${cols}.`, view(null), { rows, cols });
    r.step('init', `Binary search over the flattened indices 0 to ${hi}.`, view(null), { lo, hi });
    while (lo <= hi) {
      r.op();
      const mid = Math.floor((lo + hi) / 2);
      const row = Math.floor(mid / cols);
      const col = mid % cols;
      r.step('mid', `mid = (${lo} + ${hi}) // 2 = ${mid}.`, view(mid, 'active'), { lo, hi, mid });
      r.predictChoice('cell', `Flat index ${mid} in a matrix with ${cols} columns. Which cell is it?`, `row ${row}, column ${col}`, [`row ${col}, column ${row}`, `row ${row + 1}, column ${col}`, `row ${row}, column ${(col + 1) % cols}`], mid, 'row = mid // cols and column = mid % cols.');
      const val = matrix[row][col];
      r.step('val', `matrix[${row}][${col}] = ${val}.`, view(mid, 'compare'), { row, col, val });
      const kind = val === target ? 'hit' : val < target ? 'right' : 'left';
      r.predict(kind, `${val} versus the target ${target}. What next?`, ['Found it: return True', 'Too small: search the right part', 'Too big: search the left part'], kind === 'hit' ? 0 : kind === 'right' ? 1 : 2, 'Same decision as ordinary binary search, because the flattened cells are sorted.');
      if (val === target) {
        r.step('found', `${val} is the target: return True.`, view(mid, 'found'), { result: true });
        return { frames: r.frames, result: true };
      }
      if (val < target) {
        lo = mid + 1;
        r.step('goRight', `${val} < ${target}: lo = ${lo}.`, view(null), { lo, hi });
      } else {
        hi = mid - 1;
        r.step('goLeft', `${val} > ${target}: hi = ${hi}.`, view(null), { lo, hi });
      }
    }
    r.step('miss', 'The search space is empty: return False.', view(null), { result: false });
    return { frames: r.frames, result: false };
  },
  reference({ matrix, target }) {
    return matrix.some((row) => row.includes(target));
  },
});

export default problem({
  summary: 'A grid of numbers is arranged so that every row is sorted left to right and every row begins with a number larger than the last number of the row above. Decide whether a target value appears anywhere in it.',
  example: ['matrix = [[1, 4, 7], [9, 12, 15]], target = 12', 'true', 'Read row by row the numbers are 1, 4, 7, 9, 12, 15: one sorted list. 12 is in it; 10 would not be.'],
  pattern: ['binary-search', ['binary-search', 'matrix', 'two-pointers', 'hash-lookup'], 'Read row by row, the whole grid is one sorted list. Binary search that list, converting an index to a cell with division and remainder.', {
    matrix: 'It is a matrix problem, but the rows chain into a sorted sequence, so binary search is the tool.',
    'two-pointers': 'Walking from a corner works for matrices that are only row-and-column sorted. Here the stronger ordering allows an O(log) search.',
    'hash-lookup': 'A set of all values would work in O(n) space; the order makes that unnecessary.',
  }],
  hints: [
    'Imagine writing the matrix out row after row. What kind of sequence do you get?',
    'You do not need to build that list. Given an index k in it, how do you find its row and column?',
    'Binary search on indices 0 to rows·cols − 1, reading matrix[mid // cols][mid % cols].',
  ],
  insight: 'The matrix is one sorted list in disguise: binary search on indices and map each index to (mid // cols, mid % cols).',
  brute: 'Scan every cell: O(rows · cols).',
  optimal: 'Binary search over the flattened indices: O(log(rows · cols)) time, O(1) space.',
  walk: ['Handle an empty matrix first.', 'Treat cells as indices 0 .. rows·cols − 1.', 'At each step pick mid, read the cell at row mid // cols and column mid % cols, and compare it with the target.', 'Move lo or hi exactly as in ordinary binary search; if the space empties, return False.'],
  edge: ['Empty matrix (or empty rows).', 'One row or one column.', 'Target is the first or last cell.', 'Target smaller or larger than every value.'],
  works: ['The ordering of the flattened cells matches the index order, so every step of ordinary binary search is valid on them.', 'The index-to-cell formula is a bijection, so no cell is skipped or repeated.'],
  time: ['O(log(m·n))', 'The search space of m·n cells halves each step.'],
  space: ['O(1)', 'Only lo, hi and mid.'],
  solution,
  cases,
  sig: 'def search_matrix(matrix, target):\n    # True if target appears in the matrix (rows sorted, each row begins above the last row ends)\n    pass\n',
  viz,
  fromArgs: ([matrix, target]) => ({ matrix, target }),
});
