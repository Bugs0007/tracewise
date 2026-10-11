import type { Tone } from '@/engine/types';
import { gridView, hashMapView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './merge-triplets-to-form-target-triplet.py?raw';
import cases from './merge-triplets-to-form-target-triplet.cases.json';

const viz = vizOf<{ triplets: number[][]; target: number[] }>({
  id: 'merge-triplets-to-form-target-triplet',
  title: 'Merge Triplets to Form Target Triplet',
  solution,
  inputs: [
    { key: 'triplets', label: 'triplets (one "a b c" per line)', kind: 'grid', default: [[2, 1, 1], [1, 3, 1], [1, 1, 4], [9, 9, 9]], maxItems: 18 },
    { key: 'target', label: 'target triplet', kind: 'numbers', default: [2, 3, 4], maxItems: 3 },
  ],
  presets: [
    { label: 'Each part from one', input: { triplets: [[2, 1, 1], [1, 3, 1], [1, 1, 4], [9, 9, 9]], target: [2, 3, 4] } },
    { label: 'Missing a position', input: { triplets: [[1, 1, 1], [2, 2, 1]], target: [2, 2, 3] } },
    { label: 'Blocked by a big entry', input: { triplets: [[5, 1, 1], [1, 5, 1], [1, 1, 5], [1, 1, 9]], target: [5, 5, 5] } },
    { label: 'One exact triplet', input: { triplets: [[3, 3, 3]], target: [3, 3, 3] } },
  ],
  validate: ({ triplets, target }) => (target.length !== 3 || target.some((v) => v === null) ? 'The target needs exactly three numbers' : triplets.some((t) => t.length !== 3 || t.some((v) => typeof v !== 'number')) ? 'Every triplet needs exactly three numbers' : null),
  run({ triplets, target }) {
    const r = new TraceRecorder(solution);
    const got = [false, false, false];
    const tones: Record<string, Tone> = {};
    let askedOk = false;
    let askedBad = false;
    let askedHit = false;
    const view = () => [
      gridView(triplets, { title: 'triplets (merging = taking the maximum in each position)', tones, rowLabels: triplets.map((_, i) => `#${i}`), compact: false }),
      hashMapView({ target: `(${target.join(', ')})`, 'position 0 achieved': got[0] ? 'yes' : 'no', 'position 1 achieved': got[1] ? 'yes' : 'no', 'position 2 achieved': got[2] ? 'yes' : 'no' }),
    ];
    r.step('init', `Merging takes the maximum in each position, so a triplet with ANY entry larger than the target can never be used. got[k] records whether some usable triplet supplies the target value in position k exactly.`, view(), {});
    for (let i = 0; i < triplets.length; i++) {
      r.op();
      const t = triplets[i];
      const ok = t[0] <= target[0] && t[1] <= target[1] && t[2] <= target[2];
      for (let k = 0; k < 3; k++) tones[`${i},${k}`] = 'active';
      r.step('loop', `Triplet #${i} = (${t.join(', ')}). Is every entry ≤ the target (${target.join(', ')})?`, view(), { i });
      if (!ok) {
        if (!askedBad) {
          askedBad = true;
          r.predict('ok', `(${t.join(', ')}) has an entry larger than the target. What do we do with it?`, ['Ignore it: merging could never lower that entry again', 'Use it anyway', 'Replace the entry'], 0, 'Merging takes maxima, so a too-large entry would stay too large forever.');
        }
        for (let k = 0; k < 3; k++) tones[`${i},${k}`] = 'error';
        r.step('ok', `Too large: skip triplet #${i}.`, view(), {});
        continue;
      }
      if (!askedOk) {
        askedOk = true;
        r.step('ok', `Triplet #${i} is usable.`, view(), {});
      }
      for (let k = 0; k < 3; k++) {
        tones[`${i},${k}`] = 'done';
        if (t[k] === target[k]) {
          if (!askedHit) {
            askedHit = true;
            r.step('hit', `Entry ${k} equals the target entry (${target[k]}): this triplet can supply position ${k}.`, view(), {});
            r.predict('hit', `Triplet #${i} supplies ${target[k]} in position ${k}. What do we record?`, [`got[${k}] = True`, 'Nothing', 'Return True now'], 0, 'We need each of the three positions supplied exactly by some usable triplet; merging them all gives the target.');
          }
          got[k] = true;
          tones[`${i},${k}`] = 'found';
        }
      }
      r.step('mark', `After triplet #${i}: positions supplied = ${got.map((g, k) => (g ? k : '–')).join(' ')}.`, view(), {});
    }
    const res = got.every(Boolean);
    r.step('done', res ? 'All three positions can be supplied exactly: merging those usable triplets gives the target.' : 'Some position can never reach its target value.', view(), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ triplets, target }) {
    const got = [false, false, false];
    for (const t of triplets) if (t[0] <= target[0] && t[1] <= target[1] && t[2] <= target[2]) for (let k = 0; k < 3; k++) if (t[k] === target[k]) got[k] = true;
    return got.every(Boolean);
  },
});

export default problem({
  summary: 'You have several triplets of numbers. Merging two triplets produces a new triplet whose entries are the larger of the two in each position (for example (1, 5, 2) and (3, 4, 2) merge into (3, 5, 2)). You may merge any chosen triplets in any order. Can you obtain exactly the target triplet?',
  example: ['triplets [(1, 4, 1), (3, 1, 2)], target (3, 4, 2)', 'true', 'Merging gives (3, 4, 2): the maximum of each position.'],
  pattern: ['greedy', ['greedy', 'sorting', 'dp-1d', 'backtracking'], 'Merging only raises entries. Any triplet with an entry above the target is poison and must be skipped; from the rest, merging everything gives the largest possible values, so the target is reachable exactly when each position can be matched by some usable triplet.', {
    sorting: 'Order does not matter for maxima.',
    'dp-1d': 'There is no overlapping sub-problem to tabulate.',
    backtracking: 'Trying subsets works but is exponential; the maximum is monotone.',
  }],
  hints: [
    'What does merging do to an entry: can it ever go down?',
    'Which triplets can never be part of a merge that produces the target?',
    'Skip any triplet with an entry above the target. Among the rest, record which positions match the target exactly. All three must be matched.',
  ],
  insight: 'Maxima never decrease, so discard triplets that overshoot and check that each target entry is hit by a safe triplet.',
  brute: 'Try every subset of triplets: O(2ⁿ).',
  optimal: 'One pass: O(n) time, O(1) space.',
  walk: ['got = [False] * 3.', 'For each triplet: skip it if any entry exceeds the target.', 'For each position k where t[k] equals target[k], set got[k] = True.', 'Return all(got).'],
  edge: ['A triplet that matches one position but overshoots another.', 'The target already present in the list.', 'A position nobody can supply.', 'Single triplet.'],
  works: ['Merging all usable triplets gives, in each position, the maximum over usable triplets, which equals the target exactly when some usable triplet reaches it (none can exceed it).', 'Unusable triplets would push some position above the target.'],
  time: ['O(n)', 'One pass with three comparisons per triplet.'],
  space: ['O(1)', 'Three booleans.'],
  solution,
  cases,
  sig: 'def merge_triplets(triplets, target):\n    # triplets is a list of [a, b, c]; merging takes the maximum in each position; can you obtain target?\n    pass\n',
  viz,
  fromArgs: ([triplets, target]) => ({ triplets, target }),
});
