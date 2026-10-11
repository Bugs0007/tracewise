import { hashMapView, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './longest-palindromic-substring.py?raw';
import cases from './longest-palindromic-substring.cases.json';

const viz = vizOf<{ s: string }>({
  id: 'longest-palindromic-substring',
  title: 'Longest Palindromic Substring',
  solution,
  inputs: [{ key: 's', label: 's (lowercase)', kind: 'string', default: 'xabacd', maxItems: 12 }],
  presets: [
    { label: 'Odd palindrome', input: { s: 'xabacd' } },
    { label: 'Even palindrome', input: { s: 'wxyyzq' } },
    { label: 'Two candidates', input: { s: 'abbaxyzzyx' } },
    { label: 'All the same', input: { s: 'aaaa' } },
  ],
  validate: ({ s }) => (/^[a-z]+$/.test(s) ? null : 'Use 1 to 12 lowercase letters'),
  run({ s }) {
    const r = new TraceRecorder(solution);
    let bestStart = 0;
    let bestLen = 0;
    let win: { from: number; to: number } | null = null;
    let askedExpand = false;
    let askedEven = false;
    let askedKeep = false;
    const view = () => [
      stringView(s, { title: 'string (bracket = palindrome being grown)', window: win ? { from: win.from, to: win.to, label: 'palindrome', tone: 'active' } : undefined }),
      hashMapView({ best: s.slice(bestStart, bestStart + bestLen) || '—', 'its length': bestLen }),
    ];
    r.step('init', 'Every palindrome has a center (a letter, or the gap between two letters). From each center we expand outward while the letters match.', view(), {});
    const expand = (left: number, right: number, kind: string): [number, number] => {
      r.op();
      win = left >= 0 && right < s.length && left <= right ? { from: left, to: right } : null;
      r.step('def', `Expand from the ${kind} center at positions ${left}${left === right ? '' : ' and ' + right}.`, view(), { left, right });
      while (left >= 0 && right < s.length && s[left] === s[right]) {
        win = { from: left, to: right };
        if (!askedExpand) {
          askedExpand = true;
          r.step('loop', `s[${left}] = "${s[left]}" equals s[${right}] = "${s[right]}": the palindrome "${s.slice(left, right + 1)}" can grow.`, view(), {});
          r.predict('expand', `s[${left}] and s[${right}] match. What happens next?`, ['Move both ends outward by one and test again', 'Stop: we found the answer', 'Restart from the next center'], 0, 'A palindrome stays a palindrome when both ends move out and the new letters match.');
        } else {
          r.step('loop', `"${s[left]}" = "${s[right]}": grow to "${s.slice(left, right + 1)}".`, view(), {});
        }
        left--;
        right++;
      }
      win = left + 1 <= right - 1 ? { from: left + 1, to: right - 1 } : null;
      r.step('ret', right - left - 1 > 0 ? `The expansion stops: the longest palindrome here is "${s.slice(left + 1, right)}" (length ${right - left - 1}).` : 'No palindrome grows from this center.', view(), {});
      return [left + 1, right - left - 1];
    };
    for (let i = 0; i < s.length; i++) {
      for (const [l, rr, kind] of [[i, i, 'odd'], [i, i + 1, 'even']] as [number, number, string][]) {
        if (kind === 'even' && !askedEven && i + 1 < s.length && s[i] === s[i + 1]) {
          askedEven = true;
          r.step('try', `Next: the even center between positions ${i} and ${i + 1}.`, view(), {});
          r.predict('even', `s[${i}] = s[${i + 1}] = "${s[i]}". Why do we also try the center BETWEEN two letters?`, ['Even-length palindromes like "abba" have no middle letter', 'To double the work', 'It is a typo'], 0, 'A palindrome of even length is centred between two equal letters, which the single-letter centers never reach.');
        }
        const [start, length] = expand(l, rr, kind);
        if (length > bestLen) {
          if (!askedKeep) {
            askedKeep = true;
            r.step('better', `${length} > ${bestLen}: a new best.`, view(), {});
            r.predictChoice('keep', `The new palindrome has length ${length}; the best is ${bestLen}. What is the best length afterwards?`, String(length), [String(bestLen), String(length + bestLen), String(length + 1)], i, 'The longer one replaces the best (ties keep the earlier one).');
          }
          bestStart = start;
          bestLen = length;
          r.step('keep', `New best: "${s.slice(start, start + length)}".`, view(), { best: s.slice(start, start + length) });
        }
      }
    }
    win = bestLen ? { from: bestStart, to: bestStart + bestLen - 1 } : null;
    const res = s.slice(bestStart, bestStart + bestLen);
    r.step('done', `The longest palindromic substring is "${res}".`, view(), { result: res });
    return { frames: r.frames, result: res };
  },
  reference({ s }) {
    let best = '';
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j <= s.length; j++) {
      const t = s.slice(i, j);
      if (t === [...t].reverse().join('') && t.length > best.length) best = t;
    }
    return best;
  },
});

export default problem({
  summary: 'Given a string, return its longest substring that reads the same forwards and backwards. If several are equally long, return the one that starts first.',
  example: ['"xabay"', '"aba"', 'Both "aba" and the single letters are palindromes, and "aba" is the longest.'],
  pattern: ['dp-1d', ['dp-1d', 'two-pointers', 'dp-2d', 'sliding-window'], 'Every palindrome grows outward from its center. Trying every center and expanding while the two ends match covers all palindromes in O(n²), reusing the fact that a palindrome contains a smaller palindrome in its middle.', {
    'two-pointers': 'Expanding with two pointers is the mechanism; the idea that smaller palindromes build larger ones is the DP view.',
    'dp-2d': 'A full table dp[i][j] works too, using O(n²) space.',
    'sliding-window': 'A window does not work because palindromes are not monotone: widening can break and then re-form the property.',
  }],
  hints: [
    'If you know "bab" is a palindrome, what do you need to check to know whether "xbabx" is one?',
    'Where can the middle of a palindrome be? How many kinds of centers are there?',
    'For each index, expand around (i, i) and around (i, i + 1). Keep the longest, preferring the earlier one on ties.',
  ],
  insight: 'A palindrome is a smaller palindrome with two matching letters added around it, so grow outward from every center.',
  brute: 'Check every substring: O(n³).',
  optimal: 'Expand around centers: O(n²) time, O(1) space.',
  walk: ['Define expand(left, right) that moves outward while s[left] == s[right].', 'For every index i expand from (i, i) and from (i, i + 1).', 'Keep the start and length of the longest result (strictly greater replaces).', 'Return the slice.'],
  edge: ['A single letter.', 'Even-length palindromes.', 'All letters equal.', 'No palindrome longer than 1.'],
  works: ['Every palindrome has a center, and expanding from that center finds its maximal extension.', 'Taking the maximum over all centers gives the longest one.'],
  time: ['O(n²)', 'Up to 2n − 1 centers, each expanding up to n/2 times.'],
  space: ['O(1)', 'Only indices are stored.'],
  solution,
  cases,
  sig: 'def longest_palindrome(s):\n    # return the longest palindromic substring (the leftmost on ties)\n    pass\n',
  viz,
  fromArgs: ([s]) => ({ s }),
});
