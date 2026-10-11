import type { Tone } from '@/engine/types';
import { stringView } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './valid-palindrome.py?raw';
import cases from './valid-palindrome.cases.json';

const alnum = (c: string): boolean => /[\p{L}\p{N}]/u.test(c);

const viz = vizOf<{ s: string }>({
  id: 'valid-palindrome',
  title: 'Valid Palindrome',
  solution,
  inputs: [{ key: 's', label: 's', kind: 'string', default: "No 'x' in Nixon", maxItems: 30 }],
  presets: [
    { label: 'Palindrome', input: { s: "No 'x' in Nixon" } },
    { label: 'Not a palindrome', input: { s: 'ab, bc' } },
    { label: 'Only punctuation', input: { s: '.,; !' } },
    { label: 'Empty', input: { s: '' } },
  ],
  run({ s }) {
    const r = new TraceRecorder(solution);
    const ch = [...s];
    let l = 0;
    let rt = ch.length - 1;
    const done = new Set<number>();
    const skipped = new Set<number>();
    const view = (hot: Record<number, Tone> = {}) => {
      const tones: Record<number, Tone> = {};
      skipped.forEach((i) => (tones[i] = 'muted'));
      done.forEach((i) => (tones[i] = 'done'));
      return [stringView(s, { title: 's', tones: { ...tones, ...hot }, pointers: { l, r: rt } })];
    };
    r.step('init', 'Two pointers: l at the left end, r at the right end. We only compare letters and digits.', view(), { l, r: rt });
    while (l < rt) {
      r.op();
      r.step('loop', `Look at s[${l}] = ${JSON.stringify(ch[l])} and s[${rt}] = ${JSON.stringify(ch[rt])}.`, view({ [l]: 'active', [rt]: 'active' }), { l, r: rt });
      if (!alnum(ch[l])) {
        r.predict('skip', `s[l] = ${JSON.stringify(ch[l])}. What happens to l?`, ['It moves right: not a letter or digit', 'It is compared with s[r]'], 0, 'Punctuation and spaces are ignored, so l just steps past them.');
        skipped.add(l);
        l++;
        r.step('moveL', `${JSON.stringify(ch[l - 1])} is not a letter or digit: skip it (l = ${l}).`, view(), { l, r: rt });
      } else if (!alnum(ch[rt])) {
        skipped.add(rt);
        rt--;
        r.step('moveR', `${JSON.stringify(ch[rt + 1])} is not a letter or digit: skip it (r = ${rt}).`, view(), { l, r: rt });
      } else {
        const same = ch[l].toLowerCase() === ch[rt].toLowerCase();
        r.step('cmp', `Compare ${JSON.stringify(ch[l].toLowerCase())} with ${JSON.stringify(ch[rt].toLowerCase())}, ignoring case.`, view({ [l]: 'compare', [rt]: 'compare' }), { l, r: rt });
        r.predict('cmp', `Do ${JSON.stringify(ch[l])} and ${JSON.stringify(ch[rt])} match (ignoring case)?`, ['Yes: move both pointers inward', 'No: it is not a palindrome'], same ? 0 : 1, same ? 'A matching pair is settled; the pointers move toward the middle.' : 'One mismatch is enough to answer False.');
        if (!same) {
          r.step('no', 'They differ, so the string is not a palindrome: return False.', view({ [l]: 'error', [rt]: 'error' }), { result: false });
          return { frames: r.frames, result: false };
        }
        done.add(l);
        done.add(rt);
        l++;
        rt--;
        r.step('stepL', 'They match. Move both pointers one step inward.', view(), { l, r: rt });
      }
    }
    r.predict('end', 'The pointers have met without a mismatch. What is returned?', ['True', 'False'], 0, 'Every pair of letters matched, so the string reads the same both ways.');
    r.step('yes', 'The pointers met or crossed with every pair matching: return True.', view(), { result: true });
    return { frames: r.frames, result: true };
  },
  reference({ s }) {
    const t = [...s].filter(alnum).map((c) => c.toLowerCase());
    return t.join('') === [...t].reverse().join('');
  },
});

export default problem({
  summary: 'Decide whether a piece of text reads the same forwards and backwards once you ignore everything that is not a letter or a digit, and treat upper and lower case as the same.',
  example: ['s = "Madam, I\'m Adam"', 'true', 'Without punctuation and case it is "madamimadam", which is the same reversed.'],
  pattern: ['two-pointers', ['two-pointers', 'sliding-window', 'stack', 'binary-search'], 'A palindrome is symmetric, so compare the outermost characters first and work inward. One pointer starts at each end and they move toward each other.', {
    'sliding-window': 'A window grows and shrinks over a contiguous range. Here nothing is searched for; two ends simply move inward.',
    stack: 'A stack could reverse the characters, but that spends extra memory when two indices do the job in place.',
    'binary-search': 'Nothing is sorted and nothing is being located.',
  }],
  hints: [
    'If you removed the punctuation and lowercased everything, how would you check a palindrome? Think about which characters must be equal to each other.',
    'The first and last characters must match, then the second and second-to-last, and so on. Which two positions do you compare next?',
    'You do not need to build a cleaned copy: move the pointers inward and step past characters that are not letters or digits.',
  ],
  insight: 'Compare from both ends toward the middle, skipping characters that do not count.',
  brute: 'Build a cleaned, lowercased copy and compare it with its reverse: O(n) time, O(n) extra space.',
  optimal: 'Two pointers over the original text, skipping junk on the fly: O(n) time, O(1) space.',
  walk: [
    'Put l at index 0 and r at the last index.',
    'While l < r: if s[l] is not a letter or digit, move l right. Otherwise, if s[r] is not, move r left.',
    'When both point at real characters, compare them ignoring case. A mismatch means return False. A match means both pointers move one step inward.',
    'If the pointers meet or cross, every pair matched, so return True.',
  ],
  edge: ['Empty text and text with only punctuation are palindromes (nothing to compare).', 'A single character.', 'Digits count as characters: "1a2" is not a palindrome.', 'Mixed case such as "Noon".'],
  works: ['Invariant: everything outside the pointers has already been matched or skipped. Each step either skips a character that cannot matter or settles one more matching pair.', 'Skipping never discards a real character, so a False answer always comes from a genuine mismatch.'],
  time: ['O(n)', 'Each pointer moves at most n steps in total.'],
  space: ['O(1)', 'Only two indices are stored.'],
  solution,
  cases,
  sig: 'def is_palindrome(s):\n    # True if s reads the same both ways, ignoring case and anything that is not a letter or digit\n    pass\n',
  viz,
  fromArgs: ([s]) => ({ s }),
});
