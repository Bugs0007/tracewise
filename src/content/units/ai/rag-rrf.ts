import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { PY_DOCS, SIM_NOTE, kvPanel, r4 } from '@/content/lib/ai-rag2-langgraph';

const code = `
def rrf(rankings, k=60):
    scores = {}                                              #@init
    for ranking in rankings:                                 #@list
        for rank, doc in enumerate(ranking, start=1):        #@rank
            scores[doc] = scores.get(doc, 0) + 1 / (k + rank)   #@add
    return sorted(scores, key=lambda d: (-scores[d], d))     #@sort
`;

interface In {
  keyword: string[];
  vector: string[];
  k: number;
}

function clean(i: In) {
  const keyword = i.keyword.map((s) => s.trim()).filter(Boolean);
  const vector = i.vector.map((s) => s.trim()).filter(Boolean);
  for (const l of [keyword, vector]) if (new Set(l).size !== l.length) throw new Error('A ranked list should not repeat a document');
  if (!(i.k >= 0)) throw new Error('k must be 0 or more');
  return { keyword, vector, k: i.k };
}

function sortIds(scores: Record<string, number>): string[] {
  return Object.keys(scores).sort((a, b) => (scores[a] === scores[b] ? (a < b ? -1 : 1) : scores[b] - scores[a]));
}

const viz: VizDef<In> = {
  id: 'rag-rrf',
  title: 'Reciprocal rank fusion',
  code,
  language: 'python',
  inputs: [
    { key: 'keyword', label: 'Keyword ranking (best first)', kind: 'strings', default: ['d7', 'd4', 'd1', 'd2', 'd5'], maxItems: 8 },
    { key: 'vector', label: 'Vector ranking (best first)', kind: 'strings', default: ['d2', 'd7', 'd9', 'd6', 'd4'], maxItems: 8 },
    { key: 'k', label: 'k (damping constant)', kind: 'number', default: 60 },
  ],
  presets: [
    { label: 'Default k=60', input: { keyword: ['d7', 'd4', 'd1', 'd2', 'd5'], vector: ['d2', 'd7', 'd9', 'd6', 'd4'], k: 60 } },
    { label: 'Small k=1 (top ranks dominate)', input: { keyword: ['a', 'b', 'c'], vector: ['c', 'a', 'b'], k: 1 } },
    { label: 'No overlap', input: { keyword: ['a', 'b', 'c'], vector: ['x', 'y', 'z'], k: 60 } },
    { label: 'One list is empty', input: { keyword: [], vector: ['d3', 'd8'], k: 60 } },
  ],
  run(input) {
    const { keyword, vector, k } = clean(input);
    const r = new Recorder(code);
    const lists = [keyword, vector];
    const names = ['keyword', 'vector'];
    const scores: Record<string, number> = {};
    const contribs: Record<string, string[]> = {};
    let hit: string | null = null;
    const view = (cur?: { li: number; i: number }, finished = false): Panel[] => {
      const arr = (li: number): ArrayPanel => {
        const tones: Record<number, Tone> = {};
        lists[li].forEach((_, i) => {
          if (finished) tones[i] = 'done';
          else if (cur && (li < cur.li || (li === cur.li && i < cur.i))) tones[i] = 'visited';
          else if (cur && li === cur.li && i === cur.i) tones[i] = 'active';
        });
        return {
          type: 'array',
          title: `${names[li]} ranking`,
          values: lists[li].length ? lists[li] : ['(empty)'],
          tones,
          pointers: cur && cur.li === li && cur.i >= 0 ? { rank: cur.i } : undefined,
          indexLabels: lists[li].length ? lists[li].map((_, i) => '#' + (i + 1)) : [''],
        };
      };
      const ids = finished ? sortIds(scores) : Object.keys(scores);
      const table = kvPanel(
        finished ? 'Final scores (sorted)' : 'Score table',
        Object.fromEntries(ids.map((d) => [d, String(r4(scores[d])) + (contribs[d].length > 1 ? '  = ' + contribs[d].join(' + ') : '')])),
        hit ? { [hit]: 'new' } : {},
      );
      return [arr(0), arr(1), table];
    };
    r.step('init', `scores = {} (k = ${k}); each list adds 1/(k + rank) per document`, view(), { k });
    lists.forEach((list, li) => {
      r.step('list', list.length ? `Read the ${names[li]} list (${list.length} documents)` : `The ${names[li]} list is empty, so it adds nothing`, view({ li, i: -1 }), { list: names[li] });
      list.forEach((doc, i) => {
        r.op();
        const rank = i + 1;
        const add = 1 / (k + rank);
        scores[doc] = (scores[doc] ?? 0) + add;
        (contribs[doc] ??= []).push(String(r4(add)));
        hit = doc;
        r.step('add', `${names[li]} #${rank}: ${doc} += 1/(${k}+${rank}) = ${r4(add)} → ${r4(scores[doc])}`, view({ li, i }), { doc, rank, score: r4(scores[doc]) });
      });
    });
    hit = null;
    const order = sortIds(scores);
    r.step('sort', order.length ? `Sort by score, ties by id: ${order.join(' > ')}` : 'Nothing to fuse', view(undefined, true), { top: order[0] ?? 'none' });
    return { frames: r.frames, result: order };
  },
  reference(input) {
    const { keyword, vector, k } = clean(input);
    const ids = [...new Set([...keyword, ...vector])];
    const score = (d: string) => {
      let s = 0;
      for (const l of [keyword, vector]) {
        const idx = l.indexOf(d);
        if (idx >= 0) s += 1 / (k + idx + 1);
      }
      return s;
    };
    return ids
      .map((d) => ({ d, s: score(d) }))
      .sort((a, b) => (a.s === b.s ? (a.d < b.d ? -1 : 1) : b.s - a.s))
      .map((x) => x.d);
  },
};

const tests = [
  { args: [[['a', 'b', 'c'], ['b', 'c', 'a']], 60], expected: ['b', 'a', 'c'], name: 'two lists agree on b' },
  { args: [[['a', 'b', 'c']], 60], expected: ['a', 'b', 'c'], name: 'one list keeps its order' },
  { args: [[['a', 'b'], ['c', 'a', 'b']], 1], expected: ['a', 'b', 'c'], name: 'small k, rank starts at 1' },
  { args: [[['x', 'y'], ['z', 'w']], 60], expected: ['x', 'z', 'w', 'y'], name: 'no overlap: ties broken by id' },
  { args: [[[], ['p', 'q']], 60], expected: ['p', 'q'], name: 'an empty list' },
  { args: [[], 60], expected: [], name: 'no lists' },
];

const unit: Unit = {
  id: 'rag-rrf',
  hook: 'Hybrid search gives you two rankings with incomparable scores (BM25 vs cosine). Reciprocal rank fusion merges them using only the ranks, and it is the first answer interviewers expect to "how do you combine keyword and vector search?"',
  predict: {
    prompt: 'With k = 60, document X is #1 in the keyword list but absent from the vector list. Document Y is #3 in both lists. Which one is ranked higher after RRF?',
    options: ['X, because a #1 position beats everything', 'Y, because appearing in both lists adds up', 'They tie', 'It depends on the raw BM25 and cosine scores'],
    answer: 1,
    explain: 'X scores 1/61 = 0.0164. Y scores 1/63 + 1/63 = 0.0317. Agreement between retrievers beats one lonely top rank, and raw scores are never used.',
  },
  viz,
  deeper: {
    points: [
      'Score = sum over lists of 1/(k + rank). Ranks are 1-based; a document missing from a list simply adds nothing.',
      'It needs no score normalisation, which is the whole point: BM25 scores are unbounded, cosines live in [-1, 1].',
      'k controls how much the top ranks dominate. A small k makes #1 worth far more than #2; the common default of 60 flattens the curve so agreement matters more.',
      'Fusion can only reorder what the retrievers returned. If a document is in neither list, no k will bring it back, so retrieve a generous top-N from each side first.',
      'Break ties deterministically (here by id) so results are stable between runs.',
    ],
    complexity: { time: 'O(N log N) for N distinct documents', space: 'O(N)' },
    pitfalls: ['Starting the rank at 0 (k=0 divides by zero, small k skews the order)', 'Fusing raw scores instead of ranks', 'A duplicate inside one list would be counted twice', 'Tuning k on a handful of queries'],
  },
  practice: {
    language: 'python',
    fnName: 'rrf',
    statement: 'Implement `rrf(rankings, k=60)`. `rankings` is a list of ranked lists of document ids (best first). Give each document `1/(k + rank)` per list it appears in (rank starts at 1), add them up, and return the ids sorted by total score, highest first, breaking ties by id.',
    signature: 'def rrf(rankings, k=60):',
    solution: `def rrf(rankings, k=60):
    scores = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking, start=@@1@@):
            scores[doc] = scores.get(doc, 0) + @@1 / (k + rank)@@
    return sorted(scores, key=lambda d: (@@-scores[d]@@, d))`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'rrf',
    statement: 'This fusion looks right on most queries, but with a small `k` the final order is wrong. Find the bug.',
    buggy: `def rrf(rankings, k=60):
    scores = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking):
            scores[doc] = scores.get(doc, 0) + 1 / (k + rank)
    return sorted(scores, key=lambda d: (-scores[d], d))`,
    fixed: `def rrf(rankings, k=60):
    scores = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking, start=1):
            scores[doc] = scores.get(doc, 0) + 1 / (k + rank)
    return sorted(scores, key=lambda d: (-scores[d], d))`,
    tests,
    bugType: 'off-by-one rank',
    hint: 'What does `enumerate` return for the first item? Should the best document have rank 0 or rank 1?',
    explanation: '`enumerate` starts at 0, so the best document is scored 1/(k+0). The formula is defined on 1-based ranks. With k=60 the error hides; with k=1 it flips the order (and k=0 would divide by zero). Use `enumerate(ranking, start=1)`.',
  },
  boss: {
    title: 'Hybrid search with fusion',
    statement:
      'Implement `hybrid_search(query, docs, k=60, top_n=3)`. `docs` is a list of {"id","text"} (a global `DOCS` list and `DIM = 64` exist). Build two rankings: (1) keyword: score = how many distinct lowercase letter-words of the query (`re.findall(r"[a-z]+", ...)`) appear in the doc text; keep only docs with score > 0, sort by score desc then id. (2) vector: dot product of `embed(query, dim=DIM)` and `embed(doc["text"], dim=DIM)`, sorted desc then id (all docs). Fuse with reciprocal rank fusion (rank starts at 1) and return the first `top_n` ids.',
    language: 'python',
    fnName: 'hybrid_search',
    harness:
      PY_DOCS +
      `
def run_hybrid(fn, query, k, top_n):
    return fn(query, DOCS, k, top_n)
`,
    adapter: 'run_hybrid',
    starter: `import re
from minillm import embed

def hybrid_search(query, docs, k=60, top_n=3):
    # your code here
    pass
`,
    solution: `import re
from minillm import embed

def hybrid_search(query, docs, k=60, top_n=3):
    words = set(re.findall(r"[a-z]+", query.lower()))
    keyword = []
    for d in docs:
        score = len(words & set(re.findall(r"[a-z]+", d["text"].lower())))
        if score > 0:
            keyword.append((d["id"], score))
    keyword.sort(key=lambda t: (-t[1], t[0]))

    q = embed(query, dim=DIM)
    vector = []
    for d in docs:
        v = embed(d["text"], dim=DIM)
        vector.append((d["id"], sum(a * b for a, b in zip(q, v))))
    vector.sort(key=lambda t: (-t[1], t[0]))

    scores = {}
    for ranking in ([i for i, _ in keyword], [i for i, _ in vector]):
        for rank, doc in enumerate(ranking, start=1):
            scores[doc] = scores.get(doc, 0) + 1 / (k + rank)
    return sorted(scores, key=lambda d: (-scores[d], d))[:top_n]`,
    tests: [
      { args: ['how long does delivery take', 60, 3], expected: ['d2', 'd6', 'd8'], name: 'both retrievers agree' },
      { args: ['reset my password', 60, 3], expected: ['d3', 'd8', 'd5'] },
      { args: ['tracking number for my parcel', 60, 2], expected: ['d8', 'd6'], name: 'top_n limits the result' },
      { args: ['zzz qqq', 60, 3], expected: ['d7', 'd4', 'd6'], name: 'no keyword hits: vector only' },
      { args: ['sign-in code', 1, 3], expected: ['d4', 'd3', 'd5'], name: 'small k' },
    ],
    hints: ['Build the two ranked id lists first, then fuse them with the same loop as `rrf`. The keyword list only contains documents with at least one shared word.', 'Sort each list with `key=lambda t: (-score, id)`, fuse with `1 / (k + rank)` for rank starting at 1, then slice `[:top_n]`.'],
    combines: ['rag-hybrid', 'rag-vector-search'],
  },
  quiz: [
    {
      prompt: 'Why does RRF use ranks instead of the raw scores of each retriever?',
      options: ['Ranks are faster to compute', 'BM25 and cosine scores are on different scales and cannot be compared or added', 'Raw scores are always equal', 'Ranks are more accurate'],
      answer: 1,
      explain: 'A BM25 score of 12.3 and a cosine of 0.71 mean unrelated things. Ranks are comparable across any retriever.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
