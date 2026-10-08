import { Recorder } from '@/engine/recorder';
import type { ArrayPanel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';

const code = `
def reverse_words(s):
    chars = list(s)                                   #@init
    reverse(chars, 0, len(chars) - 1)                 #@whole
    start = 0                                         #@start
    for i in range(len(chars) + 1):
        if i == len(chars) or chars[i] == ' ':        #@boundary
            reverse(chars, start, i - 1)              #@word
            start = i + 1
    return ''.join(chars)                             #@done

def reverse(chars, lo, hi):
    while lo < hi:
        chars[lo], chars[hi] = chars[hi], chars[lo]   #@swap
        lo += 1
        hi -= 1
`;

interface In {
  text: string;
}

const show = (c: string) => (c === ' ' ? '␣' : c);

const viz: VizDef<In> = {
  id: 'string-reverse-words',
  title: 'Reverse the words of a string in place',
  code,
  language: 'python',
  inputs: [{ key: 'text', label: 'Text (words separated by single spaces)', kind: 'string', default: 'I love code', maxItems: 16 }],
  presets: [
    { label: 'Two words', input: { text: 'go far' } },
    { label: 'One word', input: { text: 'abcde' } },
    { label: 'Four words', input: { text: 'a bc def gh' } },
    { label: 'Double space', input: { text: 'hi  you' } },
  ],
  run({ text }) {
    if (typeof text !== 'string' || text.length === 0) throw new Error('Enter some text to reverse');
    const r = new Recorder(code);
    const chars = [...text];
    const n = chars.length;
    const ids = chars.map((_, i) => i);
    const base: Record<number, Tone> = {};

    const view = (title: string, pointers: Record<string, number>, range?: { from: number; to: number; label?: string }, hot: Record<number, Tone> = {}): ArrayPanel => ({
      type: 'array',
      title,
      values: chars.map(show),
      ids,
      tones: { ...base, ...hot },
      pointers,
      range: range ? { ...range, tone: 'active' } : undefined,
    });

    // reverse(chars, lo, hi) with one frame per swap
    const reverse = (from: number, to: number, title: string) => {
      let lo = from;
      let hi = to;
      while (lo < hi) {
        const a = chars[lo];
        const b = chars[hi];
        [chars[lo], chars[hi]] = [chars[hi], chars[lo]];
        [ids[lo], ids[hi]] = [ids[hi], ids[lo]];
        r.op();
        r.step('swap', `Swap '${show(a)}' and '${show(b)}' (indices ${lo} and ${hi})`, [view(title, { lo, hi }, { from, to }, { [lo]: 'swap', [hi]: 'swap' })], { lo, hi });
        lo++;
        hi--;
      }
    };

    r.step('init', `chars = list(s): ${n} character${n === 1 ? '' : 's'}`, [view('chars', {})], { n });
    r.step('whole', n > 1 ? `Phase 1: reverse the whole array, indices 0..${n - 1}` : 'Phase 1: one character, nothing to reverse', [view('Phase 1 — reverse everything', { lo: 0, hi: n - 1 }, { from: 0, to: n - 1 })], { lo: 0, hi: n - 1 });
    reverse(0, n - 1, 'Phase 1 — reverse everything');
    for (let i = 0; i < n; i++) base[i] = 'visited';
    r.step('start', 'Words are in the right order now, but each one is backwards', [view('Phase 2 — fix each word', {})], { start: 0 });

    let start = 0;
    for (let i = 0; i <= n; i++) {
      if (!(i === n || chars[i] === ' ')) continue;
      const len = i - start;
      const title = 'Phase 2 — fix each word';
      const caption =
        len === 0
          ? `i = ${i}: nothing between start and here, skip`
          : len === 1
            ? `Word '${chars[start]}' is one letter: nothing to swap`
            : `${i === n ? 'End of string' : `chars[${i}] is a space`} → reverse the word at ${start}..${i - 1}`;
      r.op();
      r.step('boundary', caption, [view(title, len > 0 ? { start, i } : { i }, len > 0 ? { from: start, to: i - 1 } : undefined)], { start, i });
      if (len > 0) {
        reverse(start, i - 1, title);
        for (let k = start; k < i; k++) base[k] = 'done';
      }
      start = i + 1;
    }
    const out = chars.join('');
    r.step('done', `Result: "${out}"`, [view('Result', {}, undefined, Object.fromEntries(chars.map((c, i) => [i, c === ' ' ? 'muted' : 'done'])))], { result: out });
    return { frames: r.frames, result: out };
  },
  reference({ text }) {
    return text.split(' ').reverse().join(' ');
  },
};

const tests = [
  { args: ['I love code'], expected: 'code love I' },
  { args: ['one'], expected: 'one', name: 'single word' },
  { args: [''], expected: '', name: 'empty string' },
  { args: ['a b c d'], expected: 'd c b a', name: 'one-letter words' },
  { args: ['ab cd'], expected: 'cd ab' },
  { args: ['the quick brown fox'], expected: 'fox brown quick the', name: 'four words' },
];

const unit: Unit = {
  id: 'string-reverse-words',
  hook: 'Strings are immutable in most languages, so "reverse in place" really means "copy to a char array, then use two-pointer swaps". The reverse-everything-then-reverse-each-piece trick shows up again in array rotation.',
  predict: {
    prompt: 'After phase 1 (reverse the whole string "I love code"), which string is in the char array?',
    options: ['"code love I"', '"edoc evol I"', '"I evol edoc"', '"edoc love I"'],
    answer: 1,
    explain: 'Reversing every character gives "edoc evol I": the word order is fixed but each word is mirrored. Phase 2 mirrors each word back.',
  },
  viz,
  deeper: {
    points: [
      'Reversing the whole string puts the words in the correct order but flips every word; reversing each word again fixes the letters. Two flips cancel.',
      'A word ends at a space or at the end of the string, so the loop runs to len(chars) inclusive to catch the last word.',
      'reverse(chars, lo, hi) is the two-pointer core: swap the ends, move both inward, stop when they meet.',
      'The same three-reversal idea rotates an array by k positions in O(1) extra space.',
    ],
    complexity: { time: 'O(n)', space: 'O(n) for the char array, O(1) extra' },
    pitfalls: ['Looping to len(chars) - 1 and never reversing the last word', 'Forgetting that start must jump past the space (start = i + 1)', 'Trying to assign s[i] on an immutable string'],
  },
  practice: {
    language: 'python',
    fnName: 'reverse_words',
    statement: 'Reverse the order of the words in `s` (words are separated by single spaces). Convert to a list of characters and use in-place reversals: first the whole list, then each word.',
    signature: 'def reverse_words(s):',
    solution: `def reverse_words(s):
    chars = list(s)
    reverse(chars, 0, @@len(chars) - 1@@)
    start = 0
    for i in range(len(chars) + 1):
        if i == len(chars) or @@chars[i] == ' '@@:
            reverse(chars, start, @@i - 1@@)
            start = @@i + 1@@
    return ''.join(chars)

def reverse(chars, lo, hi):
    while @@lo < hi@@:
        @@chars[lo], chars[hi] = chars[hi], chars[lo]@@
        lo += 1
        hi -= 1`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'reverse_words',
    statement: 'This reverses the word order, but the last word comes out mirrored. Find the bug.',
    buggy: `def reverse_words(s):
    chars = list(s)
    reverse(chars, 0, len(chars) - 1)
    start = 0
    for i in range(len(chars)):
        if i == len(chars) or chars[i] == ' ':
            reverse(chars, start, i - 1)
            start = i + 1
    return ''.join(chars)

def reverse(chars, lo, hi):
    while lo < hi:
        chars[lo], chars[hi] = chars[hi], chars[lo]
        lo += 1
        hi -= 1`,
    fixed: `def reverse_words(s):
    chars = list(s)
    reverse(chars, 0, len(chars) - 1)
    start = 0
    for i in range(len(chars) + 1):
        if i == len(chars) or chars[i] == ' ':
            reverse(chars, start, i - 1)
            start = i + 1
    return ''.join(chars)

def reverse(chars, lo, hi):
    while lo < hi:
        chars[lo], chars[hi] = chars[hi], chars[lo]
        lo += 1
        hi -= 1`,
    tests,
    bugType: 'off-by-one',
    hint: 'What ends the final word? There is no space after it.',
    explanation: 'The last word is terminated by the end of the string, not by a space. range(len(chars)) never reaches i == len(chars), so that word is never flipped back. Loop to len(chars) + 1.',
  },
  boss: {
    title: 'Rotate the array',
    statement: 'Rotate the list `nums` to the right by `k` steps, in place (k may be larger than the length), and return it. Use three reversals instead of extra memory.',
    language: 'python',
    fnName: 'rotate',
    starter: `def rotate(nums, k):
    # your code here
    pass
`,
    solution: `def rotate(nums, k):
    n = len(nums)
    if n == 0:
        return nums
    k %= n

    def reverse(lo, hi):
        while lo < hi:
            nums[lo], nums[hi] = nums[hi], nums[lo]
            lo += 1
            hi -= 1

    reverse(0, n - 1)
    reverse(0, k - 1)
    reverse(k, n - 1)
    return nums`,
    tests: [
      { args: [[1, 2, 3, 4, 5, 6, 7], 3], expected: [5, 6, 7, 1, 2, 3, 4] },
      { args: [[-1, -100, 3, 99], 2], expected: [3, 99, -1, -100], name: 'negatives' },
      { args: [[1], 5], expected: [1], name: 'single element' },
      { args: [[], 3], expected: [], name: 'empty' },
      { args: [[1, 2], 0], expected: [1, 2], name: 'k = 0' },
      { args: [[1, 2, 3], 4], expected: [3, 1, 2], name: 'k larger than n' },
    ],
    hints: ['Rotating right by k moves the last k items to the front. Which reversals produce that?', 'Reverse everything, then reverse the first k items, then reverse the rest. Take k %= n first so a large k works.'],
    combines: ['array-two-index', 'two-pointers'],
  },
};

export default unit;
