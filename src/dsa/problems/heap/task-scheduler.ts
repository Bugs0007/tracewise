import type { Tone } from '@/engine/types';
import { chipsView, heapView } from '@/dsa/viz/prims';
import { MinHeap, type Watch } from '@/dsa/viz/heap';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './task-scheduler.py?raw';
import cases from './task-scheduler.cases.json';

type Entry = [number, string];
const byCount = (a: Entry, b: Entry) => a[0] < b[0];

const viz = vizOf<{ tasks: string; n: number }>({
  id: 'task-scheduler',
  title: 'Task Scheduler',
  solution,
  inputs: [
    { key: 'tasks', label: 'tasks (capital letters, no spaces)', kind: 'string', default: 'AAABBC', maxItems: 12 },
    { key: 'n', label: 'cooldown n', kind: 'number', default: 2 },
  ],
  presets: [
    { label: 'Idle time needed', input: { tasks: 'AAABBB', n: 2 } },
    { label: 'Mixed', input: { tasks: 'AAABBC', n: 2 } },
    { label: 'No cooldown', input: { tasks: 'AAABBB', n: 0 } },
    { label: 'One type', input: { tasks: 'AAAA', n: 2 } },
  ],
  validate: ({ tasks, n }) => (!/^[A-Z]+$/.test(tasks) ? 'Use capital letters only, like AAABBC' : !Number.isInteger(n) || n < 0 || n > 6 ? 'The cooldown n must be a whole number from 0 to 6' : null),
  run({ tasks, n }) {
    const r = new TraceRecorder(solution);
    const heap = new MinHeap<Entry>([], byCount);
    const waiting: { left: number; ready: number; letter: string }[] = [];
    const timeline: string[] = [];
    const counts = new Map<string, number>();
    for (const t of tasks) counts.set(t, (counts.get(t) ?? 0) + 1);
    const view = (items: Entry[], at: number[] = []) => [
      ...heapView(items.map((e) => e[0]), { title: 'max-heap of remaining counts (stored negated; root = most remaining)', tones: Object.fromEntries(at.map((i) => [i, 'active' as Tone])) }),
      chipsView(items.map((e) => `${e[1]}×${-e[0]}`), { title: 'ready tasks (letter × remaining)' }),
      chipsView(waiting.map((w) => `${w.letter}×${-w.left} ready at t=${w.ready}`), { title: 'cooling down', startLabel: 'next out' }),
      chipsView(timeline, { title: 'what the CPU did each unit of time', tones: Object.fromEntries(timeline.map((x, i) => [i, (x === 'idle' ? 'compare' : 'done') as Tone])) }),
    ];
    const watch = (anchor: string): Watch<Entry> => (what, snap, at) =>
      r.step(anchor, what === 'append' ? `Place ${snap[at[0]][1]}×${-snap[at[0]][0]} at the end of the array.` : what === 'up' ? `${snap[at[0]][1]}×${-snap[at[0]][0]} swaps upward: it has more tasks remaining than its parent.` : what === 'root' ? 'The last entry moves to the root and sinks down.' : `Sift down from index ${at[0]}.`, view(snap, at), {});
    heap.items = [...counts.entries()].map(([letter, c]) => [-c, letter] as Entry);
    r.step('count', `Count each task type: ${[...counts.entries()].map(([l, c]) => `${l}×${c}`).join(', ')}. Counts are negated so the most frequent is the heap root.`, view(heap.items), {});
    heap.heapify(watch('heapify'));
    r.step('heapify', 'heapify: the task type with the most work left is at the root.', view(heap.items, heap.size ? [0] : []), {});
    r.step('time', `time counts the units used so far (starting at 0). A task type must wait ${n} units after each run.`, view(heap.items), {});
    let time = 0;
    let askedPick = false;
    let askedCool = false;
    let askedIdle = false;
    while (heap.size || waiting.length) {
      r.op();
      time++;
      r.step('tick', `Time unit ${time}.`, view(heap.items), { time });
      if (heap.size) {
        if (!askedPick) {
          askedPick = true;
          r.predict('pick', `Which task type does the CPU run in unit ${time}?`, [`${heap.items[0][1]}: the type with the most runs left`, 'The type with the fewest runs left', 'Any type'], 0, 'Running the most frequent type first keeps the cooldown gaps from being wasted.');
        }
        const [negc, letter] = heap.pop(watch('run'));
        const left = 1 + negc;
        timeline.push(letter);
        r.step('run', `Run ${letter}. It has ${-left} run${-left === 1 ? '' : 's'} left.`, view(heap.items), { letter, left: -left });
        if (left) {
          if (!askedCool) {
            askedCool = true;
            r.predictChoice('cool', `${letter} ran at unit ${time} and the cooldown is ${n}. What is the earliest unit it can run again?`, String(time + n + 1), [String(time + n), String(time + 1), String(time + n + 2)], time, `It must sit out ${n} units: ${time + 1}…${time + n}. So it can run at ${time + n + 1}.`);
          }
          waiting.push({ left, ready: time + n, letter });
          r.step('cool', `${letter} still has work, so it waits in the cooldown queue until the end of unit ${time + n}.`, view(heap.items), {});
        }
      } else {
        if (!askedIdle) {
          askedIdle = true;
          r.predict('idle', 'Nothing is ready, but tasks are still cooling down. What does the CPU do this unit?', ['Stay idle', 'Run a cooling task anyway', 'Skip ahead without using time'], 0, 'The loop still ticks: idle time counts toward the total.');
        }
        timeline.push('idle');
        r.step('has', 'Nothing is ready: the CPU idles for this unit.', view(heap.items), {});
      }
      if (waiting.length && waiting[0].ready === time) {
        const w = waiting.shift() as { left: number; ready: number; letter: string };
        heap.push([w.left, w.letter], watch('back'));
        r.step('back', `${w.letter}'s cooldown ends: it rejoins the heap with ${-w.left} run${-w.left === 1 ? '' : 's'} left.`, view(heap.items), {});
      }
    }
    r.step('done', `Everything is done after ${time} units.`, view(heap.items), { result: time });
    return { frames: r.frames, result: time };
  },
  reference({ tasks, n }) {
    const c = new Map<string, number>();
    for (const t of tasks) c.set(t, (c.get(t) ?? 0) + 1);
    const most = Math.max(0, ...c.values());
    const ties = [...c.values()].filter((v) => v === most).length;
    return tasks.length ? Math.max(tasks.length, (most - 1) * (n + 1) + ties) : 0;
  },
});

export default problem({
  summary: 'A CPU runs one task per time unit (or idles). Tasks are labelled by type, and two tasks of the same type must have at least n units between them. Given the list of tasks and n, find the fewest time units needed to finish everything.',
  example: ['tasks [A, A, A, B], n = 2', '7', 'A B idle A idle idle A: A needs two units of gap each time, and only one B can fill a gap.'],
  pattern: ['heap', ['heap', 'greedy', 'sorting', 'bucket-sort'], 'At every time unit run the available task type with the most work left. A max-heap gives that type instantly, and a queue holds the types that are cooling down.', {
    greedy: 'The strategy is greedy ("always run the most frequent available type"); the heap is how you implement it.',
    sorting: 'Sorting once does not account for types becoming available again later.',
    'bucket-sort': 'A closed-form formula exists, but the simulation is what the heap pattern teaches.',
  }],
  hints: [
    'Which task type is the bottleneck? What goes wrong if you save it for last?',
    'At each moment, among the types not cooling down, which should run?',
    'Simulate time: a max-heap of remaining counts and a queue of (count, time it becomes available). Each unit, run the top of the heap if it exists, and release one cooled task from the queue.',
  ],
  insight: 'Always run the most frequent available type; the others fill the gaps while it cools.',
  brute: 'Try every order of tasks: factorial.',
  optimal: 'Heap plus cooldown queue: O(T log k) for T time units and k task types (a counting formula gives O(T)).',
  walk: ['Count tasks per type, negate the counts and heapify.', 'Keep a queue of (remaining count, time it is ready).', 'Each time unit: increment time; if the heap is not empty pop a type, decrement its count, and queue it if work remains.', 'If the queue’s front becomes ready at this time, push it back onto the heap. Stop when both are empty.'],
  edge: ['n = 0 (no idle time ever).', 'Only one task type.', 'Many types that hide the cooldown completely.', 'Ties for the most frequent type.'],
  works: ['Greedy exchange argument: delaying a more frequent type can never reduce the total time.', 'The queue guarantees a type is not rerun before its cooldown ends.'],
  time: ['O(T log k)', 'T time units, heap of at most k types.'],
  space: ['O(k)', 'The heap and the queue.'],
  solution,
  cases,
  sig: 'def least_interval(tasks, n):\n    # tasks is a list of single capital letters; return the fewest time units needed\n    pass\n',
  viz,
  fromArgs: ([tasks, n]) => ({ tasks: (tasks as string[]).join(''), n }),
});
