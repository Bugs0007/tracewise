import type { Tone } from '@/engine/types';
import { dpTable2D } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './regular-expression-matching.py?raw';
import cases from './regular-expression-matching.cases.json';

const viz = vizOf<{ s: string; p: string }>({
  id: 'regular-expression-matching',
  title: 'Regular Expression Matching',
  solution,
  inputs: [
    { key: 's', label: 's (text, lowercase)', kind: 'string', default: 'aaab', maxItems: 6 },
    { key: 'p', label: 'p (pattern: letters, . for any letter, x* for zero or more x)', kind: 'string', default: 'a*b', maxItems: 8 },
  ],
  presets: [
    { label: 'Star repeats', input: { s: 'aaab', p: 'a*b' } },
    { label: 'Star as zero', input: { s: 'b', p: 'a*b' } },
    { label: 'Dot star', input: { s: 'abcd', p: '.*' } },
    { label: 'Too short', input: { s: 'a', p: 'ab*c' } },
  ],
  validate: ({ s, p }) => (!/^[a-z]+$/.test(s) ? 'The text must be lowercase letters (not empty)' : !/^([a-z.]\*?)+$/.test(p) ? 'The pattern uses letters, "." and "x*" (a star must follow a letter or a dot)' : null),
  run({ s, p }) {
    const r = new TraceRecorder(solution);
    const m = s.length;
    const n = p.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(false) as boolean[]);
    const t = () => dp.map((row) => row.map((v) => (v ? 'T' : 'F')));
    const done = new Set<string>();
    const tones = (): Record<string, Tone> => Object.fromEntries([...done].map((k) => [k, (dp[Number(k.split(',')[0])][Number(k.split(',')[1])] ? 'found' : 'done') as Tone]));
    const labels = { rowLabels: ['·', ...s], colLabels: ['·', ...p] };
    let askedStar = false;
    let askedSingle = false;
    let askedBase = false;
    r.step('init', `dp[i][j] = True if the first i letters of "${s}" match the first j symbols of the pattern "${p}".`, [dpTable2D(t(), { title: 'dp (T/F)', ...labels })], {});
    dp[0][0] = true;
    done.add('0,0');
    r.step('base', 'dp[0][0] = True: an empty text matches an empty pattern.', [dpTable2D(t(), { title: 'dp (T/F)', ...labels, tones: tones() })], {});
    if (!askedBase) {
      askedBase = true;
      r.predict('base', 'The first row asks: can the pattern match an EMPTY text? When is p[0:j] able to?', ['Only if it ends with x* parts that can all match zero letters', 'Never', 'Always'], 0, 'Every starred symbol may match zero letters, so a pattern like "a*b*" can match the empty string.');
    }
    for (let j = 2; j <= n; j++) {
      if (p[j - 1] === '*') {
        dp[0][j] = dp[0][j - 2];
        done.add(`0,${j}`);
        r.step('star0', `Pattern symbol ${j}: "${p[j - 2]}*" can match zero letters, so dp[0][${j}] = dp[0][${j - 2}] = ${dp[0][j] ? 'T' : 'F'}.`, [dpTable2D(t(), { title: 'dp (T/F)', ...labels, filling: [0, j], deps: [[0, j - 2]], tones: tones() })], {});
      }
    }
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        r.op();
        const star = p[j - 1] === '*';
        const deps: [number, number][] = star ? [[i, j - 2], [i - 1, j]] : [[i - 1, j - 1]];
        r.step('rows', star ? `Cell (${i}, ${j}): pattern symbol "${p[j - 2]}*" against text "${s[i - 1]}".` : `Cell (${i}, ${j}): pattern symbol "${p[j - 1]}" against text "${s[i - 1]}".`, [dpTable2D(t(), { title: 'dp (T/F)', ...labels, filling: [i, j], deps, tones: tones() })], {});
        if (star) {
          const zero = dp[i][j - 2];
          const prev = p[j - 2] === s[i - 1] || p[j - 2] === '.';
          const more = prev && dp[i - 1][j];
          if (!askedStar) {
            askedStar = true;
            r.predict('star', `"${p[j - 2]}*" against "${s[i - 1]}": it can match ZERO letters (look at dp[${i}][${j - 2}] = ${zero ? 'T' : 'F'}) or ONE MORE letter (needs "${p[j - 2]}" to match "${s[i - 1]}" and dp[${i - 1}][${j}] to be True). Is dp[${i}][${j}] True?`, [zero || more ? 'True' : 'False', zero || more ? 'False' : 'True'], 0, 'A star either matches zero letters or absorbs one more letter of the text; either is enough.');
          }
          dp[i][j] = zero || more;
        } else if (p[j - 1] === s[i - 1] || p[j - 1] === '.') {
          if (!askedSingle) {
            askedSingle = true;
            r.predict('diag', `"${p[j - 1]}" matches "${s[i - 1]}". Where does dp[${i}][${j}] come from?`, [`The diagonal cell dp[${i - 1}][${j - 1}] = ${dp[i - 1][j - 1] ? 'T' : 'F'}`, 'The cell above', 'Always True'], 0, 'A single symbol consumes exactly one letter of each, so the rest must match: look at the diagonal.');
          }
          dp[i][j] = dp[i - 1][j - 1];
        }
        done.add(`${i},${j}`);
        r.step(star ? 'more' : 'diag', `dp[${i}][${j}] = ${dp[i][j] ? 'True' : 'False'}.`, [dpTable2D(t(), { title: 'dp (T/F)', ...labels, tones: tones() })], {});
      }
    }
    const res = dp[m][n];
    r.step('done', res ? `dp[${m}][${n}] is True: the whole text matches the whole pattern.` : `dp[${m}][${n}] is False: no match.`, [dpTable2D(t(), { title: 'dp (T/F)', ...labels, tones: { ...tones(), [`${m},${n}`]: res ? 'found' : 'compare' } })], { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ s, p }) {
    return new RegExp(`^(?:${p})$`).test(s);
  },
});

export default problem({
  summary: 'Implement pattern matching with two special symbols: "." matches any single letter, and "x*" (a letter or "." followed by a star) matches zero or more copies of x. The pattern must match the entire text, not just part of it.',
  example: ['text "aab", pattern "a*b"', 'true', '"a*" absorbs both a letters, then "b" matches the b.'],
  pattern: ['dp-2d', ['dp-2d', 'backtracking', 'dfs', 'two-pointers'], 'Whether a prefix of the text matches a prefix of the pattern depends on smaller prefix pairs. A star either matches zero letters (drop the star group) or one more letter (consume a text letter and stay on the star).', {
    backtracking: 'Recursive matching with branching at every star is exponential without a memo.',
    dfs: 'Memoised recursion over (i, j) is this table top-down.',
    'two-pointers': 'A single left-to-right pass cannot decide how many letters each star should take.',
  }],
  hints: [
    'What does a non-star symbol do to the problem?',
    'A star can match zero letters or more. How do those two cases reduce to smaller prefixes?',
    'dp[i][j]: if p[j−1] is "*", dp[i][j] = dp[i][j−2] or (the previous symbol matches s[i−1] and dp[i−1][j]); else if p[j−1] matches s[i−1], dp[i][j] = dp[i−1][j−1].',
  ],
  insight: 'A star offers two options: match nothing (jump two symbols back in the pattern) or match one more letter (jump one letter back in the text).',
  brute: 'Backtracking over every way each star can match: exponential.',
  optimal: 'DP table: O(n · m) time and space.',
  walk: ['dp[0][0] = True.', 'First row: dp[0][j] = dp[0][j−2] when p[j−1] is "*".', 'For every cell: star → zero copies or one more copy; otherwise a matching symbol takes the diagonal.', 'Return dp[len(s)][len(p)].'],
  edge: ['Empty text with a pattern like "a*b*".', 'Empty pattern.', 'Dot-star matching everything.', 'A star right after a dot.'],
  works: ['Every match of the pattern prefix against the text prefix ends in one of the cases handled, each reducing to a smaller pair that is already filled.'],
  time: ['O(n · m)', 'One cell per pair of prefixes.'],
  space: ['O(n · m)', 'The table.'],
  solution,
  cases,
  sig: 'def is_match(s, p):\n    # True if the whole text s matches the pattern p ("." any letter, "x*" zero or more x)\n    pass\n',
  viz,
  fromArgs: ([s, p]) => ({ s, p }),
});
