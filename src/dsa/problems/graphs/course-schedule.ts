import type { EdgeSpec } from '@/engine/layout';
import { kahnTrace } from '@/dsa/viz/kahn';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './course-schedule.py?raw';
import cases from './course-schedule.cases.json';

const e = (from: number, to: number): EdgeSpec => ({ from: String(from), to: String(to) });

const viz = vizOf<{ n: number; edges: EdgeSpec[] }>({
  id: 'course-schedule',
  title: 'Course Schedule',
  solution,
  inputs: [
    { key: 'n', label: 'number of courses (0 … n−1)', kind: 'number', default: 5 },
    { key: 'edges', label: 'prerequisites as a->b (take a before b)', kind: 'edges', default: [e(0, 1), e(1, 2), e(2, 1), e(2, 3), e(0, 4)], maxItems: 10 },
  ],
  presets: [
    { label: 'Has a cycle', input: { n: 5, edges: [e(0, 1), e(1, 2), e(2, 1), e(2, 3), e(0, 4)] } },
    { label: 'No cycle', input: { n: 5, edges: [e(0, 1), e(0, 2), e(1, 3), e(2, 3), e(3, 4)] } },
    { label: 'No prerequisites', input: { n: 3, edges: [] } },
    { label: 'Self loop', input: { n: 2, edges: [e(0, 0)] } },
  ],
  validate: ({ n, edges }) => {
    if (!Number.isInteger(n) || n < 1 || n > 8) return 'Use 1 to 8 courses';
    return edges.some((x) => !/^\d+$/.test(x.from) || !/^\d+$/.test(x.to) || Number(x.from) >= n || Number(x.to) >= n) ? `Courses are numbered 0 to ${n - 1}` : null;
  },
  run({ n, edges }) {
    const r = new TraceRecorder(solution);
    const { ok } = kahnTrace(r, n, edges, 'can');
    return { frames: r.frames, result: ok };
  },
  reference({ n, edges }) {
    const indeg = Array(n).fill(0) as number[];
    const g: number[][] = Array.from({ length: n }, () => []);
    edges.forEach((x) => (g[Number(x.from)].push(Number(x.to)), indeg[Number(x.to)]++));
    const q = indeg.map((d, i) => (d === 0 ? i : -1)).filter((i) => i >= 0);
    let taken = 0;
    while (q.length) {
      const c = q.shift() as number;
      taken++;
      g[c].forEach((m) => --indeg[m] === 0 && q.push(m));
    }
    return taken === n;
  },
});

export default problem({
  summary: 'You must take n courses numbered 0 to n − 1. Some come with prerequisites: a pair [a, b] means you need to finish course b before course a. Decide whether it is possible to finish all courses.',
  example: ['2 courses, pairs [[1, 0]]', 'true', 'Take 0, then 1. With pairs [[1, 0], [0, 1]] each would wait for the other, so the answer would be false.'],
  pattern: ['topo-sort', ['topo-sort', 'dfs', 'bfs', 'union-find'], 'Prerequisites form a directed graph. All courses can be finished exactly when the graph has no cycle, and a topological sort (repeatedly taking courses with no unmet prerequisites) detects that.', {
    dfs: 'DFS cycle detection with three colours also works; Kahn’s algorithm is the BFS-style topological sort.',
    bfs: 'The queue-based topological sort uses a BFS-like loop, but the technique is called topological sort.',
    'union-find': 'Union-find handles undirected cycles, not directed ones.',
  }],
  hints: [
    'When can a course be taken? Draw the graph for a small example.',
    'What does it mean for the courses on a cycle?',
    'Count unmet prerequisites (indegree). Repeatedly take any course with 0, and decrement its dependents. If you take all n, answer True.',
  ],
  insight: 'A course can be taken when its indegree reaches zero; courses on a cycle never reach zero.',
  brute: 'Try every ordering of the courses and test it: factorial.',
  optimal: 'Kahn’s algorithm: O(V + E) time and space.',
  walk: ['Build graph[pre] = list of courses and indegree[course] from the pairs.', 'Queue every course with indegree 0.', 'Pop a course, count it as taken, decrement each dependent’s indegree, and queue those that reach 0.', 'Return taken == num_courses.'],
  edge: ['No prerequisites.', 'A course that requires itself.', 'A cycle among a few courses with others fine.', 'Duplicate pairs.'],
  works: ['A course is queued only when all its prerequisites have been taken, so every taken course has a valid position in some order.', 'If a cycle exists, its courses can never get indegree 0, so taken < n.'],
  time: ['O(V + E)', 'Each course and each pair is processed once.'],
  space: ['O(V + E)', 'The graph and queue.'],
  solution,
  cases,
  sig: 'def can_finish(num_courses, prerequisites):\n    # prerequisites is a list of [course, prerequisite] pairs; return True if every course can be finished\n    pass\n',
  viz,
  fromArgs: ([n, pre]) => ({ n, edges: (pre as number[][]).map(([c, p]) => e(p, c)) }),
});
