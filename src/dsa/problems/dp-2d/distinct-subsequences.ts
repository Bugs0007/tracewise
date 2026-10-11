import type { Tone } from '@/engine/types';
import { dpTable2D } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './distinct-subsequences.py?raw';
import cases from './distinct-subsequences.cases.json';

const viz = vizOf<{ s: string; t: string }>({
  id: 'distinct-subsequences',
  title: 'Distinct Subsequences',
  solution,
  inputs: [
    { key: 's', label: 's (the long string)', kind: 'string', default: 'abbc', maxItems: 8 },
    { key: 't', label: 't (the target)', kind: 'string', default: 'abc', maxItems: 5 },
  ],
  presets: [
    { label: 'Choose which b', input: { s: 'abbc', t: 'abc' } },
    { label: 'Repeated target', input: { s: 'aaaa', t: 'aa' } },
    { label: 'No match', input: { s: 'abc', t: 'd' } },
    { label: 'Target longer', input: { s: 'ab', t: 'abc' } },
  ],
  validate: ({ s, t }) => (/^[a-z]+$/.test(s) && /^[a-z]+$/.test(t) ? null : 'Use lowercase letters (not empty)'),
  run({ s, t }) {
    const r = new TraceRecorder(solution);
    const dp = Array.from({ length: s.length + 1 }, () => Array(t.length + 1).fill(0) as number[]);
    const done = new Set<string>();
    const tones = (): Record<string, Tone> => Object.fromEntries([...done].map((k) => [k, 'done' as Tone]));
    const labels = { rowLabels: ['·', ...s], colLabels: ['·', ...t] };
    let askedBase = false;
    let askedMatch = false;
    let askedSkip = false;
    r.step('init', `dp[i][j] = number of ways to pick letters from the first i letters of "${s}" (in order) to spell the first j letters of "${t}".`, [dpTable2D(dp, { title: 'dp', ...labels })], {});
    for (let i = 0; i <= s.length; i++) {
      dp[i][0] = 1;
      done.add(`${i},0`);
    }
    r.step('base', 'Column 0 is all 1: the empty target can be spelled in exactly one way (pick nothing), whatever the prefix of s.', [dpTable2D(dp, { title: 'dp', ...labels, tones: tones() })], {});
    if (!askedBase) {
      askedBase = true;
      r.predict('base', 'Why is dp[i][0] = 1 for every i?', ['Choosing no letters spells the empty string in exactly one way', 'The strings are equal', 'It is a boundary trick without meaning'], 0, 'There is exactly one empty subsequence, no matter how long s is.');
    }
    for (let i = 1; i <= s.length; i++) {
      for (let j = 1; j <= t.length; j++) {
        r.op();
        const same = s[i - 1] === t[j - 1];
        r.step('rows', `Cell (${i}, ${j}): can the letter s[${i - 1}] = "${s[i - 1]}" be used for t[${j - 1}] = "${t[j - 1]}"?${same ? ' Yes, they match.' : ' No, they differ.'}`, [dpTable2D(dp, { title: 'dp', ...labels, filling: [i, j], deps: same ? [[i - 1, j], [i - 1, j - 1]] : [[i - 1, j]], tones: tones() })], {});
        if (same && !askedMatch) {
          askedMatch = true;
          r.predictChoice('match', `The letters match. Skipping s[${i - 1}] gives ${dp[i - 1][j]}; using it gives ${dp[i - 1][j - 1]}. What is dp[${i}][${j}]?`, String(dp[i - 1][j] + dp[i - 1][j - 1]), [String(Math.max(dp[i - 1][j], dp[i - 1][j - 1])), String(dp[i - 1][j]), String(dp[i - 1][j] + dp[i - 1][j - 1] + 1)], i + j, 'Both choices spell the target, so their counts add: skip the letter, or use it.');
        } else if (!same && !askedSkip) {
          askedSkip = true;
          r.predictChoice('skip', `The letters differ, so s[${i - 1}] cannot be used. What is dp[${i}][${j}]?`, String(dp[i - 1][j]), [String(dp[i - 1][j] + 1), String(dp[i][j - 1]), '0'], i * j, 'Only skipping is possible: copy the answer from the row above.');
        }
        dp[i][j] = dp[i - 1][j];
        if (same) dp[i][j] += dp[i - 1][j - 1];
        done.add(`${i},${j}`);
        r.step(same ? 'take' : 'skip', same ? `dp[${i}][${j}] = dp[${i - 1}][${j}] + dp[${i - 1}][${j - 1}] = ${dp[i][j]}.` : `dp[${i}][${j}] = dp[${i - 1}][${j}] = ${dp[i][j]}.`, [dpTable2D(dp, { title: 'dp', ...labels, tones: tones() })], { value: dp[i][j] });
      }
    }
    const res = dp[s.length][t.length];
    r.step('done', `"${t}" appears as a subsequence of "${s}" in ${res} way${res === 1 ? '' : 's'}.`, [dpTable2D(dp, { title: 'dp', ...labels, tones: { ...tones(), [`${s.length},${t.length}`]: 'found' } })], { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ s, t }) {
    const go = (i: number, j: number): number => (j === t.length ? 1 : i === s.length ? 0 : go(i + 1, j) + (s[i] === t[j] ? go(i + 1, j + 1) : 0));
    return go(0, 0);
  },
});

export default problem({
  summary: 'Count the number of different ways to pick letters from a string s (keeping their order) so that they spell the string t. Choices at different positions count as different ways even if they spell the same thing.',
  example: ['s = "abab", t = "ab"', '3', 'Positions (0, 1), (0, 3) and (2, 3).'],
  pattern: ['dp-2d', ['dp-2d', 'backtracking', 'dfs', 'two-pointers'], 'Looking at the last letters of the two prefixes: you can always skip the last letter of s, and if it equals the last letter of t you may also use it. Two indices give a table.', {
    backtracking: 'Enumerating subsequences is exponential and unnecessary when only the count matters.',
    dfs: 'Recursion over (i, j) is exponential without memory.',
    'two-pointers': 'A pointer pass cannot count alternative matchings.',
  }],
  hints: [
    'Look at the last letter of s. When can it be part of the match?',
    'If it is not used, how many ways remain? If it is used, which prefixes remain?',
    'dp[i][j] = dp[i−1][j] (skip the letter) plus dp[i−1][j−1] when s[i−1] == t[j−1]. dp[i][0] = 1.',
  ],
  insight: 'Each letter of s is either skipped or (if it matches) used for the last letter of t.',
  brute: 'Recursion over positions: O(2^n).',
  optimal: 'DP table: O(n · m) time and space.',
  walk: ['dp[i][0] = 1 for all i.', 'For i, j ≥ 1: dp[i][j] = dp[i−1][j].', 'If s[i−1] == t[j−1] also add dp[i−1][j−1].', 'Return dp[len(s)][len(t)].'],
  edge: ['t longer than s (0).', 'Empty t (1).', 'Many repeated letters (large counts).', 'No common letter.'],
  works: ['The ways split into those not using s[i−1] and those using it for t[j−1]; the two sets are disjoint and each reduces to a smaller prefix problem.'],
  time: ['O(n · m)', 'One cell per pair.'],
  space: ['O(n · m)', 'The table (O(m) with a rolling row).'],
  solution,
  cases,
  sig: 'def num_distinct(s, t):\n    # number of ways to pick letters of s, in order, that spell t\n    pass\n',
  viz,
  fromArgs: ([s, t]) => ({ s, t }),
});
