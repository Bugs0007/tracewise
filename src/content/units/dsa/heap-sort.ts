import { Recorder } from '@/engine/recorder';
import { binaryTreePanel, buildTree } from '@/engine/layout';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { bars, items, numbersInput, show, sortedCopy } from '@/content/lib/sorting';

const code = `
def heap_sort(nums):
    n = len(nums)
    for i in range(n // 2 - 1, -1, -1):                 #@build
        sift_down(nums, i, n)                           #@buildCall
    for end in range(n - 1, 0, -1):                     #@extract
        nums[0], nums[end] = nums[end], nums[0]         #@swap
        sift_down(nums, 0, end)                         #@siftCall
    return nums                                         #@ret

def sift_down(nums, i, size):
    while True:
        left = 2 * i + 1                                #@children
        right = left + 1
        largest = i
        if left < size and nums[left] > nums[largest]:  #@cmpL
            largest = left
        if right < size and nums[right] > nums[largest]:   #@cmpR
            largest = right
        if largest == i:                                #@stop
            break
        nums[i], nums[largest] = nums[largest], nums[i] #@siftSwap
        i = largest                                     #@down
`;

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'heap-sort',
  title: 'Heap sort',
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Numbers to sort', kind: 'numbers', default: [4, 10, 3, 5, 1, 8], maxItems: 10 }],
  presets: [
    { label: 'Already sorted', input: { nums: [1, 2, 3, 4, 5, 6] } },
    { label: 'Reversed', input: { nums: [6, 5, 4, 3, 2, 1] } },
    { label: 'Duplicates', input: { nums: [3, 1, 3, 2, 1, 2] } },
    { label: 'Already a max-heap', input: { nums: [9, 7, 8, 3, 2, 1] } },
  ],
  run({ nums: raw }) {
    const nums = numbersInput(raw, { max: 10 });
    const r = new Recorder(code);
    const a = items(nums);
    const n = a.length;
    let size = n; // heap occupies a[0..size-1]; the rest is the sorted tail
    let finished = false;

    const panels = (hot: Record<number, Tone> = {}, ptr: Record<string, number> = {}, edge?: [number, number]): Panel[] => {
      const tones: Record<number, Tone> = {};
      for (let k = size; k < n; k++) tones[k] = 'done';
      const treeTones: Record<string, Tone> = {};
      for (let k = 0; k < size; k++) treeTones[`t${k}`] = finished ? 'done' : 'default';
      for (const [k, t] of Object.entries(hot)) {
        tones[Number(k)] = t;
        treeTones[`t${k}`] = t;
      }
      const edgeTones: Record<string, Tone> = {};
      if (edge) edgeTones[`t${edge[0]}>t${edge[1]}`] = 'swap';
      const heapVals = a.slice(0, size).map((c) => c.v);
      return [bars(a, { title: 'nums (heap lives in the front, sorted items in the back)', tones, pointers: ptr }), binaryTreePanel(buildTree(heapVals), { tones: treeTones, edgeTones, title: `Max-heap view (size ${size})` })];
    };

    function siftDown(start: number, hsize: number): void {
      let i = start;
      while (true) {
        const left = 2 * i + 1;
        const right = left + 1;
        let largest = i;
        if (left < hsize) {
          r.op();
          const bigger = a[left].v > a[largest].v;
          r.step('cmpL', bigger ? `Left child ${a[left].v} > ${a[largest].v} → largest = left` : `Left child ${a[left].v} ≤ ${a[largest].v} → keep`, panels({ [i]: 'active', [left]: 'compare' }, { i, left }), { i, left, largest });
          if (bigger) largest = left;
        }
        if (right < hsize) {
          r.op();
          const bigger = a[right].v > a[largest].v;
          r.step('cmpR', bigger ? `Right child ${a[right].v} > ${a[largest].v} → largest = right` : `Right child ${a[right].v} ≤ ${a[largest].v} → keep`, panels({ [i]: 'active', [right]: 'compare', [largest]: largest === i ? 'active' : 'frontier' }, { i, right }), { i, right, largest });
          if (bigger) largest = right;
        }
        if (largest === i) {
          r.step('stop', left >= hsize ? `Index ${i} (${a[i].v}) has no children in the heap → stop` : `${a[i].v} is ≥ its children → heap property holds, stop`, panels({ [i]: 'found' }, { i }), { i, largest });
          return;
        }
        const parent = a[i].v;
        const child = a[largest].v;
        [a[i], a[largest]] = [a[largest], a[i]];
        r.op(2);
        r.step('siftSwap', `Swap ${parent} down with the bigger child ${child}`, panels({ [i]: 'swap', [largest]: 'swap' }, { i: largest }, [Math.min(i, largest), Math.max(i, largest)]), { i, largest });
        i = largest;
      }
    }

    r.step('build', n < 2 ? `n = ${n}: nothing to heapify` : `Phase 1: build a max-heap, sifting down from the last parent (index ${Math.floor(n / 2) - 1})`, panels(), { n });
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
      r.step('buildCall', `sift_down(${i}): restore the heap below index ${i} (value ${a[i].v})`, panels({ [i]: 'active' }, { i }), { i, size });
      siftDown(i, size);
    }
    if (n > 1) r.step('extract', `Max-heap built: the largest value ${a[0].v} sits at the root`, panels({ 0: 'found' }, { i: 0 }), { size });
    for (let end = n - 1; end > 0; end--) {
      const top = a[0].v;
      const last = a[end].v;
      [a[0], a[end]] = [a[end], a[0]];
      r.op(2);
      size = end;
      r.step('swap', `Swap root ${top} with last heap item ${last} → ${top} is final, heap shrinks to ${size}`, panels({ 0: 'swap' }, { i: 0 }), { end, size });
      r.step('siftCall', `sift_down(0, size=${size}): push ${last} down to restore the heap`, panels({ 0: 'active' }, { i: 0 }), { end, size });
      siftDown(0, size);
    }
    size = n;
    finished = true;
    r.step('ret', `Sorted: ${show(a.map((c) => c.v))}`, panels(Object.fromEntries(a.map((_, k) => [k, 'done' as Tone]))), {});
    return { frames: r.frames, result: a.map((c) => c.v) };
  },
  reference: ({ nums }) => sortedCopy(nums),
};

const tests = [
  { args: [[12, 11, 13, 5, 6, 7]], expected: [5, 6, 7, 11, 12, 13] },
  { args: [[2, 1]], expected: [1, 2], name: 'two items' },
  { args: [[1, 2, 3, 4, 5]], expected: [1, 2, 3, 4, 5], name: 'already sorted' },
  { args: [[5, 4, 3, 2, 1]], expected: [1, 2, 3, 4, 5], name: 'reversed' },
  { args: [[3, 1, 3, 2, 1, 3, 2]], expected: [1, 1, 2, 2, 3, 3, 3], name: 'duplicates' },
  { args: [[0, -6, 9, -2, 4]], expected: [-6, -2, 0, 4, 9], name: 'negatives' },
  { args: [[8]], expected: [8], name: 'single element' },
  { args: [[]], expected: [], name: 'empty' },
];

const unit: Unit = {
  id: 'heap-sort',
  hook: 'Heap sort is the only classic comparison sort that is both in place and O(n log n) in the worst case. It shows you can treat an array as a tree with index math (children of i are 2i+1 and 2i+2) and leads straight into priority-queue questions.',
  predict: {
    prompt: 'Build a MAX-heap in place from [2, 5, 3, 1] (sift down from the last parent to the root). What does the array look like?',
    options: ['[5, 2, 3, 1]', '[5, 3, 2, 1]', '[5, 1, 3, 2]', '[3, 5, 2, 1]'],
    answer: 0,
    explain: 'Index 1 (5) already beats its only child 1. Index 0 (2) has children 5 and 3: the bigger child 5 swaps up, giving [5, 2, 3, 1]; 2 then beats its new child 1 and stops. A heap only orders parents above children; it is NOT sorted, so [5, 3, 2, 1] is wrong.',
  },
  viz,
  deeper: {
    points: [
      'Phase 1 builds a max-heap bottom-up in O(n) (most nodes are near the leaves and barely move). Phase 2 does n - 1 extractions at O(log n) each.',
      'The array doubles as the heap and the sorted output: the heap shrinks from the right while the sorted tail grows. That is why it needs no extra space.',
      'Index math: children of i are 2i+1 and 2i+2, the parent of i is (i-1)//2, and the last parent is n//2 - 1.',
      'Not stable (swapping the root with the last item jumps over equal items). Poor cache locality makes it slower than quick sort in practice, but its worst case is guaranteed.',
    ],
    complexity: { time: 'O(n log n) in every case', space: 'O(1)' },
    pitfalls: ['Passing the full size `n` to sift_down during extraction, so sorted items get pulled back into the heap', 'Starting the build at n // 2 instead of n // 2 - 1 (off by one) or building top-down', 'Forgetting `left < size` / `right < size` bounds checks'],
  },
  practice: {
    language: 'python',
    fnName: 'heap_sort',
    statement: 'Sort the list of integers in ascending order with heap sort: build a max-heap, then repeatedly swap the root to the end of the unsorted part and sift down. Sort in place and return the list.',
    signature: 'def heap_sort(nums):',
    solution: `def heap_sort(nums):
    n = len(nums)
    for i in range(@@n // 2 - 1@@, -1, -1):
        sift_down(nums, i, n)
    for end in range(@@n - 1@@, 0, -1):
        nums[0], nums[end] = nums[end], nums[0]
        sift_down(nums, 0, @@end@@)
    return nums

def sift_down(nums, i, size):
    while True:
        left = @@2 * i + 1@@
        right = left + 1
        largest = i
        if left < size and nums[left] @@>@@ nums[largest]:
            largest = left
        if right < size and nums[right] > nums[largest]:
            largest = right
        if largest == i:
            break
        nums[i], nums[largest] = nums[largest], nums[i]
        i = @@largest@@`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'heap_sort',
    statement: 'This heap sort builds the heap correctly but returns lists that are not sorted. Find and fix the bug.',
    buggy: `def heap_sort(nums):
    n = len(nums)
    for i in range(n // 2 - 1, -1, -1):
        sift_down(nums, i, n)
    for end in range(n - 1, 0, -1):
        nums[0], nums[end] = nums[end], nums[0]
        sift_down(nums, 0, n)
    return nums

def sift_down(nums, i, size):
    while True:
        left = 2 * i + 1
        right = left + 1
        largest = i
        if left < size and nums[left] > nums[largest]:
            largest = left
        if right < size and nums[right] > nums[largest]:
            largest = right
        if largest == i:
            break
        nums[i], nums[largest] = nums[largest], nums[i]
        i = largest`,
    fixed: `def heap_sort(nums):
    n = len(nums)
    for i in range(n // 2 - 1, -1, -1):
        sift_down(nums, i, n)
    for end in range(n - 1, 0, -1):
        nums[0], nums[end] = nums[end], nums[0]
        sift_down(nums, 0, end)
    return nums

def sift_down(nums, i, size):
    while True:
        left = 2 * i + 1
        right = left + 1
        largest = i
        if left < size and nums[left] > nums[largest]:
            largest = left
        if right < size and nums[right] > nums[largest]:
            largest = right
        if largest == i:
            break
        nums[i], nums[largest] = nums[largest], nums[i]
        i = largest`,
    tests,
    bugType: 'heap size not shrunk',
    hint: 'After swapping the root into nums[end], is nums[end] still allowed to take part in the heap?',
    explanation: 'The item at nums[end] is now in its final sorted position. sift_down must only look at nums[0..end-1], so the size argument has to be `end`. Passing `n` lets the sift pull the sorted maximum back up into the heap.',
  },
  boss: {
    title: 'Sort a nearly sorted list',
    statement: 'Every item of `nums` is at most k positions away from where it belongs in the sorted order. Return the sorted list in O(n log k) time using a min-heap of size k + 1 (the heapq module is allowed).',
    language: 'python',
    fnName: 'sort_k_sorted',
    starter: `def sort_k_sorted(nums, k):
    # your code here
    pass
`,
    solution: `import heapq

def sort_k_sorted(nums, k):
    heap = list(nums[:k + 1])
    heapq.heapify(heap)
    out = []
    for x in nums[k + 1:]:
        out.append(heapq.heappushpop(heap, x))
    while heap:
        out.append(heapq.heappop(heap))
    return out`,
    tests: [
      { args: [[3, 2, 1, 5, 4, 7, 6, 5], 2], expected: [1, 2, 3, 4, 5, 5, 6, 7] },
      { args: [[6, 5, 3, 2, 8, 10, 9], 3], expected: [2, 3, 5, 6, 8, 9, 10] },
      { args: [[1, 2, 3], 0], expected: [1, 2, 3], name: 'k = 0 (already sorted)' },
      { args: [[2, 1], 1], expected: [1, 2], name: 'two items' },
      { args: [[4], 0], expected: [4], name: 'single element' },
      { args: [[], 0], expected: [], name: 'empty' },
    ],
    hints: ['The smallest remaining item must be among the next k + 1 items. What structure gives you the minimum of a small window quickly?', 'Put the first k + 1 items in a min-heap. For each later item, push it and pop the minimum into the output (heappushpop does both). Drain the heap at the end.'],
    combines: ['heapify', 'heap-extract'],
  },
  quiz: [
    {
      prompt: 'In a heap stored in an array, which indices are the children of index 3?',
      options: ['4 and 5', '6 and 7', '5 and 6', '7 and 8'],
      answer: 3,
      explain: 'Children of i are 2i + 1 and 2i + 2, so for i = 3 they are 7 and 8.',
    },
  ],
};

export default unit;
