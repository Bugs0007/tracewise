import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { decisionView } from '@/dsa/viz/decision';
import { problem, vizOf } from '../helpers';
import solution from './median-of-two-sorted-arrays.py?raw';
import cases from './median-of-two-sorted-arrays.cases.json';

const fmt = (v: number): string => (v === -Infinity ? '−∞' : v === Infinity ? '∞' : String(v));

const viz = vizOf<{ a: number[]; b: number[] }>({
  id: 'median-of-two-sorted-arrays',
  title: 'Median of Two Sorted Arrays',
  solution,
  inputs: [
    { key: 'a', label: 'a (sorted)', kind: 'numbers', default: [1, 5, 9, 14], maxItems: 8 },
    { key: 'b', label: 'b (sorted)', kind: 'numbers', default: [2, 6, 10], maxItems: 8 },
  ],
  presets: [
    { label: 'Interleaved', input: { a: [1, 5, 9, 14], b: [2, 6, 10] } },
    { label: 'Even total', input: { a: [1, 5, 9], b: [2, 6, 10] } },
    { label: 'One empty', input: { a: [], b: [4, 6, 8] } },
    { label: 'All of a is smaller', input: { a: [1, 2, 3], b: [10, 11, 12] } },
  ],
  validate: ({ a, b }) => (a.some((v, i) => i && v < a[i - 1]) || b.some((v, i) => i && v < b[i - 1]) ? 'Both arrays must be sorted' : a.length + b.length < 1 ? 'Enter at least one number' : null),
  run({ a: a0, b: b0 }) {
    const r = new TraceRecorder(solution);
    let a = a0;
    let b = b0;
    const swapped = a.length > b.length;
    if (swapped) [a, b] = [b, a];
    const total = a.length + b.length;
    const half = Math.floor((total + 1) / 2);
    let lo = 0;
    let hi = a.length;
    const names = swapped ? ['b (shorter)', 'a (longer)'] : ['a (shorter)', 'b (longer)'];
    const view = (i: number | null, j: number | null, edges?: [number, number, number, number], ok?: boolean) => {
      const ta: Record<number, Tone> = {};
      const tb: Record<number, Tone> = {};
      if (i !== null && j !== null) {
        for (let k = 0; k < i; k++) ta[k] = ok ? 'done' : 'frontier';
        for (let k = 0; k < j; k++) tb[k] = ok ? 'done' : 'frontier';
      }
      return [
        arrayView(a, { title: `${names[0]}: the first ${i ?? '?'} go to the left half`, tones: ta, pointers: i !== null ? { cutA: i } : undefined }),
        arrayView(b, { title: `${names[1]}: the first ${j ?? '?'} go to the left half`, tones: tb, pointers: j !== null ? { cutB: j } : undefined }),
        hashMapView({ lo, hi, ...(i !== null ? { cut: i } : {}), ...(edges ? { 'a left': fmt(edges[0]), 'a right': fmt(edges[1]), 'b left': fmt(edges[2]), 'b right': fmt(edges[3]) } : {}) }, { title: 'cut and the four numbers around it' }),
      ];
    };
    r.step('swap', swapped ? 'The first array is longer: swap them so we binary search the shorter one.' : 'Binary search the shorter array, so the first one stays first.', view(null, null), { swapped });
    if (swapped) r.step('swapDo', 'Swapped: a is now the shorter array.', view(null, null), {});
    r.step('total', `${total} numbers in all. The left half of the merged order will hold ${half} of them.`, view(null, null), { total });
    r.step('half', `half = (${total} + 1) // 2 = ${half}.`, view(null, null), { half });
    r.step('init', `Binary search the cut position i in a (0 to ${a.length}); b’s cut is then j = ${half} − i.`, view(null, null), { lo, hi });
    for (;;) {
      r.op();
      const i = Math.floor((lo + hi) / 2);
      const j = half - i;
      const aL = i > 0 ? a[i - 1] : -Infinity;
      const aR = i < a.length ? a[i] : Infinity;
      const bL = j > 0 ? b[j - 1] : -Infinity;
      const bR = j < b.length ? b[j] : Infinity;
      r.step('cutA', `Try cutting a after ${i} element${i === 1 ? '' : 's'} (i = ${i}). Then b is cut after j = ${half} − ${i} = ${j}, so the left halves hold ${half} numbers together.`, view(i, j), { i, j });
      r.step('bRight', `The numbers next to the cuts: a left = ${fmt(aL)}, a right = ${fmt(aR)}, b left = ${fmt(bL)}, b right = ${fmt(bR)}.`, view(i, j, [aL, aR, bL, bR]), { aL: fmt(aL), aR: fmt(aR), bL: fmt(bL), bR: fmt(bR) });
      const ok = aL <= bR && bL <= aR;
      const crossChecks = [
        decisionView({
          title: 'Cross-check 1 · does the left of a stay below the right of b?',
          condition: 'a_left <= b_right',
          expr: `${fmt(aL)} ≤ ${fmt(bR)}`,
          values: [
            { label: 'a_left', value: fmt(aL) },
            { label: 'b_right', value: fmt(bR) },
          ],
          result: aL <= bR,
          answer: aL <= bR ? 'yes: a does not reach past b' : 'no: a_left is bigger than b_right, so a is cut too far right',
        }),
        decisionView({
          title: 'Cross-check 2 · does the left of b stay below the right of a?',
          condition: 'b_left <= a_right',
          expr: `${fmt(bL)} ≤ ${fmt(aR)}`,
          values: [
            { label: 'b_left', value: fmt(bL) },
            { label: 'a_right', value: fmt(aR) },
          ],
          result: bL <= aR,
          answer: bL <= aR ? 'yes: b does not reach past a' : 'no: b_left is bigger than a_right, so a is cut too far left',
        }),
      ];
      r.predict(ok ? 'good' : 'bad', 'Is this a correct split: every number on the left ≤ every number on the right?', ['Yes: a left ≤ b right and b left ≤ a right', 'No: the halves overlap'], ok ? 0 : 1, ok ? 'Both cross-checks hold, so the left half is all ≤ the right half.' : 'One left number is bigger than a right number, so the cut is in the wrong place.');
      r.step('ok', ok ? `${fmt(aL)} ≤ ${fmt(bR)} and ${fmt(bL)} ≤ ${fmt(aR)}: a valid split.` : `The split is not valid (${aL > bR ? `${fmt(aL)} > ${fmt(bR)}` : `${fmt(bL)} > ${fmt(aR)}`}).`, [...view(i, j, [aL, aR, bL, bR], ok), ...crossChecks], { ok });
      if (ok) {
        const med = total % 2 ? Math.max(aL, bL) : (Math.max(aL, bL) + Math.min(aR, bR)) / 2;
        r.predictChoice('median', total % 2 ? `The total is odd: the median is the largest number of the left half, max(${fmt(aL)}, ${fmt(bL)}). What is it?` : `The total is even: the median is the mean of max(${fmt(aL)}, ${fmt(bL)}) and min(${fmt(aR)}, ${fmt(bR)}). What is it?`, String(med), [String(med + 1), String(med - 0.5), String(Math.max(aR === Infinity ? 0 : aR, bR === Infinity ? 0 : bR))], total, 'The median sits at the boundary between the two halves.');
        r.step(total % 2 ? 'retOdd' : 'retEven', `The median is ${med}.`, view(i, j, [aL, aR, bL, bR], true), { result: med });
        return { frames: r.frames, result: med };
      }
      // ── test: which cross-check failed? it decides the direction ──
      const tooRight = aL > bR;
      const dirTest = {
        title: 'Which way is the cut wrong?',
        condition: 'a_left > b_right',
        expr: `${fmt(aL)} > ${fmt(bR)}`,
        values: [
          { label: 'a_left', value: fmt(aL) },
          { label: 'b_right', value: fmt(bR) },
        ],
        result: tooRight,
        answer: tooRight ? 'yes: a is cut too far right' : 'no: so the other check failed (b_left > a_right) and a is cut too far left',
      };
      const dirVerdict = tooRight ? `${fmt(aL)} > ${fmt(bR)}: a gives too many numbers to the left half. Move the cut in a to the left.` : `${fmt(aL)} is not above ${fmt(bR)}, so the failing check must be b_left (${fmt(bL)}) > a_right (${fmt(aR)}): a gives too few numbers to the left half. Move the cut in a to the right.`;
      r.step('tooBig', `Which way is the cut wrong? ${dirVerdict}`, [...view(i, j, [aL, aR, bL, bR], false), decisionView({ ...dirTest, verdict: dirVerdict })], { i, lo, hi });
      const keepSpan = tooRight ? `cut positions ${lo}..${i - 1}` : `cut positions ${i + 1}..${hi}`;
      const dropSpan = tooRight ? `cut positions ${i}..${hi}` : `cut positions ${lo}..${i}`;
      const moveVerdict = tooRight ? `a's cut at ${i} is too far right, and so is every cut after it. Discard those, keep the cuts to the left.` : `a's cut at ${i} is too far left, and so is every cut before it. Discard those, keep the cuts to the right.`;
      if (tooRight) {
        hi = i - 1;
        r.step('goLeft', `a left ${fmt(aL)} is too big: cut earlier in a. hi = ${hi}.`, [...view(null, null), decisionView({ ...dirTest, keep: keepSpan, discard: dropSpan, verdict: moveVerdict })], { lo, hi });
      } else {
        lo = i + 1;
        r.step('goRight', `b left ${fmt(bL)} is too big: cut later in a. lo = ${lo}.`, [...view(null, null), decisionView({ ...dirTest, keep: keepSpan, discard: dropSpan, verdict: moveVerdict })], { lo, hi });
      }
    }
  },
  reference({ a, b }) {
    const m = [...a, ...b].sort((x, y) => x - y);
    const n = m.length;
    return n % 2 ? m[(n - 1) / 2] : (m[n / 2 - 1] + m[n / 2]) / 2;
  },
});

export default problem({
  summary: 'Two sorted lists are given. Find the median of all their numbers together (the middle value, or the mean of the two middle values when the count is even) without merging them, in logarithmic time.',
  example: ['a = [2, 6], b = [1, 3, 9]', '3', 'Merged order is 1, 2, 3, 6, 9; the middle value is 3. With a = [2, 6], b = [1, 3] the merged order 1, 2, 3, 6 has median (2 + 3) / 2 = 2.5.'],
  pattern: ['binary-search', ['binary-search', 'two-pointers', 'divide-conquer', 'heap'], 'You do not need the merged list, only the right split point. Binary search how many elements of the shorter array belong to the left half; the other array’s cut follows.', {
    'two-pointers': 'Merging with two pointers is O(m + n), too slow for the logarithmic target.',
    'divide-conquer': 'Discarding half each step is divide and conquer, realised as a binary search on the cut.',
    heap: 'Two heaps keep a running median for a stream, but the sorted-array structure allows a faster, direct approach.',
  }],
  hints: [
    'The median splits all the numbers into a left half and a right half of (almost) equal size. If you picked i numbers from the first array for the left half, how many must come from the second?',
    'A split is correct when every number on the left is ≤ every number on the right. Within each sorted array that is automatic, so which two comparisons are left to check?',
    'Binary search the cut in the shorter array: if a’s left value is too big, cut earlier in a; if b’s left value is too big, cut later in a.',
  ],
  insight: 'Binary search the cut point in the shorter array. A cut is right when a left ≤ b right and b left ≤ a right; the median sits at the boundary.',
  brute: 'Merge both lists and read the middle: O(m + n).',
  optimal: 'Binary search on the shorter array: O(log(min(m, n))) time, O(1) space.',
  walk: ['Make a the shorter array. The left half should contain half = (total + 1) // 2 numbers.', 'For a cut i in a, the cut in b is j = half − i. Use −∞ and +∞ as sentinels at the edges.', 'The cut is valid when a_left ≤ b_right and b_left ≤ a_right. If a_left > b_right, move the cut left in a; otherwise move it right.', 'When valid, an odd total gives max(a_left, b_left); an even total gives the mean of max(a_left, b_left) and min(a_right, b_right).'],
  edge: ['One array empty.', 'All of a below all of b (or above).', 'Even and odd totals.', 'Duplicates across the arrays.'],
  works: ['Every number on a valid left half is ≤ every number on the right half, and the left half has the right size, so the median is determined by the four border numbers.', 'The comparison tells which direction the cut must move, so binary search over the cut position converges to a valid one.'],
  time: ['O(log min(m, n))', 'The search is over the shorter array only.'],
  space: ['O(1)', 'A few numbers.'],
  solution,
  cases,
  sig: 'def find_median(a, b):\n    # median of the two sorted lists combined, as a float\n    pass\n',
  viz,
  fromArgs: ([a, b]) => ({ a, b }),
});
