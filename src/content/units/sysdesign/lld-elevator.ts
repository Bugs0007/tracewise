import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel, logPanel } from '@/content/lib/backend-rest';
import { OPS_HARNESS } from '@/content/lib/harness';
import { ops } from '@/content/lib/sysdesign-hld-1';

const code = `
class Elevator:
    def __init__(self, top, scan=False, floor=0):
        self.top, self.scan, self.floor = top, scan, floor
        self.direction = 0                               #@init
        self.stops = set()

    def request(self, floor):
        if floor != self.floor:
            self.stops.add(floor)                        #@request

    def tick(self):
        if not self.stops:
            self.direction = 0                           #@idle
            return self.floor
        up = any(s > self.floor for s in self.stops)     #@scan
        down = any(s < self.floor for s in self.stops)
        can_up = self.floor < self.top if self.scan else up
        can_down = self.floor > 0 if self.scan else down
        if self.direction == 0:
            self.direction = 1 if up else -1             #@start
        elif self.direction == 1 and not can_up:
            self.direction = -1                          #@down
        elif self.direction == -1 and not can_down:
            self.direction = 1                           #@up
        self.floor += self.direction                     #@move
        self.stops.discard(self.floor)                   #@serve
        return self.floor
`;

const POLICIES = ['LOOK', 'SCAN'];

interface In {
  policy: string;
  top: number;
  start: number;
  requests: string[];
}

function clean(i: In) {
  const top = Math.max(2, Math.min(9, Math.round(i.top) || 2));
  const start = Math.max(0, Math.min(top, Math.round(i.start) || 0));
  const arrivals = i.requests.map((raw) => {
    const [t, f] = raw.split(':').map((x) => x.trim());
    if (t === undefined || f === undefined || t === '' || f === '' || !Number.isInteger(Number(t)) || !Number.isInteger(Number(f)) || Number(t) < 0) throw new Error(`Cannot read "${raw}". Use tick:floor, e.g. 3:6`);
    if (Number(f) < 0 || Number(f) > top) throw new Error(`Floor ${f} is outside 0..${top}`);
    return { t: Number(t), floor: Number(f) };
  });
  return { top, start, scan: i.policy === POLICIES[1], arrivals };
}

const viz: VizDef<In> = {
  id: 'lld-elevator',
  title: 'Elevator scheduling: LOOK vs SCAN',
  code,
  language: 'python',
  inputs: [
    { key: 'policy', label: 'Policy', kind: 'select', default: POLICIES[0], options: POLICIES },
    { key: 'top', label: 'Top floor (2-9)', kind: 'number', default: 7 },
    { key: 'start', label: 'Start floor', kind: 'number', default: 0 },
    { key: 'requests', label: 'Requests (tick:floor)', kind: 'strings', default: ['0:5', '1:2', '3:6', '6:1'], maxItems: 10, help: 'a request for floor 5 pressed at tick 0 is 0:5' },
  ],
  presets: [
    { label: 'LOOK sweep', input: { policy: POLICIES[0], top: 7, start: 0, requests: ['0:5', '1:2', '3:6', '6:1'] } },
    { label: 'SCAN to the wall', input: { policy: POLICIES[1], top: 7, start: 0, requests: ['0:5', '1:2', '3:6', '6:1'] } },
    { label: 'Starts going down', input: { policy: POLICIES[0], top: 5, start: 4, requests: ['0:1', '1:3', '2:0'] } },
  ],
  run(input) {
    const { top, start, scan, arrivals } = clean(input);
    const r = new Recorder(code);
    let floor = start;
    let dir = 0;
    const stops = new Set<number>();
    const trace: number[] = [];
    const lastArrival = arrivals.reduce((m, a) => Math.max(m, a.t), 0);
    const log: { text: string; tone?: Tone }[] = [];
    const dirText = () => (dir === 1 ? 'up' : dir === -1 ? 'down' : 'idle');
    const view = (served = false): Panel[] => [
      {
        type: 'array',
        title: `Floors 0..${top}  (${scan ? 'SCAN' : 'LOOK'})`,
        values: Array.from({ length: top + 1 }, (_, f) => (f === floor ? 'CAR' : stops.has(f) ? '●' : '·')),
        indexLabels: Array.from({ length: top + 1 }, (_, f) => String(f)),
        tones: Object.fromEntries(Array.from({ length: top + 1 }, (_, f) => [f, f === floor ? (served ? 'found' : 'active') : stops.has(f) ? 'frontier' : 'muted'])) as Record<number, Tone>,
        pointers: { car: floor },
      },
      { type: 'chart', title: 'Floor over time', kind: 'line', xLabel: 'tick', yLabel: 'floor', marker: trace.length, series: [{ label: 'floor', points: [[0, start], ...trace.map((f, i) => [i + 1, f] as [number, number])], tone: 'compare' }] },
      kvPanel('State', { direction: dirText(), floor, pending: [...stops].sort((a, b) => a - b).join(', ') || '(none)' }),
      logPanel('Events', log),
    ];
    r.step('init', `Car at floor ${floor} of 0..${top}, idle. Policy ${scan ? 'SCAN (sweep to the wall)' : 'LOOK (turn at the last request)'}`, view(), { floor, direction: 0 });
    let t = 0;
    while (t <= lastArrival || stops.size) {
      if (t > 60) throw new Error('Simulation exceeds 60 ticks; use fewer or closer requests');
      for (const a of arrivals.filter((x) => x.t === t)) {
        r.op();
        if (a.floor === floor) {
          log.push({ text: `tick ${t}: floor ${a.floor} pressed, car already here`, tone: 'muted' });
          r.step('request', `Request for ${a.floor} ignored: the car is already at floor ${floor}`, view(), { tick: t });
        } else {
          stops.add(a.floor);
          log.push({ text: `tick ${t}: request for floor ${a.floor}`, tone: 'new' });
          r.step('request', `Tick ${t}: floor ${a.floor} is pressed, added to the stop set`, view(), { tick: t, pending: stops.size });
        }
      }
      if (!stops.size) {
        dir = 0;
        trace.push(floor);
        r.step('idle', `Tick ${t}: nothing pending, the car waits at ${floor}`, view(), { tick: t });
        t++;
        continue;
      }
      const up = [...stops].some((s) => s > floor);
      const down = [...stops].some((s) => s < floor);
      const canUp = scan ? floor < top : up;
      const canDown = scan ? floor > 0 : down;
      const before = dir;
      if (dir === 0) {
        dir = up ? 1 : -1;
        r.step('start', `Tick ${t}: idle, stops ${up ? 'above' : 'below'}: head ${dirText()}`, view(), { tick: t, direction: dir });
      } else if (dir === 1 && !canUp) {
        dir = -1;
        r.step('down', scan ? `Tick ${t}: hit the top floor ${top}: reverse to down` : `Tick ${t}: nothing above ${floor}: reverse to down`, view(), { tick: t, direction: dir });
      } else if (dir === -1 && !canDown) {
        dir = 1;
        r.step('up', scan ? `Tick ${t}: hit the ground floor: reverse to up` : `Tick ${t}: nothing below ${floor}: reverse to up`, view(), { tick: t, direction: dir });
      }
      r.op();
      floor += dir;
      const served = stops.delete(floor);
      trace.push(floor);
      if (served) log.push({ text: `tick ${t}: stopped at ${floor}`, tone: 'found' });
      r.step(served ? 'serve' : 'move', served ? `Tick ${t}: move ${dir === 1 ? 'up' : 'down'} to ${floor} and open doors` : `Tick ${t}: move ${dir === 1 ? 'up' : 'down'} to ${floor}`, view(served), { tick: t, floor, direction: dir, changed: before !== dir });
      t++;
    }
    r.step('idle', `All requests served after ${t} ticks, the car rests at floor ${floor}`, view(), { ticks: t });
    return { frames: r.frames, result: trace };
  },
  reference(input) {
    const { top, start, scan, arrivals } = clean(input);
    // Independent formulation: decide the next direction from the sorted stop list.
    let floor = start;
    let dir = 0;
    let pending: number[] = [];
    const out: number[] = [];
    const lastArrival = arrivals.reduce((m, a) => Math.max(m, a.t), 0);
    for (let t = 0; t <= lastArrival || pending.length; t++) {
      for (const a of arrivals) if (a.t === t && a.floor !== floor && !pending.includes(a.floor)) pending.push(a.floor);
      if (!pending.length) {
        dir = 0;
        out.push(floor);
        continue;
      }
      const hasAbove = Math.max(...pending) > floor;
      const hasBelow = Math.min(...pending) < floor;
      if (dir === 0) dir = hasAbove ? 1 : -1;
      else if (scan) {
        if (dir === 1 && floor === top) dir = -1;
        else if (dir === -1 && floor === 0) dir = 1;
      } else if (dir === 1 && !hasAbove) dir = -1;
      else if (dir === -1 && !hasBelow) dir = 1;
      floor += dir;
      pending = pending.filter((s) => s !== floor);
      out.push(floor);
    }
    return out;
  },
};

const unit: Unit = {
  id: 'lld-elevator',
  hook: 'The elevator question is really about **scheduling plus state**: which direction am I travelling, and which pending stop do I serve next? A clean tick-based simulation is what interviewers want to see.',
  predict: {
    prompt: 'The car is going up and passes floor 4, where someone pressed the button earlier. What should it do (LOOK/SCAN)?',
    options: ['Skip it and come back on the next sweep down', 'Stop at 4 on the way up, because it is in the direction of travel', 'Reverse immediately and go to floor 4', 'Stop only if the car is empty'],
    answer: 1,
    explain: 'Both SCAN and LOOK serve every pending stop in the current direction of travel first; skipping floors on the way would waste trips.',
  },
  viz,
  deeper: {
    points: [
      '**Direction + set of stops** is the whole state. Each tick: pick or keep a direction, move one floor, and clear the stop you arrived at.',
      '**SCAN** (the "elevator algorithm") sweeps all the way to the end floor before reversing; **LOOK** turns around at the last pending request, so it never travels to an empty end.',
      'The reversal rule is the part people forget: keep going while something is ahead, otherwise flip if something is behind, otherwise go idle.',
      'Real designs add more elevators (a dispatcher assigns each request to the cheapest car), door/overload states, and priority or express floors.',
      'Model time as an injected `tick()` call, not `sleep`: the simulation becomes deterministic and testable.',
    ],
    complexity: { time: 'O(stops) per tick (or O(log n) with sorted structures)', space: 'O(stops)' },
    pitfalls: ['Never reversing at the end of a sweep', 'Ignoring a request for the floor you are on versus opening doors', 'Using a list so duplicate requests are served twice', 'Letting the car run past the building'],
  },
  practice: {
    language: 'python',
    fnName: 'Elevator',
    statement: 'Implement `Elevator(floor=0)` using the LOOK policy. `request(floor)` adds a stop (ignored if it is the current floor). `tick()` moves one floor and returns the new floor: keep the direction while stops remain ahead, reverse when none remain ahead but some remain behind, and stay put (direction 0) when there are no stops. When idle, start upward if any stop is above, else downward. Arriving at a stop removes it.',
    signature: 'class Elevator:',
    solution: `class Elevator:
    def __init__(self, floor=0):
        self.floor = floor
        self.direction = 0
        self.stops = set()

    def request(self, floor):
        if floor != self.floor:
            self.stops.add(floor)

    def tick(self):
        if not self.stops:
            self.direction = 0
            return self.floor
        up = any(s @@>@@ self.floor for s in self.stops)
        down = any(s @@<@@ self.floor for s in self.stops)
        if self.direction == 0:
            self.direction = @@1 if up else -1@@
        elif self.direction == 1 and not up:
            self.direction = @@-1@@
        elif self.direction == -1 and not down:
            self.direction = 1
        self.floor += self.direction
        self.stops.@@discard@@(self.floor)
        return self.floor`,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    tests: [
      { args: [ops('Elevator', 'request', 'tick', 'tick', 'tick', 'tick'), [[0], [3], [], [], [], []]], expected: [null, null, 1, 2, 3, 3], name: 'goes up then idles' },
      { args: [ops('Elevator', 'request', 'request', 'tick', 'tick', 'tick', 'tick', 'request', 'tick', 'tick', 'tick', 'tick'), [[0], [4], [2], [], [], [], [], [1], [], [], [], []]], expected: [null, null, null, 1, 2, 3, 4, null, 3, 2, 1, 1], name: 'serves stops on the way, then reverses' },
      { args: [ops('Elevator', 'request', 'tick', 'request', 'tick', 'tick', 'tick', 'tick'), [[5], [8], [], [2], [], [], [], []]], expected: [null, null, 6, null, 7, 8, 7, 6], name: 'reverses after the last stop above' },
      { args: [ops('Elevator', 'request', 'tick'), [[2], [2], []]], expected: [null, null, 2], name: 'request for the current floor is ignored' },
      { args: [ops('Elevator', 'request', 'tick', 'tick'), [[4], [1], [], []]], expected: [null, null, 3, 2], name: 'starts downward when stops are below' },
      { args: [ops('Elevator', 'request', 'request', 'tick', 'tick', 'tick'), [[0], [2], [2], [], [], []]], expected: [null, null, null, 1, 2, 2], name: 'duplicate requests are one stop' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'Elevator',
    statement: 'Riders on the top floors press "down", but the car just keeps rising past the last floor and never comes back. Find the bug.',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    buggy: `class Elevator:
    def __init__(self, floor=0):
        self.floor = floor
        self.direction = 0
        self.stops = set()

    def request(self, floor):
        if floor != self.floor:
            self.stops.add(floor)

    def tick(self):
        if not self.stops:
            self.direction = 0
            return self.floor
        up = any(s > self.floor for s in self.stops)
        down = any(s < self.floor for s in self.stops)
        if self.direction == 0:
            self.direction = 1 if up else -1
        self.floor += self.direction
        self.stops.discard(self.floor)
        return self.floor`,
    fixed: `class Elevator:
    def __init__(self, floor=0):
        self.floor = floor
        self.direction = 0
        self.stops = set()

    def request(self, floor):
        if floor != self.floor:
            self.stops.add(floor)

    def tick(self):
        if not self.stops:
            self.direction = 0
            return self.floor
        up = any(s > self.floor for s in self.stops)
        down = any(s < self.floor for s in self.stops)
        if self.direction == 0:
            self.direction = 1 if up else -1
        elif self.direction == 1 and not up:
            self.direction = -1
        elif self.direction == -1 and not down:
            self.direction = 1
        self.floor += self.direction
        self.stops.discard(self.floor)
        return self.floor`,
    tests: [
      { args: [ops('Elevator', 'request', 'tick', 'tick', 'tick'), [[0], [2], [], [], []]], expected: [null, null, 1, 2, 2], name: 'simple trip up' },
      { args: [ops('Elevator', 'request', 'tick', 'request', 'tick', 'tick', 'tick', 'tick'), [[5], [8], [], [2], [], [], [], []]], expected: [null, null, 6, null, 7, 8, 7, 6], name: 'reverses after the last stop above' },
      { args: [ops('Elevator', 'request', 'request', 'tick', 'tick', 'tick', 'tick', 'tick'), [[3], [5], [1], [], [], [], [], []]], expected: [null, null, null, 4, 5, 4, 3, 2], name: 'upper stop first, then down' },
    ],
    bugType: 'missing state transition',
    hint: 'When the car is moving up and there is nothing left above it, what should `direction` become?',
    explanation: 'The direction is only chosen when idle (0). Without the two `elif` branches the car keeps its old direction forever and drives past every stop behind it. Reverse when nothing remains ahead but something remains behind.',
  },
  boss: {
    title: 'LOOK service order and distance',
    statement:
      'Write `serve_order(start, requests, direction)` for an elevator that begins at floor `start` heading `direction` (1 = up, -1 = down) with all requests already pressed. Using LOOK, it serves every distinct requested floor in its direction first (ignoring floors equal to `start`), then reverses and serves the rest. Return `[order, distance]` where `order` is the floors in the order served and `distance` is the total floors travelled starting at `start`.',
    language: 'python',
    fnName: 'serve_order',
    starter: `def serve_order(start, requests, direction):
    pass
`,
    solution: `def serve_order(start, requests, direction):
    stops = set(requests) - {start}
    up = sorted(s for s in stops if s > start)
    down = sorted((s for s in stops if s < start), reverse=True)
    order = up + down if direction > 0 else down + up
    distance = 0
    pos = start
    for floor in order:
        distance += abs(floor - pos)
        pos = floor
    return [order, distance]`,
    tests: [
      { args: [5, [8, 2, 6, 1, 9], 1], expected: [[6, 8, 9, 2, 1], 12], name: 'up first' },
      { args: [5, [8, 2, 6, 1, 9], -1], expected: [[2, 1, 6, 8, 9], 12], name: 'down first' },
      { args: [3, [3, 3, 5, 5, 1], 1], expected: [[5, 1], 6], name: 'duplicates and current floor ignored' },
      { args: [0, [], 1], expected: [[], 0], name: 'no requests' },
      { args: [0, [4, 2], -1], expected: [[2, 4], 4], name: 'nothing in the travel direction' },
    ],
    hints: ['Split the distinct requests into those above and those below `start`. Above ones ascend, below ones descend.', 'Concatenate the two lists in the order given by `direction`, then walk it adding `abs(next - pos)`.'],
    combines: ['lld-parking-lot'],
  },
};

export default unit;
