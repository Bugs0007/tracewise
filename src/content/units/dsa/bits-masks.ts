import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { bitGrid, binStr, widthFor, type BitRow } from '@/content/lib/hashing-bits';

const code = `
def test_bit(n, k):
    return (n >> k) & 1                    #@test

def set_bit(n, k):
    return n | (1 << k)                    #@set

def clear_bit(n, k):
    return n & ~(1 << k)                   #@clear

def toggle_bit(n, k):
    return n ^ (1 << k)                    #@toggle

def subsets(items):
    out = []
    for mask in range(1 << len(items)):    #@mask
        pick = [items[i] for i in range(len(items)) if mask & (1 << i)]   #@pick
        out.append(pick)                   #@add
    return out
`;

interface In {
  n: number;
  k: number;
  items: string[];
}

const viz: VizDef<In> = {
  id: 'bits-masks',
  title: 'Bit masks: test, set, clear, toggle, subsets',
  code,
  language: 'python',
  inputs: [
    { key: 'n', label: 'n (0-255)', kind: 'number', default: 10 },
    { key: 'k', label: 'Bit k (0 = rightmost)', kind: 'number', default: 2 },
    { key: 'items', label: 'Items for subsets', kind: 'strings', default: ['a', 'b', 'c'], maxItems: 4, help: 'Each mask from 0 to 2^len - 1 picks a subset: bit i selects items[i].' },
  ],
  presets: [
    { label: 'Bit already set', input: { n: 10, k: 1, items: ['x', 'y'] } },
    { label: 'Zero and bit 0', input: { n: 0, k: 0, items: ['p'] } },
    { label: 'High bit', input: { n: 255, k: 7, items: ['a', 'b', 'c'] } },
    { label: 'Four items (16 subsets)', input: { n: 6, k: 0, items: ['a', 'b', 'c', 'd'] } },
  ],
  run({ n, k, items }) {
    if (!Number.isInteger(n) || n < 0 || n > 255) throw new Error('n must be a whole number from 0 to 255');
    if (!Number.isInteger(k) || k < 0 || k > 7) throw new Error('k must be a whole number from 0 to 7');
    if (!items.length) throw new Error('Add at least one item');
    const r = new Recorder(code);
    const width = Math.max(widthFor([n], 4), k + 1);
    const maskK = 2 ** k;
    const full = 2 ** width - 1;
    const bitCol = width - 1 - k;
    const opFrame = (anchor: string, caption: string, maskLabel: string, maskVal: number, res: number) => {
      const rowsTone = (changed: boolean): BitRow[] => [
        { label: 'n', value: n, tone: 'default', bitTones: { [bitCol]: 'active' } },
        { label: maskLabel, value: maskVal, tone: 'default', bitTones: { [bitCol]: 'compare' } },
        { label: 'out', value: res, tone: 'done', bitTones: changed ? { [bitCol]: 'swap' } : {} },
      ];
      r.op();
      r.step(anchor, caption, [bitGrid(rowsTone(((n >> k) & 1) !== ((res >> k) & 1) && anchor !== 'test'), width, `n = ${n}, k = ${k}`)], { n, k, result: res });
    };
    const tested = Math.floor(n / maskK) % 2;
    opFrame('test', `test_bit: (n >> ${k}) & 1 = ${tested}. Bit ${k} of ${binStr(n, width)} is ${tested ? 'on' : 'off'}`, '1<<k', maskK, n & maskK);
    const setV = n | maskK;
    opFrame('set', `set_bit: n | (1 << ${k}) = ${setV}. ${tested ? 'It was already on: no change' : `Bit ${k} turned on`}`, '1<<k', maskK, setV);
    const clearV = n & (full ^ maskK);
    opFrame('clear', `clear_bit: n & ~(1 << ${k}) = ${clearV}. ${tested ? `Bit ${k} turned off` : 'It was already off: no change'}`, '~mask', full ^ maskK, clearV);
    const toggleV = n ^ maskK;
    opFrame('toggle', `toggle_bit: n ^ (1 << ${k}) = ${toggleV}. Bit ${k} flipped`, '1<<k', maskK, toggleV);

    const out: string[][] = [];
    const m = items.length;
    const itemsPanel = (mask: number, show: boolean) => ({
      type: 'array' as const,
      title: 'items (bit i selects items[i])',
      values: items,
      tones: Object.fromEntries(items.map((_, i) => [i, show && Math.floor(mask / 2 ** i) % 2 === 1 ? 'found' : 'default'])) as Record<number, Tone>,
    });
    const logPanel = () => ({ type: 'log' as const, title: 'subsets so far', lines: out.map((s) => ({ text: `[${s.join(', ')}]` })) });
    for (let mask = 0; mask < 2 ** m; mask++) {
      const maskRow = (tone: Tone) => bitGrid([{ label: 'mask', value: mask, tone }], m, `mask ${mask} of ${2 ** m - 1}`);
      r.step('mask', `mask = ${mask} (${binStr(mask, m)}): decide which items it picks`, [maskRow('active'), itemsPanel(mask, false), logPanel()], { mask });
      const pick = items.filter((_, i) => Math.floor(mask / 2 ** i) % 2 === 1);
      r.op(m);
      r.step('pick', `mask & (1 << i) is non-zero for ${pick.length ? `i in ${items.map((_, i) => i).filter((i) => Math.floor(mask / 2 ** i) % 2 === 1).join(', ')}` : 'no i'}: pick [${pick.join(', ')}]`, [maskRow('compare'), itemsPanel(mask, true), logPanel()], { mask, pick: `[${pick.join(', ')}]` });
      out.push(pick);
      r.step('add', `Append [${pick.join(', ')}] to the output (${out.length} of ${2 ** m})`, [maskRow('done'), itemsPanel(mask, true), logPanel()], { mask, count: out.length });
    }
    return { frames: r.frames, result: { test: tested, set: setV, clear: clearV, toggle: toggleV, subsets: out } };
  },
  reference({ n, k, items }) {
    const p = 2 ** k;
    const on = Math.floor(n / p) % 2 === 1;
    const subsets: string[][] = [];
    for (let mask = 0; mask < 2 ** items.length; mask++) subsets.push(items.filter((_, i) => Math.floor(mask / 2 ** i) % 2 === 1));
    return { test: on ? 1 : 0, set: on ? n : n + p, clear: on ? n - p : n, toggle: on ? n - p : n + p, subsets };
  },
};

const opTests = [
  { args: [10, 2], expected: [0, 14, 10, 14] },
  { args: [10, 1], expected: [1, 10, 8, 8], name: 'bit already set' },
  { args: [0, 0], expected: [0, 1, 0, 1], name: 'zero' },
  { args: [255, 7], expected: [1, 255, 127, 127], name: 'highest bit of a byte' },
  { args: [1, 0], expected: [1, 1, 0, 0], name: 'lowest bit' },
  { args: [6, 0], expected: [0, 7, 6, 7] },
];

const subsetTests = [
  { args: [[]], expected: [[]], name: 'empty list has one subset' },
  { args: [[1]], expected: [[], [1]], name: 'single item' },
  { args: [[1, 2, 3]], expected: [[], [1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3]] },
  { args: [[5, 6]], expected: [[], [5], [6], [5, 6]] },
  { args: [[1, 2, 3, 4]], expected: [[], [1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3], [4], [1, 4], [2, 4], [1, 2, 4], [3, 4], [1, 3, 4], [2, 3, 4], [1, 2, 3, 4]], name: 'four items' },
];

const unit: Unit = {
  id: 'bits-masks',
  hook: 'A mask is a tiny set packed into an integer. Interviewers love it for flags, visited-sets in small DP problems, and "enumerate every subset" with a single loop.',
  predict: {
    prompt: 'Bit 1 is OFF in n = 5 (binary 101). Which expression turns bit 1 off and leaves every other bit alone, for ANY n?',
    options: ['n & ~(1 << 1)', 'n ^ (1 << 1)', 'n - (1 << 1)', 'n & (1 << 1)'],
    answer: 0,
    explain: '~(1 << 1) is all ones except bit 1, so AND clears only that bit. XOR toggles (n = 5 becomes 7), subtraction breaks when the bit is already off (5 - 2 = 3), and a plain AND keeps ONLY bit 1.',
  },
  viz,
  deeper: {
    points: [
      '1 << k is a mask with only bit k on. Combine it with n using one operator: & tests, | sets, & ~ clears, ^ toggles.',
      'Test: (n >> k) & 1 gives 0 or 1. Use `n & (1 << k) != 0` when only truthiness matters.',
      'Subsets: for mask in range(1 << n), bit i of the mask says whether items[i] is in the subset. 2^n masks cover every subset exactly once.',
      'A mask can also be a set of letters (26 bits) or visited cells in a small DP, giving O(1) membership and cheap set operations (& is intersection, | is union).',
    ],
    complexity: { time: 'Each bit operation O(1); all subsets O(n * 2^n)', space: 'O(1) per operation; O(n * 2^n) to store all subsets' },
    pitfalls: ['Shifting the wrong way: 1 >> k is 0 for k > 0', 'Precedence: 1 << n - 1 means 1 << (n - 1), so write (1 << n) - 1 or 1 << n explicitly', 'Python integers never overflow, but in other languages 1 << 31 can overflow an int', 'Forgetting that ~x is negative in Python (use & with a width mask when you need a fixed number of bits)'],
  },
  practice: {
    language: 'python',
    fnName: 'bit_ops',
    statement: 'Return [is_set, with_bit_set, with_bit_cleared, with_bit_toggled] for bit k of n, where is_set is 0 or 1 and k = 0 is the rightmost bit.',
    signature: 'def bit_ops(n, k):',
    solution: `def bit_ops(n, k):
    mask = 1 << k
    is_set = @@(n >> k) & 1@@
    return [is_set, @@n | mask@@, @@n & ~mask@@, @@n ^ mask@@]`,
    tests: opTests,
  },
  debug: {
    language: 'python',
    fnName: 'subsets',
    compare: 'nested',
    statement: 'subsets(items) should return all 2^n subsets, but the ones containing the last item are missing. Find the bug.',
    buggy: `def subsets(items):
    out = []
    for mask in range(1 << len(items) - 1):
        out.append([items[i] for i in range(len(items)) if mask & (1 << i)])
    return out`,
    fixed: `def subsets(items):
    out = []
    for mask in range(1 << len(items)):
        out.append([items[i] for i in range(len(items)) if mask & (1 << i)])
    return out`,
    tests: subsetTests,
    bugType: 'operator precedence',
    hint: 'In Python, which binds tighter: the shift << or the subtraction -?',
    explanation: 'Subtraction binds tighter than a shift, so `1 << len(items) - 1` is `1 << (len(items) - 1)`: half as many masks, and the top bit is never set. You want exactly `1 << len(items)` masks.',
  },
  boss: {
    title: 'Maximum Product of Word Lengths',
    statement: 'Given a list of lowercase words, return the largest value of len(a) * len(b) over all pairs of words that share no letter. Return 0 if no such pair exists. Aim to test "no shared letter" in O(1).',
    language: 'python',
    fnName: 'max_product',
    starter: `def max_product(words):
    # your code here
    pass
`,
    solution: `def max_product(words):
    masks = []
    for w in words:
        m = 0
        for ch in w:
            m |= 1 << (ord(ch) - ord('a'))
        masks.append(m)
    best = 0
    for i in range(len(words)):
        for j in range(i + 1, len(words)):
            if (masks[i] & masks[j]) == 0:
                best = max(best, len(words[i]) * len(words[j]))
    return best`,
    tests: [
      { args: [['abcw', 'baz', 'foo', 'bar', 'xtfn', 'abcdef']], expected: 16 },
      { args: [['a', 'ab', 'abc', 'd', 'cd', 'bcd', 'abcd']], expected: 4 },
      { args: [['a', 'aa', 'aaa', 'aaaa']], expected: 0, name: 'every pair shares a letter' },
      { args: [[]], expected: 0, name: 'no words' },
      { args: [['abc']], expected: 0, name: 'a single word has no pair' },
      { args: [['ab', 'cd']], expected: 4 },
    ],
    hints: ['Comparing two words letter by letter is slow. Turn each word into one integer where bit 0 means "contains a", bit 1 means "contains b", and so on.', 'Build mask |= 1 << (ord(ch) - ord("a")) for each letter. Two words share no letter exactly when (mask_i & mask_j) == 0.'],
    combines: ['bits-xor', 'hash-set'],
  },
  quiz: [
    {
      prompt: 'What does `mask & (1 << i)` evaluate to when bit i of mask is on?',
      options: ['1', '1 << i', 'mask', 'True only'],
      answer: 1,
      explain: 'Only bit i can survive the AND, so the result is 2^i = 1 << i. That is non-zero, which is why `if mask & (1 << i)` works as a test.',
    },
  ],
};

export default unit;
