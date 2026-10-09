import { Recorder } from '@/engine/recorder';
import type { ListItem, ListPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, countTokens, kvPanel, logPanel } from '@/content/lib/ai-rag2-langgraph';

const code = `
def build_prompt(chunks, budget):
    picked, seen, used = [], set(), 0                          #@init
    for c in chunks:                                           #@loop
        key = " ".join(c["text"].lower().split())              #@key
        if key in seen:                                        #@dup
            continue
        t = count_tokens(c["text"])                            #@count
        if used + t <= budget:                                 #@fit
            picked.append(c); seen.add(key); used += t         #@take
    picked.sort(key=lambda c: (c["source"], c["pos"]))         #@order
    lines = ["[%d] %s" % (i, c["text"]) for i, c in enumerate(picked, start=1)]   #@number
    return {"prompt": HEADER + "\\n".join(lines), "sources": [c["id"] for c in picked]}   #@ret

def extract_citations(answer, sources):
    cited, invalid = [], []
    for m in re.findall(r"\\[(\\d+)\\]", answer):                  #@cite
        n = int(m)
        if 1 <= n <= len(sources):                             #@valid
            cited.append(sources[n - 1])                       #@map
        else:
            invalid.append(n)                                  #@bad
    return {"cited": cited, "invalid": invalid}
`;

interface Chunk {
  id: string;
  source: string;
  pos: number;
  text: string;
}

interface In {
  chunks: Chunk[];
  budget: number;
  answer: string;
}

const HEADER = 'Answer using only the sources below and cite them like [1].\n';

const DEFAULT_CHUNKS: Chunk[] = [
  { id: 'c1', source: 'policy.md', pos: 2, text: 'Refunds are issued to the original payment method within 5 business days.' },
  { id: 'c2', source: 'policy.md', pos: 1, text: 'Returns must be requested within 30 days of delivery.' },
  { id: 'c3', source: 'faq.md', pos: 7, text: 'Refunds are issued to the original payment method within 5 business days.' },
  { id: 'c4', source: 'terms.md', pos: 4, text: 'Items that are damaged, used or missing parts cannot be returned, although a replacement may be offered after inspection by the support team.' },
  { id: 'c5', source: 'shipping.md', pos: 3, text: 'Shipping costs are not refunded.' },
  { id: 'c6', source: 'gifts.md', pos: 1, text: 'Gift cards never expire.' },
];

const DEFAULT_ANSWER = 'Refunds arrive within 5 business days [2]. Returns must be requested within 30 days [1]. Shipping fees are not refunded [3] [7].';

function check(i: In): In {
  if (!Array.isArray(i.chunks) || i.chunks.length > 8) throw new Error('chunks must be a list of at most 8 objects');
  for (const c of i.chunks) {
    if (!c || typeof c.id !== 'string' || typeof c.source !== 'string' || typeof c.text !== 'string' || typeof c.pos !== 'number') throw new Error('Each chunk needs id, source, pos (number) and text');
  }
  if (new Set(i.chunks.map((c) => c.id)).size !== i.chunks.length) throw new Error('Chunk ids must be unique');
  if (!(i.budget >= 0)) throw new Error('budget must be 0 or more');
  return i;
}

const norm = (t: string) => t.toLowerCase().split(/\s+/).filter(Boolean).join(' ');
const cmpChunk = (a: Chunk, b: Chunk) => (a.source === b.source ? a.pos - b.pos : a.source < b.source ? -1 : 1);

function citations(answer: string, sources: string[]) {
  const cited: string[] = [];
  const invalid: number[] = [];
  const marks = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  for (const n of marks) {
    if (n >= 1 && n <= sources.length) {
      if (!cited.includes(sources[n - 1])) cited.push(sources[n - 1]);
    } else if (!invalid.includes(n)) invalid.push(n);
  }
  return { cited, invalid, marks };
}

const viz: VizDef<In> = {
  id: 'rag-context-assembly',
  title: 'Context assembly and citations',
  code,
  language: 'python',
  inputs: [
    { key: 'chunks', label: 'Retrieved chunks (best first)', kind: 'json', default: DEFAULT_CHUNKS },
    { key: 'budget', label: 'Token budget for context', kind: 'number', default: 45 },
    { key: 'answer', label: 'Model answer with [n] citations', kind: 'string', default: DEFAULT_ANSWER },
  ],
  presets: [
    { label: 'Tight budget (45)', input: { budget: 45 } },
    { label: 'Exact fit (35)', input: { budget: 35 } },
    { label: 'Roomy (120)', input: { budget: 120 } },
    { label: 'Nothing fits', input: { budget: 5 } },
  ],
  run(input) {
    const { chunks, budget, answer } = check(input);
    const r = new Recorder(code);
    const status: Record<string, { tone: Tone; note: string }> = {};
    let used = 0;
    const picked: Chunk[] = [];
    const cands = (current?: string, ordered?: Chunk[]): ListPanel => {
      const items: ListItem[] = (ordered ?? chunks).map((c) => {
        const s = status[c.id];
        return { id: c.id, label: `${c.id} · ${c.source}#${c.pos}`, sub: s ? s.note : `${countTokens(c.text)} tokens`, tone: c.id === current ? 'active' : s?.tone ?? 'default' };
      });
      return { type: 'list', title: ordered ? 'Reading order' : 'Candidates (retrieval order)', items, orientation: 'vertical' };
    };
    const budgetKv = (t?: number): Panel => kvPanel('Budget', { used: used, budget, left: budget - used, ...(t !== undefined ? { 'this chunk': t } : {}) }, { left: budget - used === 0 ? 'done' : 'default' });
    r.step('init', `Budget ${budget} tokens, ${chunks.length} candidate chunks (best first)`, [cands(), budgetKv()], { budget, used });

    const seen = new Set<string>();
    for (const c of chunks) {
      r.op();
      r.step('loop', `Next candidate: ${c.id} (${c.source}#${c.pos})`, [cands(c.id), budgetKv()], { chunk: c.id });
      const key = norm(c.text);
      if (seen.has(key)) {
        status[c.id] = { tone: 'muted', note: 'duplicate' };
        r.step('dup', `${c.id} repeats a chunk already chosen → skip`, [cands(), budgetKv()], { chunk: c.id, duplicate: true });
        continue;
      }
      const t = countTokens(c.text);
      r.step('count', `${c.id} costs ${t} tokens; ${budget - used} left`, [cands(c.id), budgetKv(t)], { tokens: t, left: budget - used });
      if (used + t <= budget) {
        picked.push(c);
        seen.add(key);
        used += t;
        status[c.id] = { tone: 'found', note: `taken (${t})` };
        r.step('take', `${used - t} + ${t} ≤ ${budget} → take ${c.id}, used = ${used}`, [cands(), budgetKv()], { used });
      } else {
        status[c.id] = { tone: 'error', note: `too big (${t})` };
        r.step('fit', `${used} + ${t} = ${used + t} > ${budget} → skip ${c.id}, smaller ones may still fit`, [cands(), budgetKv(t)], { used, over: used + t - budget });
      }
    }

    const ordered = [...picked].sort(cmpChunk);
    r.step('order', ordered.length ? `Restore reading order (source, position): ${ordered.map((c) => c.id).join(', ')}` : 'No chunk fits the budget, so there is no context', [cands(undefined, ordered), budgetKv()], { picked: ordered.map((c) => c.id).join(',') });
    const lines = ordered.map((c, i) => `[${i + 1}] ${c.text}`);
    const sources = ordered.map((c) => c.id);
    r.step('number', `Number the sources: ${sources.map((s, i) => `[${i + 1}]=${s}`).join(' ') || 'none'}`, [logPanel('Prompt sent to the model', [{ text: HEADER.trim(), tone: 'muted' }, ...lines.map((text) => ({ text }))], 10)], { sources: sources.length });
    r.step('ret', `Prompt ready: ${used}/${budget} tokens of context`, [logPanel('Prompt sent to the model', [{ text: HEADER.trim(), tone: 'muted' }, ...lines.map((text) => ({ text, tone: 'found' as Tone }))], 10), budgetKv()], { used });

    const { cited, invalid, marks } = citations(answer, sources);
    r.step('cite', marks.length ? `The model's answer contains ${marks.length} citation marker${marks.length > 1 ? 's' : ''}: ${marks.map((n) => `[${n}]`).join(' ')}` : 'The answer has no [n] markers, so nothing is cited', [{ type: 'note', text: answer }, kvPanel('Source numbers', Object.fromEntries(sources.map((s, i) => [`[${i + 1}]`, s])))], { markers: marks.length });
    const seenMarks: string[] = [];
    const mapping: Record<string, string> = {};
    for (const n of marks) {
      r.op();
      if (n >= 1 && n <= sources.length) {
        mapping[`[${n}]`] = sources[n - 1];
        seenMarks.push(sources[n - 1]);
        r.step('map', `[${n}] → ${sources[n - 1]}`, [{ type: 'note', text: answer }, kvPanel('Citation map', { ...mapping }, { [`[${n}]`]: 'found' })], { n, source: sources[n - 1] });
      } else {
        mapping[`[${n}]`] = 'NOT A SOURCE';
        r.step('bad', `[${n}] does not exist (only 1..${sources.length}) → hallucinated citation`, [{ type: 'note', text: answer, tone: 'error' }, kvPanel('Citation map', { ...mapping }, { [`[${n}]`]: 'error' })], { n, invalid: true });
      }
    }
    r.step('valid', cited.length || invalid.length ? `Cited sources: ${cited.join(', ') || 'none'}${invalid.length ? ` · invalid: ${invalid.join(', ')}` : ''}` : 'No citations to verify', [kvPanel('Result', { cited: cited.join(', ') || '(none)', invalid: invalid.join(', ') || '(none)', 'context tokens': used }, { invalid: invalid.length ? 'error' : 'found' })], { cited: cited.length, invalid: invalid.length });
    return { frames: r.frames, result: { prompt: HEADER + lines.join('\n'), sources, used, cited, invalid } };
  },
  reference(input) {
    const { chunks, budget, answer } = check(input);
    const taken: Chunk[] = [];
    const keys = new Set<string>();
    let total = 0;
    chunks.forEach((c) => {
      const k = norm(c.text);
      const t = countTokens(c.text);
      if (!keys.has(k) && total + t <= budget) {
        keys.add(k);
        taken.push(c);
        total += t;
      }
    });
    taken.sort(cmpChunk);
    const sources = taken.map((c) => c.id);
    const found = (answer.match(/\[\d+\]/g) ?? []).map((m) => Number(m.slice(1, -1)));
    const cited = [...new Set(found.filter((n) => n >= 1 && n <= sources.length).map((n) => sources[n - 1]))];
    const invalid = [...new Set(found.filter((n) => n < 1 || n > sources.length))];
    return { prompt: HEADER + taken.map((c, i) => `[${i + 1}] ${c.text}`).join('\n'), sources, used: total, cited, invalid };
  },
};

const PY_FUNCS = `import re
from minillm import count_tokens

HEADER = "Answer using only the sources below and cite them like [1].\\n"

def build_prompt(chunks, budget):
    picked, seen, used = [], set(), 0
    for c in chunks:
        key = " ".join(c["text"].lower().split())
        if key in seen:
            continue
        t = count_tokens(c["text"])
        if used + t <= budget:
            picked.append(c)
            seen.add(key)
            used += t
    picked.sort(key=lambda c: (c["source"], c["pos"]))
    lines = ["[%d] %s" % (i, c["text"]) for i, c in enumerate(picked, start=1)]
    return {"prompt": HEADER + "\\n".join(lines), "sources": [c["id"] for c in picked], "used": used}

def extract_citations(answer, sources):
    cited, invalid = [], []
    for m in re.findall(r"\\[(\\d+)\\]", answer):
        n = int(m)
        if 1 <= n <= len(sources):
            if sources[n - 1] not in cited:
                cited.append(sources[n - 1])
        elif n not in invalid:
            invalid.append(n)
    return {"cited": cited, "invalid": invalid}`;

const CTX_HARNESS = `
def run_ctx(fn, chunks, budget, answer):
    out = fn(chunks, budget)
    res = {"prompt": out["prompt"], "sources": out["sources"], "used": out["used"]}
    if answer is not None:
        res.update(extract_citations(answer, out["sources"]))
    return res
`;

const a = { id: 'a', source: 'x.md', pos: 2, text: 'Cats purr.' };
const b = { id: 'b', source: 'y.md', pos: 1, text: 'Dogs bark loudly.' };
const dup = { id: 'c', source: 'y.md', pos: 5, text: 'cats  purr.' };
const d = { id: 'd', source: 'x.md', pos: 1, text: 'Birds sing.' };
const big = { id: 'big', source: 'z.md', pos: 1, text: 'Whales sing very long songs under the sea.' };
const H = HEADER;

const tests = [
  {
    args: [[a, b, dup, d], 100, 'Cats purr [1]. Dogs bark [3][1]. Fish swim [9].'],
    expected: { prompt: H + '[1] Birds sing.\n[2] Cats purr.\n[3] Dogs bark loudly.', sources: ['d', 'a', 'b'], used: 12, cited: ['d', 'b'], invalid: [9] },
    name: 'dedupe, reading order, citations',
  },
  {
    args: [[a, b, d], 8, null],
    expected: { prompt: H + '[1] Cats purr.\n[2] Dogs bark loudly.', sources: ['a', 'b'], used: 8 },
    name: 'a chunk that exactly fills the budget',
  },
  { args: [[b, a, d], 5, null], expected: { prompt: H + '[1] Dogs bark loudly.', sources: ['b'], used: 5 }, name: 'exact fit on the first chunk' },
  { args: [[b, big, d], 9, null], expected: { prompt: H + '[1] Birds sing.\n[2] Dogs bark loudly.', sources: ['d', 'b'], used: 9 }, name: 'skip the big chunk, keep going' },
  { args: [[a, b], 0, 'No sources [1].'], expected: { prompt: H, sources: [], used: 0, cited: [], invalid: [1] }, name: 'empty context makes every citation invalid' },
];

const bossHarness =
  PY_FUNCS +
  `

def run_grounded(fn, chunks, budget, question, script):
    from minillm import MockLLM
    llm = MockLLM(list(script))
    out = fn(chunks, budget, question, llm)
    return {"answer": out["answer"], "cited": out["cited"], "invalid": out["invalid"], "calls": len(llm.calls)}
`;

const CTX = [
  { id: 'r1', source: 'policy.md', pos: 2, text: 'Refunds take 5 days.' },
  { id: 'r2', source: 'policy.md', pos: 1, text: 'Returns need a receipt.' },
  { id: 'r3', source: 'ship.md', pos: 1, text: 'Shipping is free over 50 dollars.' },
];

const unit: Unit = {
  id: 'rag-context-assembly',
  hook: 'Retrieval finds chunks; context assembly decides which ones the model actually sees and how it can point back at them. Budgeting, dedupe, ordering and verifiable citations are where "good RAG" is won.',
  predict: {
    prompt: 'The context budget is 10 tokens. Chunk A (best) costs 6, chunk B costs 8, chunk C costs 4. Greedy assembly in relevance order with "skip what does not fit" picks which chunks?',
    options: ['A only', 'A and C', 'B and C', 'A, B and C'],
    answer: 1,
    explain: 'A fits (6 ≤ 10). B would make 14 > 10, so it is skipped, but assembly keeps going and C fits (6 + 4 = 10 ≤ 10, an exact fit still counts). Stopping at the first miss would have wasted the remaining budget.',
  },
  viz,
  deeper: {
    points: [
      'Budget in tokens, not characters or chunk counts. Leave room for the system prompt, the question and the answer.',
      'Dedupe before spending budget: overlapping chunks and repeated boilerplate burn tokens without adding information.',
      'Order is a choice: relevance order keeps the best chunk first; reading order (source, position) lets the model follow a document. Models also tend to under-use the middle of a long context.',
      'Number the sources in the prompt ([1], [2]) and ask for those markers. Then citations can be checked mechanically.',
      'A citation like [7] with only 3 sources is a hallucinated reference. Detect it, and either retry or drop the claim.',
    ],
    complexity: { time: 'O(n log n) for n candidate chunks', space: 'O(n)' },
    pitfalls: ['Using `<` so an exact fit is dropped', 'Stopping at the first chunk that does not fit', 'Numbering sources before the final ordering, so [n] points to the wrong chunk', 'Trusting the model\'s citation numbers without checking they exist'],
  },
  practice: {
    language: 'python',
    fnName: 'build_prompt',
    statement:
      'Implement `build_prompt(chunks, budget)` and `extract_citations(answer, sources)` (`re`, `count_tokens` and `HEADER` are predefined). `build_prompt` walks chunks (best first), skips a chunk whose lowercased, whitespace-normalised text was already picked, and picks it if `used + count_tokens(text) <= budget` (otherwise it keeps going). Picked chunks are sorted by (source, pos), numbered from 1, and returned as {"prompt": HEADER + the "[n] text" lines joined by newlines, "sources": ids in citation order, "used": tokens}. `extract_citations` finds every `[n]` in the answer and returns {"cited": unique source ids in order of first appearance, "invalid": unique numbers that are not 1..len(sources)}.',
    signature: 'def build_prompt(chunks, budget):',
    solution: `def build_prompt(chunks, budget):
    picked, seen, used = [], set(), 0
    for c in chunks:
        key = " ".join(c["text"].lower().split())
        if key in seen:
            continue
        t = count_tokens(c["text"])
        if used + t @@<=@@ budget:
            picked.append(c)
            seen.add(key)
            used += t
    picked.sort(key=lambda c: (@@c["source"], c["pos"]@@))
    lines = ["[%d] %s" % (i, c["text"]) for i, c in enumerate(picked, start=@@1@@)]
    return {"prompt": HEADER + "\\n".join(lines), "sources": [c["id"] for c in picked], "used": used}

def extract_citations(answer, sources):
    cited, invalid = [], []
    for m in re.findall(r"\\[(\\d+)\\]", answer):
        n = int(m)
        if @@1 <= n <= len(sources)@@:
            if sources[n - 1] not in cited:
                cited.append(sources[n - 1])
        elif n not in invalid:
            invalid.append(n)
    return {"cited": cited, "invalid": invalid}`,
    harness: `import re
from minillm import count_tokens

HEADER = "Answer using only the sources below and cite them like [1].\\n"
${CTX_HARNESS}`,
    adapter: 'run_ctx',
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'build_prompt',
    statement: 'A chunk that is exactly as long as the remaining budget keeps disappearing from the prompt. Find the bug.',
    harness: `import re
from minillm import count_tokens

HEADER = "Answer using only the sources below and cite them like [1].\\n"
${CTX_HARNESS}`,
    adapter: 'run_ctx',
    buggy: `def build_prompt(chunks, budget):
    picked, seen, used = [], set(), 0
    for c in chunks:
        key = " ".join(c["text"].lower().split())
        if key in seen:
            continue
        t = count_tokens(c["text"])
        if used + t < budget:
            picked.append(c)
            seen.add(key)
            used += t
    picked.sort(key=lambda c: (c["source"], c["pos"]))
    lines = ["[%d] %s" % (i, c["text"]) for i, c in enumerate(picked, start=1)]
    return {"prompt": HEADER + "\\n".join(lines), "sources": [c["id"] for c in picked], "used": used}

def extract_citations(answer, sources):
    cited, invalid = [], []
    for m in re.findall(r"\\[(\\d+)\\]", answer):
        n = int(m)
        if 1 <= n <= len(sources):
            if sources[n - 1] not in cited:
                cited.append(sources[n - 1])
        elif n not in invalid:
            invalid.append(n)
    return {"cited": cited, "invalid": invalid}`,
    fixed: `def build_prompt(chunks, budget):
    picked, seen, used = [], set(), 0
    for c in chunks:
        key = " ".join(c["text"].lower().split())
        if key in seen:
            continue
        t = count_tokens(c["text"])
        if used + t <= budget:
            picked.append(c)
            seen.add(key)
            used += t
    picked.sort(key=lambda c: (c["source"], c["pos"]))
    lines = ["[%d] %s" % (i, c["text"]) for i, c in enumerate(picked, start=1)]
    return {"prompt": HEADER + "\\n".join(lines), "sources": [c["id"] for c in picked], "used": used}

def extract_citations(answer, sources):
    cited, invalid = [], []
    for m in re.findall(r"\\[(\\d+)\\]", answer):
        n = int(m)
        if 1 <= n <= len(sources):
            if sources[n - 1] not in cited:
                cited.append(sources[n - 1])
        elif n not in invalid:
            invalid.append(n)
    return {"cited": cited, "invalid": invalid}`,
    tests,
    bugType: 'off-by-one boundary',
    hint: 'A budget of 8 tokens can hold chunks totalling exactly 8. Which comparison operator allows that?',
    explanation: 'The budget is a limit that may be reached, not exceeded: `used + t <= budget`. With `<` a chunk that exactly fills the remaining space is rejected, so the prompt silently loses evidence.',
  },
  boss: {
    title: 'Grounded answer with one retry',
    statement:
      '`build_prompt` and `extract_citations` already exist (hidden). Implement `grounded_answer(chunks, budget, question, llm)`: build the context, then call `llm.complete(info["prompt"] + "\\n\\nQuestion: " + question)`. If the answer cites a source number that does not exist, call the model exactly once more with the same prompt plus "\\nOnly cite sources 1-N." and use that second answer instead (no third attempt). Return {"answer", "cited", "invalid"} computed from the answer you keep.',
    language: 'python',
    fnName: 'grounded_answer',
    harness: bossHarness,
    adapter: 'run_grounded',
    starter: `def grounded_answer(chunks, budget, question, llm):
    # your code here
    pass
`,
    solution: `def grounded_answer(chunks, budget, question, llm):
    info = build_prompt(chunks, budget)
    ask = info["prompt"] + "\\n\\nQuestion: " + question
    answer = llm.complete(ask)
    found = extract_citations(answer, info["sources"])
    if found["invalid"]:
        answer = llm.complete(ask + "\\nOnly cite sources 1-%d." % len(info["sources"]))
        found = extract_citations(answer, info["sources"])
    return {"answer": answer, "cited": found["cited"], "invalid": found["invalid"]}`,
    tests: [
      { args: [CTX, 25, 'How long do refunds take?', ['Refunds take 5 days [2].']], expected: { answer: 'Refunds take 5 days [2].', cited: ['r1'], invalid: [], calls: 1 }, name: 'valid on the first try' },
      { args: [CTX, 25, 'Is shipping free?', ['Free shipping [3][5].', 'Free shipping over 50 dollars [3].']], expected: { answer: 'Free shipping over 50 dollars [3].', cited: ['r3'], invalid: [], calls: 2 }, name: 'retry fixes a bad citation' },
      { args: [CTX, 25, 'Returns and refunds?', ['Returns need a receipt [1]. Refunds [2].']], expected: { answer: 'Returns need a receipt [1]. Refunds [2].', cited: ['r2', 'r1'], invalid: [], calls: 1 }, name: 'order of first appearance' },
      { args: [CTX, 14, 'Anything?', ['See [3].', 'See [4].']], expected: { answer: 'See [4].', cited: [], invalid: [4], calls: 2 }, name: 'only one retry' },
      { args: [CTX, 25, 'Refund time?', ['Probably 5 days.']], expected: { answer: 'Probably 5 days.', cited: [], invalid: [], calls: 1 }, name: 'no citations is not an error' },
    ],
    hints: ['Keep the base prompt in a variable so the retry can reuse it. Only retry when `extract_citations(...)["invalid"]` is non-empty.', 'After the retry, recompute the citations from the NEW answer and return those, not the first attempt\'s.'],
    combines: ['rag-rrf', 'rag-hyde'],
  },
  quiz: [
    {
      prompt: 'Why sort the picked chunks by (source, position) before numbering them?',
      options: ['It makes the prompt shorter', 'Chunks from the same document then read in their natural order, and [n] matches the final order', 'It improves embedding quality', 'Python requires it'],
      answer: 1,
      explain: 'Retrieval order scrambles a document\'s paragraphs. Reordering restores flow, and numbering after the sort keeps [n] consistent with what the model saw.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
