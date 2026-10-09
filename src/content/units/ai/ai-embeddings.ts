import { Recorder } from '@/engine/recorder';
import type { GraphEdge, GraphNode, GraphPanel, GridPanel, KVPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap, cosine, dot, norm, round } from '@/content/lib/ai-llm-rag-1';

const code = `
def cosine_similarity(a, b):
    dot = sum(x * y for x, y in zip(a, b))                  #@dot
    na = math.sqrt(sum(x * x for x in a))                   #@norm
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0            #@ratio

def top_k(query, items, k):
    scored = []
    for name, vec in items.items():                         #@loop
        scored.append((cosine_similarity(query, vec), name))   #@score
    scored.sort(key=lambda t: (-t[0], t[1]))                #@sort
    return [name for _, name in scored[:k]]                 #@return
`;

/** Hand-placed 2D "embeddings": direction carries meaning, length is just how strongly it is expressed. */
const ITEMS: [string, number[]][] = [
  ['cat', [1.2, 0.6]],
  ['kitten', [0.5, 0.3]],
  ['dog', [1.5, 0.3]],
  ['puppy', [0.6, 0.1]],
  ['car', [-0.5, 1.1]],
  ['truck', [-0.9, 1.7]],
  ['bike', [-0.25, 0.6]],
  ['apple', [-1.0, -0.7]],
  ['banana', [-0.6, -0.4]],
  ['pear', [-0.3, -1.2]],
];

const W = 560;
const H = 400;
const SX = 120;
const SY = 95;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const px = (x: number) => W / 2 + clamp(x, -2.2, 2.2) * SX;
const py = (y: number) => H / 2 - clamp(y, -2.0, 2.0) * SY;

interface In {
  qx: number;
  qy: number;
  k: number;
}

function clean(i: In) {
  const qx = Number(i.qx);
  const qy = Number(i.qy);
  if (!Number.isFinite(qx) || !Number.isFinite(qy)) throw new Error('The query needs two numbers, x and y.');
  if (qx === 0 && qy === 0) throw new Error('The query vector must not be (0, 0): it has no direction.');
  const k = Math.round(Number(i.k));
  if (!Number.isFinite(k) || k < 1 || k > ITEMS.length) throw new Error(`k must be between 1 and ${ITEMS.length}.`);
  return { q: [qx, qy], k };
}

/** Rank key: similarity rounded to 9 places so float noise cannot reorder equal scores; ties by name. */
const byScore = (a: { s: number; name: string }, b: { s: number; name: string }) => round(b.s, 9) - round(a.s, 9) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

const viz: VizDef<In> = {
  id: 'ai-embeddings',
  title: 'Embeddings as points: nearest neighbours',
  code,
  language: 'python',
  inputs: [
    { key: 'qx', label: 'Query x', kind: 'number', default: 0.9 },
    { key: 'qy', label: 'Query y', kind: 'number', default: 0.9 },
    { key: 'k', label: 'k (neighbours)', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Between the pets', input: { qx: 0.9, qy: 0.9, k: 3 } },
    { label: 'Vehicle direction', input: { qx: -0.4, qy: 0.9, k: 3 } },
    { label: 'Fruit direction', input: { qx: -0.7, qy: -0.9, k: 2 } },
    { label: 'Long vector, same direction', input: { qx: 2, qy: 1, k: 3 } },
  ],
  run(input) {
    const { q, k } = clean(input);
    const r = new Recorder(code);
    const sims: Record<string, number> = {};
    const dists: Record<string, number> = {};
    let current = -1;
    let topSet = new Set<string>();
    let finished = false;

    const view = (note?: Tone): Panel[] => {
      const nodes: GraphNode[] = ITEMS.map(([name, v], idx) => {
        let tone: Tone = 'default';
        if (idx === current) tone = 'compare';
        else if (finished) tone = topSet.has(name) ? 'found' : 'muted';
        else if (name in sims) tone = 'visited';
        return { id: name, label: name, x: px(v[0]), y: py(v[1]), tone, shape: 'circle', badge: name in sims ? String(round(sims[name], 2)) : undefined };
      });
      nodes.push({ id: 'query', label: 'query', x: px(q[0]), y: py(q[1]), tone: note ?? 'active', shape: 'rect' });
      const edges: GraphEdge[] = [];
      if (current >= 0) edges.push({ from: 'query', to: ITEMS[current][0], tone: 'compare', label: String(round(sims[ITEMS[current][0]], 2)) });
      if (finished) for (const name of topSet) edges.push({ from: 'query', to: name, tone: 'found', label: String(round(sims[name], 2)) });
      const graph: GraphPanel = { type: 'graph', title: 'Embedding space (x and y are the two dimensions)', nodes, edges, width: W, height: H, axes: true };
      const cells = ITEMS.map(([name]) => (name in sims ? [round(sims[name], 3), round(dists[name], 3)] : ['', '']));
      const tones: Record<string, Tone> = {};
      ITEMS.forEach(([name], idx) => {
        if (idx === current) tones[`${idx},0`] = tones[`${idx},1`] = 'compare';
        else if (finished && topSet.has(name)) tones[`${idx},0`] = 'found';
      });
      const grid: GridPanel = { type: 'grid', title: 'Scores per candidate', cells, rowLabels: ITEMS.map(([n]) => n), colLabels: ['cosine', 'distance'], tones };
      return [graph, grid];
    };

    r.step('loop', `${ITEMS.length} items as 2D vectors; the query points at (${q[0]}, ${q[1]}). Score every item`, view(), { k });
    ITEMS.forEach(([name, v], idx) => {
      current = idx;
      r.op();
      const d = dot(q, v);
      const s = cosine(q, v);
      sims[name] = s;
      dists[name] = Math.hypot(q[0] - v[0], q[1] - v[1]);
      r.step('score', cap(`${name}: dot ${round(d, 2)} / (|q| ${round(norm(q), 2)} x |v| ${round(norm(v), 2)}) = ${round(s, 3)}`), view(), { item: name, cosine: round(s, 3) });
    });
    current = -1;
    const ranked = ITEMS.map(([name]) => ({ name, s: sims[name] })).sort(byScore);
    topSet = new Set(ranked.slice(0, k).map((x) => x.name));
    finished = true;
    r.step('sort', cap(`Sort by cosine, highest first: ${ranked.slice(0, k + 1).map((x) => x.name).join(', ')}, …`), view(), { best: ranked[0].name });
    const top = ranked.slice(0, k).map((x) => x.name);
    const near = ITEMS.map(([name]) => ({ name, d: dists[name] })).sort((a, b) => round(a.d, 9) - round(b.d, 9) || (a.name < b.name ? -1 : 1))[0].name;
    const kv: KVPanel = {
      type: 'kv',
      entries: [
        { k: `top ${k} by cosine`, v: top.join(', '), tone: 'found' },
        { k: 'nearest by distance', v: near, tone: near === top[0] ? 'default' : 'error' },
      ],
    };
    r.step('return', near === top[0] ? `Top ${k}: ${top.join(', ')}. Distance agrees on the best match` : cap(`Top ${k}: ${top.join(', ')}. Distance would pick "${near}": length misleads it`), [...view(), kv], { top: top.join(',') });
    const scores: Record<string, number> = {};
    for (const [name] of ITEMS) scores[name] = round(sims[name], 4);
    return { frames: r.frames, result: { top, scores, nearestByDistance: near } };
  },
  reference(input) {
    const { q, k } = clean(input);
    // Independent formulation: in 2D, cosine similarity is cos(angle between the vectors).
    const ang = (v: number[]) => Math.atan2(v[1], v[0]);
    const scored = ITEMS.map(([name, v]) => ({ name, s: Math.cos(ang(q) - ang(v)) }));
    const top = [...scored].sort(byScore).slice(0, k).map((x) => x.name);
    const scores: Record<string, number> = {};
    for (const x of scored) scores[x.name] = round(x.s, 4);
    let best = ITEMS[0][0];
    let bestD = Infinity;
    for (const [name, v] of ITEMS) {
      const d = Math.sqrt((q[0] - v[0]) ** 2 + (q[1] - v[1]) ** 2);
      if (round(d, 9) < round(bestD, 9)) {
        bestD = d;
        best = name;
      }
    }
    return { top, scores, nearestByDistance: best };
  },
};

const unit: Unit = {
  id: 'ai-embeddings',
  hook: 'Semantic search, RAG and recommendations all reduce to "turn things into vectors, then find the nearest ones". Cosine similarity and top-k are the two functions you are expected to write on a whiteboard.',
  predict: {
    prompt: 'Two documents have embeddings that point in exactly the same direction, but one vector is ten times longer. What is their cosine similarity?',
    options: ['0.1', '0', '1', '10'],
    answer: 2,
    explain: 'Cosine similarity divides out both lengths, leaving only the angle. Same direction means an angle of 0, so cos = 1 however long the vectors are.',
  },
  viz,
  simulationNote: 'The 2D points are hand-placed for illustration. Real embeddings have hundreds or thousands of dimensions produced by a trained model; no real model is called.',
  deeper: {
    points: [
      'An **embedding** maps text (or an image) to a vector so that similar meaning lands in a similar direction. Search then becomes geometry.',
      '**Cosine similarity** is `dot(a, b) / (|a| |b|)`, from -1 (opposite) to 1 (same direction). Many embedding models return unit-length vectors, which makes cosine equal to a plain dot product.',
      '**Distance** and **similarity** point in opposite directions: for Euclidean or cosine *distance* smaller is closer, for cosine *similarity* larger is closer. Mixing them up returns the least relevant results.',
      '`top_k` needs a deterministic tie-break (here by name), otherwise two runs can disagree on equal scores.',
      'Brute force over n vectors of dimension d costs O(n d). Vector databases use approximate indexes to avoid scanning everything (see the vector search unit).',
    ],
    complexity: { time: 'O(n d) for n vectors of dimension d, plus O(n log n) to sort', space: 'O(n)' },
    pitfalls: ['Using the raw dot product on vectors of different lengths', 'Dividing by zero for an all-zero vector', 'Sorting ascending and returning the least similar items', 'Comparing embeddings from two different models'],
  },
  practice: {
    language: 'python',
    fnName: 'top_k',
    statement: 'Implement `cosine_similarity(a, b)` (0.0 if either vector is all zeros) and `top_k(query, items, k)`: `items` maps names to vectors; return the names of the `k` most similar items, best first, ties broken by name.',
    signature: 'def top_k(query, items, k):',
    solution: `import math

def cosine_similarity(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / @@(na * nb)@@

def top_k(query, items, k):
    scored = [(cosine_similarity(query, vec), name) for name, vec in items.items()]
    scored.sort(key=lambda t: (@@-t[0]@@, t[1]))
    return [name for _, name in @@scored[:k]@@]`,
    tests: [
      { args: [[1, 0], { a: [1, 0], b: [0, 1], c: [-1, 0] }, 2], expected: ['a', 'b'], name: 'angle decides' },
      { args: [[1, 0], { small_close: [1, 0.1], big_far: [50, 60], mid: [3, 3] }, 2], expected: ['small_close', 'mid'], name: 'length is ignored' },
      { args: [[1, 1], { zero: [0, 0], a: [1, 1] }, 2], expected: ['a', 'zero'], name: 'zero vector scores 0' },
      { args: [[1, 0], { b: [2, 0], a: [1, 0] }, 2], expected: ['a', 'b'], name: 'ties by name' },
      { args: [[0, 1], { x: [1, 0] }, 5], expected: ['x'], name: 'k larger than the item count' },
      { args: [[1, 2, 3], { p: [-1, -2, -3], q: [1, 2, 2.5], r: [0, 0, 1] }, 1], expected: ['q'], name: 'three dimensions, k=1' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'top_k',
    statement: 'Search keeps returning the longest documents no matter what the query is. The ranking is based on a function that is supposed to be cosine similarity. Fix it.',
    buggy: `import math

def cosine_similarity(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot

def top_k(query, items, k):
    scored = [(cosine_similarity(query, vec), name) for name, vec in items.items()]
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [name for _, name in scored[:k]]`,
    fixed: `import math

def cosine_similarity(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)

def top_k(query, items, k):
    scored = [(cosine_similarity(query, vec), name) for name, vec in items.items()]
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [name for _, name in scored[:k]]`,
    tests: [
      { args: [[1, 0], { a: [1, 0], b: [0, 1], c: [-1, 0] }, 2], expected: ['a', 'b'], name: 'angle decides' },
      { args: [[1, 0], { small_close: [1, 0.1], big_far: [50, 60], mid: [3, 3] }, 2], expected: ['small_close', 'mid'], name: 'long vectors do not win by size' },
      { args: [[1, 1], { zero: [0, 0], a: [1, 1] }, 2], expected: ['a', 'zero'], name: 'zero vector' },
    ],
    bugType: 'cosine without normalising',
    hint: 'The function computes the dot product and the two norms, then only returns one of them.',
    explanation: 'The raw dot product grows with vector length, so long vectors beat well-aligned short ones. Cosine similarity divides by both norms: `dot / (na * nb)`.',
  },
  boss: {
    title: 'Drop near-duplicate texts',
    statement:
      'Implement `dedupe(texts, threshold)` using `minillm.embed(text)` (16-dim unit vectors). Walk the texts in order and keep a text only if its cosine similarity with every text kept so far is below `threshold`. Return the kept texts in order.',
    language: 'python',
    fnName: 'dedupe',
    starter: `from minillm import embed

def dedupe(texts, threshold):
    pass
`,
    solution: `import math
from minillm import embed

def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0

def dedupe(texts, threshold):
    kept = []
    kept_vecs = []
    for text in texts:
        vec = embed(text)
        if all(cosine(vec, other) < threshold for other in kept_vecs):
            kept.append(text)
            kept_vecs.append(vec)
    return kept`,
    tests: [
      {
        args: [['How do I reset my password', 'how to reset my password?', 'Reset password steps', 'Best pizza in town', 'Where can I find great pizza', 'The weather is sunny today', 'Weather today is sunny', 'Password reset', 'Great pizza places nearby'], 0.9],
        expected: ['How do I reset my password', 'Reset password steps', 'Best pizza in town', 'Where can I find great pizza', 'The weather is sunny today', 'Great pizza places nearby'],
        name: 'threshold 0.9',
      },
      {
        args: [['How do I reset my password', 'how to reset my password?', 'Reset password steps', 'Best pizza in town', 'Where can I find great pizza', 'The weather is sunny today', 'Weather today is sunny', 'Password reset', 'Great pizza places nearby'], 0.8],
        expected: ['How do I reset my password', 'Best pizza in town', 'Where can I find great pizza', 'The weather is sunny today', 'Great pizza places nearby'],
        name: 'stricter threshold 0.8',
      },
      { args: [['same text', 'same text', 'other thing'], 0.99], expected: ['same text', 'other thing'], name: 'exact duplicates' },
      { args: [['same text', 'same text'], 1.01], expected: ['same text', 'same text'], name: 'nothing reaches 1.01' },
      { args: [[], 0.9], expected: [], name: 'empty input' },
    ],
    hints: ['Keep two lists: the kept texts and their vectors. Compare each new vector against all kept vectors.', 'A text is a duplicate if any kept vector has cosine >= threshold; use `all(... < threshold ...)` to decide to keep it.'],
    combines: ['ai-tokens'],
  },
  quiz: [
    {
      prompt: 'Your vectors are already unit length. Which is equivalent to cosine similarity?',
      options: ['Euclidean distance', 'The dot product', 'The sum of the components', 'The difference of the lengths'],
      answer: 1,
      explain: 'With |a| = |b| = 1 the denominator of cosine similarity is 1, leaving dot(a, b). That is why many systems normalise once and then use fast dot products.',
    },
    {
      prompt: 'You compute cosine DISTANCE (1 - similarity) for each document. Which are the best matches?',
      options: ['The largest distances', 'The smallest distances', 'Distances closest to 1', 'Distances closest to 0.5'],
      answer: 1,
      explain: 'Distance is the opposite of similarity: zero means identical direction. Sort ascending for distances and descending for similarities.',
    },
  ],
};

export default unit;
