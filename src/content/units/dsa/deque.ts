import { Recorder } from '@/engine/recorder';
import type { ListItem, Panel, Scalar, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';

const code = `
class Deque:
    def __init__(self, cap):
        self.buf = [None] * cap                    #@init
        self.cap = cap
        self.front = 0
        self.size = 0

    def push_front(self, x):
        if self.size == self.cap:                  #@fullF
            return False
        self.front = (self.front - 1) % self.cap   #@pfIdx
        self.buf[self.front] = x                   #@pfWrite
        self.size += 1
        return True

    def push_back(self, x):
        if self.size == self.cap:                  #@fullB
            return False
        self.buf[(self.front + self.size) % self.cap] = x   #@pbWrite
        self.size += 1
        return True

    def pop_front(self):
        if self.size == 0:                         #@emptyF
            return None
        x = self.buf[self.front]                   #@pfRead
        self.front = (self.front + 1) % self.cap   #@pfMove
        self.size -= 1
        return x

    def pop_back(self):
        if self.size == 0:                         #@emptyB
            return None
        x = self.buf[(self.front + self.size - 1) % self.cap]   #@pbRead
        self.size -= 1
        return x
`;

interface In {
  cap: number;
  ops: string[];
}

type Op = { kind: 'pf' | 'pb'; x: number } | { kind: 'popf' | 'popb' };

function parseOps(ops: string[]): Op[] {
  return ops.map((raw) => {
    const t = raw.trim().toLowerCase().split(/\s+/);
    if ((t[0] === 'pf' || t[0] === 'pb') && t.length === 2 && Number.isInteger(Number(t[1]))) return { kind: t[0], x: Number(t[1]) };
    if ((t[0] === 'popf' || t[0] === 'popb') && t.length === 1) return { kind: t[0] };
    throw new Error(`Unknown operation "${raw}": use pf N (push front), pb N (push back), popf or popb`);
  });
}

const EMPTY = '·';

const viz: VizDef<In> = {
  id: 'deque',
  title: 'Deque as a ring buffer',
  code,
  language: 'python',
  inputs: [
    { key: 'cap', label: 'Capacity', kind: 'number', default: 4 },
    { key: 'ops', label: 'Operations: pf N, pb N, popf, popb', kind: 'strings', default: ['pb 1', 'pb 2', 'pf 9', 'pf 8', 'pb 5', 'popb', 'pb 5', 'popf', 'pf 3', 'popb'], maxItems: 12 },
  ],
  presets: [
    { label: 'Capacity 1', input: { cap: 1, ops: ['pb 1', 'pf 2', 'popf', 'pf 3', 'popb'] } },
    { label: 'Pops on empty', input: { cap: 3, ops: ['popf', 'popb', 'pb 4', 'popf'] } },
    { label: 'Wrap the other way', input: { cap: 3, ops: ['pf 1', 'pf 2', 'pf 3', 'pf 4', 'popb', 'popb', 'pb 7'] } },
  ],
  run({ cap, ops }) {
    if (!Number.isInteger(cap) || cap < 1 || cap > 8) throw new Error('Capacity must be a whole number from 1 to 8');
    const parsed = parseOps(ops);
    const r = new Recorder(code);
    const buf: (number | null)[] = Array(cap).fill(null);
    let front = 0;
    let size = 0;
    const results: Scalar[] = [];
    const mod = (a: number) => ((a % cap) + cap) % cap;

    const panels = (tones: Record<number, Tone> = {}, extra: Record<string, number> = {}): Panel[] => {
      const t: Record<number, Tone> = {};
      for (let i = 0; i < cap; i++) t[i] = 'muted';
      for (let k = 0; k < size; k++) t[mod(front + k)] = 'frontier';
      Object.assign(t, tones);
      const pointers: Record<string, number> = { front, ...extra };
      if (size > 0) pointers.back = mod(front + size - 1);
      const items: ListItem[] = Array.from({ length: size }, (_, k) => {
        const i = mod(front + k);
        return { id: `${i}`, label: String(buf[i]), tone: tones[i] === 'new' ? 'new' : 'frontier' };
      });
      return [
        { type: 'array', title: `Ring buffer (capacity ${cap}): grey slots are free, stale values stay`, values: buf.map((v) => (v === null ? EMPTY : v)), tones: t, pointers },
        { type: 'list', title: 'The deque you see', items, orientation: 'horizontal', startLabel: 'front', endLabel: 'back', emptyText: 'empty' },
        { type: 'array', title: 'Operation results', values: results.map((v) => (v === null ? 'None' : typeof v === 'boolean' ? (v ? 'True' : 'False') : v)), hideIndex: true },
      ];
    };
    const vars = () => ({ front, size });

    r.step('init', `An array of ${cap} slots with front = 0 and size = 0; indices wrap with % cap`, panels(), vars());
    for (const op of parsed) {
      r.op();
      if (op.kind === 'pf') {
        if (size === cap) {
          r.step('fullF', `push_front(${op.x}): size ${size} == cap ${cap}, no room: return False`, panels(), vars());
          results.push(false);
          continue;
        }
        r.step('fullF', `push_front(${op.x}): size ${size} < cap ${cap}, there is room`, panels(), vars());
        const old = front;
        front = mod(front - 1);
        r.step('pfIdx', `front = (${old} - 1) % ${cap} = ${front}${old === 0 ? ': wraps around to the last slot' : ''}`, panels({ [front]: 'active' }), vars());
        buf[front] = op.x;
        size++;
        results.push(true);
        r.step('pfWrite', `Write ${op.x} into slot ${front}; size = ${size}`, panels({ [front]: 'new' }), vars());
      } else if (op.kind === 'pb') {
        if (size === cap) {
          r.step('fullB', `push_back(${op.x}): size ${size} == cap ${cap}, no room: return False`, panels(), vars());
          results.push(false);
          continue;
        }
        const idx = mod(front + size);
        buf[idx] = op.x;
        size++;
        results.push(true);
        r.step('pbWrite', `Free slot is (front + size) % cap = (${front} + ${size - 1}) % ${cap} = ${idx}: write ${op.x}`, panels({ [idx]: 'new' }), vars());
      } else if (op.kind === 'popf') {
        if (size === 0) {
          r.step('emptyF', 'pop_front(): size is 0, nothing to pop: return None', panels(), vars());
          results.push(null);
          continue;
        }
        r.step('emptyF', `pop_front(): ${size} item(s) stored`, panels(), vars());
        const x = buf[front] as number;
        r.step('pfRead', `Read buf[front] = ${x}`, panels({ [front]: 'found' }), vars());
        const old = front;
        front = mod(front + 1);
        size--;
        results.push(x);
        r.step('pfMove', `front = (${old} + 1) % ${cap} = ${front}; slot ${old} is free again (value left behind)`, panels({ [old]: 'muted' }), vars());
      } else {
        if (size === 0) {
          r.step('emptyB', 'pop_back(): size is 0, nothing to pop: return None', panels(), vars());
          results.push(null);
          continue;
        }
        r.step('emptyB', `pop_back(): ${size} item(s) stored`, panels(), vars());
        const idx = mod(front + size - 1);
        const x = buf[idx] as number;
        size--;
        results.push(x);
        r.step('pbRead', `Last item is at (front + size - 1) % cap = ${idx}: ${x}. size shrinks to ${size}`, panels({ [idx]: 'found' }), vars());
      }
    }
    return { frames: r.frames, result: results };
  },
  reference({ cap, ops }) {
    const d: number[] = [];
    const out: Scalar[] = [];
    for (const raw of ops) {
      const t = raw.trim().toLowerCase().split(/\s+/);
      if (t[0] === 'pf' || t[0] === 'pb') {
        if (d.length === cap) out.push(false);
        else {
          if (t[0] === 'pf') d.unshift(Number(t[1]));
          else d.push(Number(t[1]));
          out.push(true);
        }
      } else if (!d.length) out.push(null);
      else out.push(t[0] === 'popf' ? (d.shift() as number) : (d.pop() as number));
    }
    return out;
  },
};

const dequeTests = [
  { args: [['MyDeque', 'push_back', 'push_back', 'push_front', 'push_front', 'pop_back', 'pop_front', 'pop_front', 'pop_front'], [[3], [1], [2], [3], [4], [], [], [], []]], expected: [null, true, true, true, false, 2, 3, 1, null], name: 'both ends, full and empty' },
  { args: [['MyDeque', 'push_front', 'push_front', 'push_back', 'pop_back', 'push_back', 'pop_front', 'pop_front'], [[2], [1], [2], [3], [], [5], [], []]], expected: [null, true, true, false, 1, true, 2, 5], name: 'wrap around' },
  { args: [['MyDeque', 'pop_front', 'pop_back', 'push_back', 'pop_front', 'pop_back'], [[1], [], [], [7], [], []]], expected: [null, null, null, true, 7, null], name: 'capacity 1 and empty pops' },
  { args: [['MyDeque', 'push_back', 'push_back', 'push_back', 'pop_front', 'push_back', 'push_back', 'push_back', 'pop_front', 'pop_back'], [[4], [1], [2], [3], [], [4], [5], [6], [], []]], expected: [null, true, true, true, 1, true, true, false, 2, 5], name: 'queue-like use' },
];

const dequeClass = (popBackIndex: string) => `class MyDeque:
    def __init__(self, cap):
        self.buf = [None] * cap
        self.cap = cap
        self.front = 0
        self.size = 0

    def push_front(self, x):
        if self.size == self.cap:
            return False
        self.front = (self.front - 1) % self.cap
        self.buf[self.front] = x
        self.size += 1
        return True

    def push_back(self, x):
        if self.size == self.cap:
            return False
        self.buf[(self.front + self.size) % self.cap] = x
        self.size += 1
        return True

    def pop_front(self):
        if self.size == 0:
            return None
        x = self.buf[self.front]
        self.front = (self.front + 1) % self.cap
        self.size -= 1
        return x

    def pop_back(self):
        if self.size == 0:
            return None
        x = self.buf[${popBackIndex}]
        self.size -= 1
        return x`;

const unit: Unit = {
  id: 'deque',
  hook: 'A deque gives O(1) pushes and pops at BOTH ends, which powers sliding-window tricks, palindromes and BFS variants. Building it on a ring buffer tests whether you can do wrap-around index arithmetic without off-by-one errors.',
  predict: {
    prompt: 'A ring buffer has capacity 4, front = 0 and 2 items stored. push_front(9) is called. Which slot receives the 9?',
    options: ['Slot 0, overwriting the front item', 'Slot -1, which does not exist', 'Slot 3, because (0 - 1) % 4 wraps around', 'Slot 2, the first free slot'],
    answer: 2,
    explain: 'Pushing at the front moves `front` one step LEFT, and the modulo wraps -1 to cap - 1 = 3. The items now occupy slots 3, 0 and 1: contiguous when read circularly.',
  },
  viz,
  deeper: {
    points: [
      'A deque keeps `front` and `size`. The back slot is derived: `(front + size - 1) % cap`, and the next free back slot is `(front + size) % cap`.',
      'Push front moves front LEFT first, then writes. Push back writes at the free slot, then grows size.',
      'Pops only move `front` or shrink `size`; they do not clear the slot, so stale values can remain (harmless, size says what is valid).',
      'In real code use `collections.deque` (`append`, `appendleft`, `pop`, `popleft`): never `list.pop(0)`, which is O(n).',
      'Typical uses: palindromes (compare both ends), sliding-window maximum, 0-1 BFS, work stealing.',
    ],
    complexity: { time: 'O(1) per operation', space: 'O(capacity)' },
    pitfalls: ['Negative indices: always wrap with `% cap` (in other languages `-1 % 4` may be negative)', 'Reading the back at `(front + size) % cap` instead of `... - 1`', 'Forgetting the full / empty checks before writing or reading'],
  },
  practice: {
    language: 'python',
    fnName: 'MyDeque',
    statement: 'Implement a fixed-capacity deque on a ring buffer. push_front/push_back return False when full, True otherwise. pop_front/pop_back return the removed value, or None when empty.',
    signature: 'class MyDeque:',
    solution: `class MyDeque:
    def __init__(self, cap):
        self.buf = [None] * cap
        self.cap = cap
        self.front = 0
        self.size = 0

    def push_front(self, x):
        if self.size == self.cap:
            return False
        self.front = @@(self.front - 1) % self.cap@@
        self.buf[self.front] = x
        self.size += 1
        return True

    def push_back(self, x):
        if self.size == self.cap:
            return False
        self.buf[@@(self.front + self.size) % self.cap@@] = x
        self.size += 1
        return True

    def pop_front(self):
        if self.size == 0:
            return None
        x = self.buf[self.front]
        self.front = @@(self.front + 1) % self.cap@@
        self.size -= 1
        return x

    def pop_back(self):
        if self.size == 0:
            return None
        x = self.buf[@@(self.front + self.size - 1) % self.cap@@]
        self.size -= 1
        return x`,
    tests: dequeTests,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
  },
  debug: {
    language: 'python',
    fnName: 'MyDeque',
    statement: '`pop_back` returns stale or missing values. Fix the index it reads.',
    buggy: dequeClass('(self.front + self.size) % self.cap'),
    fixed: dequeClass('(self.front + self.size - 1) % self.cap'),
    tests: dequeTests,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    bugType: 'off-by-one',
    hint: 'With front = 0 and size = 2, which slots hold items? Which slot does `(front + size) % cap` point at?',
    explanation: '`(front + size) % cap` is the next FREE slot (where push_back writes). The last stored item sits one slot before it, at `(front + size - 1) % cap`.',
  },
  boss: {
    title: 'Reveal cards in increasing order',
    statement: 'A deck of distinct cards is dealt like this: reveal the top card and remove it, then (if cards remain) move the next top card to the bottom; repeat until the deck is empty. Return an ordering of the deck (top card first) for which the cards are revealed in increasing order.',
    language: 'python',
    fnName: 'reveal_order',
    starter: `def reveal_order(deck):
    # your code here
    pass
`,
    solution: `from collections import deque

def reveal_order(deck):
    n = len(deck)
    idx = deque(range(n))
    res = [0] * n
    for card in sorted(deck):
        i = idx.popleft()
        res[i] = card
        if idx:
            idx.append(idx.popleft())
    return res`,
    tests: [
      { args: [[17, 13, 11, 2, 3, 5, 7]], expected: [2, 13, 3, 11, 5, 17, 7] },
      { args: [[1, 1000]], expected: [1, 1000], name: 'two cards' },
      { args: [[5]], expected: [5], name: 'one card' },
      { args: [[3, 1, 2]], expected: [1, 3, 2] },
      { args: [[4, 3, 2, 1]], expected: [1, 3, 2, 4], name: 'even size' },
    ],
    hints: ['Simulate the dealing on POSITIONS 0..n-1 instead of on cards: a deque of indices tells you which position is revealed first, second, and so on.', 'Sort the cards. For each card in ascending order, popleft an index and put the card there; then, if indices remain, move the next index from the front to the back.'],
    combines: ['deque', 'queue-basics'],
  },
};

export default unit;
