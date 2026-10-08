import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap } from '@/content/lib/hashing-bits';

const code = `
TOMB = -1   # marks a deleted slot; None marks a never-used slot

def insert(slots, key):
    cap = len(slots)
    i = key % cap                                  #@home
    for _ in range(cap):                           #@loop
        if slots[i] is None or slots[i] == TOMB:   #@free
            slots[i] = key                         #@place
            return i
        i = (i + 1) % cap                          #@next
    return -1                                      #@full

def search(slots, key):
    cap = len(slots)
    i = key % cap                                  #@shome
    for _ in range(cap):
        if slots[i] is None:                       #@sempty
            return -1
        if slots[i] == key:                        #@sfound
            return i
        i = (i + 1) % cap                          #@snext
    return -1                                      #@smiss

def delete(slots, key):
    i = search(slots, key)                         #@del
    if i != -1:
        slots[i] = TOMB                            #@tomb
`;

interface In {
  capacity: number;
  ops: string[];
}

const TOMB = -1;
type Slot = number | null;

const viz: VizDef<In> = {
  id: 'hash-open-addressing',
  title: 'Open addressing with linear probing',
  code,
  language: 'python',
  inputs: [
    { key: 'capacity', label: 'Slots', kind: 'number', default: 7, help: 'Table size (3-10).' },
    { key: 'ops', label: 'Operations', kind: 'strings', default: ['+10', '+17', '+13', '+20', '+24', '-17', '?24', '+31'], maxItems: 10, help: '+k insert, -k delete, ?k search (k is a non-negative whole number).' },
  ],
  presets: [
    { label: 'Wrap-around', input: { capacity: 5, ops: ['+4', '+9', '+14', '?14'] } },
    { label: 'Tombstone keeps the chain', input: { capacity: 7, ops: ['+3', '+10', '+17', '-10', '?17', '+24'] } },
    { label: 'Table fills up', input: { capacity: 3, ops: ['+0', '+3', '+6', '+9', '?9'] } },
    { label: 'Missing key', input: { capacity: 7, ops: ['+2', '+9', '?16'] } },
  ],
  run({ capacity, ops }) {
    if (!Number.isInteger(capacity) || capacity < 3 || capacity > 10) throw new Error('Slots must be a whole number from 3 to 10');
    const parsed = ops.map((o) => {
      const m = /^([+\-?])(\d{1,3})$/.exec(o.trim());
      if (!m) throw new Error(`"${o}" is not an operation. Use +k, -k or ?k with a whole number k`);
      return { op: m[1], key: Number(m[2]) };
    });
    if (!parsed.length) throw new Error('Add at least one operation');
    const r = new Recorder(code);
    const slots: Slot[] = Array(capacity).fill(null);
    const searches: number[] = [];
    const view = (i?: number, tones: Record<number, Tone> = {}, extra: Record<string, number> = {}): ArrayPanel => {
      const t: Record<number, Tone> = {};
      slots.forEach((s, k) => {
        if (s === TOMB) t[k] = 'muted';
      });
      Object.assign(t, tones);
      return { type: 'array', title: 'slots (None = empty, x = tombstone)', values: slots.map((s) => (s === TOMB ? 'x' : s)), tones: t, pointers: i === undefined ? undefined : { i, ...extra } };
    };
    const slotText = (s: Slot) => (s === null ? 'empty' : s === TOMB ? 'a tombstone' : `holds ${s}`);

    r.step('home', `Empty table of ${capacity} slots`, [view()], { capacity });

    const search = (key: number, tag: string): number => {
      let i = key % capacity;
      r.step('shome', cap(`${tag}: home slot = ${key} % ${capacity} = ${i}`), [view(i, { [i]: 'compare' })], { key, i });
      for (let n = 0; n < capacity; n++) {
        r.op();
        if (slots[i] === null) {
          r.step('sempty', `Slot ${i} is empty: the key cannot be further along. Not found`, [view(i, { [i]: 'error' })], { key, i });
          return -1;
        }
        if (slots[i] === key) {
          r.step('sfound', `Slot ${i} holds ${key}: found`, [view(i, { [i]: 'found' })], { key, i, result: i });
          return i;
        }
        const ni = (i + 1) % capacity;
        r.step('snext', cap(`Slot ${i} is ${slotText(slots[i])}, not ${key}: i = (${i}+1) % ${capacity} = ${ni}${ni < i ? ' (wrapped)' : ''}`), [view(i, { [i]: 'compare' })], { key, i });
        i = ni;
        if (n < capacity - 1) r.step('snext', `Probe slot ${i}`, [view(i, { [i]: 'compare' })], { key, i });
      }
      r.step('smiss', `Checked all ${capacity} slots: not found`, [view()], { key, result: -1 });
      return -1;
    };

    for (const { op, key } of parsed) {
      if (op === '+') {
        let i = key % capacity;
        r.step('home', cap(`insert ${key}: home slot = ${key} % ${capacity} = ${i}`), [view(i, { [i]: 'compare' })], { key, i });
        let placed = false;
        for (let n = 0; n < capacity; n++) {
          r.op();
          if (slots[i] === null || slots[i] === TOMB) {
            const reuse = slots[i] === TOMB;
            r.step('free', reuse ? `Slot ${i} is a tombstone: free to reuse` : `Slot ${i} is empty: free`, [view(i, { [i]: 'active' })], { key, i });
            slots[i] = key;
            r.step('place', `Place ${key} in slot ${i}`, [view(i, { [i]: 'new' })], { key, i, result: i });
            placed = true;
            break;
          }
          const ni = (i + 1) % capacity;
          r.step('free', cap(`Slot ${i} holds ${slots[i]}: taken. i = (${i}+1) % ${capacity} = ${ni}${ni < i ? ' (wraps around)' : ''}`), [view(i, { [i]: 'error' })], { key, i });
          i = ni;
          r.step('next', `Probe slot ${i}`, [view(i, { [i]: 'compare' })], { key, i });
        }
        if (!placed) r.step('full', `Every slot is taken: insert ${key} fails, return -1`, [view()], { key, result: -1 });
      } else if (op === '?') {
        searches.push(search(key, `search ${key}`));
      } else {
        r.step('del', `delete ${key}: search for it first`, [view()], { key });
        const i = search(key, `delete ${key}`);
        if (i !== -1) {
          slots[i] = TOMB;
          r.op();
          r.step('tomb', cap(`Mark slot ${i} as a tombstone, NOT empty, so later probes keep going`), [view(i, { [i]: 'swap' })], { key, i });
        }
      }
    }
    return { frames: r.frames, result: { slots: [...slots], searches } };
  },
  reference({ capacity, ops }) {
    const table: Slot[] = new Array(capacity).fill(null);
    const searches: number[] = [];
    const find = (key: number): number => {
      for (let step = 0; step < capacity; step++) {
        const j = (key + step) % capacity;
        if (table[j] === null) return -1;
        if (table[j] === key) return j;
      }
      return -1;
    };
    for (const o of ops) {
      const key = Number(o.trim().slice(1));
      const kind = o.trim()[0];
      if (kind === '+') {
        for (let step = 0; step < capacity; step++) {
          const j = (key + step) % capacity;
          if (table[j] === null || table[j] === TOMB) {
            table[j] = key;
            break;
          }
        }
      } else if (kind === '?') searches.push(find(key));
      else {
        const j = find(key);
        if (j !== -1) table[j] = TOMB;
      }
    }
    return { slots: table, searches };
  },
};

const TB = -1;
const searchTests = [
  { args: [[null, null, null, 10, 17, null, null], 17], expected: 4, name: 'one probe past home' },
  { args: [[null, null, null, 10, 17, null, null], 10], expected: 3, name: 'at its home slot' },
  { args: [[null, null, null, 10, 17, null, null], 24], expected: -1, name: 'probe stops at an empty slot' },
  { args: [[20, null, null, 10, 17, 24, 13], 20], expected: 0, name: 'wraps around to slot 0' },
  { args: [[null, null, null, 10, TB, 24, null], 24], expected: 5, name: 'search continues past a tombstone' },
  { args: [[7, 8, 9], 10], expected: -1, name: 'full table, missing key must not loop forever' },
];

const unit: Unit = {
  id: 'hash-open-addressing',
  hook: 'Python dicts and many production tables store everything in one flat array. Interviewers use linear probing to see whether you spot the two traps: wrap-around and deletion.',
  predict: {
    prompt: 'Slots 3, 4, 5 hold 10, 17, 24 (all three hash to slot 3). You delete 17 by writing None into slot 4. What does search(24) return?',
    code: 'slots = [None, None, None, 10, 17, 24, None]   # capacity 7\nslots[4] = None                                  # "delete" 17\nsearch(slots, 24)                                # 24 % 7 = 3',
    codeLang: 'python',
    options: ['5, it still finds 24', '-1, the probe stops at the empty slot 4', '4, it returns the deleted slot', 'It raises an IndexError'],
    answer: 1,
    explain: 'Search starts at slot 3 (10, not it), moves to slot 4 and sees an empty slot. Empty means "this key was never pushed past here", so it gives up and reports -1 even though 24 sits in slot 5. Deleted slots need a tombstone marker instead of None.',
  },
  viz,
  deeper: {
    points: [
      'No chains: every key lives directly in the slot array. A collision just moves on to the next slot, i + 1, wrapping to 0 with `% cap`.',
      'Search follows the exact probe path the insert used. An empty (never used) slot proves the key is absent.',
      'Deleting must leave a tombstone: searches treat it as occupied and keep probing, inserts may reuse it.',
      'Linear probing makes runs of filled slots (clustering). Keep the load factor well below 1, around 0.5 to 0.7, and resize when it grows.',
    ],
    complexity: { time: 'O(1) average at low load, O(n) when the table is nearly full', space: 'O(capacity)' },
    pitfalls: ['Not wrapping the index: i + 1 runs off the end of the array', 'Looping forever on a full table instead of stopping after `cap` probes', 'Clearing a deleted slot to None, which cuts the probe path for later keys', 'Inserting without first checking that the key already exists elsewhere on its probe path'],
  },
  practice: {
    language: 'python',
    fnName: 'probe_search',
    statement: 'The table is a list where None is an empty slot and -1 is a tombstone. Return the slot index holding `key` using linear probing from key % len(table), or -1 if it is absent.',
    signature: 'def probe_search(table, key):',
    solution: `def probe_search(table, key):
    cap = len(table)
    i = @@key % cap@@
    for _ in range(@@cap@@):
        if table[i] is None:
            return -1
        if @@table[i] == key@@:
            return i
        i = @@(i + 1) % cap@@
    return -1`,
    tests: searchTests,
  },
  debug: {
    language: 'python',
    fnName: 'probe_search',
    statement: 'Search works until something has been deleted: keys stored after a tombstone cannot be found any more. Fix the bug.',
    buggy: `def probe_search(table, key):
    cap = len(table)
    i = key % cap
    for _ in range(cap):
        if table[i] is None or table[i] == -1:
            return -1
        if table[i] == key:
            return i
        i = (i + 1) % cap
    return -1`,
    fixed: `def probe_search(table, key):
    cap = len(table)
    i = key % cap
    for _ in range(cap):
        if table[i] is None:
            return -1
        if table[i] == key:
            return i
        i = (i + 1) % cap
    return -1`,
    tests: searchTests,
    bugType: 'tombstone treated as empty',
    hint: 'Which kind of slot proves the key is absent: an empty one, a tombstone, or both?',
    explanation: 'A tombstone (-1) only says "something used to be here". A key that collided earlier may sit further along the probe path, so search must step over tombstones. Only a truly empty slot (None) ends the search.',
  },
  boss: {
    title: 'Circular Parking Lot',
    statement: 'A lot has n spots numbered 0..n-1 arranged in a circle. Each arriving car has a preferred spot and takes the first free spot at or after it, wrapping from n-1 back to 0. Return the spot each car gets, in arrival order, or -1 for a car that finds the lot full.',
    language: 'python',
    fnName: 'park',
    starter: `def park(n, preferred):
    # your code here
    pass
`,
    solution: `def park(n, preferred):
    taken = [False] * n
    out = []
    for p in preferred:
        spot = -1
        for step in range(n):
            j = (p + step) % n
            if not taken[j]:
                taken[j] = True
                spot = j
                break
        out.append(spot)
    return out`,
    tests: [
      { args: [3, [1, 1, 1]], expected: [1, 2, 0], name: 'wraps around' },
      { args: [3, [0, 0, 0, 0]], expected: [0, 1, 2, -1], name: 'lot fills up' },
      { args: [5, []], expected: [], name: 'no cars' },
      { args: [4, [3, 3]], expected: [3, 0] },
      { args: [1, [0, 0]], expected: [0, -1], name: 'single spot' },
      { args: [6, [2, 4, 2, 4, 5, 5]], expected: [2, 4, 3, 5, 0, 1] },
    ],
    hints: ['It is linear probing in disguise: the preferred spot is the home slot, "taken" is an occupied slot.', 'For each car try spots (p + step) % n for step = 0..n-1; take the first free one and stop. If none is free, answer -1.'],
    combines: ['hash-chaining'],
  },
  quiz: [
    {
      prompt: 'Why does linear probing need a tombstone marker when deleting?',
      options: ['To free memory immediately', 'So searches do not stop early and miss keys stored further along the probe path', 'To keep the table sorted', 'Python requires it'],
      answer: 1,
      explain: 'An empty slot ends a search. If a deleted slot became empty, keys that had probed past it would become unreachable.',
    },
  ],
};

export default unit;
