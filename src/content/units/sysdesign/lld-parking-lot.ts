import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { kvPanel, logPanel } from '@/content/lib/backend-rest';
import { OPS_HARNESS } from '@/content/lib/harness';
import { ops } from '@/content/lib/sysdesign-hld-1';

const code = `
RATE = {'S': 1, 'M': 2, 'L': 4}
ORDER = 'SML'

class ParkingLot:
    def __init__(self, small, medium, large):
        self.free = {k: [k + str(i + 1) for i in range(n)]
                     for k, n in (('S', small), ('M', medium), ('L', large))}   #@init
        self.parked = {}

    def park(self, plate, size, t):
        if plate in self.parked:
            return None
        for kind in ORDER[ORDER.index(size):]:       #@fit
            if self.free[kind]:
                spot = self.free[kind].pop(0)        #@take
                self.parked[plate] = (spot, size, t)
                return spot
        return None                                  #@full

    def leave(self, plate, t):
        if plate not in self.parked:
            return -1                                #@unknown
        spot, size, start = self.parked.pop(plate)   #@release
        self.free[spot[0]] = sorted(self.free[spot[0]] + [spot])
        hours = max(1, (t - start + 59) // 60)       #@hours
        return hours * RATE[size]                    #@fee
`;

interface In {
  small: number;
  medium: number;
  large: number;
  events: string[];
}
type Ev = { kind: 'park'; plate: string; size: 'S' | 'M' | 'L'; t: number } | { kind: 'leave'; plate: string; t: number };

const RATE: Record<string, number> = { S: 1, M: 2, L: 4 };
const RANK: Record<string, number> = { S: 0, M: 1, L: 2 };
const clampN = (n: number) => Math.max(0, Math.min(4, Math.round(n) || 0));

function parseEvents(list: string[]): Ev[] {
  return list.map((raw) => {
    const p = raw.split(':').map((x) => x.trim());
    if (p[0].toLowerCase() === 'park' && p.length === 4 && p[1] && ['S', 'M', 'L'].includes(p[2].toUpperCase()) && p[3] !== '' && Number.isFinite(Number(p[3]))) {
      return { kind: 'park', plate: p[1], size: p[2].toUpperCase() as 'S' | 'M' | 'L', t: Number(p[3]) };
    }
    if (p[0].toLowerCase() === 'leave' && p.length === 3 && p[1] && p[2] !== '' && Number.isFinite(Number(p[2]))) return { kind: 'leave', plate: p[1], t: Number(p[2]) };
    throw new Error(`Cannot read "${raw}". Use park:plate:S|M|L:minute or leave:plate:minute`);
  });
}

const viz: VizDef<In> = {
  id: 'lld-parking-lot',
  title: 'Parking lot: best-fit spots and hourly fees',
  code,
  language: 'python',
  inputs: [
    { key: 'small', label: 'Small spots (0-4)', kind: 'number', default: 1 },
    { key: 'medium', label: 'Medium spots (0-4)', kind: 'number', default: 1 },
    { key: 'large', label: 'Large spots (0-4)', kind: 'number', default: 1 },
    { key: 'events', label: 'Events (minutes)', kind: 'strings', default: ['park:bike:S:0', 'park:car1:M:5', 'park:car2:M:10', 'park:van:L:12', 'leave:car1:125', 'park:van:L:130', 'leave:car2:200'], maxItems: 12, help: 'park:plate:S|M|L:t, leave:plate:t' },
  ],
  presets: [
    { label: 'Overflow to bigger', input: { small: 1, medium: 1, large: 1, events: ['park:bike:S:0', 'park:car1:M:5', 'park:car2:M:10', 'park:van:L:12', 'leave:car1:125', 'park:van:L:130', 'leave:car2:200'] } },
    { label: 'Lot is full', input: { small: 0, medium: 1, large: 0, events: ['park:a:M:0', 'park:b:M:1', 'park:c:S:2', 'leave:a:30', 'park:b:M:31'] } },
    { label: 'Rounding up', input: { small: 2, medium: 0, large: 0, events: ['park:a:S:0', 'leave:a:60', 'park:a:S:70', 'leave:a:131', 'leave:zzz:140'] } },
  ],
  run(input) {
    const counts = { S: clampN(input.small), M: clampN(input.medium), L: clampN(input.large) };
    const events = parseEvents(input.events);
    const r = new Recorder(code);
    const free: Record<string, string[]> = {};
    for (const k of ['S', 'M', 'L'] as const) free[k] = Array.from({ length: counts[k] }, (_, i) => `${k}${i + 1}`);
    const allSpots = (['S', 'M', 'L'] as const).flatMap((k) => free[k].slice());
    const occupant: Record<string, string> = {};
    const parked = new Map<string, { spot: string; size: string; start: number }>();
    const log: { text: string; tone?: Tone }[] = [];
    let revenue = 0;
    const results: (string | number | null)[] = [];
    const view = (tones: Record<string, Tone> = {}): Panel[] => [
      {
        type: 'array',
        title: 'Spots (S small, M medium, L large)',
        values: allSpots.map((s) => occupant[s] ?? 'free'),
        indexLabels: allSpots,
        tones: Object.fromEntries(allSpots.map((s, i) => [i, tones[s] ?? (occupant[s] ? 'active' : 'muted')])),
      },
      kvPanel('Lot', { revenue, parked: parked.size, free: allSpots.length - parked.size }),
      logPanel('Events', log),
    ];
    if (!allSpots.length) throw new Error('The lot needs at least one spot');
    r.step('init', `Lot with ${counts.S} small, ${counts.M} medium and ${counts.L} large spots`, view(), { spots: allSpots.length });
    for (const ev of events) {
      r.op();
      if (ev.kind === 'park') {
        if (parked.has(ev.plate)) {
          log.push({ text: `t=${ev.t} ${ev.plate}: already parked`, tone: 'error' });
          results.push(null);
          r.step('full', `${ev.plate} is already inside: refuse`, view(), { plate: ev.plate });
          continue;
        }
        const allowed = 'SML'.slice(RANK[ev.size]);
        r.step('fit', `t=${ev.t} ${ev.plate} (${ev.size}) fits spot kinds: ${allowed.split('').join(', ')}`, view(), { plate: ev.plate, size: ev.size });
        const kind = allowed.split('').find((k) => free[k].length > 0);
        if (!kind) {
          log.push({ text: `t=${ev.t} ${ev.plate}: no spot`, tone: 'error' });
          results.push(null);
          r.step('full', `No free spot of kind ${allowed.split('').join('/')}: lot full for ${ev.plate}`, view(), { plate: ev.plate });
          continue;
        }
        const spot = free[kind].shift()!;
        parked.set(ev.plate, { spot, size: ev.size, start: ev.t });
        occupant[spot] = ev.plate;
        log.push({ text: `t=${ev.t} ${ev.plate} -> ${spot}`, tone: 'found' });
        results.push(spot);
        r.step('take', kind === ev.size ? `Take the first free ${kind} spot: ${spot}` : `No ${ev.size} free, overflow into bigger ${kind}: ${spot}`, view({ [spot]: 'new' }), { plate: ev.plate, spot });
        continue;
      }
      const rec = parked.get(ev.plate);
      if (!rec) {
        log.push({ text: `t=${ev.t} ${ev.plate}: not parked`, tone: 'error' });
        results.push(-1);
        r.step('unknown', `${ev.plate} is not in the lot: return -1`, view(), { plate: ev.plate });
        continue;
      }
      parked.delete(ev.plate);
      delete occupant[rec.spot];
      free[rec.spot[0]] = [...free[rec.spot[0]], rec.spot].sort();
      r.step('release', `t=${ev.t} ${ev.plate} leaves ${rec.spot}; the spot is free again`, view({ [rec.spot]: 'swap' }), { plate: ev.plate });
      const minutes = ev.t - rec.start;
      const hours = Math.max(1, Math.floor((minutes + 59) / 60));
      const fee = hours * RATE[rec.size];
      revenue += fee;
      r.step('hours', `${minutes} min -> ${hours} hour${hours > 1 ? 's' : ''} (round up, minimum 1)`, view(), { minutes, hours });
      log.push({ text: `t=${ev.t} ${ev.plate} pays ${fee}`, tone: 'compare' });
      results.push(fee);
      r.step('fee', `${hours} h x rate ${RATE[rec.size]} (${rec.size}) = ${fee}`, view(), { fee, revenue });
    }
    r.step('init', `Done: revenue ${revenue}, ${parked.size} vehicle${parked.size === 1 ? '' : 's'} still parked`, view(), { revenue });
    return { frames: r.frames, result: results };
  },
  reference(input) {
    // Flat list of spots in S, M, L order; a vehicle takes the first free spot whose rank is at least its own.
    const spots: { id: string; rank: number; plate: string | null }[] = [];
    (['S', 'M', 'L'] as const).forEach((k) => {
      for (let i = 1; i <= clampN({ S: input.small, M: input.medium, L: input.large }[k]); i++) spots.push({ id: `${k}${i}`, rank: RANK[k], plate: null });
    });
    const info = new Map<string, { size: string; start: number }>();
    const out: (string | number | null)[] = [];
    for (const ev of parseEvents(input.events)) {
      if (ev.kind === 'park') {
        const s = info.has(ev.plate) ? undefined : spots.find((x) => x.plate === null && x.rank >= RANK[ev.size]);
        if (!s) {
          out.push(null);
          continue;
        }
        s.plate = ev.plate;
        info.set(ev.plate, { size: ev.size, start: ev.t });
        out.push(s.id);
      } else {
        const meta = info.get(ev.plate);
        const s = spots.find((x) => x.plate === ev.plate);
        if (!meta || !s) {
          out.push(-1);
          continue;
        }
        s.plate = null;
        info.delete(ev.plate);
        out.push(Math.max(1, Math.ceil((ev.t - meta.start) / 60)) * RATE[meta.size]);
      }
    }
    return out;
  },
};

const unit: Unit = {
  id: 'lld-parking-lot',
  hook: 'Parking lot is the warm-up LLD question: it checks that you model entities (spot, vehicle, lot), pick the right spot with a clear rule, and keep pricing separate from storage.',
  predict: {
    prompt: 'A motorcycle arrives and every small spot is taken, but a medium spot is free. What should a sensible lot do?',
    options: ['Reject it: motorcycles are only for small spots', 'Park it in the free medium spot', 'Make it wait until a small spot frees up', 'Park it in the large spot to save medium ones'],
    answer: 1,
    explain: 'A vehicle may use any spot at least as large as itself. Choosing the smallest spot that fits (best fit) keeps big spots free for big vehicles.',
  },
  viz,
  deeper: {
    points: [
      'Separate the **what fits** rule (a size ordering) from the **which one** rule (smallest free spot, lowest number first).',
      'Keep a free list per size so allocation is O(number of sizes), not O(spots). A `plate -> ticket` dict makes `leave` O(1).',
      'Pass the time in (`park(plate, size, t)`) instead of calling the clock inside: fees become deterministic and testable.',
      'Fees round **up** to whole hours with a minimum of one hour; integer arithmetic `(m + 59) // 60` avoids float surprises.',
      'In a real design the fee policy would be its own class (strategy pattern) so weekend or EV pricing does not touch the lot.',
    ],
    complexity: { time: 'O(1) park and leave (constant number of sizes)', space: 'O(spots + parked vehicles)' },
    pitfalls: ['Rounding the fee down so short stays are free', 'Forgetting to return the spot to its free list on exit', 'Letting the same plate park twice', 'Charging by spot size instead of vehicle size without saying so'],
  },
  practice: {
    language: 'python',
    fnName: 'ParkingLot',
    statement: 'Implement `ParkingLot(small, medium, large)`. `park(plate, size, t)` puts a vehicle of size "S", "M" or "L" in the lowest-numbered free spot of the smallest kind that fits (spots are named S1.., M1.., L1..) and returns its name, or None if none fits or the plate is already parked. `leave(plate, t)` frees the spot and returns the fee: hours rounded up (minimum 1) times the vehicle rate S=1, M=2, L=4; unknown plate returns -1.',
    signature: 'class ParkingLot:',
    solution: `RATE = {'S': 1, 'M': 2, 'L': 4}
ORDER = 'SML'

class ParkingLot:
    def __init__(self, small, medium, large):
        self.free = {k: [k + str(i + 1) for i in range(n)]
                     for k, n in (('S', small), ('M', medium), ('L', large))}
        self.parked = {}

    def park(self, plate, size, t):
        if plate in self.parked:
            return None
        for kind in ORDER[@@ORDER.index(size)@@:]:
            if self.free[kind]:
                spot = self.free[kind].@@pop(0)@@
                self.parked[plate] = (spot, size, t)
                return spot
        return None

    def leave(self, plate, t):
        if plate not in self.parked:
            return @@-1@@
        spot, size, start = self.parked.pop(plate)
        self.free[spot[0]] = sorted(self.free[spot[0]] + [spot])
        hours = max(1, @@(t - start + 59) // 60@@)
        return hours * RATE[size]`,
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    tests: [
      { args: [ops('ParkingLot', 'park', 'park', 'park', 'park', 'leave', 'park'), [[1, 1, 1], ['m1', 'S', 0], ['c1', 'M', 1], ['c2', 'M', 2], ['t1', 'L', 3], ['m1', 65], ['c3', 'M', 70]]], expected: [null, 'S1', 'M1', 'L1', null, 2, null], name: 'overflow then full' },
      { args: [ops('ParkingLot', 'park', 'leave'), [[0, 0, 1], ['b', 'S', 0], ['b', 0]]], expected: [null, 'L1', 1], name: 'bike in a large spot, minimum 1 hour' },
      { args: [ops('ParkingLot', 'park', 'leave', 'park', 'leave'), [[1, 1, 1], ['c', 'M', 0], ['c', 60], ['c', 'M', 100], ['c', 161]]], expected: [null, 'M1', 2, 'M1', 4], name: 'round up to the next hour' },
      { args: [ops('ParkingLot', 'park', 'park', 'leave', 'leave'), [[1, 1, 1], ['a', 'M', 0], ['a', 'M', 5], ['a', 10], ['a', 20]]], expected: [null, 'M1', null, 2, -1], name: 'duplicate plate and unknown plate' },
      { args: [ops('ParkingLot', 'park', 'park', 'leave', 'park'), [[2, 0, 0], ['a', 'S', 0], ['b', 'S', 1], ['a', 30], ['c', 'S', 40]]], expected: [null, 'S1', 'S2', 1, 'S1'], name: 'freed spot is reused lowest first' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'ParkingLot',
    statement: 'Drivers who stay less than an hour are never charged, and the lot owner is losing money. Fix the fee.',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    buggy: `RATE = {'S': 1, 'M': 2, 'L': 4}
ORDER = 'SML'

class ParkingLot:
    def __init__(self, small, medium, large):
        self.free = {k: [k + str(i + 1) for i in range(n)]
                     for k, n in (('S', small), ('M', medium), ('L', large))}
        self.parked = {}

    def park(self, plate, size, t):
        if plate in self.parked:
            return None
        for kind in ORDER[ORDER.index(size):]:
            if self.free[kind]:
                spot = self.free[kind].pop(0)
                self.parked[plate] = (spot, size, t)
                return spot
        return None

    def leave(self, plate, t):
        if plate not in self.parked:
            return -1
        spot, size, start = self.parked.pop(plate)
        self.free[spot[0]] = sorted(self.free[spot[0]] + [spot])
        hours = (t - start) // 60
        return hours * RATE[size]`,
    fixed: `RATE = {'S': 1, 'M': 2, 'L': 4}
ORDER = 'SML'

class ParkingLot:
    def __init__(self, small, medium, large):
        self.free = {k: [k + str(i + 1) for i in range(n)]
                     for k, n in (('S', small), ('M', medium), ('L', large))}
        self.parked = {}

    def park(self, plate, size, t):
        if plate in self.parked:
            return None
        for kind in ORDER[ORDER.index(size):]:
            if self.free[kind]:
                spot = self.free[kind].pop(0)
                self.parked[plate] = (spot, size, t)
                return spot
        return None

    def leave(self, plate, t):
        if plate not in self.parked:
            return -1
        spot, size, start = self.parked.pop(plate)
        self.free[spot[0]] = sorted(self.free[spot[0]] + [spot])
        hours = max(1, (t - start + 59) // 60)
        return hours * RATE[size]`,
    tests: [
      { args: [ops('ParkingLot', 'park', 'leave'), [[1, 1, 1], ['a', 'M', 0], ['a', 10]]], expected: [null, 'M1', 2], name: 'ten minutes costs one hour' },
      { args: [ops('ParkingLot', 'park', 'leave', 'park', 'leave'), [[1, 1, 1], ['c', 'M', 0], ['c', 60], ['c', 'M', 100], ['c', 161]]], expected: [null, 'M1', 2, 'M1', 4], name: 'partial hours round up' },
      { args: [ops('ParkingLot', 'park', 'leave', 'leave'), [[1, 0, 0], ['b', 'S', 5], ['b', 5], ['b', 6]]], expected: [null, 'S1', 1, -1], name: 'zero minutes still one hour' },
    ],
    bugType: 'rounding down',
    hint: 'What does `(t - start) // 60` give for a 10-minute stay?',
    explanation: 'Floor division drops the partial hour, so any stay under 60 minutes costs nothing. Round up with `(minutes + 59) // 60` and charge at least one hour.',
  },
  boss: {
    title: 'Parking lot with a daily cap',
    statement:
      'Implement `ParkingLot(layout)` where `layout` is a string such as "SMML" giving the kind of each spot by index. `park(plate, size, t)` uses the lowest-index free spot whose kind is at least as large as the vehicle and returns that index, or -1 (no fit, or plate already parked). `available(size)` returns how many free spots could take that size. `leave(plate, t)` frees the spot and returns the fee: 0 if the stay is at most 15 minutes, otherwise hours rounded up, capped at 8 hours, times the vehicle rate S=1, M=2, L=4. Unknown plate returns -1.',
    language: 'python',
    fnName: 'ParkingLot',
    harness: OPS_HARNESS,
    adapter: 'run_ops',
    starter: `class ParkingLot:
    # your code here
    pass
`,
    solution: `class ParkingLot:
    RATE = {'S': 1, 'M': 2, 'L': 4}

    def __init__(self, layout):
        self.layout = layout
        self.spots = [None] * len(layout)
        self.where = {}

    def _fits(self, kind, size):
        return 'SML'.index(kind) >= 'SML'.index(size)

    def park(self, plate, size, t):
        if plate in self.where:
            return -1
        for i, kind in enumerate(self.layout):
            if self.spots[i] is None and self._fits(kind, size):
                self.spots[i] = (plate, size, t)
                self.where[plate] = i
                return i
        return -1

    def available(self, size):
        return sum(1 for i, k in enumerate(self.layout) if self.spots[i] is None and self._fits(k, size))

    def leave(self, plate, t):
        if plate not in self.where:
            return -1
        i = self.where.pop(plate)
        _, size, start = self.spots[i]
        self.spots[i] = None
        minutes = t - start
        if minutes <= 15:
            return 0
        hours = (minutes + 59) // 60
        return min(hours, 8) * self.RATE[size]`,
    tests: [
      { args: [ops('ParkingLot', 'park', 'park', 'park', 'park', 'available'), [['SML'], ['a', 'S', 0], ['b', 'S', 0], ['c', 'S', 0], ['d', 'S', 0], ['S']]], expected: [null, 0, 1, 2, -1, 0], name: 'small vehicles fill upward' },
      { args: [ops('ParkingLot', 'park', 'leave', 'park', 'leave'), [['L'], ['t', 'L', 0], ['t', 15], ['t', 'L', 20], ['t', 1020]]], expected: [null, 0, 0, 0, 32], name: 'grace period and daily cap' },
      { args: [ops('ParkingLot', 'available', 'park', 'available', 'available'), [['SMM'], ['M'], ['x', 'M', 0], ['M'], ['S']]], expected: [null, 2, 1, 1, 2], name: 'availability by size' },
      { args: [ops('ParkingLot', 'park', 'park', 'leave', 'leave'), [['SM'], ['a', 'M', 0], ['a', 'S', 1], ['z', 5], ['a', 16]]], expected: [null, 1, -1, -1, 2], name: 'duplicate and unknown plates' },
      { args: [ops('ParkingLot', 'park', 'leave'), [['S'], ['p', 'S', 0], ['p', 61]]], expected: [null, 0, 2], name: 'round up after the grace period' },
    ],
    hints: ['Keep `spots` as a list (None = free) plus a dict plate -> index. A helper `fits(kind, size)` compares positions in "SML".', 'Fee: return 0 first if minutes <= 15, then `min((minutes + 59) // 60, 8) * RATE[size]`.'],
    combines: ['lld-lru-cache'],
  },
};

export default unit;
