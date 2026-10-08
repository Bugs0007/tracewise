import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { CallTree, callTreePanel, pathLabel, pyList, type NodeView } from '@/content/lib/recursion-greedy';

const code = `
def permutations(nums):
    result = []
    path = []
    used = [False] * len(nums)

    def backtrack():
        if len(path) == len(nums):        #@leaf
            result.append(path[:])        #@record
            return
        for i in range(len(nums)):        #@loop
            if used[i]:                   #@skip
                continue
            used[i] = True                #@choose
            path.append(nums[i])
            backtrack()                   #@explore
            path.pop()                    #@unchoose
            used[i] = False

    backtrack()                           #@start
    return result                         #@done
`;

interface In {
  nums: number[];
}

const viz: VizDef<In> = {
  id: 'permutations',
  title: 'Backtracking: permutations',
  code,
  language: 'python',
  inputs: [{ key: 'nums', label: 'Distinct numbers', kind: 'numbers', default: [1, 2, 3], maxItems: 3, help: 'Up to 3 numbers — the tree has n! leaves' }],
  presets: [
    { label: 'Two items', input: { nums: [1, 2] } },
    { label: 'One item', input: { nums: [7] } },
    { label: 'Empty input', input: { nums: [] } },
  ],
  run({ nums }) {
    if (nums.length > 3) throw new Error('Use at most 3 numbers (the tree has n! leaves)');
    const tree = new CallTree();
    let result: number[][] = [];

    const exec = (r: Recorder | null) => {
      if (r) tree.replay();
      const view: Record<string, NodeView> = {};
      const path: number[] = [];
      const used = nums.map(() => false);
      result = [];
      const emit = (at: string, caption: string, vars: Record<string, unknown>, cursor?: number, newest = -1) => {
        if (!r) return;
        const tones: Record<number, Tone> = {};
        used.forEach((u, k) => {
          if (u) tones[k] = 'visited';
        });
        if (cursor !== undefined) tones[cursor] = used[cursor] ? 'error' : 'compare';
        r.step(
          at,
          caption,
          [
            callTreePanel(tree, view, { title: 'Decision tree (edge = value chosen)' }),
            { type: 'array', title: 'nums (grey = used)', values: nums, tones, pointers: cursor !== undefined ? { i: cursor } : {} },
            { type: 'array', title: 'path', values: [...path], hideIndex: true, tones: Object.fromEntries(path.map((_, k) => [k, 'active' as const])) },
            { type: 'log', title: `result (${result.length} permutations)`, lines: result.map((s, k) => ({ text: pyList(s), tone: k === newest ? ('found' as const) : ('default' as const) })) },
          ],
          { ...vars, path: pyList(path), used: used.map((u) => (u ? 'T' : 'F')).join(''), found: result.length },
        );
      };
      const backtrack = (id: string) => {
        r?.op();
        if (path.length === nums.length) {
          result.push([...path]);
          view[id] = { tone: 'found', badge: 'record' };
          emit('record', `len(path) = ${path.length} = len(nums): record a copy ${pyList(path)}`, {}, undefined, result.length - 1);
          return;
        }
        view[id] = { tone: 'active' };
        for (let i = 0; i < nums.length; i++) {
          r?.op();
          if (used[i]) {
            view[id] = { tone: 'active' };
            emit('skip', `nums[${i}] = ${nums[i]} is already in the path → skip`, { i }, i);
            continue;
          }
          used[i] = true;
          path.push(nums[i]);
          const child = tree.add(pathLabel(path), id, String(nums[i]));
          view[id] = { tone: 'frontier' };
          view[child] = { tone: 'new' };
          emit('choose', `Choose ${nums[i]}: used[${i}] = True → path = ${pyList(path)}`, { i }, i);
          view[child] = { tone: 'active' };
          backtrack(child);
          if (view[child].tone === 'active') view[child] = { tone: 'done' };
          path.pop();
          used[i] = false;
          view[id] = { tone: 'active' };
          emit('unchoose', `Un-choose ${nums[i]}: pop it, used[${i}] = False → path = ${pyList(path)}`, { i }, i);
        }
        view[id] = { tone: 'done' };
      };
      const root = tree.add('[]');
      view[root] = { tone: 'active' };
      emit('start', `backtrack() with path = [] — every item is still unused`, {});
      backtrack(root);
      emit('done', `Found ${result.length} permutations (${nums.length}! = ${result.length})`, {});
    };
    exec(null);
    const r = new Recorder(code);
    exec(r);
    return { frames: r.frames, result };
  },
  reference({ nums }) {
    // independent: decode each index k in the factorial number system (lexicographic order of positions)
    const n = nums.length;
    const fact = (m: number): number => (m <= 1 ? 1 : m * fact(m - 1));
    const out: number[][] = [];
    for (let k = 0; k < fact(n); k++) {
      const pool = [...nums];
      let m = k;
      const perm: number[] = [];
      for (let pos = 0; pos < n; pos++) {
        const f = fact(n - 1 - pos);
        perm.push(pool.splice(Math.floor(m / f), 1)[0]);
        m %= f;
      }
      out.push(perm);
    }
    return out;
  },
};

const tests = [
  { args: [[1, 2, 3]], expected: [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]] },
  { args: [[0, 1]], expected: [[0, 1], [1, 0]] },
  { args: [[1]], expected: [[1]], name: 'single item' },
  { args: [[]], expected: [[]], name: 'empty input has one permutation' },
  {
    args: [[1, 2, 3, 4]],
    expected: [[1, 2, 3, 4], [1, 2, 4, 3], [1, 3, 2, 4], [1, 3, 4, 2], [1, 4, 2, 3], [1, 4, 3, 2], [2, 1, 3, 4], [2, 1, 4, 3], [2, 3, 1, 4], [2, 3, 4, 1], [2, 4, 1, 3], [2, 4, 3, 1], [3, 1, 2, 4], [3, 1, 4, 2], [3, 2, 1, 4], [3, 2, 4, 1], [3, 4, 1, 2], [3, 4, 2, 1], [4, 1, 2, 3], [4, 1, 3, 2], [4, 2, 1, 3], [4, 2, 3, 1], [4, 3, 1, 2], [4, 3, 2, 1]],
    name: 'four items (24 permutations)',
  },
];

const unit: Unit = {
  id: 'permutations',
  hook: 'Permutations tests whether you can undo state precisely. The `used` array and the choose → explore → un-choose rhythm show up again in N-Queens, word search and Sudoku.',
  predict: {
    prompt: 'For `nums = [1, 2, 3]`, how many times is a number CHOSEN (the `used[i] = True` line runs) over the whole backtracking run?',
    options: ['6', '9', '15', '16'],
    answer: 2,
    explain: 'The tree has 3 nodes at depth 1, 6 at depth 2 and 6 at depth 3 (the leaves). Every non-root node is one choice: 3 + 6 + 6 = 15. Only 6 of those complete a permutation.',
  },
  viz,
  deeper: {
    points: [
      'Unlike subsets, every level may pick any unused item. The `used` array (or a set) marks what is already in `path`, so each item appears once.',
      'Choose, explore, un-choose: `used[i] = True` + `append`, recurse, then `pop` + `used[i] = False`. Undo EVERY piece of state you changed, in the same call that changed it.',
      'The branching factor shrinks by one per level (n, n-1, ..., 1), giving n! leaves. That is why n = 10 is already 3.6 million permutations.',
      'An alternative is swapping elements in place (swap i with start, recurse, swap back). It avoids the `used` array but changes the output order.',
    ],
    complexity: { time: 'O(n · n!) — n! permutations, each copied in O(n)', space: 'O(n) recursion depth and used array, plus the output' },
    pitfalls: ['Forgetting `used[i] = False` after the recursive call (later branches see items as taken)', 'Appending `path` instead of `path[:]`', 'Duplicates in the input produce duplicate permutations unless you sort and skip repeats'],
  },
  practice: {
    language: 'python',
    fnName: 'permutations',
    statement: 'Return all permutations of a list of distinct numbers (any order of the permutations is fine; the order inside each permutation matters).',
    signature: 'def permutations(nums):',
    solution: `def permutations(nums):
    result = []
    path = []
    used = [False] * len(nums)

    def backtrack():
        if @@len(path) == len(nums)@@:
            result.append(@@path[:]@@)
            return
        for i in range(len(nums)):
            if @@used[i]@@:
                continue
            @@used[i] = True@@
            path.append(nums[i])
            backtrack()
            @@path.pop()@@
            @@used[i] = False@@

    backtrack()
    return result`,
    compare: 'unordered',
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'permutations',
    compare: 'unordered',
    statement: 'This function finds only the first permutation (or a few) and then stops producing results. Find and fix the bug.',
    buggy: `def permutations(nums):
    result = []
    path = []
    used = [False] * len(nums)

    def backtrack():
        if len(path) == len(nums):
            result.append(path[:])
            return
        for i in range(len(nums)):
            if used[i]:
                continue
            used[i] = True
            path.append(nums[i])
            backtrack()
            path.pop()

    backtrack()
    return result`,
    fixed: `def permutations(nums):
    result = []
    path = []
    used = [False] * len(nums)

    def backtrack():
        if len(path) == len(nums):
            result.append(path[:])
            return
        for i in range(len(nums)):
            if used[i]:
                continue
            used[i] = True
            path.append(nums[i])
            backtrack()
            path.pop()
            used[i] = False

    backtrack()
    return result`,
    tests,
    bugType: 'forgot to un-choose',
    hint: 'After backtracking from the first permutation, which entries of `used` are still True?',
    explanation: '`used[i]` is set to True when choosing but never reset. After the first branch unwinds, `path` is empty again but every item still looks "used", so no other branch can pick anything. Reset `used[i] = False` right after `path.pop()`.',
  },
  boss: {
    title: 'Distinct permutations',
    statement: 'The input list may contain repeated numbers. Return every DISTINCT permutation (no two results are identical lists). The result order does not matter.',
    language: 'python',
    fnName: 'permute_unique',
    compare: 'unordered',
    starter: `def permute_unique(nums):
    # your code here
    pass
`,
    solution: `def permute_unique(nums):
    nums = sorted(nums)
    result = []
    path = []
    used = [False] * len(nums)

    def backtrack():
        if len(path) == len(nums):
            result.append(path[:])
            return
        for i in range(len(nums)):
            if used[i]:
                continue
            if i > 0 and nums[i] == nums[i - 1] and not used[i - 1]:
                continue
            used[i] = True
            path.append(nums[i])
            backtrack()
            path.pop()
            used[i] = False

    backtrack()
    return result`,
    tests: [
      { args: [[1, 1, 2]], expected: [[1, 1, 2], [1, 2, 1], [2, 1, 1]] },
      { args: [[1, 2, 3]], expected: [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]] },
      { args: [[2, 2]], expected: [[2, 2]], name: 'all equal' },
      { args: [[]], expected: [[]], name: 'empty' },
      { args: [[2, 1, 2, 1]], expected: [[1, 1, 2, 2], [1, 2, 1, 2], [1, 2, 2, 1], [2, 1, 1, 2], [2, 1, 2, 1], [2, 2, 1, 1]], name: 'two pairs, unsorted' },
    ],
    hints: ['Sort first so equal numbers sit next to each other. Duplicate permutations come from choosing equal values in a different order at the same level.', 'At a given level, skip nums[i] when it equals nums[i-1] and nums[i-1] is NOT used (it was just un-chosen at this level, so choosing nums[i] now repeats that branch).'],
    combines: ['permutations', 'subsets'],
  },
  quiz: [
    {
      prompt: 'Which pair of lines must stay together (undo what the choose step did)?',
      options: ['`used[i] = True` and `result.append(...)`', '`path.append(x)` / `used[i] = True` and `path.pop()` / `used[i] = False`', '`for i in range(...)` and `return`', 'Only `path.pop()`'],
      answer: 1,
      explain: 'Everything modified before the recursive call (path and used) must be restored right after it, or later branches start from corrupted state.',
    },
  ],
};

export default unit;
