import { Recorder } from '@/engine/recorder';
import type { VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { CallTree, callTreePanel, pathLabel, pyList, type NodeView } from '@/content/lib/recursion-greedy';

const code = `
def subsets(nums):
    result = []
    path = []

    def backtrack(i):
        if i == len(nums):                #@leaf
            result.append(path[:])        #@record
            return
        path.append(nums[i])              #@include
        backtrack(i + 1)                  #@exploreInc
        path.pop()                        #@unchoose
        backtrack(i + 1)                  #@exploreExc

    backtrack(0)                          #@start
    return result                         #@done
`;

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'subsets',
  title: 'Backtracking: subsets',
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Distinct numbers', kind: 'numbers', default: [1, 2, 3], maxItems: 4, help: 'Up to 4 numbers — the tree has 2^n leaves' }],
  presets: [
    { label: 'Two items', input: { nums: [1, 2] } },
    { label: 'Empty input', input: { nums: [] } },
    { label: 'Four items', input: { nums: [1, 2, 3, 4] } },
  ],
  run({ nums }) {
    if (nums.length > 4) throw new Error('Use at most 4 numbers (the decision tree doubles with every item)');
    const tree = new CallTree();
    let result: number[][] = [];

    const exec = (r: Recorder | null) => {
      if (r) tree.replay();
      const view: Record<string, NodeView> = {};
      const path: number[] = [];
      result = [];
      const emit = (at: string, caption: string, vars: Record<string, unknown>, newest = -1) => {
        if (!r) return;
        r.step(
          at,
          caption,
          [
            callTreePanel(tree, view, { title: 'Decision tree (left = take, right = skip)' }),
            { type: 'array', title: 'path', values: [...path], hideIndex: true, tones: Object.fromEntries(path.map((_, i) => [i, 'active' as const])) },
            { type: 'log', title: `result (${result.length} subsets)`, lines: result.map((s, k) => ({ text: pyList(s), tone: k === newest ? ('found' as const) : ('default' as const) })) },
          ],
          { ...vars, path: pyList(path), found: result.length },
        );
      };
      const backtrack = (i: number, id: string) => {
        r?.op();
        if (i === nums.length) {
          result.push([...path]);
          view[id] = { tone: 'found', badge: 'record' };
          emit('record', `i = ${i} = len(nums): record a copy ${pyList(path)}`, { i }, result.length - 1);
          return;
        }
        view[id] = { tone: 'active' };
        path.push(nums[i]);
        const inc = tree.add(pathLabel(path), id, `take ${nums[i]}`);
        view[id] = { tone: 'frontier' };
        view[inc] = { tone: 'new' };
        emit('include', `Take ${nums[i]} → path = ${pyList(path)}`, { i, choice: nums[i] });
        view[inc] = { tone: 'active' };
        backtrack(i + 1, inc);
        if (view[inc].tone === 'active') view[inc] = { tone: 'done' };
        path.pop();
        view[id] = { tone: 'active' };
        emit('unchoose', `Undo: pop ${nums[i]} → path = ${pyList(path)}`, { i });
        const exc = tree.add(pathLabel(path), id, `skip ${nums[i]}`);
        view[id] = { tone: 'frontier' };
        view[exc] = { tone: 'new' };
        emit('exploreExc', `Skip ${nums[i]} → path stays ${pyList(path)}`, { i, choice: 'skip' });
        view[exc] = { tone: 'active' };
        backtrack(i + 1, exc);
        if (view[exc].tone === 'active') view[exc] = { tone: 'done' };
        view[id] = { tone: 'done' };
      };
      const root = tree.add('[]');
      view[root] = { tone: 'active' };
      emit('start', `backtrack(0) with path = [] — decide on each of ${nums.length} item${nums.length === 1 ? '' : 's'} in turn`, { i: 0 });
      backtrack(0, root);
      emit('done', `All ${result.length} subsets found (2^${nums.length} = ${2 ** nums.length})`, { i: nums.length });
    };
    exec(null);
    const r = new Recorder(code);
    exec(r);
    return { frames: r.frames, result };
  },
  reference({ nums }) {
    // independent: bitmask enumeration in include-first order (first item is the most significant bit)
    const n = nums.length;
    const out: number[][] = [];
    for (let m = 2 ** n - 1; m >= 0; m--) out.push(nums.filter((_, j) => (m >> (n - 1 - j)) & 1));
    return out;
  },
};

const tests = [
  { args: [[1, 2, 3]], expected: [[], [1], [2], [3], [1, 2], [1, 3], [2, 3], [1, 2, 3]] },
  { args: [[5]], expected: [[], [5]], name: 'single item' },
  { args: [[]], expected: [[]], name: 'empty input has one subset: the empty set' },
  { args: [[1, 2]], expected: [[], [1], [2], [1, 2]] },
  { args: [[4, 7, 9, 2]], expected: [[], [4], [7], [9], [2], [4, 7], [4, 9], [4, 2], [7, 9], [7, 2], [9, 2], [4, 7, 9], [4, 7, 2], [4, 9, 2], [7, 9, 2], [4, 7, 9, 2]], name: 'four items (16 subsets)' },
];

const unit: Unit = {
  id: 'subsets',
  hook: 'Subsets is the template for every "generate all combinations" question. Learn the choose → explore → un-choose rhythm here and permutations, combination sum and N-Queens are small variations.',
  predict: {
    prompt: 'You run the include/exclude backtracking on `nums = [1, 2, 3, 4]`. How many leaf nodes (recorded subsets) does the decision tree have?',
    options: ['4', '10', '16', '24'],
    answer: 2,
    explain: 'Every item doubles the number of branches: take or skip. 2 × 2 × 2 × 2 = 16 leaves, one per subset. (24 would be the number of permutations.)',
  },
  viz,
  deeper: {
    points: [
      'Each level of the tree is one decision: take nums[i] or skip it. A root-to-leaf path is one complete set of decisions, so each leaf is exactly one subset.',
      'One shared `path` list is mutated in place: append to choose, pop to undo. The pop is what lets the second branch start from the same state the first one did.',
      'Record `path[:]` (a copy), never `path` itself. Otherwise every recorded subset is the same list object and ends up empty after backtracking.',
      'Equivalent view: `for j in range(start, n)` loops that record at every node. Same 2^n subsets, but recording happens at every node instead of only at leaves.',
    ],
    complexity: { time: 'O(n · 2^n) — 2^n subsets, each up to n items to copy', space: 'O(n) recursion depth, plus the output' },
    pitfalls: ['Appending `path` instead of `path[:]`', 'Forgetting `path.pop()`, so choices leak into the sibling branch', 'Forgetting the empty subset (the all-skip leaf)'],
  },
  practice: {
    language: 'python',
    fnName: 'subsets',
    statement: 'Return every subset of a list of distinct numbers (the order of subsets and of items inside a subset does not matter).',
    signature: 'def subsets(nums):',
    solution: `def subsets(nums):
    result = []
    path = []

    def backtrack(i):
        if i == len(nums):
            result.append(@@path[:]@@)
            return
        path.append(@@nums[i]@@)
        backtrack(@@i + 1@@)
        @@path.pop()@@
        backtrack(i + 1)

    backtrack(0)
    return result`,
    compare: 'nested',
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'subsets',
    compare: 'nested',
    statement: 'This subsets function returns the right NUMBER of results, but every subset comes back empty. Find and fix the bug.',
    buggy: `def subsets(nums):
    result = []
    path = []

    def backtrack(i):
        if i == len(nums):
            result.append(path)
            return
        path.append(nums[i])
        backtrack(i + 1)
        path.pop()
        backtrack(i + 1)

    backtrack(0)
    return result`,
    fixed: `def subsets(nums):
    result = []
    path = []

    def backtrack(i):
        if i == len(nums):
            result.append(path[:])
            return
        path.append(nums[i])
        backtrack(i + 1)
        path.pop()
        backtrack(i + 1)

    backtrack(0)
    return result`,
    tests,
    bugType: 'aliasing a mutable list',
    hint: 'How many different list objects does `result` hold? What does `path` look like once the recursion has fully unwound?',
    explanation: '`result.append(path)` stores a reference to the one shared list. Backtracking later pops everything off it, so all entries end up as the same empty list. Store a snapshot: `path[:]` (or `list(path)`).',
  },
  boss: {
    title: 'Combination sum',
    statement: 'Given a list of distinct positive integers `candidates` and a `target`, return every unique combination that sums to the target. A candidate may be used any number of times. Combinations that differ only in order count once.',
    language: 'python',
    fnName: 'combination_sum',
    compare: 'nested',
    starter: `def combination_sum(candidates, target):
    # your code here
    pass
`,
    solution: `def combination_sum(candidates, target):
    result = []
    path = []

    def backtrack(start, remaining):
        if remaining == 0:
            result.append(path[:])
            return
        for j in range(start, len(candidates)):
            c = candidates[j]
            if c > remaining:
                continue
            path.append(c)
            backtrack(j, remaining - c)
            path.pop()

    backtrack(0, target)
    return result`,
    tests: [
      { args: [[2, 3, 6, 7], 7], expected: [[2, 2, 3], [7]] },
      { args: [[2, 3, 5], 8], expected: [[2, 2, 2, 2], [2, 3, 3], [3, 5]] },
      { args: [[2], 1], expected: [], name: 'no combination' },
      { args: [[3, 5], 0], expected: [[]], name: 'target 0 → the empty combination' },
      { args: [[1], 3], expected: [[1, 1, 1]], name: 'reuse one number' },
    ],
    hints: ['Same choose → explore → un-choose rhythm as subsets. Keep a `start` index so you never go back to earlier candidates (that would create reordered duplicates).', 'Recurse with `backtrack(j, remaining - c)` — passing j, not j + 1, is what allows reuse. Record when remaining == 0 and skip candidates larger than remaining.'],
    combines: ['subsets', 'recursion-call-stack'],
  },
  quiz: [
    {
      prompt: 'Why is `path.pop()` placed between the two recursive calls?',
      options: ['To free memory', 'To undo the take so the skip branch starts with the original path', 'Python requires it', 'To sort the result'],
      answer: 1,
      explain: 'The take branch added nums[i] to the shared path. Popping it restores the state, so the skip branch sees exactly what the take branch saw.',
    },
  ],
};

export default unit;
