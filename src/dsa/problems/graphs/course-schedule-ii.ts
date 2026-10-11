import type { EdgeSpec } from '@/engine/layout';
import { kahnTrace } from '@/dsa/viz/kahn';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './course-schedule-ii.py?raw';
import cases from './course-schedule-ii.cases.json';

const e = (from: number, to: number): EdgeSpec => ({ from: String(from), to: String(to) });

const viz = vizOf<{ n: number; edges: EdgeSpec[] }>({
  id: 'course-schedule-ii',
  title: 'Course Schedule II',
  solution,
  inputs: [
    { key: 'n', label: 'number of courses (0 … n−1)', kind: 'number', default: 5 },
    { key: 'edges', label: 'prerequisites as a->b (take a before b)', kind: 'edges', default: [e(0, 1), e(0, 2), e(1, 3), e(2, 3), e(3, 4)], maxItems: 10 },
  ],
  presets: [
    { label: 'Diamond then tail', input: { n: 5, edges: [e(0, 1), e(0, 2), e(1, 3), e(2, 3), e(3, 4)] } },
    { label: 'Chain', input: { n: 4, edges: [e(0, 1), e(1, 2), e(2, 3)] } },
    { label: 'Cycle', input: { n: 3, edges: [e(0, 1), e(1, 2), e(2, 1)] } },
    { label: 'No prerequisites', input: { n: 3, edges: [] } },
  ],
  validate: ({ n, edges }) => {
    if (!Number.isInteger(n) || n < 1 || n > 8) return 'Use 1 to 8 courses';
    return edges.some((x) => !/^\d+$/.test(x.from) || !/^\d+$/.test(x.to) || Number(x.from) >= n || Number(x.to) >= n) ? `Courses are numbered 0 to ${n - 1}` : null;
  },
  run({ n, edges }) {
    const r = new TraceRecorder(solution);
    const { order, ok } = kahnTrace(r, n, edges, 'order');
    return { frames: r.frames, result: ok ? order : [] };
  },
  reference({ n, edges }) {
    const indeg = Array(n).fill(0) as number[];
    const g: number[][] = Array.from({ length: n }, () => []);
    edges.forEach((x) => (g[Number(x.from)].push(Number(x.to)), indeg[Number(x.to)]++));
    const q = indeg.map((d, i) => (d === 0 ? i : -1)).filter((i) => i >= 0);
    const order: number[] = [];
    while (q.length) {
      const c = q.shift() as number;
      order.push(c);
      g[c].forEach((m) => --indeg[m] === 0 && q.push(m));
    }
    return order.length === n ? order : [];
  },
});

export default problem({
  summary: 'Same setting as Course Schedule: n courses and prerequisite pairs [a, b] (take b before a). This time return one valid order in which all courses can be taken, or an empty list if no order exists.',
  example: ['3 courses, pairs [[1, 0], [2, 1]]', '[0, 1, 2]', 'Course 0 has no prerequisite, 1 needs 0, 2 needs 1. If several orders are valid, any one is accepted.'],
  pattern: ['topo-sort', ['topo-sort', 'dfs', 'bfs', 'sorting'], 'A valid order is a topological order of the prerequisite graph. Kahn’s algorithm builds it directly: the order in which courses leave the queue is the answer.', {
    dfs: 'Reverse DFS post-order also gives a topological order; Kahn’s algorithm is the iterative alternative.',
    bfs: 'The queue loop is BFS-like, but the technique is topological sort.',
    sorting: 'You cannot just sort by a number; the order is defined by the graph.',
  }],
  hints: [
    'Think about Course Schedule. What did you track as you took courses?',
    'The order in which courses are taken is exactly the order you want.',
    'Run Kahn’s algorithm and record each course as you pop it. If you recorded all n courses return the list, otherwise return [].',
  ],
  insight: 'The sequence of courses popped from the zero-indegree queue is a valid order; if it is shorter than n, there is a cycle.',
  brute: 'Try all permutations and test each: factorial.',
  optimal: 'Kahn’s algorithm: O(V + E).',
  walk: ['Build graph[pre] and indegree[course].', 'Queue all indegree-0 courses.', 'Pop a course, append it to order, decrement its dependents and queue the ones reaching 0.', 'Return order if it has all n courses, else [].'],
  edge: ['A cycle (return []).', 'Many valid orders.', 'No prerequisites.', 'A single course.'],
  works: ['Each course is appended only after all of its prerequisites were appended, so the order respects every pair.', 'A shorter list means the leftover courses are on or behind a cycle.'],
  time: ['O(V + E)', 'Each course and pair once.'],
  space: ['O(V + E)', 'Graph, queue and order.'],
  solution,
  cases,
  sig: 'def find_order(num_courses, prerequisites):\n    # prerequisites is a list of [course, prerequisite] pairs; return one valid order, or []\n    pass\n',
  viz,
  fromArgs: ([n, pre]) => ({ n, edges: (pre as number[][]).map(([c, p]) => e(p, c)) }),
});
