import type { Tone } from '@/engine/types';
import { gridView, hashSetView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './set-matrix-zeroes.py?raw';
import cases from './set-matrix-zeroes.cases.json';

const viz = vizOf<{ matrix: number[][] }>({
  id: 'set-matrix-zeroes',
  title: 'Set Matrix Zeroes',
  solution,
  inputs: [{ key: 'matrix', label: 'matrix (one row per line)', kind: 'grid', default: [[1, 2, 3, 4], [5, 0, 7, 8], [9, 10, 11, 0]], maxItems: 30 }],
  presets: [
    { label: 'Two zeros', input: { matrix: [[1, 2, 3, 4], [5, 0, 7, 8], [9, 10, 11, 0]] } },
    { label: 'No zeros', input: { matrix: [[1, 2], [3, 4]] } },
    { label: 'Corner zero', input: { matrix: [[0, 1], [2, 3]] } },
    { label: 'All zero', input: { matrix: [[0, 0], [0, 0]] } },
  ],
  validate: ({ matrix }) => (matrix.some((row) => row.some((v) => typeof v !== 'number')) ? 'Use numbers' : null),
  run({ matrix: input }) {
    const r = new TraceRecorder(solution);
    const m = input.map((row) => [...row]);
    const rows = m.length;
    const cols = m[0].length;
    const zr = new Set<number>();
    const zc = new Set<number>();
    const tones: Record<string, Tone> = {};
    let askedTwo = false;
    let askedZero = false;
    const view = () => [gridView(m, { title: 'matrix', tones, compact: false }), hashSetView([...zr].sort((a, b) => a - b), { title: 'rows to clear' }), hashSetView([...zc].sort((a, b) => a - b), { title: 'columns to clear' })];
    r.step('findRows', 'First pass: only LOOK. Record which rows and columns contain a zero. We must not write any zeros yet, or they would be mistaken for original zeros.', view(), {});
    for (let a = 0; a < rows; a++) for (let c = 0; c < cols; c++) if (m[a][c] === 0) { zr.add(a); zc.add(c); tones[`${a},${c}`] = 'compare'; }
    if (!askedTwo) {
      askedTwo = true;
      r.predict('findCols', 'Why do we collect the zero rows and columns first instead of zeroing as we go?', ['New zeros would be mistaken for original zeros and spread too far', 'It is faster', 'Python requires it'], 0, 'A zero we wrote ourselves would trigger its own row and column, clearing far more than intended.');
    }
    r.step('findCols', `Rows with a zero: ${[...zr].sort((a, b) => a - b).join(', ') || 'none'}. Columns with a zero: ${[...zc].sort((a, b) => a - b).join(', ') || 'none'}.`, view(), {});
    for (let a = 0; a < rows; a++) {
      r.op();
      for (let c = 0; c < cols; c++) {
        if (zr.has(a) || zc.has(c)) {
          if (!askedZero && m[a][c] !== 0) {
            askedZero = true;
            r.step('check', `Cell (${a}, ${c}) = ${m[a][c]} is in ${zr.has(a) ? `row ${a}` : `column ${c}`}, which contains an original zero.`, view(), {});
            r.predict('zero', `Cell (${a}, ${c}) lies in a row or column that must be cleared. What happens to it?`, ['It becomes 0', 'It stays', 'It is doubled'], 0, 'Any cell in a cleared row or column becomes 0.');
          }
          m[a][c] = 0;
          tones[`${a},${c}`] = 'active';
        }
      }
      r.step('apply', `Row ${a} done.`, view(), {});
    }
    r.step('done', 'Every cell in a row or column that held a zero is now zero.', view(), { result: JSON.stringify(m) });
    return { frames: r.frames, result: m };
  },
  reference({ matrix }) {
    return matrix.map((row) => row.map((v, c) => (row.includes(0) || matrix.some((x) => x[c] === 0) ? 0 : v)));
  },
});

export default problem({
  summary: 'If a cell of a grid contains a 0, set its entire row and its entire column to 0. Do this for all original zeros at once and return the grid.',
  example: ['[[1, 2], [0, 3]]', '[[0, 2], [0, 0]]', 'The zero is in row 1 and column 0, so both are cleared.'],
  pattern: ['matrix', ['matrix', 'hash-lookup', 'simulation', 'two-pointers'], 'First find which rows and columns need clearing (remember them in two sets), then clear them in a second pass. Doing it in one pass would let new zeros spread.', {
    'hash-lookup': 'The two sets are helpers, the pattern is the two-pass grid technique.',
    simulation: 'A direct simulation also works, with the two-pass care.',
    'two-pointers': 'Nothing converges here.',
  }],
  hints: [
    'What goes wrong if you zero a row the moment you see a zero?',
    'Separate "find" from "change". What do you need to remember between the two passes?',
    'Collect zero_rows and zero_cols from the original grid. Then set every cell whose row or column is in those sets to 0.',
  ],
  insight: 'Decide using the ORIGINAL grid, then change; the two sets are the memory between the passes.',
  brute: 'For every cell, scan its row and column for a zero: O(R · C · (R + C)).',
  optimal: 'Two sets + two passes: O(R · C) time, O(R + C) space (O(1) is possible by using the first row and column as markers).',
  walk: ['Find zero_rows and zero_cols by scanning the grid.', 'Scan again: set matrix[r][c] = 0 if r in zero_rows or c in zero_cols.', 'Return the grid.'],
  edge: ['No zeros.', 'A zero in a corner.', 'All zeros.', 'Single row or column.'],
  works: ['A cell must be zero exactly when its row or column held an original zero, which the sets record.'],
  time: ['O(R · C)', 'Two passes.'],
  space: ['O(R + C)', 'The two sets.'],
  solution,
  cases,
  sig: 'def set_zeroes(matrix):\n    # set the whole row and column of every original 0 to 0 and return the matrix\n    pass\n',
  viz,
  fromArgs: ([matrix]) => ({ matrix }),
});
