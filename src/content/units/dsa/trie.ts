import { Recorder } from '@/engine/recorder';
import { nTreePanel, type NTreeNode } from '@/engine/layout';
import type { Panel, Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { OPS_HARNESS } from '@/content/lib/harness';

const code = `
class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word):
        node = self.root
        for ch in word:                              #@iLoop
            if ch not in node.children:              #@iCheck
                node.children[ch] = TrieNode()       #@iNew
            node = node.children[ch]                 #@iStep
        node.is_end = True                           #@iEnd

    def search(self, word):
        node = self._find(word)                      #@sFind
        return node is not None and node.is_end      #@sEnd

    def startsWith(self, prefix):
        return self._find(prefix) is not None        #@pFind

    def _find(self, s):
        node = self.root
        for ch in s:                                 #@fLoop
            if ch not in node.children:              #@fMiss
                return None                          #@fNone
            node = node.children[ch]                 #@fStep
        return node                                  #@fDone
`;

interface In {
  words: string[];
  query: string;
}

interface TN {
  ch: string;
  kids: Map<string, string>; // char -> child id
  end: boolean;
}

const ROOT = 'root';

const viz: VizDef<In> = {
  id: 'trie',
  title: 'Trie: insert, search, startsWith',
  code,
  language: 'python',
  inputs: [
    { key: 'words', label: 'Words to insert', kind: 'strings', default: ['car', 'card', 'cat', 'do'], maxItems: 6 },
    { key: 'query', label: 'Word / prefix to look up', kind: 'string', default: 'ca', maxItems: 8 },
  ],
  presets: [
    { label: 'Prefix, not a word', input: { words: ['car', 'card', 'cat', 'do'], query: 'ca' } },
    { label: 'Exact word', input: { words: ['car', 'card', 'cat', 'do'], query: 'card' } },
    { label: 'Missing letter', input: { words: ['car', 'card', 'cat', 'do'], query: 'cow' } },
    { label: 'Word is also a prefix', input: { words: ['app', 'apple'], query: 'app' } },
  ],
  run({ words, query }) {
    for (const w of [...words, query]) if (/\s/.test(w)) throw new Error('Words cannot contain spaces');
    const r = new Recorder(code);
    const nodes: Record<string, TN> = { [ROOT]: { ch: 'root', kids: new Map(), end: false } };
    let seq = 0;

    const panels = (opts: { cur?: string; path?: string[]; fresh?: string; word?: string; at?: number; wordTitle?: string; wordTones?: Record<number, Tone>; miss?: boolean } = {}): Panel[] => {
      const byId: Record<string, NTreeNode> = {};
      const onPath = new Set(opts.path ?? []);
      for (const [id, n] of Object.entries(nodes)) {
        let tone: Tone | undefined;
        if (onPath.has(id)) tone = 'path';
        if (id === opts.fresh) tone = 'new';
        if (id === opts.cur) tone = opts.miss ? 'error' : 'active';
        byId[id] = { id, label: n.ch, children: [...n.kids.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, c]) => c), tone, badge: n.end ? 'end' : undefined };
      }
      const edgeTones: Record<string, Tone> = {};
      const p = opts.path ?? [];
      for (let k = 1; k < p.length; k++) edgeTones[`${p[k - 1]}>${p[k]}`] = 'path';
      const out: Panel[] = [nTreePanel(byId, ROOT, { title: 'Trie (nodes marked end = a word stops here)', edgeTones })];
      if (opts.word !== undefined) {
        const chars = [...opts.word];
        out.push({ type: 'array', title: opts.wordTitle ?? 'Word', values: chars.length ? chars : ['(empty)'], hideIndex: true, tones: opts.wordTones, pointers: opts.at !== undefined && chars.length ? { ch: Math.min(opts.at, chars.length) } : undefined });
      }
      return out;
    };
    const toneUpTo = (n: number, tone: Tone = 'done'): Record<number, Tone> => Object.fromEntries(Array.from({ length: n }, (_, k) => [k, tone]));

    r.step('iLoop', `Start with an empty trie, then insert ${words.length} word${words.length === 1 ? '' : 's'}`, panels(), { words: words.join(' ') || '(none)' });
    for (const w of words) {
      let cur = ROOT;
      const path = [ROOT];
      for (let k = 0; k < w.length; k++) {
        const ch = w[k];
        r.op();
        const kid = nodes[cur].kids.get(ch);
        if (kid === undefined) {
          const id = `n${seq++}`;
          nodes[id] = { ch, kids: new Map(), end: false };
          nodes[cur].kids.set(ch, id);
          cur = id;
          path.push(id);
          r.step('iNew', `'${ch}' is missing under '${nodes[path[path.length - 2]].ch}' → create a node`, panels({ cur: id, path, fresh: id, word: w, at: k, wordTitle: `insert("${w}")`, wordTones: toneUpTo(k) }), { word: w, ch, i: k });
        } else {
          cur = kid;
          path.push(kid);
          r.step('iStep', `'${ch}' already exists → reuse it and step down`, panels({ cur: kid, path, word: w, at: k, wordTitle: `insert("${w}")`, wordTones: toneUpTo(k) }), { word: w, ch, i: k });
        }
      }
      const already = nodes[cur].end;
      nodes[cur].end = true;
      r.op();
      r.step('iEnd', already ? `"${w}" was already stored: end flag stays on` : w ? `Mark '${w[w.length - 1]}' as end of word "${w}"` : 'Empty word: the root itself becomes an end', panels({ cur, path, word: w, wordTitle: `insert("${w}")`, wordTones: toneUpTo(w.length, 'found') }), { word: w });
    }

    // _find: returns the final node id or null; records one frame per character
    const find = (s: string, label: string): string | null => {
      let cur = ROOT;
      const path = [ROOT];
      for (let k = 0; k < s.length; k++) {
        const ch = s[k];
        r.op();
        const kid = nodes[cur].kids.get(ch);
        if (kid === undefined) {
          r.step('fNone', `No '${ch}' under '${nodes[cur].ch}' → _find returns None`, panels({ cur, path, miss: true, word: s, at: k, wordTitle: label, wordTones: { ...toneUpTo(k), [k]: 'error' } }), { ch, i: k });
          return null;
        }
        cur = kid;
        path.push(kid);
        r.step('fStep', `'${ch}' found → step down (${k + 1}/${s.length})`, panels({ cur, path, word: s, at: k, wordTitle: label, wordTones: toneUpTo(k + 1, 'visited') }), { ch, i: k });
      }
      return cur;
    };
    const pathTo = (id: string | null): string[] => {
      if (id === null) return [];
      const out: string[] = [];
      const dfs = (n: string, acc: string[]): boolean => {
        acc.push(n);
        if (n === id) {
          out.push(...acc);
          return true;
        }
        for (const c of nodes[n].kids.values()) if (dfs(c, acc)) return true;
        acc.pop();
        return false;
      };
      dfs(ROOT, []);
      return out;
    };

    const foundS = find(query, `search("${query}")`);
    const searchRes = foundS !== null && nodes[foundS].end;
    r.step('sEnd', foundS === null ? `search("${query}") → False (path breaks)` : searchRes ? `search("${query}") → True: the node is flagged end` : `search("${query}") → False: path exists but no word ends here`, panels({ cur: foundS ?? undefined, path: pathTo(foundS), word: query, wordTitle: `search("${query}")`, wordTones: toneUpTo(query.length, searchRes ? 'found' : 'muted') }), { found: foundS !== null, is_end: foundS !== null ? nodes[foundS].end : false, result: searchRes });
    const foundP = find(query, `startsWith("${query}")`);
    const prefixRes = foundP !== null;
    r.step('pFind', prefixRes ? `startsWith("${query}") → True: the whole path exists` : `startsWith("${query}") → False: path breaks`, panels({ cur: foundP ?? undefined, path: pathTo(foundP), word: query, wordTitle: `startsWith("${query}")`, wordTones: toneUpTo(query.length, prefixRes ? 'found' : 'muted') }), { result: prefixRes });
    return { frames: r.frames, result: { search: searchRes, startsWith: prefixRes } };
  },
  reference({ words, query }) {
    return { search: words.includes(query), startsWith: words.some((w) => w.startsWith(query)) };
  },
};

const OPS = ['Trie', 'insert', 'search', 'search', 'startsWith', 'insert', 'search', 'startsWith'];
const tests = [
  { args: [OPS, [[], ['apple'], ['apple'], ['app'], ['app'], ['app'], ['app'], ['ap']]], expected: [null, null, true, false, true, null, true, true], name: 'prefix vs word' },
  { args: [['Trie', 'search', 'startsWith'], [[], ['a'], ['a']]], expected: [null, false, false], name: 'empty trie' },
  { args: [['Trie', 'insert', 'insert', 'search', 'search', 'startsWith'], [[], ['car'], ['card'], ['car'], ['card'], ['cards']]], expected: [null, null, null, true, true, false], name: 'word inside a longer word' },
  { args: [['Trie', 'insert', 'search', 'startsWith', 'startsWith'], [[], ['dog'], ['do'], ['do'], ['dot']]], expected: [null, null, false, true, false], name: 'branch that does not exist' },
  { args: [['Trie', 'insert', 'insert', 'search', 'startsWith'], [[], ['a'], ['a'], ['a'], ['a']]], expected: [null, null, null, true, true], name: 'duplicate insert' },
];

const unit: Unit = {
  id: 'trie',
  hook: 'A trie stores words by their shared prefixes, so "does anything start with this?" costs O(length of the prefix) no matter how many words exist. It is the standard answer for autocomplete, spell-check and word-search questions.',
  predict: {
    prompt: 'You insert only "apple" into an empty trie. What do search("app") and startsWith("app") return?',
    options: ['True and True', 'False and True', 'True and False', 'False and False'],
    answer: 1,
    explain: 'The path a → p → p exists, so startsWith("app") is True. But no word ENDED at the second p (its end flag is False), so search("app") is False. Telling those two apart is the whole reason for the end-of-word flag.',
  },
  viz,
  deeper: {
    points: [
      'Each node holds a dict of children keyed by character plus an end-of-word flag. The path from the root spells a prefix.',
      'insert walks the word, creating missing nodes, then sets is_end on the last one.',
      'search and startsWith share one helper that follows the characters; they differ only in the last line: `node.is_end` versus `node is not None`.',
      'Time depends on the word length L, not on how many words are stored. Memory depends on the number of distinct prefix nodes.',
      'Use a dict per node for large alphabets and a 26-slot array when the alphabet is small and fixed.',
    ],
    complexity: { time: 'O(L) per operation', space: 'O(total characters) worst case' },
    pitfalls: ['Never setting is_end, or returning True from search without checking it', 'Mixing up search (exact word) and startsWith (prefix only)', 'Indexing node.children[ch] without checking it exists first (KeyError)'],
  },
  practice: {
    language: 'python',
    fnName: 'Trie',
    adapter: 'run_ops',
    harness: OPS_HARNESS,
    statement: 'Implement a `Trie` class with `insert(word)`, `search(word)` (True only for words that were inserted) and `startsWith(prefix)` (True if any inserted word begins with it).',
    signature: 'class Trie:',
    solution: `class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word):
        node = self.root
        for ch in word:
            if @@ch not in node.children@@:
                node.children[ch] = TrieNode()
            node = @@node.children[ch]@@
        node.is_end = @@True@@

    def _find(self, s):
        node = self.root
        for ch in s:
            if ch not in node.children:
                return None
            node = node.children[ch]
        return node

    def search(self, word):
        node = self._find(word)
        return node is not None and @@node.is_end@@

    def startsWith(self, prefix):
        return @@self._find(prefix) is not None@@`,
    tests,
  },
  debug: {
    language: 'python',
    fnName: 'Trie',
    adapter: 'run_ops',
    harness: OPS_HARNESS,
    statement: 'After inserting "apple", this trie claims that "app" is a stored word. Fix it.',
    buggy: `class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word):
        node = self.root
        for ch in word:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        node.is_end = True

    def _find(self, s):
        node = self.root
        for ch in s:
            if ch not in node.children:
                return None
            node = node.children[ch]
        return node

    def search(self, word):
        return self._find(word) is not None

    def startsWith(self, prefix):
        return self._find(prefix) is not None`,
    fixed: `class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word):
        node = self.root
        for ch in word:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        node.is_end = True

    def _find(self, s):
        node = self.root
        for ch in s:
            if ch not in node.children:
                return None
            node = node.children[ch]
        return node

    def search(self, word):
        node = self._find(word)
        return node is not None and node.is_end

    def startsWith(self, prefix):
        return self._find(prefix) is not None`,
    tests,
    bugType: 'missing end-of-word check',
    hint: 'search and startsWith currently do exactly the same thing. What extra fact does search need about the node it lands on?',
    explanation: 'Reaching the end of the path only proves the string is a PREFIX of some word. search must also require node.is_end, otherwise "app" is accepted after inserting just "apple".',
  },
  boss: {
    title: 'Search suggestions',
    statement: 'A shop has a list of product names. As a customer types `search_word` one letter at a time, after each letter return up to 3 product names that start with the letters typed so far, in alphabetical order. Result: a list with one list of suggestions per typed letter.',
    language: 'python',
    fnName: 'suggest',
    starter: `def suggest(products, search_word):
    # your code here
    pass
`,
    solution: `def suggest(products, search_word):
    root = {}
    for p in sorted(products):
        node = root
        for ch in p:
            node = node.setdefault(ch, {"#": []})
            if len(node["#"]) < 3:
                node["#"].append(p)
    out = []
    node = root
    for ch in search_word:
        if node is not None and ch in node:
            node = node[ch]
            out.append(list(node["#"]))
        else:
            node = None
            out.append([])
    return out`,
    tests: [
      { args: [['mobile', 'mouse', 'moneypot', 'monitor', 'mousepad'], 'mouse'], expected: [['mobile', 'moneypot', 'monitor'], ['mobile', 'moneypot', 'monitor'], ['mouse', 'mousepad'], ['mouse', 'mousepad'], ['mouse', 'mousepad']] },
      { args: [['havana'], 'havana'], expected: [['havana'], ['havana'], ['havana'], ['havana'], ['havana'], ['havana']], name: 'single product' },
      { args: [['bags', 'baggage', 'banner', 'box', 'cloths'], 'bags'], expected: [['baggage', 'bags', 'banner'], ['baggage', 'bags', 'banner'], ['baggage', 'bags'], ['bags']], name: 'narrowing down' },
      { args: [['abc'], 'xyz'], expected: [[], [], []], name: 'no matches' },
      { args: [['code', 'cod'], 'cop'], expected: [['cod', 'code'], ['cod', 'code'], []], name: 'path breaks mid-way' },
    ],
    hints: ['Sort the products first, then every node of the trie can remember the first 3 products that pass through it.', 'Walk the typed word through the trie one letter at a time. Once a letter is missing, every later answer is an empty list.'],
    combines: ['trie', 'binary-search'],
  },
};

export default unit;
