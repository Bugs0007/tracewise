import { Recorder } from '@/engine/recorder';
import { circleLayout, edgeKey, graphPanel, type EdgeSpec } from '@/engine/layout';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { nodeIds } from '@/content/lib/graphs';

const code = `
def build_matrix(nodes, edges, directed=False):
    idx = {name: i for i, name in enumerate(nodes)}   #@index
    n = len(nodes)
    matrix = [[0] * n for _ in range(n)]              #@init
    for u, v, w in edges:                             #@edge
        i, j = idx[u], idx[v]                         #@lookup
        matrix[i][j] = w                              #@set
        if not directed:                              #@undir
            matrix[j][i] = w                          #@mirror
    return matrix                                     #@done
`;

interface In {
  edges: EdgeSpec[];
  mode: string;
}

const E = (s: string): EdgeSpec[] =>
  s.split(',').map((x) => {
    const m = x.trim().match(/^(\w+)-(\w+)(?::(\d+))?$/)!;
    return m[3] ? { from: m[1], to: m[2], w: Number(m[3]) } : { from: m[1], to: m[2] };
  });

function build(ids: string[], edges: EdgeSpec[], directed: boolean): number[][] {
  const n = ids.length;
  const m = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const e of edges) {
    const i = ids.indexOf(e.from);
    const j = ids.indexOf(e.to);
    m[i][j] = e.w ?? 1;
    if (!directed) m[j][i] = e.w ?? 1;
  }
  return m;
}

const viz: VizDef<In> = {
  id: 'graph-adj-matrix',
  title: 'Adjacency matrix',
  code,
  language: 'python',
  inputs: [
    { key: 'edges', label: 'Edges (A-B or A-B:4 for a weight)', kind: 'edges', default: E('A-B, A-C, B-D, C-D, D-E'), maxItems: 8 },
    { key: 'mode', label: 'Graph type', kind: 'select', default: 'undirected', options: ['undirected', 'directed'] },
  ],
  presets: [
    { label: 'Undirected', input: { edges: E('A-B, A-C, B-D, C-D, D-E'), mode: 'undirected' } },
    { label: 'Directed', input: { edges: E('A-B, A-C, B-D, C-D, D-E'), mode: 'directed' } },
    { label: 'Weighted', input: { edges: E('A-B:4, A-C:2, B-C:1, C-D:7'), mode: 'undirected' } },
    { label: 'Self loop', input: { edges: E('A-A, A-B'), mode: 'undirected' } },
  ],
  run({ edges, mode }) {
    if (!edges.length) throw new Error('Add at least one edge, like A-B');
    const r = new Recorder(code);
    const directed = mode === 'directed';
    const ids = nodeIds(edges);
    const n = ids.length;
    const pos = circleLayout(ids, 300, 240);
    const m = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const added: EdgeSpec[] = [];
    let filled = 0;

    const view = (cur?: EdgeSpec, hot: Record<string, Tone> = {}, showMatrix = true): Panel[] => {
      const tones: Record<string, Tone> = {};
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (m[i][j] !== 0) tones[`${i},${j}`] = 'done';
      Object.assign(tones, hot);
      const nt: Record<string, Tone> = {};
      const et: Record<string, Tone> = {};
      if (cur) {
        nt[cur.from] = 'active';
        nt[cur.to] = 'compare';
        et[edgeKey(cur.from, cur.to, directed)] = 'active';
      }
      return [
        graphPanel(ids, added, pos, directed, { tones: nt, edgeTones: et, title: 'Graph (edges added so far)' }, { width: 300, height: 240 }),
        { type: 'grid', title: 'matrix[row][col] = weight of row → col  (0 = no edge)', cells: showMatrix ? m.map((row) => [...row]) : [[]], tones, rowLabels: ids, colLabels: ids },
        { type: 'kv', title: 'Space', entries: [{ k: 'cells allocated', v: n * n }, { k: 'cells in use', v: filled, tone: 'done' }, { k: 'list entries needed', v: directed ? added.length : added.reduce((s, e) => s + (e.from === e.to ? 1 : 2), 0) }] },
      ];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ n, ...extra });

    r.step('index', `Give every node a row/column number: ${ids.map((id, i) => `${id}=${i}`).join(', ')}`, view(undefined, {}, false), vars());
    r.step('init', `Allocate an ${n} × ${n} matrix of zeros — ${n * n} cells before a single edge exists`, view(), vars());
    for (let k = 0; k < edges.length; k++) {
      const ed = edges[k];
      const { from: u, to: v } = ed;
      const w = ed.w ?? 1;
      const i = ids.indexOf(u);
      const j = ids.indexOf(v);
      r.op();
      added.push(ed);
      r.step('edge', `Edge ${k + 1} of ${edges.length}: ${u}${directed ? ' → ' : ' – '}${v}${ed.w !== undefined ? ` (weight ${w})` : ''}`, view(ed), vars({ u, v, w }));
      r.step('lookup', `Row ${u} = ${i}, column ${v} = ${j}`, view(ed, { [`${i},${j}`]: 'compare' }), vars({ u, v, i, j }));
      if (m[i][j] === 0) filled++;
      m[i][j] = w;
      r.step('set', `matrix[${i}][${j}] = ${w}`, view(ed, { [`${i},${j}`]: 'swap' }), vars({ i, j, w }));
      if (!directed && i !== j) {
        r.step('undir', `Undirected → mirror it: ${v} → ${u} is the same edge`, view(ed, { [`${j},${i}`]: 'compare' }), vars({ i, j, directed }));
        if (m[j][i] === 0) filled++;
        m[j][i] = w;
        r.step('mirror', `matrix[${j}][${i}] = ${w} — the matrix is symmetric`, view(ed, { [`${j},${i}`]: 'swap' }), vars({ i, j, w }));
      } else {
        r.step('undir', directed ? `Directed → leave matrix[${j}][${i}] alone` : `${u} to itself: the mirror cell is the same cell`, view(ed), vars({ i, j, directed }));
      }
    }
    r.step('done', `${filled} of ${n * n} cells used — the matrix always costs ${n * n}`, view(), vars({ filled }));
    return { frames: r.frames, result: m.map((row) => [...row]) };
  },
  reference({ edges, mode }) {
    return build(nodeIds(edges), edges, mode === 'directed');
  },
};

const matrixTests = [
  { args: [3, [[0, 1], [1, 2]], false], expected: [[0, 1, 0], [1, 0, 1], [0, 1, 0]], name: 'undirected is symmetric' },
  { args: [3, [[0, 1], [1, 2]], true], expected: [[0, 1, 0], [0, 0, 1], [0, 0, 0]], name: 'directed is not' },
  { args: [2, [], false], expected: [[0, 0], [0, 0]], name: 'no edges' },
  { args: [1, [[0, 0]], true], expected: [[1]], name: 'self loop' },
  { args: [4, [[0, 3], [3, 2]], true], expected: [[0, 0, 0, 1], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 1, 0]] },
];

const oneBasedTests = [
  { args: [3, [[1, 2], [2, 3]]], expected: [[0, 1, 0], [1, 0, 1], [0, 1, 0]] },
  { args: [2, [[1, 2]]], expected: [[0, 1], [1, 0]] },
  { args: [1, []], expected: [[0]], name: 'single node' },
  { args: [4, [[1, 4]]], expected: [[0, 0, 0, 1], [0, 0, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0]], name: 'uses the last label' },
];

const knows = (rows: string[]) => rows.map((r) => r.split('').map(Number));

const unit: Unit = {
  id: 'graph-adj-matrix',
  hook: 'The matrix is the "dense graph" answer: one array lookup tells you whether an edge exists. Interviewers love asking when you would pick it over a list — and what it costs.',
  predict: {
    prompt: 'A graph has 1,000 nodes but only 1,500 edges. Roughly how many cells does an adjacency **matrix** allocate compared with the number of entries in an adjacency **list** (undirected)?',
    options: ['1,000,000 cells vs about 3,000 entries', '1,500 cells vs 1,500 entries', '3,000 cells vs 1,000,000 entries', 'About the same: both ~ V + E'],
    answer: 0,
    explain: 'The matrix always allocates V × V = 1,000,000 cells no matter how few edges exist. The list stores 2 × 1,500 = 3,000 entries (plus 1,000 list headers).',
  },
  viz,
  deeper: {
    points: [
      'Nodes must map to indices 0..n-1. With names, keep a dict name → index (the first frame of the visualizer).',
      'Undirected graph ⇒ symmetric matrix: matrix[i][j] == matrix[j][i]. Directed graphs usually are not.',
      'Weighted graphs store the weight in the cell. Use None or infinity for "no edge" when 0 is a legal weight.',
      'Edge check is O(1); listing a node\'s neighbours means scanning a whole row, O(V).',
      'Matrix wins on dense graphs and for algorithms that ask "is there an edge?" a lot (Floyd–Warshall); the list wins on sparse graphs.',
    ],
    complexity: { time: 'O(V²) to build/scan, O(1) edge lookup', space: 'O(V²)' },
    pitfalls: ['[[0] * n] * n aliases every row', 'Forgetting to mirror the edge in an undirected graph', 'Using 0 as "no edge" when 0 is a valid weight', 'Labels starting at 1 but indices starting at 0'],
  },
  practice: {
    language: 'python',
    fnName: 'build_matrix',
    statement: 'Nodes are numbered 0..n-1 and `edges` is a list of [u, v] pairs. Return the n × n adjacency matrix with 1 where an edge exists and 0 elsewhere. If `directed` is false the matrix must be symmetric.',
    signature: 'def build_matrix(n, edges, directed):',
    solution: `def build_matrix(n, edges, directed):
    matrix = @@[[0] * n for _ in range(n)]@@
    for u, v in edges:
        matrix[u][v] = @@1@@
        if @@not directed@@:
            matrix[v][u] = @@1@@
    return matrix`,
    tests: matrixTests,
  },
  debug: {
    language: 'python',
    fnName: 'build_matrix',
    statement: 'Towns are labelled 1..n in the input, but this builder crashes or fills the wrong cells. Find and fix the bug.',
    buggy: `def build_matrix(n, edges):
    matrix = [[0] * n for _ in range(n)]
    for a, b in edges:
        matrix[a][b] = 1
        matrix[b][a] = 1
    return matrix`,
    fixed: `def build_matrix(n, edges):
    matrix = [[0] * n for _ in range(n)]
    for a, b in edges:
        matrix[a - 1][b - 1] = 1
        matrix[b - 1][a - 1] = 1
    return matrix`,
    tests: oneBasedTests,
    bugType: 'off-by-one (1-based labels)',
    hint: 'The matrix has rows 0..n-1. What index does label n land on?',
    explanation: 'Labels run 1..n but Python lists are 0-indexed, so label n indexes past the end (IndexError) and every other edge lands one cell off. Subtract 1 when converting a label to an index.',
  },
  boss: {
    title: 'Who is the star?',
    statement: 'In a group of n people, `knows[i][j]` is 1 if person i knows person j (and 0 otherwise; ignore the diagonal). A "star" is someone everybody else knows who knows nobody. Return the index of the star, or -1 if there is none. At most one star can exist.',
    language: 'python',
    fnName: 'find_star',
    starter: `def find_star(knows):
    # your code here
    pass
`,
    solution: `def find_star(knows):
    n = len(knows)
    for p in range(n):
        knows_nobody = all(knows[p][j] == 0 for j in range(n) if j != p)
        known_by_all = all(knows[i][p] == 1 for i in range(n) if i != p)
        if knows_nobody and known_by_all:
            return p
    return -1`,
    tests: [
      { args: [knows(['010', '000', '010'])], expected: 1, name: 'person 1 is the star' },
      { args: [knows(['011', '001', '000'])], expected: 2 },
      { args: [knows(['010', '100', '000'])], expected: -1, name: 'nobody is known by all' },
      { args: [knows(['0'])], expected: 0, name: 'a group of one' },
      { args: [knows(['0110', '0010', '0000', '0010'])], expected: 2, name: 'last row knows the star too' },
      { args: [knows(['0101', '0001', '0100', '0100'])], expected: -1, name: 'everyone is known but each knows someone' },
    ],
    hints: ['A row of the matrix lists who person p knows; a column lists who knows p. Check both for each candidate.', 'For candidate p: every other cell in row p must be 0, and every other cell in column p must be 1. Skip the diagonal.'],
    combines: ['graph-adj-matrix', 'graph-adj-list'],
  },
};

export default unit;
