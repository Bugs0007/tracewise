import type { Tone } from '@/engine/types';
import { chipsView, gridView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './detect-squares.py?raw';
import harness from './detect-squares.harness.py?raw';
import cases from './detect-squares.cases.json';

const SIZE = 6;
const parse = (line: string): { op: string; x: number; y: number } => {
  const [op, x, y] = line.trim().split(/\s+/);
  return { op, x: Number(x), y: Number(y) };
};

const viz = vizOf<{ ops: string[] }>({
  id: 'detect-squares',
  title: 'Detect Squares',
  solution,
  inputs: [{ key: 'ops', label: 'operations: add x y / count x y (coordinates 0 to 5)', kind: 'strings', default: ['add 1 1', 'add 1 4', 'add 4 1', 'add 4 1', 'count 4 4', 'count 2 2'], maxItems: 12 }],
  presets: [
    { label: 'Duplicate corner', input: { ops: ['add 1 1', 'add 1 4', 'add 4 1', 'add 4 1', 'count 4 4', 'count 2 2'] } },
    { label: 'Unit square', input: { ops: ['add 0 0', 'add 0 1', 'add 1 0', 'count 1 1'] } },
    { label: 'Rectangle, not a square', input: { ops: ['add 0 0', 'add 0 2', 'add 3 0', 'count 3 2'] } },
    { label: 'Same point', input: { ops: ['add 2 2', 'count 2 2'] } },
  ],
  validate: ({ ops }) => {
    for (const line of ops) {
      const { op, x, y } = parse(line);
      if (op !== 'add' && op !== 'count') return `Unknown operation "${op}". Use add x y or count x y`;
      if (![x, y].every((v) => Number.isInteger(v) && v >= 0 && v < SIZE)) return `Coordinates must be whole numbers from 0 to ${SIZE - 1}`;
    }
    return null;
  },
  run({ ops }) {
    const r = new TraceRecorder(solution);
    const points = new Map<string, number>();
    const out: (number | null)[] = [null];
    const tones: Record<string, Tone> = {};
    let askedMul = false;
    let askedSkip = false;
    let askedAdd = false;
    const view = () => [
      gridView(Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => points.get(`${x},${y}`) ?? '·')), { title: 'points (number = copies stored; columns are x, rows are y)', tones, compact: false, colLabels: Array.from({ length: SIZE }, (_, i) => `x${i}`), rowLabels: Array.from({ length: SIZE }, (_, i) => `y${i}`) }),
      chipsView(out.map((v) => (v === null ? 'None' : v)), { title: 'results of each call' }),
    ];
    r.step('init', 'points is a counter: how many copies of each coordinate pair have been added.', view(), {});
    for (const line of ops) {
      const { op, x, y } = parse(line);
      r.op();
      for (const k of Object.keys(tones)) delete tones[k];
      if (op === 'add') {
        points.set(`${x},${y}`, (points.get(`${x},${y}`) ?? 0) + 1);
        tones[`${y},${x}`] = 'active';
        out.push(null);
        if (!askedAdd) {
          askedAdd = true;
          r.step('add', `add(${x}, ${y}): increase its counter to ${points.get(`${x},${y}`)}.`, view(), {});
          r.predict('add', 'The same point can be added more than once. How is that stored?', ['As a count of copies', 'Duplicates are ignored', 'As separate entries'], 0, 'Each copy forms its own squares, so we need the number of copies.');
        } else {
          r.step('add', `add(${x}, ${y}): its counter is now ${points.get(`${x},${y}`)}.`, view(), {});
        }
        continue;
      }
      tones[`${y},${x}`] = 'active';
      r.step('total', `count(${x}, ${y}): look at every stored point as a possible DIAGONAL corner of a square with this point.`, view(), { x, y });
      let total = 0;
      for (const [key, n] of [...points.entries()]) {
        const [px, py] = key.split(',').map(Number);
        if (Math.abs(px - x) !== Math.abs(py - y) || px === x) {
          if (!askedSkip) {
            askedSkip = true;
            r.step('skip', `(${px}, ${py}) is not a diagonal corner: ${px === x ? 'it is directly above or below' : 'its horizontal and vertical distances differ'}.`, view(), {});
            r.predict('skip', `Is (${px}, ${py}) a possible diagonal corner of a square with (${x}, ${y})?`, ['No', 'Yes'], 0, 'On a diagonal the horizontal and vertical distances are equal and non-zero.');
          }
          continue;
        }
        const c1 = points.get(`${x},${py}`) ?? 0;
        const c2 = points.get(`${px},${y}`) ?? 0;
        tones[`${py},${px}`] = 'compare';
        r.step('scan', `(${px}, ${py}) is diagonal to (${x}, ${y}) (${Math.abs(px - x)} apart each way). The other corners are (${x}, ${py}) with ${c1} cop${c1 === 1 ? 'y' : 'ies'} and (${px}, ${y}) with ${c2}.`, view(), {});
        if (!askedMul) {
          askedMul = true;
          r.predictChoice('mul', `Diagonal point has ${n} cop${n === 1 ? 'y' : 'ies'}, the other corners have ${c1} and ${c2}. How many squares does this diagonal give?`, String(n * c1 * c2), [String(n + c1 + c2), String(Math.max(n, c1, c2)), String(n * c1 * c2 + 1)], n + c1, 'Each choice of copies forms a different square, so multiply the counts.');
        }
        total += n * c1 * c2;
        if (c1) tones[`${py},${x}`] = 'found';
        if (c2) tones[`${y},${px}`] = 'found';
        r.step('mul', `Squares through this diagonal: ${n} × ${c1} × ${c2} = ${n * c1 * c2}. Total so far: ${total}.`, view(), { total });
      }
      out.push(total);
      r.step('ret', `count(${x}, ${y}) = ${total}.`, view(), { result: total });
    }
    return { frames: r.frames, result: out };
  },
  reference({ ops }) {
    const pts: [number, number][] = [];
    const out: (number | null)[] = [null];
    for (const line of ops) {
      const { op, x, y } = parse(line);
      if (op === 'add') {
        pts.push([x, y]);
        out.push(null);
      } else {
        let total = 0;
        for (const a of pts) for (const b of pts) for (const c of pts) {
          const d = Math.abs(a[0] - x);
          if (d !== 0 && Math.abs(a[1] - y) === d && b[0] === x && b[1] === a[1] && c[0] === a[0] && c[1] === y) total++;
        }
        out.push(total);
      }
    }
    return out;
  },
});

export default problem({
  summary: 'Design a structure that stores points on a plane (the same point may be added many times) and answers: given a query point, how many ways are there to pick three stored points that, together with the query, form an axis-aligned square with positive area? Different copies of the same point count as different choices.',
  example: ['add (0, 0), (0, 2), (2, 0); count (2, 2)', '1', 'The four corners form a 2 × 2 square. If (2, 0) had been added twice the answer would be 2.'],
  pattern: ['design', ['design', 'hash-lookup', 'math', 'dfs'], 'Store a counter of each point. For a query, every stored point that is diagonal to it (equal distance in x and y, not zero) fixes the other two corners, whose counts are looked up in the hash map and multiplied.', {
    'hash-lookup': 'The counter lookups are the hash part; the problem is a design problem around them.',
    math: 'The geometry (equal distances along the diagonal) is simple coordinate arithmetic.',
    dfs: 'No search tree is needed.',
  }],
  hints: [
    'If you know the query point and the diagonally opposite corner of a square, where are the other two corners?',
    'Which stored points can be a diagonal corner?',
    'Keep a Counter. For each stored point (px, py) with |px − x| == |py − y| and px != x, add count[(px,py)] · count[(x,py)] · count[(px,y)].',
  ],
  insight: 'Fix the diagonal corner and the other two corners are determined, so each query needs only a scan of stored points and constant-time lookups.',
  brute: 'Try all triples of stored points: O(n³) per query.',
  optimal: 'Counter + scan of distinct points: add O(1), count O(distinct points).',
  walk: ['points = Counter(); add increments the count of the point.', 'count(x, y): for each stored (px, py) with n copies.', 'Skip it unless |px − x| == |py − y| and px != x.', 'Add n · points[(x, py)] · points[(px, y)] to the total.'],
  edge: ['Querying a point that is already stored (a zero-size square is not allowed).', 'Duplicates multiply the count.', 'Rectangles that are not squares.', 'Negative coordinates.'],
  works: ['A square with the query as one corner has exactly one diagonally opposite corner; given it, the remaining corners are forced. Multiplying the counts counts every choice of copies once.'],
  time: ['O(P) per count', 'add is O(1); count scans the P distinct stored points.'],
  space: ['O(P)', 'The counter.'],
  solution,
  cases,
  sig: 'class DetectSquares:\n    def __init__(self):\n        pass\n\n    def add(self, point):\n        # point is [x, y]\n        pass\n\n    def count(self, point):\n        # number of axis-aligned squares with positive area that have point as a corner\n        pass\n',
  harness,
  viz,
  fromArgs: ([ops, args]) => ({ ops: (ops as string[]).slice(1).map((o, i) => `${o} ${(args as number[][][])[i + 1][0].join(' ')}`) }),
});
