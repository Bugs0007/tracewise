import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, KVPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def longest_unique(s):
    last = {}                                 #@init
    left = best = 0
    for right, ch in enumerate(s):            #@loop
        if ch in last and last[ch] >= left:   #@check
            left = last[ch] + 1               #@shrink
        last[ch] = right                      #@record
        best = max(best, right - left + 1)    #@update
    return best                               #@done
`;

interface In {
  text: string;
}

const viz: VizDef<In> = {
  id: 'sliding-window-variable',
  title: 'Longest substring without repeats',
  code,
  language: 'python',
  inputs: [{ key: 'text', label: 'String', kind: 'string', default: 'abcabcbb', maxItems: 14 }],
  presets: [
    { label: 'abcabcbb', input: { text: 'abcabcbb' } },
    { label: 'Stale index', input: { text: 'abba' } },
    { label: 'All unique', input: { text: 'abcdef' } },
    { label: 'All same', input: { text: 'aaaa' } },
  ],
  run({ text }) {
    if (typeof text !== 'string' || text.length === 0) throw new Error('Enter at least one character');
    const chars = [...text];
    const r = new Recorder(code);
    const last = new Map<string, number>();
    let left = 0;
    let best = 0;
    let bestStart = 0;
    let fresh: string | undefined;

    const panels = (right: number | undefined, windowTo: number, hot: Record<number, Tone> = {}): [ArrayPanel, KVPanel] => {
      const tones: Record<number, Tone> = {};
      for (let i = bestStart; i < bestStart + best; i++) tones[i] = 'done';
      Object.assign(tones, hot);
      const pointers: Record<string, number> = { left };
      if (right !== undefined) pointers.right = right;
      const arr: ArrayPanel = {
        type: 'array',
        title: 'Characters  (green = best window so far)',
        values: chars,
        tones,
        pointers,
        range: windowTo >= left ? { from: left, to: windowTo, tone: 'active', label: `window (${windowTo - left + 1})` } : undefined,
      };
      const kv: KVPanel = {
        type: 'kv',
        title: 'last — most recent index of each letter',
        entries: [...last.entries()].map(([k, v]) => ({ k, v, tone: k === fresh ? 'new' : v < left ? 'muted' : 'default' })),
      };
      return [arr, kv];
    };

    r.step('init', 'Empty window: left = 0, best = 0, nothing seen yet', panels(undefined, -1), { left, best });
    for (let right = 0; right < chars.length; right++) {
      const ch = chars[right];
      fresh = undefined;
      const prev = last.get(ch);
      r.op();
      r.step(
        'loop',
        prev === undefined ? `right = ${right}: '${ch}' has never been seen` : `right = ${right}: '${ch}' was last seen at index ${prev}`,
        panels(right, right - 1, { [right]: 'compare' }),
        { right, left, best, ch },
      );
      if (prev !== undefined) {
        if (prev >= left) {
          r.step('check', `Index ${prev} ≥ left (${left}): '${ch}' is repeated inside the window`, panels(right, right - 1, { [right]: 'compare', [prev]: 'error' }), { right, left, best, ch });
          left = prev + 1;
          r.step('shrink', `Shrink: left jumps past the old '${ch}' → left = ${left}`, panels(right, right - 1, { [right]: 'compare' }), { right, left, best, ch });
        } else {
          r.step('check', `Index ${prev} < left (${left}): that '${ch}' is already outside the window`, panels(right, right - 1, { [right]: 'compare', [prev]: 'muted' }), { right, left, best, ch });
        }
      }
      last.set(ch, right);
      fresh = ch;
      const size = right - left + 1;
      r.op();
      if (size > best) {
        best = size;
        bestStart = left;
        r.step('update', `Window ${left}..${right} has ${size} distinct letters → best = ${best}`, panels(right, right), { right, left, best });
      } else {
        r.step('update', `Window ${left}..${right} has ${size}; best stays ${best}`, panels(right, right), { right, left, best });
      }
    }
    fresh = undefined;
    r.step('done', `Longest run without a repeat: ${best}`, panels(undefined, -1), { best });
    return { frames: r.frames, result: best };
  },
  reference({ text }) {
    let best = 0;
    for (let i = 0; i < text.length; i++) {
      const seen = new Set<string>();
      let j = i;
      while (j < text.length && !seen.has(text[j])) seen.add(text[j++]);
      best = Math.max(best, j - i);
    }
    return best;
  },
};

const tests = [
  { args: ['abcabcbb'], expected: 3 },
  { args: ['bbbbb'], expected: 1, name: 'all the same' },
  { args: ['pwwkew'], expected: 3 },
  { args: [''], expected: 0, name: 'empty' },
  { args: ['a'], expected: 1, name: 'single character' },
  { args: ['abba'], expected: 2, name: 'stale last-seen index' },
  { args: ['tmmzuxt'], expected: 5, name: 'repeat outside the window' },
];

const unit: Unit = {
  id: 'sliding-window-variable',
  hook: 'When the window size is not fixed, you grow it on the right and shrink it on the left until it is valid again. "Longest substring without repeats" is the canonical test of that expand-then-shrink loop.',
  predict: {
    prompt: 'In "abcabcbb", right reaches index 3 (the second "a"). Where does left move, and what is the window afterwards?',
    options: ['left stays 0; window "abca"', 'left = 1; window "bca"', 'left = 3; window "a"', 'left = 2; window "ca"'],
    answer: 1,
    explain: 'The earlier "a" is at index 0, so the window must start after it: left = 1. The window is "bca" (indices 1..3), all distinct.',
  },
  viz,
  deeper: {
    points: [
      'Invariant: s[left..right] never contains a repeated letter. Each step adds s[right] and, if that breaks the invariant, moves left just far enough to fix it.',
      'Storing the last index of each letter lets left jump straight past the previous copy instead of shrinking one step at a time.',
      'The check `last[ch] >= left` matters: an old index that is already left of the window must not drag left backwards.',
      'Each index enters the window once and leaves once, so the total work is O(n) even though there is a shrink step.',
    ],
    complexity: { time: 'O(n)', space: 'O(min(n, alphabet))' },
    pitfalls: ['Forgetting `last[ch] >= left` (left moves backwards on inputs like "abba")', 'Setting left = last[ch] instead of last[ch] + 1', 'Measuring the length as right - left instead of right - left + 1'],
  },
  practice: {
    language: 'python',
    fnName: 'longest_unique',
    statement: 'Return the length of the longest substring of `s` that contains no repeated character. Use a window and remember the last index of each character.',
    signature: 'def longest_unique(s):',
    solution: `def longest_unique(s):
    last = {}
    left = best = 0
    for right, ch in enumerate(s):
        if ch in last and @@last[ch] >= left@@:
            left = @@last[ch] + 1@@
        last[ch] = @@right@@
        best = max(best, @@right - left + 1@@)
    return best`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'longest_unique',
    statement: 'This sliding window overcounts on inputs such as "abba". Find the bug.',
    buggy: `def longest_unique(s):
    last = {}
    left = best = 0
    for right, ch in enumerate(s):
        if ch in last:
            left = last[ch] + 1
        last[ch] = right
        best = max(best, right - left + 1)
    return best`,
    fixed: `def longest_unique(s):
    last = {}
    left = best = 0
    for right, ch in enumerate(s):
        if ch in last and last[ch] >= left:
            left = last[ch] + 1
        last[ch] = right
        best = max(best, right - left + 1)
    return best`,
    tests,
    bugType: 'window can move backwards',
    hint: 'Trace "abba". When the final "a" arrives, where is left, and where does the code move it?',
    explanation: 'After "abb", left is 2. The last "a" was at index 0, so the buggy code sets left = 1, moving the window start backwards and re-admitting the duplicate "b". Only react to a previous index that is inside the window (>= left).',
  },
  boss: {
    title: 'At most k distinct characters',
    statement: 'Return the length of the longest substring of `s` that contains at most `k` different characters. k can be 0.',
    language: 'python',
    fnName: 'longest_k_distinct',
    starter: `def longest_k_distinct(s, k):
    # your code here
    pass
`,
    solution: `def longest_k_distinct(s, k):
    counts = {}
    left = 0
    best = 0
    for right, ch in enumerate(s):
        counts[ch] = counts.get(ch, 0) + 1
        while len(counts) > k:
            out = s[left]
            counts[out] -= 1
            if counts[out] == 0:
                del counts[out]
            left += 1
        best = max(best, right - left + 1)
    return best`,
    tests: [
      { args: ['eceba', 2], expected: 3 },
      { args: ['aa', 1], expected: 2 },
      { args: ['', 3], expected: 0, name: 'empty' },
      { args: ['abc', 0], expected: 0, name: 'k = 0' },
      { args: ['aabbcc', 2], expected: 4 },
      { args: ['abcdef', 10], expected: 6, name: 'k larger than the alphabet used' },
    ],
    hints: ['Grow the window one letter at a time. When it holds too many distinct letters, what must you do to the left side?', 'Keep a dict of counts for the window. After adding s[right], while len(counts) > k remove s[left] (delete the key when its count hits 0) and advance left.'],
    combines: ['sliding-window-variable', 'hash-set'],
  },
};

export default unit;
