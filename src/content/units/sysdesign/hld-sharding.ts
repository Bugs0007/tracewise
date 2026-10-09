import { Recorder } from '@/engine/recorder';
import type { ChartPanel, GridPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { hashKey, kvPanel, needInt, needOneOf } from '@/content/lib/sysdesign-hld-2';

const code = `
def shard_for(key, shards, strategy):
    if strategy == "range":                                   #@rangeCheck
        return min(key // (100 // shards), shards - 1)        #@range
    return (key * 2654435761) % 2**32 % shards                #@hash

def place(keys, shards, strategy):
    loads = [0] * shards
    for key in keys:
        loads[shard_for(key, shards, strategy)] += 1          #@place
    return loads                                              #@loads

def moved(keys, old, new, strategy):
    return sum(1 for k in keys
               if shard_for(k, old, strategy) != shard_for(k, new, strategy))   #@moved
`;

interface In {
  keys: number[];
  shards: number;
  strategy: string;
  newShards: number;
}

function shardFor(key: number, shards: number, strategy: string): number {
  if (strategy === 'range') return Math.min(Math.floor(key / Math.floor(100 / shards)), shards - 1);
  return hashKey(key) % shards;
}

function explain(key: number, shards: number, strategy: string): string {
  if (strategy === 'range') {
    const w = Math.floor(100 / shards);
    return `${key} // ${w} = ${Math.floor(key / w)} → shard ${shardFor(key, shards, strategy)}`;
  }
  return `hash(${key}) % ${shards} = ${shardFor(key, shards, strategy)}`;
}

const loadsOf = (keys: number[], n: number, s: string) => {
  const l = new Array<number>(n).fill(0);
  for (const k of keys) l[shardFor(k, n, s)]++;
  return l;
};

const viz: VizDef<In> = {
  id: 'hld-sharding',
  title: 'Range vs hash sharding',
  code,
  language: 'python',
  inputs: [
    { key: 'keys', label: 'Keys (user ids 0-99)', kind: 'numbers', default: [3, 8, 14, 21, 27, 33, 40, 46, 52, 58, 64, 71, 77, 85, 91, 97], maxItems: 16 },
    { key: 'shards', label: 'Shards', kind: 'number', default: 4 },
    { key: 'strategy', label: 'Strategy', kind: 'select', options: ['range', 'hash'], default: 'hash' },
    { key: 'newShards', label: 'Reshard to (0 = skip)', kind: 'number', default: 5 },
  ],
  presets: [
    { label: 'Hash, spread out', input: { strategy: 'hash', shards: 4, newShards: 5 } },
    { label: 'Range, spread out', input: { strategy: 'range', shards: 4, newShards: 5 } },
    { label: 'Skewed keys + range', input: { keys: [61, 62, 63, 64, 66, 67, 68, 70, 71, 72, 73, 75, 76, 77, 78, 79], strategy: 'range', shards: 4, newShards: 5 } },
    { label: 'Skewed keys + hash', input: { keys: [61, 62, 63, 64, 66, 67, 68, 70, 71, 72, 73, 75, 76, 77, 78, 79], strategy: 'hash', shards: 4, newShards: 0 } },
  ],
  run(input) {
    const strategy = needOneOf('strategy', input.strategy, ['range', 'hash'] as const);
    const shards = needInt('shards', input.shards, 1, 8);
    const newShards = needInt('newShards', input.newShards, 0, 8);
    if (!input.keys.length) throw new Error('Give at least one key');
    input.keys.forEach((k) => needInt('key', k, 0, 99));
    const keys = input.keys;
    const doReshard = newShards > 0 && newShards !== shards;
    const r = new Recorder(code);
    const rows: (string | number)[][] = keys.map((k) => [k, '', '', '']);
    const tones: Record<string, Tone> = {};
    const table = (): GridPanel => ({
      type: 'grid',
      title: 'key → shard',
      cells: rows,
      tones,
      colLabels: ['key', `shard (of ${shards})`, doReshard ? `shard (of ${newShards})` : '—', 'moves?'],
      rowLabels: keys.map((_, i) => `#${i + 1}`),
    });
    const bucketPanel = (n: number, upto: number, which: 'old' | 'new'): Panel => {
      const buckets = Array.from({ length: n }, () => [] as { label: string; tone?: Tone }[]);
      for (let i = 0; i < upto; i++) buckets[shardFor(keys[i], n, strategy)].push({ label: String(keys[i]), tone: which === 'new' && rows[i][3] === 'moved' ? 'swap' : 'visited' });
      return { type: 'buckets', title: `Shards (${n})`, buckets };
    };
    const loadChart = (title: string, l: number[], hotIdx: number): ChartPanel => ({
      type: 'chart',
      title,
      kind: 'bar',
      xLabel: 'shard',
      yLabel: 'keys',
      series: [{ label: 'keys per shard', points: l.map((v, i) => [i, v] as [number, number]), tone: hotIdx >= 0 ? 'error' : 'done' }],
    });
    const hotOf = (l: number[]) => {
      const avg = keys.length / l.length;
      const max = Math.max(...l);
      return max > avg * 1.5 && max >= 3 ? l.indexOf(max) : -1;
    };

    r.step(undefined, `${keys.length} keys, ${shards} shards, ${strategy === 'range' ? 'range partitioning (equal key ranges)' : 'hash partitioning (hash % shards)'}`, [table(), bucketPanel(shards, 0, 'old')], { shards, strategy });
    for (let i = 0; i < keys.length; i++) {
      const s = shardFor(keys[i], shards, strategy);
      rows[i][1] = s;
      tones[`${i},1`] = 'active';
      r.op();
      r.step(strategy === 'range' ? 'range' : 'hash', `Key ${keys[i]}: ${explain(keys[i], shards, strategy)}`, [table(), bucketPanel(shards, i + 1, 'old')], { key: keys[i], shard: s });
      tones[`${i},1`] = 'visited';
    }
    const loads = loadsOf(keys, shards, strategy);
    const hot = hotOf(loads);
    r.step('loads', hot >= 0 ? `Shard ${hot} holds ${loads[hot]} of ${keys.length} keys: a hot shard` : `Loads ${loads.join(' / ')}: reasonably balanced`, [loadChart('Keys per shard', loads, hot), bucketPanel(shards, keys.length, 'old')], { loads: loads.join(','), hot: hot >= 0 ? hot : 'none' });

    let moved = 0;
    let newLoads: number[] = [];
    if (doReshard) {
      for (let i = 0; i < keys.length; i++) {
        const a = shardFor(keys[i], shards, strategy);
        const b = shardFor(keys[i], newShards, strategy);
        rows[i][2] = b;
        rows[i][3] = a !== b ? 'moved' : 'stays';
        tones[`${i},2`] = a !== b ? 'swap' : 'done';
        tones[`${i},3`] = a !== b ? 'error' : 'done';
        if (a !== b) moved++;
        r.op();
        r.step('moved', `Key ${keys[i]}: shard ${a} → ${b} (${a !== b ? 'must be copied' : 'stays put'})`, [table(), bucketPanel(newShards, i + 1, 'new')], { key: keys[i], from: a, to: b, moved });
      }
      newLoads = loadsOf(keys, newShards, strategy);
      const pct = Math.round((moved / keys.length) * 100);
      r.step('moved', `Resharding ${shards} → ${newShards} moves ${moved} of ${keys.length} keys (${pct}%)`, [kvPanel('Resharding cost', { 'keys moved': moved, 'of total': keys.length, share: `${pct}%` }, { share: pct > 50 ? 'error' : 'found' }), loadChart(`Keys per shard after (${newShards})`, newLoads, hotOf(newLoads))], { moved, pct });
    } else {
      r.step('loads', 'No resharding requested; pick "Reshard to" above to see the migration cost', [kvPanel('Result', { loads: loads.join(' / ') })], { moved: 0 });
    }
    return { frames: r.frames, result: { loads, newLoads, moved } };
  },
  reference(input) {
    const keys = input.keys;
    const loads = new Array(input.shards).fill(0);
    const nl = input.newShards > 0 && input.newShards !== input.shards ? new Array(input.newShards).fill(0) : [];
    let moved = 0;
    const h = (k: number) => Number((BigInt(k) * 2654435761n) % 4294967296n);
    const f = (k: number, n: number) => (input.strategy === 'range' ? Math.min(Math.trunc(k / Math.trunc(100 / n)), n - 1) : h(k) % n);
    for (const k of keys) {
      loads[f(k, input.shards)]++;
      if (nl.length) {
        nl[f(k, input.newShards)]++;
        if (f(k, input.shards) !== f(k, input.newShards)) moved++;
      }
    }
    return { loads, newLoads: nl, moved };
  },
};

const routerCode = `class ShardRouter:
    def __init__(self, shards):
        self.shards = list(shards)

    def add_shard(self, name):
        self.shards.append(name)

    def route(self, key):
        return self.shards[(key * 2654435761) % 2**32 % len(self.shards)]`;

const ops = (...n: string[]) => n;
const abc = ['A', 'B', 'C'];

const routerTests = [
  { args: [ops('ShardRouter', 'route', 'add_shard', 'route'), [[abc], [10], ['D'], [10]]], expected: [null, 'B', null, 'C'], name: 'route after adding a shard' },
  { args: [ops('ShardRouter', 'add_shard', 'route', 'route'), [[abc], ['D'], [12], [14]]], expected: [null, null, 'A', 'C'], name: 'the new shard takes keys' },
  { args: [ops('ShardRouter', 'route', 'route'), [[abc], [11], [13]]], expected: [null, 'C', 'C'], name: 'no resize' },
  { args: [ops('ShardRouter', 'add_shard', 'add_shard', 'route'), [[['A']], ['B'], ['C'], [11]]], expected: [null, null, null, 'C'], name: 'grow from one shard to three' },
];

const unit: Unit = {
  id: 'hld-sharding',
  hook: 'One database server eventually runs out of disk, memory or write throughput. Sharding is the standard answer, and the follow-up is always "which key, and what happens when you add a shard?"',
  predict: {
    prompt: 'You shard users by `hash(user_id) % 4` and grow to 5 shards, recomputing `hash % 5`. Roughly what fraction of keys move to a different shard?',
    options: ['About 20%', 'About 40%', 'About 80%', 'None, the hash is stable'],
    answer: 2,
    explain: 'A key stays put only when hash % 4 == hash % 5, which happens for about 1 in 5 keys. So roughly 80% of the data must move. Consistent hashing exists to avoid exactly this.',
  },
  viz,
  deeper: {
    points: [
      'Range sharding keeps neighbouring keys together (cheap range scans, easy to split one hot range) but sequential keys such as timestamps or auto-increment ids pile onto the newest shard.',
      'Hash sharding spreads load evenly but loses range queries: a "between" query must hit every shard (scatter-gather).',
      'A hot key (one celebrity user) is hot on any strategy; fix it with key splitting, caching or a dedicated shard.',
      '`hash % N` makes N part of the address of every key, so changing N reshuffles most of the data. Consistent hashing or a directory/lookup service moves only about 1/N of keys.',
      'Cross-shard joins and transactions get expensive; choose a shard key so the common query touches one shard.',
    ],
    complexity: { time: 'O(1) routing per key', space: 'O(keys / shards) per node' },
    pitfalls: ['Using `hash % len(shards)` and then growing the list', 'Sharding on a low-cardinality or time-ordered key', 'Forgetting that queries without the shard key fan out to all shards'],
  },
  practice: {
    language: 'python',
    fnName: 'shard_loads',
    statement: 'Return how many of `keys` (ints 0-99) land on each of `shards` shards. For `"range"`, shard = `key // (100 // shards)` capped at `shards - 1`. For `"hash"`, shard = `(key * 2654435761) % 2**32 % shards`.',
    signature: 'def shard_loads(keys, shards, strategy):',
    solution: `def shard_loads(keys, shards, strategy):
    loads = [0] * @@shards@@
    for key in keys:
        if strategy == "range":
            s = min(@@key // (100 // shards)@@, shards - 1)
        else:
            s = @@(key * 2654435761) % 2**32 % shards@@
        loads[s] @@+= 1@@
    return loads`,
    tests: [
      { args: [[0, 25, 50, 75, 99], 4, 'range'], expected: [1, 1, 1, 2], name: 'range, last key capped to the last shard' },
      { args: [[0, 25, 50, 75, 99], 4, 'hash'], expected: [1, 1, 1, 2], name: 'hash' },
      { args: [[10, 11, 12, 13, 14, 15], 3, 'range'], expected: [6, 0, 0], name: 'range: clustered keys, one hot shard' },
      { args: [[10, 11, 12, 13, 14, 15], 3, 'hash'], expected: [2, 1, 3], name: 'hash: clustered keys spread out' },
      { args: [[], 2, 'hash'], expected: [0, 0], name: 'no keys' },
      { args: [[5, 6, 7, 8], 1, 'hash'], expected: [4], name: 'single shard' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'ShardRouter',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement: 'After `add_shard`, the new shard never receives any keys, even though capacity was added. Find the bug.',
    buggy: `class ShardRouter:
    def __init__(self, shards):
        self.shards = list(shards)
        self.n = len(self.shards)

    def add_shard(self, name):
        self.shards.append(name)

    def route(self, key):
        return self.shards[(key * 2654435761) % 2**32 % self.n]`,
    fixed: routerCode,
    tests: routerTests,
    bugType: 'stale modulus after resize',
    hint: 'Where does the modulus come from, and when was it last updated?',
    explanation: '`self.n` was captured once in `__init__`. After `add_shard` the list is longer but the modulus is not, so the new shard is unreachable. Compute `len(self.shards)` at routing time. (In production, also plan for the data that moves when the modulus changes.)',
  },
  boss: {
    title: 'Split the hottest range',
    statement:
      'Range shards are `[lo, hi)` pairs. Count how many `keys` fall in each range (keys outside every range are ignored). Split the range with the most keys (the first one wins ties) at its midpoint `(lo + hi) // 2` into two ranges and return the new list of `[lo, hi]` pairs. If the hot range is narrower than 2 wide, return the ranges unchanged.',
    language: 'python',
    fnName: 'split_hot_range',
    starter: `def split_hot_range(ranges, keys):
    # your code here
    pass
`,
    solution: `def split_hot_range(ranges, keys):
    counts = [0] * len(ranges)
    for k in keys:
        for i, (lo, hi) in enumerate(ranges):
            if lo <= k < hi:
                counts[i] += 1
                break
    hot = counts.index(max(counts))
    lo, hi = ranges[hot]
    if hi - lo < 2:
        return [list(r) for r in ranges]
    mid = (lo + hi) // 2
    return [list(r) for r in ranges[:hot]] + [[lo, mid], [mid, hi]] + [list(r) for r in ranges[hot + 1:]]`,
    tests: [
      { args: [[[0, 50], [50, 100]], [51, 52, 53, 10]], expected: [[0, 50], [50, 75], [75, 100]], name: 'second range is hot' },
      { args: [[[0, 10], [10, 20]], [1, 11]], expected: [[0, 5], [5, 10], [10, 20]], name: 'tie goes to the first range' },
      { args: [[[0, 1], [1, 10]], [0, 0, 0, 5]], expected: [[0, 1], [1, 10]], name: 'cannot split a width-1 range' },
      { args: [[[0, 10], [10, 20]], [25, 11]], expected: [[0, 10], [10, 15], [15, 20]], name: 'out-of-range keys ignored' },
      { args: [[[0, 100]], []], expected: [[0, 50], [50, 100]], name: 'single range, no keys' },
    ],
    hints: ['First compute a count per range (a key belongs to the range with `lo <= key < hi`).', '`counts.index(max(counts))` gives the first hottest range. Rebuild the list as before + two halves + after.'],
    combines: ['hld-consistent-hashing'],
  },
  quiz: [
    {
      prompt: 'Your table is keyed by timestamp and sharded by range. Which problem do you hit first?',
      options: ['Range queries become impossible', 'All new writes land on the newest shard', 'Hash collisions', 'Replication lag'],
      answer: 1,
      explain: 'Time-ordered keys put every fresh write at the end of the key space, so the last shard takes all the write traffic while older shards idle.',
    },
  ],
};

export default unit;
