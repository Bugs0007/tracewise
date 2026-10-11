import type { Tone } from '@/engine/types';
import { hashMapView, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './permutation-in-string.py?raw';
import cases from './permutation-in-string.cases.json';

const same = (a: Map<string, number>, b: Map<string, number>): boolean => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

const viz = vizOf<{ s1: string; s2: string }>({
  id: 'permutation-in-string',
  title: 'Permutation in String',
  solution,
  inputs: [
    { key: 's1', label: 's1 (the letters to find)', kind: 'string', default: 'abb', maxItems: 6 },
    { key: 's2', label: 's2 (the text)', kind: 'string', default: 'cbabadbba', maxItems: 20 },
  ],
  presets: [
    { label: 'Found', input: { s1: 'abb', s2: 'cbabadbba' } },
    { label: 'Not present', input: { s1: 'abc', s2: 'aabbcc' } },
    { label: 'Same length', input: { s1: 'rain', s2: 'nair' } },
  ],
  validate: ({ s1 }) => (s1.length < 1 ? 'Enter at least one letter in s1' : null),
  run({ s1, s2 }) {
    const r = new TraceRecorder(solution);
    const n = s1.length;
    const c2 = [...s2];
    const need = new Map<string, number>();
    const window = new Map<string, number>();
    const view = (right: number, hot: Tone | null = null) => {
      const from = Math.max(0, right - n + 1);
      const tones: Record<number, Tone> = {};
      if (hot) for (let q = from; q <= right && q < c2.length; q++) tones[q] = hot;
      return [
        stringView(s2, { title: `s2 with a window of ${n} letters`, tones, pointers: right >= 0 && right < c2.length ? { right } : undefined, window: right >= 0 && right < c2.length ? { from, to: right, label: 'window', tone: 'active' } : undefined }),
        hashMapView(need, { title: `need (counts in s1 = "${s1}")` }),
        hashMapView(window, { title: 'window counts' }),
      ];
    };
    r.step('init', `A permutation of "${s1}" is any substring of length ${n} with the same letter counts.`, view(-1), { n });
    for (const c of s1) need.set(c, (need.get(c) ?? 0) + 1);
    r.step('need', `need records how many of each letter s1 has.`, view(-1), { need: JSON.stringify(Object.fromEntries(need)) });
    r.step('window', 'window will count the letters inside the current stretch of s2.', view(-1), {});
    for (let right = 0; right < c2.length; right++) {
      r.op();
      window.set(c2[right], (window.get(c2[right]) ?? 0) + 1);
      r.step('enter', `Add s2[${right}] = ${c2[right]} to the window.`, view(right, 'active'), { right });
      if (right >= n) {
        const out = c2[right - n];
        r.step('tooBig', `The window now has ${n + 1} letters, one too many. The oldest, s2[${right - n}] = ${out}, must leave.`, view(right, 'compare'), { right });
        r.predictChoice('leave', 'Which letter leaves the window?', out, [c2[right], c2[Math.max(0, right - 1)] === out ? 'z' : c2[Math.max(0, right - 1)], 'none'], right, 'The window is a fixed length, so the letter that falls off is the one n positions back.');
        window.set(out, window.get(out)! - 1);
        r.step('leave', `Remove ${out} from the counts.`, view(right, 'active'), { out });
        if (window.get(out) === 0) {
          window.delete(out);
          r.step('del', `${out} now has count 0, so delete its entry (a zero would make the maps look different).`, view(right, 'active'), {});
        }
      }
      const ok = same(window, need);
      r.predict(ok ? 'match' : 'miss', 'Do the window counts equal need?', ['Yes: this window is a permutation', 'No: keep sliding'], ok ? 0 : 1, ok ? 'Same letters, same counts: a permutation of s1.' : 'The counts differ, so this window is not a permutation.');
      r.step('match', ok ? 'The counts are identical: found a permutation.' : 'The counts differ.', view(right, ok ? 'found' : 'default'), { match: ok });
      if (ok) {
        r.step('yes', 'A permutation of s1 exists inside s2: return True.', view(right, 'found'), { result: true });
        return { frames: r.frames, result: true };
      }
    }
    r.step('no', 'No window matched: return False.', view(c2.length - 1), { result: false });
    return { frames: r.frames, result: false };
  },
  reference({ s1, s2 }) {
    const n = s1.length;
    const key = (x: string) => [...x].sort().join('');
    for (let i = 0; i + n <= s2.length; i++) if (key(s2.slice(i, i + n)) === key(s1)) return true;
    return false;
  },
});

export default problem({
  summary: 'Given two strings, decide whether the second contains a substring that is some rearrangement of all the letters of the first (same letters, same counts, any order).',
  example: ['s1 = "cab", s2 = "xxbcayy"', 'true', '"bca" inside s2 is a rearrangement of "cab". If s2 were "xxbcxyy" there would be none.'],
  pattern: ['sliding-window', ['sliding-window', 'frequency-count', 'two-pointers', 'hash-lookup'], 'A permutation has exactly len(s1) letters, so look at every window of that fixed length and compare its letter counts with s1.', {
    'frequency-count': 'Counting letters is how you compare, but the pattern is sliding a fixed-size window and updating the counts incrementally.',
    'two-pointers': 'The window ends are two pointers moving in lock-step, which is the window pattern.',
    'hash-lookup': 'The count map is the tool; the window is the pattern.',
  }],
  hints: [
    'What property must a window of s2 have to be a rearrangement of s1? Think about its length and its letter counts.',
    'Do not rebuild counts for every window: when the window moves one step, one letter enters and one leaves.',
    'Keep a count map for s1 and one for the window, delete zero-count entries, and compare the two maps after each move.',
  ],
  insight: 'A fixed-length window slides along s2; add the new letter, drop the old one, and compare counts with s1.',
  brute: 'Sort every window and compare with sorted s1: O(m · n log n).',
  optimal: 'Sliding window with incremental counts: O(m) windows, each comparison bounded by the alphabet size.',
  walk: ['Count the letters of s1 into need.', 'Slide over s2. Add each new letter to window.', 'Once the window is longer than n, remove the letter that is n positions back (and delete its entry at zero).', 'After each step, if window equals need, a permutation exists: return True. If the loop ends, return False.'],
  edge: ['s1 longer than s2: always False.', 's1 and s2 the same length.', 'Repeated letters in s1 (counts matter, not just letters).', 'A match at the very end of s2.'],
  works: ['A substring is a rearrangement of s1 exactly when it has length n and identical letter counts.', 'Updating the counts as the window moves keeps window correct for every position without recounting.'],
  time: ['O(m)', 'm = len(s2). Each step does constant map work and a comparison over at most 26 letters.'],
  space: ['O(1)', 'Two count maps over a fixed alphabet.'],
  solution,
  cases,
  sig: 'def check_inclusion(s1, s2):\n    # True if some substring of s2 is a rearrangement of s1\n    pass\n',
  viz,
  fromArgs: ([s1, s2]) => ({ s1, s2 }),
});
