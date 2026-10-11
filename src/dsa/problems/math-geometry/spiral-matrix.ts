import type { Tone } from '@/engine/types';
import { chipsView, gridView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './spiral-matrix.py?raw';
import cases from './spiral-matrix.cases.json';

const viz = vizOf<{ matrix: number[][] }>({
  id: 'spiral-matrix',
  title: 'Spiral Matrix',
  solution,
  inputs: [{ key: 'matrix', label: 'matrix (one row per line)', kind: 'grid', default: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]], maxItems: 30 }],
  presets: [
    { label: '3 × 4', input: { matrix: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]] } },
    { label: '3 × 3', input: { matrix: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] } },
    { label: 'One row', input: { matrix: [[1, 2, 3, 4, 5]] } },
    { label: 'Tall', input: { matrix: [[1, 2], [3, 4], [5, 6], [7, 8]] } },
  ],
  validate: ({ matrix }) => (matrix.some((row) => row.some((v) => typeof v !== 'number')) ? 'Use numbers' : null),
  run({ matrix }) {
    const r = new TraceRecorder(solution);
    const out: number[] = [];
    const tones: Record<string, Tone> = {};
    let top = 0;
    let bottom = matrix.length - 1;
    let left = 0;
    let right = matrix[0].length - 1;
    let askedCheck = false;
    let askedShrink = false;
    const view = () => [gridView(matrix, { title: 'matrix (teal = already visited)', tones, compact: false }), chipsView(out, { title: 'spiral order so far' }), hashMapView({ top, bottom, left, right }, { title: 'the unvisited rectangle' })];
    const visit = (a: number, b: number) => {
      out.push(matrix[a][b]);
      tones[`${a},${b}`] = 'done';
    };
    r.step('bounds', 'Keep the rectangle of unvisited cells with four boundaries. Peel off its top row, right column, bottom row and left column in turn, shrinking the rectangle each time.', view(), {});
    while (top <= bottom && left <= right) {
      r.op();
      for (let c = left; c <= right; c++) visit(top, c);
      top++;
      r.step('topRow', `Walk the top row left → right. The top boundary moves down to ${top}.`, view(), {});
      if (!askedShrink) {
        askedShrink = true;
        r.predict('shrink', 'After taking the top row, which boundary changes?', ['top moves down by one', 'bottom moves up', 'Nothing'], 0, 'That row is used up, so the rectangle starts one row lower.');
      }
      for (let a = top; a <= bottom; a++) visit(a, right);
      right--;
      r.step('rightCol', `Walk the right column downward. right moves left to ${right}.`, view(), {});
      if (top <= bottom) {
        if (!askedCheck) {
          askedCheck = true;
          r.predict('bottomCheck', 'Why is the bottom row only walked if top ≤ bottom?', ['Otherwise a single remaining row would be read twice', 'To save time', 'It is a typo'], 0, 'If the top row was the last row, the bottom row is the same row that was just visited.');
        }
        for (let c = right; c >= left; c--) visit(bottom, c);
        bottom--;
        r.step('bottomRow', `Walk the bottom row right → left. bottom moves up to ${bottom}.`, view(), {});
      }
      if (left <= right) {
        for (let a = bottom; a >= top; a--) visit(a, left);
        left++;
        r.step('leftCol', `Walk the left column upward. left moves right to ${left}.`, view(), {});
      }
    }
    r.step('done', `All ${out.length} cells are visited in spiral order.`, view(), { result: JSON.stringify(out) });
    return { frames: r.frames, result: out };
  },
  reference({ matrix }) {
    const m = matrix.map((row) => [...row]);
    const out: number[] = [];
    while (m.length) {
      out.push(...(m.shift() as number[]));
      const rows = m.length;
      const cols = m[0]?.length ?? 0;
      const next = Array.from({ length: cols }, (_, c) => Array.from({ length: rows }, (_, a) => m[a][cols - 1 - c]));
      m.length = 0;
      m.push(...next);
    }
    return out;
  },
});

export default problem({
  summary: 'Return all numbers of a rectangular grid in spiral order: start at the top-left, go right along the top row, down the right column, left along the bottom row, up the left column, and keep spiralling inward.',
  example: ['[[1, 2], [3, 4], [5, 6]]', '[1, 2, 4, 6, 5, 3]', 'Right along the top (1, 2), down the right side (4, 6), back left along the bottom (5), up the left side (3).'],
  pattern: ['matrix', ['matrix', 'simulation', 'math', 'two-pointers'], 'Maintain the four boundaries of the unvisited rectangle and peel one side at a time. The only care needed is to stop when the rectangle degenerates to a row or a column.', {
    simulation: 'It is a simulation, and the matrix pattern names the boundary technique.',
    math: 'No formula is needed.',
    'two-pointers': 'The boundaries move toward each other, but the matrix pattern is the point.',
  }],
  hints: [
    'What shape remains after you take the top row?',
    'Keep four numbers: top, bottom, left, right. What happens to each after you finish a side?',
    'After the top row and right column, only take the bottom row if top <= bottom, and the left column if left <= right.',
  ],
  insight: 'Four shrinking boundaries describe the unvisited rectangle at every moment.',
  brute: 'Take the first row, rotate the rest, repeat: O(R·C) but with copying.',
  optimal: 'Boundary walk: O(R · C) time, O(1) extra space.',
  walk: ['top, bottom, left, right = 0, R − 1, 0, C − 1.', 'While top <= bottom and left <= right: walk the top row, then the right column.', 'If top <= bottom walk the bottom row; if left <= right walk the left column.', 'Shrink the boundaries after each side.'],
  edge: ['A single row or column.', 'A square with an odd size (the centre cell).', 'Tall and wide grids.'],
  works: ['Each iteration removes the outer ring of the rectangle; the two guards prevent revisiting a row or column in the last, thin ring.'],
  time: ['O(R · C)', 'Every cell once.'],
  space: ['O(1)', 'Besides the output.'],
  solution,
  cases,
  sig: 'def spiral_order(matrix):\n    # return the elements in spiral order, starting at the top-left and going right\n    pass\n',
  viz,
  fromArgs: ([matrix]) => ({ matrix }),
});
