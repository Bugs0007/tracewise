import type { Tone } from '@/engine/types';
import { arrayView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './car-fleet.py?raw';
import cases from './car-fleet.cases.json';

const r2 = (x: number): number => Math.round(x * 100) / 100;

const viz = vizOf<{ target: number; position: number[]; speed: number[] }>({
  id: 'car-fleet',
  title: 'Car Fleet',
  solution,
  inputs: [
    { key: 'target', label: 'target (finish line)', kind: 'number', default: 20 },
    { key: 'position', label: 'start positions', kind: 'numbers', default: [4, 2, 12, 8, 14], maxItems: 9 },
    { key: 'speed', label: 'speeds', kind: 'numbers', default: [3, 5, 1, 4, 2], maxItems: 9 },
  ],
  presets: [
    { label: 'Mixed', input: { target: 20, position: [4, 2, 12, 8, 14], speed: [3, 5, 1, 4, 2] } },
    { label: 'All separate', input: { target: 30, position: [10, 20, 28], speed: [1, 2, 3] } },
    { label: 'One fleet', input: { target: 100, position: [10, 20, 30, 40], speed: [9, 8, 7, 1] } },
  ],
  validate: ({ target, position, speed }) => {
    if (position.length !== speed.length) return 'Give one speed per position';
    if (new Set(position).size !== position.length) return 'Positions must be different';
    if (speed.some((s) => !(s > 0))) return 'Speeds must be above 0';
    if (position.some((p) => p >= target || p < 0)) return 'Every start position must be below the target';
    return null;
  },
  run({ target, position, speed }) {
    const r = new TraceRecorder(solution);
    const cars = position.map((p, i) => [p, speed[i]] as [number, number]).sort((a, b) => b[0] - a[0]);
    const times: number[] = [];
    const kind: Tone[] = [];
    let fleets = 0;
    let slowest = 0;
    const view = (i: number, hot: Tone | null = null) => {
      const tones: Record<number, Tone> = {};
      kind.forEach((k, q) => (tones[q] = k));
      if (hot && i < cars.length) tones[i] = hot;
      return [
        arrayView(cars.map(([p]) => p), { title: `start positions, front car first (target ${target})`, tones, pointers: i < cars.length ? { car: i } : undefined }),
        arrayView(cars.map(([, s]) => s), { title: 'speeds', tones: { ...tones } }),
        arrayView(cars.map((_, q) => (q < times.length ? r2(times[q]) : null)), { title: 'hours to reach the target alone', tones }),
        hashMapView({ fleets, 'slowest fleet ahead (hours)': r2(slowest) }, {}),
      ];
    };
    r.step('sort', 'Sort cars by start position, front car first. A car can only ever join fleets ahead of it.', view(0), {});
    r.step('fleets', 'fleets counts the groups that arrive together.', view(0), { fleets });
    r.step('slowest', 'slowest is the arrival time of the fleet ahead (a car cannot pass it).', view(0), { slowest });
    for (let i = 0; i < cars.length; i++) {
      const [pos, spd] = cars[i];
      r.op();
      const t = (target - pos) / spd;
      r.step('loop', `Car at ${pos} with speed ${spd}.`, view(i, 'active'), { pos, spd });
      r.predictChoice('time', `Driving alone, how many hours does the car at ${pos} (speed ${spd}) need for the remaining ${target - pos}?`, String(r2(t)), [String(r2(t + 1)), String(r2(spd / Math.max(1, target - pos))), String(target - pos)], i, 'Time = distance left ÷ speed.');
      times.push(t);
      r.step('time', `t = (${target} − ${pos}) / ${spd} = ${r2(t)} hours.`, view(i, 'active'), { t: r2(t) });
      const fresh = t > slowest;
      r.predict(fresh ? 'new' : 'join', `This car needs ${r2(t)} h; the fleet ahead needs ${r2(slowest)} h. What happens?`, ['It arrives later: a new fleet', 'It would arrive sooner, so it catches up and joins the fleet ahead'], fresh ? 0 : 1, fresh ? 'It cannot catch the fleet ahead before the finish, so it travels alone.' : 'It would reach the target first, but cannot pass: it slows to the fleet ahead and arrives with it.');
      if (fresh) {
        fleets++;
        slowest = t;
        kind[i] = 'found';
        r.step('new', `A new fleet! fleets = ${fleets}, slowest = ${r2(slowest)}.`, view(i), { fleets });
      } else {
        kind[i] = 'muted';
        r.step('check', `${r2(t)} ≤ ${r2(slowest)}: this car joins the fleet ahead.`, view(i), { fleets });
      }
    }
    r.step('done', `${fleets} fleet${fleets === 1 ? '' : 's'} reach the target.`, view(cars.length), { result: fleets });
    return { frames: r.frames, result: fleets };
  },
  reference({ target, position, speed }) {
    const cars = position.map((p, i) => [p, speed[i]]).sort((a, b) => b[0] - a[0]);
    const ts = cars.map(([p, s]) => (target - p) / s);
    return ts.filter((t, i) => ts.slice(0, i).every((u) => t > u)).length;
  },
});

export default problem({
  summary: 'Cars start at different points on a one-lane road and drive toward the same finish line, each at its own constant speed. A car cannot pass the one in front; it just slows down and travels with it. Count how many separate groups of cars reach the finish line.',
  example: ['target 12, cars at [0, 6] with speeds [4, 1]', '1', 'The car at 0 would arrive in 3 hours but the car at 6 needs 6, so the first catches up and they finish together as one fleet.'],
  pattern: ['monotonic-stack', ['monotonic-stack', 'sorting', 'greedy', 'two-pointers'], 'Sort by position and compute each car’s arrival time. A car forms a new fleet only if it arrives later than the fleet ahead, so you only track the slowest arrival time so far.', {
    sorting: 'Sorting is the first step, but the counting rule (slower arrival = new fleet) is the heart of it.',
    greedy: 'The approach is greedy, and the "stack of fleet times" idea is what makes it clean.',
    'two-pointers': 'No two ends are compared; one pass with the front car’s time suffices.',
  }],
  hints: [
    'If a car had the road to itself, when would it reach the finish? How do two cars compare using only those times?',
    'Look at cars from the front of the road to the back. When does a car get stuck behind the car ahead?',
    'Sort by position (front first). A car starts a new fleet only if its own arrival time is strictly larger than the fleet ahead; otherwise it merges.',
  ],
  insight: 'Compute each car’s solo arrival time, go from the front car to the back, and count a new fleet whenever the time exceeds every time ahead.',
  brute: 'Simulate the cars minute by minute and merge on contact: much slower and fiddly.',
  optimal: 'Sort, then one pass tracking the slowest arrival ahead: O(n log n) time.',
  walk: ['Pair each position with its speed and sort by position, descending (front first).', 'For each car compute t = (target − position) / speed.', 'If t is greater than the slowest time seen so far, the car cannot catch the fleet ahead: count a new fleet and record t.', 'Otherwise it catches up and joins the fleet ahead (nothing changes).'],
  edge: ['No cars.', 'A single car.', 'Two cars with the same arrival time form one fleet (use strictly greater).', 'A fast car far behind a slow one merges.'],
  works: ['A car behind arrives no earlier than the fleet ahead if it would otherwise reach the finish first, because it cannot pass. So its effective arrival time is max(its own, the fleet ahead).', 'A new fleet is created exactly when a car’s own time exceeds the previous fleet time.'],
  time: ['O(n log n)', 'Sorting dominates; the pass is O(n).'],
  space: ['O(n)', 'The sorted list of cars.'],
  solution,
  cases,
  sig: 'def car_fleet(target, position, speed):\n    # number of fleets that reach the target\n    pass\n',
  viz,
  fromArgs: ([target, position, speed]) => ({ target, position, speed }),
});
