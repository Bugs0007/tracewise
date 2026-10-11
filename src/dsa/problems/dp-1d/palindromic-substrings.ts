import { hashMapView, stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './palindromic-substrings.py?raw';
import cases from './palindromic-substrings.cases.json';

const viz = vizOf<{ s: string }>({
  id: 'palindromic-substrings',
  title: 'Palindromic Substrings',
  solution,
  inputs: [{ key: 's', label: 's (lowercase)', kind: 'string', default: 'abab', maxItems: 10 }],
  presets: [
    { label: 'abab', input: { s: 'abab' } },
    { label: 'All the same', input: { s: 'aaa' } },
    { label: 'No repeats', input: { s: 'abc' } },
    { label: 'Even only', input: { s: 'abba' } },
  ],
  validate: ({ s }) => (/^[a-z]+$/.test(s) ? null : 'Use 1 to 10 lowercase letters'),
  run({ s }) {
    const r = new TraceRecorder(solution);
    let total = 0;
    let win: { from: number; to: number } | null = null;
    const found: string[] = [];
    let askedCenters = false;
    let askedCount = false;
    const view = () => [stringView(s, { title: 'string (bracket = palindrome just counted)', window: win ? { from: win.from, to: win.to, label: 'palindrome', tone: 'found' } : undefined }), hashMapView({ total, 'palindromes found': found.join(', ') || '—' })];
    r.step('init', 'Count every substring that reads the same in both directions. Each one has a center; we count every palindrome that grows from each center.', view(), {});
    if (!askedCenters) {
      askedCenters = true;
      r.predictChoice('centers', `The string has ${s.length} letters. How many centers (letters and gaps between letters) are there?`, String(2 * s.length - 1), [String(s.length), String(2 * s.length), String(s.length - 1)], s.length, 'n letters and n − 1 gaps between them: 2n − 1.');
    }
    for (let center = 0; center < 2 * s.length - 1; center++) {
      let left = Math.floor(center / 2);
      let right = left + (center % 2);
      r.op();
      win = null;
      r.step('centers', center % 2 ? `Center between positions ${left} and ${right}.` : `Center on position ${left}.`, view(), { center });
      while (left >= 0 && right < s.length && s[left] === s[right]) {
        total++;
        found.push(s.slice(left, right + 1));
        win = { from: left, to: right };
        if (!askedCount) {
          askedCount = true;
          r.step('count', `"${s.slice(left, right + 1)}" is a palindrome: count it. total = ${total}.`, view(), {});
          r.predict('count', 'Every time the ends match we count one more palindrome and then widen. Is a single letter a palindrome?', ['Yes: every single letter counts', 'No: palindromes need two letters'], 0, 'A single letter reads the same both ways, so every letter is already a palindrome of length 1.');
        } else {
          r.step('count', `"${s.slice(left, right + 1)}" is a palindrome. total = ${total}.`, view(), {});
        }
        left--;
        right++;
      }
    }
    win = null;
    r.step('done', `${total} palindromic substring${total === 1 ? '' : 's'}.`, view(), { result: total });
    return { frames: r.frames, result: total };
  },
  reference({ s }) {
    let c = 0;
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j <= s.length; j++) {
      const t = s.slice(i, j);
      if (t === [...t].reverse().join('')) c++;
    }
    return c;
  },
});

export default problem({
  summary: 'Count how many substrings of a string are palindromes. Substrings at different positions count separately even if they look the same (in "aa" the two single "a"s and the whole "aa" make 3).',
  example: ['"aba"', '4', '"a", "b", "a" and "aba".'],
  pattern: ['dp-1d', ['dp-1d', 'two-pointers', 'dp-2d', 'sliding-window'], 'Each palindrome grows outward from a center, and every step of the growth is one more palindrome. Expand from all 2n − 1 centers and count every successful step.', {
    'two-pointers': 'The expansion uses two pointers; counting every successful step is what makes it a DP-style count.',
    'dp-2d': 'A table works but costs O(n²) space.',
    'sliding-window': 'Palindromes are not a monotone window property.',
  }],
  hints: [
    'How many palindromes start with a single letter in the middle?',
    'When an expansion step succeeds, how many new palindromes appeared?',
    'For every center (n letters + n − 1 gaps) expand while the ends match and add 1 per successful step.',
  ],
  insight: 'One successful expansion step = one more palindrome, so counting steps counts palindromes.',
  brute: 'Test every substring: O(n³).',
  optimal: 'Expand around centers: O(n²) time, O(1) space.',
  walk: ['total = 0.', 'For center in 0 … 2n − 2: left = center // 2, right = left + center % 2.', 'While s[left] == s[right] (in range): total += 1, left −= 1, right += 1.', 'Return total.'],
  edge: ['A single letter.', 'All letters equal (n(n+1)/2).', 'No repeated letters (n).', 'Even-length palindromes.'],
  works: ['Each palindromic substring has exactly one center and is reached by exactly one expansion step from it.', 'Therefore each is counted once.'],
  time: ['O(n²)', 'At most 2n − 1 centers, each expanding up to n/2.'],
  space: ['O(1)', 'No extra storage.'],
  solution,
  cases,
  sig: 'def count_substrings(s):\n    # number of substrings that are palindromes (by position)\n    pass\n',
  viz,
  fromArgs: ([s]) => ({ s }),
});
