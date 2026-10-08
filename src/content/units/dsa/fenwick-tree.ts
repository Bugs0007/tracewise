import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { bits, bitWidth } from '@/content/lib/trees-2';

const code = `
class Fenwick:
    def __init__(self, n):
        self.n = n
        self.tree = [0] * (n + 1)                    #@init

    def update(self, i, delta):          # i is 1-based
        while i <= self.n:                           #@uLoop
            self.tree[i] += delta                    #@uAdd
            i += i & -i                              #@uNext

    def prefix(self, i):                 # sum of the first i items
        total = 0                                    #@qInit
        while i > 0:                                 #@qLoop
            total += self.tree[i]                    #@qAdd
            i -= i & -i                              #@qNext
        return total                                 #@qDone
`;

interface In {
  nums: number[];
  index: number;
  delta: number;
  k: number;
}

const viz: VizDef<In> = {
  id: 'fenwick-tree',
  title: 'Fenwick tree (binary indexed tree)',
  code,
  language: 'python',
  inputs: [
    { key: 'nums', label: 'Values (positions 1..n)', kind: 'numbers', default: [3, 2, -1, 6, 5, 4, -3, 3], maxItems: 9 },
    { key: 'index', label: 'Update position (1-based)', kind: 'number', default: 3 },
    { key: 'delta', label: 'Add this amount', kind: 'number', default: 4 },
    { key: 'k', label: 'Then ask: sum of first k', kind: 'number', default: 7 },
  ],
  presets: [
    { label: 'Default', input: { nums: [3, 2, -1, 6, 5, 4, -3, 3], index: 3, delta: 4, k: 7 } },
    { label: 'Update the first cell', input: { nums: [1, 2, 3, 4, 5, 6, 7, 8], index: 1, delta: 10, k: 8 } },
    { label: 'Power of two query', input: { nums: [5, 1, 4, 2, 8, 3], index: 2, delta: -1, k: 4 } },
    { label: 'Prefix of zero', input: { nums: [2, 4, 6], index: 3, delta: 1, k: 0 } },
  ],
  run({ nums, index, delta, k }) {
    const n = nums.length;
    if (!n) throw new Error('Enter at least one value');
    if (!Number.isInteger(index) || index < 1 || index > n) throw new Error(`Update position must be a whole number from 1 to ${n} (the tree is 1-based)`);
    if (!Number.isInteger(k) || k < 0 || k > n) throw new Error(`k must be a whole number from 0 to ${n}`);
    if (!Number.isFinite(delta)) throw new Error('Amount must be a number');
    const r = new Recorder(code);
    const W = bitWidth(n);
    const tree = new Array<number>(n + 1).fill(0);
    // Build the BIT with real update() calls, silently: the learner studies one update and one query below.
    const rawUpdate = (i: number, d: number) => {
      for (; i <= n; i += i & -i) tree[i] += d;
    };
    nums.forEach((v, j) => rawUpdate(j + 1, v));
    const cur = [...nums];

    const view = (touched: Set<number>, hot: number | null, opts: { cover?: number; title?: string; valueTones?: Record<number, Tone>; pointer?: Record<string, number>; hotTone?: Tone } = {}): Panel[] => {
      const tones: Record<number, Tone> = {};
      for (const t of touched) tones[t - 1] = 'visited';
      if (hot !== null) tones[hot - 1] = opts.hotTone ?? 'active';
      const covers = hot !== null ? { from: hot - (hot & -hot), to: hot - 1, tone: opts.hotTone ?? ('active' as Tone), label: `tree[${hot}] covers ${hot & -hot} item${(hot & -hot) === 1 ? '' : 's'}` } : undefined;
      return [
        { type: 'array', title: 'Tree cells: tree[i] = sum of the last lowbit(i) items ending at i', values: tree.slice(1), tones, indexLabels: Array.from({ length: n }, (_, j) => String(j + 1)), pointers: opts.pointer, ids: tree.slice(1).map((_, j) => `t${j + 1}`) },
        { type: 'array', title: 'Underlying values (1-based positions)', values: cur, indexLabels: Array.from({ length: n }, (_, j) => String(j + 1)), range: covers, tones: opts.valueTones },
      ];
    };
    const binVars = (i: number) => ({ i, 'i (binary)': bits(i, W), 'i & -i': bits(i & -i, W) });

    r.step('init', `BIT built from ${n} values with n update() calls. tree[i] covers the last (i & -i) items up to i`, view(new Set(), null), { n, 'tree': `[${tree.slice(1).join(', ')}]` });

    // update(index, delta)
    let i = index;
    const touchedU = new Set<number>();
    r.step('uLoop', `update(${index}, ${delta >= 0 ? '+' : ''}${delta}): every cell whose range contains position ${index} must change`, view(touchedU, null, { valueTones: { [index - 1]: 'swap' }, pointer: { i: i - 1 } }), { ...binVars(i), delta });
    cur[index - 1] += delta;
    while (true) {
      r.op();
      if (i > n) {
        r.step('uLoop', `i = ${i} > n = ${n} → stop, ${touchedU.size} cell${touchedU.size === 1 ? '' : 's'} updated`, view(touchedU, null, { valueTones: { [index - 1]: 'swap' } }), { i, n });
        break;
      }
      tree[i] += delta;
      touchedU.add(i);
      r.op();
      r.step('uAdd', `tree[${i}] += ${delta} → ${tree[i]}  (${bits(i, W)})`, view(touchedU, i, { hotTone: 'swap', valueTones: { [index - 1]: 'swap' }, pointer: { i: i - 1 } }), { ...binVars(i), 'tree[i]': tree[i] });
      const low = i & -i;
      const next = i + low;
      r.step('uNext', `i += i & -i → ${i} + ${low} = ${next}  (${bits(i, W)} + ${bits(low, W)})`, view(touchedU, i, { hotTone: 'swap', valueTones: { [index - 1]: 'swap' } }), { ...binVars(i), next });
      i = next;
    }

    // prefix(k)
    let total = 0;
    let j = k;
    const touchedQ = new Set<number>();
    r.step('qInit', `prefix(${k}): add up cells, jumping down by the lowest set bit`, view(new Set(), null, { pointer: k > 0 ? { i: k - 1 } : undefined }), { ...binVars(j), total });
    while (true) {
      r.op();
      if (j <= 0) {
        r.step('qLoop', k === 0 ? 'i = 0 → empty prefix, nothing to add' : `i = 0 → no cells left`, view(touchedQ, null), { i: j, total });
        break;
      }
      total += tree[j];
      touchedQ.add(j);
      r.op();
      r.step('qAdd', `total += tree[${j}] (${tree[j]}) → ${total}  (${bits(j, W)})`, view(touchedQ, j, { hotTone: 'compare' }), { ...binVars(j), total });
      const low = j & -j;
      const next = j - low;
      r.step('qNext', `i -= i & -i → ${j} - ${low} = ${next}  (${bits(j, W)} - ${bits(low, W)})`, view(touchedQ, j, { hotTone: 'compare' }), { ...binVars(j), next, total });
      j = next;
    }
    const expect = cur.slice(0, k).reduce((a, b) => a + b, 0);
    r.step('qDone', `prefix(${k}) = ${total}${total === expect ? ' (matches adding the first ' + k + ' values directly)' : ''}`, view(touchedQ, null, { valueTones: Object.fromEntries(Array.from({ length: k }, (_, q) => [q, 'found' as Tone])) }), { total, cells: touchedQ.size });
    return { frames: r.frames, result: total };
  },
  reference({ nums, index, delta, k }) {
    const a = [...nums];
    a[index - 1] += delta;
    let s = 0;
    for (let q = 0; q < k; q++) s += a[q];
    return s;
  },
};

const tests = [
  { args: [['Fenwick', 'update', 'update', 'prefix', 'prefix'], [[5], [1, 3], [3, 4], [3], [5]]], expected: [null, null, null, 7, 7], name: 'basic' },
  { args: [['Fenwick', 'prefix'], [[4], [0]]], expected: [null, 0], name: 'empty prefix' },
  { args: [['Fenwick', 'update', 'update', 'prefix', 'prefix', 'prefix'], [[8], [8, 5], [1, 2], [7], [8], [1]], ], expected: [null, null, null, 2, 7, 2], name: 'last cell and power-of-two chain' },
  { args: [['Fenwick', 'update', 'update', 'update', 'prefix'], [[6], [6, 2], [5, 3], [6, -1], [6]], ], expected: [null, null, null, null, 4], name: 'negative delta' },
  { args: [['Fenwick', 'update', 'update', 'prefix', 'prefix'], [[7], [2, 6], [2, -6], [7], [2]]], expected: [null, null, null, 0, 0], name: 'cancel out' },
];

const unit: Unit = {
  id: 'fenwick-tree',
  hook: 'A Fenwick tree gives prefix sums with point updates in O(log n) using a plain array and a three-line bit trick. Interviewers ask for it as the short alternative to a segment tree, and it powers inversion counting.',
  predict: {
    prompt: 'In a Fenwick tree with n = 8, update(3, +4) runs `i += i & -i` starting at i = 3. Which cells are changed?',
    options: ['3, 4, 5, 6, 7, 8', '3, 4, 8', '3, 6, 12', 'Only 3'],
    answer: 1,
    explain: '3 = 011 has lowest set bit 1, so next is 4. 4 = 100 has lowest bit 4, so next is 8. 8 = 1000 adds 8 to get 16, which is past n. So the cells are 3, 4 and 8: exactly the cells whose ranges contain position 3.',
  },
  viz,
  deeper: {
    points: [
      'tree[i] stores the sum of the last (i & -i) items ending at i. i & -i isolates the lowest set bit: 6 (110) covers 2 items, 8 (1000) covers 8 items.',
      'Update climbs UP: i += i & -i visits every cell whose range contains the changed position.',
      'Prefix query climbs DOWN: i -= i & -i strips the lowest set bit, hopping from one covered block to the next block to its left.',
      'Range sum(l..r) = prefix(r) - prefix(l - 1). Both are at most log2(n) hops, one per set bit.',
      'It is 1-indexed on purpose: index 0 has no set bit, so i & -i would be 0 and the loop would never move.',
    ],
    complexity: { time: 'O(log n) update and query, O(n log n) to build by updates', space: 'O(n)' },
    pitfalls: ['Using 0-based indexes: with i = 0 the update loop never terminates and the query returns 0', 'Writing `while i < n` instead of `i <= n`, so the last cell is skipped', 'Forgetting to apply a point change as a DELTA (new value - old value)'],
  },
  practice: {
    language: 'python',
    fnName: 'Fenwick',
    adapter: 'run_ops',
    harness: OPS_HARNESS,
    statement: 'Implement `Fenwick(n)` with 1-based `update(i, delta)` (add delta at position i) and `prefix(i)` (sum of positions 1..i, 0 if i = 0).',
    signature: 'class Fenwick:',
    solution: `class Fenwick:
    def __init__(self, n):
        self.n = n
        self.tree = [0] * (n + 1)

    def update(self, i, delta):
        while @@i <= self.n@@:
            self.tree[i] += delta
            i += @@i & -i@@

    def prefix(self, i):
        total = 0
        while @@i > 0@@:
            total += @@self.tree[i]@@
            i -= @@i & -i@@
        return total`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'Fenwick',
    adapter: 'run_ops',
    harness: OPS_HARNESS,
    statement: 'Prefix sums that include the last position are too small after an update. Find the off-by-one in the loop.',
    buggy: `class Fenwick:
    def __init__(self, n):
        self.n = n
        self.tree = [0] * (n + 1)

    def update(self, i, delta):
        while i < self.n:
            self.tree[i] += delta
            i += i & -i

    def prefix(self, i):
        total = 0
        while i > 0:
            total += self.tree[i]
            i -= i & -i
        return total`,
    fixed: `class Fenwick:
    def __init__(self, n):
        self.n = n
        self.tree = [0] * (n + 1)

    def update(self, i, delta):
        while i <= self.n:
            self.tree[i] += delta
            i += i & -i

    def prefix(self, i):
        total = 0
        while i > 0:
            total += self.tree[i]
            i -= i & -i
        return total`,
    tests,
    bugType: 'off-by-one in loop bound',
    hint: 'Positions run from 1 to n inclusive. Does the update loop ever write to tree[n]?',
    explanation: 'The tree is 1-based, so tree[n] is a valid cell (it is the one that holds the total when n is a power of two). The update loop must continue while i <= n; `i < n` silently skips the last cell.',
  },
  boss: {
    title: 'Count smaller numbers after self',
    statement: 'For each position i in `nums`, count how many values to its RIGHT are strictly smaller than nums[i]. Return the list of counts. Aim for O(n log n): sweep from the right and use a Fenwick tree over the values\' ranks.',
    language: 'python',
    fnName: 'count_smaller',
    starter: `def count_smaller(nums):
    # your code here
    pass
`,
    solution: `def count_smaller(nums):
    ranks = {v: r for r, v in enumerate(sorted(set(nums)), 1)}
    m = len(ranks)
    tree = [0] * (m + 1)

    def add(i):
        while i <= m:
            tree[i] += 1
            i += i & -i

    def count_upto(i):
        total = 0
        while i > 0:
            total += tree[i]
            i -= i & -i
        return total

    out = []
    for v in reversed(nums):
        out.append(count_upto(ranks[v] - 1))
        add(ranks[v])
    return out[::-1]`,
    tests: [
      { args: [[5, 2, 6, 1]], expected: [2, 1, 1, 0] },
      { args: [[-1]], expected: [0], name: 'single value' },
      { args: [[-1, -1]], expected: [0, 0], name: 'equal values are not smaller' },
      { args: [[]], expected: [], name: 'empty' },
      { args: [[3, 2, 1, 0]], expected: [3, 2, 1, 0], name: 'descending' },
      { args: [[1, 2, 3, 4]], expected: [0, 0, 0, 0], name: 'ascending' },
    ],
    hints: ['Process the array from right to left. When you stand at nums[i], the tree should already contain exactly the values to its right.', 'Compress values to ranks 1..m. For each value: answer = prefix(rank - 1), then update(rank, +1). Reverse the answers at the end.'],
    combines: ['fenwick-tree', 'segment-tree', 'bst-insert'],
  },
};

export default unit;
