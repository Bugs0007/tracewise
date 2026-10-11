import type { Tone } from '@/engine/types';
import { chipsView, trieView } from '@/dsa/viz/prims';
import { trieInsert, trieRoot, type TNode } from '@/dsa/viz/trie';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './design-add-and-search-words-data-structure.py?raw';
import harness from './design-add-and-search-words-data-structure.harness.py?raw';
import cases from './design-add-and-search-words-data-structure.cases.json';

const OPS = ['add_word', 'search'];
const parse = (line: string): { op: string; word: string } => {
  const [op, word = ''] = line.trim().split(/\s+/);
  return { op, word };
};

const viz = vizOf<{ ops: string[] }>({
  id: 'design-add-and-search-words-data-structure',
  title: 'Design Add and Search Words Data Structure',
  solution,
  inputs: [{ key: 'ops', label: 'operations: add_word w / search pattern (. matches any one letter)', kind: 'strings', default: ['add_word cap', 'add_word cut', 'add_word cop', 'search c.t', 'search cow'], maxItems: 12 }],
  presets: [
    { label: 'Backtracking wildcard', input: { ops: ['add_word cap', 'add_word cut', 'add_word cop', 'search c.t', 'search cow'] } },
    { label: 'Only wildcards', input: { ops: ['add_word a', 'add_word bc', 'search .', 'search ..', 'search ...'] } },
    { label: 'Prefix is not a word', input: { ops: ['add_word apple', 'search app', 'search appl.', 'search apple'] } },
  ],
  validate: ({ ops }) => {
    for (const line of ops) {
      const { op, word } = parse(line);
      if (!OPS.includes(op)) return `Unknown operation "${op}". Use add_word or search`;
      if (op === 'add_word' ? !/^[a-z]+$/.test(word) : !/^[a-z.]+$/.test(word)) return op === 'add_word' ? 'add_word needs a lowercase word' : 'search needs letters and dots, like "c.t"';
    }
    return null;
  },
  run({ ops }) {
    const r = new TraceRecorder(solution);
    const root = trieRoot();
    const words: string[] = [];
    const out: (boolean | null)[] = [null];
    let tones: Record<string, Tone> = {};
    let askedDot = false;
    let askedBack = false;
    let askedMiss = false;
    const view = (partial?: string) => [
      trieView(words, { title: 'trie (✓ "end" marks a stored word)', tones, partial }),
      chipsView(out.map((x) => (x === null ? 'None' : x ? 'True' : 'False')), { title: 'results of each call', tones: Object.fromEntries(out.map((x, i) => [i, x === null ? 'default' : x ? 'found' : 'compare'])) as Record<number, Tone> }),
    ];
    r.step('init', 'The dictionary is a trie. A "." in a search means any single letter, so the search will have to try several branches.', view(), {});
    for (const line of ops) {
      const { op, word } = parse(line);
      r.op();
      tones = {};
      if (op === 'add_word') {
        r.step('aStart', `add_word("${word}"): same as a normal trie insert.`, view(), { word });
        for (let i = 1; i <= word.length; i++) {
          tones = { [word.slice(0, i)]: 'active' };
          r.step('aStep', `Walk or create the node for "${word.slice(0, i)}".`, view(word.slice(0, i)), { letter: word[i - 1] });
        }
        trieInsert(root, word);
        if (!words.includes(word)) words.push(word);
        tones = { [word]: 'found' };
        out.push(null);
        r.step('aEnd', `Mark "${word}" as a stored word.`, view(), { size: words.length });
        continue;
      }
      r.step('sStart', `search("${word}"): dfs from position 0 at the root.`, view(), { word });
      const dfs = (i: number, node: TNode): boolean => {
        r.op();
        tones[node.id] = 'active';
        r.step('dDef', i === word.length ? `All ${word.length} characters used at "${node.id || 'root'}": a word must end here.` : `Position ${i} (${word[i]}) at "${node.id || 'root'}".`, view(), { i });
        if (i === word.length) {
          tones[node.id] = node.end ? 'found' : 'compare';
          r.step('dEndRet', node.end ? 'A word ends here: True.' : 'The path exists but no word ends here: False.', view(), { result: node.end });
          return node.end;
        }
        const ch = word[i];
        if (ch === '.') {
          const kids = [...node.kids.values()];
          if (!askedDot) {
            askedDot = true;
            r.predictChoice('dot', `The next character is ".". At "${node.id || 'root'}" the children are ${kids.map((k) => k.id.slice(-1)).join(', ') || 'none'}. How many branches may we have to try?`, String(kids.length), [String(kids.length + 1), '1', String(Math.max(kids.length - 1, 0))], kids.length + i, 'A dot matches any letter, so every child is a candidate; we stop at the first one that succeeds.');
          }
          r.step('dDot', `"." matches any letter: try each child in turn (${kids.map((k) => k.id.slice(-1)).join(', ') || 'none'}).`, view(), {});
          for (const child of kids) {
            if (dfs(i + 1, child)) {
              tones[node.id] = 'done';
              return true;
            }
            tones[child.id] = 'compare';
            if (!askedBack) {
              askedBack = true;
              r.predict('back', `The branch "${child.id.slice(-1)}" failed. What happens next?`, ['Try the next child of the wildcard', 'Return False immediately', 'Restart the whole search'], 0, 'any(...) keeps trying siblings until one returns True; only if all fail does the dot return False.');
            }
            tones[node.id] = 'active';
            r.step('dTry', `Branch "${child.id.slice(-1)}" failed. Back at "${node.id || 'root'}".`, view(), {});
          }
          tones[node.id] = 'compare';
          r.step('dTry', 'Every branch failed: False.', view(), { result: false });
          return false;
        }
        const next = node.kids.get(ch);
        if (!next) {
          if (!askedMiss) {
            askedMiss = true;
            r.predict('miss', `"${node.id || 'root'}" has no child "${ch}". What does this call return?`, ['False', 'True', 'It tries other letters'], 0, 'A normal letter must match exactly; with no such child the path is dead.');
          }
          tones[node.id] = 'compare';
          r.step('dMissRet', `No child "${ch}" under "${node.id || 'root'}": return False.`, view(), { result: false });
          return false;
        }
        tones[node.id] = 'done';
        r.step('dNext', `Follow "${ch}".`, view(), {});
        return dfs(i + 1, next);
      };
      const res = dfs(0, root);
      out.push(res);
      r.step('sStart', res ? `search("${word}") is True.` : `search("${word}") is False.`, view(), { result: res });
    }
    return { frames: r.frames, result: out };
  },
  reference({ ops }) {
    const words: string[] = [];
    const out: (boolean | null)[] = [null];
    for (const line of ops) {
      const { op, word } = parse(line);
      if (op === 'add_word') {
        words.push(word);
        out.push(null);
      } else {
        const rx = new RegExp(`^${word.replace(/\./g, '[a-z]')}$`);
        out.push(words.some((w) => rx.test(w)));
      }
    }
    return out;
  },
});

export default problem({
  summary: 'Design a word dictionary with two operations: add a word, and search for a pattern in which "." stands for any single letter. A pattern matches a stored word only if the lengths are equal and every non-dot letter agrees.',
  example: ['add "bad", add "mad", search "b.d", search "..d", search "b.", search "bad"', 'None, None, True, True, False, True', '"b." fails because every stored word has three letters.'],
  pattern: ['trie', ['trie', 'dfs', 'hash-lookup', 'backtracking'], 'Store the words in a trie, then search with a recursive walk. A normal letter follows one child; a dot recursively tries every child.', {
    dfs: 'The search is a DFS, and the trie is what makes each step cheap.',
    'hash-lookup': 'A set cannot handle wildcards without trying every stored word.',
    backtracking: 'It backtracks over the dot choices, but the data structure that matters is the trie.',
  }],
  hints: [
    'How would you store words so that "which words start with these letters?" is cheap?',
    'Without wildcards, searching is just walking a path. What changes when one character can be anything?',
    'Recurse over (position, node): for a letter follow that child; for a dot try every child and return True if any succeeds; at the end check the end marker.',
  ],
  insight: 'A trie turns the wildcard into a small branching search over only the children that actually exist.',
  brute: 'Compare the pattern with every stored word: O(words × length) per search.',
  optimal: 'Trie with DFS: O(L) without dots; with dots at most the number of nodes visited, never more than the trie size.',
  walk: ['Build the trie in add_word exactly as for a normal trie.', 'search runs dfs(i, node) from position 0 at the root.', 'If i equals len(word), return whether this node ends a word.', 'If word[i] is ".", return True if any child succeeds; otherwise follow the matching child or return False.'],
  edge: ['Pattern shorter or longer than every word.', 'A pattern of only dots.', 'A dot that must backtrack across several siblings.', 'Searching an empty dictionary.'],
  works: ['dfs(i, node) answers "is there a stored word that continues from node and matches word[i:]?".', 'Dots only enlarge the set of children to try, so exhausting them proves the answer is False.'],
  time: ['O(L) to O(trie size)', 'Without dots it is one path; with dots each branch point may explore all children.'],
  space: ['O(L)', 'Recursion depth equals the pattern length (plus the trie itself).'],
  solution,
  cases,
  sig: 'class WordDictionary:\n    def __init__(self):\n        pass\n\n    def add_word(self, word):\n        pass\n\n    def search(self, word):\n        # word may contain "." that matches any single letter\n        pass\n',
  harness,
  viz,
  fromArgs: ([ops, args]) => ({ ops: (ops as string[]).slice(1).map((o, i) => `${o} ${(args as string[][])[i + 1][0]}`) }),
});
