import type { Tone } from '@/engine/types';
import { dpTable2D } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './longest-common-subsequence.py?raw';
import cases from './longest-common-subsequence.cases.json';

const viz = vizOf<{ a: string; b: string }>({
  id: 'longest-common-subsequence',
  title: 'Longest Common Subsequence',
  solution,
  inputs: [
    { key: 'a', label: 'first string', kind: 'string', default: 'axbycz', maxItems: 7 },
    { key: 'b', label: 'second string', kind: 'string', default: 'abc', maxItems: 7 },
  ],
  presets: [
    { label: 'Interleaved', input: { a: 'axbycz', b: 'abc' } },
    { label: 'Nothing shared', input: { a: 'abc', b: 'xyz' } },
    { label: 'Order matters', input: { a: 'abc', b: 'cba' } },
    { label: 'Repeats', input: { a: 'aabba', b: 'ababa' } },
  ],
  validate: ({ a, b }) => (/^[a-z]+$/.test(a) && /^[a-z]+$/.test(b) ? null : 'Use lowercase letters'),
  run({ a, b }) {
    const r = new TraceRecorder(solution);
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0) as number[]);
    const done = new Set<string>();
    for (let i = 0; i <= a.length; i++) done.add(`${i},0`);
    for (let j = 0; j <= b.length; j++) done.add(`0,${j}`);
    const tones = () => Object.fromEntries([...done].map((k) => [k, 'done' as Tone]));
    const labels = { rowLabels: ['·', ...a], colLabels: ['·', ...b] };
    let askedMatch = false;
    let askedSkip = false;
    r.step('init', `dp[i][j] = length of the longest common subsequence of the first i letters of "${a}" and the first j letters of "${b}". The first row and column are 0: an empty prefix shares nothing.`, [dpTable2D(dp, { title: 'dp', ...labels, tones: tones() })], {});
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        r.op();
        const same = a[i - 1] === b[j - 1];
        r.step('rows', `Compare "${a[i - 1]}" (from the first string) with "${b[j - 1]}" (from the second).`, [dpTable2D(dp, { title: 'dp', ...labels, filling: [i, j], deps: same ? [[i - 1, j - 1]] : [[i - 1, j], [i, j - 1]], tones: tones() })], { i, j });
        if (same && !askedMatch) {
          askedMatch = true;
          r.predictChoice('match', `The letters match ("${a[i - 1]}"). The diagonal cell holds ${dp[i - 1][j - 1]}. What goes in dp[${i}][${j}]?`, String(dp[i - 1][j - 1] + 1), [String(dp[i - 1][j - 1]), String(Math.max(dp[i - 1][j], dp[i][j - 1])), String(dp[i - 1][j - 1] + 2)], i + j, 'The matching letter extends the best common subsequence of both shorter prefixes by 1.');
        } else if (!same && !askedSkip) {
          askedSkip = true;
          r.predictChoice('skip', `The letters differ. Above is ${dp[i - 1][j]}, left is ${dp[i][j - 1]}. What goes in dp[${i}][${j}]?`, String(Math.max(dp[i - 1][j], dp[i][j - 1])), [String(Math.max(dp[i - 1][j], dp[i][j - 1]) + 1), String(dp[i - 1][j] + dp[i][j - 1] + 2), String(dp[i - 1][j - 1] + 3)], i * j, 'At least one of the two letters is not used: drop one and keep the better result.');
        }
        dp[i][j] = same ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
        done.add(`${i},${j}`);
        r.step(same ? 'take' : 'skip', same ? `Match: dp[${i}][${j}] = dp[${i - 1}][${j - 1}] + 1 = ${dp[i][j]}.` : `No match: dp[${i}][${j}] = max(dp[${i - 1}][${j}], dp[${i}][${j - 1}]) = ${dp[i][j]}.`, [dpTable2D(dp, { title: 'dp', ...labels, tones: tones() })], { value: dp[i][j] });
      }
    }
    const res = dp[a.length][b.length];
    r.step('done', `The longest common subsequence has length ${res}.`, [dpTable2D(dp, { title: 'dp', ...labels, tones: { ...tones(), [`${a.length},${b.length}`]: 'found' } })], { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ a, b }) {
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0) as number[]);
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    return dp[a.length][b.length];
  },
});

export default problem({
  summary: 'A subsequence keeps letters in their original order but may skip letters. Given two strings, return the length of their longest common subsequence (0 if they share none).',
  example: ['"abcde" and "bxdze"', '3', 'b, d, e appear in both strings in the same order.'],
  pattern: ['dp-2d', ['dp-2d', 'two-pointers', 'dfs', 'dp-1d'], 'Compare the strings one letter at a time. A table dp[i][j] over prefixes: if the last letters match they extend the best of the shorter prefixes; if not, drop one of them and keep the better result.', {
    'two-pointers': 'Two pointers cannot decide which letters to skip.',
    dfs: 'Recursion over (i, j) without memory is exponential; the table is its memoised form.',
    'dp-1d': 'The recurrence needs two indices, so one line is not enough (a rolling row can compress it later).',
  }],
  hints: [
    'Look at the last letters of the two prefixes. What if they are equal?',
    'What if they are different? Which letters can still be useful?',
    'dp[i][j] = dp[i−1][j−1] + 1 if the letters match, else max(dp[i−1][j], dp[i][j−1]). Row 0 and column 0 are 0.',
  ],
  insight: 'Matching last letters extend the diagonal; different last letters mean one of them can be dropped.',
  brute: 'Test every subsequence of one string against the other: O(2ⁿ · m).',
  optimal: 'DP table: O(n · m) time and space.',
  walk: ['dp is (len(a) + 1) × (len(b) + 1) of zeros.', 'For i, j from 1: if a[i−1] == b[j−1], dp[i][j] = dp[i−1][j−1] + 1.', 'Otherwise dp[i][j] = max(dp[i−1][j], dp[i][j−1]).', 'Return dp[len(a)][len(b)].'],
  edge: ['An empty string.', 'Identical strings.', 'No common letters.', 'Reversed strings.'],
  works: ['An optimal common subsequence either uses the last letters together (they must match) or leaves one of them out.', 'Those cases are exactly the three neighbours used.'],
  time: ['O(n · m)', 'One cell per pair of prefixes.'],
  space: ['O(n · m)', 'The table.'],
  solution,
  cases,
  sig: 'def longest_common_subsequence(a, b):\n    # length of the longest common subsequence of a and b\n    pass\n',
  viz,
  fromArgs: ([a, b]) => ({ a, b }),
});
