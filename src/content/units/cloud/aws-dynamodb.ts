import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, arch, frame, hash31, kvPanel, logPanel, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';

const code = `
def route_writes(keys, partitions, wcu, shard=False):
    cap = wcu // partitions                                   #@cap
    used, throttled = [0] * partitions, 0
    for i, key in enumerate(keys):                            #@loop
        if shard:
            key = key + "#" + str(i % partitions)             #@shard
        p = hash31(key) % partitions                          #@hash
        if used[p] < cap:
            used[p] += 1                                      #@accept
        else:
            throttled += 1                                    #@throttle
    return {"used": used, "throttled": throttled}
`;

interface In {
  keys: string[];
  partitions: number;
  wcu: number;
  strategy: string;
}

const STRATS = ['key as given', 'add shard suffix (key#0..n)'];

function clean(i: In) {
  const partitions = Math.round(i.partitions);
  if (!(partitions >= 1 && partitions <= 6)) throw new Error('Use 1 to 6 partitions for this diagram');
  if (!(i.wcu >= 1)) throw new Error('Provisioned WCU must be at least 1');
  return { keys: i.keys, partitions, wcu: Math.round(i.wcu), shard: i.strategy === STRATS[1] };
}

const viz: VizDef<In> = {
  id: 'aws-dynamodb',
  title: 'DynamoDB partitions and hot keys',
  code,
  language: 'python',
  inputs: [
    { key: 'keys', label: 'Partition key of each write (one second of traffic)', kind: 'strings', default: ['user1', 'user1', 'user1', 'user1', 'user1', 'user1', 'user2', 'user3'], maxItems: 14 },
    { key: 'partitions', label: 'Partitions (1-6)', kind: 'number', default: 4 },
    { key: 'wcu', label: 'Provisioned write capacity (WCU, 1 per KB written per second)', kind: 'number', default: 8 },
    { key: 'strategy', label: 'Key strategy', kind: 'select', default: STRATS[0], options: STRATS },
  ],
  presets: [
    { label: 'One hot key', input: {} },
    { label: 'Hot key, sharded', input: { strategy: STRATS[1] } },
    { label: 'Evenly spread keys', input: { keys: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] } },
    { label: 'Table under-provisioned', input: { keys: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], wcu: 4 } },
  ],
  run(input) {
    const { keys, partitions, wcu, shard } = clean(input);
    const cap = Math.floor(wcu / partitions);
    const r = new Recorder(code);
    const used: number[] = Array(partitions).fill(0);
    let throttled = 0;
    const log: { text: string; tone?: Tone }[] = [];
    const H = Math.max(210, partitions * 52 + 20);
    const nodes: ArchNode[] = [
      { id: 'client', label: 'Clients', x: 50, y: H / 2, shape: 'actor' },
      { id: 'table', label: 'Table', x: 200, y: H / 2, shape: 'rect' },
      { id: 'gsi', label: 'GSI', x: 200, y: 28, shape: 'cylinder' },
      ...Array.from({ length: partitions }, (_, p) => ({ id: `p${p}`, label: `P${p}`, x: 400, y: partitions === 1 ? H / 2 : 30 + (p * (H - 70)) / (partitions - 1), shape: 'cylinder' as const })),
    ];
    const edges: ArchEdge[] = [{ from: 'client', to: 'table' }, { from: 'table', to: 'gsi', dashed: true, label: 'async' }, ...Array.from({ length: partitions }, (_, p) => ({ from: 'table', to: `p${p}` }))];
    const view = (flow: string | null, active = -1, full = -1): Panel[] => {
      const tones: Record<string, Tone> = {};
      const badges: Record<string, string> = {};
      for (let p = 0; p < partitions; p++) {
        tones[`p${p}`] = p === full ? 'error' : p === active ? 'active' : used[p] >= cap ? 'frontier' : used[p] > 0 ? 'visited' : 'default';
        badges[`p${p}`] = `${used[p]} / ${cap} WCU`;
      }
      return [
        arch('Writes landing on partitions', 560, H, nodes, edges, { tones, badges, flow }),
        { type: 'array', title: 'Capacity used per partition', values: used.map((u) => u), bars: true, indexLabels: used.map((_, p) => `P${p}`), tones: Object.fromEntries(used.map((u, p) => [p, (p === full ? 'error' : u >= cap ? 'frontier' : 'compare') as Tone])) },
        kvPanel('Table', { 'provisioned WCU': wcu, partitions, 'per partition': cap, throttled }, { throttled: throttled ? 'error' : 'found' }),
        logPanel('Writes', log),
      ];
    };
    frame(r, 'cap', `${wcu} WCU over ${partitions} partitions = ${cap} writes/s per partition`, view(null), { cap });
    keys.forEach((orig, i) => {
      r.op();
      let key = orig;
      frame(r, 'loop', `Write ${i + 1}: partition key "${orig}"`, view('client>table'), { i, key: orig });
      if (shard) {
        key = `${orig}#${i % partitions}`;
        frame(r, 'shard', `Add a shard suffix: the key becomes "${key}"`, view('client>table'), { key });
      }
      const p = hash31(key) % partitions;
      frame(r, 'hash', `hash("${key}") mod ${partitions} = partition P${p}`, view(`table>p${p}`, p), { partition: p });
      if (used[p] < cap) {
        used[p]++;
        log.push({ text: `${key} -> P${p} accepted (${used[p]}/${cap})`, tone: 'found' });
        frame(r, 'accept', `P${p} has room: accepted (${used[p]}/${cap})`, view(`table>p${p}`, p), { used_p: used[p] });
      } else {
        throttled++;
        log.push({ text: `${key} -> P${p} throttled`, tone: 'error' });
        frame(r, 'throttle', `P${p} is full (${used[p]}/${cap}): ProvisionedThroughputExceeded`, view(null, -1, p), { throttled });
      }
    });
    if (!keys.length) frame(r, 'cap', 'No writes were given', view(null), {});
    frame(r, 'loop', `${keys.length - throttled} of ${keys.length} writes accepted, ${throttled} throttled`, view(null), { throttled });
    return { frames: r.frames, result: { used, throttled } };
  },
  reference(input) {
    const { keys, partitions, wcu, shard } = clean(input);
    const cap = Math.floor(wcu / partitions);
    const groups: number[] = Array(partitions).fill(0);
    keys.forEach((k, i) => groups[hash31(shard ? `${k}#${i % partitions}` : k) % partitions]++);
    const used = groups.map((n) => Math.min(n, cap));
    return { used, throttled: groups.reduce((a, n, p) => a + n - used[p], 0) };
  },
};

const HOT = ['user1', 'user1', 'user1', 'user1', 'user1', 'user1', 'user1', 'user2', 'user3', 'user4'];

const unit: Unit = {
  id: 'aws-dynamodb',
  hook: 'DynamoDB interviews are about key design: one badly chosen partition key throttles a table that has plenty of total capacity. Being able to size capacity units and spot a hot partition is the core skill.',
  predict: {
    prompt: 'A table has 1000 WCU spread across 10 partitions. A viral item receives 400 writes per second, all with the same partition key. What happens?',
    options: ['All writes succeed: 400 < 1000', 'Most of them are throttled: one partition can only serve its share (about 100 WCU)', 'DynamoDB automatically splits that single key across all partitions', 'Writes succeed but reads become eventually consistent'],
    answer: 1,
    explain: 'Capacity is divided among partitions and one key lives on one partition. Total provisioned capacity does not help a hot key; spread keys or shard the key.',
  },
  viz,
  deeper: {
    points: [
      'The **partition key** is hashed to pick a physical partition. Uniformly distributed, high-cardinality keys (user id, order id) spread load; low-cardinality ones (status, date) concentrate it.',
      'Capacity units: **1 WCU** = one write per second up to 1 KB; **1 RCU** = one strongly consistent read per second up to 4 KB (two eventually consistent). Transactions cost double.',
      'A **hot key** is mitigated by write sharding (append a random or computed suffix), caching reads, or on-demand mode with adaptive capacity (which helps but is not magic).',
      'A **GSI** gives an alternative partition/sort key. It has its own capacity and is updated asynchronously, so throttling on a GSI can back-pressure the base table.',
      'Model access patterns first: DynamoDB queries by key, so the table is designed around the queries, not the entities.',
    ],
    pitfalls: ['Using a timestamp or a boolean as the partition key', 'Scanning a big table instead of querying a key', 'Forgetting that item size rounds up to the next 1 KB / 4 KB for billing'],
  },
  practice: {
    language: 'python',
    fnName: 'read_capacity',
    statement: 'Compute the RCUs needed for `reads_per_sec` reads of items of `item_kb` KB. Each read uses `ceil(item_kb / 4)` units when strongly consistent. `mode` "eventual" halves that total (round up), "transactional" doubles it, anything else ("strong") uses it as is.',
    signature: 'def read_capacity(item_kb, reads_per_sec, mode):',
    solution: `import math

def read_capacity(item_kb, reads_per_sec, mode):
    blocks = @@math.ceil(item_kb / 4)@@
    units = blocks * reads_per_sec
    if mode == "eventual":
        return @@math.ceil(units / 2)@@
    if mode == "transactional":
        return @@units * 2@@
    return units`,
    tests: [
      { args: [4, 10, 'strong'], expected: 10, name: '4 KB strong' },
      { args: [4.5, 10, 'strong'], expected: 20, name: 'item size rounds up to the next 4 KB' },
      { args: [8, 10, 'eventual'], expected: 10, name: 'eventual reads cost half' },
      { args: [1, 15, 'eventual'], expected: 8, name: 'half rounds up' },
      { args: [4, 10, 'transactional'], expected: 20, name: 'transactions cost double' },
      { args: [12, 3, 'strong'], expected: 9, name: 'three blocks per read' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'write_capacity',
    statement: 'Provisioning for 0.5 KB items at 100 writes per second comes out as 0 WCU, so the table throttles everything. Fix `write_capacity(item_kb, writes_per_sec, transactional)`.',
    buggy: `import math

def write_capacity(item_kb, writes_per_sec, transactional):
    units = int(item_kb) * writes_per_sec
    return units * 2 if transactional else units`,
    fixed: `import math

def write_capacity(item_kb, writes_per_sec, transactional):
    units = math.ceil(item_kb) * writes_per_sec
    return units * 2 if transactional else units`,
    tests: [
      { args: [1, 100, false], expected: 100, name: 'exactly 1 KB' },
      { args: [0.5, 100, false], expected: 100, name: 'small items still cost one unit' },
      { args: [2.2, 10, false], expected: 30, name: 'rounds up to 3 KB' },
      { args: [1, 50, true], expected: 100, name: 'transactional doubles' },
    ],
    bugType: 'rounding down instead of up',
    hint: 'DynamoDB bills writes in whole 1 KB units. What does int(0.5) give, and which function rounds up?',
    explanation: '`int()` truncates, so anything under 1 KB counts as 0 and 2.2 KB as 2. Item size must be rounded up with `math.ceil`.',
  },
  boss: {
    title: 'Partition router with write sharding',
    statement: 'Write `route_writes(keys, partitions, wcu, shard)`. `hash31(key)` is provided (a deterministic 32-bit hash). Each partition can accept `wcu // partitions` writes this second. For the i-th write: if `shard` is true, the key becomes `key + "#" + str(i % partitions)`; its partition is `hash31(key) % partitions`; accept it if that partition has room, else count it as throttled. Return `{"used": [accepted per partition], "throttled": count}`.',
    language: 'python',
    fnName: 'route_writes',
    harness: `
def hash31(s):
    h = 0
    for ch in s:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h
`,
    starter: `def route_writes(keys, partitions, wcu, shard):
    pass
`,
    solution: `def route_writes(keys, partitions, wcu, shard):
    cap = wcu // partitions
    used, throttled = [0] * partitions, 0
    for i, key in enumerate(keys):
        if shard:
            key = key + "#" + str(i % partitions)
        p = hash31(key) % partitions
        if used[p] < cap:
            used[p] += 1
        else:
            throttled += 1
    return {"used": used, "throttled": throttled}`,
    tests: [
      { args: [HOT, 4, 8, false], expected: { used: [1, 1, 2, 1], throttled: 5 }, name: 'hot key throttles its partition' },
      { args: [HOT, 4, 8, true], expected: { used: [2, 2, 1, 2], throttled: 3 }, name: 'sharding spreads the hot key' },
      { args: [HOT, 4, 4, false], expected: { used: [1, 1, 1, 1], throttled: 6 }, name: 'one unit per partition' },
      { args: [[], 4, 8, false], expected: { used: [0, 0, 0, 0], throttled: 0 }, name: 'no writes' },
      { args: [['a', 'b', 'c', 'd'], 4, 8, false], expected: { used: [1, 1, 1, 1], throttled: 0 }, name: 'evenly spread keys' },
      { args: [['x', 'x', 'x'], 1, 2, false], expected: { used: [2], throttled: 1 }, name: 'single partition' },
    ],
    hints: ['Per-partition capacity is `wcu // partitions`. Keep a list `used` with one counter per partition.', 'Apply the shard suffix to the key before hashing, using the write index `i` (use `enumerate`).'],
    combines: ['hash-chaining'],
  },
  quiz: [
    {
      prompt: 'Which partition key is the best choice for a high-traffic orders table?',
      options: ['order_status', 'created_date', 'customer_id with order_id as sort key', 'a constant like "ORDER"'],
      answer: 2,
      explain: 'High-cardinality, evenly requested keys spread load. Status, date and constants funnel traffic into a few partitions.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
