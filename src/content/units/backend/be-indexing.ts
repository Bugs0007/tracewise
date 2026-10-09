import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, GraphEdge, GraphNode, GraphPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { step } from '@/content/lib/backend-db-auth';

const code = `
def lookup(table, index, age):
    if index is None:                              #@choose
        hits, examined = [], 0
        for pos, row in enumerate(table):          #@scan
            examined += 1                          #@examine
            if row["age"] == age:                  #@match
                hits.append(pos)
        return hits, examined                      #@scanDone
    node = index.root                              #@root
    while node is not None:
        i = bisect_left(node.keys, age)            #@descend
        if i < len(node.keys) and node.keys[i] == age:
            positions = node.positions[i]          #@leaf
            return positions, len(positions)       #@fetch
        node = node.children[i] if node.children else None   #@next
    return [], 0                                   #@miss
`;

interface In {
  keys: number[];
  target: number;
  mode: string;
}

const MODES = ['full table scan', 'B-tree index', 'compare both'];
const MAX_KEYS = 3;

interface BNode {
  id: string;
  keys: number[];
  rows: number[][];
  kids: BNode[];
}

function buildBTree(entries: [number, number[]][]): BNode | null {
  if (!entries.length) return null;
  const mk = (): BNode => ({ id: '', keys: [], rows: [], kids: [] });
  let root = mk();
  type Split = { key: number; rows: number[]; right: BNode } | null;
  const insert = (node: BNode, key: number, rows: number[]): Split => {
    let i = 0;
    while (i < node.keys.length && key > node.keys[i]) i++;
    if (!node.kids.length) {
      node.keys.splice(i, 0, key);
      node.rows.splice(i, 0, rows);
    } else {
      const sp = insert(node.kids[i], key, rows);
      if (sp) {
        node.keys.splice(i, 0, sp.key);
        node.rows.splice(i, 0, sp.rows);
        node.kids.splice(i + 1, 0, sp.right);
      }
    }
    if (node.keys.length <= MAX_KEYS) return null;
    const mid = 2;
    const right = mk();
    right.keys = node.keys.splice(mid + 1);
    right.rows = node.rows.splice(mid + 1);
    const key2 = node.keys.pop()!;
    const rows2 = node.rows.pop()!;
    if (node.kids.length) right.kids = node.kids.splice(mid + 1);
    return { key: key2, rows: rows2, right };
  };
  for (const [k, rows] of entries) {
    const sp = insert(root, k, rows);
    if (sp) {
      const nr = mk();
      nr.keys = [sp.key];
      nr.rows = [sp.rows];
      nr.kids = [root, sp.right];
      root = nr;
    }
  }
  return root;
}

function levelsOf(root: BNode | null): BNode[][] {
  if (!root) return [];
  const out: BNode[][] = [];
  let cur = [root];
  let n = 0;
  while (cur.length) {
    cur.forEach((nd) => (nd.id = `b${n++}`));
    out.push(cur);
    cur = cur.flatMap((nd) => nd.kids);
  }
  return out;
}

function treePanel(levels: BNode[][], walked: Set<string>, active: string | null, found: string | null): GraphPanel {
  const W = 620;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  levels.forEach((lv, d) => {
    lv.forEach((nd, j) => {
      const tone: Tone = nd.id === found ? 'found' : nd.id === active ? 'active' : walked.has(nd.id) ? 'visited' : 'default';
      nodes.push({ id: nd.id, label: nd.keys.join(' | '), x: ((j + 1) * W) / (lv.length + 1), y: 34 + d * 78, shape: 'rect', w: 30 * nd.keys.length + 18, h: 34, tone });
      nd.kids.forEach((k) => edges.push({ from: nd.id, to: k.id, directed: true, tone: walked.has(k.id) ? 'path' : 'default' }));
    });
  });
  return { type: 'graph', title: 'B-tree index on age (max 3 keys per node)', nodes, edges, width: W, height: 34 + Math.max(levels.length, 1) * 78 };
}

const viz: VizDef<In> = {
  id: 'be-indexing',
  title: 'Full scan vs B-tree lookup',
  code,
  language: 'python',
  inputs: [
    { key: 'keys', label: 'age column (one value per row)', kind: 'numbers', default: [42, 17, 8, 93, 25, 61, 17, 70, 34, 5, 88, 50, 29, 66], maxItems: 24 },
    { key: 'target', label: 'WHERE age =', kind: 'number', default: 17 },
    { key: 'mode', label: 'Strategy', kind: 'select', options: MODES, default: 'compare both' },
  ],
  presets: [
    { label: 'Compare (2 matches)', input: { target: 17, mode: 'compare both' } },
    { label: 'Compare (no match)', input: { target: 40, mode: 'compare both' } },
    { label: 'Scan only', input: { target: 88, mode: 'full table scan' } },
    { label: 'Index only', input: { target: 88, mode: 'B-tree index' } },
  ],
  run({ keys, target, mode }) {
    const r = new Recorder(code);
    const n = keys.length;
    const groups = new Map<number, number[]>();
    keys.forEach((k, i) => groups.set(k, [...(groups.get(k) ?? []), i]));
    const levels = levelsOf(buildBTree([...groups.entries()].sort((a, b) => a[0] - b[0])));
    const doScan = mode !== 'B-tree index';
    const doIndex = mode !== 'full table scan';
    const matches: number[] = [];
    let examined = 0;
    let nodesRead = 0;

    const table = (tones: Record<number, Tone>, pointers?: Record<string, number>): ArrayPanel => ({
      type: 'array',
      title: `users table: age column (${n} rows)`,
      values: keys,
      tones,
      pointers,
      indexLabels: keys.map((_, i) => `r${i}`),
    });
    const counters = (label: string, rows: number, extra: { k: string; v: number }[] = [], tone?: Tone): Panel => ({ type: 'kv', title: 'cost', entries: [{ k: label, v: rows, tone }, ...extra] });

    // ── full table scan ──
    const scanTones: Record<number, Tone> = {};
    if (doScan) {
      step(r, 'choose', `No index on age: the database must look at every one of the ${n} rows`, [table({}), counters('rows examined', 0)], { target, rows_examined: 0 });
      for (let i = 0; i < n; i++) {
        examined++;
        r.op();
        const hit = keys[i] === target;
        scanTones[i] = hit ? 'found' : 'compare';
        step(r, hit ? 'match' : 'examine', hit ? `Row r${i}: age ${keys[i]} = ${target}, a match` : `Row r${i}: age ${keys[i]} ≠ ${target}, keep going`, [table({ ...scanTones }, { i }), counters('rows examined', examined)], { target, rows_examined: examined, i });
        if (!hit) scanTones[i] = 'visited';
      }
      step(r, 'scanDone', `Scan done: ${examined} rows examined to return ${keys.filter((k) => k === target).length}`, [table({ ...scanTones }), counters('rows examined', examined, [{ k: 'matches', v: keys.filter((k) => k === target).length }])], { target, rows_examined: examined });
    }

    // ── B-tree lookup ──
    let indexRows = 0;
    const walked = new Set<string>();
    if (doIndex) {
      const idxTones: Record<number, Tone> = {};
      const view = (active: string | null, found: string | null): Panel[] => [table({ ...idxTones }), treePanel(levels, walked, active, found), counters('rows examined', indexRows, [{ k: 'index nodes read', v: nodesRead }])];
      if (!levels.length) {
        step(r, 'miss', 'The table is empty, so the index is empty too', [table({}), counters('rows examined', 0)], { target });
      } else {
        step(r, 'root', 'Start at the root of the B-tree', view(levels[0][0].id, null), { target, nodes_read: 0 });
        let node: BNode | null = levels[0][0];
        let done = false;
        while (node && !done) {
          nodesRead++;
          walked.add(node.id);
          r.op();
          let i = 0;
          while (i < node.keys.length && node.keys[i] < target) i++;
          step(r, 'descend', `Node [${node.keys.join(' | ')}]: first key ≥ ${target} is slot ${i}`, view(node.id, null), { target, nodes_read: nodesRead, slot: i });
          if (i < node.keys.length && node.keys[i] === target) {
            const pos = node.rows[i];
            step(r, 'leaf', `${target} found in this node → table rows ${pos.map((p) => 'r' + p).join(', ')}`, view(node.id, node.id), { target, nodes_read: nodesRead });
            pos.forEach((p) => {
              idxTones[p] = 'found';
              matches.push(p);
            });
            indexRows = pos.length;
            step(r, 'fetch', `Fetch only those ${pos.length} row${pos.length > 1 ? 's' : ''}: ${nodesRead} index nodes + ${indexRows} rows`, view(null, node.id), { target, nodes_read: nodesRead, rows_examined: indexRows });
            done = true;
          } else if (node.kids.length) {
            const next: BNode = node.kids[i];
            const dir = i === 0 ? `${target} < ${node.keys[0]}` : i === node.keys.length ? `${target} > ${node.keys[i - 1]}` : `${node.keys[i - 1]} < ${target} < ${node.keys[i]}`;
            step(r, 'next', `${dir}: follow child ${i}`, view(node.id, null), { target, nodes_read: nodesRead, slot: i });
            node = next;
          } else {
            step(r, 'miss', `Leaf reached without ${target}: no matching rows, 0 table rows touched`, view(node.id, null), { target, nodes_read: nodesRead });
            done = true;
          }
        }
      }
    }

    if (doScan && doIndex) {
      const last = r.frames[r.frames.length - 1];
      const chart: Panel = {
        type: 'chart',
        title: 'rows examined',
        kind: 'bar',
        series: [
          { label: 'full scan', points: [[1, n]], tone: 'error' },
          { label: 'index', points: [[2, indexRows]], tone: 'found' },
        ],
        xLabel: 'strategy',
        yLabel: 'rows',
      };
      step(r, 'fetch', `Scan examined ${n} rows; the index read ${nodesRead} nodes and ${indexRows} rows`, [...last.panels, chart], { target, scan: n, index: indexRows });
    }

    matches.sort((a, b) => a - b);
    const found = keys.map((k, i) => (k === target ? i : -1)).filter((i) => i >= 0);
    return { frames: r.frames, result: { matches: doIndex ? matches : found, scan: doScan ? examined : null, index: doIndex ? indexRows : null } };
  },
  reference({ keys, target, mode }) {
    const hits = keys.flatMap((k, i) => (k === target ? [i] : []));
    return { matches: hits, scan: mode === 'B-tree index' ? null : keys.length, index: mode === 'full table scan' ? null : hits.length };
  },
};

const HARNESS = `
from minidjango import models, connection

class Customer(models.Model):
    email = models.CharField(max_length=40, unique=True)
    city = models.CharField(max_length=20)
    age = models.IntegerField(default=30)

CITIES = ["Oslo", "Lima", "Pune", "Kyiv"]

def run_scenario(fn, name):
    import minidjango
    minidjango.reset()
    for i in range(40):
        Customer.objects.create(email=f"c{i}@mail.test", city=CITIES[i % 4], age=20 + i % 30)
    def by_email():
        list(Customer.objects.filter(email="c7@mail.test"))
    def by_city():
        list(Customer.objects.filter(city="Pune"))
    def both():
        by_email()
        by_city()
    def range_query():
        list(Customer.objects.filter(age__gt=45))
    def nothing():
        pass
    if name == "after_warmup":
        by_city()
        name = "email"
    return fn({"email": by_email, "city": by_city, "both": both, "range": range_query, "nothing": nothing}[name])
`;

const planTests = [
  { args: [['email', 'age'], [['email', 'exact']]], expected: ['index', 'email'], name: 'equality on indexed column' },
  { args: [['email', 'age'], [['city', 'exact']]], expected: ['scan', null], name: 'no index on city' },
  { args: [['email', 'age'], [['email', 'icontains']]], expected: ['scan', null], name: 'contains cannot use a B-tree' },
  { args: [['email', 'age'], [['age', 'gt']]], expected: ['index', 'age'], name: 'range scan on index' },
  { args: [['email', 'age'], [['email', 'endswith']]], expected: ['scan', null], name: 'suffix match' },
  { args: [['email', 'age'], [['email', 'startswith']]], expected: ['index', 'email'], name: 'prefix match' },
  { args: [['email', 'age'], [['city', 'exact'], ['age', 'exact']]], expected: ['index', 'age'], name: 'second filter is indexed' },
];

const unit: Unit = {
  id: 'be-indexing',
  hook: '"Why is this query slow?" nearly always ends in "it is doing a full table scan". Interviewers want you to explain how a B-tree turns millions of row checks into a handful of page reads, and when it cannot help.',
  predict: {
    prompt: 'SELECT * FROM users WHERE email = \'a@b.test\' on a table with 1,000,000 rows and no index on email (exactly one row matches). Roughly how many rows does the database examine?',
    options: ['1, it stops at the match', 'About 20 (log2 of a million)', 'All 1,000,000', 'About 500,000 on average'],
    answer: 2,
    explain: 'Without an index nothing says where the match is, nor that it is the only one, so every row must be checked. With a B-tree on email the same lookup reads a few index pages and fetches one row.',
  },
  viz,
  deeper: {
    points: [
      'A B-tree keeps keys sorted inside wide nodes (hundreds of keys per disk page), so a lookup in millions of rows reads only 3-4 pages.',
      'Index lookups and range scans are both cheap because keys are sorted; that is why WHERE age > 45 and ORDER BY can use the same index.',
      'Every index costs space and slows writes, because each INSERT/UPDATE must also update the tree. Index what you filter and join on, not everything.',
      'Primary keys and UNIQUE columns get an index automatically; foreign keys usually do too in Django.',
      'An index cannot help when the predicate hides the column: LIKE \'%abc\', functions such as LOWER(email), or a low-selectivity column such as a boolean.',
    ],
    complexity: { time: 'O(log n) lookup vs O(n) scan', space: 'O(n) extra for the index' },
    pitfalls: ['Indexing a column but filtering with a leading wildcard or a function on it', 'Adding indexes everywhere and slowing down writes', 'Assuming the index is used without checking the query plan (EXPLAIN)'],
  },
  practice: {
    language: 'python',
    fnName: 'query_report',
    statement: 'Customer is a model with a unique email and unindexed city and age. Write query_report(run): call run() (which executes some ORM queries) and return one [verb, rows_examined, used_index] list per SELECT it caused, using connection.queries.',
    signature: 'def query_report(run):',
    solution: `def query_report(run):
    @@connection.reset_queries()@@
    @@run()@@
    return [
        [q["sql"].split()[0], q["rows_examined"], @@q["index"] is not None@@]
        for q in connection.queries
        if q["sql"].startswith("SELECT")
    ]`,
    harness: HARNESS,
    adapter: 'run_scenario',
    tests: [
      { args: ['email'], expected: [['SELECT', 1, true]], name: 'unique column uses its index' },
      { args: ['city'], expected: [['SELECT', 40, false]], name: 'unindexed column scans every row' },
      { args: ['both'], expected: [['SELECT', 1, true], ['SELECT', 40, false]], name: 'two queries, two reports' },
      { args: ['range'], expected: [['SELECT', 40, false]], name: 'range filter scans in minidjango' },
      { args: ['nothing'], expected: [], name: 'no queries' },
      { args: ['after_warmup'], expected: [['SELECT', 1, true]], name: 'earlier queries are not reported' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'choose_plan',
    statement: 'choose_plan(indexed, filters) returns ["index", column] when a filter can use a B-tree index on an indexed column, otherwise ["scan", None]. filters is a list of [column, lookup]. It plans an index lookup for LIKE \'%x%\' style filters that cannot use one. Fix it.',
    buggy: `USABLE = {"exact", "gt", "gte", "lt", "lte", "startswith", "in"}

def choose_plan(indexed, filters):
    for col, op in filters:
        if col in indexed:
            return ["index", col]
    return ["scan", None]`,
    fixed: `USABLE = {"exact", "gt", "gte", "lt", "lte", "startswith", "in"}

def choose_plan(indexed, filters):
    for col, op in filters:
        if col in indexed and op in USABLE:
            return ["index", col]
    return ["scan", None]`,
    tests: planTests,
    bugType: 'index misuse',
    hint: 'Is having an index on the column enough? Think about what lookup the filter performs.',
    explanation: 'A B-tree is sorted by the start of the value, so it serves equality, ranges and prefix matches. contains/endswith (LIKE \'%x\') cannot narrow a sorted structure, so the database scans anyway. The plan must check the lookup type, not just the column.',
  },
  boss: {
    title: 'Walk the B-tree',
    statement: 'A B-tree node is {"keys": sorted list, "children": list}; leaves have "children": []. Internal nodes also store keys, and for n keys there are n + 1 children. Write btree_search(root, key) returning [found, nodes_read] where nodes_read counts every node you looked at.',
    language: 'python',
    fnName: 'btree_search',
    starter: `def btree_search(root, key):
    # your code here
    pass
`,
    solution: `def btree_search(root, key):
    node, reads = root, 0
    while True:
        reads += 1
        i = 0
        while i < len(node["keys"]) and key > node["keys"][i]:
            i += 1
        if i < len(node["keys"]) and node["keys"][i] == key:
            return [True, reads]
        if not node["children"]:
            return [False, reads]
        node = node["children"][i]`,
    tests: (() => {
      const T = {
        keys: [20],
        children: [
          { keys: [10], children: [{ keys: [5], children: [] }, { keys: [15], children: [] }] },
          { keys: [30, 40], children: [{ keys: [25], children: [] }, { keys: [35], children: [] }, { keys: [50], children: [] }] },
        ],
      };
      return [
        { args: [T, 20], expected: [true, 1], name: 'key in the root' },
        { args: [T, 15], expected: [true, 3], name: 'key in a leaf' },
        { args: [T, 40], expected: [true, 2], name: 'key in an internal node' },
        { args: [T, 36], expected: [false, 3], name: 'miss between two keys' },
        { args: [T, 1], expected: [false, 3], name: 'smaller than everything' },
        { args: [T, 99], expected: [false, 3], name: 'larger than everything' },
        { args: [{ keys: [], children: [] }, 5], expected: [false, 1], name: 'empty tree' },
      ];
    })(),
    hints: ['At each node find the first index i where keys[i] >= key. Either keys[i] == key (found) or key lives in children[i].', 'Stop with [False, reads] when the node has no children. Count a node when you arrive at it.'],
    combines: ['binary-search', 'be-indexing'],
  },
  quiz: [
    {
      prompt: 'Which query can NOT use a plain B-tree index on name?',
      options: ["WHERE name = 'ada'", "WHERE name LIKE 'ad%'", "WHERE name LIKE '%da'", 'WHERE name > \'m\''],
      answer: 2,
      explain: 'A leading wildcard means the match can start anywhere, so the sorted order of the index gives no place to start.',
    },
  ],
  simulationNote: 'Rows examined come from minidjango, a small in-memory ORM that logs how many rows each query touches. Only equality filters on indexed columns use an index there; real databases also use B-trees for ranges and prefixes, as the lesson explains.',
};

export default unit;
