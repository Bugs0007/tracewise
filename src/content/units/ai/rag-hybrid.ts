import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { DOCS, PY_DOCS, SIM_NOTE, conceptOf, kvPanel, r3, terms } from '@/content/lib/ai-finish-1';

const code = `
def hybrid_score(kw, vec, alpha):
    ids = sorted(set(kw) | set(vec))
    k = normalize([kw.get(i, 0) for i in ids])               #@normk
    v = normalize([vec.get(i, 0) for i in ids])              #@normv
    scores = [alpha * a + (1 - alpha) * b                    #@mix
              for a, b in zip(k, v)]
    return sorted(zip(ids, scores), key=lambda t: (-t[1], t[0]))   #@rank

def normalize(xs):
    lo, hi = min(xs), max(xs)
    return [(x - lo) / (hi - lo) if hi > lo else 0.0 for x in xs]
`;

const QUERIES = ['get my money back', 'tracking number', 'how do I reset my password', 'gift card'];
const MODES = ['min-max', 'none'];

function conceptVec(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of terms(text)) {
    const c = conceptOf(t);
    if (c) m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}

function cos(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    na += v * v;
    dot += v * (b.get(k) ?? 0);
  }
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** BM25-style keyword score (no length normalisation): sum of idf * tf / (tf + 1.2) over query terms. */
function keywordScores(query: string): Record<string, number> {
  const docTerms = DOCS.map((d) => terms(d.text));
  const q = [...new Set(terms(query))];
  const out: Record<string, number> = {};
  DOCS.forEach((d, i) => {
    let s = 0;
    for (const t of q) {
      const df = docTerms.filter((dt) => dt.includes(t)).length;
      const tf = docTerms[i].filter((x) => x === t).length;
      if (tf) s += Math.log(1 + (DOCS.length - df + 0.5) / (df + 0.5)) * (tf / (tf + 1.2));
    }
    out[d.id] = s;
  });
  return out;
}

function vectorScores(query: string): Record<string, number> {
  const q = conceptVec(query);
  return Object.fromEntries(DOCS.map((d) => [d.id, cos(q, conceptVec(d.text))]));
}

interface In {
  query: string;
  alpha: number;
  normalize: string;
}

function setup(i: In) {
  if (!QUERIES.includes(i.query)) throw new Error('Pick one of: ' + QUERIES.join(', '));
  if (!(i.alpha >= 0 && i.alpha <= 1)) throw new Error('alpha must be between 0 and 1');
  if (!MODES.includes(i.normalize)) throw new Error('Normalisation must be min-max or none');
  return { query: i.query, alpha: i.alpha, mode: i.normalize };
}

function minmax(xs: number[]): number[] {
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return xs.map((x) => (hi > lo ? (x - lo) / (hi - lo) : 0));
}

const viz: VizDef<In> = {
  id: 'rag-hybrid',
  title: 'Hybrid search: keyword + vector',
  code,
  language: 'python',
  inputs: [
    { key: 'query', label: 'Query', kind: 'select', default: QUERIES[0], options: QUERIES },
    { key: 'alpha', label: 'alpha (weight of the keyword side)', kind: 'number', default: 0.5 },
    { key: 'normalize', label: 'Normalise scores first?', kind: 'select', default: 'min-max', options: MODES, help: '"none" is the classic bug.' },
  ],
  presets: [
    { label: 'Balanced (alpha 0.5)', input: { query: QUERIES[0], alpha: 0.5, normalize: 'min-max' } },
    { label: 'Exact term: keyword helps', input: { query: QUERIES[1], alpha: 0.5, normalize: 'min-max' } },
    { label: 'Keyword only (alpha 1)', input: { query: QUERIES[0], alpha: 1, normalize: 'min-max' } },
    { label: 'Unnormalised: alpha lies', input: { query: QUERIES[2], alpha: 0.5, normalize: 'none' } },
  ],
  run(input) {
    const { query, alpha, mode } = setup(input);
    const r = new Recorder(code);
    const ids = DOCS.map((d) => d.id);
    const kw = keywordScores(query);
    const vec = vectorScores(query);
    const cols = ['keyword (raw)', 'vector (raw)', 'keyword (used)', 'vector (used)', 'hybrid'];
    const rows: (string | number)[][] = ids.map(() => ['', '', '', '', '']);
    const kRaw = ids.map((i) => kw[i]);
    const vRaw = ids.map((i) => vec[i]);
    const kUsed = mode === 'min-max' ? minmax(kRaw) : kRaw;
    const vUsed = mode === 'min-max' ? minmax(vRaw) : vRaw;
    const table = (title: string, tones: Record<string, Tone> = {}) => ({ type: 'grid' as const, title, cells: rows.map((row) => [...row]), rowLabels: ids, colLabels: cols, tones });
    const hybrid: number[] = [];
    r.step('normk', `Query "${query}": keyword (BM25-style) and vector scores live on different scales`, [table('Per-document scores')], { alpha, normalize: mode });
    ids.forEach((_, i) => {
      rows[i][0] = r3(kRaw[i]);
      rows[i][1] = r3(vRaw[i]);
    });
    r.op(ids.length * 2);
    r.step('normk', `Raw scores: keyword spans ${r3(Math.min(...kRaw))}..${r3(Math.max(...kRaw))}, vector ${r3(Math.min(...vRaw))}..${r3(Math.max(...vRaw))}`, [table('Per-document scores', { ...Object.fromEntries(ids.map((_, i) => [`${i},0`, 'visited' as Tone])), ...Object.fromEntries(ids.map((_, i) => [`${i},1`, 'visited' as Tone])) })], { kw_max: r3(Math.max(...kRaw)), vec_max: r3(Math.max(...vRaw)) });
    ids.forEach((_, i) => (rows[i][2] = r3(kUsed[i])));
    r.step('normk', mode === 'min-max' ? 'Min-max normalise keyword scores to 0..1' : 'No normalisation: keyword scores stay on their raw scale', [table('Per-document scores', Object.fromEntries(ids.map((_, i) => [`${i},2`, 'new' as Tone])))], { mode });
    ids.forEach((_, i) => (rows[i][3] = r3(vUsed[i])));
    r.step('normv', mode === 'min-max' ? 'Min-max normalise vector scores to 0..1' : 'Vector scores stay in 0..1 while keyword scores reach several units', [table('Per-document scores', Object.fromEntries(ids.map((_, i) => [`${i},3`, 'new' as Tone])))], { mode });
    ids.forEach((id, i) => {
      r.op();
      hybrid[i] = alpha * kUsed[i] + (1 - alpha) * vUsed[i];
      rows[i][4] = r3(hybrid[i]);
      r.step('mix', `${id}: ${alpha} × ${r3(kUsed[i])} + ${r3(1 - alpha)} × ${r3(vUsed[i])} = ${r3(hybrid[i])}`, [table('Per-document scores', { [`${i},4`]: 'new', [`${i},2`]: 'active', [`${i},3`]: 'active' })], { doc: id, hybrid: r3(hybrid[i]) });
    });
    const ranked = ids.map((id, i) => ({ id, s: hybrid[i] })).sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
    const kwTop = [...ids].sort((a, b) => kw[b] - kw[a] || (a < b ? -1 : 1))[0];
    const share = mode === 'none' && alpha > 0 && alpha < 1 ? 'keyword scale swamps the vector side' : 'both sides contribute as alpha says';
    r.step('rank', `Ranked: ${ranked.slice(0, 3).map((x) => x.id).join(' > ')} (${share})`, [
      table('Per-document scores', Object.fromEntries(ranked.slice(0, 3).map((x) => [`${ids.indexOf(x.id)},4`, 'found' as Tone]))),
      { type: 'list', title: 'Final ranking', orientation: 'vertical', items: ranked.slice(0, 5).map((x, i) => ({ label: `${i + 1}. ${x.id}`, sub: String(r3(x.s)), tone: (i === 0 ? 'found' : 'frontier') as Tone })) },
      kvPanel('Compare', { 'top by keyword alone': kwTop, 'top by hybrid': ranked[0].id }),
    ], { top: ranked[0].id });
    return { frames: r.frames, result: ranked.map((x) => [x.id, r3(x.s)]) };
  },
  reference(input) {
    const { query, alpha, mode } = setup(input);
    const kw = keywordScores(query);
    const vec = vectorScores(query);
    const nk = mode === 'min-max' ? minmax(DOCS.map((d) => kw[d.id])) : DOCS.map((d) => kw[d.id]);
    const nv = mode === 'min-max' ? minmax(DOCS.map((d) => vec[d.id])) : DOCS.map((d) => vec[d.id]);
    return DOCS.map((d, i) => [d.id, r3(alpha * nk[i] + (1 - alpha) * nv[i])] as [string, number])
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map((x) => x);
  },
};

const tests = [
  { args: [{ a: 12.0, b: 6.0, c: 0.0 }, { a: 0.2, b: 0.9, c: 0.5 }, 0.5], expected: [['b', 0.75], ['a', 0.5], ['c', 0.2142857142857143]], name: 'balanced mix' },
  { args: [{ a: 12.0, b: 6.0, c: 0.0 }, { a: 0.2, b: 0.9, c: 0.5 }, 1.0], expected: [['a', 1.0], ['b', 0.5], ['c', 0.0]], name: 'alpha = 1 is keyword only' },
  { args: [{ a: 12.0, b: 6.0, c: 0.0 }, { a: 0.2, b: 0.9, c: 0.5 }, 0.0], expected: [['b', 1.0], ['c', 0.4285714285714286], ['a', 0.0]], name: 'alpha = 0 is vector only' },
  { args: [{ a: 3.0 }, { b: 0.4 }, 0.5], expected: [['a', 0.5], ['b', 0.5]], name: 'a document missing from one side scores 0 there' },
  { args: [{ x: 5.0, y: 5.0 }, { x: 0.3, y: 0.8 }, 0.7], expected: [['y', 0.3], ['x', 0.0]], name: 'a constant side normalises to 0' },
  { args: [{}, {}, 0.5], expected: [], name: 'nothing to rank' },
  { args: [{ a: 100.0, b: 0.0 }, { a: 0.1, b: 0.2 }, 0.5], expected: [['a', 0.5], ['b', 0.5]], name: 'big raw scores must not dominate' },
];

const unit: Unit = {
  id: 'rag-hybrid',
  hook: 'Pure vector search misses exact terms like error codes; pure keyword search misses paraphrases. Interviewers want to hear that you blend both and that you normalise the scores before applying a weight.',
  predict: {
    prompt: 'You compute hybrid = alpha × bm25 + (1 - alpha) × cosine with alpha = 0.5, using the raw scores (BM25 reaches about 12, cosine stays below 1). What happens?',
    options: ['A perfect 50/50 blend', 'The keyword side dominates, because its scores are an order of magnitude larger', 'The vector side dominates', 'The function raises an error'],
    answer: 1,
    explain: 'alpha only means "50%" when both inputs share a scale. Raw BM25 values of about 12 swamp cosines below 1, so the ranking is nearly keyword-only. Normalise (min-max or z-score) each side first.',
  },
  viz,
  deeper: {
    points: [
      'hybrid = alpha × keyword + (1 - alpha) × vector, with alpha between 0 (vector only) and 1 (keyword only).',
      'Min-max normalisation maps each side to 0..1 over the candidate set: (x - min) / (max - min). A constant side maps to 0 so it cannot distort the blend.',
      'Rank-based fusion (RRF) sidesteps normalisation entirely by using only the positions in each list.',
      'Keyword search shines on exact identifiers, names and rare terms; vectors shine on paraphrase and intent. Hybrid keeps both strengths.',
      'Tune alpha against labelled queries (recall@k), not by feel, and re-tune when the corpus or models change.',
    ],
    complexity: { time: 'O(n log n) for n candidates', space: 'O(n)' },
    pitfalls: ['Applying alpha to unnormalised scores', 'Dividing by zero when all scores on one side are equal', 'Normalising over only the top 10 of each list, which changes with k', 'Assuming one alpha fits every query type'],
  },
  practice: {
    language: 'python',
    fnName: 'hybrid_score',
    statement: 'Implement `hybrid_score(kw, vec, alpha)`. `kw` and `vec` map document ids to raw scores; a document missing from one side scores 0 there. Min-max normalise each side across all ids (a constant side becomes all 0.0), combine as `alpha * kw + (1 - alpha) * vec`, and return `[id, score]` pairs sorted by score desc then id.',
    signature: 'def hybrid_score(kw, vec, alpha):',
    solution: `def normalize(xs):
    lo, hi = min(xs), max(xs)
    return [(x - lo) / (hi - lo) if hi > lo else 0.0 for x in xs]

def hybrid_score(kw, vec, alpha):
    ids = sorted(set(kw) | set(vec))
    if not ids:
        return []
    k = normalize([@@kw.get(i, 0)@@ for i in ids])
    v = normalize([vec.get(i, 0) for i in ids])
    scores = [@@alpha * a + (1 - alpha) * b@@ for a, b in zip(k, v)]
    return sorted(([i, s] for i, s in zip(ids, scores)), key=lambda t: (@@-t[1]@@, t[0]))`,
    tests,
    compare: 'float',
  },
  debug: {
    language: 'python',
    fnName: 'hybrid_score',
    compare: 'float',
    statement: 'With alpha = 0.5 the hybrid ranking is identical to keyword-only ranking. Find the bug.',
    buggy: `def normalize(xs):
    lo, hi = min(xs), max(xs)
    return [(x - lo) / (hi - lo) if hi > lo else 0.0 for x in xs]

def hybrid_score(kw, vec, alpha):
    ids = sorted(set(kw) | set(vec))
    if not ids:
        return []
    k = [kw.get(i, 0) for i in ids]
    v = [vec.get(i, 0) for i in ids]
    scores = [alpha * a + (1 - alpha) * b for a, b in zip(k, v)]
    return sorted(([i, s] for i, s in zip(ids, scores)), key=lambda t: (-t[1], t[0]))`,
    fixed: `def normalize(xs):
    lo, hi = min(xs), max(xs)
    return [(x - lo) / (hi - lo) if hi > lo else 0.0 for x in xs]

def hybrid_score(kw, vec, alpha):
    ids = sorted(set(kw) | set(vec))
    if not ids:
        return []
    k = normalize([kw.get(i, 0) for i in ids])
    v = normalize([vec.get(i, 0) for i in ids])
    scores = [alpha * a + (1 - alpha) * b for a, b in zip(k, v)]
    return sorted(([i, s] for i, s in zip(ids, scores)), key=lambda t: (-t[1], t[0]))`,
    tests,
    bugType: 'unnormalised scores',
    hint: 'The helper `normalize` exists. Is it ever called? What scale is each side on when alpha multiplies it?',
    explanation: 'The scores are mixed raw: BM25 of 12 beats cosine of 0.9 whatever alpha says, so alpha no longer sets the balance. Normalise both sides (to 0..1) before the weighted sum.',
  },
  boss: {
    title: 'Hybrid ranking over the corpus',
    statement:
      'Implement `hybrid_rank(query, docs, alpha, top_n)`. `docs` is a list of {"id","text"} (`DOCS` and `DIM = 64` exist). Keyword score: number of distinct lowercase words (`re.findall(r"[a-z]+", ...)`) shared by query and doc, as a float. Vector score: dot product of `embed(query, dim=DIM)` and `embed(doc["text"], dim=DIM)`. Min-max normalise each score list across all docs (constant list becomes all 0.0), combine `alpha * keyword + (1 - alpha) * vector`, sort by score desc then id and return the first `top_n` ids.',
    language: 'python',
    fnName: 'hybrid_rank',
    harness:
      PY_DOCS +
      `
def run_rank(fn, query, alpha, top_n):
    return fn(query, DOCS, alpha, top_n)
`,
    adapter: 'run_rank',
    starter: `import re
from minillm import embed

def hybrid_rank(query, docs, alpha, top_n):
    # your code here
    pass
`,
    solution: `import re
from minillm import embed

def hybrid_rank(query, docs, alpha, top_n):
    words = set(re.findall(r"[a-z]+", query.lower()))
    q = embed(query, dim=DIM)
    kw = [float(len(words & set(re.findall(r"[a-z]+", d["text"].lower())))) for d in docs]
    vec = [sum(a * b for a, b in zip(q, embed(d["text"], dim=DIM))) for d in docs]

    def norm(xs):
        lo, hi = min(xs), max(xs)
        return [(x - lo) / (hi - lo) if hi > lo else 0.0 for x in xs]

    k, v = norm(kw), norm(vec)
    scored = [(alpha * a + (1 - alpha) * b, d["id"]) for a, b, d in zip(k, v, docs)]
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [i for _, i in scored[:top_n]]`,
    tests: [
      { args: ['how long does delivery take', 0.5, 3], expected: ['d2', 'd6', 'd8'], name: 'balanced' },
      { args: ['how long does delivery take', 1.0, 3], expected: ['d2', 'd6', 'd1'], name: 'keyword only: ties by id' },
      { args: ['how long does delivery take', 0.0, 3], expected: ['d2', 'd6', 'd8'], name: 'vector only' },
      { args: ['tracking number for my parcel', 0.5, 2], expected: ['d8', 'd6'], name: 'top_n limits the result' },
      { args: ['zzz qqq', 0.5, 3], expected: ['d7', 'd4', 'd6'], name: 'no keyword hits' },
      { args: ['reset password', 0.3, 3], expected: ['d3', 'd4', 'd8'] },
    ],
    hints: ['Build two parallel lists (keyword, vector) in the order of `docs`, normalise each with the same helper, then zip them back with the doc ids.', 'Min-max: `(x - lo) / (hi - lo)` when `hi > lo`, otherwise 0.0. Sort the combined `(score, id)` tuples with `key=lambda t: (-t[0], t[1])`.'],
    combines: ['rag-rrf', 'rag-vector-search'],
  },
  quiz: [
    {
      prompt: 'Which query most clearly benefits from adding keyword search to a vector search?',
      options: ['"how do I get my money back"', '"error E-4012 on checkout"', '"something feels slow"', '"explain refunds simply"'],
      answer: 1,
      explain: 'Exact identifiers like E-4012 carry no paraphrasable meaning; embeddings blur them, while keyword matching pins them down.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
