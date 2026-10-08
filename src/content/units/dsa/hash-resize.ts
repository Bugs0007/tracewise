import { Recorder } from '@/engine/recorder';
import type { BucketsPanel, KVPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap } from '@/content/lib/hashing-bits';

const code = `
class ResizableSet:
    def __init__(self):
        self.capacity = 2
        self.size = 0
        self.buckets = [[] for _ in range(2)]

    def put(self, key):
        self.buckets[key % self.capacity].append(key)     #@put
        self.size += 1
        if self.size / self.capacity > 0.75:              #@check
            self._resize()                                #@call

    def _resize(self):
        old = self.buckets                                #@old
        self.capacity *= 2                                #@double
        self.buckets = [[] for _ in range(self.capacity)] #@alloc
        for chain in old:                                 #@scan
            for key in chain:                             #@each
                self.buckets[key % self.capacity].append(key)   #@move
`;

interface In {
  keys: number[];
  threshold: number;
}

const viz: VizDef<In> = {
  id: 'hash-resize',
  title: 'Resizing and rehashing',
  code,
  language: 'python',
  inputs: [
    { key: 'keys', label: 'Keys to put', kind: 'numbers', default: [5, 12, 7, 9, 20], maxItems: 12, help: 'Distinct non-negative whole numbers. Hash = key % capacity.' },
    { key: 'threshold', label: 'Max load factor', kind: 'number', default: 0.75, help: 'Resize when size / capacity is greater than this (0.5 to 1). The code panel shows 0.75.' },
  ],
  presets: [
    { label: 'Two resizes', input: { keys: [5, 12, 7, 9, 20], threshold: 0.75 } },
    { label: 'Same bucket until resize', input: { keys: [4, 8, 16, 3], threshold: 1 } },
    { label: 'No resize needed', input: { keys: [1], threshold: 0.75 } },
    { label: 'Resize splits a chain', input: { keys: [2, 6, 10, 14, 1], threshold: 1 } },
  ],
  run({ keys, threshold }) {
    if (!keys.length) throw new Error('Add at least one key');
    if (keys.some((k) => !Number.isInteger(k) || k < 0)) throw new Error('Keys must be non-negative whole numbers');
    if (new Set(keys).size !== keys.length) throw new Error('Keys must be distinct in this demo');
    if (!(threshold >= 0.5 && threshold <= 1)) throw new Error('Max load factor must be between 0.5 and 1');
    const r = new Recorder(code);
    let capacity = 2;
    let size = 0;
    let buckets: number[][] = [[], []];

    const bpanel = (title: string, bs: number[][], active?: number, itemTone: Record<number, Tone> = {}, bucketTone: Tone = 'active'): BucketsPanel => ({
      type: 'buckets',
      title,
      buckets: bs.map((c) => c.map((k) => ({ id: String(k), label: String(k), tone: itemTone[k] }))),
      tones: active === undefined ? undefined : { [active]: bucketTone },
    });
    const stats = (): KVPanel => ({
      type: 'kv',
      entries: [
        { k: 'size / capacity', v: `${size} / ${capacity}` },
        { k: 'load factor', v: Math.round((size / capacity) * 100) / 100 },
      ],
    });
    const main = (active?: number, itemTone: Record<number, Tone> = {}): Panel[] => [bpanel(`table (capacity ${capacity})`, buckets, active, itemTone), stats()];

    r.step('put', `Start: ${capacity} empty buckets, resize when load factor > ${threshold}`, main(), { capacity, size });
    for (const key of keys) {
      const b = key % capacity;
      r.op();
      buckets[b].push(key);
      size++;
      r.step('put', cap(`put(${key}): ${key} % ${capacity} = bucket ${b}${buckets[b].length > 1 ? ' (collision, chain grows)' : ''}`), main(b, { [key]: 'new' }), { key, bucket: b });
      const load = size / capacity;
      const grow = load > threshold;
      r.step('check', cap(`size / capacity = ${size}/${capacity} = ${Math.round(load * 100) / 100} ${grow ? '>' : '<='} ${threshold}${grow ? ': resize!' : ': fine'}`), main(), { size, capacity, load: Math.round(load * 100) / 100 });
      if (!grow) continue;

      const old = buckets;
      const oldCap = capacity;
      capacity *= 2;
      buckets = Array.from({ length: capacity }, () => []);
      const oldPanel = (hot?: number, from?: number) => bpanel(`old table (capacity ${oldCap})`, old, from, hot === undefined ? {} : { [hot]: 'swap' }, 'compare');
      r.step('alloc', `Allocate a new table with double the capacity: ${capacity} buckets`, [oldPanel(), bpanel(`new table (capacity ${capacity})`, buckets), stats()], { oldCapacity: oldCap, capacity });
      old.forEach((chain, from) => {
        for (const k of chain) {
          const to = k % capacity;
          r.op();
          buckets[to].push(k);
          r.step('move', cap(`rehash ${k}: ${k} % ${capacity} = ${to} (was bucket ${from} when capacity was ${oldCap})`), [oldPanel(k, from), bpanel(`new table (capacity ${capacity})`, buckets, to, { [k]: 'new' }), stats()], { key: k, from, to });
        }
      });
      const longest = Math.max(...buckets.map((c) => c.length));
      r.step('scan', `Resize done: capacity ${capacity}, load factor ${Math.round((size / capacity) * 100) / 100}, longest chain ${longest}`, main(), { capacity, size });
    }
    return { frames: r.frames, result: { capacity, buckets } };
  },
  reference({ keys, threshold }) {
    let table: number[][] = [[], []];
    let n = 0;
    keys.forEach((k) => {
      table[k % table.length].push(k);
      n++;
      if (n / table.length > threshold) {
        const next: number[][] = Array.from({ length: table.length * 2 }, () => []);
        table.flat().forEach((x) => next[x % next.length].push(x));
        table = next;
      }
    });
    return { capacity: table.length, buckets: table };
  },
};

const rehashTests = [
  { args: [[[12], [5]], 4], expected: [[12], [5], [], []], name: 'double 2 to 4' },
  { args: [[[12], [5, 9], [], [7]], 8], expected: [[], [9], [], [], [12], [5], [], [7]], name: 'keys move to new buckets' },
  { args: [[[], []], 4], expected: [[], [], [], []], name: 'empty table' },
  { args: [[[8, 16], []], 4], expected: [[8, 16], [], [], []], name: 'a chain stays together' },
  { args: [[[4], [1, 9]], 8], expected: [[], [1, 9], [], [], [4], [], [], []], name: 'order inside chains is kept' },
  { args: [[[3, 4]], 1], expected: [[3, 4]], name: 'capacity 1' },
];

const unit: Unit = {
  id: 'hash-resize',
  hook: 'A hash map is only O(1) because it grows. "What happens when the table gets full?" tests whether you know that every key must be re-hashed, not copied.',
  predict: {
    prompt: 'A table with 4 buckets holds 12 (bucket 0) and 5 (bucket 1). It doubles to 8 buckets. A buggy resize copies each old bucket into the SAME index of the new array without recomputing. What does get(5) do afterwards?',
    options: ['Finds 5, it is still in bucket 1', 'Misses, because get now looks in bucket 5 % 8 = 5 but 5 is stored in bucket 1', 'Finds 5 in bucket 0', 'Crashes with IndexError'],
    answer: 1,
    explain: 'The bucket index depends on the capacity. With capacity 8, 5 hashes to bucket 5, yet the copy left it in bucket 1. Every key must be re-hashed with the new capacity.',
  },
  viz,
  deeper: {
    points: [
      'Load factor = size / capacity. Past a threshold (0.75 is a common choice) chains and probe runs get long, so the table grows.',
      'Doubling gives amortised O(1) puts: most puts are cheap, and the occasional O(n) resize is paid for by the many cheap ones before it.',
      'Rehash means recomputing `key % new_capacity` for every key, because the old bucket index is meaningless in the new table.',
      'Two keys that collided before can separate afterwards (and the reverse is possible only by chance), which is why chains get shorter after a resize.',
    ],
    complexity: { time: 'Resize O(n); put amortised O(1)', space: 'O(n) extra while the old and new tables both exist' },
    pitfalls: ['Rehashing with the old capacity (the keys land in the wrong buckets)', 'Appending new keys to the old table after swapping it out', 'Growing by a constant amount instead of a factor, which makes puts O(n) on average', 'Changing the table while iterating over it instead of iterating the old one'],
  },
  practice: {
    language: 'python',
    fnName: 'rehash',
    statement: 'buckets is a list of chains (lists of int keys). Return a new list of `new_capacity` chains where every key is stored in bucket key % new_capacity, visiting old buckets in order.',
    signature: 'def rehash(buckets, new_capacity):',
    solution: `def rehash(buckets, new_capacity):
    new_buckets = [[] for _ in range(@@new_capacity@@)]
    for chain in @@buckets@@:
        for key in chain:
            new_buckets[@@key % new_capacity@@].append(key)
    return @@new_buckets@@`,
    tests: rehashTests,
  },
  debug: {
    language: 'python',
    fnName: 'rehash',
    statement: 'After growing the table, many lookups miss even though the keys were copied over. Find the bug in rehash().',
    buggy: `def rehash(buckets, new_capacity):
    new_buckets = [[] for _ in range(new_capacity)]
    for chain in buckets:
        for key in chain:
            new_buckets[key % len(buckets)].append(key)
    return new_buckets`,
    fixed: `def rehash(buckets, new_capacity):
    new_buckets = [[] for _ in range(new_capacity)]
    for chain in buckets:
        for key in chain:
            new_buckets[key % new_capacity].append(key)
    return new_buckets`,
    tests: rehashTests,
    bugType: 'rehash with the old capacity',
    hint: 'Look at what you take the remainder by. Which table will lookups use from now on?',
    explanation: '`len(buckets)` is the OLD capacity, so keys land where they used to be. Lookups after the resize compute `key % new_capacity` and look elsewhere. Use `new_capacity` for the index.',
  },
  boss: {
    title: 'Top K Frequent Elements',
    statement: 'Given a list of integers and k, return the k values that occur most often, in any order. The input is guaranteed to have a unique answer. Aim for better than O(n log n).',
    language: 'python',
    fnName: 'top_k_frequent',
    compare: 'unordered',
    starter: `def top_k_frequent(nums, k):
    # your code here
    pass
`,
    solution: `def top_k_frequent(nums, k):
    counts = {}
    for x in nums:
        counts[x] = counts.get(x, 0) + 1
    by_freq = [[] for _ in range(len(nums) + 1)]
    for x, c in counts.items():
        by_freq[c].append(x)
    out = []
    for c in range(len(nums), 0, -1):
        for x in by_freq[c]:
            out.append(x)
            if len(out) == k:
                return out
    return out`,
    tests: [
      { args: [[1, 1, 1, 2, 2, 3], 2], expected: [1, 2] },
      { args: [[1], 1], expected: [1], name: 'single element' },
      { args: [[4, 4, 4, 4, 5, 5, 6], 1], expected: [4] },
      { args: [[-1, -1, 2, 2, 2, 3], 2], expected: [2, -1], name: 'negative values' },
      { args: [[5, 3, 5, 3, 5, 1, 1, 1, 1], 2], expected: [1, 5] },
    ],
    hints: ['First count how often each value occurs with a dict. Then think about how to read the counts from largest to smallest without sorting.', 'A count can never exceed len(nums), so make a list of buckets indexed by frequency: by_freq[c] holds the values seen c times. Scan it from the top down until you have k values.'],
    combines: ['hash-chaining', 'hash-set'],
  },
  quiz: [
    {
      prompt: 'Why double the capacity instead of adding a fixed 10 buckets each time?',
      options: ['Powers of two are required by Python', 'Doubling keeps the number of resizes logarithmic, so puts stay O(1) amortised', 'It uses less memory', 'It avoids collisions entirely'],
      answer: 1,
      explain: 'Growing by a constant means a resize every few puts and O(n) work each time. Doubling spreads the cost: n puts trigger only about log n resizes.',
    },
  ],
};

export default unit;
