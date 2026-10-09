import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, heatGrid, kvPanel, r4 } from '@/content/lib/ai-finish-1';

const code = `
def attention_row(scores, values, i, d_k):
    row = [s / math.sqrt(d_k) for s in scores[i]]            #@scale
    m = max(row)                                             #@max
    exps = [math.exp(s - m) for s in row]                    #@exp
    weights = [e / sum(exps) for e in exps]                  #@norm
    out = [sum(w * v[c] for w, v in zip(weights, values))    #@mix
           for c in range(len(values[0]))]
    return weights, out                                      #@ret
`;

interface Sentence {
  tokens: string[];
  scores: number[][];
  values: number[][];
}

const SENTENCES: Record<string, Sentence> = {
  'cat drank its milk': {
    tokens: ['the', 'cat', 'drank', 'its', 'milk'],
    scores: [
      [4, 2, 1, 1, 1],
      [3, 6, 4, 2, 1],
      [1, 8, 3, 1, 8],
      [1, 12, 2, 4, 3],
      [1, 2, 8, 6, 4],
    ],
    values: [[0, 1], [4, 0], [2, 3], [3, 1], [1, 5]],
  },
  'she gave him the book': {
    tokens: ['she', 'gave', 'him', 'the', 'book'],
    scores: [
      [6, 3, 1, 1, 1],
      [8, 4, 6, 1, 6],
      [2, 6, 5, 1, 2],
      [1, 1, 1, 3, 8],
      [1, 5, 2, 8, 4],
    ],
    values: [[2, 0], [0, 4], [3, 3], [1, 0], [0, 2]],
  },
};
const NAMES = Object.keys(SENTENCES);

interface In {
  sentence: string;
  query: number;
  dk: number;
}

function setup(i: In) {
  const s = SENTENCES[i.sentence];
  if (!s) throw new Error('Pick one of: ' + NAMES.join(', '));
  const n = s.tokens.length;
  if (!Number.isInteger(i.query) || i.query < 0 || i.query >= n) throw new Error(`Query token index must be a whole number from 0 to ${n - 1}`);
  if (!(i.dk >= 1)) throw new Error('d_k must be at least 1');
  return { s, n, q: i.query, dk: i.dk, scale: Math.sqrt(i.dk) };
}

function softmaxRow(row: number[]): number[] {
  const m = Math.max(...row);
  const e = row.map((x) => Math.exp(x - m));
  const t = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / t);
}

const viz: VizDef<In> = {
  id: 'ai-attention',
  title: 'Attention: who looks at whom',
  code,
  language: 'python',
  inputs: [
    { key: 'sentence', label: 'Sentence', kind: 'select', default: NAMES[0], options: NAMES },
    { key: 'query', label: 'Query token index', kind: 'number', default: 3, help: 'The row whose weighted sum we spell out at the end.' },
    { key: 'dk', label: 'Key size d_k (scores are divided by sqrt(d_k))', kind: 'number', default: 4 },
  ],
  presets: [
    { label: '"its" looks at "cat"', input: { sentence: NAMES[0], query: 3, dk: 4 } },
    { label: 'No scaling (d_k = 1): peaky', input: { sentence: NAMES[0], query: 3, dk: 1 } },
    { label: 'Big d_k = 64: flat', input: { sentence: NAMES[0], query: 3, dk: 64 } },
    { label: 'Second sentence', input: { sentence: NAMES[1], query: 1, dk: 4 } },
  ],
  run(input) {
    const { s, n, q, dk, scale } = setup(input);
    const r = new Recorder(code);
    const tk = s.tokens;
    const weights: number[][] = s.tokens.map(() => s.tokens.map(() => 0));
    const grids = (rowDone: number, cur: number): Panel[] => {
      const tones: Record<string, Tone> = {};
      if (cur >= 0) for (let c = 0; c < n; c++) tones[`${cur},${c}`] = 'active';
      return [
        heatGrid('Raw scores (query row × key column)', s.scores, tk, tk, tones),
        heatGrid('Attention weights (each row sums to 1)', weights.map((w, i) => (i < rowDone ? w.map(r4) : w)), tk, tk, tones),
      ];
    };
    r.step('scale', `Scores for "${tk[q]}" are dot products of its query with every key`, grids(0, -1), { d_k: dk, scale: r4(scale) });
    const scaled = s.scores.map((row) => row.map((x) => x / scale));
    r.op(n * n);
    r.step('scale', `Divide every score by sqrt(d_k) = ${r4(scale)} so large keys do not saturate softmax`, [heatGrid(`Scaled scores (÷ ${r4(scale)})`, scaled.map((row) => row.map(r4)), tk, tk), heatGrid('Attention weights', weights, tk, tk)], { scale: r4(scale) });
    scaled.forEach((row, i) => {
      weights[i] = softmaxRow(row);
      r.op(n);
      const best = weights[i].indexOf(Math.max(...weights[i]));
      r.step('norm', `softmax row "${tk[i]}": most weight ${r4(weights[i][best])} on "${tk[best]}"`, grids(i + 1, i), { row: tk[i], max_weight: r4(weights[i][best]), sum: r4(weights[i].reduce((a, b) => a + b, 0)) });
    });
    const w = weights[q];
    const out = [0, 1].map((c) => w.reduce((acc, wi, j) => acc + wi * s.values[j][c], 0));
    const terms = w.map((wi, j) => `${r4(wi)} × [${s.values[j].join(', ')}] (${tk[j]})`);
    const rowTones: Record<string, Tone> = Object.fromEntries(tk.map((_, c) => [`${q},${c}`, 'found' as Tone]));
    r.step(
      'mix',
      `Row "${tk[q]}": output = sum of weight × value vector`,
      [
        heatGrid('Attention weights', weights.map((x) => x.map(r4)), tk, tk, rowTones),
        { type: 'array', title: `Weights for "${tk[q]}"`, values: w.map(r4), indexLabels: tk, tones: Object.fromEntries(w.map((x, j) => [j, (x === Math.max(...w) ? 'found' : 'default') as Tone])) },
        { type: 'log', title: 'Weighted sum of value vectors', lines: terms.map((t) => ({ text: t })) },
      ],
      { out_x: r4(out[0]), out_y: r4(out[1]) },
    );
    r.step('ret', `"${tk[q]}" becomes the blend [${r4(out[0])}, ${r4(out[1])}]`, [kvPanel('Output vector', { x: r4(out[0]), y: r4(out[1]) }, { x: 'done', y: 'done' }), heatGrid('Attention weights', weights.map((x) => x.map(r4)), tk, tk)], { out: `[${r4(out[0])}, ${r4(out[1])}]` });
    return { frames: r.frames, result: { weights: weights.map((x) => x.map(r4)), output: out.map(r4) } };
  },
  reference(input) {
    const { s, q, scale } = setup(input);
    const wts = s.scores.map((row) => {
      const e = row.map((x) => Math.exp(x / scale));
      const t = e.reduce((a, b) => a + b, 0);
      return e.map((x) => x / t);
    });
    const out = [0, 1].map((c) => wts[q].reduce((acc, wi, j) => acc + wi * s.values[j][c], 0));
    return { weights: wts.map((x) => x.map(r4)), output: out.map(r4) };
  },
};

const tests = [
  { args: [[[1, 0]], [[1, 0], [0, 1]], [[1, 2], [3, 4]]], expected: [[1.6604769013466862, 2.6604769013466862]], name: 'one query, two keys' },
  { args: [[[1, 2]], [[1, 1], [1, 1]], [[0, 10], [10, 0]]], expected: [[5.0, 5.0]], name: 'identical keys average the values' },
  { args: [[[2000, 0]], [[1, 0], [0, 1]], [[1, 0], [0, 1]]], expected: [[1.0, 0.0]], name: 'huge scores must not overflow' },
  {
    args: [[[1, 0, 1, 0], [0, 2, 0, 2]], [[1, 0, 0, 0], [0, 1, 0, 0], [1, 1, 1, 1]], [[1, 0], [0, 1], [2, 2]]],
    expected: [[1.3201566678298065, 1.1992845053371557], [1.4205124847200241, 1.5752103826044412]],
    name: 'two queries, d = 4 (scaling matters)',
  },
  { args: [[[3, 3]], [[5, 5]], [[7, -1]]], expected: [[7.0, -1.0]], name: 'a single key gets weight 1' },
];

const unit: Unit = {
  id: 'ai-attention',
  hook: 'Attention is the one mechanism behind every modern LLM, and interviewers ask you to explain it without hand-waving: a softmax over query-key scores that decides how to blend value vectors.',
  predict: {
    prompt: 'In "the cat drank its milk", the token "its" attends mostly to "cat". What does that actually mean inside the layer?',
    options: ['"its" is replaced by the word "cat"', 'The output for "its" is a weighted average of all value vectors, with the largest weight on "cat"', 'The model looks the word up in a dictionary', 'Only the highest-scoring token is kept; all others are dropped'],
    answer: 1,
    explain: 'Softmax gives every token a non-negative weight and the weights sum to 1. The new vector for "its" is the weighted sum of every value vector, so "cat" dominates but nothing is fully discarded.',
  },
  viz,
  deeper: {
    points: [
      'Each token makes a query, a key and a value. Score(i, j) = q_i · k_j; softmax over j gives the weights; the output is the sum over j of weight_ij × v_j.',
      'Dividing by sqrt(d_k) keeps dot products from growing with the dimension. Without it softmax saturates to one-hot and gradients vanish.',
      'Subtract the row maximum before exp: the result is identical but exp never overflows.',
      'Self-attention is computed for all positions at once as softmax(Q Kᵀ / sqrt(d)) V, which is why it parallelises so well on GPUs.',
      'A decoder adds a causal mask: position i may only attend to positions ≤ i, so it cannot peek at the future token it must predict.',
    ],
    complexity: { time: 'O(n² · d) for n tokens', space: 'O(n²) for the weight matrix' },
    pitfalls: ['Forgetting the sqrt(d) scale', 'Softmax over the wrong axis (columns instead of rows)', 'exp on raw large scores overflows', 'Treating attention weights alone as a full explanation of a model decision'],
  },
  practice: {
    language: 'python',
    fnName: 'attention',
    statement: 'Implement scaled dot-product attention. `Q` (n×d), `K` (m×d), `V` (m×e) are lists of lists. For each query row compute scores `q·k / sqrt(d)`, softmax them (subtract the max first), and return the weighted sum of the rows of `V`.',
    signature: 'def attention(Q, K, V):',
    solution: `import math

def attention(Q, K, V):
    d = len(K[0])
    out = []
    for q in Q:
        scores = [sum(a * b for a, b in zip(q, k)) / @@math.sqrt(d)@@ for k in K]
        m = @@max(scores)@@
        exps = [math.exp(@@s - m@@) for s in scores]
        total = sum(exps)
        weights = [e / @@total@@ for e in exps]
        out.append([sum(weights[j] * V[j][c] for j in range(len(V))) for c in range(len(V[0]))])
    return out`,
    tests,
    compare: 'float',
  },
  debug: {
    language: 'python',
    fnName: 'attention',
    compare: 'float',
    statement: 'Attention works on small inputs but crashes with an OverflowError when the scores get large. Fix it.',
    buggy: `import math

def attention(Q, K, V):
    d = len(K[0])
    out = []
    for q in Q:
        scores = [sum(a * b for a, b in zip(q, k)) / math.sqrt(d) for k in K]
        exps = [math.exp(s) for s in scores]
        total = sum(exps)
        weights = [e / total for e in exps]
        out.append([sum(weights[j] * V[j][c] for j in range(len(V))) for c in range(len(V[0]))])
    return out`,
    fixed: `import math

def attention(Q, K, V):
    d = len(K[0])
    out = []
    for q in Q:
        scores = [sum(a * b for a, b in zip(q, k)) / math.sqrt(d) for k in K]
        m = max(scores)
        exps = [math.exp(s - m) for s in scores]
        total = sum(exps)
        weights = [e / total for e in exps]
        out.append([sum(weights[j] * V[j][c] for j in range(len(V))) for c in range(len(V[0]))])
    return out`,
    tests,
    bugType: 'numerical overflow',
    hint: 'What happens to math.exp(1414)? Is there a shift you can apply to every score that leaves the softmax unchanged?',
    explanation: 'softmax(x) equals softmax(x - c) for any constant c. Subtracting the row maximum makes the largest exponent exp(0) = 1 so nothing overflows, while the weights stay exactly the same.',
  },
  boss: {
    title: 'Causal (masked) attention',
    statement:
      'Implement `causal_attention(Q, K, V)`: like scaled dot-product attention, but query row `i` may only attend to key rows `0..i` (a decoder cannot see future tokens). Scale by `sqrt(d)` where `d = len(K[0])`, use a numerically stable softmax over the allowed keys only, and return the weighted sums of the rows of `V`.',
    language: 'python',
    fnName: 'causal_attention',
    compare: 'float',
    starter: `import math

def causal_attention(Q, K, V):
    # your code here
    pass
`,
    solution: `import math

def causal_attention(Q, K, V):
    d = len(K[0])
    out = []
    for i, q in enumerate(Q):
        scores = [sum(a * b for a, b in zip(q, k)) / math.sqrt(d) for k in K[: i + 1]]
        m = max(scores)
        exps = [math.exp(s - m) for s in scores]
        total = sum(exps)
        weights = [e / total for e in exps]
        out.append([sum(weights[j] * V[j][c] for j in range(i + 1)) for c in range(len(V[0]))])
    return out`,
    tests: [
      { args: [[[1, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [2, 2]]], expected: [[1.0, 0.0], [0.3302384506733431, 0.6697615493266569], [1.2552347652268308, 1.2552347652268308]], name: 'first token sees only itself' },
      { args: [[[5, 5]], [[1, 1]], [[3, 4]]], expected: [[3.0, 4.0]], name: 'one token' },
      { args: [[[0, 0], [0, 0], [0, 0]], [[1, 0], [0, 1], [1, 1]], [[3, 0], [0, 3], [3, 3]]], expected: [[3.0, 0.0], [1.5, 1.5], [2.0, 2.0]], name: 'zero scores: running mean' },
      { args: [[[10, 0], [10, 0]], [[1, 0], [0, 0]], [[1, 1], [5, 5]]], expected: [[1.0, 1.0], [1.0033944198508449, 1.0033944198508449]], name: 'a dominant earlier key' },
    ],
    hints: ['For row i, restrict the keys to `K[: i + 1]` before computing scores, so the softmax never sees future positions.', 'Remember the max-subtraction, and sum the values only over `range(i + 1)`.'],
    combines: ['ai-embeddings'],
  },
  quiz: [
    {
      prompt: 'Why is the score matrix divided by sqrt(d_k)?',
      options: ['To make the weights sum to 1', 'Dot products grow with the dimension; scaling keeps softmax out of its saturated, near one-hot region', 'To save memory', 'To make the model causal'],
      answer: 1,
      explain: 'With large d_k the dot products have a large variance, softmax becomes extremely peaky, and its gradients vanish. Dividing by sqrt(d_k) keeps the variance near 1.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
