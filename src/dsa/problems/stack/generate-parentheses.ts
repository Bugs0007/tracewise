import type { NTreeNode } from '@/engine/layout';
import type { Tone } from '@/engine/types';
import { chipsView, recursionTree } from '@/dsa/viz/prims';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './generate-parentheses.py?raw';
import cases from './generate-parentheses.cases.json';

const viz = vizOf<{ n: number }>({
  id: 'generate-parentheses',
  title: 'Generate Parentheses',
  solution,
  inputs: [{ key: 'n', label: 'n (pairs)', kind: 'number', default: 3 }],
  presets: [
    { label: 'n = 2', input: { n: 2 } },
    { label: 'n = 3', input: { n: 3 } },
    { label: 'n = 4', input: { n: 4 } },
  ],
  validate: ({ n }) => (!Number.isInteger(n) || n < 1 || n > 4 ? 'Use a whole number from 1 to 4 so the tree stays readable' : null),
  run({ n }) {
    const r = new TraceRecorder(solution);
    const nodes: Record<string, NTreeNode> = { r: { id: 'r', label: '·', children: [], tone: 'active' } };
    const edgeLabels: Record<string, string> = {};
    const res: string[] = [];
    const view = () => [
      recursionTree(nodes, 'r', { title: `choices so far (n = ${n}): each branch adds ( or )`, edgeLabels }),
      chipsView(res, { title: 'finished strings', emptyText: 'none yet', tones: Object.fromEntries(res.map((_, i) => [i, 'found' as Tone])) }),
    ];
    const label = (cur: string) => (cur === '' ? '·' : cur.length > 6 ? `…${cur.slice(-5)}` : cur);
    let asked = new Set<string>();
    r.step('init', `Build every well-formed string of ${n} pair${n === 1 ? '' : 's'}, one character at a time.`, view(), { n });
    const build = (cur: string, opened: number, closed: number, id: string) => {
      if (nodes[id]) nodes[id].tone = 'active';
      const complete = cur.length === 2 * n;
      if (!r.full) {
        r.step('base', `build("${cur}", opened = ${opened}, closed = ${closed})${complete ? ': complete' : ''}`, view(), { cur: cur || '""', opened, closed });
        const canOpen = opened < n;
        const canClose = closed < opened;
        const kind = complete ? 'done' : canOpen && canClose ? 'both' : canOpen ? 'open' : 'close';
        if (!asked.has(kind)) {
          asked.add(kind);
          r.predict(kind, `At "${cur}" (opened ${opened}, closed ${closed}, n = ${n}), which characters may come next?`, ['Only "(" (nothing is open to close)', 'Only ")" (all n openers are used)', 'Either "(" or ")"', 'Nothing: the string is complete'], kind === 'open' ? 0 : kind === 'close' ? 1 : kind === 'both' ? 2 : 3, '"(" is allowed while fewer than n have been opened; ")" is allowed while there are more openers than closers.');
        }
      }
      if (complete) {
        res.push(cur);
        if (nodes[id]) nodes[id].tone = 'done';
        if (!r.full) r.step('add', `"${cur}" is complete and balanced: add it to the results.`, view(), { found: res.length });
        return;
      }
      if (opened < n) {
        const cid = id + '(';
        nodes[cid] = { id: cid, label: label(cur + '('), children: [] };
        nodes[id].children.push(cid);
        edgeLabels[`${id}>${cid}`] = '(';
        if (!r.full) r.step('open', `opened (${opened}) < n (${n}): add "(".`, view(), { opened });
        build(cur + '(', opened + 1, closed, cid);
      }
      if (closed < opened) {
        const cid = id + ')';
        nodes[cid] = { id: cid, label: label(cur + ')'), children: [] };
        nodes[id].children.push(cid);
        edgeLabels[`${id}>${cid}`] = ')';
        if (!r.full) r.step('close', `closed (${closed}) < opened (${opened}): add ")".`, view(), { closed });
        build(cur + ')', opened, closed + 1, cid);
      }
      if (nodes[id] && nodes[id].tone !== 'done') nodes[id].tone = 'visited';
    };
    build('', 0, 0, 'r');
    r.step('done', `All ${res.length} well-formed strings found.`, view(), { count: res.length });
    return { frames: r.frames, result: res };
  },
  reference({ n }) {
    const out: string[] = [];
    const go = (s: string, bal: number, total: number) => {
      if (s.length === 2 * n) return bal === 0 && out.push(s);
      go(s + '(', bal + 1, total);
      if (bal > 0) go(s + ')', bal - 1, total);
    };
    go('', 0, 0);
    return out;
  },
});

export default problem({
  summary: 'Given a number n, produce every string made of n pairs of round brackets that is correctly balanced (every ")" matches an earlier "(" and nothing is left open).',
  example: ['n = 2', '["(())", "()()"]', 'Only these two use two pairs and stay balanced. "())(" has the right counts but closes before it opens.'],
  pattern: ['backtracking', ['backtracking', 'stack', 'dp-1d', 'dfs'], 'Build the string one character at a time, only taking choices that keep it valid, and return to try the other choice. That choose-explore-undo loop is backtracking.', {
    stack: 'Valid Parentheses uses a stack to check a finished string. Here you are generating strings, which is a search problem.',
    'dp-1d': 'A DP over closed-form splits exists, but backtracking is the direct approach interviewers expect.',
    dfs: 'Backtracking is a depth-first search of the decision tree; the pruning rules are what you must state.',
  }],
  hints: [
    'There are 2^(2n) strings of n pairs of brackets, most of them invalid. How can you avoid building the invalid ones?',
    'When is it still legal to add "("? When is it legal to add ")"? Think about counts.',
    'Add "(" while fewer than n have been used. Add ")" only while more "(" than ")" have been placed. Recurse; when the length is 2n, record the string.',
  ],
  insight: 'Add "(" if you have any left; add ")" only if it closes something already open. Every string you finish is valid.',
  brute: 'Generate all 2^(2n) strings and filter the balanced ones.',
  optimal: 'Backtracking with two counters: it only ever builds valid prefixes, so the work is proportional to the output (the Catalan number).',
  walk: ['Keep the current string and counts of opened and closed brackets.', 'If the string has length 2n, add it to the results and return.', 'If opened < n, recurse with an extra "(".', 'If closed < opened, recurse with an extra ")". Both calls can happen; the recursion explores every valid ordering.'],
  edge: ['n = 1: just "()".', 'Larger n produces Catalan-many strings, so keep n small when running it.', 'Both choices are available at most nodes in the middle of the tree.', 'The very first character is always "(".'],
  works: ['The two conditions guarantee the invariant closed ≤ opened ≤ n for every prefix, which is exactly the definition of a valid prefix.', 'Every valid string is built by exactly one path of choices, so none are missed and none are duplicated.'],
  time: ['O(4ⁿ / √n)', 'The number of valid strings is the nth Catalan number, and each takes O(n) to build.'],
  space: ['O(n)', 'Recursion depth is 2n (not counting the output).'],
  solution,
  cases,
  sig: 'def generate_parenthesis(n):\n    # every well-formed string of n pairs of round brackets\n    pass\n',
  viz,
  fromArgs: ([n]) => ({ n }),
});
