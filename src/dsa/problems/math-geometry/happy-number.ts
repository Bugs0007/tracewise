import { chipsView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './happy-number.py?raw';
import cases from './happy-number.cases.json';

const step = (x: number) => [...String(x)].reduce((s, d) => s + Number(d) ** 2, 0);

const viz = vizOf<{ n: number }>({
  id: 'happy-number',
  title: 'Happy Number',
  solution,
  inputs: [{ key: 'n', label: 'a positive whole number (1 to 999)', kind: 'number', default: 19 }],
  presets: [
    { label: '19 (happy)', input: { n: 19 } },
    { label: '2 (cycle)', input: { n: 2 } },
    { label: '7 (happy)', input: { n: 7 } },
    { label: '1', input: { n: 1 } },
  ],
  validate: ({ n }) => (Number.isInteger(n) && n >= 1 && n <= 999 ? null : 'Use a whole number from 1 to 999'),
  run({ n }) {
    const r = new TraceRecorder(solution);
    let slow = n;
    let fast = step(n);
    const path: number[] = [n];
    let askedStep = false;
    let askedEnd = false;
    let askedCycle = false;
    const view = () => [chipsView(path, { title: 'values visited by the slow pointer' }), hashMapView({ slow, fast, 'fast is...': fast === 1 ? 'at 1' : fast === slow ? 'on slow' : 'running ahead' })];
    r.step('step', 'step(x) replaces x by the sum of the squares of its digits. A number is happy if repeating this reaches 1; otherwise it loops forever.', view(), {});
    if (!askedStep) {
      askedStep = true;
      const sq = [...String(n)].map((d) => `${d}²`).join(' + ');
      r.predictChoice('step', `step(${n}) = ${sq}. What is it?`, String(step(n)), [String(step(n) + 1), String(n * 2), String(Math.max(0, step(n) - 2))], n, 'Square each digit and add them up.');
    }
    r.step('init', `slow starts at ${n}; fast starts one step ahead at step(${n}) = ${fast}. They are like two runners on the sequence.`, view(), {});
    while (fast !== 1 && slow !== fast) {
      r.op();
      slow = step(slow);
      path.push(slow);
      r.step('slow', `slow takes one step → ${slow}.`, view(), { slow });
      fast = step(step(fast));
      r.step('fast', `fast takes two steps → ${fast}.`, view(), { fast });
      if (!askedCycle && slow === fast && fast !== 1) {
        askedCycle = true;
        r.predict('cycle', `slow and fast are both ${fast}. What does that tell us?`, ['The sequence loops: it will never reach 1', 'The number is happy', 'We need more steps'], 0, 'Two runners meeting means the sequence has a cycle (and 1 is not on it).');
      }
    }
    const res = fast === 1;
    if (!askedEnd) {
      askedEnd = true;
      r.predict('end', res ? 'fast reached 1. Is the number happy?' : 'slow and fast met somewhere other than 1. Is the number happy?', res ? ['Yes', 'No'] : ['No', 'Yes'], 0, res ? '1 maps to 1, so the sequence stays there: happy.' : 'A cycle that does not contain 1 repeats forever.');
    }
    r.step('done', res ? `Reached 1: ${n} is happy.` : `The sequence loops without reaching 1: ${n} is not happy.`, view(), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ n }) {
    let x = n;
    for (let i = 0; i < 200; i++) {
      if (x === 1) return true;
      x = step(x);
    }
    return false;
  },
});

export default problem({
  summary: 'Replace a number by the sum of the squares of its digits, and repeat. If you eventually reach 1 the number is "happy". Otherwise the sequence falls into a loop that never contains 1. Decide whether a given number is happy.',
  example: ['n = 13', 'true', '13 → 1² + 3² = 10 → 1² + 0² = 1.'],
  pattern: ['fast-slow', ['fast-slow', 'hash-lookup', 'math', 'dp-1d'], 'The sequence either reaches 1 or enters a cycle. Two pointers moving at different speeds (Floyd) detect a cycle without storing the visited numbers.', {
    'hash-lookup': 'A set of visited numbers also works, using O(cycle length) memory.',
    math: 'The digit-squaring step is arithmetic, but cycle detection is the algorithmic idea.',
    'dp-1d': 'There is nothing to tabulate; the sequence is a single path.',
  }],
  hints: [
    'What are the only two things that can happen to the sequence?',
    'How could you notice a repeat without remembering every number?',
    'slow = step(slow), fast = step(step(fast)). Stop if fast == 1 (happy) or slow == fast (cycle without 1).',
  ],
  insight: 'The numbers form a linked-list-like path that ends in 1 or loops; fast and slow pointers detect the loop.',
  brute: 'Keep a set of seen numbers: O(k) time and space where k is the number of steps before a repeat.',
  optimal: 'Floyd cycle detection: O(k) time, O(1) space.',
  walk: ['Define step(x) as the sum of squares of the digits of x.', 'slow = n, fast = step(n).', 'While fast != 1 and slow != fast: slow = step(slow), fast = step(step(fast)).', 'Return fast == 1.'],
  edge: ['n = 1.', 'Numbers that enter the 4 → 16 → 37 → 58 → 89 → 145 → 42 → 20 loop.', 'Large inputs (sums shrink quickly).'],
  works: ['The sequence is eventually periodic. If it reaches 1 the fast pointer gets there first (1 is a fixed point). Otherwise both pointers end up in the cycle and a faster pointer must catch up with the slower one.'],
  time: ['O(log n)', 'The sums shrink fast; the number of steps before a cycle is tiny.'],
  space: ['O(1)', 'Two numbers.'],
  solution,
  cases,
  sig: 'def is_happy(n):\n    # True if repeatedly summing the squares of the digits reaches 1\n    pass\n',
  viz,
  fromArgs: ([n]) => ({ n }),
});
