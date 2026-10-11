import type { Tone } from '@/engine/types';
import { arrayView, stackView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './daily-temperatures.py?raw';
import cases from './daily-temperatures.cases.json';

const viz = vizOf<{ temps: number[] }>({
  id: 'daily-temperatures',
  title: 'Daily Temperatures',
  solution,
  inputs: [{ key: 'temps', label: 'daily temperatures', kind: 'numbers', default: [31, 28, 33, 35, 30, 29, 36, 31], maxItems: 14 }],
  presets: [
    { label: 'Mixed', input: { temps: [31, 28, 33, 35, 30, 29, 36, 31] } },
    { label: 'Never warmer', input: { temps: [50, 40, 30, 20] } },
    { label: 'Rising', input: { temps: [10, 20, 30, 40] } },
    { label: 'Equal', input: { temps: [20, 20, 20] } },
  ],
  run({ temps }) {
    const r = new TraceRecorder(solution);
    const res = temps.map(() => 0);
    const stack: number[] = [];
    const view = (i: number, hot: Tone | null = null, stackTones: Record<number, Tone> = {}) => {
      const tones: Record<number, Tone> = {};
      stack.forEach((d) => (tones[d] = 'frontier'));
      if (hot && i < temps.length) tones[i] = hot;
      return [
        arrayView(temps, { title: 'temperatures', tones, pointers: i < temps.length ? { today: i } : undefined }),
        stackView(stack.map((d) => temps[d]), { title: 'days still waiting for a warmer day', subs: stack.map((d) => `day ${d}`), tones: stackTones }),
        arrayView(res, { title: 'days to wait (answer so far)', tones: Object.fromEntries(res.map((v, k) => [k, v > 0 ? 'done' : 'default'])) as Record<number, Tone> }),
      ];
    };
    r.step('init', 'res[i] will hold how many days day i waits for a warmer one. 0 means never.', view(temps.length), {});
    r.step('stack', 'The stack holds days that have not found a warmer day yet. Their temperatures only ever decrease from bottom to top.', view(temps.length), {});
    for (let i = 0; i < temps.length; i++) {
      const t = temps[i];
      r.op();
      let pops = 0;
      for (let q = stack.length - 1; q >= 0 && temps[stack[q]] < t; q--) pops++;
      r.step('loop', `Day ${i} is ${t}°.`, view(i, 'active'), { i, t });
      r.predictChoice('pops', `Day ${i} is ${t}. How many waiting days does it answer (are colder than ${t})?`, String(pops), [String(pops + 1), String(Math.max(0, pops - 1) === pops ? pops + 2 : Math.max(0, pops - 1)), String(stack.length + 1)], i, 'Every waiting day colder than today finds its warmer day right now, and they are removed from the stack.');
      while (stack.length && temps[stack[stack.length - 1]] < t) {
        const j = stack.pop()!;
        r.step('pop', `Day ${j} (${temps[j]}°) is colder than ${t}°: it has found its warmer day.`, view(i, 'active', {}), { j });
        r.predictChoice('wait', `Day ${j} found a warmer day on day ${i}. How many days did it wait?`, String(i - j), [String(i - j + 1), String(i), String(Math.max(1, i - j - 1) === i - j ? i - j + 2 : Math.max(1, i - j - 1))], j, 'The wait is the difference of the day numbers, i − j.');
        res[j] = i - j;
        r.step('set', `res[${j}] = ${i} − ${j} = ${i - j}.`, view(i, 'active'), { j, wait: i - j });
      }
      stack.push(i);
      r.step('push', `Push day ${i}: it is still waiting for a warmer day.`, view(i + 1, null, { [stack.length - 1]: 'new' }), { stack: stack.join(',') });
    }
    r.step('done', `Done: ${JSON.stringify(res)}. Days left on the stack never get a warmer day, so they stay 0.`, view(temps.length), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ temps }) {
    return temps.map((t, i) => {
      for (let j = i + 1; j < temps.length; j++) if (temps[j] > t) return j - i;
      return 0;
    });
  },
});

export default problem({
  summary: 'For each day you are given the temperature. For every day, say how many days you must wait until a warmer day arrives. If no warmer day ever comes, the answer for that day is 0.',
  example: ['temps = [20, 18, 25, 22, 30]', '[2, 1, 2, 1, 0]', 'After 20° you wait 2 days for 25°; after 18° just 1 day; and so on. 30° is never beaten.'],
  pattern: ['monotonic-stack', ['monotonic-stack', 'sliding-window', 'binary-search', 'two-pointers'], 'You want the next greater element for every position. A stack of days still waiting, kept in decreasing temperature order, resolves each day the moment a warmer one shows up.', {
    'sliding-window': 'There is no fixed or growing window over the days.',
    'binary-search': 'Temperatures are not sorted.',
    'two-pointers': 'Looking ahead from each day separately would be O(n²); the stack shares the work.',
  }],
  hints: [
    'Scanning forward from every day is O(n²). When a warm day arrives, which earlier days does it settle?',
    'It settles every earlier day that is still waiting and is colder than it. Where would you keep the waiting days so the newest are easiest to reach?',
    'Keep a stack of waiting day indices. For each new day, pop while the top is colder, writing the gap into the answer, then push today.',
  ],
  insight: 'A monotonic stack holds days that are still waiting; a warmer day pops every colder one and gives them their answer.',
  brute: 'For each day scan ahead for a warmer one: O(n²).',
  optimal: 'One pass with a monotonic stack of indices: O(n) time and space.',
  walk: ['Create res of zeros and an empty stack of day indices.', 'For day i, while the day on top of the stack is colder than today, pop it as j and set res[j] = i − j.', 'Push i. The stack stays in decreasing temperature order.', 'Days still on the stack at the end never found a warmer day, so they keep 0.'],
  edge: ['Empty list.', 'Equal temperatures are not warmer (use strict <).', 'Strictly decreasing temperatures: all zeros.', 'A very warm day after many colder ones pops them all.'],
  works: ['The stack always contains days whose answer is still unknown, in decreasing temperature order from bottom to top. A new warmer day is the first warmer day for every colder day it pops.', 'Each day is pushed and popped at most once, so the work is linear.'],
  time: ['O(n)', 'Each index is pushed once and popped at most once.'],
  space: ['O(n)', 'The stack can hold every day.'],
  solution,
  cases,
  sig: 'def daily_temperatures(temps):\n    # for each day, how many days until a warmer one (0 if never)\n    pass\n',
  viz,
  fromArgs: ([temps]) => ({ temps }),
});
