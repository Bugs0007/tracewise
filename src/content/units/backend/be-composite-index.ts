import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { step } from '@/content/lib/backend-db-auth';

const code = `
def plan(index, query):
    usable = 0                                       #@prefix
    for col in ("a", "b"):                           #@walk
        if col not in query:
            break                                    #@gap
        usable += 1
        if query[col][0] != "=":
            break                                    #@range
    if usable == 0:
        return [e for e in index if matches(e, query)]   #@full
    lo, hi = seek_bounds(index, query, usable)       #@seek
    return [e for e in index[lo:hi] if matches(e, query)]  #@filter
`;

/** (a, b) per table row; the row id is its 1-based position. */
const ROWS: [number, number][] = [
  [1, 2],
  [1, 5],
  [2, 1],
  [2, 3],
  [2, 4],
  [2, 5],
  [3, 2],
  [3, 3],
  [3, 5],
  [4, 1],
  [4, 3],
  [4, 4],
  [1, 3],
  [3, 4],
];
const INDEX = ROWS.map(([a, b], i) => ({ a, b, id: i + 1 })).sort((x, y) => x.a - y.a || x.b - y.b || x.id - y.id);

const SHAPES = ['a = A', 'a = A AND b = B', 'b = B', 'a > A AND b = B', 'a = A AND b > B'];

interface In {
  shape: string;
  a: number;
  b: number;
}

type Cond = { op: '=' | '>'; v: number };
const queryOf = (shape: string, a: number, b: number): { a?: Cond; b?: Cond } => {
  switch (shape) {
    case 'a = A':
      return { a: { op: '=', v: a } };
    case 'a = A AND b = B':
      return { a: { op: '=', v: a }, b: { op: '=', v: b } };
    case 'b = B':
      return { b: { op: '=', v: b } };
    case 'a > A AND b = B':
      return { a: { op: '>', v: a }, b: { op: '=', v: b } };
    default:
      return { a: { op: '=', v: a }, b: { op: '>', v: b } };
  }
};
const test = (c: Cond | undefined, x: number) => !c || (c.op === '=' ? x === c.v : x > c.v);
const where = (shape: string, a: number, b: number) => shape.replace('A', String(a)).replace('B', String(b));

type Key = [number, number, number];
const cmp = (x: Key, y: Key) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
const bisect = (key: Key, right: boolean): number => {
  let lo = 0;
  let hi = INDEX.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const c = cmp([INDEX[mid].a, INDEX[mid].b, INDEX[mid].id], key);
    if (c < 0 || (right && c === 0)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};
const INF = Infinity;

const viz: VizDef<In> = {
  id: 'be-composite-index',
  title: 'Composite index (a, b)',
  code,
  language: 'python',
  inputs: [
    { key: 'shape', label: 'Query shape', kind: 'select', options: SHAPES, default: 'a = A' },
    { key: 'a', label: 'A', kind: 'number', default: 2 },
    { key: 'b', label: 'B', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'a only (uses prefix)', input: { shape: 'a = A', a: 2, b: 3 } },
    { label: 'a and b (exact)', input: { shape: 'a = A AND b = B', a: 2, b: 3 } },
    { label: 'b only (no prefix)', input: { shape: 'b = B', a: 2, b: 3 } },
    { label: 'range on a, then b', input: { shape: 'a > A AND b = B', a: 1, b: 3 } },
    { label: 'equality then range', input: { shape: 'a = A AND b > B', a: 3, b: 2 } },
  ],
  run({ shape, a, b }) {
    const r = new Recorder(code);
    const q = queryOf(shape, a, b);
    const N = INDEX.length;
    const labels = INDEX.map((e) => `#${e.id}`);
    const values = INDEX.map((e) => `${e.a},${e.b}`);
    const panel = (tones: Record<number, Tone>, pointers?: Record<string, number>, range?: ArrayPanel['range']): ArrayPanel => ({
      type: 'array',
      title: 'index (a, b) sorted by a, then b; labels are row ids',
      values,
      indexLabels: labels,
      tones,
      pointers,
      range,
    });
    const info = (usable: number | string, examined: number, matched: number): Panel => ({
      type: 'kv',
      title: `WHERE ${where(shape, a, b)}`,
      entries: [
        { k: 'usable prefix columns', v: usable },
        { k: 'index entries examined', v: examined, tone: examined === N ? 'error' : 'default' },
        { k: 'rows matched', v: matched },
      ],
    });

    step(r, 'prefix', `Index entries are ordered by a first; inside equal a, ordered by b. WHERE ${where(shape, a, b)}`, [panel({}), info(0, 0, 0)], { usable: 0 });
    let usable = 0;
    for (const col of ['a', 'b'] as const) {
      const c = q[col];
      if (!c) {
        step(r, 'gap', `No condition on ${col}: the left prefix ends here`, [panel({}), info(usable, 0, 0)], { col, usable });
        break;
      }
      usable++;
      step(r, 'walk', `Column ${col} has "${col} ${c.op} ${c.v}": usable prefix is now ${usable}`, [panel({}), info(usable, 0, 0)], { col, usable });
      if (c.op !== '=') {
        step(r, 'range', `${col} is a range, so columns after it cannot narrow the seek`, [panel({}), info(usable, 0, 0)], { col, usable });
        break;
      }
    }

    let lo = 0;
    let hi = N;
    if (usable === 0) {
      step(r, 'full', 'Nothing to seek on: the whole index must be read, entry by entry', [panel({}, { lo, hi: hi - 1 }, { from: 0, to: N - 1, label: 'scanned', tone: 'compare' }), info(0, N, 0)], { usable, lo, hi });
    } else {
      const A = q.a!;
      const B = q.b;
      if (A.op === '=' && B?.op === '=') {
        lo = bisect([A.v, B.v, -INF], false);
        hi = bisect([A.v, B.v, INF], true);
      } else if (A.op === '=' && B?.op === '>') {
        lo = bisect([A.v, B.v, INF], true);
        hi = bisect([A.v, INF, INF], true);
      } else if (A.op === '=') {
        lo = bisect([A.v, -INF, -INF], false);
        hi = bisect([A.v, INF, INF], true);
      } else {
        lo = bisect([A.v, INF, INF], true);
        hi = N;
      }
      const skipped: Record<number, Tone> = {};
      for (let i = 0; i < N; i++) if (i < lo || i >= hi) skipped[i] = 'muted';
      step(r, 'seek', `Binary search jumps to entry ${lo}; entries outside ${lo}..${hi - 1} are never read`, [panel(skipped, { lo, hi: hi - 1 }, hi > lo ? { from: lo, to: hi - 1, label: 'scanned range', tone: 'compare' } : undefined), info(usable, hi - lo, 0)], { usable, lo, hi });
    }

    const tones: Record<number, Tone> = {};
    for (let i = 0; i < N; i++) if (i < lo || i >= hi) tones[i] = 'muted';
    const matched: number[] = [];
    for (let i = lo; i < hi; i++) {
      r.op();
      const e = INDEX[i];
      const ok = test(q.a, e.a) && test(q.b, e.b);
      if (ok) matched.push(e.id);
      tones[i] = ok ? 'found' : 'compare';
      step(r, 'filter', ok ? `Entry (${e.a}, ${e.b}) → row #${e.id} matches` : `Entry (${e.a}, ${e.b}) read but fails the condition`, [panel({ ...tones }, { i }, hi > lo ? { from: lo, to: hi - 1, tone: 'compare' } : undefined), info(usable, i - lo + 1, matched.length)], { i, examined: i - lo + 1 });
      if (!ok) tones[i] = 'visited';
    }
    matched.sort((x, y) => x - y);
    step(r, 'filter', `Examined ${hi - lo} of ${N} index entries, ${matched.length} row${matched.length === 1 ? '' : 's'} match`, [panel({ ...tones }, undefined, hi > lo ? { from: lo, to: hi - 1, tone: 'compare' } : undefined), info(usable, hi - lo, matched.length)], { examined: hi - lo, matched: matched.length });
    return { frames: r.frames, result: { examined: hi - lo, matches: matched } };
  },
  reference({ shape, a, b }) {
    const q = queryOf(shape, a, b);
    const matches = ROWS.flatMap(([ra, rb], i) => (test(q.a, ra) && test(q.b, rb) ? [i + 1] : [])).sort((x, y) => x - y);
    let window: typeof INDEX;
    if (shape === 'b = B') window = INDEX;
    else if (shape === 'a = A') window = INDEX.filter((e) => e.a === a);
    else if (shape === 'a = A AND b = B') window = INDEX.filter((e) => e.a === a && e.b === b);
    else if (shape === 'a > A AND b = B') window = INDEX.filter((e) => e.a > a);
    else window = INDEX.filter((e) => e.a === a && e.b > b);
    return { examined: window.length, matches };
  },
};

const E = [
  [1, 2, 1],
  [1, 5, 2],
  [2, 1, 3],
  [2, 3, 4],
  [2, 4, 5],
  [3, 2, 6],
  [3, 3, 7],
  [4, 1, 8],
];

const unit: Unit = {
  id: 'be-composite-index',
  hook: 'Which index do you add for WHERE a = ? AND b = ?, and does it also help WHERE b = ? alone? The left-prefix rule is the follow-up question that separates people who memorised "add an index" from people who understand how it is laid out.',
  predict: {
    prompt: 'A table has one composite index on (a, b). Which of these queries can use the index to jump straight to the matching entries?',
    options: ['WHERE b = 3', 'WHERE a = 2', 'Both of them equally well', 'Neither: composite indexes only work for exact (a, b) pairs'],
    answer: 1,
    explain: 'The index is sorted by a first, so entries with a = 2 sit together and a binary search finds them. Entries with b = 3 are scattered across every a, so WHERE b = 3 alone needs a full index scan.',
  },
  viz,
  deeper: {
    points: [
      'A composite index on (a, b) is one sorted list of (a, b) pairs: sorted by a, ties broken by b. That layout decides everything it can do.',
      'Left-prefix rule: the index serves conditions on a, or a and b, but not b alone, because b is only sorted within one value of a.',
      'Equality columns first, then at most one range column. After a range on a column, later columns can only filter entries, not narrow the seek.',
      'Put the most selective equality column first only if it is always queried; otherwise put the column that every query uses first.',
      'An index on (a, b) already covers queries on a, so a separate index on a alone is usually redundant.',
    ],
    pitfalls: ['Creating the index as (b, a) when queries filter on a', 'Expecting ORDER BY b to use an (a, b) index without a = constant', 'Adding a range column in the middle and wondering why later columns are not used'],
  },
  practice: {
    language: 'python',
    fnName: 'usable_prefix',
    statement: 'Given the columns of a composite index (in order) and a dict of conditions {column: operator} (operators like "=", ">", "<", "BETWEEN"), return how many leading index columns help narrow the search. Stop at the first column without a condition, and stop after the first non-equality column (it counts).',
    signature: 'def usable_prefix(index_cols, conds):',
    solution: `def usable_prefix(index_cols, conds):
    used = 0
    for col in index_cols:
        if @@col not in conds@@:
            break
        used += 1
        if @@conds[col] != "="@@:
            break
    return @@used@@`,
    tests: [
      { args: [['a', 'b'], { a: '=' }], expected: 1, name: 'a only' },
      { args: [['a', 'b'], { a: '=', b: '=' }], expected: 2, name: 'a and b' },
      { args: [['a', 'b'], { b: '=' }], expected: 0, name: 'b alone has no prefix' },
      { args: [['a', 'b', 'c'], { a: '=', b: '>', c: '=' }], expected: 2, name: 'range column ends the prefix' },
      { args: [['a', 'b', 'c'], { a: '=', c: '=' }], expected: 1, name: 'gap in the middle' },
      { args: [['a', 'b'], { a: 'BETWEEN', b: '=' }], expected: 1, name: 'range on first column' },
      { args: [['a', 'b'], {}], expected: 0, name: 'no conditions' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'best_index',
    statement: 'best_index(indexes, conds) should return the index (list of columns) with the longest usable left prefix for the query, or None if no index helps. Ties go to the earlier index. For a query on a, it picks the (b, a) index. Fix it.',
    buggy: `def best_index(indexes, conds):
    best, best_score = None, 0
    for cols in indexes:
        score = len([c for c in cols if c in conds])
        if score > best_score:
            best, best_score = cols, score
    return best`,
    fixed: `def best_index(indexes, conds):
    best, best_score = None, 0
    for cols in indexes:
        score = 0
        for c in cols:
            if c not in conds:
                break
            score += 1
            if conds[c] != "=":
                break
        if score > best_score:
            best, best_score = cols, score
    return best`,
    tests: [
      { args: [[['b', 'a'], ['a', 'b']], { a: '=' }], expected: ['a', 'b'], name: 'index on (b, a) cannot serve a' },
      { args: [[['a', 'b']], { a: '=', b: '=' }], expected: ['a', 'b'] },
      { args: [[['a', 'b']], { b: '=' }], expected: null, name: 'b alone has no usable index' },
      { args: [[['a'], ['a', 'b']], { a: '=', b: '=' }], expected: ['a', 'b'], name: 'longer prefix wins' },
      { args: [[['a', 'b'], ['a', 'c']], { a: '=' }], expected: ['a', 'b'], name: 'ties keep the first' },
      { args: [[['a', 'b']], { a: '>', b: '=' }], expected: ['a', 'b'] },
    ],
    bugType: 'ignoring column order',
    hint: 'Does it matter where in the index a column sits, or only whether it appears?',
    explanation: 'The buggy score counts columns that merely appear in the query. An index is only usable from its left end: (b, a) has a in second position, so its prefix is 0 for a query on a. Count leading columns until the first one without a condition (or after a range).',
  },
  boss: {
    title: 'Seek in a composite index',
    statement: 'entries is a list of [a, b, row_id] sorted by (a, b). Write lookup(entries, a=None, b=None) returning [ids, examined]: ids are the row ids where each given column matches (a missing argument matches anything), in index order; examined is how many index entries you must read. With a given, use binary search (bisect) to read only the entries with that a (and that b, if given). With only b, every entry is read.',
    language: 'python',
    fnName: 'lookup',
    starter: `def lookup(entries, a=None, b=None):
    # your code here
    pass
`,
    solution: `from bisect import bisect_left, bisect_right

def lookup(entries, a=None, b=None):
    keys = [(e[0], e[1]) for e in entries]
    if a is None:
        window = entries
    elif b is None:
        window = entries[bisect_left(keys, (a,)):bisect_right(keys, (a, float("inf")))]
    else:
        window = entries[bisect_left(keys, (a, b)):bisect_right(keys, (a, b))]
    ids = [e[2] for e in window if b is None or e[1] == b]
    return [ids, len(window)]`,
    tests: [
      { args: [E, 2, null], expected: [[3, 4, 5], 3], name: 'a only' },
      { args: [E, 3, 3], expected: [[7], 1], name: 'a and b' },
      { args: [E, null, 1], expected: [[3, 8], 8], name: 'b only reads everything' },
      { args: [E, 9, null], expected: [[], 0], name: 'unknown a' },
      { args: [E, 2, 9], expected: [[], 0], name: 'known a, unknown b' },
      { args: [E, 1, 5], expected: [[2], 1], name: 'edge entry' },
    ],
    hints: ['Build a list of (a, b) tuples and use bisect_left / bisect_right to find where the window starts and ends.', 'Compare (a,) with bisect_left, and (a, float("inf")) with bisect_right, to cover every b for one a.'],
    combines: ['be-indexing', 'binary-search'],
  },
  quiz: [
    {
      prompt: 'You have an index on (status, created_at) and run WHERE status = \'open\' ORDER BY created_at. What happens?',
      options: ['A full table scan and a sort', 'The index narrows to status = open, already in created_at order: no sort needed', 'The index cannot be used', 'Only created_at is used'],
      answer: 1,
      explain: 'Within one value of status the entries are already ordered by created_at, so the equality prefix plus the next column gives sorted output for free.',
    },
  ],
};

export default unit;
