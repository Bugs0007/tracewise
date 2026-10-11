import type { Tone } from '@/engine/types';
import { chipsView, trieView } from '@/dsa/viz/prims';
import { trieInsert, trieRoot, trieWalk } from '@/dsa/viz/trie';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './implement-trie-prefix-tree.py?raw';
import harness from './implement-trie-prefix-tree.harness.py?raw';
import cases from './implement-trie-prefix-tree.cases.json';

const OPS = ['insert', 'search', 'starts_with'];
const parse = (line: string): { op: string; word: string } => {
  const [op, word = ''] = line.trim().split(/\s+/);
  return { op, word };
};

const viz = vizOf<{ ops: string[] }>({
  id: 'implement-trie-prefix-tree',
  title: 'Implement Trie',
  solution,
  inputs: [{ key: 'ops', label: 'operations: insert w / search w / starts_with w (lowercase words)', kind: 'strings', default: ['insert apple', 'insert apply', 'search app', 'starts_with app', 'search apple'], maxItems: 12 }],
  presets: [
    { label: 'Prefix vs word', input: { ops: ['insert apple', 'insert apply', 'search app', 'starts_with app', 'search apple'] } },
    { label: 'Word and its prefix', input: { ops: ['insert app', 'insert apple', 'search app', 'search apples'] } },
    { label: 'Diverging words', input: { ops: ['insert car', 'insert cat', 'starts_with ca', 'search ca', 'search cap'] } },
    { label: 'Empty trie', input: { ops: ['search a', 'starts_with a'] } },
  ],
  validate: ({ ops }) => {
    for (const line of ops) {
      const { op, word } = parse(line);
      if (!OPS.includes(op)) return `Unknown operation "${op}". Use insert, search or starts_with`;
      if (!/^[a-z]+$/.test(word)) return `"${op}" needs a lowercase word, like "${op} apple"`;
    }
    return null;
  },
  run({ ops }) {
    const r = new TraceRecorder(solution);
    const root = trieRoot();
    const words: string[] = [];
    const out: (boolean | null)[] = [null];
    let askedNew = false;
    let askedEnd = false;
    let askedPrefix = false;
    const view = (o: { walk?: string; tone?: Tone; failedAt?: number; partial?: string } = {}) => [
      trieView(words, { title: 'trie (a ✓ "end" badge marks a stored word)', walk: o.walk, walkTone: o.tone, failedAt: o.failedAt, partial: o.partial }),
      chipsView(out.map((x) => (x === null ? 'None' : x ? 'True' : 'False')), { title: 'results of each call', tones: Object.fromEntries(out.map((x, i) => [i, x === null ? 'default' : x ? 'found' : 'compare'])) as Record<number, Tone> }),
    ];
    r.step('init', 'The trie starts as a single empty root. Each node will be a dict mapping a letter to the next node.', view(), {});
    for (const line of ops) {
      const { op, word } = parse(line);
      r.op();
      if (op === 'insert') {
        const made = [...word].filter((_, i) => trieWalk(root, word.slice(0, i + 1)) === null).length;
        if (!askedNew && words.length && made < word.length) {
          askedNew = true;
          r.predictChoice('new', `The trie already stores ${words.join(', ')}. Inserting "${word}" creates how many new nodes?`, String(made), [String(word.length), String(made + 1), String(made === 0 ? 2 : 0)], word.length, 'Letters that already have a node are reused; only the letters after the shared prefix get new nodes.');
        }
        r.step('iStart', `insert("${word}"): start at the root and add one letter at a time.`, view({ walk: '' }), { word });
        for (let i = 1; i <= word.length; i++) {
          const prefix = word.slice(0, i);
          const existed = trieWalk(root, prefix) !== null;
          r.step('iStep', existed ? `"${word[i - 1]}" already has a node under "${prefix.slice(0, -1)}": reuse it.` : `No node for "${word[i - 1]}" under "${prefix.slice(0, -1)}": create one.`, view({ walk: prefix, tone: 'active', partial: prefix }), { letter: word[i - 1] });
        }
        trieInsert(root, word);
        if (!words.includes(word)) words.push(word);
        out.push(null);
        r.step('iEnd', `Mark the last node as the end of a word ("$"): "${word}" is now stored.`, view({ walk: word, tone: 'found' }), { size: words.length });
      } else {
        r.step('wStart', `${op}("${word}"): walk from the root, one letter per step.`, view({ walk: '' }), { word });
        let node = root;
        let failed = -1;
        for (let i = 0; i < word.length; i++) {
          const next = node.kids.get(word[i]);
          if (!next) {
            failed = i;
            r.step('wMiss', `No child "${word[i]}" under "${word.slice(0, i)}": the path breaks here.`, view({ walk: word.slice(0, i) }), { letter: word[i] });
            break;
          }
          node = next;
          r.step('wStep', `Follow "${word[i]}" down to the node for "${word.slice(0, i + 1)}".`, view({ walk: word.slice(0, i + 1), tone: 'active' }), { letter: word[i] });
        }
        if (failed >= 0) {
          out.push(false);
          r.step('wNone', 'The walk failed, so the answer is False.', view({ walk: word.slice(0, failed), tone: 'active' }), { result: false });
        } else {
          const res = op === 'search' ? node.end : true;
          if (op === 'search' && !askedEnd) {
            askedEnd = true;
            r.predict('end', `The whole path "${word}" exists. What does search("${word}") return?`, ['True', 'False'], node.end ? 0 : 1, node.end ? 'A word ends here, so search succeeds. The end marker is what separates a stored word from a mere prefix.' : 'The path is only a prefix of longer words. Without the end marker at this node, search returns False.');
          } else if (op === 'starts_with' && !askedPrefix) {
            askedPrefix = true;
            r.predict('prefix', `The path "${word}" exists. What does starts_with("${word}") return?`, ['True: any path counts', 'False: it needs an end marker'], 0, 'starts_with only asks whether the path exists; the end marker does not matter.');
          }
          out.push(res);
          r.step(op === 'search' ? 'sEnd' : 'pWalk', op === 'search' ? (node.end ? `The path exists and a word ends here: True.` : `The path exists but no word ends here: False (it is only a prefix).`) : 'The whole prefix was found: True.', view({ walk: word, tone: res ? 'found' : 'compare' }), { result: res });
        }
      }
    }
    return { frames: r.frames, result: out };
  },
  reference({ ops }) {
    const words = new Set<string>();
    const out: (boolean | null)[] = [null];
    for (const line of ops) {
      const { op, word } = parse(line);
      if (op === 'insert') {
        words.add(word);
        out.push(null);
      } else if (op === 'search') out.push(words.has(word));
      else out.push([...words].some((w) => w.startsWith(word)));
    }
    return out;
  },
});

export default problem({
  summary: 'Build a prefix tree (trie) that stores words and supports three operations: insert a word, check whether a whole word was inserted, and check whether any inserted word starts with a given prefix.',
  example: ['insert "apple", search "apple", search "app", starts_with "app"', 'None, True, False, True', '"app" is a prefix of a stored word but was never inserted as a word itself.'],
  pattern: ['trie', ['trie', 'hash-lookup', 'design', 'dfs'], 'Words that share a prefix share a path in the trie, so both whole-word and prefix questions become a walk down one path, one letter at a time.', {
    'hash-lookup': 'A set answers search in O(1) but cannot answer starts_with without scanning every word.',
    design: 'It is a design question, and the structure you design is a trie.',
    dfs: 'Walking a path is a simple loop; no recursion is needed here.',
  }],
  hints: [
    'A set of words answers search quickly, but what does starts_with cost with it?',
    'If words that begin the same way could share storage, you could walk the shared part once.',
    'Make each node a dict from letter to child node. Mark the node where a word ends so you can tell a word from a mere prefix.',
  ],
  insight: 'One dict per node, one step per letter, plus an end marker that separates real words from prefixes.',
  brute: 'Keep a list of words and scan it for every query: O(total length) per call.',
  optimal: 'Trie: every operation is O(L) for a word of length L, independent of how many words are stored.',
  walk: ['Create the root as an empty dict.', 'insert: for each letter go to (or create) the child; mark the final node with "$".', 'A helper walks a string from the root and returns the node reached, or None if a letter is missing.', 'search returns True only if the node exists and has "$"; starts_with returns True if the node exists.'],
  edge: ['A word that is a prefix of another word.', 'Searching before anything is inserted.', 'Inserting the same word twice.', 'A query longer than any stored word.'],
  works: ['Each node stands for exactly one prefix, reached by exactly one path from the root.', 'The end marker records which prefixes are complete words.'],
  time: ['O(L)', 'L = length of the word or prefix; independent of the number of stored words.'],
  space: ['O(total letters)', 'In the worst case every stored letter needs its own node; shared prefixes cost nothing extra.'],
  solution,
  cases,
  sig: 'class Trie:\n    def __init__(self):\n        pass\n\n    def insert(self, word):\n        pass\n\n    def search(self, word):\n        pass\n\n    def starts_with(self, prefix):\n        pass\n',
  harness,
  viz,
  fromArgs: ([ops, args]) => ({ ops: (ops as string[]).slice(1).map((o, i) => `${o} ${(args as string[][])[i + 1][0]}`) }),
});
