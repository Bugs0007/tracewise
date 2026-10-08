import { Recorder } from '@/engine/recorder';
import { nTreePanel, type NTreeNode } from '@/engine/layout';
import type { KVPanel, Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { assertIntList, dpGrid, tk, type Arrow, type DpCell } from '@/content/lib/dp';

const code = `
def min_cost_top_down(cost):
    n = len(cost)
    memo = {}                                                   #@tdInit
    def f(i):                                                   #@tdCall
        if i <= 1:                                              #@tdBase
            return 0
        if i in memo:                                           #@tdHit
            return memo[i]
        memo[i] = min(f(i - 1) + cost[i - 1], f(i - 2) + cost[i - 2])   #@tdSet
        return memo[i]
    return f(n)

def min_cost_bottom_up(cost):
    n = len(cost)
    dp = [0] * (n + 1)                                          #@buInit
    for i in range(2, n + 1):                                   #@buLoop
        dp[i] = min(dp[i - 1] + cost[i - 1], dp[i - 2] + cost[i - 2])   #@buSet
    return dp[n]                                                #@buDone
`;

interface In {
  cost: number[];
}

const viz: VizDef<In> = {
  id: 'dp-topdown-bottomup',
  title: 'Top-down vs bottom-up (min-cost stairs)',
  code,
  language: 'python',
  inputs: [{ key: 'cost', label: 'Cost to leave each step', kind: 'numbers', default: [1, 100, 1, 1, 1], maxItems: 7, help: 'Whole numbers 0..100. You start on step 0 or 1 and want to reach the top (step n).' }],
  presets: [
    { label: 'Skip the 100', input: { cost: [1, 100, 1, 1, 1] } },
    { label: 'Two steps', input: { cost: [10, 15] } },
    { label: 'Longer (6)', input: { cost: [10, 15, 20, 5, 5, 30] } },
    { label: 'Empty', input: { cost: [] } },
  ],
  run({ cost }) {
    assertIntList('Cost', cost, { max: 7, lo: 0, hi: 100 });
    const r = new Recorder(code);
    const n = cost.length;
    const nodes: Record<string, NTreeNode> = {};
    let root = '';
    let uid = 0;
    const memo = new Map<number, number>();
    const memoNew = new Set<number>();
    let calls = 0;
    let computed = 0;
    let buCells = 0;
    let hits = 0;
    const dp: (number | null)[] = Array(n + 1).fill(null);
    let phase: 'td' | 'bu' = 'td';

    const treePanel = (): Panel =>
      root
        ? nTreePanel(nodes, root, { title: phase === 'td' ? 'Top-down: call tree' : 'Top-down: call tree (finished)', gapX: 56 })
        : { type: 'note', text: 'Top-down: no calls yet. The first call will be f(n).' };
    const memoPanel = (): KVPanel => ({
      type: 'kv',
      title: 'Top-down memo',
      entries: [...memo.entries()].map(([k, v]) => ({ k: `memo[${k}]`, v, tone: memoNew.has(k) ? ('new' as Tone) : undefined })),
    });
    const tablePanel = (cur?: number, deps: number[] = []) => {
      const tones: Record<string, Tone> = {};
      dp.forEach((v, i) => v !== null && (tones[tk(1, i)] = 'done'));
      let arrows: Arrow[] = [];
      if (cur !== undefined) {
        for (const d of deps) {
          tones[tk(1, d)] = 'compare';
          tones[tk(0, d)] = 'compare';
        }
        tones[tk(1, cur)] = 'active';
        arrows = deps.flatMap((d) => [
          { from: [1, d] as [number, number], to: [1, cur] as [number, number] },
          { from: [0, d] as [number, number], to: [1, cur] as [number, number] },
        ]);
      }
      return dpGrid([[...cost, '·'], dp as DpCell[]], {
        title: phase === 'td' ? 'Bottom-up table (waits for phase 2)' : 'Bottom-up table: $ = cost, dp[i] = cheapest way to stand on step i',
        tones,
        arrows,
        rowLabels: ['$', 'dp'],
        colLabels: dp.map((_, i) => String(i)),
      });
    };
    const vars = (extra: Record<string, unknown> = {}) => ({ 'top-down calls': calls, 'top-down recurrences': computed, 'bottom-up cells': buCells, ...extra });
    const emit = (at: string, caption: string, extra: Record<string, unknown> = {}, cur?: number, deps: number[] = []) => r.step(at, caption, [treePanel(), memoPanel(), tablePanel(cur, deps)], vars(extra));

    // ── Phase 1: top-down with memo ──
    emit('tdInit', `Phase 1, top-down: start with an empty memo and ask for f(${n}), the top`, { n });
    const call = (i: number, parent?: string): number => {
      const id = `c${uid++}`;
      nodes[id] = { id, label: `f(${i})`, children: [], tone: 'active' };
      if (parent) {
        nodes[parent].children.push(id);
        nodes[parent].tone = 'frontier';
      } else root = id;
      calls++;
      r.op();
      memoNew.clear();
      const finish = (value: number, tone: Tone, badge: string) => {
        nodes[id].tone = tone;
        nodes[id].badge = badge;
        if (parent) nodes[parent].tone = 'active';
        return value;
      };
      if (i <= 1) {
        nodes[id].badge = '=0';
        nodes[id].tone = 'done';
        emit('tdBase', `f(${i}) is a base case: you can start on step ${i} for free → 0`, { i });
        return finish(0, 'done', '=0');
      }
      if (memo.has(i)) {
        hits++;
        nodes[id].tone = 'found';
        nodes[id].badge = 'cached';
        emit('tdHit', `memo[${i}] = ${memo.get(i)} already known → return at once, no new calls`, { i });
        return finish(memo.get(i)!, 'found', 'cached');
      }
      emit('tdCall', `f(${i}) is not cached → it needs f(${i - 1}) and f(${i - 2})`, { i });
      const a = call(i - 1, id) + cost[i - 1];
      nodes[id].tone = 'active';
      const b = call(i - 2, id) + cost[i - 2];
      const v = Math.min(a, b);
      memo.set(i, v);
      computed++;
      memoNew.add(i);
      nodes[id].tone = 'done';
      nodes[id].badge = `=${v}`;
      emit('tdSet', `memo[${i}] = min(${a - cost[i - 1]}+${cost[i - 1]}, ${b - cost[i - 2]}+${cost[i - 2]}) = ${v}`, { i });
      memoNew.clear();
      return finish(v, 'done', `=${v}`);
    };
    const topDown = call(n);

    // ── Phase 2: bottom-up table ──
    phase = 'bu';
    dp[0] = 0;
    if (n >= 1) dp[1] = 0;
    emit('buInit', `Phase 2, bottom-up: dp[0] = dp[1] = 0, then fill left to right, no recursion at all`, { n });
    for (let i = 2; i <= n; i++) {
      const viaPrev = dp[i - 1]! + cost[i - 1];
      const viaPrev2 = dp[i - 2]! + cost[i - 2];
      dp[i] = Math.min(viaPrev, viaPrev2);
      buCells++;
      r.op();
      emit('buSet', `dp[${i}] = min(${dp[i - 1]}+${cost[i - 1]}, ${dp[i - 2]}+${cost[i - 2]}) = ${dp[i]}`, { i }, i, [i - 1, i - 2]);
    }
    const bottomUp = dp[n]!;
    r.step(
      'buDone',
      `Same answer ${bottomUp}. Top-down: ${calls} calls for ${computed} computed cells; bottom-up: ${buCells} cells, 0 calls`,
      [
        treePanel(),
        memoPanel(),
        tablePanel(),
        { type: 'note', tone: 'found', text: `Top-down: ${calls} calls (${computed} computed, ${hits} cache hits, ${calls - computed - hits} base cases). Bottom-up: ${buCells} cells computed, no call stack. Same table, different order.` },
      ],
      vars({ result: bottomUp }),
    );
    if (topDown !== bottomUp) throw new Error('Top-down and bottom-up disagree');
    return { frames: r.frames, result: bottomUp };
  },
  reference({ cost }) {
    let a = 0;
    let b = 0;
    for (let i = 2; i <= cost.length; i++) [a, b] = [b, Math.min(b + cost[i - 1], a + cost[i - 2])];
    return cost.length < 2 ? 0 : b;
  },
};

const tests = [
  { args: [[10, 15, 20]], expected: 15 },
  { args: [[1, 100, 1, 1, 1, 100, 1, 1, 100, 1]], expected: 6 },
  { args: [[5, 5]], expected: 5, name: 'two steps' },
  { args: [[0, 0]], expected: 0, name: 'free steps' },
  { args: [[1, 100, 1, 1, 1]], expected: 3 },
  { args: [[3, 2]], expected: 2 },
  { args: [[10, 15, 20, 5, 5, 30]], expected: 25 },
];

const unit: Unit = {
  id: 'dp-topdown-bottomup',
  hook: 'Every DP problem can be written two ways: recursion plus a cache, or a table filled in order. Interviewers ask you to switch between them to check you see that both compute the same subproblems.',
  predict: {
    prompt: 'For n = 5 stairs, top-down with a memo and bottom-up both evaluate the recurrence min(...) for steps 2..5. How do the numbers of recurrence evaluations compare?',
    options: ['Top-down does fewer', 'Bottom-up does fewer', 'Both do exactly 4', 'Top-down does about twice as many'],
    answer: 2,
    explain: 'Each state is computed once in either style: steps 2, 3, 4, 5 = 4 evaluations. Top-down additionally pays for extra calls (cache hits and base cases) and recursion depth, but never recomputes a state.',
  },
  viz,
  deeper: {
    points: [
      'Top-down = recursion + memo. Write the recurrence naturally, add a cache check at the top. Only states reachable from the answer are computed.',
      'Bottom-up = table. Fill states in an order where dependencies are already done (here: increasing i). No call overhead, no recursion-depth limit.',
      'Both use the same state (`f(i)` / `dp[i]`), the same recurrence and the same base cases, so converting is mechanical: base cases become initial cells, the recursive calls become table reads.',
      'Without the memo the recursion recomputes subproblems and is exponential; the memo (or table) makes it linear here.',
      'Bottom-up allows space optimisation (keep only the last two cells). Top-down is easier when the valid order of states is awkward.',
    ],
    complexity: { time: 'O(n) for both', space: 'O(n) memo + call stack, or O(n) table (O(1) with rolling variables)' },
    pitfalls: ['Forgetting to store the result in the memo (the code is correct but exponential)', 'Base cases that do not cover every call (infinite recursion)', 'Python recursion limit for large n in top-down'],
  },
  practice: {
    language: 'python',
    fnName: 'min_cost',
    statement: 'Step i costs cost[i] to leave, and you can climb one or two steps at a time. You may start on step 0 or step 1; the top is step len(cost). Return the cheapest total cost to reach the top. Write it top-down with a memo.',
    signature: 'def min_cost(cost):',
    solution: `def min_cost(cost):
    n = len(cost)
    memo = {}

    def f(i):
        if i <= 1:
            return @@0@@
        if @@i in memo@@:
            return memo[i]
        memo[i] = @@min(f(i - 1) + cost[i - 1], f(i - 2) + cost[i - 2])@@
        return memo[i]

    return @@f(n)@@`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'min_cost',
    statement: 'This memoised solution crashes on every input with at least two steps. Find the bug.',
    buggy: `def min_cost(cost):
    n = len(cost)
    memo = {}

    def f(i):
        if i == 0:
            return 0
        if i in memo:
            return memo[i]
        memo[i] = min(f(i - 1) + cost[i - 1], f(i - 2) + cost[i - 2])
        return memo[i]

    return f(n)`,
    fixed: `def min_cost(cost):
    n = len(cost)
    memo = {}

    def f(i):
        if i <= 1:
            return 0
        if i in memo:
            return memo[i]
        memo[i] = min(f(i - 1) + cost[i - 1], f(i - 2) + cost[i - 2])
        return memo[i]

    return f(n)`,
    tests,
    bugType: 'incomplete base case',
    hint: 'f(2) calls f(1) and f(0). What does f(1) call, and does anything stop it?',
    explanation: 'The recurrence looks two steps back, so it needs two base cases (0 and 1). With only i == 0 as a base case, f(1) calls f(0) and f(-1), and f(-1) keeps going down forever until Python raises a RecursionError. Use `i <= 1`.',
  },
  boss: {
    title: 'Word Break',
    statement: 'Given a string `s` and a list of words `words` (each word can be reused any number of times), return True if `s` can be split into a sequence of words from the list, otherwise False. Example: "applepenapple" with ["apple", "pen"] is True. The empty string counts as True.',
    language: 'python',
    fnName: 'word_break',
    starter: `def word_break(s, words):
    # your code here
    pass
`,
    solution: `def word_break(s, words):
    ws = set(words)
    n = len(s)
    dp = [False] * (n + 1)
    dp[0] = True
    for i in range(1, n + 1):
        for j in range(i):
            if dp[j] and s[j:i] in ws:
                dp[i] = True
                break
    return dp[n]`,
    tests: [
      { args: ['leetcode', ['leet', 'code']], expected: true },
      { args: ['applepenapple', ['apple', 'pen']], expected: true, name: 'word reused' },
      { args: ['catsandog', ['cats', 'dog', 'sand', 'and', 'cat']], expected: false },
      { args: ['', ['a']], expected: true, name: 'empty string' },
      { args: ['a', ['b']], expected: false },
      { args: ['aaaaaaa', ['aaaa', 'aaa']], expected: true },
    ],
    hints: ['State: can the first i characters be split into words? The answer for i depends on shorter prefixes.', 'dp[0] = True. dp[i] is True if some j < i has dp[j] True and s[j:i] is a word. Works top-down (memo on the start index) or bottom-up.'],
    combines: ['dp-topdown-bottomup', 'memoization', 'dp-climbing-stairs'],
  },
  quiz: [
    {
      prompt: 'Which statement about converting top-down DP to bottom-up is true?',
      options: ['The recurrence must change', 'Base cases become initial table cells and recursive calls become table reads', 'Bottom-up needs a different state definition', 'Bottom-up always uses less time'],
      answer: 1,
      explain: 'The state and recurrence are identical. You just choose the order yourself instead of letting recursion discover it.',
    },
  ],
};

export default unit;
