import type { Unit } from '@/content/types';
import type { GraphPanel, Tone } from '@/engine/types';
import type { Design } from '@/content/lib/sysdesign-lld';
import { OPS_HARNESS } from '@/content/lib/harness';
import { OPS_SAFE } from '@/content/lib/sysdesign-lld';
import { scenarioViz, type Beat } from '@/content/lib/sysdesign-lld-2';

const code = `
class State:
    def tick(self, light): pass
    def press(self, light): pass
    def fault(self, light): light.set_state(Flashing())     #@fault
    def reset(self, light): pass

class Red(State):
    def tick(self, light): light.set_state(Green())         #@red

class Green(State):
    def tick(self, light): light.set_state(Yellow())        #@green_tick
    def press(self, light): light.set_state(Yellow())       #@green_press

class Yellow(State):
    def tick(self, light): light.set_state(Red())           #@yellow

class Flashing(State):
    def fault(self, light): pass
    def reset(self, light): light.set_state(Red())          #@flash

class Light:
    def __init__(self): self.state = Red()                  #@init
    def set_state(self, s): self.state = s                  #@set_state
    def tick(self): self.state.tick(self)                   #@delegate
    def press(self): self.state.press(self)
    def fault(self): self.state.fault(self)
    def reset(self): self.state.reset(self)
`;

type St = 'red' | 'green' | 'yellow' | 'flashing';
type Event = 'tick' | 'press' | 'fault' | 'reset';
const EVENTS: Event[] = ['tick', 'press', 'fault', 'reset'];
const CLASS: Record<St, string> = { red: 'Red', green: 'Green', yellow: 'Yellow', flashing: 'Flashing' };

const NEXT: Record<St, Partial<Record<Event, { to: St; at: string }>>> = {
  red: { tick: { to: 'green', at: 'red' }, fault: { to: 'flashing', at: 'fault' } },
  green: { tick: { to: 'yellow', at: 'green_tick' }, press: { to: 'yellow', at: 'green_press' }, fault: { to: 'flashing', at: 'fault' } },
  yellow: { tick: { to: 'red', at: 'yellow' }, fault: { to: 'flashing', at: 'fault' } },
  flashing: { reset: { to: 'red', at: 'flash' } },
};

const design: Design = {
  classes: [
    { id: 'light', name: 'Light', attrs: ['state'], methods: ['tick()', 'press()', 'fault()', 'reset()'], x: 120, y: 50 },
    { id: 'state', name: 'State', kind: 'abstract', methods: ['tick()', 'press()', 'fault()', 'reset()'], x: 450, y: 50 },
    { id: 'red', name: 'Red', methods: ['tick()'], x: 90, y: 180 },
    { id: 'green', name: 'Green', methods: ['tick()', 'press()'], x: 250, y: 180 },
    { id: 'yellow', name: 'Yellow', methods: ['tick()'], x: 420, y: 180 },
    { id: 'flashing', name: 'Flashing', methods: ['reset()'], x: 590, y: 180 },
  ],
  rels: [
    { from: 'light', to: 'state', kind: 'aggregates', label: 'state' },
    ...(['red', 'green', 'yellow', 'flashing'] as St[]).map((id) => ({ from: id, to: 'state', kind: 'inherits' as const })),
  ],
};

function machine(current: St, used?: [St, St]): GraphPanel {
  const tone = (s: St): Tone => (s === current ? 'active' : 'muted');
  const edge = (from: St, to: St, label: string, curve?: number) => ({ from, to, label, directed: true, curve, tone: used && used[0] === from && used[1] === to ? ('path' as Tone) : undefined });
  return {
    type: 'graph',
    title: 'State machine',
    width: 460,
    height: 210,
    nodes: [
      { id: 'red', label: 'RED', x: 60, y: 50, shape: 'pill', w: 80, h: 34, tone: tone('red') },
      { id: 'green', label: 'GREEN', x: 200, y: 50, shape: 'pill', w: 80, h: 34, tone: tone('green') },
      { id: 'yellow', label: 'YELLOW', x: 350, y: 50, shape: 'pill', w: 90, h: 34, tone: tone('yellow') },
      { id: 'flashing', label: 'FLASHING', x: 200, y: 160, shape: 'pill', w: 100, h: 34, tone: tone('flashing') },
    ],
    edges: [edge('red', 'green', 'tick'), edge('green', 'yellow', 'tick / press'), edge('yellow', 'red', 'tick', 48), edge('red', 'flashing', 'fault'), edge('green', 'flashing', 'fault'), edge('yellow', 'flashing', 'fault'), edge('flashing', 'red', 'reset', 30)],
  };
}

interface In {
  events: string[];
}

function parse(list: string[]): Event[] {
  return list.map((raw) => {
    const e = raw.trim().toLowerCase() as Event;
    if (!EVENTS.includes(e)) throw new Error(`Unknown event "${raw}". Choose from: ${EVENTS.join(', ')}`);
    return e;
  });
}

function simulate(input: In) {
  const events = parse(input.events);
  const beats: Beat[] = [];
  const out: St[] = [];
  let cur: St = 'red';
  let changes = 0;
  beats.push({ at: 'init', caption: 'A Light starts in the Red state object', tones: { light: 'active', red: 'active' }, extra: [machine(cur)], state: { state: CLASS[cur], transitions: 0 }, stateTitle: 'Light' });
  for (const ev of events) {
    beats.push({ at: 'delegate', caption: `light.${ev}() forwards to the current state object: ${CLASS[cur]}.${ev}()`, tones: { light: 'compare', [cur]: 'active' }, extra: [machine(cur)], state: { state: CLASS[cur], transitions: changes }, stateTitle: 'Light', log: { text: `${ev} in ${CLASS[cur]}` } });
    const t: { to: St; at: string } | undefined = NEXT[cur][ev];
    if (!t) {
      out.push(cur);
      beats.push({ at: 'delegate', caption: `${CLASS[cur]} does not react to ${ev}: stays ${CLASS[cur]}`, tones: { light: 'compare', [cur]: 'muted' }, extra: [machine(cur)], state: { state: CLASS[cur], transitions: changes }, stateTitle: 'Light', log: { text: `${ev} ignored in ${CLASS[cur]}`, tone: 'muted' } });
      continue;
    }
    const from = cur;
    cur = t.to;
    changes += 1;
    out.push(cur);
    beats.push({ at: t.at, caption: `${CLASS[from]}.${ev}() calls set_state(${CLASS[cur]}())`, tones: { light: 'swap', [from]: 'muted', [cur]: 'new' }, extra: [machine(cur, [from, cur])], state: { state: CLASS[cur], transitions: changes }, stateTitle: 'Light', log: { text: `${from} -${ev}-> ${cur}`, tone: 'found' }, vars: { state: cur } });
  }
  return { beats, result: out };
}

function reference(input: In): St[] {
  // independent formulation: a switch on (state, event)
  let s: St = 'red';
  return parse(input.events).map((e) => {
    if (e === 'fault' && s !== 'flashing') s = 'flashing';
    else if (e === 'reset' && s === 'flashing') s = 'red';
    else if (e === 'tick' && s === 'red') s = 'green';
    else if ((e === 'tick' || e === 'press') && s === 'green') s = 'yellow';
    else if (e === 'tick' && s === 'yellow') s = 'red';
    return s;
  });
}

const viz = scenarioViz<In, St[]>({
  id: 'pattern-state',
  title: 'State: a traffic light as objects',
  code,
  design,
  diagramTitle: 'Participants',
  size: { width: 700, height: 250 },
  stateTitle: 'Light',
  logTitle: 'Events',
  inputs: [{ key: 'events', label: 'Events', kind: 'strings', default: ['tick', 'press', 'tick', 'tick', 'fault', 'tick', 'reset'], maxItems: 8, help: 'tick = timer, press = pedestrian button, fault = sensor failure, reset = technician. Some events do nothing in some states.' }],
  presets: [
    { label: 'Normal cycle', input: { events: ['tick', 'tick', 'tick', 'tick'] } },
    { label: 'Pedestrian button', input: { events: ['press', 'tick', 'press', 'press', 'tick'] } },
    { label: 'Fault and reset', input: { events: ['tick', 'fault', 'tick', 'press', 'reset', 'reset'] } },
  ],
  simulate,
  reference,
});

const unit: Unit = {
  id: 'pattern-state',
  hook: 'State replaces a pile of `if state == ...` checks with one object per state. Interviewers use it in vending machines, order flows and traffic lights to test whether you can name the states and the events each one accepts.',
  predict: {
    prompt: 'The light is Green and a pedestrian presses the button. Then the same button is pressed again immediately. What is the final state?',
    options: ['Green', 'Red', 'Yellow: the first press moves Green to Yellow, the second is ignored in Yellow', 'Flashing'],
    answer: 2,
    explain: 'Each state decides which events it handles. `Green.press` switches to Yellow; `Yellow` defines no behaviour for `press`, so it ignores it.',
  },
  viz,
  deeper: {
    points: [
      'Intent: let an object change its behaviour when its **internal state** changes. The context (`Light`) keeps a reference to one state object and forwards every event to it.',
      'Each state class implements only the events it cares about and performs the **transition** by telling the context to switch (`light.set_state(Yellow())`).',
      'Adding a state is adding a class; the context and the other states barely change. Compare with a single method full of `if self.state == ...` that grows with every new state and event.',
      'Always decide what happens for an event a state does not handle. Ignoring it is fine, but it must be a conscious choice (a missing transition is the classic bug).',
      'Table-driven state machines (`{(state, event): next}`) are an equally valid choice when states have no behaviour of their own.',
    ],
    pitfalls: ['A transition that was never written (an event silently does nothing)', 'Letting states share mutable data through globals', 'Creating a new state object on every transition when the state is stateless (reuse singletons)'],
  },
  practice: {
    language: 'python',
    fnName: 'TrafficLight',
    statement:
      'Build `TrafficLight` with one class per state (Red, Green, Yellow), each having `name`, `tick()` and `press()` which return the next state object. `tick`: red to green to yellow to red. `press` only matters in green (it goes to yellow); in red and yellow it changes nothing. `TrafficLight.tick()` and `.press()` update the current state and return its `name` (`"red"`, `"green"`, `"yellow"`).',
    signature: 'class TrafficLight:',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    solution: `class Red:
    name = 'red'
    def tick(self): return Green()
    def press(self): return self

class Green:
    name = 'green'
    def tick(self): return @@Yellow()@@
    def press(self): return Yellow()

class Yellow:
    name = 'yellow'
    def tick(self): return Red()
    def press(self): return self

class TrafficLight:
    def __init__(self):
        self._state = Red()

    def tick(self):
        self._state = @@self._state.tick()@@
        return self._state.name

    def press(self):
        self._state = self._state.press()
        return @@self._state.name@@`,
    tests: [
      { args: [['TrafficLight', 'tick', 'tick', 'tick', 'tick'], [[], [], [], [], []]], expected: [null, 'green', 'yellow', 'red', 'green'], name: 'full cycle' },
      { args: [['TrafficLight', 'press', 'tick'], [[], [], []]], expected: [null, 'red', 'green'], name: 'press is ignored in red' },
      { args: [['TrafficLight', 'tick', 'press', 'press', 'tick'], [[], [], [], [], []]], expected: [null, 'green', 'yellow', 'yellow', 'red'], name: 'press shortens green only' },
      { args: [['TrafficLight', 'tick', 'tick', 'press'], [[], [], [], []]], expected: [null, 'green', 'yellow', 'yellow'], name: 'press ignored in yellow' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'TrafficLight',
    statement: 'Pedestrians press the button while the light is green but nothing happens until the timer runs out. The transition table is missing something.',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    buggy: `class TrafficLight:
    NEXT = {
        ('red', 'tick'): 'green',
        ('green', 'tick'): 'yellow',
        ('yellow', 'tick'): 'red',
    }

    def __init__(self):
        self._s = 'red'

    def tick(self):
        self._s = self.NEXT.get((self._s, 'tick'), self._s)
        return self._s

    def press(self):
        self._s = self.NEXT.get((self._s, 'press'), self._s)
        return self._s`,
    fixed: `class TrafficLight:
    NEXT = {
        ('red', 'tick'): 'green',
        ('green', 'tick'): 'yellow',
        ('green', 'press'): 'yellow',
        ('yellow', 'tick'): 'red',
    }

    def __init__(self):
        self._s = 'red'

    def tick(self):
        self._s = self.NEXT.get((self._s, 'tick'), self._s)
        return self._s

    def press(self):
        self._s = self.NEXT.get((self._s, 'press'), self._s)
        return self._s`,
    tests: [
      { args: [['TrafficLight', 'tick', 'press'], [[], [], []]], expected: [null, 'green', 'yellow'], name: 'press in green' },
      { args: [['TrafficLight', 'press', 'tick'], [[], [], []]], expected: [null, 'red', 'green'], name: 'press in red is ignored' },
      { args: [['TrafficLight', 'tick', 'tick', 'tick'], [[], [], [], []]], expected: [null, 'green', 'yellow', 'red'], name: 'timer cycle unchanged' },
    ],
    bugType: 'missing transition',
    hint: 'List every (state, event) pair the light should react to and compare with the NEXT table.',
    explanation: 'There is no `("green", "press")` entry, and `.get(key, current)` turns the missing case into a silent no-op. Missing transitions in a table fail quietly, which is why you enumerate every state and event pair.',
  },
  boss: {
    title: 'Order lifecycle',
    statement:
      'Write `Order()` that starts in state `created`. Actions `pay()`, `ship()`, `deliver()`, `cancel()`, `refund()` each return the new state or raise `ValueError` if the action is illegal in the current state. Legal moves: created: pay (to paid), cancel (to cancelled); paid: ship (to shipped), cancel; shipped: deliver (to delivered); delivered: refund (to refunded). `cancelled` and `refunded` are terminal. `state()` returns the current state, `can(action)` says whether an action is legal now, and `history()` returns a copy of the list of states visited, starting with `created`. A failed action must not change anything.',
    language: 'python',
    fnName: 'Order',
    harness: OPS_SAFE,
    adapter: 'run_ops_safe',
    starter: `class Order:
    def __init__(self):
        pass
`,
    solution: `class Order:
    NEXT = {
        'created': {'pay': 'paid', 'cancel': 'cancelled'},
        'paid': {'ship': 'shipped', 'cancel': 'cancelled'},
        'shipped': {'deliver': 'delivered'},
        'delivered': {'refund': 'refunded'},
    }

    def __init__(self):
        self._state = 'created'
        self._history = ['created']

    def _go(self, action):
        nxt = self.NEXT.get(self._state, {}).get(action)
        if nxt is None:
            raise ValueError('cannot ' + action + ' when ' + self._state)
        self._state = nxt
        self._history.append(nxt)
        return nxt

    def pay(self): return self._go('pay')
    def ship(self): return self._go('ship')
    def deliver(self): return self._go('deliver')
    def cancel(self): return self._go('cancel')
    def refund(self): return self._go('refund')

    def can(self, action):
        return action in self.NEXT.get(self._state, {})

    def state(self):
        return self._state

    def history(self):
        return list(self._history)`,
    tests: [
      { args: [['Order', 'pay', 'ship', 'deliver', 'state'], [[], [], [], [], []]], expected: [null, 'paid', 'shipped', 'delivered', 'delivered'], name: 'happy path' },
      { args: [['Order', 'ship'], [[], []]], expected: [null, '!ValueError'], name: 'cannot ship unpaid' },
      { args: [['Order', 'pay', 'cancel', 'pay', 'state'], [[], [], [], [], []]], expected: [null, 'paid', 'cancelled', '!ValueError', 'cancelled'], name: 'cancelled is terminal' },
      { args: [['Order', 'pay', 'ship', 'cancel', 'state'], [[], [], [], [], []]], expected: [null, 'paid', 'shipped', '!ValueError', 'shipped'], name: 'cannot cancel after shipping' },
      { args: [['Order', 'can', 'can', 'pay', 'can', 'can'], [[], ['pay'], ['ship'], [], ['ship'], ['cancel']]], expected: [null, true, false, 'paid', true, true], name: 'can() reflects the state' },
      { args: [['Order', 'pay', 'ship', 'deliver', 'refund', 'refund', 'history'], [[], [], [], [], [], [], []]], expected: [null, 'paid', 'shipped', 'delivered', 'refunded', '!ValueError', ['created', 'paid', 'shipped', 'delivered', 'refunded']], name: 'history ignores failures' },
      { args: [['Order', 'history', 'pay', 'history'], [[], [], [], []]], expected: [null, ['created'], 'paid', ['created', 'paid']], name: 'history is a copy' },
    ],
    hints: ['A dict of dicts `{state: {action: next_state}}` is the whole machine. One private `_go(action)` can look up the move, raise ValueError when absent and otherwise commit it.', 'Only mutate after the lookup succeeded, so a failed action leaves state and history untouched. `can(action)` is just a membership test on the inner dict, and `history()` should return `list(...)`.'],
    combines: ['lld-vending-machine', 'pattern-strategy'],
  },
  quiz: [
    {
      prompt: 'How does State differ from Strategy structurally?',
      options: ['They are identical in behaviour', 'State objects usually trigger the transitions to other states themselves; a strategy is chosen from outside and does not replace itself', 'Strategy needs an abstract class, State does not', 'State can only be used with enums'],
      answer: 1,
      explain: 'Both delegate to a swappable object, but the intent differs: a state models the lifecycle of the context and drives change, a strategy is an interchangeable algorithm.',
    },
  ],
};

export default unit;
