import type { Tone } from '@/engine/types';
import { chipsView, stackView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './min-stack.py?raw';
import harness from './min-stack.harness.py?raw';
import cases from './min-stack.cases.json';

const OPS = ['push', 'pop', 'top', 'get_min'];
const parse = (line: string): { op: string; arg?: number } => {
  const [op, a] = line.trim().split(/\s+/);
  return { op, arg: a === undefined ? undefined : Number(a) };
};

const viz = vizOf<{ ops: string[] }>({
  id: 'min-stack',
  title: 'Min Stack',
  solution,
  inputs: [{ key: 'ops', label: 'operations (comma separated)', kind: 'strings', default: ['push 5', 'push 2', 'push 8', 'get_min', 'pop', 'get_min', 'top'], maxItems: 16 }],
  presets: [
    { label: 'Min follows pops', input: { ops: ['push 5', 'push 2', 'push 8', 'get_min', 'pop', 'get_min', 'top'] } },
    { label: 'Duplicate minimums', input: { ops: ['push 3', 'push 3', 'get_min', 'pop', 'get_min'] } },
    { label: 'Negatives', input: { ops: ['push -2', 'push 0', 'push -5', 'get_min', 'pop', 'get_min'] } },
  ],
  validate: ({ ops }) => {
    let size = 0;
    for (const line of ops) {
      const { op, arg } = parse(line);
      if (!OPS.includes(op)) return `Unknown operation "${op}". Use push N, pop, top, get_min`;
      if (op === 'push') {
        if (arg === undefined || !Number.isFinite(arg)) return 'push needs a number, like "push 4"';
        size++;
      } else if (op === 'pop') size--;
      if (size < 0 || (size === 0 && (op === 'top' || op === 'get_min'))) return `"${op}" is called on an empty stack`;
    }
    return null;
  },
  run({ ops }) {
    const r = new TraceRecorder(solution);
    const stack: [number, number][] = [];
    const out: (number | null)[] = [null];
    const view = (hot: Tone | null = null) => [
      stackView(stack.map(([v]) => v), { title: 'stack of (value, minimum so far)', subs: stack.map(([, m]) => `min ${m}`), tones: stack.length && hot ? { [stack.length - 1]: hot } : {} }),
      chipsView(out.map((o) => (o === null ? 'None' : o)), { title: 'results of each call', tones: Object.fromEntries(out.map((o, i) => [i, o === null ? 'default' : 'found'])) as Record<number, Tone> }),
    ];
    r.step('init', 'Each stack entry stores the value and the smallest value at or below it. That is what makes get_min O(1).', view(), {});
    let asked = 0;
    for (const line of ops) {
      const { op, arg } = parse(line);
      r.op();
      if (op === 'push') {
        const v = arg as number;
        const low = stack.length ? Math.min(v, stack[stack.length - 1][1]) : v;
        r.step('pushLow', `push(${v}): the minimum for this entry is ${stack.length ? `min(${v}, ${stack[stack.length - 1][1]})` : v} = ${low}.`, view(), { val: v, low });
        if (stack.length >= 1 && asked < 1) {
          asked++;
          r.predictChoice('low', `push(${v}) on a stack whose current minimum is ${stack[stack.length - 1][1]}. What minimum is stored with ${v}?`, String(low), [String(v === low ? low + 1 : v), String(stack[stack.length - 1][1] + 1), String(low - 1)], v, 'The new minimum is the smaller of the new value and the minimum already below it.');
        }
        stack.push([v, low]);
        out.push(null);
        r.step('push', `Push (${v}, ${low}).`, view('new'), { size: stack.length });
      } else if (op === 'pop') {
        stack.pop();
        out.push(null);
        r.step('pop', 'Pop the top entry. The minimum underneath is already stored there, so nothing needs recomputing.', view(), { size: stack.length });
      } else if (op === 'top') {
        out.push(stack[stack.length - 1][0]);
        r.step('top', `top() returns the value ${stack[stack.length - 1][0]}.`, view('active'), { top: stack[stack.length - 1][0] });
      } else {
        const m = stack[stack.length - 1][1];
        r.predictChoice('getMin', `What does get_min() return for this stack?`, String(m), [String(Math.min(...stack.map(([v]) => v)) + 1), String(stack[stack.length - 1][0] === m ? m + 2 : stack[stack.length - 1][0]), String(m - 1)], stack.length, 'Read the minimum stored with the top entry. It is the smallest value in the whole stack.');
        out.push(m);
        r.step('getMin', `get_min() reads the minimum stored on top: ${m}.`, view('found'), { min: m });
      }
    }
    return { frames: r.frames, result: out };
  },
  reference({ ops }) {
    const items: number[] = [];
    const out: (number | null)[] = [null];
    for (const line of ops) {
      const { op, arg } = parse(line);
      if (op === 'push') {
        items.push(arg as number);
        out.push(null);
      } else if (op === 'pop') {
        items.pop();
        out.push(null);
      } else if (op === 'top') out.push(items[items.length - 1]);
      else out.push(Math.min(...items));
    }
    return out;
  },
});

export default problem({
  summary: 'Design a stack that supports push, pop and top like any other, and can also report the smallest value it currently holds. Every operation must run in constant time.',
  example: ['push 4, push 9, push 2, get_min, pop, get_min', 'None, None, None, 2, None, 4', 'After popping the 2, the smallest value left is 4. get_min must not scan the stack.'],
  pattern: ['design', ['design', 'stack', 'heap', 'hash-lookup'], 'A normal stack plus one extra piece of information per entry (the minimum at or below it) answers get_min instantly, so the structure is designed around its operations.', {
    stack: 'It is a stack, but a plain stack cannot answer get_min in O(1). The design twist is what each entry stores.',
    heap: 'A heap finds the minimum in O(1) but removing an arbitrary popped value is O(n) or needs lazy deletion. Storing the running minimum is simpler.',
    'hash-lookup': 'Nothing is looked up by key.',
  }],
  hints: [
    'Scanning for the minimum is O(n). What would let you know the minimum without scanning?',
    'When you push, you can compute the minimum of everything below plus this value. Where could you keep it?',
    'Store a pair (value, minimum so far) in each entry. The minimum of the whole stack is the minimum stored on top.',
  ],
  insight: 'Store, with every pushed value, the smallest value at or below it. The top entry always knows the stack minimum.',
  brute: 'Scan the whole stack on get_min: O(n).',
  optimal: 'Each entry keeps (value, min so far): every operation is O(1), space O(n).',
  walk: ['On push(v), compute low = min(v, minimum of the entry below) (or just v when empty).', 'Append (v, low) to the list.', 'pop and top work on the last entry; get_min returns the minimum stored on the last entry.', 'Because each entry remembers the minimum as of its own moment, popping automatically "restores" the previous minimum.'],
  edge: ['Duplicate minimums: both copies store the same minimum, so popping one keeps the minimum correct.', 'Negative numbers.', 'Pushing a new minimum, then popping it.', 'Only one element.'],
  works: ['Invariant: for every entry, its stored minimum equals the minimum of that entry and everything below it. That is true when pushed and stays true because entries below are never changed.', 'So the top entry stores the minimum of the whole stack at all times.'],
  time: ['O(1)', 'Every operation touches only the last entry.'],
  space: ['O(n)', 'One extra number per element.'],
  solution,
  cases,
  sig: 'class MinStack:\n    def __init__(self):\n        pass\n\n    def push(self, val):\n        pass\n\n    def pop(self):\n        pass\n\n    def top(self):\n        pass\n\n    def get_min(self):\n        pass\n',
  harness,
  viz,
  fromArgs: ([ops, args]) => ({ ops: (ops as string[]).slice(1).map((o, i) => ((args as number[][])[i + 1].length ? `${o} ${(args as number[][])[i + 1][0]}` : o)) }),
});
