import { Recorder } from '@/engine/recorder';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { cap } from '@/content/lib/backend-python';

const code = `
squares = [x * x for x in nums if x > t]            #@comp
#   same as: for x in nums:                         #@take
#                if x > t:                          #@test
#                    out.append(x * x)              #@emit

pairs = [(i, j) for i in range(r) for j in range(c)]   #@nested
#   same as: for i in range(r):                     #@outer
#                for j in range(c):                 #@inner
#                    out.append((i, j))             #@pair
`;

interface In {
  nums: number[];
  t: number;
  r: number;
  c: number;
}

const viz: VizDef<In> = {
  id: 'py-comprehensions',
  title: 'Comprehension = loop + filter + map',
  code,
  language: 'python',
  inputs: [
    { key: 'nums', label: 'nums', kind: 'numbers', default: [3, 8, 5, 12, 7], maxItems: 8 },
    { key: 't', label: 'threshold t (keep x > t)', kind: 'number', default: 4 },
    { key: 'r', label: 'rows r', kind: 'number', default: 2 },
    { key: 'c', label: 'cols c', kind: 'number', default: 3 },
  ],
  presets: [
    { label: 'Default', input: {} },
    { label: 'Nothing passes', input: { nums: [1, 2, 3], t: 10, r: 1, c: 2 } },
    { label: 'Everything passes', input: { nums: [2, 4, 6], t: 0, r: 3, c: 2 } },
  ],
  run(input) {
    const { nums, t } = input;
    const rows = Math.max(1, Math.min(4, Math.round(input.r)));
    const cols = Math.max(1, Math.min(4, Math.round(input.c)));
    const r = new Recorder(code);
    const out: number[] = [];
    const seen: string[] = [];

    const listPanels = (idx: number, verdict?: boolean, justAdded = false): Panel[] => {
      const tones: Record<number, Tone> = {};
      nums.forEach((v, k) => {
        if (k < idx) tones[k] = v > t ? 'visited' : 'muted';
      });
      if (idx >= 0 && idx < nums.length) tones[idx] = verdict === undefined ? 'active' : verdict ? 'found' : 'error';
      const outTones: Record<number, Tone> = {};
      if (justAdded && out.length) outTones[out.length - 1] = 'new';
      return [
        { type: 'array', title: `nums  (keep x > ${t})`, values: nums, tones, pointers: idx >= 0 && idx < nums.length ? { x: idx } : {} },
        { type: 'array', title: 'squares (the new list)', values: out, tones: outTones, hideIndex: true },
      ];
    };

    r.step('comp', cap('A comprehension is a loop that filters with `if` and maps with its left part'), listPanels(-1), { t });
    nums.forEach((x, k) => {
      r.op();
      r.step('take', cap(`for x in nums: x = ${x}`), listPanels(k), { x, t });
      const keep = x > t;
      r.step('test', cap(`if x > t → ${x} > ${t} is ${keep ? 'True: keep it' : 'False: skip it'}`), listPanels(k, keep), { x, t });
      if (keep) {
        out.push(x * x);
        r.step('emit', cap(`Map step: x * x = ${x * x} is appended to the result`), listPanels(k, keep, true), { x, t });
      }
    });
    r.step('comp', cap(`Loop ends: squares = [${out.join(', ')}]`), listPanels(nums.length), { t });

    const gridPanels = (cur: [number, number] | null, rowOnly = false): Panel[] => {
      const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => '' as string | number));
      const tones: Record<string, Tone> = {};
      seen.forEach((_, n) => {
        const i = Math.floor(n / cols);
        const j = n % cols;
        cells[i][j] = n + 1;
        tones[`${i},${j}`] = 'visited';
      });
      if (cur && !rowOnly) tones[`${cur[0]},${cur[1]}`] = 'active';
      if (cur && rowOnly) for (let j = 0; j < cols; j++) tones[`${cur[0]},${j}`] = 'compare';
      return [
        { type: 'grid', title: 'Pair order (cell shows when it was produced; row = i, column = j)', cells, tones, rowLabels: Array.from({ length: rows }, (_, i) => `i=${i}`), colLabels: Array.from({ length: cols }, (_, j) => `j=${j}`) },
        { type: 'array', title: 'pairs', values: seen, hideIndex: true },
      ];
    };
    r.step('nested', cap('Two `for` clauses read left to right, exactly like nested loops'), gridPanels(null), { r: rows, c: cols });
    for (let i = 0; i < rows; i++) {
      r.step('outer', cap(`Outer clause: i = ${i}. The inner loop restarts for every i`), gridPanels([i, 0], true), { i });
      for (let j = 0; j < cols; j++) {
        r.step('inner', cap(`Inner clause: j = ${j}`), gridPanels([i, j]), { i, j });
        seen.push(`(${i}, ${j})`);
        r.op();
        r.step('pair', cap(`Produces (${i}, ${j}) as item ${seen.length}`), gridPanels([i, j]), { i, j });
      }
    }
    const pairs: number[][] = [];
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) pairs.push([i, j]);
    return { frames: r.frames, result: { squares: out, pairs } };
  },
  reference({ nums, t, r, c }) {
    const rows = Math.max(1, Math.min(4, Math.round(r)));
    const cols = Math.max(1, Math.min(4, Math.round(c)));
    return {
      squares: nums.filter((x) => x > t).map((x) => x * x),
      pairs: Array.from({ length: rows * cols }, (_, n) => [Math.floor(n / cols), n % cols]),
    };
  },
};

const unit: Unit = {
  id: 'py-comprehensions',
  hook: 'Comprehensions are the idiomatic Python way to filter and transform, and interviewers use them to see whether you can read nested clauses and know when a generator expression is better than building a list.',
  predict: {
    prompt: 'What does this print?',
    code: 'print([(i, j) for i in range(2) for j in range(i, 2)])',
    codeLang: 'python',
    options: ['[(0, 0), (0, 1), (1, 1)]', '[(0, 0), (1, 0), (1, 1)]', '[(0, 0), (0, 1), (1, 0), (1, 1)]', '[(0, 1), (1, 1)]'],
    answer: 0,
    explain:
      'The clauses nest in the order written: the outer loop is `for i`, the inner is `for j in range(i, 2)`. i=0 gives j=0,1 and i=1 gives j=1 only.',
  },
  viz,
  deeper: {
    points: [
      'Read `[expr for x in xs if cond]` as: loop over xs, keep items where cond is true, collect expr. The `if` runs before expr.',
      'With several `for` clauses, the first is the OUTER loop. The expression is evaluated in the innermost position.',
      'Dict and set comprehensions use the same grammar: `{k: v for ...}` and `{x for ...}`. A generator expression `(x for ...)` uses parentheses and is lazy.',
      'A comprehension has its own scope in Python 3, so the loop variable does not leak into the surrounding code.',
      'A conditional expression in the output (`a if cond else b`) goes at the left; a filter `if` goes at the end.',
    ],
    pitfalls: [
      'Swapping the order of nested `for` clauses (or using one before it is defined)',
      'Packing so much logic in one comprehension that a plain loop would be clearer',
      'Building a huge list just to pass it to sum() or any(); a generator expression avoids it',
    ],
  },
  practice: {
    language: 'python',
    fnName: 'index_words',
    statement: 'Return a dict mapping each lowercase word to its length, only for words that have at least `min_len` characters. Use a dict comprehension.',
    signature: 'def index_words(words, min_len):',
    solution: `def index_words(words, min_len):
    return {@@w.lower()@@: @@len(w)@@ for w in words if @@len(w) >= min_len@@}`,
    tests: [
      { args: [['Tea', 'coffee', 'Ox'], 3], expected: { tea: 3, coffee: 6 } },
      { args: [['a', 'bb', 'ccc'], 2], expected: { bb: 2, ccc: 3 } },
      { args: [[], 1], expected: {}, name: 'empty input' },
      { args: [['Python', 'Go'], 10], expected: {}, name: 'nothing long enough' },
      { args: [['Go', 'GO'], 1], expected: { go: 2 }, name: 'duplicate keys collapse' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'all_pairs',
    statement: '`all_pairs(n)` should list every pair (i, j) with 0 <= i < j < n in order: sorted by i first, then j. It looks right for n = 3 but the order is wrong for larger n. Fix it.',
    buggy: `def all_pairs(n):
    return [(i, j) for j in range(n) for i in range(n) if i < j]`,
    fixed: `def all_pairs(n):
    return [(i, j) for i in range(n) for j in range(i + 1, n)]`,
    bugType: 'nested loop order',
    hint: 'Which variable is the OUTER loop in the buggy version? Write out the pairs for n = 4.',
    explanation:
      'The first `for` clause is the outer loop. The buggy version loops over j outermost, so pairs come grouped by j instead of by i. Put `for i` first and start j at i + 1.',
    tests: [
      { args: [3], expected: [[0, 1], [0, 2], [1, 2]] },
      { args: [4], expected: [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]] },
      { args: [1], expected: [], name: 'no pairs' },
      { args: [5], expected: [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]] },
    ],
  },
  boss: {
    title: 'Score report from messy lines',
    statement:
      'Each line should look like "name,score". Ignore lines that have no comma, an empty name (after strip) or a score that is not all digits (after strip). Return a dict: "valid" (count of valid lines), "best" (dict name → highest score for that stripped name) and "initials" (sorted list of unique uppercase first letters of the names).',
    language: 'python',
    fnName: 'summarize',
    starter: `def summarize(lines):
    # your code here
    pass
`,
    solution: `def summarize(lines):
    rows = (line.split(',', 1) for line in lines if ',' in line)
    pairs = [(name.strip(), int(score)) for name, score in rows if name.strip() and score.strip().isdigit()]
    best = {}
    for name, score in pairs:
        best[name] = max(score, best.get(name, score))
    return {
        'valid': len(pairs),
        'best': best,
        'initials': sorted({name[0].upper() for name, _ in pairs}),
    }`,
    tests: [
      {
        args: [['ann,90', 'bob,x', '', 'ann,75', 'Cy , 60 ', 'dee']],
        expected: { valid: 3, best: { ann: 90, Cy: 60 }, initials: ['A', 'C'] },
        name: 'messy input',
      },
      { args: [['', ',5', 'x,']], expected: { valid: 0, best: {}, initials: [] }, name: 'all invalid' },
      { args: [['zed,1', 'zed,3', 'zed,2']], expected: { valid: 3, best: { zed: 3 }, initials: ['Z'] }, name: 'keeps the best score' },
      { args: [['amy,100', 'bob,100', 'abe,5']], expected: { valid: 3, best: { amy: 100, bob: 100, abe: 5 }, initials: ['A', 'B'] }, name: 'unique initials' },
      { args: [[]], expected: { valid: 0, best: {}, initials: [] }, name: 'empty' },
    ],
    hints: ['A generator expression can split the lines lazily, then one list comprehension can strip and convert the valid ones.', 'Keep the best score with a small loop using `max(score, best.get(name, score))`, and build the initials with a set comprehension passed to sorted().'],
    combines: ['py-comprehensions', 'hash-set'],
  },
  quiz: [
    {
      prompt: 'Which one is lazy?',
      options: ['[x for x in range(5)]', '{x for x in range(5)}', '(x for x in range(5))', '{x: 1 for x in range(5)}'],
      answer: 2,
      explain: 'Only the parenthesised generator expression produces items on demand; the others build a full collection immediately.',
    },
    {
      prompt: 'Where does the conditional expression go to replace odd numbers by 0: `[? for x in nums]`?',
      options: ['x if x % 2 == 0 else 0 (at the left)', 'if x % 2 == 0 (at the end)', 'x or 0', 'It cannot be done'],
      answer: 0,
      explain: 'A ternary expression picks the value (left side). A trailing `if` filters items out instead.',
    },
  ],
};

export default unit;
