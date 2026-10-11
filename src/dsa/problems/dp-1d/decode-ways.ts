import type { Tone } from '@/engine/types';
import { dpTable1D, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './decode-ways.py?raw';
import cases from './decode-ways.cases.json';

const viz = vizOf<{ s: string }>({
  id: 'decode-ways',
  title: 'Decode Ways',
  solution,
  inputs: [{ key: 's', label: 'digits (1→a, 2→b … 26→z)', kind: 'string', default: '1215', maxItems: 10 }],
  presets: [
    { label: 'Two readings', input: { s: '1215' } },
    { label: 'Zeros in the middle', input: { s: '1020' } },
    { label: 'Too large pair', input: { s: '2799' } },
    { label: 'Starts with zero', input: { s: '012' } },
  ],
  validate: ({ s }) => (/^[0-9]+$/.test(s) ? null : 'Use only digits, e.g. 1215'),
  run({ s }) {
    const r = new TraceRecorder(solution);
    const n = s.length;
    const dp = Array(n + 1).fill(0) as number[];
    const done = (upTo: number): Record<number, Tone> => Object.fromEntries(Array.from({ length: upTo + 1 }, (_, i) => [i, 'done' as Tone]));
    let askedBase = false;
    let askedZero = false;
    let askedTwo = false;
    const letters = (i: number, len: number) => (len === 1 ? String.fromCharCode(96 + Number(s[i - 1])) : String.fromCharCode(96 + Number(s.slice(i - 2, i))));
    r.step('init', `dp[i] = number of ways to decode the first i digits of "${s}". dp has ${n + 1} entries (i = 0 means the empty prefix).`, [stringView(s, { title: 'digits' }), dpTable1D(dp, { title: 'dp' })], {});
    dp[0] = 1;
    r.step('base', 'dp[0] = 1: there is exactly one way to decode nothing (use no letters).', [stringView(s, { title: 'digits' }), dpTable1D(dp, { title: 'dp', tones: { 0: 'done' } })], {});
    if (!askedBase) {
      askedBase = true;
      r.predict('base', 'Why is dp[0] = 1 and not 0?', ['The empty prefix has one decoding (the empty one), so the first letter can build on it', 'There are no digits', 'To avoid division by zero'], 0, 'Each longer prefix is built by adding a letter to a shorter prefix; the empty prefix is the starting point for that.');
    }
    for (let i = 1; i <= n; i++) {
      r.op();
      const one = s[i - 1] !== '0';
      const two = i >= 2 && Number(s.slice(i - 2, i)) >= 10 && Number(s.slice(i - 2, i)) <= 26;
      r.step('loop', `Digits up to position ${i}: last digit "${s[i - 1]}"${i >= 2 ? `, last two digits "${s.slice(i - 2, i)}"` : ''}.`, [stringView(s, { title: 'digits', window: { from: Math.max(0, i - 2), to: i - 1, label: 'last two', tone: 'active' } }), dpTable1D(dp, { title: 'dp', filling: i, deps: i >= 2 ? [i - 1, i - 2] : [i - 1], tones: done(i - 1) })], { i });
      if (!askedZero && s[i - 1] === '0') {
        askedZero = true;
        r.predict('zero', `The last digit is "0". Can it be decoded alone?`, ['No: there is no letter for 0, so it must join the digit before it', 'Yes as "a"', 'Yes as a space'], 0, 'Letters start at 1. A zero is valid only as the second digit of 10 or 20.');
      }
      if (one) {
        dp[i] += dp[i - 1];
        r.step('addOne', `"${s[i - 1]}" is a valid letter (${letters(i, 1)}): add dp[${i - 1}] = ${dp[i - 1]} → dp[${i}] = ${dp[i]}.`, [stringView(s, { title: 'digits' }), dpTable1D(dp, { title: 'dp', filling: i, deps: [i - 1], tones: done(i - 1) })], {});
      }
      if (!askedTwo && two) {
        askedTwo = true;
        r.predictChoice('two', `"${s.slice(i - 2, i)}" is between 10 and 26. How much does it add to dp[${i}]?`, String(dp[i - 2]), [String(dp[i - 1]), String(dp[i - 2] + dp[i - 1]), '1'], i, `The pair becomes one letter (${letters(i, 2)}), so we add the ways to decode everything before the pair: dp[${i - 2}].`);
      }
      if (two) {
        dp[i] += dp[i - 2];
        r.step('addTwo', `"${s.slice(i - 2, i)}" is a valid letter (${letters(i, 2)}): add dp[${i - 2}] = ${dp[i - 2]} → dp[${i}] = ${dp[i]}.`, [stringView(s, { title: 'digits' }), dpTable1D(dp, { title: 'dp', filling: i, deps: [i - 2], tones: done(i - 1) })], {});
      }
      if (!one && !two) r.step('loop', `Neither reading works, so dp[${i}] = 0 and every longer prefix will also be 0.`, [stringView(s, { title: 'digits' }), dpTable1D(dp, { title: 'dp', tones: done(i) })], {});
    }
    r.step('done', `${dp[n]} way${dp[n] === 1 ? '' : 's'} to decode "${s}".`, [stringView(s, { title: 'digits' }), dpTable1D(dp, { title: 'dp', tones: { ...done(n), [n]: 'found' } })], { result: dp[n] });
    return { frames: r.frames, result: dp[n] };
  },
  reference({ s }) {
    const go = (i: number): number => {
      if (i === s.length) return 1;
      if (s[i] === '0') return 0;
      return go(i + 1) + (i + 1 < s.length && Number(s.slice(i, i + 2)) <= 26 ? go(i + 2) : 0);
    };
    return go(0);
  },
});

export default problem({
  summary: 'A message of digits is decoded to letters with 1 → a, 2 → b, …, 26 → z. The same digit string can often be split in different ways. Count the number of ways to decode the whole string (0 if it cannot be decoded). Leading zeros never form a letter.',
  example: ['"126"', '3', '1-2-6 (a b f), 12-6 (l f) and 1-26 (a z) are the three decodings.'],
  pattern: ['dp-1d', ['dp-1d', 'backtracking', 'dfs', 'greedy'], 'The number of ways to decode a prefix depends on the last one digit and the last two digits: dp[i] adds dp[i − 1] if the last digit is a letter, and dp[i − 2] if the last two digits form 10 to 26.', {
    backtracking: 'Enumerating every decoding is exponential and unnecessary when only the count matters.',
    dfs: 'Recursion with memory is the same DP written top-down.',
    greedy: 'Greedy reading cannot count alternative splits.',
  }],
  hints: [
    'Look at the last character of a prefix. What can it be decoded as?',
    'When is the last digit a valid letter by itself? When do the last two digits form a valid letter?',
    'dp[0] = 1. dp[i] += dp[i − 1] if s[i − 1] != "0"; dp[i] += dp[i − 2] if 10 ≤ int(s[i−2:i]) ≤ 26.',
  ],
  insight: 'dp[i] = (ways with the last digit alone) + (ways with the last two digits together).',
  brute: 'Recursively try both splits: O(2ⁿ).',
  optimal: 'DP: O(n) time, O(n) space (O(1) with two variables).',
  walk: ['dp[0] = 1.', 'For each i from 1 to n: if s[i−1] != "0", add dp[i−1].', 'If i ≥ 2 and the last two digits are between 10 and 26, add dp[i−2].', 'Return dp[n].'],
  edge: ['A leading zero (0 ways).', 'A zero that follows 1 or 2 (10, 20) is fine; after any other digit it is fatal.', 'Pairs larger than 26.', 'A single digit.'],
  works: ['Every decoding ends with a one-digit letter or a two-digit letter; these cases are disjoint and cover everything.', 'The counts for the shorter prefixes are already known.'],
  time: ['O(n)', 'One pass.'],
  space: ['O(n)', 'The table.'],
  solution,
  cases,
  sig: 'def num_decodings(s):\n    # s is a string of digits; return the number of ways to decode it (1→a … 26→z)\n    pass\n',
  viz,
  fromArgs: ([s]) => ({ s }),
});
