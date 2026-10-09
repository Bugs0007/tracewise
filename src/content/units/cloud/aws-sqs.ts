import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';
import { SIM_NOTE, arch, listPanel, logPanel, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';

const code = `
class RedriveQueue:
    def __init__(self, visibility, max_receives):
        self.vis = visibility                                  #@init
        self.max = max_receives
        self.msgs = []        # each: [body, hidden_until, receives]
        self.dlq = []

    def send(self, body):
        self.msgs.append([body, 0, 0])                         #@send

    def receive(self, now):
        for m in list(self.msgs):                              #@scan
            if m[1] > now:
                continue                                       #@hidden
            if m[2] >= self.max:
                self.msgs.remove(m)                            #@redrive
                self.dlq.append(m[0])
                continue
            m[2] += 1                                          #@take
            m[1] = now + self.vis                              #@hide
            return m[0]
        return None                                            #@empty

    def delete(self, body):
        self.msgs = [m for m in self.msgs if m[0] != body]     #@delete
`;

interface In {
  count: number;
  visibility: number;
  maxReceives: number;
  work: number;
  consumer: string;
}

const CONSUMERS = ['healthy', 'crashes on message 2 (poison)'];

interface Msg {
  body: string;
  hidden: number;
  receives: number;
  state: 'queued' | 'deleted' | 'dlq';
}
interface Worker {
  name: string;
  msg: string | null;
  finish: number;
}

function clean(i: In) {
  const count = Math.round(i.count);
  if (!(count >= 1 && count <= 6)) throw new Error('Use 1 to 6 messages');
  const visibility = Math.round(i.visibility);
  const maxReceives = Math.round(i.maxReceives);
  const work = Math.round(i.work);
  if (!(visibility >= 1 && maxReceives >= 1 && work >= 1)) throw new Error('Visibility, max receives and work time must be at least 1');
  return { count, visibility, maxReceives, work, poison: i.consumer === CONSUMERS[1] };
}

const NODES: ArchNode[] = [
  { id: 'prod', label: 'Producer', x: 50, y: 105, shape: 'actor' },
  { id: 'q', label: 'Queue', x: 230, y: 105, shape: 'cylinder' },
  { id: 'c1', label: 'Consumer 1', x: 440, y: 45 },
  { id: 'c2', label: 'Consumer 2', x: 440, y: 105 },
  { id: 'dlq', label: 'Dead-letter queue', x: 440, y: 170, shape: 'cylinder' },
];
const EDGES: ArchEdge[] = [
  { from: 'prod', to: 'q' },
  { from: 'q', to: 'c1' },
  { from: 'q', to: 'c2' },
  { from: 'q', to: 'dlq', dashed: true, label: 'after max receives' },
];

interface Out {
  processed: string[];
  dlq: string[];
  receives: number[];
}

function simulate(c: ReturnType<typeof clean>, rec?: (ev: string, t: number, msgs: Msg[], workers: Worker[], extra: { flow?: string | null; text: string; tones?: Record<string, Tone> }) => void): Out {
  const msgs: Msg[] = Array.from({ length: c.count }, (_, i) => ({ body: `m${i + 1}`, hidden: 0, receives: 0, state: 'queued' }));
  const workers: Worker[] = [
    { name: 'c1', msg: null, finish: -1 },
    { name: 'c2', msg: null, finish: -1 },
  ];
  const processed: string[] = [];
  const dlq: string[] = [];
  rec?.('send', 0, msgs, workers, { flow: 'prod>q', text: `${c.count} messages sent. Visibility ${c.visibility}s, redrive after ${c.maxReceives} receives` });
  for (let t = 0; t <= 90; t++) {
    for (const w of workers) {
      if (w.msg && w.finish === t) {
        const m = msgs.find((x) => x.body === w.msg)!;
        if (c.poison && m.body === 'm2') {
          rec?.('crash', t, msgs, workers, { flow: null, text: `t=${t}: ${w.name} crashes on m2 before deleting it`, tones: { [w.name]: 'error' } });
        } else {
          processed.push(m.body);
          if (m.state === 'queued') {
            m.state = 'deleted';
            rec?.('delete', t, msgs, workers, { flow: `${w.name}>q`, text: `t=${t}: ${w.name} finished ${m.body} and deletes it`, tones: { [w.name]: 'found' } });
          } else rec?.('dup', t, msgs, workers, { flow: null, text: `t=${t}: ${w.name} finished ${m.body}, already deleted: duplicate work`, tones: { [w.name]: 'swap' } });
        }
        w.msg = null;
      }
    }
    const back = msgs.filter((m) => m.state === 'queued' && m.receives > 0 && m.hidden === t);
    for (const m of back) rec?.('reappear', t, msgs, workers, { flow: null, text: `t=${t}: visibility timeout for ${m.body} expired, it is visible again`, tones: { q: 'frontier' } });
    for (const w of workers) {
      if (w.msg) continue;
      for (const m of msgs) {
        if (m.state !== 'queued' || m.hidden > t) continue;
        if (m.receives >= c.maxReceives) {
          m.state = 'dlq';
          dlq.push(m.body);
          rec?.('redrive', t, msgs, workers, { flow: 'q>dlq', text: `t=${t}: ${m.body} was received ${m.receives} times: moved to the DLQ`, tones: { dlq: 'error' } });
          continue;
        }
        m.receives++;
        m.hidden = t + c.visibility;
        w.msg = m.body;
        w.finish = t + c.work;
        rec?.('take', t, msgs, workers, { flow: `q>${w.name}`, text: `t=${t}: ${w.name} receives ${m.body} (receive #${m.receives}), hidden until t=${m.hidden}`, tones: { [w.name]: 'active' } });
        break;
      }
    }
    if (msgs.every((m) => m.state !== 'queued') && workers.every((w) => !w.msg)) break;
  }
  return { processed, dlq, receives: msgs.map((m) => m.receives) };
}

const viz: VizDef<In> = {
  id: 'aws-sqs',
  title: 'SQS visibility timeout, retries and DLQ',
  code,
  language: 'python',
  inputs: [
    { key: 'count', label: 'Messages (1-6)', kind: 'number', default: 3 },
    { key: 'visibility', label: 'Visibility timeout (s)', kind: 'number', default: 5 },
    { key: 'maxReceives', label: 'Max receives before the DLQ', kind: 'number', default: 2 },
    { key: 'work', label: 'Processing time per message (s)', kind: 'number', default: 2 },
    { key: 'consumer', label: 'Consumer behaviour', kind: 'select', default: CONSUMERS[0], options: CONSUMERS },
  ],
  presets: [
    { label: 'Healthy consumers', input: {} },
    { label: 'Poison message goes to DLQ', input: { consumer: CONSUMERS[1] } },
    { label: 'Processing slower than the timeout', input: { work: 8, count: 2, maxReceives: 3 } },
    { label: 'Single message, generous timeout', input: { count: 1, visibility: 30, work: 3 } },
  ],
  run(input) {
    const c = clean(input);
    const r = new Recorder(code);
    const log: { text: string; tone?: Tone }[] = [];
    const anchor: Record<string, string> = { send: 'send', take: 'take', delete: 'delete', crash: 'scan', dup: 'delete', reappear: 'hidden', redrive: 'redrive' };
    const out = simulate(c, (ev, t, msgs, workers, x) => {
      r.op();
      const visible = msgs.filter((m) => m.state === 'queued' && m.hidden <= t).length;
      const hidden = msgs.filter((m) => m.state === 'queued' && m.hidden > t).length;
      const tones: Record<string, Tone> = { q: hidden ? 'compare' : 'default', ...(x.tones ?? {}) };
      for (const w of workers) if (w.msg && !tones[w.name]) tones[w.name] = 'active';
      log.push({ text: x.text.replace(/^t=\d+: /, `t=${t} `), tone: ev === 'delete' ? 'found' : ev === 'redrive' || ev === 'crash' ? 'error' : ev === 'take' ? 'compare' : 'default' });
      const rows = msgs.map((m) => (m.state === 'deleted' ? `${m.body}  deleted` : m.state === 'dlq' ? `${m.body}  in DLQ` : m.hidden > t ? `${m.body}  hidden until t=${m.hidden}` : `${m.body}  visible`));
      const rowTones: Record<number, Tone> = Object.fromEntries(msgs.map((m, i) => [i, (m.state === 'deleted' ? 'done' : m.state === 'dlq' ? 'error' : m.hidden > t ? 'compare' : 'frontier') as Tone]));
      const subs: Record<number, string> = Object.fromEntries(msgs.map((m, i) => [i, `received ${m.receives}x`]));
      const panels: Panel[] = [
        arch('Message flow', 600, 205, NODES, EDGES, { tones, flow: x.flow, badges: { q: `${visible} visible, ${hidden} in flight`, dlq: `${msgs.filter((m) => m.state === 'dlq').length} dead`, c1: workers[0].msg ?? 'idle', c2: workers[1].msg ?? 'idle' } }),
        listPanel('Queue contents', rows, rowTones, subs),
        logPanel('Events', log),
      ];
      r.step(r.line(anchor[ev]), x.text.length > 90 ? x.text.slice(0, 89) + '…' : x.text, panels, { t, visible, in_flight: hidden });
    });
    r.step('empty', `${out.processed.length} processing runs for ${c.count} messages, ${out.dlq.length} in the DLQ`, [arch('Message flow', 600, 205, NODES, EDGES, { tones: { q: 'done' } }), logPanel('Events', log)], { processed: out.processed.length, dlq: out.dlq.length });
    return { frames: r.frames, result: out };
  },
  reference(input) {
    const c = clean(input);
    // Independent formulation: step the clock with a function-per-concern style and plain maps.
    const hidden = new Map<string, number>();
    const rcv = new Map<string, number>();
    const live = new Set<string>();
    const order = Array.from({ length: c.count }, (_, i) => `m${i + 1}`);
    for (const b of order) {
      hidden.set(b, 0);
      rcv.set(b, 0);
      live.add(b);
    }
    const busy: ({ b: string; end: number } | null)[] = [null, null];
    const processed: string[] = [];
    const dlq: string[] = [];
    for (let t = 0; t <= 90 && (live.size || busy.some(Boolean)); t++) {
      busy.forEach((job, k) => {
        if (job && job.end === t) {
          if (!(c.poison && job.b === 'm2')) {
            processed.push(job.b);
            live.delete(job.b);
          }
          busy[k] = null;
        }
      });
      busy.forEach((job, k) => {
        if (job) return;
        for (const b of order) {
          if (!live.has(b) || hidden.get(b)! > t) continue;
          if (rcv.get(b)! >= c.maxReceives) {
            live.delete(b);
            dlq.push(b);
            continue;
          }
          rcv.set(b, rcv.get(b)! + 1);
          hidden.set(b, t + c.visibility);
          busy[k] = { b, end: t + c.work };
          break;
        }
      });
    }
    return { processed, dlq, receives: order.map((b) => rcv.get(b)!) };
  },
};

const ops = (...n: string[]) => n;

const unit: Unit = {
  id: 'aws-sqs',
  hook: 'SQS is the default way to decouple a producer from slow work, and the interview traps are always the same: duplicates, messages that reappear, and poison messages. Visibility timeout and the dead-letter queue are the answer to all three.',
  predict: {
    prompt: 'A consumer needs 40 seconds per message but the queue\'s visibility timeout is 30 seconds. A second consumer is idle. What can happen?',
    options: ['Nothing: SQS locks the message until it is deleted', 'The message reappears after 30s and the second consumer processes it too (a duplicate)', 'The message is moved to the DLQ immediately', 'The first consumer is cancelled'],
    answer: 1,
    explain: 'Visibility timeout is a timer, not a lock. After it expires the message is delivered again while the first consumer may still be working. Standard queues are at-least-once, so handlers must be idempotent.',
  },
  viz,
  deeper: {
    points: [
      'A received message is not removed: it becomes **invisible** for the visibility timeout. The consumer must **delete** it after success; otherwise it becomes visible again and is retried.',
      'Standard queues deliver **at least once** and may reorder. Design handlers to be idempotent (dedupe by a message or business id). FIFO queues add ordering and deduplication at lower throughput.',
      'Set the visibility timeout above your typical processing time (and extend it for long jobs).',
      'A **redrive policy** moves a message to a **dead-letter queue** after `maxReceiveCount` failed receives, so one poison message cannot block or loop forever. Alarm on DLQ depth.',
      'Long polling (`WaitTimeSeconds`) cuts empty responses and cost; batch send/receive/delete improves throughput.',
    ],
    pitfalls: ['Deleting the message before the work is durable', 'A timeout shorter than the handler, causing self-inflicted duplicates', 'No DLQ, so a bad message is retried forever'],
  },
  practice: {
    language: 'python',
    fnName: 'VisQueue',
    statement: 'Implement `VisQueue(visibility)`. `send(body)` adds a message. `receive(now)` returns the first message that is visible (hidden-until time `<= now`) and hides it until `now + visibility`; it returns None if nothing is visible. `delete(body)` removes the message. `size()` counts messages still stored (visible or in flight).',
    signature: 'class VisQueue:',
    solution: `class VisQueue:
    def __init__(self, visibility):
        self.visibility = visibility
        self.msgs = []

    def send(self, body):
        self.msgs.append([body, 0])

    def receive(self, now):
        for m in self.msgs:
            if m[1] @@<=@@ now:
                m[1] = @@now + self.visibility@@
                return m[0]
        return None

    def delete(self, body):
        self.msgs = [m for m in self.msgs if @@m[0] != body@@]

    def size(self):
        return len(self.msgs)`,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    tests: [
      { args: [ops('VisQueue', 'send', 'send', 'receive', 'receive', 'receive', 'receive', 'size'), [[30], ['a'], ['b'], [0], [1], [2], [31], []]], expected: [null, null, null, 'a', 'b', null, 'a', 2], name: 'message returns after the timeout' },
      { args: [ops('VisQueue', 'send', 'receive', 'delete', 'receive', 'size'), [[10], ['x'], [0], ['x'], [50], []]], expected: [null, null, 'x', null, null, 0], name: 'deleted messages never return' },
      { args: [ops('VisQueue', 'send', 'receive', 'receive', 'receive'), [[5], ['x'], [0], [4], [5]]], expected: [null, null, 'x', null, 'x'], name: 'visible again exactly at the timeout' },
      { args: [ops('VisQueue', 'receive', 'size'), [[5], [0], []]], expected: [null, null, 0], name: 'empty queue' },
      { args: [ops('VisQueue', 'send', 'send', 'receive', 'delete', 'receive'), [[9], ['a'], ['b'], [0], ['a'], [1]]], expected: [null, null, null, 'a', null, 'b'], name: 'order of arrival' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'VisQueue',
    statement: 'A consumer crashes after receiving a message, and the message is never seen again even long after the visibility timeout. Fix `VisQueue.receive`.',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    buggy: `class VisQueue:
    def __init__(self, visibility):
        self.visibility = visibility
        self.msgs = []

    def send(self, body):
        self.msgs.append([body, 0, False])

    def receive(self, now):
        for m in self.msgs:
            if not m[2]:
                m[2] = True
                m[1] = now + self.visibility
                return m[0]
        return None

    def delete(self, body):
        self.msgs = [m for m in self.msgs if m[0] != body]`,
    fixed: `class VisQueue:
    def __init__(self, visibility):
        self.visibility = visibility
        self.msgs = []

    def send(self, body):
        self.msgs.append([body, 0, False])

    def receive(self, now):
        for m in self.msgs:
            if not m[2] or m[1] <= now:
                m[2] = True
                m[1] = now + self.visibility
                return m[0]
        return None

    def delete(self, body):
        self.msgs = [m for m in self.msgs if m[0] != body]`,
    tests: [
      { args: [ops('VisQueue', 'send', 'receive', 'receive', 'receive'), [[30], ['a'], [0], [10], [31]]], expected: [null, null, 'a', null, 'a'], name: 'comes back after the timeout' },
      { args: [ops('VisQueue', 'send', 'receive', 'delete', 'receive'), [[30], ['a'], [0], ['a'], [100]]], expected: [null, null, 'a', null, null], name: 'delete removes it for good' },
      { args: [ops('VisQueue', 'send', 'send', 'receive', 'receive'), [[30], ['a'], ['b'], [0], [1]]], expected: [null, null, null, 'a', 'b'], name: 'second message while first is hidden' },
    ],
    bugType: 'visibility never restored',
    hint: 'The code marks the message as in flight but looks at the flag only. Where does the hidden-until time get compared with `now`?',
    explanation: 'A message that was received is skipped forever because only the "in flight" flag is checked. A message is receivable if it was never received OR its visibility deadline has passed (`m[1] <= now`).',
  },
  boss: {
    title: 'Queue with a dead-letter redrive',
    statement: 'Implement `RedriveQueue(visibility, max_receives)` with `send(body)`, `receive(now)`, `delete(body)`, `dead()` (list of bodies moved to the DLQ, in order) and `size()` (messages still in the main queue). `receive` scans messages in order, skipping those hidden (`hidden_until > now`). A visible message already received `max_receives` times is moved to the DLQ instead of being returned (keep scanning). Otherwise its receive count goes up, it is hidden until `now + visibility`, and its body is returned. Return None if nothing could be returned.',
    language: 'python',
    fnName: 'RedriveQueue',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    starter: `class RedriveQueue:
    pass
`,
    solution: `class RedriveQueue:
    def __init__(self, visibility, max_receives):
        self.vis = visibility
        self.max = max_receives
        self.msgs = []
        self.dlq = []

    def send(self, body):
        self.msgs.append([body, 0, 0])

    def receive(self, now):
        for m in list(self.msgs):
            if m[1] > now:
                continue
            if m[2] >= self.max:
                self.msgs.remove(m)
                self.dlq.append(m[0])
                continue
            m[2] += 1
            m[1] = now + self.vis
            return m[0]
        return None

    def delete(self, body):
        self.msgs = [m for m in self.msgs if m[0] != body]

    def dead(self):
        return list(self.dlq)

    def size(self):
        return len(self.msgs)`,
    tests: [
      { args: [ops('RedriveQueue', 'send', 'receive', 'receive', 'receive', 'dead', 'size'), [[5, 2], ['p'], [0], [5], [10], [], []]], expected: [null, null, 'p', 'p', null, ['p'], 0], name: 'poison message is redriven after two receives' },
      { args: [ops('RedriveQueue', 'send', 'receive', 'delete', 'receive', 'dead'), [[5, 2], ['a'], [0], ['a'], [9], []]], expected: [null, null, 'a', null, null, []], name: 'deleted messages never reach the DLQ' },
      { args: [ops('RedriveQueue', 'send', 'send', 'receive', 'receive', 'receive', 'receive', 'dead'), [[5, 1], ['a'], ['b'], [0], [5], [5], [6], []]], expected: [null, null, null, 'a', 'b', null, null, ['a']], name: 'scan continues past a redriven message' },
      { args: [ops('RedriveQueue', 'send', 'receive', 'receive', 'size'), [[10, 3], ['x'], [0], [3], []]], expected: [null, null, 'x', null, 1], name: 'still hidden: not available, still stored' },
      { args: [ops('RedriveQueue', 'receive', 'dead', 'size'), [[1, 1], [0], [], []]], expected: [null, null, [], 0], name: 'empty queue' },
    ],
    hints: ['Each message is `[body, hidden_until, receives]`. Skip it while `hidden_until > now`.', 'Check the receive count before handing out: if it already equals `max_receives`, remove it from the main list, append to the DLQ and `continue`. Iterate over a copy of the list while removing.'],
    combines: ['be-task-queues', 'be-retries-idempotent'],
  },
  quiz: [
    {
      prompt: 'What makes a standard SQS consumer safe against duplicate delivery?',
      options: ['A larger queue', 'An idempotent handler', 'Deleting messages first', 'Shorter polling'],
      answer: 1,
      explain: 'Delivery is at-least-once, so processing the same message twice must have the same effect as once (for example by checking a dedupe key).',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
