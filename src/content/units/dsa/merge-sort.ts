import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { bars, items, numbersInput, show, sortedCopy, stackPanel, type Item } from '@/content/lib/sorting';

const code = `
def merge_sort(nums, lo=0, hi=None):
    if hi is None:
        hi = len(nums) - 1
    if lo >= hi:                                  #@base
        return nums
    mid = (lo + hi) // 2                          #@mid
    merge_sort(nums, lo, mid)                     #@left
    merge_sort(nums, mid + 1, hi)                 #@right
    merge(nums, lo, mid, hi)                      #@merge
    return nums                                   #@ret

def merge(nums, lo, mid, hi):
    left = nums[lo:mid + 1]                       #@copy
    right = nums[mid + 1:hi + 1]
    i = j = 0
    k = lo
    while i < len(left) and j < len(right):       #@loop
        if left[i] <= right[j]:                   #@cmp
            nums[k] = left[i]                     #@takeL
            i += 1
        else:
            nums[k] = right[j]                    #@takeR
            j += 1
        k += 1
    while i < len(left):                          #@tailL
        nums[k] = left[i]
        i += 1
        k += 1
    while j < len(right):                         #@tailR
        nums[k] = right[j]
        j += 1
        k += 1
`;

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'merge-sort',
  title: 'Merge sort',
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Numbers to sort', kind: 'numbers', default: [38, 27, 43, 3, 9, 82], maxItems: 8 }],
  presets: [
    { label: 'Already sorted', input: { nums: [1, 2, 3, 4, 5, 6] } },
    { label: 'Reversed', input: { nums: [6, 5, 4, 3, 2, 1] } },
    { label: 'Duplicates', input: { nums: [3, 1, 3, 2, 1, 2] } },
    { label: 'Eight items', input: { nums: [8, 3, 5, 1, 7, 2, 6, 4] } },
  ],
  run({ nums: raw }) {
    const nums = numbersInput(raw, { max: 8 });
    const r = new Recorder(code);
    const n = nums.length;
    // main array cells keep ids; a stale copy gets "~" appended so ids stay unique while a merge is in flight
    let cells: { v: number; id: string }[] = items(nums).map((c) => ({ v: c.v, id: String(c.id) }));
    const sortedPos: boolean[] = new Array(n).fill(false);
    const stack: string[] = [];
    let allDone = false;

    const main = (lo: number, hi: number, hot: Record<number, Tone> = {}, ptr: Record<string, number> = {}, inRange: Tone = 'frontier'): Panel => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < n; k++) if (sortedPos[k]) tones[k] = allDone ? 'done' : 'visited';
      for (let k = lo; k <= hi; k++) tones[k] = inRange;
      return bars(cells, { title: 'nums', tones: { ...tones, ...hot }, pointers: ptr });
    };
    const run = (title: string, a: Item[], used: number, ptrName: string, ptrAt: number): Panel => {
      const tones: Record<number, Tone> = {};
      for (let k = 0; k < used; k++) tones[k] = 'muted';
      if (ptrAt < a.length) tones[ptrAt] = 'compare';
      return bars(a.map((c) => ({ v: c.v, id: `${title[0]}${c.id}` })), { title, tones, pointers: { [ptrName]: ptrAt } });
    };

    function sort(lo: number, hi: number): void {
      stack.push(`sort(${lo},${hi})`);
      if (lo >= hi) {
        if (lo === hi) sortedPos[lo] = true;
        r.step('base', n === 0 ? 'Empty list: nothing to sort' : `sort(${lo},${hi}): one item → already sorted`, [main(lo, hi, {}, {}, 'visited'), stackPanel(stack)], { lo, hi });
        stack.pop();
        return;
      }
      const mid = Math.floor((lo + hi) / 2);
      r.step('mid', `Split ${lo}..${hi} at mid = ${mid} → ${lo}..${mid} and ${mid + 1}..${hi}`, [main(lo, hi, {}, { lo, mid, hi }), stackPanel(stack)], { lo, mid, hi });
      sort(lo, mid);
      sort(mid + 1, hi);
      merge(lo, mid, hi);
      stack.pop();
    }

    function merge(lo: number, mid: number, hi: number): void {
      stack.push(`merge(${lo},${hi})`);
      const left = cells.slice(lo, mid + 1).map((c) => ({ v: c.v, id: Number(c.id.replace('~', '')) }));
      const right = cells.slice(mid + 1, hi + 1).map((c) => ({ v: c.v, id: Number(c.id.replace('~', '')) }));
      let i = 0;
      let j = 0;
      let k = lo;
      const view = (hot: Record<number, Tone> = {}, ptr: Record<string, number> = {}): Panel[] => {
        const tones: Record<number, Tone> = {};
        for (let p = k - 1; p >= lo; p--) tones[p] = 'visited';
        return [main(lo, hi, { ...tones, ...hot }, ptr), run('left run', left, i, 'i', i), run('right run', right, j, 'j', j), stackPanel(stack)];
      };
      const write = (item: Item, pos: number) => {
        r.op();
        cells = cells.map((c, p) => (p !== pos && c.id === String(item.id) ? { v: c.v, id: `${item.id}~` } : c));
        cells[pos] = { v: item.v, id: String(item.id) };
      };
      r.step('merge', `Merge ${show(left.map((c) => c.v))} and ${show(right.map((c) => c.v))} into ${lo}..${hi}`, view({}, { k }), { lo, mid, hi });
      while (i < left.length && j < right.length) {
        r.op();
        if (left[i].v <= right[j].v) {
          const l = left[i];
          const rv = right[j].v;
          write(l, k);
          i++;
          r.step('takeL', `${l.v} ≤ ${rv} → write ${l.v} at index ${k}`, view({ [k]: 'swap' }, { k }), { i, j, k });
        } else {
          const rt = right[j];
          const lv = left[i].v;
          write(rt, k);
          j++;
          r.step('takeR', `${lv} > ${rt.v} → write ${rt.v} at index ${k}`, view({ [k]: 'swap' }, { k }), { i, j, k });
        }
        k++;
      }
      while (i < left.length) {
        const l = left[i];
        write(l, k);
        i++;
        r.step('tailL', `Right run is empty → copy ${l.v} from left to index ${k}`, view({ [k]: 'swap' }, { k }), { i, j, k });
        k++;
      }
      while (j < right.length) {
        const rt = right[j];
        write(rt, k);
        j++;
        r.step('tailR', `Left run is empty → copy ${rt.v} from right to index ${k}`, view({ [k]: 'swap' }, { k }), { i, j, k });
        k++;
      }
      for (let p = lo; p <= hi; p++) sortedPos[p] = true;
      if (lo === 0 && hi === n - 1) allDone = true;
      r.step('ret', `Sorted run ${lo}..${hi}: ${show(cells.slice(lo, hi + 1).map((c) => c.v))}`, [main(lo, hi, {}, {}, allDone ? 'done' : 'visited'), stackPanel(stack)], { lo, hi });
      stack.pop();
    }

    sort(0, n - 1);
    return { frames: r.frames, result: cells.map((c) => c.v) };
  },
  reference: ({ nums }) => sortedCopy(nums),
};

const tests = [
  { args: [[38, 27, 43, 3, 9, 82, 10]], expected: [3, 9, 10, 27, 38, 43, 82] },
  { args: [[2, 1]], expected: [1, 2], name: 'two items' },
  { args: [[1, 2, 3, 4, 5]], expected: [1, 2, 3, 4, 5], name: 'already sorted' },
  { args: [[5, 4, 3, 2, 1]], expected: [1, 2, 3, 4, 5], name: 'reversed' },
  { args: [[4, 1, 4, 2, 1, 4]], expected: [1, 1, 2, 4, 4, 4], name: 'duplicates' },
  { args: [[0, -7, 3, -2]], expected: [-7, -2, 0, 3], name: 'negatives' },
  { args: [[3]], expected: [3], name: 'single element' },
  { args: [[]], expected: [], name: 'empty' },
];

const unit: Unit = {
  id: 'merge-sort',
  hook: 'Merge sort is the standard "guaranteed O(n log n), and stable" answer, and the merge step is a building block for linked lists, external sorting and counting inversions. It is also the cleanest example of divide and conquer.',
  predict: {
    prompt: 'merge_sort runs on a list of 6 items. How many times does the merge step run in total?',
    options: ['3', '5', '6', '11'],
    answer: 1,
    explain: 'Each merge joins two runs into one, so going from 6 single items to 1 sorted list takes exactly 6 - 1 = 5 merges. (There are 11 merge_sort calls in total, but 6 of them are single items that return immediately.)',
  },
  viz,
  deeper: {
    points: [
      'Divide: the list is halved log2(n) times. Conquer: every level does O(n) merging work, so the total is O(n log n) in the best, average and worst case.',
      'Stable: when left[i] == right[j], take the LEFT one (`<=`). Taking the right first would reorder equal items.',
      'Needs O(n) extra space for the temporary copies (the arrays labelled left run and right run). It is not in place.',
      'The recursion is only log n deep, so the call stack is small even for large inputs.',
      'Once one run is used up, the leftover of the other run is already sorted and just gets copied over.',
    ],
    complexity: { time: 'O(n log n) in every case', space: 'O(n)' },
    pitfalls: ['Forgetting to copy the leftover items of the left run after the main loop', 'Splitting with `mid` in both halves (`lo..mid` and `mid..hi`) so recursion never shrinks', 'Using `<` instead of `<=` in the merge, which silently breaks stability'],
  },
  practice: {
    language: 'python',
    fnName: 'merge_sort',
    statement: 'Implement merge sort on the list of integers: recursively sort the two halves of nums[lo..hi] in place, then merge them with a helper. Return the sorted list.',
    signature: 'def merge_sort(nums, lo=0, hi=None):',
    solution: `def merge_sort(nums, lo=0, hi=None):
    if hi is None:
        hi = len(nums) - 1
    if lo @@>=@@ hi:
        return nums
    mid = @@(lo + hi) // 2@@
    merge_sort(nums, lo, mid)
    merge_sort(nums, @@mid + 1@@, hi)
    merge(nums, lo, mid, hi)
    return nums

def merge(nums, lo, mid, hi):
    left = nums[lo:mid + 1]
    right = nums[mid + 1:hi + 1]
    i = j = 0
    k = lo
    while i < len(left) and j < len(right):
        if left[i] @@<=@@ right[j]:
            nums[k] = left[i]
            i += 1
        else:
            nums[k] = @@right[j]@@
            j += 1
        k += 1
    while @@i < len(left)@@:
        nums[k] = left[i]
        i += 1
        k += 1
    while j < len(right):
        nums[k] = right[j]
        j += 1
        k += 1`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'merge_sort',
    statement: 'This merge sort loses or duplicates values on many inputs (for example [2, 1] comes back as [1, 1]). Find and fix the bug.',
    buggy: `def merge_sort(nums, lo=0, hi=None):
    if hi is None:
        hi = len(nums) - 1
    if lo >= hi:
        return nums
    mid = (lo + hi) // 2
    merge_sort(nums, lo, mid)
    merge_sort(nums, mid + 1, hi)
    merge(nums, lo, mid, hi)
    return nums

def merge(nums, lo, mid, hi):
    left = nums[lo:mid + 1]
    right = nums[mid + 1:hi + 1]
    i = j = 0
    k = lo
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            nums[k] = left[i]
            i += 1
        else:
            nums[k] = right[j]
            j += 1
        k += 1
    while j < len(right):
        nums[k] = right[j]
        j += 1
        k += 1`,
    fixed: `def merge_sort(nums, lo=0, hi=None):
    if hi is None:
        hi = len(nums) - 1
    if lo >= hi:
        return nums
    mid = (lo + hi) // 2
    merge_sort(nums, lo, mid)
    merge_sort(nums, mid + 1, hi)
    merge(nums, lo, mid, hi)
    return nums

def merge(nums, lo, mid, hi):
    left = nums[lo:mid + 1]
    right = nums[mid + 1:hi + 1]
    i = j = 0
    k = lo
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            nums[k] = left[i]
            i += 1
        else:
            nums[k] = right[j]
            j += 1
        k += 1
    while i < len(left):
        nums[k] = left[i]
        i += 1
        k += 1
    while j < len(right):
        nums[k] = right[j]
        j += 1
        k += 1`,
    tests,
    bugType: 'forgot the leftover tail',
    hint: 'Trace merge on left = [2], right = [1]. After 1 is written, which run still has items, and who copies them?',
    explanation: 'The main loop stops as soon as ONE run is exhausted. If the left run still has items they must be copied over, otherwise the slots keep stale values. Only the right-tail loop was kept, so the left-over items are lost. Add the `while i < len(left)` loop back.',
  },
  boss: {
    title: 'Count inversions',
    statement: 'An inversion is a pair of positions i < j with nums[i] > nums[j]. Return how many inversions the list has. A double loop is O(n²); aim for O(n log n) by counting during a merge sort. Do not modify the input list.',
    language: 'python',
    fnName: 'count_inversions',
    starter: `def count_inversions(nums):
    # your code here
    pass
`,
    solution: `def count_inversions(nums):
    def sort(a):
        if len(a) <= 1:
            return a, 0
        mid = len(a) // 2
        left, x = sort(a[:mid])
        right, y = sort(a[mid:])
        merged = []
        i = j = 0
        inv = x + y
        while i < len(left) and j < len(right):
            if left[i] <= right[j]:
                merged.append(left[i])
                i += 1
            else:
                merged.append(right[j])
                j += 1
                inv += len(left) - i
        merged.extend(left[i:])
        merged.extend(right[j:])
        return merged, inv

    return sort(list(nums))[1]`,
    tests: [
      { args: [[2, 4, 1, 3, 5]], expected: 3 },
      { args: [[1, 2, 3, 4]], expected: 0, name: 'already sorted' },
      { args: [[4, 3, 2, 1]], expected: 6, name: 'reversed' },
      { args: [[2, 2, 1]], expected: 2, name: 'duplicates (equal pairs do not count)' },
      { args: [[1, 1, 1]], expected: 0, name: 'all equal' },
      { args: [[]], expected: 0, name: 'empty' },
      { args: [[5]], expected: 0, name: 'single element' },
    ],
    hints: ['When the merge takes an item from the RIGHT run, it jumps over some items of the left run. Each of those jumped-over items forms an inversion with it.', 'When you take right[j] while left[i] is still waiting, every remaining left item (len(left) - i of them) is larger, so add len(left) - i. Keep `<=` for equal items so ties are not counted.'],
    combines: ['ll-merge', 'recursion-call-stack'],
  },
  quiz: [
    {
      prompt: 'Why does the merge use `left[i] <= right[j]` rather than `<`?',
      options: ['It is faster', 'Equal items from the left run go first, so the sort stays stable', 'Otherwise the loop never ends', 'To save memory'],
      answer: 1,
      explain: 'The left run holds items that came earlier in the input. Taking the left one on ties keeps equal items in their original order.',
    },
  ],
};

export default unit;
