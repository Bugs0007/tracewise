import { Recorder } from '@/engine/recorder';
import type { GraphEdge, GraphNode, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';

const code = `
class SegmentTree:
    def __init__(self, nums):
        self.n = len(nums)
        self.tree = [0] * (4 * self.n)
        if self.n:
            self._build(nums, 1, 0, self.n - 1)

    def _build(self, nums, node, lo, hi):
        if lo == hi:
            self.tree[node] = nums[lo]                          #@leaf
            return
        mid = (lo + hi) // 2                                    #@mid
        self._build(nums, 2 * node, lo, mid)                    #@buildL
        self._build(nums, 2 * node + 1, mid + 1, hi)            #@buildR
        self.tree[node] = self.tree[2 * node] + self.tree[2 * node + 1]   #@pull

    def update(self, i, val):
        self._update(1, 0, self.n - 1, i, val)                  #@update

    def _update(self, node, lo, hi, i, val):
        if lo == hi:
            self.tree[node] = val                               #@uLeaf
            return
        mid = (lo + hi) // 2
        if i <= mid:                                            #@uGo
            self._update(2 * node, lo, mid, i, val)
        else:
            self._update(2 * node + 1, mid + 1, hi, i, val)
        self.tree[node] = self.tree[2 * node] + self.tree[2 * node + 1]   #@uPull

    def query(self, l, r):
        return self._query(1, 0, self.n - 1, l, r)              #@query

    def _query(self, node, lo, hi, l, r):
        if r < lo or hi < l:
            return 0                                            #@qOut
        if l <= lo and hi <= r:
            return self.tree[node]                              #@qIn
        mid = (lo + hi) // 2                                    #@qSplit
        return (self._query(2 * node, lo, mid, l, r)
                + self._query(2 * node + 1, mid + 1, hi, l, r))
`;

interface In {
  nums: number[];
  index: number;
  value: number;
  left: number;
  right: number;
}

interface SNode {
  id: number; // heap-style index: children of k are 2k and 2k+1
  lo: number;
  hi: number;
  depth: number;
}

function shape(n: number): SNode[] {
  const out: SNode[] = [];
  const rec = (id: number, lo: number, hi: number, depth: number) => {
    out.push({ id, lo, hi, depth });
    if (lo === hi) return;
    const mid = (lo + hi) >> 1;
    rec(2 * id, lo, mid, depth + 1);
    rec(2 * id + 1, mid + 1, hi, depth + 1);
  };
  rec(1, 0, n - 1, 0);
  return out;
}

const viz: VizDef<In> = {
  id: 'segment-tree',
  title: 'Segment tree: build, update, range sum',
  code,
  language: 'python',
  inputs: [
    { key: 'nums', label: 'Array', kind: 'numbers', default: [2, 5, 1, 4, 9, 3], maxItems: 8 },
    { key: 'index', label: 'Update index', kind: 'number', default: 2 },
    { key: 'value', label: 'New value at that index', kind: 'number', default: 6 },
    { key: 'left', label: 'Query from (inclusive)', kind: 'number', default: 1 },
    { key: 'right', label: 'Query to (inclusive)', kind: 'number', default: 4 },
  ],
  presets: [
    { label: 'Default', input: { nums: [2, 5, 1, 4, 9, 3], index: 2, value: 6, left: 1, right: 4 } },
    { label: 'Whole range', input: { nums: [3, 1, 4, 1, 5], index: 0, value: 7, left: 0, right: 4 } },
    { label: 'Single element', input: { nums: [8, 2, 7, 5], index: 3, value: 1, left: 2, right: 2 } },
    { label: 'One-element array', input: { nums: [9], index: 0, value: 4, left: 0, right: 0 } },
  ],
  run({ nums, index, value, left, right }) {
    const n = nums.length;
    if (!n) throw new Error('Enter at least one value');
    for (const [name, v] of [['Update index', index], ['Query from', left], ['Query to', right]] as const) {
      if (!Number.isInteger(v) || v < 0 || v >= n) throw new Error(`${name} must be a whole number from 0 to ${n - 1}`);
    }
    if (left > right) throw new Error('Query "from" must be <= "to"');
    if (!Number.isFinite(value)) throw new Error('New value must be a number');

    const r = new Recorder(code);
    const nodes = shape(n);
    const byId = new Map(nodes.map((s) => [s.id, s]));
    const arr = [...nums];
    const sum = new Map<number, number>(); // only built nodes have a sum
    const GAP = 66;
    const GAPY = 74;
    // x: leaves are laid out left to right, inner nodes centred over their children
    const xs = new Map<number, number>();
    const place = (id: number): number => {
      const s = byId.get(id)!;
      if (s.lo === s.hi) {
        xs.set(id, s.lo * GAP);
        return s.lo * GAP;
      }
      const x = (place(2 * id) + place(2 * id + 1)) / 2;
      xs.set(id, x);
      return x;
    };
    place(1);
    const maxDepth = Math.max(...nodes.map((s) => s.depth));
    const W = (n - 1) * GAP + 80;
    const H = maxDepth * GAPY + 90;

    const panels = (tones: Record<number, Tone> = {}, edgeTones: Record<string, Tone> = {}, extra: Panel[] = [], arrTones: Record<number, Tone> = {}, range?: { from: number; to: number; label: string; tone: Tone }): Panel[] => {
      const gn: GraphNode[] = nodes.map((s) => ({
        id: `s${s.id}`,
        label: sum.has(s.id) ? String(sum.get(s.id)) : '?',
        sub: s.lo === s.hi ? `[${s.lo}]` : `[${s.lo},${s.hi}]`,
        x: 40 + xs.get(s.id)!,
        y: 32 + s.depth * GAPY,
        shape: 'rect',
        w: 56,
        h: 40,
        tone: tones[s.id] ?? (sum.has(s.id) ? 'default' : 'muted'),
      }));
      const ge: GraphEdge[] = nodes.filter((s) => s.id > 1).map((s) => ({ from: `s${s.id >> 1}`, to: `s${s.id}`, tone: edgeTones[`${s.id >> 1}>${s.id}`] }));
      return [
        { type: 'graph', title: 'Segment tree: top = sum, bottom = range [lo,hi]', nodes: gn, edges: ge, width: W, height: H },
        { type: 'array', title: 'Array', values: arr, tones: arrTones, range },
        ...extra,
      ];
    };

    // ── build ──
    r.step('leaf', `Build over ${n} values: split ranges in half until each range is a single index`, panels(), { n });
    const done = new Set<number>();
    const build = (id: number) => {
      const s = byId.get(id)!;
      if (s.lo === s.hi) {
        sum.set(id, arr[s.lo]);
        done.add(id);
        r.op();
        r.step('leaf', `Leaf [${s.lo}] stores nums[${s.lo}] = ${arr[s.lo]}`, panels({ [id]: 'new' }, {}, [], { [s.lo]: 'active' }), { node: id, lo: s.lo, hi: s.hi });
        return;
      }
      build(2 * id);
      build(2 * id + 1);
      sum.set(id, sum.get(2 * id)! + sum.get(2 * id + 1)!);
      r.op();
      r.step('pull', `[${s.lo},${s.hi}] = ${sum.get(2 * id)} + ${sum.get(2 * id + 1)} = ${sum.get(id)}`, panels({ [id]: 'new', [2 * id]: 'compare', [2 * id + 1]: 'compare' }, { [`${id}>${2 * id}`]: 'active', [`${id}>${2 * id + 1}`]: 'active' }, [], {}, { from: s.lo, to: s.hi, label: 'covered', tone: 'new' }), { node: id, lo: s.lo, hi: s.hi, sum: sum.get(id)! });
    };
    build(1);

    // ── point update ──
    const path: number[] = [];
    const edgeP: Record<string, Tone> = {};
    const upd = (id: number) => {
      const s = byId.get(id)!;
      path.push(id);
      if (path.length > 1) edgeP[`${path[path.length - 2]}>${id}`] = 'path';
      const tones = (): Record<number, Tone> => Object.fromEntries(path.map((p) => [p, 'path' as Tone]));
      if (s.lo === s.hi) {
        const old = arr[index];
        arr[index] = value;
        sum.set(id, value);
        r.op();
        r.step('uLeaf', `Leaf [${index}]: ${old} → ${value}`, panels({ ...tones(), [id]: 'swap' }, edgeP, [], { [index]: 'swap' }), { i: index, val: value });
        return;
      }
      const mid = (s.lo + s.hi) >> 1;
      const goLeft = index <= mid;
      r.op();
      r.step('uGo', `[${s.lo},${s.hi}]: index ${index} ${goLeft ? '<=' : '>'} mid ${mid} → go ${goLeft ? 'left' : 'right'}`, panels({ ...tones(), [id]: 'active' }, edgeP, [], { [index]: 'active' }), { node: id, mid, i: index });
      upd(goLeft ? 2 * id : 2 * id + 1);
      const before = sum.get(id)!;
      sum.set(id, sum.get(2 * id)! + sum.get(2 * id + 1)!);
      r.op();
      r.step('uPull', `Recompute [${s.lo},${s.hi}]: ${before} → ${sum.get(id)}`, panels({ ...tones(), [id]: 'swap' }, edgeP, [], { [index]: 'swap' }), { node: id, sum: sum.get(id)! });
      path.pop();
    };
    r.step('update', `update(${index}, ${value}): only the nodes whose range contains ${index} can change`, panels({}, {}, [], { [index]: 'active' }), { i: index, val: value });
    upd(1);

    // ── range query ──
    let total = 0;
    const qTone: Record<number, Tone> = {};
    const qEdge: Record<string, Tone> = {};
    const hot = { from: left, to: right, label: `query [${left},${right}]`, tone: 'compare' as Tone };
    const arrQ = Object.fromEntries(Array.from({ length: right - left + 1 }, (_, k) => [left + k, 'compare' as Tone]));
    const q = (id: number, parent: number | null) => {
      const s = byId.get(id)!;
      if (parent) qEdge[`${parent}>${id}`] = 'compare';
      r.op();
      if (right < s.lo || s.hi < left) {
        qTone[id] = 'muted';
        r.step('qOut', `[${s.lo},${s.hi}] is outside [${left},${right}] → contributes 0`, panels(qTone, qEdge, [], arrQ, hot), { node: id, total });
        return;
      }
      if (left <= s.lo && s.hi <= right) {
        total += sum.get(id)!;
        qTone[id] = 'found';
        r.step('qIn', `[${s.lo},${s.hi}] is fully inside → take its sum ${sum.get(id)}, total = ${total}`, panels(qTone, qEdge, [], arrQ, hot), { node: id, total });
        return;
      }
      qTone[id] = 'compare';
      r.step('qSplit', `[${s.lo},${s.hi}] only partly overlaps → ask both halves`, panels({ ...qTone, [id]: 'active' }, qEdge, [], arrQ, hot), { node: id, total });
      q(2 * id, id);
      q(2 * id + 1, id);
    };
    r.step('query', `query(${left}, ${right}): sum of the updated array from ${left} to ${right}`, panels({}, {}, [], arrQ, hot), { l: left, r: right });
    q(1, null);
    r.step('query', `Range sum [${left},${right}] = ${total}`, panels(qTone, qEdge, [], Object.fromEntries(Object.keys(arrQ).map((k) => [k, 'found' as Tone])), hot), { total });
    return { frames: r.frames, result: total };
  },
  reference({ nums, index, value, left, right }) {
    const a = [...nums];
    a[index] = value;
    return a.slice(left, right + 1).reduce((s, v) => s + v, 0);
  },
};

const OPS_A = ['NumArray', 'sumRange', 'update', 'sumRange', 'update', 'sumRange'];
const tests = [
  { args: [OPS_A, [[[1, 3, 5]], [0, 2], [1, 2], [0, 2], [2, 10], [1, 2]]], expected: [null, 9, null, 8, null, 12], name: 'update then query' },
  { args: [['NumArray', 'sumRange'], [[[7]], [0, 0]]], expected: [null, 7], name: 'single element' },
  { args: [['NumArray', 'update', 'sumRange', 'sumRange'], [[[2, 4, 6, 8, 10]], [2, 1], [0, 4], [3, 4]]], expected: [null, null, 25, 18], name: 'update in the middle' },
  { args: [['NumArray', 'update', 'update', 'sumRange', 'sumRange'], [[[1, 1, 1, 1]], [1, 5], [2, 7], [1, 2], [0, 3]]], expected: [null, null, null, 12, 14], name: 'two adjacent updates' },
  { args: [['NumArray', 'sumRange', 'sumRange', 'update', 'sumRange'], [[[-2, 0, 3, -5, 2, -1]], [0, 2], [2, 5], [3, 5], [2, 5]]], expected: [null, 1, -1, null, 9], name: 'negative numbers' },
];

const unit: Unit = {
  id: 'segment-tree',
  hook: 'A segment tree answers "sum of this range" and handles "change one element" in O(log n) each. It is the go-to when a plain prefix-sum array would need O(n) to rebuild after every update.',
  predict: {
    prompt: 'A segment tree covers indices 0..7. You query the range [0, 7] (the whole array). How many nodes does the query need to visit?',
    options: ['1 — the root is fully covered', '8 — one per leaf', '15 — every node', '3 — the root and its two children'],
    answer: 0,
    explain: 'The root stores the sum of its whole range [0,7], which lies entirely inside the query, so the recursion stops right there. Queries only descend into nodes that overlap the range partially; fully covered nodes answer immediately.',
  },
  viz,
  deeper: {
    points: [
      'Each node stores the aggregate (here: sum) of an index range. The root covers everything; children cover the left and right halves; leaves are single elements.',
      'Heap-style numbering keeps it in a flat array: children of node k are 2k and 2k+1. 4n slots are always enough.',
      'Query has three cases for every node: disjoint (return 0), fully covered (return its stored sum), partial overlap (split into both children).',
      'At most two nodes per level are partially covered, which is why a query touches O(log n) nodes.',
      'A point update changes one leaf, then recomputes every ancestor on the way back up, again O(log n).',
      'Swap + for min or max and you get range-minimum or range-maximum queries with the same code.',
    ],
    complexity: { time: 'O(n) build, O(log n) update and query', space: 'O(n)' },
    pitfalls: ['Splitting with [lo, mid] and [mid, hi] so ranges overlap', 'Sending the update to the wrong child because of < versus <= at mid', 'Allocating only 2n slots for a recursive tree (use 4n)'],
  },
  practice: {
    language: 'python',
    fnName: 'NumArray',
    adapter: 'run_ops',
    harness: OPS_HARNESS,
    statement: 'Implement `NumArray(nums)` with `update(index, val)` (set nums[index] = val) and `sumRange(left, right)` (inclusive sum), both in O(log n), using a segment tree.',
    signature: 'class NumArray:',
    solution: `class NumArray:
    def __init__(self, nums):
        self.n = len(nums)
        self.tree = [0] * (4 * self.n)
        self._build(nums, 1, 0, self.n - 1)

    def _build(self, nums, node, lo, hi):
        if lo == hi:
            self.tree[node] = nums[lo]
            return
        mid = (lo + hi) // 2
        self._build(nums, 2 * node, lo, mid)
        self._build(nums, @@2 * node + 1@@, mid + 1, hi)
        self.tree[node] = @@self.tree[2 * node] + self.tree[2 * node + 1]@@

    def update(self, index, val):
        self._update(1, 0, self.n - 1, index, val)

    def _update(self, node, lo, hi, i, val):
        if lo == hi:
            self.tree[node] = val
            return
        mid = (lo + hi) // 2
        if @@i <= mid@@:
            self._update(2 * node, lo, mid, i, val)
        else:
            self._update(2 * node + 1, mid + 1, hi, i, val)
        self.tree[node] = self.tree[2 * node] + self.tree[2 * node + 1]

    def sumRange(self, left, right):
        return self._query(1, 0, self.n - 1, left, right)

    def _query(self, node, lo, hi, l, r):
        if @@r < lo or hi < l@@:
            return 0
        if @@l <= lo and hi <= r@@:
            return self.tree[node]
        mid = (lo + hi) // 2
        return self._query(2 * node, lo, mid, l, r) + self._query(2 * node + 1, mid + 1, hi, l, r)`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'NumArray',
    adapter: 'run_ops',
    harness: OPS_HARNESS,
    statement: 'Queries are right until an update touches certain indexes; then some sums are wrong. Find the off-by-one in update.',
    buggy: `class NumArray:
    def __init__(self, nums):
        self.n = len(nums)
        self.tree = [0] * (4 * self.n)
        self._build(nums, 1, 0, self.n - 1)

    def _build(self, nums, node, lo, hi):
        if lo == hi:
            self.tree[node] = nums[lo]
            return
        mid = (lo + hi) // 2
        self._build(nums, 2 * node, lo, mid)
        self._build(nums, 2 * node + 1, mid + 1, hi)
        self.tree[node] = self.tree[2 * node] + self.tree[2 * node + 1]

    def update(self, index, val):
        self._update(1, 0, self.n - 1, index, val)

    def _update(self, node, lo, hi, i, val):
        if lo == hi:
            self.tree[node] = val
            return
        mid = (lo + hi) // 2
        if i < mid:
            self._update(2 * node, lo, mid, i, val)
        else:
            self._update(2 * node + 1, mid + 1, hi, i, val)
        self.tree[node] = self.tree[2 * node] + self.tree[2 * node + 1]

    def sumRange(self, left, right):
        return self._query(1, 0, self.n - 1, left, right)

    def _query(self, node, lo, hi, l, r):
        if r < lo or hi < l:
            return 0
        if l <= lo and hi <= r:
            return self.tree[node]
        mid = (lo + hi) // 2
        return self._query(2 * node, lo, mid, l, r) + self._query(2 * node + 1, mid + 1, hi, l, r)`,
    fixed: `class NumArray:
    def __init__(self, nums):
        self.n = len(nums)
        self.tree = [0] * (4 * self.n)
        self._build(nums, 1, 0, self.n - 1)

    def _build(self, nums, node, lo, hi):
        if lo == hi:
            self.tree[node] = nums[lo]
            return
        mid = (lo + hi) // 2
        self._build(nums, 2 * node, lo, mid)
        self._build(nums, 2 * node + 1, mid + 1, hi)
        self.tree[node] = self.tree[2 * node] + self.tree[2 * node + 1]

    def update(self, index, val):
        self._update(1, 0, self.n - 1, index, val)

    def _update(self, node, lo, hi, i, val):
        if lo == hi:
            self.tree[node] = val
            return
        mid = (lo + hi) // 2
        if i <= mid:
            self._update(2 * node, lo, mid, i, val)
        else:
            self._update(2 * node + 1, mid + 1, hi, i, val)
        self.tree[node] = self.tree[2 * node] + self.tree[2 * node + 1]

    def sumRange(self, left, right):
        return self._query(1, 0, self.n - 1, left, right)

    def _query(self, node, lo, hi, l, r):
        if r < lo or hi < l:
            return 0
        if l <= lo and hi <= r:
            return self.tree[node]
        mid = (lo + hi) // 2
        return self._query(2 * node, lo, mid, l, r) + self._query(2 * node + 1, mid + 1, hi, l, r)`,
    tests,
    bugType: 'off-by-one at the midpoint',
    hint: 'The left child covers lo..mid INCLUDING mid. Which child should an update at i == mid go to?',
    explanation: 'Build gives the left child the range [lo, mid], so index mid lives in the left subtree. `i < mid` sends it right, where it ends up writing into the wrong leaf. The condition must be `i <= mid`.',
  },
  boss: {
    title: 'Range minimum with updates',
    statement: 'Implement `MinArray(nums)` supporting `update(index, val)` (set nums[index] = val) and `min_range(left, right)` (smallest value in the inclusive range). Both must be O(log n): the segment-tree idea works unchanged when the combine step is `min` instead of `+`.',
    language: 'python',
    fnName: 'MinArray',
    adapter: 'run_ops',
    harness: OPS_HARNESS,
    starter: `class MinArray:
    # your code here
    pass
`,
    solution: `class MinArray:
    def __init__(self, nums):
        self.n = len(nums)
        self.tree = [float('inf')] * (2 * self.n)
        for i, v in enumerate(nums):
            self.tree[self.n + i] = v
        for i in range(self.n - 1, 0, -1):
            self.tree[i] = min(self.tree[2 * i], self.tree[2 * i + 1])

    def update(self, index, val):
        i = index + self.n
        self.tree[i] = val
        while i > 1:
            i //= 2
            self.tree[i] = min(self.tree[2 * i], self.tree[2 * i + 1])

    def min_range(self, left, right):
        lo, hi = left + self.n, right + self.n + 1
        best = float('inf')
        while lo < hi:
            if lo & 1:
                best = min(best, self.tree[lo])
                lo += 1
            if hi & 1:
                hi -= 1
                best = min(best, self.tree[hi])
            lo //= 2
            hi //= 2
        return best`,
    tests: [
      { args: [['MinArray', 'min_range', 'update', 'min_range', 'min_range'], [[[5, 2, 8, 6, 3]], [0, 4], [1, 9], [0, 4], [0, 1]]], expected: [null, 2, null, 3, 5] },
      { args: [['MinArray', 'min_range'], [[[4]], [0, 0]]], expected: [null, 4], name: 'single element' },
      { args: [['MinArray', 'min_range', 'min_range'], [[[7, 7, 7, 7]], [1, 2], [0, 3]]], expected: [null, 7, 7], name: 'all equal' },
      { args: [['MinArray', 'update', 'min_range', 'min_range'], [[[9, 4, 6, 1, 8, 5]], [3, 10], [2, 5], [0, 2]]], expected: [null, null, 5, 4], name: 'update the minimum' },
      { args: [['MinArray', 'min_range', 'update', 'min_range'], [[[-3, 2, -7, 4]], [0, 1], [2, 5], [0, 3]]], expected: [null, -3, null, -3], name: 'negative values' },
    ],
    hints: ['Store the minimum of each range in a node instead of the sum; a parent is min(left child, right child).', 'Update: overwrite the leaf, then recompute each ancestor as min of its two children. Query: a fully covered node returns its stored min, a disjoint node returns infinity, a partial node returns the min of its two children.'],
    combines: ['segment-tree', 'fenwick-tree'],
  },
};

export default unit;
