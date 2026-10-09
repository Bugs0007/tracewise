import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { SIM_NOTE, arch, frame, listPanel, logPanel, type ArchEdge, type ArchNode } from '@/content/lib/cloud-aws';

const code = `
def matches(pattern, event):
    for key, want in pattern.items():             #@key
        if key not in event:
            return False                          #@missing
        if isinstance(want, dict):
            if not matches(want, event[key]):     #@nested
                return False
        elif event[key] not in want:
            return False                          #@value
    return True                                   #@ok

def route(rules, event, down):
    hits = []
    for name, pattern, target in rules:           #@rule
        if matches(pattern, event):
            hits.append((name, target in down))   #@hit
    return hits                                   #@done
`;

type Pattern = { [k: string]: unknown[] | Pattern };
interface Rule {
  name: string;
  pattern: Pattern;
  target: string;
}
interface In {
  rules: Rule[];
  events: Record<string, unknown>[];
  failure: string;
}

const FAILURES = ['all targets healthy', "first rule's target keeps failing"];

const DEFAULT_RULES: Rule[] = [
  { name: 'failed-orders', pattern: { source: ['orders'], detail: { status: ['failed', 'timeout'] } }, target: 'alert-queue' },
  { name: 'all-orders', pattern: { source: ['orders'] }, target: 'audit-lambda' },
  { name: 'payments', pattern: { source: ['payments'], 'detail-type': ['Charge'] }, target: 'finance-sns' },
];
const DEFAULT_EVENTS = [
  { source: 'orders', 'detail-type': 'OrderUpdated', detail: { status: 'failed', id: 7 } },
  { source: 'payments', 'detail-type': 'Charge', detail: { amount: 250 } },
  { source: 'orders', 'detail-type': 'OrderUpdated', detail: { status: 'shipped' } },
];

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function checkPattern(p: Pattern): void {
  for (const [k, v] of Object.entries(p)) {
    if (isObj(v)) checkPattern(v as Pattern);
    else if (!Array.isArray(v)) throw new Error(`Pattern field "${k}" must be a list of allowed values or a nested pattern`);
  }
}

function clean(i: In): { rules: Rule[]; events: Record<string, unknown>[]; down: Set<string> } {
  if (!Array.isArray(i.rules) || !i.rules.length || i.rules.length > 4) throw new Error('Give 1 to 4 rules: [{"name":..., "pattern":{...}, "target":...}]');
  if (!Array.isArray(i.events) || !i.events.length || i.events.length > 4) throw new Error('Give 1 to 4 events as JSON objects');
  for (const r of i.rules) {
    if (!isObj(r) || typeof r.name !== 'string' || typeof r.target !== 'string' || !isObj(r.pattern)) throw new Error('Each rule needs a string name, a string target and an object pattern');
    checkPattern(r.pattern as Pattern);
  }
  for (const e of i.events) if (!isObj(e)) throw new Error('Every event must be a JSON object');
  return { rules: i.rules, events: i.events, down: new Set(i.failure === FAILURES[1] ? [i.rules[0].target] : []) };
}

interface Why {
  kind: 'missing' | 'value';
  path: string;
  got?: unknown;
  want?: unknown[];
}

/** Returns null when the event matches, otherwise the first reason it does not. */
function explain(pattern: Pattern, event: unknown, path = ''): Why | null {
  for (const [key, want] of Object.entries(pattern)) {
    const here = path ? `${path}.${key}` : key;
    if (!isObj(event) || !(key in event)) return { kind: 'missing', path: here };
    const got = event[key];
    if (isObj(want)) {
      const sub = explain(want as Pattern, got, here);
      if (sub) return sub;
    } else if (!(want as unknown[]).includes(got)) return { kind: 'value', path: here, got, want: want as unknown[] };
  }
  return null;
}

function refMatch(pattern: Pattern, event: unknown): boolean {
  // Independent formulation: flatten both sides to dotted paths first.
  const flat = (o: unknown, pre = ''): Map<string, unknown> => {
    const m = new Map<string, unknown>();
    if (isObj(o)) {
      for (const [k, v] of Object.entries(o)) for (const [kk, vv] of flat(v, pre ? `${pre}.${k}` : k)) m.set(kk, vv);
    } else if (pre) m.set(pre, o);
    return m;
  };
  const flatP = (o: Pattern, pre = ''): [string, unknown[]][] => Object.entries(o).flatMap(([k, v]) => (isObj(v) ? flatP(v as Pattern, pre ? `${pre}.${k}` : k) : [[pre ? `${pre}.${k}` : k, v as unknown[]] as [string, unknown[]]]));
  const ev = flat(event);
  return flatP(pattern).every(([p, vs]) => ev.has(p) && vs.includes(ev.get(p)));
}

const short = (e: Record<string, unknown>): string => {
  const s = JSON.stringify(e);
  return s.length > 70 ? s.slice(0, 69) + '…' : s;
};

const viz: VizDef<In> = {
  id: 'aws-eventbridge',
  title: 'EventBridge bus, rules and targets',
  code,
  language: 'python',
  inputs: [
    { key: 'rules', label: 'Rules (JSON: name, pattern, target)', kind: 'json', default: DEFAULT_RULES, help: 'A pattern lists allowed values per field; nested objects match nested fields.' },
    { key: 'events', label: 'Events (JSON)', kind: 'json', default: DEFAULT_EVENTS },
    { key: 'failure', label: 'Target health', kind: 'select', default: FAILURES[0], options: FAILURES },
  ],
  presets: [
    { label: 'Three events, three rules', input: {} },
    { label: 'Missing field never matches', input: { events: [{ source: 'orders', detail: {} }, { source: 'orders' }] } },
    { label: 'Failing target', input: { failure: FAILURES[1], events: [DEFAULT_EVENTS[0]] } },
    { label: 'No rule matches: event is dropped', input: { events: [{ source: 'inventory', 'detail-type': 'Restock' }] } },
  ],
  run(input) {
    const { rules, events, down } = clean(input);
    const height = Math.max(140, rules.length * 52 + 30);
    const nodes: ArchNode[] = [
      { id: 'src', label: 'Event source', x: 55, y: height / 2, shape: 'actor' },
      { id: 'bus', label: 'Event bus', x: 215, y: height / 2, shape: 'pill' },
    ];
    const edges: ArchEdge[] = [{ from: 'src', to: 'bus' }];
    rules.forEach((rule, i) => {
      nodes.push({ id: `r${i}`, label: rule.name, x: 390, y: 35 + i * 52, w: 130 });
      nodes.push({ id: `t${i}`, label: rule.target, x: 555, y: 35 + i * 52, shape: 'pill', w: 110 });
      edges.push({ from: 'bus', to: `r${i}` }, { from: `r${i}`, to: `t${i}` });
    });
    const r = new Recorder(code);
    const log: { text: string; tone?: Tone }[] = [];
    const out: { rules: string[]; dead: string[] }[] = [];
    const view = (tones: Record<string, Tone>, flow: string | null, rowTones: Record<number, Tone>, edgeTones: Record<string, Tone> = {}): Panel[] => [
      arch('Event path', 640, height, nodes, edges, { tones: { bus: 'default', ...tones }, flow, edgeTones }),
      listPanel('Rule patterns', rules.map((x) => `${x.name}: ${JSON.stringify(x.pattern)}`), rowTones),
      logPanel('Matches', log),
    ];
    frame(r, 'rule', `${rules.length} rules on the bus, ${events.length} events to send`, view({}, null, {}), { rules: rules.length });
    for (const ev of events) {
      const row = { rules: [] as string[], dead: [] as string[] };
      const rowTones: Record<number, Tone> = {};
      const edgeTones: Record<string, Tone> = {};
      frame(r, 'rule', `Event arrives: ${short(ev)}`, view({ src: 'active', bus: 'compare' }, 'src>bus', rowTones), { source: String(ev.source ?? '') });
      for (let i = 0; i < rules.length; i++) {
        r.op();
        const rule = rules[i];
        rowTones[i] = 'compare';
        const why = explain(rule.pattern, ev);
        if (why?.kind === 'missing') {
          rowTones[i] = 'muted';
          edgeTones[`bus>r${i}`] = 'muted';
          frame(r, 'missing', `${rule.name}: event has no "${why.path}" field, no match`, view({ [`r${i}`]: 'muted' }, null, { ...rowTones }, { ...edgeTones }), { rule: rule.name });
        } else if (why) {
          rowTones[i] = 'muted';
          edgeTones[`bus>r${i}`] = 'muted';
          frame(r, why.path.includes('.') ? 'nested' : 'value', `${rule.name}: ${why.path}=${JSON.stringify(why.got)} not in ${JSON.stringify(why.want)}`, view({ [`r${i}`]: 'muted' }, null, { ...rowTones }, { ...edgeTones }), { rule: rule.name });
        } else if (down.has(rule.target)) {
          rowTones[i] = 'error';
          row.rules.push(rule.name);
          row.dead.push(rule.name);
          log.push({ text: `${rule.name} -> ${rule.target} failed, retried, dead-lettered`, tone: 'error' });
          frame(r, 'hit', `${rule.name} matches but ${rule.target} keeps failing: retries then DLQ`, view({ [`r${i}`]: 'error', [`t${i}`]: 'error' }, `r${i}>t${i}`, { ...rowTones }, { ...edgeTones }), { rule: rule.name, dead: true });
        } else {
          rowTones[i] = 'found';
          row.rules.push(rule.name);
          log.push({ text: `${rule.name} -> ${rule.target}`, tone: 'found' });
          frame(r, 'hit', `${rule.name} matches: event delivered to ${rule.target}`, view({ [`r${i}`]: 'found', [`t${i}`]: 'found' }, `bus>r${i}`, { ...rowTones }, { ...edgeTones }), { rule: rule.name });
        }
      }
      out.push(row);
      frame(r, 'done', row.rules.length ? `${row.rules.length} rule(s) matched: ${row.rules.join(', ')}` : 'No rule matched: the event is dropped (an archive could keep it)', view({ bus: row.rules.length ? 'done' : 'error' }, null, { ...rowTones }), { matched: row.rules.length });
    }
    return { frames: r.frames, result: out };
  },
  reference(input) {
    const { rules, events, down } = clean(input);
    return events.map((ev) => {
      const hit = rules.filter((x) => refMatch(x.pattern, ev));
      return { rules: hit.map((x) => x.name), dead: hit.filter((x) => down.has(x.target)).map((x) => x.name) };
    });
  },
};

const unit: Unit = {
  id: 'aws-eventbridge',
  hook: 'EventBridge is how modern AWS systems react to things happening: a rule pattern picks events off a bus and routes them to targets. Interviewers like it because the matching rules (AND across fields, OR within a list) are easy to get subtly wrong.',
  predict: {
    prompt: 'A rule has the pattern {"source": ["orders"], "detail": {"status": ["failed"]}}. An event arrives with source "orders" and no detail field at all. What happens?',
    options: ['It matches: source is enough', 'It does not match: every field named in the pattern must exist in the event', 'EventBridge raises an error', 'It matches but the target gets an empty detail'],
    answer: 1,
    explain: 'A pattern is a set of constraints on the event. A field named in the pattern but absent from the event fails the match (unless you use an explicit exists:false check).',
  },
  viz,
  deeper: {
    points: [
      'Producers put events on an **event bus** (the default bus receives AWS service events). **Rules** with an **event pattern** decide which events go to which **targets**, and one event can match many rules.',
      'Patterns are JSON: each field lists allowed values (OR), several fields combine with AND, and nested objects match nested fields. Extra event fields are ignored.',
      'Content filters go beyond equality: `prefix`, `anything-but`, `numeric` ranges and `exists`.',
      'Delivery to a target is retried with backoff; give targets a **dead-letter queue** so failures can be inspected. An **archive** plus **replay** lets you re-run past events.',
      'A **schedule** rule (cron or rate) is the serverless replacement for a cron host; **Pipes** connect a single source to a target with filtering and enrichment.',
    ],
    pitfalls: ['Expecting a missing field to match', 'Forgetting that rule matching is per rule: two rules both fire', 'No DLQ on targets, so failed deliveries disappear after the retry window'],
  },
  practice: {
    language: 'python',
    fnName: 'matches',
    statement: 'Implement `matches(pattern, event)`. Each pattern value is either a list of allowed values or a nested pattern dict. The event must contain every key in the pattern; list values require `event[key]` to be in the list; dicts recurse into `event[key]`.',
    signature: 'def matches(pattern, event):',
    solution: `def matches(pattern, event):
    for key, want in pattern.items():
        if @@key not in event@@:
            return False
        if isinstance(want, dict):
            if not @@matches(want, event[key])@@:
                return False
        elif event[key] @@not in@@ want:
            return False
    return True`,
    tests: [
      { args: [{ source: ['orders'] }, { source: 'orders', x: 1 }], expected: true, name: 'extra fields are ignored' },
      { args: [{ detail: { status: ['failed', 'timeout'] } }, { detail: { status: 'timeout' } }], expected: true, name: 'nested, one of two values' },
      { args: [{ detail: { status: ['failed'] } }, { detail: { status: 'ok' } }], expected: false, name: 'nested mismatch' },
      { args: [{ source: ['orders'], detail: { id: [1] } }, { source: 'orders' }], expected: false, name: 'missing nested object' },
      { args: [{}, { a: 1 }], expected: true, name: 'empty pattern matches everything' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'matches',
    statement: 'Events without a `detail.status` field are being routed to the failure-handling target. Fix `matches`.',
    buggy: `def matches(pattern, event):
    for key, want in pattern.items():
        if key not in event:
            continue
        if isinstance(want, dict):
            if not matches(want, event[key]):
                return False
        elif event[key] not in want:
            return False
    return True`,
    fixed: `def matches(pattern, event):
    for key, want in pattern.items():
        if key not in event:
            return False
        if isinstance(want, dict):
            if not matches(want, event[key]):
                return False
        elif event[key] not in want:
            return False
    return True`,
    tests: [
      { args: [{ detail: { status: ['failed'] } }, { source: 'orders' }], expected: false, name: 'no detail at all' },
      { args: [{ detail: { status: ['failed'] } }, { detail: {} }], expected: false, name: 'detail without status' },
      { args: [{ detail: { status: ['failed'] } }, { detail: { status: 'failed' } }], expected: true, name: 'proper match' },
      { args: [{ source: ['a'] }, { source: 'b' }], expected: false, name: 'plain mismatch' },
    ],
    bugType: 'missing field treated as match',
    hint: 'What should happen when the pattern names a key the event does not have?',
    explanation: '`continue` skips the constraint, so an event missing the field passes. A constraint on an absent field cannot be satisfied: return False.',
  },
  boss: {
    title: 'Route events with content filters',
    statement: 'Write `route(rules, events)`. `rules` is a list of `[name, pattern, target]`. A pattern value is a nested pattern dict or a list of entries; a key matches if ANY entry matches. An entry is a plain value (equality), `{"prefix": p}` (string startswith), `{"numeric": [op, n]}` with op one of `<`, `<=`, `>`, `>=`, `=`, or `{"exists": b}`. A missing key matches only an `{"exists": false}` entry. For each event return the targets of all matching rules, in rule order.',
    language: 'python',
    fnName: 'route',
    starter: `def route(rules, events):
    pass
`,
    solution: `def route(rules, events):
    def entry_ok(entry, present, value):
        if isinstance(entry, dict):
            if "exists" in entry:
                return present == entry["exists"]
            if not present:
                return False
            if "prefix" in entry:
                return isinstance(value, str) and value.startswith(entry["prefix"])
            if "numeric" in entry:
                op, n = entry["numeric"]
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    return False
                return {"<": value < n, "<=": value <= n, ">": value > n, ">=": value >= n, "=": value == n}[op]
            return False
        return present and value == entry

    def matches(pattern, event):
        for key, want in pattern.items():
            present = isinstance(event, dict) and key in event
            value = event[key] if present else None
            if isinstance(want, dict):
                if not present or not matches(want, value):
                    return False
            elif not any(entry_ok(e, present, value) for e in want):
                return False
        return True

    return [[target for _, pattern, target in rules if matches(pattern, ev)] for ev in events]`,
    tests: [
      { args: [[['a', { source: ['orders'] }, 'T1'], ['b', {}, 'T2']], [{ source: 'orders' }, { source: 'x' }]], expected: [['T1', 'T2'], ['T2']], name: 'plain values and catch-all' },
      { args: [[['big', { detail: { amount: [{ numeric: ['>', 100] }] } }, 'T']], [{ detail: { amount: 250 } }, { detail: { amount: 100 } }, { detail: { amount: 'x' } }, {}]], expected: [['T'], [], [], []], name: 'numeric filter' },
      { args: [[['eu', { region: [{ prefix: 'eu-' }, 'global'] }, 'T']], [{ region: 'eu-west-1' }, { region: 'global' }, { region: 'us-east-1' }]], expected: [['T'], ['T'], []], name: 'prefix and plain mixed' },
      { args: [[['no-tag', { tag: [{ exists: false }] }, 'T'], ['has-tag', { tag: [{ exists: true }] }, 'U']], [{ tag: 'x' }, {}]], expected: [['U'], ['T']], name: 'exists true and false' },
      { args: [[['n', { a: { b: [1, 2] } }, 'T']], [{ a: { b: 2 } }, { a: 5 }, { a: { c: 1 } }]], expected: [['T'], [], []], name: 'nested with non-dict event value' },
      { args: [[['n', { n: [{ numeric: ['<=', 5] }] }, 'T']], [{ n: 5 }, { n: 6 }, { n: true }]], expected: [['T'], [], []], name: 'inclusive bound, booleans are not numbers' },
    ],
    hints: ['Write one helper for a single list entry: dict entries are filters (`exists`, `prefix`, `numeric`), anything else is plain equality. Absent keys only satisfy `exists: false`.', 'Recurse for nested dicts. Test `any(entry_ok(...) for e in want)` for lists, and require every key in the pattern to pass.'],
    combines: ['aws-sns'],
  },
  quiz: [
    {
      prompt: 'Two rules on the same bus both match one event. What happens?',
      options: ['Only the first rule fires', 'Both rules fire and deliver to their targets', 'EventBridge reports a conflict', 'The most specific rule wins'],
      answer: 1,
      explain: 'Rules are independent. Every matching rule delivers the event to its own targets, which is what makes fan-out with EventBridge simple.',
    },
  ],
  simulationNote: SIM_NOTE,
};

export default unit;
