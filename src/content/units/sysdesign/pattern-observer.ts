import type { Unit } from '@/content/types';
import type { Tone } from '@/engine/types';
import type { Cls, Design } from '@/content/lib/sysdesign-lld';
import { scenarioViz, splitEvent, type Beat } from '@/content/lib/sysdesign-lld-2';

const code = `
class Subject:
    def __init__(self):
        self._subs = []

    def subscribe(self, fn):                         #@subscribe
        if fn not in self._subs:
            self._subs.append(fn)

    def unsubscribe(self, fn):                       #@unsubscribe
        if fn in self._subs:
            self._subs.remove(fn)

    def notify(self, event):
        for fn in list(self._subs):                  #@loop
            fn(event)                                #@deliver

# the bug variant iterates the live list: for fn in self._subs   #@live
`;

const NAMES = ['A', 'B', 'C', 'D'];
const X: Record<string, number> = { A: 110, B: 270, C: 430, D: 590 };

interface Sub {
  name: string;
  once: boolean;
}

interface In {
  events: string[];
  mode: string;
}

type Ev = { kind: 'sub'; name: string } | { kind: 'once'; name: string } | { kind: 'unsub'; name: string } | { kind: 'pub'; msg: string };

function parse(input: In): Ev[] {
  if (input.mode !== 'copy' && input.mode !== 'live') throw new Error('mode must be "copy" or "live"');
  return input.events.map((raw) => {
    const [k, rest] = splitEvent(raw);
    if ((k === 'sub' || k === 'once' || k === 'unsub') && rest && NAMES.includes(rest.toUpperCase())) return { kind: k, name: rest.toUpperCase() };
    if (k === 'pub' && rest) return { kind: 'pub', msg: rest };
    throw new Error(`Cannot read "${raw}". Use sub:A, once:B (unsubscribes itself after one event), unsub:A or pub:message (names A to D)`);
  });
}

const design = (subs: Sub[]): Design => {
  const classes: Cls[] = [{ id: 'subject', name: 'Subject', attrs: [subs.length ? '_subs=[' + subs.map((s) => s.name + (s.once ? '*' : '')).join(',') + ']' : '_subs=[]'], methods: ['subscribe()', 'notify()'], x: 350, y: 50 }];
  const rels: Design['rels'] = [];
  for (const s of subs) {
    classes.push({ id: s.name, name: s.once ? `${s.name} (once)` : s.name, methods: ['__call__(event)'], x: X[s.name], y: 220 });
    rels.push({ from: 'subject', to: s.name, kind: 'uses', label: 'notify' });
  }
  return { classes, rels };
};

const subsText = (subs: Sub[]): string => '[' + subs.map((s) => s.name + (s.once ? '*' : '')).join(', ') + ']';

function simulate(input: In) {
  const events = parse(input);
  const live = input.mode === 'live';
  const beats: Beat[] = [];
  const out: string[] = [];
  let subs: Sub[] = [];
  const state = (extra: Record<string, string | number> = {}) => ({ _subs: subsText(subs), mode: live ? 'for fn in self._subs' : 'for fn in list(self._subs)', ...extra });
  beats.push({ at: 'subscribe', caption: 'Subject has no subscribers yet', design: design(subs), state: state() });
  for (const ev of events) {
    if (ev.kind === 'sub' || ev.kind === 'once') {
      const dup = subs.some((s) => s.name === ev.name);
      if (!dup) subs = [...subs, { name: ev.name, once: ev.kind === 'once' }];
      beats.push({ at: 'subscribe', caption: dup ? `${ev.name} is already subscribed: ignored` : `${ev.name} subscribes${ev.kind === 'once' ? ' (it will unsubscribe itself after one event)' : ''}`, design: design(subs), tones: dup ? {} : { [ev.name]: 'new' }, state: state(), log: { text: dup ? `${ev.name}: duplicate ignored` : `${ev.name} joined`, tone: dup ? 'muted' : 'new' } });
      continue;
    }
    if (ev.kind === 'unsub') {
      const had = subs.some((s) => s.name === ev.name);
      const before = design(subs);
      subs = subs.filter((s) => s.name !== ev.name);
      beats.push({ at: 'unsubscribe', caption: had ? `${ev.name} unsubscribes` : `${ev.name} was not subscribed: nothing to do`, design: had ? before : design(subs), tones: had ? { [ev.name]: 'muted' } : {}, state: state(), log: { text: had ? `${ev.name} left` : `${ev.name}: not subscribed`, tone: 'muted' } });
      if (had) beats.push({ at: 'unsubscribe', caption: `Subscribers now ${subsText(subs)}`, design: design(subs), state: state() });
      continue;
    }
    // publish
    const snapshot = subs.map((s) => s.name);
    const delivered: string[] = [];
    beats.push({ at: 'loop', caption: `notify("${ev.msg}"): iterate ${live ? 'the live list' : 'a snapshot copy'} ${subsText(subs)}`, design: design(subs), tones: { subject: 'active' }, state: state({ event: ev.msg }), log: { text: `publish ${ev.msg}` } });
    const deliver = (s: Sub, idx: number): void => {
      delivered.push(s.name);
      beats.push({ at: 'deliver', caption: `Deliver "${ev.msg}" to ${s.name}${live ? ` (index ${idx})` : ''}`, design: design(subs), tones: { subject: 'active', [s.name]: 'active' }, edgeTones: { [`subject>${s.name}`]: 'path' }, state: state({ event: ev.msg, ...(live ? { i: idx } : {}) }), log: { text: `${s.name} got ${ev.msg}`, tone: 'found' } });
      if (s.once) {
        subs = subs.filter((x) => x.name !== s.name);
        beats.push({ at: 'unsubscribe', caption: `${s.name} removes itself while the loop runs: list is now ${subsText(subs)}`, design: design(subs), tones: { subject: 'swap' }, state: state({ event: ev.msg }), log: { text: `${s.name} unsubscribed itself`, tone: 'muted' } });
      }
    };
    if (live) {
      for (let i = 0; i < subs.length; i++) deliver(subs[i], i);
    } else {
      for (const name of snapshot) deliver({ name, once: subs.find((x) => x.name === name)?.once ?? false }, 0);
    }
    const skipped = snapshot.filter((n) => !delivered.includes(n));
    if (skipped.length) {
      const tones: Record<string, Tone> = Object.fromEntries(skipped.map((n) => [n, 'error' as Tone]));
      beats.push({ at: 'live', caption: `${skipped.join(', ')} never received "${ev.msg}": the list shifted under the loop`, design: design(subs), tones, state: state({ event: ev.msg }), log: { text: `MISSED: ${skipped.join(', ')}`, tone: 'error' } });
    } else {
      beats.push({ at: 'loop', caption: `Delivered to ${delivered.length ? delivered.join(', ') : 'nobody'}`, design: design(subs), tones: { subject: 'done' }, state: state({ event: ev.msg }) });
    }
    out.push(`${ev.msg}: ${delivered.length ? delivered.join(',') : '(nobody)'}`);
  }
  return { beats, result: out };
}

function reference(input: In): string[] {
  const live = input.mode === 'live';
  let subs: Sub[] = [];
  const res: string[] = [];
  for (const ev of parse(input)) {
    if (ev.kind === 'sub' || ev.kind === 'once') {
      if (!subs.some((s) => s.name === ev.name)) subs.push({ name: ev.name, once: ev.kind === 'once' });
    } else if (ev.kind === 'unsub') {
      subs = subs.filter((s) => s.name !== ev.name);
    } else {
      const got: string[] = [];
      const visit = (s: Sub): void => {
        got.push(s.name);
        if (s.once) subs = subs.filter((x) => x.name !== s.name);
      };
      if (live) {
        let i = 0;
        while (i < subs.length) visit(subs[i++]);
      } else {
        const snap = [...subs];
        snap.forEach(visit);
      }
      res.push(`${ev.msg}: ${got.length ? got.join(',') : '(nobody)'}`);
    }
  }
  return res;
}

const viz = scenarioViz<In, string[]>({
  id: 'pattern-observer',
  title: 'Observer: a subject notifies its subscribers',
  code,
  design: design([]),
  diagramTitle: 'Participants',
  size: { width: 700, height: 300 },
  stateTitle: 'Subject',
  logTitle: 'Deliveries',
  inputs: [
    { key: 'events', label: 'Events', kind: 'strings', default: ['sub:A', 'once:B', 'sub:C', 'pub:price=5', 'pub:price=6'], maxItems: 9, help: 'sub:A, once:B (unsubscribes itself after one event), unsub:A, pub:message. Names A to D.' },
    { key: 'mode', label: 'Loop over', kind: 'select', default: 'live', options: ['live', 'copy'], help: 'live = iterate self._subs directly (the bug); copy = iterate list(self._subs)' },
  ],
  presets: [
    { label: 'Live list skips C', input: { events: ['sub:A', 'once:B', 'sub:C', 'pub:price=5', 'pub:price=6'], mode: 'live' } },
    { label: 'Same events, snapshot copy', input: { events: ['sub:A', 'once:B', 'sub:C', 'pub:price=5', 'pub:price=6'], mode: 'copy' } },
    { label: 'Unsubscribe between events', input: { events: ['sub:A', 'sub:B', 'pub:x', 'unsub:A', 'pub:y', 'unsub:B', 'pub:z'], mode: 'copy' } },
  ],
  simulate,
  reference,
});

const SUBJECT_HARNESS = `
class Listener:
    def __init__(self, name, log, subject, once):
        self.name = name
        self.log = log
        self.subject = subject
        self.once = once
    def __call__(self, event):
        self.log.append(self.name + ':' + event)
        if self.once:
            self.subject.unsubscribe(self)

def run_subject(cls, steps):
    subject = cls()
    log = []
    listeners = {}
    out = []
    for name, *args in steps:
        if name in ('sub', 'once'):
            if args[0] not in listeners:
                listeners[args[0]] = Listener(args[0], log, subject, name == 'once')
            out.append(subject.subscribe(listeners[args[0]]))
        elif name == 'unsub':
            out.append(subject.unsubscribe(listeners[args[0]]) if args[0] in listeners else False)
        elif name == 'pub':
            out.append(subject.notify(args[0]))
    return [out, log]
`;

const unit: Unit = {
  id: 'pattern-observer',
  hook: 'Observer is how events, UI state and message buses work. The follow-up question is always the same: "what happens if a subscriber unsubscribes while you are notifying?"',
  predict: {
    prompt: 'Subscribers are [A, B, C]. B unsubscribes itself inside its callback. `notify` loops with `for fn in self._subs` (no copy). Who receives the event?',
    options: ['A, B and C', 'A and B only: C is skipped because the list shifted left', 'A only', 'A, B, C and B again'],
    answer: 1,
    explain: 'The loop holds index 1 for B; after B removes itself, C moves to index 1 and the loop advances to index 2, which is now past the end. Iterating over `list(self._subs)` fixes it.',
  },
  viz,
  deeper: {
    points: [
      'Intent: a **subject** keeps a list of observers and notifies them on change, so the subject never knows concrete observers. It is publish/subscribe inside one process.',
      'Never mutate a collection you are iterating. Notify over a **snapshot** (`list(self._subs)`) so subscribe/unsubscribe during a callback cannot skip or repeat anyone.',
      'Decide ordering and error policy up front: one failing observer should not stop the others (catch, log, continue), and delivery order should be documented (registration order is typical).',
      'Memory leaks: a subject holding a strong reference keeps observers alive forever. Offer `unsubscribe` (or return an unsubscribe handle) and consider weak references in long-lived systems.',
      'Push (the event carries data) vs pull (observers ask the subject) is a design choice; push is simpler, pull avoids sending data nobody needs.',
    ],
    pitfalls: ['Mutating the observer list during notification', 'Subscribing the same callback twice and delivering twice', 'Observers that call back into the subject and trigger infinite notification loops'],
  },
  practice: {
    language: 'python',
    fnName: 'Subject',
    statement:
      'Implement `Subject` with `subscribe(fn)` (returns False if already subscribed, else True), `unsubscribe(fn)` (returns True if it was subscribed, else False) and `notify(event)`, which calls every current subscriber once in subscription order and returns how many were called. A subscriber may unsubscribe itself (or others) during the callback without anyone being skipped.',
    signature: 'class Subject:',
    harness: SUBJECT_HARNESS,
    adapter: 'run_subject',
    solution: `class Subject:
    def __init__(self):
        self._subs = []

    def subscribe(self, fn):
        if @@fn in self._subs@@:
            return False
        self._subs.append(fn)
        return True

    def unsubscribe(self, fn):
        if fn not in self._subs:
            return False
        @@self._subs.remove(fn)@@
        return True

    def notify(self, event):
        count = 0
        for fn in @@list(self._subs)@@:
            fn(event)
            count += 1
        return count`,
    tests: [
      { args: [[['sub', 'A'], ['sub', 'B'], ['pub', 'x']]], expected: [[true, true, 2], ['A:x', 'B:x']], name: 'delivery order' },
      { args: [[['sub', 'A'], ['sub', 'A'], ['pub', 'x']]], expected: [[true, false, 1], ['A:x']], name: 'no duplicates' },
      { args: [[['sub', 'A'], ['unsub', 'A'], ['unsub', 'A'], ['pub', 'x']]], expected: [[true, true, false, 0], []], name: 'unsubscribe' },
      { args: [[['sub', 'A'], ['once', 'B'], ['sub', 'C'], ['pub', 'x'], ['pub', 'y']]], expected: [[true, true, true, 3, 2], ['A:x', 'B:x', 'C:x', 'A:y', 'C:y']], name: 'self-removal does not skip C' },
      { args: [[['once', 'A'], ['once', 'B'], ['pub', 'x'], ['pub', 'y']]], expected: [[true, true, 2, 0], ['A:x', 'B:x']], name: 'two one-shot subscribers' },
      { args: [[['pub', 'nobody']]], expected: [[0], []], name: 'no subscribers' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'Subject',
    statement: 'A one-shot subscriber that unsubscribes itself makes the next subscriber miss the event. Find the line that makes the loop unsafe.',
    harness: SUBJECT_HARNESS,
    adapter: 'run_subject',
    buggy: `class Subject:
    def __init__(self):
        self._subs = []

    def subscribe(self, fn):
        if fn in self._subs:
            return False
        self._subs.append(fn)
        return True

    def unsubscribe(self, fn):
        if fn not in self._subs:
            return False
        self._subs.remove(fn)
        return True

    def notify(self, event):
        count = 0
        for fn in self._subs:
            fn(event)
            count += 1
        return count`,
    fixed: `class Subject:
    def __init__(self):
        self._subs = []

    def subscribe(self, fn):
        if fn in self._subs:
            return False
        self._subs.append(fn)
        return True

    def unsubscribe(self, fn):
        if fn not in self._subs:
            return False
        self._subs.remove(fn)
        return True

    def notify(self, event):
        count = 0
        for fn in list(self._subs):
            fn(event)
            count += 1
        return count`,
    tests: [
      { args: [[['sub', 'A'], ['once', 'B'], ['sub', 'C'], ['pub', 'x']]], expected: [[true, true, true, 3], ['A:x', 'B:x', 'C:x']], name: 'C still gets the event' },
      { args: [[['sub', 'A'], ['sub', 'B'], ['pub', 'x'], ['pub', 'y']]], expected: [[true, true, 2, 2], ['A:x', 'B:x', 'A:y', 'B:y']], name: 'plain delivery' },
      { args: [[['once', 'A'], ['sub', 'B'], ['pub', 'x'], ['pub', 'y']]], expected: [[true, true, 2, 1], ['A:x', 'B:x', 'B:y']], name: 'first subscriber removes itself' },
    ],
    bugType: 'mutation during iteration',
    hint: 'What happens to the loop index when an element before the current position is removed from the list being iterated?',
    explanation: 'Removing an element shifts later ones left, so the iterator jumps over one. Iterating over a copy (`list(self._subs)`) decouples the loop from changes made by callbacks.',
  },
  boss: {
    title: 'Topic event emitter',
    statement:
      'Write `EventEmitter` with `on(topic, fn)`, `once(topic, fn)` (called at most one time, removed before it runs), `off(topic, fn)` (removes every registration of that fn on the topic) and `emit(topic, payload)`. `emit` calls the current handlers of the topic in registration order with the payload and returns `[succeeded, failed]`. A handler that raises must not stop the others and counts as failed. Unknown topics give `[0, 0]`. Handlers may unsubscribe during an emit without anyone being skipped.',
    language: 'python',
    fnName: 'EventEmitter',
    harness: `
class Handler:
    def __init__(self, name, log, boom=False):
        self.name = name
        self.log = log
        self.boom = boom
    def __call__(self, payload):
        self.log.append(self.name + ':' + str(payload))
        if self.boom:
            raise ValueError('boom')

def run_emitter(cls, steps):
    em = cls()
    log = []
    handlers = {}
    out = []
    for name, *args in steps:
        if name in ('on', 'once', 'off'):
            topic, hname = args
            if hname not in handlers:
                handlers[hname] = Handler(hname, log, hname.startswith('boom'))
            out.append(getattr(em, name)(topic, handlers[hname]))
        elif name == 'emit':
            out.append(em.emit(*args))
    return [out, log]
`,
    adapter: 'run_emitter',
    starter: `class EventEmitter:
    def __init__(self):
        pass
`,
    solution: `class EventEmitter:
    def __init__(self):
        self.handlers = {}

    def on(self, topic, fn):
        self.handlers.setdefault(topic, []).append((fn, False))

    def once(self, topic, fn):
        self.handlers.setdefault(topic, []).append((fn, True))

    def off(self, topic, fn):
        self.handlers[topic] = [h for h in self.handlers.get(topic, []) if h[0] is not fn]

    def emit(self, topic, payload):
        ok = failed = 0
        for fn, once in list(self.handlers.get(topic, [])):
            if once:
                self.handlers[topic] = [h for h in self.handlers[topic] if h[0] is not fn]
            try:
                fn(payload)
                ok += 1
            except Exception:
                failed += 1
        return [ok, failed]`,
    tests: [
      { args: [[['on', 't', 'a'], ['on', 't', 'b'], ['emit', 't', 1], ['emit', 'other', 2]]], expected: [[null, null, [2, 0], [0, 0]], ['a:1', 'b:1']], name: 'order and unknown topic' },
      { args: [[['once', 't', 'a'], ['emit', 't', 1], ['emit', 't', 2]]], expected: [[null, [1, 0], [0, 0]], ['a:1']], name: 'once runs once' },
      { args: [[['on', 't', 'a'], ['on', 't', 'boom'], ['on', 't', 'c'], ['emit', 't', 9]]], expected: [[null, null, null, [2, 1]], ['a:9', 'boom:9', 'c:9']], name: 'a failing handler does not stop the others' },
      { args: [[['on', 't', 'a'], ['on', 't', 'b'], ['off', 't', 'a'], ['emit', 't', 1]]], expected: [[null, null, null, [1, 0]], ['b:1']], name: 'off' },
      { args: [[['once', 't', 'a'], ['once', 't', 'b'], ['on', 't', 'c'], ['emit', 't', 1], ['emit', 't', 2]]], expected: [[null, null, null, [3, 0], [1, 0]], ['a:1', 'b:1', 'c:1', 'c:2']], name: 'adjacent once handlers are not skipped' },
      { args: [[['on', 't', 'a'], ['off', 'zzz', 'a'], ['emit', 't', 1]]], expected: [[null, null, [1, 0]], ['a:1']], name: 'off on another topic is a no-op' },
      { args: [[['once', 't', 'boom'], ['emit', 't', 1], ['emit', 't', 2]]], expected: [[null, [0, 1], [0, 0]], ['boom:1']], name: 'a failing once handler still counts as consumed' },
    ],
    hints: ['Store (fn, once) pairs per topic. Iterate over a copy of the list so removals during the emit are safe.', 'For `once`, remove the pair before calling it (so even a failing handler is consumed). Wrap each call in try/except Exception and count successes and failures.'],
    combines: ['pattern-singleton', 'hash-chaining'],
  },
  quiz: [
    {
      prompt: 'Why is a snapshot of the subscriber list safer than iterating the live list?',
      options: ['It is faster', 'Callbacks may subscribe or unsubscribe, and the loop must not skip or repeat entries', 'Python forbids iterating a list twice', 'It makes observers run in parallel'],
      answer: 1,
      explain: 'The snapshot is a stable view for this notification; changes made by callbacks apply to the next one.',
    },
  ],
};

export default unit;
