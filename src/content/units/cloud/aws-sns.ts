import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, arch, frame, listPanel, logPanel, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';
import { parseAttrPolicy, parseAttrs } from '@/content/lib/cloud-finish';

const code = `
def matches(policy, attrs):
    for key, allowed in policy.items():          #@key
        if key not in attrs:
            return False                         #@missing
        if attrs[key] not in allowed:
            return False                         #@value
    return True                                  #@ok

def publish(subs, attrs, down):
    delivered, dead = [], []
    for name, policy in subs:                    #@sub
        if not matches(policy, attrs):
            continue                             #@skip
        if name in down:
            dead.append(name)                    #@dlq
        else:
            delivered.append(name)               #@deliver
    return delivered, dead                       #@done
`;

interface In {
  subs: string[];
  messages: string[];
  failure: string;
}

const FAILURES = ['all endpoints healthy', 'first subscriber endpoint is down'];

interface Sub {
  name: string;
  policy: Record<string, string[]>;
  text: string;
}

function parseSub(s: string): Sub {
  const i = s.indexOf(':');
  if (i < 1) throw new Error(`Subscription "${s}" should look like name: type=order|refund region=eu`);
  const name = s.slice(0, i).trim();
  if (!/^[\w-]+$/.test(name)) throw new Error(`"${name}" is not a valid subscriber name`);
  const text = s.slice(i + 1).trim();
  return { name, policy: parseAttrPolicy(text), text: text || '*' };
}

type Row = { delivered: string[]; dead: string[] };

function matchesRef(policy: Record<string, string[]>, attrs: Record<string, string>): boolean {
  return Object.entries(policy).every(([k, vs]) => k in attrs && vs.includes(attrs[k]));
}

function nodesFor(n: number): { nodes: ArchNode[]; edges: ArchEdge[]; height: number } {
  const height = Math.max(130, n * 50 + 30);
  const nodes: ArchNode[] = [
    { id: 'pub', label: 'Publisher', x: 55, y: height / 2, shape: 'actor' },
    { id: 'topic', label: 'SNS topic', x: 235, y: height / 2, shape: 'pill' },
    { id: 'dlq', label: 'Subscription DLQ', x: 590, y: height / 2, shape: 'cylinder' },
  ];
  const edges: ArchEdge[] = [{ from: 'pub', to: 'topic' }];
  for (let i = 0; i < n; i++) {
    nodes.push({ id: `s${i}`, label: '', x: 420, y: 35 + i * 50 });
    edges.push({ from: 'topic', to: `s${i}` });
  }
  return { nodes, edges, height };
}

const viz: VizDef<In> = {
  id: 'aws-sns',
  title: 'SNS fan-out with filter policies',
  code,
  language: 'python',
  inputs: [
    { key: 'subs', label: 'Subscriptions (name: filter policy)', kind: 'strings', default: ['email: type=order|refund', 'analytics: *', 'eu-ship: type=order region=eu', 'fraud: type=order amount=high'], maxItems: 4, help: 'Policy: key=value pairs, a|b for alternatives, * for no filter. Different keys must all match.' },
    { key: 'messages', label: 'Messages (attributes)', kind: 'strings', default: ['type=order region=eu amount=low', 'type=refund region=us', 'type=order region=us amount=high'], maxItems: 4 },
    { key: 'failure', label: 'Delivery failures', kind: 'select', default: FAILURES[0], options: FAILURES },
  ],
  presets: [
    { label: 'Mixed filters', input: {} },
    { label: 'Missing attribute never matches', input: { subs: ['eu: region=eu', 'all: *'], messages: ['type=order', 'region=eu'] } },
    { label: 'First endpoint down: goes to DLQ', input: { failure: FAILURES[1], messages: ['type=order region=eu amount=low'] } },
    { label: 'Nobody is interested', input: { subs: ['a: type=x', 'b: type=y'], messages: ['type=z'] } },
  ],
  run(input) {
    const subs = input.subs.map(parseSub);
    if (!subs.length) throw new Error('Add at least one subscription');
    const msgs = input.messages.map((m) => ({ text: m, attrs: parseAttrs(m) }));
    if (!msgs.length) throw new Error('Add at least one message');
    const down = new Set(input.failure === FAILURES[1] ? [subs[0].name] : []);
    const { nodes, edges, height } = nodesFor(subs.length);
    nodes.forEach((n) => {
      const m = n.id.match(/^s(\d+)$/);
      if (m) n.label = subs[Number(m[1])].name;
    });
    const r = new Recorder(code);
    const log: { text: string; tone?: Tone }[] = [];
    const count: number[] = subs.map(() => 0);
    let deadN = 0;
    const out: Row[] = [];
    const view = (tones: Record<string, Tone>, flow: string | null, rows: Record<number, Tone>, edgeTones: Record<string, Tone> = {}): Panel[] => [
      arch('Topic and subscribers', 640, height, nodes, edges, { tones: { topic: 'default', ...tones }, flow, edgeTones, badges: { ...Object.fromEntries(subs.map((_s, i) => [`s${i}`, `${count[i]} received`])), dlq: `${deadN} dead` } }),
      listPanel('Filter policies', subs.map((s) => `${s.name}: ${s.text}`), rows),
      logPanel('Deliveries', log),
    ];
    frame(r, 'sub', `${subs.length} subscriptions on one topic, ${msgs.length} messages to publish`, view({}, null, {}), { subs: subs.length });
    for (const m of msgs) {
      const row: Row = { delivered: [], dead: [] };
      const rows: Record<number, Tone> = {};
      const edgeTones: Record<string, Tone> = {};
      frame(r, 'sub', `Publish ${m.text}`, view({ pub: 'active', topic: 'compare' }, 'pub>topic', rows), { message: m.text });
      for (let i = 0; i < subs.length; i++) {
        const s = subs[i];
        r.op();
        rows[i] = 'compare';
        const keys = Object.keys(s.policy);
        const missing = keys.find((k) => !(k in m.attrs));
        const wrong = keys.find((k) => k in m.attrs && !s.policy[k].includes(m.attrs[k]));
        if (missing !== undefined) {
          rows[i] = 'muted';
          edgeTones[`topic>s${i}`] = 'muted';
          frame(r, 'missing', `${s.name}: message has no "${missing}" attribute, so it is filtered out`, view({ [`s${i}`]: 'muted' }, null, { ...rows }, { ...edgeTones }), { subscriber: s.name });
        } else if (wrong !== undefined) {
          rows[i] = 'muted';
          edgeTones[`topic>s${i}`] = 'muted';
          frame(r, 'value', `${s.name}: ${wrong}=${m.attrs[wrong]} is not in [${s.policy[wrong].join(', ')}]: filtered out`, view({ [`s${i}`]: 'muted' }, null, { ...rows }, { ...edgeTones }), { subscriber: s.name });
        } else if (down.has(s.name)) {
          rows[i] = 'error';
          deadN++;
          row.dead.push(s.name);
          log.push({ text: `${s.name}: endpoint unreachable, retries exhausted, sent to DLQ`, tone: 'error' });
          frame(r, 'dlq', `${s.name} matches but its endpoint is down: retries fail, message goes to the DLQ`, view({ [`s${i}`]: 'error', dlq: 'error' }, `topic>s${i}`, { ...rows }, { ...edgeTones }), { subscriber: s.name, dead: deadN });
        } else {
          rows[i] = 'found';
          count[i]++;
          row.delivered.push(s.name);
          log.push({ text: `${m.text} -> ${s.name}`, tone: 'found' });
          frame(r, 'deliver', `${s.name}: policy matches, message delivered`, view({ [`s${i}`]: 'found' }, `topic>s${i}`, { ...rows }, { ...edgeTones }), { subscriber: s.name, received: count[i] });
        }
      }
      out.push(row);
      frame(r, 'done', `Delivered to ${row.delivered.length ? row.delivered.join(', ') : 'nobody'}${row.dead.length ? `, DLQ: ${row.dead.join(', ')}` : ''}`, view({ topic: 'done' }, null, { ...rows }), { delivered: row.delivered.length });
    }
    return { frames: r.frames, result: out };
  },
  reference(input) {
    const subs = input.subs.map(parseSub);
    const down = input.failure === FAILURES[1] ? subs[0].name : null;
    return input.messages.map((m) => {
      const attrs = parseAttrs(m);
      const hit = subs.filter((s) => matchesRef(s.policy, attrs)).map((s) => s.name);
      return { delivered: hit.filter((n) => n !== down), dead: hit.filter((n) => n === down) };
    });
  },
};

const unit: Unit = {
  id: 'aws-sns',
  hook: 'SNS is the "one event, many consumers" answer: publish once and every interested subscriber gets a copy. Interviewers push on filter policies (who gets what) and on what happens when an endpoint is down.',
  predict: {
    prompt: 'A subscription has the filter policy {"type": ["order", "refund"], "region": ["eu"]}. A message arrives with attributes type=refund, region=us. Is it delivered?',
    options: ['Yes: type matches', 'No: every key in the policy must match, and region does not', 'Yes: any one key matching is enough', 'Only if the message has no region attribute'],
    answer: 1,
    explain: 'Values inside one key are alternatives (OR) but different keys combine with AND. region=us is not in ["eu"], so the subscription is filtered out. A missing attribute also fails the match.',
  },
  viz,
  deeper: {
    points: [
      'A **topic** pushes each message to every subscription: SQS queues, Lambda, HTTP endpoints, email. SQS plus SNS is the classic **fan-out** pattern so each consumer gets its own durable queue.',
      'A **filter policy** is per subscription. Different keys are ANDed, values for one key are ORed, and an empty policy means "send everything". Filtering happens in SNS, so unwanted messages cost nothing downstream.',
      'Filters match **message attributes** by default (or the body if you choose payload-based filtering). A message without the attribute does not match.',
      'Delivery is retried with backoff; after the retries a subscription **dead-letter queue** keeps the message instead of losing it.',
      'FIFO topics keep order and deduplicate but only deliver to SQS FIFO queues; standard topics are at-least-once with no ordering guarantee.',
    ],
    pitfalls: ['Putting routing data only in the body when the filter reads attributes', 'No DLQ on a subscription, so failures vanish', 'Assuming exactly-once delivery on standard topics'],
  },
  practice: {
    language: 'python',
    fnName: 'matches',
    statement: 'Implement `matches(policy, attrs)`: `policy` maps an attribute name to a list of allowed values, `attrs` maps names to the message\'s values. Every policy key must be present in `attrs` with a value from its list. An empty policy matches everything.',
    signature: 'def matches(policy, attrs):',
    solution: `def matches(policy, attrs):
    for key, allowed in policy.items():
        if @@key not in attrs@@:
            return False
        if attrs[key] @@not in@@ allowed:
            return False
    return @@True@@`,
    tests: [
      { args: [{ type: ['order', 'refund'] }, { type: 'refund' }], expected: true, name: 'one of several values' },
      { args: [{ type: ['order'], region: ['eu'] }, { type: 'order', region: 'us' }], expected: false, name: 'all keys must match' },
      { args: [{ region: ['eu'] }, { type: 'order' }], expected: false, name: 'missing attribute' },
      { args: [{}, { type: 'order' }], expected: true, name: 'empty policy matches all' },
      { args: [{ type: ['order'] }, { type: 'order', extra: 'x' }], expected: true, name: 'extra attributes are fine' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'matches',
    statement: 'A subscription with policy `type=order, region=eu` is receiving US orders as well. Fix `matches`.',
    buggy: `def matches(policy, attrs):
    if not policy:
        return True
    return any(attrs.get(k) in allowed for k, allowed in policy.items())`,
    fixed: `def matches(policy, attrs):
    if not policy:
        return True
    return all(attrs.get(k) in allowed for k, allowed in policy.items())`,
    tests: [
      { args: [{ type: ['order'], region: ['eu'] }, { type: 'order', region: 'us' }], expected: false, name: 'one key off' },
      { args: [{ type: ['order'], region: ['eu'] }, { type: 'order', region: 'eu' }], expected: true, name: 'both keys on' },
      { args: [{ type: ['order'] }, { type: 'refund' }], expected: false, name: 'single key mismatch' },
      { args: [{}, { type: 'order' }], expected: true, name: 'no policy' },
    ],
    bugType: 'any instead of all',
    hint: 'How many of the policy keys must agree before the message is delivered?',
    explanation: '`any` lets a subscription through when one key matches. Keys are ANDed: use `all`. (Values inside one key stay ORed, which `in allowed` already handles.)',
  },
  boss: {
    title: 'Fan-out with prefix filters and a dead-letter queue',
    statement: 'Write `fan_out(subs, messages, down)`. `subs` is a list of `[name, policy]`; a policy value is a list whose entries are either plain strings (exact match) or `{"prefix": p}` (value starts with p). A key matches if any entry matches; all keys must match; a missing attribute fails. For each message (dict of attributes) return `[delivered, dead]`: subscriber names in order that match, split into those not in `down` (delivered) and those in `down` (dead-lettered).',
    language: 'python',
    fnName: 'fan_out',
    starter: `def fan_out(subs, messages, down):
    pass
`,
    solution: `def fan_out(subs, messages, down):
    def one(entry, value):
        if isinstance(entry, dict):
            return value.startswith(entry["prefix"])
        return value == entry

    def ok(policy, attrs):
        for key, entries in policy.items():
            if key not in attrs:
                return False
            if not any(one(e, attrs[key]) for e in entries):
                return False
        return True

    out = []
    for attrs in messages:
        delivered, dead = [], []
        for name, policy in subs:
            if ok(policy, attrs):
                (dead if name in down else delivered).append(name)
        out.append([delivered, dead])
    return out`,
    tests: [
      { args: [[['a', { t: ['x'] }], ['b', {}]], [{ t: 'x' }, { t: 'y' }], []], expected: [[['a', 'b'], []], [['b'], []]], name: 'basic fan-out' },
      { args: [[['eu', { region: [{ prefix: 'eu-' }] }]], [{ region: 'eu-west-1' }, { region: 'us-east-1' }, {}], []], expected: [[['eu'], []], [[], []], [[], []]], name: 'prefix filter and missing attribute' },
      { args: [[['a', {}], ['b', {}]], [{ k: 'v' }], ['a']], expected: [[['b'], ['a']]], name: 'down endpoint goes to DLQ' },
      { args: [[['a', { t: ['x', { prefix: 'p' }], r: ['1'] }]], [{ t: 'pear', r: '1' }, { t: 'pear', r: '2' }], []], expected: [[['a'], []], [[], []]], name: 'mixed entries, all keys required' },
      { args: [[], [{ a: 'b' }], []], expected: [[[], []]], name: 'no subscribers' },
    ],
    hints: ['Write a helper that tests one policy entry against a value: a dict means `startswith(entry["prefix"])`, anything else means equality.', 'For each message loop over the subscribers; a subscriber matches if every key is present and `any` entry matches. Then put the name in `dead` when it is in `down`, else in `delivered`.'],
    combines: ['aws-sqs'],
  },
  quiz: [
    {
      prompt: 'Why pair SNS with one SQS queue per consumer?',
      options: ['SNS cannot send to Lambda', 'Each consumer gets its own durable buffer and retry behaviour', 'Queues make SNS cheaper', 'To keep messages ordered'],
      answer: 1,
      explain: 'Fan-out to queues decouples consumers: a slow or failing one cannot hold back the others, and messages wait safely until it catches up.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
