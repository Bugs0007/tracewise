import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { assertMinHeap, heapViews, makeItems, type HeapItem } from '@/content/lib/trees-2';

const code = `
def heap_insert(heap, x):
    heap.append(x)                                   #@append
    i = len(heap) - 1                                #@start
    while i > 0:                                     #@loop
        parent = (i - 1) // 2                        #@parent
        if heap[i] < heap[parent]:                   #@compare
            heap[i], heap[parent] = heap[parent], heap[i]   #@swap
            i = parent                               #@up
        else:
            break                                    #@stop
    return heap                                      #@done
`;

interface In {
  heap: number[];
  x: number;
}

const viz: VizDef<In> = {
  id: 'heap-insert',
  title: 'Min-heap insert (sift up)',
  code,
  language: 'python',
  inputs: [
    { key: 'heap', label: 'Existing min-heap (array form)', kind: 'numbers', default: [4, 9, 6, 12, 10, 8, 7], maxItems: 8 },
    { key: 'x', label: 'Value to insert', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Bubbles to the root', input: { heap: [4, 9, 6, 12, 10, 8, 7], x: 3 } },
    { label: 'Stays at the bottom', input: { heap: [2, 5, 3, 9], x: 8 } },
    { label: 'Equal to parent', input: { heap: [1, 3, 2], x: 3 } },
    { label: 'Empty heap', input: { heap: [], x: 5 } },
  ],
  run({ heap: raw, x }) {
    assertMinHeap(raw);
    if (!Number.isFinite(x)) throw new Error('The value to insert must be a number');
    const r = new Recorder(code);
    const items: HeapItem[] = makeItems(raw);
    const NEW = 'new';
    const views = (i: number | null, parent: number | null, tones: Record<number, Tone> = {}, edge?: Tone) => {
      const t: Record<number, Tone> = {};
      items.forEach((it, k) => {
        if (it.id === NEW) t[k] = 'active';
      });
      Object.assign(t, tones);
      const pointers: Record<string, number> = {};
      if (i !== null) pointers.i = i;
      if (parent !== null) pointers.parent = parent;
      const edgeTones: Record<number, Tone> = {};
      if (edge && i !== null) edgeTones[i] = edge;
      return heapViews(items, { tones: t, pointers, edgeTones });
    };

    items.push({ id: NEW, val: x });
    let i = items.length - 1;
    r.op();
    r.step('append', `Append ${x} at the first free slot (index ${i}): the tree stays complete`, views(i, null, { [i]: 'new' }), { x, i });
    r.step('start', `i = ${i}: the new value may now be smaller than its parent`, views(i, null), { x, i });
    let swaps = 0;
    while (true) {
      r.op();
      if (i <= 0) {
        r.step('loop', i === 0 ? 'i = 0: reached the root, nothing above to compare with' : 'Nothing to compare with', views(i, null, { [i]: 'done' }), { x, i, swaps });
        break;
      }
      const parent = (i - 1) >> 1;
      r.step('parent', `parent of index ${i} is (${i} - 1) // 2 = ${parent}`, views(i, parent, { [parent]: 'compare' }, 'compare'), { i, parent, 'heap[i]': items[i].val, 'heap[parent]': items[parent].val });
      r.op();
      if (items[i].val < items[parent].val) {
        r.step('compare', `${items[i].val} < parent ${items[parent].val} → swap`, views(i, parent, { [parent]: 'compare', [i]: 'compare' }, 'compare'), { i, parent, 'heap[i]': items[i].val, 'heap[parent]': items[parent].val });
        [items[i], items[parent]] = [items[parent], items[i]];
        swaps++;
        r.op();
        r.step('swap', `${items[parent].val} moves up to index ${parent}, ${items[i].val} drops to index ${i}`, views(i, parent, { [parent]: 'swap', [i]: 'swap' }, 'swap'), { i, parent, swaps });
        i = parent;
        r.step('up', `i = ${i}: keep checking from the new position`, views(i, null), { i, swaps });
      } else {
        r.step('compare', `${items[i].val} >= parent ${items[parent].val} → heap property holds`, views(i, parent, { [i]: 'done', [parent]: 'done' }, 'done'), { i, parent, 'heap[i]': items[i].val, 'heap[parent]': items[parent].val });
        r.step('stop', `Stop at index ${i} after ${swaps} swap${swaps === 1 ? '' : 's'}`, views(i, null, { [i]: 'done' }), { i, swaps });
        break;
      }
    }
    const out = items.map((it) => it.val);
    r.step('done', `Heap is [${out.join(', ')}]: ${swaps} swap${swaps === 1 ? '' : 's'}, at most log n`, views(null, null, { [i]: 'found' }), { swaps, size: out.length });
    return { frames: r.frames, result: out };
  },
  reference({ heap, x }) {
    const h = [...heap, x];
    const up = (k: number): void => {
      if (k === 0) return;
      const p = Math.floor((k - 1) / 2);
      if (h[p] > h[k]) {
        const t = h[p];
        h[p] = h[k];
        h[k] = t;
        up(p);
      }
    };
    up(h.length - 1);
    return h;
  },
};

const tests = [
  { args: [[4, 9, 6, 12, 10, 8, 7], 3], expected: [3, 4, 6, 9, 10, 8, 7, 12], name: 'bubbles to the root' },
  { args: [[2, 5, 3, 9], 8], expected: [2, 5, 3, 9, 8], name: 'no swap needed' },
  { args: [[], 5], expected: [5], name: 'empty heap' },
  { args: [[1, 3, 2, 7, 4], 0], expected: [0, 3, 1, 7, 4, 2], name: 'new minimum' },
  { args: [[2, 6, 4, 9, 7, 5, 8], 5], expected: [2, 5, 4, 6, 7, 5, 8, 9], name: 'stops mid-way' },
  { args: [[1, 3, 2], 3], expected: [1, 3, 2, 3], name: 'equal to parent' },
];

const unit: Unit = {
  id: 'heap-insert',
  hook: 'A heap gives you the smallest item in O(1) and lets you add items in O(log n). Interviewers love it because the whole structure is just an array plus one index formula: parent = (i - 1) // 2.',
  predict: {
    prompt: 'A min-heap is [4, 9, 6, 12, 10, 8, 7]. You insert 3. How many swaps does sift-up perform?',
    options: ['0 — 3 is appended at the end and the heap is still valid', '1', '3 — it climbs all the way to the root', '7 — it is compared with every element'],
    answer: 2,
    explain: '3 lands at index 7. Its parent (index 3) is 12, then index 1 holds 9, then the root holds 4. 3 is smaller each time, so it swaps three times and becomes the new root. Sift-up never touches more than one node per level.',
  },
  viz,
  deeper: {
    points: [
      'The heap is a complete binary tree stored level by level: children of i are 2i+1 and 2i+2, parent of i is (i-1)//2.',
      'Insert = append at the end (keeps the tree complete), then sift up while the value is smaller than its parent.',
      'Each swap moves one level up, so the work is bounded by the height: log2(n).',
      'Equal values stop the climb (strict <), which is both correct and avoids needless swaps.',
      'A max-heap is the same code with > instead of <. Python heapq is a min-heap; negate values to fake a max-heap.',
    ],
    complexity: { time: 'O(log n) per insert', space: 'O(1) extra' },
    pitfalls: ['Using i // 2 for the parent (that formula is for 1-based arrays)', 'Comparing against a child instead of the parent when sifting up', 'Forgetting to move i after the swap, so the loop compares the same pair forever'],
  },
  practice: {
    language: 'python',
    fnName: 'heap_insert',
    statement: 'Given a list that is already a valid min-heap, insert `x` and restore the heap property by sifting up. Return the list.',
    signature: 'def heap_insert(heap, x):',
    solution: `def heap_insert(heap, x):
    heap.@@append(x)@@
    i = @@len(heap) - 1@@
    while @@i > 0@@:
        parent = @@(i - 1) // 2@@
        if heap[i] < @@heap[parent]@@:
            heap[i], heap[parent] = heap[parent], heap[i]
            i = @@parent@@
        else:
            break
    return heap`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'heap_insert',
    statement: 'This sift-up works for tiny heaps but corrupts bigger ones. Find the bug.',
    buggy: `def heap_insert(heap, x):
    heap.append(x)
    i = len(heap) - 1
    while i > 0:
        parent = i // 2
        if heap[i] < heap[parent]:
            heap[i], heap[parent] = heap[parent], heap[i]
            i = parent
        else:
            break
    return heap`,
    fixed: `def heap_insert(heap, x):
    heap.append(x)
    i = len(heap) - 1
    while i > 0:
        parent = (i - 1) // 2
        if heap[i] < heap[parent]:
            heap[i], heap[parent] = heap[parent], heap[i]
            i = parent
        else:
            break
    return heap`,
    tests,
    bugType: 'wrong index formula',
    hint: 'Which array layout is `i // 2` the parent formula for: starting at index 0 or at index 1?',
    explanation: 'With a 0-based array the parent of i is (i - 1) // 2. Using i // 2 sends index 2 to index 1 (its sibling) and index 4 to index 2 (not its parent, index 1), so the swaps no longer follow the tree and the heap breaks.',
  },
  boss: {
    title: 'Kth largest element',
    statement: 'Return the k-th largest value in `nums` (k = 1 is the maximum). Duplicates count separately. Do it in O(n log k) by keeping a min-heap that never holds more than k values.',
    language: 'python',
    fnName: 'kth_largest',
    starter: `def kth_largest(nums, k):
    # your code here
    pass
`,
    solution: `import heapq

def kth_largest(nums, k):
    heap = []
    for x in nums:
        heapq.heappush(heap, x)
        if len(heap) > k:
            heapq.heappop(heap)
    return heap[0]`,
    tests: [
      { args: [[3, 2, 1, 5, 6, 4], 2], expected: 5 },
      { args: [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4], expected: 4, name: 'duplicates' },
      { args: [[7], 1], expected: 7, name: 'single element' },
      { args: [[5, 5, 5], 3], expected: 5, name: 'all equal' },
      { args: [[-1, -9, -3], 1], expected: -1, name: 'negatives' },
    ],
    hints: ['Think about which value you would throw away: a min-heap of size k keeps the k biggest values seen so far.', 'Push every number; whenever the heap grows past k, pop the smallest. At the end the root is the k-th largest.'],
    combines: ['heap-insert', 'heap-extract'],
  },
};

export default unit;
