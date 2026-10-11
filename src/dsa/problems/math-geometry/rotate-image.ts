import type { Tone } from '@/engine/types';
import { gridView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './rotate-image.py?raw';
import cases from './rotate-image.cases.json';

const viz = vizOf<{ matrix: number[][] }>({
  id: 'rotate-image',
  title: 'Rotate Image',
  solution,
  inputs: [{ key: 'matrix', label: 'square matrix (one row per line)', kind: 'grid', default: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], maxItems: 25 }],
  presets: [
    { label: '3 × 3', input: { matrix: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] } },
    { label: '2 × 2', input: { matrix: [[1, 2], [3, 4]] } },
    { label: '4 × 4', input: { matrix: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]] } },
    { label: '1 × 1', input: { matrix: [[7]] } },
  ],
  validate: ({ matrix }) => (matrix.length !== matrix[0].length ? 'The matrix must be square' : matrix.some((row) => row.some((v) => typeof v !== 'number')) ? 'Use numbers' : null),
  run({ matrix: input }) {
    const r = new TraceRecorder(solution);
    const m = input.map((row) => [...row]);
    const n = m.length;
    let tones: Record<string, Tone> = {};
    let askedSwap = false;
    let askedReverse = false;
    const view = (title: string) => [gridView(m, { title, tones, compact: false })];
    r.step('transposeLoop', 'Rotating 90° clockwise = transpose (swap across the main diagonal), then reverse every row.', view('matrix'), {});
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        r.op();
        tones = { [`${i},${j}`]: 'active', [`${j},${i}`]: 'active' };
        r.step('swap', `Swap m[${i}][${j}] = ${m[i][j]} with m[${j}][${i}] = ${m[j][i]} (mirror images across the diagonal).`, view('transposing'), {});
        if (!askedSwap) {
          askedSwap = true;
          r.predictChoice('swap', `After the swap, what is at row ${i}, column ${j}?`, String(m[j][i]), [String(m[i][j]), String(m[j][j]), String(m[i][i])], i + j, 'The two cells exchange their values.');
        }
        [m[i][j], m[j][i]] = [m[j][i], m[i][j]];
        r.step('swap', `Now m[${i}][${j}] = ${m[i][j]} and m[${j}][${i}] = ${m[j][i]}.`, view('transposing'), {});
      }
    }
    tones = {};
    r.step('reverseLoop', 'The transpose is finished: rows became columns. Now reverse each row.', view('transposed'), {});
    for (let i = 0; i < n; i++) {
      r.op();
      tones = Object.fromEntries(m[i].map((_, c) => [`${i},${c}`, 'active' as Tone]));
      if (!askedReverse) {
        askedReverse = true;
        const rev = [...m[i]].reverse();
        r.predictChoice('reverse', `Row ${i} is [${m[i].join(', ')}]. What is it after reversing?`, `[${rev.join(', ')}]`, [`[${[...m[i]].sort((x, y) => x - y).join(', ')}, 0]`, `[0, ${m[i].join(', ')}]`, `[${rev.join(', ')}, 0]`], i, 'Reading the row backwards finishes the rotation.');
      }
      m[i].reverse();
      r.step('reverse', `Reverse row ${i}: [${m[i].join(', ')}].`, view('reversing rows'), {});
    }
    tones = {};
    r.step('done', 'The matrix is rotated 90° clockwise.', view('rotated'), { result: JSON.stringify(m) });
    return { frames: r.frames, result: m };
  },
  reference({ matrix }) {
    const n = matrix.length;
    return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => matrix[n - 1 - j][i]));
  },
});

export default problem({
  summary: 'Rotate a square grid of numbers 90 degrees clockwise (the first row becomes the last column), and return the rotated grid. Do it by rearranging the cells, without building a second grid if you can.',
  example: ['[[1, 2], [3, 4]]', '[[3, 1], [4, 2]]', 'The left column read upward becomes the top row; the top row becomes the right column.'],
  pattern: ['matrix', ['matrix', 'math', 'simulation', 'two-pointers'], 'A 90° rotation is a transpose followed by reversing each row. Both steps are simple in-place index swaps.', {
    math: 'The index formula rotated[i][j] = m[n−1−j][i] is the math behind it.',
    simulation: 'Moving cells four at a time in a ring is a simulation of the same rotation.',
    'two-pointers': 'The reversal uses two ends, but the matrix idea is transpose + reverse.',
  }],
  hints: [
    'Where does the cell at row i, column j end up after a clockwise rotation?',
    'Can you split the rotation into two simpler moves that are each a reflection?',
    'Swap m[i][j] with m[j][i] for j > i (transpose), then reverse every row.',
  ],
  insight: 'Transpose then mirror left-to-right is exactly a clockwise quarter turn.',
  brute: 'Build a new grid with new[i][j] = old[n − 1 − j][i]: O(n²) time and space.',
  optimal: 'Transpose and reverse rows in place: O(n²) time, O(1) extra space.',
  walk: ['For i < j swap m[i][j] with m[j][i].', 'Reverse every row.', 'Return the matrix.'],
  edge: ['1 × 1 matrix.', 'Even and odd sizes.', 'Swapping each pair twice would undo the transpose (use j > i).'],
  works: ['Transpose sends (i, j) to (j, i); reversing a row sends column j to n − 1 − j; together (i, j) goes to (j, n − 1 − i), which is the clockwise rotation.'],
  time: ['O(n²)', 'Each cell is touched a constant number of times.'],
  space: ['O(1)', 'In place.'],
  solution,
  cases,
  sig: 'def rotate(matrix):\n    # rotate the square matrix 90° clockwise and return it\n    pass\n',
  viz,
  fromArgs: ([matrix]) => ({ matrix }),
});
