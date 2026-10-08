import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def min_eating_speed(piles, h):
    lo, hi = 1, max(piles)                                  #@init
    while lo < hi:                                          #@loop
        mid = (lo + hi) // 2                                #@mid
        hours = sum((p + mid - 1) // mid for p in piles)    #@feasible
        if hours <= h:                                      #@check
            hi = mid                                        #@ok
        else:
            lo = mid + 1                                    #@tooSlow
    return lo                                               #@done
`;

interface In {
  piles: number[];
  h: number;
}

const viz: VizDef<In> = {
  id: 'bs-on-answer',
  title: 'Binary search on the answer',
  code,
  language: 'python',
  inputs: [
    { key: 'piles', label: 'Piles of bananas', kind: 'numbers', default: [3, 6, 7, 11], maxItems: 8, help: 'Positive whole numbers, each at most 16' },
    { key: 'h', label: 'Hours available (h)', kind: 'number', default: 8 },
  ],
  presets: [
    { label: 'Default', input: { piles: [3, 6, 7, 11], h: 8 } },
    { label: 'Tight deadline', input: { piles: [10, 4, 12, 6], h: 4 } },
    { label: 'Plenty of time', input: { piles: [5, 9, 3], h: 30 } },
    { label: 'Two piles', input: { piles: [8, 5], h: 3 } },
  ],
  run({ piles, h }) {
    if (!Array.isArray(piles) || piles.length === 0) throw new Error('Enter at least one pile');
    if (piles.some((p) => !Number.isInteger(p) || p < 1 || p > 16)) throw new Error('Each pile must be a whole number from 1 to 16 (keeps the picture readable)');
    if (!Number.isInteger(h) || h < piles.length) throw new Error(`h must be at least ${piles.length}: one hour per pile is the minimum`);
    const r = new Recorder(code);
    const maxPile = Math.max(...piles);
    const speeds = Array.from({ length: maxPile }, (_, i) => i + 1);
    const probed: Record<number, Tone> = {}; // index -> tone for speeds already tested

    const candidates = (lo: number, hi: number, mid?: number, hot: Record<number, Tone> = {}): ArrayPanel => {
      const tones: Record<number, Tone> = {};
      speeds.forEach((s, i) => {
        if (s < lo || s > hi) tones[i] = 'muted';
      });
      Object.assign(tones, probed);
      if (mid !== undefined) tones[mid - 1] = 'compare';
      Object.assign(tones, hot);
      const pointers: Record<string, number> = { lo: lo - 1, hi: hi - 1 };
      if (mid !== undefined) pointers.mid = mid - 1;
      return { type: 'array', title: 'Candidate eating speeds (bananas per hour)', values: speeds, tones, pointers, hideIndex: true, range: { from: lo - 1, to: hi - 1, label: 'answer is in here' } };
    };
    const pilesPanel = (): ArrayPanel => ({ type: 'array', title: `piles  (must finish within h = ${h} hours)`, values: piles, hideIndex: true });
    const hoursPanel = (mid: number, hrs: number[], total: number, ok: boolean): ArrayPanel => ({
      type: 'array',
      title: `Hours per pile at speed ${mid}: total ${total} ${ok ? '≤' : '>'} ${h}`,
      values: hrs,
      indexLabels: piles.map((p) => `pile ${p}`),
      tones: Object.fromEntries(hrs.map((_, i) => [i, ok ? 'found' : 'error'])) as Record<number, Tone>,
    });

    let lo = 1;
    let hi = maxPile;
    r.step('init', `The answer is a speed between 1 and max(piles) = ${hi}; eating at ${hi} always works (one hour per pile)`, [candidates(lo, hi), pilesPanel()], { lo, hi, h });
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      r.step('mid', `Probe speed mid = (${lo} + ${hi}) // 2 = ${mid}`, [candidates(lo, hi, mid), pilesPanel()], { lo, hi, mid, h });
      const hrs = piles.map((p) => Math.ceil(p / mid));
      const hours = hrs.reduce((a, b) => a + b, 0);
      r.op(piles.length);
      const ok = hours <= h;
      r.step('feasible', `At speed ${mid}: ${hrs.join(' + ')} = ${hours} hours`, [candidates(lo, hi, mid), hoursPanel(mid, hrs, hours, ok)], { lo, hi, mid, hours, h });
      r.op();
      if (ok) {
        probed[mid - 1] = 'found';
        r.step('check', `${hours} ≤ ${h}: speed ${mid} is fast enough, so try slower`, [candidates(lo, hi, mid, { [mid - 1]: 'found' }), hoursPanel(mid, hrs, hours, ok)], { lo, hi, mid, hours, h });
        hi = mid;
        r.step('ok', `Keep mid as a candidate: hi = ${hi}`, [candidates(lo, hi), pilesPanel()], { lo, hi, h });
      } else {
        probed[mid - 1] = 'error';
        r.step('check', `${hours} > ${h}: speed ${mid} is too slow, so the answer is faster`, [candidates(lo, hi, mid, { [mid - 1]: 'error' }), hoursPanel(mid, hrs, hours, ok)], { lo, hi, mid, hours, h });
        lo = mid + 1;
        r.step('tooSlow', `Rule out ${mid} and everything slower: lo = ${lo}`, [candidates(lo, hi), pilesPanel()], { lo, hi, h });
      }
    }
    r.step('done', `lo == hi == ${lo}: the slowest speed that still finishes in ${h} hours`, [candidates(lo, hi, undefined, { [lo - 1]: 'found' }), pilesPanel()], { answer: lo });
    return { frames: r.frames, result: lo };
  },
  reference({ piles, h }) {
    for (let k = 1; ; k++) {
      let t = 0;
      for (const p of piles) t += Math.ceil(p / k);
      if (t <= h) return k;
    }
  },
};

const tests = [
  { args: [[3, 6, 7, 11], 8], expected: 4 },
  { args: [[30, 11, 23, 4, 20], 5], expected: 30 },
  { args: [[30, 11, 23, 4, 20], 6], expected: 23 },
  { args: [[5], 5], expected: 1, name: 'one pile, plenty of time' },
  { args: [[5], 1], expected: 5, name: 'one pile, one hour' },
  { args: [[1, 1, 1], 3], expected: 1, name: 'tiny piles' },
  { args: [[312884470], 312884469], expected: 2, name: 'huge pile (no linear scan)' },
];

const unit: Unit = {
  id: 'bs-on-answer',
  hook: 'Sometimes the thing you binary search is not an array but the answer itself: "smallest speed / capacity / time such that X is possible". If you can test one candidate quickly and feasibility is monotone, binary search finds the cutoff.',
  predict: {
    prompt: 'piles = [3, 6, 7, 11], h = 8. At speed 4 the hours are 1 + 2 + 2 + 3 = 8. If speed 4 is feasible, what does binary search conclude?',
    options: ['The answer is exactly 4', 'The answer is 4 or smaller, so keep 4 and search lower', 'The answer is larger than 4', 'Every speed above 4 is infeasible'],
    answer: 1,
    explain: 'Feasibility is monotone: any speed ≥ a feasible one is also feasible. So 4 might be the minimum or a slower speed might still work. Keep 4 as a candidate (hi = mid) and look lower.',
  },
  viz,
  deeper: {
    points: [
      'Pattern: define feasible(x), check it is monotone (false, false, ..., true, true), and search for the first true.',
      'The search space is the range of possible answers (here 1..max(piles)), not the input array.',
      'Use `hi = mid` when mid is feasible (it could be the answer) and `lo = mid + 1` when it is not. The loop `while lo < hi` ends with lo == hi == the minimum feasible value.',
      'Ceil division without floats: (p + mid - 1) // mid.',
      'Same recipe: ship capacity within D days, split array largest sum, smallest divisor under a threshold.',
    ],
    complexity: { time: 'O(n log M) where M is the largest answer', space: 'O(1)' },
    pitfalls: ['Using floor division for hours (underestimates, picks a speed that is too slow)', 'Setting lo = mid on failure (infinite loop)', 'Wrong bounds: lo must be a value that can be the answer, hi one that is guaranteed feasible'],
  },
  practice: {
    language: 'python',
    fnName: 'min_eating_speed',
    statement: 'Piles of bananas must all be eaten in `h` hours. Each hour you pick one pile and eat up to `k` bananas from it (leftovers in that pile are wasted for the hour). Return the minimum integer k that finishes in time. You are guaranteed h >= len(piles).',
    signature: 'def min_eating_speed(piles, h):',
    solution: `def min_eating_speed(piles, h):
    lo, hi = 1, @@max(piles)@@
    while @@lo < hi@@:
        mid = (lo + hi) // 2
        hours = sum(@@(p + mid - 1) // mid@@ for p in piles)
        if @@hours <= h@@:
            hi = @@mid@@
        else:
            lo = @@mid + 1@@
    return lo`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'min_eating_speed',
    statement: 'This returns speeds that are too slow: the eater cannot finish in h hours. Find the bug.',
    buggy: `def min_eating_speed(piles, h):
    lo, hi = 1, max(piles)
    while lo < hi:
        mid = (lo + hi) // 2
        hours = sum(p // mid for p in piles)
        if hours <= h:
            hi = mid
        else:
            lo = mid + 1
    return lo`,
    fixed: `def min_eating_speed(piles, h):
    lo, hi = 1, max(piles)
    while lo < hi:
        mid = (lo + hi) // 2
        hours = sum((p + mid - 1) // mid for p in piles)
        if hours <= h:
            hi = mid
        else:
            lo = mid + 1
    return lo`,
    tests,
    bugType: 'rounding down instead of up',
    hint: 'A pile of 7 eaten at 4 per hour takes how many hours? What does 7 // 4 say?',
    explanation: 'A partial hour is still an hour: a pile of 7 at speed 4 needs ceil(7 / 4) = 2 hours, but 7 // 4 = 1. The feasibility check undercounts, so too-slow speeds look fine. Use (p + mid - 1) // mid.',
  },
  boss: {
    title: 'Ship packages within D days',
    statement: 'Packages with the given weights must be shipped in the given order. Each day the ship loads consecutive packages without exceeding its capacity. Return the smallest capacity that gets everything shipped within `days` days.',
    language: 'python',
    fnName: 'ship_capacity',
    starter: `def ship_capacity(weights, days):
    # your code here
    pass
`,
    solution: `def ship_capacity(weights, days):
    if not weights:
        return 0
    lo, hi = max(weights), sum(weights)
    while lo < hi:
        mid = (lo + hi) // 2
        need, load = 1, 0
        for w in weights:
            if load + w > mid:
                need += 1
                load = 0
            load += w
        if need <= days:
            hi = mid
        else:
            lo = mid + 1
    return lo`,
    tests: [
      { args: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5], expected: 15 },
      { args: [[3, 2, 2, 4, 1, 4], 3], expected: 6 },
      { args: [[1, 2, 3, 1, 1], 4], expected: 3 },
      { args: [[7], 1], expected: 7, name: 'one package' },
      { args: [[5, 5, 5], 3], expected: 5, name: 'one package per day' },
      { args: [[5, 5, 5], 1], expected: 15, name: 'everything in one day' },
      { args: [[], 3], expected: 0, name: 'nothing to ship' },
    ],
    hints: ['What are the smallest and largest sensible capacities? Is "can ship in D days" monotone in capacity?', 'Search capacity from max(weights) to sum(weights). To test a capacity, load greedily day by day, starting a new day whenever the next package would overflow, and count days.'],
    combines: ['bs-on-answer', 'binary-search'],
  },
};

export default unit;
