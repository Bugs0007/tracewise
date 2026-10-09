import { Recorder } from '@/engine/recorder';
import type { GraphPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, kvPanel, r2 } from '@/content/lib/ai-finish-1';

const code = `
def exact_search(points, q, k):
    ranked = sorted(points, key=lambda p: dist(q, p))          #@scan
    return ranked[:k]                                           #@topk

def ivf_search(centroids, buckets, q, k, nprobe):
    order = sorted(range(len(centroids)),
                   key=lambda c: dist(q, centroids[c]))        #@rank
    cand = []
    for c in order[:nprobe]:                                    #@probe
        cand += buckets[c]                                      #@gather
    return sorted(cand, key=lambda p: dist(q, p))[:k]           #@rescore
`;

interface Pt {
  id: number;
  x: number;
  y: number;
}

// 30 deterministic points scattered over a 400 x 400 map
function makePoints(): Pt[] {
  const pts: Pt[] = [];
  let s = 7;
  const next = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  for (let i = 1; i <= 30; i++) pts.push({ id: i, x: Math.round(20 + next() * 360), y: Math.round(20 + next() * 360) });
  return pts;
}

const POINTS = makePoints();
const CENTROIDS = [
  { x: 90, y: 90 },
  { x: 310, y: 90 },
  { x: 200, y: 200 },
  { x: 90, y: 310 },
  { x: 310, y: 310 },
];
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

const BUCKETS: Pt[][] = CENTROIDS.map(() => []);
for (const p of POINTS) {
  let best = 0;
  CENTROIDS.forEach((c, i) => {
    if (dist(p, c) < dist(p, CENTROIDS[best])) best = i;
  });
  BUCKETS[best].push(p);
}

interface In {
  x: number;
  y: number;
  k: number;
  nprobe: number;
}

function setup(i: In) {
  if (!(i.x >= 0 && i.x <= 400 && i.y >= 0 && i.y <= 400)) throw new Error('Query x and y must be between 0 and 400');
  if (!Number.isInteger(i.k) || i.k < 1 || i.k > 10) throw new Error('k must be a whole number from 1 to 10');
  if (!Number.isInteger(i.nprobe) || i.nprobe < 1 || i.nprobe > CENTROIDS.length) throw new Error(`nprobe must be a whole number from 1 to ${CENTROIDS.length}`);
  return { q: { x: i.x, y: i.y }, k: i.k, nprobe: i.nprobe };
}

const byDist = (q: { x: number; y: number }) => (a: Pt, b: Pt) => dist(q, a) - dist(q, b) || a.id - b.id;

const viz: VizDef<In> = {
  id: 'rag-vector-search',
  title: 'Brute force vs bucketed (IVF) search',
  code,
  language: 'python',
  inputs: [
    { key: 'x', label: 'Query x (0-400)', kind: 'number', default: 152 },
    { key: 'y', label: 'Query y (0-400)', kind: 'number', default: 140 },
    { key: 'k', label: 'Top k', kind: 'number', default: 5 },
    { key: 'nprobe', label: 'Buckets to probe (nprobe)', kind: 'number', default: 1 },
  ],
  presets: [
    { label: 'Deep inside a bucket', input: { x: 70, y: 80, k: 3, nprobe: 1 } },
    { label: 'Near a bucket border (misses)', input: { x: 152, y: 140, k: 5, nprobe: 1 } },
    { label: 'Probe 2 buckets: recall recovers', input: { x: 152, y: 140, k: 5, nprobe: 2 } },
    { label: 'Probe all = exact', input: { x: 152, y: 140, k: 5, nprobe: 5 } },
  ],
  run(input) {
    const { q, k, nprobe } = setup(input);
    const r = new Recorder(code);
    const exact = [...POINTS].sort(byDist(q)).slice(0, k);
    const exactIds = new Set(exact.map((p) => p.id));
    const order = CENTROIDS.map((c, i) => ({ i, d: dist(q, c) })).sort((a, b) => a.d - b.d || a.i - b.i);
    const probed = order.slice(0, nprobe).map((o) => o.i);

    const map = (opts: { cand?: Set<number>; top?: Set<number>; missed?: Set<number>; probedNow?: number[]; showCentroids?: boolean }): GraphPanel => {
      const nodes: GraphPanel['nodes'] = POINTS.map((p) => {
        let tone: Tone = 'muted';
        if (opts.cand?.has(p.id)) tone = 'frontier';
        if (opts.top?.has(p.id)) tone = 'found';
        if (opts.missed?.has(p.id)) tone = 'error';
        return { id: 'p' + p.id, label: String(p.id), x: p.x, y: p.y, shape: 'circle', tone };
      });
      if (opts.showCentroids)
        CENTROIDS.forEach((c, i) =>
          nodes.push({ id: 'c' + i, label: 'C' + i, x: c.x, y: c.y, shape: 'rect', w: 28, h: 22, tone: opts.probedNow?.includes(i) ? 'active' : 'default', badge: String(BUCKETS[i].length) }),
        );
      nodes.push({ id: 'Q', label: 'Q', x: q.x, y: q.y, shape: 'rect', w: 26, h: 22, tone: 'path' });
      return { type: 'graph', title: 'Embedding space (schematic 2-D map)', nodes, edges: [], width: 400, height: 400, axes: true };
    };
    const ids = (ps: Pt[]) => ps.map((p) => p.id).join(' ');

    r.step('scan', `${POINTS.length} vectors in the index; find the ${k} nearest to Q`, [map({ showCentroids: true }), kvPanel('Index', { vectors: POINTS.length, buckets: CENTROIDS.length, k })], { N: POINTS.length, k });
    r.op(POINTS.length);
    r.step('topk', `Brute force: measure all ${POINTS.length} distances, keep the ${k} smallest: ${ids(exact)}`, [map({ top: exactIds }), kvPanel('Exact result', { 'distances computed': POINTS.length, nearest: ids(exact) }, { nearest: 'found' })], { scanned: POINTS.length });

    r.op(CENTROIDS.length);
    r.step('rank', `Approximate: compare Q with ${CENTROIDS.length} bucket centres first; nearest is C${order[0].i}`, [map({ showCentroids: true, probedNow: [order[0].i] }), kvPanel('Distance to centres', Object.fromEntries(order.map((o) => ['C' + o.i, r2(o.d)])), { ['C' + order[0].i]: 'new' })], { nprobe });

    const cand: Pt[] = [];
    probed.forEach((c, step) => {
      cand.push(...BUCKETS[c]);
      r.op(BUCKETS[c].length);
      r.step('gather', `Probe C${c}: add its ${BUCKETS[c].length} vectors (${cand.length} candidates so far)`, [map({ showCentroids: true, probedNow: probed.slice(0, step + 1), cand: new Set(cand.map((p) => p.id)) }), kvPanel('Candidates', { probed: probed.slice(0, step + 1).map((i) => 'C' + i).join(' '), 'candidate vectors': cand.length, 'out of': POINTS.length })], { probed: step + 1, candidates: cand.length });
    });
    const approx = [...cand].sort(byDist(q)).slice(0, k);
    const approxIds = new Set(approx.map((p) => p.id));
    const hits = approx.filter((p) => exactIds.has(p.id)).length;
    const missed = new Set(exact.filter((p) => !approxIds.has(p.id)).map((p) => p.id));
    const recall = r2(hits / k);
    r.step('rescore', `Rank only the ${cand.length} candidates: approximate top ${k} = ${ids(approx) || 'none'}`, [map({ cand: new Set(cand.map((p) => p.id)), top: approxIds, missed })], { returned: ids(approx) });
    const panels: Panel[] = [
      map({ top: approxIds, missed }),
      kvPanel('Cost and quality', { 'brute force scanned': POINTS.length, 'bucketed scanned': cand.length + CENTROIDS.length, [`recall@${k}`]: recall, 'true neighbours missed': missed.size ? [...missed].join(' ') : 'none' }, { [`recall@${k}`]: recall === 1 ? 'found' : 'error' }),
    ];
    r.step('rescore', recall === 1 ? `Same answer, scanning ${cand.length + CENTROIDS.length} instead of ${POINTS.length}` : `Recall ${recall}: missed neighbours ${[...missed].join(', ')} sit in unprobed buckets`, panels, { recall });
    return { frames: r.frames, result: { exact: exact.map((p) => p.id), approx: approx.map((p) => p.id), candidates: cand.length, recall } };
  },
  reference(input) {
    const { q, k, nprobe } = setup(input);
    const exact = POINTS.slice().sort((a, b) => dist(q, a) - dist(q, b) || a.id - b.id).slice(0, k);
    const near = CENTROIDS.map((c, i) => [dist(q, c), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, nprobe).map((x) => x[1]);
    const cand = POINTS.filter((p) => {
      let best = 0;
      CENTROIDS.forEach((c, i) => {
        if (dist(p, c) < dist(p, CENTROIDS[best])) best = i;
      });
      return near.includes(best);
    });
    const approx = cand.slice().sort((a, b) => dist(q, a) - dist(q, b) || a.id - b.id).slice(0, k);
    const hits = approx.filter((p) => exact.some((e) => e.id === p.id)).length;
    return { exact: exact.map((p) => p.id), approx: approx.map((p) => p.id), candidates: cand.length, recall: r2(hits / k) };
  },
};

const I1 = [{ id: 'a', vec: [1, 0] }, { id: 'b', vec: [0, 1] }, { id: 'c', vec: [1, 1] }, { id: 'd', vec: [-1, 0] }];
const I2 = [{ id: 'big', vec: [10, 0] }, { id: 'near', vec: [1, 0.9] }, { id: 'far', vec: [-1, 2] }];
const I3 = [{ id: 'z', vec: [0, 0] }, { id: 'y', vec: [1, 2] }];

const tests = [
  { args: [I1, [1, 0.2], 2], expected: ['a', 'c'], name: 'two nearest by angle' },
  { args: [I2, [1, 1], 2], expected: ['near', 'big'], name: 'magnitude must not matter' },
  { args: [I3, [1, 2], 5], expected: ['y', 'z'], name: 'k larger than the index; zero vector scores 0' },
  { args: [[], [1, 0], 3], expected: [], name: 'empty index' },
  { args: [I1, [1, 0.2], 0], expected: [], name: 'k = 0' },
];

const C3 = [[1, 0], [0, 1], [-1, 0]];
const B3 = [
  [{ id: 'a1', vec: [1, 0.1] }, { id: 'a2', vec: [1, -0.3] }, { id: 'a3', vec: [2, 1] }],
  [{ id: 'b1', vec: [0.2, 1] }, { id: 'b2', vec: [-0.5, 2] }],
  [{ id: 'c1', vec: [-1, 0.2] }, { id: 'c2', vec: [-3, -1] }, { id: 'c3', vec: [-1, 1] }],
];

const unit: Unit = {
  id: 'rag-vector-search',
  hook: 'Exact vector search touches every vector; production systems cheat with buckets or graphs and accept a little lost recall. Explaining that trade-off with numbers is a staple of RAG and system-design interviews.',
  predict: {
    prompt: 'A query lies right at the border between two buckets of an IVF index, and you probe only the nearest bucket (nprobe = 1). What is the likely consequence?',
    options: ['Nothing: the nearest bucket always holds the true nearest neighbours', 'Some true neighbours live in the other bucket and are never examined, so recall drops', 'The search becomes slower than brute force', 'The query is rejected'],
    answer: 1,
    explain: 'Buckets are a coarse partition. A border query has neighbours on both sides, and unprobed buckets are skipped entirely. Increasing nprobe recovers recall at the cost of scanning more candidates.',
  },
  viz,
  deeper: {
    points: [
      'Brute force (flat) search compares the query with every stored vector: exact, O(n × d), perfectly fine up to roughly 100k vectors.',
      'IVF-style indexes cluster vectors into buckets around centroids. A query is compared with the centroids first, then only the vectors of the nprobe nearest buckets.',
      'nprobe is the knob: more buckets means more candidates, higher recall, higher latency. nprobe = number of buckets degenerates to brute force.',
      'Recall@k measures how many of the true k nearest neighbours the approximate search returned. Always measure it against an exact baseline on your own data.',
      'Graph indexes (HNSW) and quantisation offer other speed/recall/memory trade-offs; the evaluation method is the same.',
    ],
    complexity: { time: 'exact O(n × d); IVF O((c + n × nprobe / c) × d)', space: 'O(n × d) plus centroids' },
    pitfalls: ['Reporting speed without recall', 'Probing one bucket for queries near a border', 'Comparing raw dot products of unnormalised vectors', 'Returning fewer than k results when the probed buckets are small'],
  },
  practice: {
    language: 'python',
    fnName: 'search',
    statement: 'Implement brute-force `search(index, query, k)`. `index` is a list of {"id","vec"}. Rank rows by cosine similarity to `query` (a zero vector scores 0), break ties by id, and return the ids of the top `k`.',
    signature: 'def search(index, query, k):',
    solution: `import math

def search(index, query, k):
    def cos(a, b):
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(x * x for x in b))
        if na == 0 or nb == 0:
            return 0.0
        return @@sum(x * y for x, y in zip(a, b)) / (na * nb)@@

    scored = [(cos(query, r["vec"]), r["id"]) for r in index]
    scored.sort(key=lambda t: (@@-t[0]@@, t[1]))
    return [doc_id for _, doc_id in @@scored[:k]@@]`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'search',
    statement: 'Search returns documents with large vectors first, even when their direction is a poor match. Find the bug.',
    buggy: `import math

def search(index, query, k):
    def score(a, b):
        return sum(x * y for x, y in zip(a, b))

    scored = [(score(query, r["vec"]), r["id"]) for r in index]
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [doc_id for _, doc_id in scored[:k]]`,
    fixed: `import math

def search(index, query, k):
    def score(a, b):
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(x * x for x in b))
        if na == 0 or nb == 0:
            return 0.0
        return sum(x * y for x, y in zip(a, b)) / (na * nb)

    scored = [(score(query, r["vec"]), r["id"]) for r in index]
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [doc_id for _, doc_id in scored[:k]]`,
    tests,
    bugType: 'dot product instead of cosine',
    hint: 'Two vectors point in the same direction but one is ten times longer. Should they score the same?',
    explanation: 'A raw dot product grows with vector length, so unnormalised long vectors dominate every query. Cosine divides by both norms, comparing only direction. (Normalising vectors up front makes the dot product equal to cosine.)',
  },
  boss: {
    title: 'Bucketed (IVF-style) search',
    statement:
      'Implement `bucket_search(centroids, buckets, query, k, nprobe)`. `centroids[i]` is a vector and `buckets[i]` the list of {"id","vec"} rows assigned to it. Rank centroids by cosine similarity to `query` (ties by index), take the first `nprobe`, and gather all rows of those buckets as candidates. Rank the candidates by cosine similarity (ties by id) and return {"ids": top-k ids, "scanned": number of candidates}. A zero vector scores 0.',
    language: 'python',
    fnName: 'bucket_search',
    starter: `import math

def bucket_search(centroids, buckets, query, k, nprobe):
    # your code here
    pass
`,
    solution: `import math

def bucket_search(centroids, buckets, query, k, nprobe):
    def cos(a, b):
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(x * x for x in b))
        if na == 0 or nb == 0:
            return 0.0
        return sum(x * y for x, y in zip(a, b)) / (na * nb)

    order = sorted(range(len(centroids)), key=lambda c: (-cos(query, centroids[c]), c))
    cand = []
    for c in order[:nprobe]:
        cand.extend(buckets[c])
    scored = sorted(((cos(query, r["vec"]), r["id"]) for r in cand), key=lambda t: (-t[0], t[1]))
    return {"ids": [i for _, i in scored[:k]], "scanned": len(cand)}`,
    tests: [
      { args: [C3, B3, [1, 0.2], 2, 1], expected: { ids: ['a1', 'a3'], scanned: 3 }, name: 'probe one bucket' },
      { args: [C3, B3, [1, 0.2], 2, 2], expected: { ids: ['a1', 'a3'], scanned: 5 }, name: 'probing more buckets scans more' },
      { args: [C3, B3, [0.5, 1], 3, 1], expected: { ids: ['b1', 'b2'], scanned: 2 }, name: 'small bucket: fewer than k results' },
      { args: [C3, B3, [0.5, 1], 3, 3], expected: { ids: ['b1', 'a3', 'b2'], scanned: 8 }, name: 'probe everything' },
      { args: [C3, B3, [-1, 0.5], 5, 2], expected: { ids: ['c1', 'c3', 'c2', 'b2', 'b1'], scanned: 5 }, name: 'two buckets, k = 5' },
      { args: [C3, B3, [1, 0], 0, 1], expected: { ids: [], scanned: 3 }, name: 'k = 0 still scans the bucket' },
    ],
    hints: ['First choose the buckets: `sorted(range(len(centroids)), key=lambda c: (-cos(query, centroids[c]), c))[:nprobe]`.', 'Extend one candidate list with the rows of those buckets, count it for `scanned`, then rank the candidates exactly like brute force.'],
    combines: ['rag-embedding-index', 'ai-embeddings'],
  },
  quiz: [
    {
      prompt: 'Recall@10 of an approximate index is 0.8. What does that mean?',
      options: ['80% of queries return something', 'On average 8 of the true 10 nearest neighbours are returned', 'The index is 80% faster', 'The vectors are 80% accurate'],
      answer: 1,
      explain: 'Recall@k compares the approximate top k with the exact top k. 0.8 at k = 10 means about 8 of the true nearest neighbours were found.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
