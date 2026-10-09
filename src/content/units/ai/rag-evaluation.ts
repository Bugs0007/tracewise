import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, GridPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { DOC_BY_ID, SIM_NOTE, kvPanel, r2, r4 } from '@/content/lib/ai-rag2-langgraph';

const code = `
def recall_at_k(ranked, relevant, k):
    hits = len(set(ranked[:k]) & set(relevant))               #@hits
    return hits / len(relevant)                               #@recall

def reciprocal_rank(ranked, relevant):
    for rank, doc in enumerate(ranked, start=1):              #@rr
        if doc in relevant:
            return 1 / rank                                   #@rrhit
    return 0.0                                                #@rrmiss

def faithfulness(answer, context):
    ctx = set(re.findall(r"[a-z]+", context.lower()))         #@ctx
    sents = [s for s in re.split(r"[.!?]", answer) if s.strip()]
    ok = sum(all(w in ctx for w in re.findall(r"[a-z]{4,}", s.lower())) for s in sents)   #@faith
    return ok / len(sents) if sents else 1.0

# evaluate a retriever: average each metric over the golden set   #@mean
`;

interface Golden {
  q: string;
  relevant: string[];
}
interface Run {
  name: string;
  rankings: string[][];
  answers: string[];
}
interface In {
  k: number;
  golden: Golden[];
  runs: Run[];
}

const GOLDEN: Golden[] = [
  { q: 'money back', relevant: ['d5'] },
  { q: 'missing parcel', relevant: ['d8', 'd2'] },
  { q: 'reset login', relevant: ['d3', 'd4'] },
  { q: 'warranty length', relevant: ['d6'] },
];

const RUNS: Run[] = [
  {
    name: 'keyword only',
    rankings: [
      ['d1', 'd7', 'd5', 'd2', 'd3'],
      ['d8', 'd6', 'd1', 'd2', 'd4'],
      ['d4', 'd1', 'd2', 'd5', 'd6'],
      ['d2', 'd6', 'd1', 'd3', 'd4'],
    ],
    answers: ['Items can be returned within 30 days.', 'A tracking number is emailed once your package leaves the warehouse.', 'Use two-factor codes to reset your password.', 'The warranty lasts 24 months.'],
  },
  {
    name: 'hybrid',
    rankings: [
      ['d5', 'd1', 'd7', 'd2', 'd3'],
      ['d8', 'd2', 'd6', 'd1', 'd4'],
      ['d3', 'd4', 'd1', 'd2', 'd5'],
      ['d6', 'd2', 'd1', 'd3', 'd4'],
    ],
    answers: [
      'Items can be returned within 30 days and the price is reimbursed.',
      'A tracking number is emailed once your package leaves the warehouse. Standard delivery takes 3 to 5 business days.',
      'Choose Forgot password on the sign-in page. A reset link is emailed to you.',
      'Hardware defects are repaired for 24 months after delivery.',
    ],
  },
  {
    name: 'new embedder',
    rankings: [
      ['d1', 'd7', 'd2', 'd3', 'd4'],
      ['d6', 'd8', 'd1', 'd2', 'd4'],
      ['d4', 'd3', 'd1', 'd2', 'd5'],
      ['d2', 'd6', 'd1', 'd3', 'd4'],
    ],
    answers: ['Gift cards never expire.', 'Packages always arrive within one hour.', 'Enable two-factor authentication to protect your account.', 'Defects are repaired for 24 months after delivery.'],
  },
];

function check(i: In): { k: number; golden: Golden[]; runs: Run[] } {
  const k = Math.round(i.k);
  if (!(k >= 1 && k <= 5)) throw new Error('k must be between 1 and 5');
  if (!Array.isArray(i.golden) || !i.golden.length || i.golden.length > 4) throw new Error('golden needs 1 to 4 entries like {"q": "...", "relevant": ["d1"]}');
  if (!Array.isArray(i.runs) || !i.runs.length || i.runs.length > 3) throw new Error('runs needs 1 to 3 entries like {"name","rankings","answers"}');
  for (const g of i.golden) if (typeof g.q !== 'string' || !Array.isArray(g.relevant) || !g.relevant.length) throw new Error('Each golden entry needs q and a non-empty relevant list');
  for (const r of i.runs) {
    if (typeof r.name !== 'string' || !Array.isArray(r.rankings) || !Array.isArray(r.answers)) throw new Error('Each run needs name, rankings and answers');
    if (r.rankings.length !== i.golden.length || r.answers.length !== i.golden.length) throw new Error(`Run "${r.name}" needs one ranking and one answer per golden query`);
  }
  return { k, golden: i.golden, runs: i.runs };
}

const words = (t: string) => t.toLowerCase().match(/[a-z]+/g) ?? [];

function sentences(answer: string): string[] {
  return answer.split(/[.!?]/).filter((s) => s.trim());
}

function unsupportedWord(sentence: string, ctx: Set<string>): string | null {
  for (const w of sentence.toLowerCase().match(/[a-z]{4,}/g) ?? []) if (!ctx.has(w)) return w;
  return null;
}

const contextOf = (ranked: string[], k: number) =>
  ranked
    .slice(0, k)
    .map((id) => DOC_BY_ID[id]?.text ?? '')
    .join(' ');

const viz: VizDef<In> = {
  id: 'rag-evaluation',
  title: 'Scoring a RAG system on a golden set',
  code,
  language: 'python',
  inputs: [
    { key: 'k', label: 'k (documents the model sees)', kind: 'number', default: 3 },
    { key: 'golden', label: 'Golden set (questions + relevant doc ids)', kind: 'json', default: GOLDEN },
    { key: 'runs', label: 'Retrieval variants (rankings and answers)', kind: 'json', default: RUNS },
  ],
  presets: [
    { label: 'k = 3', input: { k: 3 } },
    { label: 'k = 1 (strict)', input: { k: 1 } },
    { label: 'k = 5 (generous)', input: { k: 5 } },
  ],
  run(input) {
    const { k, golden, runs } = check(input);
    const r = new Recorder(code);
    const cols = ['recall@' + k, 'precision@' + k, 'MRR', 'faithful'];
    const table: string[][] = runs.map(() => cols.map(() => '…'));
    const finals: { name: string; recall: number; precision: number; mrr: number; faithfulness: number }[] = [];
    const grid = (cur: number, done = false): GridPanel => {
      const tones: Record<string, Tone> = {};
      if (cur >= 0) cols.forEach((_, c) => (tones[`${cur},${c}`] = 'active'));
      if (done) {
        cols.forEach((_, c) => {
          const vals = finals.map((f) => [f.recall, f.precision, f.mrr, f.faithfulness][c]);
          const best = Math.max(...vals);
          const worst = Math.min(...vals);
          if (best === worst) return;
          vals.forEach((v, i) => {
            if (v === best) tones[`${i},${c}`] = 'found';
            else if (v === worst) tones[`${i},${c}`] = 'error';
          });
        });
      }
      return { type: 'grid', title: 'Metric table', cells: table, rowLabels: runs.map((x) => x.name), colLabels: cols, tones };
    };
    const rankArr = (ranked: string[], relevant: string[], title: string): ArrayPanel => {
      const tones: Record<number, Tone> = {};
      ranked.forEach((id, i) => {
        const rel = relevant.includes(id);
        tones[i] = rel ? (i < k ? 'found' : 'error') : i < k ? 'default' : 'muted';
      });
      return { type: 'array', title, values: ranked, tones, range: { from: 0, to: Math.min(k, ranked.length) - 1, label: 'top-' + k }, indexLabels: ranked.map((_, i) => '#' + (i + 1)) };
    };

    r.step('mean', `${runs.length} retrieval variants × ${golden.length} golden questions, k = ${k}`, [grid(-1)], { k, variants: runs.length });
    runs.forEach((run, ri) => {
      let R = 0;
      let P = 0;
      let M = 0;
      let F = 0;
      golden.forEach((g, qi) => {
        r.op();
        const ranked = run.rankings[qi];
        const hits = new Set(ranked.slice(0, k).filter((id) => g.relevant.includes(id))).size;
        const recall = hits / g.relevant.length;
        const precision = hits / k;
        R += recall;
        P += precision;
        let rr = 0;
        let rrank = 0;
        for (let i = 0; i < ranked.length; i++)
          if (g.relevant.includes(ranked[i])) {
            rr = 1 / (i + 1);
            rrank = i + 1;
            break;
          }
        M += rr;
        r.step(rrank ? 'rrhit' : 'recall', `"${g.q}": ${hits}/${g.relevant.length} relevant in top-${k} → recall ${r2(recall)}, first hit ${rrank ? '#' + rrank : 'missing'} → RR ${r2(rr)}`, [rankArr(ranked, g.relevant, `${run.name}: "${g.q}"`), kvPanel('This question', { hits, recall: r2(recall), precision: r2(precision), 'reciprocal rank': r2(rr) }), grid(ri)], { run: run.name, hits, rr: r2(rr) });
        const ctx = new Set(words(contextOf(ranked, k)));
        const sents = sentences(run.answers[qi]);
        let ok = 0;
        const lines = sents.map((s) => {
          const bad = unsupportedWord(s, ctx);
          if (!bad) ok++;
          return { text: bad ? `✗ "${s.trim()}" (no "${bad}" in context)` : `✓ "${s.trim()}"`, tone: (bad ? 'error' : 'found') as Tone };
        });
        const faith = sents.length ? ok / sents.length : 1;
        F += faith;
        r.step('faith', `Answer check: ${ok}/${sents.length || 0} sentences supported by the top-${k} context → ${r2(faith)}`, [{ type: 'log', title: 'Faithfulness (every 4+ letter word must appear in the context)', lines }, grid(ri)], { faithfulness: r2(faith) });
      });
      const n = golden.length;
      const f = { name: run.name, recall: r4(R / n), precision: r4(P / n), mrr: r4(M / n), faithfulness: r4(F / n) };
      finals.push(f);
      table[ri] = [r2(f.recall), r2(f.precision), r2(f.mrr), r2(f.faithfulness)].map(String);
      r.step('mean', `${run.name}: recall ${r2(f.recall)}, precision ${r2(f.precision)}, MRR ${r2(f.mrr)}, faithful ${r2(f.faithfulness)}`, [grid(ri)], { run: run.name, recall: r2(f.recall), mrr: r2(f.mrr) });
    });
    const best = [...finals].sort((a, b) => b.mrr - a.mrr)[0];
    r.step('mean', `Best MRR: "${best.name}". Change retrieval, re-run the table, compare.`, [grid(-1, true)], { best: best.name });
    return { frames: r.frames, result: finals };
  },
  reference(input) {
    const { k, golden, runs } = check(input);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return runs.map((run) => {
      const per = golden.map((g, qi) => {
        const ranked = run.rankings[qi];
        const top = ranked.slice(0, k);
        const hits = g.relevant.filter((id) => top.includes(id)).length;
        const first = ranked.findIndex((id) => g.relevant.includes(id));
        const ctx = new Set(words(contextOf(ranked, k)));
        const sents = sentences(run.answers[qi]);
        const ok = sents.filter((s) => unsupportedWord(s, ctx) === null).length;
        return { recall: hits / g.relevant.length, precision: hits / k, rr: first < 0 ? 0 : 1 / (first + 1), faith: sents.length ? ok / sents.length : 1 };
      });
      return { name: run.name, recall: r4(mean(per.map((p) => p.recall))), precision: r4(mean(per.map((p) => p.precision))), mrr: r4(mean(per.map((p) => p.rr))), faithfulness: r4(mean(per.map((p) => p.faith))) };
    });
  },
};

const tests = [
  { args: [[['a', 'b'], ['c', 'd']], [['a'], ['c']], 1], expected: { 'recall@k': 1.0, mrr: 1.0 }, name: 'perfect retrieval' },
  { args: [[['x', 'a', 'b']], [['a']], 1], expected: { 'recall@k': 0.0, mrr: 0.5 }, name: 'hit at rank 2, outside k' },
  { args: [[['a', 'x', 'b', 'y']], [['a', 'b']], 3], expected: { 'recall@k': 1.0, mrr: 1.0 }, name: 'several relevant documents' },
  { args: [[['a', 'x', 'b', 'y']], [['a', 'b']], 2], expected: { 'recall@k': 0.5, mrr: 1.0 }, name: 'recall is a share of the relevant set' },
  { args: [[['x', 'y', 'a']], [['a']], 2], expected: { 'recall@k': 0.0, mrr: 1 / 3 }, name: 'MRR looks past k' },
  { args: [[['a', 'x'], ['x', 'b'], ['x', 'y']], [['a'], ['b'], ['c']], 2], expected: { 'recall@k': 2 / 3, mrr: 0.5 }, name: 'averages over queries' },
];

const unit: Unit = {
  id: 'rag-evaluation',
  hook: '"How do you know your RAG got better?" is a staple interview question. The answer is a golden set and a few numbers: recall@k and MRR for retrieval, a faithfulness check for generation.',
  predict: {
    prompt: 'Your retriever returns the single relevant document at rank 4 for every question, and k = 3. What are recall@3 and MRR?',
    options: ['recall@3 = 1.0, MRR = 0.25', 'recall@3 = 0, MRR = 0.25', 'recall@3 = 0, MRR = 0', 'recall@3 = 0.75, MRR = 0.25'],
    answer: 1,
    explain: 'recall@3 only looks at the first 3 results, so a document at rank 4 is a miss (0). MRR looks at the whole list: the first relevant hit is at rank 4, so each question scores 1/4.',
  },
  viz,
  deeper: {
    points: [
      'Evaluate retrieval and generation separately: if the right chunk never reaches the model, no prompt can fix it.',
      'recall@k = relevant found in the top k divided by all relevant. precision@k = relevant found divided by k. MRR = mean of 1/rank of the first relevant result.',
      'Recall decides whether the answer is *possible*; MRR and precision decide how noisy the context is.',
      'A faithfulness check asks "is every claim in the answer supported by the retrieved context?". Real systems use an LLM judge; the word-overlap check here only illustrates the idea.',
      'Faithful is not the same as correct: an answer can be perfectly grounded in an irrelevant chunk. Always read recall next to faithfulness.',
      'Keep the golden set small but versioned, and re-run it on every change (chunking, embedder, k). The "new embedder" row above is the regression you want to catch.',
    ],
    complexity: { time: 'O(Q · k) for Q questions', space: 'O(Q)' },
    pitfalls: ['Dividing recall by k instead of by the number of relevant documents', 'Computing MRR only inside the top k', 'Averaging per-question scores that were already rounded', 'Judging faithfulness without checking that the retrieved context was relevant'],
  },
  practice: {
    language: 'python',
    fnName: 'evaluate',
    statement:
      'Implement `evaluate(results, golden, k)`. `results[i]` is the ranked list of ids for question i and `golden[i]` the list of relevant ids. Return {"recall@k": mean recall@k, "mrr": mean reciprocal rank}. Recall@k = relevant ids found in the top k divided by the number of relevant ids. Reciprocal rank = 1 / (1-based rank of the first relevant id anywhere in the list), or 0 if none.',
    signature: 'def evaluate(results, golden, k):',
    solution: `def evaluate(results, golden, k):
    recalls, rrs = [], []
    for ranked, relevant in zip(results, golden):
        hits = len(set(ranked[:@@k@@]) & set(relevant))
        recalls.append(hits / @@len(relevant)@@)
        rr = 0.0
        for rank, doc in enumerate(ranked, start=@@1@@):
            if doc in relevant:
                rr = @@1 / rank@@
                break
        rrs.append(rr)
    return {"recall@k": sum(recalls) / len(recalls), "mrr": sum(rrs) / len(rrs)}`,
    compare: 'float',
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'evaluate',
    statement: 'Recall@k looks too low whenever a question has several relevant documents, even when all of them are retrieved. Fix the metric.',
    compare: 'float',
    buggy: `def evaluate(results, golden, k):
    recalls, rrs = [], []
    for ranked, relevant in zip(results, golden):
        hits = len(set(ranked[:k]) & set(relevant))
        recalls.append(hits / k)
        rr = 0.0
        for rank, doc in enumerate(ranked, start=1):
            if doc in relevant:
                rr = 1 / rank
                break
        rrs.append(rr)
    return {"recall@k": sum(recalls) / len(recalls), "mrr": sum(rrs) / len(rrs)}`,
    fixed: `def evaluate(results, golden, k):
    recalls, rrs = [], []
    for ranked, relevant in zip(results, golden):
        hits = len(set(ranked[:k]) & set(relevant))
        recalls.append(hits / len(relevant))
        rr = 0.0
        for rank, doc in enumerate(ranked, start=1):
            if doc in relevant:
                rr = 1 / rank
                break
        rrs.append(rr)
    return {"recall@k": sum(recalls) / len(recalls), "mrr": sum(rrs) / len(rrs)}`,
    tests,
    bugType: 'wrong denominator',
    hint: 'Recall asks "what share of the relevant documents did we find?". What is that share measured against?',
    explanation: 'Dividing by k computes precision@k, not recall. Recall divides by the number of relevant documents. With one relevant document and k = 3 the buggy version caps recall at 0.33 even for a perfect retriever.',
  },
  boss: {
    title: 'RAG scorecard',
    statement:
      'Implement `evaluate_rag(cases, k)`. Each case is {"ranked": [...ids], "relevant": [...ids], "answer": str, "context": str}. Return the means of: "recall" (hits in top k / len(relevant)), "precision" (hits in top k / k), "mrr" (1/rank of first relevant id in the whole list, else 0) and "faithfulness". Faithfulness of one case = share of answer sentences (split on `.`, `!`, `?`; ignore blank pieces) where every lowercase word of 4+ letters (`[a-z]{4,}`) also appears among the lowercase letter-words (`[a-z]+`) of the context; an answer with no sentences scores 1. Also return "misses": the indexes of cases with zero hits in the top k.',
    language: 'python',
    fnName: 'evaluate_rag',
    compare: 'float',
    starter: `import re

def evaluate_rag(cases, k):
    # your code here
    pass
`,
    solution: `import re

def evaluate_rag(cases, k):
    n = len(cases)
    recall = precision = mrr = faith = 0.0
    misses = []
    for i, c in enumerate(cases):
        rel = set(c["relevant"])
        hits = len(set(c["ranked"][:k]) & rel)
        recall += hits / len(rel)
        precision += hits / k
        if hits == 0:
            misses.append(i)
        for rank, doc in enumerate(c["ranked"], start=1):
            if doc in rel:
                mrr += 1 / rank
                break
        ctx = set(re.findall(r"[a-z]+", c["context"].lower()))
        sents = [s for s in re.split(r"[.!?]", c["answer"]) if s.strip()]
        ok = sum(all(w in ctx for w in re.findall(r"[a-z]{4,}", s.lower())) for s in sents)
        faith += ok / len(sents) if sents else 1.0
    return {"recall": recall / n, "precision": precision / n, "mrr": mrr / n, "faithfulness": faith / n, "misses": misses}`,
    tests: [
      {
        args: [
          [
            { ranked: ['a', 'b', 'c'], relevant: ['a'], answer: 'Cats purr loudly.', context: 'Cats purr loudly when happy.' },
            { ranked: ['x', 'y', 'b'], relevant: ['b'], answer: 'Dogs bark. Birds sing.', context: 'Dogs bark at night.' },
          ],
          2,
        ],
        expected: { recall: 0.5, precision: 0.25, mrr: 0.6666666666666666, faithfulness: 0.75, misses: [1] },
        name: 'mixed results',
      },
      {
        args: [[{ ranked: ['a', 'b'], relevant: ['a', 'b'], answer: 'Fish swim fast', context: 'Fish swim' }], 2],
        expected: { recall: 1.0, precision: 1.0, mrr: 1.0, faithfulness: 0.0, misses: [] },
        name: 'unsupported answer',
      },
      {
        args: [[{ ranked: ['x', 'y'], relevant: ['a'], answer: '', context: '' }], 2],
        expected: { recall: 0.0, precision: 0.0, mrr: 0.0, faithfulness: 1.0, misses: [0] },
        name: 'empty answer is trivially faithful',
      },
      {
        args: [
          [
            { ranked: ['p', 'q', 'r'], relevant: ['r', 'z'], answer: 'Rain falls! Snow falls?', context: 'rain falls snow falls' },
            { ranked: ['r', 'p'], relevant: ['p'], answer: 'Hello there.', context: 'Hello' },
          ],
          3,
        ],
        expected: { recall: 0.75, precision: 0.3333333333333333, mrr: 0.4166666666666667, faithfulness: 0.5, misses: [] },
        name: 'several relevant, punctuation splits sentences',
      },
    ],
    hints: ['Loop over the cases once and keep running sums; divide by the number of cases at the end. Compute `hits` once and reuse it for recall, precision and the miss check.', 'Faithfulness: split the answer with `re.split(r"[.!?]", ...)`, drop blank pieces, and check each remaining sentence with `all(w in ctx for w in re.findall(r"[a-z]{4,}", s.lower()))`.'],
    combines: ['rag-rrf', 'rag-context-assembly'],
  },
  quiz: [
    {
      prompt: 'An answer is 100% faithful to its context but wrong. What most likely happened?',
      options: ['The LLM hallucinated', 'Retrieval returned an irrelevant chunk and the model faithfully summarised it', 'The golden set is too small', 'MRR is too high'],
      answer: 1,
      explain: 'Faithfulness only checks the answer against the retrieved text. If recall is low, the context itself is wrong and a grounded answer can still be wrong.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
