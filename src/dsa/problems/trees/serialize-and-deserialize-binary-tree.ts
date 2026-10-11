import { btNode } from '@/engine/layout';
import type { Tone } from '@/engine/types';
import { chipsView, hashMapView } from '@/dsa/viz/prims';
import { levelOf, levelProblem, treeOf, treePanel, type BTNode, type Level } from '@/dsa/viz/tree';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './serialize-and-deserialize-binary-tree.py?raw';
import harness from './serialize-and-deserialize-binary-tree.harness.py?raw';
import cases from './serialize-and-deserialize-binary-tree.cases.json';

const viz = vizOf<{ level: Level }>({
  id: 'serialize-and-deserialize-binary-tree',
  title: 'Serialize and Deserialize Binary Tree',
  solution,
  inputs: [{ key: 'level', label: 'tree (level order, null = missing)', kind: 'numbers', default: [1, 2, 3, null, null, 4, 5], maxItems: 9 }],
  presets: [
    { label: 'Mixed', input: { level: [1, 2, 3, null, null, 4, 5] } },
    { label: 'Left chain', input: { level: [3, 2, null, 1] } },
    { label: 'Single node', input: { level: [7] } },
    { label: 'Empty', input: { level: [] } },
  ],
  validate: ({ level }) => levelProblem(level),
  run({ level }) {
    const r = new TraceRecorder(solution);
    const root = treeOf(level);
    const tonesA: Record<string, Tone> = {};
    const tonesB: Record<string, Tone> = {};
    const out: string[] = [];
    let tokens: string[] = [];
    let at = -1;
    let rebuilt: BTNode | null = null;
    let phase: 'serialize' | 'deserialize' = 'serialize';
    let askedNone = false;
    let askedOrder = false;
    let askedNext = false;
    const view = () =>
      phase === 'serialize'
        ? [treePanel(root, { title: 'tree being written (preorder)', tones: tonesA }), chipsView(out, { title: 'tokens written so far', startLabel: 'first', endLabel: 'last' })]
        : [
            chipsView(tokens, { title: 'tokens being read', tones: Object.fromEntries(tokens.map((_, i) => [i, i < at ? ('done' as Tone) : i === at ? ('active' as Tone) : ('frontier' as Tone)])) }),
            treePanel(rebuilt, { title: 'tree rebuilt so far', tones: tonesB }),
          ];
    r.step('sInit', 'serialize: out collects one token per node, with "#" for a missing child.', view(), {});
    const walk = (node: BTNode | null) => {
      r.op();
      if (!node) {
        if (!askedNone) {
          askedNone = true;
          r.predict('none', 'A missing child is reached. Why do we still write a "#" for it?', ['It marks where this branch ends so the shape can be rebuilt', 'It is only decoration', 'To make the string shorter'], 0, 'Without the markers, the same list of values could belong to many different trees.');
        }
        out.push('#');
        r.step('sNone', 'No node here: write "#".', view(), {});
        return;
      }
      tonesA[node.id] = 'active';
      out.push(String(node.val));
      r.step('sVal', `Write ${node.val} before its subtrees (preorder).`, view(), { node: node.val });
      if (!askedOrder && node.left && node.right) {
        askedOrder = true;
        r.predict('order', `After writing ${node.val}, what is written next?`, [`The whole left subtree (starting with ${node.left.val}), then the right`, `The right subtree first`, `The parent again`], 0, 'Preorder is node, then left subtree completely, then right subtree.');
      }
      walk(node.left);
      walk(node.right);
      tonesA[node.id] = 'done';
    };
    walk(root);
    const data = out.join(',');
    r.step('sJoin', `Join the tokens with commas: "${data}".`, [...view(), hashMapView({ data }, { title: 'serialized string' })], { data });
    phase = 'deserialize';
    tokens = data.split(',');
    at = 0;
    r.step('dInit', 'deserialize: split the string back into tokens and read them in order.', view(), {});
    const build = (parent: BTNode | null, side: 'left' | 'right' | null): BTNode | null => {
      r.op();
      const idx = at;
      const tok = tokens[at++];
      r.step('dNext', `Read token "${tok}".`, view(), { token: tok });
      if (tok === '#') {
        r.step('dNone', 'It is "#": this child is missing. Return None.', view(), {});
        return null;
      }
      const node = btNode(Number(tok));
      if (parent && side) parent[side] = node;
      else rebuilt = node;
      tonesB[node.id] = 'active';
      if (!askedNext) {
        askedNext = true;
        r.predict('next', `We built ${tok}. The next token ("${tokens[idx + 1]}") belongs to which part?`, ['Its left child (left is built first)', 'Its right child', 'The root again'], 0, 'The same preorder order is replayed: left subtree first, so the next token is for the left child.');
      }
      r.step('dMake', `Make a node ${tok}. Its left subtree is read next, then its right subtree.`, view(), { node: Number(tok) });
      build(node, 'left');
      build(node, 'right');
      tonesB[node.id] = 'done';
      r.step('dRet', `Node ${tok} has both children. Return it.`, view(), {});
      return node;
    };
    build(null, null);
    const res = levelOf(rebuilt);
    at = tokens.length;
    r.step('dStart', `Every token was used. The rebuilt tree in level order is ${JSON.stringify(res)}.`, view(), { result: JSON.stringify(res) });
    return { frames: r.frames, result: res };
  },
  reference({ level }) {
    return levelOf(treeOf(level));
  },
});

export default problem({
  summary: 'Design two functions: one that turns a binary tree into a string, and one that turns that string back into the same tree. You choose the text format; it only has to round-trip.',
  example: ['tree 4 with a left child 7 and no right child', 'for example "4,7,#,#,#" (preorder, # = missing child)', 'Reading that string back produces exactly the original tree.'],
  pattern: ['dfs', ['dfs', 'bfs', 'design', 'hash-lookup'], 'Write the nodes in preorder and mark missing children with a symbol. Reading the tokens back in the same order lets a recursive builder reconstruct the exact shape.', {
    bfs: 'A level-order encoding also works (it is how many platforms show trees), but needs care with trailing nulls.',
    design: 'You are designing a format, but the technique underneath is DFS in both directions.',
    'hash-lookup': 'No lookups are needed: the order of the tokens carries the structure.',
  }],
  hints: [
    'Why is a list of values alone not enough to rebuild a tree?',
    'What if you also record where children are missing?',
    'Serialize in preorder with "#" for None. Deserialize with an iterator: read a token; if it is "#" return None, else create a node and recurse for left then right.',
  ],
  insight: 'Preorder plus explicit null markers is a complete description: the reader replays the same traversal.',
  brute: 'Store every node’s parent and side in text: heavier, same O(n).',
  optimal: 'Preorder with null markers: O(n) time and space each way.',
  walk: ['serialize: walk the tree in preorder; append "#" for None and the value otherwise; join with commas.', 'deserialize: split on commas and consume tokens through an iterator.', 'build(): read one token; "#" → None; otherwise make a node and set node.left = build(), node.right = build().', 'The reads happen in the same order as the writes, so the shapes match.'],
  edge: ['Empty tree.', 'Single node.', 'Negative values (the separator must not clash with minus signs).', 'Long chains (deep recursion).'],
  works: ['Serialization is injective because the null markers make every token sequence a unique pre-order description.', 'Deserialization consumes exactly the tokens that serialization produced for each subtree.'],
  time: ['O(n)', 'Each node and each null marker is handled once, in both directions.'],
  space: ['O(n)', 'The string, plus recursion depth.'],
  solution,
  cases,
  sig: 'class Codec:\n    # TreeNode(val, left, right) is provided\n    def serialize(self, root):\n        # return a string\n        pass\n\n    def deserialize(self, data):\n        # return the root of the tree\n        pass\n',
  harness,
  viz,
  fromArgs: ([level]) => ({ level }),
});
