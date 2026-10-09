import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { DOCS, PY_CORPUS, SIM_NOTE, cosine, crossScore, kvPanel, r3, tfVec } from '@/content/lib/ai-finish-1';

const code = `
def rerank(query, candidates, score_fn, top_k):
    scored = [(score_fn(query, c["text"]), i, c["id"])         #@score
              for i, c in enumerate(candidates)]
    scored.sort(key=lambda t: (-t[0], t[1]))                   #@sort
    return [cid for _, _, cid in scored[:top_k]]               #@top

def two_stage(query, docs, n, k):
    first = vector_search(query, docs, n)                      #@first
    return rerank(query, first, cross_score, k)                #@second
`;

interface Case {
  label: string;
  question: string;
  gold: string;
}

const CASES: Case[] = [
  { label: 'delivery warranty', question: 'what is the delivery warranty', gold: 'd6' },
  { label: 'money back', question: 'How do I get my money back?', gold: 'd5' },
  { label: 'package missing', question: "My package hasn't shown up, what now?", gold: 'd8' },
  { label: 'forgot password', question: 'forgot my password to sign in', gold: 'd3' },
];
const LABELS = CASES.map((c) => c.label);

interface In {
  question: string;
  n: number;
  k: number;
}

function setup(i: In) {
  const c = CASES.find((x) => x.label === i.question);
  if (!c) throw new Error('Pick one of: ' + LABELS.join(', '));
  if (!Number.isInteger(i.n) || i.n < 1 || i.n > DOCS.length) throw new Error(`n must be a whole number from 1 to ${DOCS.length}`);
  if (!Number.isInteger(i.k) || i.k < 1 || i.k > i.n) throw new Error('k must be a whole number from 1 to n');
  return { c, n: i.n, k: i.k };
}

function firstStage(q: string, n: number): { id: string; s: number }[] {
  const qv = tfVec(q);
  return DOCS.map((d) => ({ id: d.id, s: cosine(qv, tfVec(d.text)) }))
    .sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1))
    .slice(0, n);
}

const viz: VizDef<In> = {
  id: 'rag-rerank',
  title: 'Two-stage retrieval: retrieve, then rerank',
  code,
  language: 'python',
  inputs: [
    { key: 'question', label: 'Question', kind: 'select', default: LABELS[0], options: LABELS },
    { key: 'n', label: 'Stage 1: candidates fetched (n)', kind: 'number', default: 5 },
    { key: 'k', label: 'Final: results kept (k)', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Reranker pulls the gold up', input: { question: LABELS[0], n: 5, k: 3 } },
    { label: 'Gold is outside stage 1 (n too small)', input: { question: LABELS[1], n: 3, k: 2 } },
    { label: 'Same question, wider net', input: { question: LABELS[1], n: 8, k: 2 } },
    { label: 'Already right', input: { question: LABELS[3], n: 4, k: 3 } },
  ],
  run(input) {
    const { c, n, k } = setup(input);
    const r = new Recorder(code);
    const first = firstStage(c.question, n);
    const ids = first.map((x) => x.id);
    const goldBefore = ids.indexOf(c.gold) + 1;
    const cross: Record<string, number> = {};
    const rows: (string | number)[][] = first.map((x, i) => [i + 1, r3(x.s), '', '']);
    const table = (title: string, tones: Record<string, Tone> = {}) => ({
      type: 'grid' as const,
      title,
      cells: rows.map((row) => [...row]),
      rowLabels: ids.map((id) => (id === c.gold ? id + ' (gold)' : id)),
      colLabels: ['stage-1 rank', 'stage-1 score', 'cross score', 'new rank'],
      tones,
    });

    r.step('first', `Question: "${c.question}". The answer is ${c.gold}.`, [{ type: 'note', text: `Stage 1 is cheap: each document is scored on its own. Stage 2 is precise: the pair (question, document) is scored together.`, tone: 'default' }], { n, k });
    r.op(DOCS.length);
    r.step('first', goldBefore ? `Stage 1 returns ${n} candidates; ${c.gold} sits at #${goldBefore}` : `Stage 1 returns ${n} candidates and ${c.gold} is NOT among them`, [table('Candidates from stage 1', goldBefore ? { [`${goldBefore - 1},0`]: 'found', [`${goldBefore - 1},1`]: 'found' } : {})], { candidates: ids.join(' '), gold_rank: goldBefore || 'missing' });

    first.forEach((x, i) => {
      r.op();
      const d = DOCS.find((dd) => dd.id === x.id)!;
      cross[x.id] = crossScore(c.question, d.text);
      rows[i][2] = r3(cross[x.id]);
      r.step('score', `Cross-scorer reads question + ${x.id} together: ${r3(cross[x.id])}`, [table('Cross-scoring each candidate', { [`${i},2`]: 'new' })], { doc: x.id, cross: r3(cross[x.id]) });
    });

    const scored = first.map((x, i) => ({ id: x.id, i, s: cross[x.id] })).sort((a, b) => b.s - a.s || a.i - b.i);
    scored.forEach((x, pos) => (rows[x.i][3] = pos + 1));
    const final = scored.slice(0, k).map((x) => x.id);
    const goldAfter = final.includes(c.gold) ? final.indexOf(c.gold) + 1 : 0;
    const tones: Record<string, Tone> = {};
    scored.forEach((x, pos) => (tones[`${x.i},3`] = pos < k ? 'found' : 'muted'));
    r.step('sort', `Sort by cross score (ties keep stage-1 order): ${scored.map((x) => x.id).join(' > ')}`, [table('After reranking', tones)], { order: scored.map((x) => x.id).join(' ') });

    const gAll = scored.findIndex((x) => x.id === c.gold) + 1;
    const verdict = !goldBefore ? `${c.gold} never reached stage 2: a reranker cannot add documents` : gAll && gAll < goldBefore ? `${c.gold} moved from #${goldBefore} to #${gAll}` : gAll === goldBefore ? `${c.gold} stays at #${goldBefore}` : `${c.gold} dropped from #${goldBefore} to #${gAll}`;
    r.step(
      'top',
      `Keep the top ${k}: ${final.join(', ')}. ${verdict}`,
      [
        { type: 'list', title: 'Before (stage 1)', orientation: 'horizontal', items: ids.slice(0, k).map((id) => ({ label: id, tone: (id === c.gold ? 'found' : 'muted') as Tone })) },
        { type: 'list', title: 'After (reranked)', orientation: 'horizontal', items: final.map((id) => ({ label: id, tone: (id === c.gold ? 'found' : 'frontier') as Tone })) },
        kvPanel('Gold document', { before: goldBefore || 'missing', after: goldAfter || (goldBefore ? 'dropped' : 'missing') }, { after: goldAfter ? 'found' : 'error' }),
      ],
      { final: final.join(' ') },
    );
    return { frames: r.frames, result: { first: ids, final, goldBefore, goldAfter } };
  },
  reference(input) {
    const { c, n, k } = setup(input);
    const q = tfVec(c.question);
    const order = [...DOCS].map((d) => ({ d, s: cosine(q, tfVec(d.text)) }));
    order.sort((a, b) => (a.s === b.s ? a.d.id.localeCompare(b.d.id) : b.s - a.s));
    const first = order.slice(0, n).map((x) => x.d);
    const re = first.map((d, i) => ({ id: d.id, i, s: crossScore(c.question, d.text) }));
    re.sort((a, b) => (a.s === b.s ? a.i - b.i : b.s - a.s));
    const final = re.slice(0, k).map((x) => x.id);
    return { first: first.map((d) => d.id), final, goldBefore: first.findIndex((d) => d.id === c.gold) + 1, goldAfter: final.indexOf(c.gold) + 1 };
  },
};

const HARNESS =
  PY_CORPUS +
  `import re

def _words(s):
    return set(re.findall(r"[a-z]+", s.lower()))

SCORERS = {
    "overlap": lambda q, t: float(len(_words(q) & _words(t))),
    "short": lambda q, t: -float(len(t)),
    "zero": lambda q, t: 0.0,
}

def run_rerank(fn, query, ids, mode, top_k):
    cands = [d for i in ids for d in CORPUS if d["id"] == i]
    return fn(query, cands, SCORERS[mode], top_k)
`;

const tests = [
  { args: ['how long does delivery take', ['d1', 'd2', 'd3', 'd6', 'd8'], 'overlap', 2], expected: ['d2', 'd6'], name: 'best overlap first' },
  { args: ['anything', ['d8', 'd7', 'd1', 'd2'], 'short', 3], expected: ['d1', 'd2', 'd7'], name: 'custom scoring function' },
  { args: ['x', ['d5', 'd3', 'd1', 'd2'], 'zero', 3], expected: ['d5', 'd3', 'd1'], name: 'ties keep the stage-1 order' },
  { args: ['delivery days', ['d1', 'd3', 'd4', 'd7', 'd2'], 'overlap', 1], expected: ['d2'], name: 'a candidate from deep in the list can win' },
  { args: ['x', ['d5', 'd3'], 'zero', 9], expected: ['d5', 'd3'], name: 'top_k larger than the candidates' },
  { args: ['x', [], 'overlap', 3], expected: [], name: 'no candidates' },
  { args: ['the delivery takes days', ['d6', 'd2', 'd8'], 'overlap', 3], expected: ['d2', 'd6', 'd8'], name: 'all candidates reordered' },
];

const unit: Unit = {
  id: 'rag-rerank',
  hook: 'A fast retriever gets the right chunk into the top 50 but often not the top 3. A reranker reads question and chunk together to fix the order, and "why not just use the reranker for everything?" is the classic follow-up.',
  predict: {
    prompt: 'The vector search returns 5 candidates and the right document is not among them. Will adding a reranker on those 5 fix it?',
    options: ['Yes, a good reranker always finds the right document', 'No: a reranker only reorders what stage 1 returned', 'Yes, but only if you rerank twice', 'Only if the reranker is larger than the embedding model'],
    answer: 1,
    explain: 'A reranker is a re-orderer, not a retriever. If the gold document is missing from the candidates, nothing downstream can bring it back. Fetch a wider stage-1 pool (for example 50) so recall is high, then let the reranker sharpen precision.',
  },
  viz,
  deeper: {
    points: [
      'Stage 1 (bi-encoder or BM25) embeds documents independently, so it is fast and the vectors can be precomputed; it trades accuracy for speed.',
      'Stage 2 (cross-encoder) feeds the query and one document together through a model, which is much more accurate but costs one model call per candidate.',
      'That cost is why you rerank only the top n (tens), never the whole corpus.',
      'Choose n to balance recall of stage 1 against latency of stage 2, and k to fit the prompt budget.',
      'Break score ties by the stage-1 rank so results stay stable.',
    ],
    complexity: { time: 'O(n) cross-scorer calls plus O(n log n) sort', space: 'O(n)' },
    pitfalls: ['Cutting candidates to top_k before reranking', 'Reranking too few candidates to ever help', 'Unstable tie-breaks that reshuffle equal scores', 'Forgetting the extra latency per candidate'],
  },
  practice: {
    language: 'python',
    fnName: 'rerank',
    statement: 'Implement `rerank(query, candidates, score_fn, top_k)`. `candidates` is a list of {"id","text"} in stage-1 order. Score every candidate with `score_fn(query, text)`, sort by score descending (ties keep the original order) and return the first `top_k` ids.',
    signature: 'def rerank(query, candidates, score_fn, top_k):',
    solution: `def rerank(query, candidates, score_fn, top_k):
    scored = [(score_fn(query, c["text"]), i, c["id"]) for i, c in @@enumerate(candidates)@@]
    scored.sort(key=lambda t: (@@-t[0]@@, @@t[1]@@))
    return [cid for _, _, cid in @@scored[:top_k]@@]`,
    harness: HARNESS,
    adapter: 'run_rerank',
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'rerank',
    statement: 'The reranker never promotes a good document that stage 1 ranked low. Find the bug.',
    harness: HARNESS,
    adapter: 'run_rerank',
    buggy: `def rerank(query, candidates, score_fn, top_k):
    scored = [(score_fn(query, c["text"]), i, c["id"]) for i, c in enumerate(candidates[:top_k])]
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [cid for _, _, cid in scored]`,
    fixed: `def rerank(query, candidates, score_fn, top_k):
    scored = [(score_fn(query, c["text"]), i, c["id"]) for i, c in enumerate(candidates)]
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [cid for _, _, cid in scored[:top_k]]`,
    tests,
    bugType: 'truncating before scoring',
    hint: 'Where is the list cut to top_k: before the scoring, or after the sort?',
    explanation: 'Slicing the candidates to `top_k` first means the reranker can only shuffle the documents stage 1 already put on top, so a better document at position 5 never gets scored. Score all candidates, sort, and only then cut to `top_k`.',
  },
  boss: {
    title: 'Retrieve, then rerank',
    statement:
      'Implement `two_stage(query, docs, n, k)` (`docs` is a list of {"id","text"}; always embed with `dim=64`). Stage 1: score every doc by the dot product of `embed(query, dim=64)` and `embed(doc["text"], dim=64)`, sort by score desc then id, keep the first `n`. Stage 2: rerank those `n` by the number of distinct lowercase words (`re.findall(r"[a-z]+", ...)`) they share with the query, descending, ties keeping the stage-1 order, and keep the first `k`. Return {"first": stage-1 ids, "final": reranked ids}.',
    language: 'python',
    fnName: 'two_stage',
    harness:
      PY_CORPUS +
      `
def run_two(fn, query, n, k):
    docs = [{"id": d["id"], "text": d["text"]} for d in CORPUS]
    return fn(query, docs, n, k)
`,
    adapter: 'run_two',
    starter: `import re
from minillm import embed

def two_stage(query, docs, n, k):
    # your code here
    pass
`,
    solution: `import re
from minillm import embed

def two_stage(query, docs, n, k):
    q = embed(query, dim=64)
    ranked = sorted(docs, key=lambda d: (-sum(a * b for a, b in zip(q, embed(d["text"], dim=64))), d["id"]))
    first = ranked[:n]
    words = set(re.findall(r"[a-z]+", query.lower()))
    scored = [(len(words & set(re.findall(r"[a-z]+", d["text"].lower()))), i, d["id"]) for i, d in enumerate(first)]
    scored.sort(key=lambda t: (-t[0], t[1]))
    return {"first": [d["id"] for d in first], "final": [cid for _, _, cid in scored[:k]]}`,
    tests: [
      { args: ['what is the delivery warranty', 4, 3], expected: { first: ['d2', 'd5', 'd6', 'd7'], final: ['d6', 'd2', 'd5'] }, name: 'the reranker lifts d6 to the top' },
      { args: ['what is the delivery warranty', 2, 2], expected: { first: ['d2', 'd5'], final: ['d2', 'd5'] }, name: 'n too small: d6 is never seen' },
      { args: ['can I get a refund on my parcel', 6, 3], expected: { first: ['d7', 'd8', 'd6', 'd3', 'd5', 'd1'], final: ['d8', 'd7', 'd3'] }, name: 'a wider pool' },
      { args: ['password code for sign-in and account', 4, 3], expected: { first: ['d3', 'd5', 'd4', 'd2'], final: ['d3', 'd4', 'd5'] } },
      { args: ['how many days to get money back for returned items', 4, 2], expected: { first: ['d5', 'd8', 'd7', 'd2'], final: ['d5', 'd2'] } },
      { args: ['zzz', 3, 2], expected: { first: ['d3', 'd4', 'd7'], final: ['d3', 'd4'] }, name: 'no shared words: stage-1 order is kept' },
    ],
    hints: ['Stage 1 is a sort by `(-dot, id)` then a slice `[:n]`. Keep the doc dicts, not just ids, so stage 2 can read their text.', 'Stage 2: build `(overlap, original_index, id)` tuples, sort by `(-overlap, original_index)`, slice `[:k]`. The original index keeps ties in stage-1 order.'],
    combines: ['rag-vector-search', 'rag-hybrid'],
  },
  quiz: [
    {
      prompt: 'Why is a cross-encoder reranker applied only to the top few dozen candidates?',
      options: ['It is less accurate than a bi-encoder', 'It needs one model call per (query, document) pair, which is too slow for the whole corpus', 'It cannot read long documents', 'It only works on 10 documents'],
      answer: 1,
      explain: 'Cross-encoders cannot precompute document vectors; each candidate costs a forward pass, so they run on a small shortlist.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
