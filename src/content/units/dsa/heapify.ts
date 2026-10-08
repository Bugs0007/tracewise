import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { heapViews, makeItems, type HeapItem } from '@/content/lib/trees-2';

const code = `
def heapify(arr):
    n = len(arr)                                    #@init
    for start in range(n // 2 - 1, -1, -1):         #@loop
        i = start
        while True:                                 #@sift
            left, right = 2 * i + 1, 2 * i + 2      #@kids
            small = i
            if left < n and arr[left] < arr[small]:         #@cmpL
                small = left
            if right < n and arr[right] < arr[small]:       #@cmpR
                small = right
            if small == i:                          #@ok
                break
            arr[i], arr[small] = arr[small], arr[i] #@swap
            i = small                               #@down
    return arr                                      #@done
`;

interface In {
  arr: number[];
}

/** Swaps needed if the same values were pushed one by one with sift-up (for the O(n) vs O(n log n) contrast). */
function swapsByInserting(vals: number[]): number {
  const h: number[] = [];
  let swaps = 0;
  for (const v of vals) {
    h.push(v);
    let i = h.length - 1;
    while (i > 0 && h[i] < h[(i - 1) >> 1]) {
      const p = (i - 1) >> 1;
      [h[i], h[p]] = [h[p], h[i]];
      swaps++;
      i = p;
    }
  }
  return swaps;
}

const viz: VizDef<In> = {
  id: 'heapify',
  title: 'Heapify (build a heap in O(n))',
  code,
  language: 'python',
  inputs: [{ key: 'arr', label: 'Unordered array', kind: 'numbers', default: [9, 5, 8, 6, 2, 7, 4], maxItems: 9 }],
  presets: [
    { label: 'Default', input: { arr: [9, 5, 8, 6, 2, 7, 4] } },
    { label: 'Already a heap', input: { arr: [1, 3, 2, 6, 5, 4, 7] } },
    { label: 'Reverse sorted (worst)', input: { arr: [7, 6, 5, 4, 3, 2, 1] } },
    { label: 'Single item', input: { arr: [5] } },
  ],
  run({ arr: raw }) {
    if (!raw.length) throw new Error('Enter at least one value');
    const r = new Recorder(code);
    const items: HeapItem[] = makeItems(raw);
    const n = items.length;
    let swaps = 0;
    const settled = new Set<number>(); // indices whose subtree is already a heap
    const views = (tones: Record<number, Tone> = {}, pointers: Record<string, number> = {}, edge: Record<number, Tone> = {}, extra: Panel[] = []): Panel[] => {
      const t: Record<number, Tone> = {};
      for (const k of settled) t[k] = 'done';
      Object.assign(t, tones);
      return [...heapViews(items, { tones: t, pointers, edgeTones: edge }), ...extra];
    };

    r.step('init', `n = ${n}: indices ${Math.floor(n / 2)}..${n - 1} are leaves, already one-node heaps`, views(Object.fromEntries(items.map((_, k) => [k, k >= Math.floor(n / 2) ? 'done' : 'default']))), { n });
    for (let k = Math.floor(n / 2); k < n; k++) settled.add(k);
    const first = Math.floor(n / 2) - 1;
    if (first < 0) r.step('loop', 'range(-1, -1, -1) is empty: a single node has no parent to sift', views(Object.fromEntries(items.map((_, k) => [k, 'done' as Tone]))), { n });
    for (let start = first; start >= 0; start--) {
      r.op();
      r.step('loop', `Sift down from index ${start} (value ${items[start].val}): its subtrees are already heaps`, views({ [start]: 'active' }, { start }), { start, swaps });
      let i = start;
      while (true) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        r.step('kids', `i = ${i}: left = ${left}${left < n ? ` (${items[left].val})` : ' (none)'}, right = ${right}${right < n ? ` (${items[right].val})` : ' (none)'}`, views({ [i]: 'active', ...(left < n ? { [left]: 'compare' as Tone } : {}), ...(right < n ? { [right]: 'compare' as Tone } : {}) }, { i, left, right }), { i, left, right });
        let small = i;
        if (left < n) {
          r.op();
          const win = items[left].val < items[small].val;
          if (win) small = left;
          r.step('cmpL', win ? `left ${items[left].val} < ${items[i].val} → smallest so far` : `left ${items[left].val} is not < ${items[i].val}`, views({ [i]: 'active', [left]: win ? 'frontier' : 'compare' }, { i, left, small }), { i, small });
        }
        if (right < n) {
          r.op();
          const was = small;
          const win = items[right].val < items[small].val;
          if (win) small = right;
          r.step('cmpR', win ? `right ${items[right].val} < ${items[was].val} → right is smallest` : `right ${items[right].val} is not < ${items[was].val}`, views({ [i]: 'active', [right]: win ? 'frontier' : 'compare', ...(was === left && win ? { [left]: 'compare' as Tone } : {}) }, { i, right, small }), { i, small });
        }
        if (small === i) {
          settled.add(start);
          r.step('ok', left >= n ? `${items[i].val} is a leaf now: this subtree is a heap` : `${items[i].val} <= its children: the subtree at ${start} is a heap`, views({ [i]: 'done' }, { i }), { i, swaps });
          break;
        }
        const parentVal = items[i].val;
        [items[i], items[small]] = [items[small], items[i]];
        swaps++;
        r.op();
        r.step('swap', `Swap ${parentVal} with smaller child ${items[i].val}`, views({ [i]: 'swap', [small]: 'swap' }, { i, small }, { [small]: 'swap' }), { i, small, swaps });
        i = small;
        r.step('down', `${parentVal} sinks to index ${i}`, views({ [i]: 'active' }, { i }), { i, swaps });
      }
    }
    const out = items.map((it) => it.val);
    const byInsert = swapsByInserting(raw);
    r.step(
      'done',
      `Heap built with ${swaps} swap${swaps === 1 ? '' : 's'}; n pushes would have used ${byInsert}`,
      views(Object.fromEntries(items.map((_, k) => [k, 'done' as Tone])), {}, {}, [
        {
          type: 'kv',
          title: 'Swaps for the same values',
          entries: [
            { k: 'heapify (sift down from n/2-1 to 0)', v: swaps, tone: 'found' },
            { k: 'n inserts (sift up each)', v: byInsert, tone: 'muted' },
          ],
        },
      ]),
      { n, swaps, 'swaps if inserted': byInsert },
    );
    return { frames: r.frames, result: out };
  },
  reference({ arr }) {
    const a = [...arr];
    const sink = (k: number): void => {
      const kids = [2 * k + 1, 2 * k + 2].filter((c) => c < a.length);
      if (!kids.length) return;
      let best = k;
      for (const c of kids) if (a[c] < a[best]) best = c;
      if (best !== k) {
        const t = a[k];
        a[k] = a[best];
        a[best] = t;
        sink(best);
      }
    };
    for (let k = Math.floor(a.length / 2) - 1; k >= 0; k--) sink(k);
    return a;
  },
};

const tests = [
  { args: [[9, 5, 8, 6, 2, 7, 4]], expected: [2, 5, 4, 6, 9, 7, 8] },
  { args: [[1, 3, 2, 6, 5, 4, 7]], expected: [1, 3, 2, 6, 5, 4, 7], name: 'already a heap' },
  { args: [[7, 6, 5, 4, 3, 2, 1]], expected: [1, 3, 2, 4, 6, 7, 5], name: 'reverse sorted' },
  { args: [[5]], expected: [5], name: 'single item' },
  { args: [[2, 1]], expected: [1, 2], name: 'two items, root must sink' },
  { args: [[3, 3, 3, 3]], expected: [3, 3, 3, 3], name: 'all equal' },
  { args: [[5, 9, 1, 8, 2, 3]], expected: [1, 2, 3, 8, 9, 5], name: 'even length' },
];

const unit: Unit = {
  id: 'heapify',
  hook: 'Building a heap from n numbers is O(n), not O(n log n) — a classic "why is this linear?" question. Knowing bottom-up heapify also explains why heap sort and k-smallest-of-n are cheap to start.',
  predict: {
    prompt: 'You must turn an unordered array of n numbers into a min-heap. Which approach builds it fastest in the worst case?',
    options: ['Push the n values one by one: O(n log n)', 'Sort the array first: O(n log n)', 'Sift down from the last parent up to the root: O(n)', 'Sift up from the root down to the last leaf: O(n)'],
    answer: 2,
    explain: 'Half the nodes are leaves and need no work, a quarter sink at most one level, an eighth at most two, and so on: n/2·0 + n/4·1 + n/8·2 + … sums to O(n). Inserting one by one instead lets the many bottom nodes climb up to log n levels.',
  },
  viz,
  deeper: {
    points: [
      'Leaves are already valid one-node heaps, so start at the last parent, index n // 2 - 1.',
      'Walk indices downward to 0 and sift each one DOWN: when you reach a node, both of its subtrees are already heaps.',
      'Cost: a node at height h moves at most h levels, and only n / 2^(h+1) nodes sit at height h. Sum of h · n/2^(h+1) is O(n).',
      'Building by n inserts is O(n log n) in the worst case, because the many nodes near the bottom may climb log n levels each.',
      'The result array can differ from the one built by repeated inserts; both are valid heaps.',
    ],
    complexity: { time: 'O(n)', space: 'O(1) in place' },
    pitfalls: ['Starting at index n - 1 or n // 2 (wasted work or wrong order) instead of n // 2 - 1', 'Looping up toward the root (0 to n // 2) instead of down from the last parent: parents must be fixed after their children', 'Stopping the range at 1 and skipping the root'],
  },
  practice: {
    language: 'python',
    fnName: 'heapify',
    statement: 'Turn `arr` into a min-heap in place: for each parent from the last one down to the root, sift it down by swapping with its smaller child. Return the list.',
    signature: 'def heapify(arr):',
    solution: `def heapify(arr):
    n = len(arr)
    for start in range(@@n // 2 - 1@@, -1, -1):
        i = start
        while True:
            left, right = @@2 * i + 1@@, 2 * i + 2
            small = i
            if left < n and arr[left] < arr[small]:
                small = left
            if right < n and @@arr[right] < arr[small]@@:
                small = right
            if @@small == i@@:
                break
            arr[i], arr[small] = arr[small], arr[i]
            i = @@small@@
    return arr`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'heapify',
    statement: 'heapify() works on many inputs but sometimes leaves the smallest value away from index 0. Find the off-by-one.',
    buggy: `def heapify(arr):
    n = len(arr)
    for start in range(n // 2 - 1, 0, -1):
        i = start
        while True:
            left, right = 2 * i + 1, 2 * i + 2
            small = i
            if left < n and arr[left] < arr[small]:
                small = left
            if right < n and arr[right] < arr[small]:
                small = right
            if small == i:
                break
            arr[i], arr[small] = arr[small], arr[i]
            i = small
    return arr`,
    fixed: `def heapify(arr):
    n = len(arr)
    for start in range(n // 2 - 1, -1, -1):
        i = start
        while True:
            left, right = 2 * i + 1, 2 * i + 2
            small = i
            if left < n and arr[left] < arr[small]:
                small = left
            if right < n and arr[right] < arr[small]:
                small = right
            if small == i:
                break
            arr[i], arr[small] = arr[small], arr[i]
            i = small
    return arr`,
    tests,
    bugType: 'off-by-one',
    hint: 'range(a, b, -1) stops BEFORE b. Is the root (index 0) ever visited?',
    explanation: 'range(n // 2 - 1, 0, -1) ends at 1, so the root is never sifted down. If the root is not the minimum, the result is not a heap. The stop value must be -1 so that index 0 is included.',
  },
  boss: {
    title: 'Last stone',
    statement: 'You have a list of stone weights. Repeatedly take the two heaviest stones. If their weights are equal both vanish; otherwise the lighter one vanishes and the heavier one is replaced by a stone weighing the difference. Return the weight of the last remaining stone, or 0 if none is left.',
    language: 'python',
    fnName: 'last_stone',
    starter: `def last_stone(stones):
    # your code here
    pass
`,
    solution: `import heapq

def last_stone(stones):
    heap = [-s for s in stones]
    heapq.heapify(heap)
    while len(heap) > 1:
        a = -heapq.heappop(heap)
        b = -heapq.heappop(heap)
        if a != b:
            heapq.heappush(heap, -(a - b))
    return -heap[0] if heap else 0`,
    tests: [
      { args: [[2, 7, 4, 1, 8, 1]], expected: 1 },
      { args: [[1]], expected: 1, name: 'one stone' },
      { args: [[3, 3]], expected: 0, name: 'cancel out' },
      { args: [[]], expected: 0, name: 'no stones' },
      { args: [[10, 4, 3, 3]], expected: 0, name: 'ends with nothing' },
    ],
    hints: ['You always need the maximum, and the set changes after every round. Python has a min-heap only, so how can you make it return the largest?', 'Store negated weights, call heapq.heapify once (O(n)), then pop twice, push the difference back if it is not zero, and negate the final answer.'],
    combines: ['heapify', 'heap-insert', 'heap-extract'],
  },
};

export default unit;
