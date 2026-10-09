import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { DOCS, DOC_META, PY_CORPUS, SIM_NOTE, dot, heatGrid, kvPanel, r2, toyEmbed } from '@/content/lib/ai-finish-1';
import { OPS_HARNESS } from '@/content/lib/harness';

const code = `
class VectorIndex:
    def __init__(self):
        self.rows = []                                         #@init

    def add(self, doc_id, text, meta=None):
        vec = embed(text)                                      #@embed
        self.rows.append({"id": doc_id, "vec": vec, "meta": meta or {}})   #@add

    def search(self, text, k=3, where=None):
        q = embed(text)                                        #@qembed
        pool = [r for r in self.rows if matches(r, where)]     #@filter
        scored = [(dot(q, r["vec"]), r["id"]) for r in pool]   #@score
        scored.sort(key=lambda t: (-t[0], t[1]))
        return [i for _, i in scored[:k]]                      #@top
`;

const TOPICS = ['any', 'billing', 'shipping', 'account', 'returns'];

interface In {
  count: number;
  query: string;
  topic: string;
  k: number;
}

function setup(i: In) {
  if (!Number.isInteger(i.count) || i.count < 1 || i.count > DOCS.length) throw new Error(`Index between 1 and ${DOCS.length} documents`);
  if (!TOPICS.includes(i.topic)) throw new Error('Topic must be one of: ' + TOPICS.join(', '));
  if (!i.query.trim()) throw new Error('Type a query');
  if (!Number.isInteger(i.k) || i.k < 1) throw new Error('k must be a whole number of at least 1');
  return { docs: DOCS.slice(0, i.count), topic: i.topic, query: i.query.trim(), k: i.k };
}

const viz: VizDef<In> = {
  id: 'rag-embedding-index',
  title: 'Embedding documents into an index',
  code,
  language: 'python',
  inputs: [
    { key: 'count', label: 'Documents to index', kind: 'number', default: 8 },
    { key: 'query', label: 'Query', kind: 'string', default: 'how do I reset my password' },
    { key: 'topic', label: 'Metadata filter (topic)', kind: 'select', default: 'any', options: TOPICS },
    { key: 'k', label: 'Top k', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Search everything', input: { count: 8, query: 'how do I reset my password', topic: 'any', k: 3 } },
    { label: 'Filter to topic: shipping', input: { count: 8, query: 'how do I reset my password', topic: 'shipping', k: 3 } },
    { label: 'Tiny index (3 docs)', input: { count: 3, query: 'when does my package arrive', topic: 'any', k: 2 } },
    { label: 'Filter matches nothing', input: { count: 1, query: 'refund an item', topic: 'returns', k: 3 } },
  ],
  run(input) {
    const { docs, topic, query, k } = setup(input);
    const r = new Recorder(code);
    const rows: { id: string; vec: number[]; topic: string }[] = [];
    const dim = 32;
    const gridOf = (title: string, q?: number[], tones: Record<string, Tone> = {}): Panel => {
      const labels = rows.map((x) => `${x.id} · ${x.topic}`);
      const cells = rows.map((x) => x.vec.map((v) => r2(v)));
      if (q) {
        labels.push('query');
        cells.push(q.map((v) => r2(v)));
      }
      return { ...heatGrid(title, cells.length ? cells : [new Array(dim).fill(0)], cells.length ? labels : ['(empty)'], Array.from({ length: dim }, (_, i) => String(i)), tones), compact: true };
    };
    r.step('init', 'An empty index: a list of rows {id, vector, metadata}', [gridOf('Index (rows × 32 dimensions, brighter = larger)'), kvPanel('Index', { rows: 0, dimension: dim })], { rows: 0 });
    docs.forEach((d, i) => {
      r.op();
      const vec = toyEmbed(d.text, dim);
      r.step('embed', `${d.id}: embed "${d.text.slice(0, 40)}…" into a ${dim}-number vector`, [gridOf('Index', undefined, {}), kvPanel(`Adding ${d.id}`, { id: d.id, topic: DOC_META[d.id].topic, 'vector length': 1, 'non-zero dims': vec.filter((x) => x > 0).length }, { id: 'new' })], { doc: d.id });
      rows.push({ id: d.id, vec, topic: DOC_META[d.id].topic });
      r.step('add', `${d.id} stored with metadata topic=${DOC_META[d.id].topic} (row ${i + 1})`, [gridOf('Index', undefined, Object.fromEntries(rows[i].vec.map((_, c) => [`${i},${c}`, 'new' as Tone]))), kvPanel('Index', { rows: rows.length, dimension: dim })], { rows: rows.length });
    });
    const q = toyEmbed(query, dim);
    r.step('qembed', `Embed the query "${query}" with the SAME function`, [gridOf('Index and query', q, Object.fromEntries(q.map((_, c) => [`${rows.length},${c}`, 'active' as Tone])))], { query });
    const pool = rows.filter((x) => topic === 'any' || x.topic === topic);
    const excluded = Object.fromEntries(rows.flatMap((x, i) => (pool.includes(x) ? [] : q.map((_, c) => [`${i},${c}`, 'muted' as Tone]))));
    r.step('filter', topic === 'any' ? `No filter: all ${pool.length} rows are candidates` : `Filter topic=${topic}: ${pool.length} of ${rows.length} rows remain`, [gridOf('Index (greyed rows are filtered out)', q, excluded)], { candidates: pool.length });
    const scored = pool.map((x) => ({ id: x.id, s: dot(q, x.vec) })).sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
    scored.forEach(() => r.op());
    const top = scored.slice(0, k);
    r.step(
      'score',
      pool.length ? `Dot product with each candidate; best is ${scored[0].id} (${r2(scored[0].s)})` : 'No candidates, nothing to score',
      [{ type: 'list', title: 'Scores (best first)', orientation: 'vertical', items: scored.map((x, i) => ({ label: `${x.id} · ${DOC_META[x.id].topic}`, sub: String(r2(x.s)), tone: (i < k ? 'frontier' : 'muted') as Tone })), emptyText: 'no candidates' }],
      { best: scored[0]?.id ?? 'none' },
    );
    r.step('top', top.length ? `Return the top ${top.length}: ${top.map((x) => x.id).join(', ')}` : 'Return [] (the filter excluded every row)', [{ type: 'list', title: 'Result ids', orientation: 'horizontal', items: top.map((x) => ({ label: x.id, sub: String(r2(x.s)), tone: 'found' as Tone })), emptyText: 'empty result' }], { returned: top.map((x) => x.id).join(' ') });
    return { frames: r.frames, result: top.map((x) => x.id) };
  },
  reference(input) {
    const { docs, topic, query, k } = setup(input);
    const q = toyEmbed(query, 32);
    const out: [number, string][] = [];
    for (const d of docs) if (topic === 'any' || DOC_META[d.id].topic === topic) out.push([dot(q, toyEmbed(d.text, 32)), d.id]);
    out.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : b[0] - a[0]));
    return out.slice(0, k).map((x) => x[1]);
  },
};

const T = (id: string) => DOCS.find((d) => d.id === id)!.text;
const add = (id: string) => [id, T(id), { topic: DOC_META[id].topic }];
const ALL = DOCS.map((d) => d.id);
const nulls = (n: number) => new Array(n).fill(null);

const tests = [
  { args: [['VectorIndex', ...ALL.map(() => 'add'), 'count', 'search'], [[], ...ALL.map(add), [], ['when will my package arrive', 2]]], expected: [...nulls(9), 8, ['d8', 'd2']], name: 'index everything, then search' },
  {
    args: [['VectorIndex', ...ALL.map(() => 'add'), 'search', 'search'], [[], ...ALL.map(add), ['how do I reset my password', 3, { topic: 'account' }], ['how do I reset my password', 3, { topic: 'shipping' }]]],
    expected: [...nulls(9), ['d3', 'd4'], ['d8', 'd2']],
    name: 'metadata filter limits the candidates',
  },
  {
    args: [['VectorIndex', 'add', 'add', 'add', 'count', 'search'], [[], add('d1'), add('d2'), ['d2', 'Express delivery arrives the next day.', { topic: 'shipping' }], [], ['express delivery', 5]]],
    expected: [null, null, null, null, 2, ['d2', 'd1']],
    name: 'adding an existing id replaces it',
  },
  {
    args: [['VectorIndex', ...ALL.map(() => 'add'), 'delete', 'delete', 'count', 'search'], [[], ...ALL.map(add), ['d3'], ['d3'], [], ['reset password', 1]]],
    expected: [...nulls(9), true, false, 7, ['d4']],
    name: 'delete removes a row once',
  },
  { args: [['VectorIndex', 'count', 'search', 'delete'], [[], [], ['anything', 3], ['x']]], expected: [null, 0, [], false], name: 'empty index' },
];

const HARNESS = `
def run_meta(fn, query, k, where, min_score):
    from minillm import embed
    rows = [{"id": d["id"], "vec": embed(d["text"], dim=64), "meta": {"topic": d["topic"]}} for d in CORPUS]
    return fn(rows, query, k, where, min_score)
`;

const unit: Unit = {
  id: 'rag-embedding-index',
  hook: 'A vector index is just vectors plus ids and metadata, and "why did my filter return nothing?" is a favourite follow-up. Knowing what is stored per row makes every later RAG question easy.',
  predict: {
    prompt: 'You embed documents with model A when indexing but embed user queries with model B (same vector size). What happens?',
    options: ['Nothing, vectors of equal size are interchangeable', 'Similarity scores become meaningless: the two models place text in unrelated spaces', 'The index rebuilds itself', 'Only the first query fails'],
    answer: 1,
    explain: 'Each embedding model defines its own coordinate system. Equal dimensions do not mean equal meaning, so cosine scores between vectors from different models are noise. Index and query must use the same model and version.',
  },
  viz,
  deeper: {
    points: [
      'An index row is (id, vector, metadata). The vector is for similarity; the id lets you fetch the original text; the metadata lets you filter (tenant, language, date, topic).',
      'Indexing is a one-time cost per document; searching embeds only the query (one cheap call), then compares against stored vectors.',
      'Embed documents and queries with the same model. If you switch models you must re-embed everything.',
      'Upsert semantics matter: re-adding an id must replace the old row, or stale and fresh versions both come back.',
      'Normalised vectors make cosine similarity equal to a plain dot product, which is what most indexes use under the hood.',
    ],
    complexity: { time: 'add: one embedding; search: one embedding + O(n × d) scan', space: 'O(n × d)' },
    pitfalls: ['Mixing embedding models between indexing and querying', 'Appending instead of replacing on re-index', 'Filtering after taking the top k (returns fewer than k)', 'Forgetting to store the metadata you will want to filter on'],
  },
  practice: {
    language: 'python',
    fnName: 'VectorIndex',
    statement: 'Implement `VectorIndex` with `add(doc_id, text, meta=None)` (store `embed(text, dim=64)`; an existing id is replaced), `delete(doc_id)` (True if a row was removed), `count()`, and `search(text, k=3, where=None)`. `where` is a dict of metadata equalities; keep only rows matching all of them, rank by dot product with `embed(text, dim=64)` (ties by id) and return the top `k` ids.',
    signature: 'class VectorIndex:',
    solution: `from minillm import embed

class VectorIndex:
    def __init__(self):
        self.rows = []

    def add(self, doc_id, text, meta=None):
        self.rows = [r for r in self.rows if r["id"] != @@doc_id@@]
        self.rows.append({"id": doc_id, "vec": embed(text, dim=64), "meta": @@meta or {}@@})

    def delete(self, doc_id):
        n = len(self.rows)
        self.rows = [r for r in self.rows if r["id"] != doc_id]
        return len(self.rows) < n

    def count(self):
        return len(self.rows)

    def search(self, text, k=3, where=None):
        q = embed(text, dim=64)
        pool = [r for r in self.rows if all(r["meta"].get(a) == b for a, b in (where or {}).items())]
        scored = sorted(((@@sum(a * b for a, b in zip(q, r["vec"]))@@, r["id"]) for r in pool), key=lambda t: (-t[0], t[1]))
        return [i for _, i in scored[:k]]`,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'VectorIndex',
    statement: 'After re-indexing an updated document, searches return both the old and the new version and `count()` is too large. Find the bug.',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    buggy: `from minillm import embed

class VectorIndex:
    def __init__(self):
        self.rows = []

    def add(self, doc_id, text, meta=None):
        self.rows.append({"id": doc_id, "vec": embed(text, dim=64), "meta": meta or {}})

    def delete(self, doc_id):
        n = len(self.rows)
        self.rows = [r for r in self.rows if r["id"] != doc_id]
        return len(self.rows) < n

    def count(self):
        return len(self.rows)

    def search(self, text, k=3, where=None):
        q = embed(text, dim=64)
        pool = [r for r in self.rows if all(r["meta"].get(a) == b for a, b in (where or {}).items())]
        scored = sorted(((sum(a * b for a, b in zip(q, r["vec"])), r["id"]) for r in pool), key=lambda t: (-t[0], t[1]))
        return [i for _, i in scored[:k]]`,
    fixed: `from minillm import embed

class VectorIndex:
    def __init__(self):
        self.rows = []

    def add(self, doc_id, text, meta=None):
        self.rows = [r for r in self.rows if r["id"] != doc_id]
        self.rows.append({"id": doc_id, "vec": embed(text, dim=64), "meta": meta or {}})

    def delete(self, doc_id):
        n = len(self.rows)
        self.rows = [r for r in self.rows if r["id"] != doc_id]
        return len(self.rows) < n

    def count(self):
        return len(self.rows)

    def search(self, text, k=3, where=None):
        q = embed(text, dim=64)
        pool = [r for r in self.rows if all(r["meta"].get(a) == b for a, b in (where or {}).items())]
        scored = sorted(((sum(a * b for a, b in zip(q, r["vec"])), r["id"]) for r in pool), key=lambda t: (-t[0], t[1]))
        return [i for _, i in scored[:k]]`,
    tests,
    bugType: 'append instead of upsert',
    hint: 'What should happen to the existing row when `add` is called again with the same id?',
    explanation: '`add` only appends, so an updated document leaves its stale vector behind. Both rows share the id and both are searchable. Drop any row with the same id before appending (upsert).',
  },
  boss: {
    title: 'Filtered search with a score floor',
    statement:
      'Implement `metadata_search(rows, query, k, where, min_score)`. `rows` is a list of {"id","vec","meta"} (vectors made with `embed(text, dim=64)`; a global `CORPUS` exists). Embed the query with `dim=64`. `where` is None or a dict: a plain value means equality, a list means "meta value is one of these", and {"$ne": v} means "not equal to v". Keep rows passing every condition and with dot-product score >= `min_score`, sort by score desc then id, and return the first `k` ids.',
    language: 'python',
    fnName: 'metadata_search',
    harness: PY_CORPUS + HARNESS,
    adapter: 'run_meta',
    starter: `from minillm import embed

def metadata_search(rows, query, k=3, where=None, min_score=0.0):
    # your code here
    pass
`,
    solution: `from minillm import embed

def metadata_search(rows, query, k=3, where=None, min_score=0.0):
    q = embed(query, dim=64)

    def ok(meta):
        for key, want in (where or {}).items():
            have = meta.get(key)
            if isinstance(want, dict):
                if "$ne" in want and have == want["$ne"]:
                    return False
            elif isinstance(want, list):
                if have not in want:
                    return False
            elif have != want:
                return False
        return True

    scored = []
    for r in rows:
        if not ok(r["meta"]):
            continue
        s = sum(a * b for a, b in zip(q, r["vec"]))
        if s >= min_score:
            scored.append((s, r["id"]))
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [i for _, i in scored[:k]]`,
    tests: [
      { args: ['reset password', 3, null, 0.0], expected: ['d3', 'd4', 'd8'], name: 'no filter' },
      { args: ['reset password', 3, { topic: 'account' }, 0.0], expected: ['d3', 'd4'], name: 'equality filter shrinks the pool' },
      { args: ['reset password', 3, { topic: ['shipping', 'returns'] }, 0.0], expected: ['d8', 'd5', 'd2'], name: 'any-of filter' },
      { args: ['package delivery', 4, { topic: { $ne: 'shipping' } }, 0.0], expected: ['d6', 'd4', 'd5', 'd7'], name: '$ne filter' },
      { args: ['package delivery', 5, { topic: 'shipping' }, 0.99], expected: [], name: 'score floor removes everything' },
      { args: ['tracking number', 2, { topic: 'nope' }, 0.0], expected: [], name: 'unknown value matches nothing' },
    ],
    hints: ['Write a small `ok(meta)` helper that returns False on the first failing condition; branch on `isinstance(want, dict)` and `isinstance(want, list)` before plain equality.', 'Compute the dot product only for rows that pass the filter, drop scores below `min_score`, then sort with `key=lambda t: (-t[0], t[1])` and slice `[:k]`.'],
    combines: ['ai-embeddings', 'rag-vector-search'],
  },
  quiz: [
    {
      prompt: 'Why should you store metadata (source, topic, date) next to each vector?',
      options: ['Vectors cannot be stored without it', 'So you can filter candidates and cite sources without a second lookup', 'It makes embeddings more accurate', 'It reduces the vector size'],
      answer: 1,
      explain: 'Metadata powers filtering (tenant, language, freshness) and citations. It does not change the vector itself.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
