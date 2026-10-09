import { Recorder } from '@/engine/recorder';
import type { GraphPanel, ListPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { DOCS, DOC_BY_ID, HYDE_CASES, PY_DOCS, SIM_NOTE, kvPanel, r2, rankDocs, tfVec, type Ranked } from '@/content/lib/ai-rag2-langgraph';

const code = `
def hyde_search(question, docs, llm, k=3):
    plain = rank(embed(question), docs)                       #@plain
    hypo = llm.complete("Write a short passage that answers: " + question)   #@hypo
    q = embed(hypo)                                           #@embed
    hyde = rank(q, docs)                                      #@rank
    return hyde[:k]                                           #@ret
`;

interface In {
  question: string;
  override: string;
  k: number;
}

const OPTIONS = HYDE_CASES.map((c) => c.label);

function setup(i: In) {
  const c = HYDE_CASES.find((x) => x.label === i.question);
  if (!c) throw new Error('Pick one of: ' + OPTIONS.join(', '));
  const k = Math.max(1, Math.min(5, Math.round(i.k) || 3));
  const hypo = i.override.trim() || c.hypo;
  return { c, k, hypo };
}

/** Schematic 2-D position: documents pull the point towards them in proportion to similarity squared. */
function place(ranked: Ranked[]): { x: number; y: number } {
  let wx = 0;
  let wy = 0;
  let w = 0;
  for (const s of ranked) {
    const wt = s.score * s.score + 0.01;
    wx += wt * DOC_BY_ID[s.id].x;
    wy += wt * DOC_BY_ID[s.id].y;
    w += wt;
  }
  return { x: Math.round(wx / w), y: Math.round(wy / w) };
}

const viz: VizDef<In> = {
  id: 'rag-hyde',
  title: 'HyDE: search with a hypothetical answer',
  code,
  language: 'python',
  inputs: [
    { key: 'question', label: 'Question', kind: 'select', default: OPTIONS[0], options: OPTIONS, help: 'Each question comes with the answer the mock LLM would draft.' },
    { key: 'override', label: 'Hypothetical answer (blank = mock LLM)', kind: 'string', default: '', help: 'Type your own passage to see how sensitive retrieval is to it.' },
    { key: 'k', label: 'Top k', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'No shared words', input: { question: 'money back' } },
    { label: 'Already works', input: { question: 'package missing' } },
    { label: 'Locked out', input: { question: 'locked out' } },
    { label: 'LLM drifts off topic', input: { question: 'warranty (bad hypothesis)' } },
  ],
  run(input) {
    const { c, k, hypo } = setup(input);
    const r = new Recorder(code);
    const plainRank = rankDocs(tfVec(c.question));
    const hydeRank = rankDocs(tfVec(hypo));
    const pos = (ranked: Ranked[], id: string) => ranked.findIndex((s) => s.id === id) + 1;
    const goldPlain = pos(plainRank, c.gold);
    const goldHyde = pos(hydeRank, c.gold);

    const space = (qPoint?: Ranked[], hPoint?: Ranked[], shown?: Ranked[]): GraphPanel => {
      const top = new Set((shown ?? []).slice(0, k).map((s) => s.id));
      const nodes: GraphPanel['nodes'] = DOCS.map((d) => {
        let tone: Tone = 'default';
        if (shown) tone = top.has(d.id) ? 'frontier' : 'muted';
        if (shown && d.id === c.gold) tone = top.has(d.id) ? 'found' : 'error';
        const s = shown?.find((x) => x.id === d.id);
        return { id: d.id, label: d.id, x: d.x, y: d.y, shape: 'circle', tone, badge: s ? String(r2(s.score)) : d.id === c.gold ? 'answer' : undefined };
      });
      if (qPoint) nodes.push({ id: 'Q', label: 'Q', ...place(qPoint), shape: 'rect', w: 28, h: 24, tone: hPoint ? 'muted' : 'active' });
      if (hPoint) nodes.push({ id: 'H', label: 'H', ...place(hPoint), shape: 'rect', w: 28, h: 24, tone: 'active' });
      return { type: 'graph', title: 'Embedding space (schematic 2-D map)', nodes, edges: [], width: 400, height: 380, axes: true };
    };
    const rankList = (title: string, ranked: Ranked[]): ListPanel => ({
      type: 'list',
      title,
      orientation: 'vertical',
      items: ranked.slice(0, Math.max(k, 3)).map((s, i) => ({
        label: `${i + 1}. ${s.id}`,
        sub: `score ${r2(s.score)}`,
        tone: s.id === c.gold ? (i < k ? 'found' : 'error') : i < k ? 'frontier' : 'muted',
      })),
    });
    const note = (text: string, tone: Tone = 'default'): Panel => ({ type: 'note', text, tone });

    r.step('plain', `Question: "${c.question}" — the right document is ${c.gold}`, [space(), note(`Docs ${DOCS.map((d) => d.id).join(' ')} are embedded. ${c.gold} holds the answer.`)], { question: c.label, k });
    const scoring = (label: string, anchor: string, ranked: Ranked[], target: string) => {
      const seen: Record<string, number> = {};
      for (const d of DOCS) {
        r.op();
        seen[d.id] = r2(ranked.find((x) => x.id === d.id)!.score);
        r.step(anchor, `${d.id}: similarity to the ${target} = ${seen[d.id]}`, [space(), kvPanel(`Scores vs ${label}`, seen, { [d.id]: 'new' })], { doc: d.id, score: seen[d.id] });
      }
    };
    scoring('question', 'plain', plainRank, 'question');
    const plainNote =
      goldPlain <= k ? `Embedding the question itself already finds ${c.gold} at #${goldPlain}.` : `Embedding the question puts ${c.gold} at #${goldPlain}: the words do not match.`;
    r.step('plain', plainNote, [space(plainRank, undefined, plainRank), rankList('Without HyDE', plainRank)], { 'gold rank (plain)': goldPlain });
    r.step('hypo', 'Ask the LLM to write a plausible answer (it may be wrong, that is fine)', [space(plainRank), { type: 'log', title: 'Mock LLM draft', lines: [{ text: hypo, tone: 'active' }] }], { llm_calls: 1 });
    r.op();
    r.step('embed', 'Embed the draft instead of the question', [space(plainRank, hydeRank), { type: 'log', title: 'Mock LLM draft', lines: [{ text: hypo }] }], { embedded: 'hypo' });
    scoring('draft', 'rank', hydeRank, 'draft');
    r.step('rank', `Rank by similarity to the draft: ${c.gold} lands at #${goldHyde}`, [space(plainRank, hydeRank, hydeRank), rankList('With HyDE', hydeRank)], { 'gold rank (hyde)': goldHyde });
    const better = goldHyde < goldPlain;
    const worse = goldHyde > goldPlain;
    r.step(
      'ret',
      better ? `HyDE moved ${c.gold} from #${goldPlain} to #${goldHyde}` : worse ? `HyDE hurt: ${c.gold} dropped from #${goldPlain} to #${goldHyde}` : `Same rank (#${goldPlain}) either way`,
      [kvPanel('Result', { 'plain top': plainRank.slice(0, k).map((s) => s.id).join(' '), 'HyDE top': hydeRank.slice(0, k).map((s) => s.id).join(' '), 'gold rank: plain': goldPlain, 'gold rank: HyDE': goldHyde }, { 'gold rank: HyDE': better ? 'found' : worse ? 'error' : 'default' }), rankList('Returned (HyDE)', hydeRank)],
      { returned: hydeRank.slice(0, k).map((s) => s.id).join(' ') },
    );
    return { frames: r.frames, result: { plain: plainRank.slice(0, k).map((s) => s.id), hyde: hydeRank.slice(0, k).map((s) => s.id), goldPlain, goldHyde } };
  },
  reference(input) {
    const { c, k, hypo } = setup(input);
    const order = (text: string) => {
      const q = tfVec(text);
      const sims = DOCS.map((d) => {
        const v = tfVec(d.text);
        let dot = 0;
        let nq = 0;
        let nv = 0;
        q.forEach((x) => (nq += x * x));
        v.forEach((x, key) => {
          nv += x * x;
          dot += x * (q.get(key) ?? 0);
        });
        return { id: d.id, s: nq && nv ? dot / Math.sqrt(nq * nv) : 0 };
      });
      return sims.sort((a, b) => b.s - a.s || a.id.localeCompare(b.id)).map((x) => x.id);
    };
    const p = order(c.question);
    const h = order(hypo);
    return { plain: p.slice(0, k), hyde: h.slice(0, k), goldPlain: p.indexOf(c.gold) + 1, goldHyde: h.indexOf(c.gold) + 1 };
  },
};

const HYPOS = Object.fromEntries(HYDE_CASES.map((c) => [c.question, c.hypo]));

const HARNESS =
  PY_DOCS +
  `from minillm import MockLLM

HYPOS = ${JSON.stringify(HYPOS)}

def run_hyde(fn, question, k):
    llm = MockLLM(HYPOS)
    ids = fn(question, DOCS, llm, k)
    return {"ids": ids, "calls": len(llm.calls)}
`;

const Q = HYDE_CASES.map((c) => c.question);

const tests = [
  { args: [Q[0], 3], expected: { ids: ['d5', 'd7', 'd8'], calls: 1 }, name: 'no shared words with the answer' },
  { args: [Q[1], 3], expected: { ids: ['d8', 'd2', 'd5'], calls: 1 }, name: 'one LLM call only' },
  { args: [Q[2], 3], expected: { ids: ['d3', 'd8', 'd6'], calls: 1 } },
  { args: [Q[0], 1], expected: { ids: ['d5'], calls: 1 }, name: 'k = 1' },
  { args: [Q[3], 2], expected: { ids: ['d2', 'd5'], calls: 1 }, name: 'follows a misleading hypothesis' },
];

const unit: Unit = {
  id: 'rag-hyde',
  hook: 'Questions and answers rarely share vocabulary, so the question embeds far from the document that answers it. HyDE lets an LLM write a fake answer first and searches with that, a favourite "how do you improve recall?" trick.',
  predict: {
    prompt: 'In HyDE the LLM does not know your company policy, so its hypothetical answer may contain wrong facts. Why does retrieval still improve?',
    options: ['It does not: wrong facts make the search worse', 'The draft only has to sound like a good answer (right vocabulary and shape) to land near the real documents; its facts are thrown away', 'The draft replaces the retrieved documents in the prompt', 'The LLM secretly reads the vector database'],
    answer: 1,
    explain: 'The draft is used only as a search query. It borrows the words and style of an answer ("returned within 30 days", "refund"), which sits closer to the real policy chunk than the short question does. The final answer is still generated from retrieved text.',
  },
  viz,
  deeper: {
    points: [
      'The pipeline is question → LLM draft → embed the draft → vector search → generate the real answer from the retrieved chunks.',
      'It fixes the question/answer vocabulary gap. It helps least when the question already uses the document\'s own words.',
      'Cost: one extra LLM call before every search, so extra latency and tokens. Cache drafts for repeated questions.',
      'Risk: if the draft drifts off topic (hallucinated or wrong domain), retrieval follows it. Mitigate by fusing with the plain-question ranking or averaging several drafts.',
      'Use a cheap, fast model for the draft; the quality bar is "plausible", not "correct".',
    ],
    complexity: { time: 'one LLM call + one embedding + one vector search', space: 'O(1) extra' },
    pitfalls: ['Embedding the question and ignoring the draft', 'Putting the draft in the final prompt as if it were evidence', 'Calling the LLM once per document instead of once per question', 'Trusting HyDE on queries that already match the corpus vocabulary'],
  },
  practice: {
    language: 'python',
    fnName: 'hyde_search',
    statement: 'Implement `hyde_search(question, docs, llm, k)`. Call `llm.complete(prompt)` exactly once (the prompt must contain the question) to get a hypothetical answer, embed THAT with `embed(text, dim=DIM)`, score every doc by the dot product with its embedding, and return the ids of the top `k` (ties by id). `DIM` is predefined; `docs` is a list of {"id","text"}.',
    signature: 'def hyde_search(question, docs, llm, k=3):',
    solution: `from minillm import embed

def hyde_search(question, docs, llm, k=3):
    hypo = llm.complete("Write a short passage that answers: " + @@question@@)
    q = embed(@@hypo@@, dim=DIM)
    scored = []
    for d in docs:
        v = embed(d["text"], dim=DIM)
        scored.append((@@sum(a * b for a, b in zip(q, v))@@, d["id"]))
    scored.sort(key=lambda t: (@@-t[0]@@, t[1]))
    return [doc_id for _, doc_id in scored[:k]]`,
    harness: HARNESS,
    adapter: 'run_hyde',
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'hyde_search',
    statement: 'The pipeline calls the LLM, but retrieval quality is exactly the same as plain vector search. Find out why.',
    harness: HARNESS,
    adapter: 'run_hyde',
    buggy: `from minillm import embed

def hyde_search(question, docs, llm, k=3):
    hypo = llm.complete("Write a short passage that answers: " + question)
    q = embed(question, dim=DIM)
    scored = []
    for d in docs:
        v = embed(d["text"], dim=DIM)
        scored.append((sum(a * b for a, b in zip(q, v)), d["id"]))
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [doc_id for _, doc_id in scored[:k]]`,
    fixed: `from minillm import embed

def hyde_search(question, docs, llm, k=3):
    hypo = llm.complete("Write a short passage that answers: " + question)
    q = embed(hypo, dim=DIM)
    scored = []
    for d in docs:
        v = embed(d["text"], dim=DIM)
        scored.append((sum(a * b for a, b in zip(q, v)), d["id"]))
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [doc_id for _, doc_id in scored[:k]]`,
    tests,
    bugType: 'wrong variable used',
    hint: 'Which variable holds the LLM draft, and which one is being embedded?',
    explanation: 'The draft is computed (and paid for) but `embed(question)` is what gets searched, so the whole pipeline degrades to plain vector search. Embed `hypo`.',
  },
  boss: {
    title: 'Multi-draft HyDE',
    statement:
      'Implement `hyde_multi(question, docs, llm, n, k)`. Call `llm.complete(...)` exactly `n` times to get `n` hypothetical answers, embed each with `embed(text, dim=DIM)`, average the `n` vectors element-wise into one query vector, score every doc by the dot product with its embedding, and return the top `k` ids (ties by id). `DIM` is predefined.',
    language: 'python',
    fnName: 'hyde_multi',
    harness:
      PY_DOCS +
      `from minillm import MockLLM

def run_multi(fn, question, drafts, k):
    llm = MockLLM(list(drafts))
    ids = fn(question, DOCS, llm, len(drafts), k)
    return {"ids": ids, "calls": len(llm.calls)}
`,
    adapter: 'run_multi',
    starter: `from minillm import embed

def hyde_multi(question, docs, llm, n, k=3):
    # your code here
    pass
`,
    solution: `from minillm import embed

def hyde_multi(question, docs, llm, n, k=3):
    drafts = [llm.complete("Write a short passage that answers: " + question) for _ in range(n)]
    vectors = [embed(t, dim=DIM) for t in drafts]
    q = [sum(col) / n for col in zip(*vectors)]
    scored = []
    for d in docs:
        v = embed(d["text"], dim=DIM)
        scored.append((sum(a * b for a, b in zip(q, v)), d["id"]))
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [doc_id for _, doc_id in scored[:k]]`,
    tests: [
      {
        args: [
          Q[0],
          [HYDE_CASES[0].hypo, 'A refund is issued to the original payment method after the returned item is received within 30 days.', 'Gift cards never expire and can be applied at checkout.'],
          3,
        ],
        expected: { ids: ['d5', 'd1', 'd7'], calls: 3 },
        name: 'three drafts, one is off',
      },
      {
        args: [Q[0], [HYDE_CASES[0].hypo, 'A refund is issued to the original payment method after the returned item is received within 30 days.'], 3],
        expected: { ids: ['d5', 'd7', 'd8'], calls: 2 },
        name: 'two drafts',
      },
      { args: [Q[0], ['Gift cards never expire and can be applied at checkout.'], 3], expected: { ids: ['d1', 'd5', 'd7'], calls: 1 }, name: 'a single misleading draft' },
      {
        args: [Q[2], [HYDE_CASES[2].hypo, 'A password reset link is emailed to you from the sign-in page.', 'Two-factor codes protect your account at sign-in.'], 3],
        expected: { ids: ['d3', 'd4', 'd8'], calls: 3 },
      },
      {
        args: [Q[2], [HYDE_CASES[2].hypo, 'A password reset link is emailed to you from the sign-in page.'], 2],
        expected: { ids: ['d3', 'd8'], calls: 2 },
        name: 'top 2 of 2 drafts',
      },
    ],
    hints: ['Collect the drafts first (a list comprehension that calls `llm.complete` n times), then embed each one.', 'Average column by column: `[sum(col) / n for col in zip(*vectors)]`, then score the docs against that averaged vector.'],
    combines: ['rag-vector-search', 'rag-embedding-index'],
  },
  quiz: [
    {
      prompt: 'For which question does HyDE help the LEAST?',
      options: ['A vague question with none of the document\'s words', 'A question that already quotes the exact error message found in the docs', 'A very short question', 'A question phrased in everyday language'],
      answer: 1,
      explain: 'If the question already shares the document\'s vocabulary, plain search finds it and the extra LLM call only adds latency and drift risk.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
