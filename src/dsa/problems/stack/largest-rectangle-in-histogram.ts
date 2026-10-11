import type { Tone } from '@/engine/types';
import { arrayView, hashMapView, stackView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './largest-rectangle-in-histogram.py?raw';
import cases from './largest-rectangle-in-histogram.cases.json';

const viz = vizOf<{ heights: number[] }>({
  id: 'largest-rectangle-in-histogram',
  title: 'Largest Rectangle in Histogram',
  solution,
  inputs: [{ key: 'heights', label: 'bar heights', kind: 'numbers', default: [2, 4, 3, 7, 6, 1, 5], maxItems: 12 }],
  presets: [
    { label: 'Mixed', input: { heights: [2, 4, 3, 7, 6, 1, 5] } },
    { label: 'Increasing', input: { heights: [1, 2, 3, 4, 5] } },
    { label: 'Valley', input: { heights: [6, 1, 6] } },
    { label: 'All equal', input: { heights: [4, 4, 4, 4] } },
  ],
  validate: ({ heights }) => (heights.some((h) => h < 0) ? 'Heights cannot be negative' : null),
  run({ heights: h }) {
    const r = new TraceRecorder(solution);
    const stack: [number, number][] = [];
    let best = 0;
    const view = (i: number, hot: Tone | null = null, span?: [number, number]) => {
      const tones: Record<number, Tone> = {};
      stack.forEach(([s]) => (tones[s] = 'frontier'));
      if (span) for (let q = span[0]; q < span[1]; q++) tones[q] = 'found';
      if (hot && i < h.length) tones[i] = hot;
      return [
        arrayView(h, { title: 'bars', bars: true, tones, pointers: i < h.length ? { i } : undefined }),
        stackView(stack.map(([, hh]) => hh), { title: 'stack: (height) and where its rectangle can start', subs: stack.map(([s]) => `from ${s}`) }),
        hashMapView({ best }, {}),
      ];
    };
    r.step('init', 'The stack holds bars whose rectangles can still grow to the right. Heights increase from bottom to top.', view(h.length), {});
    r.step('best', 'best is the largest rectangle seen so far.', view(h.length), { best });
    for (let i = 0; i < h.length; i++) {
      r.op();
      let start = i;
      const willPop = stack.length > 0 && stack[stack.length - 1][1] > h[i];
      r.step('loop', `Bar ${i} has height ${h[i]}.`, view(i, 'active'), { i, h: h[i] });
      r.predict('pop', `The top of the stack has height ${stack.length ? stack[stack.length - 1][1] : '(none)'} and this bar is ${h[i]}. Is the top taller, so its rectangle ends here?`, ['Yes: pop it and measure its rectangle', 'No: just push this bar'], willPop ? 0 : 1, willPop ? 'A shorter bar blocks the taller one from extending further right, so its rectangle is finished.' : 'The new bar is at least as tall, so the stack bars can keep growing.');
      r.step('start', `start = ${i}: this bar’s rectangle could begin at its own index (or further left if bars are popped).`, view(i, 'active'), { start });
      while (stack.length && stack[stack.length - 1][1] > h[i]) {
        const [idx, height] = stack.pop()!;
        const area = height * (i - idx);
        r.step('pop', `Pop height ${height} (it started at ${idx}). It is blocked by the shorter bar ${h[i]} at index ${i}.`, view(i, 'compare', [idx, i]), { idx, height });
        r.predictChoice('area', `The popped bar has height ${height} and spans indices ${idx} to ${i - 1}. Its rectangle area?`, String(area), [String(height * (i - idx + 1)), String(height * Math.max(1, i - idx - 1)), String(height + (i - idx))], idx, 'Area = height × width, where the width is the distance from where it started to the blocking bar.');
        best = Math.max(best, area);
        r.step('area', `Area = ${height} × (${i} − ${idx}) = ${area}. best = ${best}.`, view(i, 'found', [idx, i]), { area, best });
        start = idx;
        r.step('extend', `The current bar ${h[i]} can reach back to index ${idx}, so start = ${idx}.`, view(i, 'active'), { start });
      }
      stack.push([start, h[i]]);
      r.step('push', `Push (${h[i]}, from ${start}).`, view(i + 1), { stack: JSON.stringify(stack) });
    }
    for (const [idx, height] of stack) {
      r.step('rest', `Bar of height ${height} from index ${idx} was never blocked: it extends to the end.`, view(h.length, null, [idx, h.length]), { idx, height });
      best = Math.max(best, height * (h.length - idx));
      r.step('restArea', `Area = ${height} × (${h.length} − ${idx}) = ${height * (h.length - idx)}. best = ${best}.`, view(h.length, null, [idx, h.length]), { best });
    }
    r.step('done', `The largest rectangle has area ${best}.`, view(h.length), { best });
    return { frames: r.frames, result: best };
  },
  reference({ heights: h }) {
    let best = 0;
    for (let i = 0; i < h.length; i++) for (let j = i; j < h.length; j++) best = Math.max(best, Math.min(...h.slice(i, j + 1)) * (j - i + 1));
    return best;
  },
});

export default problem({
  summary: 'A histogram is made of adjacent bars, each one unit wide, with the given heights. Find the area of the largest rectangle that fits entirely inside the bars.',
  example: ['heights = [2, 1, 3, 4, 1]', '6', 'The bars 3 and 4 give a rectangle of height 3 and width 2: area 6. Using the height-1 bars gives width 5 but only area 5.'],
  pattern: ['monotonic-stack', ['monotonic-stack', 'two-pointers', 'divide-conquer', 'dp-1d'], 'For every bar you want the nearest shorter bar on each side. A stack of increasing heights finds those boundaries in one pass.', {
    'two-pointers': 'Two pointers shrinking inward do not work here: the best rectangle can be anywhere and is limited by its shortest bar.',
    'divide-conquer': 'Splitting at the minimum bar works in O(n log n) average but degrades to O(n²) on sorted input. The stack is O(n).',
    'dp-1d': 'Precomputing nearest smaller bars with arrays is a valid approach, which the stack does in one pass.',
  }],
  hints: [
    'The tallest rectangle that uses bar i as its limiting height stretches left and right until it meets a shorter bar. How would you find those two edges quickly for every bar?',
    'Keep a stack of bars in increasing height. When a shorter bar arrives, what do you know about the bars it pops?',
    'When you pop a bar, the current index is its right edge and the new top of the stack (or where the bar started) is its left edge: area = height × width.',
  ],
  insight: 'A stack of rising bars: a shorter bar ends every taller bar’s rectangle; the popped bar’s width runs from where it began to the current index.',
  brute: 'Try every pair of left/right edges and use the minimum height: O(n²).',
  optimal: 'One pass with a monotonic stack of (start index, height): O(n) time and space.',
  walk: ['For each bar i, set start = i. While the stack top is taller than bar i, pop it as (idx, height).', 'Its rectangle spans idx to i − 1, so area = height × (i − idx). Update best, and set start = idx (bar i can extend left to there).', 'Push (start, h[i]).', 'After the loop, every bar left on the stack extends to the end: area = height × (n − idx).'],
  edge: ['A single bar.', 'All bars equal: one stack entry, width n.', 'Increasing bars: nothing pops until the end.', 'A zero-height bar splits the histogram.'],
  works: ['For a popped bar, the bar below it on the stack is shorter, and the current bar is shorter: those are the nearest shorter bars on both sides, so the width is exactly the maximal one for that height.', 'Every bar is pushed once and popped once, so the pass is linear.'],
  time: ['O(n)', 'Each bar is pushed and popped once.'],
  space: ['O(n)', 'The stack can hold every bar.'],
  solution,
  cases,
  sig: 'def largest_rectangle_area(heights):\n    # area of the largest rectangle inside the histogram\n    pass\n',
  viz,
  fromArgs: ([heights]) => ({ heights }),
});
