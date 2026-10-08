import { Recorder } from '@/engine/recorder';
import type { BucketsPanel, KVPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { cap, charSum, charSumText } from '@/content/lib/hashing-bits';

const code = `
class MyHashMap:
    def __init__(self, capacity=4):
        self.capacity = capacity
        self.buckets = [[] for _ in range(capacity)]   #@init

    def _hash(self, key):
        return sum(ord(c) for c in key) % self.capacity   #@hash

    def put(self, key, value):
        chain = self.buckets[self._hash(key)]   #@bucket
        for pair in chain:                      #@walk
            if pair[0] == key:                  #@cmp
                pair[1] = value                 #@update
                return
        chain.append([key, value])              #@append

    def get(self, key):
        for k, v in self.buckets[self._hash(key)]:   #@getwalk
            if k == key:                             #@getcmp
                return v                             #@getfound
        return None                                  #@getmiss
`;

interface In {
  capacity: number;
  keys: string[];
  lookups: string[];
}

interface Pair {
  k: string;
  v: number;
}

const viz: VizDef<In> = {
  id: 'hash-chaining',
  title: 'Hash map with separate chaining',
  code,
  language: 'python',
  inputs: [
    { key: 'capacity', label: 'Buckets', kind: 'number', default: 4, help: 'Number of buckets (1-8). Fewer buckets means more collisions.' },
    { key: 'keys', label: 'put(key) in order', kind: 'strings', default: ['cat', 'dog', 'act', 'bird', 'cat'], maxItems: 8, help: 'Each put stores value = its position (1, 2, 3...). Repeating a key updates it.' },
    { key: 'lookups', label: 'get(key) afterwards', kind: 'strings', default: ['act', 'bird', 'emu'], maxItems: 5 },
  ],
  presets: [
    { label: 'Anagram collisions', input: { capacity: 4, keys: ['cat', 'act', 'tac'], lookups: ['tac', 'cat'] } },
    { label: 'Update existing key', input: { capacity: 4, keys: ['dog', 'dog'], lookups: ['dog'] } },
    { label: 'One bucket (a linked list)', input: { capacity: 1, keys: ['a', 'b', 'c'], lookups: ['c', 'z'] } },
    { label: 'No collisions', input: { capacity: 8, keys: ['a', 'b', 'c'], lookups: ['b'] } },
  ],
  run({ capacity, keys, lookups }) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 8) throw new Error('Buckets must be a whole number from 1 to 8');
    if (keys.length === 0) throw new Error('Add at least one key to put');
    if ([...keys, ...lookups].some((k) => k.length > 8)) throw new Error('Keys can be at most 8 characters long');
    const r = new Recorder(code);
    const buckets: Pair[][] = Array.from({ length: capacity }, () => []);
    let size = 0;
    const view = (active?: number, itemTone: Record<string, Tone> = {}, bucketTone: Tone = 'active'): [BucketsPanel, KVPanel] => [
      {
        type: 'buckets',
        title: `buckets (capacity ${capacity})`,
        buckets: buckets.map((chain) => chain.map((p) => ({ id: p.k, label: `${p.k}:${p.v}`, tone: itemTone[p.k] }))),
        tones: active === undefined ? undefined : { [active]: bucketTone },
      },
      {
        type: 'kv',
        entries: [
          { k: 'items', v: size },
          { k: 'load factor', v: Math.round((size / capacity) * 100) / 100 },
        ],
      },
    ];
    r.step('init', `Empty table: ${capacity} bucket${capacity > 1 ? 's' : ''}, each holding an empty chain`, view(), { capacity });

    keys.forEach((key, idx) => {
      const value = idx + 1;
      const h = charSum(key);
      const b = h % capacity;
      r.op();
      r.step('hash', cap(`put('${key}'): ${charSumText(key)}, then ${h} % ${capacity} = bucket ${b}`), view(b), { key, hash: h, bucket: b });
      const chain = buckets[b];
      r.step('bucket', buckets[b].length ? `Bucket ${b} already holds ${chain.length} item${chain.length > 1 ? 's' : ''}: walk its chain` : `Bucket ${b} is empty: nothing to compare`, view(b), { key, bucket: b, 'len(chain)': chain.length });
      const seen: Record<string, Tone> = {};
      for (const pair of chain) {
        r.op();
        const same = pair.k === key;
        seen[pair.k] = same ? 'found' : 'compare';
        r.step('cmp', same ? `'${pair.k}' == '${key}': same key, so update in place` : `'${pair.k}' == '${key}'? No, different key. Keep walking`, view(b, { ...seen }), { key, bucket: b, 'pair[0]': pair.k });
        if (same) {
          pair.v = value;
          r.op();
          r.step('update', `Overwrite the value: '${key}' is now ${value}. Chain length unchanged`, view(b, { [key]: 'swap' }), { key, value });
          return;
        }
      }
      const collided = chain.length > 0;
      chain.push({ k: key, v: value });
      size++;
      r.op();
      r.step('append', cap(collided ? `Collision! No match, so append '${key}' to the end of chain ${b}` : `No match: append '${key}':${value} to bucket ${b}`), view(b, { [key]: 'new' }, collided ? 'error' : 'active'), { key, value, bucket: b });
    });

    const found: (number | null)[] = [];
    lookups.forEach((key) => {
      const h = charSum(key);
      const b = h % capacity;
      r.op();
      r.step('getwalk', cap(`get('${key}'): ${h} % ${capacity} = bucket ${b}, walk its chain`), view(b), { key, hash: h, bucket: b });
      const seen: Record<string, Tone> = {};
      let hit: number | null = null;
      for (const pair of buckets[b]) {
        r.op();
        const same = pair.k === key;
        seen[pair.k] = same ? 'found' : 'compare';
        r.step('getcmp', same ? `'${pair.k}' == '${key}': yes` : `'${pair.k}' == '${key}'? No, try the next item`, view(b, { ...seen }), { key, bucket: b, k: pair.k });
        if (same) {
          hit = pair.v;
          break;
        }
      }
      found.push(hit);
      if (hit !== null) r.step('getfound', `Found: get('${key}') returns ${hit}`, view(b, seen), { key, result: hit });
      else r.step('getmiss', buckets[b].length ? `End of the chain: '${key}' is not stored, return None` : `Bucket ${b} is empty: return None`, view(b, seen, 'muted'), { key, result: null });
    });
    return { frames: r.frames, result: found };
  },
  reference({ keys, lookups }) {
    const m = new Map<string, number>();
    keys.forEach((k, i) => m.set(k, i + 1));
    return lookups.map((k) => m.get(k) ?? null);
  },
};

const opsTests = [
  { args: [['MyHashMap', 'put', 'put', 'get', 'get'], [[], [1, 10], [2, 20], [1], [3]]], expected: [null, null, null, 10, -1], name: 'put then get' },
  { args: [['MyHashMap', 'put', 'put', 'put', 'get', 'get', 'get'], [[], [1, 1], [9, 9], [17, 17], [9], [17], [1]]], expected: [null, null, null, null, 9, 17, 1], name: 'three keys in one bucket' },
  { args: [['MyHashMap', 'put', 'put', 'get'], [[], [5, 1], [5, 2], [5]]], expected: [null, null, null, 2], name: 'put twice updates' },
  { args: [['MyHashMap', 'put', 'put', 'remove', 'get', 'get'], [[], [3, 30], [11, 110], [3], [3], [11]]], expected: [null, null, null, null, -1, 110], name: 'remove keeps the neighbour' },
  { args: [['MyHashMap', 'remove', 'get'], [[], [7], [7]]], expected: [null, null, -1], name: 'remove a missing key' },
  { args: [['MyHashMap', 'put', 'get', 'put', 'get'], [[], [0, 5], [0], [8, 6], [0]]], expected: [null, null, 5, null, 5], name: 'key 0 and its collision' },
];

const unit: Unit = {
  id: 'hash-chaining',
  hook: 'Almost every interview answer leans on a hash map, and "how does it work inside?" is a favourite follow-up. If you can explain `hash % capacity` and what happens on a collision, you stand out.',
  predict: {
    prompt: 'A 4-bucket table hashes by adding character codes. "cat" and "act" both sum to 312, so both land in bucket 0. After put("cat", 1), put("act", 2), what does get("cat") return?',
    options: ['2, because "act" overwrote "cat"', '1, because both live in the chain and the keys are compared', 'None, because a collision destroys both entries', 'It raises an error'],
    answer: 1,
    explain: 'The hash only chooses the bucket. Inside the bucket, the chain stores both pairs and get() compares the actual keys. "cat" != "act", so it skips "act" and finds ("cat", 1).',
  },
  viz,
  deeper: {
    points: [
      'A hash function turns a key into an integer; `% capacity` turns that integer into a bucket index. Equal keys must always give equal hashes.',
      'Different keys can share a bucket (a collision). With chaining, each bucket holds a small list of (key, value) pairs.',
      'put and get both do the same walk: go to the bucket, compare real keys with `==`, then update, return, or append.',
      'The load factor (items / buckets) is the average chain length. Real tables resize before it gets large (see the resizing unit), keeping operations O(1) on average.',
    ],
    complexity: { time: 'O(1) average, O(n) worst case (every key in one chain)', space: 'O(n + capacity)' },
    pitfalls: ['Treating the bucket as one slot and overwriting on a collision', 'Appending in put without first checking whether the key already exists (duplicates, stale reads)', 'Mutable keys: changing a key after insertion strands it in the wrong bucket'],
  },
  practice: {
    language: 'python',
    fnName: 'MyHashMap',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement: 'Implement MyHashMap for integer keys with put(key, value), get(key) (return -1 when absent) and remove(key). Use 8 buckets with separate chaining.',
    signature: 'class MyHashMap:',
    solution: `class MyHashMap:
    def __init__(self):
        self.capacity = 8
        self.buckets = [[] for _ in range(@@self.capacity@@)]

    def _index(self, key):
        return @@key % self.capacity@@

    def put(self, key, value):
        chain = self.buckets[self._index(key)]
        for pair in chain:
            if pair[0] == key:
                @@pair[1] = value@@
                return
        chain.append(@@[key, value]@@)

    def get(self, key):
        for k, v in self.buckets[self._index(key)]:
            if k == key:
                return v
        return @@-1@@

    def remove(self, key):
        chain = self.buckets[self._index(key)]
        for i, pair in enumerate(chain):
            if pair[0] == key:
                @@chain.pop(i)@@
                return`,
    tests: opsTests,
  },
  debug: {
    language: 'python',
    fnName: 'MyHashMap',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement: 'Lookups work when a bucket holds one key, but keys that collided with an earlier key come back as -1. Find the bug in get().',
    buggy: `class MyHashMap:
    def __init__(self):
        self.capacity = 8
        self.buckets = [[] for _ in range(self.capacity)]

    def _index(self, key):
        return key % self.capacity

    def put(self, key, value):
        chain = self.buckets[self._index(key)]
        for pair in chain:
            if pair[0] == key:
                pair[1] = value
                return
        chain.append([key, value])

    def get(self, key):
        for k, v in self.buckets[self._index(key)]:
            if k == key:
                return v
            return -1

    def remove(self, key):
        chain = self.buckets[self._index(key)]
        for i, pair in enumerate(chain):
            if pair[0] == key:
                chain.pop(i)
                return`,
    fixed: `class MyHashMap:
    def __init__(self):
        self.capacity = 8
        self.buckets = [[] for _ in range(self.capacity)]

    def _index(self, key):
        return key % self.capacity

    def put(self, key, value):
        chain = self.buckets[self._index(key)]
        for pair in chain:
            if pair[0] == key:
                pair[1] = value
                return
        chain.append([key, value])

    def get(self, key):
        for k, v in self.buckets[self._index(key)]:
            if k == key:
                return v
        return -1

    def remove(self, key):
        chain = self.buckets[self._index(key)]
        for i, pair in enumerate(chain):
            if pair[0] == key:
                chain.pop(i)
                return`,
    tests: opsTests,
    bugType: 'giving up before the chain is fully walked',
    hint: 'Which key does the loop compare first when two keys share a bucket? What happens to the second one?',
    explanation: '`return -1` is indented inside the for loop, so get() gives up after the FIRST pair in the chain. Any key that is not at the head of its chain is reported missing. Dedent it so it runs only after the whole chain has been checked.',
  },
  boss: {
    title: 'Group Anagrams',
    statement: 'Given a list of lowercase words, group together the words that are anagrams of each other (same letters, any order). Return the groups in any order; inside a group keep the input order.',
    language: 'python',
    fnName: 'group_anagrams',
    compare: 'nested',
    starter: `def group_anagrams(words):
    # your code here
    pass
`,
    solution: `def group_anagrams(words):
    groups = {}
    for w in words:
        key = "".join(sorted(w))
        groups.setdefault(key, []).append(w)
    return list(groups.values())`,
    tests: [
      { args: [['eat', 'tea', 'tan', 'ate', 'nat', 'bat']], expected: [['eat', 'tea', 'ate'], ['tan', 'nat'], ['bat']] },
      { args: [['']], expected: [['']], name: 'empty string' },
      { args: [['a']], expected: [['a']], name: 'single word' },
      { args: [[]], expected: [], name: 'no words' },
      { args: [['ab', 'ba', 'abc', 'cab', 'bca', 'c']], expected: [['ab', 'ba'], ['abc', 'cab', 'bca'], ['c']] },
    ],
    hints: ['Two words are anagrams exactly when they have the same letters once sorted. That sorted form can be a dictionary key.', 'Walk the words once: key = "".join(sorted(word)), then append the word to groups[key]. setdefault(key, []) creates the list the first time.'],
    combines: ['hash-set'],
  },
  quiz: [
    {
      prompt: 'Two different keys hash to the same bucket. In a chained table, what must get() do?',
      options: ['Return whatever is first in the bucket', 'Compare keys along the chain until one matches', 'Re-hash the key with a different function', 'Move to the next bucket'],
      answer: 1,
      explain: 'The bucket only narrows the search. Equality on the real key picks the right pair from the chain.',
    },
  ],
};

export default unit;
