import { Recorder } from '@/engine/recorder';
import type { ListItem, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';

const code = `
class MyQueue:
    def __init__(self):
        self.inbox = []                    #@init
        self.outbox = []

    def push(self, x):
        self.inbox.append(x)               #@push

    def _move(self):
        if not self.outbox:                #@checkOut
            while self.inbox:
                self.outbox.append(self.inbox.pop())   #@transfer

    def pop(self):
        self._move()
        return self.outbox.pop()           #@popOut

    def peek(self):
        self._move()
        return self.outbox[-1]             #@peekOut
`;

interface In {
  ops: string[];
}

interface Parsed {
  kind: 'push' | 'pop' | 'peek';
  x?: number;
}

function parseOps(ops: string[]): Parsed[] {
  let size = 0;
  return ops.map((raw) => {
    const t = raw.trim().toLowerCase().split(/\s+/);
    if (t[0] === 'push') {
      const x = Number(t[1]);
      if (t.length !== 2 || !Number.isFinite(x)) throw new Error(`"${raw}": write push followed by a number, e.g. push 5`);
      size++;
      return { kind: 'push', x };
    }
    if (t[0] === 'pop' || t[0] === 'peek') {
      if (size === 0) throw new Error(`"${raw}" on an empty queue: push something first`);
      if (t[0] === 'pop') size--;
      return { kind: t[0], x: undefined } as Parsed;
    }
    throw new Error(`Unknown operation "${raw}": use push N, pop or peek`);
  });
}

const viz: VizDef<In> = {
  id: 'queue-basics',
  title: 'Queue from two stacks',
  code,
  language: 'python',
  inputs: [{ key: 'ops', label: 'Operations (comma separated)', kind: 'strings', default: ['push 1', 'push 2', 'push 3', 'pop', 'push 4', 'pop', 'pop', 'pop'], maxItems: 12 }],
  presets: [
    { label: 'Peek twice', input: { ops: ['push 5', 'push 6', 'peek', 'peek', 'pop', 'peek'] } },
    { label: 'Alternating', input: { ops: ['push 1', 'pop', 'push 2', 'pop', 'push 3', 'pop'] } },
    { label: 'Fill then drain', input: { ops: ['push 7', 'push 8', 'push 9', 'pop', 'pop', 'pop'] } },
  ],
  run({ ops }) {
    const parsed = parseOps(ops);
    const r = new Recorder(code);
    let nextId = 0;
    const inbox: { id: string; v: number }[] = [];
    const outbox: { id: string; v: number }[] = [];
    const answers: number[] = [];

    const panels = (tones: Record<string, Tone> = {}): Panel[] => {
      const item = (e: { id: string; v: number }, base: Tone): ListItem => ({ id: e.id, label: String(e.v), tone: tones[e.id] ?? base });
      const logical: ListItem[] = [...[...outbox].reverse().map((e) => item(e, 'done')), ...inbox.map((e) => item(e, 'frontier'))];
      return [
        { type: 'list', title: 'Inbox stack (push here)', items: inbox.map((e) => item(e, 'frontier')), orientation: 'vertical', endLabel: 'top', emptyText: 'empty' },
        { type: 'list', title: 'Outbox stack (pop from here)', items: outbox.map((e) => item(e, 'done')), orientation: 'vertical', endLabel: 'top', emptyText: 'empty' },
        { type: 'list', title: 'The queue you see (front to back)', items: logical, orientation: 'horizontal', startLabel: 'front', endLabel: 'back', emptyText: 'empty' },
        { type: 'array', title: 'Results of pop / peek', values: answers, hideIndex: true },
      ];
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ inbox: `[${inbox.map((e) => e.v).join(' ')}]`, outbox: `[${outbox.map((e) => e.v).join(' ')}]`, ...extra });

    r.step('init', 'Two empty stacks: the inbox takes new items, the outbox serves the front', panels(), vars());
    for (const op of parsed) {
      if (op.kind === 'push') {
        const e = { id: `e${nextId++}`, v: op.x as number };
        inbox.push(e);
        r.op();
        r.step('push', `push(${op.x}): append to the inbox, O(1)`, panels({ [e.id]: 'new' }), vars());
        continue;
      }
      r.op();
      if (outbox.length) {
        r.step('checkOut', `${op.kind}(): the outbox already holds the front item, no transfer needed`, panels({ [outbox[outbox.length - 1].id]: 'active' }), vars());
      } else {
        r.step('checkOut', `${op.kind}(): the outbox is empty, so refill it from the inbox`, panels(), vars());
        while (inbox.length) {
          const e = inbox.pop() as { id: string; v: number };
          outbox.push(e);
          r.op();
          r.step('transfer', `Move ${e.v} from the inbox top to the outbox top`, panels({ [e.id]: 'swap' }), vars());
        }
      }
      const front = outbox[outbox.length - 1];
      if (op.kind === 'pop') {
        outbox.pop();
        answers.push(front.v);
        r.op();
        r.step('popOut', `pop() returns ${front.v}, the oldest item`, panels(), vars());
      } else {
        answers.push(front.v);
        r.step('peekOut', `peek() returns ${front.v} and leaves it in place`, panels({ [front.id]: 'active' }), vars());
      }
    }
    return { frames: r.frames, result: answers };
  },
  reference({ ops }) {
    const q: number[] = [];
    const out: number[] = [];
    for (const raw of ops) {
      const t = raw.trim().toLowerCase().split(/\s+/);
      if (t[0] === 'push') q.push(Number(t[1]));
      else if (t[0] === 'pop') out.push(q.shift() as number);
      else out.push(q[0]);
    }
    return out;
  },
};

const queueTests = [
  { args: [['MyQueue', 'push', 'push', 'peek', 'pop', 'empty'], [[], [1], [2], [], [], []]], expected: [null, null, null, 1, 1, false], name: 'peek then pop' },
  { args: [['MyQueue', 'push', 'push', 'push', 'pop', 'pop', 'push', 'pop', 'pop'], [[], [1], [2], [3], [], [], [4], [], []]], expected: [null, null, null, null, 1, 2, null, 3, 4], name: 'FIFO order across refills' },
  { args: [['MyQueue', 'empty'], [[], []]], expected: [null, true], name: 'new queue is empty' },
  { args: [['MyQueue', 'push', 'pop', 'empty', 'push', 'peek'], [[], [1], [], [], [2], []]], expected: [null, null, 1, true, null, 2], name: 'drain then reuse' },
  { args: [['MyQueue', 'push', 'peek', 'peek', 'pop', 'empty'], [[], [5], [], [], [], []]], expected: [null, null, 5, 5, 5, true], name: 'peek does not remove' },
];

const queueClass = (moveBody: string) => `class MyQueue:
    def __init__(self):
        self.inbox = []
        self.outbox = []

    def push(self, x):
        self.inbox.append(x)

    def _move(self):
${moveBody}

    def pop(self):
        self._move()
        return self.outbox.pop()

    def peek(self):
        self._move()
        return self.outbox[-1]

    def empty(self):
        return not self.inbox and not self.outbox`;

const unit: Unit = {
  id: 'queue-basics',
  hook: 'A queue is first-in, first-out: the model for task queues, BFS and schedulers. "Build a queue from two stacks" is a classic because it forces you to explain why the amortised cost is O(1).',
  predict: {
    prompt: 'You push 1, 2, 3 onto the inbox stack, then move them one by one onto the outbox stack. Which value is on top of the outbox?',
    options: ['3, the most recently pushed', '2, the middle one', '1, the oldest', 'It depends on the stack size'],
    answer: 2,
    explain: 'Moving items between two stacks reverses their order: 3 goes first and ends at the bottom, 1 goes last and ends on top. The oldest item is now on top, which is exactly the front of a FIFO queue.',
  },
  viz,
  deeper: {
    points: [
      'Inbox stack: every push goes here. Outbox stack: every pop/peek reads here.',
      'Only when the outbox is EMPTY do we pour the whole inbox into it. Pouring reverses order, so the oldest item ends up on top.',
      'Never pour while the outbox still has items: new items would jump ahead of older ones.',
      'Amortised O(1): each element is pushed once, moved once and popped once, so m operations cost O(m) in total even though one pop can cost O(n).',
      'Peek works like pop but leaves the item in place.',
    ],
    complexity: { time: 'O(1) amortised per operation (O(n) worst case for a single pop)', space: 'O(n)' },
    pitfalls: ['Transferring on every pop (breaks FIFO order)', 'Checking `empty()` against only one stack', 'Reading `outbox[0]` instead of `outbox[-1]` (the top)'],
  },
  practice: {
    language: 'python',
    fnName: 'MyQueue',
    statement: 'Implement a FIFO queue using only two Python lists used as stacks (append / pop from the end). Support push(x), pop(), peek() and empty().',
    signature: 'class MyQueue:',
    solution: `class MyQueue:
    def __init__(self):
        self.inbox = []
        self.outbox = []

    def push(self, x):
        self.inbox.append(x)

    def _move(self):
        if @@not self.outbox@@:
            while self.inbox:
                self.outbox.append(@@self.inbox.pop()@@)

    def pop(self):
        self._move()
        return @@self.outbox.pop()@@

    def peek(self):
        self._move()
        return @@self.outbox[-1]@@

    def empty(self):
        return @@not self.inbox and not self.outbox@@`,
    tests: queueTests,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
  },
  debug: {
    language: 'python',
    fnName: 'MyQueue',
    statement: 'Items come out in the wrong order after a pop followed by more pushes. Fix `_move`.',
    buggy: queueClass(`        while self.inbox:
            self.outbox.append(self.inbox.pop())`),
    fixed: queueClass(`        if not self.outbox:
            while self.inbox:
                self.outbox.append(self.inbox.pop())`),
    tests: queueTests,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    bugType: 'transfer at the wrong time',
    hint: 'Trace push 1, 2, 3, pop, pop, push 4, pop. What sits on the outbox when 4 is poured in?',
    explanation: 'If the outbox still holds older items (here 3), pouring new inbox items on top puts 4 above 3, so 4 is served first. Only refill the outbox when it is empty.',
  },
  boss: {
    title: 'Stack from a single queue',
    statement: 'Implement a LIFO stack using one queue (collections.deque with append / popleft only). Support push(x), pop(), top() and empty().',
    language: 'python',
    fnName: 'MyStack',
    starter: `class MyStack:
    # your code here
    pass
`,
    solution: `from collections import deque

class MyStack:
    def __init__(self):
        self.q = deque()

    def push(self, x):
        self.q.append(x)
        for _ in range(len(self.q) - 1):
            self.q.append(self.q.popleft())

    def pop(self):
        return self.q.popleft()

    def top(self):
        return self.q[0]

    def empty(self):
        return not self.q`,
    tests: [
      { args: [['MyStack', 'push', 'push', 'top', 'pop', 'empty'], [[], [1], [2], [], [], []]], expected: [null, null, null, 2, 2, false] },
      { args: [['MyStack', 'push', 'push', 'push', 'pop', 'pop', 'pop', 'empty'], [[], [1], [2], [3], [], [], [], []]], expected: [null, null, null, null, 3, 2, 1, true], name: 'reverse order' },
      { args: [['MyStack', 'push', 'pop', 'push', 'push', 'top'], [[], [1], [], [2], [3], []]], expected: [null, null, 1, null, null, 3], name: 'interleaved' },
      { args: [['MyStack', 'empty'], [[], []]], expected: [null, true], name: 'new stack is empty' },
    ],
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    hints: ['A queue serves its oldest item first. To make the newest item come out first, it must be at the FRONT of the queue after each push.', 'After appending x, rotate the queue: move the front item to the back len(q) - 1 times. Then x is at the front and pop/top are just popleft/q[0].'],
    combines: ['queue-basics', 'stack-basics'],
  },
};

export default unit;
