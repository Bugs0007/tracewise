import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { gedge, gnode, graph, kvPanel, logPanel, needInt, needOneOf } from '@/content/lib/sysdesign-hld-2';

const code = `
def deliver(mode, messages, consumers, partitions=3):
    inbox = {c: [] for c in range(consumers)}          #@init
    for i, msg in enumerate(messages):                 #@loop
        if mode == "queue":
            inbox[i % consumers].append(msg)           #@compete
        elif mode == "pubsub":
            for c in inbox:
                inbox[c].append(msg)                   #@fanout
        else:
            p = ord(msg[0]) % partitions               #@partition
            inbox[p % consumers].append(msg)           #@assign
    return inbox                                       #@done
`;

interface In {
  messages: string[];
  mode: string;
  consumers: number;
}

const PARTS = 3;

function route(mode: string, msg: string, i: number, n: number): { targets: number[]; part?: number } {
  if (mode === 'queue') return { targets: [i % n] };
  if (mode === 'pubsub') return { targets: Array.from({ length: n }, (_, c) => c) };
  const part = msg.charCodeAt(0) % PARTS;
  return { targets: [part % n], part };
}

const viz: VizDef<In> = {
  id: 'hld-queues-pubsub',
  title: 'Queue vs pub/sub vs partitioned topic',
  code,
  language: 'python',
  inputs: [
    { key: 'messages', label: 'Messages (first letter = key)', kind: 'strings', default: ['A1', 'B1', 'A2', 'C1', 'B2', 'A3'], maxItems: 10 },
    { key: 'mode', label: 'Mode', kind: 'select', options: ['queue', 'pubsub', 'partitioned'], default: 'queue' },
    { key: 'consumers', label: 'Consumers', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Work queue (competing)', input: { mode: 'queue', consumers: 3 } },
    { label: 'Pub/sub fan-out', input: { mode: 'pubsub', consumers: 3 } },
    { label: 'Partitioned (ordering)', input: { mode: 'partitioned', consumers: 2 } },
    { label: 'More consumers than partitions', input: { mode: 'partitioned', consumers: 5 } },
  ],
  run(input) {
    const mode = needOneOf('mode', input.mode, ['queue', 'pubsub', 'partitioned'] as const);
    const n = needInt('consumers', input.consumers, 1, 5);
    const messages = input.messages;
    if (!messages.length) throw new Error('Give at least one message');
    if (messages.some((m) => !/^[A-Za-z]/.test(m))) throw new Error('Each message must start with a letter (its key)');
    const r = new Recorder(code);
    const inbox: string[][] = Array.from({ length: n }, () => []);
    const log: { text: string; tone?: Tone }[] = [];
    const brokerLabel = mode === 'queue' ? 'Queue' : mode === 'pubsub' ? 'Topic' : 'Topic';
    const view = (active?: { msg: string; targets: number[]; part?: number }): Panel[] => {
      const h = Math.max(160, n * 56);
      const brokerIds = mode === 'partitioned' ? Array.from({ length: PARTS }, (_, p) => `P${p}`) : ['B'];
      const nodes = [gnode('prod', 'Producer', 40, h / 2, { shape: 'actor' })];
      brokerIds.forEach((id, k) => nodes.push(gnode(id, mode === 'partitioned' ? `partition ${k}` : brokerLabel, 190, mode === 'partitioned' ? 30 + k * ((h - 60) / (PARTS - 1)) : h / 2, { shape: mode === 'partitioned' ? 'pill' : 'cylinder', tone: active?.part === k ? 'active' : active && mode !== 'partitioned' ? 'active' : 'default' })));
      for (let c = 0; c < n; c++) nodes.push(gnode(`c${c}`, `${mode === 'pubsub' ? 'sub' : 'consumer'} ${c}`, 360, 30 + c * (n > 1 ? (h - 60) / (n - 1) : 0) + (n === 1 ? (h - 60) / 2 : 0), { tone: active?.targets.includes(c) ? 'swap' : 'default', badge: inbox[c].join(' ') || '—' }));
      const edges = brokerIds.map((id) => gedge('prod', id, { tone: active && (mode !== 'partitioned' || id === `P${active.part}`) ? 'active' : 'default', flow: !!active && (mode !== 'partitioned' || id === `P${active.part}`) }));
      if (mode === 'partitioned') for (let p = 0; p < PARTS; p++) edges.push(gedge(`P${p}`, `c${p % n}`, { label: `p${p}`, tone: active?.part === p ? 'swap' : 'default' }));
      else for (let c = 0; c < n; c++) edges.push(gedge('B', `c${c}`, { tone: active?.targets.includes(c) ? 'swap' : 'default', flow: !!active?.targets.includes(c) }));
      return [graph(nodes, edges, 420, h), kvPanel('Inbox per consumer', Object.fromEntries(inbox.map((m, c) => [`c${c}`, m.join(', ') || '(empty)']))), logPanel('Deliveries', log)];
    };
    r.step('init', `${messages.length} messages, ${n} consumer${n > 1 ? 's' : ''}, mode "${mode}"`, view(), { mode, consumers: n });
    messages.forEach((msg, i) => {
      const { targets, part } = route(mode, msg, i, n);
      r.step('loop', `${msg} is published (key ${msg[0]})`, view({ msg, targets: [], part }), { msg, key: msg[0] });
      if (mode === 'partitioned') r.step('partition', `ord("${msg[0]}") % ${PARTS} = partition ${part}`, view({ msg, targets: [], part }), { partition: part });
      for (const t of targets) inbox[t].push(msg);
      r.op(targets.length);
      const anchor = mode === 'queue' ? 'compete' : mode === 'pubsub' ? 'fanout' : 'assign';
      const how = mode === 'queue' ? `only one consumer gets it: consumer ${targets[0]}` : mode === 'pubsub' ? `every subscriber gets a copy (${n})` : `key ${msg[0]} → partition ${part} → consumer ${targets[0]}`;
      log.push({ text: `${msg} → ${targets.map((t) => 'c' + t).join(', ')}`, tone: 'found' });
      r.step(anchor, `${msg}: ${how}`, view({ msg, targets, part }), { msg, delivered: targets.length });
    });
    const keyConsumers = new Map<string, Set<number>>();
    inbox.forEach((ms, c) => ms.forEach((m) => keyConsumers.set(m[0], (keyConsumers.get(m[0]) ?? new Set()).add(c))));
    const keysSplit = mode === 'pubsub' ? 0 : [...keyConsumers.values()].filter((s) => s.size > 1).length;
    const inboxObj = Object.fromEntries(inbox.map((m, c) => [`c${c}`, m]));
    r.step('done', keysSplit ? `${keysSplit} key(s) are spread over several consumers: per-key order is not guaranteed` : mode === 'pubsub' ? 'Each subscriber saw the full stream in order' : 'Every key stayed on one consumer: per-key order is preserved', [kvPanel('Result', { keysSplit, copies: inbox.reduce((s, m) => s + m.length, 0) }, { keysSplit: keysSplit ? 'error' : 'found' }), view()[1]], { keysSplit });
    return { frames: r.frames, result: { inbox: inboxObj, keysSplit } };
  },
  reference(input) {
    const n = input.consumers;
    const inbox: Record<string, string[]> = {};
    for (let c = 0; c < n; c++) inbox[`c${c}`] = [];
    input.messages.forEach((m, i) => {
      if (input.mode === 'queue') inbox[`c${i % n}`].push(m);
      else if (input.mode === 'pubsub') for (const k of Object.keys(inbox)) inbox[k].push(m);
      else inbox[`c${(m.charCodeAt(0) % 3) % n}`].push(m);
    });
    const owner: Record<string, Set<string>> = {};
    for (const [c, ms] of Object.entries(inbox)) for (const m of ms) (owner[m[0]] ??= new Set()).add(c);
    const keysSplit = input.mode === 'pubsub' ? 0 : Object.values(owner).filter((s) => s.size > 1).length;
    return { inbox, keysSplit };
  },
};

const ops = (...n: string[]) => n;

const drainFixed = `def drain(jobs, crash_once):
    ready = list(jobs)
    done = []
    crashed = set()
    while ready:
        job = ready[0]
        if job in crash_once and job not in crashed:
            crashed.add(job)
            continue
        done.append(job)
        ready.pop(0)
    return done`;

const unit: Unit = {
  id: 'hld-queues-pubsub',
  hook: 'Queues decouple a slow consumer from a fast producer; pub/sub lets many systems react to one event. Interviewers probe the delivery guarantees: who gets each message, in what order, and what happens on a crash.',
  predict: {
    prompt: 'Three workers consume from ONE queue and three services subscribe to ONE topic. 6 messages are published to each. How many messages are delivered in total (queue vs topic)?',
    options: ['6 and 6', '6 and 18', '18 and 6', '18 and 18'],
    answer: 1,
    explain: 'In a work queue each message goes to exactly one of the competing consumers: 6 deliveries. In pub/sub every subscriber gets its own copy: 6 x 3 = 18.',
  },
  viz,
  deeper: {
    points: [
      'Point-to-point queue: competing consumers share the work; each message is handled once by one of them. Adding consumers raises throughput.',
      'Pub/sub: one event, many independent subscribers (billing, email, analytics). Each subscriber gets every message and can fail or lag on its own.',
      'Partitioned log (Kafka-style): a topic is split into partitions; a message key picks the partition, so all messages for a key stay in order on one partition.',
      'Consumer groups: within a group each partition is read by exactly one consumer, so the group scales out until consumers equal partitions. Extra consumers sit idle. Different groups each get the full stream.',
      'Delivery guarantees: at-most-once (ack first), at-least-once (ack after processing, may duplicate, so handlers must be idempotent), exactly-once (usually idempotency plus dedup).',
    ],
    complexity: { time: 'O(1) per publish', space: 'O(unconsumed messages)' },
    pitfalls: ['Acking before processing, so a crash loses the message', 'Assuming order across partitions or across competing consumers', 'Non-idempotent consumers behind an at-least-once queue'],
  },
  practice: {
    language: 'python',
    fnName: 'AckQueue',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    statement:
      'Implement `AckQueue`. `publish(body)` appends to the ready list. `receive()` removes the oldest ready message, assigns it a message id (1, 2, 3, ...) and returns `[id, body]` (or None if empty); it stays "in flight" until acked. `ack(id)` deletes it and returns True (False if unknown). `nack(id)` puts it back at the FRONT of the ready list and returns True (False if unknown). `size()` returns `[ready, in_flight]`.',
    signature: 'class AckQueue:',
    solution: `from collections import deque

class AckQueue:
    def __init__(self):
        self.ready = deque()
        self.inflight = {}
        self.next_id = 1

    def publish(self, body):
        self.ready.@@append@@(body)

    def receive(self):
        if not self.ready:
            return None
        body = self.ready.@@popleft()@@
        mid = self.next_id
        self.next_id += 1
        self.inflight[mid] = body
        return [mid, body]

    def ack(self, mid):
        return self.inflight.pop(mid, None) is not None

    def nack(self, mid):
        if mid in self.inflight:
            self.ready.@@appendleft@@(self.inflight.pop(mid))
            return True
        return False

    def size(self):
        return [len(self.ready), @@len(self.inflight)@@]`,
    tests: [
      { args: [ops('AckQueue', 'publish', 'publish', 'receive', 'size', 'ack', 'size', 'ack'), [[], ['a'], ['b'], [], [], [1], [], [1]]], expected: [null, null, null, [1, 'a'], [1, 1], true, [1, 0], false], name: 'receive, ack, double ack' },
      { args: [ops('AckQueue', 'publish', 'receive', 'nack', 'receive', 'size'), [[], ['x'], [], [1], [], []]], expected: [null, null, [1, 'x'], true, [2, 'x'], [0, 1]], name: 'nack redelivers with a new id' },
      { args: [ops('AckQueue', 'receive', 'ack', 'nack'), [[], [], [7], [7]]], expected: [null, null, false, false], name: 'empty queue and unknown ids' },
      { args: [ops('AckQueue', 'publish', 'publish', 'publish', 'receive', 'receive', 'nack', 'nack', 'receive'), [[], ['a'], ['b'], ['c'], [], [], [2], [1], []]], expected: [null, null, null, null, [1, 'a'], [2, 'b'], true, true, [3, 'a']], name: 'nacked messages go back to the front' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'drain',
    statement: 'A worker removes each message from the queue as soon as it receives it. When the handler crashes, the job disappears and never runs again. Find the bug (expected: every job eventually completes, in order).',
    buggy: `def drain(jobs, crash_once):
    ready = list(jobs)
    done = []
    crashed = set()
    while ready:
        job = ready[0]
        ready.pop(0)
        if job in crash_once and job not in crashed:
            crashed.add(job)
            continue
        done.append(job)
    return done`,
    fixed: drainFixed,
    tests: [
      { args: [[1, 2, 3], [2]], expected: [1, 2, 3], name: 'a job crashes once and is retried' },
      { args: [[1, 2, 3], []], expected: [1, 2, 3], name: 'no crashes' },
      { args: [[5, 6], [5, 6]], expected: [5, 6], name: 'every job crashes once' },
      { args: [[], [1]], expected: [], name: 'empty queue' },
    ],
    bugType: 'ack before processing',
    hint: 'At the moment the handler crashes, is the job still in the queue?',
    explanation: 'The job was removed (acked) before the handler ran, so a crash loses it: at-most-once delivery. Peek at the message, process it, and only then remove (ack) it. A crash before the ack leaves it queued for redelivery (at-least-once).',
  },
  boss: {
    title: 'Consumer group rebalance',
    statement:
      'A topic has `partitions` partitions (numbered 0..partitions-1) and a consumer group has the given `consumers` (names). Assign partitions with the range strategy: sort the consumer names, give each consumer `partitions // len(consumers)` consecutive partitions, and the first `partitions % len(consumers)` consumers one extra. Return a dict `{consumer: [partitions]}`; consumers with nothing get an empty list.',
    language: 'python',
    fnName: 'assign_partitions',
    starter: `def assign_partitions(partitions, consumers):
    # your code here
    pass
`,
    solution: `def assign_partitions(partitions, consumers):
    names = sorted(consumers)
    out = {}
    base, extra = divmod(partitions, len(names))
    start = 0
    for i, name in enumerate(names):
        count = base + (1 if i < extra else 0)
        out[name] = list(range(start, start + count))
        start += count
    return out`,
    tests: [
      { args: [6, ['b', 'a', 'c']], expected: { a: [0, 1], b: [2, 3], c: [4, 5] }, name: 'even split, names sorted' },
      { args: [5, ['x', 'y']], expected: { x: [0, 1, 2], y: [3, 4] }, name: 'remainder goes to the first consumers' },
      { args: [2, ['a', 'b', 'c']], expected: { a: [0], b: [1], c: [] }, name: 'more consumers than partitions' },
      { args: [4, ['solo']], expected: { solo: [0, 1, 2, 3] }, name: 'single consumer' },
      { args: [0, ['a', 'b']], expected: { a: [], b: [] }, name: 'no partitions' },
    ],
    hints: ['`divmod(partitions, len(names))` gives the base share and the remainder.', 'Walk the sorted names with a running `start`; consumer i gets `base + 1` partitions while `i < extra`.'],
    combines: ['hld-sharding'],
  },
  quiz: [
    {
      prompt: 'Messages for the same order id must be processed in order, but you want 10 consumers. What do you do?',
      options: ['Use a plain queue with 10 competing consumers', 'Partition by order id so each order always lands on one consumer', 'Use pub/sub so everyone gets everything', 'Process in the producer instead'],
      answer: 1,
      explain: 'Keyed partitioning keeps all events for one order on one partition (and one consumer), preserving order while still spreading different orders across consumers.',
    },
  ],
};

export default unit;
