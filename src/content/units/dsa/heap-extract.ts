import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { LIST_HARNESS } from '@/content/lib/harness';
import { assertMinHeap, heapViews, makeItems, type HeapItem } from '@/content/lib/trees-2';

const code = `
def heap_extract(heap):
    top = heap[0]                                   #@top
    last = heap.pop()                               #@pop
    if heap:                                        #@nonempty
        heap[0] = last                              #@root
        i, n = 0, len(heap)                         #@init
        while True:                                 #@loop
            left, right = 2 * i + 1, 2 * i + 2      #@kids
            small = i
            if left < n and heap[left] < heap[small]:       #@cmpL
                small = left
            if right < n and heap[right] < heap[small]:     #@cmpR
                small = right
            if small == i:                          #@settled
                break
            heap[i], heap[small] = heap[small], heap[i]     #@swap
            i = small                               #@down
    return top, heap                                #@done
`;

interface In {
  heap: number[];
}

const viz: VizDef<In> = {
  id: 'heap-extract',
  title: 'Extract-min (sift down)',
  code,
  language: 'python',
  inputs: [{ key: 'heap', label: 'Min-heap (array form)', kind: 'numbers', default: [2, 5, 3, 9, 6, 8, 4, 12], maxItems: 9 }],
  presets: [
    { label: 'Two swaps', input: { heap: [2, 5, 3, 9, 6, 8, 4, 12] } },
    { label: 'Last is already small', input: { heap: [1, 4, 2, 6, 5, 3] } },
    { label: 'Single item', input: { heap: [7] } },
    { label: 'Two items', input: { heap: [3, 8] } },
  ],
  run({ heap: raw }) {
    if (!raw.length) throw new Error('Cannot extract from an empty heap: enter at least one value');
    assertMinHeap(raw);
    const r = new Recorder(code);
    const items: HeapItem[] = makeItems(raw);
    let extracted: number | null = null;
    let detached: number | null = null;
    const side = (): Panel[] => {
      const out: Panel[] = [];
      if (extracted !== null) out.push({ type: 'array', title: 'Returned (the minimum)', values: [extracted], tones: { 0: 'found' }, hideIndex: true });
      return out;
    };
    const views = (tones: Record<number, Tone> = {}, pointers: Record<string, number> = {}, edge: Record<number, Tone> = {}): Panel[] => [
      ...heapViews(items, { tones, pointers, edgeTones: edge }),
      ...(detached !== null ? [{ type: 'array' as const, title: 'last (popped off the end)', values: [detached], tones: { 0: 'frontier' as Tone }, hideIndex: true }] : []),
      ...side(),
    ];

    extracted = items[0].val;
    r.step('top', `The minimum is the root: ${extracted}. Remember it`, views({ 0: 'found' }), { top: extracted });
    const lastItem = items.pop()!;
    detached = lastItem.val;
    r.op();
    r.step('pop', `Pop the last element (${detached}) off the end: the tree stays complete`, views({ 0: 'found' }), { top: extracted, last: detached });
    if (!items.length) {
      detached = null;
      r.step('nonempty', 'The heap is now empty: nothing to sift', views(), { top: extracted });
      r.step('done', `Return ${extracted} and an empty heap`, views(), { top: extracted });
      return { frames: r.frames, result: [extracted, []] };
    }
    r.step('nonempty', 'Heap is not empty: the last value must take over the root', views({ 0: 'found' }), { top: extracted, last: detached });
    items[0] = lastItem;
    detached = null;
    r.op();
    r.step('root', `Overwrite the root with ${lastItem.val}: the tree is full again but the root is probably too big`, views({ 0: 'new' }), { top: extracted });
    let i = 0;
    const n = items.length;
    let swaps = 0;
    r.step('init', `Start at i = 0 and sink ${lastItem.val} while a child is smaller`, views({ 0: 'active' }, { i: 0 }), { i, n });
    while (true) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      r.step('loop', `Sifting ${items[i].val} at index ${i}`, views({ [i]: 'active' }, { i }), { i, n });
      r.step('kids', `left = ${left}${left < n ? ` (${items[left].val})` : ' (none)'}, right = ${right}${right < n ? ` (${items[right].val})` : ' (none)'}`, views({ [i]: 'active', ...(left < n ? { [left]: 'compare' as Tone } : {}), ...(right < n ? { [right]: 'compare' as Tone } : {}) }, { i, left, right }), { i, left, right });
      let small = i;
      if (left < n) {
        r.op();
        const win = items[left].val < items[small].val;
        if (win) small = left;
        r.step('cmpL', win ? `left ${items[left].val} < ${items[i].val} → left is the smallest so far` : `left ${items[left].val} is not < ${items[i].val}`, views({ [i]: 'active', [left]: win ? 'frontier' : 'compare' }, { i, left, small }), { i, small, 'heap[left]': items[left].val });
      }
      if (right < n) {
        r.op();
        const win = items[right].val < items[small].val;
        const was = small;
        if (win) small = right;
        r.step('cmpR', win ? `right ${items[right].val} < ${items[was].val} → right is the smallest` : `right ${items[right].val} is not < ${items[was].val}: keep index ${small}`, views({ [i]: 'active', [right]: win ? 'frontier' : 'compare', ...(small === left && left < n ? { [left]: 'frontier' as Tone } : {}) }, { i, left, right, small }), { i, small, 'heap[right]': items[right].val });
      }
      if (small === i) {
        r.step('settled', left >= n ? `${items[i].val} has no children: it is a leaf, stop` : `${items[i].val} <= both children: heap property restored`, views({ [i]: 'done' }, { i }), { i, small });
        break;
      }
      const child = small;
      const parentVal = items[i].val;
      [items[i], items[child]] = [items[child], items[i]];
      swaps++;
      r.op();
      r.step('swap', `Swap ${parentVal} with the smaller child ${items[i].val}`, views({ [i]: 'swap', [child]: 'swap' }, { i, small: child }, { [child]: 'swap' }), { i, small: child, swaps });
      i = child;
      r.step('down', `i = ${i}: ${parentVal} keeps sinking`, views({ [i]: 'active' }, { i }), { i, swaps });
    }
    const out = items.map((it) => it.val);
    r.step('done', `Return ${extracted} and heap [${out.join(', ')}] (${swaps} swap${swaps === 1 ? '' : 's'})`, views({ [i]: 'found' }), { top: extracted, swaps });
    return { frames: r.frames, result: [extracted, out] };
  },
  reference({ heap }) {
    const h = [...heap];
    const top = h[0];
    const last = h.pop()!;
    if (!h.length) return [top, []];
    h[0] = last;
    const down = (k: number): void => {
      const kids = [2 * k + 1, 2 * k + 2].filter((c) => c < h.length);
      if (!kids.length) return;
      let best = kids[0];
      for (const c of kids) if (h[c] < h[best]) best = c;
      if (h[best] < h[k]) {
        [h[k], h[best]] = [h[best], h[k]];
        down(best);
      }
    };
    down(0);
    return [top, h];
  },
};

const tests = [
  { args: [[2, 5, 3, 9, 6, 8, 4, 12]], expected: [2, [3, 5, 4, 9, 6, 8, 12]] },
  { args: [[1, 4, 2, 6, 5, 3]], expected: [1, [2, 4, 3, 6, 5]], name: 'right child is smaller' },
  { args: [[7]], expected: [7, []], name: 'single item' },
  { args: [[3, 8]], expected: [3, [8]], name: 'two items' },
  { args: [[1, 2, 6, 3, 4, 7, 8]], expected: [1, [2, 3, 6, 8, 4, 7]], name: 'left child is smaller' },
  { args: [[1, 5, 2, 6, 7, 3, 4]], expected: [1, [2, 5, 3, 6, 7, 4]], name: 'sinks two levels' },
];

const unit: Unit = {
  id: 'heap-extract',
  hook: 'Pop-min is the operation that makes heaps useful: schedulers, Dijkstra, top-k and merge-k all call it in a loop. The trick interviewers want to see is "move the last item to the root, then sink it by swapping with the smaller child".',
  predict: {
    prompt: 'You extract the minimum from [2, 5, 3, 9, 6, 8, 4, 12]. After moving 12 to the root, its children are 5 and 3. Which one does 12 swap with?',
    options: ['5 (the left child, checked first)', '3 (the smaller child)', 'Neither — the heap is already valid', 'The larger child, 5, to keep the tree balanced'],
    answer: 1,
    explain: 'Swap with the SMALLER child. If 12 swapped with 5, the root would become 5 while 3 still sits below it: 3 < 5 violates the heap property. Swapping with 3 puts the smallest remaining value on top.',
  },
  viz,
  deeper: {
    points: [
      'Why the last element? Removing the root would leave a hole; removing the last slot keeps the tree complete, so we move that value to the root and repair downward.',
      'Sift down compares the node with BOTH children and picks the smaller; one comparison against the left child is not enough.',
      'Always check `left < n` and `right < n` before indexing, the right child often does not exist.',
      'The loop stops as soon as the node is <= its children, or it becomes a leaf.',
      'Repeating extract-min n times gives the values in sorted order: that is heap sort.',
    ],
    complexity: { time: 'O(log n)', space: 'O(1)' },
    pitfalls: ['Comparing the node with the wrong child (or only the left child)', 'Reading heap[right] without checking right < n', 'Using the old length n after the pop, so sift-down reads the removed slot'],
  },
  practice: {
    language: 'python',
    fnName: 'heap_extract',
    statement: 'Remove the smallest value from a non-empty min-heap (a list). Move the last element to the root and sift it down. Return the pair `(smallest, heap)`.',
    signature: 'def heap_extract(heap):',
    solution: `def heap_extract(heap):
    top = heap[0]
    last = @@heap.pop()@@
    if heap:
        heap[0] = last
        i, n = 0, len(heap)
        while True:
            left, right = @@2 * i + 1@@, 2 * i + 2
            small = i
            if left < n and heap[left] < heap[small]:
                small = left
            if right < n and @@heap[right] < heap[small]@@:
                small = right
            if @@small == i@@:
                break
            heap[i], heap[small] = heap[small], heap[i]
            i = @@small@@
    return top, heap`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'heap_extract',
    statement: 'Sometimes the returned heap is not a valid heap: a larger value ends up above a smaller one. Fix the sift-down.',
    buggy: `def heap_extract(heap):
    top = heap[0]
    last = heap.pop()
    if heap:
        heap[0] = last
        i, n = 0, len(heap)
        while True:
            left, right = 2 * i + 1, 2 * i + 2
            small = i
            if left < n and heap[left] < heap[small]:
                small = left
            if right < n and heap[right] < heap[i]:
                small = right
            if small == i:
                break
            heap[i], heap[small] = heap[small], heap[i]
            i = small
    return top, heap`,
    fixed: `def heap_extract(heap):
    top = heap[0]
    last = heap.pop()
    if heap:
        heap[0] = last
        i, n = 0, len(heap)
        while True:
            left, right = 2 * i + 1, 2 * i + 2
            small = i
            if left < n and heap[left] < heap[small]:
                small = left
            if right < n and heap[right] < heap[small]:
                small = right
            if small == i:
                break
            heap[i], heap[small] = heap[small], heap[i]
            i = small
    return top, heap`,
    tests,
    bugType: 'compared against the wrong node',
    hint: 'After the left-child check, `small` may already point at the left child. What should the right child be compared with?',
    explanation: 'The right child must be compared with the current smallest (heap[small]), not with the parent. Otherwise, when both children are smaller than the parent, the right one wins even if the left child is smaller, and a bigger value is lifted above a smaller one.',
  },
  boss: {
    title: 'Merge k sorted lists',
    statement: 'You get a list of `k` sorted singly linked lists (each node has `.val` and `.next`). Merge them into one sorted linked list and return its head. Use a min-heap holding one node per list so each step is O(log k).',
    language: 'python',
    fnName: 'merge_k_lists',
    harness: `${LIST_HARNESS}
def run_k_lists(fn, lists):
    return _to_list(fn([_build(v) for v in lists]))
`,
    adapter: 'run_k_lists',
    starter: `def merge_k_lists(lists):
    # your code here
    pass
`,
    solution: `import heapq

def merge_k_lists(lists):
    heap = []
    for idx, node in enumerate(lists):
        if node:
            heapq.heappush(heap, (node.val, idx, node))
    dummy = tail = ListNode(0)
    while heap:
        _, idx, node = heapq.heappop(heap)
        tail.next = node
        tail = node
        if node.next:
            heapq.heappush(heap, (node.next.val, idx, node.next))
    return dummy.next`,
    tests: [
      { args: [[[1, 4, 5], [1, 3, 4], [2, 6]]], expected: [1, 1, 2, 3, 4, 4, 5, 6] },
      { args: [[]], expected: [], name: 'no lists' },
      { args: [[[], []]], expected: [], name: 'only empty lists' },
      { args: [[[5], [], [1, 2]]], expected: [1, 2, 5], name: 'mixed empty and non-empty' },
      { args: [[[2, 2], [2]]], expected: [2, 2, 2], name: 'ties need an index tiebreaker' },
    ],
    hints: ['Only the heads of the lists can be the next smallest value. Which structure gives you the smallest of k heads quickly?', 'Push (value, list index, node) for each head. Pop the smallest, append it to the result, then push that node\'s next. The index stops Python from comparing nodes on ties.'],
    combines: ['heap-extract', 'heap-insert', 'll-reverse'],
  },
};

export default unit;
