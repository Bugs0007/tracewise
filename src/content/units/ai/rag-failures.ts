import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { RAG_TRACES, SIM_NOTE, TRACE_LABELS, flowPanel, kvPanel, type FlowNode, type RagTrace } from '@/content/lib/ai-finish-1';

const code = `
def diagnose(trace):
    if trace["index_model"] != trace["query_model"]:                    #@model
        return "wrong_embedding_model"
    top = trace["chunks"][0] if trace["chunks"] else None
    if trace["want"] and not trace["filter"] and top and not matches(top, trace["want"]):   #@filter
        return "missing_metadata_filter"
    texts = [c["text"] for c in trace["chunks"]]
    if not any(trace["gold"] in t for t in texts):                      #@retrieve
        return "bad_chunking" if split_across(texts, trace["gold"]) else "retrieval_miss"
    if trace["gold"] not in trace["answer"] and trace["context_tokens"] > trace["budget"]:   #@context
        return "context_stuffing"
    ids = {c["id"] for c in trace["chunks"]}
    if any(cid not in ids for cid in trace["citations"]):               #@cite
        return "hallucinated_citation"
    return "ok" if trace["gold"] in trace["answer"] else "generation_error"   #@verdict
`;

const NODES: FlowNode[] = [
  { id: 'embed', label: 'embed', x: 60, y: 60, sub: 'same model?' },
  { id: 'filter', label: 'filter', x: 170, y: 60, sub: 'metadata' },
  { id: 'retrieve', label: 'retrieve', x: 280, y: 60, sub: 'gold in chunks?' },
  { id: 'context', label: 'context', x: 390, y: 60, sub: 'fits budget?' },
  { id: 'answer', label: 'answer', x: 500, y: 60, sub: 'cites real ids?' },
];
const EDGES = [
  { from: 'embed', to: 'filter' },
  { from: 'filter', to: 'retrieve' },
  { from: 'retrieve', to: 'context' },
  { from: 'context', to: 'answer' },
];

const NODE_OF: Record<string, string> = {
  wrong_embedding_model: 'embed',
  missing_metadata_filter: 'filter',
  bad_chunking: 'retrieve',
  retrieval_miss: 'retrieve',
  context_stuffing: 'context',
  hallucinated_citation: 'answer',
  generation_error: 'answer',
};

const FIXES: Record<string, string> = {
  ok: 'Nothing to fix: the answer is right and every citation is real.',
  wrong_embedding_model: 'Embed queries and documents with the same model and version, then re-index if it changed.',
  missing_metadata_filter: 'Apply the metadata filter (here version=v2) in the vector query, before taking the top k.',
  bad_chunking: 'Chunk on sentence boundaries or add overlap so the answer stays whole in one chunk.',
  retrieval_miss: 'Improve recall: hybrid search, query expansion, a wider top n, or fix missing content.',
  context_stuffing: 'Rerank and keep only the best few chunks; put the strongest evidence first and last.',
  hallucinated_citation: 'Validate citations against the retrieved ids and drop or retry answers that cite anything else.',
  generation_error: 'Evidence was present and in budget: tighten the prompt ("answer only from the context") or change the model.',
};

interface In {
  scenario: string;
}

function setup(i: In): RagTrace {
  const t = RAG_TRACES[i.scenario];
  if (!t) throw new Error('Pick one of: ' + TRACE_LABELS.join(', '));
  return t;
}

const matches = (c: { version: string }, want: Record<string, string>) => Object.entries(want).every(([k, v]) => (c as unknown as Record<string, string>)[k] === v);

function splitAcross(texts: string[], gold: string): boolean {
  for (let i = 0; i < texts.length; i++)
    for (let j = 0; j < texts.length; j++)
      if (i !== j) for (let cut = 1; cut < gold.length; cut++) if (texts[i].endsWith(gold.slice(0, cut)) && texts[j].startsWith(gold.slice(cut))) return true;
  return false;
}

const viz: VizDef<In> = {
  id: 'rag-failures',
  title: 'Diagnose the RAG trace',
  code,
  language: 'python',
  inputs: [{ key: 'scenario', label: 'Recorded run', kind: 'select', default: 'answer split by chunking', options: [...TRACE_LABELS] }],
  presets: [
    { label: 'Answer cut in half', input: { scenario: 'answer split by chunking' } },
    { label: 'Index and query models differ', input: { scenario: 'wrong embedding model' } },
    { label: 'Old version retrieved', input: { scenario: 'missing metadata filter' } },
    { label: 'Too much context', input: { scenario: 'context stuffing' } },
    { label: 'Made-up citation', input: { scenario: 'hallucinated citation' } },
    { label: 'Healthy run', input: { scenario: 'healthy' } },
  ],
  run(input) {
    const t = setup(input);
    const r = new Recorder(code);
    const done: string[] = [];
    const flow = (active?: string, failed?: string): Panel => flowPanel('Pipeline checks', NODES, EDGES, { active, failed, done: [...done] }, { width: 560, height: 120 });
    const chunkList = (hl: (c: RagTrace['chunks'][number]) => Tone): Panel => ({
      type: 'list',
      title: 'Retrieved chunks (in order)',
      orientation: 'vertical',
      items: t.chunks.map((c) => ({ label: `${c.id} · ${c.version} · ${c.score}`, sub: c.text.length > 72 ? c.text.slice(0, 70) + '…' : c.text, tone: hl(c) })),
      emptyText: 'nothing retrieved',
    });
    let verdict = '';
    const fail = (anchor: string, node: string, label: string, caption: string, panels: Panel[]) => {
      verdict = label;
      r.step(anchor, caption, [flow(undefined, node), ...panels], { check: node, verdict: label });
    };
    const pass = (anchor: string, node: string, caption: string, panels: Panel[]) => {
      r.op();
      r.step(anchor, caption, [flow(node), ...panels], { check: node, result: 'pass' });
      done.push(node);
    };

    r.step('model', `Question: "${t.question}". Expected fact: "${t.gold}".`, [flow(), kvPanel('Final answer', { answer: t.answer, citations: t.citations.join(', ') || '(none)', 'expected fact': t.gold })], { gold: t.gold });
    (() => {
      if (t.index_model !== t.query_model) {
        fail('model', 'embed', 'wrong_embedding_model', `FAIL: indexed with ${t.index_model} but queried with ${t.query_model}`, [kvPanel('Embedding models', { 'index model': t.index_model, 'query model': t.query_model }, { 'index model': 'error', 'query model': 'error' }), chunkList(() => 'muted')]);
        return;
      }
      pass('model', 'embed', `Pass: both sides use ${t.index_model}`, [kvPanel('Embedding models', { 'index model': t.index_model, 'query model': t.query_model }, { 'index model': 'found', 'query model': 'found' })]);
      const top = t.chunks[0];
      if (t.want && !t.filter && top && !matches(top, t.want)) {
        fail('filter', 'filter', 'missing_metadata_filter', `FAIL: question needs ${JSON.stringify(t.want)} but no filter ran; top chunk is ${top.version}`, [kvPanel('Filter', { needed: JSON.stringify(t.want), applied: 'none', 'top chunk version': top.version }, { applied: 'error', 'top chunk version': 'error' }), chunkList((c) => (matches(c, t.want!) ? 'found' : 'error'))]);
        return;
      }
      pass('filter', 'filter', t.want ? 'Pass: the filter matches what the question needs' : 'Pass: this question needs no metadata filter', [kvPanel('Filter', { needed: t.want ? JSON.stringify(t.want) : 'none', applied: t.filter ? JSON.stringify(t.filter) : 'none' })]);
      const texts = t.chunks.map((c) => c.text);
      const inChunk = texts.some((x) => x.includes(t.gold));
      if (!inChunk) {
        const split = splitAcross(texts, t.gold);
        fail('retrieve', 'retrieve', split ? 'bad_chunking' : 'retrieval_miss', split ? `FAIL: "${t.gold}" is cut across two chunks, no single chunk contains it` : `FAIL: none of the ${t.chunks.length} chunks contains "${t.gold}"`, [chunkList(() => (split ? 'compare' : 'muted'))]);
        return;
      }
      pass('retrieve', 'retrieve', `Pass: a retrieved chunk contains "${t.gold}"`, [chunkList((c) => (c.text.includes(t.gold) ? 'found' : 'muted'))]);
      if (!t.answer.includes(t.gold) && t.context_tokens > t.budget) {
        fail('context', 'context', 'context_stuffing', `FAIL: ${t.context_tokens} context tokens exceed the ${t.budget} budget; the evidence got lost`, [kvPanel('Prompt size', { 'context tokens': t.context_tokens, budget: t.budget, 'chunks in prompt': t.chunks.length }, { 'context tokens': 'error' }), chunkList((c) => (c.text.includes(t.gold) ? 'compare' : 'muted'))]);
        return;
      }
      pass('context', 'context', `Pass: ${t.context_tokens} tokens fit the ${t.budget} budget`, [kvPanel('Prompt size', { 'context tokens': t.context_tokens, budget: t.budget })]);
      const ids = new Set(t.chunks.map((c) => c.id));
      const bad = t.citations.filter((c) => !ids.has(c));
      if (bad.length) {
        fail('cite', 'answer', 'hallucinated_citation', `FAIL: the answer cites ${bad.join(', ')}, which was never retrieved`, [kvPanel('Citations', { cited: t.citations.join(', '), retrieved: [...ids].join(', '), invented: bad.join(', ') }, { invented: 'error' })]);
        return;
      }
      verdict = t.answer.includes(t.gold) ? 'ok' : 'generation_error';
      done.push('answer');
      r.op();
      r.step('verdict', verdict === 'ok' ? 'Pass: the answer contains the fact and cites real chunks' : 'The evidence was there but the answer is wrong: a generation problem', [flow(), kvPanel('Answer', { answer: t.answer }, { answer: verdict === 'ok' ? 'found' : 'error' })], { verdict });
    })();
    r.step('verdict', `Diagnosis: ${verdict}. Fix: ${FIXES[verdict]}`, [flow(undefined, verdict === 'ok' ? undefined : NODE_OF[verdict]), kvPanel('Diagnosis', { failure: verdict, fix: FIXES[verdict] }, { failure: verdict === 'ok' ? 'found' : 'error' })], { verdict });
    return { frames: r.frames, result: verdict };
  },
  reference(input) {
    const t = setup(input);
    const has = t.chunks.some((c) => c.text.includes(t.gold));
    const rules: [boolean, string][] = [
      [t.index_model !== t.query_model, 'wrong_embedding_model'],
      [!!t.want && !t.filter && t.chunks.length > 0 && !matches(t.chunks[0], t.want), 'missing_metadata_filter'],
      [!has && splitAcross(t.chunks.map((c) => c.text), t.gold), 'bad_chunking'],
      [!has, 'retrieval_miss'],
      [!t.answer.includes(t.gold) && t.context_tokens > t.budget, 'context_stuffing'],
      [t.citations.some((c) => !t.chunks.some((k) => k.id === c)), 'hallucinated_citation'],
      [!t.answer.includes(t.gold), 'generation_error'],
    ];
    return rules.find(([cond]) => cond)?.[1] ?? 'ok';
  },
};

const T = RAG_TRACES;
const stuffedV1: RagTrace = { ...T['context stuffing'], want: { version: 'v2' }, chunks: T['context stuffing'].chunks.map((c, i) => (i === 0 ? { ...c, version: 'v1' } : c)) };
const modelAndCite: RagTrace = { ...T['wrong embedding model'], citations: ['d99'] };

const tests = [
  { args: [T['healthy']], expected: 'ok', name: 'healthy run' },
  { args: [T['answer split by chunking']], expected: 'bad_chunking', name: 'fact split across chunks' },
  { args: [T['wrong embedding model']], expected: 'wrong_embedding_model', name: 'index and query models differ' },
  { args: [T['missing metadata filter']], expected: 'missing_metadata_filter', name: 'old version outranks the new one' },
  { args: [T['context stuffing']], expected: 'context_stuffing', name: 'evidence present but the prompt is too big' },
  { args: [T['hallucinated citation']], expected: 'hallucinated_citation', name: 'right answer, invented source' },
  { args: [T['nothing relevant retrieved']], expected: 'retrieval_miss', name: 'nothing relevant retrieved' },
  { args: [T['model ignores the evidence']], expected: 'generation_error', name: 'evidence fine, answer wrong' },
  { args: [modelAndCite], expected: 'wrong_embedding_model', name: 'upstream cause is reported first' },
];

const unit: Unit = {
  id: 'rag-failures',
  hook: '"Our RAG answers are wrong, how do you debug it?" is the standard question. The strong answer is a checklist that walks the pipeline in order and blames the first stage that broke.',
  predict: {
    prompt: 'A RAG bot gives a wrong answer. Retrieval returned the right chunk, but it was 9th of 10 chunks in a 6,000-token prompt. Which failure is this most likely?',
    options: ['Wrong embedding model', 'Context stuffing: the evidence is buried in an oversized prompt', 'Bad chunking', 'A missing metadata filter'],
    answer: 1,
    explain: 'Retrieval worked, so the problem is downstream. Long prompts dilute attention and models use the middle of the context poorly; the fix is to rerank, keep fewer chunks and place the best evidence first.',
  },
  viz,
  deeper: {
    points: [
      'Debug in pipeline order: embedding → filter → retrieval → context → generation. Upstream faults hide or imitate downstream ones.',
      'Wrong embedding model: index and query vectors live in different spaces, so similarity is noise. Check model names and versions in traces.',
      'Missing metadata filter: stale versions, other tenants or other languages outrank the right chunk because the vector search never saw the restriction.',
      'Bad chunking: the fact straddles a boundary, so no chunk contains it. Overlap or structure-aware splitting fixes it.',
      'Context stuffing and hallucinated citations are generation-side: cap the prompt, rerank, and validate every cited id against the retrieved set.',
    ],
    complexity: { time: 'one pass over the trace', space: 'O(chunks)' },
    pitfalls: ['Tuning the prompt when retrieval is the broken stage', 'Judging only the answer text and not the citations', 'Reporting the symptom (wrong answer) instead of the first failing stage', 'Logging no trace at all, so nothing can be diagnosed'],
  },
  practice: {
    language: 'python',
    fnName: 'diagnose',
    statement:
      'Implement `diagnose(trace)`, a dict with index_model, query_model, want (needed metadata or None), filter, chunks (list of {id,text,version,score}), gold, answer, citations, context_tokens and budget. Return the FIRST failing check, in order: "wrong_embedding_model" (models differ), "missing_metadata_filter" (want set, no filter, and the first chunk does not match want), "bad_chunking" (gold is in no chunk but one chunk ends with its first part and another starts with the rest), "retrieval_miss" (gold in no chunk), "context_stuffing" (answer lacks gold and context_tokens > budget), "hallucinated_citation" (a cited id was not retrieved), "generation_error" (answer lacks gold), else "ok".',
    signature: 'def diagnose(trace):',
    solution: `def split_across(texts, gold):
    for i, a in enumerate(texts):
        for j, b in enumerate(texts):
            if i != j:
                for cut in range(1, len(gold)):
                    if a.endswith(gold[:cut]) and b.startswith(gold[cut:]):
                        return True
    return False

def diagnose(trace):
    if trace["index_model"] != trace["query_model"]:
        return "wrong_embedding_model"
    top = trace["chunks"][0] if trace["chunks"] else None
    if trace["want"] and not trace["filter"] and top and not all(top.get(k) == v for k, v in trace["want"].items()):
        return "missing_metadata_filter"
    texts = [c["text"] for c in trace["chunks"]]
    if not any(@@trace["gold"] in t@@ for t in texts):
        return "bad_chunking" if split_across(texts, trace["gold"]) else "retrieval_miss"
    if trace["gold"] not in trace["answer"] and trace["context_tokens"] @@>@@ trace["budget"]:
        return "context_stuffing"
    ids = {c["id"] for c in trace["chunks"]}
    if any(cid @@not in@@ ids for cid in trace["citations"]):
        return "hallucinated_citation"
    return "ok" if trace["gold"] in trace["answer"] else "generation_error"`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'diagnose',
    statement: 'The diagnoser reports "ok" for an answer that has the right fact but cites a source that was never retrieved. Find the bug.',
    buggy: `def split_across(texts, gold):
    for i, a in enumerate(texts):
        for j, b in enumerate(texts):
            if i != j:
                for cut in range(1, len(gold)):
                    if a.endswith(gold[:cut]) and b.startswith(gold[cut:]):
                        return True
    return False

def diagnose(trace):
    if trace["gold"] in trace["answer"]:
        return "ok"
    if trace["index_model"] != trace["query_model"]:
        return "wrong_embedding_model"
    top = trace["chunks"][0] if trace["chunks"] else None
    if trace["want"] and not trace["filter"] and top and not all(top.get(k) == v for k, v in trace["want"].items()):
        return "missing_metadata_filter"
    texts = [c["text"] for c in trace["chunks"]]
    if not any(trace["gold"] in t for t in texts):
        return "bad_chunking" if split_across(texts, trace["gold"]) else "retrieval_miss"
    if trace["gold"] not in trace["answer"] and trace["context_tokens"] > trace["budget"]:
        return "context_stuffing"
    ids = {c["id"] for c in trace["chunks"]}
    if any(cid not in ids for cid in trace["citations"]):
        return "hallucinated_citation"
    return "ok" if trace["gold"] in trace["answer"] else "generation_error"`,
    fixed: `def split_across(texts, gold):
    for i, a in enumerate(texts):
        for j, b in enumerate(texts):
            if i != j:
                for cut in range(1, len(gold)):
                    if a.endswith(gold[:cut]) and b.startswith(gold[cut:]):
                        return True
    return False

def diagnose(trace):
    if trace["index_model"] != trace["query_model"]:
        return "wrong_embedding_model"
    top = trace["chunks"][0] if trace["chunks"] else None
    if trace["want"] and not trace["filter"] and top and not all(top.get(k) == v for k, v in trace["want"].items()):
        return "missing_metadata_filter"
    texts = [c["text"] for c in trace["chunks"]]
    if not any(trace["gold"] in t for t in texts):
        return "bad_chunking" if split_across(texts, trace["gold"]) else "retrieval_miss"
    if trace["gold"] not in trace["answer"] and trace["context_tokens"] > trace["budget"]:
        return "context_stuffing"
    ids = {c["id"] for c in trace["chunks"]}
    if any(cid not in ids for cid in trace["citations"]):
        return "hallucinated_citation"
    return "ok" if trace["gold"] in trace["answer"] else "generation_error"`,
    tests,
    bugType: 'early return hides failures',
    hint: 'An early `return "ok"` fires as soon as the answer text looks right. Which later checks never get to run?',
    explanation: 'Judging only the answer text lets a lucky or memorised answer pass even when the pipeline is broken (here it cites a document that was never retrieved). Run every pipeline check first, and call the trace healthy only at the very end.',
  },
  boss: {
    title: 'Full trace audit',
    statement:
      'Implement `audit(trace)` which returns EVERY failure found, as a list in this pipeline order: "wrong_embedding_model" (models differ), "missing_metadata_filter" (want set, no filter, first chunk does not match want), then if gold is in no chunk either "bad_chunking" (one chunk ends with the first part of gold and a different chunk starts with the rest) or "retrieval_miss", "context_stuffing" (answer lacks gold and context_tokens > budget), "hallucinated_citation" (a cited id was not retrieved). If nothing is found return ["ok"]. The trace format is the same as in `diagnose`.',
    language: 'python',
    fnName: 'audit',
    starter: `def audit(trace):
    # your code here
    pass
`,
    solution: `def audit(trace):
    found = []
    if trace["index_model"] != trace["query_model"]:
        found.append("wrong_embedding_model")
    top = trace["chunks"][0] if trace["chunks"] else None
    if trace["want"] and not trace["filter"] and top and not all(top.get(k) == v for k, v in trace["want"].items()):
        found.append("missing_metadata_filter")
    texts = [c["text"] for c in trace["chunks"]]
    gold = trace["gold"]
    if not any(gold in t for t in texts):
        split = any(
            i != j and a.endswith(gold[:cut]) and b.startswith(gold[cut:])
            for i, a in enumerate(texts)
            for j, b in enumerate(texts)
            for cut in range(1, len(gold))
        )
        found.append("bad_chunking" if split else "retrieval_miss")
    if gold not in trace["answer"] and trace["context_tokens"] > trace["budget"]:
        found.append("context_stuffing")
    ids = {c["id"] for c in trace["chunks"]}
    if any(cid not in ids for cid in trace["citations"]):
        found.append("hallucinated_citation")
    return found or ["ok"]`,
    tests: [
      { args: [T['healthy']], expected: ['ok'], name: 'healthy' },
      { args: [T['answer split by chunking']], expected: ['bad_chunking'], name: 'split fact' },
      { args: [T['wrong embedding model']], expected: ['wrong_embedding_model', 'retrieval_miss'], name: 'a wrong model also ruins retrieval' },
      { args: [T['missing metadata filter']], expected: ['missing_metadata_filter'], name: 'filter only' },
      { args: [T['context stuffing']], expected: ['context_stuffing'] },
      { args: [T['hallucinated citation']], expected: ['hallucinated_citation'] },
      { args: [modelAndCite], expected: ['wrong_embedding_model', 'retrieval_miss', 'hallucinated_citation'], name: 'three failures at once' },
      { args: [stuffedV1], expected: ['missing_metadata_filter', 'context_stuffing'], name: 'filter and context problems together' },
    ],
    hints: ['Collect results in a list instead of returning early: each check appends its label when it fires, and the retrieval check appends one of two labels.', 'For the chunking test, loop over ordered pairs of different chunks and every cut position of `gold`; return `found or ["ok"]` at the end.'],
    combines: ['rag-chunking', 'rag-embedding-index', 'rag-context-assembly'],
  },
  quiz: [
    {
      prompt: 'A support bot cites "KB-4412", a document that does not exist in the index, while the quoted fact is correct. What should the system do?',
      options: ['Nothing: the fact is correct', 'Validate citations against the retrieved ids and reject or retry the answer', 'Increase the temperature', 'Remove citations from the prompt'],
      answer: 1,
      explain: 'A right answer with an invented source cannot be audited and may be right by luck. Checking cited ids against the retrieved set catches it cheaply.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
